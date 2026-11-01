/**
 * The dev-mode routes: laptop conveniences, loopback only. `POST /v1/dev/harnesses` mints harnesses
 * for a load run; each has a token that works and a seat in the room it was given.
 * `POST /v1/dev/messages` fills a room, so the windowing measurement can be about the client.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../../../testing/workspace.js";

let ws: TestWorkspace;
const BASE = "http://127.0.0.1";

beforeEach(async () => {
  ws = await createTestWorkspace({ config: { devMode: true } as never });
});
afterEach(async () => {
  await ws.close();
});

describe("POST /v1/dev/harnesses", () => {
  it("adds the harnesses asked for, with tokens that speak and seats in the room", async () => {
    const response = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/dev/harnesses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count: 3, space_id: ws.spaceId }),
      }),
    );
    expect(response.status).toBe(201);
    const { harnesses } = (await response.json()) as { harnesses: Record<string, string>[] };
    expect(harnesses).toHaveLength(3);
    expect(harnesses.map((a) => a["display_name"])).toEqual([
      "Load harness 1",
      "Load harness 2",
      "Load harness 3",
    ]);
    for (const harness of harnesses) {
      const role = await ws.gateway.deps.readModels.memberRole(
        ws.workspaceId,
        ws.spaceId,
        String(harness["harness_id"]),
      );
      expect(role).toBe("member");
      const me = await ws.gateway.app.fetch(
        new Request(`${BASE}/v1/participants`, {
          headers: { authorization: `Bearer ${harness["token"]}` },
        }),
      );
      expect(me.status).toBe(200);
    }
  });

  it("names a single harness when asked, for the lane demo's specialist", async () => {
    const response = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/dev/harnesses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count: 1, display_name: "Ledger" }),
      }),
    );
    expect(response.status).toBe(201);
    const { harnesses } = (await response.json()) as { harnesses: Record<string, string>[] };
    expect(harnesses.map((a) => a["display_name"])).toEqual(["Ledger"]);
  });

  it("declares what it is told each takes, nothing included, and the dial when not told", async () => {
    async function declared(body: Record<string, unknown>): Promise<unknown> {
      const response = await ws.gateway.app.fetch(
        new Request(`${BASE}/v1/dev/harnesses`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ count: 1, ...body }),
        }),
      );
      const { harnesses } = (await response.json()) as { harnesses: Record<string, string>[] };
      const row = await ws.db
        .selectFrom("participants")
        .select("capabilities")
        .where("id", "=", String(harnesses[0]?.["harness_id"]))
        .executeTakeFirstOrThrow();
      return row.capabilities === null ? null : JSON.parse(row.capabilities);
    }
    expect(await declared({ capabilities: ["new_spaces", "follows_rooms"] })).toEqual([
      "new_spaces",
      "follows_rooms",
    ]);
    expect(await declared({ capabilities: [] })).toEqual([]);
    expect(await declared({})).toEqual(["autonomy"]);
  });

  it("caps the count and refuses a body that is not JSON", async () => {
    const many = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/dev/harnesses`, {
        method: "POST",
        body: JSON.stringify({ count: 999 }),
      }),
    );
    expect(many.status).toBe(201);
    expect(((await many.json()) as { harnesses: unknown[] }).harnesses).toHaveLength(50);
    const bad = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/dev/harnesses`, { method: "POST", body: "nope" }),
    );
    expect(bad.status).toBe(422);
  });
});

describe("POST /v1/dev/people", () => {
  it("adds a person with a pairing code of their own, who can then own a harness", async () => {
    const response = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/dev/people`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Not Dana: the test workspace has one, and a name here is one person's (JR-1).
        body: JSON.stringify({ display_name: "Priya" }),
      }),
    );
    expect(response.status).toBe(201);
    const priya = (await response.json()) as Record<string, string>;
    expect(priya["person_id"]).toMatch(/^usr_/);
    expect(priya["display_name"]).toBe("Priya");
    expect(priya["code"]).toBeTruthy();
    expect(
      await ws.gateway.deps.readModels.participant(ws.workspaceId, String(priya["person_id"])),
    ).toMatchObject({ kind: "person", display_name: "Priya" });

    const owned = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/dev/harnesses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count: 1, display_name: "Ledger", owner_id: priya["person_id"] }),
      }),
    );
    expect(owned.status).toBe(201);
    const { harnesses } = (await owned.json()) as { harnesses: Record<string, string>[] };
    expect(
      await ws.gateway.deps.readModels.participant(
        ws.workspaceId,
        String(harnesses[0]?.["harness_id"]),
      ),
    ).toMatchObject({ owner_id: priya["person_id"] });
  });

  it("wants a name, and an owner who is a person", async () => {
    const nameless = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/dev/people`, { method: "POST", body: "{}" }),
    );
    expect(nameless.status).toBe(422);
    const nobody = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/dev/harnesses`, {
        method: "POST",
        body: JSON.stringify({ count: 1, owner_id: "usr_01K4ZQPX00000000000000000Z" }),
      }),
    );
    expect(nobody.status).toBe(404);
  });
});

describe("POST /v1/dev/messages", () => {
  it("fills the room with the messages asked for", async () => {
    const response = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/dev/messages`, {
        method: "POST",
        body: JSON.stringify({
          count: 25,
          space_id: ws.spaceId,
          harness_id: ws.scout.participantId,
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ count: 25 });
    const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, 1000);
    const filled = page.events.filter((event) => event.type === "message.post");
    expect(filled).toHaveLength(25);
    expect(filled.at(-1)?.payload["text"]).toBe("Filler 25 of 25");
  });

  it("needs a room and a harness to fill it from", async () => {
    const response = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/dev/messages`, {
        method: "POST",
        body: JSON.stringify({ count: 3 }),
      }),
    );
    expect(response.status).toBe(422);
  });
});

describe("through the relay (SEC-4)", () => {
  const relayed = { relay: { from: "203.0.113.5" } };
  const DEV_ROUTES = [
    "/v1/dev/pairing-code",
    "/v1/dev/people",
    "/v1/dev/harnesses",
    "/v1/dev/messages",
    "/v1/dev/join-clock",
  ];

  it("refuses a request that came through a relay's tunnel, as if the route were not there", async () => {
    for (const path of DEV_ROUTES) {
      const response = await ws.gateway.app.fetch(
        new Request(`${BASE}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ display_name: "Mallory", role: "owner", count: 1 }),
        }),
        relayed,
      );
      expect(response.status, path).toBe(404);
    }
    const people = await ws.db
      .selectFrom("participants")
      .select("display_name")
      .where("display_name", "=", "Mallory")
      .execute();
    expect(people).toEqual([]);
    // The port still answers: the laptop convenience is what it was.
    const direct = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/dev/pairing-code`, { method: "POST" }),
    );
    expect(direct.status).toBe(201);
  });

  it("stays on the port of a server that dials out to a relay, and is refused through the relay", async () => {
    // The web e2e suite and the relay bench run dev mode beside a relay and seed through these.
    const dialled = await createTestWorkspace({
      config: {
        devMode: true,
        relay: {
          url: "wss://relay.example",
          host: "127.0.0.1",
          port: 4440,
          maxSessionsPerServer: 32,
        },
      },
    });
    try {
      const onThePort = await dialled.gateway.app.fetch(
        new Request(`${BASE}/v1/dev/pairing-code`, { method: "POST" }),
      );
      expect(onThePort.status).toBe(201);
      const throughTheRelay = await dialled.gateway.app.fetch(
        new Request(`${BASE}/v1/dev/pairing-code`, { method: "POST" }),
        relayed,
      );
      expect(throughTheRelay.status).toBe(404);
    } finally {
      await dialled.close();
    }
  });
});
