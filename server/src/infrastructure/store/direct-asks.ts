/** The Kysely adapter for direct asks and the link kept for the next guest (ADR 0211, Phase 3). */

import type { Kysely } from "kysely";
import type { DirectAsk, DirectAskRegistry } from "../../application/ports/direct-asks.js";
import type { Database, DirectAsksTable } from "../db/schema.js";

function toAsk(row: DirectAsksTable): DirectAsk {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    participantId: row.participant_id,
    deviceId: row.device_id,
    state: row.state,
    tripMs: row.trip_ms,
    link: row.link,
    sharedBy: row.shared_by,
    createdAt: row.created_at,
    sharedAt: row.shared_at,
    directAt: row.direct_at,
  };
}

export function createDirectAskRegistry(db: Kysely<Database>): DirectAskRegistry {
  const one = async (workspaceId: string, id: string) => {
    const row = await db
      .selectFrom("direct_asks")
      .selectAll()
      .where("workspace_id", "=", workspaceId)
      .where("id", "=", id)
      .executeTakeFirst();
    return row === undefined ? undefined : toAsk(row);
  };
  return {
    async create(ask) {
      await db
        .insertInto("direct_asks")
        .values({
          id: ask.id,
          workspace_id: ask.workspaceId,
          participant_id: ask.participantId,
          device_id: ask.deviceId,
          state: ask.state,
          trip_ms: ask.tripMs,
          link: ask.link,
          shared_by: ask.sharedBy,
          created_at: ask.createdAt,
          shared_at: ask.sharedAt,
          direct_at: ask.directAt,
        })
        .execute();
    },
    async latestFor(workspaceId, participantId) {
      const row = await db
        .selectFrom("direct_asks")
        .selectAll()
        .where("workspace_id", "=", workspaceId)
        .where("participant_id", "=", participantId)
        .orderBy("created_at", "desc")
        .orderBy("id", "desc")
        .executeTakeFirst();
      return row === undefined ? undefined : toAsk(row);
    },
    async waiting(workspaceId) {
      const rows = await db
        .selectFrom("direct_asks")
        .selectAll()
        .where("workspace_id", "=", workspaceId)
        .where("state", "=", "asked")
        .orderBy("created_at", "asc")
        .execute();
      return rows.map(toAsk);
    },
    get: one,
    async share(workspaceId, id, change) {
      const result = await db
        .updateTable("direct_asks")
        .set({ state: "shared", link: change.link, shared_by: change.by, shared_at: change.at })
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", id)
        .where("state", "=", "asked")
        .executeTakeFirst();
      return Number(result.numUpdatedRows) === 0 ? undefined : one(workspaceId, id);
    },
    async direct(workspaceId, id, at) {
      const result = await db
        .updateTable("direct_asks")
        .set({ state: "direct", direct_at: at })
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", id)
        .where("state", "=", "shared")
        .executeTakeFirst();
      return Number(result.numUpdatedRows) === 0 ? undefined : one(workspaceId, id);
    },
    async keptLink(workspaceId) {
      const row = await db
        .selectFrom("direct_links")
        .select("link")
        .where("workspace_id", "=", workspaceId)
        .executeTakeFirst();
      return row?.link;
    },
    async keep(workspaceId, kept) {
      if (kept === undefined) {
        await db.deleteFrom("direct_links").where("workspace_id", "=", workspaceId).execute();
        return;
      }
      await db
        .insertInto("direct_links")
        .values({ workspace_id: workspaceId, link: kept.link, kept_by: kept.by, kept_at: kept.at })
        .onConflict((conflict) =>
          conflict
            .column("workspace_id")
            .doUpdateSet({ link: kept.link, kept_by: kept.by, kept_at: kept.at }),
        )
        .execute();
    },
  };
}
