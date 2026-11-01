/**
 * Agent context windows (9 October 2026, ADR 0146): the copy a harness sends of each agent's
 * context window, the last limit a person asked of it, and the last Compact now, each on its way
 * to the harness.
 *
 * A registry table, as agent models and heartbeats are (ADRs 0140, 0143): one row per agent, the
 * copy read and written whole as the harness sends it, and only the last of each ask kept beside it.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0043-agent-context-windows";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("agent_context_windows")
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("agent_id", "text", (c) => c.notNull())
    .addColumn("harness_id", "text", (c) => c.notNull())
    .addColumn("said", "text", (c) => c.notNull())
    .addColumn("read_at", "text", (c) => c.notNull())
    .addColumn("change", "text")
    .addColumn("compaction", "text")
    .addPrimaryKeyConstraint("agent_context_windows_pk", ["workspace_id", "agent_id"])
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("agent_context_windows").execute();
}
