/**
 * `connect`: one socket to `chipsd`, the handshake, a subscription that resumes from where it
 * got to, and the outbox that makes every send safe to repeat. Node 22's own `WebSocket` is
 * enough; there is nothing to install beyond `@chipschat/protocol`. Two calls go over HTTP, with
 * Node 22's own `fetch` and the same token: the rooms a person asked this harness for, read at
 * connect, and the claim that makes one of them the harness's own.
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { SignedAttachment } from "@chipschat/protocol";
import {
  type AnyEvent,
  type ContextBudget,
  createIdGenerator,
  type Hello,
  type IdGenerator,
  PROTOCOL_VERSION,
  type RoomContext,
  type RunRequested,
} from "@chipschat/protocol";
import { type AskedListing, Asks, type ClaimedSpace, firstWords, type SpaceAsked } from "./asks.js";
import { type ChipsEvents, type ConnectionState, Emitter, type Handler } from "./events.js";
import { download, type Uploaded, type UploadInput, upload } from "./files.js";
import type { LaneWire } from "./lane.js";
import { type Ack, createOutbox, RefusedError } from "./outbox.js";
import { Project, type ProjectOptions } from "./project.js";
import { type PlannedStep, Run } from "./run.js";
import { acceptsFor, Settings, type SettingsHandlers } from "./settings.js";
import type { HarnessStore, OpenRun } from "./store.js";

export interface ConnectOptions {
  /** `http://127.0.0.1:4432`, or wherever chipsd is. `ws://` and `wss://` are taken as given. */
  readonly url: string;
  /** The harness token, `chips_at_…`, from the app's Add harness or `.chips/demo.json` in dev. */
  readonly token: string;
  /** Who is connecting, for the connection list. */
  readonly client?: { readonly name: string; readonly version: string } | undefined;
  /**
   * Replay from this `seq` before streaming live. Absent, the harness hears only what happens
   * after it connects; a harness that persists the last `seq` it saw passes it here so a
   * decision made while it was down still reaches it. What is replayed waits for the harness's
   * first handler (`on`), so set up whatever you need before attaching them.
   */
  readonly since?: number | undefined;
  /** Reconnect with backoff when the socket drops. On unless said otherwise. */
  readonly reconnect?: boolean | undefined;
  /**
   * Wait for a server that can't be reached yet, trying again as a reconnect does, instead of
   * failing the first connect. For a harness kept running by its machine (a launch agent, a
   * systemd unit), which starts at login, perhaps before the network or its server is up: failing
   * there only has the service start it again every few seconds. A refusal (a token revoked, a
   * hello refused) still fails it. Off unless said, so a person running a harness by hand hears at
   * once that the server isn't there.
   */
  readonly waitForServer?: boolean | undefined;
  /** Each failed try while waiting for the server, with why, for the harness's log. */
  readonly onWaiting?: ((why: string) => void) | undefined;
  /**
   * How much of a room this harness is handed with each message for it, as `message.new`'s
   * `context` (ADR 0088): 20 lines and 4,000 characters unless said otherwise, 200 and 32,000 at
   * most, and none for `{ lines: 0 }`.
   */
  readonly context?: ContextBudget | undefined;
  /**
   * The harness's own restart (ADR 0094), run when a person asks for one from its page in Chips.
   * Given, this connection says `restart` in its `hello`, so Chips may ask; declaring `restarts`
   * on the harness stays the harness's own act, as for `forks`. Start the restart detached, since
   * it may replace this very process, and say nothing more until it is back — a new connection,
   * or `reportOk` — or until it knows it couldn't be, with `reportTrouble`.
   */
  readonly onRestart?: ((ask: RestartAsk) => void | Promise<void>) | undefined;
  /**
   * The changes a person makes from an agent's page, or the harness's, for the capabilities the
   * harness declares (`context_files`, `models`, `heartbeats`, `context_windows`, `jobs`): each
   * handler makes one in the
   * harness's own way and returns the copy as it is now, and the answer is sent for it. Each
   * given says its word in `hello`; send the copies themselves with `chips.settings`.
   */
  readonly settings?: SettingsHandlers | undefined;
  /**
   * Where to keep what must survive a restart: the last `seq` heard, the messages for this
   * harness it had not yet started a run for (heard again after the restart), events the server
   * never answered, and runs not yet ended, which are ended for the harness when it comes back
   * (`fileStore(path)`). Without one, a restart starts from `since` and forgets the rest.
   */
  readonly store?: HarnessStore | undefined;
  /** For tests: how to open a socket. */
  readonly createSocket?: ((url: string) => SocketLike) | undefined;
  /** For tests: how to make an HTTP request. Node 22's own `fetch` otherwise. */
  readonly fetch?: typeof fetch | undefined;
}

/** A person asking the harness to restart (ADR 0094): who, and when. */
export interface RestartAsk {
  readonly askedBy: string;
  readonly askedAt: string;
}

/** The part of a WebSocket this client uses, so a test can hand in a fake. */
/**
 * The most events held for a harness that is not listening yet. One that never listens would
 * otherwise keep every event of its rooms for as long as it ran; past this the oldest go.
 */
export const HELD_MOST = 20_000;

/**
 * How long a message for this harness is kept to be heard again after a restart while no run
 * has started in its room. A harness that answers every message with a run lets it go sooner; one
 * that chose not to answer, or answers some other way, lets it go after this.
 */
export const UNANSWERED_KEPT_MS = 60 * 60_000;

/**
 * Whether a waiting message is taken up by a run or words from `by`: the harness itself, or a
 * message that named nobody, takes it whole; an agent takes its own part, and the message is
 * taken up once every agent it was for has.
 */
export function takenUp(takers: Set<string>, by: string | undefined): boolean {
  if (by === undefined || takers.size === 0) return true;
  return takers.delete(by) && takers.size === 0;
}

/**
 * A server that can't take this harness yet, as the relay says it: busy, or not connected to the
 * relay (the computer asleep, or starting). Waited for, as no answer at all is.
 */
const UNREACHABLE: ReadonlySet<string> = new Set(["busy", "no_such_server"]);

/** What `on` hears that is the connection's own, and no event of the log. */
const OF_THE_CONNECTION: ReadonlySet<string> = new Set(["hello", "state", "receipt"]);

export interface SocketLike {
  readonly send: (data: string) => void;
  readonly close: () => void;
  readonly addEventListener: (
    name: "open" | "close" | "error" | "message",
    handler: (message: { readonly data?: unknown }) => void,
  ) => void;
}

