/**
 * M1.3: the cost meter estimates from a per-workspace price table (technical-plan M1.3). The
 * table is JSON on the workspace row, or null for the default in `domain/pricing.ts`.
 */

import type { Kysely } from "kysely";

/** A migration runs against the schema of its own moment, so it must not be tied to today's. */
// biome-ignore lint/suspicious/noExplicitAny: see above.
type Db = Kysely<any>;

export const name = "0002-workspace-price-table";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("workspaces").addColumn("price_table", "text").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("workspaces").dropColumn("price_table").execute();
}
