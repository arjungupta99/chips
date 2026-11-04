/**
 * The check a device asking on the Wi-Fi shows (4 November 2026, S-1, ADR 0278).
 *
 * `join_requests` gains `check_commit`, the device's commitment to a nonce, and `check_nonce`, the
 * nonce this server answered it with. The code such a request shows is worked out by both ends
 * from both keys and both nonces once the device sends the nonce it committed to. `null` for
 * every other request, an older phone's ask included.
 *
 * A registry, not a projection: a rebuild does not touch it.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0059-join-check";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("join_requests").addColumn("check_commit", "text").execute();
  await db.schema.alterTable("join_requests").addColumn("check_nonce", "text").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("join_requests").dropColumn("check_nonce").execute();
  await db.schema.alterTable("join_requests").dropColumn("check_commit").execute();
}
