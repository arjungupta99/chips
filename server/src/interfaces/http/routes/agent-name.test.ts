/**
 * No two agents share a name (ADR 0091). Every door that names an agent numbers one whose name is
 * taken ("Kit 2"), and an agent asked for again under its name keeps it. `PUT /v1/agents/:id/name`
 * renames one, a person's to do and never a guest's or a harness's; a name somebody answers to is
 * refused, case and spaces aside, and a person's name holds against the harness.
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
  await ws.gateway.deps.upgradeAgents.apply(ws.workspaceId);
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

/** Scout registers an agent by key, as a harness does. */
async function register(key: string, name: string, state?: "active" | "archived") {
  const answer = await call(
    "POST",
    `/v1/harnesses/${ws.scout.participantId}/agents`,
    ws.scout.headers,
    {
      key,
      name,
      ...(state === undefined ? {} : { state }),
    },
  );
  return answer.json as { agent_id: string; name: string; renamed: boolean; created: boolean };
}

function rename(who: TestPerson, agentId: string, name: unknown) {
  const path = `/v1/agents/${agentId}/name`;
  const body = { name };
  return call("PUT", path, who.sign("PUT", path, JSON.stringify(body)), body);
}

async function nameOf(agentId: string): Promise<string | undefined> {
  const found = await ws.gateway.deps.readModels.participant(ws.workspaceId, agentId);
  return found?.display_name;
}

async function byKey(key: string) {
  return ws.gateway.deps.readModels.agentByKey(ws.workspaceId, ws.scout.participantId, key);
}

describe("an agent's name is its own", () => {
  it("is numbered when another agent has it, case and spaces aside", async () => {
    expect((await register("a", "Kit")).name).toBe("Kit");
    expect((await register("b", "Kit")).name).toBe("Kit 2");
    expect((await register("c", "k it")).name).toBe("k it 3");
  });

  it("is numbered past a harness's default agent, which is named after the harness", async () => {
    // The upgrade gave Scout a default agent called Scout.
    expect((await register("helper", "Scout")).name).toBe("Scout 2");
  });

  it("is numbered past a person, who is never numbered", async () => {
    expect((await register("d", "Dana")).name).toBe("Dana 2");
  });

  it("keeps its number when asked for again, and when a lower one comes free", async () => {
    await register("a", "Kit");
    await register("b", "Kit");
    const c = await register("c", "Kit");
    expect(c.name).toBe("Kit 3");

    const again = await register("c", "Kit");
    expect(again).toMatchObject({ name: "Kit 3", renamed: false });

    // Kit 2 is put away in its harness: Kit 3 is still Kit 3, and the next new one takes 2.
    await register("b", "Kit", "archived");
    expect((await register("c", "Kit")).name).toBe("Kit 3");
    expect((await register("e", "Kit")).name).toBe("Kit 2");
  });

  it("is numbered again when it comes back to find its name taken", async () => {
    const a = await register("a", "Kit");
    await register("a", "Kit", "archived");
    // An archived agent gives its name up.
    expect((await register("b", "Kit")).name).toBe("Kit");
    const back = await register("a", "Kit", "active");
    expect(back).toMatchObject({ name: "Kit 2", renamed: true });
    expect(await nameOf(a.agent_id)).toBe("Kit 2");
  });

  it("is renamed by its harness, numbered when the new name is taken", async () => {
    await register("a", "Kit");
    const b = await register("b", "Lux");
    expect((await register("b", "Kit")).name).toBe("Kit 2");
    expect(await nameOf(b.agent_id)).toBe("Kit 2");
  });
});

