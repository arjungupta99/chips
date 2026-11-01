/**
 * Move an agent into a room (ADR 0087, point 4 and rule 1): take it out of the room it is in and
 * put it in this one. The room it left says where it went, and its runs there are stopped, as an
 * archive stops them: an agent is in one room at a time, and so is its work.
 *
 * Who may: a person in the room it goes to, who is not a guest, and who owns the agent's harness
 * or is an owner or admin of the workspace. A move takes the agent out of a room other people may
 * be using, so it is not every member's to make. Never the Main agent, never into a Main room, and
 * never an agent archived in its harness.
 */

import { administers, isGuest } from "../../domain/roles.js";
import type { EventStore, Principal, ReadModels } from "../ports/index.js";
import type { OneRoom } from "./one-room.js";

export interface MoveAgentDeps {
  readonly store: Pick<EventStore, "append" | "head">;
  readonly readModels: Pick<
    ReadModels,
    "participant" | "space" | "memberRole" | "workspaceRole" | "agentRoom"
  >;
  readonly ids: { next: (kind: "event") => string };
  readonly clock: { nowIso: () => string };
  readonly oneRoom: Pick<OneRoom, "takeOut">;
}

export interface MoveRefusal {
  readonly kind: "not_allowed" | "unknown_agent" | "unknown_space" | "invalid";
  readonly message: string;
}

export type MoveResult =
  | { readonly ok: true; readonly moved: boolean; readonly from: string | null }
  | { readonly ok: false; readonly error: MoveRefusal };

function refused(kind: MoveRefusal["kind"], message: string): MoveResult {
  return { ok: false, error: { kind, message } };
}

export function createMoveAgent(deps: MoveAgentDeps) {
  const { readModels } = deps;

  /** Why this person may not move this agent into this room, or nothing when they may. */
  async function refusal(
    principal: Principal,
    agentId: string,
    spaceId: string,
  ): Promise<MoveResult | undefined> {
    if (principal.kind !== "person") return refused("not_allowed", "A person moves an agent.");
    const { workspaceId, participantId } = principal;
    const standing = await readModels.workspaceRole(workspaceId, participantId);
    if (isGuest(standing)) return refused("not_allowed", "A guest does not move agents.");
    const agent = await readModels.participant(workspaceId, agentId);
    if (agent?.kind !== "agent") return refused("unknown_agent", "No agent of that id here.");
    const space = await readModels.space(workspaceId, spaceId);
    const role = await readModels.memberRole(workspaceId, spaceId, participantId);
    if (space === undefined || role === undefined || space.parent_space_id !== null) {
      return refused("unknown_space", "No space of that id here.");
    }
    const owns = agent.owner_id === participantId || administers(standing);
    return mayMove(role, owns) ?? why(agent, space);
  }

  /** A guest in the room moves nothing, and nobody moves an agent that is not theirs to. */
  function mayMove(role: string, owns: boolean): MoveResult | undefined {
    if (role === "guest") return refused("not_allowed", "A guest does not move agents.");
    if (owns) return undefined;
    return refused(
      "not_allowed",
      "An agent is moved by its harness's owner, or an owner or admin of the workspace.",
    );
  }

  /** What about the agent or the room refuses a move, whoever asks. */
  function why(
    agent: { readonly lead?: boolean; readonly state?: string; readonly removed_at: string | null },
    space: { readonly home: boolean; readonly state: string },
  ): MoveResult | undefined {
    if (agent.removed_at !== null)
      return refused("invalid", "That agent was deleted, or its harness removed.");
    if (agent.lead === true) return refused("invalid", "The Main agent stays in its Main space.");
    if (space.home) return refused("invalid", "A Main space takes people, and no other agent.");
    if (agent.state === "archived") {
      return refused("invalid", "That agent was archived in its harness.");
    }
    if (space.state !== "open") return refused("invalid", "Unarchive the space first.");
    return undefined;
  }

  /** It is taken out of the room it leaves, saying where it went; that stops its runs there. */
  async function leave(
    who: { readonly workspaceId: string; readonly participantId: string },
    agentId: string,
    from: string,
    to: string,
    head: number,
  ): Promise<void> {
    const { workspaceId, participantId } = who;
    await deps.oneRoom.takeOut(workspaceId, from, agentId, {
      reason: "moved",
      by: participantId,
      actor: { kind: "person", id: participantId },
      movedTo: to,
      key: `move-out-${agentId}-${to}-at-${head}`,
    });
  }

  return async function moveAgent(input: {
    readonly principal: Principal;
    readonly agentId: string;
    readonly spaceId: string;
  }): Promise<MoveResult> {
    const { principal, agentId, spaceId } = input;
    const refused = await refusal(principal, agentId, spaceId);
    if (refused !== undefined) return refused;
    const { workspaceId, participantId } = principal;
    const from = (await readModels.agentRoom(workspaceId, agentId)) ?? null;
    if (from === spaceId) return { ok: true, moved: false, from };
    const head = await deps.store.head(workspaceId);
    if (from !== null) await leave(principal, agentId, from, spaceId, head);
    await deps.store.append({
      v: 1,
      type: "membership.added",
      id: deps.ids.next("event"),
      ts: deps.clock.nowIso(),
      workspace_id: workspaceId,
      space_id: spaceId,
      actor: { kind: "person", id: participantId },
      idempotency_key: `move-in-${agentId}-${spaceId}-at-${head}`,
      participant_id: agentId,
      participant_kind: "agent",
      role: "member",
      ...(from === null ? {} : { moved_from: from }),
    });
    return { ok: true, moved: true, from };
  };
}

export type MoveAgent = ReturnType<typeof createMoveAgent>;
