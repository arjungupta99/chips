/**
 * The projector is pure, so it can be tested without a database. These tests say what each
 * event means for the screens; `replay.test.ts` says that meaning survives a rebuild.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EVENT_TYPES } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import {
  type Change,
  PROJECTED_EVENT_TYPES,
  PROJECTION_TABLES,
  project,
  type Row,
  type Upsert,
} from "./projection.js";

const FIXTURES = fileURLToPath(new URL("../../../packages/protocol/fixtures/", import.meta.url));

/** The golden scenario's own events, so the projector is tested against real shapes. */
function fixture(type: string): Parameters<typeof project>[0] {
  const event = JSON.parse(readFileSync(`${FIXTURES}${type}.json`, "utf8"));
  return { ...event, seq: 7 };
}

function rowsFor(changes: Change[], table: string): Row[] {
  return changes
    .filter((change): change is Upsert => change.kind === "upsert" && change.table === table)
    .map((change) => change.row);
}

describe("what an event means", () => {
  it("writes a person's role into the workspace as they join, and patches it as it changes (ADR 0034)", () => {
    const joined = project(fixture("person.joined"));
    expect(joined).toHaveLength(1);
    expect(joined[0]).toMatchObject({
      kind: "upsert",
      table: "workspace_members",
      row: {
        workspace_id: "ws_01K4ZQPX000000000000000001",
        participant_id: "usr_01K4ZQPX000000000000000009",
        role: "member",
        display_name: "Dana",
        invited_by: "usr_01K4ZQPX000000000000000003",
        invite_id: "inv_01K4ZQPX0000000000000000D1",
        updated_seq: 7,
      },
    });

    const changed = project(fixture("role.changed"));
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({
      kind: "patch",
      table: "workspace_members",
      key: {
        workspace_id: "ws_01K4ZQPX000000000000000001",
        participant_id: "usr_01K4ZQPX000000000000000009",
      },
      set: { role: "admin", updated_seq: 7 },
    });
  });

  it("stops a removed harness's homes being homes, and says nothing in them (ADR 0078)", () => {
    expect(project(fixture("harness.removed"))).toEqual([
      {
        kind: "patch",
        table: "spaces",
        key: {
          workspace_id: "ws_01K4ZQPX000000000000000001",
          id: "spc_01K4ZQPX000000000000000002",
        },
        set: { home: 0 },
      },
    ]);
    const { homes: _homes, ...homeless } = fixture("harness.removed");
    expect(project(homeless)).toEqual([]);
  });

  it("takes a removed person's standing away, and says nothing in any room (ADR 0160)", () => {
    expect(project(fixture("person.removed"))).toEqual([
      {
        kind: "delete",
        table: "workspace_members",
        key: {
          workspace_id: "ws_01K4ZQPX000000000000000001",
          participant_id: "usr_01K4ZQPX000000000000000009",
        },
      },
    ]);
  });

  it("writes the workspace's caps as one row, replaced whole (ADR 0047)", () => {
    const capped = project(fixture("attachment.limits_set"));
    expect(capped).toHaveLength(1);
    expect(capped[0]).toEqual({
      kind: "upsert",
      table: "workspace_limits",
      row: {
        workspace_id: "ws_01K4ZQPX000000000000000001",
        image_bytes: 26_214_400,
        video_bytes: 104_857_600,
        file_bytes: null,
        set_by: "usr_01K4ZQPX000000000000000003",
        updated_seq: 7,
      },
    });
  });

  it("opens a run and draws the plan as hollow steps", () => {
    const changes = project(fixture("run.started"));
    const [run] = rowsFor(changes, "runs");
    expect(run).toMatchObject({ state: "running", goal: expect.stringContaining("PO #4471") });

    const steps = rowsFor(changes, "steps");
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s["status"])).toEqual(["planned", "planned", "planned", "planned"]);
    expect(steps.map((s) => s["ordinal"])).toEqual([0, 1, 2, 3]);
  });

  it("turns a status into the harness's typing indicator, and nothing else", () => {
    const changes = project(fixture("run.status"));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      kind: "patch",
      table: "runs",
      set: { status_phase: "reading", status_verb: "Reading PO #4471…" },
    });
  });

  it("replaces the steps still to come, and leaves the done ones to the store", () => {
    const changes = project(fixture("run.plan"));
    expect(changes[0]).toMatchObject({
      kind: "replace_plan",
      steps: [
        { step_id: "email-dana", title: "Email Dana to confirm, with the pallet count" },
        { step_id: "update-tracker", title: "Update the tracker" },
      ],
    });
  });

  it("hands a usage to the store as a spend: the scope, the tokens, the cost and whose it is", () => {
    const [spend] = project(fixture("usage"));
    expect(spend).toMatchObject({
      kind: "spend",
      table: "runs",
      scope: "run",
      inputTokens: 82_140,
      outputTokens: 3402,
      usd: 1.47,
      harness: { harness_id: "hrn_01K4ZQPX000000000000000004" },
    });
    const [unpriced] = project({ ...fixture("usage"), scope: "step", cost: undefined });
    expect((unpriced as { usd?: number }).usd).toBeUndefined();
  });

  it("projects a policy change onto the harness's row and the workspace cap, and says so in the room", () => {
    const changes = project(fixture("policy.updated"));
    const [harness] = rowsFor(changes, "harness_policy");
    expect(harness).toMatchObject({
      harness_id: "hrn_01K4ZQPX000000000000000004",
      space_id: "spc_01K4ZQPX000000000000000002",
      autonomy: 2,
      budget_usd: 25,
    });
    expect(JSON.parse(String(harness?.["rules"]))).toHaveLength(1);
    expect(rowsFor(changes, "workspace_policy")[0]).toMatchObject({ max_autonomy: 2 });
    expect(rowsFor(changes, "messages")[0]).toMatchObject({ type: "system" });
  });

  it("leaves the budget alone when a policy change carries none, and the spend always", () => {
    const { budget_usd: _none, ...without } = fixture("policy.updated");
    const [harness] = rowsFor(project(without), "harness_policy");
    expect(harness).not.toHaveProperty("budget_usd");
    expect(harness).not.toHaveProperty("spent_usd");
  });

  it("scopes a workspace-wide policy change to every space, with no line anywhere", () => {
    const { space_id: _none, ...wide } = fixture("policy.updated");
    const changes = project(wide);
    expect(rowsFor(changes, "harness_policy")[0]?.["space_id"]).toBe("*");
    expect(rowsFor(changes, "messages")).toEqual([]);
  });

  it("turns a decision for this session into a rule for the rest of the run", () => {
    const changes = project({ ...fixture("approval.resolved"), scope: "session" });
    const rule = changes.find((change) => change.kind === "session_rule");
    expect(rule).toMatchObject({ decision: "allow", runId: "run_01K4ZQPX000000000000000005" });
    const denied = project({
      ...fixture("approval.resolved"),
      scope: "session",
      decision: "denied",
    });
    expect(denied.find((change) => change.kind === "session_rule")).toMatchObject({
      decision: "deny",
    });
    const once = project(fixture("approval.resolved"));
    expect(once.some((change) => change.kind === "session_rule")).toBe(false);
    const expired = project({
      ...fixture("approval.resolved"),
      scope: "session",
      decision: "expired",
    });
    expect(expired.some((change) => change.kind === "session_rule")).toBe(false);
  });

  it("files an attachment under the space and the message that carried it", () => {
    const post = fixture("message.post");
    const withFile = {
      ...post,
      attachments: [
        {
          attachment_id: "att_01K4ZQPX000000000000000008",
          filename: "PO-4471.pdf",
          mime_type: "application/pdf",
          byte_size: 184_302,
          sha256: "92efa547f5840a2e7257bab9e3529a0410cce0d865fdbc40ebb2895e76de010a",
        },
      ],
    };
    expect(rowsFor(project(withFile), "attachments")[0]).toMatchObject({
      id: "att_01K4ZQPX000000000000000008",
      space_id: post.space_id,
      message_id: post.id,
      filename: "PO-4471.pdf",
    });
  });

  it("moves the room's activity on feedback, and writes nothing else (M3.4)", () => {
    const changes = project(fixture("feedback"));
    expect(changes).toEqual([
      {
        kind: "patch",
        table: "spaces",
        key: {
          workspace_id: "ws_01K4ZQPX000000000000000001",
          id: "spc_01K4ZQPX000000000000000002",
        },
        set: { last_activity_at: "2026-09-02T14:22:27.004Z", last_event_seq: 7 },
      },
    ]);
  });

  it("leaves a muted line in the room when a harness reads a file", () => {
    const changes = project(fixture("attachment.fetched"));
    expect(rowsFor(changes, "messages")[0]).toMatchObject({
      type: "system",
      author_id: "hrn_01K4ZQPX000000000000000004",
    });
  });

  it("records a step against its run, keyed by the id the harness chose", () => {
    const [step] = rowsFor(project(fixture("step.log")), "steps");
    expect(step).toMatchObject({ step_id: "read-po", status: "done", tool: "drive.read" });
  });

  it("stores an approval as pending, with an expiry computed from expires_in", () => {
    const changes = project(fixture("approval.request"));
    const [approval] = rowsFor(changes, "approvals");
    expect(approval).toMatchObject({ state: "pending", fallback: "deny", editable: 1 });
    // The fixture asks at 14:22:04 with expires_in 3600.
    expect(approval?.["expires_at"]).toBe("2026-09-02T15:22:04.004Z");
  });

  it("puts the approval card in the space and moves the run to waiting", () => {
    const changes = project(fixture("approval.request"));
    expect(rowsFor(changes, "messages")[0]).toMatchObject({ type: "approval" });
    expect(
      changes.some((c) => c.kind === "run_transition" && c.transition === "await_person"),
    ).toBe(true);
  });

  it("resolves an approval with who answered and when", () => {
    const changes = project(fixture("approval.resolved"));
    const patch = changes.find((c) => c.kind === "patch" && c.table === "approvals");
    expect(patch).toMatchObject({
      set: { state: "resolved", decision: "approved", scope: "once" },
    });
    expect(
      changes.some((c) => c.kind === "run_transition" && c.transition === "person_answered"),
    ).toBe(true);
  });

  it("hands an approval on: who may answer changes, and nothing else about it (M5.5)", () => {
    const changes = project(fixture("approval.routed"));
    expect(changes[0]).toEqual({
      kind: "patch",
      table: "approvals",
      key: { workspace_id: "ws_01K4ZQPX000000000000000001", id: "apr_01K4ZQPX000000000000000006" },
      set: { approvers: JSON.stringify(["usr_01K4ZQPX000000000000000009"]) },
    });
    expect(changes.some((c) => c.kind === "run_transition")).toBe(false);
  });

  it("records what happened after a yes", () => {
    const patch = project(fixture("approval.executed")).find((c) => c.kind === "patch");
    expect(patch).toMatchObject({ set: { executed_outcome: "executed" } });
  });

  it("stores a question with its timeout as an instant", () => {
    const [question] = rowsFor(project(fixture("question.ask")), "questions");
    expect(question).toMatchObject({ state: "pending", on_no_answer: "use_default" });
    expect(question?.["timeout_at"]).toBe("2026-09-02T15:22:05.004Z");
  });

  it("answers a question and sends the run back to work", () => {
    const changes = project(fixture("question.answered"));
    expect(changes.find((c) => c.kind === "patch")).toMatchObject({
      set: { state: "answered", timed_out: 0 },
    });
    expect(
      changes.some((c) => c.kind === "run_transition" && c.transition === "person_answered"),
    ).toBe(true);
  });

  it("records an attachment when a message carries one", () => {
    const changes = project(fixture("message.new"));
    // `message.new` is a delivery, not a log entry, so it projects nothing.
    expect(changes).toEqual([]);
  });

  it("stores the attachments a posted message carries", () => {
    const event = fixture("message.post");
    const withFile = {
      ...event,
      attachments: [
        {
          attachment_id: "att_01K4ZQPX000000000000000008",
          filename: "PO-4471.pdf",
          mime_type: "application/pdf",
          byte_size: 184_302,
          sha256: "92efa547f5840a2e7257bab9e3529a0410cce0d865fdbc40ebb2895e76de010a",
        },
      ],
    };
    const attachments = rowsFor(project(withFile), "attachments");
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({ filename: "PO-4471.pdf" });
  });

  it("rolls usage and context into the run, for the cost meter and the context ring", () => {
    const [usage] = project(fixture("usage"));
    expect(usage).toMatchObject({
      kind: "spend",
      inputTokens: 82_140,
      outputTokens: 3402,
      usd: 1.47,
    });
    const [context] = project(fixture("context.usage"));
    expect(context).toMatchObject({
      kind: "patch",
      table: "runs",
      set: { context_used: 82_000, context_limit: 200_000 },
    });
  });

  it("ends a run with a summary card", () => {
    const changes = project(fixture("run.completed"));
    expect(changes.some((c) => c.kind === "run_transition" && c.transition === "complete")).toBe(
      true,
    );
    expect(rowsFor(changes, "messages")[0]).toMatchObject({ type: "summary" });
  });

  it("opens a session as a live visit, and closes it without touching the space", () => {
    const started = project(fixture("session.started"));
    expect(rowsFor(started, "sessions")[0]).toMatchObject({
      session_ref: "scout:3f9c1a",
      state: "live",
      where: "mbp \u00b7 ~/Work/Chips",
      ended_at: null,
    });
    // A visit is not a space: nothing here opens, renames or closes one.
    expect(started.some((c) => c.kind === "upsert" && c.table === "spaces")).toBe(false);

    const ended = project(fixture("session.ended"));
    const [close] = ended.filter((c) => c.kind === "patch" && c.table === "sessions");
    expect(close).toMatchObject({
      key: { session_ref: "scout:3f9c1a" },
      set: { state: "closed", ended_reason: "prompt_input_exit" },
    });
    // An end nobody saw the start of writes nothing, rather than inventing a session.
    expect(ended.some((c) => c.kind === "upsert" && c.table === "sessions")).toBe(false);
  });

  it("opens a space, and adds and removes a member", () => {
    const created = fixture("space.created");
    expect(rowsFor(project(created), "spaces")[0]).toMatchObject({
      kind: "group",
      title: "PO-4471",
    });
    // Whoever opened it is its first member (ADR 0018), so their next event passes the
    // membership rule without a membership.added in between.
    expect(rowsFor(project(created), "memberships")[0]).toMatchObject({
      participant_id: created.actor.id,
      role: "owner",
    });
    expect(rowsFor(project(fixture("membership.added")), "memberships")[0]).toMatchObject({
      role: "member",
    });
    expect(project(fixture("membership.removed")).some((c) => c.kind === "delete")).toBe(true);
  });

  it("remembers who opened a space, and whether a person or a harness titled it (M3.3)", () => {
    const created = fixture("space.created");
    expect(rowsFor(project(created), "spaces")[0]).toMatchObject({
      state: "open",
      closed_at: null,
      opened_by: created.actor.id,
      title_by: "person",
    });
    const untitled = { ...created, actor: { kind: "harness", id: "hrn_1" } } as typeof created;
    delete (untitled as Record<string, unknown>)["title"];
    expect(rowsFor(project(untitled), "spaces")[0]).toMatchObject({
      opened_by: "hrn_1",
      title_by: null,
    });
  });

  it("retitles, closes and reopens a space, and says so in the room (M3.3)", () => {
    const retitled = project(fixture("space.updated"));
    expect(retitled.find((c) => c.kind === "patch" && c.table === "spaces")).toMatchObject({
      key: { id: "spc_01K4ZQPX000000000000000002" },
      set: { title: "PO-4471 \u00b7 Northwind", title_by: "person" },
    });
    expect(rowsFor(retitled, "messages")[0]).toMatchObject({ type: "system" });

    const closing = { ...fixture("space.updated"), state: "closed" };
    delete (closing as Record<string, unknown>)["title"];
    expect(project(closing).find((c) => c.kind === "patch" && c.table === "spaces")).toMatchObject({
      set: { state: "closed", closed_at: closing.ts },
    });
    const reopening = { ...closing, state: "open" };
    expect(
      project(reopening).find((c) => c.kind === "patch" && c.table === "spaces"),
    ).toMatchObject({ set: { state: "open", closed_at: null } });
  });

  it("marks a harness's home, and says nothing in the room about it (ADR 0069)", () => {
    const home = { ...fixture("space.updated"), home: true };
    delete (home as Record<string, unknown>)["title"];
    const changes = project(home);
    expect(changes).toEqual([
      expect.objectContaining({ kind: "patch", table: "spaces", set: { home: 1 } }),
    ]);
    const none = { ...fixture("space.updated"), home: false };
    delete (none as Record<string, unknown>)["title"];
    expect(project(none)[0]).toMatchObject({ set: { home: 0 } });
  });

  it("locks an agent's changes and lets them go, on its own row (ADR 0199)", () => {
    expect(project(fixture("agent.lock_set"))).toEqual([
      expect.objectContaining({ kind: "patch", table: "participants", set: { locked: 1 } }),
    ]);
    expect(project({ ...fixture("agent.lock_set"), locked: false })).toEqual([
      expect.objectContaining({ kind: "patch", table: "participants", set: { locked: 0 } }),
    ]);
  });

  it("locks a room's changes and lets them go, and says nothing in the room about it (ADR 0156)", () => {
    expect(project(fixture("space.lock_set"))).toEqual([
      expect.objectContaining({ kind: "patch", table: "spaces", set: { locked: 1 } }),
    ]);
    expect(project({ ...fixture("space.lock_set"), locked: false })).toEqual([
      expect.objectContaining({ kind: "patch", table: "spaces", set: { locked: 0 } }),
    ]);
  });

  it("keeps which harness a room was asked of, and hands the room to it when it claims", () => {
    const asked = { ...fixture("space.created"), asked_of: "hrn_01K4ZQPX000000000000000004" };
    expect(rowsFor(project(asked), "spaces")[0]).toMatchObject({
      asked_of: "hrn_01K4ZQPX000000000000000004",
      external_key: null,
    });
    expect(rowsFor(project(fixture("space.created")), "spaces")[0]).toMatchObject({
      asked_of: null,
    });

    // The key, and the harness as the room's opener: retitle, archive and erase follow from it.
    const claimed = project(fixture("space.claimed"));
    expect(claimed).toEqual([
      {
        kind: "patch",
        table: "spaces",
        key: {
          workspace_id: "ws_01K4ZQPX000000000000000001",
          id: "spc_01K4ZQPX000000000000000002",
        },
        set: {
          external_key: "hrn_01K4ZQPX000000000000000004:e0d0f115",
          opened_by: "hrn_01K4ZQPX000000000000000004",
          title: "Kitchen remodel",
          title_by: "harness",
        },
      },
    ]);
    // No name brought, and the one the room has stays; nothing is said in the room either way.
    const unnamed = fixture("space.claimed");
    delete (unnamed as Record<string, unknown>)["title"];
    expect(project(unnamed)).toEqual([
      expect.objectContaining({
        set: {
          external_key: "hrn_01K4ZQPX000000000000000004:e0d0f115",
          opened_by: "hrn_01K4ZQPX000000000000000004",
        },
      }),
    ]);
  });
});

