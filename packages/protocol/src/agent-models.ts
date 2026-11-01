/**
 * An agent's model and effort (ADR 0140): what it runs on and how hard it thinks, chosen on its
 * page in Chips and kept by its harness.
 *
 * Nothing about a model is Chips'. A harness that declares `models` sends a copy of each agent's:
 * the model it runs on now and its effort, whether those are its own or the harness's default for
 * it ("Same as J"), the models it may run on, each with its effort levels, lowest first, and every
 * word a page shows for them. A person's change goes down the harness's socket as a `model.change`
 * frame, and is done when the harness sends its copy back answering it, or refused with its words.
 *
 * The copies live in a registry, not the log, as context files do (ADR 0134): one row per agent,
 * holding the last change asked of it.
 */

import { z } from "zod";
import { id, isoTimestamp } from "./primitives.js";

/** The most models an agent's copy offers. A harness sends the ones worth choosing. */
export const MODEL_CHOICES_MAX = 40;
/** The most effort levels a model has, one bar each. A harness sends its most useful eight. */
export const EFFORT_LEVELS_MAX = 8;
/**
 * How long a change waits for its harness's answer: the minute a context edit has. After it the
 * change is missed, and the person is told the harness hasn't answered; an answer after it still
 * counts, and a new change may be asked.
 */
export const MODEL_CHANGE_WAIT_MS = 60_000;

const modelId = z.string().min(1).max(200);
const effortId = z.string().min(1).max(64);
const label = z.string().min(1).max(80);

export const effortLevel = z
  .object({
    id: effortId.describe("The harness's own word for it: `high`."),
    label: z.string().min(1).max(40).describe("What its bar says: `High`."),
  })
  .describe("One effort level of a model, as its harness names it (ADR 0140).");
export type EffortLevel = z.infer<typeof effortLevel>;

export const modelChoice = z
  .object({
    id: modelId.describe("The harness's own id for the model: `heron-2`, `lathe/heron-2`."),
    label: label.describe("What its row says: `Heron 2`."),
    efforts: z
      .array(effortLevel)
      .max(EFFORT_LEVELS_MAX)
      .refine((levels) => new Set(levels.map((level) => level.id)).size === levels.length, {
        message: "Each level is named once.",
      })
      .describe("Its effort levels, lowest first: eight at most, none for a model without any."),
    effort_default: effortId
      .optional()
      .describe("The level it runs at when none is set, if the harness knows it."),
  })
  .refine(
    (choice) =>
      choice.effort_default === undefined ||
      choice.efforts.some((level) => level.id === choice.effort_default),
    { message: "A model's default level is one of its levels." },
  )
  .describe("One model an agent may run on (ADR 0140).");
export type ModelChoice = z.infer<typeof modelChoice>;

/** Whether `effort` is a level of the model `model` names among `choices`: absent for none. */
export function effortFits(
  choices: readonly ModelChoice[],
  model: string,
  effort: string | undefined,
): boolean {
  const choice = choices.find((each) => each.id === model);
  if (choice === undefined) return false;
  if (effort === undefined) return true;
  return choice.efforts.some((level) => level.id === effort);
}

export const modelDefault = z
  .object({
    label: label.describe("What the switch says: `Same as J`, `Lathe's default`."),
    model: modelId,
    effort: effortId.optional(),
  })
  .describe("What an agent runs on with no model or effort of its own (ADR 0140).");
export type ModelDefault = z.infer<typeof modelDefault>;

const copyFields = {
  model: modelId.describe("The model it runs on now: an id among `choices`."),
  effort: effortId
    .optional()
    .describe("The level it runs at now: one of its model's. Absent when its model has none."),
  own: z
    .boolean()
    .describe("It has a model or an effort of its own. `false`: it runs on `default`."),
  default: modelDefault
    .optional()
    .describe("What it runs on with none of its own. Absent: there is no Same as switch."),
  choices: z
    .array(modelChoice)
    .min(1)
    .max(MODEL_CHOICES_MAX)
    .refine((choices) => new Set(choices.map((choice) => choice.id)).size === choices.length, {
      message: "Each model is named once.",
    })
    .describe("The models it may run on: forty at most, its own among them."),
  editable: z.boolean().describe("Whether a person may change it from Chips."),
  why_read_only: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe("Why not, in the harness's words: `Lathe's own agent. Change it in Lathe.`"),
  followed_by: z
    .int()
    .nonnegative()
    .optional()
    .describe("How many agents have none of their own and run on this one's."),
};

