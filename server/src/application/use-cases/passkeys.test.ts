/**
 * Passkeys (ADR 0034, decision 4), against a fake verifier: a challenge is issued to one
 * person and spent once; the browser's answer is kept as that person's key and nobody else's;
 * a sign-in pairs the device that asked, for the person the credential names.
 */

import { manualClock } from "@chipschat/platform";
import { createIdGenerator } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import type { Principal } from "../ports/identity.js";
import type { NewPasskey, PasskeyRegistry, PasskeyView } from "../ports/passkeys.js";
import type { WebAuthn } from "../ports/webauthn.js";
import { CHALLENGE_TTL_MS, createPasskeys } from "./passkeys.js";

const WS = "ws_01K4ZQPX000000000000000001";
const ARJUN: Principal = {
  kind: "person",
  participantId: "usr_01K4ZQPX000000000000000003",
  workspaceId: WS,
  displayName: "Arjun",
  via: "device_key",
  deviceId: "dev_01K4ZQPX000000000000000005",
  role: "owner",
};
const DANA: Principal = {
  ...ARJUN,
  participantId: "usr_01K4ZQPX000000000000000009",
  displayName: "Dana",
  role: "member",
};
const KEY = "MCowBQYDK2VwAyEAr3z7c4a2j8mPqZ0y1xW9n4kL2vB6dF8hJ0sT5uY7wE0=";
const JWK = { kty: "OKP", crv: "Ed25519", x: "abc" };

const answer = (id: string) => ({
  id,
  response: {
    clientDataJSON: "e30",
    attestationObject: "oA",
    authenticatorData: "AA",
    signature: "AA",
  },
});

function harness(options: { verify?: "ok" | "refuse"; signCount?: number; held?: number } = {}) {
  const passkeys: (NewPasskey & { lastUsedAt: string | null; revokedAt: string | null })[] = [];
  const devices: Record<string, unknown>[] = [];
  const clock = manualClock(1_757_100_000_000);
  // Whether Arjun was removed from the workspace since (ADR 0160): no row of standing, marked.
  let removed = false;
  const registry: PasskeyRegistry = {
    async addPasskey(passkey) {
      passkeys.push({ ...passkey, lastUsedAt: null, revokedAt: null });
    },
    async passkeyByCredentialId(credentialId) {
      return passkeys.find((each) => each.credentialId === credentialId) as PasskeyView | undefined;
    },
    async passkeysOf(_ws, participantId) {
      return passkeys.filter((each) => each.participantId === participantId) as PasskeyView[];
    },
    async revokePasskey({ participantId, passkeyId, at }) {
      const row = passkeys.find(
        (each) =>
          each.id === passkeyId && each.participantId === participantId && each.revokedAt === null,
      );
      if (row === undefined) return false;
      row.revokedAt = at;
      return true;
    },
    async noteUse({ passkeyId, signCount, at }) {
      const row = passkeys.find((each) => each.id === passkeyId);
      if (row !== undefined) {
        (row as { signCount: number }).signCount = signCount;
        row.lastUsedAt = at;
      }
    },
  };
  const asked: string[] = [];
  const webauthn: WebAuthn = {
    verifyRegistration(input, context) {
      asked.push(`register:${context.challenge}:${context.origins.join(",")}`);
      if (options.verify === "refuse")
        return { ok: false, reason: "the signature does not verify" };
      return {
        ok: true,
        value: {
          credentialId: input.id,
          jwk: JWK,
          algorithm: -8,
          signCount: 0,
          transports: ["internal"],
        },
      };
    },
    verifyAssertion(_input, context) {
      asked.push(`assert:${context.challenge}:${context.signCount}`);
      if (options.verify === "refuse")
        return { ok: false, reason: "the signature does not verify" };
      return { ok: true, value: { signCount: (options.signCount ?? context.signCount) + 1 } };
    },
  };
  let challenges = 0;
  const use = createPasskeys({
    registry,
    devices: {
      participant: async () => undefined,
      deviceByPublicKey: async (_ws, key) =>
        devices.some((each) => each["publicKey"] === key)
          ? { deviceId: "dev_x", participantId: "usr_x" }
          : undefined,
      addDevice: async (device) => {
        devices.push(device);
      },
      device: async () => undefined,
      devicesOf: async () => [],
      revokeDevice: async () => false,
    },
    webauthn,
    readModels: {
      workspace: async () => ({ workspace_id: WS, name: "Northwind" }),
      participant: async (_ws, id) =>
        id === ARJUN.participantId
          ? {
              id,
              kind: "person",
              display_name: "Arjun",
              owner_id: null,
              role: "owner",
              capabilities: null,
              removed_at: removed ? "2026-09-07T00:00:00.000Z" : null,
              last_seen_at: null,
            }
          : undefined,
      workspaceRole: async () => (removed ? undefined : "owner"),
    },
    clock,
    ids: createIdGenerator({ now: () => clock.nowMs(), randomFill: (b) => b.fill(4) }),
    randomChallenge: () => {
      challenges += 1;
      return `challenge-${challenges}`;
    },
    origins: () => ["https://chips.example"],
    held: options.held,
  });
  const removePerson = () => {
    removed = true;
  };
  return { use, passkeys, devices, clock, asked, removePerson };
}

