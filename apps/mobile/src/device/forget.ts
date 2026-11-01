/**
 * Forget a device on this phone (SEC-32): its key, then its cache, and — when it was the last one
 * here — every kept file, so the next person with this phone reads nothing of a workspace it is
 * no longer in. Signing out, being removed, and joining elsewhere all end here.
 */

import { type Device, forgetDevice } from "@chipschat/core";
import { deleteSqliteCache } from "../cache/sqlite";
import { clearKept } from "../spaces/local";
import { deviceStorage } from "./storage";

export async function forgetHere(deviceId: string): Promise<Device | undefined> {
  const next = await forgetDevice(deviceId, deviceStorage, { delete: deleteSqliteCache });
  if (next === undefined) {
    try {
      await clearKept();
    } catch {
      // Nothing kept, or nothing to clear it with: the key and the cache are gone either way.
    }
  }
  return next;
}
