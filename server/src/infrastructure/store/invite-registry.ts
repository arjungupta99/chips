/** The Kysely adapter for the invite registry (ADR 0034). */

import type { Kysely, Selectable } from "kysely";
import type { InviteRegistry, InviteView } from "../../application/ports/invites.js";
import type { Database, InvitesTable } from "../db/schema.js";

function toView(row: Selectable<InvitesTable>): InviteView {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    role: row.role,
    singleUse: row.single_use === 1,
    uses: row.uses,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    spaceId: row.space_id ?? null,
    asks: row.asks === 1,
  };
}

export function createInviteRegistry(db: Kysely<Database>): InviteRegistry {
  return {
    async addInvite(invite) {
      await db
        .insertInto("invites")
        .values({
          id: invite.id,
          workspace_id: invite.workspaceId,
          token_hash: invite.tokenHash,
          role: invite.role,
          single_use: invite.singleUse ? 1 : 0,
          uses: 0,
          created_by: invite.createdBy,
          created_at: invite.createdAt,
          expires_at: invite.expiresAt,
          revoked_at: null,
          space_id: invite.spaceId ?? null,
          asks: invite.asks ? 1 : 0,
        })
        .execute();
    },

    async invite(workspaceId, inviteId) {
      const row = await db
        .selectFrom("invites")
        .selectAll()
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", inviteId)
        .executeTakeFirst();
      return row === undefined ? undefined : toView(row);
    },

    async inviteByHash(tokenHash) {
      // The unique index on token_hash is this query's.
      const row = await db
        .selectFrom("invites")
        .selectAll()
        .where("token_hash", "=", tokenHash)
        .executeTakeFirst();
      return row === undefined ? undefined : toView(row);
    },

    async invitesIn(workspaceId) {
      const rows = await db
        .selectFrom("invites")
        .selectAll()
        .where("workspace_id", "=", workspaceId)
        .orderBy("created_at", "desc")
        .orderBy("id", "desc")
        .execute();
      return rows.map(toView);
    },

    async revokeInvite({ workspaceId, inviteId, at }) {
      const result = await db
        .updateTable("invites")
        .set({ revoked_at: at })
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", inviteId)
        .where("revoked_at", "is", null)
        .executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    },

    async noteUse({ workspaceId, inviteId, singleUse }) {
      // One statement, so two redeemers racing for a single-use invite cannot both win: the
      // predicate on `uses` is what decides, inside the database.
      let query = db
        .updateTable("invites")
        .set((eb) => ({ uses: eb("uses", "+", 1) }))
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", inviteId)
        .where("revoked_at", "is", null);
      if (singleUse) query = query.where("uses", "=", 0);
      const result = await query.executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    },
  };
}
