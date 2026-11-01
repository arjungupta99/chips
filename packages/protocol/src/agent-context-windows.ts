/**
 * An agent's context window (ADR 0146): how full it is, a person's Compact now, and the limit it
 * compacts itself at, shown and changed on the agent's page in Chips and kept by its harness.
 *
 * Nothing about a context window is Chips'. A harness that declares `context_windows` sends a copy
 * of each agent's: how many tokens it holds and its model's window, whether it is compacting, when
 * it last compacted and from how much to how much, whether it takes a Compact now, and the limit it
 * compacts itself at with the limits a person may pick, and how full its last long turn got.
 * Chips puts the numbers into words itself.
 *
 * A person asks two things of it, each going down the harness's socket and answered by its next
 * copy, as a model's change is (ADR 0140): Compact now, as `context_window.compact`, answered when
 * the harness takes it on and done when a copy says it compacted since; and a new limit, as
 * `context_window.change`. The copies live in a registry, not the log, one row per agent with the
 * last of each ask beside it. When a copy says the agent compacted, Chips writes a quiet line in
 * its room, `context.compacted`.
 */

import { z } from "zod";
import { id, isoTimestamp } from "./primitives.js";

/** The most limits an agent's copy offers. */
export const WINDOW_LIMIT_CHOICES_MAX = 12;
/**
 * How long either ask waits for its harness's answer: the minute a model's change has. After it
 * the ask is missed, and the person is told the harness hasn't answered; an answer after it still
 * counts, and a new ask may be made.
 */
export const WINDOW_ASK_WAIT_MS = 60_000;

/** A limit: the percent of the window at which the agent compacts itself. */
const percent = z.int().min(1).max(99);
const tokens = z.int().nonnegative();

const ascending = (choices: readonly number[]): boolean =>
  choices.every((each, at) => at === 0 || each > (choices[at - 1] ?? 0));

export const COMPACTED_BY = ["asked", "itself"] as const;

export const lastCompaction = z
  .object({
    at: isoTimestamp.describe("When it finished compacting."),
    from: tokens.describe("The tokens it held before."),
    to: tokens.describe("The tokens it held after."),
    by: z
      .enum(COMPACTED_BY)
      .describe(
        "`asked`: a person asked, from Chips or elsewhere. `itself`: at its limit, or full.",
      ),
  })
  .describe("The agent's last compaction.");
export type LastCompaction = z.infer<typeof lastCompaction>;

/** How many times a long turn may say it compacted itself, at most. */
export const LONG_TURN_FOLDS_MAX = 1000;

export const longTurn = z
  .object({
    at: isoTimestamp.describe("When the turn ended."),
    peak: tokens.describe("The most it held at once during the turn, as its harness counted it."),
    folds: z
      .int()
      .nonnegative()
      .max(LONG_TURN_FOLDS_MAX)
      .describe("How many times it compacted itself during the turn."),
  })
  .describe(
    "Its last long turn: the last whose height passed half its window. A copy between turns reads low for an agent that holds little between them; this is how full it got while working.",
  );
export type LongTurn = z.infer<typeof longTurn>;

export const windowLimit = z
  .object({
    at: percent
      .nullable()
      .describe(
        "The percent of the window it compacts itself at, one of `choices`. `null`: only when asked, or when its harness must.",
      ),
    choices: z
      .array(percent)
      .min(1)
      .max(WINDOW_LIMIT_CHOICES_MAX)
      .refine(ascending, { message: "The limits go up, each named once." })
      .describe("The limits a person may pick, lowest first: twelve at most."),
    default: percent
      .nullable()
      .optional()
      .describe(
        "The harness's own limit, marked among the choices; `null` when its own is only when asked.",
      ),
    may_turn_off: z.boolean().describe("Whether a person may pick only when asked (`at: null`)."),
  })
  .refine((limit) => limit.at === null || limit.choices.includes(limit.at), {
    path: ["at"],
    message: "`at` is one of `choices`, or `null`.",
  })
  .refine((limit) => limit.at !== null || limit.may_turn_off, {
    path: ["at"],
    message: "`at` is `null` only for a limit that may be turned off.",
  })
  .refine(
    (limit) =>
      limit.default === undefined ||
      limit.default === null ||
      limit.choices.includes(limit.default),
    { path: ["default"], message: "`default` is one of `choices`." },
  )
  .describe("The limit an agent compacts itself at, and what a person may pick.");
export type WindowLimit = z.infer<typeof windowLimit>;

const copyFields = {
  used: tokens.describe("The tokens the agent holds now, as its harness counts them."),
  window: z.int().positive().describe("Its model's context window, in tokens."),
  model: z.string().min(1).max(120).optional().describe("The model whose window it is."),
  as_of: isoTimestamp.describe("When `used` was measured."),
  compacting: z
    .enum(["queued", "running"])
    .optional()
    .describe(
      "While it compacts: `queued`, waiting for its turn to end; `running`, under way. Absent otherwise.",
    ),
  last: lastCompaction.optional(),
  long_turn: longTurn
    .optional()
    .describe("Absent when its harness has seen no long turn of it, or keeps no record of one."),
  compacts: z.boolean().describe("Whether it takes a Compact now from Chips."),
  why_not: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe("Why not, in the harness's words, only when it doesn't `compacts`."),
  limit: windowLimit
    .optional()
    .describe("Absent: its harness keeps its own limit and offers no other."),
  editable: z.boolean().describe("Whether a person may change its limit from Chips."),
  why_read_only: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe("Why not, in the harness's words, only when it is not `editable`."),
};

