/**
 * A face of letters (7 October 2026, ADR 0139).
 *
 * `space_icons` gains `letters`: the one or two letters, or an emoji or two, a person chose for a
 * space's face in place of a mark. Null on a face that is a mark, or only a colour. An agent's and
 * a person's own face are JSON in `participants.face` (0034), which takes the letters as they are.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0040-face-letters";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("space_icons").addColumn("letters", "text").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("space_icons").dropColumn("letters").execute();
}
