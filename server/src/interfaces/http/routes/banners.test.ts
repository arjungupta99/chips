/**
 * `/v1/me/banners` (ADR 0286): what a person wants of the gold banner is theirs, for agents and
 * harnesses that exist and rooms they are in; a harness's choice takes its agents with it; each
 * change goes down their own sockets that said `banners`, and nobody else's; and a rebuild of the
 * projections leaves it standing.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import {
  createTestWorkspace,
  type TestPerson,
  type TestWorkspace,
} from "../../../testing/workspace.js";

let ws: TestWorkspace;
let port: number;

beforeEach(async () => {
  ws = await createTestWorkspace();
  ({ port } = await ws.gateway.listen());
});

afterEach(async () => {
  await ws.close();
});

async function call(
  method: "GET" | "PUT" | "DELETE",
  path: string,
  person: TestPerson,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const response = await ws.gateway.app.fetch(
    new Request(`http://chips.local${path}`, {
      method,
      headers: { "content-type": "application/json", ...person.sign(method, path, raw) },
      ...(body === undefined ? {} : { body: raw }),
    }),
  );
  const text = await response.text();
  return { status: response.status, body: text === "" ? {} : JSON.parse(text) };
}

const BANNERS = "/v1/me/banners";
const choice = (target: string) => `${BANNERS}/choices/${target}`;
const closed = (spaceId: string, asker: string) => `${BANNERS}/closed/${spaceId}/${asker}`;
const SINCE = "2026-11-08T10:00:00.000Z";

const viewOf = async (person: TestPerson) => (await call("GET", BANNERS, person)).body;

async function registerAgent(name: string): Promise<string> {
  const id = ws.ids.next("agent");
  await ws.gateway.deps.store.append({
    v: 1,
    type: "agent.registered",
    id: ws.ids.next("event"),
    ts: "2026-11-08T09:00:00.000Z",
    workspace_id: ws.workspaceId,
    actor: { kind: "harness", id: ws.scout.participantId },
    idempotency_key: ws.ids.next("event"),
    agent_id: id,
    harness_id: ws.scout.participantId,
    name,
    // biome-ignore lint/suspicious/noExplicitAny: a hand-built validated event for the test.
  } as any);
  return id;
}

/** A socket of a person's, saying in its hello what it hears beyond the base set. */
async function socketOf(person: TestPerson, accepts: string[]) {
  const ticket = await person.socketTicket();
  const socket = new WebSocket(`ws://127.0.0.1:${port}/v1/ws?ticket=${ticket}`);
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
  await until(() => frames.length > 0);
  return { socket, of: (name: string) => frames.filter((f) => f["frame"] === name), frames };
}

