/**
 * The claim ledger and the settings (M5.6): a key is granted to one device of a person and
 * told taken to the rest, settings round-trip with the defaults filled in, and a prune forgets
 * what is older than the moment given.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../../testing/workspace.js";
import { createNotificationRegistry } from "./notification-registry.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTestWorkspace();
});

afterEach(async () => {
  await ws.close();
});

describe("claims", () => {
  it("grants a key to the first device to ask, once, and never to a second nor to the first again", async () => {
    const registry = createNotificationRegistry(ws.db);
    const claim = (deviceId: string, keys: string[], at = "2026-09-06T12:00:00.000Z") =>
      registry.claim({
        workspaceId: ws.workspaceId,
        participantId: ws.arjun.participantId,
        deviceId,
        keys,
        at,
      });
    expect(await claim("dev_laptop", ["approval:apr_1", "digest:review:2026-09-06T12"])).toEqual([
      "approval:apr_1",
      "digest:review:2026-09-06T12",
    ]);
    // The phone asks a moment later: both keys are taken.
    expect(await claim("dev_phone", ["approval:apr_1", "digest:review:2026-09-06T12"])).toEqual([]);
    // The laptop asks again — a reload, the app opened in the morning — and is not granted
    // what it already raised (Gate 5); a new key is fresh.
    expect(await claim("dev_laptop", ["approval:apr_1", "approval:apr_2"])).toEqual([
      "approval:apr_2",
    ]);
    expect(await claim("dev_phone", ["approval:apr_2", "approval:apr_3"])).toEqual([
      "approval:apr_3",
    ]);
    // Another person's device is not in the same race.
    const danas = await registry.claim({
      workspaceId: ws.workspaceId,
      participantId: ws.dana.participantId,
      deviceId: "dev_dana",
      keys: ["approval:apr_1"],
      at: "2026-09-06T12:00:00.000Z",
    });
    expect(danas).toEqual(["approval:apr_1"]);
    expect(await claim("dev_laptop", [])).toEqual([]);
  });

  it("gives back a key a device holds, so another device may claim it, and nobody else's (ADR 0244)", async () => {
    const registry = createNotificationRegistry(ws.db);
    const claim = (deviceId: string, keys: string[]) =>
      registry.claim({
        workspaceId: ws.workspaceId,
        participantId: ws.arjun.participantId,
        deviceId,
        keys,
        at: "2026-09-06T12:00:00.000Z",
      });
    const release = (deviceId: string, keys: string[]) =>
      registry.release({
        workspaceId: ws.workspaceId,
        participantId: ws.arjun.participantId,
        deviceId,
        keys,
      });
    // The server claimed it for the phone, and the push didn't go.
    expect(await claim("dev_phone", ["decision:apr_1", "decision:apr_2"])).toEqual([
      "decision:apr_1",
      "decision:apr_2",
    ]);
    // Giving back what another device holds does nothing.
    await release("dev_laptop", ["decision:apr_1"]);
    expect(await claim("dev_laptop", ["decision:apr_1"])).toEqual([]);
    await release("dev_phone", ["decision:apr_1"]);
    expect(await claim("dev_laptop", ["decision:apr_1", "decision:apr_2"])).toEqual([
      "decision:apr_1",
    ]);
    await release("dev_phone", []);
  });

  it("forgets claims older than the moment given, and no newer", async () => {
    const registry = createNotificationRegistry(ws.db);
    const claim = (key: string, at: string) =>
      registry.claim({
        workspaceId: ws.workspaceId,
        participantId: ws.arjun.participantId,
        deviceId: "dev_laptop",
        keys: [key],
        at,
      });
    await claim("approval:old", "2026-08-20T12:00:00.000Z");
    await claim("approval:new", "2026-09-06T12:00:00.000Z");
    expect(await registry.prune("2026-08-30T00:00:00.000Z")).toBe(1);
    // Forgotten means a phone may raise it now; the newer one is still the laptop's.
    expect(
      await registry.claim({
        workspaceId: ws.workspaceId,
        participantId: ws.arjun.participantId,
        deviceId: "dev_phone",
        keys: ["approval:old", "approval:new"],
        at: "2026-09-06T13:00:00.000Z",
      }),
    ).toEqual(["approval:old"]);
  });
});

describe("settings", () => {
  it("are nothing until saved, then round-trip with the defaults filled in", async () => {
    const registry = createNotificationRegistry(ws.db);
    expect(await registry.settings(ws.workspaceId, ws.arjun.participantId)).toBeUndefined();
    await registry.saveSettings({
      workspaceId: ws.workspaceId,
      participantId: ws.arjun.participantId,
      settings: {
        decide: "now",
        review: "off",
        fyi: "daily",
        quiet: { from: "22:00", to: "07:00", breakthrough: "decide" },
        harnesses: { [ws.scout.participantId]: "decide" },
      },
      at: "2026-09-06T12:00:00.000Z",
    });
    expect(await registry.settings(ws.workspaceId, ws.arjun.participantId)).toEqual({
      decide: "now",
      review: "off",
      fyi: "daily",
      quiet: { from: "22:00", to: "07:00", breakthrough: "decide" },
      harnesses: { [ws.scout.participantId]: "decide" },
    });
    // Saved again, replaced; and Dana's are her own.
    await registry.saveSettings({
      workspaceId: ws.workspaceId,
      participantId: ws.arjun.participantId,
      settings: { decide: "off", review: "hourly", fyi: "off", harnesses: {} },
      at: "2026-09-06T13:00:00.000Z",
    });
    expect(await registry.settings(ws.workspaceId, ws.arjun.participantId)).toMatchObject({
      decide: "off",
      fyi: "off",
    });
    expect(await registry.settings(ws.workspaceId, ws.dana.participantId)).toBeUndefined();
  });
});
