/**
 * ADR 0053: a video is measured when it arrives, and made playable after, in ffmpeg under limits.
 *
 * Columns on the `uploads` registry for a video's playable copy: where it has got to (`pending`,
 * `done`, `skipped`, `failed`), how a pending one is to be made, the copy itself by digest, and
 * why one failed. An index finds the next video waiting, oldest first. `duration_ms` has been a
 * column since 0004 and is filled now.
 */

import type { Kysely } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: a migration runs against the schema of its moment.
type Db = Kysely<any>;

export const name = "0019-playable-videos";

const COLUMNS = [
  "playable_state",
  "playable_how",
  "playable_sha256",
  "playable_mime_type",
  "playable_note",
] as const;

export async function up(db: Db): Promise<void> {
  for (const column of COLUMNS) {
    await db.schema.alterTable("uploads").addColumn(column, "text").execute();
  }
  await db.schema
    .createIndex("uploads_playable_state_stored_at")
    .on("uploads")
    .columns(["playable_state", "stored_at"])
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropIndex("uploads_playable_state_stored_at").ifExists().execute();
  for (const column of [...COLUMNS].reverse()) {
    await db.schema.alterTable("uploads").dropColumn(column).execute();
  }
}
