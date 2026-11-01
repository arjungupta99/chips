/**
 * A harness says what is wrong on its own side (ADR 0083), and people read whether each harness
 * can answer: in the participants read, and over their socket as it changes.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createTestWorkspace, type TestWorkspace } from "../../../testing/workspace.js";

let ws: TestWorkspace;
const BASE = "http://chips.local";

beforeEach(async () => {
  ws = await createTestWorkspace();
});
afterEach(async () => {
  await ws.close();
});

async function say(
  harnessId: string,
  body: unknown,
  headers = ws.scout.headers,
): Promise<Response> {
  return await ws.gateway.app.fetch(
    new Request(`${BASE}/v1/harnesses/${harnessId}/status`, {
      method: "PUT",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

async function participants(): Promise<Record<string, unknown>[]> {
  const response = await ws.gateway.app.fetch(
    new Request(`${BASE}/v1/participants`, {
      headers: ws.arjun.sign("GET", "/v1/participants", ""),
    }),
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { participants: Record<string, unknown>[] }).participants;
}

describe("PUT /v1/harnesses/:id/status (ADR 0083)", () => {
  it("holds a harness's trouble in its state, as one line, until it says it is fine", async () => {
    const said = await say(ws.scout.participantId, {
      state: "trouble",
      reason: "  Can't reach\n its gateway ",
    });
    expect(said.status).toBe(200);
    const { state } = (await said.json()) as { state: Record<string, unknown> };
    expect(state).toMatchObject({
      connected: true,
      trouble: { reason: "Can't reach its gateway" },
    });

    const scout = (await participants()).find((each) => each["id"] === ws.scout.participantId);
    expect(scout?.["state"]).toEqual(state);
    // A person has no state: it is a harness's.
    const arjun = (await participants()).find((each) => each["id"] === ws.arjun.participantId);
    expect(arjun).not.toHaveProperty("state");

    const fine = await say(ws.scout.participantId, { state: "ok" });
    expect(((await fine.json()) as { state: Record<string, unknown> }).state).not.toHaveProperty(
      "trouble",
    );
  });

  it("refuses a state it cannot read, and trouble with no reason or too long a one", async () => {
    for (const body of [
      { state: "broken" },
      { state: "trouble" },
      { state: "trouble", reason: "   " },
      { state: "trouble", reason: "x".repeat(201) },
    ]) {
      const refused = await say(ws.scout.participantId, body);
      expect(refused.status, JSON.stringify(body)).toBe(422);
    }
  });

  it("is a harness's own to say: not another harness's, and not a person's", async () => {
    expect((await say("hrn_01K4ZQPX000000000000000099", { state: "ok" })).status).toBe(403);
    const path = `/v1/harnesses/${ws.scout.participantId}/status`;
    const raw = JSON.stringify({ state: "trouble", reason: "Arjun says so" });
    const asArjun = await ws.gateway.app.fetch(
      new Request(`${BASE}${path}`, {
        method: "PUT",
        headers: { "content-type": "application/json", ...ws.arjun.sign("PUT", path, raw) },
        body: raw,
      }),
    );
    expect(asArjun.status).toBe(403);
  });
});

describe("the presence frame (ADR 0083)", () => {
  it("tells a person's socket that asked for it when a harness's state changes, and no other", async () => {
    const { port } = await ws.gateway.listen();
    const open = async (accepts: string[]) => {
      const ticket = await ws.arjun.socketTicket();
      const socket = new WebSocket(
        `ws://127.0.0.1:${port}/v1/ws?ticket=${encodeURIComponent(ticket)}`,
      );
      const frames: Record<string, unknown>[] = [];
      socket.on("message", (data) => frames.push(JSON.parse(data.toString())));
      await new Promise<void>((resolve, reject) => {
        socket.once("open", () => resolve());
        socket.once("error", reject);
      });
      socket.send(
        JSON.stringify({
          frame: "hello",
          protocol: { min: 1, max: 1 },
          client: { name: "test", version: "0" },
          accepts,
        }),
      );
      // The hello's answer, so the socket's accepts are known before anything changes.
      for (let i = 0; i < 100 && frames.length === 0; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return { socket, frames };
    };
    const asked = await open(["events", "presence"]);
    const not = await open(["events"]);

    await say(ws.scout.participantId, { state: "trouble", reason: "Can't reach its gateway" });
    for (let i = 0; i < 100 && !asked.frames.some((f) => f["frame"] === "presence"); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(asked.frames.find((f) => f["frame"] === "presence")).toMatchObject({
      participant_id: ws.scout.participantId,
      state: { connected: true, trouble: { reason: "Can't reach its gateway" } },
    });
    expect(not.frames.some((f) => f["frame"] === "presence")).toBe(false);
    asked.socket.close();
    not.socket.close();
  });
});
