/**
 * X25519, Ed25519 and HMAC-SHA-256 in the phone's own crypto (ADR 0277), shaped as
 * `@chipschat/subtle`'s primitives: the tunnel's keys and its handshake, the pairing handshake, and
 * the device signature on every request. CryptoKit on iOS, through `modules/frame-cipher`, one
 * synchronous call each, in the shape of the AES-GCM beside them (`aes.ts`).
 *
 * Speed is not why. Signatures and key agreement cost the phone 4–13 ms in JavaScript, once a
 * request or a tunnel (ADR 0152). It is that the app tells App Store Connect it uses no encryption
 * but the operating system's (`ITSAppUsesNonExemptEncryption` in `app.json`), and with these in
 * CryptoKit that is true of every primitive the iPhone runs: random bytes and SHA-256 come from
 * `expo-crypto`, and the rest from here.
 *
 * Keys cross as the bytes `@chipschat/subtle` keeps, so a device key a phone made in JavaScript
 * before this, kept in the Keychain as PKCS#8, signs natively unchanged: nobody pairs again.
 *
 * Each is `undefined` where its functions are not built in — the web target, Android (whose half
 * of the module is AES-GCM only), a build from before them — and `@chipschat/subtle` stays in
 * JavaScript for it. The Runtime screen says which ran where and holds the native ones against
 * JavaScript (`platform.ts`).
 */

import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

/** The module as JavaScript sees it. A pair is the private key's 32 bytes, then the public's. */
interface Curves {
  readonly x25519Generate: () => ArrayBuffer;
  /** Throws on a peer key of small order, whose shared secret is all zeros. */
  readonly x25519Derive: (privateKey: Uint8Array, publicKey: Uint8Array) => ArrayBuffer;
  readonly ed25519Generate: () => ArrayBuffer;
  readonly ed25519Sign: (privateKey: Uint8Array, data: Uint8Array) => ArrayBuffer;
  readonly ed25519Verify: (
    publicKey: Uint8Array,
    signature: Uint8Array,
    data: Uint8Array,
  ) => boolean;
  readonly hmacSha256Sign: (key: Uint8Array, data: Uint8Array) => ArrayBuffer;
  readonly hmacSha256Verify: (key: Uint8Array, mac: Uint8Array, data: Uint8Array) => boolean;
}

const native = requireOptionalNativeModule<Partial<Curves>>("ChipsFrameCipher");

/** The module, when every one of these functions is in it; a build has all or none of them. */
function built<K extends keyof Curves>(...names: readonly K[]): Pick<Curves, K> | undefined {
  if (native === null) return undefined;
  return names.every((name) => typeof native[name] === "function")
    ? (native as Pick<Curves, K>)
    : undefined;
}

/** `@chipschat/subtle`'s `PairBytes`, over buffers of their own as WebCrypto's callers want them. */
interface Pair {
  readonly secretKey: Uint8Array<ArrayBuffer>;
  readonly publicKey: Uint8Array<ArrayBuffer>;
}

function pairOf(made: ArrayBuffer): Pair {
  const bytes = new Uint8Array(made);
  return { secretKey: bytes.slice(0, 32), publicKey: bytes.slice(32) };
}

/** What runs these, by name, for the Runtime screen. */
export const NATIVE_CRYPTO = Platform.OS === "ios" ? "CryptoKit" : "javax.crypto";

const curve = built("x25519Generate", "x25519Derive");
export const nativeX25519 =
  curve === undefined
    ? undefined
    : {
        generate: async (): Promise<Pair> => pairOf(curve.x25519Generate()),
        derive: async (
          privateKey: Uint8Array,
          publicKey: Uint8Array,
        ): Promise<Uint8Array<ArrayBuffer>> =>
          new Uint8Array(curve.x25519Derive(privateKey, publicKey)),
      };

const signing = built("ed25519Generate", "ed25519Sign", "ed25519Verify");
export const nativeEd25519 =
  signing === undefined
    ? undefined
    : {
        generate: async (): Promise<Pair> => pairOf(signing.ed25519Generate()),
        sign: async (privateKey: Uint8Array, data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> =>
          new Uint8Array(signing.ed25519Sign(privateKey, data)),
        verify: async (
          publicKey: Uint8Array,
          signature: Uint8Array,
          data: Uint8Array,
        ): Promise<boolean> => signing.ed25519Verify(publicKey, signature, data),
      };

const mac = built("hmacSha256Sign", "hmacSha256Verify");
export const nativeHmacSha256 =
  mac === undefined
    ? undefined
    : {
        sign: async (key: Uint8Array, data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> =>
          new Uint8Array(mac.hmacSha256Sign(key, data)),
        verify: async (key: Uint8Array, tag: Uint8Array, data: Uint8Array): Promise<boolean> =>
          mac.hmacSha256Verify(key, tag, data),
      };
