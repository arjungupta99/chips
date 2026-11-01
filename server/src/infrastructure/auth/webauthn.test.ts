/**
 * The WebAuthn verifier (ADR 0034, decision 5), against a pretend authenticator: each of the
 * three key kinds registers and signs in; and every check the specification asks for refuses
 * what it should — the challenge, the origin, the relying-party id, user presence, the
 * signature, the counter.
 */

import { describe, expect, it } from "vitest";
import { encodeCbor, fakeAuthenticator, type PasskeyAlgorithm } from "../../testing/webauthn.js";
import {
  coseToPublicKey,
  decodeCbor,
  fromBase64url,
  originAllowed,
  parseAuthenticatorData,
  toBase64url,
  verifyAssertion,
  verifyRegistration,
} from "./webauthn.js";

const CHALLENGE = toBase64url(Buffer.from("a-challenge-of-thirty-two-bytes!"));
const OPTIONS = { challenge: CHALLENGE, origins: ["https://chips.example"] };

describe("CBOR", () => {
  it("decodes what the test encoder encodes: integers, bytes, text, arrays, maps and simple values", () => {
    const value = new Map<unknown, unknown>([
      [1, 2],
      [3, -7],
      [-1, Buffer.from([1, 2, 3])],
      ["fmt", "none"],
      ["list", [0, 23, 24, 255, 256, 65_535, 65_536, -1, -25]],
      ["flags", [true, false, null]],
    ]);
    const { value: decoded, rest } = decodeCbor(encodeCbor(value));
    expect(rest).toBe(0);
    expect(decoded).toBeInstanceOf(Map);
    const map = decoded as Map<unknown, unknown>;
    expect(map.get(1)).toBe(2);
    expect(map.get(3)).toBe(-7);
    expect(Buffer.from(map.get(-1) as Uint8Array)).toEqual(Buffer.from([1, 2, 3]));
    expect(map.get("fmt")).toBe("none");
    expect(map.get("list")).toEqual([0, 23, 24, 255, 256, 65_535, 65_536, -1, -25]);
    expect(map.get("flags")).toEqual([true, false, null]);
  });

  it("says how many bytes followed the item, which is how a COSE key ends", () => {
    const bytes = Buffer.concat([encodeCbor(5), Buffer.from([9, 9, 9])]);
    expect(decodeCbor(bytes)).toEqual({ value: 5, rest: 3 });
  });

  it("drops a tag, and reads the three float widths and the simple values", () => {
    // A tag (major 6) wraps its item and is dropped: tag 1 around the integer 7.
    expect(decodeCbor(Buffer.from([0xc1, 0x07])).value).toBe(7);
    // Half, single and double precision: 1.0 in each.
    expect(decodeCbor(Buffer.from([0xf9, 0x3c, 0x00])).value).toBe(1);
    expect(decodeCbor(Buffer.from([0xfa, 0x3f, 0x80, 0x00, 0x00])).value).toBe(1);
    expect(decodeCbor(Buffer.from([0xfb, 0x3f, 0xf0, 0, 0, 0, 0, 0, 0])).value).toBe(1);
    // A subnormal half, infinity and NaN.
    expect(decodeCbor(Buffer.from([0xf9, 0x00, 0x01])).value).toBeCloseTo(5.96e-8);
    expect(decodeCbor(Buffer.from([0xf9, 0x7c, 0x00])).value).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(decodeCbor(Buffer.from([0xf9, 0x7e, 0x00])).value)).toBe(true);
    expect(decodeCbor(Buffer.from([0xf7])).value).toBeUndefined();
    // A 64-bit length head, small enough to be a number.
    expect(decodeCbor(Buffer.from([0x1b, 0, 0, 0, 0, 0, 0, 0, 42])).value).toBe(42);
    expect(() => decodeCbor(Buffer.from([0x1b, 0xff, 0, 0, 0, 0, 0, 0, 0]))).toThrow(/too large/);
    expect(() => decodeCbor(Buffer.from([0xf0]))).toThrow(/simple value/);
  });

  it("refuses what it does not understand", () => {
    expect(() => decodeCbor(Buffer.from([0x5f]))).toThrow(/indefinite/);
    expect(() => decodeCbor(Buffer.from([0x42, 0x01]))).toThrow(/ended early/);
    expect(() => decodeCbor(Buffer.from([]))).toThrow(/ended early/);
  });
});

describe("base64url", () => {
  it("round-trips with and without padding", () => {
    for (const length of [0, 1, 2, 3, 31, 32, 33]) {
      const bytes = Buffer.alloc(length, 0xfb);
      expect(fromBase64url(toBase64url(bytes))).toEqual(bytes);
    }
    expect(fromBase64url("AQID")).toEqual(Buffer.from([1, 2, 3]));
    expect(fromBase64url("AQID==")).toEqual(Buffer.from([1, 2, 3]));
  });
});

