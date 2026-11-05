/**
 * The store: one place that ties the socket, the cache, the model and read state together, and
 * hands a screen a single snapshot to render.
 *
 * The flow: load the cache and fold it, so there is something to show offline; fetch the
 * participant directory so ids have names; open the socket and resume from the cursor the cache
 * recorded. Every event that arrives is deduped and folded; a send shows up optimistically and is
 * reconciled when it streams back. A send made before the socket exists waits for it; one the
 * server refuses stays on screen with the reason; a decision is busy until the server answers
 * for it (phase-1-interim-review finding 4). A message still unanswered when the page is
 * reloaded is in the cache, shown as pending again and sent again under the same key once the
 * socket opens (found 5 September 2026).
 *
 * Listeners are notified once per animation frame, not once per event. The socket delivers a
 * replay as one message per event and the browser runs each as its own task, so a microtask
 * would flush — rebuild, and render every row — once per event: a fresh pairing against 500
 * messages took 22 seconds that way (phase-1-interim-review finding 2). A frame gathers
 * however many arrived, and the cache is written once per frame too.
 *
 * Where a relaunch resumes is a cursor the store records, never a number read off the cache
 * (ADR 0049). Events are written one batch at a time, and the cursor is claimed behind each
 * batch — the socket's highest delivered `seq` as the batch was taken — only once the batch has
 * landed, so a batch the cache loses holds the cursor back and is read again from the server at
 * the next launch. Resuming from the highest cached `seq` instead left a hole for ever when the
 * phone's cache dropped a batch from the middle (11 September 2026); and the hole cannot be seen
 * in the cache itself, since a device is never sent the events of spaces it is not in and its
 * cache is full of gaps that are nobody's fault. A cache from before the cursor was kept has
 * none, and is read from the start once, which fills whatever it lost.
 *
 * The socket, IndexedDB and WebCrypto stay Playwright's; this file is tested with a fake
 * transport and an in-memory cache, and the pieces it leans on (the model, the pending overlay,
 * read state) are pure and tested on their own.
 */

import {
  type AgentContextView,
  type AgentContextWindowView,
  type AgentHeartbeatView,
  type AgentModelView,
  type AgentState,
  type AttachmentCaps,
  type CompactionView,
  type Connector,
  type ContextEditView,
  DEFAULT_EXCHANGE_LIMITS,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_SPEND_CEILING_USD,
  type ExchangeLimits,
  eventIdOfMessage,
  HARNESS_CAPABILITIES,
  type HarnessContextView,
  type HarnessJobsView,
  type HeartbeatChangeAsk,
  type HeartbeatChangeView,
  type HeldRun,
  type JobChangeAsk,
  type JobChangeView,
  type JobRunsView,
  type JobSpend,
  type JoinRequestView,
  type ModelChangeAsk,
  type ModelChangeView,
  messageIdOf,
  NO_CAPS,
  type NotificationSettings,
  newId,
  type ProjectChangeAnswer,
  type ProjectFilesAnswer,
  type ProjectFolderOpenAnswer,
  type ProjectHistoryAnswer,
  type ProjectRun,
  type ProjectRunAnswer,
  type ProjectToken,
  type ProjectUndoAnswer,
  parseSpaceIcon,
  READ_MARKS_MAX,
  type RoomFile,
  readConnectors,
  type SpaceIcon,
  type WindowChangeView,
  type WindowLimitAsk,
  type WorkspaceRole,
} from "@chipschat/protocol";
import type { AgentStay } from "./agentsTab.js";
import { handleIn } from "./asks.js";
import { type Attachment, attachmentFromWire, projectPageUrl } from "./attachments.js";
import { type Cache, cacheKey, openCache } from "./cache.js";
import {
  type Device,
  type DeviceStorage,
  rememberAddress,
  rememberOnlyDirect,
  rememberReach,
  rememberRelay,
  rememberWentDirect,
  rememberWorkspaceName,
} from "./device.js";
import { type DirectAsk, type DirectAskView, directAskOf } from "./directAsks.js";
import {
  actorKind,
  type ClientEvent,
  type Directory,
  neverConnected,
  type Participant,
} from "./events.js";
import { withForkNames } from "./forks.js";
import { type Hiding, withHidden } from "./hidden.js";
import { type JoinRequest, joinRequestOf, joinStage } from "./join.js";
import type { LinkKind, LinkStretch } from "./link.js";

export type { LinkStretch } from "./link.js";

import {
  type KeptSpace,
  keptSpaces,
  type MadeHere,
  madeHereEvent,
  settleMadeHere,
  withMadeHere,
} from "./madeHere.js";
import {
  createFold,
  type Line,
  myRole,
  type RoomFileOf,
  type Rule,
  type Space,
  type SteerMode,
  type WorkspaceModel,
} from "./model.js";
import type { OutboxEvent } from "./outbox.js";
import { type PendingMessage, type QueuedMessage, withPending } from "./pending.js";
import {
  markRead as advanceRead,
  markSpacesRead as advanceSpaces,
  aheadOf,
  furthest,
  type ReadState,
} from "./read-state.js";
import { type RelayFacts, type RelayView, relayFactsOf } from "./relaySwitch.js";
import {
  type ConnectionState,
  connect as connectSocket,
  deleteJson,
  type FolderAsk,
  getBytes,
  getJson,
  patchJson,
  postJson,
  putJson,
  type Transport,
} from "./transport.js";

export interface Snapshot {
  readonly connection: ConnectionState;
  /** Which way the socket reached the server, once it has: the network, or the relay (M4.1). */
  readonly link?: LinkKind | undefined;
  /** Since when it has gone that way, by this device's clock (ADR 0211). */
  readonly linkSince?: string | undefined;
  /** The way it went before, and from when until when: the relay, before Tailscale came on. */
  readonly linkBefore?: LinkStretch | undefined;
  /** Only direct is on for this device (ADR 0211, Phase 2): the relay is never tried. */
  readonly onlyDirect?: boolean | undefined;
  /** This device has reached its server at its own address at least once: Only direct is offered. */
  readonly wentDirect?: boolean | undefined;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly readState: ReadState;
  /**
   * Approvals with a decision on its way, and runs with a pause, resume, stop or steer on its
   * way, by id: their controls are busy until the server answers.
   */
  readonly busy: ReadonlySet<string>;
  /** What Chips did with each message sent mid-run, by the line's key: queued or steered. */
  readonly receipts: ReadonlyMap<string, "queued" | "steered">;
  /**
   * Commands the server turned away, by the id they were for, with its reason: an answer to a
   * question, a decision, a pause. The card they came from stays, so it says why rather than
   * looking as if the tap did nothing (the Chess Game space, 15 September 2026). Gone at the next
   * try on the same id. A refused message is its own line's `failed`, not an entry here.
   */
  readonly refused?: ReadonlyMap<string, string> | undefined;
  /**
   * Not right? notes the server turned away (ADR 0200), by the line they were on: the words and
   * why. A note is drawn only once its event streams back, so a refused one used to leave no
   * trace, and the page had closed as if it went (PM-4). The room draws it where the note would
   * have stood, for the person who wrote it, until they send another on that line.
   */
  readonly unsentNotes?: ReadonlyMap<string, UnsentNote> | undefined;
  /**
   * What the server said of the last change to who is in a room that it turned away, by room: an
   * agent that was put somewhere else a moment before, the Main agent, an archived room. There is
   * no card for such a change to say it on, and it used to go unsaid, so the tap looked as if it
   * did nothing (agents review, finding 13). The room says it where a command's notice goes; gone
   * at the next change sent for that room, or when the room lets it go.
   */
  readonly notices?: ReadonlyMap<string, string> | undefined;
  /**
   * The face this person chose for a space, by space id (21 September 2026). On the snapshot
   * rather than behind a method because a list redraws when one changes, and a method would
   * hand back the same object and redraw nothing.
   */
  readonly spaceIcons: ReadonlyMap<string, SpaceIcon>;
  /**
   * The rooms this person hid from their own list (ADR 0205), by space id: drawn under the list's
   * Hidden heading, and quiet. On the snapshot for the reason the faces are. Absent from a snapshot
   * made without the store, which is none hidden.
   */
  readonly hiddenSpaces?: ReadonlySet<string> | undefined;
  /**
   * The rooms this person pinned to the top of their own list (ADR 0240), the newest pin first:
   * the list's open run starts with them, in this order (`listRuns`). On the snapshot for the
   * reason the faces are. Absent from a snapshot made without the store, which is none pinned.
   */
  readonly pinnedSpaces?: readonly string[] | undefined;
  /**
   * Join requests this person may decide, and the links they made (ADR 0122), by id: from the
   * `join` frame, read again at each hello, and from what this device sent. Empty for anybody who
   * is not an owner or admin.
   */
  readonly joins?: ReadonlyMap<string, JoinRequest> | undefined;
  /**
   * Guests' asks to go direct (ADR 0211, Phase 3), by id, for an owner: read at each hello, and
   * from a push and an answer. Empty for anybody but an owner.
   */
  readonly directAsks?: ReadonlyMap<string, DirectAsk> | undefined;
  /** The share link an owner kept for the next guest who asks, for an owner's sheet. */
  readonly keptShareLink?: string | undefined;
  /** This person's own newest ask to go direct, once read (the Connection page, a push). */
  readonly myDirectAsk?: DirectAsk | undefined;
  /**
   * True while the store is still reading what this device kept from last time. An empty model
   * then says nothing about whether there are rooms, so a list says nothing either; it said
   * "No spaces yet" for that while on every launch (6 October 2026). Absent once read.
   */
  readonly readingCache?: boolean | undefined;
  /**
   * How many of the rooms the server's last hello listed for this person have not come in yet,
   * and nothing until a hello. With no room to show, it is how a list tells rooms on their way
   * from there being none (`emptyList`).
   */
  readonly awaiting?: number | undefined;
  /**
   * Where the directory came from: what this device kept of the server's last answer, or the
   * server's own answer since. Absent while this device has never had one — just paired, say — and
   * only then does an empty directory not mean nobody (`agentsLook`). Before 14 October 2026 the
   * directory was never kept, and the Agents tab said "No agents yet" on every cold start.
   */
  readonly directoryFrom?: "cache" | "server" | undefined;
  /**
   * A read of the directory did not land while the socket was open, nor did the store's own two
   * tries after it. Gone with the next one that does. A read that went out before the socket had a
   * way to the server is not this: it is read again at the hello (14 October 2026, his iPhone
   * through the relay said "Couldn't load your agents" for a second on every first load).
   */
  readonly directoryFailed?: boolean | undefined;
  /**
   * When the socket stopped being open, while it is not, for "last connected 4 min ago". Absent
   * while it is open, and before it has been open at all since the store was made.
   */
  readonly lostAt?: string | undefined;
  /**
   * The server names a relay under a key this device did not pin at pairing (SEC-2). The device
   * keeps the relay it has and the key it pinned, so it reaches the server on the network as
   * before and may not get through from anywhere else; only pairing again takes the new key.
   * The screens that say which way the device reaches its server say so, and say to pair again.
   */
  readonly rekeyed?: boolean | undefined;
  /**
   * The reader deleted their own account from this device (ADR 0243). With `connection` at
   * `removed`, the removal is their own leaving, and the screens that say so say that rather than
   * that somebody removed them.
   */
  readonly deletedAccount?: true | undefined;
  /**
   * What the workspace is called now, as the server's last hello said. Absent until one has, and
   * from a server too old to say: the name the device paired under stands until then.
   */
  readonly workspaceName?: string | undefined;
}

/** What the server takes at most (ADR 0047), as `GET /v1/limits` says it. */
export interface ServerLimits {
  readonly maxAttachmentBytes: number;
  readonly maxMessageBytes: number;
}

export interface SendMessageInput {
  readonly spaceId: string;
  readonly text: string;
  /** Files already uploaded with `uploadFile`; the message attaches them by id. */
  readonly attachments?: readonly Attachment[] | undefined;
  /**
   * The visit this message is for, when the person pinned one (ADR 0040). Left out and the
   * harness chooses, which is the ordinary case and what happens for a space with one session.
   */
  readonly sessionRef?: string | undefined;
  /**
   * Who the person aimed it at without an @, as `to` on the wire (ADR 0081, ADR 0204): agents' and
   * people's ids, or every agent in the room. Chips decides who a message is for; this is what
   * they chose.
   */
  readonly to?: readonly string[] | "all" | undefined;
  /**
   * Who the capsule said it goes to, drawn on the line while it is on its way, so its route is
   * there from the send. The line Chips sends back says for itself.
   */
  readonly addressedTo?: readonly string[] | undefined;
  /** The people the field said it is for (ADR 0204), drawn on its route the same way. */
  readonly addressedPeople?: readonly string[] | undefined;
  /**
   * The line it replies to (ADR 0219), sent as `reply_to`: Chips quotes that message to the agents
   * it goes to, and a reply to an agent's message is that agent's unless an @ or `to` says else.
   */
  readonly replyTo?: string | undefined;
}

export interface RunInput {
  readonly spaceId: string;
  readonly runId: string;
}

export interface SteerRunInput extends RunInput {
  readonly mode: SteerMode;
  readonly text: string;
}

export interface AnswerQuestionInput extends RunInput {
  readonly askId: string;
  readonly answers: readonly {
    readonly questionId: string;
    readonly values: readonly string[];
    readonly freeText?: string | undefined;
  }[];
}

/** The dial: a harness's level, everywhere or in one space, with the rules it keeps. */
export interface SetAutonomyInput {
  readonly harnessId: string;
  readonly spaceId?: string | undefined;
  readonly level: 0 | 1 | 2 | 3;
  readonly rules: readonly Rule[];
}

/**
 * A harness's rules, everywhere or in one room, sent whole (ADR 0195): a rule switched off or on,
 * removed, or put back by Undo. The level stays as the model has it for that scope.
 */
export interface SetRulesInput {
  readonly harnessId: string;
  readonly spaceId?: string | undefined;
  readonly rules: readonly Rule[];
}

/** Hand an approval on (M5.5): to a teammate, a role, or the lane's lead, with a word why. */
export interface RouteApprovalInput {
  readonly spaceId: string;
  readonly runId: string;
  readonly approvalId: string;
  /** `owner`, `any`, `lead`, `role:<name>`, or person ids — the request's own words. */
  readonly to: readonly string[];
  readonly reason?: string | undefined;
}

export interface ResolveApprovalInput {
  readonly spaceId: string;
  readonly runId: string;
  readonly approvalId: string;
  readonly decision: "approved" | "denied" | "edited";
  readonly scope?: "once" | "session" | "always";
  /** An Always kept for every space, in the harness's own policy (ADR 0239): an owner's or admin's. */
  readonly everywhere?: boolean;
  readonly updatedInput?: unknown;
  readonly reason?: string;
}

