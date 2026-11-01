/**
 * An agent's context (ADR 0134): the files its harness builds it from at every turn, apart from
 * the room — who it is, how it works, what it knows of the person it serves — listed in Chips and
 * edited there, in the harness's own files.
 *
 * Chips adds no context of its own and knows nothing of any harness's files. A harness that
 * declares `context_files` sends a copy of each agent's set, and of its own (what its agents share,
 * and what a new agent starts with), and keeps them current; each file says what it is called,
 * what its row says, whether it may be edited, and whether the agent reads a shared one instead of
 * its own. A person's edit goes down the harness's socket as a `context.edit` frame, and is done
 * when the harness sends its copy back answering it, or refused when the file changed under it.
 *
 * At most eight files are shown: a harness names the rest in `not_shown`, and the page says Chips
 * does not show them. A file over 64 KB is named there too. Neither is lost in silence: a ninth
 * file, or a larger text, is refused.
 *
 * The copies live in a registry, not the log: what a person wrote about themselves is not
 * replayed to every device, and an edit is never sent to a harness twice.
 */

import { z } from "zod";
import { id, isoTimestamp } from "./primitives.js";

/** The most files an agent's page, or a harness's, shows. The rest are named in `not_shown`. */
export const CONTEXT_FILES_SHOWN = 8;
/** The most a file's text may hold, in UTF-8 bytes. A larger one is named in `not_shown`. */
export const CONTEXT_FILE_BYTES = 65_536;
/** The most files `not_shown` names. */
export const CONTEXT_NOT_SHOWN_MAX = 64;
/**
 * How long an edit waits for its harness's answer: the minute a fork or a new agent has. After it
 * the edit is missed, and the person is told the harness hasn't answered; an answer after it still
 * counts.
 */
export const CONTEXT_EDIT_WAIT_MS = 60_000;
/** The code an edit is refused with when the file changed after the person opened it. */
export const STALE_CONTEXT = "stale_context";

/**
 * What a file is for, so the same kind of file wears the same mark on every harness. The one word
 * list harnesses share; it picks a row's mark and nothing else.
 */
export const CONTEXT_ROLES = ["identity", "instructions", "about_you", "memory", "other"] as const;
export const contextRole = z.enum(CONTEXT_ROLES);
export type ContextRole = z.infer<typeof contextRole>;

/**
 * A file's own name, one path segment (SEC-14): no slash either way, no NUL, not `.` or `..`. A
 * harness writes a person's edit to the file the edit names, under the agent's folder; a name that
 * climbed out of it would write wherever a stranger's server, or a man in the middle on the plain
 * network link, cared to say. Every name a file is written under is one of these; a file that is
 * only named as not shown may be called anything, since nothing is written under it.
 */
const ONE_SEGMENT = /^(?!\.{1,2}$)[^/\\\0]+$/;
const fileName = z
  .string()
  .min(1)
  .max(255)
  .regex(ONE_SEGMENT, "a file's own name: one segment, no slash, not `.` or `..`");
const shownName = z.string().min(1).max(255);
const title = z.string().min(1).max(80);
const hash = z.string().min(1).max(128);

/** The size of a text in UTF-8 bytes. */
export function contextBytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

const fileFields = {
  name: fileName.describe("Its own name, shown small under the title: `PERSONA.md`."),
  title: title.describe("What its row says, in the harness's words: `Who it is`."),
  about: z.string().max(200).optional().describe("The row's line. Absent: the text's first line."),
  role: contextRole.optional().describe("What it is for, which picks its mark. Absent: `other`."),
  text: z
    .string()
    .optional()
    .describe(
      "Its text. Absent only for a file the agent reads from its harness's set (`shared`).",
    ),
  hash: hash
    .optional()
    .describe("The harness's own hash of `text`, which an edit names as what it was made from."),
  editable: z.boolean().describe("Whether a person may change it from Chips."),
  why_read_only: z
    .string()
    .max(120)
    .optional()
    .describe("Why it may not be, in the harness's words: `Built into Lathe`."),
  shared: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe(
      "The `id` of a file in the harness's own set that this agent reads instead of a file of its own.",
    ),
  replaceable: z
    .boolean()
    .optional()
    .describe(
      "For a `shared` file: whether the agent may be given its own, begun from the shared text.",
    ),
};