async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !done(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("what a person wants of the banner (ADR 0286)", () => {
  it("is nothing until they say something", async () => {
    expect(await viewOf(ws.arjun)).toEqual({ choices: {}, closed: [] });
  });

  it("keeps a choice for an agent, and lets it go", async () => {
    const jiro = await registerAgent("Jiro");
    expect((await call("PUT", choice(jiro), ws.arjun, { shown: false })).status).toBe(204);
    expect(await viewOf(ws.arjun)).toEqual({ choices: { [jiro]: false }, closed: [] });
    await call("PUT", choice(jiro), ws.arjun, { shown: true });
    expect((await viewOf(ws.arjun))["choices"]).toEqual({ [jiro]: true });
    expect((await call("DELETE", choice(jiro), ws.arjun)).status).toBe(204);
    expect((await viewOf(ws.arjun))["choices"]).toEqual({});
  });

  it("is each person's own", async () => {
    const jiro = await registerAgent("Jiro");
    await call("PUT", choice(jiro), ws.arjun, { shown: false });
    expect(await viewOf(ws.dana)).toEqual({ choices: {}, closed: [] });
  });

  it("lets a harness's choice take every agent set apart with it", async () => {
    const jiro = await registerAgent("Jiro");
    const ike = await registerAgent("Ike");
    await call("PUT", choice(jiro), ws.arjun, { shown: false });
    await call("PUT", choice(ike), ws.arjun, { shown: true });
    const harness = ws.scout.participantId;
    expect((await call("PUT", choice(harness), ws.arjun, { shown: false })).status).toBe(204);
    expect((await viewOf(ws.arjun))["choices"]).toEqual({ [harness]: false });
  });

  it("does not touch another person's agents set apart", async () => {
    const jiro = await registerAgent("Jiro");
    await call("PUT", choice(jiro), ws.dana, { shown: false });
    await call("PUT", choice(ws.scout.participantId), ws.arjun, { shown: false });
    expect((await viewOf(ws.dana))["choices"]).toEqual({ [jiro]: false });
  });

  it("refuses a person, nobody, and what is not a choice", async () => {
    const jiro = await registerAgent("Jiro");
    expect(
      (await call("PUT", choice(ws.dana.participantId), ws.arjun, { shown: false })).status,
    ).toBe(404);
    expect(
      (await call("PUT", choice("agt_01K4ZQPX0000000000000NOPE"), ws.arjun, { shown: false }))
        .status,
    ).toBe(404);
    expect((await call("PUT", choice(jiro), ws.arjun, {})).status).toBe(422);
    expect((await call("PUT", choice(jiro), ws.arjun, { shown: "no" })).status).toBe(422);
  });

  it("is a person's alone: a harness is forbidden", async () => {
    const response = await ws.gateway.app.fetch(
      new Request(`http://chips.local${BANNERS}`, { headers: ws.scout.headers }),
    );
    expect(response.status).toBe(403);
  });

  it("closes a banner in a room the person is in, for the yes given at `since`", async () => {
    const jiro = await registerAgent("Jiro");
    const path = closed(ws.spaceId, jiro);
    expect((await call("PUT", path, ws.arjun, { since: SINCE })).status).toBe(204);
    expect((await viewOf(ws.arjun))["closed"]).toEqual([
      { space_id: ws.spaceId, asker: jiro, since: SINCE },
    ]);
    // A later yes closed takes its place: one banner per agent in a room.
    const later = "2026-11-08T11:00:00.000Z";
    await call("PUT", path, ws.arjun, { since: later });
    expect((await viewOf(ws.arjun))["closed"]).toEqual([
      { space_id: ws.spaceId, asker: jiro, since: later },
    ]);
    expect((await call("DELETE", path, ws.arjun)).status).toBe(204);
    expect((await viewOf(ws.arjun))["closed"]).toEqual([]);
  });

  it("says nothing about a room the person is not in", async () => {
    const jiro = await registerAgent("Jiro");
    const elsewhere = closed("spc_01K4ZQPX0000000000000NOPE", jiro);
    expect((await call("PUT", elsewhere, ws.arjun, { since: SINCE })).status).toBe(404);
    expect((await call("DELETE", elsewhere, ws.arjun)).status).toBe(404);
  });

  it("refuses a close with no time", async () => {
    const jiro = await registerAgent("Jiro");
    expect((await call("PUT", closed(ws.spaceId, jiro), ws.arjun, {})).status).toBe(422);
  });

  it("goes whole to the person's own sockets that hear `banners`", async () => {
    const jiro = await registerAgent("Jiro");
    const ipad = await socketOf(ws.arjun, ["events", "banners"]);
    const older = await socketOf(ws.arjun, ["events"]);
    const danas = await socketOf(ws.dana, ["events", "banners"]);

    await call("PUT", choice(jiro), ws.arjun, { shown: false });
    await until(() => ipad.of("banners").length > 0);
    expect(ipad.of("banners")).toEqual([
      { frame: "banners", choices: { [jiro]: false }, closed: [] },
    ]);

    await call("PUT", closed(ws.spaceId, jiro), ws.arjun, { since: SINCE });
    await until(() => ipad.of("banners").length > 1);
    expect(ipad.of("banners")[1]).toEqual({
      frame: "banners",
      choices: { [jiro]: false },
      closed: [{ space_id: ws.spaceId, asker: jiro, since: SINCE }],
    });
    expect(older.of("banners")).toHaveLength(0);
    expect(danas.of("banners")).toHaveLength(0);
    for (const each of [ipad, older, danas]) each.socket.close();
  });

  it("says in the hello that it keeps these", async () => {
    const socket = await socketOf(ws.arjun, ["events"]);
    await until(() => socket.frames.length > 0);
    expect(JSON.stringify(socket.frames)).toContain("held_start");
    expect(JSON.stringify(socket.frames)).toContain("banners");
    socket.socket.close();
  });

  it("stands through a rebuild of the projections, which no event of the log says", async () => {
    const jiro = await registerAgent("Jiro");
    await call("PUT", choice(jiro), ws.arjun, { shown: false });
    await call("PUT", closed(ws.spaceId, jiro), ws.arjun, { since: SINCE });
    await ws.gateway.deps.store.rebuild(ws.workspaceId);
    expect(await viewOf(ws.arjun)).toEqual({
      choices: { [jiro]: false },
      closed: [{ space_id: ws.spaceId, asker: jiro, since: SINCE }],
    });
  });
});
