/**
 * Agents (30 September 2026, ADR 0087).
 *
 * A harness takes part in rooms as its agents. An agent is a participant, beside people and
 * harnesses, so every read that names somebody — a room's members, a message's author, the
 * directory — finds it where it finds them. Unlike them it has no credential, and its row is the
 * log's: `agent.registered` writes it and `agent.updated` changes it, and a rebuild clears the
 * agents' rows and replays them.
 *
 * - `participants` gains, for an agent, the harness it belongs to, the harness's key for it,
 *   whether it is the harness's lead, what it was forked from and its state. Its owner and
 *   whether it was removed are its harness's, read through `harness_id`, so a handing-on or a
 *   removal needs no second write. The key is unique among one harness's agents.
 * - `runs` gains the agent a run is by. `harness_id` stays the harness's, whose budget it is.
 * - `replacements` is a projection of `membership.replaced`: in a room, which member another
 *   took the place of, so what the harness said there before agents reads as its agent's.
 */

import { type Kysely, sql } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0032-agents";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("participants").addColumn("harness_id", "text").execute();
  await db.schema.alterTable("participants").addColumn("agent_key", "text").execute();
  await db.schema
    .alterTable("participants")
    .addColumn("lead", "integer", (c) => c.notNull().defaultTo(0))
    .execute();
  await db.schema.alterTable("participants").addColumn("forked_from", "text").execute();
  await db.schema.alterTable("participants").addColumn("agent_state", "text").execute();
  await db.schema
    .createIndex("participants_harness_id_agent_key")
    .on("participants")
    .columns(["harness_id", "agent_key"])
    .unique()
    .where(sql.ref("harness_id"), "is not", null)
    .execute();
  await db.schema.alterTable("runs").addColumn("agent_id", "text").execute();
  await db.schema
    .createTable("replacements")
    .addColumn("workspace_id", "text", (c) => c.notNull())
    .addColumn("space_id", "text", (c) => c.notNull())
    .addColumn("from_id", "text", (c) => c.notNull())
    .addColumn("to_id", "text", (c) => c.notNull())
    .addColumn("seq", "integer", (c) => c.notNull())
    .addPrimaryKeyConstraint("replacements_pk", ["space_id", "from_id"])
    .execute();
  await db.schema
    .createIndex("replacements_workspace_id_to_id")
    .on("replacements")
    .columns(["workspace_id", "to_id"])
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("replacements").execute();
  await db.schema.alterTable("runs").dropColumn("agent_id").execute();
  await db.schema.dropIndex("participants_harness_id_agent_key").execute();
  await db.deleteFrom("participants").where("kind", "=", "agent").execute();
  for (const column of ["agent_state", "forked_from", "lead", "agent_key", "harness_id"]) {
    await db.schema.alterTable("participants").dropColumn(column).execute();
  }
}