export interface StartRunInput {
  readonly spaceId: string;
  readonly goal: string;
  readonly plan?: readonly PlannedStep[] | undefined;
  readonly sessionRef?: string | undefined;
  /** Minted when absent. */
  readonly runId?: string | undefined;
}

export interface PostInput {
  readonly spaceId: string;
  readonly text: string;
  /** Upload ids from `POST /v1/uploads`; Chips fills in the attachments. */
  readonly uploadIds?: readonly string[] | undefined;
  /**
   * Which version of the room's file each upload was made from (ADR 0099): an upload id to the
   * `attachment_id` `context.files` listed for that name. A file made from a version that is no
   * longer current is refused, `stale_file`, saying who changed it: fetch it and redo.
   */
  readonly replaces?: Readonly<Record<string, string>> | undefined;
  /**
   * The commit the turn's push left the room's project at (ADR 0222), from `Project.push`: the
   * room shows the change with this reply. Kept only when it was this agent's push to this room.
   */
  readonly change?: string | undefined;
  readonly replyTo?: string | undefined;
  readonly runId?: string | undefined;
  /**
   * The harnesses this is for, by id, or `all` (ADR 0081). What a harness says names nobody
   * unless its text @mentions one, it answers one, or it says so here: answer another harness
   * with its id, so the answer reaches it whether or not the words name it.
   */
  readonly to?: readonly string[] | "all" | undefined;
}

/** One of the harness's agents (ADR 0087), as `chips.agents` hands it back. */
export interface Agent {
  readonly agentId: string;
  /** The harness's own name for it: the id of the thing it is, in the harness's terms. */
  readonly key: string;
  readonly name: string;
  readonly lead: boolean;
  readonly state: "active" | "archived";
  /** The rooms it is in. */
  readonly spaces: readonly string[];
  /** The open room it is in (ADR 0087: one at a time), or `null` while it is free. */
  readonly room: string | null;
  /** While free, the room an archive took it out of, which an unarchive brings it back to. */
  readonly releasedFrom: string | null;
  /** How many of its words Chips is holding, said while it was in no room. */
  readonly held: number;
  /** The agent it is a copy of, when it is a fork's copy (ADR 0087, Fork). */
  readonly forkedFrom: string | null;
}

/** What `chips.as(agentId)` speaks with: the same sends, as that agent. */
export interface Speaker {
  readonly post: (input: PostInput) => Promise<Ack>;
  readonly runs: { readonly start: (input: StartRunInput) => Promise<Run> };
}

/** An actor the envelope names, when the harness speaks as one of its agents. */
type Actor = { readonly kind: "agent"; readonly id: string };

function agentOf(body: Readonly<Record<string, unknown>>): Agent {
  return {
    agentId: String(body["agent_id"]),
    key: String(body["key"]),
    name: String(body["name"]),
    lead: body["lead"] === true,
    state: body["state"] === "archived" ? "archived" : "active",
    spaces: Array.isArray(body["spaces"]) ? (body["spaces"] as string[]) : [],
    room: typeof body["room"] === "string" ? body["room"] : null,
    releasedFrom: typeof body["released_from"] === "string" ? body["released_from"] : null,
    held: typeof body["held"] === "number" ? body["held"] : 0,
    forkedFrom: typeof body["forked_from"] === "string" ? body["forked_from"] : null,
  };
}

export class ConnectError extends Error {
  override readonly name = "ConnectError";
}

type Frame = Record<string, unknown>;

interface Waiter<T = unknown> {
  readonly match: (event: Record<string, unknown>) => T | undefined;
  readonly resolve: (value: T) => void;
}

export class Chips {
  private readonly emitter = new Emitter<ChipsEvents>();
  private readonly outbox = createOutbox();
  private readonly ids: IdGenerator = createIdGenerator();
  private readonly waiters = new Set<Waiter>();
  private readonly activeRuns = new Map<string, Run>();
  /** Pings in flight, by their `ts`, for `subscribed`. */
  private readonly pongs = new Map<number, () => void>();
  /** Makes each ping's `ts` its own, so two in one millisecond are still told apart. */
  private pings = 0;
  /**
   * Events held back, and why: one hold until the harness is listening, and one for each
   * catch-up on asked rooms still reading, so that a room's first words heard live and read from
   * its history are handed over once. Delivered in order when none is left.
   *
   * The first hold used to last one tick after `connect` resolved. Three bridges looked for git
   * and listed their agents before they attached a handler, so what `since` replayed was handed
   * to nobody, and the place in the log moved past it: a message sent while a bridge was down was
   * never answered (9 November 2026). An event nothing here could take is not heard. So the hold
   * lasts until something takes events: a handler, a waiter, a run, or a handler for rooms asked
   * (ADR 0289).
   */
  private held: Frame[] = [];
  private holds = 1;
  /** The handshake is done: `connect` has resolved. */
  private started = false;
  /** Something here takes events (`listens`). */
  private listening = false;
  /** The first hold is on its way out. */
  private letting = false;
  private readonly askHandlers = new Emitter<{ readonly asked: SpaceAsked }>();
  private readonly asks = new Asks(() => this.me()?.harness_id, {
    listening: () => this.askHandlers.count("asked") > 0,
    hand: (asked) => this.askHandlers.emit("asked", asked),
  });
  private socket: SocketLike | undefined;
  private ready = false;
  private closed = false;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private since: number | undefined;
  private connectionState: ConnectionState = "connecting";
  private helloEvent: Hello | undefined;
  /** What this harness last said is wrong on its side, said again whenever it reconnects. */
  private trouble: string | undefined;
  /**
   * Messages for this harness, by `seq`, with no run started in their room since: a bridge
   * gathers a message for a moment, or queues it behind a turn already going (ADR 0294), before
   * it starts one. `since` is past them, so they are kept to be heard again after a restart,
   * which would otherwise lose them for good.
   */
  private readonly unanswered = new Map<
    number,
    {
      readonly spaceId: string;
      /** The message, as `message.new` named it: a turn that says it heard it takes it up. */
      readonly messageId: string | undefined;
      /** Its `for`: this connection's agents still to take a turn on it. */
      readonly takers: Set<string>;
      readonly at: number;
    }
  >();
  /** When each message a process before this one left waiting was heard, by `seq`. */
  private readonly leftAt = new Map<number, number>();
  /**
   * After a restart that kept messages unanswered: everything up to `upTo` was heard before, so
   * it is passed over, except the messages in `again`, which are heard as if new. Over once an
   * event past `upTo` arrives.
   */
  private replay: { readonly upTo: number; readonly again: Set<number> } | undefined;
  /** The runs this process started or took up and has not ended, for the store. */
  private readonly openRuns = new Map<string, OpenRun>();
  /** Runs a process before this one left open, ended once this one has said hello. */
  private orphans: OpenRun[] = [];
  private saving: ReturnType<typeof setTimeout> | undefined;

