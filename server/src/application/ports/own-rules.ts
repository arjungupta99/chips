/**
 * What a harness says it runs on its own (ADR 0299): its copy, whole, as it last sent it. A
 * registry, not a projection: a report the harness makes, which Chips decides nothing from.
 */

import type { OwnRules } from "@chipschat/protocol";

export interface KeptOwnRules {
  readonly ownRules: OwnRules;
  readonly heardAt: string;
}

export interface OwnRulesRegistry {
  /** Keep a harness's copy in place of the one before. */
  readonly put: (input: {
    readonly workspaceId: string;
    readonly harnessId: string;
    readonly ownRules: OwnRules;
    readonly heardAt: string;
  }) => Promise<void>;
  /** Its latest copy, or nothing before it sends one. */
  readonly get: (workspaceId: string, harnessId: string) => Promise<KeptOwnRules | undefined>;
}
