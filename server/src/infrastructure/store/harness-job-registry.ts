/** The Kysely adapter for the jobs registry (ADR 0252). */

import type { HarnessJob, JobRun } from "@chipschat/protocol";
import { type Kysely, sql } from "kysely";
import type {
  HarnessJobRegistry,
  JobChange,
  JobRunCounts,
  KeptJob,
} from "../../application/ports/harness-jobs.js";
import type { Database, HarnessJobsTable } from "../db/schema.js";

function parsed<T>(json: string | null): T | null {
  if (json === null) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function toJob(row: HarnessJobsTable): KeptJob | undefined {
  const said = parsed<HarnessJob>(row.said);
  if (said === null) return undefined;
  return {
    workspaceId: row.workspace_id,
    harnessId: row.harness_id,
    said,
    readAt: row.read_at,
    change: parsed<JobChange>(row.change),
  };
}

const runsOf = (rows: readonly { readonly said: string }[]): JobRun[] =>
  rows.flatMap((row) => parsed<JobRun>(row.said) ?? []);

export function createHarnessJobRegistry(db: Kysely<Database>): HarnessJobRegistry {
  const rows = (workspaceId: string, harnessId: string) =>
    db
      .selectFrom("harness_jobs")
      .selectAll()
      .where("workspace_id", "=", workspaceId)
      .where("harness_id", "=", harnessId)
      .orderBy("position")
      .execute();

  return {
    async put({ workspaceId, harnessId, jobs, readAt }) {
      await db.transaction().execute(async (tx) => {
        const kept = jobs.map((job) => job.job_id);
        const gone = tx
          .deleteFrom("harness_jobs")
          .where("workspace_id", "=", workspaceId)
          .where("harness_id", "=", harnessId);
        const goneRuns = tx
          .deleteFrom("harness_job_runs")
          .where("workspace_id", "=", workspaceId)
          .where("harness_id", "=", harnessId);
        if (kept.length === 0) {
          await gone.execute();
          await goneRuns.execute();
        } else {
          await gone.where("job_id", "not in", kept).execute();
          await goneRuns.where("job_id", "not in", kept).execute();
        }
        for (const [position, job] of jobs.entries()) {
          const columns = { position, said: JSON.stringify(job), read_at: readAt };
          await tx
            .insertInto("harness_jobs")
            .values({
              workspace_id: workspaceId,
              harness_id: harnessId,
              job_id: job.job_id,
              ...columns,
            })
            .onConflict((conflict) =>
              conflict.columns(["workspace_id", "harness_id", "job_id"]).doUpdateSet(columns),
            )
            .execute();
        }
      });
    },

    async list(workspaceId, harnessId) {
      return (await rows(workspaceId, harnessId)).flatMap((row) => toJob(row) ?? []);
    },

    async ask(workspaceId, harnessId, jobId, change) {
      await db
        .updateTable("harness_jobs")
        .set({ change: JSON.stringify(change) })
        .where("workspace_id", "=", workspaceId)
        .where("harness_id", "=", harnessId)
        .where("job_id", "=", jobId)
        .execute();
    },

    // One process writes the database, so reading the change and writing it back is not raced.
    async answer({ workspaceId, harnessId, changeId, state, message, at }) {
      for (const row of await rows(workspaceId, harnessId)) {
        const change = parsed<JobChange>(row.change);
        if (change?.id !== changeId) continue;
        if (change.state !== "waiting") return false;
        await db
          .updateTable("harness_jobs")
          .set({ change: JSON.stringify({ ...change, state, message, answeredAt: at }) })
          .where("workspace_id", "=", workspaceId)
          .where("harness_id", "=", harnessId)
          .where("job_id", "=", row.job_id)
          .execute();
        return true;
      }
      return false;
    },

    async addRuns(workspaceId, harnessId, runs) {
      await db.transaction().execute(async (tx) => {
        for (const sent of runs) {
          // A run sent again says more of it, or as much: what it leaves out stays as it was, so a
          // harness that can't price it the second time doesn't take its cost away.
          const before = await tx
            .selectFrom("harness_job_runs")
            .select("said")
            .where("workspace_id", "=", workspaceId)
            .where("harness_id", "=", harnessId)
            .where("job_id", "=", sent.job_id)
            .where("run_id", "=", sent.run_id)
            .executeTakeFirst();
          const run = { ...parsed<JobRun>(before?.said ?? null), ...sent };
          const columns = {
            started_at: run.started_at,
            cost_usd: run.cost_usd ?? null,
            said: JSON.stringify(run),
          };
          await tx
            .insertInto("harness_job_runs")
            .values({
              workspace_id: workspaceId,
              harness_id: harnessId,
              job_id: run.job_id,
              run_id: run.run_id,
              ...columns,
            })
            .onConflict((conflict) =>
              conflict
                .columns(["workspace_id", "harness_id", "job_id", "run_id"])
                .doUpdateSet(columns),
            )
            .execute();
        }
      });
    },

    async runs(workspaceId, harnessId, jobId, { since, before, limit }) {
      let query = db
        .selectFrom("harness_job_runs")
        .select("said")
        .where("workspace_id", "=", workspaceId)
        .where("harness_id", "=", harnessId)
        .where("job_id", "=", jobId);
      if (since !== undefined) query = query.where("started_at", ">=", since);
      if (before !== undefined) query = query.where("started_at", "<", before);
      const found = await query
        .orderBy("started_at", "desc")
        .orderBy("run_id", "desc")
        .limit(limit + 1)
        .execute();
      return { runs: runsOf(found.slice(0, limit)), more: found.length > limit };
    },

    async counts(workspaceId, harnessId, since) {
      const totals = await db
        .selectFrom("harness_job_runs")
        .select(({ fn }) => [
          "job_id",
          fn.countAll<number>().as("total"),
          sql<number>`sum(case when started_at >= ${since} then 1 else 0 end)`.as("since_runs"),
          sql<number | null>`sum(case when started_at >= ${since} then cost_usd end)`.as(
            "since_usd",
          ),
          fn.max("started_at").as("last_at"),
        ])
        .where("workspace_id", "=", workspaceId)
        .where("harness_id", "=", harnessId)
        .groupBy("job_id")
        .execute();
      const counts = new Map<string, JobRunCounts>();
      for (const row of totals) {
        const last = await db
          .selectFrom("harness_job_runs")
          .select("said")
          .where("workspace_id", "=", workspaceId)
          .where("harness_id", "=", harnessId)
          .where("job_id", "=", row.job_id)
          .where("started_at", "=", String(row.last_at))
          .orderBy("run_id", "desc")
          .limit(1)
          .execute();
        counts.set(row.job_id, {
          sinceUsd: row.since_usd === null ? null : Math.round(Number(row.since_usd) * 1e6) / 1e6,
          sinceRuns: Number(row.since_runs ?? 0),
          total: Number(row.total),
          last: runsOf(last)[0],
        });
      }
      return counts;
    },

    async prune(workspaceId, harnessId, before) {
      await db
        .deleteFrom("harness_job_runs")
        .where("workspace_id", "=", workspaceId)
        .where("harness_id", "=", harnessId)
        .where("started_at", "<", before)
        .execute();
    },

    async removeHarness(workspaceId, harnessId) {
      await db
        .deleteFrom("harness_job_runs")
        .where("workspace_id", "=", workspaceId)
        .where("harness_id", "=", harnessId)
        .execute();
      await db
        .deleteFrom("harness_jobs")
        .where("workspace_id", "=", workspaceId)
        .where("harness_id", "=", harnessId)
        .execute();
    },
  };
}
