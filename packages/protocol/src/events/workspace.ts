/**
 * Events Chips records about itself.
 *
 * Agent Connect is the vocabulary a harness speaks. It is not the whole log. Decision 4 says
 * every Agent Connect event **and every human action** is an event, and creating a space
 * or adding somebody to one is a human action. Without these, `spaces` and `memberships`
 * would be read models that no replay could reconstruct — which would make `rebuild` a lie.
 *
 * These never travel to a harness, with three exceptions: `space.updated` is also something a
 * harness sends, for a space it opened itself (M3.3); `space.erased` names no space and so goes
 * to everyone in the workspace, a harness included, which is how an adapter learns to forget a
 * room it had cached (ADR 0067); and a `space.created` that asks a harness into a new room goes
 * to that harness, which answers with `space.claimed` through its own door. A harness learns that
 * it was added to a space from `message.new`, not from here. See ADR 0018 for the line between
 * what is event-sourced and what is a registry.
 */

import { z } from "zod";
import { roomContext } from "../context.js";
import { defineEvent } from "../envelope.js";
import { HOLD_RANGE, STOP_RANGE } from "../exchange.js";
import { joinKind, joinStartedBy } from "../join.js";
import {
  agentId,
  attachment,
  id,
  isoTimestamp,
  PARTICIPANT_KINDS,
  workspaceRole,
} from "../primitives.js";
import { projectChangedPayload } from "../project.js";
import { spaceIcon } from "../space-icons.js";
import { jobSpend, spendCeiling } from "../spend.js";

/** Why an agent left a room (ADR 0087): the moment table's reasons, and a person's removal. */
export const RELEASE_REASONS = [
  "archived",
  "deleted",
  "moved",
  "agent_archived",
  "removed",
  "agent_deleted",
] as const;
export type ReleaseReason = (typeof RELEASE_REASONS)[number];

const releaseReason = z
  .enum(RELEASE_REASONS)
  .describe(
    "`archived`: its room was archived. `deleted`: its room was deleted. `moved`: it was moved to another room. `agent_archived`: it was archived, in its harness or by a person (ADR 0095). `removed`: a person took it out. `agent_deleted`: a person deleted it (ADR 0095).",
  );

export const spaceCreated = defineEvent({
  type: "space.created",
  direction: "workspace",
  sender: "person",
  summary: "A space was opened: a direct message, a group, a channel or a thread.",
  requiresRun: false,
  payload: z.object({
    kind: z
      .enum(["direct", "group", "channel", "thread"])
      .describe("Mixed membership is the norm; the kind is about shape, not about who is in it."),
    title: z.string().max(200).optional().describe("What to call it. Direct messages have none."),
    parent_space_id: id("space")
      .optional()
      .describe(
        "The space this is a thread of (M5.4). A thread has no members of its own: whoever is in the parent is in the thread, and leaves it with the parent.",
      ),
    root_message_id: id("message")
      .optional()
      .describe(
        "For a thread: the message in the parent it grew from, which is where it is drawn.",
      ),
    external_key: z
      .string()
      .min(1)
      .max(440)
      .optional()
      .describe(
        "What this space is in the adapter's own terms — a worktree path, the id of a project or an agent in the harness's own tree — prefixed by the harness. Unique in a workspace, so opening the same thing twice finds the space rather than making another (ADR 0024).",
      ),
    opened_for: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe(
        "The person this was opened on behalf of, when it was not they who opened it. A harness opens a space for its owner as it finds one (ADR 0024); without this they would not be sent the event that names it, and the space would arrive with no title.",
      ),
    asked_of: id("harness")
      .optional()
      .describe(
        "The harness a person opened this room for, to make something of its own for it: an agent, a session, wherever it keeps such things. Only a person asks, only of a harness that declares `new_spaces`, and never in a thread or a room that already has a key. The harness is sent this event, and answers with `space.claimed`.",
      ),
    also_asked_of: z
      .array(id("harness"))
      .min(1)
      .max(16)
      .optional()
      .describe(
        "The other harnesses asked with `asked_of`, when a person picked several faces (ADR 0084, ADR 0087's addendum of 30 September). Each is sent this event and answers with a new agent in the room, in its own place; only `asked_of` names the room.",
      ),
  }),
});

export const spaceClaimed = defineEvent({
  type: "space.claimed",
  direction: "workspace",
  sender: "chips",
  summary:
    "A harness took a room a person asked it for, under a key of its own: from here the room is the harness's, as if it had opened it.",
  requiresRun: false,
  payload: z.object({
    external_key: z
      .string()
      .min(1)
      .max(440)
      .describe(
        "What the room is in the harness's own terms, prefixed by the harness, as on a `space.created` it opened itself (ADR 0024). Unique in a workspace. Written by Chips from the key the harness gave its door.",
      ),
    title: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe(
        "What the harness calls it. Absent when it named nothing, or when a person had already named the room, whose word holds.",
      ),
  }),
});

export const spaceUpdated = defineEvent({
  type: "space.updated",
  direction: "workspace",
  sender: "either",
  summary:
    "A space was retitled, closed or reopened — by a person in it, or by the harness that opened it — or made a harness's home. The apps call closing a space archiving it.",
  requiresRun: false,
  payload: z.object({
    title: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe(
        "The new title. A harness that learns a better name for a room it opened sends this; a person's rename holds over it afterwards.",
      ),
    state: z
      .enum(["open", "closed"])
      .optional()
      .describe(
        "Closed takes the space off the list: the runs going in it are stopped and its agents are released, free to join another room (ADR 0087). Its history and its people stay, and it can be reopened, which brings back each agent that is still free. The apps say archived and unarchived. Whether a person or a harness set it last is kept, and a harness's listing of its spaces reports it as `moved_by` (ADR 0066).",
      ),
    home: z
      .boolean()
      .optional()
      .describe(
        "The harness's home: the room its lead speaks in, which is always there. Nobody archives or erases it; the apps do not offer either. Only the harness that opened the space sends this (ADR 0069).",
      ),
  }),
});

