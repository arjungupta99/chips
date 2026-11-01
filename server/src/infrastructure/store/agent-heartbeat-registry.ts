/** The Kysely adapter for the heartbeat registry (ADR 0143). */

import type { AgentHeartbeatCopy } from "@chipschat/protocol";
import type { Kysely } from "kysely";
import type {
  AgentHeartbeat,
  AgentHeartbeatRegistry,
  HeartbeatChange,
} from "../../application/ports/agent-heartbeats.js";
import type { AgentHeartbeatsTable, Database } from "../db/schema.js";

function parsed<T>(json: string | null): T | null {
  if (json === null) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function toHeartbeat(row: AgentHeartbeatsTable): AgentHeartbeat | undefined {
  const said = parsed<AgentHeartbeatCopy>(row.said);
  if (said === null) return undefined;
  return {
    workspaceId: row.workspace_id,
    agentId: row.agent_id,
    harnessId: row.harness_id,
    said,
    readAt: row.read_at,
    change: parsed<HeartbeatChange>(row.change),
  };
}

export function createAgentHeartbeatRegistry(db: Kysely<Database>): AgentHeartbeatRegistry {
  const row = (workspaceId: string, agentId: string) =>
    db
      .selectFrom("agent_heartbeats")
      .selectAll()
      .where("workspace_id", "=", workspaceId)
      .where("agent_id", "=", agentId)
      .executeTakeFirst();
  const setChange = async (workspaceId: string, agentId: string, change: HeartbeatChange) => {
    await db
      .updateTable("agent_heartbeats")
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
        .insertInto("agent_heartbeats")
        .values({ workspace_id: copy.workspaceId, agent_id: copy.agentId, ...columns })
        .onConflict((conflict) =>
          conflict.columns(["workspace_id", "agent_id"]).doUpdateSet(columns),
        )
        .execute();
    },

    async get(workspaceId, agentId) {
      const found = await row(workspaceId, agentId);
      return found === undefined ? undefined : toHeartbeat(found);
    },

    ask: setChange,

    // One process writes the database, so reading the change and writing it back is not raced.
    async answer({ workspaceId, agentId, changeId, state, message, at }) {
      const found = await row(workspaceId, agentId);
      const change = found === undefined ? null : parsed<HeartbeatChange>(found.change);
      if (change?.id !== changeId || change.state !== "waiting") return false;
      await setChange(workspaceId, agentId, { ...change, state, message, answeredAt: at });
      return true;
    },

    async remove(workspaceId, agentId) {
      await db
        .deleteFrom("agent_heartbeats")
        .where("workspace_id", "=", workspaceId)
        .where("agent_id", "=", agentId)
        .execute();
    },

    async removeHarness(workspaceId, harnessId) {
      await db
        .deleteFrom("agent_heartbeats")
        .where("workspace_id", "=", workspaceId)
        .where("harness_id", "=", harnessId)
        .execute();
    },
  };
}
