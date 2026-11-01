/**
 * The workspace's own name (ADR 0194): changed by an owner and nobody else, written to the
 * registry and recorded as `workspace.renamed`, heard at once by every socket that is open, and
 * said by every hello after.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Principal } from "../../../application/index.js";
import { createTestWorkspace, type TestWorkspace } from "../../../testing/workspace.js";
import { Session } from "../../ws/session.js";

let ws: TestWorkspace;
const BASE = "http://chips.local";
const PATH = "/v1/workspace/name";

beforeEach(async () => {
  ws = await createTestWorkspace();
});
afterEach(async () => {
  await ws.close();
});

type Signer = { sign: TestWorkspace["arjun"]["sign"] };

async function rename(
  body: Record<string, unknown>,
  as: Signer | Record<string, string>,
): Promise<Response> {
  const raw = JSON.stringify(body);
  const headers = "sign" in as ? (as as Signer).sign("POST", PATH, raw) : as;
  return await ws.gateway.app.fetch(
    new Request(`${BASE}${PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: raw,
    }),
  );
}

async function called(): Promise<string | undefined> {
  return (await ws.gateway.deps.readModels.workspace(ws.workspaceId))?.name;
}

async function renames() {
  return await ws.db
    .selectFrom("events")
    .select(["payload", "actor_id"])
    .where("type", "=", "workspace.renamed")
    .execute();
}

const HELLO = JSON.stringify({
  frame: "hello",
  protocol: { min: 1, max: 1 },
  client: { name: "web", version: "0.1.0" },
});

/** A socket of Dana's, a member: what it is sent, the hello first. */
async function connect() {
  const sent: Record<string, unknown>[] = [];
  const dana: Principal = {
    kind: "person",
    participantId: ws.dana.participantId,
    workspaceId: ws.workspaceId,
    displayName: "Dana",
    via: "device_key",
    deviceId: ws.dana.deviceId,
    role: "member",
  };
  const session = new Session({
    socket: { send: (data) => sent.push(JSON.parse(data)), close: () => {} },
    principal: dana,
    store: ws.gateway.deps.store,
    fanOut: ws.gateway.deps.fanOut,
    readModels: ws.gateway.deps.readModels,
    submitEvent: ws.gateway.deps.submitEvent,
    ids: ws.ids,
    serverVersion: "0.0.0-test",
    maxUnackedFrames: 10_000,
    now: () => Date.now(),
  });
  await session.receive(HELLO);
  await session.receive(JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }));
  return sent;
}

/** What the socket's hello called the workspace: the first frame it is sent. */
const calledBy = (sent: readonly Record<string, unknown>[]) =>
  (sent[0]?.["event"] as Record<string, unknown> | undefined)?.["workspace"];

const eventsOf = (sent: readonly Record<string, unknown>[], type: string) =>
  sent
    .filter((frame) => frame["frame"] === "event")
    .map((frame) => frame["event"] as Record<string, unknown>)
    .filter((event) => event["type"] === type);

describe("POST /v1/workspace/name (ADR 0194)", () => {
  it("renames the workspace in the registry, and records it once", async () => {
    const response = await rename({ name: "  Primal   Labs " }, ws.arjun);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      workspace_id: ws.workspaceId,
      name: "Primal Labs",
      previous_name: "Solo",
    });
    expect(body["event_id"]).toMatch(/^evt_/);
    expect(await called()).toBe("Primal Labs");

    const logged = await renames();
    expect(logged).toHaveLength(1);
    expect(logged[0]?.actor_id).toBe(ws.arjun.participantId);
    expect(JSON.parse(String(logged[0]?.payload))).toMatchObject({
      name: "Primal Labs",
      previous_name: "Solo",
    });

    // The same name again changes nothing and records nothing.
    const again = await rename({ name: "Primal Labs" }, ws.arjun);
    expect(again.status).toBe(200);
    expect((await again.json()) as Record<string, unknown>).not.toHaveProperty("event_id");
    expect(await renames()).toHaveLength(1);
  });

  it("is an owner's alone: not an admin's, a member's or a harness's", async () => {
    const admin = await ws.addPerson("Ada", "admin");
    expect((await rename({ name: "Ada's" }, admin)).status).toBe(403);
    expect((await rename({ name: "Dana's" }, ws.dana)).status).toBe(403);
    expect((await rename({ name: "Scout's" }, ws.scout.headers)).status).toBe(403);
    expect(await called()).toBe("Solo");
    expect(await renames()).toHaveLength(0);
  });

  it("refuses nothing, a paragraph, and no name at all", async () => {
    expect((await rename({ name: "   " }, ws.arjun)).status).toBe(422);
    expect((await rename({ name: "x".repeat(121) }, ws.arjun)).status).toBe(422);
    expect((await rename({}, ws.arjun)).status).toBe(422);
    expect(await called()).toBe("Solo");
  });

  it("refuses a name a joiner would read wrong: a direction mark, mixed letters (SEC-33)", async () => {
    const turned = await rename({ name: "\u202eSolo Labs" }, ws.arjun);
    expect(turned.status).toBe(422);
    expect(((await turned.json()) as { error: { message: string } }).error.message).toMatch(
      /^A name can't have hidden characters in it/,
    );
    expect((await rename({ name: "S\u043elo" }, ws.arjun)).status).toBe(422);
    expect(await called()).toBe("Solo");
  });

  it("is heard at once by a socket that is open, and said by the next hello", async () => {
    const before = await connect();
    expect(before[0]).toMatchObject({ frame: "event", event: { type: "hello" } });
    expect(calledBy(before)).toEqual({ name: "Solo" });

    await rename({ name: "Primal" }, ws.arjun);
    // Deliveries are queued per socket: let this one land.
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(eventsOf(before, "workspace.renamed")).toEqual([
      expect.objectContaining({ name: "Primal", previous_name: "Solo" }),
    ]);

    const after = await connect();
    expect(calledBy(after)).toEqual({ name: "Primal" });
  });
});