/**
 * A space erased from the server (ADR 0067): its events, its rows, its files and its search
 * entries are gone, and this is the one line the log keeps about it. It carries no `space_id`
 * in its envelope on purpose — an event that names a space brings that space back on any device
 * that folds it — so every device in the workspace is sent it, and each drops the rooms it names.
 */
export const spaceErased = defineEvent({
  type: "space.erased",
  direction: "workspace",
  sender: "chips",
  summary:
    "A space was erased from the server by a person: what was said in it, its files and its search entries are gone for everyone. Only this line stays, naming which and by whom.",
  requiresRun: false,
  payload: z.object({
    erased: z
      .array(id("space"))
      .min(1)
      .max(1000)
      .describe("The space, and every thread of it, in that order. Each device forgets them."),
    spent: z
      .array(
        z.object({
          harness_id: id("harness").describe("Whose account the room's cost was on."),
          usd: z.number().describe("What the room had cost that harness, in US dollars."),
        }),
      )
      .max(100)
      .optional()
      .describe(
        "What the room cost, per harness, so an erase takes the words and leaves the spend: a budget is not topped up by erasing where it went. Written by Chips.",
      ),
  }),
});

export const membershipAdded = defineEvent({
  type: "membership.added",
  direction: "workspace",
  sender: "person",
  chipsWrites: ["moved_from", "fork_of", "made_for", "invite_id"],
  summary: "A person or an agent joined a space. Shows as a muted centred line.",
  requiresRun: false,
  payload: z.object({
    participant_id: z.string().min(1).max(120).describe("Who joined."),
    participant_kind: z
      .enum(PARTICIPANT_KINDS)
      .describe(
        "A person or an agent (ADR 0087); `harness` for a harness in a room before the upgrade gave it an agent.",
      ),
    role: z
      .enum(["owner", "member", "guest"])
      .default("member")
      .describe("Their standing here, which is what every `from` field reports."),
    joined_at: isoTimestamp.optional().describe("Defaults to the event's own timestamp."),
    moved_from: id("space")
      .optional()
      .describe(
        "For an agent moved here from another room (ADR 0087): the room it left. Written by Chips.",
      ),
    fork_of: id("event")
      .optional()
      .describe(
        "For a fork's copy (ADR 0087, Fork): the `agent.fork` it answers, so the room shows the copy joining on the line that asked for it. Written by Chips.",
      ),
    made_for: id("event")
      .optional()
      .describe(
        "For a new agent a person asked a harness for (ADR 0108): the `agent.asked` it answers, so the room shows it joining on the line that asked for it. Written by Chips.",
      ),
    agent_name: z
      .string()
      .min(1)
      .max(40)
      .optional()
      .describe(
        "For a harness asked for this room from the + (ADR 0150): the first name its agent will have here, held for it until it claims the room or answers in it, and the name the room calls it by meanwhile. A person's device may propose one; Chips keeps it when nobody has it and picks one off its list otherwise.",
      ),
    invite_id: id("invite")
      .optional()
      .describe(
        "For a person who came in by a space's invite link (ADR 0168): the link, so the room says they joined by it. The actor is whoever made the link, who put them here. Written by Chips.",
      ),
  }),
});

export const membershipRemoved = defineEvent({
  type: "membership.removed",
  direction: "workspace",
  sender: "person",
  chipsWrites: ["reason", "moved_to"],
  summary: "A person or an agent left a space, or was removed from it.",
  requiresRun: false,
  payload: z.object({
    participant_id: z.string().min(1).max(120).describe("Who left."),
    removed_by: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe("Who removed them, if not themselves."),
    reason: z
      .enum([...RELEASE_REASONS, "person_removed", "person_left"])
      .optional()
      .describe(
        "For an agent (ADR 0087): why it left, as `agent.released` says. For a person, `person_removed`: they were removed from the workspace (ADR 0160); `person_left`: they deleted their account and left it (ADR 0243). Written by Chips; absent, a person took them out or they left the room.",
      ),
    moved_to: id("space")
      .optional()
      .describe("For an agent moved away: the room it went to, so this room can say so."),
  }),
});

/**
 * An agent put in a room (ADR 0087): added, moved in, brought back by an unarchive, or in its
 * harness's place. Chips writes it beside the membership. Its `space_id` is the room; the room is
 * sent it, and so is the agent's harness, with the room's last lines before it joined (ADR 0088,
 * point 5).
 */
export const agentAttached = defineEvent({
  type: "agent.attached",
  direction: "workspace",
  sender: "chips",
  summary:
    "An agent was put in a room: added, moved in, or brought back. Its harness is handed the room's last lines with it.",
  requiresRun: false,
  payload: z.object({
    agent_id: id("agent").describe("The agent, in the room this event's `space_id` names."),
    by: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe("Who put it there: a person, its harness, or Chips (`system`)."),
    moved_from: id("space").optional().describe("The room it left for this one, when moved."),
    fork_of: id("event")
      .optional()
      .describe("The `agent.fork` this copy answers, when it is a fork's copy (ADR 0087, Fork)."),
    made_for: id("event")
      .optional()
      .describe("The `agent.asked` this new agent answers, when a person asked for it (ADR 0108)."),
    catch_up: roomContext
      .optional()
      .describe(
        "The room's last lines before the agent joined, within the budget its harness gave in `hello` (ADR 0088, point 5). Added as it is sent to the harness; the log does not keep it.",
      ),
  }),
});

