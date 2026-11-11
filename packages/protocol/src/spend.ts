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
 * `SPEND_CEILING_MAX` in steps of `SPEND_CEILING_STEP`, or takes the cap off
 * (`space.spend_ceiling_lifted`, ADR 0292) so that Chips holds no job there for what it spends.
 * Chips works the spend out and hands it to every harness with the message that gives a turn
 * (`context.spend`), and to the agent in the room's note (`spendWords`); a room with no cap hands
 * neither.
 *
 * At `SPEND_WARN_AT` of the ceiling Chips warns the room's harnesses, and at the ceiling it holds
 * the agents until a person acts (ADR 0118): `spendStage` says which.
 */

import { z } from "zod";

/** What a room allows a job until a person there says otherwise, in US dollars. */
export const DEFAULT_SPEND_CEILING_USD = 3;
/** The least a room may allow a job. */
export const SPEND_CEILING_MIN = 0.25;
/** The most a room may allow a job as an amount; past it, a room takes the cap off (ADR 0292). */
export const SPEND_CEILING_MAX = 1000;
/** A ceiling is a whole number of these. */
export const SPEND_CEILING_STEP = 0.25;
/** The share of the ceiling at which Chips warns the room's harnesses (ADR 0118). */
export const SPEND_WARN_AT = 0.8;

/** Whether `usd` is a ceiling a room may have: in range, and a whole number of steps. */
export function isSpendCeiling(usd: number): boolean {
  if (!Number.isFinite(usd) || usd < SPEND_CEILING_MIN || usd > SPEND_CEILING_MAX) return false;
  return Number.isInteger(Math.round(usd * 1e6) / (SPEND_CEILING_STEP * 1e6));
}

/** What a person sets a room to for No cap: Chips holds no job there for what it spends. */
export const NO_SPEND_CEILING = "none";

/**
 * What a person sets a room's ceiling to (ADR 0292): an amount, `null` for the default, or
 * `NO_SPEND_CEILING`. The first two are `space.spend_ceiling_set`, the last
 * `space.spend_ceiling_lifted`.
 */
export type SpendCeilingSetting = number | null | typeof NO_SPEND_CEILING;

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

/**
 * What began a room's job (ADR 0282): a person's message, an answer to an ask or a question,
 * letting the agents carry on, a brief handed into the room, or another of the `PERSON_ACTS`.
 */
export type JobStart = "message" | "answer" | "carry_on" | "brief" | "act";

/** A job before the room's present one that spent something, or ran without saying a cost. */
export interface SpentJob {
  /** Where it began, as `JobSpend.since_seq` says it of the present job. */
  readonly since_seq: number;
  /** When it began; when its first report came, for a job that began with the room. */
  readonly started_at: string;
  /** When its last report of a cost came. */
  readonly last_at: string;
  readonly spent_usd: number;
  readonly uncounted_runs: number;
  /** The runs that reported in it, oldest first. */
  readonly run_ids: readonly string[];
  /** The agents, or harnesses, whose runs reported, in the order they first did. */
  readonly by: readonly string[];
  /** Chips held the agents at the room's ceiling in it (ADR 0118). */
  readonly held: boolean;
}

/**
 * `GET /v1/spaces/:id/spend` (ADR 0282): the present job against the room's ceiling, what began
 * it, the jobs before it that spent, newest first and at most `SPENT_JOBS_SHOWN`, and what every
 * job in the room has spent together. A server from before ADR 0282 says the job alone.
 */
export interface RoomSpend extends RoomJob {
  readonly started?:
    | { readonly at: string; readonly by?: string | undefined; readonly act: JobStart }
    | undefined;
  readonly jobs?: readonly SpentJob[] | undefined;
  readonly total_usd?: number | undefined;
  /**
   * How many jobs before this one there are in all, of which `jobs` is the newest
   * `SPENT_JOBS_SHOWN`; the rest are read a page at a time (`SpentJobsPage`). From 11 November
   * 2026 (ADR 0292 addendum).
   */
  readonly jobs_count?: number | undefined;
}

/**
 * `GET /v1/spaces/:id/spend/jobs?before=<since_seq>&limit=<n>` (ADR 0292 addendum): a room's jobs
 * before its present one, newest first, a page at a time: those that began before `before`, at
 * most `limit` (`SPENT_JOBS_PAGE` when not said, `SPENT_JOBS_PAGE_MAX` at most). `next` is the
 * `before` of the page after, and absent on the last.
 */
export interface SpentJobsPage {
  readonly space_id: string;
  readonly jobs: readonly SpentJob[];
  readonly next?: number | undefined;
}

/** A page of a room's jobs, when its read does not say how many. */
export const SPENT_JOBS_PAGE = 30;
/** The most jobs one page of them holds. */
export const SPENT_JOBS_PAGE_MAX = 100;

/**
 * A room's job as Chips reads it: what it has spent against the room's ceiling, which is `null`
 * in a room with no cap (ADR 0292).
 */
export type RoomJob = Omit<JobSpend, "ceiling_usd"> & { readonly ceiling_usd: number | null };

/**
 * The room's job as a harness is handed it, and as Chips holds the agents by it: nothing in a room
 * with no cap (ADR 0292), which hands a harness no spend and holds nobody.
 */
export function cappedSpend(job: RoomJob): JobSpend | undefined {
  const { ceiling_usd, spent_usd, since_seq, uncounted_runs } = job;
  return ceiling_usd === null ? undefined : { ceiling_usd, spent_usd, since_seq, uncounted_runs };
}

/** How many of a room's jobs before the present one the spend read lists. */
export const SPENT_JOBS_SHOWN = 30;

/** An amount as the room's words say it: "$3.00", "$0.25", "$1,000.00". */
export function dollars(usd: number): string {
  const [whole = "0", cents = "00"] = usd.toFixed(2).split(".");
  return `$${whole.replace(/\B(?=(\d{3})+$)/g, ",")}.${cents}`;
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
