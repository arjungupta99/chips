/**
 * X25519 keys, through WebCrypto: the server's static key, the ephemerals a handshake makes,
 * and the proof a server gives the relay that it holds the key it claims.
 *
 * WebCrypto rather than libsodium, on purpose: the same code runs in Node 22, in a browser and
 * — with the runtime's WebCrypto, or a polyfill of it — on a phone, and it adds nothing to
 * install. The primitives are the ones the Noise pattern names: X25519, AES-GCM, SHA-256.
 */

import {
  type Bytes,
  concat,
  copy,
  fromBase64,
  fromBase64url,
  toBase64,
  toBase64url,
} from "./bytes.js";

export const KEY_BYTES = 32;

const subtle = () => globalThis.crypto.subtle;

/**
 * WebCrypto's key types, taken from the runtime's own `crypto.subtle` rather than named, so this
 * package reads the same under Node's typings and the browser's: whichever declares the global,
 * these are its keys.
 */
type Subtle = typeof globalThis.crypto.subtle;
export type WebCryptoKey = Awaited<ReturnType<Subtle["importKey"]>>;
export type WebCryptoKeyPair = Extract<
  Awaited<ReturnType<Subtle["generateKey"]>>,
  { readonly publicKey: unknown; readonly privateKey: unknown }
>;

export interface KeyPair {
  /** The public half, raw: thirty-two bytes. */
  readonly publicKey: Bytes;
  readonly privateKey: WebCryptoKey;
}

/** A key pair as it is kept: the public half base64url, the private half PKCS#8 as base64. */
export interface StoredKeyPair {
  readonly publicKey: string;
  readonly privateKey: string;
}

export class KeyError extends Error {
  override readonly name = "KeyError";
}

async function exportPublic(key: WebCryptoKey): Promise<Bytes> {
  return new Uint8Array(await subtle().exportKey("raw", key));
}

/** A fresh pair whose private half never leaves the runtime: an ephemeral. */
export async function generateKeyPair(): Promise<KeyPair> {
  const pair = (await subtle().generateKey({ name: "X25519" }, false, [
    "deriveBits",
  ])) as WebCryptoKeyPair;
  return { publicKey: await exportPublic(pair.publicKey), privateKey: pair.privateKey };
}

/** A fresh pair in a form that can be kept: the server's static key, made once. */
export async function generateStoredKeyPair(): Promise<StoredKeyPair> {
  const pair = (await subtle().generateKey({ name: "X25519" }, true, [
    "deriveBits",
  ])) as WebCryptoKeyPair;
  return {
    publicKey: toBase64url(await exportPublic(pair.publicKey)),
    privateKey: toBase64(new Uint8Array(await subtle().exportKey("pkcs8", pair.privateKey))),
  };
}

/** A kept pair, back in use. The private half is imported as one that cannot be exported again. */
export async function importStoredKeyPair(stored: StoredKeyPair): Promise<KeyPair> {
  let privateKey: WebCryptoKey;
  try {
    privateKey = await subtle().importKey(
      "pkcs8",
      fromBase64(stored.privateKey),
      { name: "X25519" },
      false,
      ["deriveBits"],
    );
  } catch {
    throw new KeyError("That is not an X25519 private key.");
  }
  const publicKey = fromBase64url(stored.publicKey);
  if (publicKey.length !== KEY_BYTES) throw new KeyError("That is not an X25519 public key.");
  return { publicKey, privateKey };
}

/** A peer's raw public key, as WebCrypto takes it for a Diffie-Hellman. */
export async function importPublicKey(raw: Uint8Array): Promise<WebCryptoKey> {
  if (raw.length !== KEY_BYTES) throw new KeyError("That is not an X25519 public key.");
  try {
    return await subtle().importKey("raw", copy(raw), { name: "X25519" }, false, []);
  } catch {
    throw new KeyError("That is not an X25519 public key.");
  }
}

/** X25519(private, peer): thirty-two shared bytes. */
export async function dh(privateKey: WebCryptoKey, peerPublic: Uint8Array): Promise<Bytes> {
  const peer = await importPublicKey(peerPublic);
  return new Uint8Array(
    await subtle().deriveBits({ name: "X25519", public: peer }, privateKey, 256),
  );
}

export async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Bytes> {
  const imported = await subtle().importKey(
    "raw",
    copy(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await subtle().sign("HMAC", imported, copy(data)));
}

/**
 * The proof a server gives the relay that the key it claims is its own: an HMAC over the relay's
 * nonce and the key, keyed by X25519 between the server's static key and an ephemeral the relay
 * made for this connection. The relay can compute the same secret from its ephemeral and the
 * claimed public key, and nobody without the static private key can.
 */
export async function proveKey(
  ours: KeyPair,
  nonce: Uint8Array,
  relayEphemeral: Uint8Array,
): Promise<Bytes> {
  const secret = await dh(ours.privateKey, relayEphemeral);
  return hmacSha256(secret, concat(nonce, ours.publicKey));
}

/** The relay's side of `proveKey`. False on a wrong proof, a malformed key, or anything else. */
export async function checkProof(input: {
  readonly claimedKey: Uint8Array;
  readonly ephemeral: KeyPair;
  readonly nonce: Uint8Array;
  readonly proof: Uint8Array;
}): Promise<boolean> {
  try {
    const secret = await dh(input.ephemeral.privateKey, input.claimedKey);
    const expected = await hmacSha256(secret, concat(input.nonce, input.claimedKey));
    if (expected.length !== input.proof.length) return false;
    let difference = 0;
    for (let i = 0; i < expected.length; i += 1) {
      difference |= (expected[i] ?? 0) ^ (input.proof[i] ?? 0);
    }
    return difference === 0;
  } catch {
    return false;
  }
}
