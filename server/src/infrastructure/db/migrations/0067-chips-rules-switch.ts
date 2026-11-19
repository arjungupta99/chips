/**
 * A harness's Chips's rules switch (ADR 0300), kept on its everywhere policy row: 1 on, 0 off,
 * null never set (read as on for a harness with a rule, a hold or a level above L1, or whose
 * workspace has a rule or a hold).
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0067-chips-rules-switch";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("harness_policy").addColumn("chips_rules", "integer").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("harness_policy").dropColumn("chips_rules").execute();
}
