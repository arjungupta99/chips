/**
 * What the screens read: every shape the fold hands out.
 *
 * Pure types, so a screen imports what it draws without pulling the fold in with it. The fold
 * builds these from the log; nothing here knows how.
 *
 * Over 400 lines on purpose: these are one vocabulary, and a screen that draws a `Line` wants
 * `Reaction`, `Pin` and `Correction` in the same breath. Splitting them further would only put
 * the words a reader needs together in different files.
 */

import type {
  AttachmentCaps,
  ExchangeLimits,
  NO_SPEND_CEILING,
  Preview,
  StepKind,
  WorkspaceRole,
} from "@chipschat/protocol";
import type { Attachment } from "../attachments.js";

export type { WorkspaceRole } from "@chipschat/protocol";

/**
 * `paused` is a person's Pause, or Chips's at a budget (ADR 0293): the server keeps it as its own
 * state, and so does a run here, so a paused run is never read as one waiting on somebody.
 */
export type RunState =
  | "queued"
  | "running"
  | "waiting"
  | "paused"
  | "done"
  | "failed"
  | "cancelled";
export type StepStatus = "planned" | "started" | "waiting" | "done" | "failed";

/**
 * A lane's own state, which is the run's with one difference: a run is `done`, but a lane is
 * `completed`, because a lane that finished and a lane whose result reached the person are not
 * the same thing (blueprint, Lead and lanes). Delivery is the second half of that.
 */
export type LaneState = "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled";
export type LaneDelivery = "pending" | "direct" | "queued_to_lead" | "delivered" | "failed";

/** One hop in the chain that led to a lane: who handled it, in which run, toward what. */
export interface LaneHop {
  readonly participantId: string;
  readonly runId?: string | undefined;
  readonly goal?: string | undefined;
  /**
   * What to call this hop, when its participant name is not the right one: on a lane between two
   * spaces of one harness, the room of its own the harness worked this hop in (`Lane.leadLabel`).
   */
  readonly label?: string | undefined;
  /**
   * The room the label names, when the hop has one: a face drawn for this hop wears that room's
   * chosen face (22 September 2026), because the hop is called after it. Absent wherever the
   * label is, so a harness in somebody else's room is never drawn as that room.
   */
  readonly spaceId?: string | undefined;
}

/**
 * A run a lead routed to a specialist: one object, two views, never a copy (blueprint, Lead and
 * lanes). It lives in the specialist's home space and is linked into the lead's, and the client
 * assembles it from whichever side it can see — the `task` in the lead's space, the
 * `run.requested` in the specialist's, the `lane.updated` that carries the news back to the lead
 * (ADR 0029). A person who is in both spaces sees both views of the one lane.
 */
export interface Lane {
  readonly laneId: string;
  /** The specialist's run, whose messages, steps and cost are the lane's. */
  readonly runId?: string | undefined;
  readonly leadId: string;
  readonly specialistId: string;
  readonly onBehalfOf: string;
  /** The lead's run this lane is a hop of, for the cost roll-up and the cancel cascade. */
  readonly leadRunId?: string | undefined;
  /** Where the lane lives: the specialist's direct space with the person, or one Chips opened. */
  readonly homeSpaceId?: string | undefined;
  /** The lead spaces the route card appears in. */
  readonly linkedSpaceIds: readonly string[];
  /** The message that caused the routing, quoted in the specialist's task card. */
  readonly originMessageId?: string | undefined;
  readonly goal: string;
  /** Bounds the lead put on the work, shown on the specialist's task card. */
  readonly constraints: readonly string[];
  /** When it is needed by, as the ISO instant the events carry. */
  readonly deadline?: string | undefined;
  readonly state: LaneState;
  readonly delivery: LaneDelivery;
  /** How deep the lane nests: one below its parent, up to three. */
  readonly depth: number;
  /** The person, then every lead down to this one; the specialist is not in it. */
  readonly trail: readonly LaneHop[];
  readonly summary?: string | undefined;
  /**
   * The files the specialist's answer carried, handed back to the lead with the summary. A
   * lane that ends in photographs has an answer a sentence cannot hold, and the lead's room is
   * where the question was asked (Arjun, 12 September 2026).
   */
  readonly attachments?: readonly Attachment[] | undefined;
  readonly costUsd?: number | undefined;
  /**
   * What the lead calls the specialist on this lane, when that is not its participant name: a
   * Space's name, a subagent's type (M3.5). A lane between two spaces of one harness is routed
   * to the harness itself, and the label is what tells the two cards apart from a monologue.
   */
  readonly label?: string | undefined;
  /**
   * What to call the lead, when its participant name is not the right one: on a lane between two
   * spaces of one harness, the title of the room of its own it routed from. Both ends are the one
   * harness there, so its name says nothing, and a Space handing down from its own room read
   * "J → Engineer", as if the work had come from J's (Arjun, 13 September 2026).
   */
  readonly leadLabel?: string | undefined;
  /** The room `leadLabel` names, beside it and only with it: the lead's face in a trail. */
  readonly leadSpaceId?: string | undefined;
}

