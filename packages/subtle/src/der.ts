/**
 * The few bytes of ASN.1 that stand between a raw key and the formats WebCrypto names.
 *
 * X25519 and Ed25519 keys are thirty-two bytes each way. `spki` and `pkcs8` wrap them in a
 * fixed prefix and nothing else (RFC 8410), so this is a prefix to write and a prefix to check,
 * not a DER parser. The bytes below are what Node's own WebCrypto produces, which is what
 * `interop.test.ts` asserts.
 */

import { subtleError } from "./errors.js";

export type Curve = "X25519" | "Ed25519";

export const KEY_BYTES = 32;

function hex(text: string): Uint8Array {
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i += 1)
    out[i] = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const PREFIXES: Readonly<Record<Curve, { spki: Uint8Array; pkcs8: Uint8Array }>> = {
  Ed25519: {
    spki: hex("302a300506032b6570032100"),
    pkcs8: hex("302e020100300506032b657004220420"),
  },
  X25519: {
    spki: hex("302a300506032b656e032100"),
    pkcs8: hex("302e020100300506032b656e04220420"),
  },
};

function wrap(prefix: Uint8Array, raw: Uint8Array): Uint8Array {
  const out = new Uint8Array(prefix.length + raw.length);
  out.set(prefix, 0);
  out.set(raw, prefix.length);
  return out;
}

/** The public half, as `spki`. */
export function toSpki(curve: Curve, raw: Uint8Array): Uint8Array {
  return wrap(PREFIXES[curve].spki, raw);
}

/** The private half, as `pkcs8`. For both curves that is the thirty-two-byte seed. */
export function toPkcs8(curve: Curve, raw: Uint8Array): Uint8Array {
  return wrap(PREFIXES[curve].pkcs8, raw);
}

function unwrap(prefix: Uint8Array, data: Uint8Array, what: string): Uint8Array {
  if (data.length !== prefix.length + KEY_BYTES) {
    throw subtleError("DataError", `That is not ${what}: it is ${data.length} bytes.`);
  }
  for (let i = 0; i < prefix.length; i += 1) {
    if (data[i] !== prefix[i]) throw subtleError("DataError", `That is not ${what}.`);
  }
  return data.slice(prefix.length);
}

export function fromSpki(curve: Curve, data: Uint8Array): Uint8Array {
  return unwrap(PREFIXES[curve].spki, data, `an ${curve} public key in spki`);
}

export function fromPkcs8(curve: Curve, data: Uint8Array): Uint8Array {
  return unwrap(PREFIXES[curve].pkcs8, data, `an ${curve} private key in pkcs8`);
}
