/**
 * Where people open a space's project, in the room note (ADR 0227): asked where a report was, an
 * agent sent Arjun to "the space's file list", which shows the page's source (2 November 2026).
 * Once the project has had a push, the room shows Universe, and the note's rules say so.
 */

import { RUNNING_WORDS, UNIVERSE_WORDS } from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Principal } from "../../application/index.js";
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

async function connect(hasProject?: SessionOptions["hasProject"]) {
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
    now: () => Date.now(),
    ...(hasProject === undefined ? {} : { hasProject }),
  });
  await session.receive(HELLO);
  await session.receive(JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }));
  return () => {
    const turns = sent
      .filter((frame) => frame["frame"] === "event")
      .map((frame) => frame["event"] as Record<string, unknown>)
      .filter((event) => event["type"] === "message.new");
    return turns.at(-1)?.["room"] as
      | { notes: Record<string, string>; rules: Record<string, string> }
      | undefined;
  };
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

describe("where the space's project opens (ADR 0227)", () => {
  it("is said once the project has had a push", async () => {
    const room = await connect(async (spaceId) => spaceId === ws.spaceId);
    await ask("@Scout where is the report?");
    const note = Object.values(room()?.notes ?? {}).join(" ");
    const universe = `${UNIVERSE_WORDS} ${RUNNING_WORDS}`;
    expect(note.endsWith(universe)).toBe(true);
    expect(Object.values(room()?.rules ?? {}).every((rules) => rules.endsWith(universe))).toBe(
      true,
    );
  });

  it("is not said of a space with no project", async () => {
    const room = await connect(async () => false);
    await ask("@Scout where is the report?");
    expect(room()).toBeDefined();
    expect(Object.values(room()?.notes ?? {}).join(" ")).not.toContain("Universe");
  });
});
