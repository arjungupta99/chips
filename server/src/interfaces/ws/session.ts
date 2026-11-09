/**
 * One WebSocket session, with no WebSocket in it.
 *
 * Everything `/v1/ws` does — negotiate a version, subscribe, replay from `since`, acknowledge a
 * write, notice a silent peer, drop a consumer that has fallen too far behind — is decided here
 * against a small `Socket` interface. The adapter in `server.ts` supplies a real `ws`.
 *
 * That split is not ceremony. The rules this file holds are the ones a reviewer most needs to
 * be able to read, and the ones a test most needs to drive without opening a port.
 */

import {
  budgetOf,
  clientFrame,
  type ErrorCode,
  isId,
  type JobSpend,
  messageIdOf,
  type NoteMember,
  negotiateProtocol,
  ONE_ROOM_REFUSALS,
  PROTOCOL_VERSION,
  type RoomContext,
  roomNoteFor,
  SERVER_TAKES,
  type ServerFrame,
  severalAsked,
  type TakerNews,
  takersOf,
  toEveryAgent,
  type Who,
  yoursWithoutAt,
} from "@chipschat/protocol";
import { exchangeFor } from "../../application/exchange.js";
import { type HarnessSight, shown, shows, sightOf } from "../../application/harness-sight.js";
import type {
  EventStore,
  FanOut,
  IdGenerator,
  MemberView,
  Principal,
  ReadModels,
  RunView,
  StoredEvent,
  SubmitEvent,
  SubmitFailure,
} from "../../application/index.js";
import { heldOf } from "../../application/index.js";
import {
  catchUpFor,
  contextFor,
  type DeliveredReply,
  replyingToFor,
} from "../../application/room-context.js";
import { QUIET_TURN_MS, roomNowFor, takerNewsFor } from "../../application/room-now.js";
import { roomSpendFor } from "../../application/room-spend.js";
import {
  canSee,
  DIRECTORY_EVENTS,
  namesViewer,
  opensFor,
  opensThreadIn,
} from "../../application/visibility.js";
import { dispositionOf, seesEveryAgent, seesWholeDirectory } from "../../domain/index.js";

/** The wire's word for a refusal. Anything not named here is `forbidden`. */
const ERROR_CODES: Partial<Record<SubmitFailure["kind"], ErrorCode>> = {
  invalid: "invalid_event",
  run_state: "invalid_event",
  missing_idempotency_key: "invalid_event",
  already_decided: "invalid_event",
  unknown_run: "not_found",
  unknown_space: "not_found",
  unknown_participant: "not_found",
  unknown_message: "not_found",
  wrong_message: "invalid_event",
  // A harness sent as itself into a room where it has several agents (ADR 0087): well formed,
  // and not sayable until it names one.
  which_agent: "invalid_event",
  // Made from a version of the room's file that is no longer current (ADR 0099).
  stale_file: "stale_file",
};

/**
 * The harnesses a message is for, as Chips decided at ingest (ADR 0081). A message logged before
 * Chips said so is for the harnesses it names (M3.3), or, naming none, for every harness in the
 * room: `undefined`.
 */
function addressedIn(event: StoredEvent): readonly string[] | undefined {
  const addressed = event.payload["addressed_to"];
  if (Array.isArray(addressed))
    return addressed.filter((id): id is string => typeof id === "string");
  const mentions = event.payload["mentions"];
  const named = Array.isArray(mentions)
    ? mentions.filter((id): id is string => isId("harness", id) || isId("agent", id))
    : [];
  return named.length > 0 ? named : undefined;
}

/** What a harness is told of a message's own words and aim, as logged. */
function heardFields(
  payload: Readonly<Record<string, unknown>>,
  type: "message.new" | "message.overheard",
): Record<string, unknown> {
  const { text, reply_to: replyTo, mentions, session_ref: sessionRef } = payload;
  const { addressed_to: addressedTo, held } = payload;
  return {
    text: typeof text === "string" ? text : "",
    ...(Array.isArray(mentions) ? { mentions } : {}),
    ...(typeof replyTo === "string" ? { reply_to: replyTo } : {}),
    // The visit the sender meant, when they named one: this harness delivers there rather than
    // choosing for them (ADR 0040).
    ...(typeof sessionRef === "string" ? { session_ref: sessionRef } : {}),
    ...(Array.isArray(addressedTo) ? { addressed_to: addressedTo } : {}),
    ...(type === "message.overheard" && held === true ? { held: true } : {}),
  };
}

/**
 * The ids a message is for, as Chips decided at ingest (ADR 0081, ADR 0087). `undefined` for a
 * message logged before Chips said who a message is for, which every harness heard.
 */
function addressedTo(event: StoredEvent): string[] | undefined {
  const addressed = event.payload["addressed_to"];
  return Array.isArray(addressed) ? (addressed as string[]) : undefined;
}

/** What a session needs from the transport underneath it. */
export interface Socket {
  readonly send: (data: string) => void;
  readonly close: (code: number, reason: string) => void;
}

export interface SessionOptions {
  readonly socket: Socket;
  readonly principal: Principal;
  readonly store: EventStore;
  readonly fanOut: FanOut;
  readonly readModels: ReadModels;
  readonly submitEvent: SubmitEvent;
  readonly ids: IdGenerator;
  readonly serverVersion: string;
  /** Decision 5: a consumer this far behind is dropped and resumes with `since`. */
  readonly maxUnackedFrames: number;
  /** Milliseconds. Injected so a heartbeat test does not have to wait. */
  readonly now: () => number;
  /**
   * The URL a harness gets for an attachment in `message.new` (decision 10): a signed grant
   * for its own token, good for ten minutes. Absent, a harness sees attachments without URLs.
   */
  readonly attachmentUrl?: (
    attachmentId: string,
    tokenId: string,
  ) => { readonly url: string; readonly expiresAt: string } | undefined;
  /**
   * Each person's IANA zone, by participant id: their newest phone's (ADR 0157). The room note
   * says their time now from it. Absent, or a person with no phone, and it says nothing.
   */
  readonly zonesOf?: (
    workspaceId: string,
    participantIds: readonly string[],
  ) => Promise<ReadonlyMap<string, string>>;
  /**
   * Whether the space's project has had a change, which is when its room shows Universe (ADR 0227):
   * the note then says where people open it. Absent, and it says nothing of a project.
   */
  readonly hasProject?: (spaceId: string) => Promise<boolean>;
  readonly onLog?: (
    level: "info" | "warn",
    message: string,
    fields?: Record<string, unknown>,
  ) => void;
}

/** Close codes. 1008 is "policy violation", which is what every one of these is. */
export const CLOSE_PROTOCOL_UNSUPPORTED = 1008;
export const CLOSE_TOO_FAR_BEHIND = 1008;
export const CLOSE_IDLE = 1001;

/**
 * The envelope of a message as a harness hears it (decision 10): numbered and dated as logged,
 * said by Chips, with the sender's key, so the receipt that follows can be matched to it.
 */