export interface Step {
  readonly stepId: string;
  readonly title: string;
  readonly status: StepStatus;
  readonly source?: string | undefined;
  readonly durationMs?: number | undefined;
  readonly error?: string | undefined;
  /** A tick marks a moment on the rail rather than a step: a compaction. */
  readonly kind?: "step" | "tick" | undefined;
  /** In the plan the harness sent, rather than logged as it went. The panel draws these one by one. */
  readonly planned?: boolean | undefined;
  /** When it began, from the event that said so; a planned step has none until it does. */
  readonly startedAt?: string | undefined;
  /** When it was done or failed. */
  readonly endedAt?: string | undefined;
  /** The tool it called, as the harness named it: `jacobian.web_search`, `exec` (ADR 0147). */
  readonly tool?: string | undefined;
  /** What kind of call the harness said the tool is, when it said (ADR 0162). */
  readonly callKind?: StepKind | undefined;
  /** The line the harness gave it for the receipt, once it said one: OpenClaw's only words. */
  readonly summary?: string | undefined;
}

/**
 * The last thing a harness said it was at (`run.status`), with when, for the thinking bubble
 * (ADR 0147). A status that is only a word and its ellipsis is not one: Jacobian says `Writing…`
 * before every tool call, and it says the harness is still going, which the dots already say.
 */
export interface Thought {
  /** `thinking`, `writing`, `waiting`: the harness's own label, machine-ish. */
  readonly phase: string;
  readonly words: string;
  readonly at: string;
}

export type SteerMode = "steer" | "followup" | "interrupt";

/** A reaction on a line: who gave it, and which emoji (M3.4). */
export interface Reaction {
  readonly by: string;
  readonly reaction: string;
  readonly seq: number;
}

/** A note about what went wrong with a line, and from whom (M3.4). */
/** A line pinned to the top of its space (M5.4): which, by whom, and when. */
export interface Pin {
  readonly lineId: string;
  readonly by: string;
  readonly ts: string;
  readonly seq: number;
}

/**
 * A yes that lets an agent work in a space without asking (ADR 0281): given on an ask for an hour,
 * or until somebody stops it. Every ask of the agent's there goes ahead without a card, but one
 * that matters.
 */
export interface LetWork {
  /** Whose asks go ahead: the agent, or a harness without agents. */
  readonly asker: string;
  /** Who gave it. */
  readonly by: string;
  readonly since: string;
  /** When it stops; absent for one that holds until somebody stops it. */
  readonly until?: string | undefined;
}

export interface Correction {
  readonly by: string;
  readonly text: string;
  readonly ts: string;
  readonly seq: number;
}

export interface Resolution {
  readonly decision: string;
  /** Who decided: a participant id, or `system` for policy and for an expiry. */
  readonly by: string;
  readonly at: string;
  readonly scope: string;
  readonly reason?: string | undefined;
  readonly updatedInput?: unknown;
  /** Delivery's word: this surface did not make the decision (first answer wins). */
  readonly elsewhere: boolean;
}

export interface Approval {
  readonly approvalId: string;
  readonly runId: string;
  readonly actionKind: string;
  /** When it was asked. */
  readonly askedAt: string;
  /** The plan step it belongs to, when the harness said. */
  readonly stepId?: string | undefined;
  /** The action's arguments, for an edit to start from. */
  readonly input?: unknown;
  readonly to?: string | undefined;
  /** The question the person answers yes or no, in the harness's words (ADR 0142). */
  readonly question?: string | undefined;
  /** What a yes does, in the harness's words. */
  readonly effect?: string | undefined;
  /** How long a yes keeps working: this action alone, or until it is taken back. */
  readonly lasts?: "once" | "standing" | undefined;
  /** The preview's body, which is also what an edit starts from. */
  readonly preview?: string | undefined;
  /**
   * How the harness said the body is to be drawn, whenever there is a body: a Markdown one is
   * drawn as the room draws a message, so a code fence is a code block and not its backticks.
   */
  readonly previewFormat?: Preview["format"] | undefined;
  /** The preview's heading, when the harness gave it one: a file's name above its diff. */
  readonly previewTitle?: string | undefined;
  readonly risk: readonly string[];
  /**
   * Whether the action matters (ADR 0195): money, an outside message, a deletion, anything that
   * can't be undone. It waits for a person and is answered once, with no This session or Always.
   */
  readonly matters?: boolean | undefined;
  readonly sources: readonly { readonly kind: string; readonly label: string }[];
  readonly editable: boolean;
  readonly expiresAt?: string | undefined;
  readonly fallback: "deny" | "allow";
  /** Who may answer, as Chips resolved policy's word (M3.3). Empty means anyone in the room. */
  readonly approvers: readonly string[];
  /** Handed on (M5.5): by whom, when, and why, when somebody re-routed it. */
  readonly routedBy?: string | undefined;
  readonly routedAt?: string | undefined;
  readonly routedReason?: string | undefined;
  readonly resolved?: Resolution | undefined;
  readonly executed?: string | undefined;
}

