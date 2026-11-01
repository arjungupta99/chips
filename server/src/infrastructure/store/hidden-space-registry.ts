/** The Kysely adapter for the rooms a person hid from their own list (ADR 0205). */

import type { Kysely } from "kysely";
import type { HiddenSpaceRegistry } from "../../application/ports/hidden-spaces.js";
import type { Database } from "../db/schema.js";

export function createHiddenSpaceRegistry(db: Kysely<Database>): HiddenSpaceRegistry {
  return {
    async forPerson(workspaceId, participantId) {
      const rows = await db
        .selectFrom("hidden_spaces")
        .select("space_id")
        .where("workspace_id", "=", workspaceId)
        .where("participant_id", "=", participantId)
        .orderBy("hidden_at")
        .execute();
      return rows.map((row) => row.space_id);
    },

    async hidersOf(workspaceId, spaceId) {
      const rows = await db
        .selectFrom("hidden_spaces")
        .select("participant_id")
        .where("workspace_id", "=", workspaceId)
        .where("space_id", "=", spaceId)
        .execute();
      return rows.map((row) => row.participant_id);
    },

    async hide({ workspaceId, participantId, spaceId, at }) {
      await db
        .insertInto("hidden_spaces")
        .values({
          workspace_id: workspaceId,
          participant_id: participantId,
          space_id: spaceId,
          hidden_at: at,
        })
        .onConflict((conflict) =>
          conflict.columns(["workspace_id", "participant_id", "space_id"]).doNothing(),
        )
        .execute();
    },

    async unhide({ workspaceId, participantId, spaceId }) {
      await db
        .deleteFrom("hidden_spaces")
        .where("workspace_id", "=", workspaceId)
        .where("participant_id", "=", participantId)
        .where("space_id", "=", spaceId)
        .execute();
    },
  };
}
