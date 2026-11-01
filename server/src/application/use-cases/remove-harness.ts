/**
 * Take a harness out of the workspace (ADR 0078). Until now a harness could lose its tokens and
 * change hands, and never leave: one connected to try it out stayed on every list for good.
 *
 * Who may: the harness's owner, or a workspace owner or admin, the same rule as its tokens and
 * its handing-on (ADR 0023). What happens, in this order:
 *
 * - the registry marks it removed, which the door reads from then on: it is not given a token,
 *   added to a room or asked for one, and a token of its that somehow survived is refused;
 * - every token it still has is withdrawn, with the revoke its card uses, so the sockets it holds
 *   close now rather than at the next heartbeat;
 * - `harness.removed` goes in the log, naming it and the rooms that were its homes (ADR 0069),
 *   which stop being homes: nobody's lead speaks in them any more, so they can be archived or
 *   deleted like any other room. The projection clears them from the event, so a rebuild agrees.
 *
 * The row stays, and so does every room it was in: what it said keeps its name. Removing it again
 * changes nothing and says when it was removed; it still withdraws a token that is somehow live,
 * so a second try is always safe.
 */

import { ownsHarness } from "../../domain/index.js";
import type { AgentContextWindowRegistry } from "../ports/agent-context-windows.js";
import type { AgentHeartbeatRegistry } from "../ports/agent-heartbeats.js";
import type { AgentModelRegistry } from "../ports/agent-models.js";
import type { ContextRegistry } from "../ports/context-files.js";
import type { HarnessJobRegistry } from "../ports/harness-jobs.js";
import type { HarnessRegistry } from "../ports/harnesses.js";
import type { Principal } from "../ports/identity.js";
import type {
  Clock,
  EventStore,
  IdGenerator,
  ParticipantView,
  ReadModels,
} from "../ports/index.js";
import type { Sessions } from "../ports/sessions.js";

export interface RemoveHarnessDeps {
  readonly registry: Pick<HarnessRegistry, "markRemoved" | "tokens" | "revokeToken">;
  readonly sessions: Sessions;
  readonly store: EventStore;
  readonly readModels: Pick<ReadModels, "participant" | "homesOf">;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** Its context files' copies and edits, and its agents', forgotten with it (ADR 0134). */
  readonly context?: Pick<ContextRegistry, "removeHarness">;
  /** Its agents' models' copies, forgotten with it (ADR 0140). */
  readonly models?: Pick<AgentModelRegistry, "removeHarness">;
  /** Its agents' heartbeats' copies, forgotten with it (ADR 0143). */
  readonly heartbeats?: Pick<AgentHeartbeatRegistry, "removeHarness">;
  /** Its agents' context windows' copies and asks, forgotten with it (ADR 0146). */
  readonly windows?: Pick<AgentContextWindowRegistry, "removeHarness">;
  /** Its own jobs' copy and their runs, forgotten with it (ADR 0252). */
  readonly jobs?: Pick<HarnessJobRegistry, "removeHarness">;
}

export type RemoveFailure = {
  readonly kind: "not_the_owner" | "unknown_harness";
  readonly message: string;
};

export interface Removed {
  readonly harnessId: string;
  /** When it was removed: now, or the first time for a harness removed already. */
  readonly removedAt: string;
  /** True when it had been removed before this call, which changed nothing but stray tokens. */
  readonly alreadyRemoved: boolean;
  readonly tokensRevoked: number;
  readonly socketsClosed: number;
  /** The rooms that stopped being its homes. */
  readonly homes: readonly string[];
  /** The `harness.removed`, when this call wrote one. */
  readonly eventId?: string | undefined;
}

type Answer = { ok: true; value: Removed } | { ok: false; error: RemoveFailure };
type Refused = { ok: false; error: RemoveFailure };

const refuse = (kind: RemoveFailure["kind"], message: string): Refused => ({
  ok: false,
  error: { kind, message },
});

