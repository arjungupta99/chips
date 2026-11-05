/** The Kysely adapter for the rooms a person pinned to the top of their own list (ADR 0240). */

import type { Kysely } from "kysely";
import type { PinnedSpaceRegistry } from "../../application/ports/pinned-spaces.js";
import type { Database } from "../db/schema.js";

export function createPinnedSpaceRegistry(db: Kysely<Database>): PinnedSpaceRegistry {
  return {
    async forPerson(workspaceId, participantId) {
      // The newest pin first, and the room's id after it, so two pinned in the same instant still
      // come back in the same order every time.
      const rows = await db
        .selectFrom("pinned_spaces")
        .select("space_id")
        .where("workspace_id", "=", workspaceId)
        .where("participant_id", "=", participantId)
        .orderBy("pinned_at", "desc")
        .orderBy("space_id")
        .execute();
      return rows.map((row) => row.space_id);
    },

    async pin({ workspaceId, participantId, spaceId, at }) {
      await db
        .insertInto("pinned_spaces")
        .values({
          workspace_id: workspaceId,
          participant_id: participantId,
          space_id: spaceId,
          pinned_at: at,
        })
        .onConflict((conflict) =>
          conflict.columns(["workspace_id", "participant_id", "space_id"]).doNothing(),
        )
        .execute();
    },

    async unpin({ workspaceId, participantId, spaceId }) {
      await db
        .deleteFrom("pinned_spaces")
        .where("workspace_id", "=", workspaceId)
        .where("participant_id", "=", participantId)
        .where("space_id", "=", spaceId)
        .execute();
    },

    async forgetSpace(workspaceId, spaceId) {
      await db
        .deleteFrom("pinned_spaces")
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "=", spaceId)
        .execute();
    },
  };
}
