/**
 * `crypto.subtle`, in JavaScript, for exactly what Chips asks of it.
 *
 * The surface is the one `packages/tunnel` and `packages/core/src/device.ts` reach for: SHA-256,
 * X25519 (generate, import, export, derive), Ed25519 (generate, import, export, sign, verify),
 * HMAC-SHA-256 and AES-GCM with a caller's nonce and additional data. Everything else throws
 * `NotSupportedError` by name rather than doing something almost right.
 *
 * A runtime that can do a piece of this in native code passes it in as a `Primitives` (see
 * `index.ts`); nothing here changes shape when it does. The iPhone passes all of it: there, every
 * call below that is cryptography is the operating system's, and what is left here is
 * bookkeeping — which key may do what, and the DER prefixes of `der.ts` (ADR 0277).
 */

import { gcm } from "@noble/ciphers/aes.js";
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import type { Curve } from "./der.js";
import { subtleError, unsupported } from "./errors.js";
import {
  bytesOf,
  exportKeyBytes,
  importCurveKey,
  importSecretKey,
  mayBeUsedFor,
  newCurveKeys,
  type ShimKey,
} from "./keys.js";

/** A curve's fresh pair as bytes: the private key (an X25519 scalar, an Ed25519 seed), the public. */
export interface PairBytes {
  readonly secretKey: Uint8Array;
  readonly publicKey: Uint8Array;
}

/**
 * What a runtime may do itself, natively: faster than JavaScript (AES-GCM, ADR 0152), or in the
 * operating system's own crypto rather than the app's (X25519, Ed25519, HMAC, ADR 0277). Every
 * field is optional; the JS path is the default. Keys cross as the bytes `keys.ts` holds, so a key
 * made by one path is used by the other unchanged.
 */
export interface Primitives {
  readonly sha256?: ((data: Uint8Array) => Promise<Uint8Array>) | undefined;
  readonly x25519?:
    | {
        readonly generate: () => Promise<PairBytes>;
        /** Thirty-two bytes. Throws on a peer key that makes them all zero, as WebCrypto does. */
        readonly derive: (privateKey: Uint8Array, publicKey: Uint8Array) => Promise<Uint8Array>;
      }
    | undefined;
  readonly ed25519?:
    | {
        readonly generate: () => Promise<PairBytes>;
        /** Sixty-four bytes; a runtime may randomize them (CryptoKit does), and any verifies. */
        readonly sign: (privateKey: Uint8Array, data: Uint8Array) => Promise<Uint8Array>;
        readonly verify: (
          publicKey: Uint8Array,
          signature: Uint8Array,
          data: Uint8Array,
        ) => Promise<boolean>;
      }
    | undefined;
  readonly hmacSha256?:
    | {
        readonly sign: (key: Uint8Array, data: Uint8Array) => Promise<Uint8Array>;
        /** Compares in constant time. */
        readonly verify: (key: Uint8Array, mac: Uint8Array, data: Uint8Array) => Promise<boolean>;
      }
    | undefined;
  readonly aesGcm?:
    | {
        /** Ciphertext followed by the sixteen-byte tag, as WebCrypto returns it. */
        readonly seal: (
          key: Uint8Array,
          iv: Uint8Array,
          additionalData: Uint8Array,
          plaintext: Uint8Array,
        ) => Promise<Uint8Array>;
        /** Throws on a tag that does not match, as WebCrypto does. */
        readonly open: (
          key: Uint8Array,
          iv: Uint8Array,
          additionalData: Uint8Array,
          sealed: Uint8Array,
        ) => Promise<Uint8Array>;
      }
    | undefined;
}

type Named = { name?: unknown } | string;
type Data = ArrayBuffer | ArrayBufferView;

const EMPTY = new Uint8Array(0);

function nameOf(algorithm: Named): string {
  return typeof algorithm === "string" ? algorithm : String(algorithm.name);
}

function bytes(data: Data): Uint8Array {
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return new Uint8Array(data);
}