export interface QuestionOption {
  readonly value: string;
  readonly label: string;
  readonly description?: string | undefined;
}

export interface QuestionItem {
  readonly questionId: string;
  readonly prompt: string;
  readonly options: readonly QuestionOption[];
  readonly multiSelect: boolean;
  readonly allowFreeText: boolean;
  readonly defaultValue?: string | undefined;
}

export interface Answer {
  readonly by: string;
  readonly at: string;
  readonly timedOut: boolean;
  readonly answers: readonly {
    readonly questionId: string;
    readonly values: readonly string[];
    readonly freeText?: string | undefined;
  }[];
}

/** One `question.ask`: one to four questions, a timeout, and what happens without an answer. */
export interface Question {
  readonly askId: string;
  readonly runId: string;
  readonly spaceId: string;
  readonly harnessId: string;
  readonly askedAt: string;
  readonly timeoutAt?: string | undefined;
  readonly onNoAnswer: "use_default" | "cancel" | "continue";
  readonly questions: readonly QuestionItem[];
  readonly answered?: Answer | undefined;
}

/** A rule as the protocol spells it; the fold keeps them verbatim for the dial and the audit. */
export type Rule = Readonly<Record<string, unknown>>;

/** The policy in force for a run: the harness's level in that room, capped by the workspace. */
export interface RunPolicy {
  readonly autonomy: 0 | 1 | 2 | 3;
  readonly maxAutonomy: 0 | 1 | 2 | 3;
  readonly rules: readonly Rule[];
}

export interface Run {
  readonly runId: string;
  readonly spaceId: string;
  readonly harnessId: string;
  readonly goal: string;
  readonly state: RunState;
  /** The run's last event. A card in Needs you for a run that ended carries it. */
  readonly lastSeq: number;
  /** A person paused it, or Chips did; until a Resume it holds (ADR 0293). */
  readonly paused: boolean;
  /** Its harness said a Pause holds it (`run.status` `pausable`, ADR 0293): Pause is offered. */
  readonly pausable?: boolean | undefined;
  /** When it was paused, while it is. */
  readonly pausedAt?: string | undefined;
  /** Who paused it, a person's id or `system`, while it is. */
  readonly pausedBy?: string | undefined;
  /** How long it has stood paused, Resumes included: its clock counts working time. */
  readonly pausedMs?: number | undefined;
  readonly statusVerb?: string | undefined;
  /** What it last said it was at, never a bare `Writing…` (ADR 0147). */
  readonly thought?: Thought | undefined;
  readonly steps: readonly Step[];
  readonly summary?: string | undefined;
  readonly error?: string | undefined;
  readonly approvals: readonly Approval[];
  readonly costUsd?: number | undefined;
  /** Every token the model read, its prompt cache's included. */
  readonly inputTokens?: number | undefined;
  /** Of those, how many it read from its prompt cache, when the harness said. */
  readonly cacheReadTokens?: number | undefined;
  /** Of those, how many it wrote to its prompt cache, when the harness said. */
  readonly cacheWriteTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
  readonly contextUsed?: number | undefined;
  readonly contextLimit?: number | undefined;
  readonly model?: string | undefined;
  readonly startedAt?: string | undefined;
  readonly endedAt?: string | undefined;
  /** The visit this run belongs to, so two terminals in one space are told apart (ADR 0024). */
  readonly sessionRef?: string | undefined;
  /** Where the goal came from: the harness's own surface, or a message already in this space. */
  readonly goalFrom?: "harness" | "chips" | undefined;
  readonly questions: readonly Question[];
  /** The policy in force for this run's harness in this space, when one has been set. */
  readonly policy?: RunPolicy | undefined;
}

