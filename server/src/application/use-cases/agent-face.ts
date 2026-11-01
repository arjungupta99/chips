/**
 * A person gives an agent a face (ADR 0089): a mark from Chips' library on one of its grounds, in
 * place of the agent's initials, or the initials back.
 *
 * It is the agent's face and not the person's view of it. An agent speaks in rooms other people
 * are in, so the face beside its words is the same for everyone, unlike a space's, which is each
 * person's own (`/v1/me/space-icons`). So it is the log's: `agent.updated` carries it, the
 * agent's row keeps it, and every screen reads the directory again.
 *
 * Who may: a person who is not a guest. A face changes nothing an agent does and takes it out of
 * no room, so it is not kept to the harness's owner as a move is. A harness does not set one.
 */

import { createHash } from "node:crypto";
import type { SpaceIcon } from "@chipschat/protocol";
import { isGuest } from "../../domain/roles.js";
import type { EventStore, Principal, ReadModels } from "../ports/index.js";

export interface AgentFaceDeps {
  readonly store: Pick<EventStore, "append" | "head">;
  readonly readModels: Pick<ReadModels, "participant" | "workspaceRole">;
  readonly ids: { next: (kind: "event") => string };
  readonly clock: { nowIso: () => string };
}

export interface FaceRefusal {
  readonly kind: "not_allowed" | "unknown_agent";
  readonly message: string;
}

export type FaceResult =
  | { readonly ok: true; readonly changed: boolean; readonly face: SpaceIcon | null }
  | { readonly ok: false; readonly error: FaceRefusal };

function refused(kind: FaceRefusal["kind"], message: string): FaceResult {
  return { ok: false, error: { kind, message } };
}

/** Whether two faces are one: the same mark, ground and letters (ADR 0139), or both none. */
export function sameFace(a: SpaceIcon | null, b: SpaceIcon | null): boolean {
  if (a === null || b === null) return a === b;
  return a.icon === b.icon && a.ground === b.ground && a.letters === b.letters;
}

export function createSetAgentFace(deps: AgentFaceDeps) {
  return async function setAgentFace(input: {
    readonly principal: Principal;
    readonly agentId: string;
    /** `null` takes the choice back: the agent wears its initials again. */
    readonly face: SpaceIcon | null;
  }): Promise<FaceResult> {
    const { principal, agentId, face } = input;
    if (principal.kind !== "person") {
      return refused("not_allowed", "A person chooses an agent's face.");
    }
    const { workspaceId, participantId } = principal;
    const standing = await deps.readModels.workspaceRole(workspaceId, participantId);
    if (isGuest(standing))
      return refused("not_allowed", "A guest does not change an agent's face.");
    const agent = await deps.readModels.participant(workspaceId, agentId);
    if (agent?.kind !== "agent") return refused("unknown_agent", "No agent of that id here.");
    // Deleted stays deleted (ADR 0095): it has no name or face to change.
    if (agent.removed_at !== null) return refused("unknown_agent", "That agent was deleted.");
    if (sameFace(agent.face ?? null, face)) return { ok: true, changed: false, face };
    const head = await deps.store.head(workspaceId);
    const change = createHash("sha256").update(JSON.stringify(face)).digest("hex").slice(0, 32);
    await deps.store.append({
      v: 1,
      type: "agent.updated",
      id: deps.ids.next("event"),
      ts: deps.clock.nowIso(),
      workspace_id: workspaceId,
      actor: { kind: "person", id: participantId },
      // The same face twice at once is one event; the same face again later is a new one.
      idempotency_key: `agent-face-${agentId}-${change}-at-${head}`,
      agent_id: agentId,
      face,
    });
    return { ok: true, changed: true, face };
  };
}

export type SetAgentFace = ReturnType<typeof createSetAgentFace>;
