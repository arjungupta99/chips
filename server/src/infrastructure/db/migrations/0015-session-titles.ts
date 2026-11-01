/**
 * ADR 0040: what a visit is called.
 *
 * One nullable column. A harness that names its sessions says so with `session.renamed`, and
 * the projection updates this and nothing else — deliberately not the upsert `session.started`
 * uses, so a rename can never revive a visit that has ended or move when it began. Null is the
 * ordinary case: a visit with no name is shown by where it is running instead.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0015-session-titles";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("sessions").addColumn("title", "text").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("sessions").dropColumn("title").execute();
}
