/**
 * Which workspace a push's answer goes to, on a phone holding several (ADR 0197). Pure, so it is
 * testable without a phone: a store here is whatever answers `getSnapshot`.
 */

import type { Snapshot, Store } from "@chipschat/core";
import { deviceFrom, type PendingDecision } from "./payload";

/** The workspaces this phone holds, as the push half needs them (ADR 0197). */
export interface PushWorkspaces {
  /** The device in front. */
  readonly deviceId: string;
  /** The store of a workspace behind it, while it has one. */
  readonly storeOf: (deviceId: string) => Store | undefined;
  /** Whether this phone holds that device at all. */
  readonly holds: (deviceId: string) => boolean;
}

/** Whether the log this phone holds already shows an answer to this ask. */
export function answered(snapshot: Snapshot, approvalId: string): boolean {
  return snapshot.model.spaces.some((space) =>
    space.runs.some((run) =>
      run.approvals.some(
        (approval) => approval.approvalId === approvalId && approval.resolved !== undefined,
      ),
    ),
  );
}

/**
 * Where a decision kept on this phone goes: the store of the workspace it was asked in, in front
 * or behind (ADR 0197); `gone` when it can never be taken, answered already or for a workspace
 * this phone no longer holds; `waits` for one muted here, which has no store until it is in front.
 */
export function decisionStore(
  decision: PendingDecision,
  workspaces: Pick<PushWorkspaces, "deviceId" | "storeOf" | "holds">,
  front: Store,
  seenInFront: Snapshot,
): Store | "gone" | "waits" {
  const { deviceId, storeOf, holds } = workspaces;
  const inFront = decision.deviceId === undefined || decision.deviceId === deviceId;
  const via = inFront ? front : storeOf(decision.deviceId ?? "");
  if (via === undefined) {
    return decision.deviceId !== undefined && !holds(decision.deviceId) ? "gone" : "waits";
  }
  const seen = inFront ? seenInFront : via.getSnapshot();
  return answered(seen, decision.approvalId) ? "gone" : via;
}

/** The workspace behind the one in front that a push came from, if it is one (ADR 0197). */
export function behindOf(data: unknown, workspaces: Pick<PushWorkspaces, "deviceId" | "holds">) {
  const from = deviceFrom(data);
  return from !== undefined && from !== workspaces.deviceId && workspaces.holds(from)
    ? from
    : undefined;
}