describe("registering a passkey", () => {
  it("hands the browser a challenge for this person, and keeps the answer as their key", async () => {
    const { use, passkeys, asked } = harness();
    const options = await use.registrationOptions(ARJUN);
    expect(options.ok).toBe(true);
    if (!options.ok) return;
    expect(options.value).toMatchObject({
      challenge: "challenge-1",
      rp: { name: "Northwind" },
      user: { name: "Arjun", displayName: "Arjun" },
      pubKeyCredParams: [
        { type: "public-key", alg: -8 },
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      attestation: "none",
      excludeCredentials: [],
      timeout: CHALLENGE_TTL_MS,
    });
    expect(Buffer.from(options.value.user.id, "base64url").toString("utf8")).toBe(
      ARJUN.participantId,
    );

    const registered = await use.register({
      principal: ARJUN,
      challenge: "challenge-1",
      answer: answer("cred-1"),
      name: "  MacBook  ",
    });
    expect(registered.ok, JSON.stringify(registered)).toBe(true);
    if (!registered.ok) return;
    expect(registered.value).toMatchObject({
      workspaceId: WS,
      participantId: ARJUN.participantId,
      credentialId: "cred-1",
      publicKey: JWK,
      algorithm: -8,
      name: "MacBook",
      transports: ["internal"],
    });
    expect(registered.value.id).toMatch(/^pky_/);
    expect(passkeys).toHaveLength(1);
    // The verifier was asked with the challenge and the configured origins.
    expect(asked).toEqual(["register:challenge-1:https://chips.example"]);

    // The next registration excludes the key that exists.
    const again = await use.registrationOptions(ARJUN);
    expect(again.ok && again.value.excludeCredentials).toEqual([
      { type: "public-key", id: "cred-1", transports: ["internal"] },
    ]);
  });

  it("spends the challenge once, only for the person it was issued to, and only in time", async () => {
    const { use, clock } = harness();
    await use.registrationOptions(ARJUN);
    // Dana cannot answer Arjun's challenge.
    const stolen = await use.register({
      principal: DANA,
      challenge: "challenge-1",
      answer: answer("c"),
    });
    expect(stolen.ok).toBe(false);
    if (!stolen.ok) expect(stolen.error.kind).toBe("unknown_challenge");
    // And it is spent by the attempt: Arjun cannot use it now either.
    const spent = await use.register({
      principal: ARJUN,
      challenge: "challenge-1",
      answer: answer("c"),
    });
    expect(spent.ok).toBe(false);

    await use.registrationOptions(ARJUN);
    clock.advance(CHALLENGE_TTL_MS + 1);
    const late = await use.register({
      principal: ARJUN,
      challenge: "challenge-2",
      answer: answer("c"),
    });
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error.kind).toBe("unknown_challenge");

    const harnessCall: Principal = {
      ...ARJUN,
      kind: "harness",
      role: undefined,
      via: "harness_token",
    };
    expect((await use.registrationOptions(harnessCall)).ok).toBe(false);
  });

  it("keeps nothing the verifier refuses, and no credential twice", async () => {
    const refusing = harness({ verify: "refuse" });
    await refusing.use.registrationOptions(ARJUN);
    const refused = await refusing.use.register({
      principal: ARJUN,
      challenge: "challenge-1",
      answer: answer("c"),
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok)
      expect(refused.error).toEqual({ kind: "refused", message: "the signature does not verify" });
    expect(refusing.passkeys).toHaveLength(0);

    const { use } = harness();
    await use.registrationOptions(ARJUN);
    await use.register({ principal: ARJUN, challenge: "challenge-1", answer: answer("same") });
    await use.registrationOptions(DANA);
    const twice = await use.register({
      principal: DANA,
      challenge: "challenge-2",
      answer: answer("same"),
    });
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.error.kind).toBe("invalid");
  });

  it("lists and withdraws a person's own, and nobody else's", async () => {
    const { use } = harness();
    await use.registrationOptions(ARJUN);
    const made = await use.register({
      principal: ARJUN,
      challenge: "challenge-1",
      answer: answer("c"),
    });
    if (!made.ok) throw new Error("not registered");
    expect((await use.list(DANA)).ok && (await use.list(DANA))).toMatchObject({ value: [] });
    const notHers = await use.revoke({ principal: DANA, passkeyId: made.value.id });
    expect(notHers.ok).toBe(false);
    if (!notHers.ok) expect(notHers.error.kind).toBe("unknown_passkey");
    const his = await use.revoke({ principal: ARJUN, passkeyId: made.value.id });
    expect(his.ok).toBe(true);
    const listed = await use.list(ARJUN);
    expect(listed.ok && listed.value[0]?.revokedAt).not.toBeNull();
  });
});

