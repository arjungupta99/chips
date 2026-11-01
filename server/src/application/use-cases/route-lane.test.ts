/**
 * Routing, end to end against a real database and the wired gateway.
 *
 * The domain (`lane.test.ts`) decides whether to open a lane; this proves what Chips does with
 * that decision: a `task` becomes a `run.requested` in the specialist's own space, the lane row
 * both chats read, and the specialist's seeded run — or, past the limit or around a loop, a step
 * on the lead's own run and no lane at all.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Gateway } from "../../gateway.js";
import { createTestWorkspace, type TestWorkspace } from "../../testing/workspace.js";
import type { Principal } from "../ports/identity.js";

let ws: TestWorkspace;
let gateway: Gateway;

beforeEach(async () => {
  ws = await createTestWorkspace();
  gateway = ws.gateway;
});

afterEach(async () => {
  await ws.close();
});

function arjun(): Principal {
  return {
    kind: "person",
    participantId: ws.arjun.participantId,
    workspaceId: ws.workspaceId,
    displayName: "Arjun",
    via: "device_key",
    deviceId: ws.arjun.deviceId,
    role: "owner",
  };
}

function scout(): Principal {
  return {
    kind: "harness",
    participantId: ws.scout.participantId,
    workspaceId: ws.workspaceId,
    displayName: "Scout",
    via: "harness_token",
    tokenId: "tok",
    ownerId: ws.arjun.participantId,
  };
}

function specialist(id: string, name: string): Principal {
  return {
    kind: "harness",
    participantId: id,
    workspaceId: ws.workspaceId,
    displayName: name,
    via: "harness_token",
    tokenId: `tok-${name}`,
    ownerId: ws.arjun.participantId,
  };
}

/** Submit one event and fail loudly if the door refused it. */
async function submit(principal: Principal, event: Record<string, unknown>): Promise<void> {
  const result = await gateway.deps.submitEvent({ event, principal });
  if (!result.ok) throw new Error(`${String(event["type"])} refused: ${result.error.message}`);
}

/**
 * A photograph somebody uploaded, stored and ready to attach: its id. A message names its uploads
 * by id and Chips fills the attachment in from the store, never from the message (SEC-5).
 */
async function photo(filename: string, uploadedBy: string): Promise<string> {
  const id = ws.ids.next("attachment");
  await ws.db
    .insertInto("uploads")
    .values({
      id,
      workspace_id: ws.workspaceId,
      uploaded_by: uploadedBy,
      filename,
      state: "stored",
      mime_type: "image/jpeg",
      byte_size: 4096,
      sha256: "a".repeat(64),
      width: 800,
      height: 600,
      duration_ms: null,
      thumbnail_sha256: null,
      thumbnail_mime_type: null,
      keep_metadata: 0,
      created_at: "2026-09-12T20:00:00.000Z",
      expires_at: "2026-09-13T20:00:00.000Z",
      stored_at: "2026-09-12T20:00:00.000Z",
      declared_bytes: null,
      playable_state: null,
      playable_how: null,
      playable_sha256: null,
      playable_mime_type: null,
      playable_note: null,
      transcript: null,
      view_sha256: null,
      view_mime_type: null,
    })
    .execute();
  return id;
}

/** The lane.updated events Chips appended for a lane, oldest first. */
async function laneUpdates(laneId: string): Promise<Record<string, unknown>[]> {
  const rows = await ws.db
    .selectFrom("events")
    .select("payload")
    .where("workspace_id", "=", ws.workspaceId)
    .where("type", "=", "lane.updated")
    .orderBy("seq", "asc")
    .execute();
  return rows
    .map((row) => JSON.parse(row.payload) as Record<string, unknown>)
    .filter((payload) => payload["lane_id"] === laneId);
}

/** A harness's default agent, which it is in a room it was added to (ADR 0087's addendum). */
async function defaultAgent(harnessId: string): Promise<string> {
  const agent = await gateway.deps.readModels.agentByKey(ws.workspaceId, harnessId, harnessId);
  if (agent === undefined) throw new Error(`${harnessId} has no default agent`);
  return agent.agent_id;
}

/** Add a specialist harness owned by Arjun, with its own direct space with him. */
async function addSpecialist(name: string): Promise<{ id: string; home: string }> {
  const added = await gateway.deps.addHarness({ principal: arjun(), displayName: name });
  if (!added.ok) throw new Error(`could not add ${name}`);
  return { id: added.value.harnessId, home: added.value.spaceId ?? "" };
}

/** Scout starts a run in the shared space and routes a task to a specialist. */
async function route(
  specialistId: string,
  laneId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const runId = ws.ids.next("run");
  await submit(scout(), {
    type: "run.started",
    space_id: ws.spaceId,
    run_id: runId,
    idempotency_key: `${laneId}-run`,
    goal: "Confirm PO-4471 with Northwind",
    plan: [],
  });
  await submit(scout(), {
    type: "task",
    space_id: ws.spaceId,
    run_id: runId,
    idempotency_key: `${laneId}-task`,
    task_id: laneId,
    to: specialistId,
    on_behalf_of: ws.arjun.participantId,
    goal: "Check the three Northwind quotes against last quarter",
    link_to: ws.spaceId,
    ...overrides,
  });
  return runId;
}