/** One change to the room's project (ADR 0222), from its `project.changed`. */
export interface ProjectChange {
  /** The commit it left `main` at, which names it. */
  readonly commit: string;
  readonly before: string | null;
  /** Who made it: an agent, or a person (an Undo, or a push from their clone). */
  readonly by: string;
  readonly byKind: "person" | "agent";
  readonly at: string;
  readonly seq: number;
  /** The first line of its newest commit's message. */
  readonly message: string;
  readonly files: readonly {
    readonly path: string;
    readonly added: number | null;
    readonly removed: number | null;
  }[];
  /** How many more files it changed than `files` names. */
  readonly moreFiles: number;
  /** The change it takes back, when it is an Undo. */
  readonly undoes?: string | undefined;
  /** The Undo that took it back, while it stays taken back. */
  readonly undoneBy?: string | undefined;
  /** The reply that carries it, by line id. */
  readonly reply?: string | undefined;
}

/** The room's project as its changes show it (ADR 0222). */
export interface RoomProject {
  /** How many files the project has now. */
  readonly files: number;
  /** Every change, newest first. */
  readonly changes: readonly ProjectChange[];
}

export interface Line {
  readonly id: string;
  readonly seq: number;
  /**
   * `status` is what a failed run left behind; `summary` what a finished one did; `checkpoint`
   * a milestone the harness reached, FYI. `route` and `task` are the two views of a lane: the
   * route card in the lead's chat, the task card in the specialist's — each anchored where the
   * routing happened, drawn from the `Lane` its `laneId` names rather than from the line's text.
   */
  readonly kind: "text" | "system" | "summary" | "status" | "checkpoint" | "route" | "task";
  readonly authorId: string;
  readonly authorKind: "person" | "harness" | "system";
  readonly text: string;
  readonly ts: string;
  /** The run a summary or a status line closes, for the receipt beneath it. */
  readonly runId?: string | undefined;
  /**
   * The change to the room's project this line shows (ADR 0222): the one a reply carries, drawn
   * under it as "2 files changed"; or, on a `system` line, the change nothing carried, or an Undo.
   */
  readonly change?: string | undefined;
  /** The explicit run carried by the source event, also on messages before completion. */
  readonly sourceRunId?: string | undefined;
  /**
   * A reply that also closed its run: `run.completed` said the same words, and was folded onto
   * this line rather than drawn twice (`closeOnLastSaid`). A client may draw it as the reply it
   * is rather than as a summary card; the run, and its receipt, are the line's either way.
   */
  readonly folded?: true | undefined;
  /** The lane a `route` or `task` line draws, looked up in the model's lanes. */
  readonly laneId?: string | undefined;
  /** The participants the text's @handles name, as Chips resolved them (M3.3). */
  readonly mentions?: readonly string[] | undefined;
  /**
   * The harnesses a message is for, as Chips decided them (ADR 0081), or, on a line still on its
   * way, as the composer said. Absent on a message from before Chips said so.
   */
  readonly addressedTo?: readonly string[] | undefined;
  /**
   * For every harness in the room, whoever is there (ADR 0081): the author's next message that
   * names nobody goes to every harness there is then, a newcomer included.
   */
  readonly addressedToAll?: true | undefined;
  /**
   * The people a person's message is for (ADR 0204): those its @s named, or those picked in the
   * field's list, as Chips decided them, or, on a line still on its way, as the field said.
   */
  readonly addressedPeople?: readonly string[] | undefined;
  /**
   * An agent's message Chips held from the agents it named (ADR 0097): shown, and for nobody,
   * until a person acts, when the newest held for each agent is handed over (`handed`).
   */
  readonly held?: true | undefined;
  /** A held message handed to an agent it was for, once a person acted (ADR 0097). */
  readonly handed?: true | undefined;
  /**
   * The agents an agent's message was for that did not pick it up, once Chips handed it on to the
   * lead or back to who said it (ADR 0291): the room stops saying it waits on them.
   */
  readonly passedOn?: readonly string[] | undefined;
  /**
   * On the quiet line of the agent Chips handed a message to (ADR 0291): the agent that had not
   * picked it up, and whether the one it went to had said it (`back`) or took it as the lead.
   */
  readonly unpicked?: { readonly by: string; readonly back: boolean } | undefined;
  /**
   * An agent's check-in on its heartbeat (ADR 0143): it wrote on its own, with nobody asking, and
   * the room marks it so beside its name.
   */
  readonly heartbeat?: true | undefined;
  /**
   * A system line whose words are the whole sentence, said from where its reader stands ("You
   * added Priya", "Arjun added you"): drawn as it is, not after its author's name (JR-5).
   */
  readonly whole?: true | undefined;
  /**
   * An agent's context compacted (ADR 0146): the quiet line Chips wrote in its room, from how many
   * tokens to how many, of what window, and whether a person asked. The room may open the agent's
   * page from it.
   */
  readonly compacted?:
    | {
        readonly from: number;
        readonly to: number;
        readonly window: number;
        readonly by: "asked" | "itself";
      }
    | undefined;
  /**
   * The agents whose turns, working in the room, heard this message said for somebody else
   * (ADR 0106), in the order they did: the room says so beneath it.
   */
  readonly heardBy?: readonly string[] | undefined;
  /** A person pausing the agents here, or letting them carry on (ADR 0097): a system line. */
  readonly exchange?: "paused" | "going" | undefined;
  /** The idempotency key the event carried, so a receipt for it can be matched. */
  readonly key?: string | undefined;
  /**
   * A person asking for a copy of an agent in this room (ADR 0087, Fork): the agent copied. The
   * line is drawn as the ask's wait, the copy joining, or the harness not making it (`forkState`),
   * and `text` is its words for a client that draws none of that.
   */
  readonly fork?: { readonly agentId: string } | undefined;
  /**
   * A person asking a harness for a new agent in this room (ADR 0108): the harness, and what the
   * agent is to be called. Drawn as the ask's wait, the agent joining, or the harness not making
   * it (`askState`); `text` is its words for a client that draws none of that.
   */
  readonly newAgent?: { readonly harnessId: string; readonly name: string } | undefined;
  /**
   * The visit this message named, when the sender pinned one (ADR 0040). It is what lets a
   * person's own message be labelled: a line's run says which terminal answered, and until now
   * nothing said which one was asked.
   */
  readonly sessionRef?: string | undefined;
  /** For a steer: how it was meant. */
  readonly mode?: SteerMode | undefined;
  /**
   * The harness that relayed this line on somebody's behalf: they asked for it at that harness
   * — a terminal, a chat it already had — rather than here. Shown as their message, marked with
   * where they said it, because a room holding only the answers reads as a monologue.
   */
  readonly via?: string | undefined;
  /** True for an optimistic line the server has not yet confirmed. */
  readonly pending?: boolean;
  /** Why the server refused this line, when it did. It stays on screen, so the person knows. */
  readonly failed?: string;
  /** The files the message carried, as the server described them. */
  readonly attachments?: readonly Attachment[] | undefined;
  /** Reactions on this line, in the order they were given (M3.4). */
  readonly reactions?: readonly Reaction[] | undefined;
  /** Notes about what went wrong with this line (M3.4). The harness hears each. */
  readonly corrections?: readonly Correction[] | undefined;
  /** When its author last changed the words (M5.4). */
  readonly editedAt?: string | undefined;
  /** Taken back (M5.4): drawn as a tombstone, its words gone from here though the log keeps them. */
  readonly deleted?: boolean | undefined;
  /**
   * The line this message replies to (ADR 0219), by its id: its `reply_to`. A reply stays in the
   * room, where its card quotes that line; `threadId` and `replyCount` below are a thread's, a
   * room of its own grown from a line, which is not this.
   */
  readonly replyTo?: string | undefined;
  /** The lines replying to this one (ADR 0219), oldest first, which the room says beneath it. */
  readonly repliedBy?: readonly string[] | undefined;
  /** The thread grown from this line, when one has been (M5.4). */
  readonly threadId?: string | undefined;
  /** How many lines that thread holds, and when the last was said. */
  readonly replyCount?: number | undefined;
  readonly lastReplyAt?: string | undefined;
}

