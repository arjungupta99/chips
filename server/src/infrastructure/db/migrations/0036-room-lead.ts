/**
 * Who leads a room (3 October 2026, ADR 0104).
 *
 * `spaces` gains `lead_id`: the agent that hands out the work in the room, and that Chips hands
 * what was nobody's turn once the room goes still; null when nobody leads it. It is the log's: a
 * `space.lead_set` writes it, and a rebuild puts it back. An agent that has left the room is read
 * as no lead, so leaving clears nothing here. No room had a lead before this.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0036-room-lead";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("spaces").addColumn("lead_id", "text").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("spaces").dropColumn("lead_id").execute();
}
