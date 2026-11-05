/**
 * Read state: how far a person has read in each space, and therefore what is unread.
 *
 * A space is read up to a `seq`. Anything a person would see with a higher `seq` — a
 * message, a summary, an approval — is unread. It is pure arithmetic over the model and a map,
 * so it is tested without a browser. The map is the person's, kept at the server and followed by
 * each of their devices (ADR 0262): each keeps a copy in its cache to count from at once, and the
 * further of two marks for a room wins (`furthest`). It is not the log's: no event says it.
 */

import type { Line, NeedsYouItem, Run, Space } from "./model.js";

/** The last `seq` read in each space, by space id. */
export type ReadState = Readonly<Record<string, number>>;

/**
 * How many lines in a space come after where it was last read.
 *
 * The lines are in `seq` order and the pending ones sit after them all, so this is arithmetic
 * on two boundaries rather than a walk: the sidebar asks it for every space on every
 * render, and a space of ten thousand lines must not cost ten thousand comparisons
 * (Phase 1 review, finding 1).
 */
export function unreadCount(space: Space, readState: ReadState): number {
  const readUpTo = readState[space.id] ?? 0;
  const lines = space.lines;
  let pending = 0;
  while (lines[lines.length - 1 - pending]?.pending === true) pending += 1;
  return Math.max(0, lines.length - pending - afterOf(lines, readUpTo));
}

/** The index of the first line with a `seq` above `readUpTo`; the length when there is none. */
function afterOf(lines: readonly Line[], readUpTo: number): number {
  let low = 0;
  let high = lines.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((lines[middle] as Line).seq <= readUpTo) low = middle + 1;
    else high = middle;
  }
  return low;
}

const ENDED: ReadonlySet<Run["state"]> = new Set(["done", "failed", "cancelled"]);

/**
 * How far a room marks itself read by being looked at: its last confirmed line, or past a run
 * that has ended, whichever is later. A run's card in Needs you carries the run's last event —
 * the completion after its message, when the summary closes on the last said and draws no line
 * — and a room on that message has read it. A question asked or a step logged moves neither,
 * so a card for a question with a default outlives a glance at the room, and a run streaming
 * its steps does not mark and render the room once per step. A line the server has not
 * confirmed is not a place to mark: its `seq` is a placeholder.
 */
export function readMark(space: Space): number {
  let index = space.lines.length - 1;
  while (index >= 0 && space.lines[index]?.pending === true) index -= 1;
  const line = index >= 0 ? (space.lines[index] as Line).seq : 0;
  const ended = space.runs.filter((run) => ENDED.has(run.state)).map((run) => run.lastSeq);
  return Math.max(line, ...ended);
}

/** True when a space has anything unread. */
export function hasUnread(space: Space, readState: ReadState): boolean {
  return unreadCount(space, readState) > 0;
}

/** The total across every space, for the app badge. */
export function totalUnread(spaces: readonly Space[], readState: ReadState): number {
  return spaces.reduce((sum, space) => sum + unreadCount(space, readState), 0);
}

/**
 * Mark a space read up to a `seq`. Read state only moves forward: opening an old
 * space does not un-read newer ones, and a late-arriving lower `seq` does not either.
 */
export function markRead(readState: ReadState, spaceId: string, seq: number): ReadState {
  const current = readState[spaceId] ?? 0;
  if (seq <= current) return readState;
  return { ...readState, [spaceId]: seq };
}

/**
 * Mark spaces read as far as opening each would (`readMark`): Read all, and Read on picked rooms,
 * in Select (ADR 0181 addendum, 18 October 2026). Forward only, as `markRead` is, and the same
 * object back when none of them moves, so a store saves and renders once or not at all.
 */
export function markSpacesRead(readState: ReadState, spaces: readonly Space[]): ReadState {
  return spaces.reduce((state, space) => markRead(state, space.id, readMark(space)), readState);
}

/**
 * Two maps as one, each room read as far as the further of them says: the server's marks over
 * this device's, or another device's as it reads (ADR 0262). The same object back when nothing
 * moves, so a store saves and renders once or not at all.
 */
export function furthest(readState: ReadState, marks: Readonly<Record<string, number>>): ReadState {
  return Object.entries(marks).reduce(
    (state, [spaceId, seq]) => markRead(state, spaceId, seq),
    readState,
  );
}

/** The marks of `mine` further than `theirs` says, for these rooms: what the server is owed. */
export function aheadOf(
  mine: ReadState,
  theirs: Readonly<Record<string, number>>,
  spaceIds: Iterable<string>,
): Record<string, number> {
  const ahead: Record<string, number> = {};
  for (const spaceId of spaceIds) {
    const seq = mine[spaceId];
    if (seq !== undefined && seq > (theirs[spaceId] ?? 0)) ahead[spaceId] = seq;
  }
  return ahead;
}

/**
 * What needs a person's attention now: everything to decide, and what is to review or FYI
 * that has not been read. The queue shows exactly this, and the badge counts it.
 */
export function attention(items: readonly NeedsYouItem[], readState: ReadState): NeedsYouItem[] {
  return items.filter(
    (item) => item.tier === "decide" || item.seq > (readState[item.spaceId] ?? 0),
  );
}
