/**
 * What this phone holds, read once it can be (ADR 0228).
 *
 * iOS keeps the Keychain shut while the phone is locked, and the app's files too until the first
 * unlock after a restart, and it may start an app then, before anybody opens it. A read that met a
 * shut Keychain is not an answer. Taken for one, it said the phone held no workspace, the tabs sent
 * the person to Welcome, and Welcome stayed until the app was swiped away, for somebody who was
 * paired all along. So a read that could not open everything is made again once the app is in
 * front, and there a few times more, a moment apart. Only then does the app go on with what it
 * could read, which may be nothing.
 */

import { type Device, type HeldDevices, readDevices } from "@chipschat/core";
import { AppState } from "react-native";
import { deviceStorage } from "./storage";

/** How long apart the reads in front are, and how many there are before the app goes on. */
export const AGAIN_MS = 400;
export const TRIES_IN_FRONT = 5;

/** Whether the app is in front, and word when it comes there. A test hands in its own. */
export interface Front {
  readonly now: () => boolean;
  /** Calls `then` each time the app comes to the front; answers how to stop. */
  readonly when: (then: () => void) => () => void;
}

const APP_FRONT: Front = {
  now: () => AppState.currentState === "active",
  when: (then) => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") then();
    });
    return () => subscription.remove();
  },
};

const readHere = (): Promise<HeldDevices> => readDevices(deviceStorage);

/**
 * What a read leads to: its devices as the answer, a wait for the front, or another read a moment
 * later. `tries` counts the reads made in front, this one included.
 */
function after(
  found: HeldDevices | undefined,
  inFront: boolean,
  tries: number,
): readonly Device[] | "wait" | "again" {
  if (found !== undefined && found.unreadable === 0) return found.devices;
  if (!inFront) return "wait";
  return tries >= TRIES_IN_FRONT ? (found?.devices ?? []) : "again";
}

/** One `readWhenOpen` under way: what it reads with, and where it has got to. */
interface Reading {
  readonly read: () => Promise<HeldDevices>;
  readonly front: Front;
  readonly answer: (devices: readonly Device[]) => void;
  readonly signal: AbortSignal | undefined;
  /** The reads made in front so far. */
  tries: number;
  stopWaiting: (() => void) | undefined;
  timer: ReturnType<typeof setTimeout> | undefined;
}

function stop(reading: Reading): void {
  reading.stopWaiting?.();
  reading.stopWaiting = undefined;
  if (reading.timer !== undefined) clearTimeout(reading.timer);
  reading.timer = undefined;
}

async function attempt(reading: Reading): Promise<void> {
  // A storage that will not open at all is a shut one too: its files, before the first unlock.
  const found = await reading.read().catch(() => undefined);
  if (reading.signal?.aborted === true) return;
  const inFront = reading.front.now();
  if (inFront) reading.tries += 1;
  const next = after(found, inFront, reading.tries);
  if (next === "wait") waitForFront(reading);
  else if (next === "again") reading.timer = setTimeout(() => void attempt(reading), AGAIN_MS);
  else reading.answer(next);
}

function waitForFront(reading: Reading): void {
  reading.stopWaiting ??= reading.front.when(() => {
    stop(reading);
    void attempt(reading);
  });
  // In front between the read and the listening: that word has gone by, so read now.
  if (reading.front.now()) {
    stop(reading);
    void attempt(reading);
  }
}

/**
 * The devices this phone holds, the one in front first, once a read has opened every key, or once
 * the app is in front and the reads there still could not. Nothing comes back after `signal` aborts.
 */
export function readWhenOpen(
  signal?: AbortSignal,
  read: () => Promise<HeldDevices> = readHere,
  front: Front = APP_FRONT,
): Promise<readonly Device[]> {
  return new Promise((answer) => {
    const reading: Reading = {
      read,
      front,
      answer,
      signal,
      tries: 0,
      stopWaiting: undefined,
      timer: undefined,
    };
    signal?.addEventListener("abort", () => stop(reading), { once: true });
    void attempt(reading);
  });
}

/**
 * A read in front after a change this phone made (a pairing, a switch, a workspace forgotten):
 * the list as stored, or nothing when part of it would not open, so the list the app has stays.
 */
export async function readAgain(
  read: () => Promise<HeldDevices> = readHere,
): Promise<readonly Device[] | undefined> {
  const found = await read().catch(() => undefined);
  return found?.unreadable === 0 ? found.devices : undefined;
}
