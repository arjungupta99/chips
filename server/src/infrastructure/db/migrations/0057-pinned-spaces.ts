/**
 * The rooms a person pinned to the top of their own list (27 October 2026, ADR 0240).
 *
 * A registry table, not a projection (ADR 0018), as `hidden_spaces` is: a room pinned is a
 * person's own choice, private to them, and no event on the log says it. One row per person per
 * room, so two devices pinning two rooms at once do not write over each other the way one list
 * per person would. A row is the room pinned, and when it was pinned puts the newest first;
 * unpinning deletes it.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0057-pinned-spaces";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("pinned_spaces")
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("participant_id", "text", (c) => c.notNull())
    .addColumn("space_id", "text", (c) => c.notNull())
    .addColumn("pinned_at", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("pinned_spaces_pk", ["workspace_id", "participant_id", "space_id"])
    .execute();
  // Pins are read one person's at a time, and nothing asks who pinned a room.
  await db.schema
    .createIndex("pinned_spaces_workspace_id_participant_id")
    .on("pinned_spaces")
    .columns(["workspace_id", "participant_id"])
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("pinned_spaces").execute();
}
