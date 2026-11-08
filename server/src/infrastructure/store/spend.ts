/**
 * What a room's job has spent, and what the room allows a job (ADR 0117), read from the log and
 * the spaces projection.
 *
 * A job begins at the later of the last thing a person did in the room (`lastPersonAct`, where
 * the referee counts from too) and the last brief handed into it (a lane's run requested there).
 * Its spend is what the room's `usage` reports said after that point, every harness's together.
 * A run's own report is its total so far, so a run that reported before the job began counts only
 * what it added since; a step's or a lane's report adds to its run, as the projection has it. A
 * run whose reports in the job said no cost, and none did, counts nothing and is told apart.
 *
 * As of a seq, so a message delivered again is handed the same spend it was the first time.
 *
 * The room's history job by job (ADR 0282) is the same count, walked once from the room's
 * beginning: each report goes to the job that was running when it came, and a job Chips held at
 * the ceiling says so.
 */

import { type JobStart, PERSON_ACTS, SPENT_JOBS_SHOWN, type SpentJob } from "@chipschat/protocol";
import { type Kysely, sql } from "kysely";
import type { JobSpendView, SpendHistoryView } from "../../application/ports/index.js";
import type { Database } from "../db/schema.js";
import { lastPersonAct } from "./exchange.js";

/** A `usage` report as the job counts it. */
interface Report {
  readonly run_id: string | null;
  readonly scope: string | null;
  readonly usd: number | null;
}

/** A report with where and when it came, and whose run said it, for the history. */
interface Dated extends Report {
  readonly seq: number;
  readonly ts: string;
  readonly actor_id: string;
}

/** Where a job began: a person's act, or a brief handed in. */
interface Start {
  readonly seq: number;
  readonly ts: string;
  readonly actor_id: string;
  readonly type: string;
  readonly actor_kind: string;
}

/** A job as the history adds it up. */
interface Adding {
  readonly since_seq: number;
  started_at: string;
  last_at: string;
  spent: number;
  readonly runs: string[];
  readonly by: string[];
  readonly costed: Set<string>;
  readonly silent: Set<string>;
}

const ANSWERS: ReadonlySet<string> = new Set([
  "approval.resolved",
  "approval.routed",
  "question.answered",
]);

/** What a start was, in the words a device says it with. */
function actOf(start: Start): JobStart {
  if (start.actor_kind !== "person") return "brief";
  if (start.type === "message.post") return "message";
  if (start.type === "exchange.set") return "carry_on";
  return ANSWERS.has(start.type) ? "answer" : "act";
}

