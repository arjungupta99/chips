/** The Kysely adapter for the model registry (ADR 0140). */

import type { AgentModelCopy } from "@chipschat/protocol";
import type { Kysely } from "kysely";
import type {
  AgentModel,
  AgentModelRegistry,
  ModelChange,
} from "../../application/ports/agent-models.js";
import type { AgentModelsTable, Database } from "../db/schema.js";

function parsed<T>(json: string | null): T | null {
  if (json === null) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function toModel(row: AgentModelsTable): AgentModel | undefined {
  const said = parsed<AgentModelCopy>(row.said);
  if (said === null) return undefined;
  return {
    workspaceId: row.workspace_id,
    agentId: row.agent_id,
    harnessId: row.harness_id,
    said,
    readAt: row.read_at,
    change: parsed<ModelChange>(row.change),
  };
}

export function createAgentModelRegistry(db: Kysely<Database>): AgentModelRegistry {
  const row = (workspaceId: string, agentId: string) =>
    db
      .selectFrom("agent_models")
      .selectAll()
      .where("workspace_id", "=", workspaceId)
      .where("agent_id", "=", agentId)
      .executeTakeFirst();
  const setChange = async (workspaceId: string, agentId: string, change: ModelChange) => {
    await db
      .updateTable("agent_models")
      .set({ change: JSON.stringify(change) })
      .where("workspace_id", "=", workspaceId)
      .where("agent_id", "=", agentId)
      .execute();
  };
  return {
    async put(copy) {
      const columns = {
        harness_id: copy.harnessId,
        said: JSON.stringify(copy.said),
        read_at: copy.readAt,
      };
      await db
        .insertInto("agent_models")
        .values({ workspace_id: copy.workspaceId, agent_id: copy.agentId, ...columns })
        .onConflict((conflict) =>
          conflict.columns(["workspace_id", "agent_id"]).doUpdateSet(columns),
        )
        .execute();
    },

    async get(workspaceId, agentId) {
      const found = await row(workspaceId, agentId);
      return found === undefined ? undefined : toModel(found);
    },

    ask: setChange,

    // One process writes the database, so reading the change and writing it back is not raced.
    async answer({ workspaceId, agentId, changeId, state, message, at }) {
      const found = await row(workspaceId, agentId);
      const change = found === undefined ? null : parsed<ModelChange>(found.change);
      if (change?.id !== changeId || change.state !== "waiting") return false;
      await setChange(workspaceId, agentId, { ...change, state, message, answeredAt: at });
      return true;
    },

    async remove(workspaceId, agentId) {
      await db
        .deleteFrom("agent_models")
        .where("workspace_id", "=", workspaceId)
        .where("agent_id", "=", agentId)
        .execute();
    },

    async removeHarness(workspaceId, harnessId) {
      await db
        .deleteFrom("agent_models")
        .where("workspace_id", "=", workspaceId)
        .where("harness_id", "=", harnessId)
        .execute();
    },
  };
}
