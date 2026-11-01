/**
 * WebAuthn, the parts a home server needs (ADR 0034, decision 5).
 *
 * A passkey is a public key the browser's authenticator made, sent as an attestation object
 * when it is registered and used to sign a challenge when a person signs in. This file turns
 * those wire shapes into something `node:crypto` can verify — a small CBOR decoder for the
 * attestation object and the COSE key inside it, the authenticator data's fixed layout, the
 * client data's JSON — and checks what the specification says to check: the challenge, the
 * origin, the relying-party id hash, user presence, the signature, and the counter.
 *
 * The attestation statement is deliberately ignored. Attestation says which make of
 * authenticator made the key, which a home server has no list to check against and no reason
 * to refuse; the key itself is what matters, and it is verified on every sign-in.
 *
 * No dependency: the wire shapes are short and fixed, and this is the kind of file a reviewer
 * wants to read in one sitting.
 */

import { createHash, createPublicKey, type JsonWebKey, timingSafeEqual, verify } from "node:crypto";
import type { PasskeyJwk } from "../../application/ports/webauthn.js";

export class WebAuthnError extends Error {
  override readonly name = "WebAuthnError";
}

// ------------------------------------------------------------------- base64url

export function fromBase64url(value: string): Buffer {
  const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised + "=".repeat((4 - (normalised.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

export function toBase64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

// ------------------------------------------------------------------------ CBOR

/**
 * RFC 8949, the definite-length subset an attestation object uses: integers, byte and text
 * strings, arrays, maps, tags (dropped) and the simple values. A map decodes to a `Map`, since
 * a COSE key's labels are negative integers.
 */
class CborReader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}

  get remaining(): number {
    return this.bytes.length - this.offset;
  }

  private byte(): number {
    const value = this.bytes[this.offset];
    if (value === undefined) throw new WebAuthnError("CBOR ended early");
    this.offset += 1;
    return value;
  }

  private take(length: number): Uint8Array {
    if (this.offset + length > this.bytes.length) throw new WebAuthnError("CBOR ended early");
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  /** The argument of a head byte: the count, length or value the low five bits describe. */
  private argument(info: number): number {
    if (info < 24) return info;
    if (info === 24) return this.byte();
    if (info === 25) return (this.byte() << 8) | this.byte();
    if (info === 26) {
      return ((this.byte() << 24) >>> 0) + (this.byte() << 16) + (this.byte() << 8) + this.byte();
    }
    if (info === 27) {
      let value = 0n;
      for (let i = 0; i < 8; i += 1) value = (value << 8n) | BigInt(this.byte());
      if (value > BigInt(Number.MAX_SAFE_INTEGER))
        throw new WebAuthnError("CBOR integer too large");
      return Number(value);
    }
    throw new WebAuthnError("CBOR indefinite lengths are not used here");
  }

  read(): unknown {
    const head = this.byte();
    const major = head >> 5;
    const info = head & 0x1f;
    switch (major) {
      case 0:
        return this.argument(info);
      case 1:
        return -1 - this.argument(info);
      case 2:
        return this.take(this.argument(info));
      case 3:
        return Buffer.from(this.take(this.argument(info))).toString("utf8");
      case 4: {
        const length = this.argument(info);
        const items: unknown[] = [];
        for (let i = 0; i < length; i += 1) items.push(this.read());
        return items;
      }
      case 5: {
        const length = this.argument(info);
        const map = new Map<unknown, unknown>();
        for (let i = 0; i < length; i += 1) {
          const key = this.read();
          map.set(key, this.read());
        }
        return map;
      }
      case 6:
        this.argument(info);
        return this.read();
      default:
        return this.simple(info);
    }
  }

  private simple(info: number): unknown {
    switch (info) {
      case 20:
        return false;
      case 21:
        return true;
      case 22:
        return null;
      case 23:
        return undefined;
      case 25:
        return halfFloat((this.byte() << 8) | this.byte());
      case 26:
        return view(this.take(4)).getFloat32(0);
      case 27:
        return view(this.take(8)).getFloat64(0);
      default:
        throw new WebAuthnError("CBOR simple value not understood");
    }
  }
}

/**
 * A view over exactly these bytes. Not `bytes.slice().buffer`: under Node a `Buffer`'s `slice`
 * shares memory with the pool it was cut from, and a view over that pool from offset zero reads
 * somebody else's bytes.
 */
function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function halfFloat(half: number): number {
  const sign = half & 0x80_00 ? -1 : 1;
  const exponent = (half >> 10) & 0x1f;
  const fraction = half & 0x3_ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 0x1f) return fraction === 0 ? sign * Number.POSITIVE_INFINITY : Number.NaN;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

/** Decode one CBOR item, and say how many bytes followed it. */
export function decodeCbor(bytes: Uint8Array): { value: unknown; rest: number } {
  const reader = new CborReader(bytes);
  const value = reader.read();
  return { value, rest: reader.remaining };
}

// ----------------------------------------------------------------- client data

export interface ClientData {
  readonly type: string;
  readonly challenge: string;
  readonly origin: string;
}

export function parseClientData(clientDataJSON: Uint8Array): ClientData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(clientDataJSON).toString("utf8"));
  } catch {
    throw new WebAuthnError("client data is not JSON");
  }
  const data = parsed as Record<string, unknown>;
  const { type, challenge, origin } = data;
  if (typeof type !== "string" || typeof challenge !== "string" || typeof origin !== "string") {
    throw new WebAuthnError("client data lacks a type, a challenge or an origin");
  }
  return { type, challenge, origin };
}

