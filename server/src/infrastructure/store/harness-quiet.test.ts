/**
 * What keeps a harness busy, for the computer waiting to start its bridge again on a new release
 * (bridges-keep-current.md, A): a run going, an ask or question waiting, a message in its rooms.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { manualClock } from "@chipschat/platform";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db/connection.js";
import { migrateToLatest } from "../db/migrator.js";
import type { Database } from "../db/schema.js";
import {
  createComputerQuiet,
  createHarnessQuiet,
  JOB_RUNNING_MS,
  PAUSED_HEARD_MS,
  RUN_HEARD_MS,
} from "./harness-quiet.js";

const WS = "ws_01K4ZQPX000000000000000001";
const ROOM = "spc_01K4ZQPX000000000000000ROOM";
const OTHER = "spc_01K4ZQPX0000000000000OTHER";
const ADA = "usr_01K4ZQPX000000000000000003";
const HARNESS = "hrn_01K4ZQPX000000000000000004";
const AGENT = "agt_01K4ZQPX000000000000000005";
const AT = "2026-11-20T10:00:00.000Z";
const SINCE = "2026-11-20T09:58:00.000Z";

let db: Kysely<Database>;
let close: () => Promise<void>;

beforeEach(async () => {
  const directory = mkdtempSync(join(tmpdir(), "chips-quiet-"));
  const connection = openDatabase({ databaseUrl: `sqlite:${join(directory, "chips.db")}` });
  await migrateToLatest(connection.db, () => AT);
  db = connection.db;
  await db.insertInto("workspaces").values({ id: WS, name: "Solo", created_at: AT }).execute();
  const participant = (id: string, kind: "person" | "harness" | "agent", harness?: string) =>
    db
      .insertInto("participants")
      .values({
        id,
        workspace_id: WS,
        kind,
        display_name: id,
        owner_id: null,
        parent_id: null,
        ephemeral: 0,
        capabilities: null,
        created_at: AT,
        ...(harness === undefined ? {} : { harness_id: harness }),
      })
      .execute();
  await participant(ADA, "person");
  await participant(HARNESS, "harness");
  await participant(AGENT, "agent", HARNESS);
  for (const id of [ROOM, OTHER]) {
    await db
      .insertInto("spaces")
      .values({
        id,
        workspace_id: WS,
        kind: "group",
        title: id,
        external_key: null,
        state: "open",
        closed_at: null,
        opened_by: null,
        title_by: null,
        state_by: null,
        asked_of: null,
        created_at: AT,
      } as never)
      .execute();
  }
  await db
    .insertInto("memberships")
    .values({
      workspace_id: WS,
      space_id: ROOM,
      participant_id: AGENT,
      role: "member",
      joined_at: AT,
    })
    .execute();
  close = async () => {
    await connection.close();
    rmSync(directory, { recursive: true, force: true });
  };
});

afterEach(async () => {
  await close();
});

const NOW = Date.parse(AT);
const clock = manualClock(NOW);
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const quiet = () => createHarnessQuiet(db, clock)(WS, HARNESS, SINCE);

/** Something heard of a run: an event of it in the log. */
async function heard(runId: string, seq: number, at: string) {
  await db
    .insertInto("events")
    .values({
      workspace_id: WS,
      seq,
      id: `evt_${seq}`,
      type: "run.status",
      ts: at,
      space_id: ROOM,
      run_id: runId,
      actor_kind: "harness",
      actor_id: HARNESS,
      idempotency_key: null,
      payload: "{}",
      appended_at: at,
    })
    .execute();
}

async function run(id: string, state: string, harness = HARNESS, startedAt = AT) {
  await db
    .insertInto("runs")
    .values({
      id,
      workspace_id: WS,
      space_id: ROOM,
      harness_id: harness,
      goal: "g",
      state,
      status_phase: null,
      status_verb: null,
      plan: null,
      session_ref: null,
      summary: null,
      error: null,
      cost_usd: null,
      input_tokens: null,
      output_tokens: null,
      context_used: null,
      context_limit: null,
      started_at: startedAt,
      ended_at: null,
    })
    .execute();
}

async function message(id: string, space: string, at: string) {
  await db
    .insertInto("messages")
    .values({
      id,
      workspace_id: WS,
      space_id: space,
      run_id: null,
      seq: null,
      type: "text",
      author_kind: "person",
      author_id: ADA,
      text: "hi",
      reply_to: null,
      attachments: null,
      approval_id: null,
      ask_id: null,
      created_at: at,
      edited_at: null,
      deleted_at: null,
    } as never)
    .execute();
}

async function question(id: string, runId: string | null) {
  await db
    .insertInto("questions")
    .values({
      id,
      workspace_id: WS,
      space_id: ROOM,
      run_id: runId,
      questions: "[]",
      asked_at: AT,
      timeout_at: null,
      on_no_answer: "proceed",
      state: "pending",
      answers: null,
      answered_by: null,
      answered_at: null,
      timed_out: 0,
    })
    .execute();
}