/**
 * An agent taken out of its room (ADR 0087): by an archive, a delete, a move, its being archived
 * or deleted (ADR 0095), or a person. Its `space_id` is the room it left; the room is sent it, and so is
 * the agent's harness, which is out of the room by then. The room an archive took it from is
 * remembered, so an unarchive brings it back while it is still free.
 */
export const agentReleased = defineEvent({
  type: "agent.released",
  direction: "workspace",
  sender: "chips",
  summary:
    "An agent was taken out of its room and is free: by an archive, a delete, a move, its harness, or a person.",
  requiresRun: false,
  payload: z.object({
    agent_id: id("agent").describe("The agent, out of the room this event's `space_id` names."),
    by: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe("Who did it: a person, its harness, or Chips (`system`)."),
    reason: releaseReason,
    moved_to: id("space").optional().describe("The room it went to, when moved."),
    delete: z
      .literal(true)
      .optional()
      .describe(
        "Written before ADR 0095: the room was deleted and the person asked for the agent to go in its harness too (ADR 0087, rule 5). Since ADR 0095 Chips writes `agent.deleted` for that instead; a log may still hold this.",
      ),
  }),
});

/**
 * A person asks an agent's harness for a copy of it in a room (ADR 0087, Fork). Its `space_id` is
 * the room the copy is for; the room is sent it, and so is the agent's harness, which copies the
 * agent and registers the copy with `forked_from` and this room. The room says it is forking
 * until the copy joins, and that the harness didn't make it once `FORK_WAIT_MS` has passed.
 */
export const agentFork = defineEvent({
  type: "agent.fork",
  direction: "workspace",
  sender: "chips",
  summary:
    "A person asked an agent's harness for a copy of it in this room. The copy remembers everything up to now; after that, the two remember separately.",
  requiresRun: false,
  payload: z.object({
    agent_id: id("agent").describe(
      "The agent to copy. It stays where it is; the copy is for the room this event's `space_id` names.",
    ),
    by: z.string().min(1).max(120).describe("The person who asked."),
  }),
});

/**
 * A person asks a harness for a new agent in a room (ADR 0108): Fork's ask with no agent to copy.
 * Its `space_id` is the room; the room is sent it, and so is the harness asked, which is in no
 * room itself. The harness makes an agent that remembers nothing from elsewhere and registers it
 * with `made_for` (this event's id) and the room, where Chips puts it. The room says it is asking
 * until the agent joins, and that the harness didn't make it once `NEW_AGENT_WAIT_MS` has passed.
 */
export const agentAsked = defineEvent({
  type: "agent.asked",
  direction: "workspace",
  sender: "chips",
  summary:
    "A person asked a harness for a new agent in this room. It starts with the room's last lines, and nothing from elsewhere.",
  requiresRun: false,
  payload: z.object({
    harness_id: id("harness").describe(
      "The harness asked. It makes the agent, and registers it for the room this event's `space_id` names.",
    ),
    name: z
      .string()
      .min(1)
      .max(120)
      .describe(
        "What the new agent is to be called: the person's word, or else the next name of its harness's that nobody here answers to. Chips numbers it, as any other, if the name is taken by the time it is registered.",
      ),
    by: z.string().min(1).max(120).describe("The person who asked."),
  }),
});

/**
 * What an agent said while in no room (ADR 0087, rule 6): kept by Chips, not shown anywhere, and
 * posted in the next room it is attached to, oldest first.
 */
export const messageHeld = defineEvent({
  type: "message.held",
  direction: "workspace",
  sender: "chips",
  summary:
    "An agent in no room said something: it is held, and posted in the next room the agent joins.",
  requiresRun: false,
  payload: z.object({
    agent_id: id("agent").describe("Who said it."),
    text: z.string().max(64_000).describe("Markdown, as the harness sent it."),
    attachments: z
      .array(attachment)
      .max(20)
      .optional()
      .describe("What it attached, as the upload described them."),
  }),
});

/**
 * A person pauses the agents in a room, or lets them carry on (ADR 0097). While paused, every
 * message an agent sends an agent there is held, as at the referee's ceiling. Carrying on is a
 * person acting in the room, so the count starts again and what was held is handed over; pausing
 * is not, so the count stands.
 *
 * Or Chips pauses them, with `why: "spend"`, when the room's job reaches what the room allows a
 * job (ADR 0118); the actor is the system, and `spend` says how far it got. Carrying on is then a
 * new job, with the room's whole ceiling again.
 */
export const exchangeSet = defineEvent({
  type: "exchange.set",
  direction: "workspace",
  sender: "chips",
  summary:
    "A person paused the agents in a room, or let them carry on; or Chips paused them at the room's spend ceiling.",
  requiresRun: false,
  payload: z.object({
    state: z
      .enum(["paused", "going"])
      .describe("`paused`: their messages to each other are held. `going`: they carry on."),
    why: z
      .enum(["spend"])
      .optional()
      .describe(
        "Why Chips paused them: `spend`, the room's job reached its ceiling (ADR 0118). Absent when a person did.",
      ),
    spend: jobSpend
      .optional()
      .describe("For `why: spend`: what the job had spent, against what the room allows a job."),
  }),
});

