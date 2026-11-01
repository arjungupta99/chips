/** The Kysely adapter for the uploads registry: one row per upload, slot or stored. */

import type { Kysely } from "kysely";
import type {
  PlayableState,
  StoredFacts,
  UploadRow,
  UploadsRegistry,
} from "../../application/ports/attachments.js";
import type { Database, UploadsTable } from "../db/schema.js";

const PLAYABLE_STATES: readonly string[] = ["pending", "done", "skipped", "failed"];

function toRow(row: UploadsTable): UploadRow {
  return {
    ...row,
    state: row.state === "stored" ? "stored" : "slot",
    keep_metadata: row.keep_metadata === 1,
    playable_state: PLAYABLE_STATES.includes(row.playable_state ?? "")
      ? (row.playable_state as PlayableState)
      : null,
    playable_how:
      row.playable_how === "remux" || row.playable_how === "transcode" ? row.playable_how : null,
  };
}

export function createUploadsRegistry(db: Kysely<Database>): UploadsRegistry {
  return {
    async open(slot) {
      await db
        .insertInto("uploads")
        .values({
          id: slot.id,
          workspace_id: slot.workspace_id,
          uploaded_by: slot.uploaded_by,
          filename: slot.filename,
          state: "slot",
          mime_type: null,
          byte_size: null,
          sha256: null,
          width: null,
          height: null,
          duration_ms: null,
          thumbnail_sha256: null,
          thumbnail_mime_type: null,
          keep_metadata: slot.keep_metadata ? 1 : 0,
          created_at: slot.created_at,
          expires_at: slot.expires_at,
          stored_at: null,
          declared_bytes: slot.declared_bytes,
          playable_state: null,
          playable_how: null,
          playable_sha256: null,
          playable_mime_type: null,
          playable_note: null,
          transcript: null,
          view_sha256: null,
          view_mime_type: null,
        })
        .execute();
    },

    async find(workspaceId, id) {
      const row = await db
        .selectFrom("uploads")
        .selectAll()
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", id)
        .executeTakeFirst();
      return row === undefined ? undefined : toRow(row);
    },

    async stored(workspaceId, id, facts: StoredFacts) {
      await db
        .updateTable("uploads")
        .set({ ...facts, state: "stored" })
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", id)
        .execute();
    },

    async extend(workspaceId, id, expiresAt) {
      await db
        .updateTable("uploads")
        .set({ expires_at: expiresAt })
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", id)
        .where("state", "=", "slot")
        .execute();
    },

    async nextPlayable() {
      const row = await db
        .selectFrom("uploads")
        .selectAll()
        .where("state", "=", "stored")
        .where("playable_state", "=", "pending")
        .orderBy("stored_at")
        .limit(1)
        .executeTakeFirst();
      return row === undefined ? undefined : toRow(row);
    },

    async playableMade(workspaceId, id, outcome) {
      await db
        .updateTable("uploads")
        .set(
          outcome.state === "done"
            ? {
                playable_state: "done",
                playable_sha256: outcome.sha256,
                playable_mime_type: outcome.mimeType,
                playable_note: null,
              }
            : { playable_state: "failed", playable_note: outcome.note.slice(0, 2048) },
        )
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", id)
        .execute();
    },

    async viewMade(workspaceId, id, view) {
      const result = await db
        .updateTable("uploads")
        .set({ view_sha256: view.sha256, view_mime_type: view.mimeType })
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", id)
        .where("view_sha256", "is", null)
        .executeTakeFirst();
      return result.numUpdatedRows > 0n;
    },

    async openAmong(ids, now) {
      if (ids.length === 0) return [];
      const rows = await db
        .selectFrom("uploads")
        .select("id")
        .where("id", "in", [...ids])
        .where("state", "=", "slot")
        .where("expires_at", ">", now)
        .execute();
      return rows.map((row) => row.id);
    },
  };
}
