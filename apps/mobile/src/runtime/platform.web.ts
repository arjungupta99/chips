/**
 * On the web target none of the phone's three platform seams is in play: the cache is core's
 * IndexedDB one and the device key is a non-extractable `CryptoKey` the page cannot read, which
 * is stronger than anything the phone can arrange. Saying so is better than three ticks that
 * would mean nothing here — and it keeps `expo-sqlite`'s WebAssembly build out of the bundle.
 */

import type { Check, Timing } from "./checks";

export function platformChecks(): Promise<readonly Check[]> {
  return Promise.resolve([
    { name: "Keychain round trip", ok: true, note: "IndexedDB here, not the Keychain" },
    { name: "SQLite round trip", ok: true, note: "IndexedDB here, not SQLite" },
    {
      name: "Native AES-GCM agrees with @chipschat/subtle",
      ok: true,
      note: "the browser's own crypto.subtle here, not either of them",
    },
  ]);
}

/** No native cipher here: the browser's own `crypto.subtle` is what runs. */
export function platformTimings(): Promise<readonly Timing[]> {
  return Promise.resolve([]);
}
