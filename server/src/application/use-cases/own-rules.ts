/**
 * What a harness runs on its own (ADR 0299): the first gate, which Chips only reports.
 *
 * - **A harness sends its copy**, whole, of what its own settings let through, when it connects and
 *   whenever it reads them again; only its own.
 * - **Its owner reads it,** or an owner or admin of the workspace, for its Permissions page. Before
 *   a copy there is nothing to read, which the page says.
 */

import type { OwnRules } from "@chipschat/protocol";
import { ownsHarness } from "../../domain/index.js";
import type { Principal } from "../ports/identity.js";
import type { Clock, ReadModels } from "../ports/index.js";
import type { KeptOwnRules, OwnRulesRegistry } from "../ports/own-rules.js";

export interface OwnRulesDeps {
  readonly readModels: Pick<ReadModels, "participant">;
  readonly ownRules: OwnRulesRegistry;
  readonly clock: Clock;
}

export interface OwnRulesRefusal {
  readonly kind: "not_allowed" | "unknown";
  readonly message: string;
}

type Answer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: OwnRulesRefusal };

const refused = <T>(kind: OwnRulesRefusal["kind"], message: string): Answer<T> => ({
  ok: false,
  error: { kind, message },
});

/** A live harness, or nothing when it is gone. */
async function harnessNamed(deps: OwnRulesDeps, workspaceId: string, harnessId: string) {
  const found = await deps.readModels.participant(workspaceId, harnessId);
  return found?.kind === "harness" && found.removed_at === null ? found : undefined;
}

export function createPutOwnRules(deps: OwnRulesDeps) {
  return async function putOwnRules(input: {
    readonly principal: Principal;
    readonly harnessId: string;
    readonly ownRules: OwnRules;
  }): Promise<Answer<{ readonly heardAt: string }>> {
    const { principal, harnessId, ownRules } = input;
    if (principal.kind !== "harness") {
      return refused("not_allowed", "A harness says what it runs on its own.");
    }
    if (principal.participantId !== harnessId) {
      return refused("not_allowed", "Those settings aren't yours.");
    }
    if ((await harnessNamed(deps, principal.workspaceId, harnessId)) === undefined) {
      return refused("unknown", "No harness of that id here.");
    }
    const heardAt = deps.clock.nowIso();
    await deps.ownRules.put({ workspaceId: principal.workspaceId, harnessId, ownRules, heardAt });
    return { ok: true, value: { heardAt } };
  };
}

export function createReadOwnRules(deps: OwnRulesDeps) {
  return async function readOwnRules(input: {
    readonly principal: Principal;
    readonly harnessId: string;
  }): Promise<Answer<KeptOwnRules | undefined>> {
    const { principal, harnessId } = input;
    if (principal.kind !== "person") {
      return refused("not_allowed", "A person reads what a harness runs on its own.");
    }
    const harness = await harnessNamed(deps, principal.workspaceId, harnessId);
    if (harness === undefined) return refused("unknown", "No harness of that id here.");
    if (!ownsHarness(principal, harness)) {
      return refused(
        "not_allowed",
        "What a harness runs on its own is for its owner, or an owner or admin of the workspace.",
      );
    }
    return { ok: true, value: await deps.ownRules.get(principal.workspaceId, harnessId) };
  };
}

export type PutOwnRules = ReturnType<typeof createPutOwnRules>;
export type ReadOwnRules = ReturnType<typeof createReadOwnRules>;
