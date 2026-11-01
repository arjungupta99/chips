/**
 * Look around, remembered (ADR 0213, point 7): a word in this browser's own storage, never a
 * device in IndexedDB, where one key that fails to load empties the whole list of workspaces. At
 * the next launch the demo is built again from the script, played to its end, and put where it
 * was: in front, or behind the workspace that was.
 *
 * Storage that will not open (a private window, cleared site data) keeps nothing, and the demo is
 * simply not there at the next launch.
 */

import { type Device, demoDevice } from "@chipschat/core";

const KEY = "chips.demo";

/** Where the demo stood when it was last kept: in front, or behind another workspace. */
export type KeptDemo = "front" | "behind";

/** The demo as it was kept, or nothing when it was never kept or has been removed. */
export function keptDemo(): KeptDemo | undefined {
  try {
    const word = globalThis.localStorage?.getItem(KEY);
    return word === "front" || word === "behind" ? word : undefined;
  } catch {
    return undefined;
  }
}

/** The demo at launch, as the app is handed it: built again when it was kept, and where it stood. */
export interface DemoAtLaunch {
  readonly device: Device;
  readonly front: boolean;
}

/**
 * The demo Look around kept, built again for this launch: a device made in memory, never read
 * from where the device keeps its workspaces. Nothing when it was not kept, or when this browser
 * cannot make a key in memory.
 */
export async function demoAtLaunch(): Promise<DemoAtLaunch | undefined> {
  const kept = keptDemo();
  if (kept === undefined) return undefined;
  try {
    return { device: await demoDevice(), front: kept === "front" };
  } catch {
    return undefined;
  }
}

/** Keep the demo where it stands now, or forget it (`undefined`): Remove. */
export function keepDemo(where: KeptDemo | undefined): void {
  try {
    if (where === undefined) globalThis.localStorage?.removeItem(KEY);
    else globalThis.localStorage?.setItem(KEY, where);
  } catch {
    // Nothing kept: the demo goes with the page.
  }
}