describe("a lane, from both sides", () => {
  it("opens the lane and seeds the specialist's run from run.requested", () => {
    const changes = project(fixture("run.requested"));
    const [lane] = rowsFor(changes, "lanes");
    expect(lane).toMatchObject({
      id: "lane_01K4ZQPX00000000000000000A",
      lead_id: "hrn_01K4ZQPX000000000000000004",
      specialist_id: "hrn_01K4ZQPX00000000000000000B",
      state: "running",
      delivery: "pending",
      // Trail is [person, scout]: one lead below the person, so depth one.
      depth: 1,
      run_id: "run_01K4ZQPX00000000000000000D",
      // The last trail hop is the lead's own run.
      lead_run_id: "run_01K4ZQPX000000000000000005",
      home_space_id: "spc_01K4ZQPX00000000000000000C",
    });
    expect(JSON.parse(String(lane?.["linked_space_ids"]))).toEqual([
      "spc_01K4ZQPX000000000000000002",
    ]);

    const [run] = rowsFor(changes, "runs");
    expect(run).toMatchObject({
      id: "run_01K4ZQPX00000000000000000D",
      harness_id: "hrn_01K4ZQPX00000000000000000B",
      space_id: "spc_01K4ZQPX00000000000000000C",
      state: "running",
    });
    // The specialist's task card lands in the home space.
    expect(rowsFor(changes, "messages")[0]).toMatchObject({
      type: "task",
      space_id: "spc_01K4ZQPX00000000000000000C",
    });
  });

  it("seeds no run when run.requested carries none, but still opens the lane", () => {
    const { run_id: _none, ...withoutRun } = fixture("run.requested") as Record<string, unknown>;
    const changes = project({ ...withoutRun, seq: 7 } as Parameters<typeof project>[0]);
    expect(rowsFor(changes, "lanes")[0]).toMatchObject({ run_id: null });
    expect(rowsFor(changes, "runs")).toEqual([]);
  });

  it("patches the lane's state, delivery and summary from lane.updated", () => {
    const changes = project(fixture("lane.updated"));
    const patch = changes.find((change) => change.kind === "patch");
    expect(patch).toMatchObject({
      table: "lanes",
      key: { id: "lane_01K4ZQPX00000000000000000A" },
      set: { state: "completed", delivery: "queued_to_lead" },
    });
    expect((patch as { set: Record<string, unknown> }).set["summary"]).toContain("4 percent");
  });
});

