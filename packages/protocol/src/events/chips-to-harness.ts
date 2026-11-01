/**
 * Events Chips sends to a harness.
 *
 * The harness keeps its own loop, memory and tools. What it gains is structured asks and a
 * stable multi-user story: it sees a sender id and a role, and treats Chips as one trusted
 * account (blueprint, Connect).
 */

import { z } from "zod";
import { replyingTo, roomContext } from "../context.js";
import { defineEvent } from "../envelope.js";
import { deliveredExchange } from "../exchange.js";
import {
  agentId,
  autonomyLevel,
  budget,
  id,
  isoTimestamp,
  participantRef,
  policy,
  sessionRef,
  signedAttachment,
  trailEntry,
} from "../primitives.js";
import { roomNote } from "../room-note.js";

const harnessManifest = z
  .object({
    harness_id: id("harness"),
    display_name: z.string().min(1).max(120).describe("The harness's name in the workspace."),
    owner_id: id("person").describe("The person accountable for this harness."),
    capabilities: z
      .array(z.string().max(120))
      .max(64)
      .optional()
      .describe("What the harness can do."),
    ephemeral: z
      .boolean()
      .default(false)
      .describe(
        "True for a transient child minted for one lane, which inherits its lead's settings.",
      ),
  })
  .describe("The harness this connection is, as Chips knows it.");

/** One of the harness's agents, as its `hello` lists them (ADR 0087). */
const agentManifest = z
  .object({
    agent_id: id("agent"),
    key: z.string().min(1).max(400).describe("The harness's own name for it."),
    name: z.string().min(1).max(120).describe("What it is called, and so its @handle."),
    lead: z.boolean().describe("Whether it is the harness's Main agent."),
    state: z.enum(["active", "archived"]).describe("Archived when its thing was put away."),
    spaces: z
      .array(id("space"))
      .max(10_000)
      .describe("The rooms it is in. One at most, once one room per agent is the rule."),
    room: id("space")
      .nullable()
      .optional()
      .describe(
        "The open room it is in (ADR 0087: one at a time), or `null` while it is free. What it says while free is held.",
      ),
    held: z
      .int()
      .nonnegative()
      .optional()
      .describe("How many of its words Chips is holding, said while it was in no room."),
  })
  .describe("An agent the harness speaks for.");

export const hello = defineEvent({
  type: "hello",
  direction: "chips_to_harness",
  sender: "chips",
  summary:
    "The server's half of the handshake: the protocol range it speaks, and who this connection is.",
  requiresRun: false,
  payload: z.object({
    protocol: z
      .object({
        min: z.int().positive().describe("Oldest major version the server accepts."),
        max: z.int().positive().describe("Newest major version the server speaks."),
      })
      .describe("The negotiated range. A client picks a version inside it or is refused."),
    server: z
      .object({
        name: z.string().min(1).max(120).describe("Usually `chipsd`."),
        version: z.string().min(1).max(60).describe("The server's own version."),
      })
      .describe("Who the client is talking to."),
    harnesses: z
      .array(harnessManifest)
      .min(1)
      .max(64)
      .describe(
        "The harness the token belongs to, and only that one. One connection speaks for all of the harness's agents (ADR 0087), which `agents` lists. A harness running inside another is a lane, not a duplicate.",
      ),
    harness: harnessManifest
      .optional()
      .describe(
        "The harness this connection is: `harnesses[0]`, said once. Read this rather than the list.",
      ),
    agents: z
      .array(agentManifest)
      .max(10_000)
      .optional()
      .describe(
        "The harness's agents, each with its rooms (ADR 0087). Everything the connection sends names one of them as `actor`; a harness's own id is read as its one agent in the room. Sent only to a harness that declares `agents`.",
      ),
    autonomy: autonomyLevel.describe("The level in force for this connection."),
    policy: policy.optional().describe("The rules that fill in the details."),
    budget: budget.optional().describe("The ceiling, and what has been spent."),
    spaces: z
      .array(id("space"))
      .max(10_000)
      .optional()
      .describe(
        "The spaces this credential is a member of as it connects. A client that kept a cache drops what is not here: a membership it lost while away is the one event a replay can never bring it, because it is no longer in the space that event belongs to.",
      ),
    workspace: z
      .object({ name: z.string().min(1).max(120) })
      .optional()
      .describe(
        "The workspace as it is called now. A device keeps the name it was told when it paired and takes this one when they differ, so a workspace renamed since is called by its new name without pairing again. Absent when the workspace has no name.",
      ),
  }),
});

