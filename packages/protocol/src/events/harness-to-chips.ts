/**
 * Events a harness sends to Chips.
 *
 * The interface is progressive (blueprint, Connect): the minimum is three events — a run
 * started, a message, a run completed. Every extra event upgrades what the person sees. Send
 * step logs and you get receipts; send approval requests and you get approval cards; send
 * context usage and you get the context ring.
 */

import { z } from "zod";
import { defineEvent } from "../envelope.js";
import {
  action,
  agentId,
  approverRef,
  attachment,
  autonomyLevel,
  cost,
  id,
  isoTimestamp,
  memberId,
  preview,
  riskClass,
  sessionRef,
  source,
  stepKind,
} from "../primitives.js";
import { commitId } from "../project.js";

const plannedStep = z
  .object({
    step_id: z
      .string()
      .min(1)
      .max(120)
      .describe("Stable for the life of the run, so updates land on the right row."),
    title: z.string().min(1).max(300).describe("What this step will do."),
  })
  .describe("One step of a plan, shown as a hollow dot until it completes.");

export const sessionStarted = defineEvent({
  type: "session.started",
  direction: "harness_to_chips",
  sender: "harness",
  summary:
    "A visit to a space began: a terminal opened, a process attached. The space outlives it.",
  requiresRun: false,
  payload: z.object({
    session_ref: sessionRef,
    started_reason: z
      .string()
      .max(60)
      .optional()
      .describe("Why the visit began, in the harness's own word: `startup`, `resume`, `fork`."),
    where: z
      .string()
      .max(300)
      .optional()
      .describe('Where it is running, for a person to read: "mbp \u00b7 ~/Work/Chips".'),
    transcript_ref: z
      .string()
      .max(1000)
      .optional()
      .describe("The harness's own transcript of this visit, so a person can jump to it."),
  }),
});

export const sessionEnded = defineEvent({
  type: "session.ended",
  direction: "harness_to_chips",
  sender: "harness",
  summary: "The visit is over. The space, its history and anything still waiting all stay.",
  requiresRun: false,
  payload: z.object({
    session_ref: sessionRef,
    ended_reason: z
      .string()
      .max(60)
      .optional()
      .describe("Why it ended, in the harness's own word: `clear`, `logout`, `other`."),
  }),
});

export const sessionRenamed = defineEvent({
  type: "session.renamed",
  direction: "harness_to_chips",
  sender: "harness",
  summary: "What a visit is called, in the harness's own words (ADR 0040).",
  requiresRun: false,
  payload: z.object({
    session_ref: sessionRef,
    title: z
      .string()
      .min(1)
      .max(200)
      .describe(
        "What to call this visit on screen. A harness that names its sessions sends this when the name changes and not otherwise; a visit with no name is shown by where it is running instead.",
      ),
  }),
});

export const runStarted = defineEvent({
  type: "run.started",
  direction: "harness_to_chips",
  sender: "harness",
  summary: "A harness has begun a unit of work, optionally with the plan it intends to follow.",
  requiresRun: true,
  payload: z.object({
    goal: z
      .string()
      .min(1)
      .max(4000)
      .describe("What the run is for, in the person's words where possible."),
    plan: z
      .array(plannedStep)
      .max(64)
      .optional()
      .describe("The steps the harness expects to take. The run panel draws one hollow dot each."),
    session_ref: sessionRef
      .optional()
      .describe("The visit this run belongs to, so two terminals in one space are told apart."),
    goal_from: z
      .enum(["harness", "chips"])
      .optional()
      .describe(
        "Where the goal came from. `harness`: a person asked for it at the harness's own surface \u2014 a terminal, a chat the harness already had \u2014 so Chips shows it as their message, because otherwise the room holds only the answers. `chips`: it arrived as a message here and is already on screen. Either way the room's header and the run panel leave the goal out, because the room shows it. Omit when the goal was not a person's words at all; the header and the run panel then say it.",
      ),
  }),
});

