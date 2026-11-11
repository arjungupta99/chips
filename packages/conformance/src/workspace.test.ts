/**
 * The door's rules, one at a time, with no port in the room. Each is the real server's rule
 * (`server/src/domain/authorize.ts`) restated here, so an adapter refused by the fake would have
 * been refused by chipsd for the same reason.
 */

import {
  CEILING,
  createIdGenerator,
  FORK_WAIT_MS,
  HARNESS_CAPABILITIES,
  messageIdOf,
} from "@chipschat/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { type Principal, type StoredEvent, Workspace } from "./workspace.js";

const WORKSPACE = "ws_01K4ZQPX000000000000000001";
const OWNER: Principal = {
  kind: "person",
  participantId: "usr_01K4ZQPX000000000000000002",
  workspaceId: WORKSPACE,
  displayName: "Arjun",
};
const HARNESS: Principal = {
  kind: "harness",
  participantId: "hrn_01K4ZQPX000000000000000003",
  workspaceId: WORKSPACE,
  displayName: "Scout",
};
const RUN = "run_01K4ZQPX000000000000000004";
const APPROVAL = "apr_01K4ZQPX000000000000000005";

let ws: Workspace;
let space: string;
let tick: number;

beforeEach(() => {
  tick = 0;
  ws = new Workspace({
    workspaceId: WORKSPACE,
    owner: OWNER,
    harness: HARNESS,
    ids: createIdGenerator(),
    now: () => {
      tick += 1;
      return new Date(Date.UTC(2026, 8, 5, 10, 0, tick));
    },
  });
  space = ws.createDirectSpace();
});

function ok(
  principal: Principal,
  event: Record<string, unknown>,
  key = `k${ws.head() + 1}`,
): StoredEvent {
  const outcome = ws.submit(principal, { idempotency_key: key, ...event });
  if (!outcome.ok) throw new Error(outcome.error.message);
  return outcome.event;
}

function refused(principal: Principal, event: Record<string, unknown>) {
  const outcome = ws.submit(principal, {
    idempotency_key: `k${ws.head() + 1}-${Math.random()}`,
    ...event,
  });
  if (outcome.ok) throw new Error(`expected a refusal, got seq ${outcome.event.seq}`);
  return outcome.error;
}

/** The harness's default agent: who it is in a room it was given (ADR 0087's addendum). */
function agent(): string {
  const found = [...ws.agents.values()].find((each) => each.key === HARNESS.participantId);
  if (found === undefined) throw new Error("the harness has no default agent");
  return found.agent_id;
}

function start(): StoredEvent {
  return ok(HARNESS, { type: "run.started", space_id: space, run_id: RUN, goal: "Confirm the PO" });
}

describe("the direct space", () => {
  it("has the owner and the harness's agent in it, and nobody else sees it", () => {
    expect(ws.roleOf(space, OWNER.participantId)).toBe("owner");
    // The harness is there as its default agent, named after it (ADR 0087's addendum).
    expect(ws.roleOf(space, agent())).toBe("member");
    expect(ws.roleOf(space, HARNESS.participantId)).toBeUndefined();
    expect(ws.agents.get(agent())?.name).toBe("Scout");
    expect(ws.memberSpacesOf(HARNESS.participantId)).toEqual([space]);
    expect(ws.log.map((event) => event.type)).toEqual([
      "space.created",
      "agent.registered",
      "membership.added",
      "membership.added",
      "agent.attached",
    ]);
    // The room, and where the agent is, are its members'. That there is such an agent is for
    // those who are told every agent, and nobody else outside the room: a guest or a member in no
    // room with it is sent nothing of it (agents review, finding 3; ADR 0034's addendum).
    const stranger = { participantId: "usr_x", memberSpaces: new Set<string>() };
    expect(ws.log.map((event) => ws.canSee(event, stranger))).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(ws.log.map((event) => ws.canSee(event, { ...stranger, seesDirectory: true }))).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(ws.log.map((event) => ws.canSee(event, { ...stranger, seesAgents: true }))).toEqual([
      false,
      true,
      false,
      false,
      false,
    ]);
  });
});

describe("what Chips fills in", () => {
  it("stamps the clock, the actor and who decided, and takes the run from the path", () => {
    start();
    const asked = ok(HARNESS, {
      type: "approval.request",
      run_id: RUN,
      approval_id: APPROVAL,
      action: { kind: "email.send" },
      risk: ["external"],
      expires_in: 60,
    });
    // The space came from the run, the clock from Chips, the fallback from the schema.
    expect(asked.space_id).toBe(space);
    expect(asked.ts).toBe("2026-09-05T10:00:07.000Z");
    expect(asked.payload["fallback"]).toBe("deny");
    expect(ws.approvals.get(APPROVAL)?.expires_at).toBe("2026-09-05T10:01:07.000Z");
    // By the harness's agent there, with the harness beside it (ADR 0087).
    expect(asked.actor).toEqual({ kind: "agent", id: agent(), harness_id: HARNESS.participantId });

    const outcome = ws.submit(
      OWNER,
      {
        type: "approval.resolved",
        approval_id: APPROVAL,
        decision: "approved",
        resolved_by: "somebody-else",
        resolved_at: "1999-01-01T00:00:00.000Z",
        resolved_elsewhere: true,
      },
      { runId: RUN, idempotencyKey: "decide" },
    );
    if (!outcome.ok) throw new Error(outcome.error.message);
    expect(outcome.event.payload).toMatchObject({
      resolved_by: OWNER.participantId,
      resolved_at: "2026-09-05T10:00:08.000Z",
      resolved_elsewhere: false,
      scope: "once",
    });
    expect(ws.runs.get(RUN)?.state).toBe("running");
    expect(ws.approvals.get(APPROVAL)).toMatchObject({ state: "resolved", decision: "approved" });
  });
});

