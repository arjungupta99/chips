/**
 * Trust is a dial, not a switch (blueprint, Supervision). Four levels, each a name and a
 * sentence; the policy engine expands them to rules (ADR 0008). The type comes from the
 * protocol so the dial and the wire agree on what a level is.
 */

import type { AutonomyLevel } from "@chipschat/protocol";

export interface AutonomyLevelInfo {
  readonly level: AutonomyLevel;
  readonly name: string;
  readonly summary: string;
}

export const AUTONOMY_LEVELS: readonly AutonomyLevelInfo[] = [
  {
    level: 0,
    name: "Observe",
    summary:
      "Reads and proposes. Every action needs a yes. For brand-new harnesses and sensitive spaces.",
  },
  {
    level: 1,
    name: "Ask first",
    summary: "Reads are free. Every write and every external action asks. Where most people start.",
  },
  {
    level: 2,
    name: "Ask when it matters",
    summary:
      "Policy decides. Money, external messages, deletions and anything irreversible ask. Everything else runs and shows up in the receipt.",
  },
  {
    level: 3,
    name: "Autonomous, report back",
    summary:
      "Runs end to end, posts a summary and a receipt. You audit or roll back. Earned, not granted.",
  },
];

/** The default for a new harness. The blueprint marks L2 as the default; the policy engine starts a harness at L1 until it earns it. */
export const DEFAULT_AUTONOMY: AutonomyLevel = 2;

export function autonomyInfo(level: AutonomyLevel): AutonomyLevelInfo {
  // The array is indexed by level, and the type says the index is in range.
  return AUTONOMY_LEVELS[level] as AutonomyLevelInfo;
}

/** The short form the run panel and the fleet use: `L2 · Ask when it matters`. */
export function autonomyLabel(level: AutonomyLevel): string {
  return `L${level} · ${autonomyInfo(level).name}`;
}

export function isAutonomyLevel(value: unknown): value is AutonomyLevel {
  return value === 0 || value === 1 || value === 2 || value === 3;
}
