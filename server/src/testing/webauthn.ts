/**
 * A pretend authenticator, for tests: makes a key of one of the three kinds a browser produces,
 * and answers registration and sign-in the way `navigator.credentials` would — an attestation
 * object in CBOR with `fmt: "none"`, authenticator data with the right flags, and a signature
 * over the right bytes. What the verifier in `infrastructure/auth/webauthn.ts` checks, this
 * builds; a test that wants a wrong answer edits the result.
 */

import { createHash, generateKeyPairSync, type KeyObject, randomBytes, sign } from "node:crypto";

export type PasskeyAlgorithm = -7 | -8 | -257;

export interface FakeAuthenticatorOptions {
  readonly algorithm?: PasskeyAlgorithm | undefined;
  readonly rpId?: string | undefined;
  readonly origin?: string | undefined;
  /** The counter the authenticator starts at; each assertion adds one. Zero means it keeps none. */
  readonly signCount?: number | undefined;
}

export interface FakeAuthenticator {
  readonly credentialId: string;
  readonly algorithm: PasskeyAlgorithm;
  readonly origin: string;
  readonly rpId: string;
  /** Answer a registration for this challenge, as the browser's JSON form. */
  readonly register: (challenge: string, overrides?: RegistrationOverrides) => RegistrationJson;
  /** Answer a sign-in for this challenge, as the browser's JSON form. */
  readonly assert: (challenge: string, overrides?: AssertionOverrides) => AssertionJson;
  /** The public key, for a test that wants to compare. */
  readonly publicKey: KeyObject;
}

export interface RegistrationOverrides {
  readonly origin?: string | undefined;
  readonly rpId?: string | undefined;
  readonly type?: string | undefined;
  readonly userPresent?: boolean | undefined;
}

export interface AssertionOverrides extends RegistrationOverrides {
  readonly signCount?: number | undefined;
  /** Sign with a different key, so the signature fails. */
  readonly signWith?: KeyObject | undefined;
}

export interface RegistrationJson {
  readonly id: string;
  readonly rawId: string;
  readonly type: "public-key";
  readonly response: {
    readonly clientDataJSON: string;
    readonly attestationObject: string;
    readonly transports: string[];
  };
}

export interface AssertionJson {
  readonly id: string;
  readonly rawId: string;
  readonly type: "public-key";
  readonly response: {
    readonly clientDataJSON: string;
    readonly authenticatorData: string;
    readonly signature: string;
    readonly userHandle: null;
  };
}

// ------------------------------------------------------------------- CBOR out

function head(major: number, argument: number): Buffer {
  if (argument < 24) return Buffer.from([(major << 5) | argument]);
  if (argument < 0x1_00) return Buffer.from([(major << 5) | 24, argument]);
  if (argument < 0x1_00_00) return Buffer.from([(major << 5) | 25, argument >> 8, argument & 0xff]);
  const out = Buffer.alloc(5);
  out[0] = (major << 5) | 26;
  out.writeUInt32BE(argument, 1);
  return out;
}

/** Encode the subset the tests need: integers, byte strings, text, arrays and maps. */
export function encodeCbor(value: unknown): Buffer {
  if (typeof value === "number") {
    return value >= 0 ? head(0, value) : head(1, -1 - value);
  }
  if (value instanceof Uint8Array) return Buffer.concat([head(2, value.length), value]);
  if (typeof value === "string") {
    const bytes = Buffer.from(value, "utf8");
    return Buffer.concat([head(3, bytes.length), bytes]);
  }
  if (Array.isArray(value)) {
    return Buffer.concat([head(4, value.length), ...value.map(encodeCbor)]);
  }
  if (value instanceof Map) {
    const entries = [...value.entries()].flatMap(([k, v]) => [encodeCbor(k), encodeCbor(v)]);
    return Buffer.concat([head(5, value.size), ...entries]);
  }
  if (value === false) return Buffer.from([0xf4]);
  if (value === true) return Buffer.from([0xf5]);
  if (value === null) return Buffer.from([0xf6]);
  throw new Error(`cannot encode ${typeof value}`);
}

// --------------------------------------------------------------- the authenticator

