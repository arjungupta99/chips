/**
 * A store for every workspace this phone holds (ADR 0197), made once and kept while the app is
 * open: the one in front is the store every screen reads, and each behind it lets the switcher say
 * what waits there, a banner say something new does, and a decision made on the lock screen go to
 * the server it came from. A workspace muted on this phone gets no store: nothing is fetched for a
 * place the person asked not to hear from.
 *
 * One store a workspace, whether it is in front or behind (ADR 0197's addendum, 19 October 2026).
 * Until then the one in front had a store of its own, made afresh at every switch, and the one it
 * replaced was closed and made again behind, reading nothing of the cache but where each room was
 * last read. So every switch read the whole cache of the workspace coming forward and folded it
 * into a model, and replayed the whole log of the one going behind from the server and folded that
 * too, and threw both away at the next switch: seconds in which the phone answered nothing, more
 * with each switch (Arjun's iPhone: "something goes off with the app performance when I switch the
 * workspace back and forth"). Kept, a switch hands the front to a store that has read its cache
 * already and is up to date with its server.
 *
 * Each reads and writes its own cache, under its own workspace and server, as the one in front
 * always did: no two stores share one. The stores behind are made once the one in front is drawn,
 * so a launch draws its workspace before reading anyone else's.
 *
 * The demo's device (ADR 0213) is the one branch: its store is made with the demo's seams spread
 * over the phone's own (its connection, its reads, a cache in memory and a device storage that
 * holds nothing), and its film's player is kept beside it. It is made again, closed first, when its
 * film starts or jumps to a chapter (`restartDemo`): a jump is a fresh store, not one wound back.
 */

import {
  attention,
  createStore,
  type DemoPlayer,
  type Device,
  filmOf,
  isDemo,
  type Store,
  startDemo,
} from "@chipschat/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { openSqliteCache } from "../cache/sqlite";
import { deviceStorage } from "../device/storage";
import { phoneName } from "../pairing/usePairing";
import { letGoOf } from "../spaces/erased";
import { createFileService, type FileService } from "../spaces/files";

/** A workspace's store, and how files are uploaded, fetched and opened for it (M4.4). */
export interface Held {
  readonly store: Store;
  readonly files: FileService;
  /** The film played over the demo's store (ADR 0213): only the demo's device has one. */
  readonly player?: DemoPlayer | undefined;
}

/** Where the demo's next store starts: a film, by its key, and its chapter. */
export interface DemoStartAt {
  readonly film: string;
  /** The chapter, from 0; the film's chapter count is the whole film played (Look around). */
  readonly from: number;
}

/**
 * The first film played to its end at once: the demo as Look around keeps it after any film, and
 * as a launch builds it. A short film's end (Herald offline, say) is that film's, not the demo's.
 */
export function playedWhole(): DemoStartAt {
  const first = filmOf();
  return { film: first.key, from: first.chapters.length };
}

export interface BackgroundWorkspaces {
  /** A store per background workspace, by device id. */
  readonly stores: ReadonlyMap<string, Store>;
  /** How many things wait for the person in each, by device id. */
  readonly needs: Readonly<Record<string, number>>;
  /** How many of those are decisions, by device id: what the app's badge counts. */
  readonly decides: Readonly<Record<string, number>>;
}

/** The stores kept, one a workspace: the provider's, which hands one to the front. */
export interface Stores {
  /** The store kept for a device, made now if there is none yet. */
  readonly take: (device: Device) => Held;
  /** The store kept for a device, if there is one. */
  readonly get: (deviceId: string) => Held | undefined;
  /** Close the store for a device, if there is one. */
  readonly close: (deviceId: string) => void;
  /** Close every store but those for these devices. */
  readonly keepOnly: (wanted: ReadonlySet<string>) => void;
  /**
   * The demo's store closed, and the next made for it started at `at` (ADR 0213): Watch Chips work,
   * a jump on the chapter bar, Watch again.
   */
  readonly restartDemo: (at: DemoStartAt) => void;
}

/** What waits in a workspace: everything, and the decisions among it. */
interface Waiting {
  readonly needs: number;
  readonly decides: number;
}

/**
 * The devices to keep a store for: every one this phone holds, less the muted, and whichever is in
 * front or on its way there, muted or not.
 */
function wantedOf(devices: readonly Device[], front: readonly (string | undefined)[]): Set<string> {
  const wanted = new Set<string>();
  for (const id of front) if (id !== undefined) wanted.add(id);
  for (const device of devices) if (device.muted !== true) wanted.add(device.deviceId);
  return wanted;
}

