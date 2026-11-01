/**
 * The demo's device (ADR 0213): fixed ids the protocol takes, a key made in memory that signs, and
 * a person who owns a made-up workspace and is walked through no setup.
 */

import { isId, parseId } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import { signRequest } from "../device.js";
import type { Directory } from "../events.js";
import { ownsWorkspace, showsSetupCard, showsWelcome } from "../setup.js";
import {
  DEMO_DEVICE_ID,
  DEMO_PERSON_ID,
  DEMO_WORKSPACE_ID,
  demoDevice,
  demoId,
  isDemo,
} from "./device.js";

describe("the demo's ids", () => {
  it("are real prefixed ULIDs, fixed, one per number", () => {
    expect(demoId("event", 7)).toBe("evt_01KDEM00000000000000000007");
    expect(isId("device", DEMO_DEVICE_ID)).toBe(true);
    expect(isId("workspace", DEMO_WORKSPACE_ID)).toBe(true);
    expect(parseId(demoId("space", 123)).kind).toBe("space");
  });
});

describe("the demo's device", () => {
  it("is You in Chips demo, reaching no server, with a key that signs", async () => {
    const device = await demoDevice();
    expect(device).toMatchObject({
      deviceId: DEMO_DEVICE_ID,
      participantId: DEMO_PERSON_ID,
      workspaceId: DEMO_WORKSPACE_ID,
      displayName: "You",
      workspaceName: "Chips demo",
    });
    expect(device.serverUrl).toBeUndefined();
    expect(device.serverKey).toBeUndefined();
    expect(device.relayUrl).toBeUndefined();
    const headers = await signRequest(device, "GET", "/v1/attachments/x", "", {});
    expect(headers["x-chips-device"]).toBe(DEMO_DEVICE_ID);
    expect(headers["x-chips-signature"]).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("is told from any other device", async () => {
    expect(isDemo(await demoDevice())).toBe(true);
    expect(isDemo({ deviceId: "dev_01K4ZZZZZZZZZZZZZZZZZZZZZZ" })).toBe(false);
    expect(isDemo(undefined)).toBe(false);
  });
});

describe("the first run, for the demo's You", () => {
  const owner = (id: string): Directory => ({
    [id]: { id, kind: "person", displayName: "You", role: "owner" },
  });
  const facts = (directory: Directory) => ({
    server: {} as never,
    devices: [],
    directory,
  });

  it("shows no welcome and no setup card, though You owns the workspace and no agent has joined", () => {
    const directory = owner(DEMO_PERSON_ID);
    expect(ownsWorkspace(directory, DEMO_PERSON_ID)).toBe(false);
    expect(showsWelcome(directory, DEMO_PERSON_ID, false)).toBe(false);
    expect(showsSetupCard(facts(directory), DEMO_PERSON_ID, [], false)).toBe(false);
  });

  it("still shows both to the owner of a real workspace", () => {
    const id = "usr_01K4ZZZZZZZZZZZZZZZZZZZZZZ";
    const step = { id: "running" as const, title: "Chips is running", done: false };
    expect(ownsWorkspace(owner(id), id)).toBe(true);
    expect(showsWelcome(owner(id), id, false)).toBe(true);
    expect(showsSetupCard(facts(owner(id)), id, [step], false)).toBe(true);
  });
});
