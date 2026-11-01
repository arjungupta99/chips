/**
 * An idempotency key is the sender's own.
 *
 * The first index made a key unique per workspace, so two harnesses that both said `hello-1`
 * — the key the app itself suggests to every new harness — collided: the second's message was
 * answered as a duplicate of the first's and never landed. Found by the docs' cold read (M2.6).
 * A key is one credential's promise that a retry changes nothing; it says nothing about anybody
 * else's events, so the index carries the actor.
 */

import { type Kysely, sql } from "kysely";

/** A migration runs against the schema of its own moment, so it must not be tied to today's. */
// biome-ignore lint/suspicious/noExplicitAny: see above.
type Db = Kysely<any>;

export const name = "0006-idempotency-keys-are-the-senders";

export async function up(db: Db): Promise<void> {
  await db.schema.dropIndex("events_idempotency_key").execute();
  await db.schema
    .createIndex("events_idempotency_key")
    .on("events")
    .columns(["workspace_id", "actor_id", "idempotency_key"])
    .unique()
    .where(sql.ref("idempotency_key"), "is not", null)
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropIndex("events_idempotency_key").execute();
  await db.schema
    .createIndex("events_idempotency_key")
    .on("events")
    .columns(["workspace_id", "idempotency_key"])
    .unique()
    .where(sql.ref("idempotency_key"), "is not", null)
    .execute();
}