describe("routing a task into a lane", () => {
  it("opens the lane in the specialist's home space and seeds its run", async () => {
    const ledger = await addSpecialist("Ledger");
    const laneId = ws.ids.next("lane");
    await route(ledger.id, laneId);

    const lane = await gateway.deps.readModels.lane(ws.workspaceId, laneId);
    expect(lane).toMatchObject({
      specialist_id: ledger.id,
      lead_id: ws.scout.participantId,
      on_behalf_of: ws.arjun.participantId,
      home_space_id: ledger.home,
      depth: 1,
      state: "running",
      delivery: "pending",
    });
    // The lane is linked into the lead's space, where the route card shows.
    expect(lane?.linked_space_ids).toEqual([ws.spaceId]);
    // The trail is the person, then Scout.
    expect(lane?.trail.map((entry) => entry.participant_id)).toEqual([
      ws.arjun.participantId,
      ws.scout.participantId,
    ]);

    // The specialist's run is seeded in its home, ready to be worked.
    const run = await gateway.deps.readModels.run(ws.workspaceId, lane?.run_id ?? "");
    expect(run).toMatchObject({ harness_id: ledger.id, space_id: ledger.home, state: "running" });
  });

  it("lets the specialist post its reply once, in its own space", async () => {
    const ledger = await addSpecialist("Ledger");
    const laneId = ws.ids.next("lane");
    await route(ledger.id, laneId);
    const lane = await gateway.deps.readModels.lane(ws.workspaceId, laneId);
    const runId = lane?.run_id ?? "";

    await submit(specialist(ledger.id, "Ledger"), {
      type: "message.post",
      space_id: ledger.home,
      run_id: runId,
      idempotency_key: "ledger-reply",
      text: "All three are within 2% of Q2. Northwind is lowest.",
    });

    // Said by Ledger's agent in its room (ADR 0087): the harness's own id is read as it there.
    const messages = await ws.db
      .selectFrom("messages")
      .selectAll()
      .where("workspace_id", "=", ws.workspaceId)
      .where("type", "=", "text")
      .where("author_id", "=", await defaultAgent(ledger.id))
      .execute();
    expect(messages).toHaveLength(1);
    expect(messages[0]?.space_id).toBe(ledger.home);
  });

  it("follows the agent: its room, or a new one with the person while it is free (ADR 0087, rule 8)", async () => {
    // A harness with no direct room, whose one agent is in no room yet.
    const added = await gateway.deps.addHarness({
      principal: arjun(),
      displayName: "Tree",
      openDirectSpace: false,
    });
    if (!added.ok) throw new Error("could not add Tree");
    const tree = added.value.harnessId;
    const homeOf = async (laneId: string) =>
      (await gateway.deps.readModels.lane(ws.workspaceId, laneId))?.home_space_id;

    const first = ws.ids.next("lane");
    await route(tree, first);
    const opened = await homeOf(first);
    const agent = await defaultAgent(tree);
    expect(await gateway.deps.readModels.agentRoom(ws.workspaceId, agent)).toBe(opened);
    expect(
      await gateway.deps.readModels.memberRole(
        ws.workspaceId,
        String(opened),
        ws.arjun.participantId,
      ),
    ).toBe("owner");

    // While it is there, the next lane is there too.
    const second = ws.ids.next("lane");
    await route(tree, second);
    expect(await homeOf(second)).toBe(opened);

    // Archived, the room frees the agent, and the next hand-off opens another.
    await submit(arjun(), {
      type: "space.updated",
      space_id: opened,
      idempotency_key: "archive-tree-room",
      state: "closed",
    });
    const third = ws.ids.next("lane");
    await route(tree, third);
    expect(await homeOf(third)).not.toBe(opened);
  });

  it("reuses the specialist's home space for a second lane", async () => {
    const ledger = await addSpecialist("Ledger");
    await route(ledger.id, ws.ids.next("lane"));
    const secondLane = ws.ids.next("lane");
    await route(ledger.id, secondLane);
    const lane = await gateway.deps.readModels.lane(ws.workspaceId, secondLane);
    expect(lane?.home_space_id).toBe(ledger.home);
  });
});

