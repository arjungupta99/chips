/** The Kysely adapter for how far each person has read each room (ADR 0262), in `read_state`. */

import type { Kysely } from "kysely";
import type { ReadMarkRegistry } from "../../application/ports/read-marks.js";
import type { Database } from "../db/schema.js";

export function createReadMarkRegistry(db: Kysely<Database>): ReadMarkRegistry {
  return {
    async forPerson(workspaceId, participantId) {
      const rows = await db
        .selectFrom("read_state")
        .select(["space_id", "last_read_seq"])
        .where("workspace_id", "=", workspaceId)
        .where("participant_id", "=", participantId)
        .execute();
      return Object.fromEntries(rows.map((row) => [row.space_id, row.last_read_seq]));
    },

    async advance({ workspaceId, participantId, marks, at }) {
      const ids = Object.keys(marks);
      if (ids.length === 0) return {};
      return await db.transaction().execute(async (trx) => {
        const kept = await trx
          .selectFrom("read_state")
          .select(["space_id", "last_read_seq"])
          .where("workspace_id", "=", workspaceId)
          .where("participant_id", "=", participantId)
          .where("space_id", "in", ids)
          .execute();
        const before = new Map(kept.map((row) => [row.space_id, row.last_read_seq]));
        const moved = Object.entries(marks).filter(([id, seq]) => seq > (before.get(id) ?? 0));
        for (const [spaceId, seq] of moved) {
          await trx
            .insertInto("read_state")
            .values({
              workspace_id: workspaceId,
              space_id: spaceId,
              participant_id: participantId,
              last_read_seq: seq,
              updated_at: at,
            })
            .onConflict((conflict) =>
              conflict
                .columns(["space_id", "participant_id"])
                .doUpdateSet({ last_read_seq: seq, updated_at: at }),
            )
            .execute();
        }
        return Object.fromEntries(moved);
      });
    },
  };
}
