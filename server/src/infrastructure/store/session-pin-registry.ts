/** The Kysely adapter for a person's session pins (ADR 0040). */

import type { Kysely } from "kysely";
import type { SessionPin, SessionPinRegistry } from "../../application/ports/session-pins.js";
import type { Database } from "../db/schema.js";

export function createSessionPinRegistry(db: Kysely<Database>): SessionPinRegistry {
  return {
    async pins(workspaceId, participantId): Promise<SessionPin[]> {
      const rows = await db
        .selectFrom("session_pins")
        .select(["space_id", "session_ref"])
        .where("workspace_id", "=", workspaceId)
        .where("participant_id", "=", participantId)
        .execute();
      return rows.map((row) => ({ spaceId: row.space_id, sessionRef: row.session_ref }));
    },

    async pin({ workspaceId, participantId, spaceId, sessionRef, at }) {
      await db
        .insertInto("session_pins")
        .values({
          workspace_id: workspaceId,
          participant_id: participantId,
          space_id: spaceId,
          session_ref: sessionRef,
          pinned_at: at,
        })
        .onConflict((conflict) =>
          conflict
            .columns(["workspace_id", "participant_id", "space_id"])
            .doUpdateSet({ session_ref: sessionRef, pinned_at: at }),
        )
        .execute();
    },

    async unpin({ workspaceId, participantId, spaceId }) {
      await db
        .deleteFrom("session_pins")
        .where("workspace_id", "=", workspaceId)
        .where("participant_id", "=", participantId)
        .where("space_id", "=", spaceId)
        .execute();
    },
  };
}
