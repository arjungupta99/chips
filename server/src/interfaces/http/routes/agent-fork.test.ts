/**
 * Fork (ADR 0087, Phase 6): `POST /v1/agents/:id/fork` asks an agent's harness for a copy of it in
 * a room, as `agent.fork` there, which the room and the agent's harness are sent. The harness
 * registers its copy with `forked_from` and the room, and the copy joins while the ask stands: a
 * minute, timed from the ask, with nothing stored but the event. Who may ask is who may move it;
 * only a harness that declares `forks` is asked.
 */

import { FORK_WAIT_MS, HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultAgentOf } from "../../../application/agents.js";
import { canSee, type Principal } from "../../../application/index.js";
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
  agent = await scoutsAgent();
  await declare([HARNESS_CAPABILITIES.agents, HARNESS_CAPABILITIES.forks]);
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

async function declare(capabilities: readonly string[]): Promise<void> {
  const done = await ws.gateway.deps.declareCapabilities({
    principal: arjun(),
    harnessId: ws.scout.participantId,
    capabilities,
  });
  if (!done.ok) throw new Error(done.error.message);
}

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
  const json = (await response.json()) as Record<string, unknown>;
  // A refusal's words are the envelope's (ADR 0006): read them as `message`, beside the rest.
  const error = json["error"] as { message?: string } | undefined;
  return { status: response.status, json: { ...json, message: error?.message } };
}

/** A person asks for a copy of an agent in a room. */
function fork(who: TestPerson, agentId: string, spaceId: string) {
  const path = `/v1/agents/${agentId}/fork`;
  const body = { space_id: spaceId };
  return call("POST", path, who.sign("POST", path, JSON.stringify(body)), body);
}

/** Scout registers one of its agents, a copy when it says what of. */
function register(body: Record<string, unknown>) {
  return call("POST", `/v1/harnesses/${ws.scout.participantId}/agents`, ws.scout.headers, body);
}

/** Scout's default agent, which the upgrade put in the harness's place in PO-4471. */
async function scoutsAgent(): Promise<string> {
  const found = await ws.gateway.deps.readModels.agentByKey(
    ws.workspaceId,
    ws.scout.participantId,
    ws.scout.participantId,
  );
  if (found === undefined) throw new Error("Scout has no agent");
  return found.agent_id;
}

async function room(title = "Openings prep", by: Principal = arjun()): Promise<string> {
  // A member opens no space (ADR 0196): a room of Dana's is one an admin made for her.
  if (by.role === "member") return ws.roomOf(by.participantId, title);
  const id = ws.ids.next("space");
  await ok(by, { type: "space.created", space_id: id, kind: "group", title });
  return id;
}

async function events(type: string) {
  const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, 5000);
  return page.events.filter((event) => event.type === type);
}

/** An ask written as if it were made a minute and a second ago. */
async function staleAsk(agentId: string, spaceId: string): Promise<string> {
  const appended = await ws.gateway.deps.store.append({
    v: 1,
    type: "agent.fork",
    id: ws.ids.next("event"),
    ts: new Date(Date.now() - FORK_WAIT_MS - 1000).toISOString(),
    workspace_id: ws.workspaceId,
    space_id: spaceId,
    actor: { kind: "person", id: ws.arjun.participantId },
    idempotency_key: `stale-${spaceId}`,
    agent_id: agentId,
    by: ws.arjun.participantId,
  });
  return appended.event.id;
}

