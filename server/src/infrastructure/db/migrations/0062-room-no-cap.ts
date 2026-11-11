/**
 * A room with no cap (10 November 2026, ADR 0292).
 *
 * `spaces` gains `spend_uncapped`: 1 while the workspace's owner has taken the room's cap off, so
 * that Chips holds no job there for what it spends; `spend_ceiling_usd` is null meanwhile. A room
 * starts capped.
 *
 * `spaces` is a projection, so a rebuild fills it from the log: a `space.spend_ceiling_lifted`
 * sets it, and a `space.spend_ceiling_set` clears it. There is nothing to backfill: no room could
 * have no cap before this build, whose schema is the first to have the event.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0062-room-no-cap";

export async function up(db: Db): Promise<void> {
  await db.schema
    .alterTable("spaces")
    .addColumn("spend_uncapped", "integer", (column) => column.notNull().defaultTo(0))
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("spaces").dropColumn("spend_uncapped").execute();
}