/**
 * A message Chips held from the agents it named (ADR 0097), handed to one of them now a person has
 * acted: the newest held message for each agent, once. The agent's harness is sent it as
 * `message.new`, the message's own words with `handed: true`; the room marks the message handed.
 *
 * Or, with `lead` (ADR 0104), an agent's message that was nobody's turn, handed to the room's lead
 * once the room went still: nobody working, and nothing for anybody to answer. The lead's harness
 * is sent it as `message.new` with `handed` and `lead`, and its note says why; the room shows one
 * quiet line under the message.
 */
export const messageHanded = defineEvent({
  type: "message.handed",
  direction: "workspace",
  sender: "chips",
  summary:
    "A held message was handed to an agent it was for, once a person acted; or one that was nobody's turn, to the room's lead.",
  requiresRun: false,
  payload: z.object({
    message_id: id("message").describe("The message, as `message.new` named it."),
    agent_id: agentId.describe("Who it is handed to."),
    lead: z
      .literal(true)
      .optional()
      .describe(
        "Handed to the room's lead because it was nobody's turn and the room went still (ADR 0104), rather than held by the referee.",
      ),
  }),
});

/**
 * An agent had nothing to say (ADR 0105): it posted `NO_REPLY` and nothing else, which Chips records
 * as this rather than as a message, so nobody is shown it and no agent is handed it. Its actor is
 * the agent, in the room the post was for, on the run it was said on when it had one.
 */
export const turnPassed = defineEvent({
  type: "turn.passed",
  direction: "workspace",
  sender: "chips",
  summary: "An agent answered that it had nothing to say: nothing is shown or handed on.",
  requiresRun: false,
  payload: z.object({
    reply_to: id("message")
      .optional()
      .describe("The message it was answering, when its post said."),
  }),
});

/**
 * An agent's context compacted (ADR 0146): its harness's copy of its context window says it
 * compacted since the last, so Chips writes one quiet line in the room the agent is in, to say why
 * it may have forgotten details. Its actor is the agent; the numbers are the harness's.
 */
export const contextCompacted = defineEvent({
  type: "context.compacted",
  direction: "workspace",
  sender: "chips",
  summary: "An agent's context compacted, as its harness said: one quiet line in its room.",
  requiresRun: false,
  payload: z.object({
    from: z.int().nonnegative().describe("The tokens it held before."),
    to: z.int().nonnegative().describe("The tokens it held after."),
    window: z.int().positive().describe("Its model's context window, in tokens."),
    by: z
      .enum(["asked", "itself"])
      .describe("`asked`: a person asked. `itself`: at its limit, or full."),
  }),
});

/**
 * Who leads a room (ADR 0104): the agent that hands out the work there, and that Chips hands what
 * was nobody's turn once the room goes still. A person in the room chooses it, or takes it away;
 * a room asked of a harness from the + is led, from its claim, by the agent that claimed it. One
 * at a time, and an agent that leaves the room leads it no more.
 */
export const spaceLeadSet = defineEvent({
  type: "space.lead_set",
  direction: "workspace",
  sender: "chips",
  summary: "A room's lead was chosen, or taken away.",
  requiresRun: false,
  payload: z.object({
    agent_id: agentId
      .nullable()
      .describe("The agent that leads the room now, or `null` when nobody does."),
  }),
});

/**
 * What a room allows a job (ADR 0117): the most its agents' runs may spend after the last thing a
 * person did there before Chips holds them. The workspace's owner, in the room, sets it, or sets
 * it back to the default (ADR 0196); `null` is the default, so a room that never chose follows it.
 */
export const spaceSpendCeilingSet = defineEvent({
  type: "space.spend_ceiling_set",
  direction: "workspace",
  sender: "chips",
  summary: "What a room allows a job to spend was set, or set back to the default.",
  requiresRun: false,
  payload: z.object({
    usd: spendCeiling.describe(
      "What the room allows a job now, in US dollars, from 0.25 to 100 in steps of 0.25; `null` for the default (3).",
    ),
  }),
});

/**
 * A room's changes locked or let go (ADR 0156): while they are locked, no person renames, archives
 * or deletes it. A person in the room who is not a guest sets it; a room that never chose is not
 * locked. A harness's own rename or close of a room it opened still lands, so that what it keeps
 * and what Chips shows stay one.
 */
export const spaceLockSet = defineEvent({
  type: "space.lock_set",
  direction: "workspace",
  sender: "chips",
  summary:
    "A room's changes were locked, or let go: while locked, no person renames, archives or deletes it.",
  requiresRun: false,
  payload: z.object({
    locked: z
      .boolean()
      .describe(
        "Whether the room's changes are locked now. `false` is how every room starts, and lets them go again.",
      ),
  }),
});

/**
 * A harness's agent, made or found by its key (ADR 0087): who the harness takes part in rooms as.
 * A harness registers its own; the upgrade registers one for each room a harness was in before
 * agents, as the system. Registering a key again is `agent.updated`, not this.
 */
export const agentRegistered = defineEvent({
  type: "agent.registered",
  direction: "workspace",
  sender: "chips",
  summary:
    "A harness has a new agent: a face and a name that takes part in rooms, found again by the harness's own key for it.",
  requiresRun: false,
  payload: z.object({
    agent_id: id("agent").describe("The agent."),
    harness_id: id("harness").describe("The harness it belongs to, which speaks for it."),
    key: z
      .string()
      .min(1)
      .max(400)
      .describe(
        "The harness's own name for it, unique among the harness's agents: the id of the thing the agent is, in the harness's own terms. The agent a harness has for a room with no key of its own is keyed by the harness's id, and the harness registers that id to name it: as its Main agent, say (ADR 0183).",
      ),
    name: z.string().min(1).max(120).describe("What it is called, and so its @handle."),
    lead: z
      .boolean()
      .default(false)
      .describe(
        "The harness's Main agent (ADR 0087): the one it leads with, in a room of its own. A harness has one at most.",
      ),
    forked_from: id("agent")
      .optional()
      .describe("The agent this one is a copy of, when it was forked."),
  }),
});

