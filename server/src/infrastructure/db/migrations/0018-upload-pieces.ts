/**
 * ADR 0052: an upload arrives in pieces, and the server says how much it has.
 *
 * One column on the `uploads` registry: the size a slot said it would be, which is how the server
 * knows the last piece when it arrives. How much has arrived is not a column: it is the length of
 * the file the pieces are appended to, so a crash between a write and an update cannot make the
 * two disagree.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0018-upload-pieces";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("uploads").addColumn("declared_bytes", "integer").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("uploads").dropColumn("declared_bytes").execute();
}
