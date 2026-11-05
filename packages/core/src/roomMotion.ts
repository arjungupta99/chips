/**
 * How a room moves, wherever it is read (ADR 0074, ADR 0075, ADR 0242): the one model the phone's
 * room (`RoomMotion.tsx`, on Reanimated's layout transitions) and the web's and the Mac's
 * (`room/roomMotion.ts`, on the page's frames) both move by.
 *
 * - **One spring.** Whatever a change moves goes from where it was drawn to where it is laid out
 *   on the room's spring (`ROOM_SPRING`), from the frame the change is drawn in.
 * - **A move that lands on a move keeps its speed** (`roomMoved`). The spring is linear, so a row
 *   sent on while it is going goes where the two moves added up would take it, and two rows sent
 *   on by the same changes stay the same distance apart, whenever the changes come.
 * - **One clock** (`RoomClock`), which a frame moves by at most a frame and a fifth
 *   (`STEADY_FRAME_MS`): a frame that could not be drawn costs everything in the room the same
 *   pause, never a jump, and never one row ahead of another.
 * - **What lands comes in under the row above it**, as that row is drawn and at its speed, and
 *   fades up over `ROOM_FADE_IN_MS` as it comes. What goes from the foot fades where it stood over
 *   `ROOM_FADE_OUT_MS`, while the rows close over its place.
 *
 * Pure, so the phone's worklets and the web's frames read the same numbers.
 */

import { type Spring, springAt } from "./viewer.js";

/**
 * The room's spring, as stiffness and damping over a mass of one: a response of 0.55 s at a damping
 * ratio of 0.83, a point or two past the mark and back (`docs/proposals/send-curve-mocks.html`,
 * Arjun, 25 September 2026: "the animation curve is too quick" at 0.42 s). The words of a send rise
 * on it too, so they and the room keep their distance.
 */
export const ROOM_SPRING: Spring = { stiffness: 130, damping: 19, mass: 1 };

/** What comes in fades up over this long, easing out, while it rises on the spring. */
export const ROOM_FADE_IN_MS = 200;

/** What goes from the room's foot — a thinking bubble, a card — fades over this long where it stood. */
export const ROOM_FADE_OUT_MS = 160;

/**
 * How long a run has to have been going before the room shows it: its thinking bubble, and on the
 * Mac and the web its run panel too (ADR 0268 addendum). The beat that makes it a thought; a run
 * over in less shows neither.
 */
export const THINKING_GRACE_MS = 800;

/**
 * The most a frame moves a steady clock, the room's among them: a frame and a fifth at 60 Hz. A
 * frame that came late — a mount that took fifty milliseconds, a vsync missed — is that long a
 * pause, and the frame after it does not leap to where the wall clock says.
 */
export const STEADY_FRAME_MS = 20;

/**
 * The room's clock: where it stands (`at`, in milliseconds of its own) as of the frame it last
 * moved in (`last`, on the frames' clock).
 */
export interface RoomClock {
  readonly last: number;
  readonly at: number;
}

/** A clock that has not moved yet. */
export const ROOM_CLOCK: RoomClock = { last: 0, at: 0 };

/**
 * The clock for a move started at `now`: it does not move for it. Every move a change starts starts
 * at the same moment of the room's clock, however long starting them took; what that took is a
 * pause for all of them.
 */
export function roomStarted(clock: RoomClock, now: number): RoomClock {
  "worklet";
  return now > clock.last ? { last: now, at: clock.at } : clock;
}

/** The clock for the frame drawn at `now`: moved by what the frame took, but never by more than `STEADY_FRAME_MS`. */
export function roomTicked(clock: RoomClock, now: number): RoomClock {
  "worklet";
  if (now <= clock.last) return clock;
  return { last: now, at: clock.at + Math.min(STEADY_FRAME_MS, now - clock.last) };
}

/**
 * A move on the room's spring: drawn `offset` from where it goes (on the web, pixels; positive is
 * drawn lower), closing it at `velocity` a second, as of `since` on the room's clock.
 */
export interface RoomMove {
  readonly offset: number;
  readonly velocity: number;
  readonly since: number;
}

/** Where a move stands at `at` on the room's clock: how far from where it goes, how fast, and whether it has settled. */
export function roomMoveAt(
  move: RoomMove,
  at: number,
): { readonly offset: number; readonly velocity: number; readonly settled: boolean } {
  "worklet";
  return springAt(ROOM_SPRING, move.offset, move.velocity, at - move.since);
}

/**
 * A move after what it goes to has moved, at `at`: drawn where it is, so `by` further from where it
 * goes, at the speed it has. From rest (`undefined`), at rest. Nothing moved and nothing left to go
 * is no move at all.
 */
export function roomMoved(
  move: RoomMove | undefined,
  by: number,
  at: number,
): RoomMove | undefined {
  "worklet";
  const now = move === undefined ? { offset: 0, velocity: 0 } : roomMoveAt(move, at);
  const offset = now.offset + by;
  if (offset === 0 && now.velocity === 0) return undefined;
  return { offset, velocity: now.velocity, since: at };
}
