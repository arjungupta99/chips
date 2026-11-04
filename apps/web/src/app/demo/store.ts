/**
 * The one branch where the web makes a store (ADR 0213): a paired device's store is made as it
 * always was; the demo's device's is made with the demo's seams spread over the same options, so
 * nothing of the app's own (its socket, IndexedDB, its cache) is used, and with the player that
 * plays the film into it. The front workspace (`App.tsx`) and the ones behind it
 * (`useWorkspaces.ts`) both make theirs here.
 */

import {
  createStore,
  type DemoPlayer,
  type Device,
  FILMS,
  filmOf,
  isDemo,
  type Store,
  startDemo,
} from "@chipschat/core";
import { type Desktop, desktop, inDesktop } from "../../native.ts";
import { browserDeviceName } from "../browserName.ts";

/** What the demo's store is made to play: a film from a chapter, or the film played whole. */
export interface DemoRun {
  /** The film, by its key. */
  readonly film: string;
  /** The chapter it starts at; the film's chapter count is the film played to its end. */
  readonly from: number;
  /** On the stage, playing; or looked around, the film over. */
  readonly playing: boolean;
  /** Counts the starts, so the same chapter asked for again is a fresh store and player. */
  readonly n: number;
}

/** The first film's key: Watch Chips work. */
export const FIRST_FILM = FILMS[0]?.key ?? "watch";

/**
 * The first film played to its end: the demo as Look around keeps it after any film, and as a
 * reload builds it again. A short film's end (Herald offline, say) is that film's, not the demo's.
 */
export function lookedAround(n = 0): DemoRun {
  return { film: FIRST_FILM, from: filmOf(FIRST_FILM).chapters.length, playing: false, n };
}

export interface MadeStore {
  readonly store: Store;
  /** The demo's player, for the demo's device alone. */
  readonly player?: DemoPlayer | undefined;
  /** Closes the store, and the player with it. */
  readonly close: () => void;
}

/**
 * Where the Mac finds a workspace's server on this network now: the shell's Bonjour look, for the
 * transport to try, held to the key the app pinned, once the address it paired at stops answering
 * and nothing else reaches the server. A server whose address the router changed was otherwise
 * never found again; the phone looked, the Mac didn't (the stranger review, 4 November 2026). A
 * browser has no such look, and finds none.
 */
export async function foundAt(
  workspaceId: string,
  shell: Promise<Desktop | undefined> = desktop(),
): Promise<string[]> {
  const mac = await shell.catch(() => undefined);
  const found = (await mac?.discover().catch(() => [])) ?? [];
  return found.filter((server) => server.workspace === workspaceId).map((server) => server.url);
}

export function makeStore(device: Device, run?: DemoRun | undefined): MadeStore {
  // The Mac app opens a room's folder when the person asks from their phone (ADR 0225), and looks
  // for its server on the network when the address it knows stops answering.
  const usual = {
    device,
    folders: inDesktop(),
    ...(inDesktop() ? { findAddresses: (workspaceId: string) => foundAt(workspaceId) } : {}),
  };
  if (!isDemo(device)) {
    const store = createStore(usual);
    return { store, close: () => store.close() };
  }
  const { film, from } = run ?? lookedAround();
  // Named as it would pair (`Pairing.tsx`): the demo's one device, in You's Devices.
  const deviceName = inDesktop() ? "Chips for Mac" : browserDeviceName();
  const start = startDemo({ film, from, deviceName });
  const store = createStore({ ...usual, ...start.storeOptions });
  // Made even for a film played whole: the player is what tells the demo to answer once it ends.
  const player = start.makePlayer();
  return {
    store,
    player,
    close: () => {
      player.close();
      store.close();
    },
  };
}