describe("the rules", () => {
  it("1–3: the workspace, the actor, the direction, the key", () => {
    expect(
      refused(HARNESS, {
        type: "message.post",
        space_id: space,
        text: "x",
        workspace_id: "ws_01K4ZQPX000000000000000009",
      }).kind,
    ).toBe("wrong_workspace");
    expect(
      refused(HARNESS, {
        type: "message.post",
        space_id: space,
        text: "x",
        actor: { kind: "person", id: OWNER.participantId },
      }).kind,
    ).toBe("wrong_actor");
    expect(
      refused(OWNER, { type: "step.log", space_id: space, step_id: "s", status: "done" }).kind,
    ).toBe("wrong_direction");
    // A decision is shared since M5.5; a harness is refused one that is not its own run's ask
    // (rule 9, ADR 0079) — here, an ask that does not exist.
    expect(
      refused(HARNESS, { type: "approval.resolved", approval_id: APPROVAL, decision: "approved" })
        .kind,
    ).toBe("unknown_approval");
    const noKey = ws.submit(HARNESS, { type: "message.post", space_id: space, text: "x" });
    expect(noKey.ok ? undefined : noKey.error.kind).toBe("missing_idempotency_key");
  });

  it("2: takes a heartbeat's check-in from a harness, and not from a person (ADR 0143)", () => {
    const beat = { type: "message.post", space_id: space, text: "x", heartbeat: true };
    expect(refused(OWNER, beat).kind).toBe("wrong_direction");
    expect(ok(HARNESS, beat).payload["heartbeat"]).toBe(true);
  });

  it("refuses what only Chips produces, and what it works out for itself", () => {
    expect(refused(OWNER, { type: "message.new", space_id: space, text: "x" }).kind).toBe(
      "not_submittable",
    );
    expect(refused(HARNESS, { type: "budget.warning" }).kind).toBe("not_submittable");
  });

  it("takes an agent's events from nobody, as the real door does (agents review, finding 1)", () => {
    const forged: Record<string, unknown>[] = [
      { type: "agent.updated", agent_id: agent(), name: "Mine now" },
      {
        type: "agent.registered",
        agent_id: agent(),
        harness_id: HARNESS.participantId,
        key: "k",
        name: "Mine now",
        lead: true,
      },
      { type: "membership.replaced", space_id: space, from: agent(), to: agent() },
      { type: "agent.fork", space_id: space, agent_id: agent(), by: OWNER.participantId },
    ];
    for (const event of forged) {
      for (const sender of [OWNER, HARNESS]) {
        expect(refused(sender, event).kind, `${String(event["type"])}`).toBe("not_submittable");
      }
    }
    expect(ws.agents.get(agent())?.name).toBe("Scout");
  });

  it("drops what is Chips's to write from what a sender wrote (agents review, finding 2)", () => {
    const said = ok(OWNER, {
      type: "message.post",
      space_id: space,
      text: "hello",
      held_since: "2020-01-01T00:00:00.000Z",
      from_held: "evt_01K4ZQPX0000000000000000ZZ",
    });
    expect(said.payload).not.toHaveProperty("held_since");
    expect(said.payload).not.toHaveProperty("from_held");
    const removed = ok(OWNER, {
      type: "membership.removed",
      space_id: space,
      participant_id: agent(),
      removed_by: "usr_somebody_else",
      reason: "archived",
      moved_to: "spc_01K4ZQPX0000000000000000ZZ",
    });
    expect(removed.payload).not.toHaveProperty("reason");
    expect(removed.payload).not.toHaveProperty("moved_to");
    expect(removed.payload["removed_by"]).toBe(OWNER.participantId);
  });

  it("validates against the protocol's own schemas, and says which field", () => {
    const error = refused(HARNESS, { type: "run.started", space_id: space, run_id: RUN, goal: "" });
    expect(error.code).toBe("invalid_event");
    expect(error.issues?.some((issue) => issue.path.includes("goal"))).toBe(true);
    expect(refused(HARNESS, { type: "no.such.event" }).kind).toBe("invalid");
  });

  it("4: a run begins with run.started, in a space, and is its harness's", () => {
    expect(refused(HARNESS, { type: "run.started", run_id: RUN, goal: "no space" }).kind).toBe(
      "invalid",
    );
    expect(
      refused(HARNESS, { type: "step.log", run_id: RUN, step_id: "s", status: "done" }),
    ).toMatchObject({
      code: "not_found",
      kind: "unknown_run",
    });
    start();
    expect(
      refused(HARNESS, {
        type: "step.log",
        run_id: RUN,
        space_id: "spc_01K4ZQPX000000000000000099",
        step_id: "s",
        status: "done",
      }).kind,
    ).toBe("wrong_run");
    // A restated start is a retry, not a second run.
    const again = ws.submit(HARNESS, {
      idempotency_key: "again",
      type: "run.started",
      space_id: space,
      run_id: RUN,
      goal: "Confirm the PO",
    });
    expect(again.ok).toBe(true);
    expect(ws.runs.size).toBe(1);
  });

  it("4: a run that has ended takes nothing more", () => {
    start();
    ok(HARNESS, { type: "run.completed", run_id: RUN, summary: "Done." });
    expect(ws.runs.get(RUN)?.state).toBe("done");
    expect(
      refused(HARNESS, { type: "step.log", run_id: RUN, step_id: "s", status: "done" }),
    ).toMatchObject({
      code: "invalid_event",
      kind: "run_state",
    });
    expect(refused(OWNER, { type: "run.pause", run_id: RUN }).kind).toBe("run_state");
  });

  it("4: a run that has ended still takes what it cost (ADR 0155)", () => {
    start();
    ok(OWNER, { type: "run.cancel", space_id: space, run_id: RUN });
    ok(HARNESS, {
      type: "usage",
      space_id: space,
      run_id: RUN,
      scope: "run",
      model: "claude-opus-5-5",
      input_tokens: 18_000,
      output_tokens: 200,
      cost: { usd: 0.19, estimated: true },
    });
    expect(
      refused(HARNESS, { type: "run.failed", space_id: space, run_id: RUN, error: "Restarted." })
        .kind,
    ).toBe("run_state");
  });

  it("4: a run that has ended still takes the answer to a question it asked", () => {
    start();
    const ask = "qst_01K4ZQPX000000000000000007";
    ok(HARNESS, {
      type: "question.ask",
      run_id: RUN,
      ask_id: ask,
      questions: [
        {
          question_id: "q1",
          prompt: "Which?",
          options: [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ],
        },
      ],
    });
    ok(HARNESS, { type: "run.completed", run_id: RUN, summary: "Asked." });
    ok(OWNER, {
      type: "question.answered",
      run_id: RUN,
      ask_id: ask,
      answers: [{ question_id: "q1", values: ["a"] }],
    });
    expect(ws.questions.get(ask)?.state).toBe("answered");
    expect(ws.runs.get(RUN)?.state).toBe("done");
  });

  it("4: a pause wants a running run and a resume a paused one", () => {
    start();
    expect(refused(OWNER, { type: "run.resume", run_id: RUN }).message).toContain("is not paused");
    ok(OWNER, { type: "run.pause", run_id: RUN });
    expect(ws.runs.get(RUN)?.state).toBe("waiting");
    expect(refused(OWNER, { type: "run.pause", run_id: RUN }).message).toContain(
      "cannot be paused",
    );
    ok(OWNER, { type: "run.resume", run_id: RUN });
    expect(ws.runs.get(RUN)?.state).toBe("running");
  });

  it("5: an event into a space comes from a member of it", () => {
    expect(
      refused(HARNESS, {
        type: "message.post",
        space_id: "spc_01K4ZQPX000000000000000099",
        text: "x",
      }).kind,
    ).toBe("wrong_space");
  });

  it("6: first answer wins, and an answer names an ask that exists", () => {
    start();
    expect(
      refused(OWNER, {
        type: "approval.resolved",
        run_id: RUN,
        approval_id: APPROVAL,
        decision: "approved",
      }).kind,
    ).toBe("unknown_approval");
    ok(HARNESS, {
      type: "approval.request",
      run_id: RUN,
      approval_id: APPROVAL,
      action: { kind: "email.send" },
      risk: [],
      expires_in: 60,
    });
    ok(OWNER, {
      type: "approval.resolved",
      run_id: RUN,
      approval_id: APPROVAL,
      decision: "denied",
    });
    const second = refused(OWNER, {
      type: "approval.resolved",
      run_id: RUN,
      approval_id: APPROVAL,
      decision: "approved",
    });
    expect(second.kind).toBe("already_decided");
    expect(second.message).toContain(OWNER.participantId);

    const ask = "qst_01K4ZQPX000000000000000006";
    expect(
      refused(OWNER, {
        type: "question.answered",
        run_id: RUN,
        ask_id: ask,
        answers: [{ question_id: "q1", values: ["a"] }],
      }).kind,
    ).toBe("unknown_question");
    ok(HARNESS, {
      type: "question.ask",
      run_id: RUN,
      ask_id: ask,
      questions: [
        {
          question_id: "q1",
          prompt: "Which?",
          options: [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ],
        },
      ],
    });
    ok(OWNER, {
      type: "question.answered",
      run_id: RUN,
      ask_id: ask,
      answers: [{ question_id: "q1", values: ["a"] }],
    });
    expect(ws.questions.get(ask)).toMatchObject({
      state: "answered",
      answered_by: OWNER.participantId,
    });
    expect(
      refused(OWNER, {
        type: "question.answered",
        run_id: RUN,
        ask_id: ask,
        answers: [{ question_id: "q1", values: ["b"] }],
      }).kind,
    ).toBe("already_decided");
  });

  it("takes a repeated key as the same event, changing nothing", () => {
    const first = ok(HARNESS, { type: "message.post", space_id: space, text: "hello" }, "same");
    const again = ws.submit(HARNESS, {
      idempotency_key: "same",
      type: "message.post",
      space_id: space,
      text: "hello",
    });
    expect(again).toEqual({ ok: true, event: first, duplicate: true });
    expect(ws.log.filter((event) => event.type === "message.post")).toHaveLength(1);
  });

  it("keeps every refusal, with who was refused and for what", () => {
    refused(HARNESS, { type: "step.log", run_id: RUN, step_id: "s", status: "done" });
    expect(ws.refusals).toEqual([
      expect.objectContaining({
        who: "harness",
        type: "step.log",
        kind: "unknown_run",
        code: "not_found",
      }),
    ]);
  });
});