/**
 * One visit to a space: a terminal opened, worked, and closed again. The space outlives it,
 * which is the whole point of the distinction (ADR 0024) — a worktree is a place, and a session
 * is somebody being there. A closed visit is kept, not forgotten, because it is the one a
 * message from Chips can start again.
 */
export interface Session {
  readonly sessionRef: string;
  readonly spaceId: string;
  readonly harnessId: string;
  /** Where it is running, in the harness's own words: "mbp · ~/Work/Chips". */
  readonly where?: string | undefined;
  /**
   * What the harness calls this visit (ADR 0040) — whatever it titles its own transcript.
   * Absent for its first turn or two, and for a harness that names none.
   */
  readonly title?: string | undefined;
  readonly startedAt: string;
  readonly endedAt?: string | undefined;
  /** Why it ended, in the harness's own word: `clear`, `logout`, `other`. */
  readonly endedReason?: string | undefined;
  /** The harness's own transcript of the visit, when it named one. */
  readonly transcriptRef?: string | undefined;
  /** Nobody has said it ended. */
  readonly live: boolean;
  /** The last run it started, so the strip can say what it is doing rather than that it exists. */
  readonly lastRunId?: string | undefined;
  /** When it was last heard from at all, so "the most recent" means something. */
  readonly lastSeenAt: string;
}

export type SpaceRole = "owner" | "member" | "guest";

