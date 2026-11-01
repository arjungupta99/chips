/**
 * The keys this `subtle` hands out, and the bytes behind them.
 *
 * A `CryptoKey` is a handle: what a caller holds says what the key is for and whether it may be
 * exported, and the bytes themselves are only reachable from inside. That is what the `WeakMap`
 * below is — the nearest a JavaScript implementation gets to a key the caller cannot read. The
 * honest statement is in ADR 0044: on a phone the bytes are in JavaScript memory while a request
 * is signed, and hardware-bound keys need a native module.
 */

import { type Curve, fromPkcs8, fromSpki, KEY_BYTES, toPkcs8, toSpki } from "./der.js";
import { subtleError, unsupported } from "./errors.js";

export type KeyKind = Curve | "AES-GCM" | "HMAC";
export type KeyType = "public" | "private" | "secret";

/** What a key is made of, kept where only this module can reach it. */
interface Held {
  readonly kind: KeyKind;
  readonly type: KeyType;
  readonly bytes: Uint8Array;
}

/** The handle a caller holds. Shaped as WebCrypto's `CryptoKey`, and frozen. */
export interface ShimKey {
  readonly type: KeyType;
  readonly extractable: boolean;
  readonly algorithm: { readonly name: string; readonly hash?: { readonly name: string } };
  readonly usages: readonly string[];
}

const held = new WeakMap<object, Held>();

function make(what: Held, extractable: boolean, usages: readonly string[]): ShimKey {
  const algorithm =
    what.kind === "HMAC"
      ? { name: "HMAC", hash: { name: "SHA-256" } }
      : { name: what.kind as string };
  const key: ShimKey = Object.freeze({
    type: what.type,
    extractable,
    algorithm: Object.freeze(algorithm),
    usages: Object.freeze([...usages]),
  });
  held.set(key, what);
  return key;
}

/** The bytes behind a key of this kind, or a refusal that names what was passed instead. */
export function bytesOf(key: unknown, kind: KeyKind, type: KeyType): Uint8Array {
  const what = typeof key === "object" && key !== null ? held.get(key) : undefined;
  if (what === undefined) throw subtleError("InvalidAccessError", "That is not a key of ours.");
  if (what.kind !== kind || what.type !== type) {
    throw subtleError(
      "InvalidAccessError",
      `That is a ${what.type} ${what.kind} key, and this wants a ${type} ${kind} one.`,
    );
  }
  return what.bytes;
}

/** Whether the key is allowed to do this. WebCrypto checks it, so this does. */
export function mayBeUsedFor(key: unknown, usage: string): void {
  const handle = key as ShimKey | undefined;
  if (handle?.usages?.includes(usage) !== true) {
    throw subtleError("InvalidAccessError", `That key was not made for \`${usage}\`.`);
  }
}

export function newCurveKeys(
  curve: Curve,
  pair: { readonly secretKey: Uint8Array; readonly publicKey: Uint8Array },
  extractable: boolean,
  usages: readonly string[],
): { privateKey: ShimKey; publicKey: ShimKey } {
  const forPrivate = usages.filter((usage) => usage !== "verify");
  const forPublic = usages.filter((usage) => usage === "verify");
  return {
    privateKey: make(
      { kind: curve, type: "private", bytes: pair.secretKey },
      extractable,
      forPrivate,
    ),
    // A public key is always extractable: there is nothing in it to keep.
    publicKey: make({ kind: curve, type: "public", bytes: pair.publicKey }, true, forPublic),
  };
}

export function importCurveKey(
  format: string,
  curve: Curve,
  data: Uint8Array,
  extractable: boolean,
  usages: readonly string[],
): ShimKey {
  if (format === "pkcs8") {
    return make(
      { kind: curve, type: "private", bytes: fromPkcs8(curve, data) },
      extractable,
      usages,
    );
  }
  if (format === "spki") {
    return make({ kind: curve, type: "public", bytes: fromSpki(curve, data) }, true, usages);
  }
  if (format === "raw") {
    if (data.length !== KEY_BYTES) {
      throw subtleError("DataError", `A raw ${curve} public key is ${KEY_BYTES} bytes.`);
    }
    return make({ kind: curve, type: "public", bytes: data.slice() }, true, usages);
  }
  throw unsupported(`Importing ${curve} as \`${format}\``);
}

export function importSecretKey(
  kind: "AES-GCM" | "HMAC",
  data: Uint8Array,
  extractable: boolean,
  usages: readonly string[],
): ShimKey {
  if (kind === "AES-GCM" && data.length !== 16 && data.length !== 32) {
    throw subtleError("DataError", "An AES-GCM key is 16 or 32 bytes.");
  }
  return make({ kind, type: "secret", bytes: data.slice() }, extractable, usages);
}

/** `exportKey`, for the formats each kind of key has. A key that said so cannot be exported. */
export function exportKeyBytes(format: string, key: unknown): Uint8Array {
  const what = typeof key === "object" && key !== null ? held.get(key) : undefined;
  if (what === undefined) throw subtleError("InvalidAccessError", "That is not a key of ours.");
  if ((key as ShimKey).extractable !== true) {
    throw subtleError("InvalidAccessError", "That key was made so that it cannot be exported.");
  }
  if (what.kind === "AES-GCM" || what.kind === "HMAC") {
    if (format === "raw") return what.bytes.slice();
    throw unsupported(`Exporting a ${what.kind} key as \`${format}\``);
  }
  return exportCurveKey(format, what as Held & { kind: Curve });
}

function exportCurveKey(format: string, what: Held & { kind: Curve }): Uint8Array {
  if (what.type === "public") {
    if (format === "raw") return what.bytes.slice();
    if (format === "spki") return toSpki(what.kind, what.bytes);
  } else if (format === "pkcs8") {
    return toPkcs8(what.kind, what.bytes);
  }
  throw unsupported(`Exporting a ${what.type} ${what.kind} key as \`${format}\``);
}