/** The message a reply answers, with its files as URLs this harness may fetch (ADR 0219). */
const deliveredReply = replyingTo.extend({
  attachments: z
    .array(signedAttachment)
    .max(20)
    .optional()
    .describe("Its files, as the message's own are sent: URLs expire in ten minutes."),
});

/** What a harness is told of a message, whether it is for it or overheard: one shape, so the two cannot drift. */
const deliveredMessage = z.object({
  message_id: id("message"),
  from: participantRef.describe(
    "Who sent it, and whether they are the owner, a member or a guest.",
  ),
  text: z.string().max(64_000).describe("Markdown, with mentions resolved to participant ids."),
  attachments: z.array(signedAttachment).max(20).optional().describe("URLs expire in ten minutes."),
  mentions: z
    .array(z.string().max(120))
    .max(64)
    .optional()
    .describe("Participant ids mentioned in the text."),
  reply_to: id("message").optional().describe("The message this answers."),
  replying_to: deliveredReply
    .optional()
    .describe(
      "The message `reply_to` names, as the room reads it now (ADR 0219): who said it, when, its words and its files, and with a turn, when it is older than `context`, the lines said just before it. Put it in the turn ahead of the words; the SDK's `promptFor` does. Absent on a message that answers none, or one no longer in the room.",
    ),
  session_ref: sessionRef
    .optional()
    .describe(
      "The visit the sender meant, when they named one (ADR 0040). A harness that works by visits delivers to it rather than choosing, and says so rather than delivering elsewhere when it cannot.",
    ),
  addressed_to: z
    .array(agentId)
    .max(64)
    .optional()
    .describe(
      "The agents the message is for, as Chips decided them (ADR 0081, ADR 0087). Absent on a message from before Chips said so, which was for every agent in the space.",
    ),
  for: z
    .array(agentId)
    .max(64)
    .optional()
    .describe(
      "Who of this connection takes a turn: its own among `addressed_to` (ADR 0087). Each is one of its agents, or the harness's own id where the harness itself is the member addressed: a room asked of it from the +, until it claims the room. Never empty on a `message.new`, and always empty on a `message.overheard`. Sent only to a harness that declares `agents`; one that has not is told its agents are itself.",
    ),
  working_turns: z
    .array(
      z.object({
        agent_id: agentId.describe("One of this connection's agents."),
        run_id: id("run").describe("Its turn going in the room."),
      }),
    )
    .max(64)
    .optional()
    .describe(
      "This connection's agents with a turn going in the room, other than the one who said it and those it is for (ADR 0106). Hand the words to each of those turns at its next step, as said to somebody else, and start no turn on them; post `message.heard` on the run once a turn has them, and the room shows it heard. A turn that ends first hears nothing, and is handed the words with its agent's next turn (ADR 0105). Absent when there are none.",
    ),
});

export const messageNew = defineEvent({
  type: "message.new",
  direction: "chips_to_harness",
  sender: "chips",
  summary: "Someone said something, with any attachments as signed URLs the harness can fetch.",
  requiresRun: false,
  payload: deliveredMessage.extend({
    context: roomContext
      .optional()
      .describe(
        "What was said in the room since this harness last spoke there, or since it joined when it has not, up to this message and without it (ADR 0088). From when the turn that said its last words began, so what was said while it worked is here, and its own words are not (ADR 0105). Worked out from the log, so a replay hands over the same lines. As many as the budget the harness gave in its `hello`: 40 lines and 16,000 characters when it gave none, and none when it asked for 0. When older lines were left out, the taker's room note says so.",
      ),
    room: roomNote
      .optional()
      .describe(
        "Who is in the room, with the handle that reaches each, and a note for each who takes the turn saying so and what an @ does (ADR 0092). A harness puts `notes[<taker>]` at the top of that turn. Absent on a message in no room.",
      ),
    exchange: deliveredExchange
      .optional()
      .describe(
        "How the agents' talk in the room stands, once it is worth a word (ADR 0097): from eight messages between agents since a person last acted or an agent last made something new. A harness puts `note` at the top of the turn, as Chips's, ahead of the room's note. Absent below that, and worked out from the log, so a replay hands over the same facts.",
      ),
    handed: z
      .literal(true)
      .optional()
      .describe(
        "Chips held this message when it was said and hands it over now a person has acted (ADR 0097): the newest of an agent's held messages, once; or, with `lead`, hands it to the room's lead. Its seq and id are the hand-over's, its `message_id` the message's own.",
      ),
    lead: z
      .literal(true)
      .optional()
      .describe(
        "Handed to the agent taking the turn as the room's lead (ADR 0104): the message was nobody's turn, and the room went still. Its note says so at the top, and `handed` is set too.",
      ),
  }),
});

