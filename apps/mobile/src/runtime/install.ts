/**
 * The phone's `globalThis.crypto`, installed before anything of ours loads.
 *
 * React Native has no `crypto.subtle`, and `@chipschat/tunnel` and `@chipschat/core` reach for it as
 * they load — the tunnel's keys, the device signature, the pairing handshake. ADR 0044 is the
 * answer: `@chipschat/subtle` is that subset in JavaScript, and this hands it every primitive the
 * phone has natively. Random bytes and SHA-256 (a megabyte digests in a third of a millisecond)
 * come from `expo-crypto`. AES-GCM, which seals and opens every frame through the relay, comes
 * from the phone's own cipher through `modules/frame-cipher` (ADR 0152, `aes.ts`): `expo-crypto`'s
 * was slower than ours across its bridge, and this one is not. X25519, Ed25519 and HMAC-SHA-256
 * come from the same module (ADR 0277, `native.ts`), so that on an iPhone every one of them is
 * Apple's operating system's, as the app tells App Store Connect.
 *
 * `installWebCrypto` leaves a real `subtle` alone, so this is a fallback and never a
 * replacement. `usingShim` says which happened, because "the phone had its own" and "the phone
 * has ours" are different facts and the Runtime screen reports the one that is true.
 */

import { installWebCrypto } from "@chipschat/subtle";
import * as ExpoCrypto from "expo-crypto";
import { nativeAesGcm } from "./aes";
import { NATIVE_CRYPTO, nativeEd25519, nativeHmacSha256, nativeX25519 } from "./native";

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
    aesGcm: nativeAesGcm,
    x25519: nativeX25519,
    ed25519: nativeEd25519,
    hmacSha256: nativeHmacSha256,
  });
  shimmed = before === undefined;
  return installedCrypto;
}

/** True when `@chipschat/subtle` is what `crypto.subtle` is — the expected answer on a phone. */
export function usingShim(): boolean {
  installRuntime();
  return shimmed;
}

/** One primitive under `@chipschat/subtle`, and what runs it: native code, or JavaScript. */
export interface Primitive {
  readonly name: string;
  /** What runs it natively, by name, or `undefined` when `@chipschat/subtle` runs it itself. */
  readonly native: string | undefined;
}

/** Each primitive `crypto.subtle` is made of on this phone, and where it runs (ADR 0277). */
export function primitives(): readonly Primitive[] {
  const own = (given: unknown) => (given === undefined ? undefined : NATIVE_CRYPTO);
  return [
    { name: "Random bytes", native: "expo-crypto" },
    { name: "SHA-256", native: "expo-crypto" },
    { name: "AES-GCM", native: own(nativeAesGcm) },
    { name: "X25519", native: own(nativeX25519) },
    { name: "Ed25519", native: own(nativeEd25519) },
    { name: "HMAC-SHA-256", native: own(nativeHmacSha256) },
  ];
}
