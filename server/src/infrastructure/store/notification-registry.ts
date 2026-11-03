/** The Kysely adapter for a person's notification settings and the claim ledger (M5.6). */

import { DEFAULT_NOTIFICATION_SETTINGS } from "@chipschat/protocol";
import type { Kysely } from "kysely";
import type { NotificationRegistry } from "../../application/ports/notifications.js";
import type { Database } from "../db/schema.js";

export function createNotificationRegistry(db: Kysely<Database>): NotificationRegistry {
  return {
    async settings(workspaceId, participantId) {
      const row = await db
        .selectFrom("notification_settings")
        .select("settings")
        .where("workspace_id", "=", workspaceId)
        .where("participant_id", "=", participantId)
        .executeTakeFirst();
      if (row === undefined) return undefined;
      // What was saved was validated on the way in; the defaults cover a shape saved before a
      // field existed.
      return { ...DEFAULT_NOTIFICATION_SETTINGS, ...(JSON.parse(row.settings) as object) };
    },

    async saveSettings({ workspaceId, participantId, settings, at }) {
      await db
        .insertInto("notification_settings")
        .values({
          workspace_id: workspaceId,
          participant_id: participantId,
          settings: JSON.stringify(settings),
          updated_at: at,
        })
        .onConflict((conflict) =>
          conflict
            .columns(["workspace_id", "participant_id"])
            .doUpdateSet({ settings: JSON.stringify(settings), updated_at: at }),
        )
        .execute();
    },

    async claim({ workspaceId, participantId, deviceId, keys, at }) {
      const wanted = [...new Set(keys)];
      if (wanted.length === 0) return [];
      // One statement: insert what is free, and answer with what went in. The primary key is
      // the whole of the dedup — two devices racing for a key both insert, the second finds the
      // row there and is not granted it — and a key this device claimed before is not granted
      // again either (Gate 5): a reload, or the app opened in the morning, raises no banner a
      // second time for the same event. The queue is the whole picture; a banner is one word.
      const inserted = await db
        .insertInto("notification_claims")
        .values(
          wanted.map((key) => ({
            workspace_id: workspaceId,
            participant_id: participantId,
            key,
            device_id: deviceId,
            claimed_at: at,
          })),
        )
        .onConflict((conflict) => conflict.doNothing())
        .returning("key")
        .execute();
      const granted = new Set(inserted.map((row) => row.key));
      return wanted.filter((key) => granted.has(key));
    },

    async release({ workspaceId, participantId, deviceId, keys }) {
      if (keys.length === 0) return;
      await db
        .deleteFrom("notification_claims")
        .where("workspace_id", "=", workspaceId)
        .where("participant_id", "=", participantId)
        .where("device_id", "=", deviceId)
        .where("key", "in", [...keys])
        .execute();
    },

    async prune(before) {
      const result = await db
        .deleteFrom("notification_claims")
        .where("claimed_at", "<", before)
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    },
  };
}
