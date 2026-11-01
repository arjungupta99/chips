/**
 * What an agent is told of the room as its turn starts, beside who is in it (ADR 0104): which of
 * the agents have a turn going and how long the others have been without one, and what is news to
 * the one taking the turn — that it has just joined, or who joined since it last spoke.
 *
 * As of the moment Chips sends the turn, as who is in the room is (ADR 0092): a turn delivered
 * again says how things stand then. People in a team see all this for themselves; an agent exists
 * only in its turns, so Chips says it at the top of each.
 */

import type { RoomNow, TakerNews } from "@chipschat/protocol";
import type { JoinView, ReadModels } from "./ports/index.js";
import type { Lookup } from "./room-context.js";

/** A turn nothing has been heard from for this long is not counted as working: it has stopped. */
export const QUIET_TURN_MS = 10 * 60 * 1000;

const MINUTE = 60 * 1000;

function minutesSince(at: string, nowMs: number): number {
  const then = Date.parse(at);
  return Number.isNaN(then) ? 0 : Math.max(0, Math.floor((nowMs - then) / MINUTE));
}

/**
 * Which of these agents have a turn going in the room, and how long the rest have been without
 * one. A turn going that nothing has been heard from in ten minutes is neither: a run its harness
 * never ended says nothing about now.
 */
export async function roomNowFor(room: {
  readonly readModels: Pick<ReadModels, "turnsIn">;
  readonly workspaceId: string;
  readonly spaceId: string;
  /** The agents in the room now. */
  readonly agents: readonly string[];
  readonly nowMs: number;
}): Promise<RoomNow> {
  const here = new Set(room.agents);
  const turns = (await room.readModels.turnsIn(room.workspaceId, room.spaceId)).filter((turn) =>
    here.has(turn.agent_id),
  );
  const working = new Map<string, { participant_id: string; minutes: number; step?: string }>();
  for (const turn of turns) {
    if (!turn.going || working.has(turn.agent_id)) continue;
    const heard = Date.parse(turn.last_heard_at ?? turn.started_at);
    if (Number.isNaN(heard) || room.nowMs - heard > QUIET_TURN_MS) continue;
    working.set(turn.agent_id, {
      participant_id: turn.agent_id,
      minutes: minutesSince(turn.started_at, room.nowMs),
      ...(turn.step === undefined ? {} : { step: turn.step }),
    });
  }
  const idle = turns.flatMap((turn) =>
    turn.going || turn.ended_at === null || working.has(turn.agent_id)
      ? []
      : [{ participant_id: turn.agent_id, minutes: minutesSince(turn.ended_at, room.nowMs) }],
  );
  return { working: [...working.values()], idle };
}

interface NewsRoom {
  readonly readModels: Pick<
    ReadModels,
    "joinsIn" | "joinedSeq" | "lastSpokeSeq" | "replacedIn" | "ranSince" | "lastPost"
  >;
  readonly workspaceId: string;
  readonly spaceId: string;
  readonly takers: readonly string[];
  readonly seq: number;
  readonly nowMs: number;
  /** The room's members now: a newcomer that has left since is no news. */
  readonly members: ReadonlySet<string>;
  /** Whether the turn lists the room's files, which a newcomer is told to work from. */
  readonly files: boolean;
  readonly lookup: Lookup;
}

/** Who put somebody in the room, by name, when a person did; nothing for Chips or a harness. */
async function byName(room: NewsRoom, join: JoinView): Promise<string | undefined> {
  return join.by_kind === "person" ? (await room.lookup(join.by))?.name : undefined;
}

/**
 * What is news to each who takes a turn on the message at `seq`: that it joined the room and has
 * not spoken there since, and who else joined since it last spoke there. Who put somebody in the
 * room is named when a person did; Chips putting an agent back, or a harness joining, goes unsaid.
 */
export async function takerNewsFor(room: NewsRoom): Promise<Record<string, TakerNews>> {
  const replaced = await room.readModels.replacedIn(room.workspaceId, room.spaceId);
  const news: Record<string, TakerNews> = {};
  for (const taker of new Set(room.takers)) {
    // An agent that took its harness's place took what the harness did there (ADR 0087).
    const ids = [taker, ...replaced.filter((each) => each.to === taker).map((each) => each.from)];
    const mine = await newsOf(room, ids);
    if (mine !== undefined) news[taker] = mine;
  }
  return news;
}

/** What is news to one taker, known in the room by these ids, or nothing. */
async function newsOf(room: NewsRoom, ids: readonly string[]): Promise<TakerNews | undefined> {
  const { readModels, workspaceId, spaceId, seq } = room;
  const joinedAt = await readModels.joinedSeq(workspaceId, spaceId, ids, seq);
  const spokeAt = await readModels.lastSpokeSeq(workspaceId, spaceId, ids, seq);
  const fresh = joinedAt !== undefined && (spokeAt === undefined || spokeAt < joinedAt);
  const joined = fresh ? await joinedNews(room, joinedAt, ids) : undefined;
  const mark = Math.max(spokeAt ?? 0, joinedAt ?? 0);
  const newcomers = mark > 0 ? await newcomersSince(room, mark, ids) : [];
  if (joined === undefined && newcomers.length === 0) return undefined;
  return {
    ...(joined === undefined ? {} : { joined }),
    ...(newcomers.length === 0 ? {} : { newcomers }),
  };
}

/**
 * That the taker joined at `joinedAt`, into a room already talking, and has had no turn here
 * since: how long ago, and who put it there. An agent that has had a turn and said nothing is not
 * new to the room, and one there from the room's first words has nothing to catch up on.
 */
async function joinedNews(
  room: NewsRoom,
  joinedAt: number,
  ids: readonly string[],
): Promise<TakerNews["joined"]> {
  const { readModels, workspaceId, spaceId } = room;
  const join = (await readModels.joinsIn(workspaceId, spaceId, joinedAt - 1, joinedAt + 1))[0];
  if (join === undefined) return undefined;
  if ((await readModels.lastPost(workspaceId, spaceId, { beforeSeq: joinedAt })) === undefined) {
    return undefined;
  }
  if (await readModels.ranSince(workspaceId, spaceId, ids, join.ts)) return undefined;
  return {
    minutes: minutesSince(join.ts, room.nowMs),
    by: await byName(room, join),
    files: room.files,
  };
}

/** Who joined after `mark` and is here still, each once, never the taker. */
async function newcomersSince(
  room: NewsRoom,
  mark: number,
  selves: readonly string[],
): Promise<{ readonly id: string; readonly by?: string | undefined }[]> {
  const { readModels, workspaceId, spaceId, seq } = room;
  const newcomers: { readonly id: string; readonly by?: string | undefined }[] = [];
  const told = new Set<string>(selves);
  for (const join of await readModels.joinsIn(workspaceId, spaceId, mark, seq)) {
    const id = join.participant_id;
    if (told.has(id) || !room.members.has(id)) continue;
    told.add(id);
    newcomers.push({ id, by: await byName(room, join) });
  }
  return newcomers;
}
