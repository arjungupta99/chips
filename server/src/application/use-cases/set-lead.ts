/**
 * A person chooses who leads a room, or that nobody does (ADR 0104).
 *
 * The lead hands out the work in the room, and Chips hands it what was nobody's turn once the room
 * goes still (`lead-turns`). A person in the room who is not a guest there or in the workspace
 * chooses it: one of the room's agents, or nobody. Choosing the lead it has already changes
 * nothing. One event, `space.lead_set`.
 */

import { isAgentKind } from "@chipschat/protocol";
import { isGuest } from "../../domain/roles.js";
import type { EventStore, Principal, ReadModels } from "../ports/index.js";

export interface SetLeadDeps {
  readonly store: Pick<EventStore, "append" | "head">;
  readonly readModels: Pick<ReadModels, "memberRole" | "workspaceRole" | "membersOf" | "leadOf">;
  readonly ids: { next: (kind: "event") => string };
  readonly clock: { nowIso: () => string };
}

export interface LeadRefusal {
  readonly kind: "not_allowed" | "unknown_space" | "not_there";
  readonly message: string;
}

export type SetLeadResult =
  | { readonly ok: true; readonly changed: boolean; readonly lead: string | null }
  | { readonly ok: false; readonly error: LeadRefusal };

function refused(kind: LeadRefusal["kind"], message: string): SetLeadResult {
  return { ok: false, error: { kind, message } };
}

export function createSetLead(deps: SetLeadDeps) {
  /** Why this principal may not choose who leads this room, or nothing when they may. */
  async function refusalOf(principal: Principal, spaceId: string) {
    if (principal.kind !== "person") return refused("not_allowed", "A person chooses the lead.");
    const { workspaceId, participantId } = principal;
    const standing = await deps.readModels.workspaceRole(workspaceId, participantId);
    if (isGuest(standing)) return refused("not_allowed", "A guest does not choose the lead.");
    const role = await deps.readModels.memberRole(workspaceId, spaceId, participantId);
    if (role === undefined) return refused("unknown_space", "No space of that id that you are in.");
    if (role === "guest") return refused("not_allowed", "A guest does not choose the lead.");
    return undefined;
  }

  return async function setLead(input: {
    readonly principal: Principal;
    readonly spaceId: string;
    readonly agentId: string | null;
  }): Promise<SetLeadResult> {
    const { principal, spaceId, agentId } = input;
    const refusal = await refusalOf(principal, spaceId);
    if (refusal !== undefined) return refusal;
    const { workspaceId, participantId } = principal;
    if (agentId !== null) {
      const members = await deps.readModels.membersOf(workspaceId, spaceId);
      const there = members.some(
        (member) =>
          member.participant_id === agentId && isAgentKind(member.kind) && member.removed !== true,
      );
      if (!there) return refused("not_there", "That agent is not in this space.");
    }
    const now = (await deps.readModels.leadOf(workspaceId, spaceId)) ?? null;
    if (now === agentId) return { ok: true, changed: false, lead: agentId };
    const head = await deps.store.head(workspaceId);
    await deps.store.append({
      v: 1,
      type: "space.lead_set",
      id: deps.ids.next("event"),
      ts: deps.clock.nowIso(),
      workspace_id: workspaceId,
      space_id: spaceId,
      actor: { kind: "person", id: participantId },
      idempotency_key: `lead-${spaceId}-${agentId ?? "none"}-at-${head}`,
      agent_id: agentId,
    });
    return { ok: true, changed: true, lead: agentId };
  };
}

export type SetLead = ReturnType<typeof createSetLead>;