export const messageOverheard = defineEvent({
  type: "message.overheard",
  direction: "chips_to_harness",
  sender: "chips",
  summary:
    "Something said in a space this harness is in, for somebody else: context, not a turn (ADR 0081). A harness with a turn going in the space hands it to that turn at its next step (ADR 0105).",
  requiresRun: false,
  payload: deliveredMessage.extend({
    held: z
      .literal(true)
      .optional()
      .describe(
        "The agents had sent each other more messages than Chips lets through without a person, or a person paused them, so Chips held this one from the agents it named (ADR 0097). The newest held message for each agent is handed over when a person acts.",
      ),
  }),
});

export const runRequested = defineEvent({
  type: "run.requested",
  direction: "chips_to_harness",
  sender: "chips",
  summary: "A lane arrived from a lead, with the trail that led to it.",
  requiresRun: false,
  payload: z.object({
    lane_id: id("lane"),
    goal: z.string().min(1).max(4000).describe("What is being asked."),
    constraints: z
      .array(z.string().max(500))
      .max(20)
      .optional()
      .describe("Bounds on how to do it."),
    deadline: isoTimestamp.optional().describe("When it is needed by."),
    on_behalf_of: z.string().min(1).max(120).describe("The person the work is ultimately for."),
    requested_by: z.string().min(1).max(120).describe("The lead that routed it."),
    specialist_id: z
      .string()
      .min(1)
      .max(120)
      .describe(
        "The harness this lane runs on, which the run in the envelope belongs to. A lead may name an ephemeral child, which Chips has minted by the time this arrives.",
      ),
    agent_id: id("agent")
      .optional()
      .describe(
        "The agent of that harness that works the lane (ADR 0087): its one agent in the lane's room, the one the lead named, a lead's hand-off to one of its own, or a child minted for this lane.",
      ),
    trail: z
      .array(trailEntry)
      .max(8)
      .describe(
        "How the work got here. Lanes deeper than three are flattened into steps, not rejected.",
      ),
    autonomy: autonomyLevel.describe("The level for this lane."),
    link_to: z
      .array(id("space"))
      .max(10)
      .optional()
      .describe("The lead spaces this lane is linked into, where its route card appears."),
    origin: id("message")
      .optional()
      .describe("The message that caused the routing, quoted in the specialist's task card."),
    attachments: z
      .array(signedAttachment)
      .max(20)
      .optional()
      .describe("Anything the specialist needs."),
    label: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe(
        "What the lead calls the specialist on this lane, when that is not its participant name: a Space's name, a subagent's type.",
      ),
  }),
});

export const approvalResolved = defineEvent({
  type: "approval.resolved",
  direction: "chips_to_harness",
  sender: "either",
  summary:
    "A decision came back. More than yes or no: it carries a scope, optional edited input, and a reason.",
  requiresRun: true,
  payload: z.object({
    approval_id: id("approval"),
    decision: z
      .enum(["approved", "edited", "denied", "expired"])
      .describe("`expired` means nobody answered and the fallback applied."),
    scope: z
      .enum(["once", "session", "always"])
      .default("once")
      .describe("How far the answer reaches. `always` becomes a policy rule."),
    everywhere: z
      .boolean()
      .optional()
      .describe(
        "With `always`: the rule is the harness's in every space, not only this one (ADR 0239). An owner or an admin only.",
      ),
    updated_input: z
      .unknown()
      .optional()
      .describe("The edited action input, when the decision is `edited`."),
    reason: z.string().max(4000).optional().describe("Why. The harness gets to read this."),
    resolved_by: z
      .string()
      .min(1)
      .max(120)
      .describe(
        "The participant who answered, or `system` on expiry — a harness when it settles its own ask, answered in its own tools. Filled in by Chips from the credential that sent it; a value the sender writes is replaced.",
      ),
    resolved_at: isoTimestamp.describe("When it was answered. Stamped by Chips."),
    resolved_elsewhere: z
      .boolean()
      .default(false)
      .describe("True on the surfaces that did not answer first. First answer wins."),
    approvers: z
      .array(z.string().min(1).max(120))
      .max(64)
      .optional()
      .describe(
        "Who could answer it, as ids, as they stood when it was decided. Written by Chips from the approval so that somebody named outside the room is sent the decision as well as the ask (ADR 0042); a value the sender writes is replaced.",
      ),
  }),
});