describe("a task Chips will not open a lane for", () => {
  it("flattens a route to an unknown harness into a step on the lead's run", async () => {
    const laneId = ws.ids.next("lane");
    const stranger = ws.ids.next("harness");
    const runId = await route(stranger, laneId);

    expect(await gateway.deps.readModels.lane(ws.workspaceId, laneId)).toBeUndefined();
    const steps = await ws.db
      .selectFrom("steps")
      .selectAll()
      .where("run_id", "=", runId)
      .where("status", "=", "done")
      .execute();
    expect(steps.some((step) => String(step.title).includes("no harness"))).toBe(true);
  });

  it("flattens a route to a harness removed from the workspace (ADR 0078)", async () => {
    const ledger = await addSpecialist("Ledger");
    const removed = await gateway.deps.removeHarness({
      principal: arjun(),
      harnessId: ledger.id,
    });
    expect(removed.ok).toBe(true);
    const laneId = ws.ids.next("lane");
    const runId = await route(ledger.id, laneId);

    expect(await gateway.deps.readModels.lane(ws.workspaceId, laneId)).toBeUndefined();
    const steps = await ws.db
      .selectFrom("steps")
      .selectAll()
      .where("run_id", "=", runId)
      .where("status", "=", "done")
      .execute();
    expect(steps.some((step) => String(step.title).includes("Ledger was removed"))).toBe(true);
  });

  it("flattens a route back to a participant already in the chain", async () => {
    // Scout → Ledger opens a lane; Ledger routing back to Scout would loop, because Scout is
    // already in the trail above it.
    const ledger = await addSpecialist("Ledger");
    const first = ws.ids.next("lane");
    await route(ledger.id, first);
    const lane = await gateway.deps.readModels.lane(ws.workspaceId, first);
    const back = ws.ids.next("lane");
    await submit(specialist(ledger.id, "Ledger"), {
      type: "task",
      space_id: ledger.home,
      run_id: lane?.run_id,
      idempotency_key: "loop",
      task_id: back,
      to: ws.scout.participantId,
      on_behalf_of: ws.arjun.participantId,
      goal: "Ask Scout again",
      link_to: ledger.home,
    });

    expect(await gateway.deps.readModels.lane(ws.workspaceId, back)).toBeUndefined();
    const steps = await ws.db
      .selectFrom("steps")
      .selectAll()
      .where("run_id", "=", lane?.run_id ?? "")
      .execute();
    expect(steps.some((step) => String(step.title).includes("already in this chain"))).toBe(true);
  });

  it("flattens the fourth level into a step, not a lane", async () => {
    // One specialist hands to the next, three deep; the fourth routing is too deep.
    const chain = [
      await addSpecialist("L1"),
      await addSpecialist("L2"),
      await addSpecialist("L3"),
      await addSpecialist("L4"),
    ];
    // Scout → L1 is depth one.
    const firstLane = ws.ids.next("lane");
    await route(chain[0]?.id ?? "", firstLane);
    let lane = await gateway.deps.readModels.lane(ws.workspaceId, firstLane);

    // L1 → L2 → L3: depths two and three.
    for (let level = 1; level <= 2; level += 1) {
      const from = chain[level - 1];
      const to = chain[level];
      const laneId = ws.ids.next("lane");
      await submit(specialist(from?.id ?? "", `L${level}`), {
        type: "task",
        space_id: from?.home,
        run_id: lane?.run_id,
        idempotency_key: `deep-${level}`,
        task_id: laneId,
        to: to?.id,
        on_behalf_of: ws.arjun.participantId,
        goal: `Level ${level + 1}`,
        link_to: from?.home,
      });
      lane = await gateway.deps.readModels.lane(ws.workspaceId, laneId);
      expect(lane?.depth).toBe(level + 1);
    }
    const l3 = chain[2];
    const l3Run = lane?.run_id ?? "";

    // L3 → L4 would be the fourth level: flattened into a step on L3's run.
    const fourth = ws.ids.next("lane");
    await submit(specialist(l3?.id ?? "", "L3"), {
      type: "task",
      space_id: l3?.home,
      run_id: l3Run,
      idempotency_key: "deep-4",
      task_id: fourth,
      to: chain[3]?.id,
      on_behalf_of: ws.arjun.participantId,
      goal: "Level 4",
      link_to: l3?.home,
    });

    expect(await gateway.deps.readModels.lane(ws.workspaceId, fourth)).toBeUndefined();
    const steps = await ws.db.selectFrom("steps").selectAll().where("run_id", "=", l3Run).execute();
    expect(steps.some((step) => String(step.title).includes("deep"))).toBe(true);
  });
});

describe("an ephemeral child", () => {
  it("mints a transient participant under the lead and routes the lane to it", async () => {
    const laneId = ws.ids.next("lane");
    const runId = ws.ids.next("run");
    await submit(scout(), {
      type: "run.started",
      space_id: ws.spaceId,
      run_id: runId,
      idempotency_key: "child-run",
      goal: "Confirm PO-4471",
      plan: [],
    });
    await submit(scout(), {
      type: "task",
      space_id: ws.spaceId,
      run_id: runId,
      idempotency_key: "child-task",
      task_id: laneId,
      to: "the-analyst",
      child: { label: "Analyst" },
      on_behalf_of: ws.arjun.participantId,
      goal: "Read the three quotes",
      link_to: ws.spaceId,
    });

    // An agent of the lead's own harness (ADR 0087): its run is on Scout's budget, and Scout's
    // connection speaks for it.
    const lane = await gateway.deps.readModels.lane(ws.workspaceId, laneId);
    expect(lane?.specialist_id).toBe(ws.scout.participantId);
    const run = await gateway.deps.readModels.run(ws.workspaceId, lane?.run_id ?? "");
    const child = await gateway.deps.readModels.participant(ws.workspaceId, run?.agent_id ?? "");
    expect(child).toMatchObject({
      kind: "agent",
      display_name: "Analyst",
      harness_id: ws.scout.participantId,
      // It inherits the lead's owner, who is Arjun.
      owner_id: ws.arjun.participantId,
    });
  });
});

