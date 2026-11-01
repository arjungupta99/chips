/**
 * Agent models (8 October 2026, ADR 0140): the copy a harness sends of each agent's model and
 * effort, and the last change a person asked of it on its way to the harness.
 *
 * A registry table, as context files are (ADR 0134): a change is never sent to a harness twice,
 * and nobody needs its history. One row per agent: the copy is read and written whole, as the
 * harness sends it, and only the last change is kept beside it, so there is no second table.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0041-agent-models";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("agent_models")
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("agent_id", "text", (c) => c.notNull())
    .addColumn("harness_id", "text", (c) => c.notNull())
    .addColumn("said", "text", (c) => c.notNull())
    .addColumn("read_at", "text", (c) => c.notNull())
    .addColumn("change", "text")
    .addPrimaryKeyConstraint("agent_models_pk", ["workspace_id", "agent_id"])
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("agent_models").execute();
}