export interface Store {
  readonly subscribe: (listener: (snapshot: Snapshot) => void) => () => void;
  readonly getSnapshot: () => Snapshot;
  readonly send: (input: SendMessageInput) => void;
  /**
   * Take back a message that has not gone: the optimistic line goes, the cache stops holding it,
   * and the socket's outbox forgets it, so the next connection does not carry it. Only a message
   * still waiting — one the server has answered for, or refused, is no longer the sender's.
   */
  readonly discard: (key: string) => void;
  readonly resolveApproval: (input: ResolveApprovalInput) => void;
  /** Hand an approval to somebody else (M5.5). The approval is busy until the server answers. */
  readonly routeApproval: (input: RouteApprovalInput) => void;
  readonly answerQuestion: (input: AnswerQuestionInput) => void;
  /** Turn the dial: a `policy.updated`, the cap and who changed it filled in by Chips (M1.4). */
  readonly setAutonomy: (input: SetAutonomyInput) => void;
  /**
   * Send a harness's rules for a scope with one changed (ADR 0195): Allowed always's switches,
   * its swipe and its Undo. A `policy.updated` at the scope's level as the model has it.
   */
  readonly setRules: (input: SetRulesInput) => void;
  /** Hold a run where it is; carry on; end it as cancelled; redirect it (M1.3). */
  readonly pauseRun: (input: RunInput) => void;
  readonly resumeRun: (input: RunInput) => void;
  readonly stopRun: (input: RunInput & { readonly reason?: string | undefined }) => void;
  readonly steerRun: (input: SteerRunInput) => void;
  readonly markRead: (spaceId: string, seq: number) => void;
  /** Mark these spaces read as far as opening each would, saving once (`markSpacesRead`). */
  readonly markSpacesRead: (spaceIds: readonly string[]) => void;
  /**
   * Leave a space: it stops being one of yours and its events stop arriving. Nothing in it is
   * deleted — the harness stays, its history stays — and the log records who left and when.
   */
  readonly leaveSpace: (input: { readonly spaceId: string }) => void;
  /**
   * Open a space, as its first member; the id it will have comes back at once (M3.3). A group or
   * a channel is named; a direct room asked of a harness is not, and is followed by adding the
   * harness and then the first words, in that order, through the same outbox.
   */
  readonly createSpace: (input: CreateSpaceInput) => string;
  /**
   * Add somebody to a space, or take them out of it. A change the server turns away is said in
   * `Snapshot.notices`, for the room.
   */
  readonly addMember: (input: MemberInput) => void;
  readonly removeMember: (input: {
    readonly spaceId: string;
    readonly participantId: string;
  }) => void;
  /** Retitle a space, archive it (`closed`), or unarchive it (ADR 0066). */
  readonly updateSpace: (input: UpdateSpaceInput) => void;
  /**
   * Erase a space from the server (ADR 0067): what was said in it, its files and its search
   * entries go, for everyone in it. Resolves once the server has done it, with the room already
   * gone from here; rejects with the server's reason when it will not, and nothing changes.
   */
  readonly eraseSpace: (
    spaceId: string,
    options?: {
      /** Delete the room's one agent in its harness too (ADR 0087, rule 5). */
      readonly deleteAgent?: boolean | undefined;
    },
  ) => Promise<void>;
  /**
   * Move an agent into a room (ADR 0087): out of the room it is in, whose runs by it stop, and
   * into this one. Resolves once the server has; rejects with its reason when it will not.
   */
  readonly moveAgent: (agentId: string, spaceId: string) => Promise<void>;
  /**
   * Ask an agent's harness for a copy of it in a room (ADR 0087, Fork): the room shows the ask
   * until the copy joins. Resolves once the server has the ask; rejects with its reason.
   */
  readonly forkAgent: (agentId: string, spaceId: string) => Promise<void>;
  /**
   * Ask a harness for a new agent in a room (ADR 0108), called `name`, or its harness's next free
   * name when that is empty: the room shows the ask until the agent joins. Resolves once the
   * server has the ask; rejects with its reason.
   */
  readonly askAgent: (harnessId: string, spaceId: string, name?: string) => Promise<void>;
  /**
   * The @ of an agent that joined this room for an ask made on this device (ADR 0108), once: the
   * asker's field holds it, ready for the agent's first job. Nothing when none has joined since.
   */
  readonly takeArrival: (spaceId: string) => string | undefined;
  /**
   * A new room, and a copy of an agent asked for in it: the id of the room, once the server has
   * the ask. When the ask is refused the room made for it goes again, so a try that fails leaves
   * no empty room behind, and rejects with the server's reason (agents review, finding 20).
   */
  readonly forkIntoNewRoom: (agentId: string, title: string) => Promise<string>;
  /**
   * A new room named for a new agent, and that agent asked of its harness in it (ADR 0190, point
   * 4, from a harness's page): the id of the room, once the server has the ask. Refused, the room
   * goes again, as `forkIntoNewRoom`'s does, and it rejects with the server's reason.
   */
  readonly askIntoNewRoom: (harnessId: string, name: string) => Promise<string>;
  /** Let go of what a room was told about a change the server turned away (`notices`). */
  readonly dismissNotice: (spaceId: string) => void;
  /**
   * Give an agent a face, or its initials back with `undefined` (ADR 0089). The face is the
   * agent's, one for everybody, so the directory wears it at once and the server is told after;
   * a refusal puts the old face back and rejects with the reason.
   */
  readonly setAgentFace: (agentId: string, face: SpaceIcon | undefined) => Promise<void>;
  /**
   * Choose the face you wear, or your initials back with `undefined` (ADR 0139): a mark or a
   * letter or two on a ground, one for everybody, as an agent's is. The directory wears it at once
   * and the server is told after; a refusal puts the old face back and rejects with the reason.
   */
  readonly setMyFace: (face: SpaceIcon | undefined) => Promise<void>;
  /**
   * Rename an agent, for everybody (ADR 0091). Resolves once the server has it and the directory
   * is read again; rejects with the server's words for a name it refuses ("An agent here goes by
   * Hello already.").
   */
  readonly renameAgent: (agentId: string, name: string) => Promise<void>;
  /**
   * Archive an agent, or bring it back (ADR 0095): as its harness archiving it would, its work
   * stops and it leaves its room, which is archived with it when no other agent is there; back,
   * it returns to that room. Resolves once the server has it and the directory is read again;
   * rejects with the server's reason.
   */
  readonly setAgentArchived: (agentId: string, archived: boolean) => Promise<void>;
  /**
   * Lock an agent's changes, or let them go (ADR 0199): while locked, nobody renames, archives or
   * deletes it. Resolves once the server has it and the directory is read again; rejects with the
   * server's reason.
   */
  readonly setAgentLock: (agentId: string, locked: boolean) => Promise<void>;
  /**
   * Pause the agents in a room, or let them carry on (ADR 0097): while paused, their messages to
   * each other are held; carrying on starts the referee's count again and hands over what was
   * held. Resolves once the server has it; the room hears it as `exchange.set`.
   */
  readonly setExchange: (spaceId: string, state: "paused" | "going") => Promise<void>;
  /**
   * Choose who leads a room, or that nobody does (ADR 0104): the agent that hands out the work
   * there, and that Chips hands what was nobody's turn once the room goes still. Resolves once the
   * server has it; the room hears it as `space.lead_set`.
   */
  readonly setLead: (spaceId: string, agentId: string | null) => Promise<void>;
  /**
   * Set what a room allows a job (ADR 0117), from $0.25 to $100 in steps of $0.25, or `null` to
   * follow the default again. Resolves once the server has it; the room hears it as
   * `space.spend_ceiling_set`.
   */
  readonly setSpendCeiling: (spaceId: string, usd: number | null) => Promise<void>;
  /**
   * Lock a room's changes, or let them go (ADR 0156): while locked, nobody renames, archives or
   * deletes it. Resolves once the server has it; the room hears it as `space.lock_set`.
   */
  readonly setLock: (spaceId: string, locked: boolean) => Promise<void>;
  /** What a room's job has spent so far against what the room allows a job (ADR 0117). */
  readonly roomSpend: (spaceId: string) => Promise<JobSpend>;
  /**
   * Delete an agent, for everybody (ADR 0095): gone from every list, its words kept under its
   * name. With `deleteRoom`, the room it was the one agent in is erased too, and gone from here at
   * once. Resolves once the server has done it; rejects with its reason, and nothing changes.
   */
  readonly deleteAgent: (
    agentId: string,
    options?: { readonly deleteRoom?: boolean | undefined },
  ) => Promise<void>;
  /** Read who is who again: what a list of agents to add reads before it is drawn. */
  readonly refreshDirectory: () => Promise<void>;
  /**
   * The rooms an agent has been in, oldest first (ADR 0087, rule 3.11): its message history's
   * dividers, which `agentHistory` fills from the rooms this client holds.
   */
  readonly agentStays: (agentId: string) => Promise<readonly AgentStay[]>;
  /**
   * The room's files at their current version, newest first, as the server lists them (ADR 0099):
   * what Files shows, read as it opens and again when a line carrying a file lands (ADR 0100).
   */
  readonly roomFiles: (spaceId: string) => Promise<readonly RoomFileOf[]>;
  /** One of the room's files' versions, newest first (ADR 0100): what Files unfolds under it. */
  readonly fileVersions: (spaceId: string, name: string) => Promise<readonly RoomFileOf[]>;
  /** The room's project's files at `main`, or at a change (ADR 0222): the Project page's Files. */
  readonly projectFiles: (spaceId: string, at?: string) => Promise<ProjectFilesAnswer>;
  /**
   * One file of the room's project, its bytes and type, at `main` or a change. `signal` gives up
   * on it, as a page that closes before its file came does.
   */
  readonly projectFile: (
    spaceId: string,
    path: string,
    at?: string,
    signal?: AbortSignal,
  ) => Promise<{ readonly bytes: Uint8Array; readonly type: string }>;
  /** The room's project's files as one zip (ADR 0224): Download as zip, on the phone and the web. */
  readonly projectArchive: (spaceId: string) => Promise<Uint8Array>;
  /**
   * Open folder on Mac (ADR 0225): the person's own Chips for Mac asked to open the room's folder
   * in Finder. The answer says how many Macs heard it; none, and Chips for Mac isn't open.
   */
  readonly openFolderOnMac: (spaceId: string) => Promise<ProjectFolderOpenAnswer>;
  /**
   * Open page (ADR 0227): the person's own Chips for Mac asked to open the room's start page, or
   * its one document, in its own window. The answer says how many Macs heard it.
   */
  readonly openPageOnMac: (spaceId: string) => Promise<ProjectFolderOpenAnswer>;
  /**
   * Each ask from the person's other devices to open a room's folder here (ADR 0225), heard only
   * by a store made with `folders`. The answer stops the listening.
   */
  readonly onFolderAsk: (listen: (ask: FolderAsk) => void) => () => void;
  /**
   * Run (ADR 0226): the person's own Chips for Mac asked to run the room's project as its run
   * file says, or stop it. The answer says how many Macs heard it.
   */
  readonly runOnMac: (
    spaceId: string,
    ask: { readonly op: "run"; readonly command: string } | { readonly op: "stop" },
  ) => Promise<ProjectFolderOpenAnswer>;
  /** How the person's last run of the room stands, as their Mac last said, and whether one is open. */
  readonly projectRun: (spaceId: string) => Promise<ProjectRunAnswer>;
  /** The Mac's word on how its run of the room stands, for the person's other devices. */
  readonly sayRun: (spaceId: string, run: ProjectRun) => Promise<void>;
  /** Each word from the person's Mac on a run of theirs. The answer stops the listening. */
  readonly onRunState: (listen: (spaceId: string, run: HeldRun) => void) => () => void;
  /**
   * A token for git, good for a few minutes, for this device's person in the room (ADR 0220): what
   * the Mac app's `chips` gives git for Your folder (ADR 0224).
   */
  readonly projectToken: (spaceId: string) => Promise<ProjectToken>;
  /** One file's changes, newest first: its history, under it in Files. */
  readonly projectHistory: (spaceId: string, path: string) => Promise<ProjectHistoryAnswer>;
  /** One change, with its files' diffs: what "2 files changed" and See the change open. */
  readonly projectChange: (spaceId: string, commit: string) => Promise<ProjectChangeAnswer>;
  /**
   * Undo one change (ADR 0222): taken back as a new commit of the person's, which the room's log
   * then shows. Refused in the server's words, as `ServerRefused`.
   */
  readonly undoChange: (spaceId: string, commit: string) => Promise<ProjectUndoAnswer>;
  /**
   * A page of the room's project built into one document (ADR 0223), for a view that writes it
   * under the page's policy: the phone's, and a frame through a tunnel. Refused in the server's
   * words, as `ServerRefused`. `signal` gives up on it: the page sheet closed before it came, so a
   * server through a tunnel sends no more of it.
   */
  readonly projectPage: (
    spaceId: string,
    path: string,
    at?: string,
    signal?: AbortSignal,
  ) => Promise<string>;
  /**
   * Where a frame loads that page from, the page door, when the device reaches its server
   * directly; nothing through a tunnel, where it asks for the document itself.
   */
  readonly projectPageUrl: (
    spaceId: string,
    path: string,
    at?: string,
  ) => Promise<string | undefined>;
  /**
   * React to a line a harness said, or say what went wrong with it (M3.4): a `feedback` the
   * harness hears, folded onto the line when it streams back. The line is busy until the
   * server answers.
   */
  readonly sendFeedback: (input: FeedbackInput) => void;
  /** Change the words of a line of one's own (M5.4). The line is busy until the server answers. */
  readonly editMessage: (input: LineInput & { readonly text: string }) => void;
  /** Take a line back (M5.4): one's own, or anyone's for the space's owner or an admin. */
  readonly deleteMessage: (input: LineInput & { readonly reason?: string | undefined }) => void;
  /** Pin a line to the top of its space, or let it go (M5.4). */
  readonly pinMessage: (input: LineInput) => void;
  readonly unpinMessage: (input: LineInput) => void;
  /**
   * Delete a line for the reader alone (ADR 0167): it leaves their screens at once, on every
   * device of theirs as the log tells them, and nobody else's room changes.
   */
  readonly hideMessage: (input: LineInput) => void;
  /** Undo `hideMessage`: the line is on the reader's screens again, at once. */
  readonly showMessage: (input: LineInput) => void;
  /**
   * Open a thread from a line (M5.4), and return its id — the thread already grown from the
   * line, when there is one, since a message roots one thread. The id is minted here, as a
   * space's is, so a retry opens the same thread.
   */
  readonly openThread: (input: ThreadInput) => string;
  /** Search messages and receipts in the reader's spaces (M5.4), newest first, by page. */
  readonly search: (input: SearchInput) => Promise<SearchPage>;
  /**
   * Add harness, Custom (M1.6): registers the harness, gets its token — shown once, never kept
   * here — and the direct space it may speak in, then refreshes the directory so the
   * new name resolves.
   */
  readonly addHarness: (input: AddHarnessInput) => Promise<AddedHarness>;
  /**
   * A harness's tokens (ADR 0023): what it holds, another one, and withdrawing one. The list
   * never carries a token — Chips has only digests — and a new one is shown once, here, and
   * never kept.
   */
  readonly harnessTokens: (harnessId: string) => Promise<HarnessToken[]>;
  readonly issueHarnessToken: (harnessId: string, name: string) => Promise<IssuedHarnessToken>;
  readonly revokeHarnessToken: (harnessId: string, tokenId: string) => Promise<void>;
  /**
   * Change a person's role in the workspace (ADR 0034): a `role.changed` the door checks. The
   * person is busy until the server answers.
   */
  readonly changeRole: (input: ChangeRoleInput) => void;
  /**
   * Cap what may be attached here (ADR 0047): an `attachment.limits_set` an owner or an admin
   * sends, all three caps at once. The model carries them once the server has folded it back.
   */
  readonly setAttachmentCaps: (caps: AttachmentCaps) => void;
  /**
   * Set when Chips steps in on agents talking to each other (ADR 0187): an `exchange.limits_set`
   * an owner or an admin sends, the stop, the hold and the circles switch at once.
   */
  readonly setExchangeLimits: (limits: ExchangeLimits) => void;
  /** What the server takes at most, read when a screen needs to say so. */
  readonly serverLimits: () => Promise<ServerLimits>;
  /** Hand a harness to another person (M5.2): the registry moves, and the directory is read again. */
  readonly transferHarness: (harnessId: string, ownerId: string) => Promise<void>;
  /**
   * Change the name this person goes by (ADR 0082). Resolves once the server has it and the
   * directory is read again; rejects with the server's words for a name it refuses.
   */
  readonly rename: (displayName: string) => Promise<void>;
  /**
   * Name the workspace again (ADR 0194), an owner's alone. Resolves once the server has it, with
   * the snapshot's `workspaceName` already the new name; every other device is told by the
   * `workspace.renamed` it records. Rejects with the server's words for a name it refuses.
   */
  readonly renameWorkspace: (name: string) => Promise<void>;
  /**
   * Remove a harness from the workspace (ADR 0078): its tokens are withdrawn and it leaves every
   * list. Resolves once the server has done it and the directory is read again, so the lists have
   * already let it go; rejects with the server's reason, and nothing changes.
   */
  readonly removeHarness: (harnessId: string) => Promise<void>;
  /**
   * Say again what a harness takes (ADR 0046): the whole list, as `chips declare` sends it, by its
   * owner or a workspace owner or admin. Resolves once the server has it and the directory is read
   * again, so every control drawn for a capability follows; rejects with the server's reason.
   */
  readonly declareCapabilities: (
    harnessId: string,
    capabilities: readonly string[],
  ) => Promise<void>;
  /**
   * Remove a person from the workspace (ADR 0160): signed out everywhere, out of every room, their
   * harnesses handed to the reader. Resolves once the server has done it and the directory is
   * read again; rejects with the server's reason, and nothing changes.
   */
  readonly removePerson: (participantId: string) => Promise<void>;
  /**
   * Delete the reader's own account in this workspace (ADR 0243): they leave it on every device,
   * this one too, and an owner takes on their harnesses. Resolves once the server has done it,
   * with `connection` at `removed` and the snapshot's `deletedAccount`; rejects with the server's
   * reason (`only_owner` for the only owner), and nothing changes. Forgetting the workspace on
   * this device is the caller's, as after a sign-out or a removal.
   */
  readonly deleteAccount: () => Promise<void>;
  /**
   * Ask a harness to restart (ADR 0094): Chips sends the ask down its own connection, and the
   * harness runs its own restart. Resolves once the server has sent it, with the harness's state
   * already restarting here; every other device hears it by `presence`. Rejects with the server's
   * reason — it doesn't take restarts, nothing of it is connected — and nothing changes.
   */
  readonly restartHarness: (harnessId: string) => Promise<void>;
  /** An agent's context files, as its harness last sent them (ADR 0134): its harness's owner's. */
  readonly agentContext: (agentId: string) => Promise<AgentContextView>;
  /** A harness's own set: what its agents share, and what a new one starts with (ADR 0134). */
  readonly harnessContext: (harnessId: string) => Promise<HarnessContextView>;
  /**
   * Change a context file (ADR 0134): sent down its harness's socket, waiting until it answers.
   * Refused with `ServerRefused`: `stale_context` carrying the file as it is now (`body.file`), or
   * `harness_away` when nothing of the harness hears edits.
   */
  readonly editContext: (input: {
    readonly owner: "agent" | "harness";
    readonly id: string;
    readonly name: string;
    readonly text: string;
    readonly baseHash: string | null;
  }) => Promise<ContextEditView>;
  /** What became of an edit: waiting, saved, changed, failed, or missed after its minute. */
  readonly contextEdit: (editId: string) => Promise<ContextEditView>;
  /**
   * An agent's model and effort as its harness last sent them, with what became of the last
   * change (ADR 0140): its harness's owner's, or an owner's or admin's.
   */
  readonly readAgentModel: (agentId: string) => Promise<AgentModelView>;
  /**
   * Change an agent's model and effort, or both to its default (ADR 0140): sent down its harness's
   * socket, waiting until it answers. Refused with `ServerRefused`: `harness_away` when nothing of
   * the harness hears changes, `change_waiting` while the last one waits.
   */
  readonly changeAgentModel: (agentId: string, ask: ModelChangeAsk) => Promise<ModelChangeView>;
  /**
   * An agent's heartbeat as its harness last sent it, with what became of the last change (ADR
   * 0143): its harness's owner's, or an owner's or admin's.
   */
  readonly readAgentHeartbeat: (agentId: string) => Promise<AgentHeartbeatView>;
  /**
   * Switch an agent's heartbeat on or off, or change how often it beats (ADR 0143): sent down its
   * harness's socket, waiting until it answers. Refused with `ServerRefused`: `harness_away` when
   * nothing of the harness hears changes, `change_waiting` while the last one waits.
   */
  readonly changeAgentHeartbeat: (
    agentId: string,
    ask: HeartbeatChangeAsk,
  ) => Promise<HeartbeatChangeView>;
  /**
   * A harness's own jobs as it last sent them, with what each cost this week and what became of
   * its last change (ADR 0252): its owner's, or an owner's or admin's.
   */
  readonly readHarnessJobs: (harnessId: string) => Promise<HarnessJobsView>;
  /** One job's runs, newest first: since and before a time, `limit` at most (ADR 0252). */
  readonly readJobRuns: (
    harnessId: string,
    jobId: string,
    window?: { readonly since?: string; readonly before?: string; readonly limit?: number },
  ) => Promise<JobRunsView>;
  /**
   * Switch one of a harness's own jobs, or change how often it runs (ADR 0252): sent down its
   * socket, waiting until it answers. Refused with `ServerRefused`: `harness_away` when nothing of
   * the harness hears changes, `change_waiting` while the job's last one waits.
   */
  readonly changeHarnessJob: (
    harnessId: string,
    jobId: string,
    ask: JobChangeAsk,
  ) => Promise<JobChangeView>;
  /**
   * An agent's context window as its harness last sent it, with what became of the last limit
   * asked and the last Compact now (ADR 0146). Its harness's owner's, or an owner's or admin's.
   */
  readonly readAgentContextWindow: (agentId: string) => Promise<AgentContextWindowView>;
  /**
   * Change the limit an agent compacts itself at (ADR 0146): sent down its harness's socket and
   * answered by its next copy; read the copy again to see what became of it.
   */
  readonly changeAgentContextWindow: (
    agentId: string,
    ask: WindowLimitAsk,
  ) => Promise<WindowChangeView>;
  /** Ask an agent to compact its context now (ADR 0146), the same way. */
  readonly compactAgent: (agentId: string) => Promise<CompactionView>;
  /**
   * Join requests (ADR 0122). The waiting ones, read again; one by id, for a card that follows it;
   * a link for a harness, allowed already with what it may do; allowing a request with what it may
   * do, or a link again with something else; refusing one, or withdrawing a link. An owner's or
   * admin's. Each answer is on the snapshot's `joins` too.
   */
  readonly joinRequests: () => Promise<JoinRequest[]>;
  readonly joinRequest: (requestId: string) => Promise<JoinRequest>;
  readonly makeJoinLink: (
    capabilities: readonly string[],
  ) => Promise<{ readonly request: JoinRequest; readonly link: string }>;
  /**
   * Allow a request with what it may do; a device's with the code it shows, typed (SEC-6), and,
   * from an owner, the person already here it is paired as (ADR 0206). Absent: as this person.
   */
  readonly allowJoin: (
    requestId: string,
    capabilities: readonly string[],
    code?: string,
    as?: string,
  ) => Promise<JoinRequest>;
  readonly denyJoin: (requestId: string) => Promise<JoinRequest>;
  /** Invites (ADR 0034): what exists, one more, one fewer. An owner's or admin's. */
  readonly invites: () => Promise<Invite[]>;
  readonly createInvite: (input: CreateInviteInput) => Promise<IssuedInvite>;
  readonly revokeInvite: (inviteId: string) => Promise<void>;
  /**
   * Into a space by its link, for somebody already in the workspace (ADR 0168): put there as the
   * link's maker would add them, and the link stays unused. Says whether they were there already.
   */
  readonly enterByInvite: (
    token: string,
  ) => Promise<{ readonly spaceId: string; readonly already: boolean }>;
  /** This person's passkeys and devices (ADR 0034), and withdrawing one. */
  readonly passkeys: () => Promise<Passkey[]>;
  readonly revokePasskey: (passkeyId: string) => Promise<void>;
  readonly devices: () => Promise<PairedDeviceRecord[]>;
  /** Somebody's devices, for an owner or an admin: a person's page lists them (ADR 0209). */
  readonly personDevices: (personId: string) => Promise<PairedDeviceRecord[]>;
  readonly revokeDevice: (deviceId: string) => Promise<void>;
  /** Which machine Chips runs on, and how far it reaches (ADR 0170): the welcome and the setup card. */
  readonly serverFacts: () => Promise<ServerFacts>;
  /** The gallery's cards from the docs (ADR 0171); none when the server has none to hand out. */
  readonly connectors: () => Promise<Connector[]>;
  /**
   * A pairing code for another device, from this one (M4.1): what `chips pair --issue` does,
   * with what the server offers beside it — its relay and its tunnel key — so a screen can draw
   * the QR a phone reads. From an owner, `forId` names somebody already here whose phone is new:
   * the code pairs a device as them (ADR 0206).
   */
  /** A code for another device: as `forId` (ADR 0206), in the place of `replaces` (ADR 0236). */
  readonly issuePairingCode: (forId?: string, replaces?: string) => Promise<IssuedPairingCode>;
  /**
   * The person's notification settings (M5.6): read once from the server and kept; the
   * defaults until then, and until they save any. `saveNotificationSettings` replaces them on
   * the server and here, and every subscriber hears.
   */
  readonly notificationSettings: () => NotificationSettings;
  readonly loadNotificationSettings: () => Promise<NotificationSettings>;
  readonly saveNotificationSettings: (settings: NotificationSettings) => Promise<void>;
  /**
   * Claim keys before raising their banners: the answer is the keys this device may raise,
   * which another device of the same person has not claimed first — one notification per
   * event per person.
   */
  readonly claimNotifications: (keys: readonly string[]) => Promise<string[]>;
  /**
   * The visit this person pinned in a space, or nothing where they pinned none (ADR 0040).
   * Read from the server once, so a pin set at the desk holds on every device.
   */
  readonly sessionPin: (spaceId: string) => string | undefined;
  readonly loadSessionPins: () => Promise<void>;
  /**
   * The faces this person chose for their spaces, read from the server again now. The store reads
   * them itself — from the device's cache as it starts, from the server as it starts and at every
   * hello after (`readIcons`) — so nothing need call this but a test. `setSpaceIcon` with
   * `undefined` puts one back to the default — the initials, the harness's face, the hash.
   */
  readonly loadSpaceIcons: () => Promise<void>;
  readonly setSpaceIcon: (spaceId: string, icon: SpaceIcon | undefined) => Promise<void>;
  /**
   * The rooms this person hid, read from the server again now. The store reads them itself, as it
   * reads the faces, so nothing need call this but a test. `setSpaceHidden` hides a room or puts it
   * back on the list (ADR 0205): at once here, then the server is told; a refusal puts it back and
   * is thrown, so whoever asked can say why.
   */
  readonly loadHiddenSpaces: () => Promise<void>;
  readonly setSpaceHidden: (spaceId: string, hidden: boolean) => Promise<void>;
  /**
   * The rooms this person pinned, read from the server again now; the store reads them itself, as
   * it reads the rooms hidden. `setSpacePinned` pins a room to the top of the list or lets it go
   * back to its place (ADR 0240): at once here, then the server is told; a refusal puts it back and
   * is thrown.
   */
  readonly loadPinnedSpaces: () => Promise<void>;
  readonly setSpacePinned: (spaceId: string, pinned: boolean) => Promise<void>;
  /** Pin a visit for a space, or let it go with `undefined`. */
  readonly pinSession: (spaceId: string, sessionRef: string | undefined) => Promise<void>;
  /**
   * The connection is worth checking now — an app coming back to the foreground. On a phone
   * this is `AppState`, which is what it has instead of the browser's `online`/`offline`; the
   * transport wires those up itself, and cannot see this one.
   */
  readonly wake: () => void;
  /**
   * Leave the relay for the server's own network now, if it answers (ADR 0211): whether the
   * socket goes direct. Go direct asks this every few seconds while it waits on Tailscale.
   */
  readonly goDirect: () => Promise<boolean>;
  /**
   * One round trip to the server the way the socket goes now, in milliseconds: a signed read of
   * its health, timed (ADR 0211). The Connection page asks every few seconds while it is open.
   */
  readonly roundTrip: () => Promise<number>;
  /** Only direct on or off for this device, kept with it and told to the transport now. */
  readonly setOnlyDirect: (on: boolean) => Promise<void>;
  /** A guest asks the owners to share the server in Tailscale, with their round trip now. */
  readonly askToGoDirect: (tripMs?: number) => Promise<DirectAsk>;
  /** This person's own newest ask, read again: whether an owner has shared, and the link. */
  readonly readMyDirectAsk: () => Promise<DirectAsk | undefined>;
  /** For an owner: the asks waiting, read again, and the link kept for the next guest. */
  readonly readDirectAsks: () => Promise<readonly DirectAsk[]>;
  /** For an owner: one ask, as a push names it. */
  readonly readDirectAsk: (askId: string) => Promise<DirectAsk>;
  /** For an owner: answer with Tailscale's share link, kept for the next guest or not. */
  readonly shareDirect: (askId: string, link: string, keep: boolean) => Promise<DirectAsk>;
  /** For an owner: forget the share link kept for the next guest. */
  readonly forgetKeptShareLink: () => Promise<void>;
  /**
   * For an owner (ADR 0211, Phase 4): the relay switch, and every device with its way in, read
   * again; turning it; and asking the people it would cut off to go direct first, which answers
   * how many were asked.
   */
  readonly readRelay: () => Promise<RelayFacts>;
  readonly setRelay: (on: boolean) => Promise<RelayFacts>;
  readonly askRelayedToGoDirect: () => Promise<number>;
  readonly close: () => void;
}

