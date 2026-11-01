/**
 * A person deletes an agent (ADR 0095, points 4 to 6).
 *
 * In order:
 *
 * 1. **Its room.** When the person asked for its room to go too (`delete_room`), the room is
 *    erased as Spaces' Delete erases it (ADR 0067), which stops the work there and frees the
 *    agent. That is offered only for the room's one agent, to a person who may delete the room,
 *    and the erase's own refusal is the answer when they may not — a room whose changes are
 *    locked among them (ADR 0156) — before anything has changed. Otherwise the agent's work there
 *    stops, it is taken out (`agent_deleted`), and the room is archived when no other agent is
 *    left in it, as an archive would leave it.
 * 2. **`agent.deleted`**, with the person as its actor. The agent is removed, as a harness is
 *    (ADR 0078): gone from every list, its words kept under its name and face. Its key is retired,
 *    so its harness asking for it again is refused, and the words it was holding go. Its harness
 *    hears the event and deletes its own side.
 *
 * Who may: as for an archive (`mayKeep`), and never while a person has locked its changes (ADR
 * 0199), refused before anything changes.
 */

import type { AgentContextWindowRegistry } from "../ports/agent-context-windows.js";
import type { AgentHeartbeatRegistry } from "../ports/agent-heartbeats.js";
import type { AgentModelRegistry } from "../ports/agent-models.js";
import type { ContextRegistry } from "../ports/context-files.js";
import type { EventStore, Principal, ReadModels } from "../ports/index.js";
import { type AgentKeepRefusal, lockedRefusal, mayKeep } from "./archive-agent.js";
import type { EraseFailure, EraseSpace } from "./erase-space.js";
import type { OneRoom } from "./one-room.js";

export interface DeleteAgentDeps {
  readonly store: Pick<EventStore, "append">;
  readonly readModels: Pick<
    ReadModels,
    "participant" | "workspaceRole" | "agentRoom" | "membersOf" | "space"
  >;
  readonly ids: { next: (kind: "event") => string };
  readonly clock: { nowIso: () => string };
  readonly oneRoom: Pick<OneRoom, "takeOut" | "closeIfEmpty">;
  readonly eraseSpace: EraseSpace;
  /** Its context files' copy and edits, forgotten with it (ADR 0134). */
  readonly context?: Pick<ContextRegistry, "remove">;
  /** Its model's copy and last change, forgotten with it (ADR 0140). */
  readonly models?: Pick<AgentModelRegistry, "remove">;
  /** Its heartbeat's copy and last change, forgotten with it (ADR 0143). */
  readonly heartbeats?: Pick<AgentHeartbeatRegistry, "remove">;
  /** Its context window's copy and asks, forgotten with it (ADR 0146). */
  readonly windows?: Pick<AgentContextWindowRegistry, "remove">;
}

export type DeleteAgentResult =
  | {
      readonly ok: true;
      readonly deleted: boolean;
      /** What became of its room: none, archived, erased, or left open for the others there. */
      readonly room: "none" | "archived" | "erased" | "open";
      /** The room and its threads, when it was erased with the agent. */
      readonly erased?: readonly string[] | undefined;
    }
  | { readonly ok: false; readonly error: AgentKeepRefusal | EraseFailure };

/** What became of the agent's room as it left, or why it could not leave as asked. */
type Left =
  | {
      readonly ok: true;
      readonly room: "none" | "archived" | "erased" | "open";
      readonly erased?: readonly string[] | undefined;
    }
  | { readonly ok: false; readonly error: AgentKeepRefusal | EraseFailure };

export function createDeleteAgent(deps: DeleteAgentDeps) {
  const { readModels } = deps;

  /** Out of its room: erased with it when asked, or taken out and the room archived if empty. */
  async function leaveRoom(
    principal: Principal,
    agentId: string,
    deleteRoom: boolean,
  ): Promise<Left> {
    const spaceId = await readModels.agentRoom(principal.workspaceId, agentId);
    if (spaceId === undefined) {
      if (!deleteRoom) return { ok: true, room: "none" };
      return refusedRoom("It isn't in a space, so there is no space to delete with it.");
    }
    const agents = (await readModels.membersOf(principal.workspaceId, spaceId)).filter(
      (member) => member.kind === "agent",
    );
    if (deleteRoom) return await eraseWith(principal, spaceId, agents.length);
    // A room whose changes are locked stays open when its one agent goes (ADR 0156).
    const locked = (await readModels.space(principal.workspaceId, spaceId))?.locked === true;
    await takeOutOf(principal, spaceId, agentId);
    return { ok: true, room: agents.length > 1 || locked ? "open" : "archived" };
  }

  /** The room erased with its one agent, as Spaces' Delete erases it (ADR 0067). */
  async function eraseWith(principal: Principal, spaceId: string, agents: number): Promise<Left> {
    if (agents !== 1) {
      return refusedRoom(
        "A space is deleted with its agent only when that agent is the one there.",
      );
    }
    const erased = await deps.eraseSpace({ principal, spaceId });
    return erased.ok
      ? { ok: true, room: "erased", erased: erased.value.erased }
      : { ok: false, error: erased.error };
  }

  /** Its work stopped and it taken out, said as the person's; the room archived if it is empty. */
  async function takeOutOf(principal: Principal, spaceId: string, agentId: string): Promise<void> {
    const { workspaceId, participantId } = principal;
    const person = { kind: "person" as const, id: participantId };
    await deps.oneRoom.takeOut(workspaceId, spaceId, agentId, {
      reason: "agent_deleted",
      by: participantId,
      key: `agent-delete-release-${agentId}`,
      actor: person,
    });
    await deps.oneRoom.closeIfEmpty(workspaceId, spaceId, person, `agent-delete-close-${agentId}`);
  }

  return async function deleteAgent(input: {
    readonly principal: Principal;
    readonly agentId: string;
    /** Erase its room with it: offered for a room's one agent (ADR 0095, point 4). */
    readonly deleteRoom?: boolean | undefined;
  }): Promise<DeleteAgentResult> {
    const { principal, agentId } = input;
    const may = await mayKeep(readModels, principal, agentId, "delete");
    if (!may.ok) return may;
    const locked = lockedRefusal(may.agent);
    if (locked !== undefined) return { ok: false, error: locked };
    const left = await leaveRoom(principal, agentId, input.deleteRoom === true);
    if (!left.ok) return left;
    const { agent } = may;
    await deps.store.append({
      v: 1,
      type: "agent.deleted",
      id: deps.ids.next("event"),
      ts: deps.clock.nowIso(),
      workspace_id: principal.workspaceId,
      actor: { kind: "person", id: principal.participantId },
      idempotency_key: `agent-deleted-${agentId}`,
      agent_id: agentId,
      harness_id: agent.harness_id ?? "",
      key: agent.key ?? agentId,
      name: agent.display_name,
      by: principal.participantId,
    });
    await deps.context?.remove({ workspaceId: principal.workspaceId, kind: "agent", id: agentId });
    await deps.models?.remove(principal.workspaceId, agentId);
    await deps.heartbeats?.remove(principal.workspaceId, agentId);
    await deps.windows?.remove(principal.workspaceId, agentId);
    return {
      ok: true,
      deleted: true,
      room: left.room,
      ...(left.erased === undefined ? {} : { erased: left.erased }),
    };
  };
}

function refusedRoom(message: string) {
  return { ok: false, error: { kind: "invalid", message } } as const;
}

export type DeleteAgent = ReturnType<typeof createDeleteAgent>;
