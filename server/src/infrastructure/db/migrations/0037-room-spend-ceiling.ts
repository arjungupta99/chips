/**
 * What a room allows a job (4 October 2026, ADR 0117).
 *
 * `spaces` gains `spend_ceiling_usd`: the most a room's job may spend, in US dollars, as a person
 * there set it; null when nobody has, so the room follows the default (3). It is the log's: a
 * `space.spend_ceiling_set` writes it, and a rebuild puts it back. No room had one before this.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0037-room-spend-ceiling";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("spaces").addColumn("spend_ceiling_usd", "real").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("spaces").dropColumn("spend_ceiling_usd").execute();
}