function deliveredEnvelope(event: StoredEvent, type: "message.new" | "message.overheard") {
  return {
    v: 1,
    type,
    id: event.id,
    ts: event.ts,
    workspace_id: event.workspace_id,
    ...(event.space_id === null ? {} : { space_id: event.space_id }),
    ...(event.run_id === null ? {} : { run_id: event.run_id }),
    seq: event.seq,
    actor: { kind: "system", id: "system" },
    ...(event.idempotency_key === null ? {} : { idempotency_key: event.idempotency_key }),
    message_id: messageIdOf(event.id),
  };
}

/**
 * What one turn adds to a taker's news: why what was nobody's turn is the lead's (ADR 0104); that
 * a message with no @ for the taker is its (ADR 0104 addendum), that one for every agent is in
 * every agent's hands (ADR 0249), or that a person's for several is, and who organises it (ADR
 * 0287), each said by `sender`; and that older lines were left out (ADR 0105).
 */
function turnNews(
  payload: Readonly<Record<string, unknown>>,
  taker: string,
  turn: { readonly nobodys?: TakerNews["nobodys"]; readonly cut?: TakerNews["cut"] },
  sender: { readonly saidBy: string } | undefined,
  several: ReturnType<typeof severalAsked>,
): TakerNews {
  return {
    ...(turn.nobodys === undefined ? {} : { nobodys: turn.nobodys }),
    ...(sender === undefined || !yoursWithoutAt(payload, taker) ? {} : { yours: sender }),
    ...(sender === undefined || !toEveryAgent(payload) ? {} : { toAll: sender }),
    ...(sender === undefined || several === undefined
      ? {}
      : { several: { saidBy: sender.saidBy, ...several } }),
    ...(turn.cut === undefined ? {} : { cut: turn.cut }),
  };
}

/** The application's own: the credential this socket was opened with has been withdrawn. */
export const CLOSE_TOKEN_REVOKED = 4001;
/** The application's own: the person this socket is was removed from the workspace (ADR 0160). */
export const CLOSE_PERSON_REMOVED = 4003;
/**
 * The application's own: the person this socket is has another role now (SEC-26). The socket
 * was opened with the old one, so it ends; the apps open the next on their own.
 */
export const CLOSE_ROLE_CHANGED = 4005;

/** Who somebody is, as a session remembers them: their kind and name, and a person's standing (SEC-15). */
type Known = NonNullable<ReturnType<Who>>;

export class Session {
  private negotiatedVersion: number | undefined;
  /** Server frames beyond the base set this client understands, from its `hello` (ADR 0043). */
  private accepts: ReadonlySet<string> = new Set();
  /** How much of a room a harness is handed with a message for it, from its `hello` (ADR 0088). */
  private budget = budgetOf();
  /**
   * A harness's agents, and whether it is shown them as they are or in the view it knew (ADR 0087
   * and its addendum). Read at `hello` and `subscribe`; an agent registered since is added as its
   * event goes by.
   */
  private sight: HarnessSight = { agents: new Set(), legacy: undefined };
  private unsubscribe: (() => void) | undefined;
  /** Frames sent since the last sign of life from the peer. */
  private unacked = 0;
  private lastSeenAt: number;
  private closed = false;
  /** The highest `seq` this session has been sent, so a resume knows where it got to. */
  private deliveredSeq = 0;
  /**
   * The spaces this session may see (phase-0-review finding 6), resolved at subscribe
   * time and kept current as membership events for this principal flow past. A `subscribe`
   * replaces it, so a re-subscription re-reads membership.
   */
  private memberSpaces = new Set<string>();
  /**
   * Live events that arrived while the replay was still running. Without this, an event
   * appended mid-replay would move the cursor past everything the replay had yet to send, and
   * a resuming client would silently lose the middle of its history.
   */
  private catchUp: StoredEvent[] | undefined;
  /**
   * Membership being read again after this principal was removed from a space: a space's
   * threads go with it (M5.4), and the session does not know which of its spaces those were.
   * Awaited before the next event is judged, so none of theirs slips through meanwhile.
   */
  private refreshing: Promise<string[] | undefined> | undefined;
  /**
   * The keys of the events this session submitted, so a decision delivered here that this
   * session did not make can be marked as made elsewhere (first answer wins, blueprint).
   */
  private readonly submitted = new Set<string>();
  /**
   * Deliveries, one after another. Translating a message for a harness takes a lookup, and a
   * lookup takes a tick; the queue keeps `seq` order across that tick.
   */
  private queue: Promise<void> = Promise.resolve();
  /**
   * Who somebody is, looked up for `message.new` and its context, so a busy room costs one lookup
   * per participant.
   */
  private readonly people = new Map<string, Known>();

  constructor(private readonly options: SessionOptions) {
    this.lastSeenAt = options.now();
  }

  get version(): number | undefined {
    return this.negotiatedVersion;
  }

  get isSubscribed(): boolean {
    return this.unsubscribe !== undefined;
  }

  get lastDeliveredSeq(): number {
    return this.deliveredSeq;
  }

  /**
   * The deliveries queued so far, once they have all gone. `onSubscribe` waits on the same
   * promise before it returns; a caller that appends an event and then wants to know what this
   * session was sent waits on it rather than counting ticks.
   */
  get settled(): Promise<void> {
    return this.queue;
  }