describe("telling the lead a lane's news", () => {
  it("tells the lead when the specialist is waiting, then when it is done and what it cost", async () => {
    const ledger = await addSpecialist("Ledger");
    const laneId = ws.ids.next("lane");
    await route(ledger.id, laneId);
    const runId = (await gateway.deps.readModels.lane(ws.workspaceId, laneId))?.run_id ?? "";
    const led = specialist(ledger.id, "Ledger");

    // The specialist needs a person: the lane goes to waiting, and the lead hears so.
    await submit(led, {
      type: "approval.request",
      space_id: ledger.home,
      run_id: runId,
      idempotency_key: "ask",
      approval_id: ws.ids.next("approval"),
      action: { kind: "warehouse.read" },
      risk: ["external"],
      expires_in: 600,
    });
    // Then it reports its cost and finishes.
    await submit(led, {
      type: "usage",
      space_id: ledger.home,
      run_id: runId,
      idempotency_key: "spend",
      scope: "run",
      model: "opus-5",
      input_tokens: 1000,
      output_tokens: 200,
      cost: { usd: 0.03, estimated: true },
    });
    await submit(led, {
      type: "run.completed",
      space_id: ledger.home,
      run_id: runId,
      idempotency_key: "done",
      summary: "Northwind is 4% under last quarter.",
    });

    const updates = await laneUpdates(laneId);
    expect(updates.map((u) => u["state"])).toEqual(["waiting", "completed"]);
    // Each lane.updated landed in the lead's space, where the route card re-renders.
    const spaces = await ws.db
      .selectFrom("events")
      .select("space_id")
      .where("type", "=", "lane.updated")
      .execute();
    expect(spaces.every((row) => row.space_id === ws.spaceId)).toBe(true);

    const done = updates.at(-1);
    expect(done).toMatchObject({ delivery: "queued_to_lead", cost_usd: 0.03 });
    expect(String(done?.["summary"])).toContain("4%");

    const lane = await gateway.deps.readModels.lane(ws.workspaceId, laneId);
    expect(lane).toMatchObject({ state: "completed", delivery: "queued_to_lead", cost_usd: 0.03 });
  });

  it("hands the lane's files back with its summary, so an answer of photos reaches the lead", async () => {
    const ledger = await addSpecialist("Ledger");
    const laneId = ws.ids.next("lane");
    await route(ledger.id, laneId);
    const runId = (await gateway.deps.readModels.lane(ws.workspaceId, laneId))?.run_id ?? "";
    const led = specialist(ledger.id, "Ledger");
    const first = await photo("menu-1.jpg", ledger.id);
    const second = await photo("menu-2.jpg", ledger.id);

    // The specialist answers in its own room, in pictures, and closes with a sentence.
    await submit(led, {
      type: "message.post",
      space_id: ledger.home,
      run_id: runId,
      idempotency_key: "photo-1",
      text: "Menu, page one",
      upload_ids: [first],
    });
    await submit(led, {
      type: "message.post",
      space_id: ledger.home,
      run_id: runId,
      idempotency_key: "photo-2",
      text: "Menu, page two",
      upload_ids: [second],
    });
    await submit(led, {
      type: "run.completed",
      space_id: ledger.home,
      run_id: runId,
      idempotency_key: "done",
      summary: "Here are two menu photos.",
    });

    const done = (await laneUpdates(laneId)).at(-1);
    // In the order they were said, and the summary is no longer the whole answer.
    expect(done?.["attachments"]).toMatchObject([
      { attachment_id: first, filename: "menu-1.jpg", width: 800 },
      { attachment_id: second, filename: "menu-2.jpg", width: 800 },
    ]);
  });

  it("hands back no files from a lane that failed, which has no answer to carry them", async () => {
    const ledger = await addSpecialist("Ledger");
    const laneId = ws.ids.next("lane");
    await route(ledger.id, laneId);
    const runId = (await gateway.deps.readModels.lane(ws.workspaceId, laneId))?.run_id ?? "";
    const led = specialist(ledger.id, "Ledger");

    await submit(led, {
      type: "message.post",
      space_id: ledger.home,
      run_id: runId,
      idempotency_key: "photo-1",
      text: "Half of it",
      upload_ids: [await photo("menu-1.jpg", ledger.id)],
    });
    await submit(led, {
      type: "run.failed",
      space_id: ledger.home,
      run_id: runId,
      idempotency_key: "gave-up",
      error: "The site would not load.",
    });

    const last = (await laneUpdates(laneId)).at(-1);
    expect(last).toMatchObject({ state: "failed" });
    expect(last?.["attachments"]).toBeUndefined();
  });

  it("does not tell the lead again when a running lane keeps running", async () => {
    const ledger = await addSpecialist("Ledger");
    const laneId = ws.ids.next("lane");
    await route(ledger.id, laneId);
    const runId = (await gateway.deps.readModels.lane(ws.workspaceId, laneId))?.run_id ?? "";
    const led = specialist(ledger.id, "Ledger");

    await submit(led, {
      type: "run.status",
      space_id: ledger.home,
      run_id: runId,
      idempotency_key: "s1",
      phase: "reading",
      verb_phrase: "Reading the warehouse…",
    });
    await submit(led, {
      type: "message.post",
      space_id: ledger.home,
      run_id: runId,
      idempotency_key: "m1",
      text: "Working on it.",
    });
    expect(await laneUpdates(laneId)).toEqual([]);
  });
});

