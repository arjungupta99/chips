/**
 * Say again what a harness takes (ADR 0046). A harness's manifest — the tools it names, and the
 * few capabilities a client reads before drawing a control — was said once, when it was
 * registered, and a harness that learnt to do something new had no way to say so short of being
 * registered again, with a new id and none of its history. Jacobian, taking new spaces, is the
 * first to need it.
 *
 * The list is whole: what is sent is what the harness takes from now on, and what it took before
 * and is not sent, it no longer does. Who may: its owner, or a workspace owner or admin, the same
 * rule as its tokens. A registry write, like registration: the list is not in the log.
 */

import { ownsHarness } from "../../domain/index.js";
import type { HarnessRegistry } from "../ports/harnesses.js";
import type { Principal } from "../ports/identity.js";
import type { ReadModels } from "../ports/index.js";

export interface DeclareCapabilitiesDeps {
  readonly registry: Pick<HarnessRegistry, "setCapabilities">;
  readonly readModels: Pick<ReadModels, "participant">;
}

export interface DeclareCapabilitiesInput {
  readonly principal: Principal;
  readonly harnessId: string;
  readonly capabilities: readonly string[];
}

export interface DeclaredCapabilities {
  readonly capabilities: readonly string[];
  /** What it declared until now; `null` when it declared nothing. */
  readonly previous: readonly string[] | null;
}

export type DeclareFailure = {
  readonly kind: "not_the_owner" | "unknown_harness" | "invalid";
  readonly message: string;
};

/** As many as a manifest needs, each a name a person could read. */
const MAX_CAPABILITIES = 64;
const MAX_NAME = 120;

/** The list as it will be stored: trimmed, each once, in the order given. */
function tidy(capabilities: readonly string[]): string[] | DeclareFailure {
  const names = [...new Set(capabilities.map((each) => each.trim()))];
  if (names.length > MAX_CAPABILITIES) {
    return { kind: "invalid", message: `A harness declares up to ${MAX_CAPABILITIES} things.` };
  }
  if (names.some((each) => each === "" || each.length > MAX_NAME)) {
    return {
      kind: "invalid",
      message: `Each capability is a name, up to ${MAX_NAME} characters.`,
    };
  }
  return names;
}

export function createDeclareCapabilities(deps: DeclareCapabilitiesDeps) {
  return async function declareCapabilities(
    input: DeclareCapabilitiesInput,
  ): Promise<{ ok: true; value: DeclaredCapabilities } | { ok: false; error: DeclareFailure }> {
    const { principal, harnessId } = input;
    const harness = await deps.readModels.participant(principal.workspaceId, harnessId);
    if (harness === undefined || harness.kind !== "harness") {
      return {
        ok: false,
        error: { kind: "unknown_harness", message: "No harness by that id here." },
      };
    }
    if (!ownsHarness(principal, harness)) {
      return {
        ok: false,
        error: {
          kind: "not_the_owner",
          message:
            "What a harness takes is said by its owner, or by an owner or admin of the workspace.",
        },
      };
    }
    const capabilities = tidy(input.capabilities);
    if (!Array.isArray(capabilities)) return { ok: false, error: capabilities };
    await deps.registry.setCapabilities({
      workspaceId: principal.workspaceId,
      harnessId,
      capabilities,
    });
    return { ok: true, value: { capabilities, previous: harness.capabilities } };
  };
}

export type DeclareCapabilities = ReturnType<typeof createDeclareCapabilities>;
