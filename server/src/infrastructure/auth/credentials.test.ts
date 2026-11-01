import { generateKeyPairSync, sign } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  bearerToken,
  digestsMatch,
  HARNESS_TOKEN_PREFIX,
  hashHarnessToken,
  mintHarnessToken,
  SIGNATURE_WINDOW_MS,
  signingPayload,
  verifyDeviceSignature,
} from "./credentials.js";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const KEY = publicKey.export({ format: "der", type: "spki" }).toString("base64");
const NOW = 1_756_800_000_000;

function signed(request: Parameters<typeof signingPayload>[0]): string {
  return sign(null, Buffer.from(signingPayload(request), "utf8"), privateKey).toString("base64");
}

describe("harness tokens", () => {
  it("mints a prefixed token and stores only its digest", () => {
    const minted = mintHarnessToken();
    expect(minted.token.startsWith(HARNESS_TOKEN_PREFIX)).toBe(true);
    expect(minted.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(minted.hash).not.toContain(minted.token);
  });

  it("carries 256 bits of randomness", () => {
    const minted = mintHarnessToken();
    const body = minted.token.slice(HARNESS_TOKEN_PREFIX.length);
    expect(Buffer.from(body, "base64url")).toHaveLength(32);
  });

  it("mints a different token every time", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => mintHarnessToken().token));
    expect(tokens.size).toBe(500);
  });

  it("hashes the same token to the same digest", () => {
    const minted = mintHarnessToken();
    expect(hashHarnessToken(minted.token)).toBe(minted.hash);
  });

  it("compares digests without leaking how much matched", () => {
    const a = hashHarnessToken("one");
    expect(digestsMatch(a, a)).toBe(true);
    expect(digestsMatch(a, hashHarnessToken("two"))).toBe(false);
    expect(digestsMatch(a, "short")).toBe(false);
  });

  it("matches a digest against itself and nothing else, for any token", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (left, right) => {
        const same = left === right;
        expect(digestsMatch(hashHarnessToken(left), hashHarnessToken(right))).toBe(same);
      }),
    );
  });
});

describe("the Authorization header", () => {
  it("reads a bearer token", () => {
    expect(bearerToken("Bearer chips_at_abc")).toBe("chips_at_abc");
    expect(bearerToken("  Bearer chips_at_abc  ")).toBe("chips_at_abc");
  });

  it.each([
    ["no header", undefined],
    ["another scheme", "Basic abc"],
    ["no token", "Bearer"],
    ["two tokens", "Bearer a b"],
    ["the wrong case", "bearer abc"],
  ])("reads nothing from %s", (_name, header) => {
    expect(bearerToken(header)).toBeUndefined();
  });
});

describe("device signatures", () => {
  const request = {
    method: "POST",
    target: "/v1/runs/run_1/events?dry=0",
    timestamp: NOW,
    body: '{"type":"checkpoint"}',
  };

  it("accepts a signature over exactly this request", () => {
    const result = verifyDeviceSignature({
      publicKey: KEY,
      signature: signed(request),
      request,
      now: NOW,
    });
    expect(result).toEqual({ ok: true });
  });

  it.each([
    ["the method", { ...request, method: "GET" }],
    ["the target", { ...request, target: "/v1/health" }],
    ["the query", { ...request, target: "/v1/runs/run_1/events?dry=1" }],
    ["the body", { ...request, body: '{"type":"handoff"}' }],
    ["the timestamp", { ...request, timestamp: NOW - 1000 }],
  ])("refuses a signature made for a different %s", (_what, altered) => {
    const result = verifyDeviceSignature({
      publicKey: KEY,
      signature: signed(altered),
      request,
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("names the tunnel's handshake hash as a fifth line, which binds the signature to that tunnel (ADR 0191, decision 6)", () => {
    const hash = "ab".repeat(32);
    const bound = { ...request, handshakeHash: hash };
    expect(signingPayload(bound)).toBe(`${signingPayload(request)}\n${hash}`);
    expect(signingPayload(request).split("\n")).toHaveLength(4);
    expect(
      verifyDeviceSignature({ publicKey: KEY, signature: signed(bound), request: bound, now: NOW }),
    ).toEqual({ ok: true });
    // Made for another tunnel, or for none, it is no good in this one; made in this one, it is
    // no good on the plain port either.
    for (const [made, held] of [
      [{ ...request, handshakeHash: "cd".repeat(32) }, bound],
      [request, bound],
      [bound, request],
    ] as const) {
      expect(
        verifyDeviceSignature({ publicKey: KEY, signature: signed(made), request: held, now: NOW }),
      ).toEqual({ ok: false, reason: "bad_signature" });
    }
  });

  it("refuses a signature from another key", () => {
    const other = generateKeyPairSync("ed25519");
    const signature = sign(
      null,
      Buffer.from(signingPayload(request), "utf8"),
      other.privateKey,
    ).toString("base64");
    expect(verifyDeviceSignature({ publicKey: KEY, signature, request, now: NOW })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("refuses a timestamp outside the window, in either direction", () => {
    for (const drift of [SIGNATURE_WINDOW_MS + 1000, -(SIGNATURE_WINDOW_MS + 1000)]) {
      const stale = { ...request, timestamp: NOW + drift };
      expect(
        verifyDeviceSignature({
          publicKey: KEY,
          signature: signed(stale),
          request: stale,
          now: NOW,
        }),
      ).toEqual({ ok: false, reason: "timestamp_out_of_range" });
    }
  });

  it("accepts a clock at the edge of the window", () => {
    const edge = { ...request, timestamp: NOW - SIGNATURE_WINDOW_MS };
    expect(
      verifyDeviceSignature({ publicKey: KEY, signature: signed(edge), request: edge, now: NOW }),
    ).toEqual({ ok: true });
  });

  it("refuses a key that is not a key", () => {
    expect(
      verifyDeviceSignature({
        publicKey: "not-a-key",
        signature: signed(request),
        request,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "malformed_key" });
  });

  it("refuses a signature of the wrong length", () => {
    expect(
      verifyDeviceSignature({ publicKey: KEY, signature: "c2hvcnQ=", request, now: NOW }),
    ).toEqual({ ok: false, reason: "malformed_signature" });
  });

  it("binds a signature to its request, whatever the request is", () => {
    fc.assert(
      fc.property(
        fc.record({
          method: fc.constantFrom("GET", "POST", "PUT", "DELETE"),
          target: fc.string({ minLength: 1, maxLength: 60 }),
          body: fc.string({ maxLength: 200 }),
        }),
        fc.record({
          method: fc.constantFrom("GET", "POST", "PUT", "DELETE"),
          target: fc.string({ minLength: 1, maxLength: 60 }),
          body: fc.string({ maxLength: 200 }),
        }),
        (a, b) => {
          const first = { ...a, timestamp: NOW };
          const second = { ...b, timestamp: NOW };
          const result = verifyDeviceSignature({
            publicKey: KEY,
            signature: signed(first),
            request: second,
            now: NOW,
          });
          const identical =
            first.method === second.method &&
            first.target === second.target &&
            first.body === second.body;
          expect(result.ok).toBe(identical);
        },
      ),
    );
  });
});
