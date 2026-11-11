/**
 * Hand on what an agent sent another agent that the other did not pick up (ADR 0291).
 *
 * In a team, somebody who hands work to a colleague who is out notices by the end of the morning.
 * An agent cannot notice anything between its turns: it said "@Hazel, the mockup is yours", its
 * turn ended, and if Hazel's harness was down, or her turn failed, or her bridge swallowed the
 * message, the room sat until a person looked. The lead's sweep (ADR 0104) never saw it, because
 * the words named somebody.
 *
 * So the sweep looks, in every open room, at the newest message an agent sent each other agent in
 * the last hour. Where it has waited a minute and its agent has done nothing about it — no turn of
 * its since, no word, no pass — or its turn on it failed, Chips hands the message on as
 * `message.handed` with `unanswered_by`: to the room's lead, or, when the lead said it or is the
 * one that did not pick it up, back to the agent that said it. That agent's note says who did not
 * pick it up and why, and what it can do.
 *
 * Not handed:
 * - a message a person sent: the room shows them that it waits, and why (ADR 0083);
 * - one whose agent is working, on it or on what came before it: a turn going that was heard from
 *   lately;
 * - anything the referee held, or anything while it holds the room;
 * - anything while the one to be told has a turn going: it is handed at the next look;
 * - the same message for the same agent twice;
 * - a second message for an agent that has done nothing since Chips last said it had not picked
 *   one up. It is said once that an agent is away. The first live run, 10 November 2026, showed
 *   why: told Lionel was offline, Jens answered "@Lionel is offline, so I'll answer", which was
 *   one more message for Lionel, to be handed back a minute on, and so on round.
 */

import { holds, isAgentKind, messageIdOf, type UnpickedWhy } from "@chipschat/protocol";
import type { Clock, IdGenerator } from "../ports/clock.js";
import type { EventStore } from "../ports/event-store.js";
import type { Presence } from "../ports/presence.js";
import type { HandOffView, PickUpView, ReadModels, TurnView } from "../ports/read-models.js";
import { QUIET_TURN_MS } from "../room-now.js";
import { STILL_FOR_MS } from "./lead-turns.js";

/** How long a message waits on its agent before Chips hands it on. */
export const UNPICKED_AFTER_MS = 60 * 1000;

/** How far back the sweep looks: a hand-off older than this is the room's history. */
export const UNPICKED_WITHIN_MS = 60 * 60 * 1000;

/** The most of a harness's own words about what is wrong, or of a run's error, that is passed on. */
const REASON_CHARS = 200;

export interface UnpickedTurnsDeps {
  readonly store: Pick<EventStore, "append">;
  readonly readModels: Pick<
    ReadModels,
    | "handOffsSince"
    | "handedOnSince"
    | "pickUpOf"
    | "membersOf"
    | "leadOf"
    | "exchangeOf"
    | "turnsIn"
  >;
  readonly presence: Pick<Presence, "stateOf">;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /**
   * When this server started. For a while after, every harness is still on its way back, and one
   * that has not yet taken a message up is not one that never will.
   */
  readonly startedAtMs?: number | undefined;
}

/** What was handed on: the message, who it went to, and the agent that did not pick it up. */
export interface Unpicked {
  readonly message_id: string;
  readonly agent_id: string;
  readonly unanswered_by: string;
  readonly why: UnpickedWhy;
}

export type UnpickedTurns = ReturnType<typeof createUnpickedTurns>;

function cut(words: string | undefined): string | undefined {
  const said = words?.trim();
  if (said === undefined || said === "") return undefined;
  return said.length > REASON_CHARS ? `${said.slice(0, REASON_CHARS - 1).trimEnd()}…` : said;
}

type Waits = { readonly why: UnpickedWhy; readonly reason?: string };

/** With the words that say why, cut to what an event carries, when there are any. */
function because(why: UnpickedWhy, words?: string): Waits {
  const reason = cut(words);
  return { why, ...(reason === undefined ? {} : { reason }) };
}

/** What a turn of the agent's says: working, done with it, or why it counts as not picked up. */
function whyOfTurn(turn: NonNullable<PickUpView["turn"]>, nowMs: number): Waits | undefined {
  if (!turn.going) return turn.failed ? because("failed", turn.error) : undefined;
  const heard = Date.parse(turn.last_heard_at ?? "");
  const working = !Number.isNaN(heard) && nowMs - heard <= QUIET_TURN_MS;
  return working ? undefined : because("silent");
}

