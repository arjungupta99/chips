/**
 * The workspaces that are not in front (M5.3): each keeps a store of its own in the background,
 * so the switcher can say how many things each needs and the desktop's menu bar can count them
 * all. A workspace muted on this device gets no store at all: nothing is fetched for a place
 * the person asked not to hear from, and nothing can leak from it into a banner.
 *
 * The demo kept by Look around (ADR 0213) is one of them when another is in front: its store is
 * made over its script, played to its end (`makeStore`), and never reaches a network.
 */

import { attention, type Device, type Store } from "@chipschat/core";
import { useEffect, useRef, useState } from "react";
import { type MadeStore, makeStore } from "./demo/store.ts";

export interface BackgroundWorkspaces {
  /** A store per background workspace, by device id. */
  readonly stores: ReadonlyMap<string, Store>;
  /** How many things each needs a person for, by device id. */
  readonly needs: Readonly<Record<string, number>>;
}

/** The devices to keep a store for: every one but the front, less the muted. */
function wantedOf(devices: readonly Device[], currentId: string): Device[] {
  return devices.filter((device) => device.deviceId !== currentId && device.muted !== true);
}

/** Close what is no longer wanted: now in front, muted, or forgotten. */
function closeUnwanted(
  held: Map<string, MadeStore>,
  stores: Map<string, Store>,
  wanted: readonly Device[],
): void {
  const keep = new Set(wanted.map((device) => device.deviceId));
  for (const [deviceId, made] of held) {
    if (keep.has(deviceId)) continue;
    made.close();
    held.delete(deviceId);
    stores.delete(deviceId);
  }
}

export function useWorkspaces(devices: readonly Device[], currentId: string): BackgroundWorkspaces {
  const made = useRef(new Map<string, MadeStore>());
  const stores = useRef(new Map<string, Store>());
  const [needs, setNeeds] = useState<Record<string, number>>({});

  useEffect(() => {
    const held = made.current;
    const wanted = wantedOf(devices, currentId);
    closeUnwanted(held, stores.current, wanted);
    const stops = wanted.map((device) => {
      const kept = held.get(device.deviceId) ?? makeStore(device);
      held.set(device.deviceId, kept);
      stores.current.set(device.deviceId, kept.store);
      return kept.store.subscribe((snapshot) => {
        const count = attention(snapshot.model.needsYou, snapshot.readState).length;
        setNeeds((was) =>
          was[device.deviceId] === count ? was : { ...was, [device.deviceId]: count },
        );
      });
    });
    const keep = new Set(wanted.map((device) => device.deviceId));
    setNeeds((was) => Object.fromEntries(Object.entries(was).filter(([id]) => keep.has(id))));
    return () => {
      for (const stop of stops) stop();
    };
  }, [devices, currentId]);

  // Every background store closes with the app.
  useEffect(() => {
    const held = made.current;
    const open = stores.current;
    return () => {
      for (const each of held.values()) each.close();
      held.clear();
      open.clear();
    };
  }, []);

  return { stores: stores.current, needs };
}
