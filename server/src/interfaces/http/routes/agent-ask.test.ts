/**
 * A new agent in a room (ADR 0108): `POST /v1/spaces/:id/agents` asks a harness for an agent made
 * for the room, as `agent.asked` there, which the room and the harness asked are sent. The harness
 * registers its new agent with `made_for` and the room, and it joins while the ask stands: a
 * minute, timed from the ask, with nothing stored but the event. Who may ask is who may fork; only
 * a harness that declares `new_agents` is asked.
 */

import { HARNESS_CAPABILITIES, NEW_AGENT_WAIT_MS } from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canSee, type Principal } from "../../../application/index.js";
import {
  createTestWorkspace,
  type TestPerson,
  type TestWorkspace,
} from "../../../testing/workspace.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTestWorkspace();
  await ws.gateway.deps.upgradeAgents.apply(ws.workspaceId);
  await declare([HARNESS_CAPABILITIES.agents, HARNESS_CAPABILITIES.newAgents]);
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
  const error = json["error"] as { message?: string } | undefined;
  return { status: response.status, json: { ...json, message: error?.message } };
}

/** A person asks a harness for a new agent in a room. */
function ask(who: TestPerson, spaceId: string, body: Record<string, unknown> = {}) {
  const path = `/v1/spaces/${spaceId}/agents`;
  const sent = { harness_id: ws.scout.participantId, ...body };
  return call("POST", path, who.sign("POST", path, JSON.stringify(sent)), sent);
}

/** Scout registers one of its agents, a new one when it says which ask it answers. */
function register(body: Record<string, unknown>) {
  return call("POST", `/v1/harnesses/${ws.scout.participantId}/agents`, ws.scout.headers, body);
}

