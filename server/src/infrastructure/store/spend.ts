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
 */

import { type Kysely, sql } from "kysely";
import type { JobSpendView } from "../../application/ports/index.js";
import type { Database } from "../db/schema.js";
import { lastPersonAct } from "./exchange.js";

/** A `usage` report as the job counts it. */
interface Report {
  readonly run_id: string | null;
  readonly scope: string | null;
  readonly usd: number | null;
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
  };
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