describe("the projector as a whole", () => {
  it("is total: every declared event type produces changes without throwing", () => {
    for (const type of EVENT_TYPES) {
      expect(() => project(fixture(type)), `${type} threw`).not.toThrow();
    }
  });

  it("writes only to declared projection tables", () => {
    for (const type of EVENT_TYPES) {
      for (const change of project(fixture(type))) {
        if (change.kind === "run_transition") continue;
        expect(PROJECTION_TABLES, `${type} writes to ${change.table}`).toContain(change.table);
      }
    }
  });

  it("leaves the delivery transforms alone, because they are never appended", () => {
    // `run.requested` and `lane.updated` are appended by Chips and do project (M3.1); the
    // three below are per-recipient transforms of an event that already appended, so they are
    // never in the log and mean nothing to the read models.
    for (const type of ["hello", "message.new", "receipt"]) {
      expect(project(fixture(type)), `${type} should project nothing`).toEqual([]);
    }
  });

  it("is a function: the same event always means the same thing", () => {
    for (const type of PROJECTED_EVENT_TYPES) {
      expect(project(fixture(type))).toEqual(project(fixture(type)));
    }
  });

  it("stamps every message row with the sequence number it was appended at", () => {
    for (const type of PROJECTED_EVENT_TYPES) {
      for (const row of rowsFor(project(fixture(type)), "messages")) {
        expect(row["seq"]).toBe(7);
      }
    }
  });
});