  private constructor(private readonly options: ConnectOptions) {
    const kept = options.store?.load();
    this.since = options.since ?? kept?.since;
    // Waiting longer than a message is kept for, it is let go here too: a harness stopped for a
    // day doesn't answer yesterday's message when it starts.
    const fresh = Date.now() - UNANSWERED_KEPT_MS;
    const again = (kept?.unanswered ?? []).filter((seq) => {
      const at = kept?.unansweredAt?.[String(seq)];
      return this.since !== undefined && seq <= this.since && at !== undefined && at > fresh;
    });
    for (const seq of again) this.leftAt.set(seq, kept?.unansweredAt?.[String(seq)] ?? 0);
    if (options.since === undefined && this.since !== undefined && again.length > 0) {
      this.replay = { upTo: this.since, again: new Set(again) };
    }
    for (const event of kept?.outbox ?? []) {
      this.outbox.add(String(event["idempotency_key"]), event).catch(() => undefined);
    }
    this.orphans = [...(kept?.runs ?? [])];
    this.settings = new Settings(
      (path, body) => this.request("PUT", path, body),
      () => this.harnessId,
      options.settings,
      (path, body) => this.request("POST", path, body),
    );
  }

  /**
   * The harness's copies of what a person changes from an agent's page (ADRs 0134, 0140, 0143,
   * 0146): send each when connected and whenever it changes on the harness's side. Handlers for
   * a person's changes are `connect({ settings })`'s.
   */
  readonly settings: Settings;

  /** Open the socket, say hello, subscribe. Resolves once the server has said who you are. */
  static async connect(options: ConnectOptions): Promise<Chips> {
    const chips = new Chips(options);
    await chips.open(true);
    chips.endOrphans();
    // What `since` replayed during the handshake waits for the harness's first handler
    // (`listens`), however long its own setup takes before it attaches one.
    chips.started = true;
    chips.letGo();
    return chips;
  }

  get state(): ConnectionState {
    return this.connectionState;
  }

  /** The server's half of the handshake: who this connection is, and what it may do. */
  get hello(): Hello {
    if (this.helloEvent === undefined) throw new ConnectError("not connected yet");
    return this.helloEvent;
  }

  get harnessId(): string {
    const me = this.me();
    if (me === undefined) throw new ConnectError("the server presented no harness");
    return me.harness_id;
  }

  /** Who this connection is: `hello.harness`, or the list's first from a server before it. */
  private me(): Hello["harnesses"][number] | undefined {
    return this.helloEvent?.harness ?? this.helloEvent?.harnesses[0];
  }

  get workspaceId(): string {
    return this.hello.workspace_id;
  }

  /**
   * The harness's agents (ADR 0087): `register` makes one, or finds it by your key for it,
   * renames it when the name has changed, and archives it or brings it back as `state` says;
   * `list` reads them with their rooms; `attach` puts one in a room in the place of another of
   * yours there, or of the harness itself. One connection speaks for all of them:
   * `chips.as(agentId)`. A harness that declares `agents` is told them at `hello` too
   * (`chips.hello.agents`).
   */
  readonly agents = {
    register: async (input: {
      /**
       * Your own name for it. `harnessId` names the agent Chips made for you when you joined,
       * your default, in your own room: register it with `lead: true` as your Main agent, rather
       * than a second agent beside it (ADR 0183).
       */
      readonly key: string;
      readonly name: string;
      readonly lead?: boolean | undefined;
      /** The thing the agent is, archived in your harness or in use; unsaid, it stays as it is. */
      readonly state?: Agent["state"] | undefined;
      /** For a fork's copy (`agent.fork`): the agent it copies. */
      readonly forkedFrom?: string | undefined;
      /** For a new agent a person asked for (`agent.asked`, ADR 0108): the ask's id. */
      readonly madeFor?: string | undefined;
      /**
       * For a fork's copy or a new agent: the room it was asked for, which it joins while the
       * room waits.
       */
      readonly spaceId?: string | undefined;
    }): Promise<
      Agent & {
        readonly created: boolean;
        readonly renamed: boolean;
        /** For a fork's copy or a new agent: whether it joined its room, and why not when it didn't. */
        readonly attached?: boolean;
        readonly why?: string;
      }
    > => {
      const answer = await this.request("POST", `/v1/harnesses/${this.harnessId}/agents`, {
        key: input.key,
        name: input.name,
        ...(input.lead === undefined ? {} : { lead: input.lead }),
        ...(input.state === undefined ? {} : { state: input.state }),
        ...(input.forkedFrom === undefined ? {} : { forked_from: input.forkedFrom }),
        ...(input.madeFor === undefined ? {} : { made_for: input.madeFor }),
        ...(input.spaceId === undefined ? {} : { space_id: input.spaceId }),
      });
      return {
        ...agentOf(answer),
        created: answer["created"] === true,
        renamed: answer["renamed"] === true,
        ...(typeof answer["attached"] === "boolean" ? { attached: answer["attached"] } : {}),
        ...(typeof answer["why"] === "string" ? { why: answer["why"] } : {}),
      };
    },
    list: async (): Promise<Agent[]> => {
      const answer = await this.request("GET", `/v1/harnesses/${this.harnessId}/agents`);
      return (Array.isArray(answer["agents"]) ? answer["agents"] : []).map((each) =>
        agentOf(each as Record<string, unknown>),
      );
    },
    /**
     * An agent of yours in a room, in the place of `replacing`: the harness's own id, or another
     * of its agents there. What that one said in the room reads as the agent's from then on.
     * `attached` is false when it was there already.
     */
    attach: async (
      agentId: string,
      where: { readonly spaceId: string; readonly replacing: string },
    ): Promise<{ readonly attached: boolean }> => {
      const answer = await this.request("POST", `/v1/agents/${agentId}/attach`, {
        space_id: where.spaceId,
        replacing: where.replacing,
      });
      return { attached: answer["attached"] === true };
    },
  };

  /**
   * Speak as one of this harness's agents (ADR 0087): a post, and a run with everything sent on
   * it, carry the agent as their actor. A harness with one agent in a room need not say which:
   * what it sends as itself is read as that agent there. Where it has several, it must.
   */
  as(agentId: string): Speaker {
    const actor: Actor = { kind: "agent", id: agentId };
    return {
      post: (input) => this.postAs(input, actor),
      runs: { start: (input) => this.startAs(input, actor) },
    };
  }

