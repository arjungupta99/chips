/**
 * Who a message is for (27 September 2026, ADR 0081).
 *
 * Chips decides at ingest which harnesses a `message.post` is for and writes it on the event as
 * `addressed_to`, with `held` when the guard stopped harnesses talking to each other. The row
 * keeps both, so the capsule's default and the room's routes read them without walking the log:
 * `addressed_to` is a JSON array of harness ids, `held` is 1 or null.
 *
 * `messages` is a projection, so a rebuild fills it from the log. There is nothing to backfill: no
 * `message.post` could carry `addressed_to` before this build, whose schema is the first to have
 * it, and a message without it was for every harness in its space.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0030-message-address";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("messages").addColumn("addressed_to", "text").execute();
  await db.schema.alterTable("messages").addColumn("held", "integer").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("messages").dropColumn("held").execute();
  await db.schema.alterTable("messages").dropColumn("addressed_to").execute();
}
