/**
 * Noise_NK_25519_AESGCM_SHA256 (ADR 0039).
 *
 * The phone holds the server's static public key from the pairing payload, so the pattern is
 * NK: the initiator knows the responder's key in advance and authenticates it in the first
 * round trip; the initiator itself stays anonymous at this layer, and is authenticated inside
 * the tunnel by the same device signature every request has carried since ADR 0006. Two
 * messages, forty-eight bytes each, and the relay that carries them learns an ephemeral public
 * key and a tag.
 *
 *   -> e, es
 *   <- e, ee
 *
 * AES-GCM and SHA-256 rather than ChaCha and BLAKE2, because WebCrypto has the former in Node
 * and every browser and not the latter; the pattern is otherwise the one in the specification,
 * section by section, and a reader with the specification open can follow this file down it.
 * A transport message is at most 65,535 bytes; the multiplexer above this splits what is
 * larger. Each direction counts its own nonces, so the two ends of a tunnel must encrypt in the
 * order they send and decrypt in the order they receive — which `createTunnel` sees to.
 */

import { type Bytes, bytes, concat, copy, utf8 } from "./bytes.js";
import {
  dh,
  generateKeyPair,
  hmacSha256,
  KEY_BYTES,
  type KeyPair,
  type WebCryptoKey,
} from "./keys.js";

export const NOISE_PROTOCOL = "Noise_NK_25519_AESGCM_SHA256";
/** What both ends mix in before anything else: the tunnel's own name and version. */
export const PROLOGUE = "chips/tunnel/1";

export const MAX_MESSAGE_BYTES = 65_535;
export const TAG_BYTES = 16;
/** The most plaintext one transport message carries. */
export const MAX_PLAINTEXT_BYTES = MAX_MESSAGE_BYTES - TAG_BYTES;
/** Both handshake messages: a public key and the tag of an empty payload. */
export const HANDSHAKE_MESSAGE_BYTES = KEY_BYTES + TAG_BYTES;

/** The nonce the specification reserves; a cipher state at it is finished. */
const MAX_NONCE = 2n ** 64n - 1n;

const subtle = () => globalThis.crypto.subtle;

export class TunnelError extends Error {
  override readonly name: string = "TunnelError";
}

/**
 * The tunnel closed under a request, or before it was asked: the server went (`server_gone`), the
 * phone's network did, the relay let go. Nothing was wrong with the request, and the same request
 * through the next tunnel is answered, so a reader may ask it again there (ADR 0179).
 *
 * `sent` says which. A request the tunnel closed under had gone, and may have been done; one asked
 * of a tunnel closed already went nowhere, so even a write may go through the next.
 */
export class TunnelClosedError extends TunnelError {
  override readonly name: string = "TunnelClosedError";
  /** Why, as the relay or the wire said it; nothing when the tunnel was closed already. */
  readonly reason: string | undefined;
  /** Whether the request had gone into the tunnel when it closed. */
  readonly sent: boolean;
  constructor(reason?: string, options: { readonly sent?: boolean } = {}) {
    super(reason === undefined ? "The tunnel is closed." : `The tunnel closed: ${reason}.`);
    this.reason = reason;
    this.sent = options.sent ?? true;
  }
}

async function sha256(data: Bytes): Promise<Bytes> {
  return new Uint8Array(await subtle().digest("SHA-256", data));
}

/** HKDF as the specification defines it, for two outputs. */
async function hkdf2(chainingKey: Bytes, material: Uint8Array): Promise<[Bytes, Bytes]> {
  const temp = await hmacSha256(chainingKey, material);
  const first = await hmacSha256(temp, new Uint8Array([1]));
  const second = await hmacSha256(temp, concat(first, new Uint8Array([2])));
  return [first, second];
}

/** A key and a nonce that only ever goes up (specification, section 5.1). */
class CipherState {
  private key: WebCryptoKey | undefined;
  private n = 0n;

