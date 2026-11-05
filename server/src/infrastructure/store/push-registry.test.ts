/**
 * Where a push may reach a phone (M4.3): a device registers once and re-registers freely, a
 * read gathers a group of people in one go, and a revoked device is not among them.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../../testing/workspace.js";
import { createPushRegistry } from "./push-registry.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTestWorkspace();
});

afterEach(async () => {
  await ws.close();
});

const AT = "2026-09-08T12:00:00.000Z";

function register(
  registry: ReturnType<typeof createPushRegistry>,
  who: { participantId: string; deviceId: string },
  over: { token?: string; timeZone?: string; at?: string } = {},
) {
  return registry.register({
    workspaceId: ws.workspaceId,
    participantId: who.participantId,
    deviceId: who.deviceId,
    token: over.token ?? `ExponentPushToken[${who.deviceId}]`,
    platform: "ios",
    timeZone: over.timeZone ?? "Europe/London",
    at: over.at ?? AT,
  });
}

describe("registering", () => {
  it("keeps one row per device, replacing the token and the zone", async () => {
    const registry = createPushRegistry(ws.db);
    await register(registry, ws.arjun, { token: "one", timeZone: "Europe/London" });
    await register(registry, ws.arjun, { token: "two", timeZone: "Asia/Kolkata" });

    const found = await registry.forPeople(ws.workspaceId, [ws.arjun.participantId]);
    expect(found).toEqual([
      {
        deviceId: ws.arjun.deviceId,
        participantId: ws.arjun.participantId,
        token: "two",
        platform: "ios",
        timeZone: "Asia/Kolkata",
      },
    ]);
  });

  it("forgets a device on request, and says nothing about one that was never there", async () => {
    const registry = createPushRegistry(ws.db);
    await register(registry, ws.arjun);
    await registry.remove(ws.arjun.deviceId);
    expect(await registry.forPeople(ws.workspaceId, [ws.arjun.participantId])).toEqual([]);
    await expect(registry.remove("dev_nobody")).resolves.toBeUndefined();
  });

  it("forgets a token wherever it is held, once no phone has it, and nobody else's", async () => {
    const registry = createPushRegistry(ws.db);
    await register(registry, ws.arjun, { token: "ExponentPushToken[deleted]" });
    await register(registry, ws.dana, { token: "ExponentPushToken[alive]" });
    expect(await registry.removeToken("ExponentPushToken[deleted]")).toBe(1);
    expect(await registry.removeToken("ExponentPushToken[deleted]")).toBe(0);
    const left = await registry.forPeople(ws.workspaceId, [
      ws.arjun.participantId,
      ws.dana.participantId,
    ]);
    expect(left.map((each) => each.token)).toEqual(["ExponentPushToken[alive]"]);
  });
});

describe("reading a group", () => {
  it("gathers everyone named and nobody else, in one call", async () => {
    const registry = createPushRegistry(ws.db);
    await register(registry, ws.arjun);
    await register(registry, ws.dana);

    const both = await registry.forPeople(ws.workspaceId, [
      ws.arjun.participantId,
      ws.dana.participantId,
    ]);
    expect(both.map((row) => row.participantId).sort()).toEqual(
      [ws.arjun.participantId, ws.dana.participantId].sort(),
    );

    const one = await registry.forPeople(ws.workspaceId, [ws.dana.participantId]);
    expect(one.map((row) => row.participantId)).toEqual([ws.dana.participantId]);
  });

  it("names nobody when nobody is asked for, without a query", async () => {
    const registry = createPushRegistry(ws.db);
    await register(registry, ws.arjun);
    expect(await registry.forPeople(ws.workspaceId, [])).toEqual([]);
  });

  it("leaves out a device that was revoked: it holds no key and answers nothing", async () => {
    const registry = createPushRegistry(ws.db);
    await register(registry, ws.arjun);
    await ws.db
      .updateTable("devices")
      .set({ revoked_at: AT })
      .where("id", "=", ws.arjun.deviceId)
      .execute();

    expect(await registry.forPeople(ws.workspaceId, [ws.arjun.participantId])).toEqual([]);
  });
});

describe("a person's zone (ADR 0157)", () => {
  it("is their newest phone's, and nobody without a phone has one", async () => {
    const registry = createPushRegistry(ws.db);
    await register(registry, ws.arjun, { timeZone: "Asia/Kolkata", at: AT });
    // A second phone of Arjun's, registered later: where he last opened Chips.
    await register(
      registry,
      { participantId: ws.arjun.participantId, deviceId: ws.dana.deviceId },
      { timeZone: "America/Los_Angeles", at: "2026-09-09T12:00:00.000Z" },
    );

    const zones = await registry.zonesOf(ws.workspaceId, [ws.arjun.participantId, "usr_nobody"]);
    expect([...zones]).toEqual([[ws.arjun.participantId, "America/Los_Angeles"]]);
    expect((await registry.zonesOf(ws.workspaceId, [])).size).toBe(0);
  });

  it("leaves out a revoked phone", async () => {
    const registry = createPushRegistry(ws.db);
    await register(registry, ws.arjun, { timeZone: "Asia/Kolkata" });
    await ws.db
      .updateTable("devices")
      .set({ revoked_at: AT })
      .where("id", "=", ws.arjun.deviceId)
      .execute();
    expect((await registry.zonesOf(ws.workspaceId, [ws.arjun.participantId])).size).toBe(0);
  });
});