describe("a harness's own space", () => {
  it("is opened once by its key, for the owner, and found after that", () => {
    const first = ws.openSpace("/Users/arjun/Work/Chips", "Chips · main");
    const again = ws.openSpace("/Users/arjun/Work/Chips", undefined);
    expect(first.created).toBe(true);
    expect(again).toEqual({ spaceId: first.spaceId, created: false, joined: false });
    const row = ws.spaces.get(first.spaceId);
    expect(row?.title).toBe("Chips · main");
    expect(row?.external_key).toBe(`${HARNESS.participantId}:/Users/arjun/Work/Chips`);

    // A shared key — a worktree another harness may work in — is stored under its own
    // namespace, as the real server stores it (ADR 0033); with one harness here nobody joins.
    const shared = ws.openSpace("/Users/arjun/Work/Chips", "Chips · main", true);
    expect(shared.created).toBe(true);
    expect(shared.joined).toBe(false);
    expect(ws.spaces.get(shared.spaceId)?.external_key).toBe("shared:/Users/arjun/Work/Chips");
    expect(ws.openSpace("/Users/arjun/Work/Chips", undefined, true).spaceId).toBe(shared.spaceId);
    expect(row?.members.get(OWNER.participantId)).toBe("owner");
    // The harness is in it as its key's own agent, named after it (ADR 0087's addendum of 30
    // September, point 2), and numbered past its default agent, which has the name (ADR 0091).
    expect(row?.members.get(HARNESS.participantId)).toBeUndefined();
    const keyed = [...ws.agents.values()].find((each) => each.key === "/Users/arjun/Work/Chips");
    expect(keyed?.name).toBe("Scout 2");
    expect(row?.members.get(keyed?.agent_id ?? "")).toBe("member");
    // The owner is sent the event that names it, though the harness opened it (ADR 0024).
    const created = ws.log.find(
      (event) => event.space_id === first.spaceId && event.type === "space.created",
    );
    expect(created?.payload["opened_for"]).toBe(OWNER.participantId);
    expect(
      ws.canSee(created as StoredEvent, {
        participantId: OWNER.participantId,
        memberSpaces: new Set(),
      }),
    ).toBe(true);
  });

  it("names the participants that share a space", () => {
    expect(ws.participantsVisibleTo(HARNESS.participantId).map((each) => each.displayName)).toEqual(
      ["Arjun", "Scout"],
    );
  });
});

describe("reading the log", () => {
  it("pages what the viewer may see, after a cursor", () => {
    start();
    for (let i = 0; i < 3; i += 1)
      ok(HARNESS, { type: "step.log", run_id: RUN, step_id: `s${i}`, status: "done" });
    const viewer = { participantId: HARNESS.participantId, memberSpaces: new Set([space]) };
    const first = ws.since(0, 4, viewer);
    expect(first.events.map((event) => event.seq)).toEqual([1, 2, 3, 4]);
    expect(first.nextCursor).toBe(4);
    const rest = ws.since(first.nextCursor ?? 0, 100, viewer);
    expect(rest.events.map((event) => event.type)).toEqual([
      "agent.attached",
      "run.started",
      "step.log",
      "step.log",
      "step.log",
    ]);
    expect(rest.nextCursor).toBeNull();
    expect(ws.liveRunIn(space, HARNESS.participantId)?.run_id).toBe(RUN);
    expect(ws.liveRunIn("spc_other", HARNESS.participantId)).toBeUndefined();
  });
});

describe("uploads", () => {
  it("are the uploader's, described as the bytes turned out, and attach by id", () => {
    const slot = ws.newUpload(HARNESS, "PO-4471.pdf");
    expect(ws.storeUpload(OWNER, slot.attachment_id, new Uint8Array([1]))).toMatchObject({
      ok: false,
      error: { kind: "not_yours" },
    });
    expect(ws.storeUpload(HARNESS, "att_missing", new Uint8Array([1]))).toMatchObject({
      ok: false,
      error: { kind: "unknown_slot" },
    });
    const stored = ws.storeUpload(HARNESS, slot.attachment_id, new Uint8Array([1, 2, 3]));
    expect(stored.ok && stored.row.stored).toMatchObject({
      mime_type: "application/pdf",
      byte_size: 3,
    });

    const posted = ok(HARNESS, {
      type: "message.post",
      space_id: space,
      text: "The PO",
      upload_ids: [slot.attachment_id],
    });
    expect(posted.payload["attachments"]).toEqual([
      expect.objectContaining({
        attachment_id: slot.attachment_id,
        filename: "PO-4471.pdf",
        mime_type: "application/pdf",
      }),
    ]);
    // An upload nobody put bytes in, or somebody else's, is not an attachment.
    const empty = ws.newUpload(OWNER, "notes.txt");
    expect(
      refused(HARNESS, {
        type: "message.post",
        space_id: space,
        text: "x",
        upload_ids: [empty.attachment_id],
      }).code,
    ).toBe("invalid_event");
  });
});

describe("a key is the sender's own", () => {
  it("lets the owner and the harness both say hello-1, and answers each retry as its own", () => {
    const mine = ok(OWNER, { type: "message.post", space_id: space, text: "hello" }, "hello-1");
    const theirs = ok(HARNESS, { type: "message.post", space_id: space, text: "hello" }, "hello-1");
    expect(theirs.seq).toBe(mine.seq + 1);
    const again = ws.submit(HARNESS, {
      idempotency_key: "hello-1",
      type: "message.post",
      space_id: space,
      text: "hello",
    });
    expect(again).toMatchObject({ ok: true, duplicate: true, event: { seq: theirs.seq } });
  });
});

describe("lanes (M3.5)", () => {
  const LANE = "lane_01K4ZQPX00000000000000000A";

  function started(): void {
    ok(HARNESS, {
      type: "run.started",
      space_id: space,
      run_id: RUN,
      goal: "Confirm PO #4471",
      plan: [],
    });
  }

  it("opens a lane for a task the harness routes to itself, and says where it is", () => {
    started();
    const outcome = ws.submit(HARNESS, {
      type: "task",
      space_id: space,
      run_id: RUN,
      idempotency_key: "task-1",
      task_id: LANE,
      to: HARNESS.participantId,
      home: space,
      label: "Explore",
      goal: "Find the quotes",
      on_behalf_of: OWNER.participantId,
    });
    if (!outcome.ok) throw new Error(outcome.error.message);
    expect(outcome.lane).toMatchObject({ lane_id: LANE, space_id: space });
    const laneRun = outcome.lane?.run_id ?? "";
    // The run is seeded, the harness's own, so the lane can be worked without a run.started.
    expect(ws.runs.get(laneRun)).toMatchObject({
      harness_id: HARNESS.participantId,
      space_id: space,
      state: "running",
    });
    const requested = ws.log.find((event) => event.type === "run.requested");
    expect(requested?.payload).toMatchObject({
      lane_id: LANE,
      specialist_id: HARNESS.participantId,
      label: "Explore",
      link_to: [space],
    });
    // A retry is the same lane.
    const again = ws.submit(HARNESS, {
      type: "task",
      space_id: space,
      run_id: RUN,
      idempotency_key: "task-1",
      task_id: LANE,
      to: HARNESS.participantId,
      home: space,
      goal: "Find the quotes",
      on_behalf_of: OWNER.participantId,
    });
    expect(again).toMatchObject({ ok: true, duplicate: true, lane: outcome.lane });

    // The lane's run ends: the lead hears it, in the space the lane is linked into.
    ok(HARNESS, {
      type: "run.completed",
      space_id: space,
      run_id: laneRun,
      summary: "Under quotes/.",
    });
    const news = ws.log.find((event) => event.type === "lane.updated");
    expect(news?.payload).toMatchObject({
      lane_id: LANE,
      state: "completed",
      delivery: "queued_to_lead",
      summary: "Under quotes/.",
      space_id: space,
    });
  });

  it("flattens a task to anybody else into a step on the lead's run, with no lane", () => {
    started();
    const outcome = ws.submit(HARNESS, {
      type: "task",
      space_id: space,
      run_id: RUN,
      idempotency_key: "task-2",
      task_id: LANE,
      to: "hrn_01K4ZQPX0000000000000NOBODY",
      goal: "Anything",
      on_behalf_of: OWNER.participantId,
    });
    expect(outcome).toMatchObject({ ok: true });
    if (!outcome.ok) return;
    expect(outcome.lane).toBeUndefined();
    const step = ws.log.find((event) => event.type === "step.log");
    expect(step?.payload).toMatchObject({ run_id: RUN, status: "done" });
    expect(String(step?.payload["title"])).toContain("no harness");
  });
});

