/** The Kysely adapter for the context registry (ADR 0134). */

import type { ContextFile, NotShownFile, SharedContextFile } from "@chipschat/protocol";
import type { Kysely } from "kysely";
import type {
  ContextEdit,
  ContextOwner,
  ContextRegistry,
  ContextSet,
} from "../../application/ports/context-files.js";
import type { ContextEditsTable, ContextSetsTable, Database } from "../db/schema.js";

function list<T>(json: string): T[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function toSet(row: ContextSetsTable): ContextSet {
  return {
    owner: { workspaceId: row.workspace_id, kind: row.owner_kind, id: row.owner_id },
    harnessId: row.harness_id,
    files: list<ContextFile | SharedContextFile>(row.files),
    notShown: list<NotShownFile>(row.not_shown),
    newAgentsNote: row.new_agents_note,
    readNote: row.read_note,
    readAt: row.read_at,
  };
}

function toEdit(row: ContextEditsTable): ContextEdit {
  return {
    id: row.id,
    owner: { workspaceId: row.workspace_id, kind: row.owner_kind, id: row.owner_id },
    harnessId: row.harness_id,
    name: row.name,
    baseHash: row.base_hash,
    text: row.text,
    askedBy: row.asked_by,
    askedAt: row.asked_at,
    state: row.state,
    message: row.message,
    answeredAt: row.answered_at,
  };
}

export function createContextRegistry(db: Kysely<Database>): ContextRegistry {
  const whose = (owner: ContextOwner) =>
    ({ workspace_id: owner.workspaceId, owner_kind: owner.kind, owner_id: owner.id }) as const;
  return {
    async put(set) {
      const columns = {
        harness_id: set.harnessId,
        files: JSON.stringify(set.files),
        not_shown: JSON.stringify(set.notShown),
        new_agents_note: set.newAgentsNote,
        read_note: set.readNote,
        read_at: set.readAt,
      };
      await db
        .insertInto("context_sets")
        .values({ ...whose(set.owner), ...columns })
        .onConflict((conflict) =>
          conflict.columns(["workspace_id", "owner_kind", "owner_id"]).doUpdateSet(columns),
        )
        .execute();
    },

    async get(owner) {
      const row = await db
        .selectFrom("context_sets")
        .selectAll()
        .where("workspace_id", "=", owner.workspaceId)
        .where("owner_kind", "=", owner.kind)
        .where("owner_id", "=", owner.id)
        .executeTakeFirst();
      return row === undefined ? undefined : toSet(row);
    },

    async remove(owner) {
      for (const table of ["context_sets", "context_edits"] as const) {
        await db
          .deleteFrom(table)
          .where("workspace_id", "=", owner.workspaceId)
          .where("owner_kind", "=", owner.kind)
          .where("owner_id", "=", owner.id)
          .execute();
      }
    },

    async removeHarness(workspaceId, harnessId) {
      for (const table of ["context_sets", "context_edits"] as const) {
        await db
          .deleteFrom(table)
          .where("workspace_id", "=", workspaceId)
          .where("harness_id", "=", harnessId)
          .execute();
      }
    },

    async addEdit(edit) {
      await db
        .insertInto("context_edits")
        .values({
          id: edit.id,
          ...whose(edit.owner),
          harness_id: edit.harnessId,
          name: edit.name,
          base_hash: edit.baseHash,
          text: edit.text,
          asked_by: edit.askedBy,
          asked_at: edit.askedAt,
          state: edit.state,
          message: edit.message,
          answered_at: edit.answeredAt,
        })
        .execute();
    },

    async edit(workspaceId, id) {
      const row = await db
        .selectFrom("context_edits")
        .selectAll()
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", id)
        .executeTakeFirst();
      return row === undefined ? undefined : toEdit(row);
    },

    async answer({ workspaceId, id, state, message, at }) {
      const result = await db
        .updateTable("context_edits")
        .set({ state, message, answered_at: at, text: "" })
        .where("workspace_id", "=", workspaceId)
        .where("id", "=", id)
        .where("state", "=", "waiting")
        .executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    },
  };
}
