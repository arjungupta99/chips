/**
 * What a room allows a job, as a person sets it (ADR 0117, Arjun's C): five amounts and Other,
 * the default among them, and what the job has spent so far against the one picked. In core so
 * the phone's room sheet and the desktop's (ADR 0151) offer the same amounts in the same words.
 */

import {
  DEFAULT_SPEND_CEILING_USD,
  dollars,
  isSpendCeiling,
  type JobSpend,
  SPEND_CEILING_MAX,
  SPEND_CEILING_MIN,
} from "@chipschat/protocol";
import type { Space } from "./model/types.js";

/** The amounts offered at a tap, the default among them; Other takes any other. */
export const SPEND_PRESETS: readonly number[] = [1, DEFAULT_SPEND_CEILING_USD, 5, 10, 25];

/** What is picked: the default, one of the presets, or another amount typed in. */
export type SpendChoice = "default" | number | "other";

/** What the room's ceiling is picked as now: the default when nobody set one. */
export function spendChoiceOf(space: Space): SpendChoice {
  const usd = space.spendCeiling;
  if (usd === undefined) return "default";
  return SPEND_PRESETS.includes(usd) ? usd : "other";
}

/** An amount typed into Other, when it is one a room may have: "$7.50", "7.5", "10". */
export function typedCeiling(typed: string): number | undefined {
  const bare = typed.replace(/[$\s,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(bare)) return undefined;
  const usd = Number(bare);
  return isSpendCeiling(usd) ? usd : undefined;
}

/**
 * What a choice sets the room to: an amount, `null` for the default, or nothing when Other's
 * amount is not one a room may have. The default's own amount, picked, is the default.
 */
export function ceilingOfChoice(choice: SpendChoice, typed: string): number | null | undefined {
  if (choice === "default" || choice === DEFAULT_SPEND_CEILING_USD) return null;
  if (choice === "other") return typedCeiling(typed);
  return choice;
}

/** What Other's field says it takes. */
export const SPEND_RANGE_WORDS = `From ${dollars(SPEND_CEILING_MIN)} to ${dollars(SPEND_CEILING_MAX)}, in steps of 25¢.`;

/** What the setting does, said on its page (ADR 0118: Chips holds the agents at it). */
export const SPEND_HELP =
  "When a job here has spent this much, Chips holds the agents: they start nothing new until somebody lets them carry on. A job starts with the last thing a person did in the space.";

/**
 * Under the room's Spend per job row: "This job so far: $1.23", and runs that said no cost. For
 * somebody who sees the amount but doesn't set it (ADR 0196), who does first: "Arjun sets it ·
 * this job so far: $1.23".
 */
export function spentWords(
  spend: JobSpend | undefined,
  setBy?: string | undefined,
): string | undefined {
  const sets = setBy === undefined ? undefined : `${setBy} sets it`;
  if (spend === undefined) return sets;
  const so = `${sets === undefined ? "This" : `${sets} · this`} job so far: ${dollars(spend.spent_usd)}`;
  const n = spend.uncounted_runs;
  return n === 0 ? so : `${so} · ${n === 1 ? "1 run" : `${n} runs`} not counted`;
}
