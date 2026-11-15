/**
 * What each device and each harness last said it runs, in `software_seen` (migration 0063).
 */

import type { Kysely } from "kysely";
import {
  SOFTWARE_FRESH_MS,
  type SoftwareRegistry,
  type SoftwareSeen,
} from "../../application/ports/software.js";
import type { Database } from "../db/schema.js";

export function createSoftwareRegistry(db: Kysely<Database>): SoftwareRegistry {
  return {
    async heard(input) {
      const kept = await db
        .selectFrom("software_seen")
        .select(["name", "version", "seen_at", "changed_at"])
        .where("workspace_id", "=", input.workspaceId)
        .where("subject_id", "=", input.subjectId)
        .executeTakeFirst();
      const same = kept !== undefined && kept.name === input.name && kept.version === input.version;
      if (same && Date.parse(input.at) - Date.parse(kept.seen_at) < SOFTWARE_FRESH_MS) return;
      const changedAt = same ? kept.changed_at : input.at;
      await db
        .insertInto("software_seen")
        .values({
          workspace_id: input.workspaceId,
          subject_id: input.subjectId,
          kind: input.kind,
          participant_id: input.participantId,
          name: input.name,
          version: input.version,
          seen_at: input.at,
          changed_at: changedAt,
        })
        .onConflict((conflict) =>
          conflict.columns(["workspace_id", "subject_id"]).doUpdateSet({
            kind: input.kind,
            participant_id: input.participantId,
            name: input.name,
            version: input.version,
            seen_at: input.at,
            changed_at: changedAt,
          }),
        )
        .execute();
    },
    async list(workspaceId) {
      // A device unpaired since it last said hello is nobody's phone any more: left out.
      const rows = await db
        .selectFrom("software_seen")
        .selectAll()
        .where("workspace_id", "=", workspaceId)
        .where((where) =>
          where.or([
            where("kind", "!=", "device"),
            where.exists(
              where
                .selectFrom("devices")
                .select("devices.id")
                .whereRef("devices.id", "=", "software_seen.subject_id")
                .whereRef("devices.workspace_id", "=", "software_seen.workspace_id")
                .where("devices.revoked_at", "is", null),
            ),
          ]),
        )
        .orderBy("seen_at", "desc")
        .execute();
      return rows.map(
        (row): SoftwareSeen => ({
          subjectId: row.subject_id,
          kind: row.kind,
          participantId: row.participant_id,
          name: row.name,
          version: row.version,
          seenAt: row.seen_at,
          changedAt: row.changed_at,
        }),
      );
    },
    async workspaceOf(subjectId) {
      const row = await db
        .selectFrom("software_seen")
        .select("workspace_id")
        .where("subject_id", "=", subjectId)
        .orderBy("seen_at", "desc")
        .limit(1)
        .executeTakeFirst();
      return row?.workspace_id;
    },
  };
}