function b64u(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function coseKeyOf(publicKey: KeyObject, algorithm: PasskeyAlgorithm): Map<number, unknown> {
  const jwk = publicKey.export({ format: "jwk" }) as Record<string, string>;
  const bytes = (field: string) => Buffer.from(jwk[field] ?? "", "base64url");
  if (algorithm === -8) {
    return new Map<number, unknown>([
      [1, 1],
      [3, -8],
      [-1, 6],
      [-2, bytes("x")],
    ]);
  }
  if (algorithm === -7) {
    return new Map<number, unknown>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, bytes("x")],
      [-3, bytes("y")],
    ]);
  }
  return new Map<number, unknown>([
    [1, 3],
    [3, -257],
    [-1, bytes("n")],
    [-2, bytes("e")],
  ]);
}

function keyPair(algorithm: PasskeyAlgorithm): { publicKey: KeyObject; privateKey: KeyObject } {
  if (algorithm === -8) return generateKeyPairSync("ed25519");
  if (algorithm === -7) return generateKeyPairSync("ec", { namedCurve: "P-256" });
  return generateKeyPairSync("rsa", { modulusLength: 2048 });
}

function signWith(algorithm: PasskeyAlgorithm, privateKey: KeyObject, data: Uint8Array): Buffer {
  if (algorithm === -8) return sign(null, data, privateKey);
  if (algorithm === -7) return sign("sha256", data, { key: privateKey, dsaEncoding: "der" });
  return sign("sha256", data, privateKey);
}

function clientData(type: string, challenge: string, origin: string): Buffer {
  return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }), "utf8");
}

function authData(input: {
  rpId: string;
  userPresent: boolean;
  signCount: number;
  credential?: { id: Buffer; key: Map<number, unknown> } | undefined;
}): Buffer {
  const rpIdHash = createHash("sha256").update(input.rpId, "utf8").digest();
  let flags = input.userPresent ? 0x01 : 0;
  flags |= 0x04; // user verified, as a platform authenticator reports
  if (input.credential !== undefined) flags |= 0x40;
  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(input.signCount);
  const parts: Uint8Array[] = [rpIdHash, Buffer.from([flags]), counter];
  if (input.credential !== undefined) {
    const idLength = Buffer.alloc(2);
    idLength.writeUInt16BE(input.credential.id.length);
    parts.push(Buffer.alloc(16), idLength, input.credential.id, encodeCbor(input.credential.key));
  }
  return Buffer.concat(parts);
}

export function fakeAuthenticator(options: FakeAuthenticatorOptions = {}): FakeAuthenticator {
  const algorithm = options.algorithm ?? -7;
  const origin = options.origin ?? "http://localhost:5199";
  const rpId = options.rpId ?? new URL(origin).hostname;
  const { publicKey, privateKey } = keyPair(algorithm);
  const credentialId = randomBytes(16);
  let counter = options.signCount ?? 0;

  return {
    credentialId: b64u(credentialId),
    algorithm,
    origin,
    rpId,
    publicKey,

    register(challenge, overrides = {}) {
      const attestation = new Map<string, unknown>([
        ["fmt", "none"],
        [
          "authData",
          authData({
            rpId: overrides.rpId ?? rpId,
            userPresent: overrides.userPresent ?? true,
            signCount: counter,
            credential: { id: credentialId, key: coseKeyOf(publicKey, algorithm) },
          }),
        ],
        ["attStmt", new Map()],
      ]);
      return {
        id: b64u(credentialId),
        rawId: b64u(credentialId),
        type: "public-key",
        response: {
          clientDataJSON: b64u(
            clientData(overrides.type ?? "webauthn.create", challenge, overrides.origin ?? origin),
          ),
          attestationObject: b64u(encodeCbor(attestation)),
          transports: ["internal"],
        },
      };
    },

    assert(challenge, overrides = {}) {
      if (counter > 0 || options.signCount !== undefined) counter += 1;
      const data = authData({
        rpId: overrides.rpId ?? rpId,
        userPresent: overrides.userPresent ?? true,
        signCount: overrides.signCount ?? counter,
      });
      const client = clientData(
        overrides.type ?? "webauthn.get",
        challenge,
        overrides.origin ?? origin,
      );
      const signed = Buffer.concat([data, createHash("sha256").update(client).digest()]);
      return {
        id: b64u(credentialId),
        rawId: b64u(credentialId),
        type: "public-key",
        response: {
          clientDataJSON: b64u(client),
          authenticatorData: b64u(data),
          signature: b64u(signWith(algorithm, overrides.signWith ?? privateKey, signed)),
          userHandle: null,
        },
      };
    },
  };
}
