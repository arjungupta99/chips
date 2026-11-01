/**
 * The rooms an agent has been in (ADR 0087, rule 3.11): its message history's dividers, read from
 * the log's memberships. Pure, over rows the read model fetches, so each rule is tested alone.
 *
 * - Who stands for an agent in a room is whoever's place it holds there now: its harness before
 *   the upgrade to agents, and any agent the place passed through (`replacedIn`, room by room).
 * - A stay starts when one of them joins the room, or a place passes to one of them from someone
 *   who doesn't stand for it, and ends when the one there is taken out.
 * - A place handed on to an agent that doesn't stand for it takes the stay with it, as it takes
 *   what was said there: the stay is that agent's.
 * - A room archived while the agent was in it, and still archived when it left, ends the stay at
 *   the archive: Chips frees an archived room's agents (rule 4), and the upgrade that made that
 *   so for older rooms came long after they were put away.
 */

/** Who took whose place in a room, oldest first. */
export interface Swap {
  readonly space_id: string;
  readonly from_id: string;
  readonly to_id: string;
}

/** A membership event: who joined, left, or took another's place, where. */
export interface Move {
  readonly seq: number;
  readonly ts: string;
  readonly type: string;
  readonly space_id: string | null;
  readonly payload: string;
}

/** A room opened or archived (`space.updated` with a `state`). */
export interface Archive {
  readonly seq: number;
  readonly ts: string;
  readonly space_id: string | null;
  readonly state: string | null;
}

export interface Mark {
  readonly seq: number;
  readonly at: string;
}

export interface Stay {
  readonly room: string;
  readonly from: Mark;
  readonly to: Mark | null;
}

/** For each room, whom each place there reads as now: the last to hold it. */
export function holders(swaps: readonly Swap[]): Map<string, Map<string, string>> {
  const rooms = new Map<string, Map<string, string>>();
  for (const swap of swaps) {
    const now = rooms.get(swap.space_id) ?? new Map<string, string>();
    for (const [from, to] of now) if (to === swap.from_id) now.set(from, swap.to_id);
    now.set(swap.from_id, swap.to_id);
    rooms.set(swap.space_id, now);
  }
  return rooms;
}

/** Who stands for the agent in one room: itself, and whoever's place it holds there now. */
export function selvesIn(
  rooms: ReadonlyMap<string, ReadonlyMap<string, string>>,
  room: string,
  agentId: string,
): Set<string> {
  const selves = new Set([agentId]);
  for (const [from, to] of rooms.get(room) ?? []) if (to === agentId) selves.add(from);
  return selves;
}

/** Everyone who stands for the agent somewhere: whose membership events to read. */
export function everyoneFor(
  rooms: ReadonlyMap<string, ReadonlyMap<string, string>>,
  agentId: string,
): string[] {
  const ids = new Set([agentId]);
  for (const room of rooms.keys()) for (const id of selvesIn(rooms, room, agentId)) ids.add(id);
  return [...ids];
}

type Step = "arrives" | "leaves" | "hands_on" | "none";

/** What one membership event does to the agent's stay in its room. */
function stepOf(move: Move, selves: ReadonlySet<string>): Step {
  const payload = JSON.parse(move.payload) as Record<string, unknown>;
  const ours = (field: string) => selves.has(String(payload[field]));
  if (move.type === "membership.added") return ours("participant_id") ? "arrives" : "none";
  if (move.type === "membership.removed") return ours("participant_id") ? "leaves" : "none";
  if (move.type !== "membership.replaced" || ours("from") === ours("to")) return "none";
  return ours("to") ? "arrives" : "hands_on";
}

/** One membership event's step, applied to the stays open and the stays done. */
function follow(open: Map<string, Mark>, stays: Stay[], room: string, step: Step, mark: Mark) {
  const here = open.get(room);
  if (here === undefined) {
    if (step === "arrives") open.set(room, mark);
    return;
  }
  if (step === "leaves") stays.push({ room, from: here, to: mark });
  if (step === "leaves" || step === "hands_on") open.delete(room);
}

/** The stays the membership events make, in the order they ended (open ones last). */
export function staysOf(
  moves: readonly Move[],
  selves: (room: string) => ReadonlySet<string>,
): Stay[] {
  const open = new Map<string, Mark>();
  const stays: Stay[] = [];
  for (const move of moves) {
    if (move.space_id === null) continue;
    const step = stepOf(move, selves(move.space_id));
    follow(open, stays, move.space_id, step, { seq: move.seq, at: move.ts });
  }
  for (const [room, from] of open) stays.push({ room, from, to: null });
  return stays;
}

/** A stay ended at its room's archive, when the room was archived as the agent left it. */
export function endedAtArchive(stay: Stay, archives: readonly Archive[]): Stay {
  const last = archives
    .filter(
      (each) =>
        each.space_id === stay.room &&
        each.seq > stay.from.seq &&
        (stay.to === null || each.seq <= stay.to.seq),
    )
    .at(-1);
  return last?.state === "closed" ? { ...stay, to: { seq: last.seq, at: last.ts } } : stay;
}
