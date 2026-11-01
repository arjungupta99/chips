/**
 * Who named an agent (2 October 2026, ADR 0091).
 *
 * `participants` gains, for an agent, `name_by`: the person who last named it, or null while the
 * name is its harness's or Chips's. While it is set, the harness's registration and a followed
 * room's retitle leave the name alone, as a person's title holds a room's (`title_by`). It is the
 * log's, as the rest of an agent's row is: an `agent.updated` with a name and a person as its actor
 * writes it, and a rebuild puts it back. No agent was named by a person before this, so there is
 * nothing to fill in.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0035-agent-name-by";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("participants").addColumn("name_by", "text").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("participants").dropColumn("name_by").execute();
}