export interface ChangeRoleInput {
  readonly participantId: string;
  readonly role: WorkspaceRole;
  readonly reason?: string | undefined;
}

export interface Invite {
  readonly inviteId: string;
  readonly role: WorkspaceRole;
  readonly singleUse: boolean;
  readonly uses: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | undefined;
  /** The space it brings whoever opens it into (ADR 0168). */
  readonly spaceId: string | undefined;
}

export interface CreateInviteInput {
  readonly role: WorkspaceRole;
  readonly singleUse?: boolean | undefined;
  readonly expiresInSeconds?: number | undefined;
  /** A space's link (ADR 0168): whoever joins by it is put there, as you'd add them. */
  readonly spaceId?: string | undefined;
}

/** A fresh invite: the link is shown once, and Chips keeps only a digest of the token in it. */
export interface IssuedInvite {
  readonly inviteId: string;
  readonly role: WorkspaceRole;
  readonly singleUse: boolean;
  readonly url: string;
  readonly expiresAt: string;
  readonly spaceId: string | undefined;
}

export interface Passkey {
  readonly passkeyId: string;
  readonly name: string;
  readonly algorithm: number;
  readonly createdAt: string;
  readonly lastUsedAt: string | undefined;
  readonly revokedAt: string | undefined;
}

/** A code for another device, and what a phone needs beside it to reach the server anywhere. */
export interface IssuedPairingCode {
  readonly code: string;
  readonly expiresAt: string;
  /**
   * Where the server says it is on a network (ADR 0028): the address to build the QR around,
   * rather than the origin this page happens to have been served from. Absent from a server
   * older than this field, and the caller then falls back to what it can see.
   */
  readonly serverUrl: string | undefined;
  /** The relay the server dials out to, and the key it is known by there, when it has one. */
  readonly relay: string | undefined;
  readonly serverKey: string | undefined;
  /**
   * The code as one link to send a computer (ADR 0210): the relay's `/pair` page, or the server's
   * own page when it has no relay. Absent from a server older than the field.
   */
  readonly link?: string | undefined;
}

/**
 * Whether the server can push to a phone (ADR 0244): `ready`, or why not. With no access token
 * for Expo, or one Expo refused, a phone's switch can be on and nothing comes.
 */
export type ServerPushes = "ready" | "no_access_token" | "refused" | "failing";

const SERVER_PUSHES: readonly string[] = ["ready", "no_access_token", "refused", "failing"];

/**
 * Whether the server can't push to a phone at all, until whoever runs it changes something (ADR
 * 0244). `failing`, its last pushes not getting through, isn't that: it mends itself.
 */
export function serverCantPush(pushes: ServerPushes | undefined): boolean {
  return pushes === "no_access_token" || pushes === "refused";
}

/** The server as `GET /v1/server` says it (ADR 0170): the welcome and the setup card read it. */
export interface ServerFacts {
  readonly machine: string;
  readonly version: string;
  readonly publicUrl: string;
  readonly relay: { readonly url: string | undefined; readonly status: string };
  /** Absent from a server older than the field, which is taken to push as it always did. */
  readonly pushes?: ServerPushes | undefined;
}

export interface PairedDeviceRecord {
  readonly deviceId: string;
  readonly name: string;
  readonly pairedAt: string;
  readonly lastSeenAt: string | undefined;
  readonly revokedAt: string | undefined;
  /** True for the device this store is running on. */
  readonly current: boolean;
}

/** One credential a harness holds, as anyone but the harness can see it. */
export interface HarnessToken {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly lastUsedAt: string | undefined;
  readonly revokedAt: string | undefined;
}

export interface IssuedHarnessToken {
  readonly tokenId: string;
  readonly name: string;
  /** Shown once. */
  readonly token: string;
  readonly createdAt: string;
}

export interface AddHarnessInput {
  readonly name: string;
  /**
   * What its manifest declares (ADR 0046). Absent means `autonomy` — it takes the dial, as a
   * harness on the SDK does; the CLI's `connect custom` declares the same. Empty is for a harness
   * whose permission model is its own, which draws no dial that would change nothing it could
   * see (the app's checkbox, the CLI's `--no-dial`).
   */
  readonly capabilities?: readonly string[] | undefined;
}

export interface AddedHarness {
  readonly harnessId: string;
  readonly displayName: string;
  readonly token: string;
  readonly spaceId: string;
}

/**
 * A room of people, which has a name from the start; or a room a person asks a harness for (the
 * new space): direct when that harness is the only one in it, a group when others are added beside
 * it. The person names it from the + (ADR 0149), and the harness's claim keeps that name (the
 * server's `title_by`); one asked without a name is named by its harness when it claims it.
 */
export type CreateSpaceInput =
  | { readonly title: string; readonly kind?: "group" | "channel" | undefined }
  | {
      readonly kind: "direct" | "group";
      readonly askedOf: string;
      /**
       * The other harnesses asked with it, each answering with an agent of its own (ADR 0087's
       * addendum of 30 September); only the first names the room.
       */
      readonly alsoAskedOf?: readonly string[] | undefined;
      /** The person's name for it, which a claim does not change. */
      readonly title?: string | undefined;
    };

export interface MemberInput {
  readonly spaceId: string;
  readonly participantId: string;
  readonly kind: "person" | "harness" | "agent";
  /**
   * For a harness a room is asked of from the + (ADR 0150): the first name the device proposes
   * for its agent there. The server keeps it when nobody has it.
   */
  readonly agentName?: string | undefined;
}

export interface UpdateSpaceInput {
  readonly spaceId: string;
  readonly title?: string | undefined;
  readonly state?: "open" | "closed" | undefined;
}

/** A line, by its id — the event that carried the message — in its space (M5.4). */
export interface LineInput {
  readonly spaceId: string;
  readonly lineId: string;
}

/** A thread to open from a line (M5.4), or the one already grown from it. */
export interface ThreadInput extends LineInput {
  readonly title?: string | undefined;
}

/** What a search is asked (M5.4): the words, and where to carry on from. */
export interface SearchInput {
  readonly text: string;
  readonly cursor?: string | undefined;
  readonly spaceId?: string | undefined;
  readonly limit?: number | undefined;
}

/** One thing a search found: a message, or a receipt — a step of a run. */
export interface SearchHit {
  readonly kind: "message" | "receipt";
  readonly spaceId: string;
  readonly at: string;
  /** The words around the match; the match itself is between `SNIPPET_OPEN` and `SNIPPET_CLOSE`. */
  readonly snippet: string;
  /** `transcript` when the snippet is what was heard in a voice note, not what was typed. */
  readonly snippetFrom?: "transcript" | undefined;
  /** For a message: its line's id, and who said it. */
  readonly lineId?: string | undefined;
  readonly authorId?: string | undefined;
  /** For a receipt: the run and the step. */
  readonly runId?: string | undefined;
  readonly stepId?: string | undefined;
}

export interface SearchPage {
  readonly hits: readonly SearchHit[];
  readonly nextCursor: string | null;
}

/** The marks around a matched word in a snippet, as the server puts them. */
export const SNIPPET_OPEN = "\u{E000}";
export const SNIPPET_CLOSE = "\u{E001}";

/** A Not right? note the server turned away: what it said, and the server's reason (PM-4). */
export interface UnsentNote {
  readonly text: string;
  readonly reason: string;
}

/** A reaction, or a note about what went wrong, on a line a harness said (M3.4). */
export type FeedbackInput = {
  readonly spaceId: string;
  /** The line it is about, by its id — the event that carried the message. */
  readonly lineId: string;
} & (
  | { readonly kind: "reaction"; readonly reaction: string }
  | { readonly kind: "correction"; readonly text: string }
);

export interface StoreOptions {
  readonly device: Device;
  /**
   * Where the device is kept, so a relay its server names later is kept with it (ADR 0144). The
   * browser's IndexedDB by default; the phone hands in its own.
   */
  readonly deviceStorage?: DeviceStorage | undefined;
  /** Swapped in tests. Defaults to the real socket and IndexedDB. */
  readonly connect?: typeof connectSocket;
  /** Opens the cache under `cacheKey(device)`: the workspace and the server it was paired with (SEC-8). */
  readonly openCache?: (key: string) => Cache;
  /** Swapped in tests: the signed writes behind `addHarness` and the token screens. */
  readonly post?: typeof postJson;
  readonly get?: typeof getJson;
  /** A signed GET of a file's bytes; the tests' stands in for it. */
  readonly getBytes?: typeof getBytes;
  readonly remove?: typeof deleteJson;
  readonly put?: typeof putJson;
  readonly patch?: typeof patchJson;
  readonly now?: () => string;
  readonly randomKey?: () => string;
  /**
   * How a flush is scheduled. Defaults to the next animation frame, so however many events
   * arrive in one frame there is one rebuild and one render. A test flushes by hand.
   */
  readonly schedule?: (flush: () => void) => void;
  /** How long a silent socket is given before this client opens another. See the transport. */
  readonly silenceMs?: number | undefined;
  /**
   * Told of rooms erased from the server (ADR 0067), as this device last had them, once they are
   * gone from the model and the cache: what a device keeps beside the store — a draft, a file
   * kept on the phone, an answer queued to send — is the device's to let go of.
   */
  readonly onErased?: ((spaces: readonly Space[]) => void) | undefined;
  /**
   * Where the server of a workspace answers on the network now, as the app finds it for itself
   * (Bonjour on a phone): what the transport tries when the stored address stops answering and
   * nothing else reaches the server. Absent, it tries only what the server last said.
   */
  readonly findAddresses?: ((workspaceId: string) => Promise<readonly string[]>) | undefined;
  /**
   * Whether this app opens a room's folder, or runs its project, when another of the person's
   * devices asks (ADR 0225, ADR 0226): the Mac app's. Its socket then says `folders` in its hello,
   * and `onFolderAsk` hears each ask.
   */
  readonly folders?: boolean | undefined;
}

/**
 * Where a batch of events came from. Only the socket's move the cursor: a room's history read
 * over HTTP has the room's `seq`s, above and below the socket's position, and the cache's are
 * already in the cache.
 */
type Source = "cache" | "socket" | "history";

/** The rooms a batch erases (ADR 0067), each named by its `space.erased`. */
function erasedBy(events: readonly ClientEvent[]): string[] {
  const out: string[] = [];
  for (const event of events) {
    const erased = event["erased"];
    if (event.type !== "space.erased" || !Array.isArray(erased)) continue;
    for (const id of erased) if (typeof id === "string") out.push(id);
  }
  return out;
}

