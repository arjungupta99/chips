/** The Kysely adapter for the faces a person chose for their spaces. */

import { SPACE_ICON_GROUNDS, type SpaceIcon } from "@chipschat/protocol";
import type { Kysely } from "kysely";
import type { SpaceIconRegistry } from "../../application/ports/space-icons.js";
import type { Database } from "../db/schema.js";

export function createSpaceIconRegistry(db: Kysely<Database>): SpaceIconRegistry {
  return {
    async forPerson(workspaceId, participantId) {
      const rows = await db
        .selectFrom("space_icons")
        .select(["space_id", "icon", "ground", "letters"])
        .where("workspace_id", "=", workspaceId)
        .where("participant_id", "=", participantId)
        .execute();
      const icons: Record<string, SpaceIcon> = {};
      for (const row of rows) {
        // A ground saved when the list was longer is clamped rather than dropped: the person
        // keeps their mark, and the colour lands somewhere in the set they have now.
        icons[row.space_id] = {
          icon: row.icon,
          ground: Math.min(Math.max(row.ground, 0), SPACE_ICON_GROUNDS - 1),
          // A face of letters (ADR 0139): the mark is empty beside them.
          ...(row.letters === null ? {} : { letters: row.letters }),
        };
      }
      return icons;
    },

    async set({ workspaceId, participantId, spaceId, icon, at }) {
      await db
        .insertInto("space_icons")
        .values({
          workspace_id: workspaceId,
          participant_id: participantId,
          space_id: spaceId,
          icon: icon.icon,
          ground: icon.ground,
          letters: icon.letters ?? null,
          updated_at: at,
        })
        .onConflict((conflict) =>
          conflict.columns(["workspace_id", "participant_id", "space_id"]).doUpdateSet({
            icon: icon.icon,
            ground: icon.ground,
            letters: icon.letters ?? null,
            updated_at: at,
          }),
        )
        .execute();
    },

    async clear({ workspaceId, participantId, spaceId }) {
      await db
        .deleteFrom("space_icons")
        .where("workspace_id", "=", workspaceId)
        .where("participant_id", "=", participantId)
        .where("space_id", "=", spaceId)
        .execute();
    },
  };
}
