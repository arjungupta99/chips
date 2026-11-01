/**
 * M0.3's acceptance criteria, as two tests.
 *
 * 1. A property test generates random valid event sequences, applies them, rebuilds from zero
 *    and gets identical projections.
 * 2. Ten thousand events append and replay in under two seconds.
 *
 * The first is the important one. It is the check that ADR 0004 is true — that the read models
 * really are a function of the log, for sequences nobody thought to write by hand.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createIdGenerator, type IdGenerator, parseEvent } from "@chipschat/protocol";
import fc from "fast-check";
import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import type { EventStore, IncomingEvent } from "../../application/ports/index.js";
import { PROJECTION_TABLES } from "../../domain/index.js";
import { openDatabase } from "../db/connection.js";
import { migrateToLatest } from "../db/migrator.js";
import type { Database } from "../db/schema.js";
import { createSqliteEventStore } from "./sqlite-event-store.js";

const WS = "ws_01K4ZQPX000000000000000001";
const CONV = "spc_01K4ZQPX000000000000000002";
const ARJUN = "usr_01K4ZQPX000000000000000003";
const SCOUT = "hrn_01K4ZQPX000000000000000004";

interface Harness {
  readonly db: Kysely<Database>;
  readonly store: EventStore;
  readonly ids: IdGenerator;
  readonly at: (tick: number) => string;
  readonly close: () => Promise<void>;
}

/** A fresh database in a temporary directory, with deterministic ids and clock. */
async function harness(): Promise<Harness> {
  const directory = mkdtempSync(join(tmpdir(), "chips-replay-"));
  const connection = openDatabase({ databaseUrl: `sqlite:${join(directory, "chips.db")}` });
  await migrateToLatest(connection.db, () => "2026-09-02T00:00:00.000Z");

  const ids = createIdGenerator({
    now: () => 1_756_800_000_000,
    randomFill: (bytes) => bytes.fill(1),
  });
  let tick = 0;
  const at = (t: number) => new Date(1_756_800_000_000 + t).toISOString();

  const store = createSqliteEventStore({ db: connection.db, now: () => at(tick++) });
  await connection.db
    .insertInto("workspaces")
    .values({ id: WS, name: "Solo", created_at: at(0) })
    .execute();

  return {
    db: connection.db,
    store,
    ids,
    at,
    close: async () => {
      await connection.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

/** Every projection row for a workspace, ordered, so two states can be compared exactly. */
async function snapshot(db: Kysely<Database>): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const table of PROJECTION_TABLES) {
    const rows = await db.selectFrom(table).selectAll().where("workspace_id", "=", WS).execute();
    out[table] = rows.map((row) => JSON.stringify(row, Object.keys(row as object).sort())).sort();
  }
  return out;
}

/**
 * The shapes of event a run produces, as a generator. Each one is a function of the run and
 * step ids the sequence is using, so a generated sequence is coherent rather than random noise.
 */
type Step = (context: Context) => IncomingEvent;

interface Context {
  readonly ids: IdGenerator;
  readonly at: (tick: number) => string;
  readonly runId: string;
  readonly approvalId: string;
  readonly askId: string;
  tick: number;
}

/**
 * Every generated event goes through the same validation the gateway will apply, so a
 * generated sequence is a sequence of events the edge would actually accept, with the schema's
 * defaults filled in.
 */
function envelope(context: Context, type: string, extra: Record<string, unknown>): IncomingEvent {
  const parsed = parseEvent({
    v: 1,
    type,
    id: context.ids.next("event"),
    ts: context.at(context.tick++),
    workspace_id: WS,
    space_id: CONV,
    run_id: context.runId,
    actor: { kind: "harness", id: SCOUT },
    ...extra,
  });
  if (!parsed.ok) {
    throw new Error(`the test built an invalid ${type}: ${JSON.stringify(parsed.error)}`);
  }
  return parsed.value as unknown as IncomingEvent;
}

const STEPS: readonly Step[] = [
  (c) => envelope(c, "run.status", { phase: "reading", verb_phrase: "Reading PO #4471…" }),
  (c) =>
    envelope(c, "step.log", {
      step_id: `s${c.tick % 4}`,
      status: "done",
      tool: "drive.read",
      summary: "Read it.",
    }),
  (c) => envelope(c, "step.log", { step_id: `s${c.tick % 4}`, status: "failed", error: "locked" }),
  (c) => envelope(c, "message.post", { text: "Working on it." }),
  (c) => envelope(c, "checkpoint", { label: "Halfway", next: "Draft the email" }),
  (c) =>
    envelope(c, "approval.request", {
      approval_id: c.approvalId,
      action: { kind: "email.send", external: true },
      risk: ["external"],
      expires_in: 3600,
      fallback: "deny",
      editable: false,
    }),
  (c) =>
    envelope(c, "approval.resolved", {
      actor: { kind: "person", id: ARJUN },
      approval_id: c.approvalId,
      decision: "approved",
      scope: "once",
      resolved_by: ARJUN,
      resolved_at: c.at(c.tick),
      resolved_elsewhere: false,
    }),
  (c) => envelope(c, "approval.executed", { approval_id: c.approvalId, outcome: "executed" }),
  (c) =>
    envelope(c, "question.ask", {
      ask_id: c.askId,
      questions: [
        {
          question_id: "q1",
          prompt: "Which date?",
          options: [
            { value: "19", label: "19 Sep" },
            { value: "26", label: "26 Sep" },
          ],
          multi_select: false,
          allow_free_text: false,
        },
      ],
      on_no_answer: "use_default",
    }),
  (c) =>
    envelope(c, "question.answered", {
      actor: { kind: "person", id: ARJUN },
      ask_id: c.askId,
      answers: [{ question_id: "q1", values: ["19"] }],
      answered_by: ARJUN,
      answered_at: c.at(c.tick),
      timed_out: false,
    }),
  (c) =>
    envelope(c, "usage", {
      scope: "run",
      model: "opus-5",
      input_tokens: 100,
      output_tokens: 10,
      cost: { usd: 0.5, estimated: true },
    }),
  (c) =>
    envelope(c, "context.usage", { used_tokens: 82_000, limit_tokens: 200_000, model: "opus-5" }),
  (c) => envelope(c, "run.pause", { actor: { kind: "person", id: ARJUN }, by: ARJUN }),
  (c) => envelope(c, "run.resume", { actor: { kind: "person", id: ARJUN }, by: ARJUN }),
  (c) => envelope(c, "run.completed", { summary: "Confirmed." }),
  (c) => envelope(c, "run.failed", { error: "The CRM was locked.", retryable: true }),
  (c) => envelope(c, "run.cancel", { actor: { kind: "person", id: ARJUN }, by: ARJUN }),
  (c) =>
    envelope(c, "artifact.create", {
      artifact_id: c.ids.next("attachment"),
      kind: "document",
      title: "Draft",
      version: 1,
      body: "Hi Dana,",
    }),
  (c) => envelope(c, "handoff", { to: ARJUN, context_summary: "Over to you." }),
  (c) =>
    envelope(c, "membership.added", {
      actor: { kind: "person", id: ARJUN },
      participant_id: SCOUT,
      participant_kind: "harness",
      role: "member",
    }),
  (c) =>
    envelope(c, "membership.removed", {
      actor: { kind: "person", id: ARJUN },
      participant_id: SCOUT,
    }),
  (c) =>
    envelope(c, "space.lock_set", {
      run_id: undefined,
      actor: { kind: "person", id: ARJUN },
      locked: c.tick % 2 === 0,
    }),
  (c) =>
    envelope(c, "space.claimed", {
      run_id: undefined,
      external_key: `${SCOUT}:po-4471`,
      title: "PO-4471 · Northwind",
    }),
  (c) =>
    envelope(c, "person.joined", {
      space_id: undefined,
      run_id: undefined,
      actor: { kind: "person", id: ARJUN },
      participant_id: ARJUN,
      display_name: "Arjun",
      role: "owner",
    }),
  (c) =>
    envelope(c, "role.changed", {
      space_id: undefined,
      run_id: undefined,
      actor: { kind: "person", id: ARJUN },
      participant_id: ARJUN,
      role: "admin",
    }),
  (c) =>
    envelope(c, "person.removed", {
      space_id: undefined,
      run_id: undefined,
      actor: { kind: "person", id: ARJUN },
      participant_id: ARJUN,
      display_name: "Arjun",
      removed_by: ARJUN,
    }),
];

describe("rebuild reproduces the projections", () => {
  it("for any sequence of valid events", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.nat({ max: STEPS.length - 1 }), { minLength: 1, maxLength: 25 }),
        async (indices) => {
          const h = await harness();
          try {
            const context: Context = {
              ids: h.ids,
              at: h.at,
              runId: h.ids.next("run"),
              approvalId: h.ids.next("approval"),
              askId: h.ids.next("question"),
              tick: 0,
            };

            // Every sequence starts with the space and the run, so the events that
            // follow have something to be about. What varies is everything after that.
            // Asked of Scout, so a claim among the steps has a room to take.
            await h.store.append(
              envelope(context, "space.created", {
                actor: { kind: "person", id: ARJUN },
                run_id: undefined,
                kind: "group",
                title: "PO-4471",
                asked_of: SCOUT,
              }),
            );
            await h.store.append(
              envelope(context, "run.started", {
                goal: "Confirm PO #4471",
                plan: [
                  { step_id: "s0", title: "Read" },
                  { step_id: "s1", title: "Check" },
                ],
              }),
            );

            for (const index of indices) {
              const step = STEPS[index];
              if (step !== undefined) await h.store.append(step(context));
            }

            const before = await snapshot(h.db);
            const result = await h.store.rebuild(WS);
            const after = await snapshot(h.db);

            expect(result.replayed).toBe(indices.length + 2);
            expect(after).toEqual(before);
          } finally {
            await h.close();
          }
        },
      ),
      { numRuns: 40 },
    );
  });

  it("is idempotent: rebuilding twice changes nothing", async () => {
    const h = await harness();
    try {
      const context: Context = {
        ids: h.ids,
        at: h.at,
        runId: h.ids.next("run"),
        approvalId: h.ids.next("approval"),
        askId: h.ids.next("question"),
        tick: 0,
      };
      await h.store.append(
        envelope(context, "space.created", {
          actor: { kind: "person", id: ARJUN },
          run_id: undefined,
          kind: "group",
          title: "PO-4471",
        }),
      );
      await h.store.append(envelope(context, "run.started", { goal: "g", plan: [] }));
      for (const step of STEPS) await h.store.append(step(context));

      await h.store.rebuild(WS);
      const once = await snapshot(h.db);
      await h.store.rebuild(WS);
      expect(await snapshot(h.db)).toEqual(once);
    } finally {
      await h.close();
    }
  });
});