/** WebCrypto answers with an `ArrayBuffer`, never a view onto a longer one. */
function buffer(out: Uint8Array): ArrayBuffer {
  return out.slice().buffer as ArrayBuffer;
}

function curveOf(algorithm: Named, what: string): Curve {
  const name = nameOf(algorithm);
  if (name === "X25519" || name === "Ed25519") return name;
  throw unsupported(`${what} with \`${name}\``);
}

/** The subset of `SubtleCrypto` this package implements, before it is cast to the DOM's type. */
export function createSubtle(primitives: Primitives = {}) {
  const digestBytes = async (data: Uint8Array): Promise<Uint8Array> =>
    primitives.sha256 === undefined ? sha256(data) : await primitives.sha256(data);

  const newPair = async (curve: Curve): Promise<PairBytes> => {
    if (curve === "X25519") {
      return primitives.x25519 === undefined ? x25519.keygen() : await primitives.x25519.generate();
    }
    return primitives.ed25519 === undefined
      ? ed25519.keygen()
      : await primitives.ed25519.generate();
  };

  const sharedSecret = async (privateKey: Uint8Array, publicKey: Uint8Array) => {
    try {
      return primitives.x25519 === undefined
        ? x25519.getSharedSecret(privateKey, publicKey)
        : await primitives.x25519.derive(privateKey, publicKey);
    } catch {
      // A peer key of small order makes the secret all zeros, which everybody knows. Both paths
      // refuse it, and WebCrypto calls that an `OperationError`.
      throw subtleError("OperationError", "That public key gives no shared secret.");
    }
  };

  const hmacSign = async (key: Uint8Array, data: Uint8Array): Promise<Uint8Array> =>
    primitives.hmacSha256 === undefined
      ? hmac(sha256, key, data)
      : await primitives.hmacSha256.sign(key, data);

  const ed25519Verify = async (key: Uint8Array, signature: Uint8Array, data: Uint8Array) => {
    try {
      return primitives.ed25519 === undefined
        ? ed25519.verify(signature, data, key)
        : await primitives.ed25519.verify(key, signature, data);
    } catch {
      // A malformed signature is a false, not a throw: that is what WebCrypto answers.
      return false;
    }
  };

  return {
    async digest(algorithm: Named, data: Data): Promise<ArrayBuffer> {
      const name = nameOf(algorithm);
      if (name !== "SHA-256") throw unsupported(`\`${name}\``);
      return buffer(await digestBytes(bytes(data)));
    },

    async generateKey(algorithm: Named, extractable: boolean, usages: readonly string[]) {
      const curve = curveOf(algorithm, "generateKey");
      return newCurveKeys(curve, await newPair(curve), extractable, usages);
    },

    async importKey(
      format: string,
      data: Data,
      algorithm: Named,
      extractable: boolean,
      usages: readonly string[],
    ): Promise<ShimKey> {
      const name = nameOf(algorithm);
      if (name === "AES-GCM" || name === "HMAC") {
        checkSecretImport(format, name, algorithm);
        return importSecretKey(name, bytes(data), extractable, usages);
      }
      return importCurveKey(
        format,
        curveOf(algorithm, "importKey"),
        bytes(data),
        extractable,
        usages,
      );
    },

    async exportKey(format: string, key: ShimKey): Promise<ArrayBuffer> {
      return buffer(exportKeyBytes(format, key));
    },

    async deriveBits(algorithm: Named, key: ShimKey, length: number): Promise<ArrayBuffer> {
      if (nameOf(algorithm) !== "X25519")
        throw unsupported(`deriveBits with \`${nameOf(algorithm)}\``);
      if (length !== 256) {
        throw subtleError(
          "OperationError",
          "X25519 gives 256 bits, and this asked for another number.",
        );
      }
      mayBeUsedFor(key, "deriveBits");
      const peer = (algorithm as { public?: unknown }).public;
      const secret = await sharedSecret(
        bytesOf(key, "X25519", "private"),
        bytesOf(peer, "X25519", "public"),
      );
      return buffer(secret);
    },

    async sign(algorithm: Named, key: ShimKey, data: Data): Promise<ArrayBuffer> {
      mayBeUsedFor(key, "sign");
      const name = nameOf(algorithm);
      if (name === "HMAC")
        return buffer(await hmacSign(bytesOf(key, "HMAC", "secret"), bytes(data)));
      if (name !== "Ed25519") throw unsupported(`sign with \`${name}\``);
      const seed = bytesOf(key, "Ed25519", "private");
      return buffer(
        primitives.ed25519 === undefined
          ? ed25519.sign(bytes(data), seed)
          : await primitives.ed25519.sign(seed, bytes(data)),
      );
    },

    async verify(algorithm: Named, key: ShimKey, signature: Data, data: Data): Promise<boolean> {
      mayBeUsedFor(key, "verify");
      const name = nameOf(algorithm);
      if (name === "HMAC") {
        const secret = bytesOf(key, "HMAC", "secret");
        if (primitives.hmacSha256 !== undefined) {
          return await primitives.hmacSha256.verify(secret, bytes(signature), bytes(data));
        }
        return equal(hmac(sha256, secret, bytes(data)), bytes(signature));
      }
      if (name !== "Ed25519") throw unsupported(`verify with \`${name}\``);
      return await ed25519Verify(bytesOf(key, "Ed25519", "public"), bytes(signature), bytes(data));
    },

    async encrypt(algorithm: Named, key: ShimKey, data: Data): Promise<ArrayBuffer> {
      mayBeUsedFor(key, "encrypt");
      const { secret, iv, aad } = gcmParts(algorithm, key);
      if (primitives.aesGcm !== undefined) {
        return buffer(await primitives.aesGcm.seal(secret, iv, aad, bytes(data)));
      }
      return buffer(gcm(secret, iv, aad).encrypt(bytes(data)));
    },

    async decrypt(algorithm: Named, key: ShimKey, data: Data): Promise<ArrayBuffer> {
      mayBeUsedFor(key, "decrypt");
      const { secret, iv, aad } = gcmParts(algorithm, key);
      try {
        if (primitives.aesGcm !== undefined) {
          return buffer(await primitives.aesGcm.open(secret, iv, aad, bytes(data)));
        }
        return buffer(gcm(secret, iv, aad).decrypt(bytes(data)));
      } catch {
        // WebCrypto says nothing about why: a bad tag and a bad key look the same from outside.
        throw subtleError("OperationError", "That did not decrypt.");
      }
    },
  };
}