describe("rules 7 to 9: a space, its people, and who may answer (Phase 5)", () => {
  const OTHER = "usr_01K4ZQPX000000000000000009";

  it("lets the owner retitle and close, a guest neither, and the harness only a space it opened", () => {
    ok(OWNER, { type: "space.updated", space_id: space, title: "PO-4471" });
    expect(ws.spaces.get(space)?.title).toBe("PO-4471");
    // The owner opened the direct space, so the harness may not retitle it.
    expect(
      refused(HARNESS, { type: "space.updated", space_id: space, title: "Mine" }),
    ).toMatchObject({ kind: "not_the_opener" });
    ok(OWNER, { type: "space.updated", space_id: space, state: "closed" });
    expect(refused(OWNER, { type: "space.updated", space_id: space })).toMatchObject({
      kind: "invalid",
    });
    // A space the harness opened itself is its to retitle.
    const opened = ws.openSpace("/work/tree", "Chips · main");
    ok(HARNESS, { type: "space.updated", space_id: opened.spaceId, title: "Chips · review" });
    expect(ws.spaces.get(opened.spaceId)?.title).toBe("Chips · review");
    expect(
      refused(OWNER, {
        type: "space.updated",
        space_id: "spc_01K4ZQPX000000000000000099",
        title: "x",
      }),
    ).toMatchObject({ kind: "wrong_space" });
  });

  it("adds only somebody who exists, and lets only the owner remove somebody else", () => {
    expect(
      refused(OWNER, {
        type: "membership.added",
        space_id: space,
        participant_id: OTHER,
        participant_kind: "person",
      }),
    ).toMatchObject({ kind: "unknown_participant", code: "not_found" });
    // A harness in the room may not remove the owner; the owner removes the harness.
    expect(
      refused(HARNESS, {
        type: "membership.removed",
        space_id: space,
        participant_id: OWNER.participantId,
      }),
    ).toMatchObject({ kind: "wrong_direction" });
    ok(OWNER, {
      type: "membership.removed",
      space_id: space,
      participant_id: HARNESS.participantId,
    });
    expect(ws.roleOf(space, HARNESS.participantId)).toBeUndefined();
  });

  it("lets the harness settle its own ask once, as answered in its own tools (ADR 0079)", () => {
    ok(HARNESS, { type: "run.started", space_id: space, run_id: RUN, goal: "Go." });
    const own = "apr_01K4ZQPX00000000000000000S";
    ok(HARNESS, {
      type: "approval.request",
      space_id: space,
      run_id: RUN,
      approval_id: own,
      action: { kind: "shell.exec" },
      risk: [],
      expires_in: 60,
    });
    const settle = (extra: Record<string, unknown>) => ({
      type: "approval.resolved",
      space_id: space,
      run_id: RUN,
      approval_id: own,
      decision: "approved",
      ...extra,
    });
    expect(refused(HARNESS, settle({ scope: "always" })).kind).toBe("invalid");
    expect(refused(HARNESS, settle({ decision: "expired" })).kind).toBe("invalid");
    ok(HARNESS, settle({ scope: "once" }));
    expect(ws.approvals.get(own)).toMatchObject({ state: "resolved", resolved_by: agent() });
  });

  it("keeps an ask that matters for a person, answered once (SEC-10, ADR 0195)", () => {
    ok(HARNESS, { type: "run.started", space_id: space, run_id: RUN, goal: "Go." });
    const payment = "apr_01K4ZQPX00000000000000000T";
    ok(HARNESS, {
      type: "approval.request",
      space_id: space,
      run_id: RUN,
      approval_id: payment,
      action: { kind: "payment.transfer", money_usd: 40 },
      risk: ["financial"],
      expires_in: 60,
    });
    const answer = (extra: Record<string, unknown>) => ({
      type: "approval.resolved",
      space_id: space,
      run_id: RUN,
      approval_id: payment,
      decision: "approved",
      ...extra,
    });
    // Its own window's yes does not settle it, not even once.
    expect(refused(HARNESS, answer({ scope: "once" }))).toMatchObject({
      kind: "not_an_approver",
      code: "forbidden",
    });
    // A person gives no standing yes for it, either way; once is theirs.
    expect(refused(OWNER, answer({ scope: "always" })).kind).toBe("invalid");
    expect(refused(OWNER, answer({ scope: "session", decision: "denied" })).kind).toBe("invalid");
    ok(OWNER, answer({ scope: "once" }));
    expect(ws.approvals.get(payment)).toMatchObject({
      state: "resolved",
      resolved_by: OWNER.participantId,
    });
  });

  it("takes a decision only from who the ask named, and from anyone when it named nobody", () => {
    ok(HARNESS, { type: "run.started", space_id: space, run_id: RUN, goal: "Go." });
    const named = "apr_01K4ZQPX000000000000000006";
    ok(HARNESS, {
      type: "approval.request",
      space_id: space,
      run_id: RUN,
      approval_id: named,
      action: { kind: "email.send" },
      risk: ["external"],
      expires_in: 60,
      approvers: [OTHER],
    });
    expect(ws.approvals.get(named)?.approvers).toEqual([OTHER]);
    expect(
      refused(OWNER, {
        type: "approval.resolved",
        space_id: space,
        run_id: RUN,
        approval_id: named,
        decision: "approved",
      }),
    ).toMatchObject({ kind: "not_an_approver", code: "forbidden" });

    // `owner` resolves to the owner, who may answer.
    const mine = "apr_01K4ZQPX000000000000000007";
    ok(HARNESS, {
      type: "approval.request",
      space_id: space,
      run_id: RUN,
      approval_id: mine,
      action: { kind: "email.send" },
      risk: ["external"],
      expires_in: 60,
      approvers: ["owner"],
    });
    expect(ws.approvals.get(mine)?.approvers).toEqual([OWNER.participantId]);
    ok(OWNER, {
      type: "approval.resolved",
      space_id: space,
      run_id: RUN,
      approval_id: mine,
      decision: "approved",
    });
  });
});

describe("rule 15 and the claim: a room a person asks the harness for", () => {
  const OTHER_HARNESS = "hrn_01K4ZQPX000000000000000009";

  /** The workspace again, with a harness that declares new_spaces. */
  function declaring(): void {
    ws = new Workspace({
      workspaceId: WORKSPACE,
      owner: OWNER,
      harness: HARNESS,
      ids: createIdGenerator(),
      now: () => new Date(Date.UTC(2026, 8, 24, 9, 0, 0)),
      capabilities: [HARNESS_CAPABILITIES.newSpaces],
    });
    space = ws.createDirectSpace();
  }

  /** What the phone does on the first send. */
  function ask(spaceId: string, text = "Plan the kitchen remodel"): void {
    ok(OWNER, {
      type: "space.created",
      space_id: spaceId,
      kind: "direct",
      asked_of: HARNESS.participantId,
    });
    ok(OWNER, {
      type: "membership.added",
      space_id: spaceId,
      participant_id: HARNESS.participantId,
      participant_kind: "harness",
    });
    ok(OWNER, { type: "message.post", space_id: spaceId, text });
  }

  const ROOM = "spc_01K4ZQPX000000000000000010";
  const ROOM_2 = "spc_01K4ZQPX000000000000000011";

  it("asks only a harness that declares new_spaces, for a room with no key and no parent", () => {
    const asked = {
      type: "space.created",
      space_id: ROOM,
      kind: "direct",
      asked_of: HARNESS.participantId,
    };
    expect(refused(OWNER, asked)).toMatchObject({
      code: "invalid_event",
      message: expect.stringContaining("does not declare new_spaces"),
    });
    declaring();
    expect(refused(OWNER, { ...asked, kind: "thread", parent_space_id: space })).toMatchObject({
      message: expect.stringContaining("a thread is its space's"),
    });
    expect(refused(OWNER, { ...asked, external_key: "mine" })).toMatchObject({
      message: expect.stringContaining("has no key yet"),
    });
    expect(refused(OWNER, { ...asked, asked_of: OTHER_HARNESS })).toMatchObject({
      code: "not_found",
      kind: "unknown_participant",
    });
    const created = ok(OWNER, asked);
    // Sent to the harness asked, though it is not in the room yet.
    expect(
      ws.canSee(created, { participantId: HARNESS.participantId, memberSpaces: new Set() }),
    ).toBe(true);
    // Nobody but the door writes the claim.
    expect(
      refused(HARNESS, { type: "space.claimed", space_id: ROOM, external_key: "mine" }),
    ).toMatchObject({ kind: "not_submittable" });
  });

  it("claims the room under the harness's key and title, once, and makes it the harness's own", () => {
    declaring();
    ask(ROOM);
    expect(ws.spacesAsked()).toEqual([
      {
        space_id: ROOM,
        asked_by: OWNER.participantId,
        title: null,
        state: "open",
        asked_at: "2026-09-24T09:00:00.000Z",
      },
    ]);
    expect(ws.claimSpace(ROOM, "session-7", "Kitchen remodel")).toEqual({
      ok: true,
      value: { spaceId: ROOM, claimed: true, retitled: true },
    });
    expect(ws.claimSpace(ROOM, "session-7", "Kitchen remodel")).toEqual({
      ok: true,
      value: { spaceId: ROOM, claimed: false, retitled: false },
    });
    expect(ws.spaces.get(ROOM)).toMatchObject({
      title: "Kitchen remodel",
      title_by: "harness",
      external_key: `${HARNESS.participantId}:session-7`,
      opened_by: HARNESS.participantId,
    });
    expect(ws.spacesAsked()).toEqual([]);
    // Its own from now on: found by the key, and the harness's to retitle and archive.
    expect(ws.openSpace("session-7", undefined)).toEqual({
      spaceId: ROOM,
      created: false,
      joined: false,
    });
    ok(HARNESS, { type: "space.updated", space_id: ROOM, title: "Kitchen, phase 1" });
    ok(OWNER, { type: "space.updated", space_id: ROOM, state: "closed" });
    expect(ws.spacesOpened()).toEqual([
      {
        space_id: ROOM,
        key: "session-7",
        shared: false,
        title: "Kitchen, phase 1",
        state: "closed",
        moved_by: "person",
      },
    ]);
  });

  it("drops the harness's title when a person named the room first", () => {
    declaring();
    ask(ROOM);
    ok(OWNER, { type: "space.updated", space_id: ROOM, title: "Kitchen" });
    expect(ws.claimSpace(ROOM, "session-7", "Kitchen remodel")).toEqual({
      ok: true,
      value: { spaceId: ROOM, claimed: true, retitled: false },
    });
    expect(ws.spaces.get(ROOM)?.title).toBe("Kitchen");
  });

  it("names the harness waiting there in the room's note by the first name held for its agent", () => {
    declaring();
    ask(ROOM);
    const added = ws.log.find(
      (event) => event.type === "membership.added" && event.space_id === ROOM,
    );
    const held = added?.payload["agent_name"];
    expect(typeof held).toBe("string");
    // "Milo (Jacobian agent, @Milo)", as the server's note has it (ADR 0150).
    expect(
      ws.noteMembers(ROOM).find((member) => member.id === HARNESS.participantId),
    ).toMatchObject({
      kind: "agent",
      name: held,
      harness: HARNESS.displayName,
    });
  });

  it("refuses a room not asked of it, gone, claimed, left, or under a key another room holds", () => {
    declaring();
    ask(ROOM);
    ask(ROOM_2, "Book the movers");
    const refusedWith = (spaceId: string, key: string) => {
      const outcome = ws.claimSpace(spaceId, key, undefined);
      if (outcome.ok) throw new Error("expected a refusal");
      return outcome.error;
    };
    expect(refusedWith(space, "k")).toMatchObject({ code: "forbidden", kind: "not_asked" });
    expect(refusedWith("spc_01K4ZQPX000000000000000099", "k")).toMatchObject({
      code: "not_found",
    });
    ws.claimSpace(ROOM, "session-7", undefined);
    expect(refusedWith(ROOM, "session-8")).toMatchObject({ kind: "taken" });
    expect(refusedWith(ROOM_2, "session-7")).toMatchObject({
      kind: "taken",
      message: expect.stringContaining(ROOM),
    });
    ok(OWNER, {
      type: "membership.removed",
      space_id: ROOM_2,
      participant_id: HARNESS.participantId,
    });
    expect(ws.spacesAsked()).toEqual([]);
    expect(refusedWith(ROOM_2, "session-9")).toMatchObject({
      code: "forbidden",
      message: expect.stringContaining("taken out of that space"),
    });
    expect(ws.refusals.filter((each) => each.type === "space.claimed")).toHaveLength(5);
  });
});