/**
 * The interface is progressive (blueprint, Connect): the minimum is three events, and every
 * extra field upgrades what the person sees. So the projector has to cope with an event that
 * carries nothing but its required fields — which is also where most of its branches live.
 */
describe("an event with only its required fields", () => {
  const SCHEMAS = fileURLToPath(
    new URL("../../../packages/protocol/generated/schema/", import.meta.url),
  );

  /** The fixture, stripped to the fields the schema marks required. */
  function minimal(type: string): Parameters<typeof project>[0] {
    const schema = JSON.parse(readFileSync(`${SCHEMAS}${type}.json`, "utf8")) as {
      required?: string[];
    };
    const full = fixture(type) as unknown as Record<string, unknown>;
    const required = new Set(schema.required ?? []);
    const stripped = Object.fromEntries(
      Object.entries(full).filter(([field]) => required.has(field)),
    );
    // `seq`, `run_id` and `space_id` are envelope fields the store supplies, not
    // payload the harness chose to send.
    return {
      ...stripped,
      seq: 7,
      ...(full["run_id"] === undefined ? {} : { run_id: full["run_id"] }),
      ...(full["space_id"] === undefined ? {} : { space_id: full["space_id"] }),
    } as Parameters<typeof project>[0];
  }

  it.each(PROJECTED_EVENT_TYPES.map((type) => [type]))("%s projects without throwing", (type) => {
    expect(() => project(minimal(type))).not.toThrow();
  });

  it.each(PROJECTED_EVENT_TYPES.map((type) => [type]))(
    "%s writes only to declared tables",
    (type) => {
      for (const change of project(minimal(type))) {
        if (change.kind === "run_transition") continue;
        expect(PROJECTION_TABLES).toContain(change.table);
      }
    },
  );

  it("opens a run with no plan and no session reference", () => {
    const changes = project(minimal("run.started"));
    const [run] = rowsFor(changes, "runs");
    expect(run).toMatchObject({ state: "running", plan: "[]", session_ref: null });
    expect(rowsFor(changes, "steps")).toEqual([]);
  });

  it("stores an approval with no preview, no sources and no approvers", () => {
    const [approval] = rowsFor(project(minimal("approval.request")), "approvals");
    expect(approval).toMatchObject({
      preview: "null",
      sources: "[]",
      approvers: "[]",
      state: "pending",
    });
  });

  it("records usage with no cost, because a harness may not be able to compute one", () => {
    const { cost: _none, ...bare } = fixture("usage") as Record<string, unknown>;
    const [usage] = project(bare as Parameters<typeof project>[0]);
    expect((usage as { usd?: number }).usd).toBeUndefined();
  });
  it("posts a message with no attachments", () => {
    const [message] = rowsFor(project(minimal("message.post")), "messages");
    expect(message).toMatchObject({ attachments: "[]", reply_to: null });
  });

  it("leaves an event with no space out of the space list", () => {
    const { space_id: _omitted, ...event } = minimal("checkpoint") as Record<string, unknown>;
    const changes = project(event as Parameters<typeof project>[0]);
    expect(changes.filter((c) => c.kind !== "run_transition" && c.table === "spaces")).toEqual([]);
  });
});

