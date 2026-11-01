/** The Kysely adapter for the harness registry: participants of kind `harness`, and their tokens. */

import type { Kysely } from "kysely";
import type { HarnessRegistry } from "../../application/ports/harnesses.js";
import type { Database } from "../db/schema.js";

export function createHarnessRegistry(db: Kysely<Database>): HarnessRegistry {
  return {
    async addHarness(harness) {
      await db
        .insertInto("participants")
        .values({
          id: harness.id,
          workspace_id: harness.workspaceId,
          kind: "harness",
          display_name: harness.displayName,
          owner_id: harness.ownerId,
          parent_id: harness.parentId ?? null,
          ephemeral: harness.ephemeral === true ? 1 : 0,
          capabilities:
            harness.capabilities === undefined ? null : JSON.stringify(harness.capabilities),
          created_at: harness.createdAt,
        })
        .execute();
    },
    async setOwner({ workspaceId, harnessId, ownerId }) {
      const result = await db
        .updateTable("participants")
        .set({ owner_id: ownerId })
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", harnessId)
        .where("kind", "=", "harness")
        .executeTakeFirst();
      return (result.numUpdatedRows ?? 0n) > 0n;
    },
    async setCapabilities({ workspaceId, harnessId, capabilities }) {
      const result = await db
        .updateTable("participants")
        .set({ capabilities: JSON.stringify(capabilities) })
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", harnessId)
        .where("kind", "=", "harness")
        .executeTakeFirst();
      return (result.numUpdatedRows ?? 0n) > 0n;
    },
    async markRemoved({ workspaceId, harnessId, at }) {
      // Only a harness still here: the first removal's time is the one the audit has.
      const result = await db
        .updateTable("participants")
        .set({ removed_at: at })
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", harnessId)
        .where("kind", "=", "harness")
        .where("removed_at", "is", null)
        .executeTakeFirst();
      return (result.numUpdatedRows ?? 0n) > 0n;
    },
    async tokens(workspaceId, harnessId) {
      const rows = await db
        .selectFrom("harness_tokens")
        .select(["id", "name", "created_at", "last_used_at", "revoked_at"])
        .where("workspace_id", "=", workspaceId)
        .where("harness_id", "=", harnessId)
        .orderBy("created_at", "desc")
        .execute();
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
        revokedAt: row.revoked_at,
      }));
    },
    async revokeToken({ workspaceId, harnessId, tokenId, at }) {
      // Scoped to the workspace and the harness, and only a token that is still live: revoking
      // one twice is not an event, and the second time it changes nothing.
      const result = await db
        .updateTable("harness_tokens")
        .set({ revoked_at: at })
        .where("id", "=", tokenId)
        .where("workspace_id", "=", workspaceId)
        .where("harness_id", "=", harnessId)
        .where("revoked_at", "is", null)
        .executeTakeFirst();
      return (result.numUpdatedRows ?? 0n) > 0n;
    },
    async addToken(token) {
      await db
        .insertInto("harness_tokens")
        .values({
          id: token.id,
          workspace_id: token.workspaceId,
          harness_id: token.harnessId,
          token_hash: token.tokenHash,
          name: token.name,
          created_at: token.createdAt,
          last_used_at: null,
          revoked_at: null,
        })
        .execute();
    },
  };
}