  async initializeKey(k: Bytes): Promise<void> {
    this.key = await subtle().importKey("raw", k, { name: "AES-GCM" }, false, [
      "encrypt",
      "decrypt",
    ]);
    this.n = 0n;
  }

  /** Ninety-six bits: four zero bytes, then the nonce big-endian (section 12.4). */
  private nextNonce(): Bytes {
    if (this.n >= MAX_NONCE) throw new TunnelError("This tunnel has sent all it can.");
    const iv = bytes(12);
    new DataView(iv.buffer).setBigUint64(4, this.n);
    this.n += 1n;
    return iv;
  }

  async encryptWithAd(ad: Bytes, plaintext: Bytes): Promise<Bytes> {
    if (this.key === undefined) return concat(plaintext);
    const iv = this.nextNonce();
    return new Uint8Array(
      await subtle().encrypt(
        { name: "AES-GCM", iv, additionalData: ad, tagLength: TAG_BYTES * 8 },
        this.key,
        plaintext,
      ),
    );
  }

  async decryptWithAd(ad: Bytes, ciphertext: Bytes): Promise<Bytes> {
    if (this.key === undefined) return concat(ciphertext);
    const iv = this.nextNonce();
    try {
      return new Uint8Array(
        await subtle().decrypt(
          { name: "AES-GCM", iv, additionalData: ad, tagLength: TAG_BYTES * 8 },
          this.key,
          ciphertext,
        ),
      );
    } catch {
      throw new TunnelError("A message did not authenticate.");
    }
  }
}

/** The chaining key, the handshake hash and the cipher state they drive (section 5.2). */
class SymmetricState {
  private constructor(
    private ck: Bytes,
    private h: Bytes,
    private readonly cipher = new CipherState(),
  ) {}

  static async create(protocolName: string): Promise<SymmetricState> {
    const name = utf8(protocolName);
    // A name of thirty-two bytes or fewer is padded with zeros; a longer one is hashed.
    const h =
      name.length <= KEY_BYTES ? concat(name, bytes(KEY_BYTES - name.length)) : await sha256(name);
    return new SymmetricState(h, h);
  }

  get handshakeHash(): Bytes {
    return this.h;
  }

  async mixHash(data: Uint8Array): Promise<void> {
    this.h = await sha256(concat(this.h, data));
  }

  async mixKey(material: Uint8Array): Promise<void> {
    const [ck, tempKey] = await hkdf2(this.ck, material);
    this.ck = ck;
    await this.cipher.initializeKey(tempKey);
  }

  async encryptAndHash(plaintext: Bytes): Promise<Bytes> {
    const ciphertext = await this.cipher.encryptWithAd(this.h, plaintext);
    await this.mixHash(ciphertext);
    return ciphertext;
  }

  async decryptAndHash(ciphertext: Uint8Array): Promise<Bytes> {
    const plaintext = await this.cipher.decryptWithAd(this.h, copy(ciphertext));
    await this.mixHash(ciphertext);
    return plaintext;
  }

  /** Two cipher states, one per direction (section 5.2, `Split`). */
  async split(): Promise<[CipherState, CipherState]> {
    const [first, second] = await hkdf2(this.ck, bytes(0));
    const c1 = new CipherState();
    const c2 = new CipherState();
    await c1.initializeKey(first);
    await c2.initializeKey(second);
    return [c1, c2];
  }
}

/** A finished handshake: encrypt what goes, decrypt what comes, each in order. */
export interface Tunnel {
  readonly encrypt: (plaintext: Uint8Array) => Promise<Bytes>;
  readonly decrypt: (ciphertext: Uint8Array) => Promise<Bytes>;
  /** The handshake hash, which both ends agree on and nothing else does: a channel binding. */
  readonly handshakeHash: Bytes;
}

/**
 * The transport phase. Each direction's calls are chained, so two encryptions started
 * together leave in nonce order, and what arrives in order is decrypted in order.
 */
