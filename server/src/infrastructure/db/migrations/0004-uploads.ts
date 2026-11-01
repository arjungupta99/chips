/**
 * M1.5: attachments. The `uploads` registry — what was sent to the store, by whom, and what
 * the bytes turned out to be — and, on the `attachments` projection, which space an
 * attachment belongs to, since that is who may fetch it.
 */

import type { Kysely } from "kysely";

/** A migration runs against the schema of its own moment, so it must not be tied to today's. */
// biome-ignore lint/suspicious/noExplicitAny: see above.
type Db = Kysely<any>;

export const name = "0004-uploads";

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("uploads")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("workspace_id", "text", (c) => c.notNull())
    .addColumn("uploaded_by", "text", (c) => c.notNull())
    .addColumn("filename", "text", (c) => c.notNull())
    .addColumn("state", "text", (c) => c.notNull().defaultTo("slot"))
    .addColumn("mime_type", "text")
    .addColumn("byte_size", "integer")
    .addColumn("sha256", "text")
    .addColumn("width", "integer")
    .addColumn("height", "integer")
    .addColumn("duration_ms", "integer")
    .addColumn("thumbnail_sha256", "text")
    .addColumn("thumbnail_mime_type", "text")
    .addColumn("keep_metadata", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("created_at", "text", (c) => c.notNull())
    .addColumn("expires_at", "text", (c) => c.notNull())
    .addColumn("stored_at", "text")
    .execute();
  // What a person has uploaded, and whether the same bytes are already here.
  await db.schema
    .createIndex("uploads_workspace_id_uploaded_by")
    .on("uploads")
    .columns(["workspace_id", "uploaded_by"])
    .execute();
  await db.schema
    .createIndex("uploads_workspace_id_sha256")
    .on("uploads")
    .columns(["workspace_id", "sha256"])
    .execute();

  await db.schema.alterTable("attachments").addColumn("space_id", "text").execute();
  await db.schema.alterTable("attachments").addColumn("message_id", "text").execute();
  // Who may fetch an attachment: the members of the space it was sent in.
  await db.schema
    .createIndex("attachments_workspace_id_space_id")
    .on("attachments")
    .columns(["workspace_id", "space_id"])
    .execute();
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropIndex("attachments_workspace_id_space_id").ifExists().execute();
  await db.schema.alterTable("attachments").dropColumn("message_id").execute();
  await db.schema.alterTable("attachments").dropColumn("space_id").execute();
  await db.schema.dropTable("uploads").ifExists().execute();
}
