/**
 * Hand a harness to another person (M5.2). Every harness has a named owner — the person its
 * approvals default to and whose tokens they are (ADR 0023) — and ownership moves with the
 * person who runs it: somebody leaves, a project changes hands.
 *
 * Who may: the harness's owner, or a workspace owner or admin, the same rule as its tokens.
 * To whom: a person in this workspace who is not a guest, since a guest changes nothing about
 * the workspace and a harness is something. The registry row is the truth for who owns it
 * (ADR 0023), and `harness.transferred` records the change for the audit and the screens.
 */

import { isGuest, ownsHarness } from "../../domain/index.js";
import type { HarnessRegistry } from "../ports/harnesses.js";
import type { Principal } from "../ports/identity.js";
import type { Clock, EventStore, IdGenerator, ReadModels } from "../ports/index.js";

export interface TransferHarnessDeps {
  readonly registry: Pick<HarnessRegistry, "setOwner">;
  readonly store: EventStore;
  readonly readModels: Pick<ReadModels, "participant">;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export type TransferFailure = {
  readonly kind: "not_the_owner" | "unknown_harness" | "unknown_person" | "invalid";
  readonly message: string;
};

export interface Transferred {
  readonly harnessId: string;
  readonly fromOwnerId: string;
  readonly toOwnerId: string;
  readonly eventId: string;
}

type Answer = { ok: true; value: Transferred } | { ok: false; error: TransferFailure };
type Refused = { ok: false; error: TransferFailure };

const refuse = (kind: TransferFailure["kind"], message: string): Refused => ({
  ok: false,
  error: { kind, message },
});

/** The harness as the registry has it, when the caller may hand it on. */
async function handedBy(
  deps: TransferHarnessDeps,
  principal: Principal,
  harnessId: string,
): Promise<Refused | { ok: true; ownerId: string }> {
  const harness = await deps.readModels.participant(principal.workspaceId, harnessId);
  if (harness === undefined || harness.kind !== "harness" || harness.owner_id === null) {
    return refuse("unknown_harness", "No harness by that id here.");
  }
  if (!ownsHarness(principal, harness)) {
    return refuse(
      "not_the_owner",
      "A harness is handed on by its owner, or by an owner or admin of the workspace.",
    );
  }
  if (harness.removed_at !== null) {
    return refuse("invalid", `${harness.display_name} was removed from the workspace.`);
  }
  return { ok: true, ownerId: harness.owner_id };
}

/** The person to hand it to: one who is here, is a person, is not a guest, and does not have it. */
async function handedTo(
  deps: TransferHarnessDeps,
  workspaceId: string,
  ownerId: string,
  current: string,
): Promise<Refused | { ok: true; id: string }> {
  const to = await deps.readModels.participant(workspaceId, ownerId);
  if (to === undefined || to.kind !== "person") {
    return refuse("unknown_person", "No person by that id here to hand it to.");
  }
  if (isGuest(to.role ?? undefined)) {
    return refuse("invalid", "A guest of the workspace may not own a harness.");
  }
  if (to.id === current) return refuse("invalid", `${to.display_name} owns it already.`);
  return { ok: true, id: to.id };
}

export function createTransferHarness(deps: TransferHarnessDeps) {
  return async function transferHarness(input: {
    principal: Principal;
    harnessId: string;
    ownerId: string;
    reason?: string | undefined;
  }): Promise<Answer> {
    const { principal, harnessId } = input;
    const { workspaceId } = principal;
    const from = await handedBy(deps, principal, harnessId);
    if (!from.ok) return from;
    const to = await handedTo(deps, workspaceId, input.ownerId, from.ownerId);
    if (!to.ok) return to;
    const harness = { owner_id: from.ownerId };

    await deps.registry.setOwner({ workspaceId, harnessId, ownerId: to.id });
    const eventId = deps.ids.next("event");
    await deps.store.append({
      v: 1,
      type: "harness.transferred",
      id: eventId,
      ts: deps.clock.nowIso(),
      workspace_id: workspaceId,
      actor: { kind: "person", id: principal.participantId },
      idempotency_key: `transfer-${harnessId}-${eventId}`,
      harness_id: harnessId,
      from_owner_id: harness.owner_id,
      to_owner_id: to.id,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    });
    return {
      ok: true,
      value: { harnessId, fromOwnerId: harness.owner_id, toOwnerId: to.id, eventId },
    };
  };
}

export type TransferHarness = ReturnType<typeof createTransferHarness>;
