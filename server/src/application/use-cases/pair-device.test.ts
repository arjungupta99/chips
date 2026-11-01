/**
 * Pairing, which is how a person gets a credential and therefore worth being strict about.
 *
 * The properties these tests hold: a code works once, a code expires, a public key that is not
 * one is refused, and nothing about a failure tells the caller which codes have ever existed.
 */

import { manualClock } from "@chipschat/platform";
import { describe, expect, it } from "vitest";
import {
  createPairDevice,
  createPairingCodes,
  type DeviceRegistry,
  type PairingCodes,
} from "./pair-device.js";

const WORKSPACE = "ws_01K4ZQPX000000000000000001";
const PERSON = "usr_01K4ZQPX000000000000000003";
/** A 32-byte Ed25519 key in SPKI DER is 44 base64 characters. */
const PUBLIC_KEY = "MCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZuE=";

/** An in-memory registry, so a use-case test needs no database. */
function registry(): DeviceRegistry & { devices: Map<string, string> } {
  const devices = new Map<string, string>();
  return {
    devices,
    async participant(workspaceId, participantId) {
      return workspaceId === WORKSPACE && participantId === PERSON
        ? { displayName: "Arjun" }
        : undefined;
    },
    async deviceByPublicKey(_workspaceId, publicKey) {
      const deviceId = devices.get(publicKey);
      return deviceId === undefined ? undefined : { deviceId, participantId: PERSON };
    },
    async addDevice(device) {
      devices.set(device.publicKey, device.deviceId);
    },
    async device() {
      return undefined;
    },
    async devicesOf() {
      return [];
    },
    async revokeDevice() {
      return false;
    },
  };
}

function harness(startMs = 1_756_800_000_000, workspaceName = "Demo") {
  const clock = manualClock(startMs);
  const codes: PairingCodes = createPairingCodes(clock);
  const store = registry();
  let counter = 0;
  const newDeviceId = () => {
    counter += 1;
    return `dev_01K4ZQPX0000000000000000${counter.toString().padStart(2, "0")}`;
  };
  const pair = createPairDevice({
    registry: store,
    codes,
    readModels: {
      async workspace(id) {
        return id === WORKSPACE ? { workspace_id: id, name: workspaceName } : undefined;
      },
    },
    clock,
    newDeviceId,
  });
  return { clock, codes, store, pair };
}

describe("pairing codes", () => {
  it("reads aloud without a zero, a one, an O or an I", () => {
    const { codes } = harness();
    for (let i = 0; i < 200; i += 1) {
      const { code } = codes.issue({ workspaceId: WORKSPACE, participantId: PERSON });
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/);
    }
  });

  it("issues a different code every time", () => {
    const { codes } = harness();
    const issued = new Set(
      Array.from(
        { length: 300 },
        () => codes.issue({ workspaceId: WORKSPACE, participantId: PERSON }).code,
      ),
    );
    expect(issued.size).toBeGreaterThan(290);
  });

  it("forgets a code once it is taken", () => {
    const { codes } = harness();
    const { code } = codes.issue({ workspaceId: WORKSPACE, participantId: PERSON });
    expect(codes.take(code)).toBeDefined();
    expect(codes.take(code)).toBeUndefined();
  });

  it("forgets a code once it expires", () => {
    const { codes, clock } = harness();
    const { code } = codes.issue({ workspaceId: WORKSPACE, participantId: PERSON, ttlSeconds: 60 });
    clock.advance(61_000);
    expect(codes.peek(code)).toBeUndefined();
  });

  it("keeps a code that has not expired", () => {
    const { codes, clock } = harness();
    const { code } = codes.issue({ workspaceId: WORKSPACE, participantId: PERSON, ttlSeconds: 60 });
    clock.advance(59_000);
    expect(codes.peek(code)).toBeDefined();
  });
});

