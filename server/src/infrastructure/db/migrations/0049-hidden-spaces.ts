/**
 * The rooms a person hid from their own list (19 October 2026, ADR 0205).
 *
 * A registry table, not a projection (ADR 0018), as `space_icons` is: a room hidden is a person's
 * own choice, private to them, and no event on the log says it. One row per person per room, so
 * two devices hiding two rooms at once do not write over each other the way one list per person
 * would. A row is the room hidden; unhiding deletes it.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0049-hidden-spaces";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("hidden_spaces")
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("participant_id", "text", (c) => c.notNull())
    .addColumn("space_id", "text", (c) => c.notNull())
    .addColumn("hidden_at", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("hidden_spaces_pk", ["workspace_id", "participant_id", "space_id"])
    .execute();
  // The message notifier asks who hid one room: by room, not by person.
  await db.schema
    .createIndex("hidden_spaces_workspace_id_space_id")
    .on("hidden_spaces")
    .columns(["workspace_id", "space_id"])
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("hidden_spaces").execute();
}
