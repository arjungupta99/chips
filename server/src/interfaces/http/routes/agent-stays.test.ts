/**
 * An agent's message history (ADR 0087, rule 3.11, Phase 5): `GET /v1/agents/:id/stays` says the
 * rooms it has been in, oldest first, and from when to when. A room the reader is in comes by id,
 * for the client to draw from what it holds; one they are not in is its dates and a count. What a
 * free agent says waits for its next room, and only its harness is told the words.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Principal } from "../../../application/index.js";
import {
  createTestWorkspace,
  type TestPerson,
  type TestWorkspace,
} from "../../../testing/workspace.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTestWorkspace();
  await ws.gateway.deps.upgradeAgents.apply(ws.workspaceId);
});

afterEach(async () => {
  await ws.close();
});

function person(who: TestPerson, name: string): Principal {
  return {
    kind: "person",
    participantId: who.participantId,
    workspaceId: ws.workspaceId,
    displayName: name,
    via: "device_key",
    deviceId: who.deviceId,
    // Their standing, as the authenticator reads it: Arjun owns the workspace, Dana is a member.
    role: who.participantId === ws.arjun.participantId ? "owner" : "member",
  };
}

const arjun = () => person(ws.arjun, "Arjun");
const scout = (): Principal => ({
  kind: "harness",
  participantId: ws.scout.participantId,
  workspaceId: ws.workspaceId,
  displayName: "Scout",
  via: "harness_token",
  ownerId: ws.arjun.participantId,
});

async function ok(principal: Principal, event: Record<string, unknown>) {
  const result = await ws.gateway.deps.submitEvent({
    event: { idempotency_key: `k-${ws.ids.next("event")}`, ...event },
    principal,
  });
  if (!result.ok) throw new Error(`refused: ${result.error.kind}: ${result.error.message}`);
  return result.value.event;
}

async function call(
  method: string,
  path: string,
  headers: Readonly<Record<string, string>>,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const raw = body === undefined ? undefined : JSON.stringify(body);
  const response = await ws.gateway.app.fetch(
    new Request(`http://chips.local${path}`, {
      method,
      headers: { "content-type": "application/json", ...headers },
      ...(raw === undefined ? {} : { body: raw }),
    }),
  );
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

async function staysAs(who: TestPerson, agentId: string) {
  const path = `/v1/agents/${agentId}/stays`;
  return call("GET", path, who.sign("GET", path, ""));
}

/** Scout's default agent, which the upgrade put in the harness's place in PO-4471. */
async function scoutsAgent(): Promise<string> {
  const agent = await ws.gateway.deps.readModels.agentByKey(
    ws.workspaceId,
    ws.scout.participantId,
    ws.scout.participantId,
  );
  if (agent === undefined) throw new Error("Scout has no agent");
  return agent.agent_id;
}

/** The seq the harness itself joined PO-4471 at, before there were agents. */
async function harnessJoined(): Promise<number> {
  const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, 1000);
  const joined = page.events.find(
    (event) =>
      event.type === "membership.added" &&
      event.payload["participant_id"] === ws.scout.participantId,
  );
  if (joined === undefined) throw new Error("Scout never joined");
  return joined.seq;
}

async function room(by: Principal, title: string): Promise<string> {
  // A member opens no space (ADR 0196): a room of Dana's is one an admin made for her.
  if (by.role === "member") return ws.roomOf(by.participantId, title);
  const id = ws.ids.next("space");
  await ok(by, { type: "space.created", space_id: id, kind: "group", title });
  return id;
}

const release = (agentId: string, spaceId = ws.spaceId) =>
  ok(arjun(), {
    type: "membership.removed",
    space_id: spaceId,
    participant_id: agentId,
    removed_by: ws.arjun.participantId,
  });