export function createStore(options: StoreOptions): Store {
  const { device } = options;
  const connect = options.connect ?? connectSocket;
  const post = options.post ?? postJson;
  const read = options.get ?? getJson;
  const remove = options.remove ?? deleteJson;
  const put = options.put ?? putJson;
  const patch = options.patch ?? patchJson;
  const cache = (options.openCache ?? openCache)(cacheKey(device));
  const now = options.now ?? (() => new Date().toISOString());
  const randomKey = options.randomKey ?? (() => crypto.randomUUID());
  const schedule = options.schedule ?? nextFrame;

  const seen = new Set<number>();
  /**
   * The fold keeps its place between flushes: each event is folded once, when it arrives, and a
   * flush freezes what changed rather than folding the log again (Phase 1 review, finding 1).
   */
  const fold = createFold({ selfId: device.participantId });
  /** Arrived since the last flush and not yet in the cache; written in one transaction. */
  let uncached: ClientEvent[] = [];
  /**
   * The highest `seq` the socket has delivered, seen before or not: what the cursor may claim
   * once everything up to it is in the cache.
   */
  let delivered = 0;
  /**
   * Where a relaunch resumes (ADR 0049): everything the socket delivered up to here is in the
   * cache. Moved only behind a batch that has landed, so a batch the cache lost holds it back
   * and is read again — and never read off the cache's contents, which a device's own
   * visibility riddles with gaps.
   */
  let cursor = 0;
  /** One cache write at a time, so a batch is known to be in before the cursor passes it. */
  let writing = false;
  const pending = new Map<string, PendingMessage>();
  /** The event each pending message went out as, by key: what a reload sends again. */
  const queued = new Map<string, OutboxEvent>();
  /** The pending set changed since the cache last held it. */
  let outboxDirty = false;
  /**
   * Commands sent and not yet answered, by idempotency key, with the approval or run each is
   * for: a decision, a pause, a resume, a stop, a steer.
   */
  const commands = new Map<string, string>();
  /** The last refusal of a command, by the id it was for, until the next command for that id. */
  const refusals = new Map<string, string>();
  /** Not right? notes on their way, by key: the line and the words, until the server answers. */
  const notes = new Map<string, { readonly lineId: string; readonly text: string }>();
  /** The notes it turned away, by line, until the next one on that line (PM-4). */
  const unsentNotes = new Map<string, UnsentNote>();
  /**
   * Lines deleted for oneself, or put back, on this device (ADR 0167), by line: shown that way at
   * once, and let go once the server has answered and the log says the same — not on the answer
   * alone, which may come before the event, nor on the log alone, which an Undo may not have
   * reached yet.
   */
  const hiding = new Map<string, Hiding & { readonly key: string; answered?: true }>();
  /**
   * People and agents taken out of a room from this device, by the removal's key: drawn out at
   * once, and let go once the log has them out, or put back when the server says no. Arjun took
   * Natalie out of Foodie on 19 October 2026 while his phone was still connecting over the relay:
   * the removal waited in the outbox, nothing on the sheet moved, and he asked twice more.
   */
  const takingOut = new Map<string, TakenOut>();
  /** A command on its way, for an id: busy until answered, and no longer refused. */
  const track = (key: string, id: string): void => {
    commands.set(key, id);
    refusals.delete(id);
  };
  /**
   * Changes to who is in a room, and to the room itself (ADR 0112), sent and not yet answered, by
   * key: the room each is for.
   */
  const memberships = new Map<string, string>();
  /** What the server said of the last such change it turned away, by room. */
  const roomNotices = new Map<string, string>();
  /**
   * Spaces made here that the server has not sent back yet, by id (ADR 0149's third addendum):
   * drawn from what was sent for them until its own `space.created` is folded, or it says no.
   */
  const madeHere = new Map<string, MadeHere>();
  /** The spaces made here changed since the cache last held them. */
  let madeHereDirty = false;
  /** What was sent for a space made here, as the event the server will send back. */
  const sentFor = (spaceId: string, event: OutboxEvent): void => {
    const made = madeHere.get(spaceId);
    const events = made?.events ?? [];
    const stamped = madeHereEvent(event, device, now(), events.length + 1);
    madeHere.set(spaceId, {
      key: made?.key ?? event.idempotency_key,
      events: [...events, stamped],
      sent: [...(made?.sent ?? []), event],
    });
    madeHereDirty = true;
  };
  const receipts = new Map<string, "queued" | "steered">();
  /** The person's notification settings, once read from the server (M5.6). */
  let settings: NotificationSettings | undefined;
  /** Which visit this person pinned in each space (ADR 0040); no entry means the harness chooses. */
  let pins: ReadonlyMap<string, string> = new Map();
  let spaceIcons: ReadonlyMap<string, SpaceIcon> = new Map();
  /** The faces chosen for rooms as the server holds them, and the picks on their way: `spaceIcons`. */
  const iconsHeld = onTheirWay<
    ReadonlyMap<string, SpaceIcon>,
    { readonly icon: SpaceIcon | undefined }
  >(withIcons, new Map(), (now) => {
    spaceIcons = now;
  });
  /**
   * Where `spaceIcons` came from: the cache as the store started, or the server. A face is not on
   * the log, so nothing replays it; without the cache a launch drew every room's initials until
   * the server answered, and for good when that one read failed (16 October 2026: his iPhone,
   * through the relay, after a fresh install, every room's picture gone to its letters).
   */
  let iconsFrom: "cache" | "server" | undefined;
  /** A read of them that failed before the socket was open: owed at the next hello. */
  let iconsOwed = false;
  /** The store's own tries after a read failed with the socket open. */
  let iconsRetries = 0;
  let iconsRetry: ReturnType<typeof setTimeout> | undefined;
  /** A read of them under way, and whether another was asked for while it was. */
  let iconsRead: Promise<void> | undefined;
  let iconsStale = false;
  /**
   * The rooms this person hid (ADR 0205), as the cache or the server last said, with the hides
   * still on their way drawn over them. Not on the log either, so the cache keeps them: without it
   * a launch would list a hidden room until the server answered.
   */
  let hiddenSpaces: ReadonlySet<string> = new Set();
  let hiddenFrom: "cache" | "server" | undefined;
  /** A read of them that failed: owed at the next hello, the cache's standing meanwhile. */
  let hiddenOwed = false;
  /** The rooms hidden as the server holds them, and the hides on their way: `hiddenSpaces`. */
  const hiddenHeld = onTheirWay<ReadonlySet<string>, { readonly hidden: boolean }>(
    withHiding,
    new Set(),
    (now) => {
      hiddenSpaces = now;
    },
  );
  /**
   * The rooms this person pinned (ADR 0240), newest first, as the cache or the server last said,
   * with the pins still on their way drawn over them; kept in the cache for the reason the rooms
   * hidden are, so a launch draws them on top at once.
   */
  let pinnedSpaces: readonly string[] = [];
  let pinnedFrom: "cache" | "server" | undefined;
  /** A read of them that failed: owed at the next hello, the cache's standing meanwhile. */
  let pinnedOwed = false;
  /** The rooms pinned as the server holds them, and the pins on their way: `pinnedSpaces`. */
  const pinnedHeld = onTheirWay<readonly string[], { readonly pinned: boolean }>(
    withPinning,
    [],
    (now) => {
      pinnedSpaces = now;
    },
  );
  /** Join requests this person may decide (ADR 0122), by id. */
  let joins: ReadonlyMap<string, JoinRequest> = new Map();
  let directory: Directory = {};
  /**
   * Who is who as the server holds it, and the faces chosen for agents and for you that it has
   * not answered for yet (ADRs 0089, 0139): `directory`. A read that lands meanwhile is from
   * before the choice, so it is drawn with the choice over it.
   */
  const facesHeld = onTheirWay<Directory, { readonly face: SpaceIcon | undefined }>(
    withFaces,
    {},
    (now) => {
      directory = now;
    },
  );
  /** One face is sent at a time, so two quick taps reach the server in the order they were made. */
  let faceWrites: Promise<void> = Promise.resolve();
  /** How many times the socket has said hello, so a reconnect is told from the first connect. */
  let hellos = 0;
  /**
   * Whether this connection still owes a read of the join requests waiting (ADR 0122). It is owed
   * from each hello, and paid once the person is known here: an owner on a fresh device folds
   * their own `person.joined` after the hello. Anybody may be asked, since a link's request waits
   * for whoever handed it out, whatever their role (ADR 0232); the server answers each with theirs.
   */
  let joinsOwed = false;
  /** The snapshot's `directAsks`, `keptShareLink` and `myDirectAsk` (ADR 0211, Phase 3). */
  let directAsks: ReadonlyMap<string, DirectAsk> = new Map();
  let keptShareLink: string | undefined;
  let myDirectAsk: DirectAsk | undefined;
  /** An owner's read of the asks, owed once per connection, as `joinsOwed` is. */
  let directOwed = false;
  // Names come from the directory fetched at connect. A lane can introduce a participant after
  // that — an ephemeral child, a specialist newly routed to — so an unknown id triggers one
  // refresh; `namesTried` stops a genuinely-absent id from asking again and again.
  const namesTried = new Set<string>();
  let namingRefresh = false;
  let connectedRefresh = false;
  let readState: ReadState = {};
  /**
   * How far the person has read is theirs, kept at the server (ADR 0262). These are this device's
   * marks the server has not taken yet: sent one write at a time, what moves meanwhile gathered
   * for the next, and owed to the next hello when a write fails.
   */
  const marksOwed = new Map<string, number>();
  let marksSending = false;
  /** A read of the person's marks that failed, owed to the next hello. */
  let marksReadOwed = false;
  /** False once the server has said it keeps no marks: an older one, counted from this device's. */
  let serverKeepsMarks = true;
  let connection: ConnectionState = "connecting";
  let link: LinkKind | undefined;
  /** The snapshot's `linkSince` and `linkBefore`. */
  let linkSince: string | undefined;
  let linkBefore: LinkStretch | undefined;
  /** The snapshot's `onlyDirect` and `wentDirect`, from the device record and kept there. */
  let onlyDirect = device.onlyDirect === true;
  let wentDirect = device.wentDirect === true;
  /** Until `start` has read the cache: the snapshot's `readingCache`. */
  let readingCache = true;
  /**
   * The rooms the last hello listed that the fold has not taken in yet, for the snapshot's
   * `awaiting`. A room leaves it when it first comes in and never comes back: one erased or left
   * afterwards is not on its way.
   */
  let awaiting: Set<string> | undefined;
  /** The snapshot's `lostAt`. */
  let lostAt: string | undefined;
  /** The snapshot's `rekeyed`. */
  let rekeyed = false;
  /** The snapshot's `deletedAccount`: asked of the server, and not refused. */
  let deletedAccount = false;
  /** The snapshot's `workspaceName`. */
  let workspaceName: string | undefined;
  /** The name kept with the device: as it paired, then as each change was remembered. */
  let keptName = device.workspaceName;
  /** The snapshot's `directoryFrom` and `directoryFailed`. */
  let directoryFrom: "cache" | "server" | undefined;
  let directoryFailed = false;
  /** A read that failed before the socket was open: owed at the next hello, and no failure. */
  let directoryOwed = false;
  /** The store's own tries after a read failed with the socket open and nobody known yet. */
  let directoryRetries = 0;
  let directoryRetry: ReturnType<typeof setTimeout> | undefined;
  /**
   * The spaces whose opening this store has folded, and the ones it is reading from the start.
   * Being added to a space live brings its events from then on; the room's history before that
   * is read once through `GET /v1/events?space_id=` (M3.3).
   */
  const opened = new Set<string>();
  const backfilling = new Set<string>();
  /**
   * The rooms this reader was taken out of, or left, while this store was listening. The fold
   * keeps what each said (JR-16); added back, the room is read again for what was said while they
   * were out, which the socket never sent them.
   */
  const leftHere = new Set<string>();
  /** The asks for a new agent made on this device (ADR 0108), until the agent each is for joins. */
  const askedHere = new Set<string>();

  let snapshot: Snapshot = {
    connection,
    link,
    model: emptyModel(),
    directory,
    readState,
    busy: new Set(),
    receipts: new Map(),
    spaceIcons,
    hiddenSpaces,
    pinnedSpaces,
    readingCache,
  };
  const listeners = new Set<(snapshot: Snapshot) => void>();
  /** Who hears the person's asks to open a room's folder here (ADR 0225), or run its project. */
  const folderListeners = new Set<(ask: FolderAsk) => void>();
  /** Who hears the person's Mac on a run of theirs (ADR 0226). */
  const runListeners = new Set<(spaceId: string, run: HeldRun) => void>();
  let flushQueued = false;

  /**
   * The model with the spaces made here that it does not have yet (ADR 0149's third addendum),
   * letting go of those it now has, which the cache then hears of.
   */
  const withMadeHereDrawn = (model: WorkspaceModel): WorkspaceModel => {
    if (settleMadeHere(madeHere, model)) madeHereDirty = true;
    return withMadeHere(model, madeHere, device.participantId);
  };

  const rebuild = () => {
    const model = fold.model();
    if (awaiting !== undefined) for (const space of model.spaces) awaiting.delete(space.id);
    const drawn = withMadeHereDrawn(model);
    snapshot = {
      connection,
      link,
      model: withTakenOut(
        withHidden(withPending(drawn, [...pending.values()]), settleHiding(drawn)),
        settleTakingOut(drawn),
      ),
      directory,
      readState,
      busy: new Set(commands.values()),
      receipts: new Map(receipts),
      refused: new Map(refusals),
      unsentNotes: new Map(unsentNotes),
      notices: new Map(roomNotices),
      spaceIcons,
      hiddenSpaces,
      pinnedSpaces,
      joins,
      directAsks,
      ...(keptShareLink === undefined ? {} : { keptShareLink }),
      ...(myDirectAsk === undefined ? {} : { myDirectAsk }),
      ...(workspaceName === undefined ? {} : { workspaceName }),
      ...gone(),
      ...onItsWay(),
    };
  };

  /** The snapshot's `deletedAccount`, once the removal it asked for has come. */
  const gone = (): Partial<Snapshot> =>
    deletedAccount && connection === "removed" ? { deletedAccount: true } : {};

  /** What the snapshot says of what is still to come: the cache, rooms, who is who, the socket. */
  const onItsWay = (): Partial<Snapshot> => ({
    ...(readingCache ? { readingCache } : {}),
    ...(awaiting === undefined ? {} : { awaiting: awaiting.size }),
    ...(directoryFrom === undefined ? {} : { directoryFrom }),
    ...(directoryFailed ? { directoryFailed } : {}),
    ...(lostAt === undefined ? {} : { lostAt }),
    ...(rekeyed ? { rekeyed } : {}),
    ...wayItGoes(),
  });

  /** Since when the socket has gone the way it goes, and the way before (ADR 0211). */
  const wayItGoes = (): Partial<Snapshot> => ({
    ...(linkSince === undefined ? {} : { linkSince }),
    ...(linkBefore === undefined ? {} : { linkBefore }),
    ...(onlyDirect ? { onlyDirect } : {}),
    ...(wentDirect ? { wentDirect } : {}),
  });

  /** The removals the log has caught up with go; what is left is laid over it. */
  const settleTakingOut = (model: WorkspaceModel): readonly TakenOut[] => {
    for (const [key, out] of takingOut) {
      const space = model.spaces.find((each) => each.id === out.spaceId);
      if (space?.members.includes(out.participantId) !== true) takingOut.delete(key);
    }
    return [...takingOut.values()];
  };

  /** The asks the log has caught up with go; what is left is laid over it. */
  const settleHiding = (model: WorkspaceModel): ReadonlyMap<string, Hiding> => {
    for (const [lineId, asked] of hiding) {
      if (asked.answered !== true) continue;
      const space = model.spaces.find((each) => each.id === asked.spaceId);
      const now = space?.hidden?.has(lineId) ?? false;
      if (space === undefined || now === asked.hidden) hiding.delete(lineId);
    }
    return hiding;
  };

  const notify = () => {
    // Coalesce a burst into one render: everything that arrives before the next frame becomes
    // one cache write, one rebuild and one call to each listener.
    if (flushQueued) return;
    flushQueued = true;
    schedule(() => {
      flushQueued = false;
      writeCache();
      if (outboxDirty) {
        outboxDirty = false;
        void cache.saveOutbox(unsent());
      }
      rebuild();
      // After the rebuild, which lets go of the spaces made here that the server has sent back.
      if (madeHereDirty) {
        madeHereDirty = false;
        void cache.saveMadeHere(keptSpaces(madeHere)).catch(() => undefined);
      }
      for (const listener of listeners) listener(snapshot);
    });
  };

  /**
   * A harness's state as the server says it now (ADR 0083), on it and on each of its agents, which
   * share it (ADR 0087): from the `presence` frame, or from an answer that carries it.
   */
  const heardState = (participantId: string, state: AgentState): void => {
    const held = facesHeld.held();
    const changed = Object.values(held).filter(
      (each) => each.id === participantId || each.harnessId === participantId,
    );
    if (changed.length === 0) return;
    facesHeld.heard({
      ...held,
      ...Object.fromEntries(changed.map((each) => [each.id, { ...each, state }])),
    });
    notify();
  };

  /**
   * A join request as the server says it now (ADR 0122): from the frame, or from an answer. A
   * request only moves on — waiting, allowed, then one of the ends — so an answer that arrives
   * after a frame saying more (Allow's answer, after the frame that says the key was collected)
   * leaves what is newer where it is.
   */
  const heardJoin = (request: JoinRequest): JoinRequest => {
    const held = joins.get(request.requestId);
    if (held !== undefined && joinStage(held.state) > joinStage(request.state)) return held;
    joins = new Map(joins).set(request.requestId, request);
    notify();
    return request;
  };

  /**
   * What waits for this person, read again: a request that came while the socket was down is
   * heard here. An owner or admin is answered with every harness's and device's, and anybody with
   * the links they handed out (ADR 0232); `payJoins` asks once the person is known.
   */
  const loadJoins = async (): Promise<JoinRequest[]> => {
    const asked = joins;
    const answer = await read<{ requests: JoinRequestView[] }>(device, "/v1/join?state=waiting");
    const waiting = answer.requests.map(joinRequestOf);
    const kept = [...joins.values()].filter((each) => each.state !== "waiting");
    // What a frame said while the read was out can be newer than its answer: a harness that asked
    // just after the server answered would otherwise be dropped with the waiting it replaces.
    const heard = [...joins.values()].filter((each) => asked.get(each.requestId) !== each);
    const now = new Map([...kept, ...waiting].map((each) => [each.requestId, each]));
    for (const each of heard) {
      const read = now.get(each.requestId);
      if (read === undefined || joinStage(each.state) >= joinStage(read.state)) {
        now.set(each.requestId, each);
      }
    }
    joins = now;
    notify();
    return waiting;
  };

  /** The read a connection owes, once the person is known here. */
  const payJoins = (): void => {
    if (!joinsOwed || myRole(fold.model(), device.participantId) === undefined) return;
    joinsOwed = false;
    void loadJoins().catch(() => undefined);
  };

  /** An ask as the server says it now, kept by its id. */
  const heardDirect = (ask: DirectAsk): DirectAsk => {
    directAsks = new Map(directAsks).set(ask.askId, ask);
    notify();
    return ask;
  };

  /** The asks waiting, read again by an owner: one that came while the socket was down. */
  const loadDirectAsks = async (): Promise<readonly DirectAsk[]> => {
    const answer = await read<{ asks: DirectAskView[]; kept_link: string | null }>(
      device,
      "/v1/direct-asks",
    );
    const waiting = answer.asks.map(directAskOf);
    directAsks = new Map(waiting.map((ask) => [ask.askId, ask]));
    keptShareLink = answer.kept_link ?? undefined;
    notify();
    return waiting;
  };

  /** The read a connection owes, for an owner alone: anybody else would be refused. */
  const payDirect = (): void => {
    if (!directOwed || myRole(fold.model(), device.participantId) !== "owner") return;
    directOwed = false;
    void loadDirectAsks().catch(() => undefined);
  };

  /** The messages still waiting for the server's word, with what to send again for each. */
  const unsent = (): QueuedMessage[] => {
    const out: QueuedMessage[] = [];
    for (const message of pending.values()) {
      const event = queued.get(message.key);
      if (message.failed === undefined && event !== undefined) out.push({ message, event });
    }
    return out;
  };

  /** A confirmed message leaves the queue too, and the cache hears of it on the next flush. */
  const pruneQueued = (): void => {
    for (const key of queued.keys()) {
      if (pending.has(key)) continue;
      queued.delete(key);
      outboxDirty = true;
    }
  };

  /**
   * A receipt says what Chips did with a message sent mid-run — queued for the harness, or
   * steered into it — and is worth showing until the harness has spoken since (Phase 3 review,
   * finding 10): a room full of answered questions saying QUEUED on each is noise. So a
   * harness's line in a space settles every receipt on the lines before it there.
   */
  const settleReceipts = (fresh: readonly ClientEvent[]): void => {
    if (receipts.size === 0) return;
    const spoken = fresh.filter(harnessSpoke);
    if (spoken.length === 0) return;
    const model = fold.model();
    for (const event of spoken) {
      const space = model.spaces.find((each) => each.id === event.space_id);
      for (const key of keysBefore(space?.lines ?? [], event.seq)) receipts.delete(key);
    }
  };

  /**
   * Write what the cache lacks, one batch at a time, and claim the cursor behind it. The claim
   * is `delivered` as it stood when the batch was taken: by then every event the socket had sent
   * was in the cache, in this batch, or in the batch before — which landed before this one was
   * taken, or was put back at the front of it. A batch that fails claims nothing and goes back
   * to the front of the queue for the next flush, so a relaunch meanwhile resumes from below it
   * and the server sends it again (the phone's cache, 11 September 2026; ADR 0049).
   */
  const writeCache = (): void => {
    if (writing || (uncached.length === 0 && delivered <= cursor)) return;
    writing = true;
    const batch = uncached;
    uncached = [];
    void persist(batch, delivered).then((landed) => {
      writing = false;
      // What arrived while this batch was going follows it. A failed batch waits for the next
      // flush instead, rather than knocking again at once on a cache that just refused it.
      if (landed) writeCache();
    });
  };

  /** One batch into the cache, then the cursor behind it. True when the batch landed. */
  async function persist(batch: readonly ClientEvent[], claim: number): Promise<boolean> {
    try {
      if (batch.length > 0) await cache.saveEvents(batch);
    } catch {
      uncached = [...batch, ...uncached];
      return false;
    }
    if (claim > cursor) {
      cursor = claim;
      // A lost cursor write costs a longer replay next time, and nothing else.
      await cache.saveCursor(claim).catch(() => undefined);
    }
    return true;
  }

  /**
   * Take in events from the cache, the socket, or a room's history read over HTTP. Only the last
   * two are new to the cache; only the socket's move `delivered`, since the cursor stands for
   * what the socket has sent.
   */
  const ingest = (incoming: readonly ClientEvent[], source: Source): void => {
    if (source === "socket") delivered = Math.max(delivered, highestSeqOf(incoming));
    const fresh = takeFresh(incoming, seen, pending);
    pruneQueued();
    if (fresh.length === 0) {
      // Nothing new to fold — a replay of what the cache already holds — but the cursor may now
      // stand higher than it was recorded, and the flush is where it is written.
      if (delivered > cursor) notify();
      return;
    }
    foldIn(fresh);
    settleReceipts(fresh);
    ensureNamed(fresh);
    readJoined(fresh, source);
    payJoins();
    payDirect();
    // A harness handed on (M5.2) or removed (ADR 0078): who owns it, and whether it is still
    // here, is the directory's to say, so it is read again.
    if (source !== "cache" && fresh.some(movesAgents)) {
      void loadDirectory();
    }
    if (source !== "cache") {
      noticeConnected(fresh);
      uncached.push(...fresh);
      heardRenames(fresh);
      // A room archived is pinned by nobody (ADR 0240's addendum): the server let its pins go as it
      // was archived, and so does this reader, so it is not on top again if it is unarchived. Heard
      // now and archived still: the cache and a history read replay archives undone since.
      forgetPinned(archivedNow(fresh));
    }
    notify();
  };

  /**
   * A message that is not to go after all. Three places hold it: the optimistic line, the cache's
   * outbox, and — before the socket ever existed — the early buffer. The socket's own outbox is
   * the fourth.
   */
  function withdraw(key: string): void {
    pending.delete(key);
    queued.delete(key);
    const waiting = early.findIndex((event) => event.idempotency_key === key);
    if (waiting !== -1) early.splice(waiting, 1);
    transport?.withdraw(key);
    outboxDirty = true;
  }

  /** Fold a batch, and let go of the rooms it erases, as they stood before it came. */
  function foldIn(fresh: readonly ClientEvent[]): void {
    const erasing = erasedBy(fresh);
    const rooms = roomsAmong(erasing);
    fold.push(fresh);
    if (erasing.length > 0) letGo(erasing, rooms);
  }

  /** The rooms, and their threads, as the model holds them now: what is about to be erased. */
  function roomsAmong(spaceIds: readonly string[]): Space[] {
    if (spaceIds.length === 0) return [];
    const ids = new Set(spaceIds);
    return fold
      .model()
      .spaces.filter(
        (space) =>
          ids.has(space.id) || (space.parentSpaceId !== undefined && ids.has(space.parentSpaceId)),
      );
  }

  /**
   * Everything this store holds for rooms erased from the server (ADR 0067), beyond the fold:
   * their events in the cache and on their way to it, messages still waiting to go into them,
   * where they were read to, which visit was pinned, the face chosen for each. A cache write
   * already under way can still land some of their events; the tombstone lands behind them, so
   * the next start forgets them again.
   */
  function letGo(spaceIds: readonly string[], rooms: readonly Space[]): void {
    const gone = new Set([...spaceIds, ...rooms.map((room) => room.id)]);
    for (const id of gone) {
      opened.delete(id);
      backfilling.delete(id);
      awaiting?.delete(id);
    }
    uncached = uncached.filter(
      (event) => event.space_id === undefined || !gone.has(event.space_id),
    );
    for (const message of [...pending.values()]) {
      if (gone.has(message.spaceId)) withdraw(message.key);
    }
    forgetMarks(gone);
    pins = new Map([...pins].filter(([id]) => !gone.has(id)));
    forgetIcons(gone);
    forgetHidden(gone);
    forgetPinned(gone);
    void cache.forgetSpaces([...gone]).catch(() => undefined);
    if (rooms.length > 0) options.onErased?.(rooms);
  }

  /**
   * The server's word on which spaces this credential is in, given as it connects. The cache
   * can hold a space left while this device was away — the one event a replay can never bring,
   * because the device is no longer in the space it belongs to — so whatever the server does
   * not list is forgotten here and dropped from the cache. And it can be missing the opening of
   * a space the server does list, which is read again (`readUnopened`). An older server lists
   * nothing, and nothing changes.
   */
  const reconcile = (hello: ClientEvent): void => {
    const said = hello["spaces"];
    if (!Array.isArray(said)) return;
    const kept = new Set(said.filter((id): id is string => typeof id === "string"));
    // Each hello says it again, after a sleep as after a launch; the rebuild takes out what is in.
    awaiting = new Set(kept);
    notify();
    const gone = fold.keepOnly(kept);
    if (gone.length > 0) {
      for (const id of gone) opened.delete(id);
      void cache.forgetSpaces(gone);
      notify();
    }
    readUnopened(kept);
  };

  /**
   * What the workspace is called now: what the hello says (ADR 0193), what a `workspace.renamed`
   * the socket brings says, and what the server answered a rename from here (ADR 0194). A device
   * is told the name once, when it pairs, so one renamed since is kept under its new name here
   * too, and is called by it from the next launch before the socket is open. Held against the
   * name last kept, not the one the device came with: renamed and named back while open, it
   * kept the middle name (Primal → Primal Space → Primal, 18 October 2026).
   */
  const heardName = (said: unknown): void => {
    if (typeof said !== "string" || said === "" || said === workspaceName) return;
    workspaceName = said;
    notify();
    if (said !== keptName) {
      keptName = said;
      void rememberWorkspaceName(device.deviceId, said, options.deviceStorage);
    }
  };

  /**
   * A rename the socket brought (a room's history holds none): the cache's are old news, which
   * the hello has already beaten.
   */
  const heardRenames = (fresh: readonly ClientEvent[]): void => {
    for (const event of fresh) if (event.type === "workspace.renamed") heardName(event["name"]);
  };

  /**
   * A space this reader was just added to, whose opening they have not seen, is read from its
   * beginning. Once per space at a time; a page that fails is tried again on the next join.
   */
  function readJoined(events: readonly ClientEvent[], source: Source): void {
    for (const event of events) {
      if (event.type === "space.created" && event.space_id !== undefined) {
        opened.add(event.space_id);
      }
      // Only what happens now: a leaving and a return the cache or a room's history replays are
      // whole already.
      if (source === "socket" && leavesMe(event, device.participantId)) {
        leftHere.add(event.space_id as string);
      }
    }
    for (const spaceId of joinedUnseen(events)) backfill(spaceId);
  }

  /**
   * A listed space this store never saw opened is read from its beginning, as a space just
   * joined is. A cache can lose a room's opening — a save that failed, a backfill that did not
   * finish — and the socket resumes above the highest event the cache holds, so nothing on it
   * would ever bring the opening back: the room folds as a glimpse of somebody else's and stays
   * off the list, with only its lanes' cards showing, in the room that routed them (Arjun's
   * iPhone, 11 September 2026). A store starting from nothing has nothing to heal — the replay
   * from zero brings every opening, and reading each room again on top of it would double it.
   */
  function readUnopened(listed: ReadonlySet<string>): void {
    if (cursor === 0) return;
    for (const spaceId of listed) {
      if (!opened.has(spaceId) && !backfilling.has(spaceId)) backfill(spaceId);
    }
  }

  /** Read a space from its beginning, one read per space at a time. */
  function backfill(spaceId: string): void {
    backfilling.add(spaceId);
    void readSpace(spaceId).finally(() => backfilling.delete(spaceId));
  }

  /** The spaces these events add this reader to, whose opening is not in hand or on its way. */
  function joinedUnseen(events: readonly ClientEvent[]): string[] {
    const wanted = new Set<string>();
    for (const event of events) {
      const spaceId = event.space_id;
      if (spaceId === undefined || !joinsMe(event, device.participantId)) continue;
      const back = leftHere.delete(spaceId);
      if ((!opened.has(spaceId) || back) && !backfilling.has(spaceId)) wanted.add(spaceId);
    }
    return [...wanted];
  }

  async function readSpace(spaceId: string): Promise<void> {
    let since = 0;
    try {
      for (let page = 0; page < MAX_BACKFILL_PAGES; page += 1) {
        const wire = await read<{ events: ClientEvent[]; next_cursor: number | null }>(
          device,
          `/v1/events?since=${since}&space_id=${encodeURIComponent(spaceId)}&limit=500`,
        );
        ingest(wire.events, "history");
        if (typeof wire.next_cursor !== "number") return;
        since = wire.next_cursor;
      }
    } catch {
      // The room arrives from its membership onwards, as it did before; history can be read
      // again on the next join or the next pairing.
    }
  }

  let transport: Transport | undefined;
  /**
   * Closed, for good. `start` is asynchronous, so a store closed while its cache is still loading
   * has no transport to close yet, and must not go on to open one: a second socket for the same
   * device, and through a relay a second tunnel, each closing the other's (CI, 13 September 2026).
   */
  let closed = false;
  /** Sent before the socket existed — the cache was still loading. Handed over when it does. */
  const early: OutboxEvent[] = [];

  const dispatch = (event: OutboxEvent): void => {
    if (transport === undefined) early.push(event);
    else transport.send(event);
  };

  /**
   * A change to who is in a room, or to the room, was answered. Turned away, the room says the
   * server's words, and who is where is read again: the lists that offered the change were drawn
   * from a directory a moment out of date, which is how it came to be sent.
   */
  const membershipAnswered = (key: string, refused?: string): void => {
    const spaceId = memberships.get(key);
    if (spaceId === undefined) return;
    memberships.delete(key);
    if (refused === undefined) return;
    takingOut.delete(key);
    roomNotices.set(spaceId, asSentence(refused));
    void loadDirectory();
  };

  /**
   * A deletion for oneself, or its Undo, was answered (ADR 0167). Taken, it waits for the log;
   * turned away, the line is as the log has it, and the room says why.
   */
  const hidingAnswered = (key: string, refused?: string): void => {
    for (const [lineId, asked] of hiding) {
      if (asked.key !== key) continue;
      if (refused === undefined) asked.answered = true;
      else {
        hiding.delete(lineId);
        roomNotices.set(asked.spaceId, asSentence(refused));
      }
    }
  };

  /**
   * A space made here, turned away: it goes from the list, and its room says why. Taken, it waits
   * for its own `space.created`, which may come after the answer, and is never sent again.
   */
  const madeHereAnswered = (key: string, refused?: string): void => {
    for (const [spaceId, made] of madeHere) {
      if (made.key !== key) continue;
      madeHereDirty = true;
      if (refused === undefined) {
        madeHere.set(spaceId, { ...made, taken: true });
        continue;
      }
      madeHere.delete(spaceId);
      roomNotices.set(spaceId, notMadeWords(refused));
    }
  };

  /** The server answered for a key, one way or the other: the command it was for is settled. */
  const answered = (key: string, refused?: string): void => {
    madeHereAnswered(key, refused);
    membershipAnswered(key, refused);
    hidingAnswered(key, refused);
    const note = notes.get(key);
    notes.delete(key);
    if (note !== undefined && refused !== undefined) {
      unsentNotes.set(note.lineId, { text: note.text, reason: refused });
    }
    const id = commands.get(key);
    commands.delete(key);
    const message = pending.get(key);
    if (message !== undefined && refused !== undefined) {
      pending.set(key, { ...message, failed: refused });
      // Refused is final: the line stays for the person, and the cache stops offering it.
      outboxDirty = true;
    } else if (id !== undefined && refused !== undefined) {
      refusals.set(id, refused);
    }
    notify();
  };

  /** A command on a run: sent through the outbox, and busy until the server answers for it. */
  const command = (input: RunInput, verb: string, extra: Record<string, unknown>): void => {
    const key = `run-${input.runId}-${verb}-${randomKey()}`;
    track(key, input.runId);
    dispatch({
      type: `run.${verb}`,
      space_id: input.spaceId,
      run_id: input.runId,
      ...extra,
      idempotency_key: key,
    });
    notify();
  };

  /** The spaces made here the cache kept: drawn again, before the cache is folded. */
  const keepMadeHere = (kept: readonly KeptSpace[]): void => {
    for (const { spaceId, ...made } of kept) {
      opened.add(spaceId);
      madeHere.set(spaceId, made);
    }
  };

  /**
   * And sent again, ahead of the messages written in them, unless the history the cache folded
   * already has them: the server had them before the app last went.
   */
  const sendMadeHereAgain = (kept: readonly KeptSpace[]): void => {
    if (kept.length === 0) return;
    const known = new Set(fold.model().spaces.map((space) => space.id));
    for (const { spaceId, sent } of kept) {
      if (known.has(spaceId)) continue;
      for (const event of sent) dispatch(event);
    }
  };

  /** What the cache says was still on its way: pending again, before the cache is folded. */
  const hold = (held: readonly QueuedMessage[]): void => {
    for (const { message, event } of held) {
      pending.set(message.key, message);
      queued.set(message.key, event);
    }
  };

  /**
   * Send again what folding the cache did not confirm — an echo already cached settles its key
   * on the way, so nothing goes twice. A steer is busy again until the server answers for it.
   */
  const resend = (held: readonly QueuedMessage[]): void => {
    for (const { message, event } of held) {
      if (!pending.has(message.key)) continue;
      const runId = event["run_id"];
      if (event["type"] === "run.steer" && typeof runId === "string") {
        commands.set(message.key, runId);
      }
      dispatch(event);
    }
    if (held.length > 0) {
      outboxDirty = true;
      notify();
    }
  };

  const start = async () => {
    // Where to resume is what the cache recorded, not what it holds: zero for a cache from
    // before the cursor was kept, which is read from the start once (ADR 0049).
    cursor = await cache.loadCursor();
    delivered = cursor;
    if (closed) return;
    // The way to the server is found while the history is read and folded, and the socket says
    // hello once it is, so what the server replays lands on it (ADR 0253): the round trips to the
    // server no longer wait behind the history.
    let historyFolded: () => void = () => undefined;
    const folded = new Promise<void>((resolve) => {
      historyFolded = resolve;
    });
    transport = connect({
      device,
      since: cursor,
      greetAfter: withFirstMarks(folded),
      ...(options.silenceMs === undefined ? {} : { silenceMs: options.silenceMs }),
      onState: (state) => {
        // The account is gone: nothing the socket does after says otherwise.
        if (deletedAccount && connection === "removed") return;
        if (state === "open") lostAt = undefined;
        else if (connection === "open") lostAt = now();
        connection = state;
        notify();
      },
      onLink: (kind) => {
        // A new way is a new stretch; the same way again, a reconnect, is the same one (ADR 0211).
        if (kind !== link) {
          const at = now();
          if (link !== undefined && linkSince !== undefined) {
            linkBefore = { kind: link, since: linkSince, until: at };
          }
          linkSince = at;
        }
        link = kind;
        if (kind !== "relay" && !wentDirect) {
          wentDirect = true;
          void rememberWentDirect(device.deviceId, options.deviceStorage);
        }
        notify();
      },
      onRelay: (relay) => void rememberRelay(device.deviceId, relay, options.deviceStorage),
      // Found at another address, held to its key: the next launch dials it first.
      onAddress: (url) => void rememberAddress(device.deviceId, url, options.deviceStorage),
      ...(options.findAddresses === undefined
        ? {}
        : { findAddresses: async () => (await options.findAddresses?.(device.workspaceId)) ?? [] }),
      // A first key, taken once by a device from before servers had keys (ADR 0191, Phase 3).
      onFirstKey: (named) => void rememberReach(device.deviceId, named, options.deviceStorage),
      // Not kept, not even for this session (SEC-2): said, so the person can pair again.
      onRekeyed: () => {
        if (rekeyed) return;
        rekeyed = true;
        notify();
      },
      // The hello is not an event of the log — it has no `seq` — but it says which spaces this
      // credential is in, which a cache cannot know on its own.
      onEvent: (event) => {
        if (event.type !== "hello") return ingest([event], "socket");
        reconcile(event);
        heardName((event["workspace"] as { name?: unknown } | undefined)?.name);
        // Every hello after the first is the socket come back — from a sleep, a lost network, the
        // app brought to the front — and what a harness declared it takes in the meantime is a
        // registry write with no event of its own (ADR 0046), so the directory is read again: a
        // harness that has just learnt to take new spaces gets its + without a relaunch.
        hellos += 1;
        // The first hello reads it again too when the launch's own read failed, as it does when
        // that read went out before the socket had found a way to the server.
        if (hellos > 1 || directoryOwed || directoryFailed) void loadDirectory();
        readThePersonAgain();
        // Join requests that waited while the socket was down (ADR 0122), and links that ask
        // (ADR 0232): read once per connect (PP-1), once the person is known.
        joinsOwed = true;
        payJoins();
        directOwed = true;
        payDirect();
      },
      // An ack is the answer for a send that does not echo, such as a decision; a message's
      // own line is confirmed by the event streaming back, which carries its key.
      onAck: (ack) => answered(ack.idempotencyKey),
      onError: (error) => {
        if (error.idempotencyKey !== undefined) answered(error.idempotencyKey, error.message);
      },
      onReceipt: (receipt) => {
        receipts.set(receipt.idempotencyKey, receipt.disposition);
        notify();
      },
      // Whether an agent can answer, as it changes (ADR 0083). One missed while the socket was
      // down is caught by the directory read again at the next hello.
      // A harness's agents share its state (ADR 0087): one frame, all of them.
      onPresence: ({ participantId, state }) => heardState(participantId, state),
      onJoin: (request) => heardJoin(joinRequestOf(request)),
      ...(options.folders === true
        ? {
            onFolderAsk: (ask: FolderAsk) => {
              for (const listen of folderListeners) listen(ask);
            },
          }
        : {}),
      onRunState: (spaceId, run) => {
        for (const listen of runListeners) listen(spaceId, run);
      },
      // How far the person read on another of their devices (ADR 0262).
      onReads: heardMarks,
    });
    for (const event of early.splice(0)) transport.send(event);
    try {
      await showCached();
    } finally {
      historyFolded();
    }
  };

  /**
   * Show cached history first, so an offline reload is not a blank screen, and the connection
   * started beside it (`start`).
   */
  const showCached = async () => {
    const cached = await cache.loadEvents();
    // The server's marks, read first on a device never sent anything, are kept over the cache's.
    readState = furthest(await cache.loadReadState(), readState);
    const held = await cache.loadOutbox();
    const made = await cache.loadMadeHere();
    const kept = await cache.loadParticipants();
    const keptIcons = await cache.loadSpaceIcons();
    const keptHidden = await cache.loadHiddenSpaces();
    const keptPinned = await cache.loadPinnedSpaces();
    if (closed) return;
    // Who is who, as the server last said, before the history that names them is folded: the
    // agents are listed and everybody named before the server answers, and without it. An answer
    // that landed while the cache was read (a tab asked for one) is newer, and stays.
    if (kept !== undefined && directoryFrom === undefined) {
      facesHeld.heard(directoryOf(kept));
      directoryFrom = "cache";
    }
    keptForThePerson(keptIcons, keptHidden, keptPinned);
    keepMadeHere(made);
    hold(held);
    ingest(cached, "cache");
    sendMadeHereAgain(made);
    resend(held);
    // Read, whatever it held: a list may now say what it has, including nothing.
    readingCache = false;
    notify();

    void loadDirectory();
    void loadIcons();
    void loadHidden();
    void loadPinned();
    if (cursor !== 0) void loadMarks();
  };

  /** A directory read under way, and whether another was asked for while it was. */
  let directoryRead: Promise<void> | undefined;
  let directoryStale = false;

  /**
   * Somebody's face chosen, an agent's (ADR 0089) or your own (ADR 0139). It changes first and the
   * server is told after, as a space's does: a tap that waits for the round trip looks like a tap
   * that did nothing. One write at a time, in the order they were chosen.
   */
  async function chooseFace(id: string, path: string, face: SpaceIcon | undefined): Promise<void> {
    const change = facesHeld.ask(id, { face });
    notify();
    const sent = faceWrites.then(async () => {
      if (face === undefined) await remove(device, path);
      else await put(device, path, face);
    });
    faceWrites = sent.catch(() => undefined);
    try {
      await sent;
    } catch (error) {
      if (change.refused()) notify();
      throw error;
    }
    if (change.taken()) notify();
  }

  /**
   * Who is who, read again. One read at a time: a read asked for while one is under way waits
   * for it and then reads once more, so a burst of agent events costs two reads and not one
   * each, and the answer kept is always the last one asked for, never whichever landed last
   * (agents review, finding 39).
   */
  function loadDirectory(): Promise<void> {
    if (directoryRead !== undefined) {
      directoryStale = true;
      return directoryRead;
    }
    directoryRead = (async () => {
      do {
        directoryStale = false;
        await readDirectory();
      } while (directoryStale);
    })().finally(() => {
      directoryRead = undefined;
    });
    return directoryRead;
  }

  async function readDirectory(): Promise<void> {
    try {
      const wire = await read<{ participants: WireParticipant[] }>(device, "/v1/participants");
      facesHeld.heard(directoryOf(wire.participants));
      directoryFrom = "server";
      directoryFailed = false;
      directoryOwed = false;
      directoryRetries = 0;
      notify();
      // Kept as it came, for the next launch to list and name everybody before the server answers.
      void cache.saveParticipants(wire.participants).catch(() => undefined);
    } catch {
      missedDirectory();
    }
  }

  /**
   * A read of the directory did not land. A room reads fine without names, showing shortened ids;
   * the Agents tab, which is nothing but this, says it could not be read (`agentsLook`), but only
   * once it is a failure: not before the socket is open, when the hello reads it again, and not
   * before the store has tried twice more itself while nobody is known.
   */
  function missedDirectory(): void {
    if (connection !== "open") {
      directoryOwed = true;
      return;
    }
    if (directoryFrom === undefined && directoryRetries < DIRECTORY_RETRIES) {
      directoryRetries += 1;
      clearTimeout(directoryRetry);
      directoryRetry = setTimeout(() => {
        if (!closed) void loadDirectory();
      }, DIRECTORY_RETRY_MS);
      return;
    }
    directoryFailed = true;
    notify();
  }

  /** The faces chosen for rooms, read again: one read at a time, as the directory is. */
  function loadIcons(): Promise<void> {
    if (iconsRead !== undefined) {
      iconsStale = true;
      return iconsRead;
    }
    iconsRead = (async () => {
      do {
        iconsStale = false;
        await readIcons();
      } while (iconsStale);
    })().finally(() => {
      iconsRead = undefined;
    });
    return iconsRead;
  }

  async function readIcons(): Promise<void> {
    try {
      const wire = await read<{ icons?: unknown }>(device, "/v1/me/space-icons");
      if (typeof wire.icons !== "object" || wire.icons === null) throw new Error("no icons");
      const icons = wire.icons as Record<string, unknown>;
      iconsHeld.heard(iconsOf(icons));
      iconsFrom = "server";
      iconsOwed = false;
      iconsRetries = 0;
      notify();
      void cache.saveSpaceIcons(icons).catch(() => undefined);
    } catch {
      missedIcons();
    }
  }

  /**
   * A read of the faces did not land. What the cache held stays, and nothing is said: a room
   * without its picture still reads. Before the socket is open the hello reads again; with it
   * open the store tries twice more itself, and after that the next hello does.
   */
  function missedIcons(): void {
    if (connection !== "open" || iconsRetries >= ICON_RETRIES) {
      iconsOwed = true;
      return;
    }
    iconsRetries += 1;
    clearTimeout(iconsRetry);
    iconsRetry = setTimeout(() => {
      if (!closed) void loadIcons();
    }, ICON_RETRY_MS);
  }

  /**
   * What the cache kept of what is the person's own and not on the log, unless the server has
   * answered first: the faces chosen for rooms, so the list draws them at once, and the rooms
   * hidden from it (ADR 0205), so a hidden room is never listed first, and the rooms pinned (ADR
   * 0240), so a pinned one is on top from the first draw.
   */
  function keptForThePerson(
    icons: Readonly<Record<string, unknown>> | undefined,
    hidden: readonly string[] | undefined,
    pinned: readonly string[] | undefined,
  ): void {
    if (icons !== undefined && iconsFrom === undefined) {
      iconsHeld.heard(iconsOf(icons));
      iconsFrom = "cache";
    }
    if (hidden !== undefined && hiddenFrom === undefined) {
      hiddenHeld.heard(new Set(hidden));
      hiddenFrom = "cache";
    }
    if (pinned !== undefined && pinnedFrom === undefined) {
      pinnedHeld.heard(pinned);
      pinnedFrom = "cache";
    }
  }

  /**
   * At a hello, what is the person's own is read again: a face picked on another device meanwhile
   * comes in at the reconnect, and so does a room hidden there (ADR 0205), which leaves this
   * device's list. A launch whose read failed reads again here.
   */
  function readThePersonAgain(): void {
    if (hellos > 1 || iconsOwed) void loadIcons();
    if (hellos > 1 || hiddenOwed) void loadHidden();
    if (hellos > 1 || pinnedOwed) void loadPinned();
    if (hellos > 1 || marksReadOwed) void loadMarks();
  }

  /**
   * The rooms this person hid, from the server (ADR 0205). A read that fails leaves the cache's
   * word standing and is owed to the next hello: a hidden room listed a while is no harm.
   */
  async function loadHidden(): Promise<void> {
    try {
      const wire = await read<{ spaces?: unknown }>(device, "/v1/me/hidden-spaces");
      if (!Array.isArray(wire.spaces)) throw new Error("no hidden spaces");
      const ids = wire.spaces.filter((id): id is string => typeof id === "string");
      hiddenHeld.heard(new Set(ids));
      hiddenFrom = "server";
      hiddenOwed = false;
      notify();
      keepHidden();
    } catch {
      hiddenOwed = true;
    }
  }

  /** The rooms hidden that are gone, let go here and in the cache. */
  function forgetHidden(gone: ReadonlySet<string>): void {
    if (![...hiddenSpaces].some((id) => gone.has(id))) return;
    hiddenHeld.heard(new Set([...hiddenHeld.held()].filter((id) => !gone.has(id))));
    hiddenSpaces = new Set([...hiddenSpaces].filter((id) => !gone.has(id)));
    keepHidden();
  }

  /**
   * The rooms hidden as the server holds them, kept for the next launch to list without them: not
   * a hide still on its way, which may yet be refused.
   */
  function keepHidden(): void {
    void cache.saveHiddenSpaces([...hiddenHeld.held()]).catch(() => undefined);
  }

  /**
   * The rooms this person pinned, from the server (ADR 0240), newest first. A read that fails
   * leaves the cache's word standing and is owed to the next hello, as the rooms hidden are.
   */
  async function loadPinned(): Promise<void> {
    try {
      const wire = await read<{ spaces?: unknown }>(device, "/v1/me/pinned-spaces");
      if (!Array.isArray(wire.spaces)) throw new Error("no pinned spaces");
      const ids = wire.spaces.filter((id): id is string => typeof id === "string");
      pinnedHeld.heard(ids);
      pinnedFrom = "server";
      pinnedOwed = false;
      notify();
      keepPinned();
    } catch {
      pinnedOwed = true;
    }
  }

  /** The rooms these events archive that stand archived now. */
  function archivedNow(events: readonly ClientEvent[]): ReadonlySet<string> {
    const archived = new Set<string>();
    const { spaces } = fold.model();
    for (const event of events) {
      if (event.type !== "space.updated" || event["state"] !== "closed") continue;
      const space = spaces.find((each) => each.id === event.space_id);
      if (space?.state === "closed") archived.add(space.id);
    }
    return archived;
  }

  /** The rooms pinned that are gone, let go here and in the cache. */
  function forgetPinned(gone: ReadonlySet<string>): void {
    if (!pinnedSpaces.some((id) => gone.has(id))) return;
    pinnedHeld.heard(pinnedHeld.held().filter((id) => !gone.has(id)));
    pinnedSpaces = pinnedSpaces.filter((id) => !gone.has(id));
    keepPinned();
  }

  /**
   * The rooms pinned as the server holds them, kept for the next launch to draw them on top: not
   * a pin still on its way, which may yet be refused.
   */
  function keepPinned(): void {
    void cache.savePinnedSpaces(pinnedHeld.held()).catch(() => undefined);
  }

  /**
   * How far the person has read, from the server (ADR 0262), taken where it is further than this
   * device's; and this device's marks further than the server's sent up, read here while out of
   * reach or before the server kept them. A read that fails is owed to the next hello; an older
   * server, which has no marks to give, is not asked again.
   */
  async function loadMarks(): Promise<void> {
    if (!serverKeepsMarks) return;
    try {
      const wire = await read<{ spaces?: unknown }>(device, "/v1/me/read");
      const marks = marksOf(wire.spaces);
      marksReadOwed = false;
      heardMarks(marks);
      owe(aheadOf(readState, marks, roomIds()));
    } catch (error) {
      if (statusOf(error) === 404) serverKeepsMarks = false;
      else marksReadOwed = true;
    }
  }

  /** The rooms this device holds, by id. */
  function roomIds(): Set<string> {
    return new Set(fold.model().spaces.map((space) => space.id));
  }

  /** Marks heard, from the server or another of the person's devices: forward only. */
  function heardMarks(marks: Readonly<Record<string, number>>): void {
    const next = furthest(readState, marks);
    if (next === readState) return;
    readState = next;
    void cache.saveReadState(readState).catch(() => undefined);
    notify();
  }

  /**
   * A device that has never been sent anything greets once it knows how far its person has read,
   * or a moment on (ADR 0262): its history is replayed onto those marks, and a room read on
   * another device is never counted unread here, not even for a frame.
   */
  function withFirstMarks(folded: Promise<void>): Promise<unknown> {
    if (cursor !== 0) return folded;
    const aMoment = new Promise((resolve) => setTimeout(resolve, MARKS_WAIT_MS));
    return Promise.all([folded, Promise.race([loadMarks(), aMoment])]);
  }

  /** Marks moved on this device, for the server to keep for the person. */
  function owe(marks: Readonly<Record<string, number>>): void {
    if (!serverKeepsMarks) return;
    oweAgain(marks);
    void sendMarks();
  }

  /** Owed, where further than what is owed already. */
  function oweAgain(marks: Readonly<Record<string, number>>): void {
    for (const [spaceId, seq] of Object.entries(marks)) {
      if (seq > (marksOwed.get(spaceId) ?? 0)) marksOwed.set(spaceId, seq);
    }
  }

  /** One write at a time, of what is owed, a write's worth at a time. */
  async function sendMarks(): Promise<void> {
    if (marksSending || marksOwed.size === 0 || closed) return;
    marksSending = true;
    const spaces = Object.fromEntries([...marksOwed].slice(0, READ_MARKS_MAX));
    for (const spaceId of Object.keys(spaces)) marksOwed.delete(spaceId);
    const goOn = await put(device, "/v1/me/read", { spaces }).then(
      () => true,
      (error: unknown) => markWriteFailed(error, spaces),
    );
    marksSending = false;
    if (goOn) void sendMarks();
  }

  /**
   * Whether to go on after a write of marks that failed. An older server, which keeps none, is not
   * written to again; marks it turned down as not marks are let go; marks that didn't get there are
   * owed again, and sent at the next hello or the next mark.
   */
  function markWriteFailed(error: unknown, spaces: Readonly<Record<string, number>>): boolean {
    const status = statusOf(error);
    if (status === 404) {
      serverKeepsMarks = false;
      return false;
    }
    if (status !== undefined && status < 500) return true;
    oweAgain(spaces);
    marksReadOwed = true;
    return false;
  }

  /** The marks of rooms that are gone, let go here, in the cache and from what is owed. */
  function forgetMarks(gone: ReadonlySet<string>): void {
    for (const id of gone) marksOwed.delete(id);
    const kept = Object.fromEntries(Object.entries(readState).filter(([id]) => !gone.has(id)));
    if (Object.keys(kept).length === Object.keys(readState).length) return;
    readState = kept;
    void cache.saveReadState(readState).catch(() => undefined);
  }

  /** The faces of rooms that are gone, let go here and in the cache. */
  function forgetIcons(gone: ReadonlySet<string>): void {
    const icons = new Map([...spaceIcons].filter(([id]) => !gone.has(id)));
    if (icons.size === spaceIcons.size) return;
    iconsHeld.heard(new Map([...iconsHeld.held()].filter(([id]) => !gone.has(id))));
    spaceIcons = icons;
    keepIcons();
  }

  /**
   * The faces the server took, kept for the next launch to draw before the server answers: not a
   * pick still on its way, which may yet be refused.
   */
  function keepIcons(): void {
    void cache.saveSpaceIcons(Object.fromEntries(iconsHeld.held())).catch(() => undefined);
  }

  /** The directory from the server's rows, or from the ones kept of its last answer. */
  function directoryOf(rows: readonly unknown[]): Directory {
    const entries = rows.filter(isWireParticipant).map((p) => [p.id, participantOf(p)] as const);
    return withForkNames(Object.fromEntries(entries));
  }

  /** A lane can name a participant the directory does not have yet; fetch it, once per id. */
  function ensureNamed(events: readonly ClientEvent[]): void {
    if (namingRefresh) return;
    const unknown = events.flatMap(namesIn).filter((id) => unnamed(id, directory, namesTried));
    if (unknown.length === 0) return;
    for (const id of unknown) namesTried.add(id);
    namingRefresh = true;
    void loadDirectory().finally(() => {
      namingRefresh = false;
    });
  }

  /**
   * A harness the directory says has never connected has spoken, so it has now (the OpenClaw
   * test, finding 18): the directory is read again, and its rooms stop saying it won't hear. One
   * read at a time, so the burst a harness says as it first connects asks once.
   */
  function noticeConnected(events: readonly ClientEvent[]): void {
    if (connectedRefresh) return;
    if (!events.some((event) => neverConnected(directory, event.actor.id))) return;
    connectedRefresh = true;
    void loadDirectory().finally(() => {
      connectedRefresh = false;
    });
  }

  void start();

  /**
   * A change to a line (M5.4): an edit, a deletion, a pin. Sent as the event named, on the
   * line's message; the line is busy until the server answers, and the change shows when the
   * event streams back, as feedback does.
   */
  const lineCommand = (
    input: LineInput,
    type: "message.edited" | "message.deleted" | "message.pinned" | "message.unpinned",
    extra: Record<string, unknown>,
  ): void => {
    const key = `${type}-${input.lineId}-${randomKey()}`;
    track(key, input.lineId);
    dispatch({
      type,
      space_id: input.spaceId,
      message_id: messageIdOf(input.lineId),
      ...extra,
      idempotency_key: key,
    });
    notify();
  };

  /** A line deleted for oneself, or put back (ADR 0167): shown so at once, then sent. */
  const forOneself = (input: LineInput, hidden: boolean): void => {
    const type = hidden ? "message.hidden" : "message.shown";
    const key = `${type}-${input.lineId}-${randomKey()}`;
    hiding.set(input.lineId, { spaceId: input.spaceId, hidden, key });
    dispatch({
      type,
      space_id: input.spaceId,
      message_id: messageIdOf(input.lineId),
      idempotency_key: key,
    });
    notify();
  };

  const api: Store = {
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,

    send(input) {
      const key = `msg-${randomKey()}`;
      pending.set(key, pendingSend(input, key, device.participantId, now()));
      const event = postEvent(input, key);
      queued.set(key, event);
      outboxDirty = true;
      dispatch(event);
      notify();
    },

    discard(key) {
      const message = pending.get(key);
      // A refused line is not withdrawn: it stays on screen to be read, and goes nowhere anyway.
      if (message === undefined || message.failed !== undefined) return;
      withdraw(key);
      notify();
    },

    // Each attempt has a key of its own: the server takes the first decision and refuses the
    // rest, so a retry must not look like the decision that already won.
    routeApproval(input) {
      const key = `${input.approvalId}-routed-${randomKey()}`;
      track(key, input.approvalId);
      dispatch({
        type: "approval.routed",
        space_id: input.spaceId,
        run_id: input.runId,
        approval_id: input.approvalId,
        to: [...input.to],
        ...(input.reason === undefined ? {} : { reason: input.reason }),
        idempotency_key: key,
      });
      notify();
    },

    resolveApproval(input) {
      const key = `${input.approvalId}-${input.decision}-${randomKey()}`;
      track(key, input.approvalId);
      dispatch({
        type: "approval.resolved",
        space_id: input.spaceId,
        run_id: input.runId,
        approval_id: input.approvalId,
        decision: input.decision,
        scope: input.scope ?? "once",
        ...(input.everywhere === true && input.scope === "always" ? { everywhere: true } : {}),
        ...(input.updatedInput === undefined ? {} : { updated_input: input.updatedInput }),
        ...(input.reason === undefined ? {} : { reason: input.reason }),
        idempotency_key: key,
      });
      notify();
    },

    answerQuestion(input) {
      const key = `${input.askId}-${randomKey()}`;
      track(key, input.askId);
      dispatch({
        type: "question.answered",
        space_id: input.spaceId,
        run_id: input.runId,
        ask_id: input.askId,
        answers: input.answers.map((each) => ({
          question_id: each.questionId,
          values: [...each.values],
          ...(each.freeText === undefined ? {} : { free_text: each.freeText }),
        })),
        idempotency_key: key,
      });
      notify();
    },

    setAutonomy(input) {
      const key = `policy-${input.harnessId}-${randomKey()}`;
      track(key, input.harnessId);
      dispatch({
        type: "policy.updated",
        ...(input.spaceId === undefined ? {} : { space_id: input.spaceId }),
        harness_id: input.harnessId,
        policy: { autonomy: input.level, rules: [...input.rules] },
        idempotency_key: key,
      });
      notify();
    },

    setRules(input) {
      const policy = fold.model().harnesses[input.harnessId];
      const level =
        (input.spaceId === undefined ? undefined : policy?.bySpace[input.spaceId]?.autonomy) ??
        policy?.autonomy ??
        1;
      const key = `policy-${input.harnessId}-${randomKey()}`;
      track(key, input.harnessId);
      dispatch({
        type: "policy.updated",
        ...(input.spaceId === undefined ? {} : { space_id: input.spaceId }),
        harness_id: input.harnessId,
        policy: { autonomy: level, rules: [...input.rules] },
        idempotency_key: key,
      });
      notify();
    },

    leaveSpace(input) {
      dispatch({
        type: "membership.removed",
        space_id: input.spaceId,
        participant_id: device.participantId,
        idempotency_key: `leave-${input.spaceId}-${device.participantId}`,
      });
      notify();
    },

    // The space's id is the client's to mint, as a run's is a harness's: the event names it,
    // so a retry after a reconnect opens the same room rather than a second one.
    createSpace(input) {
      const spaceId = newId("space");
      opened.add(spaceId);
      const event: OutboxEvent = {
        type: "space.created",
        space_id: spaceId,
        ...("askedOf" in input
          ? {
              kind: input.kind,
              asked_of: input.askedOf,
              ...(input.alsoAskedOf === undefined || input.alsoAskedOf.length === 0
                ? {}
                : { also_asked_of: input.alsoAskedOf }),
              ...(input.title === undefined ? {} : { title: input.title }),
            }
          : { kind: input.kind ?? "group", title: input.title }),
        idempotency_key: `space-${spaceId}`,
      };
      // Drawn at once from what was sent, until the server sends it back (ADR 0149's third
      // addendum): its room opens under the + window before the server has heard of it.
      sentFor(spaceId, event);
      dispatch(event);
      notify();
      return spaceId;
    },

    addMember(input) {
      const key = `add-${input.spaceId}-${input.participantId}-${randomKey()}`;
      memberships.set(key, input.spaceId);
      roomNotices.delete(input.spaceId);
      const event: OutboxEvent = {
        type: "membership.added",
        space_id: input.spaceId,
        participant_id: input.participantId,
        participant_kind: input.kind,
        role: "member",
        ...(input.agentName === undefined ? {} : { agent_name: input.agentName }),
        idempotency_key: key,
      };
      // Who is in a space made here is drawn with it, faces and all, until it is sent back.
      if (madeHere.has(input.spaceId)) sentFor(input.spaceId, event);
      dispatch(event);
      notify();
    },

    removeMember(input) {
      const key = `remove-${input.spaceId}-${input.participantId}-${randomKey()}`;
      memberships.set(key, input.spaceId);
      takingOut.set(key, { spaceId: input.spaceId, participantId: input.participantId });
      roomNotices.delete(input.spaceId);
      dispatch({
        type: "membership.removed",
        space_id: input.spaceId,
        participant_id: input.participantId,
        removed_by: device.participantId,
        idempotency_key: key,
      });
      notify();
    },

    dismissNotice(spaceId) {
      if (roomNotices.delete(spaceId)) notify();
    },

    updateSpace(input) {
      const key = `space-${input.spaceId}-${randomKey()}`;
      // Turned away, the room says why, as it does for a change to who is in it: a rename made
      // where the title stands has nowhere else to say it (ADR 0112).
      memberships.set(key, input.spaceId);
      roomNotices.delete(input.spaceId);
      dispatch({
        type: "space.updated",
        space_id: input.spaceId,
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.state === undefined ? {} : { state: input.state }),
        idempotency_key: key,
      });
      notify();
    },

    editMessage(input) {
      lineCommand(input, "message.edited", { text: input.text });
    },

    deleteMessage(input) {
      lineCommand(
        input,
        "message.deleted",
        input.reason === undefined ? {} : { reason: input.reason },
      );
    },

    pinMessage(input) {
      lineCommand(input, "message.pinned", {});
    },

    hideMessage(input) {
      forOneself(input, true);
    },

    showMessage(input) {
      forOneself(input, false);
    },

    unpinMessage(input) {
      lineCommand(input, "message.unpinned", {});
    },

    openThread(input) {
      const room = fold.model().spaces.find((space) => space.id === input.spaceId);
      const line = room?.lines.find((each) => each.id === input.lineId);
      if (line?.threadId !== undefined) return line.threadId;
      const threadId = newId("space");
      opened.add(threadId);
      dispatch({
        type: "space.created",
        space_id: threadId,
        kind: "thread",
        parent_space_id: input.spaceId,
        root_message_id: messageIdOf(input.lineId),
        ...(input.title === undefined ? {} : { title: input.title }),
        idempotency_key: `space-${threadId}`,
      });
      notify();
      return threadId;
    },

    async search(input) {
      const query = new URLSearchParams({ q: input.text });
      if (input.cursor !== undefined) query.set("cursor", input.cursor);
      if (input.spaceId !== undefined) query.set("space_id", input.spaceId);
      if (input.limit !== undefined) query.set("limit", String(input.limit));
      const wire = await read<{ hits: WireSearchHit[]; next_cursor: string | null }>(
        device,
        `/v1/search?${query.toString()}`,
      );
      // What the reader deleted for themselves is not found either (ADR 0167).
      const hidden = new Map(snapshot.model.spaces.map((space) => [space.id, space.hidden]));
      const hits = wire.hits
        .map(toSearchHit)
        .filter(
          (hit) => hit.lineId === undefined || hidden.get(hit.spaceId)?.has(hit.lineId) !== true,
        );
      return { hits, nextCursor: wire.next_cursor };
    },

    sendFeedback(input) {
      const key = `feedback-${input.lineId}-${randomKey()}`;
      track(key, input.lineId);
      unsentNotes.delete(input.lineId);
      if (input.kind === "correction") notes.set(key, { lineId: input.lineId, text: input.text });
      dispatch({
        type: "feedback",
        space_id: input.spaceId,
        message_id: messageIdOf(input.lineId),
        kind: input.kind,
        ...(input.kind === "reaction" ? { reaction: input.reaction } : { text: input.text }),
        idempotency_key: key,
      });
      notify();
    },

    pauseRun(input) {
      command(input, "pause", {});
    },

    resumeRun(input) {
      command(input, "resume", {});
    },

    stopRun(input) {
      command(input, "cancel", input.reason === undefined ? {} : { reason: input.reason });
    },

    // A steer is a message the person can see they sent, marked with how they meant it, and
    // confirmed the way a message is: by its own event streaming back with the same key.
    steerRun(input) {
      const key = `run-${input.runId}-steer-${randomKey()}`;
      track(key, input.runId);
      pending.set(key, {
        key,
        spaceId: input.spaceId,
        authorId: device.participantId,
        text: input.text,
        ts: now(),
        mode: input.mode,
      });
      const event: OutboxEvent = {
        type: "run.steer",
        space_id: input.spaceId,
        run_id: input.runId,
        mode: input.mode,
        text: input.text,
        idempotency_key: key,
      };
      queued.set(key, event);
      outboxDirty = true;
      dispatch(event);
      notify();
    },

    async addHarness({ name, capabilities }) {
      const added = await post<{
        harness_id: string;
        display_name: string;
        token: string;
        space_id: string;
      }>(device, "/v1/harnesses", {
        name,
        capabilities: capabilities ?? [HARNESS_CAPABILITIES.autonomy],
      });
      await loadDirectory();
      return {
        harnessId: added.harness_id,
        displayName: added.display_name,
        token: added.token,
        spaceId: added.space_id,
      };
    },

    async harnessTokens(harnessId) {
      const answer = await read<{ tokens: WireToken[] }>(
        device,
        `/v1/harnesses/${harnessId}/tokens`,
      );
      return answer.tokens.map((token) => ({
        id: token.id,
        name: token.name,
        createdAt: token.created_at,
        lastUsedAt: token.last_used_at ?? undefined,
        revokedAt: token.revoked_at ?? undefined,
      }));
    },

    async issueHarnessToken(harnessId, name) {
      const issued = await post<{
        token_id: string;
        name: string;
        token: string;
        created_at: string;
      }>(device, `/v1/harnesses/${harnessId}/tokens`, { name });
      return {
        tokenId: issued.token_id,
        name: issued.name,
        token: issued.token,
        createdAt: issued.created_at,
      };
    },

    async revokeHarnessToken(harnessId, tokenId) {
      await remove<unknown>(device, `/v1/harnesses/${harnessId}/tokens/${tokenId}`);
    },

    setAttachmentCaps(caps) {
      dispatch({
        type: "attachment.limits_set",
        image_bytes: caps.image,
        video_bytes: caps.video,
        file_bytes: caps.file,
        idempotency_key: `caps-${randomKey()}`,
      });
      notify();
    },

    setExchangeLimits(limits) {
      dispatch({
        type: "exchange.limits_set",
        stop: limits.stop,
        hold: limits.hold,
        circles: limits.circles,
        idempotency_key: `exchange-limits-${randomKey()}`,
      });
      notify();
    },

    async serverLimits() {
      const wire = await read<{ max_attachment_bytes: number; max_message_bytes: number }>(
        device,
        "/v1/limits",
      );
      return {
        maxAttachmentBytes: wire.max_attachment_bytes,
        maxMessageBytes: wire.max_message_bytes,
      };
    },

    changeRole(input) {
      const key = `role-${input.participantId}-${randomKey()}`;
      track(key, input.participantId);
      dispatch({
        type: "role.changed",
        participant_id: input.participantId,
        role: input.role,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
        idempotency_key: key,
      });
      notify();
    },

    async transferHarness(harnessId, ownerId) {
      await post<unknown>(device, `/v1/harnesses/${harnessId}/owner`, { owner_id: ownerId });
      await loadDirectory();
    },

    async rename(displayName) {
      await post<unknown>(device, `/v1/people/${device.participantId}/name`, {
        display_name: displayName,
      });
      await loadDirectory();
    },

    async renameWorkspace(name) {
      const answer = await post<{ readonly name?: unknown }>(device, "/v1/workspace/name", {
        name,
      });
      heardName(answer.name);
    },

    async removeHarness(harnessId) {
      await remove<unknown>(device, `/v1/harnesses/${encodeURIComponent(harnessId)}`);
      await loadDirectory();
    },

    async declareCapabilities(harnessId, capabilities) {
      await patch<unknown>(device, `/v1/harnesses/${encodeURIComponent(harnessId)}`, {
        capabilities,
      });
      await loadDirectory();
    },

    async removePerson(participantId) {
      await remove<unknown>(device, `/v1/people/${encodeURIComponent(participantId)}`);
      await loadDirectory();
    },

    async deleteAccount() {
      // Known before the answer: the server shuts this device's socket as it removes the person,
      // and that close can come first. A refusal takes it back.
      deletedAccount = true;
      try {
        await remove<unknown>(device, "/v1/people/me");
      } catch (error) {
        deletedAccount = false;
        throw error;
      }
      connection = "removed";
      notify();
    },

    agentContext: (agentId) =>
      read<AgentContextView>(device, `/v1/agents/${encodeURIComponent(agentId)}/context`),

    harnessContext: (harnessId) =>
      read<HarnessContextView>(device, `/v1/harnesses/${encodeURIComponent(harnessId)}/context`),

    editContext: ({ owner, id, name, text, baseHash }) =>
      post<ContextEditView>(
        device,
        `/v1/${owner === "agent" ? "agents" : "harnesses"}/${encodeURIComponent(id)}/context/edits`,
        { name, text, base_hash: baseHash },
      ),

    contextEdit: (editId) =>
      read<ContextEditView>(device, `/v1/context/edits/${encodeURIComponent(editId)}`),

    readAgentModel: (agentId) =>
      read<AgentModelView>(device, `/v1/agents/${encodeURIComponent(agentId)}/model`),

    changeAgentModel: (agentId, ask) =>
      post<ModelChangeView>(device, `/v1/agents/${encodeURIComponent(agentId)}/model/changes`, ask),

    readAgentHeartbeat: (agentId) =>
      read<AgentHeartbeatView>(device, `/v1/agents/${encodeURIComponent(agentId)}/heartbeat`),

    changeAgentHeartbeat: (agentId, ask) =>
      post<HeartbeatChangeView>(
        device,
        `/v1/agents/${encodeURIComponent(agentId)}/heartbeat/changes`,
        ask,
      ),

    readHarnessJobs: (harnessId) =>
      read<HarnessJobsView>(device, `/v1/harnesses/${encodeURIComponent(harnessId)}/jobs`),

    readJobRuns: (harnessId, jobId, window = {}) => {
      const query = new URLSearchParams();
      if (window.since !== undefined) query.set("since", window.since);
      if (window.before !== undefined) query.set("before", window.before);
      if (window.limit !== undefined) query.set("limit", String(window.limit));
      const search = query.size === 0 ? "" : `?${query.toString()}`;
      return read<JobRunsView>(
        device,
        `/v1/harnesses/${encodeURIComponent(harnessId)}/jobs/${encodeURIComponent(jobId)}/runs${search}`,
      );
    },

    changeHarnessJob: (harnessId, jobId, ask) =>
      post<JobChangeView>(
        device,
        `/v1/harnesses/${encodeURIComponent(harnessId)}/jobs/${encodeURIComponent(jobId)}/changes`,
        ask,
      ),

    readAgentContextWindow: (agentId) =>
      read<AgentContextWindowView>(
        device,
        `/v1/agents/${encodeURIComponent(agentId)}/context-window`,
      ),

    changeAgentContextWindow: (agentId, ask) =>
      post<WindowChangeView>(
        device,
        `/v1/agents/${encodeURIComponent(agentId)}/context-window/changes`,
        ask,
      ),

    compactAgent: (agentId) =>
      post<CompactionView>(
        device,
        `/v1/agents/${encodeURIComponent(agentId)}/context-window/compactions`,
        {},
      ),

    async restartHarness(harnessId) {
      const answer = await post<{ state?: AgentState }>(
        device,
        `/v1/harnesses/${encodeURIComponent(harnessId)}/restart`,
        {},
      );
      if (answer.state !== undefined) heardState(harnessId, answer.state);
    },

    async invites() {
      const answer = await read<{ invites: WireInvite[] }>(device, "/v1/invites");
      return answer.invites.map((invite) => ({
        inviteId: invite.invite_id,
        role: invite.role,
        singleUse: invite.single_use,
        uses: invite.uses,
        createdBy: invite.created_by,
        createdAt: invite.created_at,
        expiresAt: invite.expires_at,
        revokedAt: invite.revoked_at ?? undefined,
        spaceId: invite.space_id ?? undefined,
      }));
    },

    joinRequests: loadJoins,

    async joinRequest(requestId) {
      const answer = await read<{ request: JoinRequestView }>(device, `/v1/join/${requestId}`);
      return heardJoin(joinRequestOf(answer.request));
    },

    async makeJoinLink(capabilities) {
      const made = await post<{ request: JoinRequestView; link: string }>(
        device,
        "/v1/join/links",
        { capabilities: [...capabilities] },
      );
      return { request: heardJoin(joinRequestOf(made.request)), link: made.link };
    },

    async allowJoin(requestId, capabilities, code, as) {
      const answer = await post<{ request: JoinRequestView }>(
        device,
        `/v1/join/${requestId}/allow`,
        {
          capabilities: [...capabilities],
          ...(code === undefined ? {} : { code }),
          ...(as === undefined ? {} : { as }),
        },
      );
      return heardJoin(joinRequestOf(answer.request));
    },

    async denyJoin(requestId) {
      const answer = await remove<{ request: JoinRequestView }>(device, `/v1/join/${requestId}`);
      return heardJoin(joinRequestOf(answer.request));
    },

    async createInvite(input) {
      const issued = await post<{
        invite_id: string;
        role: WorkspaceRole;
        single_use: boolean;
        url: string;
        expires_at: string;
        space_id?: string | null;
      }>(device, "/v1/invites", {
        role: input.role,
        ...(input.spaceId === undefined ? {} : { space_id: input.spaceId }),
        ...(input.singleUse === undefined ? {} : { single_use: input.singleUse }),
        ...(input.expiresInSeconds === undefined
          ? {}
          : { expires_in_seconds: input.expiresInSeconds }),
      });
      return {
        inviteId: issued.invite_id,
        role: issued.role,
        singleUse: issued.single_use,
        url: issued.url,
        expiresAt: issued.expires_at,
        spaceId: issued.space_id ?? undefined,
      };
    },

    async revokeInvite(inviteId) {
      await remove<unknown>(device, `/v1/invites/${inviteId}`);
    },

    async enterByInvite(token) {
      const entered = await post<{ space_id: string; already: boolean }>(
        device,
        "/v1/invites/enter",
        { token },
      );
      return { spaceId: entered.space_id, already: entered.already };
    },

    async passkeys() {
      const answer = await read<{ passkeys: WirePasskey[] }>(device, "/v1/passkeys");
      return answer.passkeys.map((passkey) => ({
        passkeyId: passkey.passkey_id,
        name: passkey.name,
        algorithm: passkey.algorithm,
        createdAt: passkey.created_at,
        lastUsedAt: passkey.last_used_at ?? undefined,
        revokedAt: passkey.revoked_at ?? undefined,
      }));
    },

    async revokePasskey(passkeyId) {
      await remove<unknown>(device, `/v1/passkeys/${passkeyId}`);
    },

    async devices() {
      const answer = await read<{ devices: WireDevice[] }>(device, "/v1/devices");
      return answer.devices.map(deviceRecord);
    },

    async personDevices(personId) {
      const path = `/v1/people/${encodeURIComponent(personId)}/devices`;
      const answer = await read<{ devices: WireDevice[] }>(device, path);
      return answer.devices.map(deviceRecord);
    },

    async revokeDevice(deviceId) {
      await remove<unknown>(device, `/v1/devices/${deviceId}`);
    },

    async serverFacts() {
      const answer = await read<{
        machine: string;
        version: string;
        public_url: string;
        relay: { url: string | null; status: string };
        pushes?: unknown;
      }>(device, "/v1/server");
      const pushes = answer.pushes;
      return {
        machine: answer.machine,
        version: answer.version,
        publicUrl: answer.public_url,
        relay: { url: answer.relay.url ?? undefined, status: answer.relay.status },
        ...(typeof pushes === "string" && SERVER_PUSHES.includes(pushes)
          ? { pushes: pushes as ServerPushes }
          : {}),
      };
    },

    async connectors() {
      // A server older than the gallery has no such route: the generic cards are the gallery then.
      const answer = await read<{ connectors?: unknown }>(device, "/v1/connectors").catch(() => ({
        connectors: [],
      }));
      return readConnectors(answer);
    },

    async issuePairingCode(forId, replaces) {
      const body = {
        ...(forId === undefined ? {} : { for: forId }),
        ...(replaces === undefined ? {} : { replaces }),
      };
      const issued = await post<{
        code: string;
        expires_at: string;
        server_url?: string | null;
        relay?: string | null;
        server_key?: string | null;
        link?: string | null;
      }>(device, "/v1/pairing-codes", Object.keys(body).length === 0 ? undefined : body);
      return {
        code: issued.code,
        expiresAt: issued.expires_at,
        serverUrl: issued.server_url ?? undefined,
        relay: issued.relay ?? undefined,
        serverKey: issued.server_key ?? undefined,
        link: issued.link ?? undefined,
      };
    },

    markRead(spaceId, seq) {
      const next = advanceRead(readState, spaceId, seq);
      if (next === readState) return;
      readState = next;
      void cache.saveReadState(readState);
      notify();
      owe({ [spaceId]: seq });
    },

    markSpacesRead(spaceIds) {
      const ids = new Set(spaceIds);
      const spaces = snapshot.model.spaces.filter((space) => ids.has(space.id));
      const next = advanceSpaces(readState, spaces);
      if (next === readState) return;
      readState = next;
      void cache.saveReadState(readState);
      notify();
      owe(aheadOf(readState, {}, ids));
    },

    notificationSettings() {
      return settings ?? DEFAULT_NOTIFICATION_SETTINGS;
    },

    async loadNotificationSettings() {
      const wire = await read<{ settings: NotificationSettings | null }>(
        device,
        "/v1/me/notifications",
      );
      settings = wire.settings === null ? DEFAULT_NOTIFICATION_SETTINGS : wire.settings;
      notify();
      return settings;
    },

    async saveNotificationSettings(next) {
      const wire = await put<{ settings: NotificationSettings }>(
        device,
        "/v1/me/notifications",
        next,
      );
      settings = wire.settings;
      notify();
    },

    sessionPin(spaceId) {
      return pins.get(spaceId);
    },

    async loadSessionPins() {
      const wire = await read<{ pins: { space_id: string; session_ref: string }[] }>(
        device,
        "/v1/me/pins",
      );
      pins = new Map(wire.pins.map((pin) => [pin.space_id, pin.session_ref]));
      notify();
    },

    async pinSession(spaceId, sessionRef) {
      const next = new Map(pins);
      if (sessionRef === undefined) {
        await remove(device, `/v1/me/pins/${spaceId}`);
        next.delete(spaceId);
      } else {
        await put(device, `/v1/me/pins/${spaceId}`, { session_ref: sessionRef });
        next.set(spaceId, sessionRef);
      }
      pins = next;
      notify();
    },

    loadSpaceIcons: () => loadIcons(),
    loadHiddenSpaces: () => loadHidden(),
    loadPinnedSpaces: () => loadPinned(),

    async eraseSpace(spaceId, options) {
      const answer = await remove<{ erased?: unknown }>(
        device,
        `/v1/spaces/${encodeURIComponent(spaceId)}`,
        options?.deleteAgent === true ? { delete_agent: true } : undefined,
      );
      const erased = Array.isArray(answer.erased)
        ? answer.erased.filter((id): id is string => typeof id === "string")
        : [spaceId];
      // Gone here at once, rather than when the socket brings the tombstone: the person who
      // erased it is looking at the list it was on.
      const rooms = roomsAmong(erased);
      fold.erase(erased);
      letGo(erased, rooms);
      notify();
    },

    async moveAgent(agentId, spaceId) {
      await post<unknown>(device, `/v1/agents/${encodeURIComponent(agentId)}/move`, {
        space_id: spaceId,
      });
      await loadDirectory();
    },

    async forkAgent(agentId, spaceId) {
      const path = `/v1/agents/${encodeURIComponent(agentId)}/fork`;
      // A room opened here a moment ago goes to the server through the outbox, which may not have
      // reached it yet: the ask waits for it, briefly, rather than being told there is no room.
      await afterRoom(opened.has(spaceId), () =>
        post<unknown>(device, path, { space_id: spaceId }),
      );
    },

    async askAgent(harnessId, spaceId, name) {
      const path = `/v1/spaces/${encodeURIComponent(spaceId)}/agents`;
      const body = { harness_id: harnessId, key: randomKey(), ...(name ? { name } : {}) };
      let askId: unknown;
      await afterRoom(opened.has(spaceId), async () => {
        askId = (await post<{ ask_id?: unknown }>(device, path, body)).ask_id;
      });
      if (typeof askId === "string") askedHere.add(askId);
    },

    takeArrival(spaceId) {
      const space = snapshot.model.spaces.find((each) => each.id === spaceId);
      if (space === undefined) return undefined;
      for (const askId of askedHere) {
        const agentId = space.made?.[askId];
        if (agentId === undefined) continue;
        askedHere.delete(askId);
        return handleIn(space, snapshot.directory, agentId);
      }
      return undefined;
    },

    async forkIntoNewRoom(agentId, title) {
      const spaceId = api.createSpace({ title });
      try {
        await api.forkAgent(agentId, spaceId);
        return spaceId;
      } catch (error) {
        // The room was made for a copy that is not coming. Left there, each try would leave
        // another empty room named after the copy.
        await api.eraseSpace(spaceId).catch(() => undefined);
        throw error;
      }
    },

    async askIntoNewRoom(harnessId, name) {
      const spaceId = api.createSpace({ title: name });
      try {
        await api.askAgent(harnessId, spaceId, name);
        return spaceId;
      } catch (error) {
        // As a fork's: an empty room named after an agent that is not coming is no use to anyone.
        await api.eraseSpace(spaceId).catch(() => undefined);
        throw error;
      }
    },

    async renameAgent(agentId, name) {
      await put<unknown>(device, `/v1/agents/${encodeURIComponent(agentId)}/name`, { name });
      await loadDirectory();
    },

    async setExchange(spaceId, state) {
      await post<unknown>(device, `/v1/spaces/${encodeURIComponent(spaceId)}/exchange`, { state });
    },

    async setLead(spaceId, agentId) {
      await post<unknown>(device, `/v1/spaces/${encodeURIComponent(spaceId)}/lead`, {
        agent_id: agentId,
      });
    },

    async setSpendCeiling(spaceId, usd) {
      await post<unknown>(device, `/v1/spaces/${encodeURIComponent(spaceId)}/spend-ceiling`, {
        usd,
      });
    },

    async setLock(spaceId, locked) {
      await post<unknown>(device, `/v1/spaces/${encodeURIComponent(spaceId)}/lock`, { locked });
    },

    async roomSpend(spaceId) {
      const answer = await read<Partial<JobSpend>>(
        device,
        `/v1/spaces/${encodeURIComponent(spaceId)}/spend`,
      );
      return {
        ceiling_usd: answer.ceiling_usd ?? DEFAULT_SPEND_CEILING_USD,
        spent_usd: answer.spent_usd ?? 0,
        since_seq: answer.since_seq ?? 0,
        uncounted_runs: answer.uncounted_runs ?? 0,
      };
    },

    async setAgentArchived(agentId, archived) {
      const state = archived ? "archived" : "active";
      await put<unknown>(device, `/v1/agents/${encodeURIComponent(agentId)}/state`, { state });
      await loadDirectory();
    },

    async setAgentLock(agentId, locked) {
      await post<unknown>(device, `/v1/agents/${encodeURIComponent(agentId)}/lock`, { locked });
      await loadDirectory();
    },

    async deleteAgent(agentId, options) {
      const answer = await remove<{ erased?: unknown }>(
        device,
        `/v1/agents/${encodeURIComponent(agentId)}`,
        options?.deleteRoom === true ? { delete_room: true } : undefined,
      );
      // Its room, erased with it, goes from here at once, as a room's own Delete does.
      const erased = Array.isArray(answer.erased)
        ? answer.erased.filter((id): id is string => typeof id === "string")
        : [];
      if (erased.length > 0) {
        const rooms = roomsAmong(erased);
        fold.erase(erased);
        letGo(erased, rooms);
      }
      await loadDirectory();
      notify();
    },

    setAgentFace: (agentId, face) =>
      chooseFace(agentId, `/v1/agents/${encodeURIComponent(agentId)}/face`, face),

    setMyFace: (face) =>
      chooseFace(
        device.participantId,
        `/v1/people/${encodeURIComponent(device.participantId)}/face`,
        face,
      ),

    refreshDirectory: () => loadDirectory(),

    async agentStays(agentId) {
      const answer = await read<{ readonly stays?: readonly WireStay[] }>(
        device,
        `/v1/agents/${encodeURIComponent(agentId)}/stays`,
      );
      return (answer.stays ?? []).map(stayOf);
    },

    async roomFiles(spaceId) {
      const answer = await read<{ readonly files?: readonly RoomFile[] }>(
        device,
        `/v1/spaces/${encodeURIComponent(spaceId)}/files`,
      );
      return (answer.files ?? []).map(listedFile);
    },

    async fileVersions(spaceId, name) {
      const answer = await read<{ readonly files?: readonly RoomFile[] }>(
        device,
        `/v1/spaces/${encodeURIComponent(spaceId)}/files?name=${encodeURIComponent(name)}`,
      );
      // A server from before ADR 0100 ignores `name` and lists every file: keep this one's.
      return (answer.files ?? []).filter((file) => file.name === name).map(listedFile);
    },

    async projectFiles(spaceId, at) {
      const query = at === undefined ? "" : `?at=${encodeURIComponent(at)}`;
      return await read<ProjectFilesAnswer>(
        device,
        `/v1/spaces/${encodeURIComponent(spaceId)}/project/files${query}`,
      );
    },

    async projectFile(spaceId, path, at, signal) {
      const query = `path=${encodeURIComponent(path)}${at === undefined ? "" : `&at=${encodeURIComponent(at)}`}`;
      return await (options.getBytes ?? getBytes)(
        device,
        `/v1/spaces/${encodeURIComponent(spaceId)}/project/file?${query}`,
        signal,
      );
    },

    async projectArchive(spaceId) {
      const { bytes } = await (options.getBytes ?? getBytes)(
        device,
        `/v1/spaces/${encodeURIComponent(spaceId)}/project/archive`,
      );
      return bytes;
    },

    async openFolderOnMac(spaceId) {
      return await post<ProjectFolderOpenAnswer>(
        device,
        `/v1/spaces/${encodeURIComponent(spaceId)}/project/folder/open`,
        {},
      );
    },

    async openPageOnMac(spaceId) {
      return await post<ProjectFolderOpenAnswer>(
        device,
        `/v1/spaces/${encodeURIComponent(spaceId)}/project/folder/open`,
        { what: "page" },
      );
    },

    onFolderAsk(listen) {
      folderListeners.add(listen);
      return () => {
        folderListeners.delete(listen);
      };
    },

    async runOnMac(spaceId, ask) {
      return await post<ProjectFolderOpenAnswer>(
        device,
        `/v1/spaces/${encodeURIComponent(spaceId)}/project/run`,
        ask,
      );
    },

    async projectRun(spaceId) {
      return await read<ProjectRunAnswer>(
        device,
        `/v1/spaces/${encodeURIComponent(spaceId)}/project/run`,
      );
    },

    async sayRun(spaceId, run) {
      await put<unknown>(device, `/v1/spaces/${encodeURIComponent(spaceId)}/project/run`, { run });
    },

    onRunState(listen) {
      runListeners.add(listen);
      return () => {
        runListeners.delete(listen);
      };
    },

    async projectToken(spaceId) {
      return await post<ProjectToken>(
        device,
        `/v1/spaces/${encodeURIComponent(spaceId)}/project/token`,
        {},
      );
    },

    async projectHistory(spaceId, path) {
      return await read<ProjectHistoryAnswer>(
        device,
        `/v1/spaces/${encodeURIComponent(spaceId)}/project/history?path=${encodeURIComponent(path)}`,
      );
    },

    async projectChange(spaceId, commit) {
      return await read<ProjectChangeAnswer>(
        device,
        `/v1/spaces/${encodeURIComponent(spaceId)}/project/changes/${encodeURIComponent(commit)}`,
      );
    },

    async projectPage(spaceId, path, at, signal) {
      const query = `path=${encodeURIComponent(path)}${at === undefined ? "" : `&at=${encodeURIComponent(at)}`}`;
      const { bytes } = await (options.getBytes ?? getBytes)(
        device,
        `/v1/spaces/${encodeURIComponent(spaceId)}/project/page?${query}`,
        signal,
      );
      return new TextDecoder().decode(bytes);
    },

    async projectPageUrl(spaceId, path, at) {
      return await projectPageUrl(device, spaceId, path, at);
    },

    async undoChange(spaceId, commit) {
      return await post<ProjectUndoAnswer>(
        device,
        `/v1/spaces/${encodeURIComponent(spaceId)}/project/undo`,
        { commit },
      );
    },

    async setSpaceIcon(spaceId, icon) {
      // The face changes first and the server is told after. Waiting for the round trip meant a
      // tap that looked like it did nothing — and a server that would not take it looked exactly
      // the same as one that had (the Chess Game space, 15 September 2026). A refusal puts the
      // face the server holds back and is thrown, so whoever asked can say why rather than
      // swallowing it.
      const change = iconsHeld.ask(spaceId, { icon });
      notify();
      try {
        if (icon === undefined) await remove(device, `/v1/me/space-icons/${spaceId}`);
        else await put(device, `/v1/me/space-icons/${spaceId}`, icon);
      } catch (error) {
        if (change.refused()) notify();
        throw error;
      }
      if (change.taken()) notify();
      keepIcons();
    },

    async setSpaceHidden(spaceId, hidden) {
      // Off the list, or back on it, first, and the server told after, as a face is (ADR 0205). A
      // refusal puts it back as the server holds it and is thrown.
      const change = hiddenHeld.ask(spaceId, { hidden });
      notify();
      const path = `/v1/me/hidden-spaces/${encodeURIComponent(spaceId)}`;
      try {
        if (hidden) await put(device, path, {});
        else await remove(device, path);
      } catch (error) {
        if (change.refused()) notify();
        throw error;
      }
      if (change.taken()) notify();
      keepHidden();
    },

    async setSpacePinned(spaceId, pinned) {
      // On top, or back in its place, first, and the server told after, as a hide is (ADR 0240). A
      // refusal puts the pins back as the server holds them, the room where it stood, and is thrown.
      const change = pinnedHeld.ask(spaceId, { pinned });
      notify();
      const path = `/v1/me/pinned-spaces/${encodeURIComponent(spaceId)}`;
      try {
        if (pinned) await put(device, path, {});
        else await remove(device, path);
      } catch (error) {
        if (change.refused()) notify();
        throw error;
      }
      if (change.taken()) notify();
      keepPinned();
    },

    async claimNotifications(keys) {
      if (keys.length === 0) return [];
      const wire = await post<{ granted: string[] }>(device, "/v1/me/notifications/claims", {
        keys: [...keys],
      });
      return wire.granted;
    },

    wake() {
      transport?.wake();
    },

    async goDirect() {
      return (await transport?.goDirect()) ?? false;
    },

    async roundTrip() {
      const started = Date.now();
      await read(device, "/v1/health");
      return Date.now() - started;
    },

    async askToGoDirect(tripMs) {
      const view = await post<DirectAskView>(
        device,
        "/v1/direct-asks",
        tripMs === undefined ? {} : { trip_ms: tripMs },
      );
      myDirectAsk = directAskOf(view);
      notify();
      return myDirectAsk;
    },

    async readMyDirectAsk() {
      const answer = await read<{ ask: DirectAskView | null }>(device, "/v1/direct-asks/mine");
      myDirectAsk = answer.ask === null ? undefined : directAskOf(answer.ask);
      notify();
      return myDirectAsk;
    },

    readDirectAsks: loadDirectAsks,

    async readDirectAsk(askId) {
      const view = await read<DirectAskView & { kept_link: string | null }>(
        device,
        `/v1/direct-asks/${encodeURIComponent(askId)}`,
      );
      keptShareLink = view.kept_link ?? undefined;
      return heardDirect(directAskOf(view));
    },

    async shareDirect(askId, link, keep) {
      const view = await post<DirectAskView>(
        device,
        `/v1/direct-asks/${encodeURIComponent(askId)}/share`,
        { link, keep },
      );
      const shared = directAskOf(view);
      keptShareLink = keep ? shared.link : undefined;
      return heardDirect(shared);
    },

    async forgetKeptShareLink() {
      await remove<unknown>(device, "/v1/direct-asks/kept-link");
      keptShareLink = undefined;
      notify();
    },

    async readRelay() {
      return relayFactsOf(await read<RelayView>(device, "/v1/relay"));
    },

    async setRelay(on) {
      return relayFactsOf(await put<RelayView>(device, "/v1/relay", { on }));
    },

    async askRelayedToGoDirect() {
      return (await post<{ asked: number }>(device, "/v1/relay/ask", {})).asked;
    },

    async setOnlyDirect(on) {
      onlyDirect = on;
      notify();
      transport?.onlyDirect(on);
      await rememberOnlyDirect(device.deviceId, on, options.deviceStorage);
    },

    close() {
      closed = true;
      clearTimeout(directoryRetry);
      transport?.close();
      listeners.clear();
    },
  };
  return api;
}