describe("who a message is for (M3.3, ADR 0081)", () => {
  function said(principal: Principal, event: Record<string, unknown>) {
    return ok(principal, { type: "message.post", space_id: space, ...event }).payload;
  }

  it("fills in the mentions and who it is for, replacing what the sender wrote", () => {
    expect(said(OWNER, { text: "Is the PO in?", addressed_to: [], held: true })).toMatchObject({
      addressed_to: [agent()],
    });
    expect(said(OWNER, { text: "Is the PO in?" })["held"]).toBeUndefined();
    expect(said(OWNER, { text: "@Scout is it?", mentions: ["usr_forged"] })).toMatchObject({
      mentions: [agent()],
      addressed_to: [agent()],
    });
    expect(said(OWNER, { text: "@arjun a note to self" })).toMatchObject({
      mentions: [OWNER.participantId],
      addressed_to: [],
    });
  });

  it("keeps a harness's words for the people unless it names or answers somebody", () => {
    expect(said(HARNESS, { text: "Done." })).toMatchObject({ addressed_to: [] });
  });
});

describe("the actor rule (ADR 0087, point 2)", () => {
  it("reads the harness as its one agent in the room, and asks which where it has two", () => {
    const said = ok(HARNESS, { type: "message.post", space_id: space, text: "Done." });
    expect(said.actor).toEqual({ kind: "agent", id: agent(), harness_id: HARNESS.participantId });
    const tree = ws.registerAgent("tree", "Tree").agent;
    ok(OWNER, {
      type: "membership.added",
      space_id: space,
      participant_id: tree.agent_id,
      participant_kind: "agent",
      role: "member",
    });
    expect(refused(HARNESS, { type: "message.post", space_id: space, text: "Us?" }).kind).toBe(
      "which_agent",
    );
    const named = ok(HARNESS, {
      type: "message.post",
      space_id: space,
      text: "Tree.",
      actor: { kind: "agent", id: tree.agent_id },
    });
    expect(named.actor.id).toBe(tree.agent_id);
    expect(
      refused(HARNESS, {
        type: "message.post",
        space_id: space,
        text: "Nobody's.",
        actor: { kind: "agent", id: "agt_01K4ZQPX00000000000000000Z" },
      }).kind,
    ).toBe("wrong_actor");
  });

  it("names a room's agent by the harness's name, for a harness that follows its rooms", () => {
    const follows = new Workspace({
      workspaceId: WORKSPACE,
      owner: OWNER,
      harness: HARNESS,
      ids: createIdGenerator(),
      now: () => new Date(),
      capabilities: [HARNESS_CAPABILITIES.followsRooms],
    });
    const { spaceId } = follows.openSpace("e0d0f115", "Chess Game");
    const chess = [...follows.agents.values()].find((each) => each.key === "e0d0f115");
    expect(chess?.name).toBe("Chess Game");
    const outcome = follows.submit(OWNER, {
      type: "message.post",
      space_id: spaceId,
      idempotency_key: "at",
      text: "@Scout which opening?",
    });
    if (!outcome.ok) throw new Error(outcome.error.message);
    expect(outcome.event.payload["addressed_to"]).toEqual([chess?.agent_id]);
  });
});

