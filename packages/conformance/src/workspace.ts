/**
 * The workspace behind the fake: an event log with the door rules the real server applies, and
 * the projections the scenario reads. Nothing here listens on a port — `fake-chips.ts` is the
 * door — so every rule can be driven by a plain call.
 *
 * What is mirrored, and what is not. Mirrored: the envelope Chips fills in (the clock, the
 * actor, who decided), the schema check with the protocol's own `parseEvent`, the direction an
 * event travels, the idempotency key and what a repeat of one means, a run's life, membership,
 * first answer wins, and — since Phase 5 — who may change a space or who is in it, that an added
 * participant exists, and that a decision comes from who the ask named (rules 7 to 9, the Phase
 * 3 review's finding 11); and a room a person asks the harness for, which only a harness that
 * declares `new_spaces` may be asked (rule 15), and which it claims under a key of its own
 * (`space.claimed`, the new-space plan's Phase 2); and agents (ADR 0087): the harness's agents, which
 * rooms hold in its place, the actor rule that reads the harness as its one agent in a room, and
 * which of them a message is for. Not mirrored, on purpose: the policy engine — nothing here decides an
 * approval on the spot, every card waits for the person the scenario plays, which is what "ask
 * first" means and what the handshake reports — and pricing, so a `usage` sent without a cost
 * is delivered without one. An adapter that passes here has spoken the protocol; what the real
 * server's dial would have allowed unasked is that server's business.
 */

import { createHash } from "node:crypto";
import {
  actionMatters,
  CONTEXT_CEILING,
  type ContextLine,
  canSee,
  clashKey,
  contextLines,
  DEFAULT_EXCHANGE_LIMITS,
  eventDefinition,
  eventIdOfMessage,
  FORK_WAIT_MS,
  freeAgentName,
  HARNESS_CAPABILITIES,
  type IdGenerator,
  isAgentKind,
  isFormOf,
  isId,
  type JobSpend,
  linesOf,
  mayHoldName,
  mentionsEveryone,
  messageIdOf,
  NEW_AGENT_WAIT_MS,
  NOT_AN_AGENT_WORDS,
  type NoteMember,
  nameProblem,
  notAnAgentName,
  parseEvent,
  parseSpaceIcon,
  passIfNothingSaid,
  pickAgentName,
  quoteOf,
  quotesBefore,
  REPLY_BEFORE_LINES,
  REPLY_QUOTE_CHARS,
  type ReleaseReason,
  type ReplyingTo,
  ROOM_FILES_IN_CONTEXT,
  type RoomContext,
  type RoomFile,
  refuseAgentInto,
  resetsTheCount,
  resolveAddress,
  resolveMentions,
  type SpaceIcon,
  STOPPED_BECAUSE,
  spendStage,
  type Viewer,
} from "@chipschat/protocol";
import { exchangeInLog, type FakeExchange, heldInLog } from "./exchange.js";
import { fileVersionsInLog, madeFromInLog, roomFilesInLog } from "./room-files.js";
import { spendInLog } from "./spend.js";

/** What changes who is in a room: after each, a room with two agents and no lead is given one (ADR 0291). */
const MEMBERSHIP_MOVES: ReadonlySet<string> = new Set([
  "membership.added",
  "membership.removed",
  "membership.replaced",
]);

/**
 * What a sender is told of its message held from the agents it named (ADR 0097), if it was: the
 * count, and the workspace's hold (ADR 0187) where it has one.
 */
function heldWith(
  event: StoredEvent,
  talked: FakeExchange | undefined,
): { held?: { count: number; allowance?: number } } {
  if (event.payload["held"] !== true || talked === undefined) return {};
  const hold = (talked.limits ?? DEFAULT_EXCHANGE_LIMITS).hold;
  return { held: { count: talked.count + 1, ...(hold === null ? {} : { allowance: hold }) } };
}

export interface Principal {
  readonly kind: "person" | "harness";
  readonly participantId: string;
  readonly workspaceId: string;
  readonly displayName: string;
}

/** An event as the log holds it: the envelope's fields lifted out, and the whole event as sent. */
export interface StoredEvent {
  readonly seq: number;
  readonly id: string;
  readonly type: string;
  readonly ts: string;
  readonly space_id: string | null;
  readonly run_id: string | null;
  readonly actor: { readonly kind: string; readonly id: string };
  readonly idempotency_key: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

export type RunState = "queued" | "running" | "waiting" | "done" | "failed" | "cancelled";
export type Role = "owner" | "member" | "guest";

export interface RunRow {
  readonly run_id: string;
  readonly space_id: string;
  readonly harness_id: string;
  /** The agent it is by, when an agent's (ADR 0087). */
  readonly agent_id?: string | undefined;
  state: RunState;
}

export interface ApprovalRow {
  readonly approval_id: string;
  readonly run_id: string;
  readonly space_id: string | null;
  readonly expires_at: string;
  readonly fallback: string;
  /** Who may answer, as the real server resolves it: person ids; empty means anyone in the room. */
  readonly approvers: readonly string[];
  /** Whether the ask matters (ADR 0195): its action's flags and its risk classes, as declared. */
  readonly matters: boolean;
  state: "pending" | "resolved";
  decision: string | null;
  scope: string | null;
  reason: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  updated_input: unknown;
}

export interface QuestionRow {
  readonly ask_id: string;
  readonly run_id: string;
  readonly space_id: string | null;
  readonly questions: readonly {
    readonly question_id: string;
    readonly options: readonly { readonly value: string }[];
    readonly default_value?: string;
  }[];
  state: "pending" | "answered";
  answered_by: string | null;
}

export interface SpaceRow {
  readonly space_id: string;
  /** Direct, group, channel or thread, as it was opened: what says whether it may be erased. */
  readonly kind: string;
  readonly title: string | undefined;
  /** Whether a person or a harness last named it: a person's name holds over a harness's. */
  readonly title_by: "person" | "harness" | undefined;
  readonly external_key: string | undefined;
  /**
   * Who sent `space.created`, or the harness that claimed it: the one harness that may retitle
   * or close it later (rule 7).
   */
  readonly opened_by: string;
  /** The harness a person asked into it, to claim under a key of its own (rule 15). */
  readonly asked_of: string | undefined;
  /** The other harnesses asked with it from the + (ADR 0087's addendum of 30 September). */
  readonly also_asked_of: readonly string[];
  /** The harness's home, its Main room: people join it, and no agent but the lead (rule 7). */
  readonly home: boolean;
  readonly state: "open" | "closed";
  /** Who last archived or unarchived it, when anybody has (ADR 0066). */
  readonly state_by: "person" | "harness" | undefined;
  readonly created_at: string;
  readonly members: Map<string, Role>;
}

/** A room the harness opened by key, as `GET /v1/harnesses/:id/spaces` lists it. */
export interface OpenedSpace {
  readonly space_id: string;
  readonly key: string;
  readonly shared: boolean;
  readonly title: string | null;
  readonly state: "open" | "closed";
  readonly moved_by?: "person" | "harness";
}

/** A room a person asked the harness for and it has not claimed, as the same listing has it. */
export interface AskedSpace {
  readonly space_id: string;
  readonly asked_by: string;
  readonly title: string | null;
  readonly state: "open" | "closed";
  readonly asked_at: string;
}

/** What a claim did, as the door answers it. */
export interface Claimed {
  readonly spaceId: string;
  /** False on a retry with the key that had already claimed it. */
  readonly claimed: boolean;
  readonly retitled: boolean;
}

export interface StoredBytes {
  readonly bytes: Uint8Array;
  readonly mime_type: string;
  readonly sha256: string;
  readonly byte_size: number;
}

export interface UploadRow {
  readonly attachment_id: string;
  readonly filename: string;
  readonly uploaded_by: string;
  stored: StoredBytes | undefined;
}

/** A URL a harness may fetch an attachment at, for its own token (decision 10). */
export type Signs = (attachmentId: string) => { url: string; url_expires_at: string };

/** The wire's word for a refusal, and the HTTP status it becomes. */
export type RefusalCode = "forbidden" | "not_found" | "invalid_event" | "stale_file";

export interface Refusal {
  readonly code: RefusalCode;
  /** The rule that refused, in the real server's own words for it. */
  readonly kind: string;
  readonly message: string;
  readonly issues?: readonly { readonly path: string; readonly message: string }[];
  /** For `agent_elsewhere`: the room the agent is in (ADR 0087). */
  readonly space_id?: string | undefined;
}

/** A refusal as the report reads it: who was refused, for what, and when. */
export interface Refused extends Refusal {
  readonly at: string;
  readonly who: "person" | "harness";
  readonly type: string | undefined;
}

/** A field an event was taken without, because the protocol does not declare it (ADR 0162). */
export interface Dropped {
  readonly who: "person" | "harness";
  readonly type: string;
  readonly field: string;
}

/** Where a task's lane is, for the sender's acknowledgement (M3.5). */
export interface LaneOpened {
  readonly lane_id: string;
  readonly run_id: string;
  readonly space_id: string;
}

export type Outcome =
  | {
      readonly ok: true;
      readonly event: StoredEvent;
      readonly duplicate: boolean;
      /** For a `task` that opened a lane: where it is. Absent when the task was flattened. */
      readonly lane?: LaneOpened | undefined;
      /** A message held from the agents it named (ADR 0097): the count with it, and the ceiling. */
      readonly held?: { readonly count: number; readonly allowance?: number } | undefined;
    }
  | { readonly ok: false; readonly error: Refusal };

/** A lane the fake opened: the run it is, where it lives, and where its news goes. */
interface LaneRow {
  readonly lane_id: string;
  readonly run_id: string;
  /** The lead's run that opened it, when the task was sent in one: what a cancel cascades from. */
  readonly lead_run: string | undefined;
  readonly home: string;
  readonly linked: readonly string[];
  told: boolean;
}

export type { Viewer };

/** One of the harness's agents (ADR 0087): who it takes part in rooms as. */
export interface AgentRow {
  readonly agent_id: string;
  readonly key: string;
  name: string;
  /** Its harness's Main agent (ADR 0087, rule 7), or no longer, its default agent Main instead. */
  lead: boolean;
  state: "active" | "archived";
  /** While free, the room an archive took it out of, which an unarchive brings it back to. */
  released_from?: string | undefined;
  /** The room it was last taken out of, whatever took it. */
  last_space?: string | undefined;
  /** The agent it is a copy of, when it is a fork's copy (ADR 0087, Fork). */
  readonly forked_from?: string | undefined;
  /** The face a person chose for it (ADR 0089); absent while it wears its initials. */
  face?: SpaceIcon | undefined;
  /** The person who last named it (ADR 0091); while set, its harness does not rename it. */
  name_by?: string | undefined;
  /** Deleted by a person (ADR 0095): its key is refused, and it is nobody's to speak as. */
  deleted?: boolean | undefined;
}

/** A deleted agent's key, asked for again (ADR 0095, point 5): deleted stays deleted. */
export class AgentDeleted extends Error {
  override readonly name = "AgentDeleted";
  constructor() {
    super("that agent was deleted");
  }
}

/** What came of a fork's copy registered for a room, as the real server answers it. */
export type ForkAnswer =
  | { readonly attached: true }
  | { readonly attached: false; readonly why?: string | undefined };

/** What an agent said while in no room (ADR 0087, rule 6), until it is posted. */
export interface HeldRow {
  readonly event_id: string;
  readonly agent_id: string;
  readonly said_at: string;
  readonly text: string;
  readonly attachments: readonly unknown[];
}

/** Somebody the directory names: a person, the harness, or one of its agents. */
export interface Named {
  readonly participantId: string;
  readonly kind: "person" | "harness" | "agent";
  readonly displayName: string;
  /** For an agent: the face a person chose for it (ADR 0089), `null` while it has none. */
  readonly face?: SpaceIcon | null | undefined;
}

const DECISIONS: ReadonlySet<string> = new Set(["approval.resolved", "question.answered"]);

/** The fields of a post that mean a room, which words held in no room do not keep (rule 6). */
const ROOM_FIELDS = [
  "space_id",
  "run_id",
  "reply_to",
  "session_ref",
  "mentions",
  "to",
  "addressed_to",
  "addressed_to_all",
  "held",
  "upload_ids",
  "replaces",
] as const;

/** The events that change a space itself or who is in it, which rule 7 has a say on. */
const SPACE_CHANGES: ReadonlySet<string> = new Set([
  "space.updated",
  "membership.added",
  "membership.removed",
]);

/** Fields Chips stamps from the credential and its clock; a sender's values are replaced. */
const ATTRIBUTION: Readonly<Record<string, { who: readonly string[]; when: readonly string[] }>> = {
  "approval.resolved": { who: ["resolved_by"], when: ["resolved_at"] },
  "question.answered": { who: ["answered_by"], when: ["answered_at"] },
  "run.pause": { who: ["by"], when: [] },
  "run.resume": { who: ["by"], when: [] },
  "run.cancel": { who: ["by"], when: [] },
  "policy.updated": { who: ["changed_by"], when: [] },
};

const TERMINAL: ReadonlySet<string> = new Set(["done", "failed", "cancelled"]);

/** A run's life, as the real server's state machine has it, keyed by the event that moves it. */
const TRANSITIONS: Readonly<Record<string, Partial<Record<RunState, RunState>>>> = {
  "run.started": { queued: "running", running: "running" },
  "approval.request": { running: "waiting", waiting: "waiting" },
  "question.ask": { running: "waiting", waiting: "waiting" },
  "approval.resolved": { waiting: "running" },
  "question.answered": { waiting: "running" },
  "run.pause": { running: "waiting" },
  "run.resume": { waiting: "running" },
  "run.completed": { running: "done", waiting: "done" },
  "run.failed": { queued: "failed", running: "failed", waiting: "failed" },
  "run.cancel": { queued: "cancelled", running: "cancelled", waiting: "cancelled" },
};

/** What the bytes are, from the name alone: the real server sniffs, and this is not a sniffer. */
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  csv: "text/csv",
};

const DEFAULT_WORKSPACE_MAX = 2;

function refusal(code: RefusalCode, kind: string, message: string): Refusal {
  return { code, kind, message };
}

