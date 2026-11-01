/**
 * An agent's face (ADR 0089): `PUT /v1/agents/:id/face` gives it a mark and a ground, one for
 * everybody, and `DELETE` gives it its initials back. A person's to do, never a guest's or a
 * harness's. It is the log's: `agent.updated` carries it, the directory says it, and a rebuild
 * keeps it.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestWorkspace,
  type TestPerson,
  type TestWorkspace,
} from "../../../testing/workspace.js";

let ws: TestWorkspace;
let agent: string;

beforeEach(async () => {
  ws = await createTestWorkspace();
  await ws.gateway.deps.upgradeAgents.apply(ws.workspaceId);
  // Scout's default agent, which the upgrade put in the harness's place in PO-4471.
  const found = await ws.gateway.deps.readModels.agentByKey(
    ws.workspaceId,
    ws.scout.participantId,
    ws.scout.participantId,
  );
  if (found === undefined) throw new Error("Scout has no agent");
  agent = found.agent_id;
});

afterEach(async () => {
  await ws.close();
});

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
  const text = await response.text();
  return { status: response.status, json: text === "" ? {} : JSON.parse(text) };
}

const path = (agentId = agent) => `/v1/agents/${agentId}/face`;

function put(who: TestPerson, face: unknown, agentId = agent) {
  return call("PUT", path(agentId), who.sign("PUT", path(agentId), JSON.stringify(face)), face);
}

function clear(who: TestPerson, agentId = agent) {
  return call("DELETE", path(agentId), who.sign("DELETE", path(agentId), ""));
}

/** The agent's row as the directory hands it to a person. */
async function listed(who: TestPerson): Promise<Record<string, unknown> | undefined> {
  const answer = await call("GET", "/v1/participants", who.sign("GET", "/v1/participants", ""));
  const all = answer.json["participants"] as Record<string, unknown>[];
  return all.find((each) => each["id"] === agent);
}

async function updates(): Promise<Record<string, unknown>[]> {
  const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, 1000);
  return page.events
    .filter((event) => event.type === "agent.updated" && "face" in event.payload)
    .map((event) => ({ actor: event.actor, ...event.payload }));
}

describe("an agent's face", () => {
  it("is nothing until chosen, then the same for everybody, and can be taken back", async () => {
    expect((await listed(ws.arjun))?.["face"]).toBeNull();

    const face = { icon: "cart", ground: 4 };
    const set = await put(ws.arjun, face);
    expect(set.status).toBe(200);
    expect(set.json).toEqual({ agent_id: agent, face });

    // Dana chose nothing, and sees what Arjun chose: the face is the agent's.
    expect((await listed(ws.dana))?.["face"]).toEqual(face);
    const recorded = await updates();
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      actor: { kind: "person", id: ws.arjun.participantId },
      agent_id: agent,
      face,
    });

    const gone = await clear(ws.dana);
    expect(gone.status).toBe(204);
    expect((await listed(ws.arjun))?.["face"]).toBeNull();
    expect((await updates()).at(-1)).toMatchObject({ agent_id: agent, face: null });
  });

  it("records nothing for the face it already wears", async () => {
    const face = { icon: "tent", ground: 21 };
    await put(ws.arjun, face);
    await put(ws.dana, face);
    expect(await updates()).toHaveLength(1);

    // Nothing to take back from an agent that wears its initials.
    await clear(ws.arjun);
    await clear(ws.arjun);
    expect(await updates()).toHaveLength(2);
  });

  it("takes a colour with no mark, which is the initials on that ground", async () => {
    const set = await put(ws.arjun, { icon: "", ground: 12 });
    expect(set.status).toBe(200);
    expect((await listed(ws.arjun))?.["face"]).toEqual({ icon: "", ground: 12 });
  });

  it("takes a letter or two, or an emoji, in place of a mark (ADR 0139)", async () => {
    const face = { icon: "", ground: 6, letters: "🤖" };
    expect((await put(ws.arjun, face)).status).toBe(200);
    expect((await listed(ws.dana))?.["face"]).toEqual(face);
    // Other letters are another face; the same letters again are not.
    await put(ws.arjun, { ...face, letters: "AI" });
    await put(ws.arjun, { ...face, letters: "AI" });
    expect(await updates()).toHaveLength(2);
    expect((await put(ws.arjun, { ...face, letters: "A I" })).status).toBe(422);
  });

  it("keeps its name through a face, and its face through a rename by its harness", async () => {
    const agents = `/v1/harnesses/${ws.scout.participantId}/agents`;
    const made = await call("POST", agents, ws.scout.headers, { key: "kitchen", name: "Kitchen" });
    const kitchen = String(made.json["agent_id"]);
    await put(ws.arjun, { icon: "compass", ground: 23 }, kitchen);

    const named = async () => {
      const answer = await call(
        "GET",
        "/v1/participants",
        ws.arjun.sign("GET", "/v1/participants", ""),
      );
      const all = answer.json["participants"] as Record<string, unknown>[];
      return all.find((each) => each["id"] === kitchen);
    };
    expect(await named()).toMatchObject({
      display_name: "Kitchen",
      agent_state: "active",
      face: { icon: "compass", ground: 23 },
    });

    // Its harness names it anew: the face a person chose stays.
    await call("POST", agents, ws.scout.headers, { key: "kitchen", name: "Kitchen and bath" });
    expect(await named()).toMatchObject({
      display_name: "Kitchen and bath",
      face: { icon: "compass", ground: 23 },
    });
  });

  it("is still there after a rebuild", async () => {
    const face = { icon: "crown", ground: 9 };
    await put(ws.arjun, face);
    await ws.gateway.deps.store.rebuild(ws.workspaceId);
    expect((await listed(ws.arjun))?.["face"]).toEqual(face);
  });

  it("refuses a guest, a harness, a made-up agent and a body that is not a face", async () => {
    const gus = await ws.addPerson("Gus", "guest");
    expect((await put(gus, { icon: "cart", ground: 4 })).status).toBe(403);
    expect((await clear(gus)).status).toBe(403);

    const asScout = await call("PUT", path(), ws.scout.headers, { icon: "cart", ground: 4 });
    expect(asScout.status).toBe(403);

    expect((await put(ws.arjun, { icon: "cart", ground: 4 }, "agt_nobody")).status).toBe(404);
    // A harness is not an agent: its face is not chosen here.
    expect((await put(ws.arjun, { icon: "cart", ground: 4 }, ws.scout.participantId)).status).toBe(
      404,
    );

    expect((await put(ws.arjun, { icon: "cart", ground: 27 })).status).toBe(422);
    expect((await put(ws.arjun, { icon: "not a name", ground: 1 })).status).toBe(422);
    expect((await put(ws.arjun, { ground: 1 })).status).toBe(422);
    expect(await updates()).toEqual([]);
  });
});