/**
 * An agent's name, state, face or Main changed: renamed by its harness, archived with the thing it
 * is, renamed or given a face by a person (ADR 0089, ADR 0091), archived or unarchived by a person
 * (ADR 0095), or made its harness's Main agent in place of another (ADR 0183). With a person as
 * the actor, its harness archives or restores its own side.
 */
export const agentUpdated = defineEvent({
  type: "agent.updated",
  direction: "workspace",
  sender: "chips",
  summary:
    "An agent was renamed, archived or brought back in its harness, made or no longer its harness's Main agent, or renamed or given a face by a person. What it said stays its, under the new name and face.",
  requiresRun: false,
  payload: z.object({
    agent_id: id("agent").describe("The agent."),
    name: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe(
        "What it is called from here: nobody else's in the workspace, case and spaces aside, so it may be numbered, `Scout 2` (ADR 0091). With a person as the actor, a person named it, and its harness no longer renames it.",
      ),
    state: z
      .enum(["active", "archived"])
      .optional()
      .describe(
        "`archived` when the thing it is was put away in its harness (ADR 0087, rule 9), or a person archived it (ADR 0095); `active` when it came back. With a person as the actor, its harness archives or restores its side.",
      ),
    face: spaceIcon
      .nullable()
      .optional()
      .describe(
        "The face a person chose for it (ADR 0089): a mark from Chips' library and the index of the ground it sits on, one for everybody in the workspace. `null` when the choice was taken back and it wears its initials again. Written by Chips for a person; a harness does not send it.",
      ),
    lead: z
      .boolean()
      .optional()
      .describe(
        "Whether it is its harness's Main agent from here (ADR 0183): `true` when the harness registered it as Main, `false` when its default agent took Main from it. A harness has one at most.",
      ),
  }),
});

/**
 * An agent deleted by a person (ADR 0095): gone from every list, for everybody. What it said stays
 * in the rooms it was in, under its name and face, as a removed harness's words do (ADR 0078). It
 * has been taken out of its room already. Its harness deletes its own side, and Chips refuses
 * anything that would bring it back or speak as it.
 */
export const agentDeleted = defineEvent({
  type: "agent.deleted",
  direction: "workspace",
  sender: "chips",
  summary:
    "A person deleted an agent: it is gone from Chips for everybody, and its harness deletes its own side. What it said stays, under its name.",
  requiresRun: false,
  payload: z.object({
    agent_id: id("agent").describe("The agent deleted."),
    harness_id: id("harness").describe("The harness it belonged to, which deletes its own side."),
    key: z
      .string()
      .min(1)
      .max(400)
      .describe("The harness's own key for it, as `agent.registered` gave it: refused from here."),
    name: z
      .string()
      .min(1)
      .max(120)
      .describe("What it was called when it was deleted, so the audit needs no lookup."),
    by: z.string().min(1).max(120).describe("The person who deleted it."),
  }),
});

/**
 * An agent's changes locked or let go (ADR 0199): while they are locked, no person renames,
 * archives or deletes it. Its harness's owner, or an owner or admin of the workspace, sets it; an
 * agent that never chose is not locked. A harness's own archive of its agent still lands, so that
 * what it keeps and what Chips shows stay one. Told to the people who read the whole directory,
 * never to a harness.
 */
export const agentLockSet = defineEvent({
  type: "agent.lock_set",
  direction: "workspace",
  sender: "chips",
  summary:
    "An agent's changes were locked, or let go: while locked, no person renames, archives or deletes it.",
  requiresRun: false,
  payload: z.object({
    agent_id: id("agent").describe("The agent whose changes were locked or let go."),
    locked: z
      .boolean()
      .describe(
        "Whether the agent's changes are locked now. `false` is how every agent starts, and lets them go again.",
      ),
  }),
});

/**
 * One member of a room taking another's place (ADR 0087, point 9): a harness's agent in the room
 * the harness was in itself. What the one said there is the other's from then on, on every screen
 * and in the agent's history; the log keeps what was sent.
 */
export const membershipReplaced = defineEvent({
  type: "membership.replaced",
  direction: "workspace",
  sender: "chips",
  summary:
    "An agent took its harness's place in a room: what the harness said there shows as the agent's.",
  requiresRun: false,
  payload: z.object({
    from: agentId.describe("The member it replaces: the harness, before agents."),
    to: id("agent").describe("The agent in the room from here."),
  }),
});

export const attachmentFetched = defineEvent({
  type: "attachment.fetched",
  direction: "workspace",
  sender: "chips",
  summary:
    "A harness downloaded an attachment. Every fetch is an audit event: “Scout read IMG_2210.jpg”.",
  requiresRun: false,
  payload: z.object({
    attachment_id: id("attachment"),
    filename: z.string().min(1).max(255).describe("What the file was called when it was sent."),
    by: z.string().min(1).max(120).describe("The harness that fetched it. Recorded by Chips."),
  }),
});

/**
 * A push that moved a room's project forward (ADR 0220): who pushed, from where to where, the
 * newest commit's first line and the files it changed. Written by Chips after git takes the push,
 * for every push that moves `main`. It shows no line of its own: a change goes with the reply
 * that made it (ADR 0222).
 */
