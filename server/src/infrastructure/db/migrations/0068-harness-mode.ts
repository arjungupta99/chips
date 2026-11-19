/**
 * The mode a person picked for a harness's sessions (ADR 0300, 19 November addendum), kept on its
 * everywhere policy row as JSON (`PolicyMode`): null while its sessions run in the mode they start
 * in.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0068-harness-mode";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("harness_policy").addColumn("mode", "text").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("harness_policy").dropColumn("mode").execute();
}
