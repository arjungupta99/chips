/**
 * Add harness, Custom (technical-plan M1.6): a person names a harness and gets a token, once.
 * The harness is registered, its first policy is an event — L1, ask first, the blueprint's
 * start for a new harness — and, unless the caller says otherwise, a direct space with the
 * person is opened so the token has somewhere to speak from the first line. The token is shown
 * here and never again: Chips keeps only its digest (ADR 0006).
 *
 * Not every harness wants that space. One whose spaces are worktrees (ADR 0024) opens its own
 * as it finds them, and the direct one would sit empty for ever with a composer that can only
 * say so — which is what `chips connect` left behind until it stopped asking.
 */

import { isGuest } from "../../domain/index.js";
import { defaultAgentOf } from "../agents.js";
import type { HarnessRegistry } from "../ports/harnesses.js";
import type { Principal } from "../ports/identity.js";
import type { Clock, EventStore, IdGenerator, ReadModels } from "../ports/index.js";
import type { Presence } from "../ports/presence.js";

export interface AddHarnessDeps {
  readonly registry: HarnessRegistry;
  readonly store: EventStore;
  readonly readModels: Pick<
    ReadModels,
    "workspacePolicy" | "agentByKey" | "participantsIn" | "participant" | "heldNames"
  >;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** Mints a token and its digest. Injected so a test can read the token it will get. */
  readonly mint: () => { readonly token: string; readonly hash: string };
  /** Told of the harness made, so it is offline from now rather than since the server started. */
  readonly presence?: Pick<Presence, "added"> | undefined;
}

export interface AddHarnessInput {
  readonly principal: Principal;
  readonly displayName: string;
  readonly capabilities?: readonly string[] | undefined;
  /**
   * Open a direct space between the person and the harness. True unless said otherwise: it is
   * what a harness with nowhere else to speak needs.
   */
  readonly openDirectSpace?: boolean | undefined;
}

export interface AddedHarness {
  readonly harnessId: string;
  readonly displayName: string;
  /** Shown once. */
  readonly token: string;
  /** The direct space between the person and the harness, when one was opened. */
  readonly spaceId?: string | undefined;
}

export type AddHarnessFailure = {
  readonly kind: "not_a_person" | "not_allowed" | "invalid";
  readonly message: string;
};

/** A new harness starts at L1: ask first (blueprint, Supervision). */
export const NEW_HARNESS_AUTONOMY = 1;

export function createAddHarness(deps: AddHarnessDeps) {
  return async function addHarness(
    input: AddHarnessInput,
  ): Promise<{ ok: true; value: AddedHarness } | { ok: false; error: AddHarnessFailure }> {
    const { principal } = input;
    if (principal.kind !== "person") {
      return {
        ok: false,
        error: { kind: "not_a_person", message: "Only a person adds a harness." },
      };
    }
    // A guest of the workspace changes nothing about it, and a harness is a change (ADR 0034).
    if (isGuest(principal.role)) {
      return {
        ok: false,
        error: { kind: "not_allowed", message: "A guest of the workspace may not add a harness." },
      };
    }
    const displayName = input.displayName.trim();
    if (displayName === "" || displayName.length > 120) {
      return {
        ok: false,
        error: { kind: "invalid", message: "Give the harness a name, up to 120 characters." },
      };
    }

    const at = deps.clock.nowIso();
    const workspaceId = principal.workspaceId;
    const harnessId = deps.ids.next("harness");
    await deps.registry.addHarness({
      id: harnessId,
      workspaceId,
      displayName,
      ownerId: principal.participantId,
      capabilities: input.capabilities,
      createdAt: at,
    });
    const minted = deps.mint();
    await deps.registry.addToken({
      id: deps.ids.next("token"),
      workspaceId,
      harnessId,
      tokenHash: minted.hash,
      name: "custom",
      createdAt: at,
    });

    const workspace = await deps.readModels.workspacePolicy(workspaceId);
    const envelope = {
      v: 1 as const,
      ts: at,
      workspace_id: workspaceId,
      actor: { kind: "person" as const, id: principal.participantId },
    };
    await deps.store.append({
      ...envelope,
      type: "policy.updated",
      id: deps.ids.next("event"),
      idempotency_key: `${harnessId}-first-policy`,
      harness_id: harnessId,
      policy: { autonomy: NEW_HARNESS_AUTONOMY, rules: [] },
      workspace_max_autonomy: workspace?.max_autonomy ?? 2,
      changed_by: principal.participantId,
      reason: "A new harness starts at L1: ask first.",
    });

    const spaceId =
      input.openDirectSpace === false
        ? undefined
        : await openDirect(deps, envelope, principal.participantId, {
            id: harnessId,
            display_name: displayName,
          });

    deps.presence?.added(principal.workspaceId, harnessId);
    return {
      ok: true,
      value: {
        harnessId,
        displayName,
        token: minted.token,
        ...(spaceId === undefined ? {} : { spaceId }),
      },
    };
  };
}

/**
 * The direct space, and the two who are in it: the person, and the harness's default agent (ADR
 * 0087's addendum, point 5), which it speaks as there.
 */
async function openDirect(
  deps: AddHarnessDeps,
  envelope: Readonly<Record<string, unknown>>,
  personId: string,
  harness: { readonly id: string; readonly display_name: string },
): Promise<string> {
  const workspaceId = String(envelope["workspace_id"]);
  const { agent } = await defaultAgentOf(deps, workspaceId, harness);
  const spaceId = deps.ids.next("space");
  await deps.store.append({
    ...(envelope as Parameters<EventStore["append"]>[0]),
    type: "space.created",
    id: deps.ids.next("event"),
    space_id: spaceId,
    idempotency_key: `${spaceId}-opened`,
    kind: "direct",
  });
  for (const [participantId, kind, role] of [
    [personId, "person", "owner"],
    [agent.agent_id, "agent", "member"],
  ] as const) {
    await deps.store.append({
      ...(envelope as Parameters<EventStore["append"]>[0]),
      type: "membership.added",
      id: deps.ids.next("event"),
      space_id: spaceId,
      idempotency_key: `${spaceId}-member-${participantId}`,
      participant_id: participantId,
      participant_kind: kind,
      role,
    });
  }
  return spaceId;
}

export type AddHarness = ReturnType<typeof createAddHarness>;