  /**
   * A room's project for one of this harness's agents (ADR 0221): its copy in the agent's folder,
   * brought up to date before each turn (`pull`) and sent after it (`push`).
   */
  project(input: Omit<ProjectOptions, "url" | "token">): Project {
    return new Project({ ...input, url: this.options.url, token: this.options.token });
  }

  get autonomy(): 0 | 1 | 2 | 3 {
    return this.hello.autonomy;
  }

  get policy(): Hello["policy"] {
    return this.hello.policy;
  }

  /** The highest `seq` heard, to persist for `since` on the next start. */
  get lastSeq(): number | undefined {
    return this.since;
  }

  /**
   * Hear events by name, or all of them as `event`. What `since` replayed, and what was said
   * since the connection opened, is handed over a tick after the first handler is attached:
   * attach every handler together, and all of them hear it. `hello`, `state` and `receipt` are
   * the connection's own, and attaching one of those alone starts nothing.
   */
  on<K extends keyof ChipsEvents>(name: K, handler: Handler<ChipsEvents[K]>): () => void {
    const off = this.emitter.on(name, handler);
    if (!OF_THE_CONNECTION.has(name)) this.listens();
    return off;
  }

  /** Say something in a space. */
  post(input: PostInput): Promise<Ack> {
    return this.postAs(input, undefined);
  }

  private postAs(input: PostInput, actor: Actor | undefined): Promise<Ack> {
    return this.send(
      "message.post",
      {
        space_id: input.spaceId,
        ...(input.runId === undefined ? {} : { run_id: input.runId }),
        ...(actor === undefined ? {} : { actor }),
      },
      {
        text: input.text,
        ...(input.uploadIds === undefined ? {} : { upload_ids: input.uploadIds }),
        ...(input.replaces === undefined ? {} : { replaces: input.replaces }),
        ...(input.change === undefined ? {} : { change: input.change }),
        ...(input.replyTo === undefined ? {} : { reply_to: input.replyTo }),
        ...(input.to === undefined ? {} : { to: input.to }),
      },
    );
  }

  /**
   * A room a person asked this harness for: their first words in it, once per room. Registering
   * reads the rooms asked while the harness was away (`GET /v1/harnesses/:id/spaces`) and their
   * history, and every reconnect reads them again; a room asked while connected is heard live.
   * The first words are the ask's, and are not heard again as `message.new`; what is said in the
   * room after them is. Only a harness that declares `new_spaces` is ever asked. Make what the
   * room is for, then `claimSpace` it under a key of your own and answer in it.
   */
  onSpaceAsked(handler: Handler<SpaceAsked>): () => void {
    const off = this.askHandlers.on("asked", handler);
    this.listens();
    if (this.ready) void this.catchUp();
    return off;
  }

  /**
   * Make a room a person asked for this harness's own, under `key`, the harness's name for what
   * it made of it: an agent, a session, a Space. The title names the room unless a person named
   * it first. Asking for the key afterwards finds the room, as for a room the harness opened.
   * A retry with the same key finds the room claimed already; a refusal throws `RefusedError`.
   */
  async claimSpace(spaceId: string, key: string, title?: string): Promise<ClaimedSpace> {
    const answer = await this.request("POST", `/v1/harnesses/${this.harnessId}/spaces`, {
      key,
      space_id: spaceId,
      ...(title === undefined ? {} : { title }),
    });
    return {
      spaceId: String(answer["space_id"]),
      claimed: answer["claimed"] === true,
      retitled: answer["retitled"] === true,
    };
  }

  /**
   * A room of this harness's own, under `key`: opened the first time, found again after. Chips puts
   * the agent registered under the same key in it, or the harness's default agent (ADR 0087's
   * addendum of 30 September, point 5). The title names a new room; untitled, it is called what
   * its agent is.
   */
  async openSpace(key: string, title?: string): Promise<string> {
    const answer = await this.request("POST", `/v1/harnesses/${this.harnessId}/spaces`, {
      key,
      ...(title === undefined ? {} : { title }),
    });
    return String(answer["space_id"]);
  }

  /**
   * A room's lines, older than `before` (a line's `seq`, or a context's `before`), up to `limit`
   * of them: 20 unless said otherwise, 200 at most (ADR 0088). Only a room this harness is in.
   * What a harness reads to catch up on a room it was just added to, or to look further back
   * than a message's context went.
   */
  async roomContext(
    spaceId: string,
    page: { readonly before?: number | undefined; readonly limit?: number | undefined } = {},
  ): Promise<RoomContext> {
    const query = new URLSearchParams();
    if (page.before !== undefined) query.set("before", String(page.before));
    if (page.limit !== undefined) query.set("limit", String(page.limit));
    const search = query.toString();
    const path = `/v1/spaces/${spaceId}/context${search === "" ? "" : `?${search}`}`;
    const answer = await this.request("GET", path);
    return answer as unknown as RoomContext;
  }

  /**
   * Send a file, for a post's `uploadIds`: in pieces when it is large, picking up where it got to
   * after a piece is lost (ADR 0052). Resolves with what the server stored.
   */
  upload(input: UploadInput): Promise<Uploaded> {
    return upload((method, path, body) => this.request(method, path, body), input);
  }

  /** Send a file from disk, under its own name unless given another. */
  async uploadFile(path: string, filename?: string): Promise<Uploaded> {
    const bytes = new Uint8Array(await readFile(path));
    return await this.upload({ bytes, filename: filename ?? basename(path) });
  }

  /**
   * An attachment's bytes: a message's, or a room file's. Its URL is bound to this harness's
   * token, so it is fetched with it.
   */
  download(attachment: Pick<SignedAttachment, "url"> | string): Promise<Uint8Array> {
    return download(this.options.fetch ?? fetch, this.options.token, attachment);
  }

  /**
   * Say what is wrong on this harness's side: the part Chips cannot see, such as a back end it
   * cannot reach (ADR 0083). People see the agent marked, and these words under a message it
   * hasn't picked up. One line, up to 200 characters. It holds until `reportOk`, or until the
   * connection closes; the SDK says it again whenever it reconnects, so say it once.
   */
  async reportTrouble(reason: string): Promise<void> {
    this.trouble = reason;
    await this.status({ state: "trouble", reason });
  }

  /** Say that nothing is wrong on this harness's side any more (ADR 0083). */
  async reportOk(): Promise<void> {
    this.trouble = undefined;
    await this.status({ state: "ok" });
  }

  private async status(body: Readonly<Record<string, unknown>>): Promise<void> {
    await this.request("PUT", `/v1/harnesses/${this.harnessId}/status`, body);
  }