export const runStatus = defineEvent({
  type: "run.status",
  direction: "harness_to_chips",
  sender: "harness",
  summary: "What the harness is doing right now. This is the harness's typing indicator.",
  requiresRun: true,
  payload: z.object({
    phase: z.string().min(1).max(120).describe("A short machine-ish label, for example `reading`."),
    verb_phrase: z
      .string()
      .min(1)
      .max(200)
      .describe('What to show under the harness\'s name, for example "Reading PO #4471…".'),
    progress: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Fraction complete, when the harness knows."),
    estimate_seconds: z
      .int()
      .nonnegative()
      .optional()
      .describe("Seconds remaining, when the harness knows."),
  }),
});

export const runPlan = defineEvent({
  type: "run.plan",
  direction: "harness_to_chips",
  sender: "harness",
  summary:
    "The plan changed. Replaces the steps not yet done; the ones already done or failed keep their place.",
  requiresRun: true,
  payload: z.object({
    plan: z
      .array(plannedStep)
      .min(1)
      .max(64)
      .describe(
        "The steps still to come, in order. Steps already done or failed stay ahead of these; a step still to do that is not here is dropped.",
      ),
    reason: z
      .string()
      .max(1000)
      .optional()
      .describe("Why the plan changed, in a sentence: a steer, a surprise, a shortcut."),
  }),
});

export const stepLog = defineEvent({
  type: "step.log",
  direction: "harness_to_chips",
  sender: "harness",
  summary: "One tool call or reasoning step, for the receipt and the run timeline.",
  requiresRun: true,
  payload: z.object({
    step_id: z
      .string()
      .min(1)
      .max(120)
      .describe("Stable across the started and done events for one step."),
    status: z.enum(["started", "done", "failed"]).describe("Where this step got to."),
    title: z
      .string()
      .max(300)
      .optional()
      .describe("What the step is, when it was not in the plan."),
    tool: z.string().max(120).optional().describe("The tool called, for example `drive.read`."),
    kind: stepKind
      .optional()
      .describe(
        "What kind of call the tool is, when the harness knows: the apps draw a step by it where they do not know the tool by its name.",
      ),
    summary: z.string().max(2000).optional().describe("One line for the receipt."),
    sources: z.array(source).max(32).optional().describe("Where the information came from."),
    duration_ms: z.int().nonnegative().optional().describe("How long the step took."),
    error: z.string().max(2000).optional().describe("Why it failed, when it did."),
  }),
});

