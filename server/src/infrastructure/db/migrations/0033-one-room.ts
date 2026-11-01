/**
 * One room per agent (30 September 2026, ADR 0087 and its addendum of that day).
 *
 * - `held_messages` is a projection of `message.held`: what an agent said while in no room, kept
 *   until it is attached and posted there. The post that carries it removes its row.
 * - `participants` gains, for an agent, `released_from`: the room an archive took it out of, while
 *   it is free, so an unarchive brings it back; and `last_space_id`, the room it was last in, for
 *   a harness that posts as itself into the room its agent left.
 * - `spaces` gains `also_asked_of`: the other harnesses a person asked from the +, as JSON.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0033-one-room";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("held_messages")
    .addColumn("event_id", "text", (c) => c.primaryKey())
    .addColumn("workspace_id", "text", (c) => c.notNull())
    .addColumn("agent_id", "text", (c) => c.notNull())
    .addColumn("seq", "integer", (c) => c.notNull())
    .addColumn("said_at", "text", (c) => c.notNull())
    .addColumn("text", "text", (c) => c.notNull())
    .addColumn("attachments", "text")
    .execute();
  await db.schema
    .createIndex("held_messages_workspace_id_agent_id_seq")
    .on("held_messages")
    .columns(["workspace_id", "agent_id", "seq"])
    .execute();
  await db.schema.alterTable("participants").addColumn("released_from", "text").execute();
  await db.schema.alterTable("participants").addColumn("last_space_id", "text").execute();
  await db.schema.alterTable("spaces").addColumn("also_asked_of", "text").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("spaces").dropColumn("also_asked_of").execute();
  await db.schema.alterTable("participants").dropColumn("last_space_id").execute();
  await db.schema.alterTable("participants").dropColumn("released_from").execute();
  await db.schema.dropTable("held_messages").execute();
}
