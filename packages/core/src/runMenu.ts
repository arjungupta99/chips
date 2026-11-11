/**
 * What a person can do to an agent's work from its bubble or its room's row (ADR 0293): Pause or
 * Resume, and Stop. The Mac and the web draw these in a right-click menu, the iPhone and iPad on
 * the card a held bubble lifts with, and they say the same words.
 *
 * Pause is offered only on a run whose harness said a Pause holds it (`run.status` `pausable`):
 * until 10 November 2026 no bridge listened for one, and a paused agent went on working out of
 * sight. Resume is offered on any paused run, since Chips pauses runs itself at a budget's
 * ceiling. Stop is offered on every run, and asks nothing: a right-click or a hold and then Stop
 * is two deliberate moves, and what the agent did stays in the room.
 */

import { clockWords } from "./bubbleSays.js";
import type { Directory } from "./events.js";
import { nameOf } from "./events.js";
import type { Space } from "./model/types.js";
import { type Doing, spaceDoing } from "./timeline.js";

export type RunAct = "pause" | "resume" | "stop";

export interface RunMenuItem {
  readonly act: RunAct;
  /** `Pause`, or `Pause Luis` where the menu is the room's and could be about any of its agents. */
  readonly label: string;
  /** Stop is said in red. */
  readonly danger?: true | undefined;
}

/** A row's item names the run it is about. */
export interface RoomRunItem extends RunMenuItem {
  readonly runId: string;
  readonly harnessId: string;
}

/**
 * The items for one agent's work: Resume while paused, else Pause where it holds; then Stop.
 * `name` is said after each where the menu is a room's rather than the bubble's own.
 */
export function runMenuItems(doing: Doing, name?: string): readonly RunMenuItem[] {
  const who = name === undefined ? "" : ` ${name}`;
  const items: RunMenuItem[] = [];
  if (doing.paused === true) items.push({ act: "resume", label: `Resume${who}` });
  else if (doing.pausable) items.push({ act: "pause", label: `Pause${who}` });
  items.push({ act: "stop", label: `Stop${who}`, danger: true });
  return items;
}

/**
 * The items a room's row offers, one agent's after another, for each agent at work in it, a
 * paused one included. None when nobody is.
 */
export function roomRunItems(space: Space, directory: Directory): readonly RoomRunItem[] {
  return spaceDoing(space).flatMap((doing) =>
    runMenuItems(doing, nameOf(directory, doing.harnessId)).map((item) => ({
      ...item,
      runId: doing.runId,
      harnessId: doing.harnessId,
    })),
  );
}

/** The menu's head: who, and how long it has worked, `Luis · working for 4:24`. */
export function runMenuHead(doing: Doing, name: string, now: number): string {
  const held = doing.heldAt === undefined ? Number.NaN : Date.parse(doing.heldAt);
  const time = clockWords(doing.startedAt, Number.isNaN(held) ? now : held);
  return doing.paused === true ? `${name} · paused at ${time}` : `${name} · working for ${time}`;
}

/**
 * What a bubble says while a Pause, a Resume or a Stop is on its way and the server has not
 * answered past the beat. Inside the beat the bubble says nothing new: the dots hold at once,
 * and the answer usually lands well within it.
 */
export const RUN_ASKED_WORDS: Readonly<Record<RunAct, string>> = {
  pause: "Pausing",
  resume: "Resuming",
  stop: "Stopping",
};

/** The beat a bubble waits before it says a command is on its way: the asks' (ADR 0268). */
export const RUN_ASKED_BEAT_MS = 300;
