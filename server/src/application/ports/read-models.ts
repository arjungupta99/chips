/**
 * The read models a use case needs, as a port.
 *
 * Read models are per screen and never assembled with joins at request time (technical-plan
 * 6.1), so this interface grows one method per thing a screen or a hook asks for, rather than
 * exposing a query builder. Kysely implements it; a use case never sees a table.
 */

import type {
  Attachment,
  AttachmentCaps,
  ContextEvent,
  ExchangeStretch,
  PolicyRule,
  PostedFile,
  SpaceIcon,
} from "@chipschat/protocol";
import type { PriceTable, TrailEntry, WorkspaceRole } from "../../domain/index.js";

/** How the agents' talk in a room stands (ADR 0097), and where the last person's act was. */
/**
 * What a room's job has spent (ADR 0117): what its runs reported costing since it began, where it
 * began, and how many of its runs reported no cost.
 */
export interface JobSpendView {
  readonly spent_usd: number;
  readonly since_seq: number;
  readonly uncounted_runs: number;
}

export interface ExchangeView extends ExchangeStretch {
  /** The newest thing a person did in the room that starts the count again, if anything. */
  readonly personSeq: number | undefined;
}

/** A message Chips held from the agents it named (ADR 0097), with what decides whom it was for. */
export interface HeldMessageView {
  readonly event_id: string;
  readonly seq: number;
  readonly author_id: string;
  readonly author_kind: string;
  readonly text: string;
  readonly mentions: readonly string[];
  readonly to?: readonly string[] | "all";
}

/** An open room with a lead still in it (ADR 0104): where the sweep looks for a room gone still. */
export interface LedRoomView {
  readonly workspace_id: string;
  readonly space_id: string;
  readonly lead_id: string;
}

/** A message said in a room, as the lead's rules read it (ADR 0104). */
export interface PostView {
  readonly event_id: string;
  readonly seq: number;
  readonly ts: string;
  readonly author_id: string;
  readonly author_kind: string;
  /** The agents it was for (ADR 0081); none for an agent's words to the people. */
  readonly addressed_to: readonly string[];
  readonly addressed_to_all: boolean;
  /** Whether the referee held it (ADR 0097). */
  readonly held: boolean;
  /** Everyone its @handles named, people included. */
  readonly mentions: readonly string[];
}

/**
 * An agent's turn in a room (ADR 0104): a run by it there. For one still going, when anything was
 * last heard from it and the last step it said it was on.
 */
export interface TurnView {
  readonly run_id: string;
  readonly agent_id: string;
  readonly going: boolean;
  readonly started_at: string;
  readonly ended_at: string | null;
  readonly last_heard_at?: string | undefined;
  readonly step?: string | undefined;
}

/** Somebody put in a room (ADR 0104): when, where in the log, and who did it. */
export interface JoinView {
  readonly participant_id: string;
  readonly seq: number;
  readonly ts: string;
  readonly by: string;
  readonly by_kind: string;
}

export interface ApprovalView {
  readonly approval_id: string;
  readonly run_id: string | null;
  readonly space_id: string | null;
  /** The action as the harness proposed it: its kind and flags, for a rule made from a decision. */
  readonly action: Readonly<Record<string, unknown>>;
  readonly state: "pending" | "resolved";
  readonly decision: string | null;
  readonly scope: string | null;
  readonly reason: string | null;
  readonly resolved_by: string | null;
  readonly resolved_at: string | null;
  readonly updated_input: unknown;
  readonly expires_at: string | null;
  readonly fallback: string;
  readonly executed_outcome: string | null;
  /** The people policy named to answer it, resolved at ingest (M3.3); empty for an older ask. */
  readonly approvers: readonly string[];
  /** The risk classes the ask declared (M5.5, Gate 5): what `matters` reads beside the action. */
  readonly risk?: readonly string[] | undefined;
}

export interface RunView {
  readonly run_id: string;
  readonly space_id: string | null;
  readonly harness_id: string;
  /** The agent the run is by (ADR 0087); absent or `null` for a run from before agents. */
  readonly agent_id?: string | null | undefined;
  readonly goal: string;
  readonly state: string;
  readonly status_verb: string | null;
  readonly summary: string | null;
  readonly cost_usd: number | null;
  readonly context_used: number | null;
  readonly context_limit: number | null;
  readonly started_at: string;
  readonly ended_at: string | null;
}

/** A harness's policy as the engine reads it: for one space, or everywhere (ADR 0019). */
export interface HarnessPolicyView {
  readonly harness_id: string;
  /** The space this row is for, or `*`. */
  readonly space_id: string;
  readonly autonomy: number;
  readonly rules: readonly PolicyRule[];
  /**
   * The harness's rules everywhere, when this row is a space's own: the engine reads them after
   * the space's (ADR 0239), so a rule kept for every space reaches a space with a row of its own.
   */
  readonly everywhere_rules?: readonly PolicyRule[] | undefined;
  readonly budget_usd: number | null;
  readonly spent_usd: number;
  readonly updated_seq: number;
}