/** An agent that left a room, and why (ADR 0087): as the room's `membership.removed` said. */
export interface AgentLeft {
  readonly agentId: string;
  /**
   * `moved`, `archived`, `agent_archived`, `deleted`, `removed` or `agent_deleted`:
   * `agent.released`'s reasons.
   */
  readonly reason: string;
  /** For a move: the room it went to. */
  readonly movedTo?: string | undefined;
  /** Who took it out: a person, its harness, or Chips (`system`). */
  readonly by?: string | undefined;
  readonly seq: number;
}

/** How far a room's job had got when Chips paused its agents at the room's ceiling (ADR 0118). */
export interface PausedSpend {
  readonly spentUsd: number;
  readonly ceilingUsd: number;
  /** When Chips held the agents, so the banner can tell a job that had already finished. */
  readonly at?: string | undefined;
}

export interface Space {
  readonly id: string;
  readonly title?: string | undefined;
  readonly kind: string;
  readonly members: readonly string[];
  /** Each member's standing, as the membership events said it. */
  readonly roles: Readonly<Record<string, SpaceRole>>;
  /**
   * Open, or closed: off the list with its history kept, until somebody reopens it (M3.3). The
   * apps call closed *archived* (ADR 0066).
   */
  readonly state: "open" | "closed";
  /** Who sent `space.created`: a person, or the harness that then may retitle it. */
  readonly openedBy?: string | undefined;
  /**
   * Opened by a harness under a key of its own (ADR 0024), so that harness can open it again:
   * such a room may be erased even when it is direct, and comes back empty the next time the
   * harness speaks for the key (ADR 0067).
   */
  readonly keyed?: boolean | undefined;
  /**
   * The harness a person asked for this room when they opened it (`space.created.asked_of`), which
   * claims it under a key of its own. Until somebody names the room it goes by `askedName`.
   */
  readonly askedOf?: string | undefined;
  /**
   * The harness's home: the room its lead speaks in, which is always there (ADR 0069). Nobody
   * archives or erases it, so neither is offered.
   */
  readonly home?: boolean | undefined;
  /**
   * The agent last chosen to lead the room (ADR 0104): it hands out the work, and Chips hands it
   * what was nobody's turn once the room goes still. Read it with `roomLeadOf`, which leaves out one
   * that has left.
   */
  readonly lead?: string | undefined;
  /**
   * What the room allows a job, in US dollars, as a person there set it (ADR 0117), or `"none"`
   * for No cap, where Chips holds no job for what it spends (ADR 0292). None follows the default;
   * `spendCeilingOf` reads it with the default in.
   */
  readonly spendCeiling?: number | typeof NO_SPEND_CEILING | undefined;
  /**
   * Whether a person in the room locked its changes (ADR 0156): while they are, nobody renames,
   * archives or deletes it. Absent for a room that never was, or was let go again.
   */
  readonly locked?: boolean | undefined;
  /**
   * The agents that left this room (ADR 0087), the last time each did, and why: moved, released
   * by an archive, archived in its harness, taken out. One that came back is not here.
   */
  readonly left?: readonly AgentLeft[] | undefined;
  /** The copies that joined this room for an ask (ADR 0087, Fork): the ask's line id to the copy. */
  readonly forked?: Readonly<Record<string, string>> | undefined;
  /** The new agents that joined this room for an ask (ADR 0108): the ask's line id to the agent. */
  readonly made?: Readonly<Record<string, string>> | undefined;
  /**
   * The first names held for the harnesses waiting in a room asked of them from the + (ADR 0150),
   * by harness: what the room calls each until its agent takes its place under that name. Read a
   * name in the room through `roomDirectory`.
   */
  readonly held?: Readonly<Record<string, string>> | undefined;
  /**
   * The newest turn each agent passed here with `NO_REPLY` (ADR 0105), by the agent's id: the
   * pass's seq. Nothing is drawn for it; it tells the room the agent heard the message it had
   * nothing to say to, so the room stops saying it hasn't picked it up (ADR 0083).
   */
  readonly passed?: Readonly<Record<string, number>> | undefined;
  readonly lastActivityAt?: string | undefined;
  readonly lastEventSeq: number;
  /**
   * The newest thing a person did here that starts the referee's count again (ADR 0097): wrote,
   * answered, decided, added somebody, let the agents carry on. 0 when nobody has.
   */
  readonly actedSeq?: number | undefined;
  /** The newest pause of the agents here, and who paused them (ADR 0097); 0 when never. */
  readonly pausedSeq?: number | undefined;
  readonly pausedBy?: string | undefined;
  /**
   * When the newest pause was Chips's, at the room's spend ceiling (ADR 0118): what the job had
   * spent, against what the room allowed it. The banner says it.
   */
  readonly pausedSpend?: PausedSpend | undefined;
  readonly lines: readonly Line[];
  /** The run on screen: the most recent one in this space. */
  readonly run?: Run | undefined;
  /** Every run this space has had, oldest first, for the receipts under their summaries. */
  readonly runs: readonly Run[];
  /** The visits to this space: the live ones first, then the most recently heard from. */
  readonly sessions: readonly Session[];
  /** For a thread (M5.4): the space it grew in — whose members are its — and the line it grew from. */
  readonly parentSpaceId?: string | undefined;
  readonly rootLineId?: string | undefined;
  /** The lines pinned to the top of this space, in the order they were pinned (M5.4). */
  readonly pins: readonly Pin[];
  /**
   * The lines the reader deleted for themselves (ADR 0167), by id, as the log says. The fold keeps
   * the lines; the store's snapshot leaves them out of `lines` and `pins` (`withHidden`).
   */
  readonly hidden?: ReadonlySet<string> | undefined;
  /**
   * True for a room the reader is not in and only knows through an ask that named them
   * (ADR 0042). The sidebar leaves it out — it holds one card and nothing else — and the card
   * says where it is instead.
   */
  readonly glimpse: boolean;
  /** The room's project (ADR 0222), once it has had a change. */
  readonly project?: RoomProject | undefined;
  /**
   * The agents let work here without asking (ADR 0281), one yes each, as given; one for an hour
   * stays after its hour, so whether it still holds is `lettingWork`'s to say against a clock.
   */
  readonly letWork?: readonly LetWork[] | undefined;
}

