/**
 * An agent's face (1 October 2026, ADR 0089).
 *
 * `participants` gains, for an agent, `face`: the mark and the ground a person chose for it, as
 * JSON, one for everybody in the workspace. It is the log's, as the rest of an agent's row is:
 * `agent.updated` writes it, and a rebuild puts it back. Null while nobody has chosen, and the
 * agent wears its initials.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0034-agent-face";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("participants").addColumn("face", "text").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("participants").dropColumn("face").execute();
}