export const questionAnswered = defineEvent({
  type: "question.answered",
  direction: "chips_to_harness",
  sender: "either",
  summary: "The chosen options or free text, or a note that the timeout passed.",
  requiresRun: true,
  payload: z.object({
    ask_id: id("question"),
    answers: z
      .array(
        z.object({
          question_id: z.string().min(1).max(120),
          values: z.array(z.string().max(120)).max(4).describe("The chosen option values."),
          free_text: z.string().max(4000).optional().describe("What the person typed instead."),
        }),
      )
      .min(1)
      .max(4)
      .describe("One entry per question that was answered."),
    answered_by: z
      .string()
      .min(1)
      .max(120)
      .describe(
        "Who answered, or `system` on a timeout — a harness when it settles its own question, answered in its own tools. Filled in by Chips from the credential that sent it.",
      ),
    answered_at: isoTimestamp.describe("When it was answered. Stamped by Chips."),
    timed_out: z
      .boolean()
      .default(false)
      .describe("True when the default was taken rather than a choice."),
  }),
});

export const runSteer = defineEvent({
  type: "run.steer",
  direction: "chips_to_harness",
  sender: "person",
  summary: "A mid-run instruction, with a disposition: steer, follow up, or interrupt.",
  requiresRun: true,
  payload: z.object({
    mode: z
      .enum(["steer", "followup", "interrupt"])
      .describe("`steer` redirects, `followup` queues, `interrupt` stops what is happening now."),
    text: z.string().min(1).max(16_000).describe("The instruction."),
    from: participantRef.describe("Who said it."),
  }),
});

export const runPause = defineEvent({
  type: "run.pause",
  direction: "chips_to_harness",
  sender: "person",
  summary:
    "Stop where you are and hold. Sent by a person, or by Chips at a budget or context ceiling.",
  requiresRun: true,
  payload: z.object({
    reason: z.string().max(1000).optional().describe("Why the run is pausing."),
    by: z
      .string()
      .min(1)
      .max(120)
      .describe("Who paused it, or `system`. Filled in by Chips from the credential that sent it."),
  }),
});

export const runResume = defineEvent({
  type: "run.resume",
  direction: "chips_to_harness",
  sender: "person",
  summary: "Carry on from where you paused.",
  requiresRun: true,
  payload: z.object({
    by: z
      .string()
      .min(1)
      .max(120)
      .describe("Who resumed it. Filled in by Chips from the credential that sent it."),
    resume_token: z
      .string()
      .max(500)
      .optional()
      .describe("For a run that was paused across processes."),
  }),
});

export const runCancel = defineEvent({
  type: "run.cancel",
  direction: "chips_to_harness",
  sender: "person",
  summary: "Stop for good. The run ends as cancelled, and the audit log records who ended it.",
  requiresRun: true,
  payload: z.object({
    reason: z.string().max(1000).optional().describe("Why."),
    by: z
      .string()
      .min(1)
      .max(120)
      .describe(
        "Who cancelled it, or `system`. Filled in by Chips from the credential that sent it.",
      ),
  }),
});

export const policyUpdated = defineEvent({
  type: "policy.updated",
  direction: "chips_to_harness",
  sender: "person",
  summary:
    "The autonomy level or the rules changed. Takes effect on the next action, not retroactively.",
  requiresRun: false,
  payload: z.object({
    harness_id: id("harness"),
    policy,
    workspace_max_autonomy: autonomyLevel.describe("The workspace cap. It always wins."),
    budget_usd: z
      .number()
      .nonnegative()
      .optional()
      .describe(
        "The harness's spending ceiling, in US dollars. Absent leaves it as it was; the harness's spend is what `usage` has added up.",
      ),
    changed_by: z
      .string()
      .min(1)
      .max(120)
      .describe(
        "Who changed it, or `system` for an earned promotion. Filled in by Chips from the credential that sent it.",
      ),
    reason: z.string().max(1000).optional().describe("Why it changed."),
  }),
});

