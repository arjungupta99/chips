/**
 * A fake Chips: the wire an adapter speaks, on a real port, with the log and the rules of
 * `workspace.ts` behind it. HTTP for what a harness says — `POST /v1/harnesses/:id/events`,
 * `POST /v1/runs/:id/events`, the space door, uploads, the approval long poll — and `/v1/ws`
 * for what it hears, with the handshake, the subscription, the replay and the acks the real
 * server gives. The person's side has no port: the kit plays it by calling `say`, `decide`,
 * `answer` and `askForSpace` directly, and reads the log the same way.
 *
 * The shapes here are the real routes' shapes, field for field, because an adapter passing
 * against a stand-in that is looser than the server would learn nothing. Where the real server
 * would do something this one cannot — sniff an upload's bytes, sign an attachment URL — the
 * answer is honest about it: the mime type comes from the filename, the signature is a word.
 */

import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  AGENT_EVENTS,
  budgetOf,
  byteRange,
  CONTEXT_BUDGET,
  clientFrame,
  contentRange,
  createIdGenerator,
  eventIdOfMessage,
  exchangeFactsOf,
  type IdGenerator,
  inLegacyView,
  type JobRun,
  jobRunsPost,
  messageIdOf,
  negotiateProtocol,
  ONE_ROOM_REFUSALS,
  opensFor,
  PROTOCOL_VERSION,
  projectRequest,
  ROOM_FILES_CEILING,
  type RoomContext,
  renderExchangeNote,
  roomNoteFor,
  severalAsked,
  type TakerNews,
  takersOf,
  toEveryAgent,
  withoutHidden,
  yoursWithoutAt,
} from "@chipschat/protocol";
import { type WebSocket, WebSocketServer } from "ws";
import { FakeJoins, type FakeJoinView } from "./fake-join.js";
import { FakeProjects } from "./project.js";
import { ACCEPTS, FakeSettings, type SettingKind } from "./settings.js";
import type { ChipsAddress } from "./subject.js";
import {
  AgentDeleted,
  type AgentRow,
  type ApprovalRow,
  type ForkAnswer,
  type Principal,
  type RefusalCode,
  type StoredEvent,
  type Viewer,
  Workspace,
} from "./workspace.js";

export interface FakeChipsOptions {
  /** Where to listen. `0`, the default, takes any free port. */
  readonly port?: number | undefined;
  readonly host?: string | undefined;
  readonly harnessName?: string | undefined;
  readonly ownerName?: string | undefined;
  readonly now?: (() => Date) | undefined;
  readonly ids?: IdGenerator | undefined;
  readonly version?: string | undefined;
  /**
   * What the harness declares, as its registration would (ADR 0046). `new_spaces` lets the person
   * ask it for a room; nothing is declared otherwise.
   */
  readonly capabilities?: readonly string[] | undefined;
}

export interface DecideOptions {
  readonly reason?: string | undefined;
  readonly scope?: "once" | "session" | "always" | undefined;
  readonly updatedInput?: unknown;
}

/** The harness saying how it is (ADR 0083): fine, or in trouble and why. */
export interface HarnessStatus {
  readonly state: "ok" | "trouble";
  readonly reason?: string | undefined;
  readonly at: string;
}

export interface FakeChips {
  readonly address: ChipsAddress;
  readonly workspace: Workspace;
  /**
   * The owner says something. In the direct space unless another is named, and as a reply to the
   * message `replyTo` names when one is given (ADR 0219).
   */
  readonly say: (
    text: string,
    spaceId?: string,
    options?: { readonly replyTo?: string },
  ) => Promise<StoredEvent>;
  /** The owner answers a card. */
  readonly decide: (
    approvalId: string,
    decision: "approved" | "edited" | "denied",
    options?: DecideOptions,
  ) => Promise<StoredEvent>;
  /** The owner answers a question: the choices given, or each question's default or first option. */
  readonly answer: (
    askId: string,
    choices?: Readonly<Record<string, readonly string[]>>,
  ) => Promise<StoredEvent>;
  /**
   * The owner asks the harness for a new room, as the phone does on the first send: the room,
   * asked of the harness, the harness added to it, and the words. For a harness that declares
   * `new_spaces`; the door refuses it for any other, and so does this.
   */
  readonly askForSpace: (text: string) => Promise<{ spaceId: string; message: StoredEvent }>;
  /** A group room of the owner's, with nobody else in it yet. */
  readonly openRoom: (title: string) => Promise<string>;
  /**
   * The owner asks for a copy of one of the harness's agents in a room (ADR 0087, Fork), as
   * `POST /v1/agents/:id/fork` does. For a harness that declares `forks`; refused for any other.
   */
  readonly askForFork: (
    agentId: string,
    spaceId: string,
  ) => Promise<{ forkId: string; asked: boolean }>;
  /**
   * The owner asks the harness for a new agent in a room (ADR 0108), as
   * `POST /v1/spaces/:id/agents` does. For a harness that declares `new_agents`; refused for any
   * other.
   */
  readonly askForAgent: (
    spaceId: string,
    name?: string,
  ) => Promise<{ askId: string; name: string }>;
  /** Any event, as the owner. A refusal throws, because the person's side is the kit's own. */
  readonly asOwner: (event: Record<string, unknown>) => Promise<StoredEvent>;
  /**
   * Join requests (ADR 0122), the owner's side: a link made, allowed already with what it may do;
   * the oldest request waiting allowed, with what is granted of what it asked, or refused; and
   * every request so far. Whatever joins is handed this fake's harness.
   */
  readonly makeJoinLink: (capabilities?: readonly string[]) => string;
  readonly allowJoin: (capabilities?: readonly string[]) => FakeJoinView;
  readonly denyJoin: () => FakeJoinView;
  readonly joinRequests: () => FakeJoinView[];
  /** The first event that matches, in the log already or arriving within the time. */
  readonly waitFor: <T>(
    match: (event: StoredEvent) => T | undefined,
    timeoutMs: number,
  ) => Promise<T>;
  /** How many sockets are subscribed right now. */
  readonly connections: () => number;
  /** How many `hello`s the harness's sockets have said, so a reconnect is seen. */
  readonly hellos: () => number;
  /** The harness's settings copies and the answers they carried (ADRs 0134, 0140, 0143, 0146). */
  readonly settings: FakeSettings;
  /** The runs of its own jobs the harness posted, a run posted again in place (ADR 0252). */
  readonly jobRuns: () => readonly JobRun[];
  /**
   * The owner changes a setting of an agent's (or, for `harness-context`, of the harness's) to what
   * its copy says now, as the agent's page would: the frame, sent to every socket that said the
   * kind's word in its `hello`, and how many heard it. Nothing when there is no copy, or nothing in
   * it to change.
   */
  readonly askToChange: (
    kind: SettingKind,
    id: string,
  ) => { readonly frame: Record<string, unknown>; readonly heard: number } | undefined;
  /** The owner asks the harness to restart (ADR 0094): how many sockets that said `restart` heard. */
  readonly askToRestart: () => number;
  /** What the harness has said of how it is (`PUT /v1/harnesses/:id/status`), oldest first. */
  readonly statuses: () => readonly HarnessStatus[];
  /**
   * Has the harness shown up at all: a socket subscribed, or any call made with its token. A
   * read counts, because a harness in hooks mode polls before it has anything to say.
   */
  readonly heard: () => boolean;
  readonly close: () => Promise<void>;
}

const STATUS: Readonly<
  Record<RefusalCode | "unauthorized" | "invalid_frame" | "internal", number>
> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_event: 422,
  stale_file: 409,
  invalid_frame: 400,
  internal: 500,
};

/** The states a run has ended in. */
const ENDED: ReadonlySet<string> = new Set(["done", "failed", "cancelled"]);

/** The ceiling on one approval poll, as the real route has it. */
const MAX_POLL_SECONDS = 900;
/** How long a signed attachment URL is good for (decision 10). */
const SIGNED_URL_MS = 10 * 60 * 1000;
const REPLAY_PAGE = 500;
const CLOSE_POLICY = 1008;
const CLOSE_GOING_AWAY = 1001;

class HttpFailure extends Error {
  override readonly name = "HttpFailure";
  constructor(
    readonly code: keyof typeof STATUS,
    message: string,
    readonly issues?: readonly { path: string; message: string }[],
  ) {
    super(message);
  }
}

interface Answer {
  readonly status: number;
  readonly body?: unknown;
  readonly bytes?: Uint8Array | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
}

interface Call {
  readonly principal: Principal;
  readonly params: readonly string[];
  readonly url: URL;
  readonly body: Buffer;
  readonly headers: IncomingMessage["headers"];
}

type Route = readonly [method: string, pattern: RegExp, handle: (call: Call) => Promise<Answer>];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** An agent to register, as the real door reads it: its key, name, whether it leads, its state. */
function agentBody(
  body: Record<string, unknown>,
  harnessId: string,
): {
  key: string;
  name: string;
  lead: boolean;
  state: "active" | "archived" | undefined;
  forkedFrom: string | undefined;
  madeFor: string | undefined;
  spaceId: string | undefined;
} {
  const key = typeof body["key"] === "string" ? body["key"].trim() : "";
  const name = typeof body["name"] === "string" ? withoutHidden(body["name"]).trim() : "";
  // The harness's own id names its default agent (ADR 0183); no other harness's id is a key.
  if (key === "" || key.length > 400 || (key.startsWith("hrn_") && key !== harnessId)) {
    throw new HttpFailure("invalid_event", "Send the `key` you know the agent by.");
  }
  if (name === "" || name.length > 120) {
    throw new HttpFailure("invalid_event", "Send a `name`, up to 120 characters.");
  }
  const state = body["state"];
  if (state !== undefined && state !== "active" && state !== "archived") {
    throw new HttpFailure("invalid_event", "Send `state` as `active` or `archived`.");
  }
  return { key, name, lead: body["lead"] === true, state, ...askedFor(body) };
}