/**
 * M0.3's budget is ten thousand events appended and replayed in under two seconds. That number
 * is measured by `pnpm bench:append`, which runs alone and fails the build if it is missed; CI
 * runs it as its own step. Asserting it here as well would be measuring wall-clock time while
 * fifteen other test files compete for the same cores and disk, which is how a flaky test is
 * born. What this test is for is the part that does not depend on the machine: ten thousand
 * events go in, ten thousand and two come back, and nothing falls over on the way. The ceiling
 * is deliberately loose — it catches an order-of-magnitude regression, and leaves the real
 * number to the benchmark.
 */
describe("ten thousand events", () => {
  it("append and replay without losing one", async () => {
    const h = await harness();
    try {
      const context: Context = {
        ids: h.ids,
        at: h.at,
        runId: h.ids.next("run"),
        approvalId: h.ids.next("approval"),
        askId: h.ids.next("question"),
        tick: 0,
      };
      await h.store.append(
        envelope(context, "space.created", {
          actor: { kind: "person", id: ARJUN },
          run_id: undefined,
          kind: "group",
          title: "PO-4471",
        }),
      );
      await h.store.append(envelope(context, "run.started", { goal: "g", plan: [] }));

      const total = 10_000;
      const appendStart = performance.now();
      for (let i = 0; i < total; i += 1) {
        await h.store.append(
          envelope(context, "step.log", {
            step_id: `s${i}`,
            status: "done",
            tool: "drive.read",
            summary: "Read it.",
            duration_ms: 12,
          }),
        );
      }
      const appendMs = performance.now() - appendStart;

      const replayStart = performance.now();
      const result = await h.store.rebuild(WS);
      const replayMs = performance.now() - replayStart;

      expect(result.replayed).toBe(total + 2);
      expect(await h.store.head(WS)).toBe(total + 2);
      expect(appendMs + replayMs).toBeLessThan(20_000);
    } finally {
      await h.close();
    }
  });
});