describe("signing in with a passkey", () => {
  async function registered(h: ReturnType<typeof harness>, credentialId = "cred-1") {
    await h.use.registrationOptions(ARJUN);
    const made = await h.use.register({
      principal: ARJUN,
      challenge: "challenge-1",
      answer: answer(credentialId),
    });
    if (!made.ok) throw new Error("not registered");
    return made.value;
  }

  it("pairs the device that asked, for the person the credential names, and moves the counter", async () => {
    const h = harness({ signCount: 4 });
    const passkey = await registered(h);
    const options = h.use.assertionOptions();
    expect(options).toEqual({
      challenge: "challenge-2",
      userVerification: "preferred",
      timeout: CHALLENGE_TTL_MS,
    });

    const signedIn = await h.use.signIn({
      challenge: options.challenge,
      answer: answer("cred-1"),
      publicKey: KEY,
      deviceName: "Arjun's phone",
    });
    expect(signedIn.ok, JSON.stringify(signedIn)).toBe(true);
    if (!signedIn.ok) return;
    expect(signedIn.value).toMatchObject({
      participantId: ARJUN.participantId,
      workspaceId: WS,
      displayName: "Arjun",
      role: "owner",
      workspaceName: "Northwind",
    });
    expect(h.devices).toEqual([
      expect.objectContaining({
        deviceId: signedIn.value.deviceId,
        participantId: ARJUN.participantId,
        publicKey: KEY,
        name: "Arjun's phone",
      }),
    ]);
    expect(h.asked.at(-1)).toBe("assert:challenge-2:0");
    expect(h.passkeys[0]?.signCount).toBe(5);
    expect(h.passkeys[0]?.lastUsedAt).not.toBeNull();
    expect(passkey.id).toBe(h.passkeys[0]?.id);
  });

  it("refuses a challenge it did not issue for a sign-in, a credential it does not know, and a withdrawn one", async () => {
    const h = harness();
    await registered(h);
    const notForSignIn = await h.use.signIn({
      challenge: "challenge-1",
      answer: answer("cred-1"),
      publicKey: KEY,
      deviceName: "x",
    });
    expect(notForSignIn.ok).toBe(false);
    if (!notForSignIn.ok) expect(notForSignIn.error.kind).toBe("unknown_challenge");

    const unknown = await h.use.signIn({
      challenge: h.use.assertionOptions().challenge,
      answer: answer("nope"),
      publicKey: KEY,
      deviceName: "x",
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.kind).toBe("unknown_passkey");

    await h.use.revoke({ principal: ARJUN, passkeyId: h.passkeys[0]?.id ?? "" });
    const gone = await h.use.signIn({
      challenge: h.use.assertionOptions().challenge,
      answer: answer("cred-1"),
      publicKey: KEY,
      deviceName: "x",
    });
    expect(gone.ok).toBe(false);
    if (!gone.ok) expect(gone.error.kind).toBe("unknown_passkey");
  });

  it("holds only so many challenges at once, and forgets the oldest first (SEC-13)", async () => {
    const h = harness({ held: 3 });
    const [first, ...rest] = Array.from({ length: 4 }, () => h.use.assertionOptions().challenge);
    const signIn = (challenge: string | undefined) =>
      h.use.signIn({
        challenge: challenge ?? "",
        answer: answer("nope"),
        publicKey: KEY,
        deviceName: "x",
      });
    expect(await signIn(first)).toMatchObject({ ok: false, error: { kind: "unknown_challenge" } });
    // The three after it are still held: each is answered, by a passkey nobody has.
    for (const challenge of rest) {
      expect(await signIn(challenge)).toMatchObject({
        ok: false,
        error: { kind: "unknown_passkey" },
      });
    }
  });

  it("pairs nothing for somebody removed from the workspace, whatever key they hold (ADR 0160)", async () => {
    const h = harness();
    await registered(h);
    h.removePerson();
    const refused = await h.use.signIn({
      challenge: h.use.assertionOptions().challenge,
      answer: answer("cred-1"),
      publicKey: KEY,
      deviceName: "x",
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.kind).toBe("unknown_passkey");
    expect(h.devices).toEqual([]);
  });

  it("pairs nothing when the signature does not verify, or the device is paired already", async () => {
    const refusing = harness({ verify: "refuse" });
    // Registration is refused too under this verifier, so seed the registry directly.
    await refusing.use.registrationOptions(ARJUN);
    refusing.passkeys.push({
      id: "pky_1",
      workspaceId: WS,
      participantId: ARJUN.participantId,
      credentialId: "cred-1",
      publicKey: JWK,
      algorithm: -8,
      signCount: 0,
      transports: [],
      name: "k",
      createdAt: "2026-09-06T00:00:00.000Z",
      lastUsedAt: null,
      revokedAt: null,
    });
    const refused = await refusing.use.signIn({
      challenge: refusing.use.assertionOptions().challenge,
      answer: answer("cred-1"),
      publicKey: KEY,
      deviceName: "x",
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.kind).toBe("refused");
    expect(refusing.devices).toEqual([]);

    const h = harness();
    await registered(h);
    const first = await h.use.signIn({
      challenge: h.use.assertionOptions().challenge,
      answer: answer("cred-1"),
      publicKey: KEY,
      deviceName: "x",
    });
    expect(first.ok).toBe(true);
    const again = await h.use.signIn({
      challenge: h.use.assertionOptions().challenge,
      answer: answer("cred-1"),
      publicKey: KEY,
      deviceName: "x",
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.kind).toBe("invalid");
  });
});
