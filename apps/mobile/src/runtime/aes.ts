/**
 * AES-GCM in the phone's own cipher (ADR 0152), shaped as `@chipschat/subtle`'s primitive: what seals
 * and opens every frame through the relay. CryptoKit on iOS and `javax.crypto` on Android, in
 * `modules/frame-cipher`, one synchronous call each way.
 *
 * It is a primitive because JavaScript was the bottleneck. On his iPhone `@noble/ciphers` costs
 * about 400 ms a megabyte (ADR 0044), and a clip through the relay paid that with the whole
 * JavaScript thread: the ring, the room and every message behind the clip waited on it. The first
 * native cipher tried, `expo-crypto`'s, was slower than that, 476–556 ms: its seal answers with an
 * object and the bytes come back through a second crossing. This one takes the bytes as
 * `Uint8Array`s and gives one `ArrayBuffer` back, and nothing else crosses.
 *
 * Absent — the web target, or a build from before the module — it is `undefined`, and
 * `@chipschat/subtle` stays in JavaScript. The Runtime screen checks it against the JavaScript cipher
 * byte for byte and times the two side by side (`platform.ts`).
 */

import { requireOptionalNativeModule } from "expo";

/** The module as JavaScript sees it: ciphertext and tag together, as WebCrypto has them. */
interface FrameCipher {
  readonly seal: (
    key: Uint8Array,
    iv: Uint8Array,
    additionalData: Uint8Array,
    plaintext: Uint8Array,
  ) => ArrayBuffer;
  /** Throws when the tag does not match. */
  readonly open: (
    key: Uint8Array,
    iv: Uint8Array,
    additionalData: Uint8Array,
    sealed: Uint8Array,
  ) => ArrayBuffer;
}

const cipher = requireOptionalNativeModule<FrameCipher>("ChipsFrameCipher");

/** The primitive, or `undefined` where the module is not built in. */
export const nativeAesGcm =
  cipher === null
    ? undefined
    : {
        seal: async (
          key: Uint8Array,
          iv: Uint8Array,
          additionalData: Uint8Array,
          plaintext: Uint8Array,
        ): Promise<Uint8Array> => new Uint8Array(cipher.seal(key, iv, additionalData, plaintext)),
        open: async (
          key: Uint8Array,
          iv: Uint8Array,
          additionalData: Uint8Array,
          sealed: Uint8Array,
        ): Promise<Uint8Array> => new Uint8Array(cipher.open(key, iv, additionalData, sealed)),
      };