describe("messaging depth (M5.4)", () => {
  const ROW = {
    workspace_id: "ws_01K4ZQPX000000000000000001",
    id: "evt_01K4ZQPX000000000000000067",
  };

  it("edits a message in place and marks it, and moves the room on", () => {
    const changes = project(fixture("message.edited"));
    expect(changes[0]).toEqual({
      kind: "patch",
      table: "messages",
      key: ROW,
      set: {
        text: "Working on it — checking the Northwind quotes first.",
        edited_at: "2026-09-06T12:00:00.004Z",
      },
    });
    expect(changes.some((c) => c.kind === "patch" && c.table === "spaces")).toBe(true);
  });

  it("takes a message back: the words leave the row, and so does its pin", () => {
    const changes = project(fixture("message.deleted"));
    expect(changes[0]).toEqual({
      kind: "patch",
      table: "messages",
      key: ROW,
      set: { text: null, attachments: "[]", deleted_at: "2026-09-06T12:01:00.004Z" },
    });
    expect(changes[1]).toMatchObject({
      kind: "delete",
      table: "pins",
      key: { message_id: "msg_01K4ZQPX000000000000000067" },
    });
  });

  it("pins a message to its space, and lets it go", () => {
    expect(rowsFor(project(fixture("message.pinned")), "pins")[0]).toEqual({
      workspace_id: "ws_01K4ZQPX000000000000000001",
      space_id: "spc_01K4ZQPX000000000000000002",
      message_id: "msg_01K4ZQPX000000000000000067",
      pinned_by: "usr_01K4ZQPX000000000000000003",
      pinned_at: "2026-09-06T12:02:00.004Z",
    });
    expect(project(fixture("message.unpinned"))[0]).toMatchObject({
      kind: "delete",
      table: "pins",
      key: {
        space_id: "spc_01K4ZQPX000000000000000002",
        message_id: "msg_01K4ZQPX000000000000000067",
      },
    });
  });

  it("opens a thread with its parent and its root, and no membership of its own", () => {
    const opened = {
      ...fixture("space.created"),
      space_id: "spc_01K4ZQPX00000000000000000T",
      kind: "thread",
      parent_space_id: "spc_01K4ZQPX000000000000000002",
      root_message_id: "msg_01K4ZQPX000000000000000067",
    };
    const changes = project(opened);
    expect(rowsFor(changes, "spaces")[0]).toMatchObject({
      id: "spc_01K4ZQPX00000000000000000T",
      kind: "thread",
      parent_space_id: "spc_01K4ZQPX000000000000000002",
      root_message_id: "msg_01K4ZQPX000000000000000067",
    });
    expect(rowsFor(changes, "memberships")).toEqual([]);
    // A space that is not a thread has neither, and its opener is its first member.
    expect(rowsFor(project(fixture("space.created")), "spaces")[0]).toMatchObject({
      parent_space_id: null,
      root_message_id: null,
    });
  });
});
