/**
 * A person locks an agent's changes, or lets them go (ADR 0199).
 *
 * While an agent's changes are locked, no person renames it, archives it or deletes it, nor
 * deletes it with its room: the door refuses each. One archived may still be brought back, and
 * the rest of it — its face, where it is, its model, its heartbeat, its files — changes as before.
 * A harness's own archive of its agent still lands, so that what it keeps and what Chips shows stay
 * one. Whoever may archive or delete it locks it or lets it go (`mayKeep`): its harness's owner,
 * or an owner or admin of the workspace; never a guest, never a harness, never the Main agent.
 * Saying what it is already changes nothing. One event, `agent.lock_set`, which no room is told.
 */

import type { EventStore, Principal, ReadModels } from "../ports/index.js";
import { type AgentKeepRefusal, mayKeep } from "./archive-agent.js";

export interface SetAgentLockDeps {
  readonly store: Pick<EventStore, "append" | "head">;
  readonly readModels: Pick<ReadModels, "participant" | "workspaceRole">;
  readonly ids: { next: (kind: "event") => string };
  readonly clock: { nowIso: () => string };
}

export type SetAgentLockResult =
  | { readonly ok: true; readonly changed: boolean; readonly locked: boolean }
  | { readonly ok: false; readonly error: AgentKeepRefusal };

export function createSetAgentLock(deps: SetAgentLockDeps) {
  return async function setAgentLock(input: {
    readonly principal: Principal;
    readonly agentId: string;
    readonly locked: boolean;
  }): Promise<SetAgentLockResult> {
    const { principal, agentId, locked } = input;
    const may = await mayKeep(deps.readModels, principal, agentId, "lock");
    if (!may.ok) return may;
    if ((may.agent.locked === true) === locked) return { ok: true, changed: false, locked };
    const head = await deps.store.head(principal.workspaceId);
    await deps.store.append({
      v: 1,
      type: "agent.lock_set",
      id: deps.ids.next("event"),
      ts: deps.clock.nowIso(),
      workspace_id: principal.workspaceId,
      actor: { kind: "person", id: principal.participantId },
      // The same ask twice at once is one event; locked again later is a new one.
      idempotency_key: `agent-lock-${agentId}-${locked}-at-${head}`,
      agent_id: agentId,
      locked,
    });
    return { ok: true, changed: true, locked };
  };
}

export type SetAgentLock = ReturnType<typeof createSetAgentLock>;