/** The harness as the registry has it, when the caller may remove it. */
async function removedBy(
  deps: RemoveHarnessDeps,
  principal: Principal,
  harnessId: string,
): Promise<Refused | { ok: true; harness: ParticipantView }> {
  const harness = await deps.readModels.participant(principal.workspaceId, harnessId);
  if (harness === undefined || harness.kind !== "harness") {
    return refuse("unknown_harness", "No harness by that id here.");
  }
  if (!ownsHarness(principal, harness)) {
    return refuse(
      "not_the_owner",
      "A harness is removed by its owner, or by an owner or admin of the workspace.",
    );
  }
  return { ok: true, harness };
}

/** Withdraw every token it still has, and close the sockets each one holds. */
async function withdrawTokens(
  deps: RemoveHarnessDeps,
  workspaceId: string,
  harnessId: string,
  at: string,
): Promise<{ tokensRevoked: number; socketsClosed: number }> {
  let tokensRevoked = 0;
  let socketsClosed = 0;
  for (const token of await deps.registry.tokens(workspaceId, harnessId)) {
    if (token.revokedAt !== null) continue;
    if (!(await deps.registry.revokeToken({ workspaceId, harnessId, tokenId: token.id, at }))) {
      continue;
    }
    tokensRevoked += 1;
    socketsClosed += deps.sessions.closeToken(token.id);
  }
  return { tokensRevoked, socketsClosed };
}

export function createRemoveHarness(deps: RemoveHarnessDeps) {
  /** The line in the log: who removed which harness, and which rooms stop being its homes. */
  async function record(
    principal: Principal,
    harness: ParticipantView,
    homes: readonly string[],
    reason: string | undefined,
  ): Promise<string> {
    const eventId = deps.ids.next("event");
    await deps.store.append({
      v: 1,
      type: "harness.removed",
      id: eventId,
      ts: deps.clock.nowIso(),
      workspace_id: principal.workspaceId,
      actor: { kind: "person", id: principal.participantId },
      // A harness is removed once, so its id is the key: a retry finds the first line.
      idempotency_key: `remove-${harness.id}`,
      harness_id: harness.id,
      display_name: harness.display_name,
      ...(homes.length === 0 ? {} : { homes: [...homes] }),
      ...(reason === undefined ? {} : { reason }),
    });
    return eventId;
  }

  return async function removeHarness(input: {
    principal: Principal;
    harnessId: string;
    reason?: string | undefined;
  }): Promise<Answer> {
    const { principal, harnessId } = input;
    const { workspaceId } = principal;
    const found = await removedBy(deps, principal, harnessId);
    if (!found.ok) return found;
    const { harness } = found;

    const at = deps.clock.nowIso();
    // Marked first, so nothing the door lets in between here and the revoke can speak for it.
    const marked = await deps.registry.markRemoved({ workspaceId, harnessId, at });
    const withdrawn = await withdrawTokens(deps, workspaceId, harnessId, at);
    if (!marked) {
      const then =
        harness.removed_at ??
        (await deps.readModels.participant(workspaceId, harnessId))?.removed_at;
      return {
        ok: true,
        value: { harnessId, removedAt: then ?? at, alreadyRemoved: true, homes: [], ...withdrawn },
      };
    }

    const homes = await deps.readModels.homesOf(workspaceId, harnessId);
    const eventId = await record(principal, harness, homes, input.reason);
    await deps.context?.removeHarness(workspaceId, harnessId);
    await deps.models?.removeHarness(workspaceId, harnessId);
    await deps.heartbeats?.removeHarness(workspaceId, harnessId);
    await deps.windows?.removeHarness(workspaceId, harnessId);
    await deps.jobs?.removeHarness(workspaceId, harnessId);
    return {
      ok: true,
      value: { harnessId, removedAt: at, alreadyRemoved: false, homes, eventId, ...withdrawn },
    };
  };
}

export type RemoveHarness = ReturnType<typeof createRemoveHarness>;