describe("asking for a copy", () => {
  it("asks the agent's harness in the room the copy is for, and the harness hears it", async () => {
    const prep = await room();
    const asked = await fork(ws.arjun, agent, prep);
    expect(asked.status).toBe(202);
    expect(asked.json).toMatchObject({ agent_id: agent, space_id: prep, asked: true });
    const [said] = await events("agent.fork");
    expect(said).toMatchObject({
      id: asked.json["fork_id"],
      space_id: prep,
      actor: { kind: "person", id: ws.arjun.participantId },
      payload: { agent_id: agent, by: ws.arjun.participantId },
    });
    if (said === undefined) throw new Error("no ask");
    // The agent is in PO-4471, so its harness is no member of the room: it hears the ask all the
    // same, live and on replay, and a person outside the room does not.
    const harness = {
      participantId: ws.scout.participantId,
      memberSpaces: new Set<string>(),
      alsoIs: new Set([agent]),
    };
    expect(canSee(said, harness)).toBe(true);
    expect(canSee(said, { participantId: ws.dana.participantId, memberSpaces: new Set() })).toBe(
      false,
    );
    const replay = (participantId: string, alsoIs: string[] = []) =>
      ws.gateway.deps.store.since(ws.workspaceId, 0, 5000, { spaces: [], participantId, alsoIs });
    const types = async (participantId: string, alsoIs?: string[]) =>
      (await replay(participantId, alsoIs)).events.map((event) => event.type);
    expect(await types(ws.scout.participantId, [agent])).toContain("agent.fork");
    expect(await types(ws.dana.participantId)).not.toContain("agent.fork");
  });

  it("is the same ask while it waits, and a new one once the minute is up", async () => {
    const prep = await room();
    const first = await fork(ws.arjun, agent, prep);
    const again = await fork(ws.arjun, agent, prep);
    expect(again.status).toBe(200);
    expect(again.json).toMatchObject({ asked: false, fork_id: first.json["fork_id"] });
    expect(await events("agent.fork")).toHaveLength(1);

    const later = await room("Endgames");
    const stale = await staleAsk(agent, later);
    const anew = await fork(ws.arjun, agent, later);
    expect(anew.status).toBe(202);
    expect(anew.json["fork_id"]).not.toBe(stale);
  });

  it("is refused for a harness that doesn't declare forks", async () => {
    await declare([HARNESS_CAPABILITIES.agents]);
    const refused = await fork(ws.arjun, agent, await room());
    expect(refused.status).toBe(422);
    expect(String(refused.json["message"])).toMatch(/doesn't make copies of its agents/);
    expect(await events("agent.fork")).toHaveLength(0);
  });

  it("is its harness's owner's to ask, or a workspace owner's or admin's", async () => {
    const prep = await room();
    await ok(arjun(), {
      type: "membership.added",
      space_id: prep,
      participant_id: ws.dana.participantId,
      participant_kind: "person",
      role: "member",
    });
    const dana = await fork(ws.dana, agent, prep);
    expect(dana.status).toBe(403);
    expect(String(dana.json["message"])).toMatch(/harness's owner, or an owner or admin/);
    const admin = await ws.addPerson("Ana", "admin");
    await ok(arjun(), {
      type: "membership.added",
      space_id: prep,
      participant_id: admin.participantId,
      participant_kind: "person",
      role: "member",
    });
    expect((await fork(admin, agent, prep)).status).toBe(202);
  });

  it("is refused to a guest, and for a room the person is not in", async () => {
    const prep = await room();
    const guest = await ws.addPerson("Gil", "guest");
    expect((await fork(guest, agent, prep)).status).toBe(403);
    const dana = await room("Dana's", person(ws.dana, "Dana"));
    expect((await fork(ws.arjun, agent, dana)).status).toBe(404);
    expect((await fork(ws.arjun, "agt_nobody", await room("Third"))).status).toBe(404);
  });

  it("is refused to a harness: a person forks an agent", async () => {
    const path = `/v1/agents/${agent}/fork`;
    const refused = await call("POST", path, ws.scout.headers, { space_id: await room() });
    expect(refused.status).toBe(403);
  });

  it("refuses the Main agent, an archived agent, a free one, and the room it is in", async () => {
    const prep = await room();
    const lead = await register({ key: "lead", name: "Lead", lead: true });
    expect(
      String((await fork(ws.arjun, String(lead.json["agent_id"]), prep)).json["message"]),
    ).toMatch(/Main agent isn't forked/);
    const shelved = await register({ key: "shelf", name: "Shelf", state: "archived" });
    expect(
      String((await fork(ws.arjun, String(shelved.json["agent_id"]), prep)).json["message"]),
    ).toMatch(/archived in its harness/);
    const free = await register({ key: "tree", name: "Tree" });
    const freeAsk = await fork(ws.arjun, String(free.json["agent_id"]), prep);
    expect(freeAsk.status).toBe(422);
    expect(String(freeAsk.json["message"])).toMatch(
      /isn't in a space\. Put it in this one instead/,
    );
    const here = await fork(ws.arjun, agent, ws.spaceId);
    expect(String(here.json["message"])).toMatch(/in this space already/);
    expect(await events("agent.fork")).toHaveLength(0);
  });

  it("refuses a Main room and a closed one", async () => {
    const home = await room("Home");
    await ws.db.updateTable("spaces").set({ home: 1 }).where("id", "=", home).execute();
    expect(String((await fork(ws.arjun, agent, home)).json["message"])).toMatch(/Main space/);
    const shut = await room("Shut");
    await ok(arjun(), { type: "space.updated", space_id: shut, state: "closed" });
    expect(String((await fork(ws.arjun, agent, shut)).json["message"])).toMatch(/Unarchive/);
  });
});

describe("the copy", () => {
  it("joins the room it was asked for, a copy of the agent, which stays where it is", async () => {
    const prep = await room();
    const asked = await fork(ws.arjun, agent, prep);
    const made = await register({
      key: "scout-copy",
      name: "Scout",
      forked_from: agent,
      space_id: prep,
    });
    expect(made.status).toBe(201);
    expect(made.json).toMatchObject({ forked_from: agent, room: prep, attached: true });
    const copy = String(made.json["agent_id"]);

    const joined = (await events("membership.added")).find(
      (event) => event.payload["participant_id"] === copy,
    );
    expect(joined).toMatchObject({
      space_id: prep,
      actor: { kind: "harness", id: ws.scout.participantId },
      payload: { participant_kind: "agent", fork_of: asked.json["fork_id"] },
    });
    const attached = (await events("agent.attached")).find(
      (event) => event.payload["agent_id"] === copy,
    );
    expect(attached).toMatchObject({ space_id: prep, payload: { fork_of: asked.json["fork_id"] } });

    const { readModels } = ws.gateway.deps;
    expect(await readModels.agentRoom(ws.workspaceId, copy)).toBe(prep);
    expect(await readModels.agentRoom(ws.workspaceId, agent)).toBe(ws.spaceId);
    expect(await readModels.participant(ws.workspaceId, copy)).toMatchObject({
      forked_from: agent,
      room: prep,
    });
    expect(await readModels.forkAsk(ws.workspaceId, agent, prep)).toMatchObject({
      answered: true,
    });
    // Answered, a Fork asks anew rather than waiting on it.
    expect((await fork(ws.arjun, agent, prep)).json).toMatchObject({ asked: true });
  });

  it("registered again, changes nothing", async () => {
    const prep = await room();
    await fork(ws.arjun, agent, prep);
    const body = { key: "scout-copy", name: "Scout", forked_from: agent, space_id: prep };
    await register(body);
    const again = await register(body);
    expect(again.status).toBe(200);
    expect(again.json).toMatchObject({ attached: false, created: false });
    expect(again.json["why"]).toBeUndefined();
    expect(
      (await events("membership.added")).filter((event) => event.payload["fork_of"] !== undefined),
    ).toHaveLength(1);
  });

  it("is free when the room stopped waiting, or has its copy, or nobody asked", async () => {
    const late = await room("Late");
    await staleAsk(agent, late);
    const after = await register({
      key: "late",
      name: "Scout",
      forked_from: agent,
      space_id: late,
    });
    expect(after.status).toBe(201);
    expect(after.json).toMatchObject({ attached: false, room: null });
    expect(String(after.json["why"])).toMatch(/stopped waiting for the copy after a minute/);

    const prep = await room();
    await fork(ws.arjun, agent, prep);
    await register({ key: "one", name: "Scout", forked_from: agent, space_id: prep });
    const two = await register({ key: "two", name: "Scout", forked_from: agent, space_id: prep });
    expect(String(two.json["why"])).toMatch(/has its copy already/);

    const unasked = await room("Unasked");
    const stray = await register({
      key: "s",
      name: "Scout",
      forked_from: agent,
      space_id: unasked,
    });
    expect(String(stray.json["why"])).toMatch(/Nobody asked/);
  });

  it("is a copy of the harness's own agent, and names the room only with what it copies", async () => {
    const other = await ws.gateway.deps.addHarness({
      principal: arjun(),
      displayName: "Ledger",
      openDirectSpace: false,
    });
    if (!other.ok) throw new Error("could not add Ledger");
    const theirs = await defaultAgentOf(ws.gateway.deps, ws.workspaceId, {
      id: other.value.harnessId,
      display_name: "Ledger",
    });
    const foreign = await register({ key: "f", name: "F", forked_from: theirs.agent.agent_id });
    expect(foreign.status).toBe(422);
    expect(String(foreign.json["message"])).toMatch(/this harness's own agents/);
    const roomOnly = await register({ key: "r", name: "R", space_id: ws.spaceId });
    expect(roomOnly.status).toBe(422);
    expect(String(roomOnly.json["message"])).toMatch(/send `forked_from` or `made_for` with it/);
  });
});
