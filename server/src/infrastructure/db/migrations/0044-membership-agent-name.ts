/**
 * Held first names (11 October 2026, ADR 0150): `memberships` gains `agent_name`, the first name
 * a room asked of a harness from the + holds for the agent that harness will make there, and
 * `agent_name_by`, the person whose naming it is (who added the harness). Set by
 * `membership.added`, while the harness itself is the member; cleared when its agent takes its
 * place (`membership.replaced`). Null for every other membership.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0044-membership-agent-name";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("memberships").addColumn("agent_name", "text").execute();
  await db.schema.alterTable("memberships").addColumn("agent_name_by", "text").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("memberships").dropColumn("agent_name_by").execute();
  await db.schema.alterTable("memberships").dropColumn("agent_name").execute();
}