describe("origins", () => {
  it("allows what is listed, and loopback on any port, and nothing else", () => {
    expect(originAllowed("https://chips.example", ["https://chips.example"])).toBe(true);
    expect(originAllowed("http://localhost:5199", [])).toBe(true);
    expect(originAllowed("http://127.0.0.1:4431", [])).toBe(true);
    expect(originAllowed("http://[::1]:4431", [])).toBe(true);
    expect(originAllowed("https://evil.example", ["https://chips.example"])).toBe(false);
    expect(originAllowed("http://mini.local:4431", [])).toBe(false);
    expect(originAllowed("not an origin", [])).toBe(false);
  });
});

describe.each([-7, -8, -257] as PasskeyAlgorithm[])("a passkey with algorithm %s", (algorithm) => {
  it("registers, and then signs in, with a counter that moves forward", () => {
    const authenticator = fakeAuthenticator({
      algorithm,
      origin: "https://chips.example",
      signCount: 3,
    });
    const registered = verifyRegistration(authenticator.register(CHALLENGE), OPTIONS);
    expect(registered.ok, JSON.stringify(registered)).toBe(true);
    if (!registered.ok) return;
    expect(registered.value).toMatchObject({
      credentialId: authenticator.credentialId,
      algorithm,
      signCount: 3,
      transports: ["internal"],
      userVerified: true,
    });
    expect(registered.value.jwk.kty).toBe(
      algorithm === -8 ? "OKP" : algorithm === -7 ? "EC" : "RSA",
    );

    const signedIn = verifyAssertion(authenticator.assert(CHALLENGE), {
      ...OPTIONS,
      key: registered.value,
      signCount: 3,
    });
    expect(signedIn.ok, JSON.stringify(signedIn)).toBe(true);
    if (signedIn.ok) expect(signedIn.value.signCount).toBe(4);
  });

  it("refuses a signature by another key", () => {
    const authenticator = fakeAuthenticator({ algorithm, origin: "https://chips.example" });
    const other = fakeAuthenticator({ algorithm, origin: "https://chips.example" });
    const registered = verifyRegistration(authenticator.register(CHALLENGE), OPTIONS);
    if (!registered.ok) throw new Error(registered.reason);
    const forged = verifyAssertion(
      authenticator.assert(CHALLENGE, { signWith: otherPrivateKey(other) }),
      { ...OPTIONS, key: registered.value, signCount: 0 },
    );
    expect(forged.ok).toBe(false);
    if (!forged.ok) expect(forged.reason).toMatch(/signature/);
  });
});

/** The private half of another authenticator, dug out for a forgery. */
function otherPrivateKey(other: ReturnType<typeof fakeAuthenticator>) {
  // The fake keeps its private key to itself; signing with a key made here is the same forgery.
  const { generateKeyPairSync } = require("node:crypto") as typeof import("node:crypto");
  switch (other.algorithm) {
    case -8:
      return generateKeyPairSync("ed25519").privateKey;
    case -7:
      return generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
    default:
      return generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  }
}

describe("what registration refuses", () => {
  const authenticator = fakeAuthenticator({ origin: "https://chips.example" });

  it("a challenge that is not the one issued", () => {
    const other = toBase64url(Buffer.from("another-challenge-of-32-bytes!!!"));
    const result = verifyRegistration(authenticator.register(other), OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/challenge/);
  });

  it("an origin that is not allowed, and a relying-party id that is not the origin's", () => {
    const origin = verifyRegistration(
      authenticator.register(CHALLENGE, { origin: "https://evil.example" }),
      OPTIONS,
    );
    expect(origin.ok).toBe(false);
    if (!origin.ok) expect(origin.reason).toMatch(/origin/);
    const rp = verifyRegistration(
      authenticator.register(CHALLENGE, { rpId: "evil.example" }),
      OPTIONS,
    );
    expect(rp.ok).toBe(false);
    if (!rp.ok) expect(rp.reason).toMatch(/relying-party/);
    // The relying-party id can be pinned, and then the origin's hostname is not enough.
    const pinned = verifyRegistration(authenticator.register(CHALLENGE), {
      ...OPTIONS,
      rpId: "app.chips.example",
    });
    expect(pinned.ok).toBe(false);
  });

  it("a sign-in shape offered as a registration, and an authenticator that checked for nobody", () => {
    const type = verifyRegistration(
      authenticator.register(CHALLENGE, { type: "webauthn.get" }),
      OPTIONS,
    );
    expect(type.ok).toBe(false);
    const nobody = verifyRegistration(
      authenticator.register(CHALLENGE, { userPresent: false }),
      OPTIONS,
    );
    expect(nobody.ok).toBe(false);
    if (!nobody.ok) expect(nobody.reason).toMatch(/person/);
  });

  it("a credential id that is not the one attested, and bytes that are not an attestation", () => {
    const swapped = { ...authenticator.register(CHALLENGE), id: toBase64url(Buffer.alloc(16, 1)) };
    const result = verifyRegistration(swapped, OPTIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/credential id/);
    const garbage = verifyRegistration(
      {
        id: "x",
        response: { clientDataJSON: toBase64url(Buffer.from("{}")), attestationObject: "AQ" },
      },
      OPTIONS,
    );
    expect(garbage.ok).toBe(false);
  });
});