// ---------------------------------------------------------- authenticator data

export interface AuthenticatorData {
  readonly rpIdHash: Uint8Array;
  readonly userPresent: boolean;
  readonly userVerified: boolean;
  readonly signCount: number;
  /** The new credential, when the data carries one (a registration). */
  readonly credential?:
    | { readonly credentialId: Uint8Array; readonly publicKey: Map<unknown, unknown> }
    | undefined;
}

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_AT = 0x40;

export function parseAuthenticatorData(bytes: Uint8Array): AuthenticatorData {
  if (bytes.length < 37) throw new WebAuthnError("authenticator data is too short");
  const flags = bytes[32] ?? 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const base: AuthenticatorData = {
    rpIdHash: bytes.subarray(0, 32),
    userPresent: (flags & FLAG_UP) !== 0,
    userVerified: (flags & FLAG_UV) !== 0,
    signCount: view.getUint32(33),
  };
  if ((flags & FLAG_AT) === 0) return base;
  if (bytes.length < 55) throw new WebAuthnError("attested credential data is too short");
  const idLength = view.getUint16(53);
  const idEnd = 55 + idLength;
  if (bytes.length < idEnd) throw new WebAuthnError("credential id runs past the data");
  const { value } = decodeCbor(bytes.subarray(idEnd));
  if (!(value instanceof Map))
    throw new WebAuthnError("the credential's public key is not a COSE key");
  return { ...base, credential: { credentialId: bytes.subarray(55, idEnd), publicKey: value } };
}

// ------------------------------------------------------------------- COSE keys

export interface PasskeyPublicKey {
  /** A JWK, which is what `node:crypto` loads. */
  readonly jwk: PasskeyJwk;
  /** The COSE algorithm: -7 ES256, -8 EdDSA, -257 RS256. */
  readonly algorithm: number;
}

function loadKey(jwk: PasskeyJwk) {
  return createPublicKey({ key: jwk as JsonWebKey, format: "jwk" });
}

const ES256 = -7;
const EDDSA = -8;
const RS256 = -257;

function bytesAt(map: Map<unknown, unknown>, label: number): Uint8Array {
  const value = map.get(label);
  if (!(value instanceof Uint8Array)) throw new WebAuthnError(`COSE key lacks label ${label}`);
  return value;
}

/** The three key types a browser's authenticator produces, as JWKs. Anything else is refused. */
export function coseToPublicKey(map: Map<unknown, unknown>): PasskeyPublicKey {
  const kty = map.get(1);
  const alg = map.get(3);
  if (kty === 1 && (alg === undefined || alg === EDDSA) && map.get(-1) === 6) {
    return {
      jwk: { kty: "OKP", crv: "Ed25519", x: toBase64url(bytesAt(map, -2)) },
      algorithm: EDDSA,
    };
  }
  if (kty === 2 && (alg === undefined || alg === ES256) && map.get(-1) === 1) {
    return {
      jwk: {
        kty: "EC",
        crv: "P-256",
        x: toBase64url(bytesAt(map, -2)),
        y: toBase64url(bytesAt(map, -3)),
      },
      algorithm: ES256,
    };
  }
  if (kty === 3 && (alg === undefined || alg === RS256)) {
    return {
      jwk: { kty: "RSA", n: toBase64url(bytesAt(map, -1)), e: toBase64url(bytesAt(map, -2)) },
      algorithm: RS256,
    };
  }
  throw new WebAuthnError("the passkey's algorithm is not one this server accepts");
}

// ------------------------------------------------------------------ the checks

export interface VerifyOptions {
  /** The challenge that was issued, base64url, as the client data must echo it. */
  readonly challenge: string;
  /** The origins a passkey may be used from, besides loopback. */
  readonly origins: readonly string[];
  /** The relying-party id. Absent, the hostname of the origin the client reported. */
  readonly rpId?: string | undefined;
}

export interface RegistrationResponse {
  readonly id: string;
  readonly response: {
    readonly clientDataJSON: string;
    readonly attestationObject: string;
    readonly transports?: readonly string[] | undefined;
  };
}

export interface RegisteredPasskey extends PasskeyPublicKey {
  readonly credentialId: string;
  readonly signCount: number;
  readonly transports: readonly string[];
  readonly userVerified: boolean;
}