/**
 * What an agent asked for in a room says of itself, as the real door reads it: a fork's copy, the
 * agent it copies; a new agent (ADR 0108), the ask it answers; and either, the room.
 */
function askedFor(body: Record<string, unknown>): {
  forkedFrom: string | undefined;
  madeFor: string | undefined;
  spaceId: string | undefined;
} {
  const forkedFrom = typeof body["forked_from"] === "string" ? body["forked_from"] : undefined;
  const madeFor = typeof body["made_for"] === "string" ? body["made_for"] : undefined;
  const spaceId = typeof body["space_id"] === "string" ? body["space_id"] : undefined;
  if (forkedFrom !== undefined && madeFor !== undefined) {
    throw new HttpFailure(
      "invalid_event",
      "An agent is a fork's copy (`forked_from`) or a new one asked for (`made_for`), not both.",
    );
  }
  if (spaceId !== undefined && forkedFrom === undefined && madeFor === undefined) {
    throw new HttpFailure(
      "invalid_event",
      "`space_id` is the space a fork's copy or a new agent was asked for: send `forked_from` or `made_for` with it.",
    );
  }
  if (madeFor !== undefined && spaceId === undefined) {
    throw new HttpFailure(
      "invalid_event",
      "`made_for` is the ask a new agent answers: send the space's `space_id` with it.",
    );
  }
  return { forkedFrom, madeFor, spaceId };
}

function jsonOf(body: Buffer, what = "The body is not JSON."): Record<string, unknown> {
  const text = body.toString("utf8");
  try {
    const parsed: unknown = JSON.parse(text === "" ? "{}" : text);
    if (!isRecord(parsed)) throw new Error("not an object");
    return parsed;
  } catch {
    throw new HttpFailure("invalid_event", what);
  }
}

async function bodyOf(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

function respond(response: ServerResponse, answer: Answer): void {
  if (answer.bytes !== undefined) {
    response.writeHead(answer.status, {
      "content-length": answer.bytes.byteLength,
      ...answer.headers,
    });
    response.end(Buffer.from(answer.bytes));
    return;
  }
  const text = JSON.stringify(answer.body ?? {});
  response.writeHead(answer.status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text),
    ...answer.headers,
  });
  response.end(text);
}

/** A refusal at the door, as the HTTP error envelope. */
function refusalAnswer(failure: HttpFailure): Answer {
  return {
    status: STATUS[failure.code],
    body: {
      error: {
        code: failure.code,
        message: failure.message,
        request_id: "conformance",
        ...(failure.issues === undefined ? {} : { issues: failure.issues }),
      },
    },
  };
}

function approvalJson(row: ApprovalRow): Record<string, unknown> {
  return {
    approval_id: row.approval_id,
    run_id: row.run_id,
    state: row.state,
    resolution: row.decision,
    scope: row.scope,
    reason: row.reason,
    resolved_by: row.resolved_by,
    resolved_at: row.resolved_at,
    updated_input: row.updated_input,
    expires_at: row.expires_at,
    fallback: row.fallback,
  };
}

/** What a socket session needs from the server around it. */
interface SessionHost {
  readonly workspace: Workspace;
  readonly ids: IdGenerator;
  readonly version: string;
  readonly signed: (attachmentId: string) => { url: string; url_expires_at: string };
  /** A `hello` was said: the door counts them, so a restart's reconnect is seen. */
  readonly helloed: () => void;
}

/**
 * One socket, as the real `Session` handles it: hello, subscribe, replay from `since`, an ack
 * for every event, a pong for every ping, and delivery in `seq` order at most once.
 */
class Session {
  private version: number | undefined;
  private subscribed = false;
  private deliveredSeq = 0;
  private memberSpaces = new Set<string>();
  private closed = false;
  /** The server frames beyond the base set this socket said it takes, in its `hello`. */
  private accepts: ReadonlySet<string> = new Set();
  /** How much of a room it is handed with a message for it, from its `hello` (ADR 0088). */
  private budget = budgetOf();

  constructor(
    private readonly socket: WebSocket,
    private readonly principal: Principal,
    private readonly host: SessionHost,
  ) {}

  get isSubscribed(): boolean {
    return this.subscribed && !this.closed;
  }

