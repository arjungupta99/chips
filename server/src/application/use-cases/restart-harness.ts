/**
 * A person asks a harness to restart (ADR 0094). Chips holds only the hook: the `restart` frame
 * goes down the harness's own connection, and what runs is the harness's own restart — a process
 * restarting itself, or a bridge starting what is behind it again. Chips sends no command.
 *
 * Who may: the harness's owner, or a workspace owner or admin, the people who may remove it (ADR
 * 0078). Refused, in words, for a harness that was removed, one that doesn't declare `restarts`,
 * and one with no socket that hears `restart`: a harness of which nothing is connected cannot hear
 * the hook. Asked again while a restart stands, it is the same restart.
 *
 * Restarting is live state, beside whether its sockets are open (ADR 0083): every person's device
 * hears it begin, and end at the harness's next word. Nothing goes in the log, because a logged
 * restart would be replayed to the harness when it reconnects, and would restart it again.
 */

import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { ownsHarness } from "../../domain/index.js";
import type { Principal } from "../ports/identity.js";
import type { Clock, ReadModels } from "../ports/index.js";
import type { Presence } from "../ports/presence.js";
import type { Sessions } from "../ports/sessions.js";

export interface RestartHarnessDeps {
  readonly readModels: Pick<ReadModels, "participant">;
  readonly sessions: Pick<Sessions, "restart">;
  readonly presence: Pick<Presence, "stateOf" | "restarting">;
  readonly clock: Clock;
}

export type RestartRefusal = {
  readonly kind: "not_allowed" | "unknown_harness" | "invalid";
  readonly message: string;
};

export type RestartAnswer =
  | {
      readonly ok: true;
      /** False when a restart already stood, which this call left as it was. */
      readonly asked: boolean;
      /** How many sockets of it were sent the frame; nought when it was already restarting. */
      readonly sockets: number;
      readonly state: ReturnType<Presence["stateOf"]>;
    }
  | { readonly ok: false; readonly error: RestartRefusal };

const refused = (kind: RestartRefusal["kind"], message: string): RestartAnswer => ({
  ok: false,
  error: { kind, message },
});

type Harness = NonNullable<Awaited<ReturnType<ReadModels["participant"]>>>;

/** Why this person may not restart this harness, or nothing when they may. */
function refusalOf(principal: Principal, harness: Harness): RestartAnswer | undefined {
  if (!ownsHarness(principal, harness)) {
    return refused(
      "not_allowed",
      "A harness is restarted by its owner, or by an owner or admin of the workspace.",
    );
  }
  const name = harness.display_name;
  if (harness.removed_at !== null) return refused("invalid", `${name} was removed.`);
  if (harness.capabilities?.includes(HARNESS_CAPABILITIES.restarts) !== true) {
    return refused("invalid", `${name} doesn't take restarts from Chips.`);
  }
  return undefined;
}

export function createRestartHarness(deps: RestartHarnessDeps) {
  return async function restartHarness(input: {
    readonly principal: Principal;
    readonly harnessId: string;
  }): Promise<RestartAnswer> {
    const { principal, harnessId } = input;
    const { workspaceId } = principal;
    const harness = await deps.readModels.participant(workspaceId, harnessId);
    if (harness === undefined || harness.kind !== "harness") {
      return refused("unknown_harness", "No harness by that id here.");
    }
    const refusal = refusalOf(principal, harness);
    if (refusal !== undefined) return refusal;
    const name = harness.display_name;
    const now = deps.presence.stateOf(workspaceId, harnessId);
    if (now.restarting !== undefined) return { ok: true, asked: false, sockets: 0, state: now };

    const sockets = deps.sessions.restart(workspaceId, harnessId, {
      by: principal.participantId,
      at: deps.clock.nowIso(),
    });
    // Nothing of it connected, or only what doesn't hear restarts: either way nobody would hear.
    if (sockets === 0) return refused("invalid", `Chips can't reach ${name} to restart it.`);
    const state = deps.presence.restarting(workspaceId, harnessId, principal.participantId);
    return { ok: true, asked: true, sockets, state };
  };
}

export type RestartHarness = ReturnType<typeof createRestartHarness>;
