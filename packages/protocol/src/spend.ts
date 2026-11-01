/**
 * What a room's job has spent, and what the room allows a job (ADR 0117).
 *
 * A **job** is the work a room's agents do after the last thing a person did there (a message, an
 * answer, letting the agents carry on: the `PERSON_ACTS` the referee counts from), or after a brief
 * was handed into the room, whichever is later. Its **spend** is what the runs reported costing
 * after that point, of any harness: a run's own report is its total so far, so a run that began
 * before the point counts only what it reported after it. A run that reported no cost counts
 * nothing, and the room says how many did.
 *
 * Every room allows a job a **ceiling**: `DEFAULT_SPEND_CEILING_USD` until the workspace's owner,
 * in the room, sets another (`space.spend_ceiling_set`, ADR 0196), from `SPEND_CEILING_MIN` to
 * `SPEND_CEILING_MAX` in steps of `SPEND_CEILING_STEP`. Chips works the spend out and hands it to
 * every harness with the message that gives a turn (`context.spend`), and to the agent in the
 * room's note (`spendWords`).
 *
 * At `SPEND_WARN_AT` of the ceiling Chips warns the room's harnesses, and at the ceiling it holds
 * the agents until a person acts (ADR 0118): `spendStage` says which.
 */

import { z } from "zod";

/** What a room allows a job until a person there says otherwise, in US dollars. */
export const DEFAULT_SPEND_CEILING_USD = 3;
/** The least a room may allow a job. */
export const SPEND_CEILING_MIN = 0.25;
/** The most a room may allow a job. */
export const SPEND_CEILING_MAX = 100;
/** A ceiling is a whole number of these. */
export const SPEND_CEILING_STEP = 0.25;
/** The share of the ceiling at which Chips warns the room's harnesses (ADR 0118). */
export const SPEND_WARN_AT = 0.8;

/** Whether `usd` is a ceiling a room may have: in range, and a whole number of steps. */
export function isSpendCeiling(usd: number): boolean {
  if (!Number.isFinite(usd) || usd < SPEND_CEILING_MIN || usd > SPEND_CEILING_MAX) return false;
  return Number.isInteger(Math.round(usd * 1e6) / (SPEND_CEILING_STEP * 1e6));
}

/** A ceiling as a room sets it: an amount, or `null` for the default. */
export const spendCeiling = z
  .number()
  .refine(isSpendCeiling, {
    message: `From $${SPEND_CEILING_MIN} to $${SPEND_CEILING_MAX}, in steps of $${SPEND_CEILING_STEP}.`,
  })
  .nullable();

export const jobSpend = z
  .object({
    ceiling_usd: z
      .number()
      .positive()
      .describe(
        "What the room allows a job, in US dollars: its own ceiling, or the default (3) when nobody has set one.",
      ),
    spent_usd: z
      .number()
      .nonnegative()
      .describe(
        "What the room's runs reported costing since the job began, in US dollars, every harness's together.",
      ),
    since_seq: z
      .int()
      .nonnegative()
      .describe(
        "Where the job began: the `seq` of the last thing a person did in the room, or of the last brief handed into it, whichever is later; 0 when neither has happened.",
      ),
    uncounted_runs: z
      .int()
      .nonnegative()
      .describe("How many of the job's runs reported no cost, and so count nothing."),
  })
  .describe("What a room's job has spent, against what the room allows a job (ADR 0117).");
export type JobSpend = z.infer<typeof jobSpend>;

/** An amount as the room's words say it: "$3.00", "$0.25". */
export function dollars(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/**
 * Where a job stands against its room's ceiling (ADR 0118): `within` it, `most` spent (from
 * `SPEND_WARN_AT`), or at the `ceiling`, where Chips holds the agents until a person acts.
 */
export type SpendStage = "within" | "most" | "ceiling";

export function spendStage(spend: Pick<JobSpend, "ceiling_usd" | "spent_usd">): SpendStage {
  // To the cent, as the words say it: a job at $2.999 has spent the $3.00 it was allowed.
  const spent = Math.round(spend.spent_usd * 100);
  const ceiling = Math.round(spend.ceiling_usd * 100);
  if (spent >= ceiling) return "ceiling";
  return spent >= Math.round(ceiling * SPEND_WARN_AT) ? "most" : "within";
}

/**
 * The room note's line about the job's spend (ADR 0117), with what Chips does at the ceiling
 * (ADR 0118): "This job has spent $1.20 of the $3.00 this room allows a job; at $3.00 Chips holds
 * the agents until a person acts." From most of it spent, what to do about it; at the ceiling,
 * that the agents are held. Then how many runs reported no cost, when any did.
 */
export function spendWords(spend: JobSpend): string {
  const spent = dollars(spend.spent_usd);
  const ceiling = dollars(spend.ceiling_usd);
  const stage = spendStage(spend);
  const line =
    stage === "ceiling"
      ? `This job has spent ${spent} of the ${ceiling} this space allows a job, so Chips holds the agents until a person acts: start nothing new, and say what is done and what is left.`
      : `This job has spent ${spent} of the ${ceiling} this space allows a job; at ${ceiling} Chips holds the agents until a person acts.${stage === "most" ? " Most of it is spent: finish the step you are on, and say what is left." : ""}`;
  const n = spend.uncounted_runs;
  if (n === 0) return line;
  return `${line} ${n === 1 ? "1 run here reported no cost and is" : `${n} runs here reported no cost and are`} not counted.`;
}
