/**
 * How a room's lines read as a conversation (ADR 0050, rule 5, and ADR 0268 for the desktop): one
 * author's bubbles that follow each other within `GROUP_WITHIN_MS` are a turn, closed up, with the
 * time in the last of them alone; and a line saying the day and the hour stands over the first line
 * and after any silence longer than `SEPARATOR_AFTER_MS`.
 *
 * The phone drew this from its own copy (`apps/mobile/src/spaces/spaces.ts`, `when.ts`) from
 * 11 September 2026; the desktop draws it from here, so both say the same day the same way.
 */

import type { Line } from "./model/types.js";

/** Lines by one author under three minutes apart read as one turn; past fifteen the room says the time. */
export const GROUP_WITHIN_MS = 3 * 60_000;
export const SEPARATOR_AFTER_MS = 15 * 60_000;

/** Where a bubble stands in its turn: alone, or the first, one of the middle, or the last of one. */
export type Place = "only" | "first" | "middle" | "last";

export interface Turned {
  readonly line: Line;
  readonly place: Place;
  /** A line saying the day and the hour stands over this one: the first, or one after a silence. */
  readonly separator: boolean;
}

/** Only a bubble joins a turn; a card, a margin line and a tombstone stand alone. */
function isBubble(line: Line): boolean {
  return (line.kind === "text" || line.kind === "summary") && line.deleted !== true;
}

function gapMs(before: Line, line: Line): number {
  return new Date(line.ts).getTime() - new Date(before.ts).getTime();
}

function sameTurn(
  before: Line,
  line: Line,
  speakerOf: (line: Line) => string,
  starts: (line: Line, before: Line) => boolean,
): boolean {
  return (
    isBubble(before) &&
    isBubble(line) &&
    !starts(line, before) &&
    speakerOf(before) === speakerOf(line) &&
    Math.abs(gapMs(before, line)) < GROUP_WITHIN_MS
  );
}

/**
 * The lines in the order they were said, each with its place in its turn and whether the day and
 * hour stand over it. A separator ends a turn too, because the time it says is a break in the
 * conversation. `speakerOf` is who a line reads as said by — a relayed line is its person's, so it
 * turns with what they typed here themselves. A line that `starts` a turn of its own never joins
 * the one before it: one wearing a route over it (ADR 0081), so the route stands in a turn's gap,
 * and either side of agents talking to each other, which fold into a row of their own.
 */
export function turnsOf(
  lines: readonly Line[],
  speakerOf: (line: Line) => string,
  starts: (line: Line, before: Line) => boolean = () => false,
): readonly Turned[] {
  const turned: Turned[] = [];
  for (const [index, line] of lines.entries()) {
    const before = lines[index - 1];
    const separator = before === undefined || gapMs(before, line) >= SEPARATOR_AFTER_MS;
    const joins = !separator && before !== undefined && sameTurn(before, line, speakerOf, starts);
    const last = turned.at(-1);
    if (joins && last !== undefined) {
      turned[turned.length - 1] = { ...last, place: last.place === "only" ? "first" : "middle" };
    }
    turned.push({ line, place: joins ? "last" : "only", separator });
  }
  return turned;
}

/** Whether a bubble in this place carries the turn's time: the last of it, or one alone. */
export function endsTurn(place: Place): boolean {
  return place === "only" || place === "last";
}

/** Whether a bubble in this place opens its turn, and so wears the name where a room says names. */
export function opensTurn(place: Place): boolean {
  return place === "only" || place === "first";
}

/** `10:45 AM`, in the reader's own locale and zone. */
function clockOf(at: Date): string {
  return at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function startOfDay(at: Date): number {
  const copy = new Date(at);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

/** `Today`, `Yesterday`, or the date: the day a separator names. */
export function dayLabel(iso: string, now: number): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const days = Math.floor((startOfDay(new Date(now)) - startOfDay(at)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return at.toLocaleDateString(undefined, { day: "numeric", month: "long" });
}

/** `Today 11:26 AM`, `Yesterday 9:02 PM`, `4 September 3:10 PM`: the separator over a line. */
export function separatorLabel(iso: string, now: number): string {
  const day = dayLabel(iso, now);
  return day === "" ? "" : `${day} ${clockOf(new Date(iso))}`;
}