export function createSpendReads(db: Kysely<Database>) {
  /** The newest brief handed into the room, up to `upto`: a lane's run requested there. */
  async function lastBrief(
    workspaceId: string,
    spaceId: string,
    upto: number,
  ): Promise<number | undefined> {
    const row = await db
      .selectFrom("events")
      .select("seq")
      .where("workspace_id", "=", workspaceId)
      .where("space_id", "=", spaceId)
      .where("seq", "<=", upto)
      .where("type", "=", "run.requested")
      .where(sql<string | null>`json_extract(payload, '$.lane_id')`, "is not", null)
      .orderBy("seq", "desc")
      .limit(1)
      .executeTakeFirst();
    return row?.seq;
  }

  /** The room's `usage` reports after `since`, up to `upto`, oldest first. */
  async function reportsIn(
    workspaceId: string,
    spaceId: string,
    since: number,
    upto: number,
  ): Promise<Report[]> {
    return await db
      .selectFrom("events")
      .select([
        "run_id",
        sql<string | null>`json_extract(payload, '$.scope')`.as("scope"),
        sql<number | null>`json_extract(payload, '$.cost.usd')`.as("usd"),
      ])
      .where("workspace_id", "=", workspaceId)
      .where("space_id", "=", spaceId)
      .where("type", "=", "usage")
      .where("seq", ">", since)
      .where("seq", "<=", upto)
      .orderBy("seq", "asc")
      .execute();
  }

  /** What each of these runs had reported costing in all, by `since`: where the job takes over. */
  async function reportedBy(
    workspaceId: string,
    runIds: readonly string[],
    since: number,
  ): Promise<Map<string, number>> {
    const before = new Map<string, number>();
    if (runIds.length === 0 || since === 0) return before;
    const rows = await db
      .selectFrom("events")
      .select([
        "run_id",
        sql<string | null>`json_extract(payload, '$.scope')`.as("scope"),
        sql<number | null>`json_extract(payload, '$.cost.usd')`.as("usd"),
      ])
      .where("workspace_id", "=", workspaceId)
      .where("run_id", "in", [...runIds])
      .where("type", "=", "usage")
      .where("seq", "<=", since)
      .orderBy("seq", "asc")
      .execute();
    for (const row of rows) count(before, row);
    return before;
  }

  return {
    async spendCeilingOf(workspaceId: string, spaceId: string): Promise<number | undefined> {
      const row = await db
        .selectFrom("spaces")
        .select("spend_ceiling_usd")
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", spaceId)
        .executeTakeFirst();
      return row?.spend_ceiling_usd ?? undefined;
    },

    async jobSpendOf(
      workspaceId: string,
      spaceId: string,
      options: { readonly uptoSeq?: number } = {},
    ): Promise<JobSpendView> {
      const upto = options.uptoSeq ?? Number.MAX_SAFE_INTEGER;
      const [person, brief] = await Promise.all([
        lastPersonAct(db, workspaceId, spaceId, upto),
        lastBrief(workspaceId, spaceId, upto),
      ]);
      const since = Math.max(person?.seq ?? 0, brief ?? 0);
      const reports = await reportsIn(workspaceId, spaceId, since, upto);
      const runs = [
        ...new Set(reports.flatMap((report) => (report.run_id === null ? [] : [report.run_id]))),
      ];
      const totals = await reportedBy(workspaceId, runs, since);
      let spent = 0;
      const costed = new Set<string>();
      const silent = new Set<string>();
      for (const report of reports) {
        const run = report.run_id ?? "";
        if (report.usd === null) {
          silent.add(run);
          continue;
        }
        costed.add(run);
        spent += count(totals, report);
      }
      const uncounted = [...silent].filter((run) => !costed.has(run)).length;
      return {
        spent_usd: Math.max(0, Math.round(spent * 1e6) / 1e6),
        since_seq: since,
        uncounted_runs: uncounted,
      };
    },

    async spendHistoryOf(workspaceId: string, spaceId: string): Promise<SpendHistoryView> {
      const [starts, reports, held] = await Promise.all([
        startsIn(workspaceId, spaceId),
        datedReportsIn(workspaceId, spaceId),
        heldJobsIn(workspaceId, spaceId),
      ]);
      const jobs = addUp(starts, reports);
      const last = starts.at(-1);
      const now = last?.seq ?? 0;
      const total = jobs.reduce((sum, job) => sum + job.spent, 0);
      return {
        started:
          last === undefined
            ? undefined
            : {
                at: last.ts,
                ...(last.actor_kind === "person" ? { by: last.actor_id } : {}),
                act: actOf(last),
              },
        jobs: jobs
          .filter((job) => job.since_seq !== now)
          .map((job) => spentJob(job, held))
          .filter((job) => job.spent_usd > 0 || job.uncounted_runs > 0)
          .reverse()
          .slice(0, SPENT_JOBS_SHOWN),
        total_usd: usd(total),
      };
    },
  };

  /** Every point a job began in the room, oldest first: a person's act or a brief handed in. */
  async function startsIn(workspaceId: string, spaceId: string): Promise<Start[]> {
    return await db
      .selectFrom("events")
      .select(["seq", "ts", "actor_id", "actor_kind", "type"])
      .where("workspace_id", "=", workspaceId)
      .where("space_id", "=", spaceId)
      .where((eb) =>
        eb.or([
          eb.and([
            eb("actor_kind", "=", "person"),
            eb.or([
              eb("type", "in", [...PERSON_ACTS]),
              eb.and([
                eb("type", "=", "exchange.set"),
                eb(sql<string>`json_extract(payload, '$.state')`, "=", "going"),
              ]),
            ]),
          ]),
          eb.and([
            eb("type", "=", "run.requested"),
            eb(sql<string | null>`json_extract(payload, '$.lane_id')`, "is not", null),
          ]),
        ]),
      )
      .orderBy("seq", "asc")
      .execute();
  }

  /** Every `usage` report in the room, oldest first, with when it came and whose it was. */
  async function datedReportsIn(workspaceId: string, spaceId: string): Promise<Dated[]> {
    return await db
      .selectFrom("events")
      .select([
        "seq",
        "ts",
        "run_id",
        "actor_id",
        sql<string | null>`json_extract(payload, '$.scope')`.as("scope"),
        sql<number | null>`json_extract(payload, '$.cost.usd')`.as("usd"),
      ])
      .where("workspace_id", "=", workspaceId)
      .where("space_id", "=", spaceId)
      .where("type", "=", "usage")
      .orderBy("seq", "asc")
      .execute();
  }

  /** The jobs Chips held the agents in at the room's ceiling, by where each began (ADR 0118). */
  async function heldJobsIn(workspaceId: string, spaceId: string): Promise<Set<number>> {
    const rows = await db
      .selectFrom("events")
      .select(sql<number | null>`json_extract(payload, '$.spend.since_seq')`.as("since"))
      .where("workspace_id", "=", workspaceId)
      .where("space_id", "=", spaceId)
      .where("type", "=", "exchange.set")
      .where("actor_kind", "=", "system")
      .where(sql<string>`json_extract(payload, '$.why')`, "=", "spend")
      .execute();
    return new Set(rows.flatMap((row) => (row.since === null ? [] : [row.since])));
  }
}