function textFits(file: { readonly text?: string | undefined }): boolean {
  return file.text === undefined || contextBytes(file.text) <= CONTEXT_FILE_BYTES;
}

export const contextFile = z
  .object(fileFields)
  .refine((file) => file.text !== undefined || file.shared !== undefined, {
    message: "A file has its text, or names the shared file the agent reads.",
  })
  .refine(textFits, {
    message: "A file's text is 64 KB at most: name a larger one in `not_shown`.",
  })
  .describe("One file an agent is built from, as its harness names it (ADR 0134).");
export type ContextFile = z.infer<typeof contextFile>;

export const sharedContextFile = z
  .object({
    ...fileFields,
    id: z.string().min(1).max(64).describe("What an agent's file names in `shared`."),
    used_by: z
      .int()
      .nonnegative()
      .optional()
      .describe(
        "How many of its agents read it, `0` when none does now. Left out: no agent reads it, and each new agent is given a copy of its own (`for_new_agents`).",
      ),
    for_new_agents: z
      .boolean()
      .optional()
      .describe("Whether a new agent starts with it, or with a copy of it."),
  })
  .refine((file) => file.text !== undefined, { message: "A shared file has its text." })
  .refine(textFits, {
    message: "A file's text is 64 KB at most: name a larger one in `not_shown`.",
  })
  .describe(
    "One file of a harness's own set: read by several of its agents, or copied into a new one (ADR 0134).",
  );
export type SharedContextFile = z.infer<typeof sharedContextFile>;

export const notShownFile = z
  .object({
    name: shownName,
    title: title.optional(),
    reason: z.enum(["count", "too_large"]).describe("Past the eighth, or over 64 KB."),
  })
  .describe("A file the agent has that Chips does not show (ADR 0134).");
export type NotShownFile = z.infer<typeof notShownFile>;

export const contextAnswer = {
  answers: id("edit")
    .optional()
    .describe("The edit this copy answers: saved, and this is the file as it is now."),
  refuses: z
    .object({
      edit_id: id("edit"),
      reason: z
        .enum(["changed", "failed"])
        .describe("`changed`: the file was changed since the edit's version. `failed`: otherwise."),
      message: z.string().min(1).max(300).optional().describe("What went wrong, for the person."),
    })
    .optional()
    .describe("An edit not made. The copy beside it is the file as it is now."),
};

/**
 * When the agent reads its files, in its harness's words, for the foot under them on its page (ADR
 * 0238): a harness that reads them only when a conversation starts says so, and what a change
 * waits for. Absent: Chips says the harness gives them at the start of every turn.
 */
const readNote = z
  .string()
  .min(1)
  .max(300)
  .describe(
    "When the agent reads these, in the harness's words: `Hermes reads these when a conversation starts.` Absent: at the start of every turn.",
  );

function uniqueNames(files: readonly { readonly name: string }[]): boolean {
  return new Set(files.map((file) => file.name)).size === files.length;
}

export const agentContextPut = z
  .object({
    files: z
      .array(contextFile)
      .max(CONTEXT_FILES_SHOWN)
      .refine(uniqueNames, { message: "Each file is named once." })
      .describe("The agent's files, in the order its page shows them: eight at most."),
    not_shown: z.array(notShownFile).max(CONTEXT_NOT_SHOWN_MAX).optional(),
    read_note: readNote.optional(),
    ...contextAnswer,
  })
  .describe("`PUT /v1/agents/:id/context`: a harness's copy of one of its agents' files.");
export type AgentContextPut = z.infer<typeof agentContextPut>;