export const projectChanged = defineEvent({
  type: "project.changed",
  direction: "workspace",
  sender: "chips",
  summary:
    "Somebody's push moved the room's project forward: who, which commits, and the files they changed.",
  requiresRun: false,
  payload: projectChangedPayload,
});

// A person's standing in the workspace (ADR 0034), kept with the primitives so a join request can
// name it too (ADR 0232) without the two modules importing each other.
export { type WorkspaceRole, workspaceRole } from "../primitives.js";

export const personJoined = defineEvent({
  type: "person.joined",
  direction: "workspace",
  sender: "chips",
  summary:
    "A person joined the workspace: by an invite, or as its first person. Their role starts here.",
  requiresRun: false,
  payload: z.object({
    participant_id: id("person").describe("Who joined."),
    display_name: z.string().min(1).max(120).describe("Their name, so a screen needs no lookup."),
    role: workspaceRole,
    invite_id: id("invite")
      .optional()
      .describe("The invite they redeemed, when they came by one. Never the invite itself."),
    invited_by: id("person").optional().describe("Who issued that invite."),
  }),
});

/**
 * A person named themselves again (ADR 0082). Their name is the people registry's, as their
 * joining is (ADR 0018), so this is the change's line in the log: the audit reads it, and every
 * screen and every harness that keeps names reads them again.
 */
export const personRenamed = defineEvent({
  type: "person.renamed",
  direction: "workspace",
  sender: "chips",
  summary:
    "A person changed the name they go by. What they said stays theirs, under the new name; an @ of the old one reaches nobody.",
  requiresRun: false,
  payload: z.object({
    participant_id: id("person").describe("Who."),
    display_name: z.string().min(1).max(120).describe("What they go by from here."),
    previous_name: z.string().min(1).max(120).describe("What they went by until now."),
  }),
});

/**
 * A person chose the face they wear (ADR 0139): a mark from Chips' library, or a letter or two, on
 * one of its grounds, in place of the initials of their name; or the initials back. It is theirs
 * and one for everybody, as an agent's is (ADR 0089), so it is the log's: the directory carries
 * it, and every screen that draws them reads it again. A harness is not sent it: it draws nobody.
 */
export const personFaceSet = defineEvent({
  type: "person.face_set",
  direction: "workspace",
  sender: "chips",
  summary:
    "A person chose the face they wear beside their name, or went back to their initials. Not sent to a harness.",
  requiresRun: false,
  payload: z.object({
    participant_id: id("person").describe("Who: a person chooses only their own face."),
    face: spaceIcon
      .nullable()
      .describe(
        "The face they chose: a mark from Chips' library or one or two letters, on the index of a ground. `null` when they took it back and wear their initials again.",
      ),
  }),
});

export const roleChanged = defineEvent({
  type: "role.changed",
  direction: "workspace",
  sender: "person",
  summary: "An owner or admin changed a person's role in the workspace.",
  requiresRun: false,
  payload: z.object({
    participant_id: id("person").describe("Whose role changed."),
    role: workspaceRole.describe("What it is now."),
    reason: z.string().max(400).optional().describe("Why, for the audit."),
  }),
});

export const harnessTransferred = defineEvent({
  type: "harness.transferred",
  direction: "workspace",
  sender: "chips",
  summary:
    "A harness was handed to another person, who is accountable for it from here: its approvals default to them, and its tokens are theirs.",
  requiresRun: false,
  payload: z.object({
    harness_id: id("harness").describe("The harness handed over."),
    from_owner_id: id("person").describe("Who owned it until now."),
    to_owner_id: id("person").describe("Who owns it from here."),
    reason: z.string().max(400).optional().describe("Why, for the audit."),
  }),
});

/**
 * A harness taken out of the workspace (ADR 0078). Its tokens are withdrawn and it is marked
 * removed in the registry, which is the truth for it, as with a handing-on (ADR 0023). This is the
 * line the audit and the screens read, and the one that stops its homes being homes: a replay
 * clears them again, so a rebuild agrees with the live server.
 */
export const harnessRemoved = defineEvent({
  type: "harness.removed",
  direction: "workspace",
  sender: "chips",
  summary:
    "A harness was removed from the workspace by a person: its tokens are withdrawn, and it can no longer connect, be added to a room or be asked for one. What it said stays, under its name.",
  requiresRun: false,
  payload: z.object({
    harness_id: id("harness").describe("The harness removed."),
    display_name: z
      .string()
      .min(1)
      .max(120)
      .describe("What it was called when it was removed, so the audit needs no lookup."),
    homes: z
      .array(id("space"))
      .max(1000)
      .optional()
      .describe(
        "The rooms that were its homes (ADR 0069), which are not homes from here: they can be archived or deleted like any other room. Written by Chips.",
      ),
    reason: z.string().max(400).optional().describe("Why, for the audit."),
  }),
});

/**
 * A person taken out of the workspace by an owner or admin (ADR 0160), or gone by deleting their own
 * account (ADR 0243), when `removed_by` is themselves. Their devices, passkeys, pairing codes and
 * open invites are withdrawn and the registry marks them removed, which is the truth for them, as
 * for a removed harness (ADR 0078); each room they were in has its own `membership.removed` beside
 * this. What they said stays, under their name. Coming back takes a new invite, which makes a new
 * person.
 */
