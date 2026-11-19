/**
 * The pages a harness's page opens (ADR 0254): all of its agents, its context files, its
 * Permissions (ADR 0299, once When it asks you), and its recent runs. Each holds what the page once held whole, so the page itself is short.
 * On a phone each is pushed (`app/harnesses/[id]/[part].tsx`); on a wide screen it opens in the
 * Agents tab's pane, through the tab's `part` param.
 *
 * Permissions opens three of its own, whose way back is to it: every ask so far (ADR 0255), its own
 * settings and Chips's rules (ADR 0300); and Chips's rules opens New rule (ADR 0299).
 */

import { ASKS_TITLE, CHIPS_RULES_TITLE, NEW_RULE_TITLE } from "@chipschat/core";

export const HARNESS_PARTS = [
  "agents",
  "context",
  "asks",
  "settings",
  "chips",
  "runs",
  "asked",
  "rule",
] as const;
export type HarnessPart = (typeof HARNESS_PARTS)[number];

/** Each page's name in its bar. */
export const PART_TITLE: Readonly<Record<HarnessPart, string>> = {
  agents: "Agents",
  context: "Context files",
  asks: "Permissions",
  settings: "Its settings",
  chips: CHIPS_RULES_TITLE,
  runs: "Recent runs",
  asked: ASKS_TITLE,
  rule: NEW_RULE_TITLE,
};

/** A page's name in its bar: its own settings are named for the harness (ADR 0300). */
export function partTitle(part: HarnessPart, harnessName: string): string {
  return part === "settings" ? `${harnessName}'s settings` : PART_TITLE[part];
}

/** The page a page goes back to, beside the Agents list, when it is not the harness's own. */
export const PART_FROM: Readonly<Partial<Record<HarnessPart, HarnessPart>>> = {
  asked: "asks",
  settings: "asks",
  chips: "asks",
  rule: "chips",
};

export function isHarnessPart(value: string | undefined): value is HarnessPart {
  return (HARNESS_PARTS as readonly string[]).includes(value ?? "");
}