  receive(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.fail("invalid_frame", "That frame is not JSON.");
      return;
    }
    const frame = clientFrame.safeParse(parsed);
    if (!frame.success) {
      this.fail("invalid_frame", "That is not a frame this server understands.");
      return;
    }
    switch (frame.data.frame) {
      case "hello":
        this.budget = budgetOf(frame.data.context);
        this.accepts = new Set(frame.data.accepts ?? []);
        this.host.helloed();
        this.onHello(frame.data.protocol);
        return;
      case "subscribe":
        this.onSubscribe(frame.data.workspace_id, frame.data.since);
        return;
      case "event":
        this.onEvent(frame.data.event);
        return;
      case "ping":
        this.send({ frame: "pong", ts: frame.data.ts });
        return;
      default:
        return;
    }
  }

  private onHello(protocol: { min: number; max: number }): void {
    const version = negotiateProtocol(protocol, { min: PROTOCOL_VERSION, max: PROTOCOL_VERSION });
    if (version === undefined) {
      this.fail(
        "protocol_unsupported",
        `This server speaks Agent Connect v${PROTOCOL_VERSION}; you asked for ${protocol.min}–${protocol.max}.`,
      );
      this.close(CLOSE_POLICY, "protocol_unsupported");
      return;
    }
    this.version = version;
    const { workspace } = this.host;
    const me = this.principal;
    const manifest = {
      harness_id: me.participantId,
      display_name: me.displayName,
      owner_id: workspace.owner.participantId,
      ephemeral: false,
    };
    // Its agents, with their rooms, for a harness that speaks them (ADR 0087).
    const agents = this.speaks()
      ? [...workspace.agents.values()].map((agent) => ({
          agent_id: agent.agent_id,
          key: agent.key,
          name: agent.name,
          lead: agent.lead,
          state: agent.state,
          spaces: workspace.memberSpacesOf(agent.agent_id),
          room: workspace.whereabouts(agent).room,
          held: workspace.whereabouts(agent).held,
        }))
      : undefined;
    this.send({
      frame: "event",
      event: {
        v: 1,
        type: "hello",
        id: this.host.ids.next("event"),
        ts: workspace.nowIso(),
        workspace_id: workspace.id,
        actor: { kind: "system", id: "system" },
        protocol: { min: PROTOCOL_VERSION, max: PROTOCOL_VERSION },
        server: { name: "chips-conformance", version: this.host.version },
        harnesses: [manifest],
        ...(me.kind === "harness" ? { harness: manifest } : {}),
        ...(agents === undefined ? {} : { agents }),
        // Ask first: nothing here decides a card, so the dial reads as the level where nothing does.
        autonomy: 1,
        policy: { autonomy: 1, rules: [] },
        spaces: workspace.memberSpacesOf(me.participantId),
      },
    });
  }

  private onSubscribe(workspaceId: string, since: number | undefined): void {
    if (this.version === undefined) {
      this.fail("invalid_frame", "Say hello before you subscribe.");
      return;
    }
    if (workspaceId !== this.principal.workspaceId) {
      this.fail("forbidden", "You may only subscribe to your own workspace.");
      return;
    }
    const { workspace } = this.host;
    this.memberSpaces = new Set(workspace.memberSpacesOf(this.principal.participantId));
    this.deliveredSeq = since ?? workspace.head();
    this.subscribed = true;
    let cursor = this.deliveredSeq;
    for (;;) {
      const page = workspace.since(cursor, REPLAY_PAGE, this.viewer());
      for (const event of page.events) this.deliver(event);
      if (page.nextCursor === null || this.closed) return;
      cursor = page.nextCursor;
    }
  }

  private onEvent(event: Record<string, unknown>): void {
    if (this.version === undefined) {
      this.fail("invalid_frame", "Say hello before you send an event.");
      return;
    }
    const key = event["idempotency_key"];
    if (typeof key !== "string" || key.length === 0) {
      this.fail("invalid_frame", "Every event you send carries an idempotency key.");
      return;
    }
    const outcome = this.host.workspace.submit(this.principal, event);
    if (!outcome.ok) {
      const { error } = outcome;
      this.send({
        frame: "error",
        code: error.code,
        message: error.message,
        idempotency_key: key,
        // Which rule, and where the agent is, as the real socket says it (ADR 0087).
        ...(ONE_ROOM_REFUSALS.has(error.kind) ? { refusal: error.kind } : {}),
        ...(error.space_id === undefined ? {} : { space_id: error.space_id }),
      });
      return;
    }
    this.send({
      frame: "ack",
      idempotency_key: key,
      seq: outcome.event.seq,
      duplicate: outcome.duplicate,
      // A task that opened a lane says where it is, as the real server does (M3.5).
      ...(outcome.lane === undefined ? {} : { lane: outcome.lane }),
      // A message held from the agents it named, so the sender can say so (ADR 0097).
      ...(outcome.held === undefined ? {} : { held: true, exchange: outcome.held }),
    });
  }

  private viewer(): Viewer {
    return {
      participantId: this.principal.participantId,
      memberSpaces: this.memberSpaces,
      alsoIs: this.agents(),
      // The one person here owns the workspace, and is told who everybody is, and every agent
      // (ADR 0034).
      seesDirectory: this.principal.kind === "person",
      seesAgents: this.principal.kind === "person",
    };
  }

  /** The harness's agents, which it speaks for on this socket (ADR 0087); none for a person. */
  private agents(): Set<string> {
    if (this.principal.kind !== "harness") return new Set();
    // A deleted one is not its harness's to speak for (ADR 0095).
    const agents = [...this.host.workspace.agents.values()].filter((agent) => !agent.deleted);
    return new Set(agents.map((agent) => agent.agent_id));
  }

  /** The ids this socket answers to: itself, and its agents. */
  private selves(): Set<string> {
    return new Set([this.principal.participantId, ...this.agents()]);
  }

  /** Whether it is shown agents as they are: a person, or a harness that declared `agents`. */
  private speaks(): boolean {
    return this.principal.kind !== "harness" || this.host.workspace.speaksAgents();
  }

  /** One event to this subscriber, in order and at most once, if it may see it. */
  deliver(event: StoredEvent): void {
    if (this.closed || !this.subscribed || event.seq <= this.deliveredSeq) return;
    if (!this.host.workspace.canSee(event, this.viewer())) {
      this.deliveredSeq = event.seq;
      return;
    }
    this.noteMembership(event);
    this.deliveredSeq = event.seq;
    // What a harness that has not learnt agents has no words for, and the view it knew.
    if (!this.speaks() && AGENT_EVENTS.has(event.type)) return;
    const payload = this.asDelivered(event);
    this.send({
      frame: "event",
      event: this.speaks()
        ? payload
        : inLegacyView(payload, { harnessId: this.principal.participantId, own: this.agents() }),
    });
    this.receiptFor(event);
  }

  private noteMembership(event: StoredEvent): void {
    const space = event.space_id;
    if (space === null) return;
    const me = this.principal.participantId;
    const selves = this.selves();
    const p = event.payload;
    const named = [p["participant_id"], p["to"], p["from"]].some(
      (id) => typeof id === "string" && selves.has(id),
    );
    const opened = opensFor(event, me);
    const joins = event.type === "membership.added" || event.type === "membership.replaced";
    if ((joins && named) || opened) this.memberSpaces.add(space);
    else if (event.type === "membership.removed" && named) {
      // Read again, as the real server reads it: one of the harness's two agents leaving a room
      // does not take the harness out of it. Forgetting the room made the socket deaf to the
      // one still there (agents review, finding 37).
      this.memberSpaces = new Set(this.host.workspace.memberSpacesOf(me));
    }
  }

  /**
   * What another participant said reaches a harness as `message.new` (decision 10) when it is for
   * the harness, or was logged before Chips said who a message is for, and as
   * `message.overheard` when it is for somebody else (ADR 0081).
   */
  private asDelivered(event: StoredEvent): Readonly<Record<string, unknown>> {
    if (event.type === "agent.attached") return this.withCatchUp(event);
    if (event.type === "message.handed") return this.asHanded(event);
    if (event.type !== "message.post") return event.payload;
    // Its own words as it said them, unless one of its agents said them to another (ADR 0101),
    // which a harness that has not declared agents, knowing them all as itself, is never handed.
    const own = this.selves().has(event.actor.id);
    if (own && (!this.speaks() || this.turnTakers(event).length === 0)) {
      return this.ownHeard(event);
    }
    return this.asHeard(event, this.isForMe(event) ? "message.new" : "message.overheard");
  }

  /**
   * Its own agents with a turn going in the room, other than the one who said it and those it is
   * for (ADR 0106), as the real server names them. The fake keeps no clock, so none is too quiet.
   */
  private workingTurns(event: StoredEvent): { agent_id: string; run_id: string }[] {
    if (event.space_id === null || this.principal.kind !== "harness" || !this.speaks()) return [];
    const skip = new Set([event.actor.id, ...this.turnTakers(event)]);
    const mine = this.agents();
    return [...this.host.workspace.runs.values()].flatMap((run) =>
      run.space_id === event.space_id &&
      run.agent_id !== undefined &&
      mine.has(run.agent_id) &&
      !skip.has(run.agent_id) &&
      !ENDED.has(run.state)
        ? [{ agent_id: run.agent_id, run_id: run.run_id }]
        : [],
    );
  }

  /** Its own words as said, and, with others of its agents working there, who said them (ADR 0106). */
  private ownHeard(event: StoredEvent): Readonly<Record<string, unknown>> {
    const working = this.workingTurns(event);
    if (working.length === 0) return event.payload;
    const attachments = this.signedAttachments(event);
    return {
      ...event.payload,
      message_id: messageIdOf(event.id),
      from: this.senderOf(event),
      ...(attachments === undefined || attachments.length === 0 ? {} : { attachments }),
      working_turns: working,
    };
  }

  /** A message's files, each with a URL this harness may fetch. */
  private signedAttachments(event: StoredEvent): Record<string, unknown>[] | undefined {
    return (event.payload["attachments"] as Record<string, unknown>[] | undefined)?.map(
      (attachment) => ({
        ...attachment,
        ...this.host.signed(String(attachment["attachment_id"])),
      }),
    );
  }

  /** The ids a message is for; `undefined` from before Chips said who a message is for. */
  private addressedTo(event: StoredEvent): string[] | undefined {
    const addressed = event.payload["addressed_to"];
    return Array.isArray(addressed) ? (addressed as string[]) : undefined;
  }

  private isForMe(event: StoredEvent): boolean {
    return this.addressedTo(event) === undefined || this.turnTakers(event).length > 0;
  }

  /**
   * Who of this socket takes the turn, as the real server says it (`takersOf`): those it is for,
   * the harness itself where it is the member addressed, or, from before Chips said, every one
   * of its own in the room; never the one who said it.
   */
  private turnTakers(event: StoredEvent): string[] {
    return takersOf(this.addressedTo(event), this.selves(), this.ownIn(event), event.actor.id);
  }

  /** This socket's own in a room: its agents there, or the harness itself where it is a member. */
  private ownIn(event: StoredEvent): string[] {
    if (event.space_id === null) return [];
    const { workspace } = this.host;
    const agents = workspace.agentsIn(event.space_id).map((agent) => agent.agent_id);
    if (agents.length > 0) return agents;
    const me = this.principal.participantId;
    return workspace.roleOf(event.space_id, me) === undefined ? [] : [me];
  }

  private asHeard(
    event: StoredEvent,
    type: "message.new" | "message.overheard",
    nobodys?: TakerNews["nobodys"],
  ): Readonly<Record<string, unknown>> {
    const attachments = this.signedAttachments(event);
    const working = this.workingTurns(event);
    const context = this.contextOf(event, type);
    const replying = this.replyingOf(event, context);
    // Older lines left out to fit the budget are said in the note (ADR 0105).
    const cut = context?.truncated === true ? { shown: context.lines.length } : undefined;
    const room = this.roomOf(event, type, { nobodys, cut });
    const exchange = this.exchangeOf(event, type);
    return {
      v: 1,
      type,
      id: event.id,
      ts: event.ts,
      workspace_id: this.host.workspace.id,
      ...(event.space_id === null ? {} : { space_id: event.space_id }),
      ...(event.run_id === null ? {} : { run_id: event.run_id }),
      seq: event.seq,
      actor: { kind: "system", id: "system" },
      ...(event.idempotency_key === null ? {} : { idempotency_key: event.idempotency_key }),
      message_id: messageIdOf(event.id),
      from: this.senderOf(event),
      ...(attachments === undefined || attachments.length === 0 ? {} : { attachments }),
      ...heardFields(event.payload, type),
      ...(replying === undefined ? {} : { replying_to: replying }),
      for: type === "message.new" ? this.turnTakers(event) : [],
      ...(working.length === 0 ? {} : { working_turns: working }),
      ...(context === undefined ? {} : { context }),
      ...(room === undefined ? {} : { room }),
      ...(exchange === undefined ? {} : { exchange }),
    };
  }

  /**
   * How the agents' talk stands, with an agent's message for this harness, once it is worth a
   * word (ADR 0097): the real server's facts and words, as of the message.
   */
  private exchangeOf(event: StoredEvent, type: "message.new" | "message.overheard") {
    if (type !== "message.new" || event.space_id === null) return undefined;
    if (event.actor.kind !== "harness" && event.actor.kind !== "agent") return undefined;
    const { workspace } = this.host;
    const takers = this.turnTakers(event);
    const alsoFor = (this.addressedTo(event) ?? []).filter((id) => !takers.includes(id));
    const facts = exchangeFactsOf(workspace.exchangeAt(event.space_id, event.seq), {
      nowMs: Date.parse(event.ts),
      alsoFor,
    });
    if (facts.stage === "quiet") return undefined;
    const names = new Map(
      workspace
        .participantsVisibleTo(this.principal.participantId)
        .map((each) => [each.participantId, each.displayName]),
    );
    return { ...facts, note: renderExchangeNote(facts, (id) => names.get(id) ?? "someone") };
  }

  /**
   * A held message handed to one of this harness's own once a person acted (ADR 0097): that
   * message as `message.new` for it, with `handed`, numbered as the hand-over, as the real one.
   */
  private asHanded(event: StoredEvent): Readonly<Record<string, unknown>> {
    const agentId = event.payload["agent_id"];
    const messageId = event.payload["message_id"];
    if (typeof agentId !== "string" || !this.selves().has(agentId)) return event.payload;
    if (typeof messageId !== "string") return event.payload;
    let eventId: string;
    try {
      eventId = eventIdOfMessage(messageId);
    } catch {
      return event.payload;
    }
    const original = this.host.workspace.log.find((each) => each.id === eventId);
    if (original?.type !== "message.post") return event.payload;
    // What was nobody's turn, handed to the room's lead (ADR 0104): its note says why.
    const toLead = event.payload["lead"] === true;
    const heard = this.asHeard(
      { ...original, payload: { ...original.payload, addressed_to: [agentId] } },
      "message.new",
      toLead ? this.nobodysOf(original) : undefined,
    );
    // Handed later, so no turn going now is to hear it as said (ADR 0106).
    const { exchange: _talk, working_turns: _working, ...words } = heard;
    return {
      ...words,
      id: event.id,
      seq: event.seq,
      handed: true,
      ...(toLead ? { lead: true } : {}),
    };
  }

  /** Who said what was nobody's turn, and the person to tell: the workspace's owner, here. */
  private nobodysOf(original: StoredEvent): NonNullable<TakerNews["nobodys"]> {
    const { workspace } = this.host;
    const saidBy =
      workspace
        .participantsVisibleTo(this.principal.participantId)
        .find((each) => each.participantId === original.actor.id)?.displayName ?? "An agent";
    return { saidBy, tell: workspace.owner.displayName };
  }

  /** A participant's name as this harness knows it, or "Someone". */
  private nameOf(participantId: string): string {
    return (
      this.host.workspace
        .participantsVisibleTo(this.principal.participantId)
        .find((each) => each.participantId === participantId)?.displayName ?? "Someone"
    );
  }

  /**
   * Who is in the room and how @ works, for each who takes the turn (ADR 0092), and who leads it
   * (ADR 0104); with, on what was nobody's turn handed to the lead, why it is its; that older
   * lines were left out of the turn (ADR 0105); and what the room's job has spent (ADR 0117).
   */
  private roomOf(
    event: StoredEvent,
    type: "message.new" | "message.overheard",
    turn: { readonly nobodys?: TakerNews["nobodys"]; readonly cut?: TakerNews["cut"] },
  ) {
    if (type !== "message.new" || event.space_id === null) return undefined;
    const takers = this.turnTakers(event);
    const who = takers.length > 0 ? takers : [this.principal.participantId];
    // A message for a taker with no @ for it says that it is theirs (ADR 0104 addendum), one for
    // every agent that each has it (ADR 0249), and a person's for several who organises it (ADR 0287).
    const sender = turn.nobodys === undefined ? { saidBy: this.nameOf(event.actor.id) } : undefined;
    const toAll = sender !== undefined && toEveryAgent(event.payload) ? sender : undefined;
    const members = this.host.workspace.noteMembers(event.space_id);
    const several =
      sender !== undefined && event.actor.kind === "person"
        ? severalAsked(event.payload, members)
        : undefined;
    const toldTo = (id: string): TakerNews => ({
      ...(turn.nobodys === undefined ? {} : { nobodys: turn.nobodys }),
      ...(sender === undefined || !yoursWithoutAt(event.payload, id) ? {} : { yours: sender }),
      ...(toAll === undefined ? {} : { toAll }),
      ...(sender === undefined || several === undefined
        ? {}
        : { several: { saidBy: sender.saidBy, ...several } }),
      ...(turn.cut === undefined ? {} : { cut: turn.cut }),
    });
    const told = who.map((id) => [id, toldTo(id)] as const);
    const news = told.every(([, each]) => Object.keys(each).length === 0)
      ? undefined
      : Object.fromEntries(told);
    return roomNoteFor(
      members,
      who,
      undefined,
      news,
      this.host.workspace.spendOf(event.space_id, event.seq),
    );
  }

  /** One of its agents put in a room, with the room's last lines before it joined (ADR 0088). */
  private withCatchUp(event: StoredEvent): Readonly<Record<string, unknown>> {
    const agentId = String(event.payload["agent_id"]);
    if (!this.agents().has(agentId) || event.space_id === null) return event.payload;
    const catchUp = this.host.workspace.catchUpFor(
      event.space_id,
      event.seq,
      this.budget,
      this.host.signed,
    );
    return catchUp === undefined ? event.payload : { ...event.payload, catch_up: catchUp };
  }

  /**
   * The message a reply answers (ADR 0219), as the real server hands it over: with a turn, the
   * lines said before it too when it is older than the context; overheard, the quote alone.
   */
  private replyingOf(event: StoredEvent, handed: RoomContext | undefined) {
    const replyTo = event.payload["reply_to"];
    if (typeof replyTo !== "string" || event.space_id === null) return undefined;
    return this.host.workspace.replyingToFor(event.space_id, replyTo, handed, this.host.signed);
  }

  /** What was said since it last spoke there, with a message for it only (ADR 0088). */
  private contextOf(event: StoredEvent, type: "message.new" | "message.overheard") {
    if (type !== "message.new" || event.space_id === null) return undefined;
    const takers = this.turnTakers(event);
    const context = this.host.workspace.contextFor(
      takers.length > 0 ? takers : [this.principal.participantId],
      event.space_id,
      event.seq,
      this.budget,
      this.host.signed,
    );
    // What the room's job has spent, as of the message (ADR 0117).
    return context === undefined
      ? undefined
      : { ...context, spend: this.host.workspace.spendOf(event.space_id, event.seq) };
  }

  /**
   * Who said it: their name, their role in the room, and for the owner — the one person the fake
   * has a standing for — their standing in the workspace (SEC-15), as the real server says it.
   */
  private senderOf(event: StoredEvent): Record<string, unknown> {
    const { workspace } = this.host;
    const sender = workspace
      .participantsVisibleTo(this.principal.participantId)
      .find((each) => each.participantId === event.actor.id);
    const role =
      event.space_id === null ? undefined : workspace.roleOf(event.space_id, event.actor.id);
    const kind = event.actor.kind;
    const owner = event.actor.kind === "person" && event.actor.id === workspace.owner.participantId;
    return {
      participant_id: event.actor.id,
      kind: kind === "agent" || kind === "harness" ? kind : "person",
      display_name: sender?.displayName ?? event.actor.id,
      ...(role === undefined ? {} : { role }),
      ...(owner ? { workspace_role: "owner" } : {}),
    };
  }

  /** A person's message into this harness's live run gets a receipt beside it: queued or steered. */
  private receiptFor(event: StoredEvent): void {
    if (event.actor.kind !== "person" || event.idempotency_key === null) return;
    // A message for somebody else is not this harness's, whatever run it has going (ADR 0081).
    if (event.type === "message.post" && !this.isForMe(event)) return;
    const disposition =
      event.type === "message.post" ? "queued" : event.type === "run.steer" ? "steered" : undefined;
    if (disposition === undefined) return;
    const run = this.runOf(event);
    if (run === undefined || run.harness_id !== this.principal.participantId) return;
    this.send({ frame: "receipt", idempotency_key: event.idempotency_key, disposition });
  }

  /** The run an event names, or this harness's run going in its space. */
  private runOf(event: StoredEvent) {
    const { workspace } = this.host;
    if (event.run_id !== null) return workspace.runs.get(event.run_id);
    if (event.space_id === null) return undefined;
    return workspace.liveRunIn(event.space_id, this.principal.participantId);
  }

  private send(frame: Record<string, unknown>): void {
    if (this.closed) return;
    this.socket.send(JSON.stringify(frame));
  }

  /** A frame beyond the base set, sent only when this socket said its word: now or never. */
  offer(word: string, frame: Record<string, unknown>): boolean {
    if (!this.isSubscribed || !this.accepts.has(word)) return false;
    this.send(frame);
    return true;
  }

  private fail(code: string, message: string): void {
    this.send({ frame: "error", code, message });
  }

  close(code: number, reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.socket.close(code, reason);
  }

  onDisconnected(): void {
    this.closed = true;
  }
}