export const personRemoved = defineEvent({
  type: "person.removed",
  direction: "workspace",
  sender: "chips",
  summary:
    "A person was removed from the workspace, or deleted their account: signed out everywhere, out of every room, and the harnesses they owned handed on. What they said stays, under their name.",
  requiresRun: false,
  payload: z.object({
    participant_id: id("person").describe("Who was removed."),
    display_name: z
      .string()
      .min(1)
      .max(120)
      .describe("What they were called when they were removed, so the audit needs no lookup."),
    removed_by: id("person").describe(
      "The owner or admin who removed them, or they themselves when they deleted their account (ADR 0243).",
    ),
    spaces: z
      .array(id("space"))
      .max(1000)
      .optional()
      .describe("The rooms they were taken out of, each with its own `membership.removed`."),
    harnesses: z
      .array(id("harness"))
      .max(1000)
      .optional()
      .describe(
        "The harnesses they owned, each handed on by `harness.transferred`: to `removed_by`, or, for an account deleted, to an owner.",
      ),
  }),
});

/**
 * What came of a join request (ADR 0122), for the audit: who decided, about whom, and what was
 * granted. A request a requester started is allowed when a person allows it; a link a person made
 * is allowed when it is redeemed, since that is when Chips learns who it let in. A request nobody
 * decided leaves no line. Only people who see the whole directory are sent these.
 */
const joinWho = {
  request_id: id("join").describe("The request."),
  kind: joinKind,
  started_by: joinStartedBy,
  name: z.string().min(1).max(120).optional().describe("What the requester called itself."),
  software: z.string().min(1).max(120).optional().describe("Its software, as it said."),
  machine: z.string().min(1).max(120).optional().describe("Its machine, as it said."),
  from_addr: z.string().min(1).max(120).optional().describe("The address it asked from."),
  by: id("person").describe("Who decided: allowed it, refused it, or made the link."),
};

export const joinAllowed = defineEvent({
  type: "join.allowed",
  direction: "workspace",
  sender: "chips",
  summary:
    "A person let a harness or a device in by a join request, with what they allowed it to do.",
  requiresRun: false,
  payload: z.object({
    ...joinWho,
    capabilities: z
      .array(z.string().min(1).max(120))
      .max(64)
      .describe("What the harness may do: what was granted, which may be less than it asked."),
    harness_id: id("harness")
      .optional()
      .describe("The harness made, when a link was redeemed. A code allowed makes it at its poll."),
    device_id: id("device").optional().describe("The device paired, when it was a link's."),
    pair_as: id("person")
      .optional()
      .describe(
        "Whom a device is paired as, when an owner chose somebody already here whose phone is new (ADR 0206).",
      ),
  }),
});

export const joinDenied = defineEvent({
  type: "join.denied",
  direction: "workspace",
  sender: "chips",
  summary: "A person refused a join request, or withdrew a link they had made.",
  requiresRun: false,
  payload: z.object(joinWho),
});

export const messageEdited = defineEvent({
  type: "message.edited",
  direction: "workspace",
  sender: "either",
  summary:
    "A message's author changed its words. The log keeps both; the room shows the latest, marked edited.",
  requiresRun: false,
  payload: z.object({
    message_id: id("message").describe("The message, which must be the sender's own."),
    text: z.string().min(1).max(64_000).describe("The new text, Markdown as before."),
  }),
});

export const messageDeleted = defineEvent({
  type: "message.deleted",
  direction: "workspace",
  sender: "either",
  summary:
    "A message was taken back: by its author, the space's owner, or an owner or admin of the workspace. The room shows a tombstone; the log keeps the words.",
  requiresRun: false,
  payload: z.object({
    message_id: id("message"),
    reason: z.string().max(400).optional().describe("Why, for the audit."),
  }),
});

export const messageHidden = defineEvent({
  type: "message.hidden",
  direction: "workspace",
  sender: "person",
  summary:
    "A person deleted a message for themselves (ADR 0167). It leaves their own screens, on every device of theirs; nobody else's room changes, and only they are sent the event.",
  requiresRun: false,
  payload: z.object({
    message_id: id("message").describe("Any message in the space: the person's own or anyone's."),
  }),
});

export const messageShown = defineEvent({
  type: "message.shown",
  direction: "workspace",
  sender: "person",
  summary:
    "A person took back their own deletion of a message (ADR 0167): Undo. The message is on their screens again. Only they are sent the event.",
  requiresRun: false,
  payload: z.object({ message_id: id("message") }),
});

export const messagePinned = defineEvent({
  type: "message.pinned",
  direction: "workspace",
  sender: "person",
  summary: "A message was pinned to the top of its space, by somebody in it who is not a guest.",
  requiresRun: false,
  payload: z.object({ message_id: id("message") }),
});

export const messageUnpinned = defineEvent({
  type: "message.unpinned",
  direction: "workspace",
  sender: "person",
  summary: "A pinned message was let go.",
  requiresRun: false,
  payload: z.object({ message_id: id("message") }),
});

