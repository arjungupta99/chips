/**
 * A yes for an hour (6 November 2026, ADR 0239 addendum).
 *
 * `session_rules` gains `until`, when the rule stops, with `space_id` and `participant_id`, the
 * space it holds in and the agent (or harness) whose asks it lets through. Such a row outlives
 * its run: it is read by space and by the asker until its time is up, never as the run's This
 * session. `null` in all three for a This session row, and for every row made before it.
 *
 * A projection: a rebuild fills it from the log.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0060-rules-for-a-while";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("session_rules").addColumn("space_id", "text").execute();
  await db.schema.alterTable("session_rules").addColumn("participant_id", "text").execute();
  await db.schema.alterTable("session_rules").addColumn("until", "text").execute();
  await db.schema
    .createIndex("session_rules_workspace_id_space_id_participant_id")
    .on("session_rules")
    .columns(["workspace_id", "space_id", "participant_id"])
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropIndex("session_rules_workspace_id_space_id_participant_id").execute();
  await db.schema.alterTable("session_rules").dropColumn("until").execute();
  await db.schema.alterTable("session_rules").dropColumn("participant_id").execute();
  await db.schema.alterTable("session_rules").dropColumn("space_id").execute();
}