type Copy = {
  readonly compacts: boolean;
  readonly why_not?: string | undefined;
  readonly editable: boolean;
  readonly why_read_only?: string | undefined;
};

const whyNotOnlyWhenNot = (copy: Copy): boolean => copy.why_not === undefined || !copy.compacts;
const whyOnlyWhenReadOnly = (copy: Copy): boolean =>
  copy.why_read_only === undefined || !copy.editable;

export const agentContextWindowPut = z
  .object({
    ...copyFields,
    answers: id("change")
      .optional()
      .describe(
        "The ask this copy answers: a limit set, or a Compact now taken on, and this is the agent as it is now.",
      ),
    refuses: z
      .object({
        change_id: id("change"),
        message: z.string().min(1).max(300).optional().describe("Why not, for the person."),
      })
      .optional()
      .describe("An ask not done. The copy beside it is the agent as it is now."),
  })
  .refine(whyNotOnlyWhenNot, {
    path: ["why_not"],
    message: "Say why not only for an agent that takes no Compact now.",
  })
  .refine(whyOnlyWhenReadOnly, {
    path: ["why_read_only"],
    message: "Say why only for a limit that can't be changed.",
  })
  .describe(
    "`PUT /v1/agents/:id/context-window`: a harness's copy of one of its agents' context window.",
  );
export type AgentContextWindowPut = z.infer<typeof agentContextWindowPut>;

/** The copy as Chips keeps it: what the harness sent, without what it answered. */
export type AgentContextWindowCopy = Omit<AgentContextWindowPut, "answers" | "refuses">;

export const windowLimitAsk = z
  .object({
    at: percent
      .nullable()
      .describe("One of the copy's limit `choices`, or `null` for only when asked."),
  })
  .describe("`POST /v1/agents/:id/context-window/changes`: the limit it compacts itself at.");
export type WindowLimitAsk = z.infer<typeof windowLimitAsk>;

export const WINDOW_CHANGE_STATES = ["waiting", "saved", "failed", "missed"] as const;
export const windowChangeState = z.enum(WINDOW_CHANGE_STATES);
export type WindowChangeState = z.infer<typeof windowChangeState>;

export const windowChangeView = z
  .object({
    change_id: id("change"),
    state: windowChangeState.describe(
      "`missed` once `WINDOW_ASK_WAIT_MS` has passed with no answer; read, never stored.",
    ),
    at: percent.nullable(),
    asked_at: isoTimestamp,
    answered_at: isoTimestamp.optional(),
    message: z.string().max(300).optional().describe("The harness's words, for a refusal."),
  })
  .describe("The last limit a person asked of an agent, and what became of it (ADR 0146).");
export type WindowChangeView = z.infer<typeof windowChangeView>;

/**
 * What became of a Compact now: `waiting` for the harness; `taken`, answered and under way;
 * `done`, a copy says it compacted since or stopped compacting; `failed`, refused; `missed`, no
 * answer within `WINDOW_ASK_WAIT_MS`.
 */
export const COMPACTION_STATES = ["waiting", "taken", "done", "failed", "missed"] as const;
export const compactionState = z.enum(COMPACTION_STATES);
export type CompactionState = z.infer<typeof compactionState>;

export const compactionView = z
  .object({
    change_id: id("change"),
    state: compactionState.describe(
      "`missed` once `WINDOW_ASK_WAIT_MS` has passed with no answer; read, never stored.",
    ),
    asked_at: isoTimestamp,
    answered_at: isoTimestamp.optional(),
    done_at: isoTimestamp.optional(),
    message: z.string().max(300).optional().describe("The harness's words, for a refusal."),
  })
  .describe("The last Compact now a person asked of an agent, and what became of it (ADR 0146).");
export type CompactionView = z.infer<typeof compactionView>;

export const agentContextWindowView = z
  .object({
    agent_id: id("agent"),
    harness_id: id("harness"),
    ...copyFields,
    read_at: isoTimestamp.describe("When the harness last sent its copy."),
    away: z
      .boolean()
      .describe("No socket of the harness hears asks now: read, not compacted or changed."),
    change: windowChangeView.optional(),
    compaction: compactionView.optional(),
  })
  .describe("`GET /v1/agents/:id/context-window`, for the harness's owner or an admin.");
export type AgentContextWindowView = z.infer<typeof agentContextWindowView>;

export const windowCompactFrame = z
  .object({
    frame: z.literal("context_window.compact"),
    change_id: id("change"),
    harness_id: id("harness"),
    agent_id: id("agent"),
    asked_by: id("person"),
    asked_at: isoTimestamp,
  })
  .describe(
    "A person asked an agent to compact its context now (ADR 0146). Sent to a harness's socket that said `context_windows` in its `hello`, now or never: it is not in the log. The harness answers at once with the agent's copy, `answers` naming `change_id` with `compacting` set, or `refuses`; and sends a copy again when it is done.",
  );
export type WindowCompactFrame = z.infer<typeof windowCompactFrame>;

export const windowChangeFrame = z
  .object({
    frame: z.literal("context_window.change"),
    change_id: id("change"),
    harness_id: id("harness"),
    agent_id: id("agent"),
    at: percent
      .nullable()
      .describe("One of the copy's limit `choices`, or `null` for only when asked."),
    asked_by: id("person"),
    asked_at: isoTimestamp,
  })
  .describe(
    "A person changed the limit an agent compacts itself at (ADR 0146). Sent to a harness's socket that said `context_windows` in its `hello`, now or never: it is not in the log. The harness answers with the agent's copy, `answers` or `refuses` naming `change_id`.",
  );
export type WindowChangeFrame = z.infer<typeof windowChangeFrame>;