export const harnessContextPut = z
  .object({
    shared: z
      .array(sharedContextFile)
      .max(CONTEXT_FILES_SHOWN)
      .refine(uniqueNames, { message: "Each file is named once." })
      .refine((files) => new Set(files.map((file) => file.id)).size === files.length, {
        message: "Each shared file has its own id.",
      }),
    not_shown: z.array(notShownFile).max(CONTEXT_NOT_SHOWN_MAX).optional(),
    new_agents_note: z
      .string()
      .min(1)
      .max(300)
      .optional()
      .describe("What else a new agent starts with, in the harness's words, for its page."),
    ...contextAnswer,
  })
  .describe("`PUT /v1/harnesses/:id/context`: a harness's copy of its own set.");
export type HarnessContextPut = z.infer<typeof harnessContextPut>;

export const contextEditAsk = z
  .object({
    name: fileName.describe("The file to change."),
    text: z.string().refine((text) => contextBytes(text) <= CONTEXT_FILE_BYTES, {
      message: "A file's text is 64 KB at most.",
    }),
    base_hash: hash
      .nullable()
      .describe(
        "The version the person changed, as the copy they read said. `null` to give the agent its own of a shared file.",
      ),
  })
  .describe("`POST /v1/agents/:id/context/edits` and `/v1/harnesses/:id/context/edits`.");
export type ContextEditAsk = z.infer<typeof contextEditAsk>;

export const CONTEXT_EDIT_STATES = ["waiting", "saved", "changed", "failed", "missed"] as const;
export const contextEditState = z.enum(CONTEXT_EDIT_STATES);
export type ContextEditState = z.infer<typeof contextEditState>;

export const contextEditView = z
  .object({
    edit_id: id("edit"),
    name: fileName,
    state: contextEditState.describe(
      "`missed` once `CONTEXT_EDIT_WAIT_MS` has passed with no answer; read, never stored.",
    ),
    asked_at: isoTimestamp,
    answered_at: isoTimestamp.optional(),
    message: z.string().max(300).optional().describe("The harness's words, for a failure."),
  })
  .describe("An edit a person asked for, and what became of it (ADR 0134).");
export type ContextEditView = z.infer<typeof contextEditView>;

export const agentContextView = z
  .object({
    agent_id: id("agent"),
    harness_id: id("harness"),
    files: z.array(contextFile),
    not_shown: z.array(notShownFile),
    read_note: readNote.optional(),
    read_at: isoTimestamp.describe("When the harness last sent its copy."),
    away: z.boolean().describe("No socket of the harness hears edits now: read, but not saved."),
  })
  .describe("`GET /v1/agents/:id/context`, for the harness's owner.");
export type AgentContextView = z.infer<typeof agentContextView>;

export const harnessContextView = z
  .object({
    harness_id: id("harness"),
    shared: z.array(sharedContextFile),
    not_shown: z.array(notShownFile),
    new_agents_note: z.string().optional(),
    read_at: isoTimestamp,
    away: z.boolean(),
  })
  .describe("`GET /v1/harnesses/:id/context`, for the harness's owner.");
export type HarnessContextView = z.infer<typeof harnessContextView>;

export const contextEditFrame = z
  .object({
    frame: z.literal("context.edit"),
    edit_id: id("edit"),
    harness_id: id("harness"),
    agent_id: id("agent")
      .optional()
      .describe("The agent whose file it is; absent for the harness's own."),
    name: fileName,
    text: z.string(),
    base_hash: hash.nullable().describe("`null`: make the agent its own, from the shared file."),
    asked_by: id("person"),
    asked_at: isoTimestamp,
  })
  .describe(
    "A person changed a context file (ADR 0134). Sent to a harness's socket that said `context` in its `hello`, now or never: it is not in the log. The harness answers with its copy, `answers` or `refuses` naming `edit_id`.",
  );
export type ContextEditFrame = z.infer<typeof contextEditFrame>;