/**
 * How many times the store reads the directory again itself, and how long it waits between, after
 * a read with the socket open did not land and nobody is known yet: a moment's hiccup through the
 * relay is not "Couldn't load your agents".
 */
const DIRECTORY_RETRIES = 2;
const DIRECTORY_RETRY_MS = 2000;
/** The faces chosen for rooms are tried as often, and as far apart, as the directory is. */
const ICON_RETRIES = DIRECTORY_RETRIES;
const ICON_RETRY_MS = DIRECTORY_RETRY_MS;

/**
 * How long a device never sent anything waits for its person's marks before it greets (ADR 0262):
 * a beat on the network it is on. Out of reach, it greets on time and counts from its own.
 */
const MARKS_WAIT_MS = 1500;

/** The status a failed read or write was answered with, when it was answered. */
function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | undefined)?.status;
  return typeof status === "number" ? status : undefined;
}

/** The server's marks as it gave them: each room's `seq`, a whole number from nought. */
function marksOf(wire: unknown): Record<string, number> {
  if (typeof wire !== "object" || wire === null || Array.isArray(wire)) {
    throw new Error("no marks");
  }
  const marks: Record<string, number> = {};
  for (const [spaceId, seq] of Object.entries(wire)) {
    if (typeof seq === "number" && Number.isInteger(seq) && seq >= 0) marks[spaceId] = seq;
  }
  return marks;
}

