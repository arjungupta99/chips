/**
 * A person archives an agent, or brings it back (ADR 0095, points 1 to 3).
 *
 * Archiving is what archiving it in its harness does (ADR 0087, rule 9), done by a person:
 * `agent.updated {state: "archived"}` with the person as its actor. What follows is one-room's,
 * as for a harness's archive — the agent's work stops, it leaves its room, and the room is
 * archived when no other agent was there — and the harness, hearing a person's archive, puts its
 * own side away. Unarchiving is `{state: "active"}`: the agent goes back to the room its archive
 * took it from, which opens again if the archive closed it.
 *
 * Who may: its harness's owner, or an owner or admin of the workspace, as for a move. Never a
 * guest, never a harness (it archives its own by registering it so), never the Main agent, which
 * stays in its Main room, and never an agent that was deleted. Not while a person has locked its
 * changes (ADR 0199), though an archived one that is locked may still be brought back.
 */

import { administers, isGuest } from "../../domain/roles.js";
import type { EventStore, ParticipantView, Principal, ReadModels } from "../ports/index.js";

export interface ArchiveAgentDeps {
  readonly store: Pick<EventStore, "append" | "head">;
  readonly readModels: Pick<ReadModels, "participant" | "workspaceRole">;
  readonly ids: { next: (kind: "event") => string };
  readonly clock: { nowIso: () => string };
}

export interface AgentKeepRefusal {
  readonly kind: "not_allowed" | "unknown_agent" | "invalid" | "agent_deleted";
  readonly message: string;
}

export type ArchiveAgentResult =
  | { readonly ok: true; readonly changed: boolean; readonly state: "active" | "archived" }
  | { readonly ok: false; readonly error: AgentKeepRefusal };

/** What each act is called once it is done, for the refusals that name it. */
const DONE: Readonly<Record<"archive" | "delete" | "lock", string>> = {
  archive: "archived",
  delete: "deleted",
  lock: "locked",
};

/**
 * Why this person may not archive, unarchive, delete or lock this agent, or the agent when they
 * may (ADR 0095, point 1; ADR 0199, point 5). Shared with the delete and the lock, which have the
 * same people and the same exceptions.
 */
export async function mayKeep(
  readModels: Pick<ReadModels, "participant" | "workspaceRole">,
  principal: Principal,
  agentId: string,
  verb: "archive" | "delete" | "lock",
): Promise<{ ok: true; agent: ParticipantView } | { ok: false; error: AgentKeepRefusal }> {
  const no = (kind: AgentKeepRefusal["kind"], message: string) =>
    ({ ok: false, error: { kind, message } }) as const;
  if (principal.kind !== "person") return no("not_allowed", `A person may ${verb} an agent.`);
  const { workspaceId, participantId } = principal;
  const standing = await readModels.workspaceRole(workspaceId, participantId);
  if (isGuest(standing)) return no("not_allowed", `A guest does not ${verb} agents.`);
  const agent = await readModels.participant(workspaceId, agentId);
  if (agent?.kind !== "agent") return no("unknown_agent", "No agent of that id here.");
  if (agent.removed_at !== null) return no("agent_deleted", "That agent was deleted.");
  if (agent.lead === true) {
    return no(
      "invalid",
      verb === "lock"
        ? "The Main agent is archived and deleted by nobody already, so it has no lock."
        : "The Main agent stays in its Main space: it is not archived or deleted.",
    );
  }
  if (agent.owner_id !== participantId && !administers(standing)) {
    return no(
      "not_allowed",
      `An agent is ${DONE[verb]} by its harness's owner, or an owner or admin of the workspace.`,
    );
  }
  return { ok: true, agent };
}

/**
 * The refusal for an agent whose changes a person locked (ADR 0199, point 7), or nothing when they
 * are not: no person renames, archives or deletes it until somebody lets them go.
 */
export function lockedRefusal(agent: ParticipantView): AgentKeepRefusal | undefined {
  if (agent.locked !== true) return undefined;
  return {
    kind: "invalid",
    message: `${agent.display_name}'s changes are locked: unlock them on its card first.`,
  };
}

export function createArchiveAgent(deps: ArchiveAgentDeps) {
  return async function archiveAgent(input: {
    readonly principal: Principal;
    readonly agentId: string;
    readonly state: "active" | "archived";
  }): Promise<ArchiveAgentResult> {
    const { principal, agentId, state } = input;
    const may = await mayKeep(deps.readModels, principal, agentId, "archive");
    if (!may.ok) return may;
    if ((may.agent.state ?? "active") === state) return { ok: true, changed: false, state };
    // Bringing one back only puts it back, so a lock holds an archive and not that (ADR 0199).
    const locked = state === "archived" ? lockedRefusal(may.agent) : undefined;
    if (locked !== undefined) return { ok: false, error: locked };
    const head = await deps.store.head(principal.workspaceId);
    await deps.store.append({
      v: 1,
      type: "agent.updated",
      id: deps.ids.next("event"),
      ts: deps.clock.nowIso(),
      workspace_id: principal.workspaceId,
      actor: { kind: "person", id: principal.participantId },
      // The same ask twice at once is one event; archived again later is a new one.
      idempotency_key: `agent-state-${agentId}-${state}-at-${head}`,
      agent_id: agentId,
      state,
    });
    return { ok: true, changed: true, state };
  };
}

export type ArchiveAgent = ReturnType<typeof createArchiveAgent>;
