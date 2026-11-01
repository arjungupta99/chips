/**
 * The phone's `globalThis.crypto`, installed before anything of ours loads.
 *
 * React Native has no `crypto.subtle`, and `@chipschat/tunnel` and `@chipschat/core` reach for it as
 * they load — the tunnel's keys, the device signature, the pairing handshake. ADR 0044 is the
 * answer: `@chipschat/subtle` is that subset in JavaScript, and this hands it the three things the
 * phone does better natively — random bytes, SHA-256 (a megabyte digests in a third of a
 * millisecond) and AES-GCM, which seals and opens every frame through the relay (ADR 0152,
 * `aes.ts`). `expo-crypto`'s AES-GCM was slower than ours across its bridge; the phone's own
 * cipher, called through `modules/frame-cipher`, is not.
 *
 * `installWebCrypto` leaves a real `subtle` alone, so this is a fallback and never a
 * replacement. `usingShim` says which happened, because "the phone had its own" and "the phone
 * has ours" are different facts and the Runtime screen reports the one that is true.
 */

import { installWebCrypto } from "@chipschat/subtle";
import * as ExpoCrypto from "expo-crypto";
import { nativeAesGcm } from "./aes";

let installedCrypto: Crypto | undefined;
let shimmed = false;

export function installRuntime(): Crypto {
  if (installedCrypto !== undefined) return installedCrypto;
  const before = (globalThis.crypto as Crypto | undefined)?.subtle;
  installedCrypto = installWebCrypto({
    random: (out) => ExpoCrypto.getRandomValues(out),
    sha256: async (data) =>
      // `digest` takes a `BufferSource`, which is a view over an `ArrayBuffer`; the view handed
      // in is typed over `ArrayBufferLike`, whose only other member is `SharedArrayBuffer` —
      // which React Native does not have. Copying a megabyte to satisfy the type is the worse
      // answer on the path this exists to make faster.
      new Uint8Array(
        await ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data as BufferSource),
      ),
    ...(nativeAesGcm === undefined ? {} : { aesGcm: nativeAesGcm }),
  });
  shimmed = before === undefined;
  return installedCrypto;
}

/** True when `@chipschat/subtle` is what `crypto.subtle` is — the expected answer on a phone. */
export function usingShim(): boolean {
  installRuntime();
  return shimmed;
}