/** What a harness is told of a message's own words and aim, as logged: the real `heardFields`. */
function heardFields(
  payload: Readonly<Record<string, unknown>>,
  type: "message.new" | "message.overheard",
): Record<string, unknown> {
  const { text, reply_to: replyTo, mentions, addressed_to: addressedTo, held } = payload;
  return {
    text: typeof text === "string" ? text : "",
    ...(Array.isArray(mentions) ? { mentions } : {}),
    ...(typeof replyTo === "string" ? { reply_to: replyTo } : {}),
    ...(Array.isArray(addressedTo) ? { addressed_to: addressedTo } : {}),
    ...(type === "message.overheard" && held === true ? { held: true } : {}),
  };
}

/** A token as the server mints one: the prefix, and 192 bits of nothing anybody can guess. */
function newToken(): string {
  return `chips_at_${randomBytes(24).toString("base64url")}`;
}

/** The door: the routes, the upgrade, and the person's side for the kit. */
class Door {
  readonly workspace: Workspace;
  readonly address: ChipsAddress;
  private readonly server: Server;
  private readonly sockets = new WebSocketServer({ noServer: true });
  private readonly sessions = new Set<Session>();
  /** Socket tickets minted and not yet spent (SEC-22). */
  private readonly tickets = new Map<string, Principal>();
  /** The rooms' projects (ADR 0220), made on first use. */
  private projectsMade: FakeProjects | undefined;
  private readonly ids: IdGenerator;
  private readonly version: string;
  private readonly host: string;
  private base = "";
  private heardOverHttp = false;
  /** Join requests (ADR 0122): whatever joins is handed this fake's one harness. */
  readonly joins = new FakeJoins(() => this.address);
  readonly settings = new FakeSettings();
  /** Runs of the harness's own jobs it posted, a run posted again in place (ADR 0252). */
  readonly jobRuns: JobRun[] = [];
  readonly statuses: HarnessStatus[] = [];
  private helloCount = 0;

