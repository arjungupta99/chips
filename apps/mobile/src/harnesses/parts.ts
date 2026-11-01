/**
 * The pages a harness's page opens (ADR 0254): all of its agents, its context files, When it asks
 * you, and its recent runs. Each holds what the page once held whole, so the page itself is short.
 * On a phone each is pushed (`app/harnesses/[id]/[part].tsx`); on a wide screen it opens in the
 * Agents tab's pane, through the tab's `part` param.
 *
 * When it asks you opens one of its own: every ask so far (ADR 0255), whose way back is to it.
 */

import { ASKS_TITLE } from "@chipschat/core";

export const HARNESS_PARTS = ["agents", "context", "asks", "runs", "asked"] as const;
export type HarnessPart = (typeof HARNESS_PARTS)[number];

/** Each page's name in its bar. */
export const PART_TITLE: Readonly<Record<HarnessPart, string>> = {
  agents: "Agents",
  context: "Context files",
  asks: "When it asks you",
  runs: "Recent runs",
  asked: ASKS_TITLE,
};

/** The page a page goes back to, beside the Agents list, when it is not the harness's own. */
export const PART_FROM: Readonly<Partial<Record<HarnessPart, HarnessPart>>> = { asked: "asks" };

export function isHarnessPart(value: string | undefined): value is HarnessPart {
  return (HARNESS_PARTS as readonly string[]).includes(value ?? "");
}
