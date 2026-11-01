/**
 * M4.1: the server's tunnel key (ADR 0039).
 *
 * A registry table (ADR 0018), and the first that keeps a private key: the X25519 static key a
 * phone is given in its pairing payload, asks the relay for, and authenticates the server by.
 * It lives in the database rather than a file beside it so that the backup that keeps a
 * workspace keeps its phones paired — restore the database elsewhere and every phone still
 * reaches it. One row per kind; `relay` is the only kind so far.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0013-server-keys";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("server_keys")
    .addColumn("kind", "text", (c) => c.primaryKey())
    .addColumn("public_key", "text", (c) => c.notNull())
    .addColumn("private_key", "text", (c) => c.notNull())
    .addColumn("created_at", "text", (c) => c.notNull())
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("server_keys").execute();
}