/**
 * Why a message counts as not picked up, or nothing while its agent may still take it: it has
 * answered, it is working, or its turn on the message ended without failing.
 */
function whyUnpicked(
  did: PickUpView,
  harness: ReturnType<Presence["stateOf"]>,
  nowMs: number,
): Waits | undefined {
  if (did.answered) return undefined;
  if (did.turn !== undefined) return whyOfTurn(did.turn, nowMs);
  if (!harness.connected) return because("offline");
  return harness.trouble === undefined
    ? because("silent")
    : because("trouble", harness.trouble.reason);
}

/** Whether an agent has a turn that keeps it from being handed more now (as the lead's sweep reads it). */
function busy(turns: readonly TurnView[], agentId: string, nowMs: number): boolean {
  return turns.some((turn) => {
    if (turn.agent_id !== agentId) return false;
    if (turn.going) {
      const heard = Date.parse(turn.last_heard_at ?? turn.started_at);
      return !Number.isNaN(heard) && nowMs - heard <= QUIET_TURN_MS;
    }
    return turn.ended_at !== null && nowMs - Date.parse(turn.ended_at) < STILL_FOR_MS;
  });
}

/**
 * Who is told: the lead, unless the lead said it or is the one that did not pick it up; then the
 * agent that said it, when it is still in the room.
 */
function toldOf(
  lead: string | undefined,
  saidBy: string,
  unansweredBy: string,
  agents: ReadonlyMap<string, string>,
): string | undefined {
  if (lead !== undefined && lead !== saidBy && lead !== unansweredBy) return lead;
  return agents.has(saidBy) && saidBy !== unansweredBy ? saidBy : undefined;
}

/** A room as one look reads it: its agents and their harnesses, its lead, their turns, and what was handed on. */
interface Room {
  readonly workspaceId: string;
  readonly spaceId: string;
  readonly agents: ReadonlyMap<string, string>;
  readonly lead: string | undefined;
  readonly turns: readonly TurnView[];
  readonly told: ReadonlySet<string>;
  /** Where in the log Chips last said each agent had not picked something up, by the agent. */
  readonly saidAway: ReadonlyMap<string, number>;
}

/**
 * The newest message from another agent for each agent in the room, once it has waited: what it
 * has not picked up before that, it has not picked up either, and one hand-over says so.
 */
function newestForEach(
  handOffs: readonly HandOffView[],
  room: Room,
  nowMs: number,
): { readonly message: HandOffView; readonly agentId: string; readonly harnessId: string }[] {
  const judged = new Set<string>();
  const waiting: { message: HandOffView; agentId: string; harnessId: string }[] = [];
  for (const message of handOffs) {
    const old = nowMs - Date.parse(message.ts) >= UNPICKED_AFTER_MS;
    for (const agentId of message.addressed_to) {
      if (judged.has(agentId)) continue;
      judged.add(agentId);
      const harnessId = room.agents.get(agentId);
      if (old && harnessId !== undefined && agentId !== message.author_id) {
        waiting.push({ message, agentId, harnessId });
      }
    }
  }
  return waiting;
}

