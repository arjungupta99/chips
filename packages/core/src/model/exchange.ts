/**
 * What a room says to its people about its agents' talk (ADR 0097), drawn from the lines and the
 * fold's marks alone, so every client draws it in the same place and a replay draws it again.
 *
 * - **The line** under the agents' fold, from the warning on: who has been talking, and how
 *   much, since a person last acted, *and the last k repeated earlier ones* when they did. Updated
 *   in place as the count grows. At the warning it carries two taps, *Let them carry on* and
 *   *Pause them*; once Chips holds their messages it says so instead.
 * - **Paused**: Chips holds the agents' messages to each other here, from a held line, a person's
 *   pause, or Chips's at the room's spend ceiling (ADR 0118), since a person last acted. The
 *   banner above the composer and the mark on the room's row read it, and both go when a person
 *   acts.
 *
 * The server's count also starts again when an agent makes something new; this one runs from
 * the person, which is what *since you last acted* says. Which messages are held is the server's.
 */

import {
  circleIn,
  DEFAULT_EXCHANGE_LIMITS,
  dollars,
  type ExchangeLimits,
  repeatOf,
} from "@chipschat/protocol";
import { type Directory, nameOf } from "../events.js";
import type { Line, Space } from "./types.js";

/** What the room says under the agents' fold, and at which stage. */
export interface ExchangeLine {
  /** `warning` offers *Let them carry on* and *Pause them*; `held` is said once Chips holds. */
  readonly stage: "warning" | "held";
  readonly text: string;
}

/** Where the count runs from, and the newest pause: 0 for a room that never had either. */
const actedIn = (space: Space): number => space.actedSeq ?? 0;
const pausedSince = (space: Space): boolean => (space.pausedSeq ?? 0) > actedIn(space);

/** Whether a line is one agent's message to another, or one Chips held. */
function isTalk(line: Line): boolean {
  if (line.kind !== "text" || line.authorKind !== "harness") return false;
  return line.held === true || (line.addressedTo?.length ?? 0) > 0;
}

/** The agents' messages to each other since a person last acted, up to `index`, oldest first. */
function talkSince(space: Space, index: number): Line[] {
  const talk: Line[] = [];
  for (let at = index; at >= 0; at -= 1) {
    const line = space.lines[at] as Line;
    if (line.seq <= actedIn(space)) break;
    if (isTalk(line)) talk.push(line);
  }
  return talk.reverse();
}

/** The agents talking: each that addressed another, and each it addressed, in order. */
function talkersIn(talk: readonly Line[]): string[] {
  const who: string[] = [];
  const note = (id: string) => {
    if (!who.includes(id)) who.push(id);
  };
  for (const line of talk) {
    note(line.authorId);
    for (const id of line.addressedTo ?? []) note(id);
  }
  return who;
}

/** For each message, whether its words repeat ones its sender already sent in the stretch. */
function repeatsIn(talk: readonly Line[]): boolean[] {
  return talk.map((line, index) =>
    repeatOf(
      line.text,
      talk
        .slice(0, index)
        .filter((each) => each.authorId === line.authorId)
        .map((each) => each.text),
    ),
  );
}

/** "A", "A and B", "A, B and C". */
function listed(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function namesOf(talk: readonly Line[], directory: Directory): string {
  const who = talkersIn(talk);
  return who.length >= 2 ? listed(who.map((id) => nameOf(directory, id))) : "The agents";
}

/** How many of the newest messages repeated earlier ones, counted back from the newest. */
function lastRepeats(repeated: readonly boolean[]): number {
  let k = 0;
  for (let at = repeated.length - 1; at >= 0 && repeated[at] === true; at -= 1) k += 1;
  return k;
}

/**
 * The line under a fold of the agents' talk that ends at `index`, from the warning on: nothing
 * below it. *ASCII Art, Oc2 and Oc3 have sent each other 16 messages since you last acted, and
 * the last 2 repeated earlier ones.* Once Chips holds them: *Chips paused the agents.* first.
 * The warning comes at the workspace's stop, and in circles while its switch is on (ADR 0187).
 */
export function exchangeLine(
  space: Space,
  index: number,
  directory: Directory,
  limits: ExchangeLimits = DEFAULT_EXCHANGE_LIMITS,
): ExchangeLine | undefined {
  const talk = talkSince(space, index);
  if (talk.length === 0) return undefined;
  const repeated = repeatsIn(talk);
  const held = talk.some((line) => line.held === true) || pausedSince(space);
  const circling =
    limits.circles &&
    circleIn(
      talk.map((line) => line.authorId),
      repeated,
    );
  const stopped = limits.stop !== null && talk.length >= limits.stop;
  if (!held && !circling && !stopped) return undefined;
  const k = lastRepeats(repeated);
  const repeats =
    k === 0
      ? ""
      : k === 1
        ? ", and the last one repeated an earlier one"
        : `, and the last ${k} repeated earlier ones`;
  const said = `${namesOf(talk, directory)} have sent each other ${talk.length} ${talk.length === 1 ? "message" : "messages"} since you last acted${repeats}.`;
  return held
    ? { stage: "held", text: `Chips paused the agents. ${said}` }
    : { stage: "warning", text: said };
}

/**
 * Whether Chips holds the agents' messages to each other here (ADR 0097): one was held, or a
 * person paused them, since a person last acted.
 */
export function pausedIn(space: Space): boolean {
  if (pausedSince(space)) return true;
  for (let at = space.lines.length - 1; at >= 0; at -= 1) {
    const line = space.lines[at] as Line;
    if (line.seq <= actedIn(space)) return false;
    if (line.held === true) return true;
  }
  return false;
}

/**
 * The banner's words while the agents are paused: who paused them, a person or Chips, and, for
 * Chips, how much they had said, or what the job had spent at the room's ceiling (ADR 0118).
 * Nothing while they are not.
 */
export function pauseWords(space: Space, directory: Directory): string | undefined {
  if (!pausedIn(space)) return undefined;
  if (pausedSince(space) && space.pausedBy !== undefined) {
    return `${nameOf(directory, space.pausedBy)} paused the agents. Their messages to each other wait until somebody acts.`;
  }
  if (pausedSince(space) && space.pausedSpend !== undefined) {
    const { spentUsd, ceilingUsd } = space.pausedSpend;
    return `This job has spent ${dollars(spentUsd)} of the ${dollars(ceilingUsd)} this space allows. The agents start nothing new until somebody lets them carry on.`;
  }
  const talk = talkSince(space, space.lines.length - 1);
  return `Chips paused the agents. ${namesOf(talk, directory)} sent each other ${talk.length} messages since you last acted.`;
}