export interface WorkspacePolicyView {
  readonly max_autonomy: number;
  readonly rules: readonly PolicyRule[];
}

export interface QuestionView {
  readonly ask_id: string;
  readonly run_id: string | null;
  readonly space_id: string | null;
  readonly state: "pending" | "answered";
  readonly answered_by: string | null;
  readonly timeout_at: string | null;
  readonly on_no_answer: string;
  /** The questions as asked, for the default to take on a timeout. */
  readonly questions: readonly {
    readonly question_id: string;
    readonly default_value?: string | undefined;
  }[];
}

/** An approval still pending that names somebody among who may answer it (ADR 0160). */
export interface AwaitingApproval {
  readonly approval_id: string;
  readonly run_id: string | null;
  readonly space_id: string | null;
  readonly approvers: readonly string[];
}

/** An approval still pending past its expiry, for the sweep to resolve. */
export interface ExpiredApproval {
  readonly workspace_id: string;
  readonly approval_id: string;
  readonly run_id: string | null;
  readonly space_id: string | null;
  readonly fallback: string;
  readonly expires_at: string;
  /** Who could have answered it: the expiry names them too, so they hear it (ADR 0042). */
  readonly approvers: readonly string[];
}

/** A question still pending past its timeout, for the sweep to answer. */
export interface TimedOutQuestion extends QuestionView {
  readonly workspace_id: string;
}

/** A lane as the router and the screens read it: one object, both sides of it. */
export interface LaneView {
  readonly lane_id: string;
  /** The specialist's run, whose messages, approvals and usage are the lane's. */
  readonly run_id: string | null;
  readonly lead_id: string;
  readonly specialist_id: string;
  readonly on_behalf_of: string;
  /** The lead's run this lane is a hop of, for the cancel cascade. */
  readonly lead_run_id: string | null;
  readonly home_space_id: string | null;
  readonly linked_space_ids: readonly string[];
  readonly origin_message_id: string | null;
  readonly goal: string;
  readonly state: string;
  readonly delivery: string;
  readonly depth: number;
  readonly trail: readonly TrailEntry[];
  readonly summary: string | null;
  readonly cost_usd: number | null;
}

/** Somebody in a space: who, what, and their standing there (M3.3). */
export interface MemberView {
  readonly participant_id: string;
  readonly kind: "person" | "harness" | "agent";
  /** For an agent (ADR 0087): the harness it speaks through. Absent or `null` for anybody else. */
  readonly harness_id?: string | null | undefined;
  readonly display_name: string;
  readonly role: "owner" | "member" | "guest";
  /** A harness's owner, and an agent's harness's. */
  readonly owner_id: string | null;
  /** A person's standing in the workspace (ADR 0034), for `role:<name>` refs; `null` for a harness. */
  readonly workspace_role: WorkspaceRole | null;
  /**
   * A harness removed from the workspace (ADR 0078): still a member, so the room's history names
   * it, and nobody a mention reaches.
   */
  readonly removed?: boolean | undefined;
  /**
   * For a harness waiting in a room asked of it from the + (ADR 0150): the first name held for its
   * agent there, which the room calls it by until the agent takes its place. Absent otherwise.
   */
  readonly held_name?: string | undefined;
}

/** A first name a room holds for a harness's agent-to-be (ADR 0150), while the room is open. */
export interface HeldName {
  readonly space_id: string;
  readonly harness_id: string;
  readonly name: string;
  /** Whose naming it is: the person who added the harness to the room. */
  readonly by: string | null;
}

/** A space as the door and a harness's own door read it (M3.3). */
export interface SpaceView {
  readonly space_id: string;
  readonly kind: string;
  readonly title: string | null;
  readonly state: "open" | "closed";
  /** Who sent `space.created`: the one harness that may retitle or close it. */
  readonly opened_by: string | null;
  /** Whether a person or a harness last set the title, or nobody has. */
  readonly title_by: "person" | "harness" | null;
  readonly external_key: string | null;
  /** For a thread (M5.4): the space it grew in, whose members are its members. */
  readonly parent_space_id: string | null;
  /** For a thread: the message in the parent it grew from. */
  readonly root_message_id: string | null;
  /** The harness a person asked into it, to claim under a key of its own; `null` for most rooms. */
  readonly asked_of: string | null;
  /** The other harnesses a person asked from the + (ADR 0087's addendum of 30 September). */
  readonly also_asked_of: readonly string[];
  /** Whether a person or a harness last archived or unarchived it; read where it is needed. */
  readonly state_by?: string | null | undefined;
  /** When something last happened in it; read where it is needed. */
  readonly last_activity_at?: string | null | undefined;
  /** The harness's home, the room its lead speaks in: nobody archives or erases it (ADR 0069). */
  readonly home: boolean;
  /**
   * The agent set to lead it (ADR 0104), whether or not it is still there; read where it is
   * needed. `leadOf` says who leads it now.
   */
  readonly lead_id?: string | null | undefined;
  /**
   * Whether a person there locked its changes (ADR 0156): no person renames, archives or deletes
   * it while they are. Read where it is needed.
   */
  readonly locked?: boolean | undefined;
}

