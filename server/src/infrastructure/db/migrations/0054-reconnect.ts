/**
 * Reconnecting a phone (26 October 2026, ADR 0236).
 *
 * `join_requests` gains `replaces`: the device of the same person a pairing code was made to
 * replace, carried from the code to the request that waits for its maker's Allow, so the old
 * device is signed out when the new one is paired. `null` for every other request.
 *
 * A registry, not a projection: a rebuild does not touch it.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0054-reconnect";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("join_requests").addColumn("replaces", "text").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("join_requests").dropColumn("replaces").execute();
}