describe("a lane whose lead's room was erased (ADR 0067)", () => {
  it("finishes in the specialist's room and tells nobody, rather than bring the room back", async () => {
    const ledger = await addSpecialist("Ledger");
    const laneId = ws.ids.next("lane");
    const leadRun = await route(ledger.id, laneId);
    const runId = (await gateway.deps.readModels.lane(ws.workspaceId, laneId))?.run_id ?? "";
    // The lead's own run is over, and the lane it opened goes on: an erase stops what is still
    // going in the room (agents review, finding 10), and this lane is not in it.
    await submit(scout(), {
      type: "run.completed",
      space_id: ws.spaceId,
      run_id: leadRun,
      idempotency_key: "lead-done",
      summary: "Handed to Ledger.",
    });
    // The room the task came from is PO-4471, and it goes.
    const erased = await gateway.deps.eraseSpace({ principal: arjun(), spaceId: ws.spaceId });
    expect(erased.ok).toBe(true);

    await submit(specialist(ledger.id, "Ledger"), {
      type: "run.completed",
      space_id: ledger.home,
      run_id: runId,
      idempotency_key: "done",
      summary: "Northwind is 4% under last quarter.",
    });

    expect(await laneUpdates(laneId)).toEqual([]);
    expect(await gateway.deps.readModels.space(ws.workspaceId, ws.spaceId)).toBeUndefined();
    const inErased = await ws.db
      .selectFrom("events")
      .select("type")
      .where("space_id", "=", ws.spaceId)
      .execute();
    expect(inErased).toEqual([]);
  });
});

describe("a lead's room erased while its run is going (agents review, finding 10)", () => {
  it("stops the run's lanes, as an archive does, before the room goes", async () => {
    const ledger = await addSpecialist("Ledger");
    const laneId = ws.ids.next("lane");
    await route(ledger.id, laneId);
    const lane = await gateway.deps.readModels.lane(ws.workspaceId, laneId);
    const erased = await gateway.deps.eraseSpace({ principal: arjun(), spaceId: ws.spaceId });
    expect(erased.ok).toBe(true);

    // The lane's own line went with the lead's room; its run, in Ledger's room, says it stopped.
    const laneRun = await gateway.deps.readModels.run(ws.workspaceId, lane?.run_id ?? "");
    expect(laneRun?.state).toBe("cancelled");
    // Ledger was told to stop, in its own room, by the person who deleted the lead's.
    const stops = await ws.db
      .selectFrom("events")
      .select(["space_id", "payload"])
      .where("type", "=", "run.cancel")
      .where("run_id", "=", lane?.run_id ?? "")
      .execute();
    expect(stops.map((each) => each.space_id)).toEqual([ledger.home]);
    // And the lead's own stop went with its room: nothing is left naming the room that went.
    const inErased = await ws.db
      .selectFrom("events")
      .select("type")
      .where("space_id", "=", ws.spaceId)
      .execute();
    expect(inErased).toEqual([]);
  });
});