function noun(kind: Principal["kind"]): string {
  return kind === "harness" ? "a harness" : "a person";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * What a run that has ended still takes: an approval's decision and its outcome (M3.5), a
 * question's answer, which is the same card asked the other way, and what the run cost (ADR 0155).
 */
const AFTER_THE_END: ReadonlySet<string> = new Set([
  "approval.resolved",
  "approval.executed",
  "question.answered",
  "usage",
]);

/** A short, stable digest of a key or a change, for an idempotency key. */
function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/** A face as `agent.updated` carries it: the mark and ground, or nothing for `null`. */
function faceOf(raw: unknown): SpaceIcon | undefined {
  const parsed = parseSpaceIcon(raw);
  return parsed.ok ? parsed.value : undefined;
}

/** Whether a run in this state takes this event at the door. */
function runAccepts(state: RunState, type: string): string | undefined {
  if (TERMINAL.has(state) && !AFTER_THE_END.has(type)) return `the run has ended as ${state}`;
  if (type === "run.pause" && TRANSITIONS[type]?.[state] === undefined) {
    return `a run that is ${state} cannot be paused`;
  }
  if (type === "run.resume" && TRANSITIONS[type]?.[state] === undefined) {
    return `a run that is ${state} is not paused`;
  }
  return undefined;
}

/**
 * The refusal for an event that is Chips's own to write, or nothing when a client may send it.
 * Who sends each event is the catalogue's to say (`sender`), read here as the server reads it, so
 * the two cannot differ on it.
 */
function chipsOwns(type: string): Refusal | undefined {
  // An event nothing declares is left for the schema to refuse, as invalid.
  if (eventDefinition(type)?.sender !== "chips") return undefined;
  return refusal(
    "forbidden",
    "not_submittable",
    `${type} is written by Chips itself, and is not accepted from a client`,
  );
}

/**
 * Rule 2: the kind of event that kind of sender sends, as the catalogue says; and a heartbeat's
 * check-in is a harness's, or its agent's, alone (ADR 0143).
 */
function refuseDirection(
  event: Readonly<Record<string, unknown>>,
  sender: Principal,
): Refusal | undefined {
  const type = String(event["type"]);
  const sends = eventDefinition(type)?.sender ?? "chips";
  if (sends !== "either" && sender.kind !== sends) {
    return refusal(
      "forbidden",
      "wrong_direction",
      sends === "chips"
        ? `${type} is written by Chips itself, and is not accepted from a client`
        : `${type} is something ${noun(sends)} sends, and this credential belongs to ${noun(sender.kind)}`,
    );
  }
  if (type === "message.post" && event["heartbeat"] === true && sender.kind !== "harness") {
    return refusal(
      "forbidden",
      "wrong_direction",
      "a heartbeat's check-in is something a harness sends, and this credential belongs to a person",
    );
  }
  return undefined;
}

/** Rules 1 to 3: the workspace, the actor, the direction, the key. */
function refuseWithoutLookup(
  event: Readonly<Record<string, unknown>>,
  sender: Principal,
): Refusal | undefined {
  if (event["workspace_id"] !== sender.workspaceId) {
    return refusal(
      "forbidden",
      "wrong_workspace",
      "an event may only be sent to its sender's workspace",
    );
  }
  const actor = event["actor"] as { kind: string; id: string; harness_id?: string };
  const own = actor.id === sender.participantId && actor.kind === sender.kind;
  // One of the harness's agents, which the door has already said is its (ADR 0087).
  const agent = actor.kind === "agent" && actor.harness_id === sender.participantId;
  if (!own && !agent) {
    return refusal(
      "forbidden",
      "wrong_actor",
      "an event may only be sent on the sender's own behalf",
    );
  }
  const wrongWay = refuseDirection(event, sender);
  if (wrongWay !== undefined) return wrongWay;
  if (typeof event["idempotency_key"] !== "string") {
    return refusal(
      "invalid_event",
      "missing_idempotency_key",
      "every write carries an idempotency key, so that retrying it changes nothing",
    );
  }
  return undefined;
}

/**
 * What the sender must not choose: who decided and when, from the credential and the clock; a
 * steer's `from`; a decision never "elsewhere" where it was made; the workspace cap on a dial.
 */
function stamp(draft: Record<string, unknown>, principal: Principal, now: string): void {
  const type = String(draft["type"]);
  const attribution = ATTRIBUTION[type];
  for (const field of attribution?.who ?? []) draft[field] = principal.participantId;
  for (const field of attribution?.when ?? []) draft[field] = now;
  if (type === "run.steer") {
    draft["from"] = {
      participant_id: principal.participantId,
      kind: principal.kind,
      display_name: principal.displayName,
      role: "member",
    };
  }
  if (type === "approval.resolved") draft["resolved_elsewhere"] = false;
  if (type === "policy.updated" && draft["workspace_max_autonomy"] === undefined) {
    draft["workspace_max_autonomy"] = DEFAULT_WORKSPACE_MAX;
  }
}

/**
 * What a sender does not get to write, at the door alone: the fields the catalogue says are
 * Chips's (`chipsWrites`), and who took somebody out of a room, which is whoever sent the removal
 * and nobody when they left themselves. Chips's own writes past the door keep theirs.
 */
function dropWhatChipsWrites(draft: Record<string, unknown>, principal: Principal): void {
  const type = String(draft["type"]);
  for (const field of eventDefinition(type)?.chipsWrites ?? []) delete draft[field];
  if (type !== "membership.removed") return;
  if (draft["participant_id"] === principal.participantId) delete draft["removed_by"];
  else draft["removed_by"] = principal.participantId;
}

export interface WorkspaceOptions {
  readonly workspaceId: string;
  readonly owner: Principal;
  readonly harness: Principal;
  readonly ids: IdGenerator;
  readonly now: () => Date;
  /** What the harness declares, as its registration would (ADR 0046). Nothing, by default. */
  readonly capabilities?: readonly string[] | undefined;
}

export class Workspace {
  readonly id: string;
  readonly owner: Principal;
  readonly harness: Principal;
  /** What the harness declares: `new_spaces` is what lets a person ask it for a room. */
  readonly capabilities: readonly string[];
  readonly log: StoredEvent[] = [];
  readonly runs = new Map<string, RunRow>();
  readonly approvals = new Map<string, ApprovalRow>();
  readonly questions = new Map<string, QuestionRow>();
  readonly spaces = new Map<string, SpaceRow>();
  /**
   * The first name each room asked of the harness holds for its agent there (ADR 0150), and the
   * person whose naming it is, until the agent takes the harness's place.
   */
  private readonly holds = new Map<string, { readonly name: string; readonly by: string }>();
  readonly uploads = new Map<string, UploadRow>();
  /** The lanes opened by `task`, by lane id (M3.5). */
  readonly lanes = new Map<string, LaneRow>();
  /** The harness's agents, by id (ADR 0087). */
  readonly agents = new Map<string, AgentRow>();
  /** In each room, who took whose place: `membership.replaced`, from → to. */
  private readonly replaced = new Map<string, Map<string, string>>();
  /** What free agents said, oldest first (ADR 0087, rule 6). */
  readonly held: HeldRow[] = [];
  /** Every event the door turned away, for the report. */
  readonly refusals: Refused[] = [];
  /** Every field the door dropped from an event it took, for the report. */
  readonly dropped: Dropped[] = [];
  private seq = 0;
  private readonly byKey = new Map<string, StoredEvent>();
  private readonly listeners = new Set<(event: StoredEvent) => void>();
  private readonly ids: IdGenerator;
  private readonly now: () => Date;

  constructor(options: WorkspaceOptions) {
    this.id = options.workspaceId;
    this.owner = options.owner;
    this.harness = options.harness;
    this.capabilities = options.capabilities ?? [];
    this.ids = options.ids;
    this.now = options.now;
  }

  /** Hear every append, in order. Returns the way to stop hearing. */
  onAppend(listener: (event: StoredEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  head(): number {
    return this.seq;
  }

  nowIso(): string {
    return this.now().toISOString();
  }

  /** The one way an event gets in: filled in, validated, checked against who sent it, appended. */
  submit(
    principal: Principal,
    raw: unknown,
    extras: {
      readonly runId?: string | undefined;
      readonly idempotencyKey?: string | undefined;
    } = {},
  ): Outcome {
    const outcome = this.take(principal, raw, extras);
    if (!outcome.ok) {
      const type = isRecord(raw) && typeof raw["type"] === "string" ? raw["type"] : undefined;
      this.refusals.push({ ...outcome.error, at: this.nowIso(), who: principal.kind, type });
    }
    return outcome;
  }

  private take(
    principal: Principal,
    raw: unknown,
    extras: { readonly runId?: string | undefined; readonly idempotencyKey?: string | undefined },
  ): Outcome {
    const draft = this.draftOf(principal, raw, extras);
    dropWhatChipsWrites(draft, principal);
    const validated = this.validate(draft, principal);
    if (!validated.ok) return validated;
    const event = validated.value;

    this.addedAsAgent(event, principal);
    const early = this.speakerOf(event, principal) ?? refuseWithoutLookup(event, principal);
    if (early !== undefined) return { ok: false, error: early };
    this.holdIfFree(event, principal);
    const refused =
      this.refuseOnRun(event, principal) ??
      this.refuseOnMembership(event) ??
      this.refuseOnReply(event) ??
      this.refuseOnSpaceChange(event, principal) ??
      this.refuseOnParticipant(event) ??
      this.refuseOnAgentMembership(event) ??
      this.refuseOnLeadRemoval(event) ??
      this.refuseOnAsking(event) ??
      this.refuseSecondAnswer(event) ??
      this.refuseNotAnApprover(event, principal);
    if (refused !== undefined) return { ok: false, error: refused };
    const unsaid = this.refuseUnsaid(event);
    if (unsaid !== undefined) return { ok: false, error: unsaid };
    if (event["type"] === "membership.removed" && typeof event["space_id"] === "string") {
      this.stopWork(event["space_id"], {
        reason: "removed",
        by: principal.participantId,
        agentId: String(event["participant_id"]),
      });
    }
    const talked = this.fillAddress(event);
    // An agent's `NO_REPLY` alone is its turn passed (ADR 0105), once every rule has had its say.
    passIfNothingSaid(event);

    // A key is the sender's own: the owner's `hello-1` and the harness's are two events.
    // By who the event is by, as the log keeps it: an agent's, when the harness spoke as one.
    const by = (event["actor"] as { id: string }).id;
    const seen = this.byKey.get(keyOf(by, String(event["idempotency_key"])));
    if (seen !== undefined) return { ok: true, event: seen, duplicate: true, ...this.laneOf(seen) };
    const appended = this.append(event);
    if (appended.type === "task") this.routeTask(appended);
    return {
      ok: true,
      event: appended,
      duplicate: false,
      ...this.laneOf(appended),
      ...heldWith(appended, talked),
    };
  }

  /**
   * A message said in no room, which went to everybody (agents review, 3); and what each file of a
   * post was made from (ADR 0099), refusing one made from a version no longer current.
   */
  private refuseUnsaid(event: Record<string, unknown>): Refusal | undefined {
    if (event["type"] === "message.post" && typeof event["space_id"] !== "string") {
      return refusal(
        "invalid_event",
        "invalid",
        "a message is said in a space: name one, or the run it belongs to",
      );
    }
    const made = madeFromInLog(this.log, event, (id) => this.whoIs().get(id)?.name ?? id);
    if (made === undefined) return undefined;
    return refusal(
      made.kind === "invalid" ? "invalid_event" : "stale_file",
      made.kind,
      made.message,
    );
  }

  /**
   * Who a harness's event is by (ADR 0087, point 2), as the real door reads it: an agent it names
   * must be its own, and its own id is read as its one agent in the room — refused as ambiguous
   * where it has several. A room it is in itself, and anything in no room, stay the harness's.
   */
  private speakerOf(event: Record<string, unknown>, principal: Principal): Refusal | undefined {
    if (principal.kind !== "harness") return undefined;
    const actor = event["actor"] as { kind?: unknown; id?: unknown };
    if (actor.kind === "agent") {
      const agent = this.agents.get(String(actor.id));
      if (agent === undefined) {
        return refusal(
          "forbidden",
          "wrong_actor",
          "a harness speaks only as one of its own agents",
        );
      }
      // Deleted stays deleted (ADR 0095): nothing more is said as it.
      if (agent.deleted === true)
        return refusal("forbidden", "wrong_actor", "that agent was deleted");
      this.speakAs(event, principal, agent);
      return undefined;
    }
    if (actor.kind !== "harness" || actor.id !== principal.participantId) return undefined;
    const room = this.roomOf(event);
    if (room === undefined || this.spaces.get(room)?.members.has(principal.participantId)) {
      return undefined;
    }
    const mine = this.agentsIn(room);
    if (mine.length > 1) {
      return refusal(
        "invalid_event",
        "which_agent",
        `this harness has ${mine.length} agents in that space (${mine.map((each) => each.name).join(", ")}): name one as the actor`,
      );
    }
    if (mine[0] !== undefined) this.speakAs(event, principal, mine[0]);
    return undefined;
  }

  /** The room an event is in: the one it names, or its run's. */
  private roomOf(event: Record<string, unknown>): string | undefined {
    if (typeof event["space_id"] === "string") return event["space_id"];
    return typeof event["run_id"] === "string"
      ? this.runs.get(event["run_id"])?.space_id
      : undefined;
  }

  /** The event as its agent's, with the harness beside it, and who decided or spoke with it. */
  private speakAs(event: Record<string, unknown>, principal: Principal, agent: AgentRow): void {
    event["actor"] = { kind: "agent", id: agent.agent_id, harness_id: principal.participantId };
    for (const field of ATTRIBUTION[String(event["type"])]?.who ?? [])
      event[field] = agent.agent_id;
    if (event["type"] === "run.steer") {
      event["from"] = {
        participant_id: agent.agent_id,
        kind: "agent",
        display_name: agent.name,
        role: "member",
      };
    }
  }

  /**
   * A person adding the harness to a room adds its default agent (ADR 0087's addendum, point 5),
   * except to a room asked of it from the +, which holds the harness until it claims it.
   */
  private addedAsAgent(event: Record<string, unknown>, principal: Principal): void {
    if (principal.kind !== "person" || event["type"] !== "membership.added") return;
    const proposed = event["agent_name"];
    delete event["agent_name"];
    if (event["participant_id"] !== this.harness.participantId) return;
    const spaceId = String(event["space_id"]);
    const room = this.spaces.get(spaceId);
    // Asked, or asked beside another, it is held there until it claims the room or answers with
    // an agent of its own, and a first name is held for that agent (ADR 0150).
    const waits =
      (room?.asked_of === this.harness.participantId && room.external_key === undefined) ||
      room?.also_asked_of.includes(this.harness.participantId) === true;
    if (waits) {
      const taken = this.takenNames();
      const name = mayHoldName(proposed, taken)
        ? proposed.trim()
        : pickAgentName(taken, [this.owner.displayName]);
      event["agent_name"] = name;
      this.holds.set(spaceId, { name, by: principal.participantId });
      return;
    }
    event["participant_id"] = this.agentForRoom(undefined, undefined).agent_id;
    event["participant_kind"] = "agent";
  }

  /** Whether the harness speaks agents: it declared `agents` (ADR 0087's addendum). */
  speaksAgents(): boolean {
    return this.capabilities.includes(HARNESS_CAPABILITIES.agents);
  }

  /**
   * The harness's agent for a key: found, renamed when the name has changed, archived or brought
   * back as `state` says, or registered. A change is keyed by the log's head, as the server's is.
   * One asked for as Main is the harness's Main from here, and no other is (ADR 0183).
   */
  registerAgent(
    key: string,
    name: string,
    options: Parameters<Workspace["registerOrChange"]>[2] = {},
  ): { agent: AgentRow; created: boolean; renamed: boolean } {
    const found = this.registerOrChange(key, name, options);
    if (options.lead !== true) return found;
    const say = (agentId: string, lead: boolean) => {
      const change = { lead };
      const event = {
        type: "agent.updated",
        idempotency_key: `agent-${agentId}-${digest(JSON.stringify(change))}-at-${this.seq}`,
        agent_id: agentId,
        ...change,
      };
      return options.byHarness === true
        ? this.appendAs(this.harness, event)
        : this.appendSystem(event);
    };
    if (!found.agent.lead) say(found.agent.agent_id, true);
    for (const other of this.agents.values()) {
      if (other.lead && other.agent_id !== found.agent.agent_id && other.deleted !== true) {
        say(other.agent_id, false);
      }
    }
    return found;
  }

  private registerOrChange(
    key: string,
    name: string,
    options: {
      readonly lead?: boolean;
      readonly byHarness?: boolean;
      readonly state?: AgentRow["state"] | undefined;
      /** The agent it copies (ADR 0087, Fork): said when it is made, and never again. */
      readonly forkedFrom?: string | undefined;
      /** The room whose held name this is (ADR 0150), not counted against it. */
      readonly heldIn?: string | undefined;
    } = {},
  ): { agent: AgentRow; created: boolean; renamed: boolean } {
    const { found, gone } = this.byAgentKey(key);
    const say = (event: Record<string, unknown>) =>
      options.byHarness === true ? this.appendAs(this.harness, event) : this.appendSystem(event);
    const update = (agentId: string, change: Record<string, unknown>) =>
      say({
        type: "agent.updated",
        idempotency_key: `agent-${agentId}-${digest(JSON.stringify(change))}-at-${this.seq}`,
        agent_id: agentId,
        ...change,
      });
    if (found !== undefined) {
      const state = options.state ?? found.state;
      const next = this.nameFor(found, name, state, options.heldIn);
      const renamed = next !== found.name;
      if (!renamed && state === found.state) return { agent: found, created: false, renamed };
      update(found.agent_id, {
        ...(renamed ? { name: next } : {}),
        ...(state === found.state ? {} : { state }),
      });
      return { agent: found, created: false, renamed };
    }
    const agentId = this.ids.next("agent");
    say({
      type: "agent.registered",
      idempotency_key: `agent-${this.harness.participantId}-${digest(key)}${gone}`,
      agent_id: agentId,
      harness_id: this.harness.participantId,
      key,
      name:
        options.state === "archived"
          ? name
          : freeAgentName(name, this.takenNames(undefined, options.heldIn)),
      lead: options.lead === true,
      ...(options.forkedFrom === undefined ? {} : { forked_from: options.forkedFrom }),
    });
    if (options.state === "archived") update(agentId, { state: "archived" });
    return { agent: this.agents.get(agentId) as AgentRow, created: true, renamed: false };
  }

  /**
   * The agent a key names, and, when a person deleted the last one, the suffix that keys a new
   * one apart from it. Deleted stays deleted, but for the agent Chips makes for the harness
   * itself, which is made afresh (ADR 0095, point 5).
   */
  private byAgentKey(key: string): { found: AgentRow | undefined; gone: string } {
    const agents = [...this.agents.values()].filter((agent) => agent.key === key);
    const found = agents.find((agent) => agent.deleted !== true);
    const deleted = agents.findLast((agent) => agent.deleted === true);
    if (found !== undefined || deleted === undefined) return { found, gone: "" };
    if (key !== this.harness.participantId) throw new AgentDeleted();
    return { found, gone: `-after-${deleted.agent_id}` };
  }

  /**
   * The names nobody but `except` may be given, as the server keeps them (ADR 0091): the owner's,
   * every active agent's, and the first names open rooms hold for the harness's agents-to-be but
   * the one `heldIn` holds (ADR 0150). The harness's own row shares its default agent's name.
   */
  private takenNames(except?: string, heldIn?: string): Set<string> {
    const agents = [...this.agents.values()].filter(
      (agent) => agent.agent_id !== except && agent.state === "active",
    );
    const held = [...this.holds].filter(([spaceId]) => {
      const room = this.spaces.get(spaceId);
      return (
        spaceId !== heldIn && room?.state === "open" && room.members.has(this.harness.participantId)
      );
    });
    return new Set(
      [
        this.owner.displayName,
        ...agents.map((agent) => agent.name),
        ...held.map(([, hold]) => hold.name),
      ].map(clashKey),
    );
  }

  /**
   * The name a known agent has after its harness asks for `wanted`: the name it has where that is
   * the one asked for or a number of it, a person's name for it whatever is asked, and numbered
   * when it comes back to find its name taken, as the server's `registerAgent` does.
   */
  private nameFor(
    found: AgentRow,
    wanted: string,
    state: AgentRow["state"],
    heldIn?: string,
  ): string {
    const base = found.name_by === undefined ? wanted : found.name;
    const keeps = isFormOf(found.name, base);
    const waking = found.state === "archived" && state === "active";
    if (keeps && !waking && state === found.state) return found.name;
    if (state !== "active") return keeps ? found.name : base;
    return freeAgentName(base, this.takenNames(found.agent_id, heldIn), found.name);
  }

  /**
   * A person renames an agent, as `PUT /v1/agents/:id/name` does (ADR 0091): refused a name the
   * owner or another active agent answers to, case and spaces aside; the same name records nothing.
   */
  renameAgent(
    agentId: string,
    wanted: string,
  ):
    | { readonly ok: true; readonly changed: boolean }
    | { readonly ok: false; readonly message: string } {
    const agent = this.agents.get(agentId);
    if (agent === undefined) return { ok: false, message: "No agent of that id here." };
    const name = wanted.trim().replace(/\s+/g, " ");
    if (name === "" || name.length > 120) {
      return { ok: false, message: "A name is something, up to 120 characters." };
    }
    if (name === agent.name) return { ok: true, changed: false };
    const problem = notAnAgentName(name) ? NOT_AN_AGENT_WORDS : nameProblem(name);
    if (problem !== undefined) return { ok: false, message: problem };
    if (clashKey(this.owner.displayName) === clashKey(name)) {
      return { ok: false, message: `Somebody here goes by ${this.owner.displayName} already.` };
    }
    const holder = [...this.agents.values()].find(
      (each) =>
        each.agent_id !== agentId &&
        each.state === "active" &&
        clashKey(each.name) === clashKey(name),
    );
    if (holder !== undefined) {
      return { ok: false, message: `An agent here goes by ${holder.name} already.` };
    }
    this.appendAs(this.owner, {
      type: "agent.updated",
      idempotency_key: `agent-name-${agentId}-${digest(name)}-at-${this.seq}`,
      agent_id: agentId,
      name,
    });
    return { ok: true, changed: true };
  }

  /**
   * The owner archives an agent or brings it back, as `PUT /v1/agents/:id/state` does (ADR 0095):
   * `agent.updated` with the person as its actor, and rule 9's reactions after it. The Main agent
   * and a deleted one are refused; the same state again records nothing.
   */
  archiveAgent(agentId: string, state: AgentRow["state"]): boolean {
    const agent = this.agents.get(agentId);
    if (agent === undefined || agent.lead || agent.deleted === true) return false;
    if (agent.state === state) return false;
    this.appendAs(this.owner, {
      type: "agent.updated",
      idempotency_key: `agent-state-${agentId}-${state}-at-${this.seq}`,
      agent_id: agentId,
      state,
    });
    return true;
  }

  /**
   * The owner deletes an agent, as `DELETE /v1/agents/:id` does (ADR 0095): out of its room, which
   * is archived when no other agent is left there, then `agent.deleted`, which its harness hears.
   */
  deleteAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (agent === undefined || agent.lead || agent.deleted === true) return false;
    const room = this.agentRoom(agentId);
    if (room !== undefined) {
      this.takeOut(room, agentId, {
        reason: "agent_deleted",
        by: this.owner.participantId,
        key: `agent-delete-release-${agentId}`,
      });
      this.closeIfEmpty(room, this.owner, `agent-delete-close-${agentId}`);
    }
    this.appendAs(this.owner, {
      type: "agent.deleted",
      idempotency_key: `agent-deleted-${agentId}`,
      agent_id: agentId,
      harness_id: this.harness.participantId,
      key: agent.key,
      name: agent.name,
      by: this.owner.participantId,
    });
    return true;
  }

  /**
   * One of the harness's agents in a room in the place of another of its own there, or of the
   * harness itself (ADR 0087, Phase 3), as the server's attach door does it.
   */
  attachAgent(
    agentId: string,
    spaceId: string,
    replacing: string,
  ):
    | { readonly ok: true; readonly attached: boolean }
    | { readonly ok: false; readonly kind: "unknown_agent" | "unknown_space" | "invalid" } {
    const mine = (id: string) => id === this.harness.participantId || this.agents.has(id);
    if (!this.agents.has(agentId) || !mine(replacing)) return { ok: false, kind: "unknown_agent" };
    const room = this.spaces.get(spaceId);
    if (room === undefined) return { ok: false, kind: "unknown_space" };
    const ours = (id: string) => room.members.has(id) && mine(id);
    if (replacing === agentId || (ours(agentId) && !ours(replacing))) {
      return { ok: true, attached: false };
    }
    if (!ours(replacing) || ours(agentId)) return { ok: false, kind: "invalid" };
    // An agent is in one room at a time (ADR 0087, rule 1): not taken from another into this.
    const where = this.agentRoom(agentId);
    if (where !== undefined && where !== spaceId) return { ok: false, kind: "invalid" };
    this.appendAs(this.harness, {
      type: "membership.replaced",
      space_id: spaceId,
      idempotency_key: `attach-${spaceId}-${replacing}-${agentId}-at-${this.seq}`,
      from: replacing,
      to: agentId,
    });
    return { ok: true, attached: true };
  }

  /**
   * The agent the harness has in a room it opened or claimed: the key's own, for every harness
   * (ADR 0087's addendum of 30 September, point 2), named by the room for one that follows its
   * rooms and after the harness otherwise; its default for a room with no key.
   */
  private agentForRoom(
    key: string | undefined,
    title: string | undefined,
    heldIn?: string,
  ): AgentRow {
    if (key === undefined) {
      return this.registerAgent(this.harness.participantId, this.harness.displayName).agent;
    }
    // The first name a room holds for it, which it takes (ADR 0150).
    const held = heldIn === undefined ? undefined : this.holds.get(heldIn)?.name;
    if (this.capabilities.includes(HARNESS_CAPABILITIES.followsRooms)) {
      return this.registerAgent(key, held ?? title ?? key, { heldIn }).agent;
    }
    const known = [...this.agents.values()].find((agent) => agent.key === key);
    return known ?? this.registerAgent(key, held ?? this.harness.displayName, { heldIn }).agent;
  }

  /**
   * The agent a room held a first name for takes it (ADR 0150), as named by the person who held
   * it, so the harness asking for another later changes nothing. One a person named keeps that.
   */
  private nameAsHeld(agent: AgentRow, spaceId: string): void {
    const hold = this.holds.get(spaceId);
    if (hold === undefined || agent.name_by !== undefined) return;
    const name = freeAgentName(hold.name, this.takenNames(agent.agent_id, spaceId), agent.name);
    this.appendAs(this.owner, {
      type: "agent.updated",
      idempotency_key: `agent-${agent.agent_id}-${digest(JSON.stringify({ name }))}-at-${this.seq}`,
      agent_id: agent.agent_id,
      name,
    });
  }

  /**
   * The harness's agent in its place in a room, once. One that is in another room stays there,
   * and the harness leaves this one: an agent is in one room at a time.
   */
  private agentInPlace(spaceId: string, key: string | undefined, title: string | undefined): void {
    const holds = this.holds.has(spaceId) ? spaceId : undefined;
    const agent = this.agentForRoom(key, title, holds);
    if (holds !== undefined) this.nameAsHeld(agent, spaceId);
    const where = this.agentRoom(agent.agent_id);
    if (where !== undefined && where !== spaceId) {
      this.appendOnce({
        type: "membership.removed",
        space_id: spaceId,
        idempotency_key: `elsewhere-${spaceId}-${this.harness.participantId}`,
        participant_id: this.harness.participantId,
      });
      return;
    }
    this.appendSystem({
      type: "membership.replaced",
      space_id: spaceId,
      idempotency_key: `replace-${spaceId}-${this.harness.participantId}`,
      from: this.harness.participantId,
      to: agent.agent_id,
    });
    // The agent holds the name now, as its own.
    this.holds.delete(spaceId);
  }

  /**
   * What the real door fills in on a message: the members its @handles name, and who it is for
   * (M3.3, ADR 0081), by the protocol's own two functions, over what the fake knows. The fake
   * knows the names of the owner and the harness under test, so only they can be @mentioned; a
   * harness is any member with a harness id.
   */
  private fillAddress(event: Record<string, unknown>): FakeExchange | undefined {
    if (event["type"] !== "message.post") return undefined;
    delete event["mentions"];
    delete event["addressed_to"];
    delete event["addressed_to_all"];
    delete event["addressed_people"];
    delete event["held"];
    const space =
      typeof event["space_id"] === "string" ? this.spaces.get(event["space_id"]) : undefined;
    const actor = event["actor"] as { kind: string; id: string };
    if (space === undefined) return undefined;
    const text = String(event["text"] ?? "");
    // The referee's count (ADR 0097), weighed for an agent's words only.
    const exchange = isAgentKind(actor.kind) ? exchangeInLog(this.log, space.space_id) : undefined;
    const mine = this.agentsIn(space.space_id);
    const mentions = resolveMentions(text, this.mentionable(space.members, mine));
    if (mentions.length > 0) event["mentions"] = mentions;
    const address = resolveAddress({
      sender: actor,
      mentioned: mentions,
      everyone: mentionsEveryone(text),
      to: this.aimedAt(event["to"], mine),
      ...this.asNowIn(space.space_id, event["reply_to"], actor),
      agents: [...space.members.keys()].filter((id) => isId("harness", id) || isId("agent", id)),
      // Who besides its agents a person's message can be for (ADR 0204).
      people: [...space.members.keys()].filter((id) => isId("person", id)),
      ...(exchange === undefined
        ? {}
        : {
            exchange: { count: exchange.count, paused: exchange.paused, limits: exchange.limits },
          }),
    });
    event["addressed_to"] = address.addressed_to;
    if (address.addressed_to_all === true) event["addressed_to_all"] = true;
    if (address.addressed_people !== undefined)
      event["addressed_people"] = address.addressed_people;
    if (address.held === true) event["held"] = true;
    return exchange;
  }

  /**
   * The reply's author and the sender's last aim, as the room reads now: the harness before
   * its agent took its place there is the agent (ADR 0087).
   */
  private asNowIn(
    spaceId: string,
    replyTo: unknown,
    actor: { readonly kind: string; readonly id: string },
  ): { replyAuthor?: { id: string; kind: string }; last?: string[] | "all" } {
    const now = (id: string): string => this.replaced.get(spaceId)?.get(id) ?? id;
    const reply = this.authorOf(replyTo, spaceId);
    const last = actor.kind === "person" ? this.lastAddressed(spaceId, actor.id) : undefined;
    return {
      ...(reply === undefined
        ? {}
        : {
            replyAuthor: {
              id: now(reply.id),
              kind: now(reply.id) === reply.id ? reply.kind : "agent",
            },
          }),
      ...(last === undefined ? {} : { last: Array.isArray(last) ? last.map(now) : last }),
    };
  }

  /**
   * Who an @ in a room may name: the owner and the harness where they are in it, and the
   * harness's agents — its name a handle for its one agent there (ADR 0087's addendum).
   */
  private mentionable(members: ReadonlyMap<string, Role>, mine: readonly AgentRow[]) {
    return [
      ...[this.owner, this.harness]
        .filter((each) => members.has(each.participantId))
        .map((each) => ({ id: each.participantId, displayName: each.displayName })),
      ...mine.map((agent) => ({
        id: agent.agent_id,
        displayName: agent.name,
        also: mine.length === 1 ? [this.harness.displayName] : [],
      })),
    ];
  }

  /** The sender's `to`, with the harness's id read as its one agent in the room. */
  private aimedAt(to: unknown, mine: readonly AgentRow[]): string[] | "all" | undefined {
    if (!Array.isArray(to)) return to === "all" ? "all" : undefined;
    const only = mine.length === 1 ? mine[0] : undefined;
    return (to as string[]).map((id) =>
      id === this.harness.participantId && only !== undefined ? only.agent_id : id,
    );
  }

  /** The messages said in a space, newest first. */
  private messagesIn(spaceId: string): StoredEvent[] {
    return this.log
      .filter((each) => each.type === "message.post" && each.space_id === spaceId)
      .reverse();
  }

  /**
   * A reply answers a message said in the room it is said in (ADR 0219), as the real server's
   * rule: one naming no message is `not_found`, one in another space `invalid_event`.
   */
  private refuseOnReply(event: Readonly<Record<string, unknown>>): Refusal | undefined {
    const replyTo = event["reply_to"];
    if (event["type"] !== "message.post" || typeof replyTo !== "string") return undefined;
    const said = this.saidMessage(replyTo);
    if (said === undefined) {
      return refusal(
        "not_found",
        "unknown_message",
        "a reply answers a message, and there is no such message",
      );
    }
    const space = event["space_id"];
    if (typeof space === "string" && said.space_id !== null && said.space_id !== space) {
      return refusal("invalid_event", "wrong_message", "that message is in another space");
    }
    return undefined;
  }

  /** The `message.post` a message id names, wherever it was said. */
  private saidMessage(messageId: string): StoredEvent | undefined {
    let eventId: string;
    try {
      eventId = eventIdOfMessage(messageId);
    } catch {
      return undefined;
    }
    return this.log.find((event) => event.id === eventId && event.type === "message.post");
  }

  /** Who wrote the message a reply answers, when it is in the same space. */
  private authorOf(replyTo: unknown, spaceId: string): { id: string; kind: string } | undefined {
    if (typeof replyTo !== "string") return undefined;
    let eventId: string;
    try {
      eventId = eventIdOfMessage(replyTo);
    } catch {
      return undefined;
    }
    const said = this.messagesIn(spaceId).find((each) => each.id === eventId);
    const kind = said?.actor.kind;
    return said !== undefined && kind !== undefined && kind !== "system"
      ? { id: said.actor.id, kind }
      : undefined;
  }

  /** Where a sender's newest message in a space that says went, `all` for everyone (ADR 0081). */
  private lastAddressed(spaceId: string, actorId: string): string[] | "all" | undefined {
    const said = this.messagesIn(spaceId).find(
      (each) => each.actor.id === actorId && Array.isArray(each.payload["addressed_to"]),
    );
    if (said?.payload["addressed_to_all"] === true) return "all";
    return said?.payload["addressed_to"] as string[] | undefined;
  }

  /** The lane a task opened, for its acknowledgement; nothing for any other event. */
  private laneOf(event: StoredEvent): { lane?: LaneOpened } {
    if (event.type !== "task") return {};
    const lane = this.lanes.get(String(event.payload["task_id"]));
    return lane === undefined
      ? {}
      : { lane: { lane_id: lane.lane_id, run_id: lane.run_id, space_id: lane.home } };
  }

  /**
   * What the real router does with a task, as far as one harness allows (M3.5, ADR 0032): a
   * task the harness routes to itself opens a lane — a `run.requested` in the home it named,
   * or in the direct space, with the run seeded there — and any other target is flattened into
   * a step on the lead's run, since there is nobody else here to route to. A home the harness
   * is not in is refused the same way.
   */
  /**
   * Where the route card appears: the space the task was sent from, and the space `link_to`
   * names when the harness is in it — never one it is not (the real router's rule).
   */
  private linkedFor(task: StoredEvent, home: string): string[] {
    const own = task.space_id ?? home;
    const named = typeof task.payload["link_to"] === "string" ? task.payload["link_to"] : own;
    const linkable = this.roleOf(named, this.harness.participantId) !== undefined;
    return named === own || !linkable ? [own] : [own, named];
  }

  private routeTask(task: StoredEvent): void {
    const p = task.payload;
    const laneId = String(p["task_id"]);
    const to = p["to"];
    if (!this.toItself(to, p["child"])) {
      this.flatten(task, `Kept in this run: no harness ${String(to)} to route to.`);
      return;
    }
    const home = this.laneHome(p["home"], to);
    // Its one agent in the home, or an agent it named (ADR 0087's addendum, point 3); or the
    // harness itself, in a room it is in from before agents.
    const inHome = this.roleOf(home, this.harness.participantId) !== undefined;
    const agent = this.laneAgent(home, to);
    if (!inHome && agent === undefined) {
      this.flatten(task, `Kept in this run: ${home} is not a space of yours.`);
      return;
    }
    const runId = this.ids.next("run");
    const linked = this.linkedFor(task, home);
    const goal = String(p["goal"] ?? "");
    this.appendSystem({
      type: "run.requested",
      space_id: home,
      run_id: runId,
      idempotency_key: `${laneId}-requested`,
      lane_id: laneId,
      goal,
      on_behalf_of: String(p["on_behalf_of"]),
      requested_by: task.actor.id,
      specialist_id: this.harness.participantId,
      ...(agent === undefined || inHome ? {} : { agent_id: agent.agent_id }),
      trail: [
        { participant_id: String(p["on_behalf_of"]) },
        {
          participant_id: this.harness.participantId,
          ...(task.run_id === null ? {} : { run_id: task.run_id }),
          ...this.leadGoal(task.run_id),
        },
      ],
      autonomy: typeof p["autonomy"] === "number" ? p["autonomy"] : 1,
      link_to: linked,
      ...(typeof p["label"] === "string" ? { label: p["label"] } : {}),
      ...(Array.isArray(p["constraints"]) ? { constraints: p["constraints"] } : {}),
    });
    // The lane's run is its agent's, as the real server's is: moving the agent stops it.
    this.openLane(task, {
      laneId,
      runId,
      home,
      linked,
      agentId: inHome ? undefined : agent?.agent_id,
    });
  }

  /** The rows a lane is: its run, going in its home, and the lane itself with where its news goes. */
  private openLane(
    task: StoredEvent,
    lane: {
      readonly laneId: string;
      readonly runId: string;
      readonly home: string;
      readonly linked: readonly string[];
      readonly agentId: string | undefined;
    },
  ): void {
    this.runs.set(lane.runId, {
      run_id: lane.runId,
      space_id: lane.home,
      harness_id: this.harness.participantId,
      ...(lane.agentId === undefined ? {} : { agent_id: lane.agentId }),
      state: "running",
    });
    this.lanes.set(lane.laneId, {
      lane_id: lane.laneId,
      run_id: lane.runId,
      lead_run: task.run_id ?? undefined,
      home: lane.home,
      linked: lane.linked,
      told: false,
    });
  }

  /** What the lead itself was asked, to name its hop in a lane's trail: its run's goal. */
  private leadGoal(runId: string | null): { goal?: string } {
    if (runId === null) return {};
    const started = this.log.find(
      (event) => event.type === "run.started" && event.run_id === runId,
    );
    const goal = started?.payload["goal"];
    return typeof goal === "string" ? { goal } : {};
  }

  /**
   * Cancelling a lead's run cancels the lanes it opened, and theirs, down the chain, as the real
   * router does. A lane that has ended keeps its ending, and the chain below it is still walked.
   * No cancel reached a lane anywhere here before (agents review, finding 37).
   */
  private cascade(leadRun: string): void {
    for (const lane of [...this.lanes.values()]) {
      if (lane.lead_run !== leadRun) continue;
      const run = this.runs.get(lane.run_id);
      if (run === undefined || TERMINAL.has(run.state)) {
        this.cascade(lane.run_id);
        continue;
      }
      // Its own cancel cascades further, as this one did.
      this.appendOnce({
        type: "run.cancel",
        space_id: lane.home,
        run_id: lane.run_id,
        idempotency_key: `${lane.lane_id}-cascade-cancel`,
        reason: "The lead's run was cancelled.",
        by: "system",
      });
    }
  }

  /**
   * Where a lane lives (ADR 0087, rule 8): the room named, when its agent is there or the room is
   * no room of the harness's; otherwise the room its agent is in, or, while it is free, a new
   * room with the person, as the real router has it.
   */
  private laneHome(named: unknown, to: unknown): string {
    const agent = this.specialistAgent(to);
    if (typeof named === "string") {
      const ours = this.spaces.get(named)?.opened_by === this.harness.participantId;
      if (!ours || this.laneAgent(named, to) !== undefined) return named;
    }
    const last = agent.last_space ?? "none";
    return (
      this.agentRoom(agent.agent_id) ??
      this.roomWithOwner(
        agent,
        `lane-home-${agent.agent_id}-${this.owner.participantId}-after-${last}`,
      )
    );
  }

  /** The agent a lane to the harness is worked by: the one named, its lead, or its default. */
  private specialistAgent(to: unknown): AgentRow {
    if (typeof to === "string") {
      const named = this.agents.get(to);
      if (named !== undefined) return named;
    }
    const lead = [...this.agents.values()].find((agent) => agent.lead && agent.state === "active");
    return lead ?? this.agentForRoom(undefined, undefined);
  }

  /** A task the harness routes to itself or one of its agents, and not to a child. */
  private toItself(to: unknown, child: unknown): boolean {
    if (child !== undefined) return false;
    return to === this.harness.participantId || (typeof to === "string" && this.agents.has(to));
  }

  /** The agent of the harness's that works a lane in a home: the one named, or its only one. */
  private laneAgent(home: string, to: unknown): AgentRow | undefined {
    const mine = this.agentsIn(home);
    if (typeof to === "string" && this.agents.has(to)) {
      return mine.find((each) => each.agent_id === to);
    }
    return mine.length === 1 ? mine[0] : undefined;
  }

  /** A task Chips will not open a lane for: a done step on the lead's run, saying why. */
  private flatten(task: StoredEvent, note: string): void {
    if (task.run_id === null || task.space_id === null) return;
    const stepId = `${String(task.payload["task_id"])}-flattened`;
    this.appendAs(this.harness, {
      type: "step.log",
      space_id: task.space_id,
      run_id: task.run_id,
      idempotency_key: stepId,
      step_id: stepId,
      status: "done",
      title: note,
    });
  }

  /** A lane's run ended: tell the lead, in every space the lane is linked into. */
  private tellLead(event: StoredEvent, run: RunRow): void {
    const lane = [...this.lanes.values()].find((each) => each.run_id === run.run_id);
    if (lane === undefined || lane.told || !TERMINAL.has(run.state)) return;
    lane.told = true;
    const state = run.state === "done" ? "completed" : run.state;
    const summary = event.type === "run.completed" ? event.payload["summary"] : undefined;
    for (const space of lane.linked) {
      this.appendSystem({
        type: "lane.updated",
        space_id: space,
        idempotency_key: `${lane.lane_id}-${state}-${space}`,
        lane_id: lane.lane_id,
        state,
        delivery: state === "completed" ? "queued_to_lead" : "failed",
        ...(typeof summary === "string" ? { summary } : {}),
        ...(state === "completed" ? this.filesOf(run.run_id) : {}),
      });
    }
  }

  /**
   * The files a lane's answer carried, handed back to the lead with the summary: the attachments
   * on the specialist's own messages in the run. A lane that answers with photographs would
   * otherwise send the lead a sentence about them and nothing else.
   */
  private filesOf(runId: string): { attachments?: unknown[] } {
    const said = this.log.filter(
      (event) =>
        event.type === "message.post" &&
        event.run_id === runId &&
        event.actor.kind === "harness" &&
        Array.isArray(event.payload["attachments"]),
    );
    const seen = new Set<string>();
    const files = said
      .flatMap((event) => event.payload["attachments"] as Record<string, unknown>[])
      .filter((each) => {
        const id = each["attachment_id"];
        if (typeof id !== "string" || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .slice(0, 20);
    return files.length === 0 ? {} : { attachments: files };
  }

  /** An event Chips itself appends as `system`: filled in and validated, past the door. */
  private appendSystem(event: Record<string, unknown>): StoredEvent {
    const draft: Record<string, unknown> = {
      v: 1,
      workspace_id: this.id,
      actor: { kind: "system", id: "system" },
      id: this.ids.next("event"),
      ts: this.nowIso(),
      ...event,
    };
    const parsed = parseEvent(draft);
    if (!parsed.ok) {
      throw new Error(
        `the fake wrote an invalid ${String(event["type"])}: ${parsed.error.message}`,
      );
    }
    return this.append(parsed.value);
  }

  /** What the transport knows and the sender must not choose, as the real server fills it. */
  private draftOf(
    principal: Principal,
    raw: unknown,
    extras: { readonly runId?: string | undefined; readonly idempotencyKey?: string | undefined },
  ): Record<string, unknown> {
    const now = this.nowIso();
    const draft: Record<string, unknown> = {
      v: 1,
      workspace_id: this.id,
      actor: { kind: principal.kind, id: principal.participantId },
      ...(isRecord(raw) ? raw : {}),
      ts: now,
      ...(extras.runId === undefined ? {} : { run_id: extras.runId }),
    };
    stamp(draft, principal, now);
    if (draft["id"] === undefined) draft["id"] = this.ids.next("event");
    if (draft["idempotency_key"] === undefined && extras.idempotencyKey !== undefined) {
      draft["idempotency_key"] = extras.idempotencyKey;
    }
    return draft;
  }

  private validate(
    draft: Record<string, unknown>,
    principal: Principal,
  ): { ok: true; value: Record<string, unknown> } | { ok: false; error: Refusal } {
    const owned = chipsOwns(String(draft["type"]));
    if (owned !== undefined) return { ok: false, error: owned };
    if (draft["type"] === "message.post" && Array.isArray(draft["upload_ids"])) {
      const attached = Array.isArray(draft["attachments"]) ? [...draft["attachments"]] : [];
      for (const id of draft["upload_ids"] as unknown[]) {
        attached.push(this.attachmentFor(id, principal));
      }
      draft["attachments"] = attached;
    }
    const parsed = parseEvent(draft);
    if (parsed.ok) {
      const type = String(draft["type"]);
      for (const field of parsed.dropped) this.dropped.push({ who: principal.kind, type, field });
      return { ok: true, value: parsed.value };
    }
    return {
      ok: false,
      error: {
        code: "invalid_event",
        kind: "invalid",
        message: parsed.error.message,
        ...(parsed.error.issues === undefined ? {} : { issues: parsed.error.issues }),
      },
    };
  }

  /** The attachment an upload id stands for: the uploader's, and only once its bytes are in. */
  private attachmentFor(uploadId: unknown, principal: Principal): unknown {
    if (typeof uploadId !== "string") return uploadId;
    const row = this.uploads.get(uploadId);
    if (row?.stored === undefined || row.uploaded_by !== principal.participantId) {
      return { attachment_id: uploadId, upload_not_found: true };
    }
    const { bytes: _bytes, ...described } = row.stored;
    return { attachment_id: row.attachment_id, filename: row.filename, ...described };
  }

  /** Rule 4: the run the event names. Fills in the run's space when the event names none. */
  private refuseOnRun(event: Record<string, unknown>, sender: Principal): Refusal | undefined {
    const runId = event["run_id"];
    if (typeof runId !== "string") return undefined;
    const type = String(event["type"]);
    const opening = type === "run.started";
    if (opening && typeof event["space_id"] !== "string") {
      return refusal("invalid_event", "invalid", "a run starts in a space: run.started names one");
    }
    const run = this.runs.get(runId);
    if (run === undefined) {
      if (opening) return undefined;
      return refusal(
        "not_found",
        "unknown_run",
        `no run ${runId} in this workspace; a run begins with run.started`,
      );
    }
    if (sender.kind === "harness" && run.harness_id !== sender.participantId) {
      return refusal("forbidden", "wrong_run", `run ${runId} was started by another harness`);
    }
    if (event["space_id"] === undefined) event["space_id"] = run.space_id;
    else if (event["space_id"] !== run.space_id) {
      return refusal("forbidden", "wrong_run", `run ${runId} belongs to another space`);
    }
    const reason = runAccepts(run.state, type);
    return reason === undefined
      ? undefined
      : refusal("invalid_event", "run_state", `${type} was refused: ${reason}`);
  }

  /**
   * Rule 5: the space the event names, and whether the sender is in it. Answering an approval
   * and handing one on are the exceptions, judged by rule 9 instead (ADR 0042): whoever the ask
   * named answers from wherever they are.
   */
  private refuseOnMembership(event: Readonly<Record<string, unknown>>): Refusal | undefined {
    const space = event["space_id"];
    if (typeof space !== "string" || event["type"] === "space.created") return undefined;
    if (event["type"] === "approval.resolved" || event["type"] === "approval.routed") {
      return undefined;
    }
    const actor = event["actor"] as { id: string };
    if (this.roleOf(space, actor.id) === undefined) {
      return refusal(
        "forbidden",
        "wrong_space",
        "an event may only be sent into a space its sender is a member of",
      );
    }
    return undefined;
  }

  /**
   * Rule 7: a change to a space comes from somebody with standing in it. A harness retitles or
   * closes only a space it opened; a guest changes nothing; somebody else is removed only by the
   * space's owner, where leaving is anyone's. Rule 5 has already said the sender is in the space.
   */
  private refuseOnSpaceChange(
    event: Readonly<Record<string, unknown>>,
    sender: Principal,
  ): Refusal | undefined {
    const type = String(event["type"]);
    if (!SPACE_CHANGES.has(type)) return undefined;
    const space = String(event["space_id"]);
    // An agent's standing is its own (ADR 0087): the door has said it is the sender's.
    const actor = (event["actor"] as { id: string }).id;
    const role = this.roleOf(space, actor);
    if (type === "space.updated") return this.refuseOnSpaceUpdate(event, sender, role);
    const leaving = event["participant_id"];
    if (type === "membership.removed" && (leaving === sender.participantId || leaving === actor)) {
      return undefined;
    }
    if (role === "guest") {
      return refusal("forbidden", "wrong_role", "a guest may not change who is in a space");
    }
    if (type === "membership.added" || role === "owner") return undefined;
    return refusal(
      "forbidden",
      "wrong_role",
      "only the owner of a space removes somebody else from it",
    );
  }

  private refuseOnSpaceUpdate(
    event: Readonly<Record<string, unknown>>,
    sender: Principal,
    role: Role | undefined,
  ): Refusal | undefined {
    const row = this.spaces.get(String(event["space_id"]));
    if (row === undefined) {
      return refusal("not_found", "unknown_space", "no such space in this workspace");
    }
    if (
      event["title"] === undefined &&
      event["state"] === undefined &&
      event["home"] === undefined
    ) {
      return refusal(
        "invalid_event",
        "invalid",
        "a space.updated says what changed: a title, a state or a home",
      );
    }
    if (sender.kind === "harness") return refuseHarnessOnSpaceUpdate(event, sender, role, row);
    if (role === "guest") {
      return refusal("forbidden", "wrong_role", "a guest may not retitle or close a space");
    }
    // The harness's home is its to name, and stays on the list (ADR 0069).
    if (event["home"] !== undefined) {
      return refusal(
        "forbidden",
        "wrong_role",
        "only the harness that opened a space makes it its home",
      );
    }
    if (row.home && event["state"] === "closed") {
      return refusal(
        "invalid_event",
        "invalid",
        "a harness's home is always there: it is not archived",
      );
    }
    return undefined;
  }

  /** Rule 8: somebody added to a space is somebody — here, the owner or the harness. */
  private refuseOnParticipant(event: Readonly<Record<string, unknown>>): Refusal | undefined {
    if (event["type"] !== "membership.added") return undefined;
    const named = event["participant_id"];
    const known =
      named === this.owner.participantId ||
      named === this.harness.participantId ||
      (typeof named === "string" && this.agents.has(named));
    return known
      ? undefined
      : refusal("not_found", "unknown_participant", "nobody in this workspace has that id");
  }

  /**
   * Rule 15: a room asked of a harness is asked of one that takes new spaces, for it to claim
   * under a key of its own — so not a thread, which is its parent's, and not a room with a key.
   */
  private refuseOnAsking(event: Readonly<Record<string, unknown>>): Refusal | undefined {
    if (event["type"] !== "space.created" || event["asked_of"] === undefined) return undefined;
    if (event["kind"] === "thread") {
      return refusal(
        "invalid_event",
        "invalid",
        "a thread is its space's; a new space is asked of a harness",
      );
    }
    if (event["external_key"] !== undefined) {
      return refusal(
        "invalid_event",
        "invalid",
        "a space asked of a harness has no key yet: the harness gives it one when it claims it",
      );
    }
    const asked = [event["asked_of"], ...((event["also_asked_of"] as unknown[] | undefined) ?? [])];
    if (asked.some((id) => id !== this.harness.participantId) || asked.length > 1) {
      // One harness here: another harness asked, or this one asked twice, is nobody to ask.
      if (asked.length > 1 && asked.every((id) => id === this.harness.participantId)) {
        return refusal("invalid_event", "invalid", "the harness asked first is not asked again");
      }
      return refusal(
        "not_found",
        "unknown_participant",
        "no harness in this workspace has that id",
      );
    }
    return this.capabilities.includes(HARNESS_CAPABILITIES.newSpaces)
      ? undefined
      : refusal(
          "invalid_event",
          "invalid",
          "that harness does not take new spaces: its manifest does not declare new_spaces",
        );
  }

  /**
   * Rule 9: a decision comes from who the ask named to make it, when it named anyone — from
   * wherever they are, since being named is standing enough (ADR 0042) — and when it named
   * nobody, from anyone in the room but a guest (Gate 5), which is where the room is required.
   */
  private refuseNotAnApprover(
    event: Readonly<Record<string, unknown>>,
    sender: Principal,
  ): Refusal | undefined {
    if (sender.kind === "harness") return this.refuseHarnessAnswer(event, sender);
    if (event["type"] !== "approval.resolved") return undefined;
    const approval = this.approvals.get(String(event["approval_id"]));
    if (approval === undefined) return undefined;
    // An ask that matters is answered once (ADR 0195): no standing yes for it, either way.
    if (approval.matters && (event["scope"] === "session" || event["scope"] === "always")) {
      return refusal(
        "invalid_event",
        "invalid",
        "an ask that matters is answered once: This session and Always are not given for money, outside messages, deletions or anything that can't be undone",
      );
    }
    if (approval.approvers.length === 0) {
      const space = typeof event["space_id"] === "string" ? event["space_id"] : approval.space_id;
      return this.refuseOnAnyone(space, sender);
    }
    if (approval.approvers.includes(sender.participantId)) return undefined;
    return refusal(
      "forbidden",
      "not_an_approver",
      "that approval is somebody else's to answer: policy named who may",
    );
  }

  /**
   * A harness settles an ask of its own run, answered in its own tools (ADR 0079): the ask is of
   * the run the event names, and that run is the harness's. Once, and never an expiry; This
   * session and Always are a person's to give. And only an ask that does not matter (SEC-10, ADR
   * 0195): money, outside messages, deletions and anything irreversible wait for a person. In this
   * fake nothing hands a harness an ask.
   */
  private refuseHarnessAnswer(
    event: Readonly<Record<string, unknown>>,
    sender: Principal,
  ): Refusal | undefined {
    const type = event["type"];
    if (type !== "approval.resolved" && type !== "question.answered") return undefined;
    const ask =
      type === "approval.resolved"
        ? this.approvals.get(String(event["approval_id"]))
        : this.questions.get(String(event["ask_id"]));
    const run = ask === undefined ? undefined : this.runs.get(ask.run_id);
    if (ask?.run_id !== event["run_id"] || run?.harness_id !== sender.participantId) {
      return refusal(
        "forbidden",
        "not_an_approver",
        "a harness answers only an approval policy handed it, or settles one its own run asked",
      );
    }
    const scope = event["scope"];
    if ((scope !== undefined && scope !== "once") || event["decision"] === "expired") {
      return refusal(
        "invalid_event",
        "invalid",
        "a harness settles its own ask once: This session and Always are a person's to give, and an expiry is Chips's",
      );
    }
    if (event["timed_out"] === true) {
      return refusal("invalid_event", "invalid", "a timeout is Chips's to say");
    }
    // Only an ask that does not matter (SEC-10, ADR 0195): the rest wait for a person.
    if (type === "approval.resolved" && (ask as ApprovalRow).matters) {
      return refusal(
        "forbidden",
        "not_an_approver",
        "a harness settles its own ask only when it does not matter: money, outside messages, deletions and anything that can't be undone wait for a person",
      );
    }
    return undefined;
  }

  /**
   * An ask that named nobody: anyone in the room but a guest, which is where the room is still
   * asked for, rule 5 having stood aside for every decision since ADR 0042.
   */
  private refuseOnAnyone(space: string | null, sender: Principal): Refusal | undefined {
    const standing = space === null ? undefined : this.roleOf(space, sender.participantId);
    if (space !== null && standing === undefined) {
      return refusal(
        "forbidden",
        "wrong_space",
        "an approval that names nobody is answered in the space: this sender is not in it",
      );
    }
    return standing === "guest"
      ? refusal(
          "forbidden",
          "not_an_approver",
          "an approval that names nobody is anyone's in the space but a guest's",
        )
      : undefined;
  }

  /**
   * Who may answer an ask, as the real server resolves the refs a harness sent (ADR 0030):
   * `owner` is the harness's owner, `any` is everyone in the room, a person id is itself; a
   * role has nobody but the owner here. Empty means anyone in the room but a guest (Gate 5).
   * `owner` and a person id resolve wherever that person is, as the real server resolves them
   * since ADR 0042; `any` and a role are the room's.
   */
  private approversOf(refs: unknown): string[] {
    if (!Array.isArray(refs) || refs.length === 0) return [];
    const ids = new Set<string>();
    for (const ref of refs) {
      if (ref === "owner") ids.add(this.owner.participantId);
      else if (ref === "any") return [];
      else if (typeof ref === "string" && ref.startsWith("role:"))
        ids.add(this.owner.participantId);
      else if (typeof ref === "string") ids.add(ref);
    }
    return [...ids];
  }

  /** Rule 6: first answer wins. And an answer names an ask this workspace has. */
  private refuseSecondAnswer(event: Readonly<Record<string, unknown>>): Refusal | undefined {
    const type = String(event["type"]);
    if (!DECISIONS.has(type)) return undefined;
    if (type === "approval.resolved") {
      const approval = this.approvals.get(String(event["approval_id"]));
      if (approval === undefined) {
        return refusal(
          "not_found",
          "unknown_approval",
          "no approval with that id in this workspace",
        );
      }
      if (approval.state === "resolved") {
        return refusal(
          "invalid_event",
          "already_decided",
          `that approval was already answered by ${approval.resolved_by ?? "somebody"}; the first answer wins`,
        );
      }
      return undefined;
    }
    const question = this.questions.get(String(event["ask_id"]));
    if (question === undefined) {
      return refusal("not_found", "unknown_question", "no question with that id in this workspace");
    }
    if (question.state === "answered") {
      return refusal(
        "invalid_event",
        "already_decided",
        `that question was already answered by ${question.answered_by ?? "somebody"}; the first answer wins`,
      );
    }
    return undefined;
  }

  /** Into the log, then into the projections, then to whoever is listening. */
  private append(event: Record<string, unknown>): StoredEvent {
    this.seq += 1;
    const stored: StoredEvent = {
      seq: this.seq,
      id: String(event["id"]),
      type: String(event["type"]),
      ts: String(event["ts"]),
      space_id: typeof event["space_id"] === "string" ? event["space_id"] : null,
      run_id: typeof event["run_id"] === "string" ? event["run_id"] : null,
      actor: event["actor"] as { kind: string; id: string },
      idempotency_key:
        typeof event["idempotency_key"] === "string" ? event["idempotency_key"] : null,
      payload: { ...event, seq: this.seq },
    };
    this.log.push(stored);
    if (stored.idempotency_key !== null) {
      this.byKey.set(keyOf(stored.actor.id, stored.idempotency_key), stored);
    }
    this.project(stored);
    for (const listener of this.listeners) listener(stored);
    // One room per agent (ADR 0087): every append has its consequences, as the real store's do.
    this.react(stored);
    return stored;
  }

  private project(event: StoredEvent): void {
    this.projectRun(event);
    this.projectAsks(event);
    this.projectSpace(event);
    this.projectAgent(event);
  }

  /** An agent registered or changed (ADR 0087). */
  private projectAgent(event: StoredEvent): void {
    const p = event.payload;
    if (event.type === "agent.registered") {
      this.agents.set(String(p["agent_id"]), {
        agent_id: String(p["agent_id"]),
        key: String(p["key"]),
        name: String(p["name"]),
        lead: p["lead"] === true,
        state: "active",
        ...(typeof p["forked_from"] === "string" ? { forked_from: p["forked_from"] } : {}),
      });
    } else if (event.type === "agent.updated") {
      this.projectAgentChange(p, event.actor);
    } else if (event.type === "agent.deleted") {
      this.projectDeleted(String(p["agent_id"]));
    } else {
      this.projectWhereabouts(event);
    }
  }

  /** An agent a person deleted (ADR 0095): marked, and what it was holding dropped. */
  private projectDeleted(agentId: string): void {
    const row = this.agents.get(agentId);
    if (row !== undefined) row.deleted = true;
    for (let at = this.held.length - 1; at >= 0; at -= 1) {
      if (this.held[at]?.agent_id === agentId) this.held.splice(at, 1);
    }
  }

  /** An agent's new name, state or face, whichever `agent.updated` carries. */
  private projectAgentChange(p: StoredEvent["payload"], actor: StoredEvent["actor"]): void {
    const row = this.agents.get(String(p["agent_id"]));
    if (row === undefined) return;
    if (typeof p["name"] === "string") {
      row.name = p["name"];
      // A person's name for it holds against its harness (ADR 0091).
      if (actor.kind === "person") row.name_by = actor.id;
    }
    if (p["state"] === "active" || p["state"] === "archived") row.state = p["state"];
    if ("face" in p) row.face = faceOf(p["face"]);
    if (typeof p["lead"] === "boolean") row.lead = p["lead"];
  }

  /** Where an agent was last, the room an archive took it from, and what it said meanwhile. */
  private projectWhereabouts(event: StoredEvent): void {
    const p = event.payload;
    const agent = this.agents.get(String(p["agent_id"] ?? p["from"]));
    if (agent !== undefined) this.projectPlace(event, agent);
    if (event.type === "message.held") {
      this.held.push({
        event_id: event.id,
        agent_id: String(p["agent_id"]),
        said_at: event.ts,
        text: String(p["text"]),
        attachments: Array.isArray(p["attachments"]) ? p["attachments"] : [],
      });
    } else if (event.type === "message.post" && typeof p["from_held"] === "string") {
      const at = this.held.findIndex((row) => row.event_id === p["from_held"]);
      if (at >= 0) this.held.splice(at, 1);
    }
  }

  /** An agent put in a room, taken out of one, or replaced in one. */
  private projectPlace(event: StoredEvent, agent: AgentRow): void {
    const room = event.space_id ?? undefined;
    if (event.type === "agent.attached") agent.released_from = undefined;
    if (event.type === "membership.replaced") agent.last_space = room;
    if (event.type !== "agent.released") return;
    agent.last_space = room;
    const reason = event.payload["reason"];
    agent.released_from = reason === "archived" || reason === "agent_archived" ? room : undefined;
  }

  private projectRun(event: StoredEvent): void {
    if (event.run_id === null) return;
    if (event.type === "run.started" && !this.runs.has(event.run_id)) {
      this.runs.set(event.run_id, {
        run_id: event.run_id,
        space_id: event.space_id ?? "",
        // The harness whose run it is: an agent's (ADR 0087), or the harness itself.
        harness_id: (event.actor as { harness_id?: string }).harness_id ?? event.actor.id,
        ...(event.actor.kind === "agent" ? { agent_id: event.actor.id } : {}),
        state: "running",
      });
      return;
    }
    const run = this.runs.get(event.run_id);
    if (run === undefined) return;
    run.state = TRANSITIONS[event.type]?.[run.state] ?? run.state;
  }

  private projectAsks(event: StoredEvent): void {
    const p = event.payload;
    switch (event.type) {
      case "approval.request": {
        const seconds = Number(p["expires_in"]);
        this.approvals.set(String(p["approval_id"]), {
          approval_id: String(p["approval_id"]),
          run_id: event.run_id ?? "",
          space_id: event.space_id,
          expires_at: new Date(Date.parse(event.ts) + seconds * 1000).toISOString(),
          fallback: String(p["fallback"] ?? "deny"),
          approvers: this.approversOf(p["approvers"]),
          matters: asksWhatMatters(p),
          state: "pending",
          decision: null,
          scope: null,
          reason: null,
          resolved_by: null,
          resolved_at: null,
          updated_input: undefined,
        });
        return;
      }
      case "approval.resolved": {
        const row = this.approvals.get(String(p["approval_id"]));
        if (row === undefined) return;
        row.state = "resolved";
        row.decision = String(p["decision"]);
        row.scope = String(p["scope"] ?? "once");
        row.reason = typeof p["reason"] === "string" ? p["reason"] : null;
        row.resolved_by = String(p["resolved_by"]);
        row.resolved_at = String(p["resolved_at"]);
        row.updated_input = p["updated_input"];
        return;
      }
      case "question.ask":
        this.questions.set(String(p["ask_id"]), {
          ask_id: String(p["ask_id"]),
          run_id: event.run_id ?? "",
          space_id: event.space_id,
          questions: p["questions"] as QuestionRow["questions"],
          state: "pending",
          answered_by: null,
        });
        return;
      case "question.answered": {
        const row = this.questions.get(String(p["ask_id"]));
        if (row === undefined) return;
        row.state = "answered";
        row.answered_by = String(p["answered_by"]);
        return;
      }
      default:
        return;
    }
  }

  private projectSpace(event: StoredEvent): void {
    const space = event.space_id;
    if (space === null) return;
    const p = event.payload;
    if (event.type === "space.created") {
      this.spaces.set(space, createdSpace(space, event));
      return;
    }
    const row = this.spaces.get(space);
    if (row === undefined) return;
    if (event.type === "membership.added") {
      row.members.set(String(p["participant_id"]), (p["role"] as Role | undefined) ?? "member");
    } else if (event.type === "membership.removed") {
      row.members.delete(String(p["participant_id"]));
    } else if (event.type === "membership.replaced") {
      this.replaceMember(row, String(p["from"]), String(p["to"]));
    } else if (event.type === "space.updated" || event.type === "space.claimed") {
      this.spaces.set(space, changedSpace(row, event));
    }
  }

  /**
   * One member in another's place in a room, keeping its role; and whoever holds a place last is
   * who what was said in it reads as (ADR 0087, Phase 3).
   */
  private replaceMember(row: SpaceRow, from: string, to: string): void {
    const role = row.members.get(from) ?? "member";
    row.members.delete(from);
    row.members.set(to, role);
    const here = this.replaced.get(row.space_id) ?? new Map<string, string>();
    for (const [was, now] of here) if (now === from) here.set(was, to);
    here.set(from, to);
    this.replaced.set(row.space_id, here);
  }

  // One room per agent (ADR 0087, Phase 4): the real door's rules and the real store's reactions.

  /** The open room an agent is in, or nothing while it is free (rule 1). */
  agentRoom(agentId: string): string | undefined {
    for (const space of this.spaces.values()) {
      if (space.state === "open" && space.members.has(agentId)) return space.space_id;
    }
    return undefined;
  }

  /**
   * Why this agent may not work on a room's project (ADR 0220), in the server's words, or nothing
   * when it may: it is the harness's, not deleted, and in the room now.
   */
  refuseOnProject(agentId: string | undefined, spaceId: string): string | undefined {
    if (agentId === undefined) {
      return "Name the agent this is for in the chips-actor header: a space's project is worked on by an agent.";
    }
    const agent = this.agents.get(agentId);
    if (agent === undefined) return "A harness works on a project only as one of its own agents.";
    if (agent.deleted === true) return "That agent was deleted.";
    if (this.spaces.get(spaceId)?.members.has(agentId) !== true) {
      return `${agent.name} is in no space with that id.`;
    }
    return undefined;
  }

  /** A push that moved a room's project forward (ADR 0220), as the server records it. */
  recordProjectChange(
    spaceId: string,
    agentId: string,
    change: Readonly<Record<string, unknown>>,
  ): StoredEvent {
    return this.appendSystem({
      type: "project.changed",
      space_id: spaceId,
      actor: { kind: "agent", id: agentId, harness_id: this.harness.participantId },
      idempotency_key: `project-${spaceId}-${String(change["after"])}`,
      by: agentId,
      ...change,
    });
  }

  /** What the harness's agents route reports of an agent: its room, and how much it holds. */
  whereabouts(agent: AgentRow): {
    room: string | null;
    released_from: string | null;
    held: number;
  } {
    return {
      room: this.agentRoom(agent.agent_id) ?? null,
      released_from: agent.released_from ?? null,
      held: this.held.filter((row) => row.agent_id === agent.agent_id).length,
    };
  }

  /** A reaction's event, once: the real store's idempotency key does this for it. */
  private appendOnce(event: Record<string, unknown>): StoredEvent {
    const actor = (event["actor"] as { id?: string } | undefined)?.id ?? "system";
    const seen = this.byKey.get(keyOf(actor, String(event["idempotency_key"])));
    return seen ?? this.appendSystem(event);
  }

  /** The harness's own event, once, for a reaction said as the harness. */
  private appendAsOnce(principal: Principal, event: Record<string, unknown>): void {
    if (this.byKey.has(keyOf(principal.participantId, String(event["idempotency_key"])))) return;
    this.appendAs(principal, event);
  }

  private readonly reactions: Readonly<Record<string, (event: StoredEvent) => void>> = {
    "membership.added": (event) => this.attachedNotice(event, event.payload["participant_id"]),
    "membership.replaced": (event) => this.attachedNotice(event, event.payload["to"]),
    "agent.attached": (event) => this.postHeld(event),
    "run.cancel": (event) => {
      if (event.run_id !== null) this.cascade(event.run_id);
    },
    "membership.removed": (event) => this.releasedNotice(event),
    "space.updated": (event) => {
      if (event.payload["state"] === "closed") this.archived(event);
      else if (event.payload["state"] === "open") this.unarchived(event);
    },
    "agent.updated": (event) => {
      const agentId = String(event.payload["agent_id"]);
      if (event.payload["state"] === "archived") this.agentArchived(event, agentId);
      else if (event.payload["state"] === "active") this.agentRestored(event, agentId);
    },
  };

  /**
   * A room with two or more agents has a lead, unless a person said nobody leads it (ADR 0291):
   * the agent there longest, named after anybody comes into the room or goes, as the real server
   * names it.
   */
  private ensureLead(event: StoredEvent): void {
    const spaceId = event.space_id;
    if (spaceId === null || !MEMBERSHIP_MOVES.has(event.type)) return;
    const space = this.spaces.get(spaceId);
    if (space === undefined || space.state !== "open") return;
    // In the order they joined: the first is the one there longest.
    const agents = [...space.members.keys()].filter((id) => this.agents.has(id));
    const [longest] = agents;
    if (longest === undefined || agents.length < 2 || this.leadOf(spaceId) !== undefined) return;
    // A person who said nobody leads meant it; a lead they chose that has since left did not.
    const chosen = this.log.findLast(
      (each) => each.type === "space.lead_set" && each.space_id === spaceId,
    );
    if (chosen?.actor.kind === "person" && chosen.payload["agent_id"] === null) return;
    this.appendOnce({
      type: "space.lead_set",
      space_id: spaceId,
      idempotency_key: `lead-longest-${spaceId}-at-${event.seq}`,
      agent_id: longest,
    });
  }

  private react(event: StoredEvent): void {
    // A lane's run ended: its lead is told once the event that ended it has gone out. Told from
    // inside the projection, the news went out first, and a socket, which takes events in order,
    // then dropped the event it was news of (agents review, finding 37).
    const run = event.run_id === null ? undefined : this.runs.get(event.run_id);
    if (run !== undefined) this.tellLead(event, run);
    this.reactions[event.type]?.(event);
    this.ensureLead(event);
    this.handOver(event);
    this.holdAtCeiling(event);
  }

  /**
   * A room's job weighed against its ceiling after each cost reported there (ADR 0118), as the
   * real `hold-at-ceiling`: from 80% a warning to the room, and at the ceiling the agents paused by
   * Chips, saying why, unless they are paused already, then the pause's warning. Once each per job.
   * Nothing in a room with no cap (ADR 0292).
   */
  private holdAtCeiling(event: StoredEvent): void {
    const spaceId = event.space_id;
    if (event.type !== "usage" || spaceId === null) return;
    const spend = spendInLog(this.log, spaceId, event.seq);
    if (spend === undefined) return;
    const stage = spendStage(spend);
    if (stage === "within") return;
    const job = `spend-${spaceId}-${spend.since_seq}`;
    const once = (key: string) => !this.byKey.has(keyOf("system", key));
    if (stage === "ceiling" && once(`${job}-paused`) && !exchangeInLog(this.log, spaceId).paused) {
      this.appendSystem({
        type: "exchange.set",
        space_id: spaceId,
        idempotency_key: `${job}-paused`,
        state: "paused",
        why: "spend",
        spend,
      });
    }
    const at = stage === "ceiling" ? 100 : 80;
    if (!once(`${job}-${at}`)) return;
    this.appendSystem({
      type: "budget.warning",
      space_id: spaceId,
      idempotency_key: `${job}-${at}`,
      budget: { limit_usd: spend.ceiling_usd, spent_usd: spend.spent_usd },
      threshold: at,
      action: at === 100 ? "pause" : "warn",
      scope: "job",
      since_seq: spend.since_seq,
    });
  }

  /**
   * What the referee held, handed over once a person acts in the room (ADR 0097), as the real
   * `hand-over-held`: for each agent, the newest held message that was for it, once.
   */
  private handOver(event: StoredEvent): void {
    const spaceId = event.space_id;
    if (event.actor.kind !== "person" || spaceId === null) return;
    if (!resetsTheCount(event.type, event.payload)) return;
    const before = exchangeInLog(this.log, spaceId, event.seq - 1);
    const held = heldInLog(this.log, spaceId, before.personSeq ?? 0, event.seq);
    const space = this.spaces.get(spaceId);
    if (held.length === 0 || space === undefined) return;
    const agents = [...space.members.keys()].filter(
      (id) => isId("harness", id) || isId("agent", id),
    );
    const handed = new Set<string>();
    for (const message of held) {
      const meant = resolveAddress({
        sender: message.actor,
        mentioned: (message.payload["mentions"] as string[] | undefined) ?? [],
        everyone: mentionsEveryone(String(message.payload["text"] ?? "")),
        ...this.toOf(message),
        agents,
      }).addressed_to;
      for (const agentId of meant.filter((id) => !handed.has(id))) {
        handed.add(agentId);
        this.appendSystem({
          type: "message.handed",
          space_id: spaceId,
          idempotency_key: `handed-${message.id}-${agentId}`,
          message_id: messageIdOf(message.id),
          agent_id: agentId,
        });
      }
    }
  }

  /** A held message's own aim, as it was sent. */
  private toOf(message: StoredEvent): { to?: string[] | "all" } {
    const to = message.payload["to"];
    return to === "all" || Array.isArray(to) ? { to: to as string[] | "all" } : {};
  }

  /** How the agents' talk in a room stands as of a seq (ADR 0097), for what a turn is handed. */
  exchangeAt(spaceId: string, seq: number): FakeExchange {
    return exchangeInLog(this.log, spaceId, seq);
  }

  /** A person pauses the agents in a room, or lets them carry on (ADR 0097). */
  setExchange(spaceId: string, state: "paused" | "going", by: string): StoredEvent {
    return this.appendSystem({
      type: "exchange.set",
      space_id: spaceId,
      actor: { kind: "person", id: by },
      idempotency_key: `exchange-${spaceId}-${state}-at-${this.seq}`,
      state,
    });
  }

  /**
   * A person chooses who leads a room, or that nobody does (ADR 0104). The fake keeps no clock, so
   * it never hands a lead what was nobody's turn on its own; `handToLead` does, when a test says.
   */
  setLead(spaceId: string, agentId: string | null, by: string): StoredEvent {
    return this.appendSystem({
      type: "space.lead_set",
      space_id: spaceId,
      actor: { kind: "person", id: by },
      idempotency_key: `lead-${spaceId}-${agentId ?? "none"}-at-${this.seq}`,
      agent_id: agentId,
    });
  }

  /** Who leads a room now (ADR 0104): the agent last chosen, while it is there. */
  leadOf(spaceId: string): string | undefined {
    const chosen = this.log.findLast(
      (event) => event.type === "space.lead_set" && event.space_id === spaceId,
    )?.payload["agent_id"];
    return typeof chosen === "string" && this.spaces.get(spaceId)?.members.has(chosen) === true
      ? chosen
      : undefined;
  }

  /**
   * A person sets what a room allows a job, sets it back to the default (ADR 0117), or takes the
   * cap off with `"none"` (ADR 0292).
   */
  setSpendCeiling(spaceId: string, usd: number | null | "none", by: string): StoredEvent {
    const set = {
      space_id: spaceId,
      actor: { kind: "person", id: by },
      idempotency_key: `spend-ceiling-${spaceId}-${usd ?? "default"}-at-${this.seq}`,
    } as const;
    return this.appendSystem(
      usd === "none"
        ? { ...set, type: "space.spend_ceiling_lifted" }
        : { ...set, type: "space.spend_ceiling_set", usd },
    );
  }

  /**
   * What a room's job has spent as of `upto`, against what the room allows a job (ADR 0117), as
   * Chips works it out: from the last person's act or brief handed in, what the room's `usage`
   * reports said since, a run's own report being its total so far.
   */
  spendOf(spaceId: string, upto: number): JobSpend | undefined {
    return spendInLog(this.log, spaceId, upto);
  }

  /** What was nobody's turn, handed to the room's lead as the sweep would (ADR 0104). */
  handToLead(spaceId: string, messageEventId: string): StoredEvent | undefined {
    const lead = this.leadOf(spaceId);
    if (lead === undefined) return undefined;
    return this.appendOnce({
      type: "message.handed",
      space_id: spaceId,
      actor: { kind: "system", id: "system" },
      idempotency_key: `lead-${messageEventId}`,
      message_id: messageIdOf(messageEventId),
      agent_id: lead,
      lead: true,
    });
  }

  /** An agent put in a room: said where everyone can see. */
  private attachedNotice(event: StoredEvent, agentId: unknown): void {
    if (typeof agentId !== "string" || !this.agents.has(agentId) || event.space_id === null) {
      return;
    }
    const from = event.payload["moved_from"];
    const forkOf = event.payload["fork_of"];
    const madeFor = event.payload["made_for"];
    this.appendOnce({
      type: "agent.attached",
      space_id: event.space_id,
      idempotency_key: `attached-${event.id}`,
      agent_id: agentId,
      by: event.actor.id,
      ...(typeof from === "string" ? { moved_from: from } : {}),
      ...(typeof forkOf === "string" ? { fork_of: forkOf } : {}),
      ...(typeof madeFor === "string" ? { made_for: madeFor } : {}),
    });
  }

  /** What an agent said while in no room, posted in the room it is in now, oldest first. */
  private postHeld(event: StoredEvent): void {
    const agentId = String(event.payload["agent_id"]);
    for (const row of this.held.filter((each) => each.agent_id === agentId)) {
      this.appendOnce({
        type: "message.post",
        actor: { kind: "agent", id: agentId, harness_id: this.harness.participantId },
        space_id: event.space_id,
        idempotency_key: `post-${row.event_id}`,
        text: row.text,
        ...(row.attachments.length === 0 ? {} : { attachments: row.attachments }),
        addressed_to: [],
        held_since: row.said_at,
        from_held: row.event_id,
      });
    }
  }

  /** An agent out of a room: said, with why. */
  private releasedNotice(event: StoredEvent): void {
    const p = event.payload;
    const agentId = String(p["participant_id"]);
    if (!this.agents.has(agentId) || event.space_id === null) return;
    this.appendOnce({
      type: "agent.released",
      space_id: event.space_id,
      idempotency_key: `released-${event.id}`,
      agent_id: agentId,
      by: typeof p["removed_by"] === "string" ? p["removed_by"] : event.actor.id,
      reason: typeof p["reason"] === "string" ? p["reason"] : "removed",
      ...(typeof p["moved_to"] === "string" ? { moved_to: p["moved_to"] } : {}),
    });
  }

  /**
   * Stop the work in a room that somebody is leaving (agents review, findings 10 and 12): one
   * agent's runs there, or every run there when the room itself is going. Before the leaving is
   * written, as the real server does it, so the harness is still in the room to hear.
   */
  private stopWork(
    spaceId: string,
    how: { readonly reason: ReleaseReason; readonly by: string; readonly agentId?: string },
  ): void {
    for (const run of this.runs.values()) {
      if (run.space_id !== spaceId || TERMINAL.has(run.state)) continue;
      if (how.agentId !== undefined && run.agent_id !== how.agentId) continue;
      this.appendOnce({
        type: "run.cancel",
        space_id: spaceId,
        run_id: run.run_id,
        idempotency_key: `left-cancel-${run.run_id}`,
        reason: STOPPED_BECAUSE[how.reason],
        by: how.by,
      });
    }
  }

  /** Take an agent out of a room, for a reason: its work there is stopped first. */
  private takeOut(
    spaceId: string,
    agentId: string,
    how: { readonly reason: ReleaseReason; readonly by: string; readonly key: string },
  ): void {
    this.stopWork(spaceId, { reason: how.reason, by: how.by, agentId });
    this.appendOnce({
      type: "membership.removed",
      space_id: spaceId,
      idempotency_key: how.key,
      participant_id: agentId,
      removed_by: how.by,
      reason: how.reason,
    });
  }

  /** A room archived (rule 3): its runs stopped, then its agents released. */
  private archived(event: StoredEvent): void {
    const spaceId = event.space_id;
    if (spaceId === null) return;
    this.stopWork(spaceId, { reason: "archived", by: event.actor.id });
    for (const agent of this.agentsIn(spaceId)) {
      this.takeOut(spaceId, agent.agent_id, {
        reason: "archived",
        by: event.actor.id,
        key: `archive-release-${event.id}-${agent.agent_id}`,
      });
    }
  }

  /** A room unarchived (rule 4): the agents its archive released that are still free. */
  private unarchived(event: StoredEvent): void {
    const spaceId = event.space_id;
    if (spaceId === null) return;
    for (const agent of this.agents.values()) {
      if (agent.released_from !== spaceId || this.agentRoom(agent.agent_id) !== undefined) continue;
      this.appendOnce({
        type: "membership.added",
        space_id: spaceId,
        idempotency_key: `unarchive-attach-${event.id}-${agent.agent_id}`,
        participant_id: agent.agent_id,
        participant_kind: "agent",
        role: "member",
      });
    }
  }

  /** An agent archived in its harness (rule 9): out, and the room archived if it was alone. */
  private agentArchived(event: StoredEvent, agentId: string): void {
    const spaceId = this.agentRoom(agentId);
    if (spaceId === undefined) return;
    // The Main agent stays in its Main room (rule 7), which is always there.
    if (this.agents.get(agentId)?.lead === true && this.spaces.get(spaceId)?.home === true) return;
    // A person's archive is said as theirs (ADR 0095); a harness's, as its.
    const who = event.actor.kind === "person" ? this.owner : this.harness;
    this.takeOut(spaceId, agentId, {
      reason: "agent_archived",
      by: who.participantId,
      key: `agent-archived-${event.id}`,
    });
    this.closeIfEmpty(spaceId, who, `agent-archived-close-${event.id}`);
  }

  /** A room archived because the only agent in it left for good (rule 9, ADR 0095). */
  private closeIfEmpty(spaceId: string, who: Principal, key: string): void {
    const room = this.spaces.get(spaceId);
    if (room === undefined || room.home || room.state === "closed") return;
    if (this.agentsIn(spaceId).length > 0) return;
    this.appendAsOnce(who, {
      type: "space.updated",
      space_id: spaceId,
      idempotency_key: key,
      state: "closed",
    });
  }

  /** An agent restored in its harness: back to the room its archive closed, reopened. */
  private agentRestored(event: StoredEvent, agentId: string): void {
    const from = this.agents.get(agentId)?.released_from;
    if (from === undefined || this.agentRoom(agentId) !== undefined) return;
    const room = this.spaces.get(from);
    if (room === undefined) return;
    // A room that stayed open, for the agents still there, takes it back now (ADR 0095).
    if (room.state !== "closed") {
      this.appendOnce({
        type: "membership.added",
        space_id: from,
        idempotency_key: `unarchive-attach-${event.id}-${agentId}`,
        participant_id: agentId,
        participant_kind: "agent",
        role: "member",
      });
      return;
    }
    this.appendAsOnce(event.actor.kind === "person" ? this.owner : this.harness, {
      type: "space.updated",
      space_id: from,
      idempotency_key: `agent-restored-open-${event.id}`,
      state: "open",
    });
  }

  /**
   * Rule 16: an agent is in one room at a time; an archived room takes none; the Main agent is
   * only in its Main room, which takes no other agent; and an agent archived in its harness joins
   * nothing. All but the first clause below and the archived one are `refuseAgentInto`, the
   * function the real door and the real store ask (agents review, findings 5 to 8).
   */
  private refuseOnAgentMembership(event: Readonly<Record<string, unknown>>): Refusal | undefined {
    if (event["type"] !== "membership.added") return undefined;
    const agent = this.agents.get(String(event["participant_id"]));
    if (agent === undefined) return undefined;
    const space = this.spaces.get(String(event["space_id"]));
    if (agent.lead && space?.home !== true) {
      return refusal("forbidden", "lead_room", "the Main agent stays in its Main space");
    }
    const placed = this.refusePlacing(agent.agent_id, String(event["space_id"]));
    if (placed?.kind === "lead_room") return placed;
    if (agent.state === "archived") {
      return refusal("forbidden", "agent_archived", "that agent is archived");
    }
    return placed;
  }

  /** The one-room rule for an agent and a room, as the real store's gate asks it. */
  private refusePlacing(agentId: string, spaceId: string, replacing?: string): Refusal | undefined {
    const agent = this.agents.get(agentId);
    if (agent === undefined) return undefined;
    const space = this.spaces.get(spaceId);
    const elsewhere = [...this.spaces.values()].find(
      (each) => each.space_id !== spaceId && each.members.has(agentId),
    );
    const here = space === undefined ? [] : this.agentsIn(spaceId);
    const refused = refuseAgentInto({
      agent: { id: agentId, lead: agent.lead, deleted: agent.deleted === true },
      room:
        space === undefined
          ? null
          : { space_id: space.space_id, state: space.state, home: space.home === true },
      elsewhere: elsewhere?.space_id ?? null,
      others: here.filter((each) => each.agent_id !== agentId && each.agent_id !== replacing)
        .length,
      replacesLead: here.some((each) => each.agent_id === replacing && each.lead),
    });
    if (refused === undefined) return undefined;
    return {
      ...refusal(
        refused.kind === "unknown_space" ? "not_found" : "forbidden",
        refused.kind,
        refused.message,
      ),
      ...(refused.space_id === undefined ? {} : { space_id: refused.space_id }),
    };
  }

  /** Rule 17: the Main agent is not taken out of its Main room (agents review, finding 9). */
  private refuseOnLeadRemoval(event: Readonly<Record<string, unknown>>): Refusal | undefined {
    if (event["type"] !== "membership.removed") return undefined;
    const agent = this.agents.get(String(event["participant_id"]));
    const space = this.spaces.get(String(event["space_id"]));
    if (agent?.lead !== true || space?.home !== true) return undefined;
    return refusal("forbidden", "lead_room", "the Main agent stays in its Main space");
  }

  /**
   * What an agent in no room says (rule 6): held, or, for one never in a room, said in a room
   * opened with the harness's owner. Naming no room, one in a room says it there.
   */
  private holdIfFree(event: Record<string, unknown>, principal: Principal): void {
    if (event["type"] !== "message.post" || principal.kind !== "harness") return;
    const named = typeof event["space_id"] === "string" ? event["space_id"] : undefined;
    const agentId = this.speakerOutside(event, principal, named);
    if (agentId === undefined) return;
    const room = this.agentRoom(agentId);
    if (room !== undefined) {
      if (named === undefined) event["space_id"] = room;
      return;
    }
    const agent = this.agents.get(agentId);
    if (agent !== undefined && !this.everIn(agent)) {
      event["space_id"] = this.roomWithOwner(agent, `agent-room-${agent.agent_id}`);
      return;
    }
    for (const field of ROOM_FIELDS) delete event[field];
    event["type"] = "message.held";
    event["agent_id"] = agentId;
  }

  /**
   * The agent a post is said by, when it is not in the room the post names. Nothing for an agent
   * in the room it names, and nothing for a room that is gone, which the door refuses and does
   * not hold for the next (agents review, finding 10).
   */
  private speakerOutside(
    event: Record<string, unknown>,
    principal: Principal,
    named: string | undefined,
  ): string | undefined {
    if (named !== undefined && !this.spaces.has(named)) return undefined;
    const agentId = this.speakerAgent(event, principal, named);
    if (agentId === undefined) return undefined;
    return named !== undefined && this.roleOf(named, agentId) !== undefined ? undefined : agentId;
  }

  /** Who a harness's post is said by: its agent named, or the one that last left the room named. */
  private speakerAgent(
    event: Record<string, unknown>,
    principal: Principal,
    named: string | undefined,
  ): string | undefined {
    const actor = event["actor"] as { kind?: unknown; id?: unknown };
    if (actor.kind === "agent") return String(actor.id);
    if (named === undefined || this.roleOf(named, principal.participantId) !== undefined) {
      return undefined;
    }
    const left = [...this.agents.values()].find(
      (agent) => agent.last_space === named && this.agentRoom(agent.agent_id) === undefined,
    );
    if (left === undefined) return undefined;
    this.speakAs(event, principal, left);
    return left.agent_id;
  }

  /** Whether an agent was ever in a room. */
  private everIn(agent: AgentRow): boolean {
    if (agent.last_space !== undefined) return true;
    return [...this.spaces.values()].some((space) => space.members.has(agent.agent_id));
  }

  /** A room with the harness's owner for a free agent: its first words, or a hand-off (rule 8). */
  private roomWithOwner(agent: AgentRow, key: string): string {
    const spaceId = this.ids.next("space");
    const opened = this.appendOnce({
      type: "space.created",
      space_id: spaceId,
      idempotency_key: key,
      kind: "direct",
      title: agent.name,
      opened_for: this.owner.participantId,
    });
    const room = opened.space_id ?? spaceId;
    for (const [who, kind, role] of [
      [this.owner.participantId, "person", "owner"],
      [agent.agent_id, "agent", "member"],
    ] as const) {
      this.appendOnce({
        type: "membership.added",
        space_id: room,
        idempotency_key: `${key}-${who}`,
        participant_id: who,
        participant_kind: kind,
        role,
      });
    }
    return room;
  }

  /** A claim whose key's agent is in another room: refused. */
  private refuseElsewhere(key: string, spaceId: string): Refusal | undefined {
    const agent = [...this.agents.values()].find((each) => each.key === key);
    const where = agent === undefined ? undefined : this.agentRoom(agent.agent_id);
    if (where === undefined || where === spaceId) return undefined;
    return refusal(
      "invalid_event",
      "agent_elsewhere",
      `That key's agent is in another space (${where}), and an agent is in one space at a time.`,
    );
  }

  /** A room asked of the harness beside another: it answers with its key's agent in its place. */
  private answer(
    row: SpaceRow,
    key: string,
  ): { ok: true; value: Claimed } | { ok: false; error: Refusal } {
    const unchanged = {
      ok: true as const,
      value: { spaceId: row.space_id, claimed: false, retitled: false },
    };
    if (!row.members.has(this.harness.participantId)) {
      const agent = [...this.agents.values()].find((each) => each.key === key);
      if (agent !== undefined && row.members.has(agent.agent_id)) return unchanged;
      return {
        ok: false,
        error: refusal(
          "forbidden",
          "not_asked",
          "This harness was taken out of that space, so it cannot answer.",
        ),
      };
    }
    const elsewhere = this.refuseElsewhere(key, row.space_id);
    if (elsewhere !== undefined) return { ok: false, error: elsewhere };
    this.agentInPlace(row.space_id, key, row.title);
    return { ok: true, value: { ...unchanged.value, claimed: true } };
  }

  /** Why an agent may not be moved into a room, or nothing when it may. */
  private refuseMove(agentId: string, spaceId: string): Refusal | undefined {
    const agent = this.agents.get(agentId);
    const space = this.spaces.get(spaceId);
    if (agent === undefined)
      return refusal("not_found", "unknown_agent", "No agent of that id here.");
    if (space === undefined)
      return refusal("not_found", "unknown_space", "No space of that id here.");
    const stays = agent.lead || agent.state === "archived";
    if (stays || space.home || space.state !== "open") {
      return refusal("invalid_event", "invalid", "That agent cannot be moved into that space.");
    }
    return undefined;
  }

  /**
   * A person gives an agent a face, or its initials back with `null`, as `PUT` and `DELETE
   * /v1/agents/:id/face` do (ADR 0089): `agent.updated` carrying the face and nothing else, which
   * every connection hears. The same face again records nothing.
   */
  setAgentFace(agentId: string, face: SpaceIcon | null): boolean {
    const agent = this.agents.get(agentId);
    if (agent === undefined) return false;
    const now = agent.face ?? null;
    if (JSON.stringify(now) === JSON.stringify(face)) return false;
    this.appendAs(this.owner, {
      type: "agent.updated",
      idempotency_key: `agent-face-${agentId}-${digest(JSON.stringify(face))}-at-${this.seq}`,
      agent_id: agentId,
      face,
    });
    return true;
  }

  /**
   * A person moves an agent into a room (ADR 0087, point 4): its runs where it was stop, it is
   * taken out saying where it went, and it is put here. The owner is the one person here.
   */
  moveAgent(
    agentId: string,
    spaceId: string,
  ): { ok: true; moved: boolean; from: string | null } | { ok: false; error: Refusal } {
    const refused = this.refuseMove(agentId, spaceId);
    if (refused !== undefined) return { ok: false, error: refused };
    const from = this.agentRoom(agentId) ?? null;
    if (from === spaceId) return { ok: true, moved: false, from };
    const at = this.seq;
    const owner = this.owner.participantId;
    if (from !== null) {
      this.stopWork(from, { reason: "moved", by: owner, agentId });
      this.appendAs(this.owner, {
        type: "membership.removed",
        space_id: from,
        idempotency_key: `move-out-${agentId}-${spaceId}-at-${at}`,
        participant_id: agentId,
        removed_by: owner,
        reason: "moved",
        moved_to: spaceId,
      });
    }
    this.appendAs(this.owner, {
      type: "membership.added",
      space_id: spaceId,
      idempotency_key: `move-in-${agentId}-${spaceId}-at-${at}`,
      participant_id: agentId,
      participant_kind: "agent",
      role: "member",
      ...(from === null ? {} : { moved_from: from }),
    });
    return { ok: true, moved: true, from };
  }

  /**
   * The person deletes a room (ADR 0067; ADR 0087, rule 5), as `DELETE /v1/spaces/:id` does on
   * the real server: every run going in it is stopped while its agents are still there, what was
   * said in it goes from the log, one `space.erased` stays, and each of its agents is told it is
   * free. Asked to delete the room's one agent too, Chips archives it, and its harness deletes
   * its side. The owner is the one person here, and owns the harness.
   */
  eraseSpace(
    spaceId: string,
    options: { readonly deleteAgent?: boolean } = {},
  ): { ok: true } | { ok: false; error: Refusal } {
    const space = this.spaces.get(spaceId);
    if (space === undefined) {
      return { ok: false, error: refusal("not_found", "unknown_space", "No such space.") };
    }
    const why = eraseRefusal(space);
    if (why !== undefined) return { ok: false, error: refusal("invalid_event", "invalid", why) };
    const agents = this.agentsIn(spaceId).map((agent) => agent.agent_id);
    const deleteAgent = options.deleteAgent === true;
    if (deleteAgent && agents.length !== 1) {
      return {
        ok: false,
        error: refusal(
          "invalid_event",
          "invalid",
          "An agent is deleted with its space only when it is the one there.",
        ),
      };
    }
    const owner = this.owner.participantId;
    this.stopWork(spaceId, { reason: "deleted", by: owner });
    this.forget(spaceId);
    this.appendAs(this.owner, {
      type: "space.erased",
      idempotency_key: `erase-${spaceId}`,
      erased: [spaceId],
    });
    for (const agentId of agents) {
      this.appendSystem({
        type: "agent.released",
        space_id: spaceId,
        idempotency_key: `erase-${spaceId}-release-${agentId}`,
        agent_id: agentId,
        by: owner,
        reason: "deleted",
        ...(deleteAgent ? { delete: true } : {}),
      });
      if (!deleteAgent) continue;
      this.appendSystem({
        type: "agent.updated",
        idempotency_key: `erase-${spaceId}-archive-${agentId}`,
        agent_id: agentId,
        state: "archived",
      });
    }
    return { ok: true };
  }

  /** A room gone from the log and from every row built from it, as the real erase leaves it. */
  private forget(spaceId: string): void {
    for (let at = this.log.length - 1; at >= 0; at -= 1) {
      if (this.log[at]?.space_id === spaceId) this.log.splice(at, 1);
    }
    this.spaces.delete(spaceId);
    this.replaced.delete(spaceId);
    for (const rows of [this.runs, this.approvals, this.questions]) {
      for (const [id, row] of rows) if (row.space_id === spaceId) rows.delete(id);
    }
    for (const [id, lane] of this.lanes) if (lane.home === spaceId) this.lanes.delete(id);
  }

  /** The newest ask for a copy of this agent in this room, and whether a copy joined for it. */
  forkAsk(
    agentId: string,
    spaceId: string,
  ): { readonly event: StoredEvent; readonly answered: boolean } | undefined {
    const event = this.log.findLast(
      (each) =>
        each.type === "agent.fork" &&
        each.space_id === spaceId &&
        each.payload["agent_id"] === agentId,
    );
    if (event === undefined) return undefined;
    const answered = this.log.some(
      (each) =>
        each.type === "membership.added" &&
        each.space_id === spaceId &&
        each.payload["fork_of"] === event.id,
    );
    return { event, answered };
  }

  /** Whether an ask still waits for its copy: none joined, and the minute is not up. */
  private stands(ask: ReturnType<Workspace["forkAsk"]>): boolean {
    if (ask === undefined || ask.answered) return false;
    return this.now().getTime() - Date.parse(ask.event.ts) < FORK_WAIT_MS;
  }

  /** Why the owner may not ask for a copy of this agent in this room, or nothing when they may. */
  private refuseFork(agentId: string, spaceId: string): Refusal | undefined {
    const agent = this.agents.get(agentId);
    const space = this.spaces.get(spaceId);
    if (agent === undefined)
      return refusal("not_found", "unknown_agent", "No agent of that id here.");
    if (space === undefined)
      return refusal("not_found", "unknown_space", "No space of that id here.");
    if (!this.capabilities.includes(HARNESS_CAPABILITIES.forks)) {
      return refusal("invalid_event", "invalid", "That harness doesn't make copies of its agents.");
    }
    const where = this.agentRoom(agentId);
    const stays = agent.lead || agent.state === "archived" || where === undefined;
    if (stays || where === spaceId || space.home || space.state !== "open") {
      return refusal("invalid_event", "invalid", "That agent cannot be forked into that space.");
    }
    return undefined;
  }

  /**
   * The owner asks for a copy of an agent in a room (ADR 0087, Fork): `agent.fork` there, which
   * the harness hears. Asked again while an ask stands, it is the same ask.
   */
  forkAgent(
    agentId: string,
    spaceId: string,
  ): { ok: true; asked: boolean; forkId: string } | { ok: false; error: Refusal } {
    const refused = this.refuseFork(agentId, spaceId);
    if (refused !== undefined) return { ok: false, error: refused };
    const ask = this.forkAsk(agentId, spaceId);
    if (ask !== undefined && this.stands(ask)) {
      return { ok: true, asked: false, forkId: ask.event.id };
    }
    const asked = this.appendAs(this.owner, {
      type: "agent.fork",
      space_id: spaceId,
      idempotency_key: `fork-${agentId}-${spaceId}-at-${this.seq}`,
      agent_id: agentId,
      by: this.owner.participantId,
    });
    return { ok: true, asked: true, forkId: asked.id };
  }

  /**
   * The harness's copy, registered for the room it was asked for: in the room while the ask
   * stands, free otherwise, with why, as the real server answers.
   */
  answerFork(agentId: string, forkedFrom: string, spaceId: string): ForkAnswer {
    const where = this.agentRoom(agentId);
    if (where === spaceId) return { attached: false };
    const ask = this.forkAsk(forkedFrom, spaceId);
    if (ask === undefined) {
      return { attached: false, why: "Nobody asked for a copy of that agent in that space." };
    }
    if (ask.answered) return { attached: false, why: "That space has its copy already." };
    if (!this.stands(ask)) {
      return {
        attached: false,
        why: "The space stopped waiting for the copy after a minute, so it is free: a person can put it in a space.",
      };
    }
    if (this.spaces.get(spaceId)?.state !== "open") {
      return {
        attached: false,
        why: "The space was archived while it waited, so the copy is free.",
      };
    }
    if (where !== undefined) {
      return {
        attached: false,
        why: "The copy is in another space, and an agent is in one at a time.",
      };
    }
    this.appendAs(this.harness, {
      type: "membership.added",
      space_id: spaceId,
      idempotency_key: `fork-in-${ask.event.id}`,
      participant_id: agentId,
      participant_kind: "agent",
      role: "member",
      fork_of: ask.event.id,
    });
    return { attached: true };
  }

  /** A person's ask for a new agent (ADR 0108), by its id, and whether an agent joined for it. */
  agentAsk(askId: string): { readonly event: StoredEvent; readonly answered: boolean } | undefined {
    const event = this.log.find((each) => each.id === askId && each.type === "agent.asked");
    if (event === undefined) return undefined;
    const answered = this.log.some(
      (each) => each.type === "membership.added" && each.payload["made_for"] === askId,
    );
    return { event, answered };
  }

  /**
   * The owner asks the harness for a new agent in a room (ADR 0108): `agent.asked` there, which
   * the harness hears, under the name given or the harness's own, numbered to a free one.
   */
  askAgent(
    spaceId: string,
    name?: string,
  ): { ok: true; askId: string; name: string } | { ok: false; error: Refusal } {
    const space = this.spaces.get(spaceId);
    if (space === undefined) {
      return {
        ok: false,
        error: refusal("not_found", "unknown_space", "No space of that id here."),
      };
    }
    if (!this.capabilities.includes(HARNESS_CAPABILITIES.newAgents)) {
      return {
        ok: false,
        error: refusal(
          "invalid_event",
          "invalid",
          "That harness doesn't make new agents for a space.",
        ),
      };
    }
    if (space.home || space.state !== "open") {
      return {
        ok: false,
        error: refusal(
          "invalid_event",
          "invalid",
          "A new agent cannot be asked for in that space.",
        ),
      };
    }
    const problem = name === undefined ? undefined : nameProblem(name.trim());
    if (problem !== undefined) {
      return { ok: false, error: refusal("invalid_event", "invalid", problem) };
    }
    const wanted = name?.trim() || this.harness.displayName;
    const named = freeAgentName(wanted.slice(0, 120).trim(), this.takenNames());
    const asked = this.appendAs(this.owner, {
      type: "agent.asked",
      space_id: spaceId,
      idempotency_key: `ask-${spaceId}-at-${this.seq}`,
      harness_id: this.harness.participantId,
      name: named,
      by: this.owner.participantId,
    });
    return { ok: true, askId: asked.id, name: named };
  }

  /**
   * The harness's new agent, registered for the ask it answers: in the ask's room while the ask
   * stands, free otherwise, with why, as the real server answers.
   */
  answerAsk(agentId: string, askId: string, spaceId: string): ForkAnswer {
    const where = this.agentRoom(agentId);
    if (where === spaceId) return { attached: false };
    const ask = this.agentAsk(askId);
    if (ask === undefined || ask.event.space_id !== spaceId) {
      return { attached: false, why: "Nobody asked this harness for an agent in that space." };
    }
    if (ask.answered) return { attached: false, why: "That ask has its agent already." };
    if (this.now().getTime() - Date.parse(ask.event.ts) >= NEW_AGENT_WAIT_MS) {
      return {
        attached: false,
        why: "The space stopped waiting for the agent after a minute, so it is free: a person can put it in a space.",
      };
    }
    if (this.spaces.get(spaceId)?.state !== "open") {
      return {
        attached: false,
        why: "The space was archived while it waited, so the agent is free.",
      };
    }
    if (where !== undefined) {
      return {
        attached: false,
        why: "The agent is in another space, and an agent is in one at a time.",
      };
    }
    this.appendAs(this.harness, {
      type: "membership.added",
      space_id: spaceId,
      idempotency_key: `made-in-${askId}`,
      participant_id: agentId,
      participant_kind: "agent",
      role: "member",
      made_for: askId,
    });
    return { attached: true };
  }

  /** Whether this run is a lane's: work the harness routed to one of its own rooms (M3.5). */
  isLaneRun(runId: string | null): boolean {
    return runId !== null && [...this.lanes.values()].some((lane) => lane.run_id === runId);
  }

  /** The run of this harness in this space that has not ended, if there is one. */
  liveRunIn(spaceId: string, harnessId: string): RunRow | undefined {
    return [...this.runs.values()].find(
      (run) => run.space_id === spaceId && run.harness_id === harnessId && !TERMINAL.has(run.state),
    );
  }

  roleOf(spaceId: string, participantId: string): Role | undefined {
    return this.spaces.get(spaceId)?.members.get(participantId);
  }

  /** The rooms a participant is in: a harness's, its agents' too (ADR 0087). */
  memberSpacesOf(participantId: string): string[] {
    const selves =
      participantId === this.harness.participantId
        ? [participantId, ...this.agents.keys()]
        : [participantId];
    return [...this.spaces.values()]
      .filter((space) => selves.some((self) => space.members.has(self)))
      .map((space) => space.space_id);
  }

  /** The harness's agents in a room, in the order they came. */
  agentsIn(spaceId: string): AgentRow[] {
    const members = this.spaces.get(spaceId)?.members;
    if (members === undefined) return [];
    return [...members.keys()]
      .map((id) => this.agents.get(id))
      .filter((agent): agent is AgentRow => agent !== undefined);
  }

  /**
   * A room's members as the room note lists them (ADR 0092): in the order they joined, the harness
   * in its own right as an agent, and each agent with its harness's name (ADR 0101), as the
   * server lists them.
   */
  noteMembers(spaceId: string): NoteMember[] {
    const members = this.spaces.get(spaceId)?.members;
    if (members === undefined) return [];
    const lead = this.leadOf(spaceId);
    return [...members.keys()].flatMap((id): NoteMember[] => {
      if (id === this.owner.participantId) {
        return [{ id, kind: "person", name: this.owner.displayName }];
      }
      const leads = id === lead ? { lead: true } : {};
      if (id === this.harness.participantId) {
        // Waiting under the first name the room holds for its agent (ADR 0150).
        const held = this.holds.get(spaceId)?.name;
        return held === undefined
          ? [{ id, kind: "agent", name: this.harness.displayName, ...leads }]
          : [{ id, kind: "agent", name: held, harness: this.harness.displayName, ...leads }];
      }
      const agent = this.agents.get(id);
      return agent === undefined
        ? []
        : [{ id, kind: "agent", name: agent.name, harness: this.harness.displayName, ...leads }];
    });
  }

  /** The people, the harness and its agents sharing a space with this participant, themselves included. */
  participantsVisibleTo(participantId: string): Named[] {
    const mine = new Set(this.memberSpacesOf(participantId));
    const shares = (id: string) =>
      this.spaces.size > 0 &&
      [...this.spaces.values()].some((space) => mine.has(space.space_id) && space.members.has(id));
    const people: Named[] = [this.owner, this.harness]
      .filter((each) => shares(each.participantId))
      .map((each) => ({
        participantId: each.participantId,
        kind: each.kind,
        displayName: each.displayName,
      }));
    const agents: Named[] = [...this.agents.values()]
      .filter((agent) => shares(agent.agent_id))
      .map((agent) => ({
        participantId: agent.agent_id,
        kind: "agent",
        displayName: agent.name,
        face: agent.face ?? null,
      }));
    return [...people, ...agents];
  }

  /**
   * Who may see an event: the real server's rule, which is the protocol's own function, so the
   * two cannot differ on it (phase-0-review finding 6; agents review, finding 37).
   */
  canSee(event: StoredEvent, viewer: Viewer): boolean {
    return canSee(event, viewer);
  }

  /**
   * What a participant is handed with the message at `seq` (ADR 0088), as the real server works it
   * out: the room's lines since it last spoke there, else since it joined, as the room reads now,
   * the newest that fit its budget. Nothing for a budget of no lines.
   */
  contextFor(
    participantIds: readonly string[],
    spaceId: string,
    seq: number,
    budget: { readonly lines: number; readonly chars: number },
    sign?: Signs,
  ): RoomContext | undefined {
    if (budget.lines === 0) return undefined;
    // An agent is asked about with the harness whose place it took there (ADR 0087).
    const replaced = [...(this.replaced.get(spaceId) ?? new Map<string, string>())];
    const before = this.log.filter((event) => event.seq < seq && event.space_id === spaceId);
    // One context for all of them, from the one that has heard least (agents review, finding 15).
    const selves = new Set<string>();
    const marks = [...new Set(participantIds)].map((id) => {
      const ids = new Set([id, ...replaced.filter(([, to]) => to === id).map(([from]) => from)]);
      for (const each of ids) selves.add(each);
      // A turn passed with NO_REPLY was a turn too (ADR 0105's addendum).
      const spoke = before.findLast(
        (event) =>
          (event.type === "message.post" || event.type === "turn.passed") &&
          ids.has(event.actor.id),
      );
      const joined = before.findLast(
        (event) =>
          (event.type === "membership.added" && ids.has(String(event.payload["participant_id"]))) ||
          (event.type === "space.created" && ids.has(event.actor.id)),
      );
      return (spoke === undefined ? undefined : this.turnBegan(spoke)) ?? joined?.seq ?? 0;
    });
    const since = marks.length === 0 ? 0 : Math.min(...marks);
    // From where the turn that said its last words began (ADR 0105), without one taker's own
    // words; several are each owed what the others said.
    const lines = this.roomLines(spaceId, since, seq).filter(
      (line) => marks.length > 1 || line.kind !== "said" || !selves.has(line.from.id),
    );
    return this.withFiles(contextLines(lines, budget, { since, before: seq }), spaceId, seq, sign);
  }

  /** Where the turn that said these words began: its run's first event, else the words. */
  private turnBegan(said: StoredEvent): number {
    if (said.run_id === null) return said.seq;
    const began = this.log.find((event) => event.run_id === said.run_id);
    return Math.min(said.seq, began?.seq ?? said.seq);
  }

  /**
   * The message a reply answers, as the real server hands it over (ADR 0219): its line as the room
   * reads now, of one taken back only who and when, its files signed, and beside a turn's context
   * (`handed`), when it is older than those lines, the lines said just before it. Nothing for a
   * message not said in this room.
   */
  replyingToFor(
    spaceId: string,
    replyTo: string,
    handed: RoomContext | undefined,
    sign?: Signs,
  ): (ReplyingTo & { readonly attachments?: readonly Record<string, unknown>[] }) | undefined {
    const said = this.saidMessage(replyTo);
    if (said === undefined || said.space_id !== spaceId) return undefined;
    const changes = this.log.filter((event) => event.payload["message_id"] === replyTo);
    const deleted = changes.some((event) => event.type === "message.deleted");
    const edited = changes.some((event) => event.type === "message.edited");
    // A message taken back is no line of the room's any more: its line as said, words dropped.
    const line = deleted
      ? this.linesAsNow(spaceId, [said])[0]
      : this.roomLines(spaceId, said.seq - 1, said.seq + 1).find(
          (each) => each.message_id === replyTo,
        );
    if (line === undefined) return undefined;
    const before = quotesBefore(said.seq, handed)
      ? contextLines(
          this.roomLines(spaceId, 0, said.seq),
          { lines: REPLY_BEFORE_LINES, chars: REPLY_QUOTE_CHARS },
          { since: 0, before: said.seq },
        ).lines
      : undefined;
    const quote = quoteOf({ ...line, message_id: replyTo }, { edited, deleted }, before);
    const files = deleted ? [] : signedFilesOf(said.payload, sign);
    return files.length === 0 ? quote : { ...quote, attachments: files };
  }

  /**
   * What an agent is handed as it joins a room (ADR 0088, point 5): the room's last lines before it
   * joined, within the budget. Nothing for a budget of no lines.
   */
  catchUpFor(
    spaceId: string,
    seq: number,
    budget: { readonly lines: number; readonly chars: number },
    sign?: Signs,
  ): RoomContext | undefined {
    if (budget.lines === 0) return undefined;
    const lines = contextLines(this.roomLines(spaceId, 0, seq), budget, { since: 0, before: seq });
    return this.withFiles(lines, spaceId, seq, sign);
  }

  /** A page of a room's lines before a cursor, and its files now, for `GET /v1/spaces/:id/context`. */
  contextPage(spaceId: string, before: number, limit: number, sign?: Signs): RoomContext {
    const lines = Math.min(Math.max(limit, 1), CONTEXT_CEILING.lines);
    const page = contextLines(
      this.roomLines(spaceId, 0, before),
      { lines, chars: CONTEXT_CEILING.chars },
      { since: 0, before },
    );
    return this.withFiles(page, spaceId, undefined, sign);
  }

  /**
   * A room's files at their current version, newest first (ADR 0099): as of the event at `upto`,
   * with it, or as of now. Who posted each as the room reads now.
   */
  roomFiles(spaceId: string, most: number, upto?: number, sign?: Signs): RoomFile[] {
    return roomFilesInLog(this.log, { spaceId, most, upto, sign, by: this.postedBy(spaceId) });
  }

  /** One name's versions in a room, newest first, each with what it was made from (ADR 0100). */
  fileVersions(spaceId: string, name: string, most: number, sign?: Signs): RoomFile[] {
    return fileVersionsInLog(this.log, { spaceId, name, most, sign, by: this.postedBy(spaceId) });
  }

  /** Who posted a room's file, as the room reads now. */
  private postedBy(spaceId: string): (posted: string) => RoomFile["by"] {
    const people = this.whoIs();
    const now = (id: string): string => this.replaced.get(spaceId)?.get(id) ?? id;
    return (posted) => {
      const id = now(posted);
      const known = people.get(id);
      const kind = known?.kind;
      return {
        id,
        kind: kind === "person" || kind === "agent" || kind === "system" ? kind : "harness",
        name: known?.name ?? id,
      };
    };
  }

  private withFiles(
    context: RoomContext,
    spaceId: string,
    upto: number | undefined,
    sign: Signs | undefined,
  ): RoomContext {
    const files = this.roomFiles(spaceId, ROOM_FILES_IN_CONTEXT, upto, sign);
    return files.length === 0 ? context : { ...context, files };
  }

  /** Who everybody the fake knows is now: the owner, the harness and its agents. */
  private whoIs(): Map<string, { kind: string; name: string; workspace_role?: "owner" }> {
    const people = new Map<string, { kind: string; name: string; workspace_role?: "owner" }>([
      // The owner's standing rides with the name (SEC-15), as the real server's lines carry it.
      [
        this.owner.participantId,
        { kind: this.owner.kind as string, name: this.owner.displayName, workspace_role: "owner" },
      ],
      [
        this.harness.participantId,
        { kind: this.harness.kind as string, name: this.harness.displayName },
      ],
    ]);
    for (const agent of this.agents.values()) {
      people.set(agent.agent_id, { kind: "agent", name: agent.name });
    }
    return people;
  }

  /** A room's lines between two `seq`s, with every edit and deletion there is folded in. */
  private roomLines(spaceId: string, after: number, before: number) {
    const members = this.spaces.get(spaceId)?.members;
    const inWindow = (seq: number) => seq > after && seq < before;
    const events = this.log.filter(
      (event) =>
        event.type === "message.edited" ||
        event.type === "message.deleted" ||
        (event.space_id === spaceId && inWindow(event.seq)) ||
        (event.type === "person.renamed" &&
          inWindow(event.seq) &&
          members?.has(String(event.payload["participant_id"])) === true),
    );
    return this.linesAsNow(spaceId, events);
  }

  /** Events as lines, as a room reads them now: whose place each took, and who each is. */
  private linesAsNow(spaceId: string, events: readonly StoredEvent[]): ContextLine[] {
    const people = this.whoIs();
    // What the harness said here before its agent took its place is the agent's.
    const replaced = this.replaced.get(spaceId);
    const now = (id: string): string => replaced?.get(id) ?? id;
    const read = replaced === undefined ? events : events.map((event) => asNow(event, now));
    // Each author with their standing in this room beside their name (SEC-15), as the server's.
    return linesOf(read, (id) => {
      const known = people.get(id);
      const role = this.roleOf(spaceId, id);
      return known === undefined
        ? undefined
        : { ...known, ...(role === undefined ? {} : { role }) };
    });
  }

  /** A page of the log after `cursor`, as this viewer may see it. */
  since(
    cursor: number,
    limit: number,
    viewer: Viewer,
  ): { events: StoredEvent[]; nextCursor: number | null } {
    const visible = this.log.filter((event) => event.seq > cursor && this.canSee(event, viewer));
    const page = visible.slice(0, limit);
    const last = page.at(-1);
    return {
      events: page,
      nextCursor: visible.length > page.length && last !== undefined ? last.seq : null,
    };
  }

  /**
   * The space a harness works in, by its own key: found when it exists, opened for its owner
   * when it does not (ADR 0024). The key is stored prefixed with the harness's id, as the real
   * server stores it, so no adapter can name another's space; a shared key — a worktree — is
   * stored under its own namespace, which a second harness would find (ADR 0033). With one
   * harness here there is nobody to join it, and `joined` is always false.
   */
  openSpace(
    key: string,
    title: string | undefined,
    shared = false,
  ): { spaceId: string; created: boolean; joined: boolean } {
    const external = shared ? `shared:${key}` : `${this.harness.participantId}:${key}`;
    const existing = [...this.spaces.values()].find((space) => space.external_key === external);
    if (existing !== undefined)
      return { spaceId: existing.space_id, created: false, joined: false };
    const spaceId = this.ids.next("space");
    this.appendAs(this.harness, {
      type: "space.created",
      space_id: spaceId,
      idempotency_key: `${spaceId}-created`,
      kind: "direct",
      ...(title === undefined ? {} : { title }),
      external_key: external,
      opened_for: this.owner.participantId,
    });
    this.addMembers(spaceId, this.harness);
    this.agentInPlace(spaceId, key, title);
    return { spaceId, created: true, joined: false };
  }

  /**
   * The room a person asked the harness for, given the harness's key as `space.claimed`, as the
   * real space door claims it when it is sent a `space_id`: only a room asked of this harness,
   * that it is still in and that has no key, under a key no other room holds. A retry with the
   * key that claimed it finds it. The title goes with the claim unless a person named the room.
   * A refusal is kept with the others, for the report.
   */
  claimSpace(
    spaceId: string,
    key: string,
    title: string | undefined,
  ): { ok: true; value: Claimed } | { ok: false; error: Refusal } {
    const external = `${this.harness.participantId}:${key}`;
    const asked = this.spaces.get(spaceId);
    if (asked?.also_asked_of.includes(this.harness.participantId) === true) {
      return this.answer(asked, key);
    }
    const refused = this.refuseClaim(spaceId, external) ?? this.refuseElsewhere(key, spaceId);
    if (refused !== undefined) {
      this.refusals.push({ ...refused, at: this.nowIso(), who: "harness", type: "space.claimed" });
      return { ok: false, error: refused };
    }
    const row = this.spaces.get(spaceId);
    if (row?.external_key === external) {
      return { ok: true, value: { spaceId, claimed: false, retitled: false } };
    }
    const named =
      title === undefined || row?.title_by === "person" || row?.title === title ? undefined : title;
    this.appendAs(this.harness, {
      type: "space.claimed",
      space_id: spaceId,
      idempotency_key: `space-${spaceId}-claimed`,
      external_key: external,
      ...(named === undefined ? {} : { title: named }),
    });
    this.agentInPlace(spaceId, key, named ?? row?.title);
    this.leadFromClaim(spaceId);
    return { ok: true, value: { spaceId, claimed: true, retitled: named !== undefined } };
  }

  /**
   * A room claimed from the + is led by the agent that took the harness's place in it (ADR 0104),
   * unless a person chose a lead first: as the real door has it.
   */
  private leadFromClaim(spaceId: string): void {
    if (this.log.some((event) => event.type === "space.lead_set" && event.space_id === spaceId)) {
      return;
    }
    const placed = this.log.findLast(
      (event) => event.type === "membership.replaced" && event.space_id === spaceId,
    )?.payload["to"];
    if (typeof placed !== "string" || this.spaces.get(spaceId)?.members.has(placed) !== true) {
      return;
    }
    this.appendOnce({
      type: "space.lead_set",
      space_id: spaceId,
      idempotency_key: `lead-claimed-${spaceId}`,
      agent_id: placed,
    });
  }

  private refuseClaim(spaceId: string, external: string): Refusal | undefined {
    const row = this.spaces.get(spaceId);
    if (row === undefined)
      return refusal("not_found", "unknown_space", "No space by that id here.");
    if (row.asked_of !== this.harness.participantId) {
      return refusal(
        "forbidden",
        "not_asked",
        "Nobody asked this harness for that space, so it is not its to claim.",
      );
    }
    if (row.external_key === external) return undefined;
    if (row.external_key !== undefined) {
      return refusal(
        "invalid_event",
        "taken",
        "That space was claimed already, under another key.",
      );
    }
    if (!row.members.has(this.harness.participantId)) {
      return refusal(
        "forbidden",
        "not_asked",
        "This harness was taken out of that space, so it cannot claim it.",
      );
    }
    const holder = [...this.spaces.values()].find((each) => each.external_key === external);
    return holder === undefined
      ? undefined
      : refusal(
          "invalid_event",
          "taken",
          `That key has a space already: ${holder.space_id}. Ask for it by the key alone.`,
        );
  }

  /** Every room the harness opened or claimed by key, and whether each is on the list. */
  spacesOpened(): OpenedSpace[] {
    const harness = this.harness.participantId;
    return [...this.spaces.values()]
      .filter((row) => row.opened_by === harness && row.external_key !== undefined)
      .map((row) => ({
        space_id: row.space_id,
        ...unscoped(harness, row.external_key ?? ""),
        title: row.title ?? null,
        state: row.state,
        ...(row.state_by === undefined ? {} : { moved_by: row.state_by }),
      }));
  }

  /**
   * The rooms people asked the harness for that it has not claimed, and is still in as itself:
   * asked first, or beside another (ADR 0087's addendum of 30 September).
   */
  spacesAsked(): AskedSpace[] {
    const harness = this.harness.participantId;
    return [...this.spaces.values()]
      .filter(
        (row) =>
          row.members.has(harness) &&
          ((row.asked_of === harness && row.external_key === undefined) ||
            row.also_asked_of.includes(harness)),
      )
      .map((row) => ({
        space_id: row.space_id,
        asked_by: row.opened_by,
        title: row.title ?? null,
        state: row.state,
        asked_at: row.created_at,
      }));
  }

  /** The direct space `POST /v1/harnesses` opens: the owner and the harness, and nobody else. */
  createDirectSpace(): string {
    const spaceId = this.ids.next("space");
    this.appendAs(this.owner, {
      type: "space.created",
      space_id: spaceId,
      idempotency_key: `${spaceId}-created`,
      kind: "direct",
    });
    // The owner, and the harness's default agent, which it speaks as there (ADR 0087).
    const agent = this.agentForRoom(undefined, undefined);
    this.addMembers(spaceId, this.owner, { participantId: agent.agent_id, kind: "agent" });
    return spaceId;
  }

  private addMembers(
    spaceId: string,
    by: Principal,
    beside: { readonly participantId: string; readonly kind: string } = this.harness,
  ): void {
    const members = [
      [this.owner, "owner"],
      [beside, "member"],
    ] as const;
    for (const [who, role] of members) {
      this.appendAs(by, {
        type: "membership.added",
        space_id: spaceId,
        idempotency_key: `${spaceId}-member-${who.participantId}`,
        participant_id: who.participantId,
        participant_kind: who.kind,
        role,
      });
    }
  }

  /** A workspace event Chips itself appends: filled in and validated, past the door's rules. */
  private appendAs(principal: Principal, event: Record<string, unknown>): StoredEvent {
    const draft = this.draftOf(principal, event, {});
    const parsed = parseEvent(draft);
    if (!parsed.ok)
      throw new Error(
        `the fake wrote an invalid ${String(event["type"])}: ${parsed.error.message}`,
      );
    return this.append(parsed.value);
  }

  // ---- uploads ----

  newUpload(principal: Principal, filename: string): UploadRow {
    const row: UploadRow = {
      attachment_id: this.ids.next("attachment"),
      filename,
      uploaded_by: principal.participantId,
      stored: undefined,
    };
    this.uploads.set(row.attachment_id, row);
    return row;
  }

  storeUpload(
    principal: Principal,
    id: string,
    bytes: Uint8Array,
  ): { ok: true; row: UploadRow } | { ok: false; error: Refusal } {
    const row = this.uploads.get(id);
    if (row === undefined) {
      return {
        ok: false,
        error: refusal("not_found", "unknown_slot", "No upload slot with that id."),
      };
    }
    if (row.uploaded_by !== principal.participantId) {
      return {
        ok: false,
        error: refusal("forbidden", "not_yours", "That upload slot is not yours."),
      };
    }
    const extension = row.filename.split(".").pop()?.toLowerCase() ?? "";
    row.stored = {
      bytes,
      mime_type: MIME_BY_EXTENSION[extension] ?? "application/octet-stream",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      byte_size: bytes.byteLength,
    };
    return { ok: true, row };
  }
}

/** Who did it, in the words `title_by` and `state_by` use. */
/**
 * Whose side changed a room: a harness's, when it or one of its agents did. An agent's change
 * read as a person's, so a harness's own archive was listed as a person's (`moved_by`), and an
 * adapter that follows its rooms would have taken its own archive for the person's word (agents
 * review, finding 37).
 */
function byWhom(event: StoredEvent): "person" | "harness" {
  return event.actor.kind === "harness" || event.actor.kind === "agent" ? "harness" : "person";
}

/** A space as it is opened. Whoever opened it is its first member (ADR 0018); a harness's opening refines that. */
function createdSpace(spaceId: string, event: StoredEvent): SpaceRow {
  const p = event.payload;
  const title = typeof p["title"] === "string" ? p["title"] : undefined;
  return {
    space_id: spaceId,
    kind: typeof p["kind"] === "string" ? p["kind"] : "group",
    title,
    title_by: title === undefined ? undefined : byWhom(event),
    external_key: typeof p["external_key"] === "string" ? p["external_key"] : undefined,
    opened_by: event.actor.id,
    asked_of: typeof p["asked_of"] === "string" ? p["asked_of"] : undefined,
    also_asked_of: Array.isArray(p["also_asked_of"]) ? (p["also_asked_of"] as string[]) : [],
    home: false,
    state: "open",
    state_by: undefined,
    created_at: event.ts,
    members: new Map([[event.actor.id, "owner"]]),
  };
}

/** A space after a retitle, an archive or a claim. */
function changedSpace(row: SpaceRow, event: StoredEvent): SpaceRow {
  const p = event.payload;
  const title = typeof p["title"] === "string" ? p["title"] : undefined;
  const state = p["state"] === "closed" || p["state"] === "open" ? p["state"] : undefined;
  return {
    ...row,
    ...(title === undefined ? {} : { title, title_by: byWhom(event) }),
    ...(state === undefined ? {} : { state, state_by: byWhom(event) }),
    ...(typeof p["home"] === "boolean" ? { home: p["home"] } : {}),
    // The harness that claims a room is its opener from then on, as if it had opened it.
    ...(event.type === "space.claimed"
      ? { external_key: String(p["external_key"]), opened_by: event.actor.id }
      : {}),
  };
}

/**
 * A harness changes a space it opened. It may also name as its home the direct room it was handed
 * when it was added, which a person opened, and never a group room (ADR 0069): the real door's
 * rule. The fake refused a harness naming its home at all, so a Main room could not be made here
 * as the server makes one (agents review, finding 37).
 */
function refuseHarnessOnSpaceUpdate(
  event: Readonly<Record<string, unknown>>,
  sender: Principal,
  role: Role | undefined,
  space: SpaceRow,
): Refusal | undefined {
  if (space.opened_by === sender.participantId) return undefined;
  const homeOnly = event["title"] === undefined && event["state"] === undefined;
  if (homeOnly && space.kind === "direct" && role !== undefined) return undefined;
  return refusal(
    "forbidden",
    "not_the_opener",
    "a harness retitles or closes only a space it opened",
  );
}

/**
 * Why a room is not erased, whoever asks (ADR 0067, ADR 0069): a harness's home is always
 * there, and a direct room nobody can open again is archived instead.
 */
function eraseRefusal(space: SpaceRow): string | undefined {
  if (space.home) return "This is a harness's home: it is always there, and is not erased.";
  if (space.kind === "direct" && space.external_key === undefined && space.asked_of === undefined) {
    return "This direct space is archived, not erased: it is the only way they reach you here.";
  }
  return undefined;
}

/** A stored key as the harness gave it, and whether it names a shared place. */
/** Whether an approval's request is about an action that matters (ADR 0195): flags and risk. */
function asksWhatMatters(payload: Readonly<Record<string, unknown>>): boolean {
  const action = payload["action"];
  const risk = payload["risk"];
  return actionMatters({
    ...(typeof action === "object" && action !== null ? action : {}),
    risk: Array.isArray(risk) ? (risk as string[]) : undefined,
  });
}

function unscoped(harnessId: string, external: string): { key: string; shared: boolean } {
  if (external.startsWith("shared:"))
    return { key: external.slice("shared:".length), shared: true };
  return { key: external.slice(harnessId.length + 1), shared: false };
}

/** What a duplicate is looked up by: one sender's key, never the key alone. */
function keyOf(actorId: string, key: string): string {
  return `${actorId}\n${key}`;
}

/** A message's files, each with a URL for this harness where something signs, as the server's. */
function signedFilesOf(
  payload: Readonly<Record<string, unknown>>,
  sign: Signs | undefined,
): Record<string, unknown>[] {
  const files = payload["attachments"];
  if (!Array.isArray(files)) return [];
  return (files as Record<string, unknown>[])
    .filter((file) => typeof file["attachment_id"] === "string")
    .map((file) =>
      sign === undefined ? file : { ...file, ...sign(String(file["attachment_id"])) },
    );
}

/** A line as it reads now: the harness's words in a room are its agent's there (ADR 0087). */
function asNow(event: StoredEvent, now: (id: string) => string): StoredEvent {
  const addressed = event.payload["addressed_to"];
  const subject = event.payload["participant_id"];
  const actor = now(event.actor.id);
  return {
    ...event,
    actor: actor === event.actor.id ? event.actor : { kind: "agent", id: actor },
    payload: {
      ...event.payload,
      ...(Array.isArray(addressed) ? { addressed_to: (addressed as string[]).map(now) } : {}),
      ...(typeof subject === "string" ? { participant_id: now(subject) } : {}),
    },
  };
}