describe("pairing a device", () => {
  it("registers the device and says whose it is", async () => {
    const { codes, pair, store } = harness();
    const { code } = codes.issue({ workspaceId: WORKSPACE, participantId: PERSON });

    const result = await pair({ code, publicKey: PUBLIC_KEY, name: "Laptop" });
    expect(result.ok).toBe(true);
    if (!result.ok || "waiting" in result.value) return;

    expect(result.value).toMatchObject({
      participantId: PERSON,
      workspaceId: WORKSPACE,
      displayName: "Arjun",
      workspaceName: "Demo",
    });
    expect(result.value.deviceId).toMatch(/^dev_/);
    expect(store.devices.get(PUBLIC_KEY)).toBe(result.value.deviceId);
  });

  it("says nothing about the name when the workspace has none, so the client falls back", async () => {
    const { codes, pair } = harness(undefined, "");
    const { code } = codes.issue({ workspaceId: WORKSPACE, participantId: PERSON });

    const result = await pair({ code, publicKey: PUBLIC_KEY, name: "Laptop" });
    expect(result.ok).toBe(true);
    if (!result.ok || "waiting" in result.value) return;
    expect(result.value.workspaceName).toBeUndefined();
  });

  it("accepts a code however it was typed", async () => {
    const { codes, pair } = harness();
    const { code } = codes.issue({ workspaceId: WORKSPACE, participantId: PERSON });
    const result = await pair({
      code: `  ${code.toLowerCase()} `,
      publicKey: PUBLIC_KEY,
      name: "x",
    });
    expect(result.ok).toBe(true);
  });

  it("works once", async () => {
    const { codes, pair } = harness();
    const { code } = codes.issue({ workspaceId: WORKSPACE, participantId: PERSON });

    expect((await pair({ code, publicKey: PUBLIC_KEY, name: "First" })).ok).toBe(true);

    const second = await pair({ code, publicKey: PUBLIC_KEY, name: "Second" });
    expect(second).toEqual({ ok: false, error: "unknown_code" });
  });

  it("refuses a code nobody issued", async () => {
    const { pair } = harness();
    expect(await pair({ code: "ABC-234", publicKey: PUBLIC_KEY, name: "x" })).toEqual({
      ok: false,
      error: "unknown_code",
    });
  });

  it("refuses a code that has expired", async () => {
    const { codes, clock, pair } = harness();
    const { code } = codes.issue({ workspaceId: WORKSPACE, participantId: PERSON, ttlSeconds: 30 });
    clock.advance(31_000);
    expect(await pair({ code, publicKey: PUBLIC_KEY, name: "x" })).toEqual({
      ok: false,
      error: "unknown_code",
    });
  });

  it.each([
    ["something that is not base64", "not a key!!"],
    ["an empty string", ""],
    ["something far too short", "AAAA"],
    ["something far too long", "A".repeat(200)],
  ])("refuses %s as a public key", async (_reason, publicKey) => {
    const { codes, pair } = harness();
    const { code } = codes.issue({ workspaceId: WORKSPACE, participantId: PERSON });
    expect(await pair({ code, publicKey, name: "x" })).toEqual({
      ok: false,
      error: "malformed_key",
    });
  });

  it("spends no code on a key that could never pair, so the next try with a good one works", async () => {
    const { codes, pair } = harness();
    const { code } = codes.issue({ workspaceId: WORKSPACE, participantId: PERSON });

    expect(await pair({ code, publicKey: "not a key!!", name: "x" })).toEqual({
      ok: false,
      error: "malformed_key",
    });
    expect(codes.peek(code)).toBeDefined();
    expect((await pair({ code, publicKey: PUBLIC_KEY, name: "x" })).ok).toBe(true);
  });

  it("refuses a malformed key the same way whether or not the code exists", async () => {
    const { pair } = harness();
    expect(await pair({ code: "ABC-234", publicKey: "not a key!!", name: "x" })).toEqual({
      ok: false,
      error: "malformed_key",
    });
  });

  it("refuses a key some other device already registered", async () => {
    const { codes, pair } = harness();
    const first = codes.issue({ workspaceId: WORKSPACE, participantId: PERSON });
    await pair({ code: first.code, publicKey: PUBLIC_KEY, name: "First" });

    const second = codes.issue({ workspaceId: WORKSPACE, participantId: PERSON });
    expect(await pair({ code: second.code, publicKey: PUBLIC_KEY, name: "Again" })).toEqual({
      ok: false,
      error: "already_paired",
    });
  });

  it("refuses a code for a participant who is gone", async () => {
    const { codes, pair } = harness();
    const { code } = codes.issue({
      workspaceId: WORKSPACE,
      participantId: "usr_01K4ZQPX00000000000000000Z",
    });
    expect(await pair({ code, publicKey: PUBLIC_KEY, name: "x" })).toEqual({
      ok: false,
      error: "unknown_code",
    });
  });

  it("names a device that arrives without a name", async () => {
    const { codes, pair, store } = harness();
    const { code } = codes.issue({ workspaceId: WORKSPACE, participantId: PERSON });
    await pair({ code, publicKey: PUBLIC_KEY, name: "" });
    expect(store.devices.size).toBe(1);
  });
});