/** A secret key comes in raw, and an HMAC one says SHA-256 or says nothing. */
function checkSecretImport(format: string, name: string, algorithm: Named): void {
  if (format !== "raw") throw unsupported(`Importing ${name} as \`${format}\``);
  if (name !== "HMAC") return;
  const hash = (algorithm as { hash?: Named }).hash;
  const hashName = hash === undefined ? "SHA-256" : nameOf(hash);
  if (hashName !== "SHA-256") throw unsupported(`HMAC with \`${hashName}\``);
}

function gcmParts(
  algorithm: Named,
  key: ShimKey,
): { secret: Uint8Array; iv: Uint8Array; aad: Uint8Array } {
  const name = nameOf(algorithm);
  if (name !== "AES-GCM") throw unsupported(`\`${name}\``);
  const options = algorithm as { iv?: Data; additionalData?: Data; tagLength?: number };
  if (options.iv === undefined) throw subtleError("OperationError", "AES-GCM needs an `iv`.");
  if (options.tagLength !== undefined && options.tagLength !== 128) {
    throw unsupported(`An AES-GCM tag of ${options.tagLength} bits`);
  }
  return {
    secret: bytesOf(key, "AES-GCM", "secret"),
    iv: bytes(options.iv),
    aad: options.additionalData === undefined ? EMPTY : bytes(options.additionalData),
  };
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}
