/**
 * A person renames an agent (ADR 0091).
 *
 * Who may: a person who is not a guest, as with its face (ADR 0089), while its changes are not
 * locked (ADR 0199). An agent's name is the one
 * everybody in its rooms sees and types after an @, so it is one for everybody, the log's:
 * `agent.updated` carries it with the person as its actor, the agent's row keeps it and says who
 * named it (`name_by`), and from then on its harness asking for another name changes nothing.
 *
 * What it may be: what a person's own name may be (`cleanDisplayName`, and nothing `nameProblem`
 * refuses), never Main or You (SEC-33), and nobody else's here, case and spaces aside. A person asked for a name, so a clash is refused with who has it, never
 * numbered as a harness's ask is.
 */

import { createHash } from "node:crypto";
import { NOT_AN_AGENT_WORDS, nameProblem, notAnAgentName } from "@chipschat/protocol";
import { isGuest } from "../../domain/roles.js";
import { nameHolder } from "../agents.js";
import type { EventStore, ParticipantView, Principal, ReadModels } from "../ports/index.js";
import { cleanDisplayName, takenWords } from "./join-workspace.js";

export interface RenameAgentDeps {
  readonly store: Pick<EventStore, "append" | "head">;
  readonly readModels: Pick<ReadModels, "participant" | "participantsIn" | "workspaceRole">;
  readonly ids: { next: (kind: "event") => string };
  readonly clock: { nowIso: () => string };
}

export interface AgentNameRefusal {
  readonly kind: "not_allowed" | "unknown_agent" | "invalid" | "taken";
  readonly message: string;
}

export type AgentNameResult =
  | { readonly ok: true; readonly changed: boolean; readonly name: string }
  | { readonly ok: false; readonly error: AgentNameRefusal };

function refused(kind: AgentNameRefusal["kind"], message: string): AgentNameResult {
  return { ok: false, error: { kind, message } };
}

/** The agent, unless there is none by that id or a person deleted it (ADR 0095). */
async function liveAgent(deps: RenameAgentDeps, workspaceId: string, agentId: string) {
  const agent = await deps.readModels.participant(workspaceId, agentId);
  return agent?.kind === "agent" && agent.removed_at === null ? agent : undefined;
}

/**
 * The agent this person may rename, or why they may not: a person who is not a guest, and an agent
 * that is here and whose changes nobody locked (ADR 0199).
 */
async function renamable(
  deps: RenameAgentDeps,
  principal: Principal,
  agentId: string,
): Promise<{ readonly agent: ParticipantView } | { readonly refusal: AgentNameResult }> {
  if (principal.kind !== "person") {
    return { refusal: refused("not_allowed", "A person names an agent.") };
  }
  const { workspaceId, participantId } = principal;
  const standing = await deps.readModels.workspaceRole(workspaceId, participantId);
  if (isGuest(standing)) {
    return { refusal: refused("not_allowed", "A guest does not rename an agent.") };
  }
  const agent = await liveAgent(deps, workspaceId, agentId);
  if (agent === undefined) {
    return { refusal: refused("unknown_agent", "No agent of that id here.") };
  }
  if (agent.locked === true) {
    const why = `${agent.display_name}'s changes are locked: unlock them on its card first.`;
    return { refusal: refused("invalid", why) };
  }
  return { agent };
}

export function createRenameAgent(deps: RenameAgentDeps) {
  return async function renameAgent(input: {
    readonly principal: Principal;
    readonly agentId: string;
    readonly name: string;
  }): Promise<AgentNameResult> {
    const { principal, agentId } = input;
    const may = await renamable(deps, principal, agentId);
    if ("refusal" in may) return may.refusal;
    const { agent } = may;
    const { workspaceId, participantId } = principal;
    const name = cleanDisplayName(input.name);
    if (name === undefined) return refused("invalid", "A name is something, up to 120 characters.");
    if (name === agent.display_name) return { ok: true, changed: false, name };
    const problem = notAnAgentName(name) ? NOT_AN_AGENT_WORDS : nameProblem(name);
    if (problem !== undefined) return refused("invalid", problem);
    const holder = nameHolder(await deps.readModels.participantsIn(workspaceId), agentId, name);
    if (holder !== undefined) return refused("taken", takenWords(holder));
    const head = await deps.store.head(workspaceId);
    const change = createHash("sha256").update(name).digest("hex").slice(0, 32);
    await deps.store.append({
      v: 1,
      type: "agent.updated",
      id: deps.ids.next("event"),
      ts: deps.clock.nowIso(),
      workspace_id: workspaceId,
      actor: { kind: "person", id: participantId },
      // The same name twice at once is one event; the same name again later is a new one.
      idempotency_key: `agent-name-${agentId}-${change}-at-${head}`,
      agent_id: agentId,
      name,
    });
    return { ok: true, changed: true, name };
  };
}

export type RenameAgent = ReturnType<typeof createRenameAgent>;
