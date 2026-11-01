/**
 * M3.1: a lane is one object with two views.
 *
 * The `lanes` table has existed since 0001 so the schema did not have to move when lanes
 * arrived, but nothing wrote it and it carried only the lead-side facts. Phase 3 fills it in:
 * a lane also knows the specialist's run (`run_id`), the lead's run it is a hop of
 * (`lead_run_id`), the specialist's space it lives in (`home_space_id`), the lead spaces it is
 * linked into (`linked_space_ids`), the chain that led to it (`trail`), and the cost rolled up
 * onto it. Adding columns keeps the row a lookup — a lane is found by its id, by the run it is,
 * or by the lead run whose cancellation cascades to it.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0007-lanes";

/**
 * The columns lanes gains, each with why it is here. SQLite adds one column per `ALTER TABLE`,
 * so these are applied one at a time rather than in a single statement.
 */
const COLUMNS = [
  // The specialist's run: what the lane's messages, approvals and usage belong to.
  "run_id",
  // The lead's run this task was a hop of, so cancelling the lead's run finds its lanes.
  "lead_run_id",
  // The specialist's space, where the lane lives as an ordinary thread.
  "home_space_id",
  // The lead spaces it is linked into, as JSON: where the route card appears.
  "linked_space_ids",
  // The chain that led here, as JSON: person, then every lead down to the specialist's.
  "trail",
] as const;

export async function up(db: Db): Promise<void> {
  for (const column of COLUMNS) {
    await db.schema.alterTable("lanes").addColumn(column, "text").execute();
  }
  // The cost rolled up onto the lane, so the lead's panel can total the chain.
  await db.schema.alterTable("lanes").addColumn("cost_usd", "real").execute();

  // Cancelling a lead's run cascades to the lanes it opened.
  await db.schema
    .createIndex("lanes_workspace_id_lead_run_id")
    .on("lanes")
    .columns(["workspace_id", "lead_run_id"])
    .execute();
  // A run event on a lane's run finds the lane it is, to tell the lead its news.
  await db.schema
    .createIndex("lanes_workspace_id_run_id")
    .on("lanes")
    .columns(["workspace_id", "run_id"])
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropIndex("lanes_workspace_id_run_id").execute();
  await db.schema.dropIndex("lanes_workspace_id_lead_run_id").execute();
  for (const column of ["cost_usd", ...COLUMNS]) {
    await db.schema.alterTable("lanes").dropColumn(column).execute();
  }
}
