/**
 * M1.4: the split ADR 0019 asked for. A harness's policy — its autonomy, rules, budget and spend —
 * leaves the `participants` row and becomes a projection of `policy.updated` and `usage`; the
 * workspace cap leaves `workspaces` the same way. Two tables for those, and a third for the
 * decisions made "for this session".
 */

import type { Kysely } from "kysely";

/** A migration runs against the schema of its own moment, so it must not be tied to today's. */
// biome-ignore lint/suspicious/noExplicitAny: see above.
type Db = Kysely<any>;

export const name = "0003-policy-is-a-projection";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("harness_policy")
    .addColumn("workspace_id", "text", (c) => c.notNull())
    .addColumn("harness_id", "text", (c) => c.notNull())
    .addColumn("space_id", "text", (c) => c.notNull().defaultTo("*"))
    .addColumn("autonomy", "integer", (c) => c.notNull())
    .addColumn("rules", "text", (c) => c.notNull().defaultTo("[]"))
    .addColumn("budget_usd", "real")
    .addColumn("spent_usd", "real", (c) => c.notNull().defaultTo(0))
    .addColumn("updated_at", "text", (c) => c.notNull())
    .addColumn("updated_seq", "integer", (c) => c.notNull())
    .addPrimaryKeyConstraint("harness_policy_pk", ["harness_id", "space_id"])
    .execute();
  // The policy engine's lookup: a harness's rows, everywhere and in one room.
  await db.schema
    .createIndex("harness_policy_workspace_id_harness_id")
    .on("harness_policy")
    .columns(["workspace_id", "harness_id"])
    .execute();

  await db.schema
    .createTable("workspace_policy")
    .addColumn("workspace_id", "text", (c) => c.primaryKey())
    .addColumn("max_autonomy", "integer", (c) => c.notNull())
    .addColumn("rules", "text", (c) => c.notNull().defaultTo("[]"))
    .addColumn("updated_at", "text", (c) => c.notNull())
    .addColumn("updated_seq", "integer", (c) => c.notNull())
    .execute();

  await db.schema
    .createTable("session_rules")
    .addColumn("workspace_id", "text", (c) => c.notNull())
    .addColumn("run_id", "text", (c) => c.notNull())
    .addColumn("approval_id", "text", (c) => c.notNull())
    .addColumn("match", "text", (c) => c.notNull())
    .addColumn("external", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("irreversible", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("decision", "text", (c) => c.notNull())
    .addColumn("decided_at", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("session_rules_pk", ["run_id", "approval_id"])
    .execute();
  // The engine's lookup: every rule decided in one run.
  await db.schema
    .createIndex("session_rules_workspace_id_run_id")
    .on("session_rules")
    .columns(["workspace_id", "run_id"])
    .execute();

  // The identity half stays; the policy half is a projection now.
  for (const column of ["autonomy", "budget_usd", "spent_usd"]) {
    await db.schema.alterTable("participants").dropColumn(column).execute();
  }
  await db.schema.alterTable("workspaces").dropColumn("max_autonomy").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema
    .alterTable("workspaces")
    .addColumn("max_autonomy", "integer", (c) => c.notNull().defaultTo(2))
    .execute();
  await db.schema.alterTable("participants").addColumn("autonomy", "integer").execute();
  await db.schema.alterTable("participants").addColumn("budget_usd", "real").execute();
  await db.schema.alterTable("participants").addColumn("spent_usd", "real").execute();
  for (const table of ["session_rules", "workspace_policy", "harness_policy"]) {
    await db.schema.dropTable(table).ifExists().execute();
  }
}