function transport(sending: CipherState, receiving: CipherState, handshakeHash: Bytes): Tunnel {
  let sends: Promise<unknown> = Promise.resolve();
  let receives: Promise<unknown> = Promise.resolve();
  const empty = bytes(0);
  return {
    handshakeHash,
    encrypt(plaintext) {
      if (plaintext.length > MAX_PLAINTEXT_BYTES) {
        return Promise.reject(new TunnelError("A message is too long for the tunnel."));
      }
      const next = sends.then(() => sending.encryptWithAd(empty, copy(plaintext)));
      sends = next.catch(() => undefined);
      return next;
    },
    decrypt(ciphertext) {
      if (ciphertext.length > MAX_MESSAGE_BYTES || ciphertext.length < TAG_BYTES) {
        return Promise.reject(new TunnelError("A message is not the tunnel's."));
      }
      const next = receives.then(() => receiving.decryptWithAd(empty, copy(ciphertext)));
      receives = next.catch(() => undefined);
      return next;
    },
  };
}

export interface Initiated {
  /** The first message: forty-eight bytes for the responder. */
  readonly message: Bytes;
  /** Read the responder's message. Answers the tunnel, or throws when the server is not the key. */
  readonly complete: (response: Uint8Array) => Promise<Tunnel>;
}

async function opened(prologue: string, responderKey: Uint8Array): Promise<SymmetricState> {
  if (responderKey.length !== KEY_BYTES) throw new TunnelError("That is not a server key.");
  const state = await SymmetricState.create(NOISE_PROTOCOL);
  await state.mixHash(utf8(prologue));
  // The pre-message pattern `<- s`: both sides mix the responder's static key in first.
  await state.mixHash(responderKey);
  return state;
}

/** The phone's side: it knows the server's key and speaks first. */
export async function initiateHandshake(
  serverKey: Uint8Array,
  prologue = PROLOGUE,
): Promise<Initiated> {
  const state = await opened(prologue, serverKey);
  const e = await generateKeyPair();
  // -> e, es
  await state.mixHash(e.publicKey);
  await state.mixKey(await dh(e.privateKey, serverKey));
  const tag = await state.encryptAndHash(bytes(0));
  let done = false;
  return {
    message: concat(e.publicKey, tag),
    async complete(response) {
      if (done) throw new TunnelError("This handshake is finished.");
      done = true;
      if (response.length !== HANDSHAKE_MESSAGE_BYTES) {
        throw new TunnelError("That is not the server's answer.");
      }
      // <- e, ee
      const re = response.subarray(0, KEY_BYTES);
      await state.mixHash(re);
      await state.mixKey(await dh(e.privateKey, re));
      await state.decryptAndHash(response.subarray(KEY_BYTES));
      const [c1, c2] = await state.split();
      return transport(c1, c2, state.handshakeHash);
    },
  };
}

export interface Responded {
  /** The second message: forty-eight bytes for the initiator. */
  readonly message: Bytes;
  readonly tunnel: Tunnel;
}

/** The server's side: it holds the static key the first message was made for. */
export async function respondHandshake(
  ours: KeyPair,
  message: Uint8Array,
  prologue = PROLOGUE,
): Promise<Responded> {
  if (message.length !== HANDSHAKE_MESSAGE_BYTES) {
    throw new TunnelError("That is not a handshake.");
  }
  const state = await opened(prologue, ours.publicKey);
  // -> e, es
  const re = message.subarray(0, KEY_BYTES);
  await state.mixHash(re);
  await state.mixKey(await dh(ours.privateKey, re));
  await state.decryptAndHash(message.subarray(KEY_BYTES));
  // <- e, ee
  const e = await generateKeyPair();
  await state.mixHash(e.publicKey);
  await state.mixKey(await dh(e.privateKey, re));
  const tag = await state.encryptAndHash(bytes(0));
  const [c1, c2] = await state.split();
  return { message: concat(e.publicKey, tag), tunnel: transport(c2, c1, state.handshakeHash) };
}
