/**
 * The WebCrypto a runtime without one can have.
 *
 * React Native has no `crypto.subtle` (M4.2). Everything Chips asks of WebCrypto is in three
 * files — `packages/tunnel/src/{keys,noise,bytes}.ts` and `packages/core/src/device.ts` — and all
 * of it reaches for `globalThis.crypto`. So rather than change what those files do on a phone,
 * the phone is given a `globalThis.crypto` that answers: X25519 and Ed25519 from `@noble/curves`,
 * AES-GCM from `@noble/ciphers`, SHA-256 and HMAC from `@noble/hashes`.
 *
 * Nothing shared changes shape, and the tunnel's own suite run against this is the proof that it
 * is the same interface (`conformance.test.ts`). Where a runtime has native primitives they are
 * passed in and used — the iPhone passes every one, from `expo-crypto` and CryptoKit (ADRs 0152,
 * 0277); the JavaScript path is what the tests run under Node, and what a runtime falls back to.
 * ADR 0044.
 */

import { createSubtle, type Primitives } from "./subtle.js";

export type { ShimKey } from "./keys.js";
export type { PairBytes, Primitives } from "./subtle.js";

/** Random bytes, from the runtime if it has them and from `Math.random` never. */
function randomFor(
  given: ((out: Uint8Array) => Uint8Array) | undefined,
): (out: Uint8Array) => Uint8Array {
  if (given !== undefined) return given;
  const native = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto);
  if (native !== undefined) return native as (out: Uint8Array) => Uint8Array;
  throw new Error(
    "@chipschat/subtle needs random bytes: pass `random` (expo-crypto's `getRandomValues`) or run somewhere with `crypto.getRandomValues`.",
  );
}

/** A hex UUID v4 from sixteen random bytes, which is all `randomUUID` is. */
function uuidFrom(random: (out: Uint8Array) => Uint8Array): () => string {
  return () => {
    const bytes = random(new Uint8Array(16));
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
}

/** What a runtime may supply itself, natively, faster than JavaScript can. */
export interface RuntimePrimitives extends Primitives {
  readonly random?: ((out: Uint8Array) => Uint8Array) | undefined;
}

/** A `Crypto`: `getRandomValues`, `randomUUID` and the `subtle` above. */
export function createWebCrypto(primitives: RuntimePrimitives = {}): Crypto {
  const random = randomFor(primitives.random);
  const crypto = {
    getRandomValues: <T extends ArrayBufferView>(out: T): T => {
      random(new Uint8Array(out.buffer, out.byteOffset, out.byteLength));
      return out;
    },
    randomUUID: uuidFrom(random),
    subtle: createSubtle(primitives),
  };
  // The one cast in the package: this is the subset of `Crypto` Chips uses, and the DOM's type
  // describes the whole of it. Everything not here throws `NotSupportedError` by name.
  return crypto as unknown as Crypto;
}

/**
 * Put one on `globalThis`, keeping whatever the runtime already had that is better: a native
 * `getRandomValues` is used as it stands, and a runtime that turns out to have a real `subtle`
 * keeps it — this is a fallback, never a replacement for the real thing.
 */
export function installWebCrypto(primitives: RuntimePrimitives = {}): Crypto {
  const existing = globalThis.crypto as Crypto | undefined;
  if (existing?.subtle !== undefined) return existing;
  const made = createWebCrypto({
    ...primitives,
    ...(primitives.random === undefined && existing?.getRandomValues !== undefined
      ? { random: (out: Uint8Array) => existing.getRandomValues(out) }
      : {}),
  });
  Object.defineProperty(globalThis, "crypto", {
    value: made,
    configurable: true,
    writable: true,
  });
  return made;
}