export const messagePost = defineEvent({
  type: "message.post",
  direction: "harness_to_chips",
  sender: "either",
  chipsWrites: ["held_since", "from_held"],
  summary: "A harness says something in a space, with any attachments.",
  requiresRun: false,
  payload: z.object({
    text: z.string().max(64_000).describe("Markdown, with mentions."),
    attachments: z
      .array(attachment)
      .max(20)
      .optional()
      .describe("Photos, video, voice notes, files, as the upload described them."),
    upload_ids: z
      .array(id("attachment"))
      .max(20)
      .optional()
      .describe(
        "Uploads to attach, by the id `POST /v1/uploads` gave. Chips fills in `attachments` from what it stored.",
      ),
    replaces: z
      .record(id("attachment"), id("attachment"))
      .refine((map) => Object.keys(map).length <= 20, "a post carries 20 files at most")
      .optional()
      .describe(
        "Which version of the room's file each file here was made from (ADR 0099): an upload's or attachment's id, to the `attachment_id` of the version it changes, as `context.files` listed it. Each key is one of this post's `upload_ids` or `attachments`. A post made from a version that is no longer current is refused, `stale_file`, saying which file and who changed it; nothing of it is taken. A version of another name, or of another room, is no version of this file: Chips leaves it out. Chips copies each onto its attachment as `replaces`, and does not keep the map.",
      ),
    change: commitId
      .optional()
      .describe(
        "The commit the turn's push left the room's project at (ADR 0222): the room shows the change with this message. Chips keeps it only when the commit is on the room's `main` and is this agent's own; otherwise the message is kept without it.",
      ),
    reply_to: id("message")
      .optional()
      .describe(
        "The message being answered, when it is a reply: one said in the same room, or the post is refused (ADR 0219). A person's reply to an agent's message is for that agent, unless an @ or `to` says otherwise; a harness's reply to an agent's message is for that agent too (ADR 0081), so a harness sets it only when it means to address them.",
      ),
    session_ref: sessionRef
      .optional()
      .describe(
        "The visit this message is for, when the sender means one of several (ADR 0040). Chips checks it names a session of this space and carries it to the harness; a harness that works by visits delivers there rather than choosing, and one that does not ignores it.",
      ),
    mentions: z
      .array(z.string().min(1).max(120))
      .max(64)
      .optional()
      .describe(
        "The participants the text's @handles name, as ids. Filled in by Chips against the space's members; a value the sender writes is replaced.",
      ),
    to: z
      .union([z.literal("all"), z.array(memberId).min(1).max(64)])
      .optional()
      .describe(
        "Who the sender chose, without typing an @: agent ids and people's, or `all` for every agent in the space (ADR 0081, ADR 0087, ADR 0204). A harness's id names its one agent in the space. Chips keeps only the members. People picked are who a person's message is for besides its agents (`addressed_people`); no agent takes a turn for them. An @ in the text decides before it.",
      ),
    heartbeat: z
      .literal(true)
      .optional()
      .describe(
        "The agent wrote this on its own, on its heartbeat, with nobody asking (ADR 0143): the apps mark it so. Only a harness, or one of its agents, sends it; a check with nothing to say posts nothing.",
      ),
    addressed_to: z
      .array(agentId)
      .max(64)
      .optional()
      .describe(
        "The agents this message is for, and so the agents that take a turn on it (ADR 0081, ADR 0087). Filled in by Chips from the @s, `to`, the reply and the space; a value the sender writes is replaced. A message logged without it was for every harness in the space.",
      ),
    addressed_people: z
      .array(id("person"))
      .max(64)
      .optional()
      .describe(
        "Filled in by Chips on a person's message (ADR 0204): the people it is for, those its @s name, or else those the sender picked in `to`. They are pushed as an @ pushes them; no agent takes a turn for them. Absent for none; a value the sender writes is replaced.",
      ),
    addressed_to_all: z
      .literal(true)
      .optional()
      .describe(
        "Filled in by Chips when the message is for every harness in the space, whoever is there: `@all`, a `to` of `all`, or a person's default of everyone (ADR 0081). That person's next message that names nobody goes to every harness there is then, one added since included.",
      ),
    held: z
      .literal(true)
      .optional()
      .describe(
        "Filled in by Chips when harnesses have addressed each other four times since a person last spoke there: the message is posted and shown, and addressed to nobody (ADR 0081).",
      ),
    held_since: isoTimestamp
      .optional()
      .describe(
        "Written by Chips for words the agent said while in no room (ADR 0087, rule 6): when it said them. Posted here as it was attached.",
      ),
    from_held: id("event")
      .optional()
      .describe("Written by Chips: the `message.held` these words were kept as."),
  }),
});

export const approvalRequest = defineEvent({
  type: "approval.request",
  direction: "harness_to_chips",
  sender: "harness",
  summary:
    "The thing a group chat cannot do: an action, a preview, a risk class, who may answer, and an audit record.",
  requiresRun: true,
  payload: z.object({
    approval_id: id("approval").describe(
      "Minted by the harness, so a retry after a reconnect is the same ask.",
    ),
    step_id: z.string().min(1).max(120).optional().describe("The plan step this ask belongs to."),
    action,
    question: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe(
        "The question the person answers yes or no, as one sentence in plain words: `Turn off the Robinhood connector?`. The card leads with it. Without it the card is headed by the preview's title, else the action's kind (ADR 0142).",
      ),
    effect: z
      .string()
      .min(1)
      .max(500)
      .optional()
      .describe(
        "What a yes does, in a sentence or two: `Its 73 tools disappear from every Space.` Drawn under the question.",
      ),
    lasts: z
      .enum(["once", "standing"])
      .optional()
      .describe(
        "How long a yes keeps working: `once` for this action alone, `standing` for a grant that holds until it is taken back, such as a folder an agent may keep working in. The card says which.",
      ),
    preview: preview
      .optional()
      .describe("What the approver sees. Omit only when the action speaks for itself."),
    risk: z
      .array(riskClass)
      .max(8)
      .describe("Risk classes. The policy engine matches rules against these."),
    sources: z
      .array(source)
      .max(32)
      .optional()
      .describe("Where the harness got what it is about to act on."),
    expires_in: z
      .int()
      .positive()
      .max(604_800)
      .describe("Seconds until the approval expires. Every approval has an expiry and a fallback."),
    fallback: z
      .enum(["deny", "allow"])
      .default("deny")
      .describe("What happens on expiry. Denying is the default, and the safe one."),
    approvers: z
      .array(approverRef)
      .max(16)
      .optional()
      .describe(
        "Who may answer, as the harness asks it: `owner`, `any` (the room, but its guests), `role:<name>` (a standing in the space or in the workspace), or a person id. `lead` (the lane's lead, when the run is a lane's) is a policy rule's to name, never a harness's, and never for an ask that matters — money, a deletion, an external action reach a person. Chips resolves them — policy's own list when a rule names one — to ids before the event is stored, and only those may decide it; a person may hand it on with `approval.routed`.",
      ),
    editable: z
      .boolean()
      .default(false)
      .describe("Whether the approver may change the input before allowing."),
    resume_token: z
      .string()
      .max(500)
      .optional()
      .describe(
        "Lets a paused command-line run continue hours later. Approvals outlive processes.",
      ),
  }),
});

