/**
 * The owner's switch, "Update this computer automatically", in `computer_updates` (migration 0064):
 * off until an owner turns it on.
 */

import type { Kysely } from "kysely";
import type { ComputerUpdatesRegistry } from "../../application/ports/self-update.js";
import type { Database } from "../db/schema.js";

const ROW = "computer";

export function createComputerUpdatesRegistry(db: Kysely<Database>): ComputerUpdatesRegistry {
  return {
    async current() {
      const row = await db
        .selectFrom("computer_updates")
        .selectAll()
        .where("id", "=", ROW)
        .executeTakeFirst();
      return row === undefined
        ? { automatic: false, setBy: null, setAt: null }
        : { automatic: row.automatic === 1, setBy: row.set_by, setAt: row.set_at };
    },
    async set(next) {
      const values = {
        automatic: next.automatic ? 1 : 0,
        set_by: next.by,
        workspace_id: next.workspaceId,
        set_at: next.at,
      };
      await db
        .insertInto("computer_updates")
        .values({ id: ROW, ...values })
        .onConflict((conflict) => conflict.column("id").doUpdateSet(values))
        .execute();
    },
  };
}
