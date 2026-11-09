/**
 * What a person wants of the gold banner (8 November 2026, ADR 0286).
 *
 * Registry tables, not projections (ADR 0018), as `hidden_spaces` is: no event says these, and a
 * rebuild leaves them alone. `banner_choices` holds a row for each agent or harness a person has
 * said something about; an agent with no row follows its harness, and a harness with none shows
 * the banner. `closed_banners` holds the banner a person closed for now in a space, one per agent
 * there, with the `since` of the yes it stood for: a later yes is a new one, and shows.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0061-banners";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("banner_choices")
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("participant_id", "text", (c) => c.notNull())
    .addColumn("target_id", "text", (c) => c.notNull())
    .addColumn("shown", "integer", (c) => c.notNull())
    .addColumn("chosen_at", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("banner_choices_pk", ["workspace_id", "participant_id", "target_id"])
    .execute();
  await db.schema
    .createTable("closed_banners")
    .addColumn("workspace_id", "text", (c) => c.notNull().references("workspaces.id"))
    .addColumn("participant_id", "text", (c) => c.notNull())
    .addColumn("space_id", "text", (c) => c.notNull())
    .addColumn("asker", "text", (c) => c.notNull())
    .addColumn("since", "text", (c) => c.notNull())
    .addColumn("closed_at", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("closed_banners_pk", [
      "workspace_id",
      "participant_id",
      "space_id",
      "asker",
    ])
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("closed_banners").execute();
  await db.schema.dropTable("banner_choices").execute();
}
