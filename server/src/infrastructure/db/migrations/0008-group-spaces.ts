/**
 * M3.3: a space with several harnesses and people in it can be retitled and closed.
 *
 * Four columns on `spaces`, each a fact the door or a screen asks for. `state` and `closed_at`
 * are what `space.updated` sets when a room is closed: off the list, history kept, reopenable.
 * `opened_by` is who sent `space.created`, which is the one harness allowed to retitle or close
 * the room afterwards. `title_by` says whether the title was last set by a person or a harness,
 * so a harness bringing a better name for a worktree does not overwrite a name a person chose.
 *
 * `spaces` is a projection, so a rebuild fills all four from the log; the backfill here fills
 * `opened_by` for rooms that already exist without one.
 */

import { type Kysely, sql } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0008-group-spaces";

export async function up(db: Db): Promise<void> {
  await db.schema
    .alterTable("spaces")
    .addColumn("state", "text", (c) => c.notNull().defaultTo("open"))
    .execute();
  await db.schema.alterTable("spaces").addColumn("closed_at", "text").execute();
  await db.schema.alterTable("spaces").addColumn("opened_by", "text").execute();
  await db.schema.alterTable("spaces").addColumn("title_by", "text").execute();
  await sql`
    update spaces set opened_by = (
      select actor_id from events
      where events.workspace_id = spaces.workspace_id
        and events.space_id = spaces.id
        and events.type = 'space.created'
      order by seq asc limit 1
    )
    where opened_by is null
  `.execute(db);
}

export async function down(db: Db): Promise<void> {
  for (const column of ["title_by", "opened_by", "closed_at", "state"]) {
    await db.schema.alterTable("spaces").dropColumn(column).execute();
  }
}