describe("one room per agent (ADR 0087, Phase 4), as the real door and store have it", () => {
  /** A group room of the owner's with nobody else in it. */
  const rooms = createIdGenerator();
  function room(): string {
    const id = rooms.next("space");
    ok(OWNER, { type: "space.created", space_id: id, kind: "group" });
    return id;
  }
  const types = (after: number) =>
    ws.log.filter((event) => event.seq > after).map((event) => event.type);

  it("refuses an agent a second room, with where it is, and says where it goes to everyone", () => {
    const other = room();
    expect(
      refused(OWNER, {
        type: "membership.added",
        space_id: other,
        participant_id: agent(),
        participant_kind: "agent",
        role: "member",
      }),
    ).toMatchObject({ kind: "agent_elsewhere", space_id: space });
    const tree = ws.registerAgent("tree", "Tree", { byHarness: true }).agent.agent_id;
    const before = ws.head();
    ok(OWNER, {
      type: "membership.added",
      space_id: other,
      participant_id: tree,
      participant_kind: "agent",
      role: "member",
    });
    expect(types(before)).toEqual(["membership.added", "agent.attached"]);
    // Its harness hears where it went, from outside the room; a stranger does not.
    const attached = ws.log.at(-1) as StoredEvent;
    const harness = {
      participantId: HARNESS.participantId,
      memberSpaces: new Set<string>(),
      alsoIs: new Set([tree]),
    };
    expect(ws.canSee(attached, harness)).toBe(true);
    expect(ws.canSee(attached, { participantId: "usr_x", memberSpaces: new Set<string>() })).toBe(
      false,
    );
  });

  it("stops the room's runs and frees its agents when archived, and takes them back unarchived", () => {
    start();
    const before = ws.head();
    ok(OWNER, { type: "space.updated", space_id: space, state: "closed" });
    expect(types(before)).toEqual([
      "space.updated",
      "run.cancel",
      "membership.removed",
      "agent.released",
    ]);
    expect(ws.runs.get(RUN)?.state).toBe("cancelled");
    expect(ws.agents.get(agent())?.released_from).toBe(space);
    expect(ws.agentRoom(agent())).toBeUndefined();
    ok(OWNER, { type: "space.updated", space_id: space, state: "open" });
    expect(ws.agentRoom(agent())).toBe(space);
  });

  it("frees an agent archived in its harness, archives its room, and brings both back", () => {
    ws.registerAgent(HARNESS.participantId, "Scout", { byHarness: true, state: "archived" });
    expect(ws.agentRoom(agent())).toBeUndefined();
    expect(ws.spaces.get(space)?.state).toBe("closed");
    ws.registerAgent(HARNESS.participantId, "Scout", { byHarness: true, state: "active" });
    expect(ws.spaces.get(space)?.state).toBe("open");
    expect(ws.agentRoom(agent())).toBe(space);
  });

  it("holds what a free agent says, and posts it in the next room it joins", () => {
    ok(OWNER, {
      type: "membership.removed",
      space_id: space,
      participant_id: agent(),
      removed_by: OWNER.participantId,
    });
    // The harness, not knowing agents, says it as itself into the room its agent left.
    const held = ok(HARNESS, { type: "message.post", space_id: space, text: "Found a sale." });
    expect(held).toMatchObject({ type: "message.held", space_id: null });
    expect(ws.held).toHaveLength(1);
    const other = room();
    const before = ws.head();
    ok(OWNER, {
      type: "membership.added",
      space_id: other,
      participant_id: agent(),
      participant_kind: "agent",
      role: "member",
    });
    const posted = ws.log.filter((event) => event.seq > before && event.type === "message.post");
    expect(posted[0]).toMatchObject({
      space_id: other,
      payload: { text: "Found a sale.", from_held: held.id, held_since: held.ts },
    });
    expect(ws.held).toHaveLength(0);
  });

  it("opens a room with the owner for an agent's first words", () => {
    const tree = ws.registerAgent("tree", "Tree", { byHarness: true }).agent.agent_id;
    const said = ok(HARNESS, {
      type: "message.post",
      actor: { kind: "agent", id: tree },
      text: "Three quotes are in.",
    });
    expect(said.type).toBe("message.post");
    expect(ws.roleOf(String(said.space_id), OWNER.participantId)).toBe("owner");
    expect(ws.agentRoom(tree)).toBe(said.space_id);
  });

  it("moves an agent, stopping its runs where it was and saying where it went", () => {
    start();
    const other = room();
    const moved = ws.moveAgent(agent(), other);
    expect(moved).toMatchObject({ ok: true, moved: true, from: space });
    expect(ws.runs.get(RUN)?.state).toBe("cancelled");
    expect(ws.agentRoom(agent())).toBe(other);
    const out = ws.log.find(
      (event) => event.type === "agent.released" && event.payload["reason"] === "moved",
    );
    expect(out).toMatchObject({ space_id: space, payload: { moved_to: other } });
  });

  it("gives an agent a face, once, which its row and the directory carry, and takes it back", () => {
    const face = { icon: "cart", ground: 4 };
    expect(ws.setAgentFace(agent(), face)).toBe(true);
    expect(ws.setAgentFace(agent(), face)).toBe(false);
    expect(ws.log.at(-1)).toMatchObject({
      type: "agent.updated",
      actor: { kind: "person", id: OWNER.participantId },
      payload: { agent_id: agent(), face },
    });
    expect(ws.agents.get(agent())).toMatchObject({ face, state: "active" });
    const listed = ws
      .participantsVisibleTo(HARNESS.participantId)
      .find((each) => each.participantId === agent());
    expect(listed?.face).toEqual(face);

    expect(ws.setAgentFace(agent(), null)).toBe(true);
    expect(ws.agents.get(agent())?.face).toBeUndefined();
    expect(ws.setAgentFace("agt_nobody", face)).toBe(false);
  });

  it("numbers a name another agent has, and keeps a name the owner gave (ADR 0091)", () => {
    const kit = ws.registerAgent("kit", "Kit", { byHarness: true }).agent;
    expect(ws.registerAgent("lux", "Kit", { byHarness: true }).agent.name).toBe("Kit 2");
    expect(ws.registerAgent("kit", "Kit", { byHarness: true }).renamed).toBe(false);

    expect(ws.renameAgent(kit.agent_id, "kit 2")).toMatchObject({
      ok: false,
      message: "An agent here goes by Kit 2 already.",
    });
    expect(ws.renameAgent(kit.agent_id, OWNER.displayName)).toMatchObject({ ok: false });
    expect(ws.renameAgent(kit.agent_id, "  Pixel  ")).toEqual({ ok: true, changed: true });
    expect(ws.agents.get(kit.agent_id)).toMatchObject({
      name: "Pixel",
      name_by: OWNER.participantId,
    });
    // Its harness asking for its old name changes nothing.
    expect(ws.registerAgent("kit", "Kit", { byHarness: true })).toMatchObject({ renamed: false });
    expect(ws.agents.get(kit.agent_id)?.name).toBe("Pixel");
    expect(ws.renameAgent(kit.agent_id, "Pixel")).toEqual({ ok: true, changed: false });
  });

  it("numbers Main and You, and refuses them, a hidden character and mixed letters (SEC-33)", () => {
    expect(ws.registerAgent("m", "Main", { byHarness: true }).agent.name).toBe("Main 2");
    const kit = ws.registerAgent("kit", "Kit", { byHarness: true }).agent;
    expect(ws.renameAgent(kit.agent_id, "you")).toMatchObject({
      ok: false,
      message: expect.stringMatching(/^An agent can't be called Main or You/),
    });
    expect(ws.renameAgent(kit.agent_id, "Pi\u200bxel")).toMatchObject({
      ok: false,
      message: expect.stringMatching(/^A name can't have hidden/),
    });
    expect(ws.renameAgent(kit.agent_id, "P\u0456xel")).toMatchObject({
      ok: false,
      message: expect.stringMatching(/^A name can't mix/),
    });
    expect(ws.agents.get(kit.agent_id)?.name).toBe("Kit");
  });

  it("puts a lane where its agent is, or in a new room with the owner while it is free", () => {
    start();
    const tree = ws.registerAgent("tree", "Tree", { byHarness: true }).agent.agent_id;
    const outcome = ws.submit(HARNESS, {
      type: "task",
      space_id: space,
      run_id: RUN,
      idempotency_key: "lane-1",
      task_id: "lane_01K4ZQPX000000000000000077",
      to: tree,
      on_behalf_of: OWNER.participantId,
      goal: "Get three quotes",
    });
    if (!outcome.ok) throw new Error(outcome.error.message);
    const home = outcome.lane?.space_id;
    expect(home).toBeDefined();
    expect(home).not.toBe(space);
    expect(ws.agentRoom(tree)).toBe(home);
    expect(ws.roleOf(String(home), OWNER.participantId)).toBe("owner");
  });
});

describe("a fork (ADR 0087, Phase 6), as the real door has it", () => {
  let now: number;
  let forks: Workspace;
  let home: string;
  const rooms = createIdGenerator();

  beforeEach(() => {
    now = Date.UTC(2026, 9, 1, 16, 12, 0);
    forks = new Workspace({
      workspaceId: WORKSPACE,
      owner: OWNER,
      harness: HARNESS,
      ids: createIdGenerator(),
      now: () => new Date(now),
      capabilities: [HARNESS_CAPABILITIES.agents, HARNESS_CAPABILITIES.forks],
    });
    home = forks.createDirectSpace();
  });

  const original = () => {
    const found = [...forks.agents.values()].find((each) => each.key === HARNESS.participantId);
    if (found === undefined) throw new Error("no default agent");
    return found.agent_id;
  };
  function prep(): string {
    const id = rooms.next("space");
    const outcome = forks.submit(OWNER, {
      type: "space.created",
      space_id: id,
      kind: "group",
      idempotency_key: id,
    });
    if (!outcome.ok) throw new Error(outcome.error.message);
    return id;
  }

  it("asks in the room the copy is for, which the harness hears, and is one ask while it waits", () => {
    const room = prep();
    const asked = forks.forkAgent(original(), room);
    expect(asked).toMatchObject({ ok: true, asked: true });
    const said = forks.log.find((event) => event.type === "agent.fork");
    if (said === undefined) throw new Error("no ask");
    expect(said).toMatchObject({ space_id: room, payload: { agent_id: original() } });
    const viewer = {
      participantId: HARNESS.participantId,
      memberSpaces: new Set<string>(),
      alsoIs: new Set([original()]),
    };
    expect(forks.canSee(said, viewer)).toBe(true);
    expect(forks.forkAgent(original(), room)).toMatchObject({ ok: true, asked: false });
  });

  it("puts the copy in the room while the ask stands, and leaves it free after the minute", () => {
    const room = prep();
    const { forkId } = forks.forkAgent(original(), room) as { forkId: string };
    const copy = forks.registerAgent("copy", "Scout", {
      byHarness: true,
      forkedFrom: original(),
    }).agent;
    expect(copy.forked_from).toBe(original());
    expect(forks.answerFork(copy.agent_id, original(), room)).toEqual({ attached: true });
    expect(forks.agentRoom(copy.agent_id)).toBe(room);
    expect(forks.agentRoom(original())).toBe(home);
    const attached = forks.log.find(
      (event) => event.type === "agent.attached" && event.payload["agent_id"] === copy.agent_id,
    );
    expect(attached?.payload["fork_of"]).toBe(forkId);
    expect(forks.answerFork(copy.agent_id, original(), room)).toEqual({ attached: false });

    const late = prep();
    forks.forkAgent(original(), late);
    now += FORK_WAIT_MS;
    const slow = forks.registerAgent("slow", "Scout", { byHarness: true, forkedFrom: original() });
    const answer = forks.answerFork(slow.agent.agent_id, original(), late);
    expect(answer).toMatchObject({ attached: false });
    expect(forks.agentRoom(slow.agent.agent_id)).toBeUndefined();
  });

  it("refuses a free agent, the room it is in, and a harness that doesn't fork", () => {
    const free = forks.registerAgent("tree", "Tree", { byHarness: true }).agent.agent_id;
    expect(forks.forkAgent(free, prep())).toMatchObject({ ok: false });
    expect(forks.forkAgent(original(), home)).toMatchObject({ ok: false });
    const plain = new Workspace({
      workspaceId: WORKSPACE,
      owner: OWNER,
      harness: HARNESS,
      ids: createIdGenerator(),
      now: () => new Date(now),
      capabilities: [HARNESS_CAPABILITIES.agents],
    });
    plain.createDirectSpace();
    const theirs = [...plain.agents.values()][0]?.agent_id ?? "";
    const other = rooms.next("space");
    plain.submit(OWNER, {
      type: "space.created",
      space_id: other,
      kind: "group",
      idempotency_key: "o",
    });
    expect(plain.forkAgent(theirs, other)).toMatchObject({ ok: false });
  });
});

/**
 * The agents review, findings 5 to 12, as the real door and store have them since: the fake asks
 * the same `refuseAgentInto`, and stops an agent's work wherever it leaves a room.
 */
describe("one room per agent, on every path (agents review)", () => {
  const second = () => ws.registerAgent("tree", "Tree", { byHarness: true }).agent.agent_id;
  let rooms = 0;
  const newRoom = (title: string) => {
    rooms += 1;
    const id = `spc_01K4ZQPX0000000000000000R${rooms}`;
    ok(OWNER, { type: "space.created", space_id: id, kind: "group", title });
    return id;
  };
  const add = (spaceId: string, agentId: string) => ({
    type: "membership.added",
    space_id: spaceId,
    participant_id: agentId,
    participant_kind: "agent",
    role: "member",
  });

  it("takes no agent into an archived room (finding 5)", () => {
    const tree = second();
    const shut = newRoom("Shut");
    ok(OWNER, { type: "space.updated", space_id: shut, state: "closed" });
    expect(refused(OWNER, add(shut, tree))).toMatchObject({ kind: "room_closed" });
  });

  it("does not let the Main agent be taken out of its Main room (finding 9)", () => {
    const lead = ws.registerAgent("lead", "Lead", { byHarness: true, lead: true }).agent.agent_id;
    const home = newRoom("Main space");
    // The fake has no door that makes a Main room yet, so the row is marked as one by hand.
    const row = ws.spaces.get(home) as { home: boolean } | undefined;
    if (row === undefined) throw new Error("no space");
    row.home = true;
    ok(OWNER, add(home, lead));
    expect(
      refused(OWNER, { type: "membership.removed", space_id: home, participant_id: lead }),
    ).toMatchObject({ kind: "lead_room" });
    // And a Main room that has its Main agent takes no other.
    expect(refused(OWNER, add(home, second()))).toMatchObject({ kind: "lead_room" });
  });

  it("stops an agent's run before a person takes it out (finding 12)", () => {
    start();
    const before = ws.log.length;
    ok(OWNER, { type: "membership.removed", space_id: space, participant_id: agent() });
    const types = ws.log.slice(before).map((event) => event.type);
    expect(types.indexOf("run.cancel")).toBeGreaterThanOrEqual(0);
    expect(types.indexOf("run.cancel")).toBeLessThan(types.indexOf("membership.removed"));
    expect(ws.runs.get(RUN)?.state).toBe("cancelled");
    expect(ws.log.find((event) => event.type === "run.cancel")?.payload["reason"]).toBe(
      "The agent was taken out of the space.",
    );
  });

  it("refuses a post that names a room that is not there, and holds nothing (finding 10)", () => {
    const tree = second();
    const outcome = ws.submit(
      HARNESS,
      {
        type: "message.post",
        space_id: "spc_01K4ZQPX0000000000000000ZZ",
        text: "Late.",
        actor: { kind: "agent", id: tree },
      },
      { idempotencyKey: "late" },
    );
    expect(outcome.ok).toBe(false);
    expect(ws.held).toEqual([]);
  });
});

describe("the referee (ADR 0097), as the real door has it", () => {
  /** The harness's second agent, in the direct space beside its first. */
  function tree(): string {
    const id = ws.registerAgent("tree", "Tree", { byHarness: true }).agent.agent_id;
    ok(OWNER, {
      type: "membership.added",
      space_id: space,
      participant_id: id,
      participant_kind: "agent",
      role: "member",
    });
    return id;
  }

  /** One agent's message to the other, as the harness sends it. */
  function talk(from: string, to: string, text = "step") {
    const outcome = ws.submit(HARNESS, {
      type: "message.post",
      space_id: space,
      actor: { kind: "agent", id: from },
      to: [to],
      text,
      idempotency_key: `talk-${ws.head() + 1}`,
    });
    if (!outcome.ok) throw new Error(outcome.error.message);
    return outcome;
  }

  it("lets agents talk to the ceiling, holds the one after with the count, and hands it over when a person speaks", () => {
    const scout = agent();
    const other = tree();
    for (let i = 0; i < CEILING; i += 1) {
      expect(talk(i % 2 === 0 ? scout : other, i % 2 === 0 ? other : scout).held).toBeUndefined();
    }
    const past = talk(scout, other, "one more");
    expect(past.event.payload).toMatchObject({ addressed_to: [], held: true });
    expect(past.held).toEqual({ count: CEILING + 1, allowance: CEILING });

    ok(OWNER, { type: "message.post", space_id: space, text: "How is it going?" });
    expect(
      ws.log.filter((event) => event.type === "message.handed").map((event) => event.payload),
    ).toEqual([
      expect.objectContaining({ message_id: messageIdOf(past.event.id), agent_id: other }),
    ]);
    expect(ws.exchangeAt(space, ws.head()).count).toBe(0);
  });

  it("holds from the first once paused, and lets them carry on", () => {
    const scout = agent();
    const other = tree();
    ws.setExchange(space, "paused", OWNER.participantId);
    const held = talk(scout, other);
    expect(held.held).toEqual({ count: 1, allowance: CEILING });
    ws.setExchange(space, "going", OWNER.participantId);
    expect(ws.log.filter((event) => event.type === "message.handed")).toHaveLength(1);
    expect(talk(scout, other).held).toBeUndefined();
  });

  it("holds at the workspace's hold, as of each message, and never at a hold of Never (ADR 0187)", () => {
    const scout = agent();
    const other = tree();
    /** `n` messages traded, Scout first: whether any was held. */
    const trade = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        i % 2 === 0 ? talk(scout, other).held : talk(other, scout).held,
      ).some((held) => held !== undefined);
    ok(OWNER, { type: "exchange.limits_set", stop: 4, hold: 10, circles: true });
    expect(trade(10)).toBe(false);
    expect(ws.exchangeAt(space, ws.head()).limits).toEqual({ stop: 4, hold: 10, circles: true });
    expect(talk(scout, other, "one more").held).toEqual({ count: 11, allowance: 10 });

    ok(OWNER, { type: "message.post", space_id: space, text: "Carry on." });
    ok(OWNER, { type: "exchange.limits_set", stop: 16, hold: null, circles: true });
    expect(trade(CEILING + 2)).toBe(false);
  });
});

describe("a room's lead (ADR 0104), as the real door has it", () => {
  function tree(): string {
    const id = ws.registerAgent("tree", "Tree", { byHarness: true }).agent.agent_id;
    ok(OWNER, {
      type: "membership.added",
      space_id: space,
      participant_id: id,
      participant_kind: "agent",
      role: "member",
    });
    return id;
  }

  it("is the agent last chosen while it is there, and the note marks it", () => {
    const scout = agent();
    expect(ws.leadOf(space)).toBeUndefined();
    const other = tree();
    // A room's second agent gives it a lead, the one there longest (ADR 0291), until a person chooses.
    expect(ws.leadOf(space)).toBe(scout);
    ws.setLead(space, other, OWNER.participantId);
    expect(ws.leadOf(space)).toBe(other);
    expect(ws.noteMembers(space).find((member) => member.id === other)?.lead).toBe(true);
    expect(ws.noteMembers(space).find((member) => member.id === scout)?.lead).toBeUndefined();
    ws.setLead(space, null, OWNER.participantId);
    expect(ws.leadOf(space)).toBeUndefined();
  });

  it("hands the lead what was nobody's turn when a test says, once", () => {
    const scout = agent();
    const other = tree();
    ws.setLead(space, other, OWNER.participantId);
    const said = ws.submit(HARNESS, {
      type: "message.post",
      space_id: space,
      actor: { kind: "agent", id: scout },
      text: "F–J done.",
      idempotency_key: "done",
    });
    if (!said.ok) throw new Error(said.error.message);
    ws.handToLead(space, said.event.id);
    ws.handToLead(space, said.event.id);
    expect(
      ws.log.filter((event) => event.type === "message.handed").map((event) => event.payload),
    ).toEqual([
      expect.objectContaining({
        message_id: messageIdOf(said.event.id),
        agent_id: other,
        lead: true,
      }),
    ]);
  });
});

describe("what an agent knows of its room (ADR 0105), as the real door has it", () => {
  function tree(): string {
    const id = ws.registerAgent("tree", "Tree", { byHarness: true }).agent.agent_id;
    ok(OWNER, {
      type: "membership.added",
      space_id: space,
      participant_id: id,
      participant_kind: "agent",
      role: "member",
    });
    return id;
  }

  function said(principal: Principal, text: string, more: Record<string, unknown> = {}) {
    return ok(principal, { type: "message.post", space_id: space, text, ...more });
  }

  it("hands a turn what was said while its last one worked, without its own words", () => {
    const scout = agent();
    const other = tree();
    said(OWNER, "Letters A–E, please.");
    ok(HARNESS, {
      type: "run.started",
      space_id: space,
      run_id: RUN,
      goal: "Letters A–E",
      actor: { kind: "agent", id: scout },
    });
    said(HARNESS, "The space's file is ascii-alphabet.html.", {
      actor: { kind: "agent", id: other },
    });
    said(HARNESS, "A–E done.", { run_id: RUN, actor: { kind: "agent", id: scout } });
    const next = said(OWNER, "And F–J?");
    const context = ws.contextFor([scout], space, next.seq, { lines: 20, chars: 4000 });
    expect(context?.lines.filter((line) => line.kind === "said").map((line) => line.text)).toEqual([
      "The space's file is ascii-alphabet.html.",
    ]);
  });

  it("makes an agent's NO_REPLY alone its turn passed, and leaves a person's words be", () => {
    const scout = agent();
    start();
    const passed = said(HARNESS, "**NO_REPLY**", {
      run_id: RUN,
      actor: { kind: "agent", id: scout },
    });
    expect(passed.type).toBe("turn.passed");
    expect(passed.payload).not.toHaveProperty("text");
    expect(passed.run_id).toBe(RUN);
    expect(said(OWNER, "NO_REPLY").type).toBe("message.post");
  });
});

describe("what a room's job has spent (ADR 0117), as the real door has it", () => {
  const usage = (usd: number | undefined) =>
    ok(HARNESS, {
      type: "usage",
      space_id: space,
      run_id: RUN,
      scope: "run",
      model: "a-model",
      output_tokens: 10,
      ...(usd === undefined ? {} : { cost: { usd, estimated: true } }),
    });

  it("counts from the last person's act what the room's runs reported since, against the ceiling", () => {
    start();
    usage(0.1);
    const asked = ok(OWNER, { type: "message.post", space_id: space, text: "Carry on" });
    usage(0.35);
    expect(ws.spendOf(space, ws.head())).toEqual({
      ceiling_usd: 3,
      spent_usd: 0.25,
      since_seq: asked.seq,
      uncounted_runs: 0,
    });
    ws.setSpendCeiling(space, 10, OWNER.participantId);
    expect(ws.spendOf(space, ws.head())?.ceiling_usd).toBe(10);
    ws.setSpendCeiling(space, null, OWNER.participantId);
    expect(ws.spendOf(space, ws.head())?.ceiling_usd).toBe(3);
  });

  it("says no spend in a room with no cap, until an amount is set again (ADR 0292)", () => {
    start();
    usage(0.5);
    ws.setSpendCeiling(space, "none", OWNER.participantId);
    expect(ws.log.at(-1)?.type).toBe("space.spend_ceiling_lifted");
    expect(ws.spendOf(space, ws.head())).toBeUndefined();
    ws.setSpendCeiling(space, 500, OWNER.participantId);
    expect(ws.spendOf(space, ws.head())?.ceiling_usd).toBe(500);
  });

  it("tells apart a run that reported no cost", () => {
    ok(OWNER, { type: "message.post", space_id: space, text: "Go" });
    start();
    usage(undefined);
    expect(ws.spendOf(space, ws.head())).toMatchObject({ spent_usd: 0, uncounted_runs: 1 });
  });
});

describe("a room's job at its ceiling (ADR 0118), as the real door has it", () => {
  /** A run's own report: its total so far. */
  const usage = (usd: number | undefined) =>
    ok(HARNESS, {
      type: "usage",
      space_id: space,
      run_id: RUN,
      scope: "run",
      model: "a-model",
      output_tokens: 10,
      ...(usd === undefined ? {} : { cost: { usd, estimated: true } }),
    });
  const inRoom = (type: string) =>
    ws.log.filter((event) => event.type === type && event.space_id === space);

  it("warns once from 80%, pauses the agents once at the ceiling saying why, and carrying on is a new allowance", () => {
    ws.setSpendCeiling(space, 1, OWNER.participantId);
    const asked = ok(OWNER, { type: "message.post", space_id: space, text: "Go" });
    start();
    usage(0.5);
    usage(0.85);
    usage(0.9);
    expect(inRoom("budget.warning").map((event) => event.payload)).toEqual([
      expect.objectContaining({
        actor: { kind: "system", id: "system" },
        budget: { limit_usd: 1, spent_usd: 0.85 },
        threshold: 80,
        action: "warn",
        scope: "job",
        since_seq: asked.seq,
      }),
    ]);
    usage(1.1);
    usage(1.2);
    expect(inRoom("exchange.set").map((event) => event.payload)).toEqual([
      expect.objectContaining({
        actor: { kind: "system", id: "system" },
        state: "paused",
        why: "spend",
        spend: { ceiling_usd: 1, spent_usd: 1.1, since_seq: asked.seq, uncounted_runs: 0 },
      }),
    ]);
    expect(inRoom("budget.warning").map((event) => event.payload["threshold"])).toEqual([80, 100]);
    expect(ws.exchangeAt(space, ws.head()).paused).toBe(true);

    const going = ws.setExchange(space, "going", OWNER.participantId);
    expect(ws.exchangeAt(space, ws.head()).paused).toBe(false);
    expect(ws.spendOf(space, ws.head())).toMatchObject({ spent_usd: 0, since_seq: going.seq });
  });

  it("never holds a room whose runs report no cost", () => {
    ws.setSpendCeiling(space, 0.25, OWNER.participantId);
    ok(OWNER, { type: "message.post", space_id: space, text: "Go" });
    start();
    usage(undefined);
    usage(undefined);
    expect(inRoom("budget.warning")).toEqual([]);
    expect(inRoom("exchange.set")).toEqual([]);
  });

  it("never warns or holds a room with no cap, whatever its job spends (ADR 0292)", () => {
    ws.setSpendCeiling(space, "none", OWNER.participantId);
    ok(OWNER, { type: "message.post", space_id: space, text: "Go" });
    start();
    usage(50);
    usage(1500);
    expect(inRoom("budget.warning")).toEqual([]);
    expect(inRoom("exchange.set")).toEqual([]);
  });
});
