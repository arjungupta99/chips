/** The Kysely adapter for the people registry: participants of kind `person`. */

import type { Kysely } from "kysely";
import type { PeopleRegistry } from "../../application/ports/people.js";
import type { Database } from "../db/schema.js";

export function createPeopleRegistry(db: Kysely<Database>): PeopleRegistry {
  return {
    async addPerson(person) {
      await db
        .insertInto("participants")
        .values({
          id: person.id,
          workspace_id: person.workspaceId,
          kind: "person",
          display_name: person.displayName,
          owner_id: null,
          parent_id: null,
          ephemeral: 0,
          capabilities: null,
          created_at: person.createdAt,
        })
        .execute();
    },

    async rename({ workspaceId, participantId, displayName }) {
      await db
        .updateTable("participants")
        .set({ display_name: displayName })
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", participantId)
        .where("kind", "=", "person")
        .execute();
    },

    async markRemoved({ workspaceId, participantId, at }) {
      const result = await db
        .updateTable("participants")
        .set({ removed_at: at })
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", participantId)
        .where("kind", "=", "person")
        .where("removed_at", "is", null)
        .executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    },
  };
}
