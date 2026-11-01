/**
 * A person locks a room's changes, or lets them go (ADR 0156).
 *
 * While a room's changes are locked, no person renames it, archives it or deletes it: the door
 * refuses the `space.updated` and the erase. One archived may still be brought back, and what is
 * in it — its agents, its lead, what it allows a job, its files — changes as before. A harness's
 * own rename or close of a room it opened still lands, so that what it keeps and what Chips shows
 * stay one. A person in the room who is not a guest there or in the workspace locks it or lets it
 * go. Saying what it is already changes nothing. One event, `space.lock_set`.
 */

import { isGuest } from "../../domain/roles.js";
import type { EventStore, Principal, ReadModels } from "../ports/index.js";

export interface SetLockDeps {
  readonly store: Pick<EventStore, "append" | "head">;
  readonly readModels: Pick<ReadModels, "memberRole" | "workspaceRole" | "space">;
  readonly ids: { next: (kind: "event") => string };
  readonly clock: { nowIso: () => string };
}

export interface LockRefusal {
  readonly kind: "not_allowed" | "unknown_space";
  readonly message: string;
}

export type SetLockResult =
  | { readonly ok: true; readonly changed: boolean; readonly locked: boolean }
  | { readonly ok: false; readonly error: LockRefusal };

function refused(kind: LockRefusal["kind"], message: string): SetLockResult {
  return { ok: false, error: { kind, message } };
}

export function createSetLock(deps: SetLockDeps) {
  /** Why this principal may not lock this room's changes or let them go, or nothing when they may. */
  async function refusalOf(principal: Principal, spaceId: string) {
    if (principal.kind !== "person") {
      return refused("not_allowed", "A person locks a space's changes.");
    }
    const { workspaceId, participantId } = principal;
    const standing = await deps.readModels.workspaceRole(workspaceId, participantId);
    if (isGuest(standing))
      return refused("not_allowed", "A guest does not lock a space's changes.");
    const role = await deps.readModels.memberRole(workspaceId, spaceId, participantId);
    if (role === undefined) return refused("unknown_space", "No space of that id that you are in.");
    if (role === "guest") return refused("not_allowed", "A guest does not lock a space's changes.");
    return undefined;
  }

  return async function setLock(input: {
    readonly principal: Principal;
    readonly spaceId: string;
    readonly locked: boolean;
  }): Promise<SetLockResult> {
    const { principal, spaceId, locked } = input;
    const refusal = await refusalOf(principal, spaceId);
    if (refusal !== undefined) return refusal;
    const { workspaceId, participantId } = principal;
    const space = await deps.readModels.space(workspaceId, spaceId);
    if (space === undefined)
      return refused("unknown_space", "No space of that id that you are in.");
    if ((space.locked === true) === locked) return { ok: true, changed: false, locked };
    const head = await deps.store.head(workspaceId);
    await deps.store.append({
      v: 1,
      type: "space.lock_set",
      id: deps.ids.next("event"),
      ts: deps.clock.nowIso(),
      workspace_id: workspaceId,
      space_id: spaceId,
      actor: { kind: "person", id: participantId },
      idempotency_key: `lock-${spaceId}-${locked}-at-${head}`,
      locked,
    });
    return { ok: true, changed: true, locked };
  };
}

export type SetLock = ReturnType<typeof createSetLock>;