type Copy = {
  readonly model: string;
  readonly effort?: string | undefined;
  readonly default?: ModelDefault | undefined;
  readonly choices: readonly ModelChoice[];
};

const runsOnAChoice = (copy: Copy): boolean => effortFits(copy.choices, copy.model, copy.effort);
const defaultIsAChoice = (copy: Copy): boolean =>
  copy.default === undefined || effortFits(copy.choices, copy.default.model, copy.default.effort);

export const agentModelPut = z
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
  .refine(runsOnAChoice, {
    path: ["model"],
    message: "The model is one of `choices`, and its effort one of that model's levels.",
  })
  .refine(defaultIsAChoice, {
    path: ["default"],
    message: "The default's model is one of `choices`, and its effort one of that model's.",
  })
  .describe("`PUT /v1/agents/:id/model`: a harness's copy of one of its agents' model and effort.");
export type AgentModelPut = z.infer<typeof agentModelPut>;

/** The copy as Chips keeps it: what the harness sent, without what it answered. */
export type AgentModelCopy = Omit<AgentModelPut, "answers" | "refuses">;

export const modelChangeAsk = z
  .object({
    model: modelId
      .nullable()
      .describe("The model to run on, one of `choices`. `null`, with `effort`: the default's."),
    effort: effortId
      .nullable()
      .describe("One of that model's levels; `null` for a model with none, or for the default."),
  })
  .describe("`POST /v1/agents/:id/model/changes`: both of its own, or both the default's.");
export type ModelChangeAsk = z.infer<typeof modelChangeAsk>;

export const MODEL_CHANGE_STATES = ["waiting", "saved", "failed", "missed"] as const;
export const modelChangeState = z.enum(MODEL_CHANGE_STATES);
export type ModelChangeState = z.infer<typeof modelChangeState>;

export const modelChangeView = z
  .object({
    change_id: id("change"),
    state: modelChangeState.describe(
      "`missed` once `MODEL_CHANGE_WAIT_MS` has passed with no answer; read, never stored.",
    ),
    model: modelId.nullable(),
    effort: effortId.nullable(),
    asked_at: isoTimestamp,
    answered_at: isoTimestamp.optional(),
    message: z.string().max(300).optional().describe("The harness's words, for a refusal."),
  })
  .describe(
    "The last change a person asked of an agent's model, and what became of it (ADR 0140).",
  );
export type ModelChangeView = z.infer<typeof modelChangeView>;

export const agentModelView = z
  .object({
    agent_id: id("agent"),
    harness_id: id("harness"),
    ...copyFields,
    read_at: isoTimestamp.describe("When the harness last sent its copy."),
    away: z.boolean().describe("No socket of the harness hears changes now: read, not changed."),
    change: modelChangeView.optional(),
  })
  .describe("`GET /v1/agents/:id/model`, for the harness's owner or an admin.");
export type AgentModelView = z.infer<typeof agentModelView>;

export const modelChangeFrame = z
  .object({
    frame: z.literal("model.change"),
    change_id: id("change"),
    harness_id: id("harness"),
    agent_id: id("agent"),
    model: modelId.nullable().describe("`null`, with `effort`: no model of its own, the default."),
    effort: effortId.nullable(),
    asked_by: id("person"),
    asked_at: isoTimestamp,
  })
  .describe(
    "A person changed an agent's model or effort (ADR 0140). Sent to a harness's socket that said `models` in its `hello`, now or never: it is not in the log. The harness answers with the agent's copy, `answers` or `refuses` naming `change_id`.",
  );
export type ModelChangeFrame = z.infer<typeof modelChangeFrame>;
