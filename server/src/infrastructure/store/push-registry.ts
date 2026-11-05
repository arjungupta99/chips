/** The Kysely adapter for where a push may reach a phone (M4.3). */

import type { Kysely } from "kysely";
import type { PushPlatform, PushRegistry } from "../../application/ports/push.js";
import type { Database } from "../db/schema.js";

export function createPushRegistry(db: Kysely<Database>): PushRegistry {
  return {
    async register({
      workspaceId,
      participantId,
      deviceId,
      token,
      platform,
      timeZone,
      sealKey,
      at,
    }) {
      await db
        .insertInto("push_tokens")
        .values({
          device_id: deviceId,
          workspace_id: workspaceId,
          participant_id: participantId,
          token,
          platform,
          time_zone: timeZone,
          updated_at: at,
          seal_key: sealKey ?? null,
        })
        // A phone re-registers on every launch and whenever its token or its zone changes, so
        // this is the ordinary path, not the exception.
        .onConflict((conflict) =>
          conflict.column("device_id").doUpdateSet({
            workspace_id: workspaceId,
            participant_id: participantId,
            token,
            platform,
            time_zone: timeZone,
            updated_at: at,
            // What the phone says now: an app that lost its key, or never had one, gets fixed words.
            seal_key: sealKey ?? null,
          }),
        )
        .execute();
    },

    async remove(deviceId) {
      await db.deleteFrom("push_tokens").where("device_id", "=", deviceId).execute();
    },

    async removeToken(token) {
      const result = await db
        .deleteFrom("push_tokens")
        .where("token", "=", token)
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    },

    async pruneRevoked() {
      const result = await db
        .deleteFrom("push_tokens")
        .where(({ exists, selectFrom }) =>
          exists(
            selectFrom("devices")
              .select("devices.id")
              .whereRef("devices.id", "=", "push_tokens.device_id")
              .where("devices.revoked_at", "is not", null),
          ),
        )
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    },

    async forPeople(workspaceId, participantIds) {
      if (participantIds.length === 0) return [];
      const rows = await db
        .selectFrom("push_tokens")
        .innerJoin("devices", "devices.id", "push_tokens.device_id")
        .select([
          "push_tokens.device_id",
          "push_tokens.participant_id",
          "push_tokens.token",
          "push_tokens.platform",
          "push_tokens.time_zone",
          "push_tokens.seal_key",
        ])
        .where("push_tokens.workspace_id", "=", workspaceId)
        .where("push_tokens.participant_id", "in", [...participantIds])
        // A revoked device keeps no key and answers nothing; it is not told either. The sweep
        // deletes the row eventually, and until then this is what keeps it quiet.
        .where("devices.revoked_at", "is", null)
        .execute();
      return rows.map((row) => ({
        deviceId: row.device_id,
        participantId: row.participant_id,
        token: row.token,
        platform: row.platform as PushPlatform,
        timeZone: row.time_zone,
        ...(row.seal_key === null ? {} : { sealKey: row.seal_key }),
      }));
    },

    async zonesOf(workspaceId, participantIds) {
      const zones = new Map<string, string>();
      if (participantIds.length === 0) return zones;
      const rows = await db
        .selectFrom("push_tokens")
        .innerJoin("devices", "devices.id", "push_tokens.device_id")
        .select(["push_tokens.participant_id", "push_tokens.time_zone"])
        .where("push_tokens.workspace_id", "=", workspaceId)
        .where("push_tokens.participant_id", "in", [...participantIds])
        .where("devices.revoked_at", "is", null)
        .orderBy("push_tokens.updated_at", "desc")
        .execute();
      // Newest first, so the first a person has is where they last opened Chips.
      for (const row of rows) {
        if (!zones.has(row.participant_id)) zones.set(row.participant_id, row.time_zone);
      }
      return zones;
    },
  };
}
