/**
 * The append and replay benchmark (technical-plan 6.2: "`server/bench` holds reproducible
 * benchmarks. Optimizations cite a benchmark in the commit.").
 *
 *   pnpm bench:append [count] [--report-only]
 *
 * It writes `count` events into a fresh database in a temporary directory, one transaction per
 * event, then rebuilds the projections from zero. M0.3's budget is ten thousand events appended
 * and replayed in under two seconds on a laptop.
 *
 * With `--report-only` a missed budget is printed and does not fail. CI passes it: the
 * budget is a laptop's, and a GitHub runner takes about three times as long for the same code
 * (5.0 s and 7.2 s on 13 September 2026, against 1.6 s on an M4), as the Phase 0 review's
 * finding 13 predicted. A CI baseline to fail against is M6.5's.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createIdGenerator } from "@chipschat/protocol";
import type { IncomingEvent } from "../src/application/ports/index.js";
import { openDatabase } from "../src/infrastructure/db/connection.js";
import { migrateToLatest } from "../src/infrastructure/db/migrator.js";
import { createSqliteEventStore } from "../src/infrastructure/store/sqlite-event-store.js";

const WS = "ws_01K4ZQPX000000000000000001";
const CONV = "spc_01K4ZQPX000000000000000002";
const ARJUN = "usr_01K4ZQPX000000000000000003";
const SCOUT = "hrn_01K4ZQPX000000000000000004";

const args = process.argv.slice(2);
const reportOnly = args.includes("--report-only");
const count = Number.parseInt(args.find((arg) => !arg.startsWith("--")) ?? "10000", 10);
/** M0.3's budget, scaled to whatever `count` is asked for. Exceeding it exits non-zero. */
const budgetMs = (2000 * count) / 10_000;

const directory = mkdtempSync(join(tmpdir(), "chips-bench-"));
const connection = openDatabase({ databaseUrl: `sqlite:${join(directory, "chips.db")}` });

try {
  await migrateToLatest(connection.db, () => "2026-09-02T00:00:00.000Z");

  const ids = createIdGenerator({
    now: () => 1_756_800_000_000,
    randomFill: (bytes) => bytes.fill(1),
  });
  let tick = 0;
  const at = () => new Date(1_756_800_000_000 + tick++).toISOString();
  const store = createSqliteEventStore({ db: connection.db, now: at });

  await connection.db
    .insertInto("workspaces")
    .values({ id: WS, name: "Bench", created_at: at() })
    .execute();

  const runId = ids.next("run");
  const envelope = (type: string, extra: Record<string, unknown>): IncomingEvent =>
    ({
      v: 1,
      type,
      id: ids.next("event"),
      ts: at(),
      workspace_id: WS,
      space_id: CONV,
      run_id: runId,
      actor: { kind: "harness", id: SCOUT },
      ...extra,
    }) as IncomingEvent;

  await store.append(
    envelope("space.created", {
      actor: { kind: "person", id: ARJUN },
      run_id: undefined,
      kind: "group",
      title: "Bench",
    }),
  );
  await store.append(envelope("run.started", { goal: "Bench", plan: [] }));

  const appendStart = performance.now();
  for (let i = 0; i < count; i += 1) {
    await store.append(
      envelope("step.log", {
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
  const { replayed } = await store.rebuild(WS);
  const replayMs = performance.now() - replayStart;

  const per = (ms: number) => `${((ms * 1000) / count).toFixed(1)} µs/event`;
  console.log(`events        ${count.toLocaleString()}`);
  console.log(`append        ${appendMs.toFixed(0)} ms   (${per(appendMs)})`);
  console.log(`replay        ${replayMs.toFixed(0)} ms   (${per(replayMs)})`);
  console.log(`total         ${(appendMs + replayMs).toFixed(0)} ms`);
  console.log(`replayed      ${replayed.toLocaleString()} events`);
  console.log(`budget        ${budgetMs.toFixed(0)} ms (technical-plan M0.3: 2,000 ms for 10,000)`);

  if (appendMs + replayMs > budgetMs) {
    const over = `Over budget by ${(appendMs + replayMs - budgetMs).toFixed(0)} ms`;
    if (reportOnly) {
      console.log(`\n${over}: reported, not enforced (--report-only).`);
    } else {
      console.error(`\n${over}.`);
      process.exitCode = 1;
    }
  }
} finally {
  await connection.close();
  rmSync(directory, { recursive: true, force: true });
}