describe("a harness's quiet moment", () => {
  it("is quiet with nothing going on, and with only runs that are over", async () => {
    expect(await quiet()).toBeUndefined();
    await run("run_done", "done");
    await run("run_failed", "failed");
    expect(await quiet()).toBeUndefined();
  });

  it("is busy while a run of it isn't over", async () => {
    await run("run_going", "waiting");
    expect(await quiet()).toBe("run");
  });

  it("is busy while an ask one of its runs made waits", async () => {
    await run("run_asked", "done");
    await db
      .insertInto("approvals")
      .values({
        id: "apr_1",
        workspace_id: WS,
        space_id: ROOM,
        run_id: "run_asked",
        step_id: null,
        action: "shell",
        preview: null,
        risk: "low",
        sources: null,
        requested_at: AT,
        expires_at: null,
        fallback: "deny",
        approvers: null,
        editable: 0,
        state: "pending",
        decision: null,
        scope: null,
        reason: null,
        updated_input: null,
        resolved_by: null,
        resolved_at: null,
        executed_outcome: null,
        executed_detail: null,
      })
      .execute();
    expect(await quiet()).toBe("ask");
    await db.updateTable("approvals").set({ state: "resolved" }).execute();
    expect(await quiet()).toBeUndefined();
  });

  it("is busy for a message in a room one of its agents is in, lately, and not elsewhere", async () => {
    await message("msg_old", ROOM, "2026-11-20T09:50:00.000Z");
    await message("msg_elsewhere", OTHER, "2026-11-20T09:59:00.000Z");
    expect(await quiet()).toBeUndefined();
    await message("msg_new", ROOM, "2026-11-20T09:59:00.000Z");
    expect(await quiet()).toBe("message");
  });
});

describe("a harness's quiet moment, with a question waiting", () => {
  it("is busy while a question one of its runs asked waits, and not for another harness's", async () => {
    await run("run_other", "done", "hrn_01K4ZQPX0000000000000OTHER");
    await question("qst_other", "run_other");
    expect(await quiet()).toBeUndefined();
    await run("run_asking", "done");
    await question("qst_1", "run_asking");
    expect(await quiet()).toBe("ask");
    await db.updateTable("questions").set({ state: "answered" }).execute();
    expect(await quiet()).toBeUndefined();
  });
});

describe("a run nobody closed", () => {
  const HOUR = 60 * 60_000;

  it("stops keeping its harness busy once nothing was heard of it for six hours", async () => {
    await run("run_left", "running", HARNESS, ago(RUN_HEARD_MS + HOUR));
    expect(await quiet()).toBeUndefined();
    // Begun long ago, but it said something an hour ago: it is going on.
    await heard("run_left", 1, ago(HOUR));
    expect(await quiet()).toBe("run");
  });

  it("is still going when it began inside the six hours, with nothing in the log yet", async () => {
    await run("run_new", "queued", HARNESS, ago(RUN_HEARD_MS - HOUR));
    expect(await quiet()).toBe("run");
  });

  it("doesn't count what was heard of another run, or long ago", async () => {
    await run("run_left", "waiting", HARNESS, ago(RUN_HEARD_MS + HOUR));
    await run("run_done", "done", HARNESS, ago(RUN_HEARD_MS + HOUR));
    await heard("run_done", 1, ago(HOUR));
    await heard("run_left", 2, ago(RUN_HEARD_MS + 1));
    expect(await quiet()).toBeUndefined();
  });

  it("keeps a paused run's bridge for a day, since the bridge holds what it was doing", async () => {
    await run("run_paused", "paused", HARNESS, ago(RUN_HEARD_MS + HOUR));
    expect(await quiet()).toBe("run");
    await db
      .updateTable("runs")
      .set({ started_at: ago(PAUSED_HEARD_MS + HOUR) })
      .execute();
    expect(await quiet()).toBeUndefined();
    await heard("run_paused", 1, ago(PAUSED_HEARD_MS - HOUR));
    expect(await quiet()).toBe("run");
  });

  it("never holds the computer's own update back when it is paused, or left", async () => {
    const computer = () => createComputerQuiet(db, clock)(SINCE);
    await run("run_paused", "paused");
    expect(await computer()).toBeUndefined();
    await run("run_left", "running", HARNESS, ago(RUN_HEARD_MS + HOUR));
    expect(await computer()).toBeUndefined();
    await heard("run_left", 1, ago(HOUR));
    expect(await computer()).toBe("run");
  });
});

