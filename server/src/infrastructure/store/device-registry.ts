/**
 * The Kysely adapter for the device registry. Devices are identity, not a projection: an
 * Ed25519 public key is not something a replay should be able to reconstruct (ADR 0018).
 */

import type { Kysely } from "kysely";
import type { DeviceRegistry } from "../../application/index.js";
import type { Database } from "../db/schema.js";

function toView(row: {
  id: string;
  participant_id: string;
  name: string;
  paired_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
}) {
  return {
    deviceId: row.id,
    participantId: row.participant_id,
    name: row.name,
    pairedAt: row.paired_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
  };
}

export function createDeviceRegistry(db: Kysely<Database>): DeviceRegistry {
  return {
    async participant(workspaceId, participantId) {
      const row = await db
        .selectFrom("participants")
        .select("display_name")
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", participantId)
        // A person removed from the workspace (ADR 0160) is nobody a device is paired for.
        .where("removed_at", "is", null)
        .executeTakeFirst();
      return row === undefined ? undefined : { displayName: row.display_name };
    },

    async deviceByPublicKey(workspaceId, publicKey) {
      const row = await db
        .selectFrom("devices")
        .select(["id", "participant_id"])
        .where("workspace_id", "=", workspaceId)
        .where("public_key", "=", publicKey)
        .executeTakeFirst();
      return row === undefined
        ? undefined
        : { deviceId: row.id, participantId: row.participant_id };
    },

    async device(workspaceId, deviceId) {
      const row = await db
        .selectFrom("devices")
        .select(["id", "participant_id", "name", "paired_at", "last_seen_at", "revoked_at"])
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", deviceId)
        .executeTakeFirst();
      return row === undefined ? undefined : toView(row);
    },

    async devicesOf(workspaceId, participantId) {
      const rows = await db
        .selectFrom("devices")
        .select(["id", "participant_id", "name", "paired_at", "last_seen_at", "revoked_at"])
        .where("workspace_id", "=", workspaceId)
        .where("participant_id", "=", participantId)
        .orderBy("paired_at", "asc")
        .orderBy("id", "asc")
        .execute();
      return rows.map(toView);
    },

    async revokeDevice({ workspaceId, deviceId, at }) {
      const result = await db
        .updateTable("devices")
        .set({ revoked_at: at })
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", deviceId)
        .where("revoked_at", "is", null)
        .executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    },

    async addDevice(device) {
      await db
        .insertInto("devices")
        .values({
          id: device.deviceId,
          workspace_id: device.workspaceId,
          participant_id: device.participantId,
          public_key: device.publicKey,
          name: device.name,
          paired_at: device.pairedAt,
          last_seen_at: null,
          revoked_at: null,
        })
        .execute();
    },
  };
}
