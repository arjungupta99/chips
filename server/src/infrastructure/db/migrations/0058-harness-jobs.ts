/**
 * A harness's own jobs (31 October 2026, ADR 0252): the copy a harness sends of the jobs it runs by
 * itself, one row per job with the last change a person asked of it, and each job's runs.
 *
 * Registry tables, as agent heartbeats are (ADR 0143): the copy is read and written whole as the
 * harness sends it, and a run is kept as the harness last posted it, for `JOB_RUNS_KEPT_DAYS`.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0058-harness-jobs";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("harness_jobs")
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("harness_id", "text", (c) => c.notNull())
    .addColumn("job_id", "text", (c) => c.notNull())
    .addColumn("position", "integer", (c) => c.notNull())
    .addColumn("said", "text", (c) => c.notNull())
    .addColumn("read_at", "text", (c) => c.notNull())
    .addColumn("change", "text")
    .addPrimaryKeyConstraint("harness_jobs_pk", ["workspace_id", "harness_id", "job_id"])
    .execute();
  await db.schema
    .createTable("harness_job_runs")
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("harness_id", "text", (c) => c.notNull())
    .addColumn("job_id", "text", (c) => c.notNull())
    .addColumn("run_id", "text", (c) => c.notNull())
    .addColumn("started_at", "text", (c) => c.notNull())
    .addColumn("cost_usd", "real")
    .addColumn("said", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("harness_job_runs_pk", [
      "workspace_id",
      "harness_id",
      "job_id",
      "run_id",
    ])
    .execute();
  // A job's runs are read newest first, and a week of them counted.
  await db.schema
    .createIndex("harness_job_runs_job_started_at")
    .on("harness_job_runs")
    .columns(["workspace_id", "harness_id", "job_id", "started_at"])
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("harness_job_runs").execute();
  await db.schema.dropTable("harness_jobs").execute();
}
