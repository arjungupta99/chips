/**
 * A message for everyone (28 September 2026, ADR 0081).
 *
 * `addressed_to` lists the harnesses a message was for when it arrived. A person who sent to
 * Everyone meant every harness in the room, not those it held then, so their next message that
 * names nobody reaches one added since as well. The row keeps which it was: `addressed_to_all`
 * is 1 when Chips filled in `addressed_to_all` on the event, else null.
 *
 * `messages` is a projection, so a rebuild fills it from the log. Nothing is backfilled: a
 * message from 0030's build says only which harnesses it was for, and is read as it was then.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0031-message-for-everyone";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("messages").addColumn("addressed_to_all", "integer").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("messages").dropColumn("addressed_to_all").execute();
}