/**
 * The room's reports, each counted into the job running when it came: the newest start before
 * it, or the room's beginning. One count of each run's total for the whole walk, so a run that
 * spans jobs adds to each what it reported in it, as `jobSpendOf` counts the present one.
 */
function addUp(starts: readonly Start[], reports: readonly Dated[]): Adding[] {
  const jobs: Adding[] = [];
  const totals = new Map<string, number>();
  let at = -1;
  for (const report of reports) {
    while (at + 1 < starts.length && (starts[at + 1]?.seq ?? 0) < report.seq) at += 1;
    const start = starts[at];
    const since = start?.seq ?? 0;
    let job = jobs.at(-1);
    if (job === undefined || job.since_seq !== since) {
      job = {
        since_seq: since,
        started_at: start?.ts ?? report.ts,
        last_at: report.ts,
        spent: 0,
        runs: [],
        by: [],
        costed: new Set(),
        silent: new Set(),
      };
      jobs.push(job);
    }
    addTo(job, report, totals);
  }
  return jobs;
}

function addTo(job: Adding, report: Dated, totals: Map<string, number>): void {
  const run = report.run_id ?? "";
  if (report.run_id !== null && !job.runs.includes(report.run_id)) job.runs.push(report.run_id);
  if (!job.by.includes(report.actor_id)) job.by.push(report.actor_id);
  if (report.usd === null) {
    job.silent.add(run);
    return;
  }
  job.costed.add(run);
  job.spent += count(totals, report);
  job.last_at = report.ts;
}

function spentJob(job: Adding, held: ReadonlySet<number>): SpentJob {
  return {
    since_seq: job.since_seq,
    started_at: job.started_at,
    last_at: job.last_at,
    spent_usd: usd(job.spent),
    uncounted_runs: [...job.silent].filter((run) => !job.costed.has(run)).length,
    run_ids: job.runs,
    by: job.by,
    held: held.has(job.since_seq),
  };
}

/** An amount to the millionth of a dollar, never below nought. */
function usd(amount: number): number {
  return Math.max(0, Math.round(amount * 1e6) / 1e6);
}

/**
 * Count one report into a run's total so far, and say by how much it grew: a run's own report is
 * the total and replaces it, a step's or a lane's adds to it. A report with no cost changes
 * nothing.
 */
function count(totals: Map<string, number>, report: Report): number {
  if (report.usd === null) return 0;
  const run = report.run_id ?? "";
  const was = totals.get(run) ?? 0;
  const now = report.scope === "run" ? report.usd : was + report.usd;
  totals.set(run, now);
  return now - was;
}