describe("a person renames an agent", () => {
  it("for everybody, as the person who did it", async () => {
    const kit = await register("a", "Kit");
    const answer = await rename(ws.dana, kit.agent_id, "  Pixel   the  Second ");
    expect(answer.status).toBe(200);
    expect(answer.json).toEqual({ agent_id: kit.agent_id, name: "Pixel the Second" });
    expect(await nameOf(kit.agent_id)).toBe("Pixel the Second");
    expect((await byKey("a"))?.name_by).toBe(ws.dana.participantId);

    const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, 1000);
    const renamed = page.events.filter(
      (event) => event.type === "agent.updated" && event.payload["name"] === "Pixel the Second",
    );
    expect(renamed).toHaveLength(1);
    expect(renamed[0]?.actor).toEqual({ kind: "person", id: ws.dana.participantId });
  });

  it("holds against its harness asking for its old name, or another", async () => {
    const kit = await register("a", "Kit");
    await rename(ws.arjun, kit.agent_id, "Pixel");
    expect(await register("a", "Kit")).toMatchObject({ name: "Pixel", renamed: false });
    expect(await register("a", "Kitchen")).toMatchObject({ name: "Pixel", renamed: false });
    expect(await nameOf(kit.agent_id)).toBe("Pixel");
  });

  it("keeps the person's name through an archive, numbered if it was taken meanwhile", async () => {
    const kit = await register("a", "Kit");
    await rename(ws.arjun, kit.agent_id, "Pixel");
    await register("a", "Kit", "archived");
    expect((await register("b", "Pixel")).name).toBe("Pixel");
    expect((await register("a", "Kit", "active")).name).toBe("Pixel 2");
    expect((await byKey("a"))?.name_by).toBe(ws.arjun.participantId);
    // Still the person's: its harness asking for its old name changes nothing.
    expect((await register("a", "Kit")).name).toBe("Pixel 2");
  });

  it("is refused a name another agent or a person answers to, case and spaces aside", async () => {
    await register("a", "Kit");
    const lux = await register("b", "Lux");
    const agent = await rename(ws.arjun, lux.agent_id, "K I T");
    expect(agent.status).toBe(422);
    expect((agent.json["error"] as { message: string }).message).toBe(
      "An agent here goes by Kit already.",
    );
    const person = await rename(ws.arjun, lux.agent_id, "dana");
    expect((person.json["error"] as { message: string }).message).toBe(
      "Somebody here goes by Dana already.",
    );
    expect(await nameOf(lux.agent_id)).toBe("Lux");
  });

  it("is refused Main, You, a hidden character, mixed letters and a lookalike (SEC-33)", async () => {
    await register("a", "Kit");
    const lux = await register("b", "Lux");
    const said = async (name: string) =>
      ((await rename(ws.arjun, lux.agent_id, name)).json["error"] as { message: string }).message;
    const notAnAgent =
      "An agent can't be called Main or You: Chips uses those words for the Main agent and for you.";
    expect(await said("Main")).toBe(notAnAgent);
    expect(await said(" you ")).toBe(notAnAgent);
    // Main with a Cyrillic а.
    expect(await said("M\u0430in")).toBe(notAnAgent);
    expect(await said("Ki\u200bt")).toMatch(/^A name can't have hidden characters in it/);
    expect(await said("\u041aelly")).toMatch(/^A name can't mix Latin, Cyrillic and Greek/);
    // Kit in Cyrillic capitals, every letter of it.
    expect(await said("\u041a\u0406\u0422")).toBe("An agent here goes by Kit already.");
    expect(await nameOf(lux.agent_id)).toBe("Lux");
  });

  it("is numbered past Main and You, and loses what nobody sees, when its harness asks", async () => {
    expect((await register("m", "Main")).name).toBe("Main 2");
    expect((await register("y", "You")).name).toBe("You 2");
    expect((await register("z", "Pi\u200bxel\u202e")).name).toBe("Pixel");
  });

  it("may take an archived agent's name, which was given up", async () => {
    await register("a", "Kit");
    await register("a", "Kit", "archived");
    const lux = await register("b", "Lux");
    expect((await rename(ws.arjun, lux.agent_id, "Kit")).status).toBe(200);
  });

  it("records nothing for the name it has, and keeps it through a rebuild", async () => {
    const kit = await register("a", "Kit");
    expect((await rename(ws.arjun, kit.agent_id, "Kit")).status).toBe(200);
    await rename(ws.arjun, kit.agent_id, "Pixel");
    await ws.gateway.deps.store.rebuild(ws.workspaceId);
    expect(await nameOf(kit.agent_id)).toBe("Pixel");
    expect((await byKey("a"))?.name_by).toBe(ws.arjun.participantId);
    const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, 1000);
    const named = page.events.filter(
      (event) => event.type === "agent.updated" && event.actor.kind === "person",
    );
    expect(named).toHaveLength(1);
  });

  it("refuses a guest, a harness, a made-up agent, a harness's own row and an empty name", async () => {
    const kit = await register("a", "Kit");
    const gus = await ws.addPerson("Gus", "guest");
    expect((await rename(gus, kit.agent_id, "Pixel")).status).toBe(403);
    const path = `/v1/agents/${kit.agent_id}/name`;
    expect((await call("PUT", path, ws.scout.headers, { name: "Pixel" })).status).toBe(403);
    expect((await rename(ws.arjun, "agt_nobody", "Pixel")).status).toBe(404);
    expect((await rename(ws.arjun, ws.scout.participantId, "Pixel")).status).toBe(404);
    expect((await rename(ws.arjun, kit.agent_id, "   ")).status).toBe(422);
    expect((await rename(ws.arjun, kit.agent_id, "x".repeat(121))).status).toBe(422);
    expect((await rename(ws.arjun, kit.agent_id, 7)).status).toBe(422);
    expect(await nameOf(kit.agent_id)).toBe("Kit");
  });
});

describe("a person's own name", () => {
  it("is refused an agent's, case and spaces aside, and says it is an agent's", async () => {
    await register("a", "Open Claw");
    const path = `/v1/people/${ws.dana.participantId}/name`;
    const body = { display_name: "openclaw" };
    const answer = await call("POST", path, ws.dana.sign("POST", path, JSON.stringify(body)), body);
    expect(answer.status).toBe(422);
    expect((answer.json["error"] as { message: string }).message).toBe(
      "An agent here goes by Open Claw already.",
    );
  });

  it("may take an archived agent's name", async () => {
    await register("a", "Kit");
    await register("a", "Kit", "archived");
    const path = `/v1/people/${ws.dana.participantId}/name`;
    const body = { display_name: "Kit" };
    const answer = await call("POST", path, ws.dana.sign("POST", path, JSON.stringify(body)), body);
    expect(answer.status).toBe(200);
  });
});