const questionOption = z
  .object({
    value: z.string().min(1).max(120).describe("What comes back in `question.answered`."),
    label: z.string().min(1).max(200).describe("What the person taps."),
    description: z.string().max(500).optional().describe("What choosing it means."),
  })
  .describe("One tappable option.");

const question = z
  .object({
    question_id: z
      .string()
      .min(1)
      .max(120)
      .describe("Stable, so answers land on the right question."),
    prompt: z.string().min(1).max(2000).describe("What is being asked."),
    options: z.array(questionOption).min(2).max(4).describe("Two to four options."),
    multi_select: z
      .boolean()
      .default(false)
      .describe("Whether more than one option may be chosen."),
    allow_free_text: z.boolean().default(false).describe("Whether the person may type instead."),
    default_value: z
      .string()
      .max(120)
      .optional()
      .describe(
        "What the harness will take if nobody answers. Its presence lowers the notification tier.",
      ),
  })
  .describe("One question, with its options.");

export const questionAsk = defineEvent({
  type: "question.ask",
  direction: "harness_to_chips",
  sender: "harness",
  summary: "One to four questions with tappable options, a default, and a timeout.",
  requiresRun: true,
  payload: z.object({
    ask_id: id("question").describe("Minted by the harness, so a retry is the same ask."),
    questions: z.array(question).min(1).max(4).describe("One to four questions."),
    timeout_seconds: z
      .int()
      .positive()
      .max(604_800)
      .optional()
      .describe("How long to wait for an answer."),
    on_no_answer: z
      .enum(["use_default", "cancel", "continue"])
      .default("use_default")
      .describe("What the harness will do if the timeout passes."),
  }),
});

export const artifactCreate = defineEvent({
  type: "artifact.create",
  direction: "harness_to_chips",
  sender: "harness",
  summary: "A file, document, code, image or table the harness produced, with a version.",
  requiresRun: false,
  payload: z.object({
    artifact_id: id("attachment").describe("Content-addressed, like every attachment."),
    kind: z.enum(["file", "document", "code", "image", "table"]).describe("How to render it."),
    title: z.string().min(1).max(300).describe("What to call it."),
    version: z.int().positive().default(1).describe("Bumped when the harness revises it."),
    attachment: attachment.optional().describe("The bytes, when the artifact is a file."),
    body: z.string().max(1_000_000).optional().describe("The content, when the artifact is text."),
    language: z.string().max(60).optional().describe("For code, the language to highlight."),
  }),
});

/**
 * A turn working in a room heard words said there (ADR 0106): for somebody else, when Chips named
 * the turn in `working_turns` and the harness handed them to it at its next step; or for its own
 * agent, when the harness joined them to that agent's turn going rather than start another
 * (ADR 0109). On that run, said as the run's agent; the room shows that agent heard the message
 * while it worked.
 */