/**
 * A workspace's store, made: with the phone's own seams, or for the demo's device with the demo's
 * spread over them and its film's player beside it, started at `at`.
 */
function made(device: Device, at: DemoStartAt): Held {
  const files = createFileService(device);
  const own = { device, deviceStorage, openCache: openSqliteCache, onErased: letGoOf };
  if (!isDemo(device)) return { store: createStore(own), files };
  // Named as it would pair: the demo's one device, in You's Devices.
  const demo = startDemo({ film: at.film, from: at.from, deviceName: phoneName() });
  const store = createStore({ ...own, ...demo.storeOptions });
  return { store, files, player: demo.makePlayer() };
}

/** Let a workspace's store go, and its film first, which plays through it. */
function closeHeld(held: Held | undefined): void {
  held?.player?.close();
  held?.store.close();
}

/** The stores, kept while the app is open, and every one closed with it. */
export function useStores(): Stores {
  const kept = useRef(new Map<string, Held>());
  // Where the demo's store starts when it is next made: played whole, unless a film starts it.
  const demoAt = useRef<DemoStartAt>(playedWhole());
  useEffect(() => {
    const held = kept.current;
    return () => {
      for (const one of held.values()) closeHeld(one);
      held.clear();
    };
  }, []);
  return useMemo<Stores>(() => {
    const close = (deviceId: string) => {
      closeHeld(kept.current.get(deviceId));
      kept.current.delete(deviceId);
    };
    return {
      take: (device) => {
        const had = kept.current.get(device.deviceId);
        if (had !== undefined) return had;
        const held = made(device, demoAt.current);
        kept.current.set(device.deviceId, held);
        return held;
      },
      get: (deviceId) => kept.current.get(deviceId),
      close,
      keepOnly: (wanted) => {
        for (const deviceId of [...kept.current.keys()]) if (!wanted.has(deviceId)) close(deviceId);
      },
      restartDemo: (at) => {
        demoAt.current = at;
        for (const deviceId of [...kept.current.keys()]) if (isDemo({ deviceId })) close(deviceId);
      },
    };
  }, []);
}

/**
 * The workspaces behind the one in front, given the stores. `currentId` is the one in front, or on
 * its way there while a switch hands over, and `shownId` the one drawn: neither is behind. Until
 * something is drawn, none is made behind.
 */
export function useWorkspaces(
  stores: Stores,
  devices: readonly Device[],
  currentId: string | undefined,
  shownId: string | undefined,
): BackgroundWorkspaces {
  const [waiting, setWaiting] = useState<Record<string, Waiting>>({});

  useEffect(() => {
    const wanted = wantedOf(devices, [currentId, shownId]);
    // Gone from this phone, or muted: closed. One forgotten is out of `devices` the moment it is.
    stores.keepOnly(wanted);
    const behind =
      shownId === undefined
        ? []
        : devices.filter(
            (device) =>
              wanted.has(device.deviceId) &&
              device.deviceId !== currentId &&
              device.deviceId !== shownId,
          );
    const stops = behind.map((device) =>
      stores.take(device).store.subscribe((snapshot) => {
        const needs = attention(snapshot.model.needsYou, snapshot.readState).length;
        const decides = snapshot.model.needsYou.filter((item) => item.tier === "decide").length;
        setWaiting((was) => {
          const had = was[device.deviceId];
          return had?.needs === needs && had.decides === decides
            ? was
            : { ...was, [device.deviceId]: { needs, decides } };
        });
      }),
    );
    const counted = new Set(behind.map((device) => device.deviceId));
    setWaiting((was) => {
      const still = Object.entries(was).filter(([id]) => counted.has(id));
      return still.length === Object.keys(was).length ? was : Object.fromEntries(still);
    });
    return () => {
      for (const stop of stops) stop();
    };
  }, [stores, devices, currentId, shownId]);

  // One object while nothing changes, so the provider's value is too. Every store behind has a
  // count, from the moment it is listened to.
  return useMemo<BackgroundWorkspaces>(() => {
    const ids = Object.keys(waiting);
    const held = new Map<string, Store>();
    for (const id of ids) {
      const store = stores.get(id)?.store;
      if (store !== undefined) held.set(id, store);
    }
    return {
      stores: held,
      needs: Object.fromEntries(ids.map((id) => [id, waiting[id]?.needs ?? 0])),
      decides: Object.fromEntries(ids.map((id) => [id, waiting[id]?.decides ?? 0])),
    };
  }, [stores, waiting]);
}
