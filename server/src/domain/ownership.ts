/**
 * Who holds a harness's credentials (ADR 0023).
 *
 * `authorize` answers "may this be appended?" and a token is not an event, so this is a
 * predicate of its own rather than a seventh rule in there. Every harness already carries an
 * `owner_id` — the person accountable for it, written when it was added — and this is the first
 * thing to read it for a decision.
 */

import { administers, type WorkspaceRole } from "./roles.js";

/** Only what the rule needs: the caller, and the harness as the registry has it. */
export interface TokenHolder {
  readonly kind: "person" | "harness" | "agent";
  readonly participantId: string;
  readonly workspaceId: string;
  /** The caller's standing in the workspace (ADR 0034). */
  readonly role?: WorkspaceRole | undefined;
}

export interface OwnedHarness {
  readonly kind: "person" | "harness" | "agent";
  readonly owner_id: string | null;
}

/**
 * True when this caller may issue and revoke this harness's tokens, and hand it to somebody
 * else: a person, in the harness's workspace — the lookup that found the harness was scoped to
 * it — who owns the harness, or who runs the workspace as its owner or an admin (M5.2, the
 * consequence ADR 0023 wrote down for when roles arrived).
 *
 * A harness never holds its own tokens, or another's.
 */
export function ownsHarness(caller: TokenHolder, harness: OwnedHarness | undefined): boolean {
  if (caller.kind !== "person") return false;
  if (harness === undefined || harness.kind !== "harness") return false;
  return harness.owner_id === caller.participantId || administers(caller.role);
}
