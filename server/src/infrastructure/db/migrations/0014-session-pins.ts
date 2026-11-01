/**
 * ADR 0040: which visit a person's messages in a space go to.
 *
 * A registry table, not a projection (ADR 0018: a person's private data is not one). One row
 * per person per space, holding the `session_ref` they pinned; no row is the ordinary case,
 * where a message goes to whichever visit the harness would choose. The pin is on the server
 * rather than the device because a session lives where its harness is and not where the typing
 * happens: pin at the desk, walk away, and the phone still aims at the same terminal.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0014-session-pins";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("session_pins")
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("participant_id", "text", (c) => c.notNull())
    .addColumn("space_id", "text", (c) => c.notNull())
    .addColumn("session_ref", "text", (c) => c.notNull())
    .addColumn("pinned_at", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("session_pins_pk", ["workspace_id", "participant_id", "space_id"])
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("session_pins").execute();
}
