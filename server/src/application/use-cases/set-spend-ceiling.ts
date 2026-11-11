/**
 * A person sets what a room allows a job, sets it back to the default (ADR 0117), or takes the
 * cap off (ADR 0292).
 *
 * A job is the work the room's agents do after the last thing a person did there; its ceiling is
 * the most its runs may report costing before Chips holds the agents. The workspace's owner, in
 * the room, sets it (his call of 18 October 2026, ADR 0196: a job is paid for on the owner's
 * account), from $0.25 to $1,000 in steps of $0.25, or `null` for the default: one event,
 * `space.spend_ceiling_set`. Or `"none"`, No cap, for a room that lasts, where Chips holds no job
 * for what it spends: one event, `space.spend_ceiling_lifted`. Setting what it is already changes
 * nothing.
 */

import {
  dollars,
  isSpendCeiling,
  NO_SPEND_CEILING,
  SPEND_CEILING_MAX,
  SPEND_CEILING_MIN,
  type SpendCeilingSetting,
} from "@chipschat/protocol";
import { isGuest, maySetSpendCeiling } from "../../domain/roles.js";
import type { EventStore, Principal, ReadModels } from "../ports/index.js";

export interface SetSpendCeilingDeps {
  readonly store: Pick<EventStore, "append" | "head">;
  readonly readModels: Pick<ReadModels, "memberRole" | "workspaceRole" | "spendCeilingOf">;
  readonly ids: { next: (kind: "event") => string };
  readonly clock: { nowIso: () => string };
}

export interface SpendCeilingRefusal {
  readonly kind: "not_allowed" | "unknown_space" | "out_of_range";
  readonly message: string;
}

export type SetSpendCeilingResult =
  | { readonly ok: true; readonly changed: boolean; readonly usd: SpendCeilingSetting }
  | { readonly ok: false; readonly error: SpendCeilingRefusal };

function refused(kind: SpendCeilingRefusal["kind"], message: string): SetSpendCeilingResult {
  return { ok: false, error: { kind, message } };
}

export function createSetSpendCeiling(deps: SetSpendCeilingDeps) {
  /** Why this principal may not set what this room allows a job, or nothing when they may. */
  async function refusalOf(principal: Principal, spaceId: string) {
    if (principal.kind !== "person") {
      return refused("not_allowed", "A person sets what a space allows a job.");
    }
    const { workspaceId, participantId } = principal;
    const standing = await deps.readModels.workspaceRole(workspaceId, participantId);
    if (isGuest(standing))
      return refused("not_allowed", "A guest does not set what a job may spend.");
    const role = await deps.readModels.memberRole(workspaceId, spaceId, participantId);
    if (role === undefined) return refused("unknown_space", "No space of that id that you are in.");
    if (role === "guest")
      return refused("not_allowed", "A guest does not set what a job may spend.");
    if (!maySetSpendCeiling(standing)) {
      return refused("not_allowed", "Only the workspace's owner sets what a job may spend.");
    }
    return undefined;
  }

  return async function setSpendCeiling(input: {
    readonly principal: Principal;
    readonly spaceId: string;
    readonly usd: SpendCeilingSetting;
  }): Promise<SetSpendCeilingResult> {
    const { principal, spaceId, usd } = input;
    const refusal = await refusalOf(principal, spaceId);
    if (refusal !== undefined) return refusal;
    if (typeof usd === "number" && !isSpendCeiling(usd)) {
      return refused(
        "out_of_range",
        `A job may be allowed from ${dollars(SPEND_CEILING_MIN)} to ${dollars(SPEND_CEILING_MAX)}, in steps of 25 cents, or No cap.`,
      );
    }
    const { workspaceId, participantId } = principal;
    const now = (await deps.readModels.spendCeilingOf(workspaceId, spaceId)) ?? null;
    if (now === usd) return { ok: true, changed: false, usd };
    const head = await deps.store.head(workspaceId);
    const event = {
      v: 1,
      id: deps.ids.next("event"),
      ts: deps.clock.nowIso(),
      workspace_id: workspaceId,
      space_id: spaceId,
      actor: { kind: "person", id: participantId },
      idempotency_key: `spend-ceiling-${spaceId}-${usd ?? "default"}-at-${head}`,
    } as const;
    await deps.store.append(
      usd === NO_SPEND_CEILING
        ? { ...event, type: "space.spend_ceiling_lifted" }
        : { ...event, type: "space.spend_ceiling_set", usd },
    );
    return { ok: true, changed: true, usd };
  };
}

export type SetSpendCeiling = ReturnType<typeof createSetSpendCeiling>;