  /** Handle one inbound frame. Never throws: a bad frame is an `error` frame, not a crash. */
  async receive(raw: string): Promise<void> {
    this.lastSeenAt = this.options.now();
    this.unacked = 0;

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
        await this.onHello(frame.data);
        break;
      case "subscribe":
        await this.onSubscribe(frame.data);
        break;
      case "event":
        await this.onEvent(frame.data);
        break;
      case "ping":
        this.send({ frame: "pong", ts: frame.data.ts });
        break;
      default:
        // A `pong` is a sign of life and nothing more; the bookkeeping above already did it.
        break;
    }
  }

  private async onHello(frame: {
    protocol: { min: number; max: number };
    since?: number | undefined;
    accepts?: readonly string[] | undefined;
    context?: { lines?: number | undefined; chars?: number | undefined } | undefined;
  }): Promise<void> {
    const version = negotiateProtocol(frame.protocol, {
      min: PROTOCOL_VERSION,
      max: PROTOCOL_VERSION,
    });
    if (version === undefined) {
      this.fail(
        "protocol_unsupported",
        `This server speaks Agent Connect v${PROTOCOL_VERSION}; you asked for ${frame.protocol.min}–${frame.protocol.max}.`,
      );
      this.options.socket.close(CLOSE_PROTOCOL_UNSUPPORTED, "protocol_unsupported");
      this.closed = true;
      return;
    }
    this.negotiatedVersion = version;
    this.accepts = new Set(frame.accepts ?? []);
    this.budget = budgetOf(frame.context);

    const principal = this.options.principal;
    this.sight = await sightOf(this.options.readModels, principal);
    // Which spaces this credential is in, as it connects: a client that kept a cache drops what
    // is not here, because a membership lost while it was away is the one event a replay can
    // never bring it. Computed again on subscribe, where it scopes what is sent.
    const spaces = await this.options.readModels.spacesForMember(
      principal.workspaceId,
      principal.participantId,
    );
    // What the harness may do is a projection (ADR 0019): the handshake reports it from there. A
    // brand-new harness with no policy yet is told L1, ask first.
    const policy =
      principal.kind === "harness"
        ? await this.options.readModels.harnessPolicy(
            principal.workspaceId,
            principal.participantId,
          )
        : undefined;
    const manifest = {
      harness_id: principal.participantId,
      display_name: principal.displayName,
      owner_id: principal.ownerId ?? principal.participantId,
      ephemeral: false,
    };
    // Its agents, with their rooms, for a harness that speaks them (ADR 0087).
    const agents =
      principal.kind === "harness" && this.sight.legacy === undefined
        ? (
            await this.options.readModels.agentsOf(principal.workspaceId, principal.participantId)
          ).map((agent) => ({
            agent_id: agent.agent_id,
            key: agent.key,
            name: agent.name,
            lead: agent.lead,
            state: agent.state,
            spaces: agent.spaces,
            room: agent.room,
            held: agent.held,
          }))
        : undefined;
    // What the workspace is called now: a device keeps the name it paired under and takes this
    // one when they differ, so a rename reaches it without pairing again.
    const called = (await this.options.readModels.workspace(principal.workspaceId))?.name;
    this.send({
      frame: "event",
      event: {
        v: 1,
        type: "hello",
        id: this.options.ids.next("event"),
        ts: new Date(this.options.now()).toISOString(),
        workspace_id: principal.workspaceId,
        actor: { kind: "system", id: "system" },
        protocol: { min: PROTOCOL_VERSION, max: PROTOCOL_VERSION },
        server: { name: "chipsd", version: this.options.serverVersion, takes: [...SERVER_TAKES] },
        harnesses: [manifest],
        ...(principal.kind === "harness" ? { harness: manifest } : {}),
        ...(agents === undefined ? {} : { agents }),
        autonomy: policy?.autonomy ?? 1,
        spaces,
        ...(policy === undefined
          ? {}
          : { policy: { autonomy: policy.autonomy, rules: policy.rules } }),
        ...(policy?.budget_usd == null
          ? {}
          : { budget: { limit_usd: policy.budget_usd, spent_usd: policy.spent_usd } }),
        ...workspaceCalled(called),
      },
    });
    this.options.onLog?.("info", "hello negotiated", { version });
  }

  private async onSubscribe(frame: {
    workspace_id: string;
    space_ids?: string[] | undefined;
    since?: number | undefined;
  }): Promise<void> {
    if (this.negotiatedVersion === undefined) {
      this.fail("invalid_frame", "Say hello before you subscribe.");
      return;
    }
    if (frame.workspace_id !== this.options.principal.workspaceId) {
      this.fail("forbidden", "You may only subscribe to your own workspace.");
      return;
    }

    this.unsubscribe?.();
    const subscription = {
      workspaceId: frame.workspace_id,
      ...(frame.space_ids === undefined ? {} : { spaceIds: frame.space_ids }),
    };

    // What this credential is a member of decides what it may read (phase-0-review finding 6).
    this.sight = await sightOf(this.options.readModels, this.options.principal);
    this.memberSpaces = new Set(
      await this.options.readModels.spacesForMember(
        frame.workspace_id,
        this.options.principal.participantId,
      ),
    );

    // Subscribe first, then replay, then flush what arrived in between. Subscribing after the
    // replay would drop anything appended during it; delivering live frames during the replay
    // would move the cursor past history that had not been sent yet. Both go through
    // `deliver`, whose cursor only moves forward, so nothing is ever sent twice.
    const since = frame.since ?? (await this.options.store.head(frame.workspace_id));
    this.deliveredSeq = since;
    this.catchUp = [];
    this.unsubscribe = this.options.fanOut.subscribe(subscription, (event) => {
      if (this.catchUp === undefined) this.enqueue(event);
      else this.catchUp.push(event);
    });

    await this.replayFrom(frame.workspace_id, since);

    const buffered = this.catchUp ?? [];
    for (const event of [...buffered].sort((a, b) => a.seq - b.seq)) this.enqueue(event);
    this.catchUp = undefined;
    await this.queue;
  }

  private async replayFrom(workspaceId: string, since: number): Promise<void> {
    let cursor = since;
    const scope = {
      spaces: [...this.memberSpaces],
      participantId: this.options.principal.participantId,
      alsoIs: [...this.sight.agents],
      seesDirectory: this.seesDirectory(),
      seesAgents: this.seesAgents(),
    };
    const paged = this.accepts.has("events");
    for (;;) {
      const page = await this.options.store.since(workspaceId, cursor, 500, scope);
      if (paged) await this.deliverPage(page.events);
      else for (const event of page.events) await this.deliver(event);
      if (page.nextCursor === null) return;
      cursor = page.nextCursor;
      if (this.closed) return;
    }
  }

  /**
   * One store page as one frame, for a client that said it takes them (ADR 0043). Every event
   * goes through the same checks a single delivery makes and moves the cursor the same way; all
   * that changes is how many frames carry them. A page with nothing for this viewer in it sends
   * no frame at all — the cursor has still moved.
   */
  private async deliverPage(events: readonly StoredEvent[]): Promise<void> {
    const page: Record<string, unknown>[] = [];
    for (const event of events) {
      const payload = await this.prepare(event);
      if (payload !== undefined) page.push(payload);
      if (this.closed) return;
    }
    if (page.length > 0) this.send({ frame: "events", events: page });
  }

  /** A live event takes its place in line behind the ones before it. */
  private enqueue(event: StoredEvent): void {
    this.queue = this.queue
      .then(() => this.deliver(event))
      .catch((error: unknown) => {
        this.options.onLog?.("warn", "delivery failed", { seq: event.seq, error: String(error) });
      });
  }

  private async onEvent(frame: { event: Record<string, unknown> }): Promise<void> {
    if (this.negotiatedVersion === undefined) {
      this.fail("invalid_frame", "Say hello before you send an event.");
      return;
    }

    const key = frame.event["idempotency_key"];
    if (typeof key !== "string" || key.length === 0) {
      this.fail("invalid_frame", "Every event you send carries an idempotency key.");
      return;
    }

    // Noted before the append: the store delivers to this session inside it, and the delivery
    // must already know this decision is ours.
    this.submitted.add(key);
    const result = await this.options.submitEvent({
      event: frame.event,
      principal: await this.asTheyStand(),
    });

    if (!result.ok) {
      this.submitted.delete(key);
      const { error } = result;
      this.send({
        frame: "error",
        code: ERROR_CODES[error.kind] ?? "forbidden",
        message: error.message,
        idempotency_key: key,
        // Which rule, and where the agent is, for a client that offers to move it (ADR 0087).
        ...(ONE_ROOM_REFUSALS.has(error.kind) ? { refusal: error.kind } : {}),
        ...("space_id" in error && typeof error.space_id === "string"
          ? { space_id: error.space_id }
          : {}),
      });
      return;
    }

    this.send({
      frame: "ack",
      idempotency_key: key,
      seq: result.value.event.seq,
      duplicate: result.value.duplicate,
      // A task that opened a lane says where it is, so a lead driving it knows where to post.
      ...(result.value.lane === undefined ? {} : { lane: result.value.lane }),
      // A message held from the agents it named (ADR 0097), so the sender can say so.
      ...heldOf(result.value.held),
    });
    await this.receiptToSender(result.value.event, key);
  }

  /**
   * What this session is sent for an event: the payload as logged, with two exceptions.
   * A decision reaches every surface; on the ones that did not make it, it is marked as made
   * elsewhere, so a card there says so rather than looking like this device decided. And a
   * harness hears what others said as `message.new` — who said it, and its attachments as URLs
   * it can fetch — because that is the event the protocol gives it (decision 10); or, when the
   * message is for other harnesses, as `message.overheard`, which starts no turn (ADR 0081).
   * Delivery time, not the log: the log records each event once, as it happened.
   */
  private async asDelivered(event: StoredEvent): Promise<Readonly<Record<string, unknown>>> {
    return shown(await this.asItIs(event), this.sight);
  }

  /** What this session is sent for an event, before a harness's view of agents is put on it. */
  private async asItIs(event: StoredEvent): Promise<Readonly<Record<string, unknown>>> {
    const me = this.options.principal;
    if (event.type === "approval.resolved" && me.kind === "person") {
      const mine = event.idempotency_key !== null && this.submitted.has(event.idempotency_key);
      return mine ? event.payload : { ...event.payload, resolved_elsewhere: true };
    }
    if (me.kind === "harness") return this.asAHarnessHearsIt(event);
    return event.payload;
  }

  /** What a harness is sent that a person is not: its words, its catch-up, its lanes' files. */
  private async asAHarnessHearsIt(event: StoredEvent): Promise<Readonly<Record<string, unknown>>> {
    if (event.type === "message.post") return this.asHeard(event);
    // A held message handed to one of its agents once a person acted (ADR 0097).
    if (event.type === "message.handed") return this.asHanded(event);
    // One of its agents put in a room: with the room's last lines before it joined (ADR 0088).
    if (event.type === "agent.attached") return this.withCatchUp(event);
    // A lane's answer comes back to its lead with the files it carried, and a lead can only
    // fetch what it has a URL for: the same signing a message's attachments get.
    if (event.type === "lane.updated") {
      const files = this.signedFiles(event.payload);
      return files === undefined ? event.payload : { ...event.payload, attachments: files };
    }
    return event.payload;
  }

  /** A payload's attachments, each with a URL this session may fetch it at, or nothing. */
  private signedFiles(
    payload: Readonly<Record<string, unknown>>,
  ): Record<string, unknown>[] | undefined {
    const files = payload["attachments"];
    if (!Array.isArray(files)) return undefined;
    return (files as Record<string, unknown>[])
      .filter((attachment) => typeof attachment["attachment_id"] === "string")
      .map((attachment) => this.signed(attachment));
  }

  /**
   * A message as a harness hears it: another's as `message.new` when it is for this harness and
   * `message.overheard` when not, one shape either way; its own as it said it, unless one of its
   * agents said it to another of them, which is that one's `message.new` (ADR 0101).
   */
  private async asHeard(
    event: StoredEvent,
    nobodys?: TakerNews["nobodys"],
    spendAt?: number,
  ): Promise<Readonly<Record<string, unknown>>> {
    const own = this.selves().has(event.actor.id);
    const addressed = addressedTo(event);
    const takers = await this.takersFor(event, own);
    const working = await this.workingTurnsOf(event, takers);
    // A harness that has not declared agents knows them all as itself: nothing of its own is a turn.
    if (own && (takers.length === 0 || this.sight.legacy !== undefined)) {
      return working.length === 0 ? event.payload : await this.ownHeard(event, working);
    }
    const type = addressed === undefined || takers.length > 0 ? "message.new" : "message.overheard";
    const attachments = this.signedFiles(event.payload);
    const turn =
      type === "message.new" ? await this.withTheTurn(event, takers, nobodys, spendAt) : {};
    const replying = await this.replyingOf(event, turn.context);
    return {
      ...deliveredEnvelope(event, type),
      from: await this.senderOf(event),
      ...(attachments === undefined || attachments.length === 0 ? {} : { attachments }),
      ...heardFields(event.payload, type),
      ...replying,
      for: type === "message.new" ? takers : [],
      ...(working.length === 0 ? {} : { working_turns: working }),
      ...turn,
    };
  }

  /**
   * The message a reply answers (ADR 0219), as the room reads it now, as `replying_to`: with a
   * turn, the lines said before it too when it is older than the context the turn was handed;
   * overheard, the quote alone. Nothing for a message that answers none.
   */
  private async replyingOf(
    event: StoredEvent,
    handed: RoomContext | undefined,
  ): Promise<{ replying_to?: DeliveredReply }> {
    const replyTo = event.payload["reply_to"];
    if (typeof replyTo !== "string" || event.space_id === null) return {};
    const replying = await replyingToFor({
      readModels: this.options.readModels,
      workspaceId: this.options.principal.workspaceId,
      spaceId: event.space_id,
      replyTo,
      handed,
      lookup: (id) => this.who(id),
      sign: (id) => this.grant(id),
    });
    return replying === undefined ? {} : { replying_to: replying };
  }

  /**
   * This connection's agents with a turn going in the room, other than the one who said the words
   * and those they are for (ADR 0106), whose turns hear them at their next step. A turn nothing
   * has been heard from for ten minutes is not working, as in the room note.
   */
  private async workingTurnsOf(
    event: StoredEvent,
    takers: readonly string[],
  ): Promise<{ agent_id: string; run_id: string }[]> {
    if (event.space_id === null || this.sight.legacy !== undefined) return [];
    const skip = new Set([event.actor.id, ...takers]);
    const mine = [...this.sight.agents].filter((id) => !skip.has(id));
    if (mine.length === 0) return [];
    const { readModels, principal } = this.options;
    const going = await readModels.turnsGoing(principal.workspaceId, event.space_id, mine);
    const nowMs = this.options.now();
    return going
      .filter((turn) => nowMs - Date.parse(turn.last_heard_at) < QUIET_TURN_MS)
      .map((turn) => ({ agent_id: turn.agent_id, run_id: turn.run_id }));
  }

  /**
   * A harness's own words, as it said them, when others of its agents are working in the room
   * (ADR 0106): with the message's id, who said them, its files as URLs, and the turns that are to
   * hear them.
   */
  private async ownHeard(
    event: StoredEvent,
    working: readonly { agent_id: string; run_id: string }[],
  ): Promise<Readonly<Record<string, unknown>>> {
    const attachments = this.signedFiles(event.payload);
    return {
      ...event.payload,
      message_id: messageIdOf(event.id),
      from: await this.senderOf(event),
      ...(attachments === undefined || attachments.length === 0 ? {} : { attachments }),
      working_turns: working,
    };
  }

  /**
   * Who of this connection takes a turn on a message (ADR 0087): those it is for, the harness
   * itself among them where it is the member addressed, or, on a message from before Chips said,
   * every one of its own in the room; never the one who said it (ADR 0101). Nobody: it is
   * overheard, or its own words.
   */
  private async takersFor(event: StoredEvent, own: boolean): Promise<string[]> {
    const addressed = addressedTo(event);
    const ownInRoom = addressed === undefined && !own ? await this.ownIn(event) : [];
    return takersOf(addressed, this.selves(), ownInRoom, event.actor.id);
  }

  /**
   * A message Chips held, handed to one of this harness's agents now a person has acted (ADR
   * 0097): that message as `message.new` for it, with `handed`, what was said since and who is
   * here as of when it was said, and no facts of the talk, which started again. The job's spend
   * is as of the hand-over (ADR 0118): letting the agents carry on began a new job, and words
   * held at the ceiling were otherwise handed over saying Chips still held the agents (5 October
   * 2026). Numbered as the hand-over, so no harness's place in the log goes back; `message_id`
   * is the message's own.
   */
  private async asHanded(event: StoredEvent): Promise<Readonly<Record<string, unknown>>> {
    const agentId = event.payload["agent_id"];
    const messageId = event.payload["message_id"];
    if (typeof agentId !== "string" || !this.selves().has(agentId)) return event.payload;
    if (typeof messageId !== "string") return event.payload;
    const { readModels, store, principal } = this.options;
    const message = await readModels.message(principal.workspaceId, messageId);
    if (message === undefined || message.seq === null) return event.payload;
    const original = (await store.since(principal.workspaceId, message.seq - 1, 1)).events[0];
    if (original?.type !== "message.post" || original.seq !== message.seq) return event.payload;
    // What was nobody's turn, handed to the room's lead once the room went still (ADR 0104): its
    // note says who said it, and which person to tell when the work is done or stuck.
    const toLead = event.payload["lead"] === true;
    const nobodys = toLead ? await this.nobodysOf(original) : undefined;
    const delivered = await this.asHeard(
      { ...original, payload: { ...original.payload, addressed_to: [agentId] } },
      nobodys,
      event.seq,
    );
    // Handed later, so no turn going now is to hear it as said (ADR 0106).
    const { exchange: _talk, working_turns: _working, ...words } = delivered;
    return {
      ...words,
      id: event.id,
      seq: event.seq,
      handed: true,
      ...(toLead ? { lead: true } : {}),
    };
  }

  /**
   * Who said what was nobody's turn, and the person the lead tells when the work is done or stuck:
   * the last one to speak in the room, else its first person (ADR 0104).
   */
  private async nobodysOf(original: StoredEvent): Promise<NonNullable<TakerNews["nobodys"]>> {
    const saidBy = (await this.who(original.actor.id))?.name ?? "An agent";
    if (original.space_id === null) return { saidBy };
    const { readModels, principal } = this.options;
    const spoke = await readModels.lastPost(principal.workspaceId, original.space_id, {
      byPerson: true,
    });
    const person =
      spoke?.author_id ??
      (await readModels.membersOf(principal.workspaceId, original.space_id)).find(
        (member) => member.kind === "person" && member.removed !== true,
      )?.participant_id;
    const tell = person === undefined ? undefined : (await this.who(person))?.name;
    return { saidBy, ...(tell === undefined ? {} : { tell }) };
  }

  /** `agent.attached` for one of this harness's own agents, with the room's last lines. */
  private async withCatchUp(event: StoredEvent): Promise<Readonly<Record<string, unknown>>> {
    const agentId = String(event.payload["agent_id"]);
    const spaceId = event.payload["space_id"];
    if (!this.sight.agents.has(agentId) || typeof spaceId !== "string") return event.payload;
    const catchUp = await catchUpFor({
      readModels: this.options.readModels,
      workspaceId: this.options.principal.workspaceId,
      spaceId,
      seq: event.seq,
      budget: this.budget,
      lookup: (id) => this.who(id),
      sign: (id) => this.grant(id),
    });
    return catchUp === undefined ? event.payload : { ...event.payload, catch_up: catchUp };
  }

  /**
   * What was said since those who take the turn, or the harness before them, last spoke there:
   * with a message for them and never with one they overhear, which is itself the context (ADR
   * 0088). One context for all of them, from the one that has heard least.
   */
  private async contextOf(event: StoredEvent, takers: readonly string[]) {
    if (event.space_id === null) return undefined;
    const me = this.options.principal;
    return await contextFor({
      readModels: this.options.readModels,
      workspaceId: me.workspaceId,
      spaceId: event.space_id,
      participantIds: takers.length > 0 ? takers : [me.participantId],
      seq: event.seq,
      budget: this.budget,
      lookup: (id) => this.who(id),
      sign: (id) => this.grant(id),
    });
  }

  /**
   * What comes with a turn, and never with a message overheard: what was said since, who is in
   * the room (ADR 0088, ADR 0092), and, once the agents' talk is worth a word, how it stands
   * (ADR 0097).
   */
  private async withTheTurn(
    event: StoredEvent,
    takers: readonly string[],
    nobodys?: TakerNews["nobodys"],
    spendAt: number = event.seq,
  ) {
    const said = await this.contextOf(event, takers);
    const files = (said?.files?.length ?? 0) > 0;
    // Older lines left out to fit the budget are said in the note (ADR 0105).
    const cut = said?.truncated === true ? { shown: said.lines.length } : undefined;
    // What the job has spent, as of the message — or of its hand-over, for words Chips held: in
    // numbers with what was said, in words in the note (ADR 0117).
    const spend =
      event.space_id === null
        ? undefined
        : await roomSpendFor({
            readModels: this.options.readModels,
            workspaceId: this.options.principal.workspaceId,
            spaceId: event.space_id,
            uptoSeq: spendAt,
          });
    const context = said === undefined || spend === undefined ? said : { ...said, spend };
    const room = await this.roomOf(event, takers, {
      files,
      ...(nobodys === undefined ? {} : { nobodys }),
      ...(cut === undefined ? {} : { cut }),
      ...(spend === undefined ? {} : { spend }),
    });
    const exchange = await exchangeFor({
      readModels: this.options.readModels,
      lookup: (id) => this.who(id),
      event,
      takers,
    });
    return {
      ...(context === undefined ? {} : { context }),
      ...(room === undefined ? {} : { room }),
      ...(exchange === undefined ? {} : { exchange }),
    };
  }

  /**
   * Who is in the room, with the handle that reaches each, and the note for each who takes the turn
   * (ADR 0092): with a message for them and never with one they overhear, which gives no turn. A
   * harness in the room in its own right, as in a room asked of it it has not claimed, is listed
   * as an agent, which is what it is to the others there. An agent is listed with the name of the
   * harness it runs on (ADR 0101).
   *
   * With who leads the room, which of its agents have a turn going, and what is news to each who
   * takes this one (ADR 0104); on what was nobody's turn handed to the lead, why it is its; what
   * the room's job has spent (ADR 0117); and each person's time now, from their phone's zone
   * (ADR 0157).
   */
  private async roomOf(
    event: StoredEvent,
    takers: readonly string[],
    turn: {
      readonly files: boolean;
      readonly nobodys?: TakerNews["nobodys"];
      readonly cut?: TakerNews["cut"];
      readonly spend?: JobSpend;
    },
  ) {
    if (event.space_id === null) return undefined;
    const { readModels, principal } = this.options;
    const workspaceId = principal.workspaceId;
    const spaceId = event.space_id;
    const members = (await readModels.membersOf(workspaceId, spaceId)).filter(
      (member) => member.removed !== true,
    );
    const lead = await readModels.leadOf(workspaceId, spaceId);
    const people = members
      .filter((member) => member.kind === "person")
      .map((member) => member.participant_id);
    const zones = (await this.options.zonesOf?.(workspaceId, people)) ?? new Map<string, string>();
    const here = await Promise.all(
      members.map(async (member) => {
        const harness = await this.harnessNameOf(member);
        const timeZone = zones.get(member.participant_id);
        return {
          id: member.participant_id,
          kind: member.kind === "person" ? ("person" as const) : ("agent" as const),
          name: member.held_name ?? member.display_name,
          ...(harness === undefined ? {} : { harness }),
          ...(member.participant_id === lead ? { lead: true } : {}),
          ...(timeZone === undefined ? {} : { timeZone }),
        };
      }),
    );
    const who = takers.length > 0 ? takers : [principal.participantId];
    const agents = here.filter((member) => member.kind === "agent").map((member) => member.id);
    const nowMs = this.options.now();
    // Who is working says something only where there is somebody else to say it of.
    const now =
      agents.length < 2
        ? undefined
        : await roomNowFor({ readModels, workspaceId, spaceId, agents, nowMs });
    const news = await takerNewsFor({
      readModels,
      workspaceId,
      spaceId,
      takers: who,
      seq: event.seq,
      nowMs,
      members: new Set(here.map((member) => member.id)),
      files: turn.files,
      lookup: (id) => this.who(id),
    });
    // A harness asked in a room its agent has since claimed is that agent now (ADR 0087).
    const claimed = new Map(
      members.flatMap((member) =>
        member.kind === "agent" && typeof member.harness_id === "string"
          ? [[member.harness_id, member.participant_id] as const]
          : [],
      ),
    );
    const several =
      event.actor.kind === "person" && turn.nobodys === undefined
        ? severalAsked(event.payload, here, (id) => claimed.get(id) ?? id)
        : undefined;
    await this.withTurnNews(news, event, who, here, turn, several);
    const project = (await this.options.hasProject?.(spaceId)) === true;
    return roomNoteFor(here, who, now, news, turn.spend, new Date(nowMs).toISOString(), project);
  }

  /**
   * What this turn adds to each taker's news: on what was nobody's turn, why it is the lead's
   * (ADR 0104); otherwise, on a message for a taker with no @ for it, that it is theirs (ADR 0104
   * addendum), on one for every agent, that each has it (ADR 0249), and on a person's for several,
   * that each has it and who organises it (ADR 0287); and that older lines were left out (ADR 0105).
   */
  private async withTurnNews(
    news: Record<string, TakerNews>,
    event: StoredEvent,
    who: readonly string[],
    here: readonly NoteMember[],
    turn: { readonly nobodys?: TakerNews["nobodys"]; readonly cut?: TakerNews["cut"] },
    several: ReturnType<typeof severalAsked>,
  ): Promise<void> {
    const sender =
      turn.nobodys === undefined
        ? await this.namedSender(event, who, here, several !== undefined)
        : undefined;
    for (const taker of who) {
      news[taker] = { ...news[taker], ...turnNews(event.payload, taker, turn, sender, several) };
    }
  }

  /**
   * Who sent a message, by the name the room knows them by, when the note names them: one for a
   * taker with no @ for it (ADR 0104 addendum), one for every agent (ADR 0249), or a person's for
   * several (ADR 0287). Nothing for one that @-mentions the one taker it is for.
   */
  private async namedSender(
    event: StoredEvent,
    takers: readonly string[],
    here: readonly { readonly id: string; readonly name: string }[],
    several: boolean,
  ): Promise<{ readonly saidBy: string } | undefined> {
    const named =
      several ||
      toEveryAgent(event.payload) ||
      takers.some((taker) => yoursWithoutAt(event.payload, taker));
    if (!named) return undefined;
    const name =
      here.find((member) => member.id === event.actor.id)?.name ??
      (await this.who(event.actor.id))?.name;
    return { saidBy: name ?? "Someone" };
  }

  /** The ids this connection answers to: the harness, and its agents (ADR 0087). */
  private selves(): Set<string> {
    return new Set([this.options.principal.participantId, ...this.sight.agents]);
  }

  /**
   * This connection's own in the room an event is in: its agents there, or the harness itself in
   * a room it is in itself.
   */
  private async ownIn(event: StoredEvent): Promise<string[]> {
    if (event.space_id === null) return [];
    const { readModels, principal } = this.options;
    const members = await readModels.membersOf(principal.workspaceId, event.space_id);
    const here = members.map((member) => member.participant_id);
    const agents = here.filter((id) => this.sight.agents.has(id));
    if (agents.length > 0) return agents;
    return here.includes(principal.participantId) ? [principal.participantId] : [];
  }

  /** Who somebody is now, looked up once per session: their kind and name. */
  /**
   * The harness a member of a room runs on, as its note says it: an agent's harness, and a harness
   * waiting in a room asked of it its own, since the note calls it by the first name the room holds
   * for its agent (ADR 0150): "Boris (Jacobian agent, @Boris)".
   */
  private async harnessNameOf(member: MemberView): Promise<string | undefined> {
    if (member.held_name !== undefined) return member.display_name;
    if (member.kind !== "agent" || typeof member.harness_id !== "string") return undefined;
    return (await this.who(member.harness_id))?.name;
  }

  private async who(participantId: string): Promise<Known | undefined> {
    const known = this.people.get(participantId);
    if (known !== undefined) return known;
    const { readModels, principal } = this.options;
    const found = await readModels.participant(principal.workspaceId, participantId);
    if (found === undefined) return undefined;
    // A person's standing in the workspace rides with their name (SEC-15): a guest's words are
    // handed to a model as a guest's. Forgotten with the name when either changes (`noteChange`).
    const workspaceRole =
      found.kind === "person"
        ? await readModels.workspaceRole(principal.workspaceId, participantId)
        : undefined;
    const person: Known = {
      kind: found.kind,
      name: found.display_name,
      ...(workspaceRole === undefined ? {} : { workspace_role: workspaceRole }),
    };
    this.people.set(participantId, person);
    return person;
  }

  /**
   * Who said it: their name and, for a person, their standing in the workspace (SEC-15), looked up
   * once per session, and their role in the room.
   */
  private async senderOf(event: StoredEvent): Promise<Record<string, unknown>> {
    const me = this.options.principal;
    const { readModels } = this.options;
    const sender = event.actor.id;
    const known = await this.who(sender);
    const role =
      event.space_id === null
        ? undefined
        : await readModels.memberRole(me.workspaceId, event.space_id, sender);
    const kind = event.actor.kind;
    return {
      participant_id: sender,
      kind: kind === "agent" || kind === "harness" ? kind : "person",
      display_name: known?.name ?? sender,
      ...(role === undefined ? {} : { role }),
      ...(known?.workspace_role === undefined ? {} : { workspace_role: known.workspace_role }),
    };
  }

  /** An attachment with the URL this harness may fetch it at, when the gateway signs them. */
  private signed(attachment: Record<string, unknown>): Record<string, unknown> {
    const grant = this.grant(String(attachment["attachment_id"]));
    return grant === undefined
      ? attachment
      : { ...attachment, url: grant.url, url_expires_at: grant.expiresAt };
  }

  /** The URL this harness may fetch an attachment at, for its own token, when the gateway signs. */
  private grant(attachmentId: string) {
    const me = this.options.principal;
    return me.tokenId === undefined
      ? undefined
      : this.options.attachmentUrl?.(attachmentId, me.tokenId);
  }

  /**
   * A person's message into a space with a live run gets a receipt after its ack,
   * saying what Chips did with it: queued for the harness's next look, or steered (blueprint).
   * A steer names its run, which the door has already checked is alive. A message that
   * mentions a harness is that harness's, so it is its run that has to be going (M3.3).
   */
  private async receiptToSender(event: StoredEvent, key: string): Promise<void> {
    if (this.options.principal.kind !== "person") return;
    const disposition = dispositionOf({ type: event.type, mode: event.payload["mode"] });
    if (disposition === undefined) return;
    if (event.run_id === null) {
      if (event.space_id === null) return;
      if ((await this.liveRunFor(event, event.space_id)) === undefined) return;
    }
    this.send({ frame: "receipt", idempotency_key: key, disposition });
  }

  /**
   * The run a person's message lands in: the run of a harness it is for, else, for a message
   * from before Chips said who one is for, whichever is going (ADR 0081).
   */
  private async liveRunFor(event: StoredEvent, spaceId: string): Promise<RunView | undefined> {
    const { readModels, principal } = this.options;
    const named = addressedIn(event);
    if (named === undefined) return readModels.liveRun(principal.workspaceId, spaceId);
    for (const harnessId of named) {
      const run = await readModels.liveRun(principal.workspaceId, spaceId, harnessId);
      if (run !== undefined) return run;
    }
    return undefined;
  }

  /**
   * The harness whose run a person's message landed in gets the same receipt, beside the event,
   * so it knows whether to look now or after the step (technical-plan M1.3: the harness gets
   * `receipt` frames). Answered after the lookup, so it may follow a later event; the key
   * says which message it is about. A message for other harnesses and not this one is not this
   * one's, whatever run it has going, and one it overheard gets no receipt (ADR 0081).
   */
  private async receiptToHarness(event: StoredEvent): Promise<void> {
    const me = this.options.principal;
    if (me.kind !== "harness" || event.actor.kind !== "person" || event.idempotency_key === null) {
      return;
    }
    const disposition = dispositionOf({ type: event.type, mode: event.payload["mode"] });
    if (disposition === undefined) return;
    const named = addressedIn(event);
    const selves = this.selves();
    if (named !== undefined && !named.some((id) => selves.has(id))) return;
    const { readModels } = this.options;
    const run =
      event.run_id !== null
        ? await readModels.run(me.workspaceId, event.run_id)
        : event.space_id !== null
          ? await readModels.liveRun(me.workspaceId, event.space_id, me.participantId)
          : undefined;
    if (run === undefined || run.harness_id !== me.participantId) return;
    this.send({ frame: "receipt", idempotency_key: event.idempotency_key, disposition });
  }

  /**
   * Send one event to this subscriber, in `seq` order and at most once. Fan-out and replay both
   * come through here, which is what makes "exactly the missed events, once" true when a client
   * resumes while new events are still arriving.
   */
  private async deliver(event: StoredEvent): Promise<void> {
    const payload = await this.prepare(event);
    if (payload === undefined || this.closed) return;
    this.send({ frame: "event", event: payload });
    await this.receiptToHarness(event);
  }

  /**
   * Everything a delivery does but the sending: the cursor, the membership it teaches, whether
   * this viewer may see it, and the shape it goes out in. Nothing when there is nothing to
   * send — the cursor has moved regardless, so the next event this session does see never looks
   * like a gap.
   */
  private async prepare(event: StoredEvent): Promise<Record<string, unknown> | undefined> {
    if (this.closed) return undefined;
    if (event.seq <= this.deliveredSeq) return undefined;
    this.noteChange(event);
    if (this.refreshing !== undefined) {
      const spaces = await this.refreshing;
      this.refreshing = undefined;
      if (spaces !== undefined) this.memberSpaces = new Set(spaces);
    }

    this.noteAgent(event);
    const viewer = {
      participantId: this.options.principal.participantId,
      memberSpaces: this.memberSpaces,
      alsoIs: this.sight.agents,
      seesDirectory: this.seesDirectory(),
      seesAgents: this.seesAgents(),
    };
    if (!canSee(event, viewer) && !(await this.knowsAgent(event))) {
      // Not for this viewer, but it still advances the cursor: the next event this session does
      // see must not look like a gap when it resumes.
      this.deliveredSeq = event.seq;
      return undefined;
    }

    this.noteMembership(event, viewer.participantId);

    this.deliveredSeq = event.seq;
    // What a harness that has not learnt agents has no words for (ADR 0087's addendum).
    if (!shows(event.type, this.sight)) return undefined;
    // Awaited only for feedback: the cursor has moved, and every other event keeps the path
    // it had, tick for tick.
    if (event.type === "feedback" && !(await this.meantFor(event))) return undefined;
    return await this.asDelivered(event);
  }

  /** Whether this viewer is told who every person is: a person who is not a guest (ADR 0034). */
  private seesDirectory(): boolean {
    const me = this.options.principal;
    return me.kind === "person" && seesWholeDirectory(me.role);
  }

  /** Whether this viewer is told every agent: an owner or admin (ADR 0034's addendum). */
  private seesAgents(): boolean {
    const me = this.options.principal;
    return me.kind === "person" && seesEveryAgent(me.role);
  }

  /**
   * An agent made or changed, for a viewer the rule did not let it through to: a member, a guest,
   * or another harness. They are told when the agent is in a room of theirs, since its name there
   * is theirs to read (agents review, finding 3), and a person when they own its harness (ADR
   * 0034's addendum). Asked only for those events.
   */
  private async knowsAgent(event: StoredEvent): Promise<boolean> {
    if (!DIRECTORY_EVENTS.has(event.type)) return false;
    const agentId = event.payload["agent_id"];
    if (typeof agentId !== "string") return false;
    const { readModels, principal } = this.options;
    const room = await readModels.agentRoom(principal.workspaceId, agentId);
    if (room !== undefined && this.memberSpaces.has(room)) return true;
    if (principal.kind !== "person") return false;
    const agent = await readModels.participant(principal.workspaceId, agentId);
    return agent?.owner_id === principal.participantId;
  }

  /**
   * Feedback reaches the harness whose message it is, and every person in the room: a second
   * harness in the room has no use for a reaction to somebody else's words, and would have to
   * work out that it was not its own (M3.4). The one per-recipient rule in delivery; membership,
   * above, is per space.
   */
  private async meantFor(event: StoredEvent): Promise<boolean> {
    const me = this.options.principal;
    if (me.kind !== "harness") return true;
    const about = await this.options.readModels.message(
      me.workspaceId,
      String(event.payload["message_id"]),
    );
    return about !== undefined && this.selves().has(about.author_id);
  }

  /**
   * What an event changes of what this session remembers. A name changed, a person's (ADR 0082)
   * or an agent's (agents review, finding 23): the next message from them is sent under the new
   * one. And a room erased is no longer one of this session's (finding 11): what follows that
   * names it, the release of its agents, is their harness's to hear and not the room's.
   */
  private noteChange(event: StoredEvent): void {
    if (event.type === "person.renamed" || event.type === "role.changed") {
      this.people.delete(String(event.payload["participant_id"]));
    } else if (event.type === "agent.updated" && typeof event.payload["name"] === "string") {
      this.people.delete(String(event.payload["agent_id"]));
    } else if (event.type === "space.erased" && Array.isArray(event.payload["erased"])) {
      for (const spaceId of event.payload["erased"]) this.memberSpaces.delete(String(spaceId));
    }
  }

  /** An agent this harness registered while connected is one of its own from then on. */
  private noteAgent(event: StoredEvent): void {
    const me = this.options.principal;
    if (event.type !== "agent.registered" || me.kind !== "harness") return;
    if (event.payload["harness_id"] === me.participantId) {
      this.sight.agents.add(String(event.payload["agent_id"]));
    }
  }

  /**
   * Seeing the event that adds you to a space — or opens one, since its creator is its
   * first member, or opens a thread in one of yours (M5.4) — is what makes its later events
   * visible; being removed ends that, for the space and for its threads, which is why a
   * removal reads the membership again rather than forgetting one id.
   */
  private noteMembership(event: StoredEvent, viewerId: string): void {
    const space = event.space_id;
    if (space === null) return;
    // A harness is named by its agents too (ADR 0087): one added, or taking its place, is it.
    const named = [...this.selves()].some((id) => namesViewer(event, id));
    const joins =
      ((event.type === "membership.added" || event.type === "membership.replaced") && named) ||
      opensFor(event, viewerId) ||
      opensThreadIn(event, this.memberSpaces);
    if (joins) this.memberSpaces.add(space);
    else if (event.type === "membership.removed" && named) {
      this.memberSpaces.delete(space);
      // Never left to reject on its own: a session closing before the next delivery would
      // otherwise surface it as an unhandled rejection. On a failure the set stays as it is —
      // the space gone, its threads until the next subscribe — and the log says so.
      this.refreshing = this.options.readModels
        .spacesForMember(event.workspace_id, viewerId)
        .catch((error: unknown) => {
          this.options.onLog?.("warn", "membership could not be read again", {
            error: String(error),
          });
          return undefined;
        });
    }
  }

  /**
   * A frame of an extension, sent only to a client that named it in its `hello` (ADR 0043): one
   * that did not would drop it in silence, and it would count against the unacknowledged.
   */
  offer(extension: string, frame: ServerFrame): void {
    if (this.accepts.has(extension)) this.send(frame);
  }

  /** Whether the client named an extension in its `hello`, so an offer of it would be sent. */
  hears(extension: string): boolean {
    return !this.closed && this.accepts.has(extension);
  }

  /**
   * Who is sending, with their role in the workspace as it is now. A socket's principal was read
   * when its ticket was, and a person made a member since must not keep an admin's say for as
   * long as the socket stays open (JR-9). One read per event a person sends; a harness has none.
   */
  private async asTheyStand(): Promise<Principal> {
    const me = this.options.principal;
    if (me.kind !== "person") return me;
    const role = await this.options.readModels.workspaceRole(me.workspaceId, me.participantId);
    return role === me.role ? me : { ...me, role };
  }

  private send(frame: ServerFrame | Record<string, unknown>): void {
    if (this.closed) return;

    this.unacked += 1;
    if (this.unacked > this.options.maxUnackedFrames) {
      // Decision 5: a consumer more than this far behind is disconnected and resumes with
      // `since`. Buffering for it instead would let one slow reader hold the server's memory.
      this.options.onLog?.("warn", "consumer too far behind", { unacked: this.unacked });
      this.options.socket.send(
        JSON.stringify({
          frame: "error",
          code: "too_far_behind",
          message: `You are more than ${this.options.maxUnackedFrames} frames behind. Reconnect and resume with \`since\`.`,
        }),
      );
      this.close(CLOSE_TOO_FAR_BEHIND, "too_far_behind");
      return;
    }

    this.options.socket.send(JSON.stringify(frame));
  }

  private fail(code: ErrorCode, message: string): void {
    this.send({ frame: "error", code, message });
  }

  /**
   * Heartbeat. Called on a timer: sends a ping, and closes a socket that has been silent for
   * longer than the idle timeout (decision 5: every twenty seconds, closed at sixty).
   *
   * `stalledMs` is how long the server itself stood still before this beat. That time is not the
   * socket's silence: what it sent meanwhile is still waiting to be read, behind this very timer
   * (1 November 2026: after 79 s of a stalled server, every socket was closed as silent at once).
   */
  tick(idleTimeoutMs: number, stalledMs = 0): void {
    if (this.closed) return;
    if (this.options.now() - this.lastSeenAt - stalledMs > idleTimeoutMs) {
      this.options.onLog?.("info", "closing a silent socket");
      this.close(CLOSE_IDLE, "idle");
      return;
    }
    this.send({ frame: "ping", ts: this.options.now() });
  }

  close(code = 1000, reason = "closed"): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.options.socket.close(code, reason);
  }

  /** The peer went away. Release the subscription without trying to write to a dead socket. */
  onDisconnected(): void {
    this.closed = true;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
}

/** The hello's word on what the workspace is called, when it has a name the wire can carry. */
function workspaceCalled(name: string | undefined): { workspace?: { name: string } } {
  return name === undefined || name === "" || name.length > 120 ? {} : { workspace: { name } };
}