  constructor(options: FakeChipsOptions) {
    this.ids = options.ids ?? createIdGenerator();
    this.version = options.version ?? "0.0.0-conformance";
    this.host = options.host ?? "127.0.0.1";
    const workspaceId = this.ids.next("workspace");
    const owner: Principal = {
      kind: "person",
      participantId: this.ids.next("person"),
      workspaceId,
      displayName: options.ownerName ?? "Arjun",
    };
    const harness: Principal = {
      kind: "harness",
      participantId: this.ids.next("harness"),
      workspaceId,
      displayName: options.harnessName ?? "The harness under test",
    };
    this.workspace = new Workspace({
      workspaceId,
      owner,
      harness,
      ids: this.ids,
      now: options.now ?? (() => new Date()),
      capabilities: options.capabilities,
    });
    const spaceId = this.workspace.createDirectSpace();
    this.address = {
      url: "",
      workspaceId,
      harnessId: harness.participantId,
      token: newToken(),
      ownerId: owner.participantId,
      spaceId,
    };
    this.server = createServer((request, response) => void this.handle(request, response));
    this.server.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url ?? "/", this.base);
      if (url.pathname !== "/v1/ws") {
        socket.destroy();
        return;
      }
      // A ticket from `POST /v1/socket-tickets`, as the SDK opens with (SEC-22); a header, or
      // the token in the query that an older SDK sent, as the real door still takes this release.
      const ticket = url.searchParams.get("ticket");
      const query = url.searchParams.get("token");
      const principal =
        ticket !== null
          ? this.redeemTicket(ticket)
          : this.principalOf(
              request.headers.authorization ?? (query === null ? undefined : `Bearer ${query}`),
            );
      if (principal === undefined) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      this.sockets.handleUpgrade(request, socket, head, (ws) => this.open(ws, principal));
    });
    // Every append reaches every socket, in order: the log is the only source of a frame.
    this.workspace.onAppend((event) => {
      for (const session of this.sessions) session.deliver(event);
    });
  }

  async listen(port: number): Promise<ChipsAddress> {
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(port, this.host, () => {
        this.server.removeListener("error", reject);
        resolve();
      });
    });
    const bound = (this.server.address() as AddressInfo).port;
    this.base = `http://${this.host}:${bound}`;
    (this.address as { url: string }).url = this.base;
    return this.address;
  }

  connections(): number {
    return [...this.sessions].filter((session) => session.isSubscribed).length;
  }

  hellos(): number {
    return this.helloCount;
  }

  /** A frame to every socket that said `word` in its `hello`: how many heard it. */
  private offer(word: string, frame: Record<string, unknown>): number {
    return [...this.sessions].filter((session) => session.offer(word, frame)).length;
  }

  askToChange(kind: SettingKind, id: string) {
    const frame = this.settings.askOf(kind, id, {
      ids: this.ids,
      harnessId: this.workspace.harness.participantId,
      ownerId: this.workspace.owner.participantId,
      now: this.workspace.nowIso(),
    });
    return frame === undefined ? undefined : { frame, heard: this.offer(ACCEPTS[kind], frame) };
  }

  askToRestart(): number {
    return this.offer("restart", {
      frame: "restart",
      asked_by: this.workspace.owner.participantId,
      asked_at: this.workspace.nowIso(),
    });
  }

  heard(): boolean {
    return this.heardOverHttp || this.sessions.size > 0;
  }

  async close(): Promise<void> {
    for (const session of this.sessions) session.close(CLOSE_GOING_AWAY, "closing");
    this.sessions.clear();
    this.sockets.close();
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
    this.projectsMade?.close();
  }

  /** The URL a harness gets for an attachment: good for ten minutes, as the real one is. */
  private readonly signed = (attachmentId: string) => ({
    url: `${this.base}/v1/attachments/${attachmentId}?sig=conformance`,
    url_expires_at: new Date(Date.now() + SIGNED_URL_MS).toISOString(),
  });

  private open(ws: WebSocket, principal: Principal): void {
    const session = new Session(ws, principal, {
      workspace: this.workspace,
      ids: this.ids,
      version: this.version,
      signed: this.signed,
      helloed: () => {
        this.helloCount += 1;
      },
    });
    this.sessions.add(session);
    ws.on("message", (data) => session.receive(String(data)));
    ws.on("close", () => {
      session.onDisconnected();
      this.sessions.delete(session);
    });
    ws.on("error", () => undefined);
  }

  /** A single-use ticket for the socket (SEC-22): minted to the token, spent on one upgrade. */
  private socketTicket(call: Call): Answer {
    const ticket = newToken();
    this.tickets.set(ticket, call.principal);
    return { status: 201, body: { ticket, expires_in: 30 } };
  }

  private redeemTicket(ticket: string): Principal | undefined {
    const principal = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    return principal;
  }

  /** The harness by its token; nobody else has a credential here. */
  private principalOf(authorization: string | undefined): Principal | undefined {
    const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    return token !== "" && token === this.address.token ? this.workspace.harness : undefined;
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      if (await this.project(request, response)) return;
      respond(response, await this.route(request));
    } catch (error) {
      respond(
        response,
        error instanceof HttpFailure
          ? refusalAnswer(error)
          : refusalAnswer(new HttpFailure("internal", String(error))),
      );
    }
  }

  /**
   * git's requests to a room's project (ADR 0220), streamed to git rather than read: whether this
   * was one, and it has been answered.
   */
  private async project(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? "/", this.base);
    const asked = projectRequest(url.pathname);
    if (asked === undefined) return false;
    this.heardOverHttp = true;
    if (this.principalOf(request.headers.authorization) === undefined) {
      response.writeHead(401, {
        "content-type": "text/plain; charset=utf-8",
        "www-authenticate": 'Basic realm="Chips"',
      });
      response.end("Chips needs a token for this project.\n");
      return true;
    }
    this.projectsMade ??= new FakeProjects(this.workspace);
    await this.projectsMade.serve(request, response, { ...asked, query: url.search.slice(1) });
    return true;
  }

  /** The doors with no credential: liveness, and the three a harness joins by (ADR 0122). */
  private async openDoor(
    method: string,
    url: URL,
    request: IncomingMessage,
  ): Promise<Answer | undefined> {
    if (method === "GET" && url.pathname === "/v1/health") {
      return {
        status: 200,
        body: { ok: true, name: "chips-conformance", version: this.version },
        headers: { date: new Date().toUTCString() },
      };
    }
    if (method !== "POST" || !/^\/v1\/join(\/|$)/.test(url.pathname)) return undefined;
    return this.joins.answer(method, url.pathname, jsonOf(await bodyOf(request)));
  }

  private async route(request: IncomingMessage): Promise<Answer> {
    const url = new URL(request.url ?? "/", this.base);
    const method = request.method ?? "GET";
    const opened = await this.openDoor(method, url, request);
    if (opened !== undefined) return opened;
    const principal = this.principalOf(request.headers.authorization);
    if (principal === undefined) {
      throw new HttpFailure(
        "unauthorized",
        "This needs a harness token: `Authorization: Bearer …`.",
      );
    }
    this.heardOverHttp = true;
    const body = await bodyOf(request);
    for (const [verb, pattern, handle] of this.routes) {
      const matched = verb === method ? pattern.exec(url.pathname) : null;
      if (matched !== null) {
        return await handle({
          principal,
          params: matched.slice(1),
          url,
          body,
          headers: request.headers,
        });
      }
    }
    throw new HttpFailure("not_found", `Nothing answers ${method} ${url.pathname} here.`);
  }

  private readonly routes: readonly Route[] = [
    ["POST", /^\/v1\/socket-tickets$/, async (call) => this.socketTicket(call)],
    ["GET", /^\/v1\/participants$/, async (call) => this.participants(call)],
    ["POST", /^\/v1\/harnesses\/([^/]+)\/spaces$/, async (call) => this.openSpace(call)],
    ["GET", /^\/v1\/harnesses\/([^/]+)\/spaces$/, async (call) => this.listSpaces(call)],
    ["POST", /^\/v1\/harnesses\/([^/]+)\/agents$/, async (call) => this.registerAgent(call)],
    ["GET", /^\/v1\/harnesses\/([^/]+)\/agents$/, async (call) => this.listAgents(call)],
    ["POST", /^\/v1\/agents\/([^/]+)\/attach$/, async (call) => this.attachAgent(call)],
    ["POST", /^\/v1\/harnesses\/([^/]+)\/events$/, async (call) => this.harnessEvent(call)],
    ["POST", /^\/v1\/runs\/([^/]+)\/events$/, async (call) => this.runEvent(call)],
    ["GET", /^\/v1\/approvals\/([^/]+)\/wait$/, (call) => this.waitForApproval(call)],
    ["GET", /^\/v1\/approvals\/([^/]+)$/, async (call) => this.approval(call)],
    ["POST", /^\/v1\/uploads$/, async (call) => this.newUpload(call)],
    ["PUT", /^\/v1\/uploads\/([^/]+)$/, async (call) => this.storeUpload(call)],
    ["GET", /^\/v1\/attachments\/([^/]+)$/, async (call) => this.attachment(call)],
    ["GET", /^\/v1\/events$/, async (call) => this.events(call)],
    ["GET", /^\/v1\/spaces\/([^/]+)\/context$/, async (call) => this.roomContext(call)],
    ["GET", /^\/v1\/spaces\/([^/]+)\/files$/, async (call) => this.roomFiles(call)],
    ["PUT", /^\/v1\/harnesses\/([^/]+)\/status$/, async (call) => this.putStatus(call)],
    ["PUT", /^\/v1\/agents\/([^/]+)\/context$/, async (call) => this.putSetting(call, "context")],
    [
      "PUT",
      /^\/v1\/harnesses\/([^/]+)\/context$/,
      async (call) => this.putSetting(call, "harness-context"),
    ],
    ["PUT", /^\/v1\/agents\/([^/]+)\/model$/, async (call) => this.putSetting(call, "model")],
    [
      "PUT",
      /^\/v1\/agents\/([^/]+)\/heartbeat$/,
      async (call) => this.putSetting(call, "heartbeat"),
    ],
    [
      "PUT",
      /^\/v1\/agents\/([^/]+)\/context-window$/,
      async (call) => this.putSetting(call, "context-window"),
    ],
    ["PUT", /^\/v1\/harnesses\/([^/]+)\/jobs$/, async (call) => this.putSetting(call, "jobs")],
    ["POST", /^\/v1\/harnesses\/([^/]+)\/jobs\/runs$/, async (call) => this.postJobRuns(call)],
  ];

  /** The harness says how it is: fine, or in trouble with why in a line, as the real door reads it. */
  private putStatus(call: Call): Answer {
    if (call.principal.kind !== "harness" || call.params[0] !== call.principal.participantId) {
      throw new HttpFailure("forbidden", "A harness may only say how it is itself.");
    }
    const body = jsonOf(call.body);
    const reason =
      typeof body["reason"] === "string" ? body["reason"].replace(/\s+/g, " ").trim() : "";
    const at = this.workspace.nowIso();
    if (body["state"] === "ok") this.statuses.push({ state: "ok", at });
    else if (body["state"] === "trouble" && reason !== "" && reason.length <= 200) {
      this.statuses.push({ state: "trouble", reason, at });
    } else {
      throw new HttpFailure("invalid_event", "Send `state`: `ok`, or `trouble` with a `reason`.");
    }
    return { status: 200, body: { state: this.statuses.at(-1)?.state } };
  }

  /**
   * A harness's copy of one of its agents' settings, or of its own files, taken whole (ADRs 0134,
   * 0140, 0143, 0146): another's agent is no agent of its, and a copy the protocol does not take
   * is refused with where it went wrong.
   */
  private putSetting(call: Call, kind: SettingKind): Answer {
    const id = String(call.params[0]);
    const harnessId = call.principal.participantId;
    if (call.principal.kind !== "harness") {
      throw new HttpFailure("forbidden", "A harness sends its own copies.");
    }
    const agent = this.workspace.agents.get(id);
    const mine =
      kind === "harness-context" || kind === "jobs"
        ? id === harnessId
        : agent !== undefined && !agent.deleted;
    if (!mine) throw new HttpFailure("not_found", "No agent of yours.");
    const taken = this.settings.put(kind, id, jsonOf(call.body));
    if (!taken.ok) throw new HttpFailure("invalid_event", taken.message, taken.issues);
    return { status: 200, body: { read_at: this.workspace.nowIso() } };
  }

  /**
   * A harness's runs of its own jobs (ADR 0252), checked as the real door checks them: its own,
   * whole, and only of a job its copy lists. A run posted again replaces the one before.
   */
  private postJobRuns(call: Call): Answer {
    const harnessId = call.principal.participantId;
    if (call.principal.kind !== "harness" || call.params[0] !== harnessId) {
      throw new HttpFailure("forbidden", "Those jobs aren't yours.");
    }
    const parsed = jobRunsPost.safeParse(jsonOf(call.body));
    if (!parsed.success) {
      throw new HttpFailure(
        "invalid_event",
        "That is not a post of a job's runs.",
        parsed.error.issues.map((issue) => ({
          path: issue.path.join(".") || "(root)",
          message: issue.message,
        })),
      );
    }
    const copy = this.settings.copy("jobs", harnessId);
    const known = new Set(
      ((copy?.["jobs"] ?? []) as readonly { readonly job_id: string }[]).map((job) => job.job_id),
    );
    const stray = parsed.data.runs.find((run) => !known.has(run.job_id));
    if (stray !== undefined) {
      throw new HttpFailure(
        "invalid_event",
        `No job ${stray.job_id} in your copy: send the copy before its runs.`,
      );
    }
    for (const run of parsed.data.runs) {
      const at = this.jobRuns.findIndex(
        (each) => each.job_id === run.job_id && each.run_id === run.run_id,
      );
      if (at === -1) this.jobRuns.push(run);
      else this.jobRuns[at] = run;
    }
    return { status: 200, body: { kept: parsed.data.runs.length } };
  }

  /** What a harness reads over HTTP, as it is shown things on its socket (ADR 0087's addendum). */
  private shown<T>(call: Call, value: T): T {
    if (call.principal.kind !== "harness" || this.workspace.speaksAgents()) return value;
    return inLegacyView(value, {
      harnessId: call.principal.participantId,
      own: new Set(this.workspace.agents.keys()),
    });
  }

  /** A harness's agents (ADR 0087): registered by its own key, idempotently, renamed as named. */
  private registerAgent(call: Call): Answer {
    if (call.principal.kind !== "harness" || call.params[0] !== call.principal.participantId) {
      throw new HttpFailure("forbidden", "A harness registers its own agents.");
    }
    const { key, name, lead, state, forkedFrom, madeFor, spaceId } = agentBody(
      jsonOf(call.body),
      call.principal.participantId,
    );
    if (forkedFrom !== undefined && !this.workspace.agents.has(forkedFrom)) {
      throw new HttpFailure("invalid_event", "A copy is of one of this harness's own agents.");
    }
    this.mayLead(key, lead, state);
    const found = this.registered(key, name, { lead, byHarness: true, state, forkedFrom });
    const fork = this.placed(found.agent.agent_id, { forkedFrom, madeFor, spaceId });
    return {
      status: found.created ? 201 : 200,
      body: {
        ...this.agentJson(found.agent),
        created: found.created,
        renamed: found.renamed,
        ...(fork === undefined ? {} : { attached: fork.attached }),
        ...(fork === undefined || fork.attached || fork.why === undefined ? {} : { why: fork.why }),
      },
    };
  }

  /**
   * An agent asked for in a room goes there while the room still waits for it: a fork's copy, or
   * a new agent (ADR 0108). Nothing for an agent nobody asked for.
   */
  private placed(agentId: string, asked: ReturnType<typeof askedFor>): ForkAnswer | undefined {
    const { forkedFrom, madeFor, spaceId } = asked;
    if (spaceId === undefined) return undefined;
    if (madeFor !== undefined) return this.workspace.answerAsk(agentId, madeFor, spaceId);
    if (forkedFrom === undefined) return undefined;
    return this.workspace.answerFork(agentId, forkedFrom, spaceId);
  }

  /** The workspace's registration, a deleted agent's key refused as the real store refuses it. */
  private registered(
    key: string,
    name: string,
    options: Parameters<Workspace["registerAgent"]>[2],
  ): ReturnType<Workspace["registerAgent"]> {
    try {
      return this.workspace.registerAgent(key, name, options);
    } catch (error) {
      if (error instanceof AgentDeleted)
        throw new HttpFailure("forbidden", "That agent was deleted.");
      throw error;
    }
  }

  /**
   * The Main agent's own rules, as the real door has them: a harness has one at most, and it is
   * always there, as its Main room is (agents review, finding 8). Its default agent may take Main
   * from another (ADR 0183).
   */
  private mayLead(key: string, lead: boolean, state: string | undefined): void {
    const agents = [...this.workspace.agents.values()].filter((each) => each.deleted !== true);
    const known = agents.find((each) => each.key === key);
    if ((lead || known?.lead === true) && state === "archived") {
      throw new HttpFailure("invalid_event", "The Main agent is always there: it is not archived.");
    }
    const other = agents.find((each) => each.lead && each.key !== key);
    if (lead && other !== undefined && key !== this.workspace.harness.participantId) {
      throw new HttpFailure(
        "invalid_event",
        `This harness has a Main agent already: ${other.name}. A harness has one at most.`,
      );
    }
  }

  /** One of its agents in a room, in the place of another of its own there or of itself. */
  private attachAgent(call: Call): Answer {
    if (call.principal.kind !== "harness") {
      throw new HttpFailure("forbidden", "A harness attaches its own agents.");
    }
    const body = jsonOf(call.body);
    const spaceId = body["space_id"];
    const replacing = body["replacing"];
    if (typeof spaceId !== "string" || typeof replacing !== "string") {
      throw new HttpFailure("invalid_event", "Send the space's `space_id`, and `replacing`.");
    }
    const agentId = String(call.params[0]);
    const done = this.workspace.attachAgent(agentId, spaceId, replacing);
    if (!done.ok) {
      if (done.kind === "unknown_agent") throw new HttpFailure("not_found", "No agent of yours.");
      if (done.kind === "unknown_space") throw new HttpFailure("not_found", "No space of that id.");
      throw new HttpFailure("invalid_event", "Name what the agent takes the place of there.");
    }
    return {
      status: 200,
      body: { agent_id: agentId, space_id: spaceId, replacing, attached: done.attached },
    };
  }

  private listAgents(call: Call): Answer {
    if (call.principal.kind !== "harness" || call.params[0] !== call.principal.participantId) {
      throw new HttpFailure("forbidden", "A harness lists its own agents.");
    }
    const agents = [...this.workspace.agents.values()]
      .filter((agent) => !agent.deleted)
      .map((agent) => this.agentJson(agent));
    return { status: 200, body: { agents } };
  }

  private agentJson(agent: AgentRow): Record<string, unknown> {
    return {
      agent_id: agent.agent_id,
      harness_id: this.workspace.harness.participantId,
      key: agent.key,
      name: agent.name,
      lead: agent.lead,
      state: agent.state,
      forked_from: agent.forked_from ?? null,
      spaces: this.workspace.memberSpacesOf(agent.agent_id),
      // Where it is, the room an archive took it from, and what it holds (ADR 0087, Phase 4).
      ...this.workspace.whereabouts(agent),
    };
  }

  /** A page of a room's lines for a harness in it (ADR 0088), as the real route answers it. */
  private roomContext(call: Call): Answer {
    const spaceId = String(call.params[0]);
    // A room it is in, itself or as one of its agents (ADR 0087).
    if (!this.workspace.memberSpacesOf(call.principal.participantId).includes(spaceId)) {
      throw new HttpFailure("not_found", "You are in no space with that id.");
    }
    const number = (name: string): number | undefined => {
      const raw = call.url.searchParams.get(name);
      if (raw === null) return undefined;
      const parsed = Number(raw);
      if (!Number.isSafeInteger(parsed) || parsed < 1) {
        throw new HttpFailure("invalid_frame", `\`${name}\` is a whole number, 1 or more.`);
      }
      return parsed;
    };
    const before = number("before") ?? this.workspace.head() + 1;
    const limit = number("limit") ?? CONTEXT_BUDGET.lines;
    return {
      status: 200,
      body: this.shown(call, this.workspace.contextPage(spaceId, before, limit, this.signed)),
    };
  }

  /**
   * A room's files at their current version (ADR 0099), or one name's versions (ADR 0100), as the
   * real route answers a harness.
   */
  private roomFiles(call: Call): Answer {
    const spaceId = String(call.params[0]);
    if (!this.workspace.memberSpacesOf(call.principal.participantId).includes(spaceId)) {
      throw new HttpFailure("not_found", "You are in no space with that id.");
    }
    const name = call.url.searchParams.get("name");
    const files =
      name === null
        ? this.workspace.roomFiles(spaceId, ROOM_FILES_CEILING, undefined, this.signed)
        : this.workspace.fileVersions(spaceId, name, ROOM_FILES_CEILING, this.signed);
    return { status: 200, body: this.shown(call, { files }) };
  }

  private participants(call: Call): Answer {
    const me = call.principal.participantId;
    const legacy = call.principal.kind === "harness" && !this.workspace.speaksAgents();
    const agents = this.workspace.agents;
    const listed = this.workspace.participantsVisibleTo(me);
    // A harness that has not learnt agents knows its own as itself: one entry, its own, where
    // the first of them was.
    const self = {
      participantId: me,
      kind: "harness" as const,
      displayName: call.principal.displayName,
    };
    const mine = (each: { participantId: string }) =>
      agents.has(each.participantId) || each.participantId === me;
    const at = listed.findIndex(mine);
    const others = listed.filter((each) => !mine(each));
    const named = legacy
      ? [
          ...others.slice(0, at < 0 ? others.length : at),
          self,
          ...others.slice(at < 0 ? others.length : at),
        ]
      : listed;
    const participants = named.map((each) => ({
      id: each.participantId,
      kind: each.kind,
      display_name: each.displayName,
      owner_id: each.kind === "person" ? null : this.workspace.owner.participantId,
      ...(each.kind === "agent" ? { harness_id: this.workspace.harness.participantId } : {}),
      // An agent's face, as a person chose it (ADR 0089); `null` while it wears its initials.
      ...("face" in each ? { face: each.face } : {}),
    }));
    return { status: 200, body: this.shown(call, { participants }) };
  }

  /**
   * The harness's one door: the space its key names, found or opened for its owner; or, with a
   * `space_id`, the room a person asked it for, claimed under the key (`space.claimed`).
   */
  private openSpace(call: Call): Answer {
    if (call.params[0] !== call.principal.participantId) {
      throw new HttpFailure("forbidden", "A harness may only open its own spaces.");
    }
    const body = jsonOf(call.body);
    if (typeof body["key"] !== "string" || body["key"].trim() === "") {
      throw new HttpFailure(
        "invalid_event",
        "Send a `key`: what this space is, in your own terms.",
      );
    }
    const key = body["key"].trim();
    const trimmed = typeof body["title"] === "string" ? body["title"].trim() : undefined;
    const title = trimmed === "" ? undefined : trimmed;
    const shared = body["shared"] === true;
    if (typeof body["space_id"] === "string")
      return this.claim(body["space_id"], key, title, shared);
    const opened = this.workspace.openSpace(key, title, shared);
    return {
      status: opened.created ? 201 : 200,
      body: {
        space_id: opened.spaceId,
        created: opened.created,
        retitled: false,
        joined: opened.joined,
        claimed: false,
      },
    };
  }

  private claim(spaceId: string, key: string, title: string | undefined, shared: boolean): Answer {
    if (shared) {
      throw new HttpFailure(
        "invalid_event",
        "A space asked for is claimed under a key of this harness's own, not a shared one.",
      );
    }
    const claimed = this.workspace.claimSpace(spaceId, key, title);
    if (!claimed.ok) throw new HttpFailure(claimed.error.code, claimed.error.message);
    return {
      status: 200,
      body: {
        space_id: claimed.value.spaceId,
        created: false,
        retitled: claimed.value.retitled,
        joined: false,
        claimed: claimed.value.claimed,
      },
    };
  }

  /** The read side of the door: the rooms the harness opened by key, and the ones it was asked for. */
  private listSpaces(call: Call): Answer {
    if (call.params[0] !== call.principal.participantId) {
      throw new HttpFailure("forbidden", "A harness may only list its own spaces.");
    }
    return {
      status: 200,
      body: { spaces: this.workspace.spacesOpened(), asked: this.workspace.spacesAsked() },
    };
  }

  private harnessEvent(call: Call): Answer {
    if (call.params[0] !== call.principal.participantId) {
      throw new HttpFailure("forbidden", "A harness may only post its own events.");
    }
    return this.appended(call, undefined);
  }

  private runEvent(call: Call): Answer {
    return this.appended(call, call.params[0]);
  }

  /** `POST` of one event: the same use case with the run in the path or not at all. */
  private appended(call: Call, runId: string | undefined): Answer {
    const raw = jsonOf(call.body);
    const outcome = this.workspace.submit(call.principal, raw, {
      runId,
      idempotencyKey: headerOf(call, "idempotency-key"),
    });
    if (!outcome.ok) {
      throw new HttpFailure(outcome.error.code, outcome.error.message, outcome.error.issues);
    }
    const { event, duplicate, lane, held } = outcome;
    return {
      status: duplicate ? 200 : 201,
      body: {
        event_id: event.id,
        seq: event.seq,
        duplicate,
        // The id a hook waits on, so it need not compute one of its own. Never a resolution:
        // nothing here decides a card, so every wait is a person's answer.
        ...(event.type === "approval.request" ? { approval_id: event.payload["approval_id"] } : {}),
        // A task that opened a lane: where it is, so a lead driving it knows where to post.
        ...(lane === undefined ? {} : { lane }),
        // A message held from the agents it named (ADR 0097).
        ...(held === undefined ? {} : { held: true, exchange: held }),
      },
    };
  }

  private waitForApproval(call: Call): Promise<Answer> {
    const requested = Number.parseInt(call.url.searchParams.get("timeout") ?? "60", 10);
    if (!Number.isFinite(requested) || requested < 0) {
      throw new HttpFailure("invalid_frame", "`timeout` is a number of seconds.");
    }
    const approvalId = call.params[0] ?? "";
    const row = this.workspace.approvals.get(approvalId);
    if (row === undefined) {
      throw new HttpFailure("not_found", "No approval with that id in this workspace.");
    }
    if (row.state === "resolved" || requested === 0) {
      return Promise.resolve({ status: 200, body: approvalJson(row) });
    }
    return new Promise<Answer>((resolve) => {
      const seconds = Math.min(requested, MAX_POLL_SECONDS);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const off = this.workspace.onAppend((event) => {
        if (event.type === "approval.resolved" && event.payload["approval_id"] === approvalId)
          finish();
      });
      const finish = (): void => {
        clearTimeout(timer);
        off();
        resolve({ status: 200, body: approvalJson(row) });
      };
      timer = setTimeout(finish, seconds * 1000);
    });
  }

  private approval(call: Call): Answer {
    const row = this.workspace.approvals.get(call.params[0] ?? "");
    if (row === undefined) {
      throw new HttpFailure("not_found", "No approval with that id in this workspace.");
    }
    return { status: 200, body: approvalJson(row) };
  }

  private newUpload(call: Call): Answer {
    const body = jsonOf(call.body);
    const filename = typeof body["filename"] === "string" ? body["filename"].trim() : "";
    if (filename === "") {
      throw new HttpFailure("invalid_event", "`filename` is what the file is called.");
    }
    const row = this.workspace.newUpload(call.principal, filename);
    return {
      status: 201,
      body: {
        attachment_id: row.attachment_id,
        upload_url: `/v1/uploads/${row.attachment_id}`,
        method: "PUT",
        expires_at: new Date(Date.now() + SIGNED_URL_MS).toISOString(),
      },
    };
  }

  private storeUpload(call: Call): Answer {
    if (call.body.byteLength === 0) {
      throw new HttpFailure("invalid_event", "Send the file's bytes as the body.");
    }
    const stored = this.workspace.storeUpload(call.principal, call.params[0] ?? "", call.body);
    if (!stored.ok) throw new HttpFailure(stored.error.code, stored.error.message);
    const { bytes: _bytes, ...described } = stored.row.stored as NonNullable<
      typeof stored.row.stored
    >;
    return {
      status: 201,
      body: {
        attachment: {
          attachment_id: stored.row.attachment_id,
          filename: stored.row.filename,
          ...described,
        },
      },
    };
  }

  /**
   * The bytes back, whole, or the run a `Range` asks for, as the real route answers it (ADR 0058):
   * `206` with `Content-Range`, `416` for a run past the end.
   */
  private attachment(call: Call): Answer {
    const row = this.workspace.uploads.get(call.params[0] ?? "");
    if (row?.stored === undefined) {
      throw new HttpFailure("not_found", "No attachment with that id in this workspace.");
    }
    const { bytes } = row.stored;
    const headers = {
      "content-type": row.stored.mime_type,
      "content-disposition": `attachment; filename="${row.filename}"`,
      "x-content-type-options": "nosniff",
      "accept-ranges": "bytes",
    };
    const header = call.headers.range;
    const range = byteRange(Array.isArray(header) ? header[0] : header, bytes.byteLength);
    const said = contentRange(range, bytes.byteLength);
    if (range.kind === "unsatisfiable") {
      return {
        ...refusalAnswer(
          new HttpFailure("invalid_event", "That range starts past the end of the file."),
        ),
        status: 416,
        headers: { "accept-ranges": "bytes", "content-range": said ?? "" },
      };
    }
    if (range.kind === "part") {
      return {
        status: 206,
        bytes: bytes.subarray(range.start, range.end + 1),
        headers: { ...headers, "content-range": said ?? "" },
      };
    }
    return { status: 200, bytes, headers };
  }

  private events(call: Call): Answer {
    const since = Number.parseInt(call.url.searchParams.get("since") ?? "0", 10);
    if (!Number.isFinite(since) || since < 0) {
      throw new HttpFailure("invalid_frame", "`since` is a sequence number, and starts at zero.");
    }
    const requested = Number.parseInt(call.url.searchParams.get("limit") ?? "", 10);
    const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 1000) : 500;
    // One space may be asked for on its own, as the real route allows: a room the harness was
    // added to, read from its beginning. Not one it is not in.
    const mine = this.workspace.memberSpacesOf(call.principal.participantId);
    const wanted = call.url.searchParams.get("space_id");
    const spaces = wanted === null ? mine : mine.filter((id) => id === wanted);
    if (wanted !== null && spaces.length === 0) {
      return { status: 200, body: { events: [], next_cursor: null } };
    }
    const harness = call.principal.kind === "harness";
    const viewer: Viewer = {
      participantId: call.principal.participantId,
      memberSpaces: new Set(spaces),
      alsoIs: harness ? new Set(this.workspace.agents.keys()) : undefined,
      seesDirectory: !harness,
      seesAgents: !harness,
    };
    const page = this.workspace.since(since, limit, viewer);
    const legacy = harness && !this.workspace.speaksAgents();
    const events = page.events
      .filter((event) => !legacy || !AGENT_EVENTS.has(event.type))
      .map((event) => this.shown(call, event.payload));
    return { status: 200, body: { events, next_cursor: page.nextCursor } };
  }

  // ---- the person's side, for the kit ----

  asOwner(event: Record<string, unknown>): StoredEvent {
    const outcome = this.workspace.submit(this.workspace.owner, event, {
      idempotencyKey: `owner-${this.ids.next("event")}`,
    });
    if (!outcome.ok)
      throw new Error(
        `Chips refused the person's ${String(event["type"])}: ${outcome.error.message}`,
      );
    return outcome.event;
  }

  /** A group room of the person's, with nobody else in it yet. */
  openRoom(title: string): string {
    const spaceId = this.ids.next("space");
    this.asOwner({ type: "space.created", space_id: spaceId, kind: "group", title });
    return spaceId;
  }

  /**
   * The person asks for a copy of one of the harness's agents in a room (ADR 0087, Fork), as
   * `POST /v1/agents/:id/fork` does: the harness hears `agent.fork`, and its copy, registered with
   * `forked_from` and the room, joins it.
   */
  askForFork(agentId: string, spaceId: string): { forkId: string; asked: boolean } {
    const done = this.workspace.forkAgent(agentId, spaceId);
    if (!done.ok) throw new Error(`Chips refused the fork: ${done.error.message}`);
    return { forkId: done.forkId, asked: done.asked };
  }

  /**
   * The person asks the harness for a new agent in a room (ADR 0108), as
   * `POST /v1/spaces/:id/agents` does: the harness hears `agent.asked`, and its new agent,
   * registered with `made_for` and the room, joins it.
   */
  askForAgent(spaceId: string, name?: string): { askId: string; name: string } {
    const done = this.workspace.askAgent(spaceId, name);
    if (!done.ok) throw new Error(`Chips refused the ask: ${done.error.message}`);
    return { askId: done.askId, name: done.name };
  }

  askForSpace(text: string): { spaceId: string; message: StoredEvent } {
    const spaceId = this.ids.next("space");
    const harness = this.workspace.harness;
    this.asOwner({
      type: "space.created",
      space_id: spaceId,
      kind: "direct",
      asked_of: harness.participantId,
    });
    // With a first name for its agent there, as a person's device proposes one (ADR 0150).
    this.asOwner({
      type: "membership.added",
      space_id: spaceId,
      participant_id: harness.participantId,
      participant_kind: "harness",
      role: "member",
      agent_name: "Milo",
    });
    return { spaceId, message: this.asOwner({ type: "message.post", space_id: spaceId, text }) };
  }

  waitFor<T>(match: (event: StoredEvent) => T | undefined, timeoutMs: number): Promise<T> {
    for (const event of this.workspace.log) {
      const found = match(event);
      if (found !== undefined) return Promise.resolve(found);
    }
    return new Promise<T>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const off = this.workspace.onAppend((event) => {
        const found = match(event);
        if (found === undefined) return;
        clearTimeout(timer);
        off();
        resolve(found);
      });
      timer = setTimeout(() => {
        off();
        reject(new Error(`nothing matched within ${timeoutMs} ms`));
      }, timeoutMs);
    });
  }
}

