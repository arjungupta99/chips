/**
 * Agent heartbeats (9 October 2026, ADR 0143): the copy a harness sends of each agent's
 * heartbeat, and the last change a person asked of it on its way to the harness.
 *
 * A registry table, as agent models are (ADR 0140): one row per agent, the copy read and written
 * whole as the harness sends it, and only the last change kept beside it.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0042-agent-heartbeats";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("agent_heartbeats")
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("agent_id", "text", (c) => c.notNull())
    .addColumn("harness_id", "text", (c) => c.notNull())
    .addColumn("said", "text", (c) => c.notNull())
    .addColumn("read_at", "text", (c) => c.notNull())
    .addColumn("change", "text")
    .addPrimaryKeyConstraint("agent_heartbeats_pk", ["workspace_id", "agent_id"])
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("agent_heartbeats").execute();
}