export interface AssertionResponse {
  readonly id: string;
  readonly response: {
    readonly clientDataJSON: string;
    readonly authenticatorData: string;
    readonly signature: string;
    readonly userHandle?: string | null | undefined;
  };
}

type Verified<T> = { ok: true; value: T } | { ok: false; reason: string };

/** Loopback is always its own origin: a passkey made on the server's own machine is fine. */
export function originAllowed(origin: string, allowed: readonly string[]): boolean {
  if (allowed.includes(origin)) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

function sameChallenge(expected: string, echoed: string): boolean {
  const a = fromBase64url(expected);
  const b = fromBase64url(echoed);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sha256(bytes: Uint8Array): Buffer {
  return createHash("sha256").update(bytes).digest();
}

/** The client data and authenticator data checks the two flows share. */
function checkCommon(
  clientDataJSON: Uint8Array,
  authData: AuthenticatorData,
  type: string,
  options: VerifyOptions,
): string | undefined {
  const client = parseClientData(clientDataJSON);
  if (client.type !== type) return `client data type is ${client.type}, not ${type}`;
  if (!sameChallenge(options.challenge, client.challenge)) return "the challenge does not match";
  if (!originAllowed(client.origin, options.origins))
    return `origin ${client.origin} is not allowed`;
  const rpId = options.rpId ?? new URL(client.origin).hostname;
  const expected = sha256(Buffer.from(rpId, "utf8"));
  if (!timingSafeEqual(expected, Buffer.from(authData.rpIdHash))) {
    return "the relying-party id does not match";
  }
  if (!authData.userPresent) return "the authenticator did not check for a person";
  return undefined;
}

/**
 * A new passkey: the browser's `PublicKeyCredential` from `navigator.credentials.create()`,
 * as its JSON form. What comes back is what the registry stores.
 */
export function verifyRegistration(
  input: RegistrationResponse,
  options: VerifyOptions,
): Verified<RegisteredPasskey> {
  try {
    const clientDataJSON = fromBase64url(input.response.clientDataJSON);
    const { value: attestation } = decodeCbor(fromBase64url(input.response.attestationObject));
    if (!(attestation instanceof Map)) return { ok: false, reason: "attestation is not a map" };
    const raw = attestation.get("authData");
    if (!(raw instanceof Uint8Array)) return { ok: false, reason: "attestation has no authData" };
    const authData = parseAuthenticatorData(raw);
    const common = checkCommon(clientDataJSON, authData, "webauthn.create", options);
    if (common !== undefined) return { ok: false, reason: common };
    if (authData.credential === undefined) return { ok: false, reason: "no credential attested" };
    const credentialId = toBase64url(authData.credential.credentialId);
    if (credentialId !== input.id) return { ok: false, reason: "the credential id does not match" };
    const key = coseToPublicKey(authData.credential.publicKey);
    // Load it once now, so a key the registry holds is one `node:crypto` can use later.
    loadKey(key.jwk);
    return {
      ok: true,
      value: {
        ...key,
        credentialId,
        signCount: authData.signCount,
        transports: [...(input.response.transports ?? [])],
        userVerified: authData.userVerified,
      },
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * A sign-in: the assertion from `navigator.credentials.get()`, checked against the key the
 * registry holds. The signature covers the authenticator data and the hash of the client data;
 * the counter must move forward when the authenticator keeps one, or a cloned key is in play.
 */
export function verifyAssertion(
  input: AssertionResponse,
  options: VerifyOptions & { readonly key: PasskeyPublicKey; readonly signCount: number },
): Verified<{ signCount: number; userVerified: boolean }> {
  try {
    const clientDataJSON = fromBase64url(input.response.clientDataJSON);
    const raw = fromBase64url(input.response.authenticatorData);
    const authData = parseAuthenticatorData(raw);
    const common = checkCommon(clientDataJSON, authData, "webauthn.get", options);
    if (common !== undefined) return { ok: false, reason: common };
    const signed = Buffer.concat([raw, sha256(clientDataJSON)]);
    const signature = fromBase64url(input.response.signature);
    if (!verifiesWith(options.key, signed, signature)) {
      return { ok: false, reason: "the signature does not verify" };
    }
    if (authData.signCount !== 0 || options.signCount !== 0) {
      if (authData.signCount <= options.signCount) {
        return { ok: false, reason: "the sign counter went backwards: a cloned key" };
      }
    }
    return {
      ok: true,
      value: { signCount: authData.signCount, userVerified: authData.userVerified },
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

function verifiesWith(key: PasskeyPublicKey, data: Buffer, signature: Buffer): boolean {
  const publicKey = loadKey(key.jwk);
  switch (key.algorithm) {
    case EDDSA:
      return verify(null, data, publicKey, signature);
    case ES256:
      return verify("sha256", data, { key: publicKey, dsaEncoding: "der" }, signature);
    case RS256:
      return verify("sha256", data, publicKey, signature);
    default:
      return false;
  }
}