/**
 * A room a person opened and asked a harness into, which the harness has not claimed yet. What
 * an adapter that was down reads when it comes back, so no room is left waiting for it.
 */
export interface AskedSpaceView {
  readonly space_id: string;
  /** The person who asked. */
  readonly asked_by: string;
  readonly title: string | null;
  readonly state: "open" | "closed";
  readonly asked_at: string;
}

/**
 * A room a harness opened by key, as its own door lists it: which thing of the harness's it is
 * for, and whether it is on the list. What an adapter reads to close the room of something it
 * has put away, and to open it again the day that comes back.
 */
export interface OpenedSpaceView {
  readonly space_id: string;
  /** The key as the harness gave it, without the namespace it is stored under. */
  readonly key: string;
  /** The key names a place other harnesses may work in too (ADR 0033). */
  readonly shared: boolean;
  readonly title: string | null;
  readonly state: "open" | "closed";
  /**
   * Who last archived or unarchived it, when anybody has (ADR 0066). An adapter that follows its
   * own things carries a person's move back into the harness rather than undoing it.
   */
  readonly moved_by?: "person" | "harness";
}

/** A message as the door and delivery need it (M3.4): whose it is, and where. */
export interface MessageView {
  /** The wire's id: `msg_` and the ULID of the event that carried it. */
  readonly message_id: string;
  /** The event's own id, which is the row's. */
  readonly event_id: string;
  /** Where the event is in the log. */
  readonly seq: number | null;
  readonly space_id: string | null;
  readonly run_id: string | null;
  /** `text`, `summary`, `approval` and the rest of the eleven kinds. */
  readonly type: string;
  readonly author_kind: "person" | "harness" | "agent" | "system";
  readonly author_id: string;
  /** When it was said: what a reply's quote says of it, deleted or not (ADR 0219). */
  readonly created_at: string;
  /** When its author last changed its words, or never (M5.4). */
  readonly edited_at: string | null;
  /** When it was taken back, or never (M5.4). */
  readonly deleted_at: string | null;
  /** The thread grown from it, when one has been (M5.4). */
  readonly thread_id: string | null;
}

/** What a search is asked for (M5.4): words, how many hits, and where to carry on from. */
export interface SearchQuery {
  /** The words, as typed. Empty finds nothing. */
  readonly text: string;
  readonly limit: number;
  /** The `next_cursor` of the page before, to carry on. */
  readonly cursor?: string | undefined;
  /** One space to look in, rather than all the caller's. */
  readonly spaceId?: string | undefined;
}

/**
 * One thing found: a message, by its words or its voice notes' words, or a receipt — a step of a
 * run, by its title and summary. The snippet has the words that matched between `SNIPPET_OPEN`
 * and `SNIPPET_CLOSE`.
 */
export interface SearchHit {
  readonly kind: "message" | "receipt";
  readonly space_id: string;
  /** When it was said, or when the step was last reported. */
  readonly at: string;
  readonly snippet: string;
  /**
   * `transcript` when the snippet quotes what was heard in a message's voice note (ADR 0054)
   * rather than what was typed: machine-heard words, which a client should say are.
   */
  readonly snippet_from?: "transcript" | undefined;
  /** For a message: the wire's id, and who said it. */
  readonly message_id?: string | undefined;
  readonly author_id?: string | undefined;
  /** For a receipt: the run and the step. */
  readonly run_id?: string | undefined;
  readonly step_id?: string | undefined;
}

export interface SearchPage {
  readonly hits: readonly SearchHit[];
  readonly next_cursor: string | null;
}

/** The marks around a matched word in a snippet: private-use codepoints, never in real text. */
export const SNIPPET_OPEN = "\u{E000}";
export const SNIPPET_CLOSE = "\u{E001}";