export function createUnpickedTurns(deps: UnpickedTurnsDeps) {
  const { readModels } = deps;

  /** A room's facts for one look, or nothing while the referee holds its agents. */
  async function roomOf(handOffs: readonly HandOffView[]): Promise<Room | undefined> {
    const [first] = handOffs;
    if (first === undefined) return undefined;
    const { workspace_id: workspaceId, space_id: spaceId } = first;
    if (holds(await readModels.exchangeOf(workspaceId, spaceId))) return undefined;
    // Each agent in the room now, with the harness it answers through.
    const agents = new Map(
      (await readModels.membersOf(workspaceId, spaceId))
        .filter((member) => isAgentKind(member.kind) && member.removed !== true)
        .map((member) => [member.participant_id, member.harness_id ?? member.participant_id]),
    );
    const oldest = handOffs.at(-1)?.seq ?? first.seq;
    const handedOn = await readModels.handedOnSince(workspaceId, spaceId, oldest);
    const told = new Set(handedOn.map((each) => `${each.message_id} ${each.unanswered_by}`));
    const saidAway = new Map<string, number>();
    for (const each of handedOn) {
      saidAway.set(each.unanswered_by, Math.max(each.seq, saidAway.get(each.unanswered_by) ?? 0));
    }
    return {
      workspaceId,
      spaceId,
      agents,
      lead: await readModels.leadOf(workspaceId, spaceId),
      turns: await readModels.turnsIn(workspaceId, spaceId),
      told,
      saidAway,
    };
  }

  /**
   * Whether an agent has done nothing since Chips last said it had not picked something up: no
   * word, no pass, and no turn begun since, or only one that hangs. That it is away was said
   * then, and is not said again for each message that names it meanwhile.
   */
  async function stillAway(room: Room, agentId: string): Promise<boolean> {
    const said = room.saidAway.get(agentId);
    if (said === undefined) return false;
    const since = await readModels.pickUpOf(room.workspaceId, room.spaceId, agentId, {
      message_id: "",
      seq: said,
    });
    return !since.answered && (since.turn === undefined || since.turn.going);
  }

  /** One message for one agent: handed on when it waits and there is somebody free to tell. */
  async function handOn(
    room: Room,
    waiting: {
      readonly message: HandOffView;
      readonly agentId: string;
      readonly harnessId: string;
    },
    nowIso: string,
    nowMs: number,
  ): Promise<Unpicked | undefined> {
    const { message, agentId, harnessId } = waiting;
    const { workspaceId, spaceId } = room;
    const messageId = messageIdOf(message.event_id);
    if (room.told.has(`${messageId} ${agentId}`)) return undefined;
    if (await stillAway(room, agentId)) return undefined;
    const did = await readModels.pickUpOf(workspaceId, spaceId, agentId, {
      message_id: messageId,
      seq: message.seq,
    });
    const waits = whyUnpicked(did, deps.presence.stateOf(workspaceId, harnessId), nowMs);
    const to = toldOf(room.lead, message.author_id, agentId, room.agents);
    if (waits === undefined || to === undefined || busy(room.turns, to, nowMs)) return undefined;
    const appended = await deps.store.append({
      v: 1,
      type: "message.handed",
      id: deps.ids.next("event"),
      ts: nowIso,
      workspace_id: workspaceId,
      space_id: spaceId,
      actor: { kind: "system", id: "system" },
      idempotency_key: `unpicked-${message.event_id}-${agentId}`,
      message_id: messageId,
      agent_id: to,
      ...(to === room.lead ? { lead: true } : {}),
      unanswered_by: agentId,
      ...waits,
    });
    return appended.duplicate
      ? undefined
      : { message_id: messageId, agent_id: to, unanswered_by: agentId, why: waits.why };
  }

  /** One room's hand-offs: each agent's newest judged, and handed on where it waits. */
  async function look(
    handOffs: readonly HandOffView[],
    nowIso: string,
    nowMs: number,
  ): Promise<Unpicked[]> {
    const room = await roomOf(handOffs);
    if (room === undefined) return [];
    const handed: Unpicked[] = [];
    for (const waiting of newestForEach(handOffs, room, nowMs)) {
      const done = await handOn(room, waiting, nowIso, nowMs);
      if (done !== undefined) handed.push(done);
    }
    return handed;
  }

  /** Every open room's hand-offs nobody picked up, handed on. What was handed. */
  return async function unpickedTurns(): Promise<Unpicked[]> {
    const nowIso = deps.clock.nowIso();
    const nowMs = Date.parse(nowIso);
    // Just started: the harnesses are still coming back, and their replays with them.
    const started = deps.startedAtMs;
    if (started !== undefined && nowMs - started < 2 * UNPICKED_AFTER_MS) return [];
    const since = new Date(nowMs - UNPICKED_WITHIN_MS).toISOString();
    const rooms = new Map<string, HandOffView[]>();
    for (const message of await readModels.handOffsSince(since)) {
      rooms.set(message.space_id, [...(rooms.get(message.space_id) ?? []), message]);
    }
    const handed: Unpicked[] = [];
    for (const handOffs of rooms.values()) handed.push(...(await look(handOffs, nowIso, nowMs)));
    return handed;
  };
}