/**
 * The events in `incoming` this store has not seen, now marked seen. An event that carries the
 * key of a pending send is that send confirmed, so the pending line is dropped on the way.
 */
/** How long a fork asked for in a room opened here waits for the room to reach the server. */
const FORK_ROOM_TRIES = 20;
const FORK_ROOM_PAUSE_MS = 250;

/**
 * A request about a room, tried again while the server has not heard of a room this device just
 * opened: its `space.created` is on its way through the outbox. Any other answer is the answer.
 */
async function afterRoom(young: boolean, request: () => Promise<unknown>): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await request();
      return;
    } catch (error) {
      const said = error instanceof Error ? error.message : "";
      if (!young || attempt >= FORK_ROOM_TRIES || !/no room of that id/i.test(said)) throw error;
      await new Promise((settle) => setTimeout(settle, FORK_ROOM_PAUSE_MS));
    }
  }
}

/** Two hundred pages of five hundred: a room's history is read, not a workspace's log. */
const MAX_BACKFILL_PAGES = 200;

/**
 * Events that change a harness in the registry, which only the directory says: a new owner
 * (M5.2), or its removal (ADR 0078). Either one arriving has the directory read again.
 */
const REREAD_DIRECTORY: ReadonlySet<string> = new Set([
  "harness.transferred",
  "harness.removed",
  // A person removed from the workspace (ADR 0160): the directory marks them, and every list
  // leaves them out; the harnesses they owned have their new owner there too.
  "person.removed",
  "person.renamed",
  // A person's face (ADR 0139): the directory carries it, and every face of theirs is drawn again.
  "person.face_set",
  // Where an agent is, and whether it is archived (ADR 0087): the directory says, so the lists
  // that offer an agent, and the rooms that say where one went, read it again.
  "agent.registered",
  "agent.updated",
  // A person deleted an agent (ADR 0095): the directory marks it, and every list leaves it out.
  "agent.deleted",
  // A person locked an agent's changes or let them go (ADR 0199): the directory carries it.
  "agent.lock_set",
  "agent.attached",
  "agent.released",
  // A room deleted frees its agents, and the release that says so is their harness's alone: the
  // tombstone is what everybody is sent (agents review, findings 11 and 22).
  "space.erased",
]);