describe("what a sign-in refuses", () => {
  const authenticator = fakeAuthenticator({ origin: "https://chips.example", signCount: 10 });
  const registered = verifyRegistration(authenticator.register(CHALLENGE), OPTIONS);
  if (!registered.ok) throw new Error(registered.reason);
  const key = registered.value;

  it("a counter that did not move", () => {
    const stale = verifyAssertion(authenticator.assert(CHALLENGE, { signCount: 10 }), {
      ...OPTIONS,
      key,
      signCount: 10,
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.reason).toMatch(/cloned/);
  });

  it("but not an authenticator that keeps no counter at all", () => {
    const countless = fakeAuthenticator({ origin: "https://chips.example" });
    const made = verifyRegistration(countless.register(CHALLENGE), OPTIONS);
    if (!made.ok) throw new Error(made.reason);
    const first = verifyAssertion(countless.assert(CHALLENGE), {
      ...OPTIONS,
      key: made.value,
      signCount: 0,
    });
    expect(first.ok).toBe(true);
    const second = verifyAssertion(countless.assert(CHALLENGE), {
      ...OPTIONS,
      key: made.value,
      signCount: 0,
    });
    expect(second.ok).toBe(true);
  });

  it("the wrong challenge, origin, relying party or shape", () => {
    const cases = [
      authenticator.assert(toBase64url(Buffer.from("another-challenge-of-32-bytes!!!"))),
      authenticator.assert(CHALLENGE, { origin: "https://evil.example" }),
      authenticator.assert(CHALLENGE, { rpId: "evil.example" }),
      authenticator.assert(CHALLENGE, { type: "webauthn.create" }),
      authenticator.assert(CHALLENGE, { userPresent: false }),
    ];
    for (const assertion of cases) {
      expect(verifyAssertion(assertion, { ...OPTIONS, key, signCount: 10 }).ok).toBe(false);
    }
  });
});

describe("COSE keys", () => {
  it("refuses a curve or a kind this server does not take", () => {
    expect(() =>
      coseToPublicKey(
        new Map([
          [1, 2],
          [-1, 2],
        ]),
      ),
    ).toThrow(/algorithm/);
    expect(() => coseToPublicKey(new Map([[1, 4]]))).toThrow(/algorithm/);
    expect(() =>
      coseToPublicKey(
        new Map([
          [1, 2],
          [-1, 1],
        ]),
      ),
    ).toThrow(/label/);
  });

  it("refuses client data that is not JSON, or lacks its fields, and an attestation with no data", () => {
    const authenticator = fakeAuthenticator({ origin: "https://chips.example" });
    const good = authenticator.register(CHALLENGE);
    const bad = verifyRegistration(
      { ...good, response: { ...good.response, clientDataJSON: toBase64url(Buffer.from("nope")) } },
      OPTIONS,
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toMatch(/not JSON/);
    const short = verifyRegistration(
      {
        ...good,
        response: {
          ...good.response,
          clientDataJSON: toBase64url(Buffer.from('{"type":"webauthn.create"}')),
        },
      },
      OPTIONS,
    );
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.reason).toMatch(/lacks/);
    const noAuthData = verifyRegistration(
      {
        id: "x",
        response: {
          clientDataJSON: toBase64url(Buffer.from("{}")),
          attestationObject: toBase64url(encodeCbor(new Map([["fmt", "none"]]))),
        },
      },
      OPTIONS,
    );
    expect(noAuthData.ok).toBe(false);
    if (!noAuthData.ok) expect(noAuthData.reason).toMatch(/authData/);
  });

  it("reads authenticator data without a credential as a sign-in's", () => {
    const bytes = Buffer.concat([
      Buffer.alloc(32, 7),
      Buffer.from([0x05]),
      Buffer.from([0, 0, 0, 9]),
    ]);
    const parsed = parseAuthenticatorData(bytes);
    expect(parsed).toMatchObject({ userPresent: true, userVerified: true, signCount: 9 });
    expect(parsed.credential).toBeUndefined();
    expect(() => parseAuthenticatorData(Buffer.alloc(10))).toThrow(/too short/);
  });
});