function headerOf(call: Call, name: string): string | undefined {
  const value = call.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export async function startFakeChips(options: FakeChipsOptions = {}): Promise<FakeChips> {
  const door = new Door(options);
  const address = await door.listen(options.port ?? 0);
  const { workspace } = door;
  return {
    address,
    workspace,
    say: async (text, spaceId, options) =>
      door.asOwner({
        type: "message.post",
        space_id: spaceId ?? address.spaceId,
        text,
        ...(options?.replyTo === undefined ? {} : { reply_to: options.replyTo }),
      }),
    decide: async (approvalId, decision, extra = {}) => {
      const row = workspace.approvals.get(approvalId);
      return door.asOwner({
        type: "approval.resolved",
        ...(row?.space_id == null ? {} : { space_id: row.space_id }),
        ...(row === undefined ? {} : { run_id: row.run_id }),
        approval_id: approvalId,
        decision,
        scope: extra.scope ?? "once",
        ...(extra.reason === undefined ? {} : { reason: extra.reason }),
        ...(extra.updatedInput === undefined ? {} : { updated_input: extra.updatedInput }),
      });
    },
    answer: async (askId, choices) => {
      const row = workspace.questions.get(askId);
      const answers = (row?.questions ?? []).map((question) => ({
        question_id: question.question_id,
        values: choices?.[question.question_id] ?? [
          question.default_value ?? question.options[0]?.value ?? "",
        ],
      }));
      return door.asOwner({
        type: "question.answered",
        ...(row?.space_id == null ? {} : { space_id: row.space_id }),
        ...(row === undefined ? {} : { run_id: row.run_id }),
        ask_id: askId,
        answers: answers.length === 0 ? [{ question_id: "q1", values: [] }] : answers,
      });
    },
    askForSpace: async (text) => door.askForSpace(text),
    openRoom: async (title) => door.openRoom(title),
    askForFork: async (agentId, spaceId) => door.askForFork(agentId, spaceId),
    askForAgent: async (spaceId, name) => door.askForAgent(spaceId, name),
    asOwner: async (event) => door.asOwner(event),
    makeJoinLink: (capabilities) => door.joins.makeLink(capabilities),
    allowJoin: (capabilities) => door.joins.allow(capabilities),
    denyJoin: () => door.joins.deny(),
    joinRequests: () => door.joins.list(),
    waitFor: (match, timeoutMs) => door.waitFor(match, timeoutMs),
    connections: () => door.connections(),
    hellos: () => door.hellos(),
    settings: door.settings,
    jobRuns: () => door.jobRuns,
    askToChange: (kind, id) => door.askToChange(kind, id),
    askToRestart: () => door.askToRestart(),
    statuses: () => door.statuses,
    heard: () => door.heard(),
    close: () => door.close(),
  };
}
