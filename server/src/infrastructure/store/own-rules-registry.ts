/** The Kysely adapter for what a harness runs on its own (ADR 0299). */

import type { OwnRules } from "@chipschat/protocol";
import type { Kysely } from "kysely";
import type { OwnRulesRegistry } from "../../application/ports/own-rules.js";
import type { Database } from "../db/schema.js";

export function createOwnRulesRegistry(db: Kysely<Database>): OwnRulesRegistry {
  return {
    async put({ workspaceId, harnessId, ownRules, heardAt }) {
      const row = { own_rules: JSON.stringify(ownRules), heard_at: heardAt };
      await db
        .insertInto("harness_own_rules")
        .values({ harness_id: harnessId, workspace_id: workspaceId, ...row })
        .onConflict((conflict) => conflict.column("harness_id").doUpdateSet(row))
        .execute();
    },
    async get(workspaceId, harnessId) {
      const row = await db
        .selectFrom("harness_own_rules")
        .selectAll()
        .where("workspace_id", "=", workspaceId)
        .where("harness_id", "=", harnessId)
        .executeTakeFirst();
      if (row === undefined) return undefined;
      try {
        return { ownRules: JSON.parse(row.own_rules) as OwnRules, heardAt: row.heard_at };
      } catch {
        return undefined;
      }
    },
  };
}