export const approvalRouted = defineEvent({
  type: "approval.routed",
  direction: "workspace",
  sender: "person",
  summary:
    "A pending approval handed to somebody else to answer (M5.5): a teammate, a role, or the lane's lead. Chips resolves `to` to ids, as it does on the request.",
  requiresRun: false,
  payload: z.object({
    approval_id: id("approval"),
    to: z
      .array(z.string().min(1).max(120))
      .min(1)
      .max(16)
      .describe(
        "Who should answer, as the router asks it: `owner`, `any`, `role:<name>`, `lead`, or a person id — the same words as `approvers` on the request.",
      ),
    approvers: z
      .array(z.string().min(1).max(120))
      .max(64)
      .optional()
      .describe(
        "Who may answer now, as ids. Filled in by Chips from `to`; a value the sender writes is replaced.",
      ),
    ask: z
      .object({
        harness_id: z.string().min(1).max(120).describe("The harness that asked."),
        action: z
          .looseObject({ kind: z.string().min(1).max(120) })
          .describe("The action as the harness proposed it."),
        risk: z
          .array(z.string().max(60))
          .max(8)
          .optional()
          .describe("The risk classes it declared."),
        expires_at: isoTimestamp.optional().describe("When it expires, if it does."),
      })
      .optional()
      .describe(
        "What the ask is, written by Chips from the approval. Somebody handed an ask in a room they are not in never saw the request that raised it (ADR 0042), and this is what their card is drawn from; whoever is in the room has the request itself and ignores this.",
      ),
    reason: z
      .string()
      .max(4000)
      .optional()
      .describe("Why it was handed on, for the card and the audit."),
    routed_by: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe("Who handed it on. Filled in by Chips from the credential."),
    routed_at: z
      .string()
      .datetime()
      .optional()
      .describe("When. Filled in by Chips from its clock."),
  }),
});

/** A cap in bytes, or `null` for the server's own ceiling (`CHIPS_MAX_ATTACHMENT_BYTES`). */
const cap = z.number().int().min(1).nullable();

export const attachmentLimitsSet = defineEvent({
  type: "attachment.limits_set",
  direction: "workspace",
  sender: "person",
  summary:
    "An owner or an admin capped how big a photo, a video or a file may be here (ADR 0047). Everyone's, and the server refuses an upload over it.",
  requiresRun: false,
  payload: z.object({
    image_bytes: cap.describe(
      "The most a photo may be, in bytes. `null` leaves it to the server's own limit.",
    ),
    video_bytes: cap.describe("The most a video may be, in bytes, or `null`."),
    file_bytes: cap.describe(
      "The most anything else may be — a document, an archive, a voice note — or `null`.",
    ),
  }),
});

export const exchangeLimitsSet = defineEvent({
  type: "exchange.limits_set",
  direction: "workspace",
  sender: "person",
  summary:
    "An owner or an admin set when Chips tells the agents in any room to stop, when it holds their messages to each other, and whether agents going in circles are told to stop then (ADR 0187). Everyone's, in every room.",
  requiresRun: false,
  payload: z.object({
    stop: z
      .number()
      .int()
      .min(STOP_RANGE.least)
      .max(STOP_RANGE.most)
      .nullable()
      .describe(
        "After how many messages between agents, with nobody acting, Chips tells them to stop and tells the room's people. `null`: never, by count. Smaller than `hold` when both are set.",
      ),
    hold: z
      .number()
      .int()
      .min(HOLD_RANGE.least)
      .max(HOLD_RANGE.most)
      .nullable()
      .describe(
        "After how many Chips holds their messages to each other until a person acts. `null`: never, by count; a pause still holds them.",
      ),
    circles: z
      .boolean()
      .describe(
        "Whether agents going in circles (the same two or three taking turns and saying again what they said) are told to stop then, whatever the count.",
      ),
  }),
});

/**
 * The workspace named again by an owner (ADR 0194). Its name is the registry's, as a person's is
 * (ADR 0018), so this is the change's line in the log: every device that is connected takes the
 * new name from it at once, as a device that connects later takes it from the hello (ADR 0193),
 * and the audit says who renamed it.
 */
export const workspaceRenamed = defineEvent({
  type: "workspace.renamed",
  direction: "workspace",
  sender: "chips",
  summary:
    "An owner named the workspace again. Every device connected changes its name at once; one that connects later is told by the hello.",
  requiresRun: false,
  payload: z.object({
    name: z.string().min(1).max(120).describe("What the workspace is called from here."),
    previous_name: z.string().min(1).describe("What it was called until now."),
  }),
});

/**
 * The relay turned off or on by an owner (ADR 0211, Phase 4). The switch is the server's
 * registry's, as a workspace's name is, so this is the change's line in the log: every device
 * connected hears it, those on the relay before it goes, and can say why they cannot connect
 * after; and the audit says who.
 */
export const relaySet = defineEvent({
  type: "relay.set",
  direction: "workspace",
  sender: "chips",
  summary:
    "An owner turned the server's relay off or on. Off, devices away from the server's own network cannot connect until they go direct; every device connected is told first.",
  requiresRun: false,
  payload: z.object({
    on: z.boolean().describe("Whether the server dials its relay from now."),
  }),
});

/** Every event Chips records about a workspace, in the order the reference lists them. */
export const WORKSPACE_EVENTS = [
  spaceCreated,
  spaceUpdated,
  spaceClaimed,
  spaceErased,
  membershipAdded,
  membershipRemoved,
  membershipReplaced,
  agentRegistered,
  agentUpdated,
  agentDeleted,
  agentLockSet,
  agentAttached,
  agentReleased,
  agentFork,
  agentAsked,
  messageHeld,
  exchangeSet,
  messageHanded,
  spaceLeadSet,
  spaceSpendCeilingSet,
  spaceLockSet,
  turnPassed,
  contextCompacted,
  attachmentFetched,
  projectChanged,
  personJoined,
  personRenamed,
  personFaceSet,
  roleChanged,
  harnessTransferred,
  harnessRemoved,
  personRemoved,
  joinAllowed,
  joinDenied,
  messageEdited,
  messageDeleted,
  messageHidden,
  messageShown,
  messagePinned,
  messageUnpinned,
  approvalRouted,
  attachmentLimitsSet,
  exchangeLimitsSet,
  workspaceRenamed,
  relaySet,
] as const;
