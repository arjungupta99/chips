/**
 * A player for the render mode's tests (ADR 0213): it holds whatever state a test gives it and says
 * so to its listeners, and counts what it was asked. The film is core's own.
 */

import { type DemoPlayer, type DemoState, filmOf } from "@chipschat/core";

export const WATCH = filmOf("watch");

/** A chapter of the first film, by its key. */
export function chapterOf(key: string) {
  const chapter = WATCH.chapters.find((each) => each.key === key);
  if (chapter === undefined) throw new Error(`no chapter ${key}`);
  return chapter;
}

/** The state at the start of a chapter. */
export function stateAt(key: string, change: Partial<DemoState> = {}): DemoState {
  const index = WATCH.chapters.findIndex((each) => each.key === key);
  const chapter = chapterOf(key);
  return {
    film: WATCH.key,
    chapter: index,
    screen: chapter.screen,
    ...(chapter.spaceId === undefined ? {} : { spaceId: chapter.spaceId }),
    playing: true,
    ended: false,
    ...change,
  };
}

export interface HeldPlayer extends DemoPlayer {
  /** Say a new state, as the player would at a beat. */
  readonly set: (state: DemoState) => void;
  readonly calls: { play: number; closed: boolean };
}

export function heldPlayer(start: DemoState): HeldPlayer {
  let state = start;
  const listeners = new Set<(state: DemoState) => void>();
  const calls = { play: 0, closed: false };
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    play: () => {
      calls.play += 1;
    },
    close: () => {
      calls.closed = true;
    },
    set: (next) => {
      state = next;
      for (const listener of listeners) listener(next);
    },
    calls,
  };
}
