/**
 * The name a device's cache is kept under: a leaf, so the device module can say it without
 * reaching the cache itself and, through it, the model (SEC-32).
 */

import { CATALOGUE_LEVEL } from "@chipschat/protocol";

/**
 * What a device's cache is kept under (SEC-8): its workspace, and the server it was paired with.
 * A workspace id is public — in every event, in mDNS, in an invite's peek — so a cache under the
 * id alone would hand a server that claimed it the device's unsent outbox, and show that server's
 * rooms over the real one's history. A device with no server address is the page's own origin's
 * (the web), which the browser keeps apart by origin already.
 */
export function cacheKey(
  device: { readonly serverUrl?: string | undefined; readonly workspaceId: string },
  level: number = CATALOGUE_LEVEL,
): string {
  const server = (device.serverUrl ?? "").trim();
  // By hand: React Native's URL is a regex, and `host` is all that is wanted of it.
  const host = /^https?:\/\/([^/?#]+)/i.exec(server)?.[1] ?? server;
  const base = server === "" ? device.workspaceId : `${device.workspaceId}@${host.toLowerCase()}`;
  // Kept apart by what the app understands (everything in step): a cache written at a lower level
  // may hold the lines sent in place of events it now understands, so the room is read again.
  return level <= 1 ? base : `${base}~L${level}`;
}

/** The keys this device's cache was kept under at the levels before this one, to forget. */
export function earlierCacheKeys(
  device: { readonly serverUrl?: string | undefined; readonly workspaceId: string },
  level: number = CATALOGUE_LEVEL,
): string[] {
  return Array.from({ length: Math.max(0, level - 1) }, (_, at) => cacheKey(device, at + 1));
}