describe("cancelling a lead's run", () => {
  it("cancels the lanes it opened, down the chain", async () => {
    const ledger = await addSpecialist("Ledger");
    const moody = await addSpecialist("Moody");
    const topLane = ws.ids.next("lane");
    const leadRun = await route(ledger.id, topLane);
    const ledgerLane = await gateway.deps.readModels.lane(ws.workspaceId, topLane);
    const ledgerRun = ledgerLane?.run_id ?? "";

    // Ledger routes onward to Moody: a second level.
    const deepLane = ws.ids.next("lane");
    await submit(specialist(ledger.id, "Ledger"), {
      type: "task",
      space_id: ledger.home,
      run_id: ledgerRun,
      idempotency_key: "deep-task",
      task_id: deepLane,
      to: moody.id,
      on_behalf_of: ws.arjun.participantId,
      goal: "Pull the warehouse figures",
      link_to: ledger.home,
    });
    const moodyLane = await gateway.deps.readModels.lane(ws.workspaceId, deepLane);
    expect(moodyLane?.depth).toBe(2);

    // Arjun cancels Scout's run at the top.
    await submit(arjun(), {
      type: "run.cancel",
      space_id: ws.spaceId,
      run_id: leadRun,
      idempotency_key: "cancel-top",
      reason: "Changed my mind.",
    });

    // Both lane runs, one and two deep, end cancelled.
    expect((await gateway.deps.readModels.run(ws.workspaceId, ledgerRun))?.state).toBe("cancelled");
    expect(
      (await gateway.deps.readModels.run(ws.workspaceId, moodyLane?.run_id ?? ""))?.state,
    ).toBe("cancelled");
    expect((await gateway.deps.readModels.lane(ws.workspaceId, topLane))?.state).toBe("cancelled");
    expect((await gateway.deps.readModels.lane(ws.workspaceId, deepLane))?.state).toBe("cancelled");
  });
});