async function room(title = "ASCII Art", by: Principal = arjun()): Promise<string> {
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
async function staleAsk(spaceId: string): Promise<string> {
  const appended = await ws.gateway.deps.store.append({
    v: 1,
    type: "agent.asked",
    id: ws.ids.next("event"),
    ts: new Date(Date.now() - NEW_AGENT_WAIT_MS - 1000).toISOString(),
    workspace_id: ws.workspaceId,
    space_id: spaceId,
    actor: { kind: "person", id: ws.arjun.participantId },
    idempotency_key: `stale-${spaceId}`,
    harness_id: ws.scout.participantId,
    name: "Late",
    by: ws.arjun.participantId,
  });
  return appended.event.id;
}

describe("asking for a new agent", () => {
  it("asks the harness in the room, under the name given, and the harness hears it", async () => {
    const art = await room();
    const asked = await ask(ws.arjun, art, { name: "Reviewer" });
    expect(asked.status).toBe(202);
    expect(asked.json).toMatchObject({ space_id: art, name: "Reviewer", asked: true });
    const [said] = await events("agent.asked");
    expect(said).toMatchObject({
      id: asked.json["ask_id"],
      space_id: art,
      actor: { kind: "person", id: ws.arjun.participantId },
      payload: { harness_id: ws.scout.participantId, name: "Reviewer", by: ws.arjun.participantId },
    });
    if (said === undefined) throw new Error("no ask");
    // The harness is in no room itself: it hears the ask all the same, live and on replay, and
    // a person outside the room does not.
    expect(
      canSee(said, { participantId: ws.scout.participantId, memberSpaces: new Set<string>() }),
    ).toBe(true);
    expect(canSee(said, { participantId: ws.dana.participantId, memberSpaces: new Set() })).toBe(
      false,
    );
    const types = async (participantId: string) =>
      (
        await ws.gateway.deps.store.since(ws.workspaceId, 0, 5000, { spaces: [], participantId })
      ).events.map((event) => event.type);
    expect(await types(ws.scout.participantId)).toContain("agent.asked");
    expect(await types(ws.dana.participantId)).not.toContain("agent.asked");
  });

  it("names it after its harness, numbered, when no name is given or the one given is taken", async () => {
    const art = await room();
    // Scout's own agent answers to "Scout" already.
    expect((await ask(ws.arjun, art)).json).toMatchObject({ name: "Scout 2" });
    expect((await ask(ws.arjun, art, { name: "  " })).json).toMatchObject({ name: "Scout 2" });
    expect((await ask(ws.arjun, art, { name: "Dana" })).json).toMatchObject({ name: "Dana 2" });
  });

  it("numbers Main and You, and refuses a hidden character or mixed letters (SEC-33)", async () => {
    const art = await room();
    expect((await ask(ws.arjun, art, { name: "Main" })).json).toMatchObject({ name: "Main 2" });
    expect((await ask(ws.arjun, art, { name: "you" })).json).toMatchObject({ name: "you 2" });
    const hidden = await ask(ws.arjun, art, { name: "Revi\u200bewer" });
    expect(hidden.status).toBe(422);
    expect((hidden.json["error"] as { message: string }).message).toMatch(
      /^A name can't have hidden characters in it/,
    );
    expect((await ask(ws.arjun, art, { name: "R\u0435viewer" })).status).toBe(422);
    expect(await events("agent.asked")).toHaveLength(2);
  });

  it("is a new ask each time, but the same one for the same key", async () => {
    const art = await room();
    const first = await ask(ws.arjun, art, { key: "tap-1" });
    const again = await ask(ws.arjun, art, { key: "tap-1" });
    expect(again.status).toBe(200);
    expect(again.json).toMatchObject({ asked: false, ask_id: first.json["ask_id"] });
    const other = await ask(ws.arjun, art, { key: "tap-2" });
    expect(other.json["ask_id"]).not.toBe(first.json["ask_id"]);
    expect(await events("agent.asked")).toHaveLength(2);
  });

  it("is refused for a harness that doesn't declare new_agents", async () => {
    await declare([HARNESS_CAPABILITIES.agents]);
    const refused = await ask(ws.arjun, await room());
    expect(refused.status).toBe(422);
    expect(String(refused.json["message"])).toMatch(/doesn't make new agents/);
    expect(await events("agent.asked")).toHaveLength(0);
  });

  it("is its harness's owner's to ask, or a workspace owner's or admin's", async () => {
    const art = await room();
    await ok(arjun(), {
      type: "membership.added",
      space_id: art,
      participant_id: ws.dana.participantId,
      participant_kind: "person",
      role: "member",
    });
    const dana = await ask(ws.dana, art);
    expect(dana.status).toBe(403);
    expect(String(dana.json["message"])).toMatch(/harness's owner, or an owner or admin/);
    const admin = await ws.addPerson("Ana", "admin");
    await ok(arjun(), {
      type: "membership.added",
      space_id: art,
      participant_id: admin.participantId,
      participant_kind: "person",
      role: "member",
    });
    expect((await ask(admin, art)).status).toBe(202);
  });

  it("is refused to a guest, for a room the person is not in, and of no harness", async () => {
    const art = await room();
    const guest = await ws.addPerson("Gil", "guest");
    expect((await ask(guest, art)).status).toBe(403);
    const dana = await room("Dana's", person(ws.dana, "Dana"));
    expect((await ask(ws.arjun, dana)).status).toBe(404);
    expect((await ask(ws.arjun, art, { harness_id: "hrn_nobody" })).status).toBe(404);
  });

  it("is refused to a harness: a person asks for an agent", async () => {
    const art = await room();
    const path = `/v1/spaces/${art}/agents`;
    const refused = await call("POST", path, ws.scout.headers, {
      harness_id: ws.scout.participantId,
    });
    expect(refused.status).toBe(403);
  });

  it("refuses a Main room and a closed one", async () => {
    const home = await room("Home");
    await ws.db.updateTable("spaces").set({ home: 1 }).where("id", "=", home).execute();
    expect(String((await ask(ws.arjun, home)).json["message"])).toMatch(/Main space/);
    const shut = await room("Shut");
    await ok(arjun(), { type: "space.updated", space_id: shut, state: "closed" });
    expect(String((await ask(ws.arjun, shut)).json["message"])).toMatch(/Unarchive/);
  });
});

describe("the new agent", () => {
  it("joins the room it was asked for, on the line that asked", async () => {
    const art = await room();
    const asked = await ask(ws.arjun, art, { name: "Reviewer" });
    const askId = String(asked.json["ask_id"]);
    const made = await register({
      key: "reviewer",
      name: "Reviewer",
      made_for: askId,
      space_id: art,
    });
    expect(made.status).toBe(201);
    expect(made.json).toMatchObject({ name: "Reviewer", room: art, attached: true });
    const agent = String(made.json["agent_id"]);

    const joined = (await events("membership.added")).find(
      (event) => event.payload["participant_id"] === agent,
    );
    expect(joined).toMatchObject({
      space_id: art,
      actor: { kind: "harness", id: ws.scout.participantId },
      payload: { participant_kind: "agent", made_for: askId },
    });
    const attached = (await events("agent.attached")).find(
      (event) => event.payload["agent_id"] === agent,
    );
    expect(attached).toMatchObject({ space_id: art, payload: { made_for: askId } });
    const { readModels } = ws.gateway.deps;
    expect(await readModels.agentRoom(ws.workspaceId, agent)).toBe(art);
    expect(await readModels.agentAsk(ws.workspaceId, askId)).toMatchObject({ answered: true });
  });

  it("registered again, changes nothing, and a second agent for one ask stays free", async () => {
    const art = await room();
    const askId = String((await ask(ws.arjun, art)).json["ask_id"]);
    const body = { key: "one", name: "Scout 2", made_for: askId, space_id: art };
    await register(body);
    const again = await register(body);
    expect(again.status).toBe(200);
    expect(again.json).toMatchObject({ attached: false, created: false });
    expect(again.json["why"]).toBeUndefined();
    const two = await register({ ...body, key: "two" });
    expect(String(two.json["why"])).toMatch(/has its agent already/);
    expect(
      (await events("membership.added")).filter((event) => event.payload["made_for"] === askId),
    ).toHaveLength(1);
  });

  it("is free when the room stopped waiting, or nobody asked for it there", async () => {
    const late = await room("Late");
    const stale = await staleAsk(late);
    const after = await register({ key: "late", name: "Late", made_for: stale, space_id: late });
    expect(after.status).toBe(201);
    expect(after.json).toMatchObject({ attached: false, room: null });
    expect(String(after.json["why"])).toMatch(/stopped waiting for the agent after a minute/);

    const art = await room();
    const askId = String((await ask(ws.arjun, art)).json["ask_id"]);
    const elsewhere = await room("Elsewhere");
    const stray = await register({ key: "s", name: "S", made_for: askId, space_id: elsewhere });
    expect(String(stray.json["why"])).toMatch(/Nobody asked this harness/);
  });

  it("is refused a room without its ask, and a fork's copy that says it is new", async () => {
    const art = await room();
    const noAsk = await register({ key: "r", name: "R", space_id: art });
    expect(noAsk.status).toBe(422);
    expect(String(noAsk.json["message"])).toMatch(/send `forked_from` or `made_for` with it/);
    const noRoom = await register({ key: "r", name: "R", made_for: "evt_x" });
    expect(String(noRoom.json["message"])).toMatch(/send the space's `space_id` with it/);
    const both = await register({ key: "r", name: "R", made_for: "evt_x", forked_from: "agt_x" });
    expect(String(both.json["message"])).toMatch(/not both/);
  });
});