  /** The lane side of the connection, for the `Lane` a `run.task()` hands back. */
  private readonly lanes: LaneWire<Run> = {
    hear: (laneId, handler) =>
      this.emitter.on("lane.updated", (event) => {
        if (event.lane_id === laneId) handler(event);
      }),
    accept: (runId, spaceId, laneId) => this.runFor(runId, spaceId, laneId),
  };

  /** A `Run` over the wire for this run id, registered so what people do to it reaches it. */
  private runFor(runId: string, spaceId: string, laneId?: string, actor?: Actor): Run {
    const known = this.activeRuns.get(runId);
    if (known !== undefined) return known;
    // Everything sent on a run an agent started is that agent's (ADR 0087).
    const envelope = {
      space_id: spaceId,
      run_id: runId,
      ...(actor === undefined ? {} : { actor }),
    };
    const run = new Run(
      runId,
      spaceId,
      {
        send: (type, payload, key) => this.send(type, envelope, payload, key),
        newId: (kind) => this.ids.next(kind),
        waitFor: (match) => this.waitFor(match),
        lanes: this.lanes,
      },
      laneId,
    );
    this.activeRuns.set(runId, run);
    // A run takes what a person does to it with no handler at all (`run.over`, `run.paused`).
    this.listens();
    return run;
  }

  /**
   * Runs: `chips.runs.start({...})` opens one and resolves once the server has accepted it;
   * `chips.runs.accept(requested)` takes up the run a lead routed here as a lane (M3.5) — the
   * run is already seeded, so nothing is sent — and everything sent on it is the lane's.
   */
  readonly runs = {
    start: (input: StartRunInput): Promise<Run> => this.startAs(input, undefined),
    accept: (requested: Pick<RunRequested, "run_id" | "space_id" | "lane_id">): Run => {
      if (requested.run_id === undefined || requested.space_id === undefined) {
        throw new ConnectError("a run.requested names the lane's run and its home");
      }
      this.opened({ runId: requested.run_id, spaceId: requested.space_id });
      return this.runFor(requested.run_id, requested.space_id, requested.lane_id);
    },
  };

  private async startAs(input: StartRunInput, actor: Actor | undefined): Promise<Run> {
    {
      const runId = input.runId ?? this.ids.next("run");
      const envelope = {
        space_id: input.spaceId,
        run_id: runId,
        ...(actor === undefined ? {} : { actor }),
      };
      const run = this.runFor(runId, input.spaceId, undefined, actor);
      this.opened({ runId, spaceId: input.spaceId, agentId: actor?.id });
      try {
        await this.send("run.started", envelope, {
          goal: input.goal,
          ...(input.plan === undefined
            ? {}
            : { plan: input.plan.map((step) => ({ step_id: step.stepId, title: step.title })) }),
          ...(input.sessionRef === undefined ? {} : { session_ref: input.sessionRef }),
        });
      } catch (error) {
        this.ended(runId);
        throw error;
      }
      return run;
    }
  }

  /** Send any event. The envelope's actor, ts and workspace are the server's to fill in. */
  send(
    type: string,
    envelope: Readonly<Record<string, unknown>>,
    payload: Readonly<Record<string, unknown>>,
    key = `${this.options.client?.name ?? "harness"}-${this.ids.next("event").slice(4)}`,
  ): Promise<Ack> {
    if (this.closed)
      return Promise.reject(new RefusedError("closed", "the connection is closed", key));
    const event = { type, ...envelope, idempotency_key: key, ...payload };
    const answer = this.outbox.add(key, event);
    if (type === "run.completed" || type === "run.failed") this.ended(String(envelope["run_id"]));
    if (type === "run.started" || (type === "message.post" && envelope["run_id"] === undefined)) {
      this.answered(envelope);
    }
    // A turn already working took the message in: no run will start for it, and it is answered.
    if (type === "message.heard") this.heardInTurn(payload["message_id"]);
    this.save();
    if (this.ready && this.socket !== undefined) {
      this.socket.send(JSON.stringify({ frame: "event", event }));
    }
    return answer;
  }

  // ------------------------------------------------------------------ what survives a restart

  private opened(run: OpenRun): void {
    this.openRuns.set(run.runId, run);
    this.save();
  }

  /**
   * A run is over: it completed, failed, or a person stopped it. It is let go here, so nothing
   * more reaches it and a harness that runs for weeks doesn't keep every run it ever had.
   */
  private ended(runId: string): void {
    this.activeRuns.delete(runId);
    if (this.openRuns.delete(runId)) this.save();
  }

  /**
   * Heard before this process started, so passed over: everything up to the replay's `upTo`,
   * except the messages kept unanswered, which are heard again.
   */
  private passedOver(seq: number): boolean {
    const replay = this.replay;
    if (replay === undefined) return false;
    if (seq > replay.upTo) {
      this.replay = undefined;
      return false;
    }
    return !replay.again.delete(seq);
  }

  /** A message for this harness waits until a run starts for it in its room. */
  private waitsForAnswer(event: Frame, seq: number): void {
    const spaceId = event["space_id"];
    if (event["type"] !== "message.new" || typeof spaceId !== "string") return;
    const takers = Array.isArray(event["for"])
      ? event["for"].filter((each): each is string => typeof each === "string")
      : [];
    const messageId = typeof event["message_id"] === "string" ? event["message_id"] : undefined;
    // Heard again after a restart, it has waited since it was first heard.
    const at = this.leftAt.get(seq) ?? Date.now();
    this.unanswered.set(seq, { spaceId, messageId, takers: new Set(takers), at });
  }

  /** A working turn said it heard this message: it waits for no run of its own any more. */
  private heardInTurn(messageId: unknown): void {
    if (typeof messageId !== "string") return;
    let changed = false;
    for (const [seq, waiting] of this.unanswered) {
      if (waiting.messageId === messageId) {
        this.unanswered.delete(seq);
        changed = true;
      }
    }
    if (changed) this.save();
  }

  /**
   * A run started in a room, or something said there outside a run: the messages waiting there
   * for whoever did it are taken up. Sent as one of its agents, only those for that agent; sent
   * as the harness itself, all of them.
   */
  private answered(envelope: Readonly<Record<string, unknown>>): void {
    const spaceId = envelope["space_id"];
    if (typeof spaceId !== "string") return;
    const actor = envelope["actor"] as { readonly id?: unknown } | undefined;
    const by = typeof actor?.id === "string" ? actor.id : undefined;
    let changed = false;
    for (const [seq, waiting] of this.unanswered) {
      if (waiting.spaceId === spaceId && takenUp(waiting.takers, by)) {
        this.unanswered.delete(seq);
        changed = true;
      }
    }
    if (changed) this.save();
  }