describe("a lane between two spaces of one harness (M3.5)", () => {
  /** A second room of Scout's own: what a Jacobian Space or a worktree is on the server. */
  async function scoutsOwnRoom(title: string): Promise<string> {
    const opened = await gateway.deps.openSpace({ principal: scout(), key: title, title });
    if (!opened.ok) throw new Error(opened.error.message);
    return opened.value.spaceId;
  }

  it("opens the lane in the home the lead names, as the lead's own run, called by its label", async () => {
    const shopping = await scoutsOwnRoom("Shopping");
    const laneId = ws.ids.next("lane");
    const leadRun = await route(ws.scout.participantId, laneId, {
      home: shopping,
      label: "Shopping",
    });

    const lane = await gateway.deps.readModels.lane(ws.workspaceId, laneId);
    expect(lane).toMatchObject({
      lead_id: ws.scout.participantId,
      specialist_id: ws.scout.participantId,
      home_space_id: shopping,
      lead_run_id: leadRun,
      depth: 1,
      state: "running",
    });
    expect(lane?.linked_space_ids).toEqual([ws.spaceId]);
    // The lane's run is Scout's own, in the room it named.
    const run = await gateway.deps.readModels.run(ws.workspaceId, lane?.run_id ?? "");
    expect(run).toMatchObject({
      harness_id: ws.scout.participantId,
      space_id: shopping,
      state: "running",
    });
    // The `run.requested` that opened it carries the label the cards show.
    const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, 200);
    const requested = page.events.find((event) => event.type === "run.requested");
    expect(requested?.payload).toMatchObject({ lane_id: laneId, label: "Shopping" });
  });

  it("lets the lane live in the lead's own space, which is where a subagent works", async () => {
    // A subagent runs where its lead already is: home and link are one room.
    const laneId = ws.ids.next("lane");
    await route(ws.scout.participantId, laneId, { home: ws.spaceId, label: "Explore" });
    const lane = await gateway.deps.readModels.lane(ws.workspaceId, laneId);
    expect(lane?.home_space_id).toBe(ws.spaceId);
    expect(lane?.linked_space_ids).toEqual([ws.spaceId]);
  });

  it("refuses as a home a room the lead is not in, and keeps the work in the lead's run", async () => {
    const ledger = await addSpecialist("Ledger");
    const laneId = ws.ids.next("lane");
    // Ledger's direct space with Arjun is Ledger's and Arjun's; Scout is not in it.
    const runId = await route(ws.scout.participantId, laneId, { home: ledger.home });

    expect(await gateway.deps.readModels.lane(ws.workspaceId, laneId)).toBeUndefined();
    const steps = await ws.db.selectFrom("steps").selectAll().where("run_id", "=", runId).execute();
    expect(steps.some((step) => String(step.title).includes("not a space of yours"))).toBe(true);
  });

  it("tells the lead where the lane is when it acknowledges the task, and again on a retry", async () => {
    const shopping = await scoutsOwnRoom("Shopping");
    const laneId = ws.ids.next("lane");
    const runId = ws.ids.next("run");
    await submit(scout(), {
      type: "run.started",
      space_id: ws.spaceId,
      run_id: runId,
      idempotency_key: `${laneId}-run`,
      goal: "Buy the thing",
      plan: [],
    });
    const task = {
      type: "task",
      space_id: ws.spaceId,
      run_id: runId,
      idempotency_key: `${laneId}-task`,
      task_id: laneId,
      to: ws.scout.participantId,
      home: shopping,
      label: "Shopping",
      on_behalf_of: ws.arjun.participantId,
      goal: "Find the cheapest one",
    };
    const first = await gateway.deps.submitEvent({ event: task, principal: scout() });
    if (!first.ok) throw new Error(first.error.message);
    const lane = await gateway.deps.readModels.lane(ws.workspaceId, laneId);
    expect(first.value.lane).toEqual({
      lane_id: laneId,
      run_id: lane?.run_id,
      space_id: shopping,
    });

    const again = await gateway.deps.submitEvent({ event: task, principal: scout() });
    if (!again.ok) throw new Error(again.error.message);
    expect(again.value.duplicate).toBe(true);
    expect(again.value.lane).toEqual(first.value.lane);

    // A task Chips flattened acknowledges without a lane.
    const flat = await gateway.deps.submitEvent({
      event: { ...task, idempotency_key: "flat", task_id: ws.ids.next("lane"), to: "hrn_nobody" },
      principal: scout(),
    });
    if (!flat.ok) throw new Error(flat.error.message);
    expect(flat.value.lane).toBeUndefined();
  });

  it("is worked by the lead's own token, and the lead hears its news like any lane's", async () => {
    const shopping = await scoutsOwnRoom("Shopping");
    const laneId = ws.ids.next("lane");
    await route(ws.scout.participantId, laneId, { home: shopping, label: "Shopping" });
    const lane = await gateway.deps.readModels.lane(ws.workspaceId, laneId);
    const laneRun = lane?.run_id ?? "";

    await submit(scout(), {
      type: "message.post",
      space_id: shopping,
      run_id: laneRun,
      idempotency_key: "shopping-said",
      text: "The Anker one, at $34.",
    });
    await submit(scout(), {
      type: "run.completed",
      space_id: shopping,
      run_id: laneRun,
      idempotency_key: "shopping-done",
      summary: "The Anker one, at $34.",
    });

    const after = await gateway.deps.readModels.lane(ws.workspaceId, laneId);
    expect(after).toMatchObject({ state: "completed", summary: "The Anker one, at $34." });
    const updates = await laneUpdates(laneId);
    expect(updates.at(-1)).toMatchObject({
      space_id: ws.spaceId,
      state: "completed",
      summary: "The Anker one, at $34.",
    });
  });

  it("outlives the lead's run: a job handed on without waiting ends after its lead answered, and the lead's room still hears its answer and cost (long jobs Phase 5)", async () => {
    const shopping = await scoutsOwnRoom("Shopping");
    const laneId = ws.ids.next("lane");
    const leadRun = await route(ws.scout.participantId, laneId, {
      home: shopping,
      label: "Shopping",
    });
    const laneRun = (await gateway.deps.readModels.lane(ws.workspaceId, laneId))?.run_id ?? "";

    // The lead says it handed the job on, and its run ends before the job's begins.
    await submit(scout(), {
      type: "run.completed",
      space_id: ws.spaceId,
      run_id: leadRun,
      idempotency_key: "lead-done",
      summary: "Shopping has it, and will answer you there.",
    });
    expect((await gateway.deps.readModels.lane(ws.workspaceId, laneId))?.state).toBe("running");

    // The job takes the lane's run over later, in its own room, and ends it with its answer.
    await submit(scout(), {
      type: "message.post",
      space_id: shopping,
      run_id: laneRun,
      idempotency_key: "job-said",
      text: "The Anker one, at $34.",
    });
    await submit(scout(), {
      type: "usage",
      space_id: shopping,
      run_id: laneRun,
      idempotency_key: "job-spent",
      scope: "run",
      model: "opus-5",
      input_tokens: 4000,
      output_tokens: 300,
      cost: { usd: 0.21, estimated: true },
    });
    await submit(scout(), {
      type: "run.completed",
      space_id: shopping,
      run_id: laneRun,
      idempotency_key: "job-done",
      summary: "The Anker one, at $34.",
    });

    expect(await gateway.deps.readModels.lane(ws.workspaceId, laneId)).toMatchObject({
      state: "completed",
      summary: "The Anker one, at $34.",
      cost_usd: 0.21,
    });
    expect((await laneUpdates(laneId)).at(-1)).toMatchObject({
      space_id: ws.spaceId,
      state: "completed",
      summary: "The Anker one, at $34.",
      cost_usd: 0.21,
    });
  });
});