/** A person, harness or agent, for naming the ids in the event stream. */
export interface ParticipantView {
  readonly id: string;
  readonly kind: "person" | "harness" | "agent";
  /** For an agent (ADR 0087): its harness, the harness's key for it, whether it leads, its state. */
  readonly harness_id?: string;
  readonly key?: string;
  readonly lead?: boolean;
  readonly state?: "active" | "archived";
  /** For a free agent: the room an archive took it out of (ADR 0087, rule 4). */
  readonly released_from?: string | null;
  /** For an agent: the room it was last taken out of. */
  readonly last_space_id?: string | null;
  /** For an agent: the open room it is in (ADR 0087, rule 1), or `null` while it is free. */
  readonly room?: string | null;
  /** For an agent: how many of its words wait for its next room (rule 6), *1 waiting*. */
  readonly held?: number;
  /** For a fork's copy (ADR 0087, Fork): the agent it is a copy of. */
  readonly forked_from?: string | null;
  /**
   * For an agent, the face a person chose for it (ADR 0089); for a person, the face they chose for
   * themselves (ADR 0139). `null` while it wears initials.
   */
  readonly face?: SpaceIcon | null;
  /**
   * For an agent (ADR 0199): whether a person locked its changes, so that no person renames,
   * archives or deletes it.
   */
  readonly locked?: boolean;
  readonly display_name: string;
  readonly owner_id: string | null;
  /** A person's standing in the workspace (ADR 0034); `null` for a harness. */
  readonly role: WorkspaceRole | null;
  /**
   * For a guest (ADR 0034): the one open room they are in, or `null` while they are in none, an
   * archived one aside (JR-24). A guest is in one open room at most, so a list of who may be added
   * leaves out a guest who has one. Absent for everybody else.
   */
  readonly guest_of?: string | null;
  /**
   * What a harness declared it can do, as registered (ADR 0046): tools, and the capabilities a
   * client reads before drawing a control. `null` for a person, and for a harness that declared
   * nothing.
   */
  readonly capabilities: readonly string[] | null;
  /**
   * When a person removed the harness from the workspace (ADR 0078), or `null` while it is here.
   * A removed harness is still named, so what it said keeps its name; the clients leave it out of
   * their lists.
   */
  readonly removed_at: string | null;
  /**
   * When one of a harness's tokens was last used, a withdrawn one's too, or `null` if none ever
   * was; `null` for a person. A token is stamped when it authenticates, a socket's upgrade
   * included, at most once a minute, and a socket that stays open does not stamp it again. So
   * this says whether a harness has ever connected, which a message sent before then is not
   * heard for (the OpenClaw test, finding 18), and never whether it is connected now.
   */
  readonly last_seen_at: string | null;
}

/** One of a harness's agents (ADR 0087), with the rooms it is in. */
export interface AgentView {
  readonly agent_id: string;
  readonly harness_id: string;
  readonly key: string;
  readonly name: string;
  readonly lead: boolean;
  readonly state: "active" | "archived";
  /** The rooms it is in, oldest membership first. */
  readonly spaces: readonly string[];
  /** The open room it is in (ADR 0087, rule 1), or `null` while it is free. */
  readonly room: string | null;
  /** While free: the room an archive took it out of, which an unarchive brings it back to. */
  readonly released_from: string | null;
  /** How many of its words are held, said while it was in no room (rule 6). */
  readonly held: number;
  /** The agent it is a copy of, when it is a fork's copy (ADR 0087, Fork). */
  readonly forked_from: string | null;
  /**
   * The person who last named it (ADR 0091), or `null` while its name is its harness's or Chips's.
   * While set, its harness does not rename it.
   */
  readonly name_by: string | null;
}

/**
 * A person's ask for a copy of an agent in a room (ADR 0087, Fork): the `agent.fork` event, and
 * whether a copy has joined the room for it. The wait is timed from `ts`.
 */
export interface ForkAsk {
  readonly event_id: string;
  readonly seq: number;
  readonly ts: string;
  /** The person who asked. */
  readonly by: string;
  /** True once a copy joined the room for it. */
  readonly answered: boolean;
}

/**
 * A person's ask for a new agent in a room (ADR 0108): the `agent.asked` event, and whether an
 * agent has joined the room for it. The wait is timed from `ts`.
 */
export interface AgentAsk {
  readonly event_id: string;
  readonly ts: string;
  /** The room the agent is for. */
  readonly space_id: string;
  /** The harness asked. */
  readonly harness_id: string;
  /** What the agent is to be called. */
  readonly name: string;
  /** The person who asked. */
  readonly by: string;
  /** True once an agent joined the room for it. */
  readonly answered: boolean;
}

/**
 * A stretch an agent spent in one room (ADR 0087, rule 3.11): from when its place there was first
 * taken — by its harness, before the upgrade to agents — to when it left, or `null` while it is
 * still there. A room archived while it was there ends the stay at the archive. A stay whose place
 * was handed to another agent is that agent's, as what was said in it is (`replacedIn`).
 */
export interface AgentStay {
  readonly space_id: string;
  readonly from_seq: number;
  readonly from_at: string;
  readonly to_seq: number | null;
  readonly to_at: string | null;
  /**
   * The messages of its history in the stay: what it said, what was addressed to it, and what
   * people said to the room before Chips said who a message is for (ADR 0081). A reply and the
   * summary of the same run are one.
   */
  readonly lines: number;
}

/** What an agent said in no room, waiting for its next room (ADR 0087, rule 6). */
export interface HeldView {
  /** The `message.held` it was kept as. */
  readonly event_id: string;
  readonly said_at: string;
  readonly text: string;
  readonly attachments: readonly unknown[];
}

/** A person as the workspace lists them (ADR 0034): who, their role, and how they came. */
export interface PersonView {
  readonly participant_id: string;
  readonly display_name: string;
  readonly role: WorkspaceRole;
  readonly joined_at: string;
  readonly invited_by: string | null;
}

/** A workspace, by name, for a screen that has only its id — an invite's, say. */
export interface WorkspaceView {
  readonly workspace_id: string;
  readonly name: string;
}