/**
 * Whether an event changes where agents are without saying so to this reader: a room archived or
 * unarchived releases its agents or takes them back, and the events that say which go to the
 * room's own members and the agents' harness. A reader of another room an agent went to reads
 * who is where again (agents review, finding 22).
 */
function movesAgents(event: ClientEvent): boolean {
  if (REREAD_DIRECTORY.has(event.type)) return true;
  return event.type === "space.updated" && typeof event["state"] === "string";
}

/** A server's reason as a sentence a person reads: a capital, and a full stop. */
/** Somebody taken out of a room from this device whom the log has not yet. */
interface TakenOut {
  readonly spaceId: string;
  readonly participantId: string;
}

/** The model with the people and agents on their way out of a room drawn out of it already. */
function withTakenOut(model: WorkspaceModel, outs: readonly TakenOut[]): WorkspaceModel {
  if (outs.length === 0) return model;
  return {
    ...model,
    spaces: model.spaces.map((space) => {
      const gone = outs.filter((out) => out.spaceId === space.id).map((out) => out.participantId);
      if (gone.length === 0) return space;
      const roles = Object.fromEntries(
        Object.entries(space.roles).filter(([id]) => !gone.includes(id)),
      );
      return { ...space, members: space.members.filter((id) => !gone.includes(id)), roles };
    }),
  };
}

