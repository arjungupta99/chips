/**
 * Who archived a space: a person or a harness (22 September 2026, ADR 0066).
 *
 * `state_by` says whether `state` was last set by a person or by a harness, the way `title_by`
 * says it of the title (0008). Jacobian closes the room of a Space it archived; a person can now
 * archive a room from the list; and the adapter that follows its Spaces needs to know which of
 * the two moved a room, so that a person's archive goes back into Jacobian rather than being
 * undone by it.
 *
 * `spaces` is a projection, so a rebuild fills it from the log; the backfill here fills it for
 * rooms that already exist, from the last `space.updated` that set a state.
 */

import { type Kysely, sql } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0026-state-by";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("spaces").addColumn("state_by", "text").execute();
  await sql`
    update spaces set state_by = (
      select actor_kind from events
      where events.workspace_id = spaces.workspace_id
        and events.space_id = spaces.id
        and events.type = 'space.updated'
        and json_extract(events.payload, '$.state') is not null
      order by seq desc limit 1
    )
  `.execute(db);
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("spaces").dropColumn("state_by").execute();
}