  /**
   * The messages to hear again after a restart, each with when it was first heard: those still
   * unanswered, and those a process before this one left that are not yet replayed.
   */
  private toHearAgain(): Map<number, number> {
    const now = Date.now();
    for (const [seq, waiting] of this.unanswered) {
      if (now - waiting.at > UNANSWERED_KEPT_MS) this.unanswered.delete(seq);
    }
    const heardAt = new Map<number, number>();
    for (const seq of this.replay?.again ?? []) heardAt.set(seq, this.leftAt.get(seq) ?? now);
    for (const [seq, waiting] of this.unanswered) heardAt.set(seq, waiting.at);
    return new Map([...heardAt].sort((a, b) => a[0] - b[0]));
  }

  /**
   * End the runs a process before this one left open: its work died with it, and a run nobody
   * ends keeps its thinking bubble until the harness's next one. Refused for one Chips had ended
   * already, which is just as well.
   */
  private endOrphans(): void {
    const orphans = this.orphans.filter((run) => !this.openRuns.has(run.runId));
    this.orphans = [];
    for (const run of orphans) {
      this.send(
        "run.failed",
        {
          space_id: run.spaceId,
          run_id: run.runId,
          ...(run.agentId === undefined ? {} : { actor: { kind: "agent", id: run.agentId } }),
        },
        { error: "The harness restarted before this run ended.", retryable: true },
        `restarted-${run.runId}`,
      ).catch(() => undefined);
    }
    this.save();
  }

  /** Keep the state soon, once for however many changes come together. */
  private save(): void {
    if (this.options.store === undefined || this.saving !== undefined) return;
    this.saving = setTimeout(() => {
      this.saving = undefined;
      this.saveNow();
    }, 50);
    this.saving.unref?.();
  }

  private saveNow(): void {
    if (this.options.store === undefined) return;
    const again = this.toHearAgain();
    this.options.store.save({
      ...(this.since === undefined ? {} : { since: this.since }),
      ...(again.size === 0
        ? {}
        : { unanswered: [...again.keys()], unansweredAt: Object.fromEntries(again) }),
      outbox: this.outbox.unanswered(),
      runs: [...this.openRuns.values(), ...this.orphans],
    });
  }

