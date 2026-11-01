/**
 * Sealed pushes (13 October 2026, ADR 0158): `push_tokens` gains `seal_key`, the 32-byte key a
 * phone made when it registered, base64. An agent's @ of a person is pushed with its words
 * sealed to it, and only that phone's notification extension opens them. Null for a phone that
 * sent none: an older app, or Android, which gets the fixed words.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0046-push-seal-key";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("push_tokens").addColumn("seal_key", "text").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("push_tokens").dropColumn("seal_key").execute();
}
