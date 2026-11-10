/**
 * What the first run reads and keeps on this device (ADR 0170): the server's facts, the
 * gallery's cards, this person's devices, and three things this device remembers about itself —
 * that it has been through the welcome, that it still owes the person the phone card, and that
 * the setup card was hidden here. Those three are this device's and nobody else's, so they live in
 * `localStorage`, keyed by the device: a browser paired to two workspaces keeps two of each.
 * Storage can be missing or refuse (a private window), and then each lasts as long as the page.
 */

import {
  type PairedDeviceRecord,
  type RelayState,
  relaySettled,
  type ServerFacts,
  type Store,
} from "@chipschat/core";
import type { Connector } from "@chipschat/protocol";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { desktop } from "../native.ts";

type Flag = "welcomed" | "phone" | "setup-hidden";

const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function keyOf(flag: Flag, deviceId: string): string {
  return `chips.firstRun.${flag}.${deviceId}`;
}

function readFlag(key: string): string | undefined {
  try {
    const kept = globalThis.localStorage?.getItem(key);
    if (kept !== null && kept !== undefined) return kept;
  } catch {
    // No storage: what this page set is what there is.
  }
  return memory.get(key);
}

function writeFlag(key: string, value: string | undefined): void {
  if (value === undefined) memory.delete(key);
  else memory.set(key, value);
  try {
    if (value === undefined) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  } catch {
    // Kept in memory above.
  }
  for (const listener of listeners) listener();
}

/** A flag this device keeps about the first run, and setting it. */
export function useDeviceFlag(flag: Flag, deviceId: string): [boolean, (on: boolean) => void] {
  const key = keyOf(flag, deviceId);
  const on = useSyncExternalStore(
    (changed) => {
      listeners.add(changed);
      return () => listeners.delete(changed);
    },
    () => readFlag(key) === "1",
  );
  const set = useCallback((next: boolean) => writeFlag(key, next ? "1" : undefined), [key]);
  return [on, set];
}

/**
 * The welcome marked as seen on a device paired by an invite: it is the first person's, who set the
 * workspace up, and somebody invited has named themselves already on the way in. An invited owner
 * was otherwise welcomed as the one whose Chips it is (the onboarding audit, Part 2, item 15).
 */
export function welcomedByInvite(deviceId: string): void {
  writeFlag(keyOf("welcomed", deviceId), "1");
}

/** Something read from the server now and again, kept while the page is open. */
function useRead<T>(read: () => Promise<T>, everyMs: number | undefined): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    let live = true;
    // A read that throws, even before it returns a promise, is one not read yet: the card waits.
    const once = () =>
      void Promise.resolve()
        .then(read)
        .then(
          (next) => live && setValue(next),
          () => undefined,
        );
    once();
    const timer = everyMs === undefined ? undefined : setInterval(once, everyMs);
    const back = () => {
      if (document.visibilityState === "visible") once();
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      live = false;
      if (timer !== undefined) clearInterval(timer);
      document.removeEventListener("visibilitychange", back);
    };
  }, [read, everyMs]);
  return value;
}

/**
 * Which machine Chips runs on, and how far it reaches: read once a minute, and again once an
 * owner turns the relay (`relay`, from `relay.set`), when the server has done what the switch says
 * (`relaySettled`), so Away from home follows the switch rather than a read a minute old.
 */
export function useServerFacts(store: Store, relay?: RelayState): ServerFacts | undefined {
  const at = relay?.at;
  return useRead(
    useCallback(async () => {
      await relaySettled(at);
      return store.serverFacts();
    }, [store, at]),
    60_000,
  );
}

/** The gallery's cards from the docs (ADR 0171): read when the page opens. */
export function useConnectors(store: Store): readonly Connector[] | undefined {
  return useRead(
    useCallback(() => store.connectors(), [store]),
    undefined,
  );
}

/** What Chips for Mac last found here, by command: nothing until it has said, or in a browser. */
let foundHere: ReadonlySet<string> | undefined;
const foundListeners = new Set<() => void>();

function setFoundHere(programs: readonly string[]): void {
  const next = new Set(programs);
  const same = foundHere?.size === next.size && [...next].every((one) => foundHere?.has(one));
  if (same) return;
  foundHere = next;
  for (const listener of foundListeners) listener();
}

function onFoundHere(changed: () => void): () => void {
  foundListeners.add(changed);
  return () => foundListeners.delete(changed);
}

/**
 * Which of the cards' agents are on this Mac (ADR 0288), asked when a gallery opens and whenever
 * the window comes back, which is when a person has just installed one. `order` is what was known
 * as this gallery first drew, so that an answer arriving after it adds a tag and never moves a row
 * under the pointer; the first run asks from its first step, so its gallery opens in order.
 */
export function useFoundHere(cards: readonly Connector[] | undefined): {
  readonly found: ReadonlySet<string> | undefined;
  readonly order: ReadonlySet<string> | undefined;
} {
  const found = useSyncExternalStore(onFoundHere, () => foundHere);
  const [order] = useState(() => foundHere);
  const names = [...new Set((cards ?? []).flatMap((card) => card.program ?? []))].join(" ");
  useEffect(() => {
    if (names === "") return;
    let live = true;
    const ask = () =>
      void desktop()
        .then((shell) => shell?.programsHere?.(names.split(" ")))
        .then(
          (programs) => live && programs !== undefined && setFoundHere(programs),
          () => undefined,
        );
    ask();
    window.addEventListener("focus", ask);
    return () => {
      live = false;
      window.removeEventListener("focus", ask);
    };
  }, [names]);
  return { found, order };
}

/**
 * This person's devices, read every `everyMs` while something is waiting for one to be paired,
 * and when the page comes back into view.
 */
export function useMyDevices(
  store: Store,
  everyMs: number | undefined,
): readonly PairedDeviceRecord[] | undefined {
  return useRead(
    useCallback(() => store.devices(), [store]),
    everyMs,
  );
}

/** Forget every flag this page keeps about the first run: for tests, which share one page. */
export function forgetFirstRunFlags(): void {
  for (const key of [...memory.keys()]) writeFlag(key, undefined);
  try {
    const storage = globalThis.localStorage;
    if (storage === undefined) return;
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith("chips.firstRun.") === true) writeFlag(key, undefined);
    }
  } catch {
    // No storage: memory was all there was.
  }
}