describe("what else keeps a harness busy", () => {
  const HOUR = 60 * 60_000;

  async function compaction(state: string, askedAt: string) {
    const stored = JSON.stringify({ id: "cmp_1", askedBy: ADA, askedAt, state });
    await db
      .insertInto("agent_context_windows")
      .values({
        workspace_id: WS,
        agent_id: AGENT,
        harness_id: HARNESS,
        said: "{}",
        read_at: AT,
        change: null,
        compaction: stored,
      })
      .onConflict((conflict) =>
        conflict.columns(["workspace_id", "agent_id"]).doUpdateSet({ compaction: stored }),
      )
      .execute();
  }

  it("is busy while a Compact now a person asked is waiting or under way", async () => {
    await compaction("waiting", ago(60_000));
    expect(await quiet()).toBe("run");
    await compaction("taken", ago(10 * 60_000));
    expect(await quiet()).toBe("run");
    await compaction("done", ago(10 * 60_000));
    expect(await quiet()).toBeUndefined();
    await compaction("failed", ago(60_000));
    expect(await quiet()).toBeUndefined();
  });

  it("stops waiting on a Compact now nothing was heard of for an hour, or one it can't read", async () => {
    await compaction("taken", ago(HOUR + 60_000));
    expect(await quiet()).toBeUndefined();
    await db.updateTable("agent_context_windows").set({ compaction: "{ cut off" }).execute();
    expect(await quiet()).toBeUndefined();
  });

  it("finds the one run still going behind any number that were left", async () => {
    for (let n = 0; n < 60; n += 1) {
      await run(`run_left_${n}`, "running", HARNESS, ago(RUN_HEARD_MS + HOUR + n * 1000));
    }
    expect(await quiet()).toBeUndefined();
    // Older than all of them, and it said something ten minutes ago.
    await run("run_long", "running", HARNESS, ago(RUN_HEARD_MS + 30 * HOUR));
    await heard("run_long", 1, ago(10 * 60_000));
    expect(await quiet()).toBe("run");
  });

  it("is quiet for a message exactly at the moment asked since, and for another workspace's", async () => {
    await message("msg_at", ROOM, SINCE);
    expect(await quiet()).toBeUndefined();
    await run("run_going", "running");
    const elsewhere = createHarnessQuiet(db, clock);
    expect(await elsewhere("ws_01K4ZQPX0000000000000OTHER", HARNESS, SINCE)).toBeUndefined();
  });
});

/** One job in a harness's copy of the jobs it runs on its own, as it was last sent. */
async function job(id: string, more: Record<string, unknown> | string, harness = HARNESS) {
  const said =
    typeof more === "string"
      ? more
      : JSON.stringify({
          job_id: id,
          name: id,
          about: "x",
          kind: "other",
          every: 60,
          on: true,
          editable: false,
          ...more,
        });
  await db
    .insertInto("harness_jobs")
    .values({
      workspace_id: WS,
      harness_id: harness,
      job_id: id,
      position: 0,
      said,
      read_at: AT,
      change: null,
    })
    .execute();
}

describe("a job a harness runs on its own", () => {
  const OTHER_HARNESS = "hrn_01K4ZQPX000000000000000008";
  const computer = () => createComputerQuiet(db, clock)(SINCE);

  it("keeps its harness busy, and the computer, while its copy says a run of it is going", async () => {
    await job("heartbeat", {});
    expect(await quiet()).toBeUndefined();
    expect(await computer()).toBeUndefined();
    await job("dreaming", { running_since: ago(5 * 60_000) });
    expect(await quiet()).toBe("run");
    expect(await computer()).toBe("run");
  });

  it("keeps only its own harness busy, and the computer for anybody's", async () => {
    await job("dreaming", { running_since: ago(60_000) }, OTHER_HARNESS);
    expect(await quiet()).toBeUndefined();
    expect(await computer()).toBe("run");
  });

  it("stops counting a run its harness never said was over, six hours on", async () => {
    await job("dreaming", { running_since: ago(JOB_RUNNING_MS - 1000) });
    expect(await quiet()).toBe("run");
    await db
      .updateTable("harness_jobs")
      .set({ said: JSON.stringify({ job_id: "dreaming", running_since: ago(JOB_RUNNING_MS) }) })
      .execute();
    expect(await quiet()).toBeUndefined();
    expect(await computer()).toBeUndefined();
  });

  it("reads nothing into a copy it can't make out", async () => {
    await job("a", "{ cut off");
    await job("b", { running_since: "lately" });
    await job("c", { running_since: 5 });
    await job("d", "null");
    expect(await quiet()).toBeUndefined();
    expect(await computer()).toBeUndefined();
  });
});

describe("a computer's quiet moment, for its own update", () => {
  const computer = () => createComputerQuiet(db, clock)(SINCE);

  it("is quiet with nothing going on anywhere", async () => {
    await run("run_done", "done");
    await message("msg_old", OTHER, "2026-11-20T09:50:00.000Z");
    expect(await computer()).toBeUndefined();
  });

  it("is busy while any harness's run isn't over", async () => {
    await run("run_going", "working", "hrn_01K4ZQPX0000000000000OTHER");
    expect(await computer()).toBe("run");
    await db.updateTable("runs").set({ state: "cancelled" }).execute();
    expect(await computer()).toBeUndefined();
  });

  it("is busy while a question waits, whoever asked it", async () => {
    await question("qst_1", null);
    expect(await computer()).toBe("ask");
    await db.updateTable("questions").set({ state: "timed_out" }).execute();
    expect(await computer()).toBeUndefined();
  });

  it("is busy for a message anywhere since, in a room no agent is in too", async () => {
    await message("msg_new", OTHER, "2026-11-20T09:59:00.000Z");
    expect(await computer()).toBe("message");
    expect(await createComputerQuiet(db, clock)("2026-11-20T09:59:00.000Z")).toBeUndefined();
  });
});
