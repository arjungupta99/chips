import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { HARNESS_CAPABILITIES } from "./capabilities.js";
import { serverFrame } from "./frames.js";
import {
  GRANTABLE,
  JOIN_CODE_SECONDS,
  JOIN_LINK_SECONDS,
  JOIN_POLL_SECONDS,
  joinAsk,
  joinAsked,
  joinCheckCode,
  joinCheckText,
  joinCommitText,
  joinLink,
  joinRequestView,
  parseJoinLink,
} from "./join.js";
import { pairingCode, pairingCodeTyped } from "./pairing.js";
import { canSee } from "./visibility.js";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const frame = JSON.parse(readFileSync(new URL("frames/join.json", FIXTURES), "utf8"));

const secret = fc.stringMatching(/^[A-Za-z0-9_-]{22,64}$/);
const base = fc.constantFrom(
  "http://127.0.0.1:4431",
  "http://100.64.0.7:4431",
  "https://chips.example.org",
  "https://example.org/chips",
);

describe("join links", () => {
  it("take apart into the address and the secret they were made from", () => {
    fc.assert(
      fc.property(base, secret, (url, kept) => {
        expect(parseJoinLink(joinLink(url, kept))).toEqual({ url, secret: kept });
      }),
    );
  });

  it("forgive a trailing slash on the address and on the link", () => {
    const link = joinLink("http://127.0.0.1:4431/", "h7qkm2xwdp4r9tz3h7qkm2");
    expect(link).toBe("http://127.0.0.1:4431/j/h7qkm2xwdp4r9tz3h7qkm2");
    expect(parseJoinLink(`${link}/`)?.url).toBe("http://127.0.0.1:4431");
  });

  it("refuse what is not one", () => {
    for (const not of [
      "",
      "not a link",
      "chips://j/h7qkm2xwdp4r9tz3h7qkm2",
      "http://127.0.0.1:4431/j/short",
      "http://127.0.0.1:4431/pair/h7qkm2xwdp4r9tz3h7qkm2",
      "http://127.0.0.1:4431/j/h7qkm2xwdp4r9tz3h7qkm2/more",
    ]) {
      expect(parseJoinLink(not), not).toBeUndefined();
    }
  });
});

describe("join requests", () => {
  it("last ten minutes from a code, fifteen from a link, and are polled under the relay's cap", () => {
    expect(JOIN_CODE_SECONDS).toBe(600);
    expect(JOIN_LINK_SECONDS).toBe(900);
    expect(60 / JOIN_POLL_SECONDS).toBeLessThan(30);
  });

  it("may grant every capability a harness may take, and nothing else", () => {
    expect([...GRANTABLE].sort()).toEqual(Object.values(HARNESS_CAPABILITIES).sort());
  });

  it("travel to a person's socket as a join frame, never with the secret", () => {
    expect(serverFrame.safeParse(frame).success).toBe(true);
    const leaked = { ...frame.request, secret: "h7qkm2xwdp4r9tz3h7qkm2" };
    expect(joinRequestView.parse(leaked)).not.toHaveProperty("secret");
  });

  it("are asked for as a harness unless they say otherwise", () => {
    expect(joinAsk.parse({ name: "Tide" }).kind).toBe("harness");
    expect(joinAsk.safeParse({ name: "" }).success).toBe(false);
    expect(joinAsk.safeParse({ kind: "device", name: "Pixel", public_key: "nope" }).success).toBe(
      false,
    );
  });
});

describe("who hears what came of a request", () => {
  const event = (type: string) => ({
    type,
    space_id: null,
    actor: { id: "usr_01K4ZQPX000000000000000003" },
    payload: { request_id: "jrq_01K4ZQPX0000000000000000J1" },
  });
  const person = { participantId: "usr_1", memberSpaces: new Set<string>(), seesDirectory: true };
  const guest = { participantId: "usr_2", memberSpaces: new Set(["spc_1"]), seesDirectory: false };
  const harness = { participantId: "hrn_1", memberSpaces: new Set(["spc_1"]) };

  it.each(["join.allowed", "join.denied"])("%s: people who see the directory only", (type) => {
    expect(canSee(event(type), person)).toBe(true);
    expect(canSee(event(type), guest)).toBe(false);
    expect(canSee(event(type), harness)).toBe(false);
  });
});

describe("the check a device asking on the Wi-Fi shows (S-1, ADR 0278)", () => {
  const sha = (text: string) => new Uint8Array(createHash("sha256").update(text, "utf8").digest());
  const parts = {
    publicKey: "MCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZuE=",
    serverKey: "q0Wl3V8sGfJm2tXc7rYb4nKpD9eA1hLzU6iO5wE3RgS",
    deviceNonce: "a".repeat(43),
    serverNonce: "b".repeat(43),
  };

  it("is six characters of the pairing alphabet, as a pairing code is typed", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 32, maxLength: 32 }), (digest) => {
        const code = joinCheckCode(digest);
        expect(pairingCode.safeParse(code).success).toBe(true);
        expect(pairingCodeTyped(code.toLowerCase().replace("-", " "))).toBe(code);
        expect(code).not.toMatch(/[01IO]/);
      }),
    );
  });

  it("reads the digest's first thirty bits, five to a character", () => {
    expect(joinCheckCode(new Uint8Array(32))).toBe("AAA-AAA");
    expect(joinCheckCode(new Uint8Array([0xff, 0xff, 0xff, 0xff]))).toBe("999-999");
    // 0b00001 00010 00011 00100 00101 00110 (then two bits it never reads)
    expect(joinCheckCode(new Uint8Array([0x08, 0x86, 0x42, 0x98]))).toBe("BCD-EFG");
  });

  it("changes with each key and each nonce, so nobody between the two ends can swap one", () => {
    const code = joinCheckCode(sha(joinCheckText(parts)));
    for (const swapped of [
      { ...parts, publicKey: "MCowBQYDK2VwAyEAO2onvM62pC1io6jQKm8Nc2UyFXcd4kOmOsBIoYtZ2ik=" },
      { ...parts, serverKey: "q0Wl3V8sGfJm2tXc7rYb4nKpD9eA1hLzU6iO5wE3RgT" },
      { ...parts, deviceNonce: "c".repeat(43) },
      { ...parts, serverNonce: "c".repeat(43) },
    ]) {
      expect(joinCheckText(swapped)).not.toBe(joinCheckText(parts));
    }
    expect(code).toBe(joinCheckCode(sha(joinCheckText({ ...parts }))));
    expect(joinCommitText(parts.deviceNonce)).toBe(`chips join commit v1\n${"a".repeat(43)}`);
  });

  it("is asked with a commitment, and answered with the server's key and nonce in place of a code", () => {
    const commit = createHash("sha256")
      .update(joinCommitText(parts.deviceNonce))
      .digest("base64url");
    expect(
      joinAsk.safeParse({ kind: "device", name: "Phone", public_key: parts.publicKey, commit })
        .success,
    ).toBe(true);
    expect(joinAsk.safeParse({ kind: "device", name: "Phone", commit: "short" }).success).toBe(
      false,
    );
    const answer = {
      request_id: "jrq_01K4ZQPX0000000000000000J1",
      secret: "jrs_0123456789abcdefghij",
      server_key: parts.serverKey,
      nonce: parts.serverNonce,
      expires_in: 600,
      interval: 3,
    };
    expect(joinAsked.safeParse(answer).success).toBe(true);
    expect(joinAsked.safeParse({ ...answer, nonce: "x" }).success).toBe(false);
  });
});