export const messageHeard = defineEvent({
  type: "message.heard",
  direction: "harness_to_chips",
  sender: "harness",
  summary: "A turn working in a room heard a message said there, as it worked.",
  requiresRun: true,
  payload: z.object({
    message_id: id("message").describe(
      "The message, as `message.overheard` or `message.new` named it.",
    ),
  }),
});

export const checkpoint = defineEvent({
  type: "checkpoint",
  direction: "harness_to_chips",
  sender: "harness",
  summary: "A milestone reached and what is next. Compaction is a checkpoint. FYI tier.",
  requiresRun: true,
  payload: z.object({
    label: z.string().min(1).max(300).describe("The milestone reached."),
    next: z.string().max(300).optional().describe("What the harness will do next."),
    compacted: z
      .boolean()
      .default(false)
      .describe("True when the harness just compacted its context."),
  }),
});

export const handoff = defineEvent({
  type: "handoff",
  direction: "harness_to_chips",
  sender: "harness",
  summary:
    "Passing work to a person or another harness, with a context summary and what is still open.",
  requiresRun: false,
  payload: z.object({
    to: z.string().min(1).max(120).describe("The participant id receiving the work."),
    context_summary: z.string().min(1).max(20_000).describe("What the recipient needs to know."),
    open_items: z.array(z.string().max(500)).max(50).optional().describe("What is still undone."),
    reason: z.string().max(1000).optional().describe("Why the work is moving."),
  }),
});

export const task = defineEvent({
  type: "task",
  direction: "harness_to_chips",
  sender: "harness",
  summary:
    "Route work to another harness. From a lead this becomes a lane: one object, two views, never a copy.",
  requiresRun: false,
  payload: z.object({
    task_id: id("lane").describe("The lane this task opens."),
    to: z
      .string()
      .min(1)
      .max(120)
      .describe(
        "The specialist's participant id; a label for an ephemeral child; or the lead's own id, for a lane between two of its spaces — a specialist of its own in another of its rooms, a subagent in a worktree — which `home` then names.",
      ),
    child: z
      .object({
        label: z
          .string()
          .min(1)
          .max(120)
          .describe("A name for a transient participant Chips will mint."),
      })
      .optional()
      .describe(
        "Names an ephemeral child, which inherits owner, autonomy and budget from the lead.",
      ),
    on_behalf_of: z
      .string()
      .min(1)
      .max(120)
      .describe(
        "The person the work is ultimately for: the lead's own owner, or a person in the space the task is sent from. A task on behalf of anyone else is kept in the lead's run.",
      ),
    origin: id("message").optional().describe("The message that caused this routing."),
    goal: z.string().min(1).max(4000).describe("What the specialist is being asked to do."),
    constraints: z
      .array(z.string().max(500))
      .max(20)
      .optional()
      .describe("Bounds on how to do it."),
    deadline: isoTimestamp.optional().describe("When it is needed by."),
    autonomy: autonomyLevel
      .optional()
      .describe("The level for this lane. Never above the lead's own."),
    attachments: z.array(attachment).max(20).optional().describe("Anything the specialist needs."),
    link_to: id("space")
      .optional()
      .describe(
        "A lead space to link the lane into, besides the one the task is sent from: where the route card appears and the lane's news lands. It must be a space the lead is in; one it is not in is ignored.",
      ),
    home: id("space")
      .optional()
      .describe(
        "Where the lane lives, when the lead already has the room: one of its own spaces, for a lane between two spaces of one harness. The lead and the specialist must both be in it. Absent, the specialist's direct space with the person, opened if it has none.",
      ),
    label: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe(
        "What to call the specialist on this lane when its participant name is not the right one: a Space's name, a subagent's type. Shown on the route card and the task card.",
      ),
  }),
});