/**
 * Where a message typed in this space would go, so the composer can say so before it is sent
 * rather than after it has gone nowhere (ADR 0024, decision 6).
 *
 *   `live`     · a terminal is open on it, and the message reaches it where it is
 *   `resume`   · nobody is there, and it starts that visit again where it left off
 *   `gone`     · the visit they pinned is not one this space has any more (ADR 0040)
 *   `nowhere`  · a harness that works by sessions has none here, so there is nothing to say to
 *   `chat`     · nobody here works by sessions; it is a message in a room, and that is all
 */
export type MessageRoute =
  | { readonly how: "live" | "resume"; readonly session: Session; readonly pinned: boolean }
  | { readonly how: "gone"; readonly sessionRef: string }
  | { readonly how: "nowhere"; readonly harnessId: string }
  | { readonly how: "chat" };

/**
 * One harness as the fleet sees it, rolled up across every space it works in (ADR 0024): what
 * its latest run is doing, how full that run's context is, how many terminals are open on it
 * and how much of what is waiting on a person is its. A harness with a session open and nothing running belongs
 * here too — "live and idle" is a state a person wants to see — so the run is optional.
 */
export interface FleetHarness {
  readonly harnessId: string;
  /** How many of its visits are open right now, across all its spaces. */
  readonly liveSessions: number;
  /** How many visits it has made in all, open or closed: whether it works by sessions at all. */
  readonly sessionCount: number;
  /** How many spaces it works in. */
  readonly spaceCount: number;
  /** How many of the things waiting on a person are this harness's. */
  readonly needsYou: number;
  /** The lead its latest run answers to, when that run is a lane: `Working for Scout`. */
  readonly workingFor?: string | undefined;
  /** Its latest run, when it has had one at all. */
  readonly spaceId?: string | undefined;
  readonly runId?: string | undefined;
  readonly status?: RunState | undefined;
  readonly paused: boolean;
  /** Its harness said a Pause holds that run (ADR 0293): Pause is offered only then. */
  readonly pausable?: boolean | undefined;
  readonly statusVerb?: string | undefined;
  readonly contextPercent?: number | undefined;
}

export type Tier = "decide" | "review" | "fyi";

/**
 * One thing for a person's attention, across every space, in one of the three tiers
 * (blueprint, Supervision): an approval or a question with no default is Decide now; a finished
 * run or a question the harness will answer for itself is Review today; a checkpoint is FYI. The
 * tier is a property of the kind, never a setting.
 */
export interface NeedsYouItem {
  readonly kind: "approval" | "question" | "summary" | "failure" | "checkpoint";
  readonly tier: Tier;
  readonly id: string;
  readonly spaceId: string;
  readonly runId?: string | undefined;
  readonly harnessId: string;
  readonly title: string;
  /** The event's place in the log, so a screen can tell an unread one from a read one. */
  readonly seq: number;
  readonly expiresAt?: string | undefined;
  /**
   * The chain that led here, when this is a lane's work: `Arjun → Scout → Ledger`. A card in the
   * queue then says whose lane it is, so a decision on a specialist deep in a trail is not
   * mistaken for one on a harness a person routed to themselves.
   */
  readonly trail?: readonly LaneHop[] | undefined;
  /**
   * What the lane calls the harness at the end of that chain, when it has a name for it: a
   * Space's, a subagent's type (`Lane.label`). A lane between two spaces of one harness otherwise
   * ends its chain with the harness it started from.
   */
  readonly laneLabel?: string | undefined;
  /** True when the ask is in a room the reader is not in, and named them anyway (ADR 0042). */
  readonly outside?: true | undefined;
}

