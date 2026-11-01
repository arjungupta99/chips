/**
 * `chipsd upgrade names` (ADR 0091, point 6): agents that share a name, as Chips made them before
 * it numbered them, are numbered once, the oldest keeping the name; an agent that shares a
 * person's name is numbered, and the person is not renamed. Run twice, it adds nothing.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../../testing/workspace.js";

let ws: TestWorkspace;
let at = 0;

beforeEach(async () => {
  ws = await createTestWorkspace();
  await ws.gateway.deps.upgradeAgents.apply(ws.workspaceId);
});

afterEach(async () => {
  await ws.close();
});

/** An agent as the log had them before names were numbered: called what its harness said. */
async function made(name: string, extra: Record<string, unknown> = {}): Promise<string> {
  at += 1;
  const agentId = ws.ids.next("agent");
  await ws.gateway.deps.store.append({
    v: 1,
    type: "agent.registered",
    id: ws.ids.next("event"),
    ts: `2026-10-01T0${Math.min(at, 9)}:00:00.000Z`,
    workspace_id: ws.workspaceId,
    actor: { kind: "system", id: "system" },
    idempotency_key: `seeded-${agentId}`,
    agent_id: agentId,
    harness_id: ws.scout.participantId,
    key: `key-${agentId}`,
    name,
    lead: false,
    ...extra,
  });
  return agentId;
}

async function nameOf(agentId: string): Promise<string | undefined> {
  return (await ws.gateway.deps.readModels.participant(ws.workspaceId, agentId))?.display_name;
}

describe("the upgrade to names nobody shares", () => {
  it("numbers the agents that share a name, the oldest keeping it, and lists them first", async () => {
    const one = await made("OpenClaw");
    const two = await made("Open Claw");
    const three = await made("openclaw");
    const kit = await made("Kit");
    const { upgradeNames } = ws.gateway.deps;

    const plan = await upgradeNames.plan(ws.workspaceId);
    expect(plan.renames).toEqual([
      { agent_id: two, from: "Open Claw", to: "Open Claw 2" },
      { agent_id: three, from: "openclaw", to: "openclaw 3" },
    ]);
    // A dry run changes nothing.
    expect(await nameOf(two)).toBe("Open Claw");

    const done = await upgradeNames.apply(ws.workspaceId);
    expect(done.appended).toBe(2);
    expect(await nameOf(one)).toBe("OpenClaw");
    expect(await nameOf(two)).toBe("Open Claw 2");
    expect(await nameOf(three)).toBe("openclaw 3");
    expect(await nameOf(kit)).toBe("Kit");

    expect((await upgradeNames.plan(ws.workspaceId)).renames).toEqual([]);
    expect((await upgradeNames.apply(ws.workspaceId)).appended).toBe(0);
  });

  it("numbers an agent with a person's name, and never the person", async () => {
    const agent = await made("Dana");
    const done = await ws.gateway.deps.upgradeNames.apply(ws.workspaceId);
    expect(done.plan.renames).toEqual([{ agent_id: agent, from: "Dana", to: "Dana 2" }]);
    expect(await nameOf(ws.dana.participantId)).toBe("Dana");
  });

  it("leaves a name that is already its own, and skips a number another agent has", async () => {
    await made("OpenClaw");
    const taken = await made("OpenClaw 2");
    const late = await made("OpenClaw");
    const plan = await ws.gateway.deps.upgradeNames.plan(ws.workspaceId);
    expect(plan.renames).toEqual([{ agent_id: late, from: "OpenClaw", to: "OpenClaw 3" }]);
    expect(await nameOf(taken)).toBe("OpenClaw 2");
  });

  it("leaves an archived agent alone, which has given its name up", async () => {
    await made("Kit");
    const old = await made("Kit");
    await ws.gateway.deps.store.append({
      v: 1,
      type: "agent.updated",
      id: ws.ids.next("event"),
      ts: "2026-10-01T09:30:00.000Z",
      workspace_id: ws.workspaceId,
      actor: { kind: "system", id: "system" },
      idempotency_key: `archived-${old}`,
      agent_id: old,
      state: "archived",
    });
    expect((await ws.gateway.deps.upgradeNames.plan(ws.workspaceId)).renames).toEqual([]);
  });

  it("writes as Chips, so a name a person gave stays theirs", async () => {
    await made("Kit");
    const second = await made("Kit");
    await ws.gateway.deps.upgradeNames.apply(ws.workspaceId);
    const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, 1000);
    const numbered = page.events.find(
      (event) => event.type === "agent.updated" && event.payload["agent_id"] === second,
    );
    expect(numbered?.actor).toEqual({ kind: "system", id: "system" });
    expect(numbered?.payload["name"]).toBe("Kit 2");
  });
});