export const usage = defineEvent({
  type: "usage",
  direction: "harness_to_chips",
  sender: "harness",
  summary:
    "Tokens and cost for a step, a run or a lane. Cost rolls up the trail and is always an estimate.",
  requiresRun: true,
  payload: z.object({
    scope: z.enum(["step", "run", "lane"]).describe("What the numbers cover."),
    model: z.string().min(1).max(120).describe("The model that did the work."),
    input_tokens: z
      .int()
      .nonnegative()
      .optional()
      .describe(
        "Tokens in: every token the model read, fresh, read from its prompt cache and written to it. Leave it out when the harness cannot say: the tokens out are still counted, and Chips puts no price on a report it cannot count whole.",
      ),
    cache_read_tokens: z
      .int()
      .nonnegative()
      .optional()
      .describe(
        "Of the tokens in, how many the model read from its prompt cache. Leave it out when the harness cannot say or the model keeps no cache.",
      ),
    cache_write_tokens: z
      .int()
      .nonnegative()
      .optional()
      .describe(
        "Of the tokens in, how many the model wrote to its prompt cache. Leave it out when the harness cannot say or the model keeps no cache.",
      ),
    output_tokens: z
      .int()
      .nonnegative()
      .optional()
      .describe(
        "Tokens out. Leave it out when the harness cannot say, and send the cost: Chips prices only a report whose tokens it has whole.",
      ),
    cost: cost.optional().describe("The estimated cost, when the harness can compute one."),
  }),
});

export const contextUsage = defineEvent({
  type: "context.usage",
  direction: "harness_to_chips",
  sender: "harness",
  summary:
    "How full the harness's context is. Drives the context ring; context stays per harness, never rolled up.",
  requiresRun: true,
  payload: z.object({
    used_tokens: z.int().nonnegative().describe("Tokens currently held."),
    limit_tokens: z.int().positive().describe("The window size."),
    model: z.string().min(1).max(120).describe("The model whose window this is."),
    compacted: z.boolean().default(false).describe("True when the harness just compacted."),
  }),
});

export const approvalExecuted = defineEvent({
  type: "approval.executed",
  direction: "harness_to_chips",
  sender: "harness",
  summary: "What happened after a yes. The card changes from `approved` to `sent`, or to `failed`.",
  requiresRun: true,
  payload: z.object({
    approval_id: id("approval"),
    outcome: z
      .enum(["executed", "failed", "skipped"])
      .describe("Whether the action actually happened."),
    detail: z.string().max(4000).optional().describe("What was sent, or why it failed."),
    approvers: z
      .array(z.string().min(1).max(120))
      .max(64)
      .optional()
      .describe(
        "Who could answer it, as ids, as they stood when it was decided. Written by Chips from the approval so that somebody named outside the room sees what came of their decision (ADR 0042); a value the sender writes is replaced.",
      ),
  }),
});

export const runCompleted = defineEvent({
  type: "run.completed",
  direction: "harness_to_chips",
  sender: "harness",
  summary: "The run is done. Posts a summary card and moves the status pill to Done.",
  requiresRun: true,
  payload: z.object({
    summary: z.string().min(1).max(20_000).describe("The outcome, in the product voice."),
    changed: z.array(z.string().max(500)).max(50).optional().describe("What changed in the world."),
    follow_ups: z
      .array(z.string().max(500))
      .max(50)
      .optional()
      .describe("What is worth doing next."),
    cost: cost.optional().describe("The run's estimated cost."),
  }),
});

export const runFailed = defineEvent({
  type: "run.failed",
  direction: "harness_to_chips",
  sender: "harness",
  summary:
    "The run stopped without finishing. Says what was left undone, so a person can pick it up.",
  requiresRun: true,
  payload: z.object({
    error: z.string().min(1).max(4000).describe("What went wrong."),
    left_undone: z.array(z.string().max(500)).max(50).optional().describe("What did not get done."),
    retryable: z.boolean().default(false).describe("Whether running it again might work."),
    cost: cost.optional().describe("What was spent before it failed."),
  }),
});

/** Every event a harness may send, in the order the reference lists them. */
export const HARNESS_TO_CHIPS = [
  sessionStarted,
  sessionEnded,
  sessionRenamed,
  runStarted,
  runStatus,
  runPlan,
  stepLog,
  messagePost,
  messageHeard,
  approvalRequest,
  questionAsk,
  artifactCreate,
  checkpoint,
  handoff,
  task,
  usage,
  contextUsage,
  approvalExecuted,
  runCompleted,
  runFailed,
] as const;
