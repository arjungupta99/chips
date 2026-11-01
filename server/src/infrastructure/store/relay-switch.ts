/** The owner's relay switch and the devices' ways in, in SQLite (ADR 0211, Phase 4). */

import type { Kysely } from "kysely";
import type { RelaySwitchRegistry, SocketWay } from "../../application/ports/relay-switch.js";
import type { Database } from "../db/schema.js";

const ROW = "relay";
const WAYS: readonly SocketWay[] = ["socket", "lan", "relay"];
const wayOf = (text: string | null): SocketWay | null => WAYS.find((way) => way === text) ?? null;

/**
 * `onAtFirst`: what the switch is before any owner has turned it. On for a relay the server was
 * set up with (`CHIPS_RELAY_URL`); off for Chips's own, which a server has without being asked and
 * dials only once an owner turns it on (ADR 0245).
 */
export function createRelaySwitchRegistry(
  db: Kysely<Database>,
  onAtFirst = true,
): RelaySwitchRegistry {
  return {
    async current() {
      const row = await db
        .selectFrom("relay_switch")
        .selectAll()
        .where("id", "=", ROW)
        .executeTakeFirst();
      return row === undefined
        ? { on: onAtFirst, setBy: null, workspaceId: null, setAt: null }
        : { on: row.on === 1, setBy: row.set_by, workspaceId: row.workspace_id, setAt: row.set_at };
    },

    async set(next) {
      const values = {
        on: next.on ? 1 : 0,
        set_by: next.by,
        workspace_id: next.workspaceId,
        set_at: next.at,
      };
      await db
        .insertInto("relay_switch")
        .values({ id: ROW, ...values })
        .onConflict((conflict) => conflict.column("id").doUpdateSet(values))
        .execute();
    },

    async noteWay(deviceId, via, at) {
      await db
        .updateTable("devices")
        .set(
          via === "relay"
            ? { last_via: via, last_via_at: at }
            : { last_via: via, last_via_at: at, direct_at: at },
        )
        .where("id", "=", deviceId)
        .execute();
    },

    async ways(workspaceId) {
      const rows = await db
        .selectFrom("devices")
        .select(["id", "participant_id", "name", "last_via", "last_via_at", "direct_at"])
        .where("workspace_id", "=", workspaceId)
        .where("revoked_at", "is", null)
        .orderBy("paired_at", "asc")
        .execute();
      return rows.map((row) => ({
        deviceId: row.id,
        participantId: row.participant_id,
        name: row.name,
        lastVia: wayOf(row.last_via),
        lastViaAt: row.last_via_at,
        directAt: row.direct_at,
      }));
    },
  };
}
