/** The Kysely adapter for the workspace registry: the `workspaces` row. */

import type { Kysely } from "kysely";
import type { WorkspaceRegistry } from "../../application/ports/workspaces.js";
import type { Database } from "../db/schema.js";

export function createWorkspaceRegistry(db: Kysely<Database>): WorkspaceRegistry {
  return {
    async rename({ workspaceId, name }) {
      await db.updateTable("workspaces").set({ name }).where("id", "=", workspaceId).execute();
    },
  };
}
