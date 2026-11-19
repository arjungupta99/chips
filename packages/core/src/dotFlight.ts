/**
 * The update dot's flight into About's first update button (ADR 0296, addendum of 17 November
 * 2026), as one small store that each app keeps one of.
 *
 * A press takes off. The dot's place and the first button's are said as each is measured, and the
 * app's flight layer flies the dot once it has both, then says it has landed; About's buttons,
 * drawn at the dot's size while it was on its way, grow out of it then (`updateButtonTimes`).
 * A flight that no button answers is missed: About says so as soon as it shows no button, and
 * failing that it is missed after `UPDATE_MOTION.waitMs`, so a button never waits unseen. Each
 * wait after that is counted from the step before it: the layer setting off once the button has
 * answered, and landing once it has set off, so a page busy opening About delays the flight
 * rather than cutting it short. A while
 * after a flight ends the store is at rest again, and the next lit dot is drawn as usual.
 *
 * Pure apart from its timers, so the phone, the iPad, the Mac and the web keep the same rules.
 */

import { UPDATE_MOTION, updateButtonTimes } from "./updates.js";

/** A point in the window, where a dot or a button's middle is. */
export interface DotPoint {
  readonly x: number;
  readonly y: number;
}

export type DotFlight =
  | { readonly stage: "rest"; readonly id: number }
  | {
      readonly stage: "up";
      readonly id: number;
      /** Where the dot stood, once measured. */
      readonly from?: DotPoint;
      /** Where the first button stands, once laid out. */
      readonly to?: DotPoint;
      /** Whether the flight layer has set off with both. */
      readonly flying?: boolean;
    }
  | { readonly stage: "landed"; readonly id: number }
  | { readonly stage: "missed"; readonly id: number };

export interface DotFlights {
  /** The flight as it stands; the same object until it changes. */
  readonly now: () => DotFlight;
  readonly subscribe: (listener: () => void) => () => void;
  /** A press: a new flight, whose id the other calls name, so a late answer to an old one is dropped. */
  readonly takeOff: () => number;
  readonly from: (id: number, at: DotPoint) => void;
  readonly aim: (id: number, at: DotPoint) => void;
  /** The flight layer has set off: it lands after `flyMs`, or the flight is missed well after. */
  readonly depart: (id: number) => void;
  readonly land: (id: number) => void;
  /** No button to land on: the dot goes out where it stands, and any button drawn grows at once. */
  readonly miss: (id: number) => void;
}

/** From landing until the store rests: the last of two buttons is glowing by then. */
export const DOT_FLIGHT_SETTLE_MS = updateButtonTimes(1).glowAt + 400;
/** From a miss until the store rests: the dot has gone out by then. */
export const DOT_FLIGHT_MISS_MS = 400;
/**
 * From the button answering until the flight layer must have set off. Generous: opening About can
 * hold the page's thread for most of a second (the web app's development build, 17 November 2026),
 * and the flight starts only once it is free.
 */
export const DOT_FLIGHT_DEPART_MS = 1500;

export function dotFlights(): DotFlights {
  let flight: DotFlight = { stage: "rest", id: 0 };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const set = (next: DotFlight, restIn?: number) => {
    flight = next;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const id = next.id;
    if (restIn !== undefined) {
      timer = setTimeout(() => {
        timer = undefined;
        if (next.stage === "up") missed(id);
        else if (flight.id === id) set({ stage: "rest", id });
      }, restIn);
    }
    for (const listener of listeners) listener();
  };
  const up = (id: number) => (flight.stage === "up" && flight.id === id ? flight : undefined);
  const missed = (id: number) => {
    if (up(id) !== undefined) set({ stage: "missed", id }, DOT_FLIGHT_MISS_MS);
  };
  return {
    now: () => flight,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    takeOff: () => {
      const id = flight.id + 1;
      set({ stage: "up", id }, UPDATE_MOTION.waitMs);
      return id;
    },
    from: (id, at) => {
      const was = up(id);
      if (was === undefined) return;
      flight = { ...was, from: at };
      for (const listener of listeners) listener();
    },
    aim: (id, at) => {
      const was = up(id);
      if (was === undefined || was.to !== undefined) return;
      // Answered: the wait is over, and the flight layer has a while to set off.
      set({ ...was, to: at }, DOT_FLIGHT_DEPART_MS);
    },
    depart: (id) => {
      const was = up(id);
      if (was === undefined || was.to === undefined || was.flying === true) return;
      // On its way: a flight that never lands is missed well after it should have, since a busy
      // page holds the landing back too, and only the layer knows when the dot is there.
      set({ ...was, flying: true }, UPDATE_MOTION.flyMs + DOT_FLIGHT_DEPART_MS);
    },
    land: (id) => {
      if (up(id) !== undefined) set({ stage: "landed", id }, DOT_FLIGHT_SETTLE_MS);
    },
    miss: missed,
  };
}