/** A space made here that the server turned away, in its room: that it was not made, and why. */
function notMadeWords(refused: string): string {
  return `This space wasn't made. ${asSentence(refused)}`;
}

function asSentence(words: string): string {
  const capital = words.charAt(0).toUpperCase() + words.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}

/** True for the event that adds this reader to a space. */
/** A send as its line on its way draws it (`pending.ts`), until Chips sends the line back. */
function pendingSend(
  input: SendMessageInput,
  key: string,
  authorId: string,
  ts: string,
): PendingMessage {
  const { spaceId, text, attachments, to, addressedTo, addressedPeople, replyTo } = input;
  return {
    key,
    spaceId,
    authorId,
    text,
    ts,
    ...(attachments === undefined || attachments.length === 0 ? {} : { attachments }),
    ...aimedAt(to, addressedTo),
    ...(addressedPeople === undefined || addressedPeople.length === 0 ? {} : { addressedPeople }),
    ...(replyTo === undefined ? {} : { replyTo }),
  };
}

/** A send on the wire: `message.post`, under the key its line on its way holds. */
function postEvent(input: SendMessageInput, key: string): OutboxEvent {
  const { spaceId, text, attachments, sessionRef, to, replyTo } = input;
  return {
    type: "message.post",
    space_id: spaceId,
    text,
    ...(attachments === undefined || attachments.length === 0
      ? {}
      : { upload_ids: attachments.map((file) => file.id) }),
    ...(sessionRef === undefined ? {} : { session_ref: sessionRef }),
    ...(to === undefined ? {} : { to }),
    ...(replyTo === undefined ? {} : { reply_to: messageIdOf(replyTo) }),
    idempotency_key: key,
  };
}

/**
 * Where a line on its way says it goes (ADR 0081): the capsule's harnesses, and whether that was
 * everyone in the room, until Chips says for itself.
 */
function aimedAt(
  to: SendMessageInput["to"],
  addressedTo: SendMessageInput["addressedTo"],
): Pick<PendingMessage, "addressedTo" | "addressedToAll"> {
  return {
    ...(addressedTo === undefined ? {} : { addressedTo }),
    ...(to === "all" ? { addressedToAll: true as const } : {}),
  };
}

function joinsMe(event: ClientEvent, participantId: string): boolean {
  return event.type === "membership.added" && event["participant_id"] === participantId;
}

/** True for the event that takes this reader out of a space, by their hand or somebody's. */
function leavesMe(event: ClientEvent, participantId: string): boolean {
  return (
    event.type === "membership.removed" &&
    event.space_id !== undefined &&
    event["participant_id"] === participantId
  );
}

function takeFresh(
  incoming: readonly ClientEvent[],
  seen: Set<number>,
  pending: Map<string, PendingMessage>,
): ClientEvent[] {
  const fresh: ClientEvent[] = [];
  for (const event of incoming) {
    if (typeof event.seq !== "number" || seen.has(event.seq)) continue;
    seen.add(event.seq);
    fresh.push(event);
    const key = event["idempotency_key"];
    if (typeof key === "string") pending.delete(key);
  }
  return fresh;
}

/** The highest `seq` among these events, or zero: how far the socket has delivered. */
function highestSeqOf(events: readonly ClientEvent[]): number {
  let highest = 0;
  for (const event of events) {
    if (typeof event.seq === "number" && event.seq > highest) highest = event.seq;
  }
  return highest;
}

/**
 * The participant ids an event names, so an unknown one can be looked up. The actor of every
 * event, and — for a lane — the specialist, the lead, the person and each hop of the trail: the
 * ids a route or task card must put a name to.
 */
/** An id worth a directory refresh: a real participant, not yet named, not already tried. */
function unnamed(id: string, directory: Directory, tried: ReadonlySet<string>): boolean {
  return id !== "" && id !== "system" && directory[id] === undefined && !tried.has(id);
}

function namesIn(event: ClientEvent): string[] {
  const ids = [event.actor.id];
  for (const key of ["specialist_id", "requested_by", "on_behalf_of", "participant_id"] as const) {
    const value = event[key];
    if (typeof value === "string") ids.push(value);
  }
  const trail = event["trail"];
  if (Array.isArray(trail)) {
    for (const hop of trail) {
      const pid = (hop as { participant_id?: unknown }).participant_id;
      if (typeof pid === "string") ids.push(pid);
    }
  }
  return ids;
}

/** The decision keyed by its idempotency key, for a screen that wants to know what is busy. */
export function decisionKey(approvalId: string, decision: string): string {
  return `${approvalId}-${decision}`;
}

function emptyModel(): WorkspaceModel {
  return {
    spaces: [],
    fleet: [],
    needsYou: [],
    lanes: [],
    harnesses: {},
    audit: [],
    connections: {},
    people: {},
    attachmentCaps: NO_CAPS,
    exchangeLimits: DEFAULT_EXCHANGE_LIMITS,
    takenOut: {},
  };
}

/**
 * The next animation frame — or, in a tab the browser is not painting, a tick soon after, so a
 * hidden tab keeps its snapshot current too. Whichever comes first runs the flush, once.
 */
function nextFrame(flush: () => void): void {
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    flush();
  };
  const timer = setTimeout(once, 100);
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      clearTimeout(timer);
      once();
    });
  }
}

/** A token as `GET /v1/harnesses/:id/tokens` sends it. */
interface WireToken {
  readonly id: string;
  readonly name: string;
  readonly created_at: string;
  readonly last_used_at: string | null;
  readonly revoked_at: string | null;
}

/** The participant directory as `GET /v1/participants` sends it, in the wire's snake case. */
interface WireSearchHit {
  readonly kind: "message" | "receipt";
  readonly space_id: string;
  readonly at: string;
  readonly snippet: string;
  readonly snippet_from?: "transcript";
  readonly message_id?: string;
  readonly author_id?: string;
  readonly run_id?: string;
  readonly step_id?: string;
}

/** The keys of the lines said before a point in a space: whose receipts a later answer settles. */
function keysBefore(lines: readonly Line[], seq: number): string[] {
  return lines.flatMap((line) => (line.key !== undefined && line.seq < seq ? [line.key] : []));
}

/** A harness said something in a space: a message, or the summary that ends its run. */
function harnessSpoke(event: ClientEvent): boolean {
  if (actorKind(event.actor) !== "harness" || event.space_id === undefined) return false;
  return event.type === "message.post" || event.type === "run.completed";
}

function toSearchHit(hit: WireSearchHit): SearchHit {
  return {
    kind: hit.kind,
    spaceId: hit.space_id,
    at: hit.at,
    snippet: hit.snippet,
    ...(hit.snippet_from === "transcript" ? { snippetFrom: "transcript" as const } : {}),
    ...(hit.message_id === undefined ? {} : { lineId: eventIdOfMessage(hit.message_id) }),
    ...(hit.author_id === undefined ? {} : { authorId: hit.author_id }),
    ...(hit.run_id === undefined ? {} : { runId: hit.run_id }),
    ...(hit.step_id === undefined ? {} : { stepId: hit.step_id }),
  };
}

interface WireParticipant {
  readonly id: string;
  /** A person or a harness; a kind this build has never heard of is drawn as a harness. */
  readonly kind: string;
  readonly display_name: string;
  readonly owner_id: string | null;
  readonly role?: WorkspaceRole | null | undefined;
  /** For a guest (ADR 0034): the space they are in, or `null`; absent for anybody else. */
  readonly guest_of?: string | null | undefined;
  readonly capabilities?: readonly string[] | null | undefined;
  /** When the harness was removed (ADR 0078); absent from a server older than that. */
  readonly removed_at?: string | null | undefined;
  /** When a token of the harness's was last used, `null` if never; absent from an older server. */
  readonly last_seen_at?: string | null | undefined;
  /** Whether it can answer now (ADR 0083); absent for a person and from an older server. */
  readonly state?: AgentState | undefined;
  /** For an agent (ADR 0087): the harness it speaks through. */
  readonly harness_id?: string | undefined;
  /** For an agent: the open room it is in, or `null` while it is free. */
  readonly room?: string | null | undefined;
  /** For an agent: `active`, or `archived` in its harness. */
  readonly agent_state?: string | undefined;
  /** For an agent: its harness's Main agent. */
  readonly lead?: boolean | undefined;
  /** For an agent: how many of its words wait for its next room; absent from an older server. */
  readonly held?: number | undefined;
  /** For a free agent: the room an archive took it out of. */
  readonly released_from?: string | null | undefined;
  /** For an agent: the room it was last taken out of. */
  readonly last_space_id?: string | null | undefined;
  /** For a fork's copy: the agent it is a copy of. */
  readonly forked_from?: string | null | undefined;
  /** For an agent (ADR 0199): whether its changes are locked; absent from an older server. */
  readonly locked?: boolean | undefined;
  /**
   * For an agent, the face a person chose for it (ADR 0089); for a person, their own (ADR 0139).
   * `null` or absent with none.
   */
  readonly face?: unknown;
}

/** A kept row that still reads as one: a cache written by another build can hold anything. */
function isWireParticipant(row: unknown): row is WireParticipant {
  if (typeof row !== "object" || row === null) return false;
  const { id, kind, display_name: name } = row as Record<string, unknown>;
  return typeof id === "string" && typeof kind === "string" && typeof name === "string";
}

/** A participant as the directory holds it, from the wire's row. */
/** A participant's kind: a person, an agent (ADR 0087), and anything else a harness. */
function kindOfWire(kind: string): Participant["kind"] {
  return kind === "person" || kind === "agent" ? kind : "harness";
}

function participantOf(p: WireParticipant): Participant {
  const kind = kindOfWire(p.kind);
  return {
    id: p.id,
    kind,
    ...(kind === "agent" && p.harness_id !== undefined ? { harnessId: p.harness_id } : {}),
    displayName: p.display_name,
    ...(p.owner_id === null ? {} : { ownerId: p.owner_id }),
    ...(p.role == null ? {} : { role: p.role }),
    ...(p.capabilities == null ? {} : { capabilities: p.capabilities }),
    ...(p.removed_at == null ? {} : { removedAt: p.removed_at }),
    // Kept as `null` rather than dropped: "never connected" is what the room says.
    ...(kind !== "harness" || p.last_seen_at === undefined ? {} : { lastSeenAt: p.last_seen_at }),
    ...(kind === "person" || p.state === undefined ? {} : { state: p.state }),
    ...(kind === "agent" ? agentFields(p) : {}),
    ...(kind === "person" ? personFields(p) : {}),
  };
}

/** A person's own face (ADR 0139), as an agent's; and for a guest, the space they are in (ADR 0034). */
function personFields(p: WireParticipant): Partial<Participant> {
  return {
    ...(p.guest_of === undefined ? {} : { guestOf: p.guest_of }),
    ...faceOnTheWire(p.face),
  };
}

/** Where an agent is, and whether it is archived or the lead (ADR 0087). */
function agentFields(p: WireParticipant): Partial<Participant> {
  return {
    ...(p.room === undefined ? {} : { room: p.room }),
    ...(p.agent_state === "archived" ? { archived: true } : {}),
    ...(p.lead === true ? { lead: true } : {}),
    ...(typeof p.held === "number" && p.held > 0 ? { held: p.held } : {}),
    ...(p.released_from == null ? {} : { releasedFrom: p.released_from }),
    ...(p.last_space_id == null ? {} : { lastRoom: p.last_space_id }),
    ...(p.forked_from == null ? {} : { forkedFrom: p.forked_from }),
    ...(p.locked === true ? { locked: true } : {}),
    ...faceOnTheWire(p.face),
  };
}

/** A face as the directory sends it: kept when it is one, and dropped when it is not. */
function faceOnTheWire(raw: unknown): Pick<Participant, "face"> {
  if (raw == null) return {};
  const parsed = parseSpaceIcon(raw);
  return parsed.ok ? { face: parsed.value } : {};
}

/** The faces chosen for rooms from the server's answer or the cache's copy: each kept when it is one. */
function iconsOf(raw: Readonly<Record<string, unknown>>): ReadonlyMap<string, SpaceIcon> {
  const icons = new Map<string, SpaceIcon>();
  for (const [spaceId, value] of Object.entries(raw)) {
    const parsed = parseSpaceIcon(value);
    if (parsed.ok) icons.set(spaceId, parsed.value);
  }
  return icons;
}

/**
 * Something of the person's own that is not on the log (a room's face, the rooms hidden, the rooms
 * pinned, somebody's face): what the server holds, so far as the store knows, and the changes to
 * it asked here and not yet answered, drawn over it for `show`. A change shows at once; taken, it
 * joins what the server holds; refused, it is dropped. Nothing is put back from what showed when
 * a change was asked, which could be an earlier change, refused in turn: two quick picks the
 * server both turned away left the first one showing (3 November 2026).
 */
interface OnTheirWay<T, C> {
  /** What the server holds: what it or the cache last said, and the changes it took since. */
  readonly held: () => T;
  /** What the server or the cache says it holds now; what shows is drawn again. */
  readonly heard: (now: T) => void;
  /**
   * A change asked for, by key, shown at once. Its answer, taken or refused, says whether what
   * shows moved: a later change for the same key, still on its way, settles what shows instead.
   */
  readonly ask: (
    key: string,
    change: C,
  ) => { readonly taken: () => boolean; readonly refused: () => boolean };
}

function onTheirWay<T, C>(
  draw: (held: T, changes: ReadonlyMap<string, C>) => T,
  start: T,
  show: (now: T) => void,
): OnTheirWay<T, C> {
  let held = start;
  const changes = new Map<string, C>();
  const drawn = () => show(draw(held, changes));
  return {
    held: () => held,
    heard: (now) => {
      held = now;
      drawn();
    },
    ask: (key, change) => {
      changes.set(key, change);
      drawn();
      const mine = () => changes.get(key) === change;
      return {
        taken: () => {
          held = draw(held, new Map([[key, change]]));
          if (mine()) {
            changes.delete(key);
            return false;
          }
          drawn();
          return true;
        },
        refused: () => {
          if (!mine()) return false;
          changes.delete(key);
          drawn();
          return true;
        },
      };
    },
  };
}

/** The rooms hidden, with the hides and unhides still on their way to the server drawn over them. */
function withHiding(
  hidden: ReadonlySet<string>,
  asked: ReadonlyMap<string, { readonly hidden: boolean }>,
): ReadonlySet<string> {
  if (asked.size === 0) return hidden;
  const next = new Set(hidden);
  for (const [spaceId, { hidden: now }] of asked) {
    if (now) next.add(spaceId);
    else next.delete(spaceId);
  }
  return next;
}

/**
 * The rooms pinned, newest first, with the pins and unpins still on their way drawn over them: a
 * pin on its way stands first, as the server will put it, and an unpin is gone.
 */
function withPinning(
  pinned: readonly string[],
  asked: ReadonlyMap<string, { readonly pinned: boolean }>,
): readonly string[] {
  if (asked.size === 0) return pinned;
  let next = [...pinned];
  for (const [spaceId, { pinned: now }] of asked) {
    if (!now) next = next.filter((id) => id !== spaceId);
    else if (!next.includes(spaceId)) next = [spaceId, ...next];
  }
  return next;
}

/**
 * The pins with one room put back as it stood in `before`, after the server refused to change it:
 * not pinned, or pinned again right after the pin it stood behind.
 */
export function pinnedAsBefore(
  pinned: readonly string[],
  spaceId: string,
  before: readonly string[],
): readonly string[] {
  const without = pinned.filter((id) => id !== spaceId);
  const at = before.indexOf(spaceId);
  if (at === -1) return without;
  const ahead = before.slice(0, at).filter((id) => without.includes(id));
  const after = ahead.length === 0 ? 0 : without.indexOf(ahead[ahead.length - 1] ?? "") + 1;
  return [...without.slice(0, after), spaceId, ...without.slice(after)];
}

/** The faces with the picks still on their way to the server drawn over them. */
function withIcons(
  icons: ReadonlyMap<string, SpaceIcon>,
  chosen: ReadonlyMap<string, { readonly icon: SpaceIcon | undefined }>,
): ReadonlyMap<string, SpaceIcon> {
  if (chosen.size === 0) return icons;
  const next = new Map(icons);
  for (const [spaceId, { icon }] of chosen) {
    if (icon === undefined) next.delete(spaceId);
    else next.set(spaceId, icon);
  }
  return next;
}

/** The directory with the faces still on their way to the server drawn over what it says. */
function withFaces(
  directory: Directory,
  chosen: ReadonlyMap<string, { readonly face: SpaceIcon | undefined }>,
): Directory {
  if (chosen.size === 0) return directory;
  const next: Record<string, Participant> = { ...directory };
  for (const [id, { face }] of chosen) {
    const known = next[id];
    if (known === undefined) continue;
    const { face: _worn, ...rest } = known;
    next[id] = face === undefined ? rest : { ...rest, face };
  }
  return next;
}

/** One of a room's files as the server lists it, as the model has one (ADR 0099). */
function listedFile(wire: RoomFile): RoomFileOf {
  const { width, height, duration_ms: duration, replaces } = wire;
  return {
    name: wire.name,
    version: wire.version,
    attachment: attachmentFromWire({
      attachment_id: wire.attachment_id,
      filename: wire.name,
      mime_type: wire.mime_type,
      byte_size: wire.byte_size,
      sha256: wire.sha256,
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
      ...(duration === undefined ? {} : { duration_ms: duration }),
      ...(replaces === undefined ? {} : { replaces }),
    }),
    by: wire.by.id,
    byName: wire.by.name,
    at: wire.at,
    // The room's lines go by their events' ids; the wire names a message by its own.
    ...(wire.message_id === undefined ? {} : { lineId: eventIdOfMessage(wire.message_id) }),
  };
}

interface WireStay {
  readonly readable: boolean;
  readonly space_id?: string | undefined;
  readonly from_seq?: number | undefined;
  readonly to_seq?: number | null | undefined;
  readonly from: string;
  readonly to: string | null;
  readonly lines?: number | undefined;
}

function stayOf(wire: WireStay): AgentStay {
  return {
    readable: wire.readable === true && wire.space_id !== undefined,
    ...(wire.space_id === undefined ? {} : { spaceId: wire.space_id }),
    ...(wire.from_seq === undefined ? {} : { fromSeq: wire.from_seq }),
    ...(wire.to_seq === undefined ? {} : { toSeq: wire.to_seq }),
    from: wire.from,
    to: wire.to ?? null,
    lines: wire.lines ?? 0,
  };
}

interface WireInvite {
  readonly invite_id: string;
  readonly role: WorkspaceRole;
  readonly single_use: boolean;
  readonly uses: number;
  readonly created_by: string;
  readonly created_at: string;
  readonly expires_at: string;
  readonly revoked_at: string | null;
  readonly space_id?: string | null;
}

interface WirePasskey {
  readonly passkey_id: string;
  readonly name: string;
  readonly algorithm: number;
  readonly created_at: string;
  readonly last_used_at: string | null;
  readonly revoked_at: string | null;
}

interface WireDevice {
  readonly device_id: string;
  readonly name: string;
  readonly paired_at: string;
  readonly last_seen_at: string | null;
  readonly revoked_at: string | null;
  readonly current: boolean;
}

function deviceRecord(each: WireDevice): PairedDeviceRecord {
  return {
    deviceId: each.device_id,
    name: each.name,
    pairedAt: each.paired_at,
    lastSeenAt: each.last_seen_at ?? undefined,
    revokedAt: each.revoked_at ?? undefined,
    current: each.current,
  };
}
