/**
 * Hand a room's lead what was nobody's turn, once the room goes still (ADR 0104).
 *
 * People in a team notice when the work has stopped: somebody finished and told nobody what comes
 * next, and somebody asks "where are we?". An agent cannot notice anything between its turns. So
 * the sweep looks at every room with a lead, and where the last words are an agent's that reached
 * nobody, and nobody has been working for a while since, it hands those words to the lead as
 * `message.handed` with `lead`, which its harness hears as `message.new` with a note that says
 * why. The lead hands the next step on, or tells the person it is done or stuck.
 *
 * Not handed:
 * - the lead's own words: they were for the people, and the room is done or waiting on one;
 * - words that named somebody: an agent's turn, or a person's;
 * - an answer to a person who asked that agent alone: the person has it, though people said
 *   things for no agent while it worked;
 * - words the referee held, or anything while it holds the room: it hands those over itself;
 * - anything a second time: once handed, the same words are not handed again, so a lead whose
 *   turn ends without naming anybody is not handed its own silence.
 */

import { holds, isAgentKind, messageIdOf } from "@chipschat/protocol";
import type { Clock, IdGenerator } from "../ports/clock.js";
import type { EventStore } from "../ports/event-store.js";
import type { LedRoomView, PostView, ReadModels, TurnView } from "../ports/read-models.js";
import { QUIET_TURN_MS } from "../room-now.js";

/** How long a room stays still before its lead is handed what was nobody's turn. */
export const STILL_FOR_MS = 20 * 1000;

/** How far back an answer is looked for: the agent's own words since the person asked it. */
const ANSWER_LOOKS_BACK = 10;

export interface LeadTurnsDeps {
  readonly store: Pick<EventStore, "append">;
  readonly readModels: Pick<
    ReadModels,
    "ledRooms" | "lastPost" | "turnsIn" | "exchangeOf" | "membersOf"
  >;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export type LeadTurns = ReturnType<typeof createLeadTurns>;

export function createLeadTurns(deps: LeadTurnsDeps) {
  /** Every room gone still on words for nobody: their lead is handed them. Ids of those handed. */
  return async function leadTurns(): Promise<string[]> {
    const nowIso = deps.clock.nowIso();
    const nowMs = Date.parse(nowIso);
    const handed: string[] = [];
    for (const room of await deps.readModels.ledRooms()) {
      const stuck = await stuckIn(deps, room, nowMs);
      if (stuck === undefined) continue;
      const appended = await deps.store.append({
        v: 1,
        type: "message.handed",
        id: deps.ids.next("event"),
        ts: nowIso,
        workspace_id: room.workspace_id,
        space_id: room.space_id,
        actor: { kind: "system", id: "system" },
        idempotency_key: `lead-${stuck.event_id}`,
        message_id: messageIdOf(stuck.event_id),
        agent_id: room.lead_id,
        lead: true,
      });
      if (!appended.duplicate) handed.push(messageIdOf(stuck.event_id));
    }
    return handed;
  };
}

/** What a room's lead is to be handed, or nothing while the room is not still on such words. */
async function stuckIn(
  deps: LeadTurnsDeps,
  room: LedRoomView,
  nowMs: number,
): Promise<PostView | undefined> {
  const { workspace_id: workspaceId, space_id: spaceId, lead_id: lead } = room;
  const { readModels } = deps;
  const last = await readModels.lastPost(workspaceId, spaceId);
  if (last === undefined || !forNobody(last, lead)) return undefined;
  if (nowMs - Date.parse(last.ts) < STILL_FOR_MS) return undefined;
  const people = (await readModels.membersOf(workspaceId, spaceId))
    .filter((member) => member.kind === "person" && member.removed !== true)
    .map((member) => member.participant_id);
  if (last.mentions.some((id) => people.includes(id))) return undefined;
  if (await answersAPerson(deps, workspaceId, spaceId, last)) return undefined;
  const stretch = await readModels.exchangeOf(workspaceId, spaceId);
  if (holds(stretch)) return undefined;
  const turns = await readModels.turnsIn(workspaceId, spaceId);
  return turns.some((turn) => stirring(turn, nowMs)) ? undefined : last;
}

/** An agent's words that named no agent, said by somebody other than the lead, and not held. */
function forNobody(post: PostView, lead: string): boolean {
  if (!isAgentKind(post.author_kind) || post.author_id === lead) return false;
  return post.addressed_to.length === 0 && !post.addressed_to_all && !post.held;
}

/**
 * Whether a turn keeps the room from being still: one going that was heard from lately, or one
 * that ended a moment ago, whose words may still be on their way.
 */
function stirring(turn: TurnView, nowMs: number): boolean {
  if (turn.going) {
    const heard = Date.parse(turn.last_heard_at ?? turn.started_at);
    return !Number.isNaN(heard) && nowMs - heard <= QUIET_TURN_MS;
  }
  return turn.ended_at !== null && nowMs - Date.parse(turn.ended_at) < STILL_FOR_MS;
}

/**
 * Whether these words answer a person who asked their agent alone: the person's message for that
 * agent and no other comes before them, with nothing between but that agent's own words and
 * people's words for no agent, such as a note to themselves said while it worked.
 */
async function answersAPerson(
  deps: LeadTurnsDeps,
  workspaceId: string,
  spaceId: string,
  last: PostView,
): Promise<boolean> {
  let before = last.seq;
  for (let looked = 0; looked < ANSWER_LOOKS_BACK; looked += 1) {
    const post = await deps.readModels.lastPost(workspaceId, spaceId, { beforeSeq: before });
    if (post === undefined) return false;
    if (post.author_kind === "person") {
      if (post.addressed_to.length === 0 && !post.addressed_to_all) {
        before = post.seq;
        continue;
      }
      return (
        !post.addressed_to_all &&
        post.addressed_to.length === 1 &&
        post.addressed_to[0] === last.author_id
      );
    }
    if (post.author_id !== last.author_id) return false;
    before = post.seq;
  }
  return false;
}
