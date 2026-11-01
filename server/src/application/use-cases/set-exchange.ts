/**
 * A person pauses the agents in a room, or lets them carry on (ADR 0097).
 *
 * The referee warns the people when the agents' talk goes round or runs long, with two taps on
 * its line: *Pause them* and *Let them carry on*. Pausing holds every message an agent sends an
 * agent there, as the ceiling does; carrying on is a person acting in the room, so the count
 * starts again and what was held is handed over (`hand-over-held`). One event either way,
 * `exchange.set`.
 *
 * Who may: a person in the room who is not a guest there or in the workspace. Saying the state it
 * is in already changes nothing.
 */

import { isGuest } from "../../domain/roles.js";
import type { EventStore, Principal, ReadModels } from "../ports/index.js";

export interface SetExchangeDeps {
  readonly store: Pick<EventStore, "append" | "head">;
  readonly readModels: Pick<ReadModels, "memberRole" | "workspaceRole" | "exchangeOf">;
  readonly ids: { next: (kind: "event") => string };
  readonly clock: { nowIso: () => string };
}

export interface ExchangeRefusal {
  readonly kind: "not_allowed" | "unknown_space";
  readonly message: string;
}

export type SetExchangeResult =
  | { readonly ok: true; readonly changed: boolean; readonly state: "paused" | "going" }
  | { readonly ok: false; readonly error: ExchangeRefusal };

function refused(kind: ExchangeRefusal["kind"], message: string): SetExchangeResult {
  return { ok: false, error: { kind, message } };
}

export function createSetExchange(deps: SetExchangeDeps) {
  /** Why this principal may not pause the agents in this room, or nothing when they may. */
  async function refusalOf(principal: Principal, spaceId: string) {
    if (principal.kind !== "person") return refused("not_allowed", "A person pauses the agents.");
    const { workspaceId, participantId } = principal;
    const standing = await deps.readModels.workspaceRole(workspaceId, participantId);
    if (isGuest(standing)) return refused("not_allowed", "A guest does not pause the agents.");
    const role = await deps.readModels.memberRole(workspaceId, spaceId, participantId);
    if (role === undefined) return refused("unknown_space", "No space of that id that you are in.");
    if (role === "guest") return refused("not_allowed", "A guest does not pause the agents.");
    return undefined;
  }

  return async function setExchange(input: {
    readonly principal: Principal;
    readonly spaceId: string;
    readonly state: "paused" | "going";
  }): Promise<SetExchangeResult> {
    const { principal, spaceId, state } = input;
    const refusal = await refusalOf(principal, spaceId);
    if (refusal !== undefined) return refusal;
    const { workspaceId, participantId } = principal;
    // Pausing paused agents changes nothing; carrying on always counts, since it is a person acting.
    if (state === "paused") {
      const now = await deps.readModels.exchangeOf(workspaceId, spaceId);
      if (now.paused) return { ok: true, changed: false, state };
    }
    const head = await deps.store.head(workspaceId);
    await deps.store.append({
      v: 1,
      type: "exchange.set",
      id: deps.ids.next("event"),
      ts: deps.clock.nowIso(),
      workspace_id: workspaceId,
      space_id: spaceId,
      actor: { kind: "person", id: participantId },
      idempotency_key: `exchange-${spaceId}-${state}-at-${head}`,
      state,
    });
    return { ok: true, changed: true, state };
  };
}

export type SetExchange = ReturnType<typeof createSetExchange>;
