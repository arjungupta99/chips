/**
 * A person pauses the agents in a room, or lets them carry on (ADR 0097), through
 * `POST /v1/spaces/:id/exchange`: in the log as `exchange.set`, said once, and refused to a harness,
 * to somebody not in the room, and to a state it does not know.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestWorkspace,
  type TestPerson,
  type TestWorkspace,
} from "../../../testing/workspace.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTestWorkspace();
});

afterEach(async () => {
  await ws.close();
});

async function call(
  method: string,
  path: string,
  headers: Readonly<Record<string, string>>,
  body: unknown,
) {
  const response = await ws.gateway.app.fetch(
    new Request(`http://chips.local${path}`, {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

const set = (who: TestPerson, state: unknown, space = ws.spaceId) => {
  const path = `/v1/spaces/${space}/exchange`;
  const body = { state };
  return call("POST", path, who.sign("POST", path, JSON.stringify(body)), body);
};

async function logged(): Promise<Record<string, unknown>[]> {
  const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, 1000);
  return page.events
    .filter((event) => event.type === "exchange.set")
    .map((event) => ({ state: event.payload["state"], by: event.actor.id }));
}

describe("POST /v1/spaces/:id/exchange", () => {
  it("pauses the agents once, and lets them carry on, each in the log as the person's", async () => {
    expect(await set(ws.arjun, "paused")).toEqual({
      status: 200,
      json: { space_id: ws.spaceId, state: "paused", changed: true },
    });
    expect((await set(ws.arjun, "paused")).json["changed"]).toBe(false);
    expect((await set(ws.arjun, "going")).json).toEqual({
      space_id: ws.spaceId,
      state: "going",
      changed: true,
    });
    expect(await logged()).toEqual([
      { state: "paused", by: ws.arjun.participantId },
      { state: "going", by: ws.arjun.participantId },
    ]);
  });

  it("is refused to a harness, a room the person is not in, and a state it does not know", async () => {
    const path = `/v1/spaces/${ws.spaceId}/exchange`;
    expect((await call("POST", path, ws.scout.headers, { state: "paused" })).status).toBe(403);
    expect((await set(ws.arjun, "paused", ws.ids.next("space"))).status).toBe(404);
    expect((await set(ws.arjun, "stopped")).status).toBe(422);
    expect(await logged()).toEqual([]);
  });
});