export interface ReadModels {
  /** One approval, by id, scoped to a workspace. */
  readonly approval: (workspaceId: string, approvalId: string) => Promise<ApprovalView | undefined>;
  /** One run, by id, scoped to a workspace. */
  readonly run: (workspaceId: string, runId: string) => Promise<RunView | undefined>;
  /**
   * The spaces a participant is a member of. What a read or a subscription is scoped to
   * (phase-0-review finding 6): a credential sees these spaces and nothing else.
   */
  readonly spacesForMember: (workspaceId: string, participantId: string) => Promise<string[]>;
  /**
   * The space an adapter opened for one thing it works in — a worktree, a Space of its own —
   * by the key it named it with. What makes "find or create" a lookup (ADR 0024).
   */
  readonly spaceByExternalKey: (
    workspaceId: string,
    externalKey: string,
  ) => Promise<string | undefined>;
  /**
   * Every space a harness opened by key, oldest first: the read side of its own door, so an
   * adapter can see its rooms without asking for one and so making it.
   */
  readonly spacesOpenedBy: (workspaceId: string, harnessId: string) => Promise<OpenedSpaceView[]>;
  /**
   * Every room a person asked this harness into that it has not claimed, and is still in, oldest
   * first: the other half of its listing, so an adapter that was down catches up at its start.
   */
  readonly spacesAskedOf: (workspaceId: string, harnessId: string) => Promise<AskedSpaceView[]>;
  /**
   * Whether a participant is in a space. The write side of membership scoping: an event
   * into a space is accepted only from a member (phase-1-interim-review finding 1).
   */
  readonly isMember: (
    workspaceId: string,
    spaceId: string,
    participantId: string,
  ) => Promise<boolean>;
  /**
   * A participant's standing in a space, or nothing when they are not in it. The same
   * lookup as `isMember`, for the rules that also need the role: `from` on a steer reports it.
   */
  readonly memberRole: (
    workspaceId: string,
    spaceId: string,
    participantId: string,
  ) => Promise<"owner" | "member" | "guest" | undefined>;
  /**
   * The run still going in a space, if one is: the most recently started that has not
   * ended. What a message sent mid-run is queued or steered for. With somebody named, theirs: an
   * agent's, or any of a harness's — a room with two agents in it has two (M3.3, ADR 0087).
   */
  readonly liveRun: (
    workspaceId: string,
    spaceId: string,
    by?: string | undefined,
  ) => Promise<RunView | undefined>;
  /** Everyone in a space, with their names and standing: who a mention or an approver may be. */
  readonly membersOf: (workspaceId: string, spaceId: string) => Promise<MemberView[]>;
  /** The open room an agent is in, or nothing while it is free (ADR 0087, rule 1). */
  readonly agentRoom: (workspaceId: string, agentId: string) => Promise<string | undefined>;
  /**
   * Every run still going in a room and in its threads: what an archive stops (ADR 0087, rule 3),
   * and, for one agent, what its leaving stops.
   */
  readonly liveRunsIn: (workspaceId: string, spaceId: string) => Promise<RunView[]>;
  /**
   * Agents that are members of an archived room: a release a restart cut (agents review, finding
   * 7). None, while every archive finished.
   */
  readonly agentsInClosedRooms: (
    workspaceId: string,
  ) => Promise<{ readonly agent_id: string; readonly space_id: string }[]>;
  /**
   * Runs still going that nothing would end: in a room that is archived, where an archive stops
   * every run (`archived`), or by an agent that is no longer in the run's room (`left`).
   */
  readonly strandedRuns: (workspaceId: string) => Promise<
    {
      readonly run_id: string;
      readonly space_id: string;
      readonly why: "archived" | "left";
    }[]
  >;
  /** Agents in more than one room, which the one-room rule says cannot be: for the log. */
  readonly agentsInSeveralRooms: (
    workspaceId: string,
  ) => Promise<{ readonly agent_id: string; readonly rooms: readonly string[] }[]>;
  /**
   * The log position at which a participant last left a room, or nothing when they never did:
   * what tells one stay there from the next (agents review, finding 14).
   */
  readonly lastLeft: (
    workspaceId: string,
    spaceId: string,
    participantId: string,
  ) => Promise<number | undefined>;
  /** Which of these rooms are still there: an erased one is in nothing a reader should be told. */
  readonly spacesAmong: (workspaceId: string, spaceIds: readonly string[]) => Promise<Set<string>>;
  /** Every workspace this server holds, for what is done once at a start. */
  readonly workspaces: () => Promise<string[]>;
  /** What an agent said while in no room, oldest first (rule 6). */
  readonly heldFor: (workspaceId: string, agentId: string) => Promise<HeldView[]>;
  /** The free agents an archive took out of this room, which an unarchive brings back (rule 4). */
  readonly releasedFrom: (workspaceId: string, spaceId: string) => Promise<AgentView[]>;
  /**
   * The event that last archived or unarchived a room: the kind of actor that sent it, and its
   * idempotency key. An agent restored does not reopen a room a person archived (SEC-48), and the
   * key tells that apart from a room closed because a person archived its last agent.
   */
  readonly stateChangeOf: (
    workspaceId: string,
    spaceId: string,
  ) => Promise<{ readonly by: string; readonly key: string | null } | undefined>;
  /** One space, for the rules about changing it. */
  readonly space: (workspaceId: string, spaceId: string) => Promise<SpaceView | undefined>;
  /**
   * One message by the id the wire uses (`msg_…`): whose it is and where, so feedback on it is
   * checked at the door and delivered to the harness that said it (M3.4).
   */
  readonly message: (workspaceId: string, messageId: string) => Promise<MessageView | undefined>;
  /**
   * Which harnesses a participant's newest text message in a space was for — `all` when it was
   * for every harness there was — or nothing before their first one that says (ADR 0081): where
   * an unnamed message of theirs goes next.
   */
  readonly lastAddressed: (
    workspaceId: string,
    spaceId: string,
    actorId: string,
  ) => Promise<string[] | "all" | undefined>;
  /**
   * How the agents' talk in a space stands as of `uptoSeq`, the newest when absent (ADR 0097):
   * where the count starts, the messages agents sent agents since, and a pause.
   */
  readonly exchangeOf: (
    workspaceId: string,
    spaceId: string,
    options?: { readonly uptoSeq?: number },
  ) => Promise<ExchangeView>;
  /** The messages Chips held in a space after `afterSeq` and before `beforeSeq`, newest first. */
  readonly heldIn: (
    workspaceId: string,
    spaceId: string,
    afterSeq: number,
    beforeSeq: number,
  ) => Promise<HeldMessageView[]>;
  /** Who leads a room now (ADR 0104): the agent set to, while it is a member there. */
  readonly leadOf: (workspaceId: string, spaceId: string) => Promise<string | undefined>;
  /** What a room allows a job (ADR 0117) as a person there set it; nothing for the default. */
  readonly spendCeilingOf: (workspaceId: string, spaceId: string) => Promise<number | undefined>;
  /** What a room's job has spent (ADR 0117), as of `uptoSeq` when given, else of now. */
  readonly jobSpendOf: (
    workspaceId: string,
    spaceId: string,
    options?: { readonly uptoSeq?: number },
  ) => Promise<JobSpendView>;
  /** Every open room, in every workspace, with a lead still in it (ADR 0104). */
  readonly ledRooms: () => Promise<LedRoomView[]>;
  /**
   * The newest message said in a room and not taken back, before `beforeSeq` when given, and by a
   * person when `byPerson` (ADR 0104). Nothing when there is none.
   */
  readonly lastPost: (
    workspaceId: string,
    spaceId: string,
    options?: { readonly beforeSeq?: number; readonly byPerson?: boolean },
  ) => Promise<PostView | undefined>;
  /**
   * The agents' turns in a room, newest first (ADR 0104): every one still going, and the last
   * that ended for each agent.
   */
  readonly turnsIn: (workspaceId: string, spaceId: string) => Promise<TurnView[]>;
  /**
   * The turns going in a room by any of these agents (ADR 0106): each run, its agent, and when
   * anything was last heard from it.
   */
  readonly turnsGoing: (
    workspaceId: string,
    spaceId: string,
    agentIds: readonly string[],
  ) => Promise<
    { readonly run_id: string; readonly agent_id: string; readonly last_heard_at: string }[]
  >;
  /** Whether any of these agents has had a turn in a room since `sinceIso`: a run there (ADR 0104). */
  readonly ranSince: (
    workspaceId: string,
    spaceId: string,
    agentIds: readonly string[],
    sinceIso: string,
  ) => Promise<boolean>;
  /** Who was put in a room after `afterSeq` and before `beforeSeq`, oldest first (ADR 0104). */
  readonly joinsIn: (
    workspaceId: string,
    spaceId: string,
    afterSeq: number,
    beforeSeq: number,
  ) => Promise<JoinView[]>;
  /**
   * The `seq` of the newest message any of these participants said in a space before
   * `beforeSeq`, or nothing when none has said anything there: where what an agent is handed with
   * a question starts (ADR 0088). An agent is asked with the harness whose place it took there.
   */
  readonly lastSpokeSeq: (
    workspaceId: string,
    spaceId: string,
    participantIds: readonly string[],
    beforeSeq: number,
  ) => Promise<number | undefined>;
  /**
   * Where the last turn began in which any of these participants said something in a space before
   * `beforeSeq`, or passed with NO_REPLY (ADR 0105 and its addendum): the first event of the run
   * its words or its pass were on, else the words or the pass themselves. Nothing when none has
   * had a turn there. What was said while that turn worked comes after it, so a turn is handed it.
   */
  readonly lastTurnSeq: (
    workspaceId: string,
    spaceId: string,
    participantIds: readonly string[],
    beforeSeq: number,
  ) => Promise<number | undefined>;
  /**
   * The `seq` at which any of these participants last came into a space before `beforeSeq` —
   * added, taking another's place, or the one who opened it; for a thread, into its parent — or
   * nothing: where its context starts before it has spoken there (ADR 0088).
   */
  readonly joinedSeq: (
    workspaceId: string,
    spaceId: string,
    participantIds: readonly string[],
    beforeSeq: number,
  ) => Promise<number | undefined>;
  /**
   * A harness's agents (ADR 0087), each with the rooms it is in, oldest first; archived ones too.
   */
  readonly agentsOf: (workspaceId: string, harnessId: string) => Promise<AgentView[]>;
  /** Every room an agent has been in, oldest stay first: its message history's dividers. */
  readonly agentStays: (workspaceId: string, agentId: string) => Promise<AgentStay[]>;
  /** The newest ask for a copy of this agent in this room (ADR 0087, Fork), or nothing. */
  readonly forkAsk: (
    workspaceId: string,
    agentId: string,
    spaceId: string,
  ) => Promise<ForkAsk | undefined>;
  /** A person's ask for a new agent (ADR 0108), by the `agent.asked` event's id, or nothing. */
  readonly agentAsk: (workspaceId: string, askId: string) => Promise<AgentAsk | undefined>;
  /**
   * The rooms this very participant is a member of — not a harness's agents' — oldest membership
   * first: what the upgrade to agents moves (ADR 0087, point 9).
   */
  readonly roomsHolding: (workspaceId: string, participantId: string) => Promise<SpaceView[]>;
  /** A harness's agent by the harness's key for it. */
  readonly agentByKey: (
    workspaceId: string,
    harnessId: string,
    key: string,
  ) => Promise<AgentView | undefined>;
  /**
   * In a space, who took whose place (`membership.replaced`), oldest first: what a member said
   * there before it was replaced reads as the one that holds its place now, however many times
   * the place changed hands.
   */
  readonly replacedIn: (
    workspaceId: string,
    spaceId: string,
  ) => Promise<{ readonly from: string; readonly to: string }[]>;
  /**
   * The newest `limit` events in a space that are lines of it (ADR 0088), after `after` and before
   * `before`, oldest first: messages with their words as they read now and none deleted,
   * memberships, retitles, archives, and the renames of its members. `more` says there are older
   * ones in the window. Never the messages of those in `unsaidBy`: what a turn is handed leaves
   * out what its takers said themselves (ADR 0105).
   */
  readonly roomLinesSince: (
    workspaceId: string,
    spaceId: string,
    window: {
      readonly after: number;
      readonly before: number;
      readonly limit: number;
      readonly unsaidBy?: readonly string[];
    },
  ) => Promise<{ readonly events: ContextEvent[]; readonly more: boolean }>;
  /** The workspace's price table for estimating cost from tokens, or the default. */
  readonly priceTable: (workspaceId: string) => Promise<PriceTable>;
  /** What may be attached here (ADR 0047): the workspace's caps, or none, meaning the server's. */
  readonly attachmentCaps: (workspaceId: string) => Promise<AttachmentCaps>;
  /** One participant, for naming the sender of a `message.new`. */
  readonly participant: (
    workspaceId: string,
    participantId: string,
  ) => Promise<ParticipantView | undefined>;
  /**
   * The rooms that are a harness's homes (ADR 0069): marked home, and either opened by it or the
   * direct room it was handed. What stops being a home when the harness is removed (ADR 0078).
   */
  readonly homesOf: (workspaceId: string, harnessId: string) => Promise<string[]>;
  /**
   * The files posted in a room (ADR 0099), oldest first, none from a message taken back: up to the
   * message at `upto` and with it, or all of them; those of one name, when `name` is given (ADR
   * 0100). The protocol's `currentFiles` lists them, and `versionsNamed` one name's.
   */
  readonly postedFiles: (
    workspaceId: string,
    spaceId: string,
    options?: { readonly upto?: number | undefined; readonly name?: string | undefined },
  ) => Promise<PostedFile[]>;
  /**
   * What each file these messages carried says it was made from (ADR 0099, point 3), by the
   * file's attachment id: the `replaces` the door copied onto it. Files that say nothing are absent.
   */
  readonly madeFrom: (
    workspaceId: string,
    messageIds: readonly string[],
  ) => Promise<ReadonlyMap<string, string>>;
  /** Where an attachment was posted, under what name, and its bytes' digest (ADR 0099). */
  readonly attachmentFact: (
    workspaceId: string,
    attachmentId: string,
  ) => Promise<{ space_id: string | null; filename: string; sha256: string } | undefined>;
  /** The spaces an attachment was sent in: who may fetch it. */
  readonly attachmentSpaces: (workspaceId: string, attachmentId: string) => Promise<string[]>;
  /**
   * The files a run's own answer carried: the attachments on the harness's messages in it, in
   * the order they were said. This is what a lane hands back to its lead beside the summary, so
   * an answer made of photos reaches the room the question was asked in (ADR 0029: the lead
   * reads the specialist's work through the lane, not by being in its space).
   */
  readonly runAttachments: (workspaceId: string, runId: string) => Promise<Attachment[]>;
  /**
   * A harness's policy in a space: the row set for that room, else the harness's row
   * everywhere; nothing when the harness has never had a `policy.updated`. A room's own row
   * carries the harness's rules everywhere beside its own (ADR 0239).
   */
  readonly harnessPolicy: (
    workspaceId: string,
    harnessId: string,
    spaceId?: string | undefined,
  ) => Promise<HarnessPolicyView | undefined>;
  /** The workspace cap, as the last `policy.updated` reported it. */
  readonly workspacePolicy: (workspaceId: string) => Promise<WorkspacePolicyView | undefined>;
  /** The decisions made "for this session" in a run, as rules the engine can read. */
  readonly sessionRules: (workspaceId: string, runId: string) => Promise<PolicyRule[]>;
  /**
   * Whether a ref names a visit to this space, for a message that says which session it is for
   * (ADR 0040). A ref that names nothing here is refused rather than dropped: dropping it would
   * send the message somewhere else, which is the one thing that decision forbids.
   */
  readonly sessionInSpace: (
    workspaceId: string,
    spaceId: string,
    sessionRef: string,
  ) => Promise<boolean>;
  /** One question, by its ask id, scoped to a workspace. */
  readonly question: (workspaceId: string, askId: string) => Promise<QuestionView | undefined>;
  /** One lane, by its id. */
  readonly lane: (workspaceId: string, laneId: string) => Promise<LaneView | undefined>;
  /**
   * The lane a run is, if it is one: the specialist's run points back at its lane, so a run
   * event can tell the lane's lead its news, and so a nested `task` knows its parent lane.
   */
  readonly laneByRun: (workspaceId: string, runId: string) => Promise<LaneView | undefined>;
  /** The lanes a run opened, for the cancel cascade: cancelling a lead's run ends its lanes. */
  readonly lanesLedBy: (workspaceId: string, leadRunId: string) => Promise<LaneView[]>;
  /**
   * A direct space shared by two participants, if there is one: where a lane to this specialist
   * lives, so the person reads it in the room they already have with the harness.
   */
  readonly directSpaceBetween: (
    workspaceId: string,
    a: string,
    b: string,
  ) => Promise<string | undefined>;
  /** Every pending approval in a workspace that names this person among who may answer it. */
  readonly approvalsAwaiting: (
    workspaceId: string,
    participantId: string,
  ) => Promise<AwaitingApproval[]>;
  /** Every pending approval whose expiry has passed, across workspaces, for the sweep. */
  readonly approvalsExpiredBy: (nowIso: string) => Promise<ExpiredApproval[]>;
  /** Every pending question whose timeout has passed, across workspaces, for the sweep. */
  readonly questionsTimedOutBy: (nowIso: string) => Promise<TimedOutQuestion[]>;
  /**
   * The people and harnesses a participant shares a space with, so the app can put a name
   * to every id it will meet in the stream. Scoped the same way a read is: it never names
   * someone from a space the caller is not in. What a harness is told.
   */
  readonly participantsVisibleTo: (
    workspaceId: string,
    participantId: string,
  ) => Promise<ParticipantView[]>;
  /**
   * Everyone in the workspace. What a person is told (M3.3): a person adds people and
   * harnesses to a room, and cannot add whom they cannot name. Names are the workspace's;
   * events stay the room's.
   */
  readonly participantsIn: (workspaceId: string) => Promise<ParticipantView[]>;
  /**
   * The ids of everyone who is or ever was in a room the person is in now: what a person not told
   * every agent is told of the rest (ADR 0034's addendum). Whoever has left one of those rooms
   * still said what they said there, and the app puts their name to it rather than an id.
   */
  readonly participantsMet: (workspaceId: string, participantId: string) => Promise<string[]>;
  /**
   * The first names open rooms hold for harnesses' agents-to-be (ADR 0150): taken, as an active
   * agent's name is, so no two rooms hold one name and no agent is given one a room holds.
   */
  readonly heldNames: (workspaceId: string) => Promise<HeldName[]>;
  /**
   * Any one person, for the dev-mode pairing-code endpoint only — dev mode has exactly one
   * workspace with one person. Never used off a laptop; the endpoint that calls it exists only
   * when `devMode` is on.
   */
  readonly anyPerson: () => Promise<{ workspaceId: string; participantId: string } | undefined>;
  /** A person's standing in the workspace, or nothing when they never joined it (ADR 0034). */
  readonly workspaceRole: (
    workspaceId: string,
    participantId: string,
  ) => Promise<WorkspaceRole | undefined>;
  /** How many owners the workspace has: the last one cannot be demoted. */
  readonly ownerCount: (workspaceId: string) => Promise<number>;
  /**
   * How many open rooms a participant is in, threads aside: a guest is in one at most (JR-24). An
   * archived room they are still a member of is not counted, as it is not for an agent (ADR 0087).
   */
  readonly spaceCountFor: (workspaceId: string, participantId: string) => Promise<number>;
  /** Everyone in the workspace with their role, in the order they joined. */
  readonly peopleIn: (workspaceId: string) => Promise<PersonView[]>;
  /** The workspace itself, by name. */
  readonly workspace: (workspaceId: string) => Promise<WorkspaceView | undefined>;
  /**
   * Messages and receipts with these words in them, newest first, in the spaces given — the
   * caller's, resolved the way a read is scoped (M5.4). Under 200 ms at 50,000 messages.
   */
  readonly search: (
    workspaceId: string,
    spaces: readonly string[],
    query: SearchQuery,
  ) => Promise<SearchPage>;
}
