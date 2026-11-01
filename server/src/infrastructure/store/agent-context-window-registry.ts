/** The Kysely adapter for the context window registry (ADR 0146). */

import type { AgentContextWindowCopy } from "@chipschat/protocol";
import type { Kysely } from "kysely";
import type {
  AgentContextWindow,
  AgentContextWindowRegistry,
  Compaction,
  WindowChange,
} from "../../application/ports/agent-context-windows.js";
import type { AgentContextWindowsTable, Database } from "../db/schema.js";

function parsed<T>(json: string | null): T | null {
  if (json === null) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function toWindow(row: AgentContextWindowsTable): AgentContextWindow | undefined {
  const said = parsed<AgentContextWindowCopy>(row.said);
  if (said === null) return undefined;
  return {
    workspaceId: row.workspace_id,
    agentId: row.agent_id,
    harnessId: row.harness_id,
    said,
    readAt: row.read_at,
    change: parsed<WindowChange>(row.change),
    compaction: parsed<Compaction>(row.compaction),
  };
}

export function createAgentContextWindowRegistry(db: Kysely<Database>): AgentContextWindowRegistry {
  const row = (workspaceId: string, agentId: string) =>
    db
      .selectFrom("agent_context_windows")
      .selectAll()
      .where("workspace_id", "=", workspaceId)
      .where("agent_id", "=", agentId)
      .executeTakeFirst();
  const set = async (
    workspaceId: string,
    agentId: string,
    columns: Partial<Pick<AgentContextWindowsTable, "change" | "compaction">>,
  ) => {
    await db
      .updateTable("agent_context_windows")
      .set(columns)
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
        .insertInto("agent_context_windows")
        .values({ workspace_id: copy.workspaceId, agent_id: copy.agentId, ...columns })
        .onConflict((conflict) =>
          conflict.columns(["workspace_id", "agent_id"]).doUpdateSet(columns),
        )
        .execute();
    },

    async get(workspaceId, agentId) {
      const found = await row(workspaceId, agentId);
      return found === undefined ? undefined : toWindow(found);
    },

    async ask(workspaceId, agentId, change) {
      await set(workspaceId, agentId, { change: JSON.stringify(change) });
    },

    // One process writes the database, so reading the change and writing it back is not raced.
    async answer({ workspaceId, agentId, changeId, state, message, at }) {
      const found = await row(workspaceId, agentId);
      const change = found === undefined ? null : parsed<WindowChange>(found.change);
      if (change?.id !== changeId || change.state !== "waiting") return false;
      const answered: WindowChange = { ...change, state, message, answeredAt: at };
      await set(workspaceId, agentId, { change: JSON.stringify(answered) });
      return true;
    },

    async compaction(workspaceId, agentId, compaction) {
      await set(workspaceId, agentId, { compaction: JSON.stringify(compaction) });
    },

    async remove(workspaceId, agentId) {
      await db
        .deleteFrom("agent_context_windows")
        .where("workspace_id", "=", workspaceId)
        .where("agent_id", "=", agentId)
        .execute();
    },

    async removeHarness(workspaceId, harnessId) {
      await db
        .deleteFrom("agent_context_windows")
        .where("workspace_id", "=", workspaceId)
        .where("harness_id", "=", harnessId)
        .execute();
    },
  };
}