describe("the rooms an agent has been in", () => {
  it("starts where its harness's place was taken, and counts what it was asked and said", async () => {
    const agent = await scoutsAgent();
    await ok(arjun(), { type: "message.post", space_id: ws.spaceId, text: "Is PO-4471 in?" });
    await ok(scout(), {
      type: "message.post",
      space_id: ws.spaceId,
      text: "Confirmed with Northwind.",
    });

    const { status, json } = await staysAs(ws.arjun, agent);
    expect(status).toBe(200);
    expect(json).toEqual({
      agent_id: agent,
      stays: [
        {
          readable: true,
          space_id: ws.spaceId,
          from_seq: await harnessJoined(),
          to_seq: null,
          from: expect.any(String),
          to: null,
          lines: 2,
        },
      ],
    });
  });

  it("is a stay per room, the room it left keeping its stretch", async () => {
    const agent = await scoutsAgent();
    const other = await room(arjun(), "Lamps");
    const moved = await ws.gateway.deps.moveAgent({
      principal: arjun(),
      agentId: agent,
      spaceId: other,
    });
    expect(moved).toMatchObject({ ok: true, moved: true });

    const { json } = await staysAs(ws.arjun, agent);
    const stays = json["stays"] as Record<string, unknown>[];
    expect(stays.map((stay) => stay["space_id"])).toEqual([ws.spaceId, other]);
    expect(stays[0]?.["to_seq"]).toEqual(expect.any(Number));
    expect(stays[1]).toMatchObject({ readable: true, to_seq: null, to: null });
  });

  it("ends a stay at the room's archive", async () => {
    const agent = await scoutsAgent();
    const archived = await ok(arjun(), {
      type: "space.updated",
      space_id: ws.spaceId,
      state: "closed",
    });

    const { json } = await staysAs(ws.arjun, agent);
    expect(json["stays"]).toEqual([
      expect.objectContaining({ space_id: ws.spaceId, to_seq: archived.seq, to: archived.ts }),
    ]);
  });

  it("goes with its place: an agent put in its place has the stay, and what was said in it", async () => {
    const replaced = await scoutsAgent();
    await ok(scout(), { type: "message.post", space_id: ws.spaceId, text: "Morning." });
    const made = await call(
      "POST",
      `/v1/harnesses/${ws.scout.participantId}/agents`,
      ws.scout.headers,
      {
        key: "tree",
        name: "Tree",
      },
    );
    const tree = String(made.json["agent_id"]);
    const attached = await call("POST", `/v1/agents/${tree}/attach`, ws.scout.headers, {
      space_id: ws.spaceId,
      replacing: replaced,
    });
    expect(attached.json).toMatchObject({ attached: true });

    expect((await staysAs(ws.arjun, replaced)).json["stays"]).toEqual([]);
    expect((await staysAs(ws.arjun, tree)).json["stays"]).toEqual([
      expect.objectContaining({ space_id: ws.spaceId, from_seq: await harnessJoined(), lines: 1 }),
    ]);
  });

  it("forgets an erased room", async () => {
    const agent = await scoutsAgent();
    const other = await room(arjun(), "Lamps");
    await ws.gateway.deps.moveAgent({ principal: arjun(), agentId: agent, spaceId: other });
    expect((await ws.gateway.deps.eraseSpace({ principal: arjun(), spaceId: other })).ok).toBe(
      true,
    );

    const { json } = await staysAs(ws.arjun, agent);
    expect((json["stays"] as Record<string, unknown>[]).map((stay) => stay["space_id"])).toEqual([
      ws.spaceId,
    ]);
  });
});

describe("who is told what", () => {
  /** Scout's agent leaves PO-4471, and is put in a room of Dana's for her that Arjun is not in. */
  async function intoDanas(): Promise<{ agent: string; danas: string }> {
    const agent = await scoutsAgent();
    await release(agent);
    const dana = person(ws.dana, "Dana");
    const danas = await room(dana, "Dana's lamps");
    // A member puts only an agent of her own harness in a room (ADR 0034's addendum).
    await ws.agentInto(danas, agent);
    await ok(dana, { type: "message.post", space_id: danas, text: "Which lamp is cheaper?" });
    return { agent, danas };
  }

  it("names a room the reader is in, and tells only the dates and a count of one they're not", async () => {
    const { agent } = await intoDanas();
    const { json } = await staysAs(ws.arjun, agent);
    const stays = json["stays"] as Record<string, unknown>[];
    expect(stays).toHaveLength(2);
    expect(stays[0]).toMatchObject({ readable: true, space_id: ws.spaceId });
    expect(stays[1]).toEqual({ readable: false, from: expect.any(String), to: null, lines: 1 });
  });

  it("tells a guest only the rooms they are in, and nothing of an agent they share none with", async () => {
    const { agent, danas } = await intoDanas();
    const gus = await ws.addPerson("Gus", "guest");
    await ok(arjun(), {
      type: "membership.added",
      space_id: ws.spaceId,
      participant_id: gus.participantId,
      participant_kind: "person",
      role: "member",
    });
    const { json } = await staysAs(gus, agent);
    expect(json["stays"]).toEqual([
      expect.objectContaining({ readable: true, space_id: ws.spaceId }),
    ]);
    expect(JSON.stringify(json)).not.toContain(danas);

    const stranger = await ws.addPerson("Stella", "guest");
    expect((await staysAs(stranger, agent)).status).toBe(404);
  });

  it("is a person's to read, of an agent", async () => {
    const agent = await scoutsAgent();
    const path = `/v1/agents/${agent}/stays`;
    expect((await call("GET", path, ws.scout.headers)).status).toBe(403);
    expect((await staysAs(ws.arjun, "agt_nobody")).status).toBe(404);
    expect((await staysAs(ws.arjun, ws.dana.participantId)).status).toBe(404);
  });
});

describe("what a free agent says (rule 6)", () => {
  it("is counted on its row for people, and its words go to its harness alone", async () => {
    const agent = await scoutsAgent();
    await release(agent);
    const held = await ok(scout(), {
      type: "message.post",
      space_id: ws.spaceId,
      text: "The nightly check found the sofa on sale.",
    });
    expect(held).toMatchObject({ type: "message.held", space_id: null });

    const listed = await call(
      "GET",
      "/v1/participants",
      ws.arjun.sign("GET", "/v1/participants", ""),
    );
    const row = (listed.json["participants"] as Record<string, unknown>[]).find(
      (each) => each["id"] === agent,
    );
    expect(row).toMatchObject({ held: 1, room: null });

    const replay = (participantId: string, alsoIs: string[] = []) =>
      ws.gateway.deps.store.since(ws.workspaceId, 0, 1000, { spaces: [], participantId, alsoIs });
    const types = async (participantId: string, alsoIs?: string[]) =>
      (await replay(participantId, alsoIs)).events.map((event) => event.type);
    expect(await types(ws.arjun.participantId)).not.toContain("message.held");
    expect(await types(ws.dana.participantId)).not.toContain("message.held");
    expect(await types(ws.scout.participantId, [agent])).toContain("message.held");
  });
});
