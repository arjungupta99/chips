/**
 * A person's devices, as You lists them on the phone and on the desktop (ADR 0085): the one in
 * hand first, then the rest by when each was last seen, and those not seen for a month folded
 * under one row. Twelve names in the order they were paired, five of them "This browser" and
 * none with a date, said nothing a person could act on; the one question the list has to answer
 * is *which of these is still mine*.
 *
 * And the kind each is, read from its name, for the mark beside it. A device names itself when
 * it pairs — "iPhone 17 Pro", "Chips for Mac", "Safari on Mac", "chips CLI" — and the server
 * keeps no kind of its own, so the name is what there is to read.
 */

import type { PairedDeviceRecord, Store } from "./store.js";

export type DeviceKind = "phone" | "tablet" | "computer" | "browser" | "terminal" | "other";

/** Not seen for this long, and a device goes under the fold. */
export const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The kind a device's name says it is. A browser before a phone or a computer, since "Safari on
 * iPhone" is a browser that happens to be on one.
 */
export function deviceKind(name: string): DeviceKind {
  if (/\bCLI\b|terminal/i.test(name)) return "terminal";
  if (/browser|Safari|Chrome|Firefox|Edge|Arc\b|Opera|Brave/i.test(name)) return "browser";
  // An iPad was a phone until 16 October 2026, and its own row in Devices wore a handset (ADR 0177).
  if (/iPad|tablet/i.test(name)) return "tablet";
  if (/iPhone|Android|Pixel|Galaxy|sdk_gphone|phone/i.test(name)) return "phone";
  if (/Mac|Windows|Linux|desktop|computer|laptop/i.test(name)) return "computer";
  return "other";
}

/** When a device was last heard from: its last request, or its pairing if it never made one. */
export function lastSeenOf(device: PairedDeviceRecord): string {
  return device.lastSeenAt ?? device.pairedAt;
}

/**
 * The devices still holding a key, in the order You lists them: this one first, then by when
 * each was last seen; and apart from them, those not seen for a month. This one is never stale,
 * whatever its record says — it is the one asking.
 */
export function sortDevices(
  devices: readonly PairedDeviceRecord[],
  now: number,
): {
  readonly recent: readonly PairedDeviceRecord[];
  readonly stale: readonly PairedDeviceRecord[];
} {
  const live = devices
    .filter((each) => each.revokedAt === undefined)
    .sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1;
      return lastSeenOf(b).localeCompare(lastSeenOf(a));
    });
  const stale = (device: PairedDeviceRecord) =>
    !device.current && now - Date.parse(lastSeenOf(device)) > STALE_AFTER_MS;
  return {
    recent: live.filter((each) => !stale(each)),
    stale: live.filter(stale),
  };
}

/** How long Sign out waits for a server it reaches to hear this device's key withdrawn. */
export const SIGN_OUT_WAIT_MS = 3000;

/**
 * This device's own key withdrawn at the server as it signs out, waited for only while it can be
 * heard: not at all while the server is not reached, and `SIGN_OUT_WAIT_MS` at most when it is.
 * The key is forgotten here whatever the server says (ADR 0085), and the request still goes, signed
 * by the key in hand. Waiting on its answer left Sign out doing nothing for a minute or more on a
 * workspace paired by an address the phone cannot reach (his "Demo", 26 October 2026). A server
 * that never hears it refuses the key only once its person withdraws it from another device.
 */
export async function withdrawLeaving(
  store: Pick<Store, "revokeDevice" | "getSnapshot">,
  deviceId: string,
  waitMs = SIGN_OUT_WAIT_MS,
): Promise<void> {
  const answered = store.revokeDevice(deviceId).catch(() => undefined);
  if (store.getSnapshot().connection !== "open") return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waited = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, waitMs);
  });
  await Promise.race([answered, waited]);
  clearTimeout(timer);
}