/**
 * Eighty percent of a ceiling spent, or all of it. For a harness's budget, or since ADR 0118 for a
 * room's job (`scope: "job"`): the room's harnesses are told once per job at each, in the room
 * (`space_id`), and at a hundred Chips has paused the agents there (`exchange.set` with `why:
 * "spend"`) until a person acts. A harness that chains turns itself starts no new one in that
 * room until then; one that runs a turn per message needs do nothing, since the room holds what
 * its agents say to each other.
 */
export const budgetWarning = defineEvent({
  type: "budget.warning",
  direction: "chips_to_harness",
  sender: "chips",
  summary:
    "Eighty percent spent. At a hundred the run pauses rather than warning again; for a room's job, the room's agents pause.",
  requiresRun: false,
  payload: z.object({
    budget: budget.describe(
      "The ceiling and what was spent against it: the harness's budget, or for a job the room's ceiling and the job's spend.",
    ),
    threshold: z
      .union([z.literal(80), z.literal(100)])
      .describe("Which ceiling was crossed, as a percentage."),
    action: z.enum(["warn", "pause"]).describe("`warn` at eighty, `pause` at a hundred."),
    scope: z
      .enum(["harness", "job"])
      .optional()
      .describe(
        "Whose ceiling: the harness's own budget (absent says the same), or the job in the room named by `space_id` (ADR 0118).",
      ),
    since_seq: z
      .int()
      .nonnegative()
      .optional()
      .describe(
        "For a job: where it began, as `context.spend.since_seq` says it. A later job in the room is a new allowance.",
      ),
  }),
});

export const laneUpdated = defineEvent({
  type: "lane.updated",
  direction: "chips_to_harness",
  sender: "chips",
  summary:
    "A lane you opened has news. Finishing and delivering are different states, and delivery travels with the lane.",
  requiresRun: false,
  payload: z.object({
    lane_id: id("lane"),
    state: z
      .enum(["queued", "running", "waiting", "completed", "failed", "cancelled"])
      .describe("Where the specialist got to."),
    delivery: z
      .enum(["pending", "direct", "queued_to_lead", "delivered", "failed"])
      .describe(
        "A lane completes when the specialist posts; the person is told when the lead delivers.",
      ),
    summary: z
      .string()
      .max(20_000)
      .optional()
      .describe("The specialist's result, when there is one."),
    cost_usd: z
      .number()
      .nonnegative()
      .optional()
      .describe(
        "The lane's estimated cost, so the lead's panel can total the chain. Cost rolls up the trail; context does not.",
      ),
    attachments: z
      .array(signedAttachment)
      .max(20)
      .optional()
      .describe(
        "The files the specialist's answer carried, so an answer made of photos is an answer the lead has. Chips reads them off the lane run's own messages; URLs expire in ten minutes.",
      ),
  }),
});

/**
 * Sent by a person, like a steer: the direction says who hears it. Chips fills in `from` and
 * delivers it to the harness whose message it is, and to everyone in the space.
 */
export const feedback = defineEvent({
  type: "feedback",
  direction: "chips_to_harness",
  sender: "person",
  summary: "A reaction, or a note about what went wrong, on one of the harness's messages.",
  requiresRun: false,
  payload: z.object({
    message_id: id("message").describe(
      "The message it is about: one a harness said, in the space the event names.",
    ),
    kind: z.enum(["reaction", "correction"]).describe("A light signal, or a written note."),
    reaction: z
      .string()
      .min(1)
      .max(16)
      .optional()
      .describe("The emoji, when the kind is `reaction`. Required then."),
    text: z
      .string()
      .min(1)
      .max(4000)
      .optional()
      .describe("What went wrong, when the kind is `correction`. Required then."),
    from: participantRef.describe(
      "Who gave it. Filled in by Chips from the credential and the membership; a value the sender writes is replaced.",
    ),
  }),
});

export const receipt = defineEvent({
  type: "receipt",
  direction: "chips_to_harness",
  sender: "chips",
  summary: "What Chips did with a message sent mid-run: queued it, or steered with it.",
  requiresRun: true,
  payload: z.object({
    message_id: id("message"),
    disposition: z
      .enum(["queued", "steered"])
      .describe("Whether the harness will see it now or after the step."),
  }),
});

/** Every event Chips may send, in the order the reference lists them. */
export const CHIPS_TO_HARNESS = [
  hello,
  messageNew,
  messageOverheard,
  runRequested,
  approvalResolved,
  questionAnswered,
  runSteer,
  runPause,
  runResume,
  runCancel,
  policyUpdated,
  budgetWarning,
  laneUpdated,
  feedback,
  receipt,
] as const;
