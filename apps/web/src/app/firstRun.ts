/**
 * What the first run reads and keeps on this device (ADR 0170): the server's facts, the
 * gallery's cards, this person's devices, and three things this device remembers about itself —
 * that it has been through the welcome, that it still owes the person the phone card, and that
 * the setup card was hidden here. Those three are this device's and nobody else's, so they live in
 * `localStorage`, keyed by the device: a browser paired to two workspaces keeps two of each.
 * Storage can be missing or refuse (a private window), and then each lasts as long as the page.
 */

import type { PairedDeviceRecord, ServerFacts, Store } from "@chipschat/core";
import type { Connector } from "@chipschat/protocol";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

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

/** Which machine Chips runs on, and how far it reaches: read once a minute. */
export function useServerFacts(store: Store): ServerFacts | undefined {
  return useRead(
    useCallback(() => store.serverFacts(), [store]),
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
