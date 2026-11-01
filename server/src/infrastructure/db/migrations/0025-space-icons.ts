/**
 * The face a person chose for a space (21 September 2026).
 *
 * A registry table, not a projection (ADR 0018): what a person picked is their own private
 * setting, like their notification settings in 0011, and no event on the log says it. One row
 * per person per space, so two devices setting two different rooms' faces at once do not
 * clobber each other the way one JSON blob per person would.
 *
 * The ground is an index into the client's list of grounds, not a colour: see
 * `packages/protocol/src/space-icons.ts` for why.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0025-space-icons";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("space_icons")
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("participant_id", "text", (c) => c.notNull())
    .addColumn("space_id", "text", (c) => c.notNull())
    .addColumn("icon", "text", (c) => c.notNull())
    .addColumn("ground", "integer", (c) => c.notNull())
    .addColumn("updated_at", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("space_icons_pk", ["workspace_id", "participant_id", "space_id"])
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("space_icons").execute();
}