describe("what a lead may say on a task (Gate 3)", () => {
  /** A room of Scout's own, opened for Arjun; Dana is not in it. */
  async function scoutsRoom(title: string): Promise<string> {
    const opened = await gateway.deps.openSpace({ principal: scout(), key: title, title });
    if (!opened.ok) throw new Error(opened.error.message);
    return opened.value.spaceId;
  }

  async function stepTitles(runId: string): Promise<string[]> {
    const steps = await ws.db.selectFrom("steps").selectAll().where("run_id", "=", runId).execute();
    return steps.map((step) => String(step.title));
  }

  it("links a lane into the space the task came from, and into link_to only when the lead is in it", async () => {
    const ledger = await addSpecialist("Ledger");
    const bystander = await addSpecialist("Bystander");
    const laneId = ws.ids.next("lane");
    // The bystander's direct space with Arjun is not Scout's to link a lane into.
    await route(ledger.id, laneId, { link_to: bystander.home });
    const lane = await gateway.deps.readModels.lane(ws.workspaceId, laneId);
    expect(lane?.linked_space_ids).toEqual([ws.spaceId]);

    await submit(specialist(ledger.id, "Ledger"), {
      type: "run.completed",
      space_id: lane?.home_space_id,
      run_id: lane?.run_id,
      idempotency_key: `${laneId}-done`,
      summary: "Within 2 percent of last quarter.",
    });
    // The lane's news lands in the lead's own space, and nowhere the lead is not.
    expect((await laneUpdates(laneId)).map((update) => update["space_id"])).toEqual([ws.spaceId]);
  });

  it("keeps a task on behalf of nobody, or of somebody not in the space, in the lead's run", async () => {
    const ledger = await addSpecialist("Ledger");
    const laneId = ws.ids.next("lane");
    const runId = await route(ledger.id, laneId, { on_behalf_of: "usr_nobody" });
    expect(await gateway.deps.readModels.lane(ws.workspaceId, laneId)).toBeUndefined();
    expect((await stepTitles(runId)).some((title) => title.includes("is not a person here"))).toBe(
      true,
    );
    // Nothing was opened for the ghost.
    const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, 500);
    expect(
      page.events.some(
        (event) => event.type === "space.created" && event.payload["opened_for"] === "usr_nobody",
      ),
    ).toBe(false);

    // Dana exists and is in the shared space, but not in Scout's own room.
    const shopping = await scoutsRoom("Shopping");
    const second = ws.ids.next("lane");
    const inRoom = ws.ids.next("run");
    await submit(scout(), {
      type: "run.started",
      space_id: shopping,
      run_id: inRoom,
      idempotency_key: `${second}-run`,
      goal: "Buy the thing",
      plan: [],
    });
    await submit(scout(), {
      type: "task",
      space_id: shopping,
      run_id: inRoom,
      idempotency_key: `${second}-task`,
      task_id: second,
      to: ledger.id,
      on_behalf_of: ws.dana.participantId,
      goal: "Find the cheapest one",
    });
    expect(await gateway.deps.readModels.lane(ws.workspaceId, second)).toBeUndefined();
    expect((await stepTitles(inRoom)).some((title) => title.includes("not in this space"))).toBe(
      true,
    );
  });

  it("keeps a task wearing another lead's lane id in the run, and acknowledges no lane for it", async () => {
    const ledger = await addSpecialist("Ledger");
    const other = await addSpecialist("Other");
    const laneId = ws.ids.next("lane");
    await route(ledger.id, laneId);

    const lead = specialist(other.id, "Other");
    const runId = ws.ids.next("run");
    await submit(lead, {
      type: "run.started",
      space_id: other.home,
      run_id: runId,
      idempotency_key: `${laneId}-other-run`,
      goal: "Something else",
      plan: [],
    });
    const result = await gateway.deps.submitEvent({
      event: {
        type: "task",
        space_id: other.home,
        run_id: runId,
        idempotency_key: `${laneId}-other-task`,
        task_id: laneId,
        to: ledger.id,
        on_behalf_of: ws.arjun.participantId,
        goal: "Wearing a lane id that is not mine",
      },
      principal: lead,
    });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.lane).toBeUndefined();
    expect(
      (await stepTitles(runId)).some((title) => title.includes("belongs to another lead")),
    ).toBe(true);
    // The first lead's lane is untouched.
    const lane = await gateway.deps.readModels.lane(ws.workspaceId, laneId);
    expect(lane?.lead_id).toBe(ws.scout.participantId);
    expect(lane?.linked_space_ids).toEqual([ws.spaceId]);
  });

  it("leaves a lane that already ended alone when the lead's run is cancelled", async () => {
    const ledger = await addSpecialist("Ledger");
    const laneId = ws.ids.next("lane");
    const leadRun = await route(ledger.id, laneId);
    const lane = await gateway.deps.readModels.lane(ws.workspaceId, laneId);
    await submit(specialist(ledger.id, "Ledger"), {
      type: "run.completed",
      space_id: lane?.home_space_id,
      run_id: lane?.run_id,
      idempotency_key: `${laneId}-done`,
      summary: "Done before the cancel.",
    });
    await submit(arjun(), {
      type: "run.cancel",
      space_id: ws.spaceId,
      run_id: leadRun,
      idempotency_key: `${laneId}-cancel`,
      reason: "Changed my mind.",
      by: ws.arjun.participantId,
    });

    // Completed stays completed: no second lane.updated, and no run.cancel into a finished run.
    expect((await laneUpdates(laneId)).map((update) => update["state"])).toEqual(["completed"]);
    const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, 500);
    expect(
      page.events.some((event) => event.type === "run.cancel" && event.run_id === lane?.run_id),
    ).toBe(false);
    expect((await gateway.deps.readModels.lane(ws.workspaceId, laneId))?.state).toBe("completed");
  });
});
