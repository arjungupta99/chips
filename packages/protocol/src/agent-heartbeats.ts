/**
 * An agent's heartbeat (ADR 0143): a turn its harness starts on its own every so often, switched
 * on or off and timed on the agent's page in Chips, and kept by its harness.
 *
 * Nothing about a heartbeat is Chips'. A harness that declares `heartbeats` sends a copy of each
 * agent's: whether it is on, how often it beats in minutes, the intervals a person may pick, and
 * whether a person may change it. Chips puts the minutes into words itself. A person's change goes
 * down the harness's socket as a `heartbeat.change` frame, and is done when the harness sends its
 * copy back answering it, or refused with its words.
 *
 * The copies live in a registry, not the log, as a model's do (ADR 0140): one row per agent,
 * holding the last change asked of it. What a heartbeat says in a room is an ordinary message,
 * marked `heartbeat` on `message.post`.
 */

import { z } from "zod";
import { id, isoTimestamp } from "./primitives.js";

/** The most intervals an agent's copy offers. */
export const HEARTBEAT_CHOICES_MAX = 12;
/** The longest interval, in minutes: a week. */
export const HEARTBEAT_EVERY_MAX = 10_080;
/**
 * How long a change waits for its harness's answer: the minute a model's change has. After it the
 * change is missed, and the person is told the harness hasn't answered; an answer after it still
 * counts, and a new change may be asked.
 */
export const HEARTBEAT_CHANGE_WAIT_MS = 60_000;

const minutes = z.int().min(1).max(HEARTBEAT_EVERY_MAX);

const ascending = (choices: readonly number[]): boolean =>
  choices.every((each, at) => at === 0 || each > (choices[at - 1] ?? 0));

const copyFields = {
  on: z.boolean().describe("Whether it beats now."),
  every: minutes.describe(
    "How often it beats, in minutes: one of `choices`, kept while it is off.",
  ),
  choices: z
    .array(minutes)
    .min(1)
    .max(HEARTBEAT_CHOICES_MAX)
    .refine(ascending, { message: "The intervals go up, each named once." })
    .describe("The intervals a person may pick, in minutes, shortest first: twelve at most."),
  editable: z.boolean().describe("Whether a person may change it from Chips."),
  why_read_only: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe("Why not, in the harness's words, only when it is not `editable`."),
};

type Copy = {
  readonly every: number;
  readonly choices: readonly number[];
  readonly editable: boolean;
  readonly why_read_only?: string | undefined;
};

const beatsAChoice = (copy: Copy): boolean => copy.choices.includes(copy.every);
const whyOnlyWhenReadOnly = (copy: Copy): boolean =>
  copy.why_read_only === undefined || !copy.editable;

export const agentHeartbeatPut = z
  .object({
    ...copyFields,
    answers: id("change")
      .optional()
      .describe("The change this copy answers: made, and this is the agent as it is now."),
    refuses: z
      .object({
        change_id: id("change"),
        message: z.string().min(1).max(300).optional().describe("Why not, for the person."),
      })
      .optional()
      .describe("A change not made. The copy beside it is the agent as it is now."),
  })
  .refine(beatsAChoice, { path: ["every"], message: "`every` is one of `choices`." })
  .refine(whyOnlyWhenReadOnly, {
    path: ["why_read_only"],
    message: "Say why only for a heartbeat that can't be changed.",
  })
  .describe("`PUT /v1/agents/:id/heartbeat`: a harness's copy of one of its agents' heartbeat.");
export type AgentHeartbeatPut = z.infer<typeof agentHeartbeatPut>;

/** The copy as Chips keeps it: what the harness sent, without what it answered. */
export type AgentHeartbeatCopy = Omit<AgentHeartbeatPut, "answers" | "refuses">;

export const heartbeatChangeAsk = z
  .object({
    on: z.boolean().describe("Whether it is to beat."),
    every: minutes
      .optional()
      .describe("How often, one of `choices`. Left out: the copy's own `every`."),
  })
  .describe("`POST /v1/agents/:id/heartbeat/changes`: on or off, and how often.");
export type HeartbeatChangeAsk = z.infer<typeof heartbeatChangeAsk>;

export const HEARTBEAT_CHANGE_STATES = ["waiting", "saved", "failed", "missed"] as const;
export const heartbeatChangeState = z.enum(HEARTBEAT_CHANGE_STATES);
export type HeartbeatChangeState = z.infer<typeof heartbeatChangeState>;

export const heartbeatChangeView = z
  .object({
    change_id: id("change"),
    state: heartbeatChangeState.describe(
      "`missed` once `HEARTBEAT_CHANGE_WAIT_MS` has passed with no answer; read, never stored.",
    ),
    on: z.boolean(),
    every: minutes,
    asked_at: isoTimestamp,
    answered_at: isoTimestamp.optional(),
    message: z.string().max(300).optional().describe("The harness's words, for a refusal."),
  })
  .describe(
    "The last change a person asked of an agent's heartbeat, and what became of it (ADR 0143).",
  );
export type HeartbeatChangeView = z.infer<typeof heartbeatChangeView>;

export const agentHeartbeatView = z
  .object({
    agent_id: id("agent"),
    harness_id: id("harness"),
    ...copyFields,
    read_at: isoTimestamp.describe("When the harness last sent its copy."),
    away: z.boolean().describe("No socket of the harness hears changes now: read, not changed."),
    change: heartbeatChangeView.optional(),
  })
  .describe("`GET /v1/agents/:id/heartbeat`, for the harness's owner or an admin.");
export type AgentHeartbeatView = z.infer<typeof agentHeartbeatView>;

export const heartbeatChangeFrame = z
  .object({
    frame: z.literal("heartbeat.change"),
    change_id: id("change"),
    harness_id: id("harness"),
    agent_id: id("agent"),
    on: z.boolean(),
    every: minutes.describe(
      "One of the copy's `choices`: the copy's own when the person named none.",
    ),
    asked_by: id("person"),
    asked_at: isoTimestamp,
  })
  .describe(
    "A person switched an agent's heartbeat or changed how often it beats (ADR 0143). Sent to a harness's socket that said `heartbeats` in its `hello`, now or never: it is not in the log. The harness answers with the agent's copy, `answers` or `refuses` naming `change_id`.",
  );
export type HeartbeatChangeFrame = z.infer<typeof heartbeatChangeFrame>;
