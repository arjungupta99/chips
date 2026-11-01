/**
 * Who a new space from the + is asked of (ADR 0084): whom the window opens on, what a tap on a
 * face does, and the line under the faces that says what a send will do. In core so the phone's
 * window and the desktop's dialog pick the same way and say the same thing.
 *
 * Or nobody is asked, and the room is made empty, by name, to be filled before anybody starts in
 * it (ADR 0148): the Empty face, first in the row, picked as a face is and never beside one.
 */

import { cantAnswer } from "./agents.js";
import type { Participant } from "./events.js";

/**
 * The Empty face's pick, among the harnesses' ids: a room made by its name alone, with nobody
 * asked for it (ADR 0148). No participant's id looks like it.
 */
export const EMPTY_ROOM = "empty";

/**
 * What the field asks for, whoever is picked: the room's name (ADR 0149). It asked a harness what
 * the space was for, and the words were the first message; now nothing is said until the person
 * says it in the room.
 */
export const NEW_SPACE_NAMED = "Name the space";

/** The line under the faces with Empty picked (ADR 0148). */
export const EMPTY_ROOM_LINE = "An empty space · you add agents next";

/** The line where no harness takes new spaces: no faces, and Empty is all there is (ADR 0148). */
export const NEW_SPACE_ALONE_LINE = "A space for people, named by what you type";

/**
 * Who will be in the room, in the order they were picked: the first is the one asked. Until a
 * face is tapped (`chosen` undefined) it is whoever was asked last, while they are still offered,
 * and otherwise the first offered. Once one has been, it is only who was picked, which may be
 * nobody. Empty is nobody asked (`newSpaceEmpty` says whether it is picked).
 */
export function newSpacePicked(
  harnesses: readonly Participant[],
  chosen: readonly string[] | undefined,
  lastAsked?: string,
): Participant[] {
  if (chosen !== undefined)
    return chosen.flatMap((id) => harnesses.filter((each) => each.id === id));
  if (lastAsked === EMPTY_ROOM) return [];
  const first = harnesses.find((each) => each.id === lastAsked) ?? harnesses[0];
  return first === undefined ? [] : [first];
}

/**
 * Whether Empty is picked: tapped, or, before any face is, what the last room made from here was.
 * Where no harness takes new spaces there is no face to tap and it is all there is.
 */
export function newSpaceEmpty(
  harnesses: readonly Participant[],
  chosen: readonly string[] | undefined,
  lastAsked?: string,
): boolean {
  if (harnesses.length === 0) return true;
  return chosen === undefined ? lastAsked === EMPTY_ROOM : chosen.includes(EMPTY_ROOM);
}

/**
 * What is picked, as ids, for `newSpacePicks`: Empty, or who will be asked.
 */
export function newSpacePickIds(picked: readonly Participant[], empty: boolean): string[] {
  return empty ? [EMPTY_ROOM] : picked.map((each) => each.id);
}

/**
 * A tap on a face. The first tap chooses: on anyone but the one the window opened on, it is them
 * instead, since a room of one is what nearly every room is. Every tap after that puts the face in
 * if it was out and takes it out if it was in, the last one too. The chips before this put the
 * first tap's face in beside the one there, so a change of mind made a group, and would not take
 * the last one out, so the pick stuck (28 September 2026).
 *
 * Empty is never beside a face (ADR 0148): a tap on it is it alone, or nobody when it was picked,
 * and a tap on a face while it is picked is that face instead.
 */
export function newSpacePicks(
  picked: readonly string[],
  touched: boolean,
  harnessId: string,
): string[] {
  if (harnessId === EMPTY_ROOM) return picked.includes(EMPTY_ROOM) ? [] : [EMPTY_ROOM];
  if (picked.includes(EMPTY_ROOM)) return [harnessId];
  if (!touched && picked.length === 1 && picked[0] !== harnessId) return [harnessId];
  return picked.includes(harnessId)
    ? picked.filter((id) => id !== harnessId)
    : [...picked, harnessId];
}

/**
 * Who leads next: the lead handed on to the next one picked, the one that led going to the back
 * (ADR 0149's addendum). A tap on the lead's name in the line under the faces, so several picked
 * can be led by any of them without picking them again in another order.
 */
export function newSpaceNextLead(picked: readonly string[]): string[] {
  const [first, ...rest] = picked;
  return first === undefined ? [] : [...rest, first];
}

/** The line under the faces, for a pick of somebody; each surface says its own for nobody. */
export interface NewSpaceLine {
  /** The one asked, set apart from the rest of the line. Absent when the line is a warning. */
  readonly lead?: string;
  /**
   * With several picked, " leads": said with the lead's name and tapped with it, to hand the lead
   * to `next` (`newSpaceNextLead`).
   */
  readonly leads?: string;
  /** Whom a tap on the lead's name hands the lead to. */
  readonly next?: string;
  /** The rest: " joins · waits for your first message", or the warning whole. */
  readonly words: string;
  /** The one asked can't answer now (ADR 0083): said in amber, since the room waits on them. */
  readonly warn: boolean;
}

/**
 * What a send will do (ADR 0149): "Kit joins · waits for your first message", or "Kit leads · Lux
 * joins · they wait for you", or with more beside the lead "Kit leads · 2 more join · they wait for
 * you". The faces above already show which, and naming them all ran the phone's line out at
 * "Claude Code, Jacobian and OpenClaw…" (15 October 2026). Each picked is in the room, and none
 * says anything until the person does; the first picked claims it and leads it (ADR 0104). An
 * asked agent that can't answer says that instead. Nobody picked is undefined.
 */
export function newSpaceLine(picked: readonly Participant[]): NewSpaceLine | undefined {
  const [first, ...rest] = picked;
  if (first === undefined) return undefined;
  if (cantAnswer({ [first.id]: first }, first.id) !== undefined)
    return { words: `${first.displayName} can't answer now`, warn: true };
  const [second] = rest;
  if (second === undefined)
    return { lead: first.displayName, words: " joins · waits for your first message", warn: false };
  const others = rest.length === 1 ? `${second.displayName} joins` : `${rest.length} more join`;
  return {
    lead: first.displayName,
    leads: " leads",
    next: second.displayName,
    words: ` · ${others} · they wait for you`,
    warn: false,
  };
}

/**
 * Who can start a space, under an empty workspace's Create a space (ADR 0131): "Scout can start
 * one", "Jacobian and OpenClaw can…", "Jacobian, OpenClaw and 2 more can…". Nothing for nobody.
 */
export function startersWords(names: readonly string[]): string {
  const [first, second] = names;
  if (first === undefined) return "";
  if (second === undefined) return `${first} can start one`;
  if (names.length === 2) return `${first} and ${second} can start one`;
  return `${first}, ${second} and ${names.length - 2} more can start one`;
}
