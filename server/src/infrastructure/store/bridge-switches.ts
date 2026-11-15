/**
 * The owner's switch "Keep this bridge up to date", per harness, in `bridge_switches` (migration
 * 0065): on for a harness with no row.
 */

import type { Kysely } from "kysely";
import type { BridgeSwitches } from "../../application/ports/bridges.js";
import type { Database } from "../db/schema.js";

export function createBridgeSwitches(db: Kysely<Database>): BridgeSwitches {
  return {
    async off() {
      const rows = await db
        .selectFrom("bridge_switches")
        .select("harness_id")
        .where("keep_current", "=", 0)
        .execute();
      return new Set(rows.map((row) => row.harness_id));
    },
    async set(next) {
      const values = {
        workspace_id: next.workspaceId,
        keep_current: next.keepCurrent ? 1 : 0,
        set_by: next.by,
        set_at: next.at,
      };
      await db
        .insertInto("bridge_switches")
        .values({ harness_id: next.harnessId, ...values })
        .onConflict((conflict) => conflict.column("harness_id").doUpdateSet(values))
        .execute();
    },
  };
}