  /** Resolve with the first event that matches, now or later. */
  waitFor<T>(match: (event: Record<string, unknown>) => T | undefined): Promise<T> {
    this.listens();
    return new Promise<T>((resolve) => {
      this.waiters.add({ match, resolve: resolve as (value: unknown) => void });
    });
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.timer);
    // What was unanswered is kept for the next start before the outbox lets it go.
    clearTimeout(this.saving);
    this.saving = undefined;
    this.saveNow();
    this.socket?.close();
    this.outbox.abandon("the connection was closed");
    this.setState("closed");
  }

  // ------------------------------------------------------------------ the socket

  /**
   * The socket's URL, with a single-use ticket in it (SEC-22). The token goes to
   * `POST /v1/socket-tickets` in a header, as every other call sends it; what comes back is
   * spent on the upgrade and worth nothing afterwards. Node's `WebSocket` sets no headers on
   * the upgrade, and a token in the URL would be a durable credential in every proxy log the
   * URL crosses.
   */
  private async socketUrl(): Promise<string> {
    const base = this.options.url.replace(/\/$/, "").replace(/^http/, "ws");
    const { ticket } = await this.request("POST", "/v1/socket-tickets");
    return `${base}/v1/ws?ticket=${encodeURIComponent(String(ticket))}`;
  }

  private open(first: boolean): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.setState("connecting");
      // Before a socket exists, a failure tells the first caller. A reconnect has nobody to
      // tell, so it tries again: a server still down on this attempt may be up by the next.
      // So does a first connect told to wait for its server, unless it was refused.
      const failed = (what: string, error: unknown) => {
        const why = `${what}: ${describe(error)}`;
        if (!first) this.scheduleReconnect();
        else if (this.waitsFor(error)) this.tryAgain(why, resolve, reject);
        else reject(new ConnectError(why));
      };
      void this.socketUrl().then(
        (url) => {
          let socket: SocketLike;
          try {
            socket = (this.options.createSocket ?? openSocket)(url);
          } catch (error) {
            failed("could not open a socket", error);
            return;
          }
          this.socket = socket;
          this.listen(socket, {
            settled: (hello) => this.settled(socket, hello, first, resolve, reject),
          });
        },
        (error: unknown) => failed("could not get a socket ticket", error),
      );
    });
  }

  /** The handshake's outcome: the hello, a refusal, or the socket gone before either. */
  private settled(
    socket: SocketLike,
    hello: Hello | ConnectError | undefined,
    first: boolean,
    resolve: () => void,
    reject: (error: ConnectError) => void,
  ): void {
    if (hello === undefined) {
      const why = "the server closed the socket before saying hello";
      if (!first) this.scheduleReconnect();
      else if (this.options.waitForServer === true) this.tryAgain(why, resolve, reject);
      else reject(new ConnectError(why));
      return;
    }
    if (hello instanceof ConnectError) {
      if (first) reject(hello);
      return;
    }
    this.onHello(socket, hello);
    void this.subscribed(socket).then(resolve);
  }

  /** The socket's four events. `settled` fires once: with the hello, a refusal, or nothing. */
  private listen(
    socket: SocketLike,
    on: { readonly settled: (outcome: Hello | ConnectError | undefined) => void },
  ): void {
    let settled = false;
    const settle = (outcome: Hello | ConnectError | undefined) => {
      if (settled) return;
      settled = true;
      on.settled(outcome);
    };
    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          frame: "hello",
          protocol: { min: PROTOCOL_VERSION, max: PROTOCOL_VERSION },
          client: this.options.client ?? { name: "chips-harness", version: "0.0.0" },
          ...(this.options.context === undefined ? {} : { context: this.options.context }),
          ...this.accepts(),
        }),
      );
    });
    socket.addEventListener("message", (message) => {
      const frame = JSON.parse(String(message.data)) as Frame;
      if (settled) {
        this.handleFrame(frame);
        return;
      }
      const outcome = this.handshakeOutcome(frame);
      if (outcome !== undefined) settle(outcome);
      else this.handleFrame(frame);
    });
    let gone = false;
    const onGone = () => {
      if (gone) return;
      gone = true;
      this.ready = false;
      const wasSettled = settled;
      settle(undefined);
      if (!wasSettled) return;
      this.setState("closed");
      this.scheduleReconnect();
    };
    socket.addEventListener("close", onGone);
    // An error is the socket gone, not a prelude to `close`: Node 22's WebSocket (undici 6) fires
    // only `error` when the server refuses the handshake, so waiting for `close` hangs there. Where
    // `close` does follow, it finds the work done.
    socket.addEventListener("error", onGone);
  }

  /** The frames beyond the base set this connection takes: a restart, and the settings it handles. */
  private accepts(): { accepts?: string[] } {
    const accepts = [
      ...(this.options.onRestart === undefined ? [] : ["restart"]),
      ...acceptsFor(this.options.settings),
    ];
    return accepts.length === 0 ? {} : { accepts };
  }

  /** During the handshake: the server's hello, or its refusal. Anything else is a frame. */
  private handshakeOutcome(frame: Frame): Hello | ConnectError | undefined {
    if (frame["frame"] === "event") {
      const event = frame["event"] as Frame;
      return event["type"] === "hello" ? (event as unknown as Hello) : undefined;
    }
    if (frame["frame"] === "error") {
      return new ConnectError(`${String(frame["code"])}: ${String(frame["message"])}`);
    }
    return undefined;
  }

  private onHello(socket: SocketLike, hello: Hello): void {
    this.helloEvent = hello;
    this.emitter.emit("hello", hello);
    // After a restart, from just before the first message still to be heard again.
    const again = this.replay?.again;
    const from = again !== undefined && again.size > 0 ? Math.min(...again) - 1 : this.since;
    socket.send(
      JSON.stringify({
        frame: "subscribe",
        workspace_id: hello.workspace_id,
        ...(from === undefined ? {} : { since: from }),
      }),
    );
    // Whatever the last socket did not get an answer for goes first: the server acks a resend
    // it already applied as a duplicate, so sending twice is safe by design.
    for (const event of this.outbox.unanswered()) {
      socket.send(JSON.stringify({ frame: "event", event }));
    }
    this.ready = true;
    this.retry = 0;
    this.setState("open");
    // A reconnect reads again what was asked while the socket was down.
    if (this.askHandlers.count("asked") > 0) void this.catchUp();
    // And says again what is wrong, which ended when the last socket closed (ADR 0083).
    const trouble = this.trouble;
    if (trouble !== undefined) {
      void this.status({ state: "trouble", reason: trouble }).catch(() => undefined);
    }
  }

  /**
   * The server answers frames in order, so a pong to a ping sent after `subscribe` means the
   * subscription is live: an event appended from here on is delivered, not missed as history.
   */
  private subscribed(socket: SocketLike): Promise<void> {
    // An integer: the frame's schema says so, and a `ts` with a fraction is refused rather than
    // answered — which cost every connect the whole two-second wait until M3.5 found it.
    this.pings += 1;
    const ts = Date.now() + this.pings;
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.pongs.delete(ts);
        resolve();
      }, 2000);
      this.pongs.set(ts, () => {
        clearTimeout(timer);
        this.pongs.delete(ts);
        resolve();
      });
      socket.send(JSON.stringify({ frame: "ping", ts }));
    });
  }

  /** Hand a person's ask to the harness's own restart; what it does after is its business. */
  private restart(frame: Frame): void {
    const handler = this.options.onRestart;
    if (handler === undefined) return;
    const ask = { askedBy: String(frame["asked_by"]), askedAt: String(frame["asked_at"]) };
    void Promise.resolve()
      .then(() => handler(ask))
      .catch(() => undefined);
  }

  private handleFrame(frame: Frame): void {
    switch (frame["frame"]) {
      case "ping":
        this.socket?.send(JSON.stringify({ frame: "pong", ts: frame["ts"] }));
        return;
      case "pong":
        this.pongs.get(Number(frame["ts"]))?.();
        return;
      case "event":
        this.onEvent(frame["event"] as Frame);
        return;
      case "ack":
        this.outbox.acked({
          idempotencyKey: String(frame["idempotency_key"]),
          seq: Number(frame["seq"]),
          duplicate: frame["duplicate"] === true,
          ...laneOf(frame["lane"]),
          ...heldOf(frame),
        });
        this.save();
        return;
      case "error": {
        const key = frame["idempotency_key"];
        this.outbox.refused(
          new RefusedError(
            String(frame["code"]),
            String(frame["message"]),
            typeof key === "string" ? key : undefined,
          ),
        );
        this.save();
        return;
      }
      case "restart":
        this.restart(frame);
        return;
      case "receipt":
        this.emitter.emit("receipt", {
          idempotencyKey: String(frame["idempotency_key"]),
          disposition: frame["disposition"] === "steered" ? "steered" : "queued",
        });
        return;
      default:
        this.settings.hear(frame);
        return;
    }
  }

  /** Something here takes events from now on, so the first hold can go. */
  private listens(): void {
    this.listening = true;
    this.letGo();
  }

  /**
   * Let the first hold go, once the handshake is done and the harness is listening: on the next
   * tick, so handlers attached together all hear what was held.
   */
  private letGo(): void {
    if (!this.started || !this.listening || this.letting) return;
    this.letting = true;
    setTimeout(() => this.release(), 0);
  }

  /** Let one hold go; with none left, deliver what was held, in order. */
  private release(): void {
    this.holds -= 1;
    if (this.holds > 0) return;
    const held = this.held;
    this.held = [];
    for (const event of held) this.onEvent(event);
  }

  private onEvent(event: Frame): void {
    if (this.holds > 0) {
      this.held.push(event);
      // Nobody is listening, and may never be: keep the newest, as much as `HELD_MOST`.
      if (!this.listening && this.held.length > HELD_MOST) this.held.shift();
      return;
    }
    const seq = event["seq"];
    if (typeof seq === "number") {
      if (this.passedOver(seq)) return;
      this.since = Math.max(this.since ?? 0, seq);
      this.waitsForAnswer(event, seq);
      this.save();
    }
    this.settleWaiters(event);
    this.emitter.emit("event", event as unknown as AnyEvent);
    this.routeToRuns(event);
    // After the run has heard it: a stopped run is let go.
    if (event["type"] === "run.cancel" && typeof event["run_id"] === "string") {
      this.ended(event["run_id"]);
    }
    const asked = this.asks.heard(event);
    const type = event["type"];
    if (typeof type === "string" && type in this.named && !asked) {
      this.emitter.emit(type as keyof ChipsEvents, event as never);
    }
  }

  // ------------------------------------------------------------------ over HTTP

  /**
   * The rooms asked of this harness and not yet claimed, each with its history, handed over
   * when their first words are there. Live events wait meanwhile. A failure is left for the next
   * connect: a room stays asked until it is claimed.
   */
  private async catchUp(): Promise<void> {
    this.holds += 1;
    try {
      const listing = await this.request("GET", `/v1/harnesses/${this.harnessId}/spaces`);
      const asked = Array.isArray(listing["asked"]) ? (listing["asked"] as AskedListing[]) : [];
      for (const room of asked) {
        if (this.asks.handed(room.space_id)) continue;
        this.asks.caughtUp(room, await this.firstWordsIn(room.space_id));
      }
    } catch {
      // Nothing to hand over this time; the room is listed again at the next connect.
    } finally {
      this.release();
    }
  }

  /** What a person first said in a room, read from its beginning a page at a time. */
  private async firstWordsIn(spaceId: string): Promise<SpaceAsked["firstMessage"] | undefined> {
    let since = 0;
    for (;;) {
      const page = await this.request(
        "GET",
        `/v1/events?space_id=${encodeURIComponent(spaceId)}&since=${since}&limit=100`,
      );
      const first = firstWords((page["events"] as Frame[] | undefined) ?? []);
      const next = page["next_cursor"];
      if (first !== undefined || typeof next !== "number") return first;
      since = next;
    }
  }

  /**
   * One call to chipsd with the harness's token: JSON, or a file's bytes. A refusal throws with
   * the server's words.
   */
  /**
   * Any route, with this harness's token: for one the SDK has no call for yet. The answer's JSON,
   * or `RefusedError` with the server's code and words.
   */
  async request(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: Readonly<Record<string, unknown>> | Uint8Array,
  ): Promise<Record<string, unknown>> {
    const base = this.options.url.replace(/\/$/, "").replace(/^ws/, "http");
    const bytes = body instanceof Uint8Array;
    const response = await (this.options.fetch ?? fetch)(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.options.token}`,
        ...(body === undefined
          ? {}
          : { "content-type": bytes ? "application/octet-stream" : "application/json" }),
      },
      ...(body === undefined
        ? {}
        : { body: bytes ? (body as unknown as RequestBody) : JSON.stringify(body) }),
    });
    const answer = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.ok) return answer;
    const error = (answer["error"] ?? {}) as { code?: unknown; message?: unknown };
    throw new RefusedError(
      typeof error.code === "string" ? error.code : String(response.status),
      typeof error.message === "string" ? error.message : `${method} ${path}: ${response.status}`,
    );
  }

  private settleWaiters(event: Frame): void {
    for (const waiter of [...this.waiters]) {
      const value = waiter.match(event);
      if (value !== undefined) {
        this.waiters.delete(waiter);
        waiter.resolve(value);
      }
    }
  }

  /**
   * An event into a run reaches that run; a message for this harness in a run's room reaches the
   * run too. One it overheard does not: it was for somebody else (ADR 0081).
   */
  private routeToRuns(event: Frame): void {
    if (event["type"] === "message.overheard") return;
    const runId = event["run_id"];
    if (typeof runId === "string") {
      this.activeRuns.get(runId)?.hear(event);
      return;
    }
    if (event["type"] !== "message.new") return;
    for (const run of this.activeRuns.values()) {
      if (run.spaceId === event["space_id"] && !run.over) run.hear(event);
    }
  }

  private readonly named: Readonly<Record<string, true>> = {
    "message.new": true,
    "message.overheard": true,
    "approval.resolved": true,
    "question.answered": true,
    "run.steer": true,
    "run.pause": true,
    "run.resume": true,
    "run.cancel": true,
    "run.requested": true,
    "lane.updated": true,
    "policy.updated": true,
    "budget.warning": true,
    "agent.attached": true,
    "agent.released": true,
    "agent.fork": true,
    "agent.asked": true,
    feedback: true,
  };

  private setState(state: ConnectionState): void {
    if (this.connectionState === state) return;
    this.connectionState = state;
    this.emitter.emit("state", state);
  }

  /**
   * Whether a first connect waits on this failure: told to wait for its server, and the server
   * couldn't be reached or couldn't answer (no answer at all, a 5xx, busy, or not on the relay
   * yet), rather than refusing this harness.
   */
  private waitsFor(error: unknown): boolean {
    if (this.options.waitForServer !== true) return false;
    if (!(error instanceof RefusedError)) return true;
    return /^(5\d\d|429)$/.test(error.code) || UNREACHABLE.has(error.code);
  }

  /** The first connect again after a wait, as a reconnect waits; `connect` resolves once it is in. */
  private tryAgain(why: string, resolve: () => void, reject: (error: ConnectError) => void): void {
    if (this.closed) {
      reject(new ConnectError("the connection was closed while waiting for the server"));
      return;
    }
    this.options.onWaiting?.(why);
    this.retry += 1;
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        this.open(true).then(resolve, reject);
      },
      Math.min(500 * this.retry, 5000),
    );
  }

  private scheduleReconnect(): void {
    if (this.closed || this.options.reconnect === false) {
      if (!this.closed) this.outbox.abandon("the connection dropped and reconnect is off");
      return;
    }
    this.retry += 1;
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        void this.open(false).catch(() => undefined);
      },
      Math.min(500 * this.retry, 5000),
    );
  }
}

/** The lane an ack names, in the SDK's words, or nothing when the frame names none. */
/** Node's own `WebSocket`, as a `SocketLike`. */
function openSocket(url: string): SocketLike {
  return new WebSocket(url) as unknown as SocketLike;
}

/** A refusal by its code and words, anything else as it says itself. */
function describe(error: unknown): string {
  return error instanceof RefusedError ? `${error.code}: ${error.message}` : String(error);
}

/** What `fetch` takes as a body, named from `fetch` itself: the CLI builds this without the DOM's types. */
type RequestBody = NonNullable<NonNullable<Parameters<typeof fetch>[1]>["body"]>;

function heldOf(frame: Frame): Pick<Ack, "held" | "exchange"> {
  if (frame["held"] !== true) return {};
  const exchange = frame["exchange"] as { count?: unknown; allowance?: unknown } | undefined;
  if (typeof exchange?.count !== "number") return { held: true };
  return {
    held: true,
    exchange: {
      count: exchange.count,
      ...(typeof exchange.allowance === "number" ? { allowance: exchange.allowance } : {}),
    },
  };
}

function laneOf(raw: unknown): Pick<Ack, "lane"> {
  if (typeof raw !== "object" || raw === null) return {};
  const lane = raw as Record<string, unknown>;
  if (
    typeof lane["lane_id"] !== "string" ||
    typeof lane["run_id"] !== "string" ||
    typeof lane["space_id"] !== "string"
  ) {
    return {};
  }
  return { lane: { laneId: lane["lane_id"], runId: lane["run_id"], spaceId: lane["space_id"] } };
}

/** Connect to chipsd. `const chips = await connect({ url, token })`. */
export function connect(options: ConnectOptions): Promise<Chips> {
  return Chips.connect(options);
}
