/**
 * ADR 0058: a viewer's copy, a byte range, and a grant a device may hand to a player.
 *
 * Two columns on the `uploads` registry for the copy a viewer shows: a photo, or a video's poster,
 * no longer than 2,048 pixels on its longer side, by digest and type. Made when a photo or a video
 * arrives from now on. A photo kept before this has none, and is given one the first time it is
 * asked for, so nothing here goes back over the rows.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0022-view-copies";

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("uploads").addColumn("view_sha256", "text").execute();
  await db.schema.alterTable("uploads").addColumn("view_mime_type", "text").execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("uploads").dropColumn("view_mime_type").execute();
  await db.schema.alterTable("uploads").dropColumn("view_sha256").execute();
}