/** A harness's standing across the workspace: its level, rules, budget and what it has spent. */
export interface HarnessPolicyModel {
  readonly harnessId: string;
  readonly autonomy: 0 | 1 | 2 | 3;
  readonly maxAutonomy: 0 | 1 | 2 | 3;
  readonly rules: readonly Rule[];
  readonly budgetUsd?: number | undefined;
  readonly spentUsd: number;
  /** The dial as set in particular rooms, over the harness's level everywhere. */
  readonly bySpace: Readonly<
    Record<string, { readonly autonomy: 0 | 1 | 2 | 3; readonly rules: readonly Rule[] }>
  >;
}

/**
 * A person in the workspace, with their standing there (ADR 0034): owner, admin, member or
 * guest. Folded from `person.joined` and `role.changed`, which everyone in the workspace is sent.
 */
export interface PersonModel {
  readonly participantId: string;
  /** Their name as they joined; the directory has the current one. */
  readonly displayName: string;
  readonly role: WorkspaceRole;
  readonly joinedAt: string;
  /** Who issued the invite they came by, when they came by one. */
  readonly invitedBy?: string | undefined;
  readonly inviteId?: string | undefined;
}

/** One human decision, or one of Chips' own, as the audit view lists them: who, what, when. */
export interface AuditEntry {
  readonly seq: number;
  readonly ts: string;
  readonly kind:
    | "approval"
    | "question"
    | "policy"
    | "run"
    | "attachment"
    | "feedback"
    | "people"
    | "message";
  readonly who: string;
  readonly what: string;
  readonly spaceId?: string | undefined;
  readonly runId?: string | undefined;
  readonly reason?: string | undefined;
}

/** What a harness has sent so far, for the connection checklist on its profile (M1.6). */
export interface HarnessConnection {
  readonly harnessId: string;
  /** The event types it has sent, in the order first seen. */
  readonly seen: readonly string[];
  readonly lastSeenAt?: string | undefined;
}

export interface WorkspaceModel {
  readonly spaces: readonly Space[];
  readonly fleet: readonly FleetHarness[];
  readonly needsYou: readonly NeedsYouItem[];
  /** Every lane the reader can see, from either of its two sides. */
  readonly lanes: readonly Lane[];
  readonly harnesses: Readonly<Record<string, HarnessPolicyModel>>;
  /** By harness id: what each has sent, so a profile can say which rows have lit. */
  readonly connections: Readonly<Record<string, HarnessConnection>>;
  /** Newest first. A read of the log, never a separate record. */
  readonly audit: readonly AuditEntry[];
  /** Everyone in the workspace with their role, by id (ADR 0034). */
  readonly people: Readonly<Record<string, PersonModel>>;
  /**
   * What may be attached here (ADR 0047): the most a photo, a video or a file may be, or null
   * where the server's own ceiling applies. A client refuses a file against these before it
   * uploads a byte, with the sentence the server would have used.
   */
  readonly attachmentCaps: AttachmentCaps;
  /**
   * When Chips steps in on agents talking to each other (ADR 0187): the stop, the hold and the
   * circles switch the workspace set, or Chips's own (16, 48, on) until an owner or admin does.
   */
  readonly exchangeLimits: ExchangeLimits;
  /**
   * The server's relay as an owner last turned it (ADR 0211, Phase 4), from `relay.set`. Absent
   * until anybody has, and then it is as the server started it: on for a relay it was set up with,
   * off for Chips's own (ADR 0245). A device knows which from the relay it learned, or didn't, from
   * the server. A device that cannot connect says why from it.
   */
  readonly relay?: RelayState | undefined;
  /**
   * The rooms somebody else took the reader out of, by room, until they are added back (JR-6):
   * the room's place says by whom, rather than the room vanishing with no word.
   */
  readonly takenOut: Readonly<Record<string, TakenOut>>;
}

/** A room somebody took the reader out of: which, by whom, and when (JR-6). */
export interface TakenOut {
  readonly spaceId: string;
  /** The room's title as the reader knew it, or nothing for a room they never saw named. */
  readonly title?: string | undefined;
  readonly byId: string;
  /** Who took them out, as they went by then. */
  readonly byName: string;
  readonly at: string;
}

/** The relay as an owner turned it (ADR 0211, Phase 4): on or off, by whom, and when. */
export interface RelayState {
  readonly on: boolean;
  readonly by: string;
  readonly at: string;
}
