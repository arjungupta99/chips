/**
 * Each person's time in the room note (ADR 0157): read from the zone of their newest phone, at
 * the instant the turn is handed over, so an agent asked for something at 10am can write it with
 * the date, the clock and the offset.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Principal } from "../../application/index.js";
import { createPushRegistry } from "../../infrastructure/store/push-registry.js";
import { createTestWorkspace, type TestWorkspace } from "../../testing/workspace.js";
import { Session, type SessionOptions } from "./session.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTestWorkspace();
});

afterEach(async () => {
  await ws.close();
});

const HELLO = JSON.stringify({
  frame: "hello",
  protocol: { min: 1, max: 1 },
  client: { name: "adapter", version: "0.1.0" },
});

/** 16:12 UTC, which is 9:12 in the morning in Los Angeles. */
const NOW = Date.parse("2026-10-13T16:12:00.000Z");

const scout = (): Principal => ({
  kind: "harness",
  participantId: ws.scout.participantId,
  workspaceId: ws.workspaceId,
  displayName: "Scout",
  via: "harness_token",
  ownerId: ws.arjun.participantId,
});

const arjun = (): Principal => ({
  kind: "person",
  participantId: ws.arjun.participantId,
  workspaceId: ws.workspaceId,
  displayName: "Arjun",
  via: "device_key",
  deviceId: ws.arjun.deviceId,
  role: "owner",
});

async function connect(zonesOf?: SessionOptions["zonesOf"]) {
  const sent: Record<string, unknown>[] = [];
  const session = new Session({
    socket: { send: (data) => sent.push(JSON.parse(data)), close: () => {} },
    principal: scout(),
    store: ws.gateway.deps.store,
    fanOut: ws.gateway.deps.fanOut,
    readModels: ws.gateway.deps.readModels,
    submitEvent: ws.gateway.deps.submitEvent,
    ids: ws.ids,
    serverVersion: "0.0.0-test",
    maxUnackedFrames: 10_000,
    now: () => NOW,
    ...(zonesOf === undefined ? {} : { zonesOf }),
  });
  await session.receive(HELLO);
  await session.receive(JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }));
  return () =>
    sent
      .filter((frame) => frame["frame"] === "event")
      .map((frame) => frame["event"] as Record<string, unknown>)
      .filter((event) => event["type"] === "message.new");
}

async function ask(text: string): Promise<void> {
  const result = await ws.gateway.deps.submitEvent({
    principal: arjun(),
    event: {
      type: "message.post",
      space_id: ws.spaceId,
      idempotency_key: `ask-${ws.ids.next("event")}`,
      text,
    },
  });
  if (!result.ok) throw new Error(result.error.message);
  // Deliveries are queued per socket: let this one land.
  await new Promise((resolve) => setTimeout(resolve, 25));
}

function roomOf(turn: Record<string, unknown> | undefined) {
  return turn?.["room"] as
    | { members: { participant_id: string; time_zone?: string }[]; notes: Record<string, string> }
    | undefined;
}

describe("a person's time in the note (ADR 0157)", () => {
  it("is their phone's, at the instant the turn is handed over", async () => {
    const phones = createPushRegistry(ws.db);
    await phones.register({
      workspaceId: ws.workspaceId,
      participantId: ws.arjun.participantId,
      deviceId: ws.arjun.deviceId,
      token: "ExponentPushToken[arjun]",
      platform: "ios",
      timeZone: "America/Los_Angeles",
      at: "2026-10-13T08:00:00.000Z",
    });
    const turns = await connect(phones.zonesOf);
    await ask("@Scout remind me at 10am to call the dentist");

    const room = roomOf(turns().at(-1));
    const person = room?.members.find((member) => member.participant_id === ws.arjun.participantId);
    expect(person?.time_zone).toBe("America/Los_Angeles");
    expect(Object.values(room?.notes ?? {}).join(" ")).toContain(
      "Arjun's time now: 9:12 am, Tuesday 13 October 2026 (2026-10-13T09:12-07:00, America/Los_Angeles).",
    );
  });

  it("is not said of a person with no phone", async () => {
    const turns = await connect(createPushRegistry(ws.db).zonesOf);
    await ask("@Scout remind me at 10am to call the dentist");
    const room = roomOf(turns().at(-1));
    expect(room).toBeDefined();
    expect(room?.members.every((member) => member.time_zone === undefined)).toBe(true);
    expect(Object.values(room?.notes ?? {}).join(" ")).not.toContain("time now");
  });
});
