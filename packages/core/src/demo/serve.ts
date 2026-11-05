/**
 * The demo's server, which is no server (ADR 0213): the store's own seams, handed the script. The
 * store is the one every workspace has (`createStore`); what it is given here is
 *
 * - a connection (`connect`) that opens, says hello with the demo's rooms, sends what the
 *   workspace already holds, and then each event the player plays, and that does for what the
 *   store sends what a server does: logs it with what a server writes into it, echoes it, acks it,
 *   says a message sent mid-run was steered, and says when a harness goes offline (`presence`);
 * - reads (`get`) answered from the made-up workspace: Search, a room's spend and files, and an
 *   agent's model, context files, context window and the rooms it has been in;
 * - writes (`post`) for what the films do: an agent's model, a file saved, a Compact now, a move
 *   and a fork (`agents.ts`), and what a room allows a job. Every other read and write is turned
 *   away, `not_in_demo`, at once and never left to hang;
 * - a cache (`openCache`) in memory, which starts with every room read to where the film begins;
 * - and a link for files (`demoLink`), which answers the invite card by id.
 *
 * Nothing here reaches a network, and nothing is written where the device keeps its workspaces.
 */

import {
  DEFAULT_SPEND_CEILING_USD,
  isAgentKind,
  isSpendCeiling,
  messageIdOf,
  resetsTheCount,
} from "@chipschat/protocol";
import type { Cache } from "../cache.js";
import type { Device, DeviceStorage } from "../device.js";
import type { ClientEvent } from "../events.js";
import type { Link } from "../link.js";
import type { KeptSpace } from "../madeHere.js";
import type { OutboxEvent } from "../outbox.js";
import type { QueuedMessage } from "../pending.js";
import type { ReadState } from "../read-state.js";
import { holdsTerms, searchTerms, wordMarks } from "../search.js";
import { SNIPPET_CLOSE, SNIPPET_OPEN } from "../store.js";
import { ServerRefused, type Transport, type TransportOptions } from "../transport.js";
import { type DemoAgents, keepAgents, refusal } from "./agents.js";
import { type Book, createBook, type Taken } from "./book.js";
import {
  DEMO_DEVICE_ID,
  DEMO_PERSON_ID,
  DEMO_WORKSPACE_ID,
  DEMO_WORKSPACE_NAME,
  demoId,
} from "./device.js";
import { inviteCardBytes } from "./picture.js";
import {
  type Act,
  CANNED_ANSWER,
  chapterLength,
  type DemoChapter,
  type DemoFilm,
  filmLength,
  filmOf,
  NOT_IN_DEMO_WORDS,
} from "./script.js";
import { CARD, type Draft, directoryRows, HISTORY, roomFaces } from "./workspace.js";

/** The code and refusal the demo turns things away with, for a client to offer Set up my own Chips. */
export const NOT_IN_DEMO = "not_in_demo";

/** The player's clock and the server's: the platform's, or a test's that runs in no time. */
export interface DemoClock {
  readonly now: () => number;
  readonly setTimeout: (run: () => void, ms: number) => unknown;
  readonly clearTimeout: (timer: unknown) => void;
}

export const REAL_CLOCK: DemoClock = {
  now: () => Date.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

/** What `createStore` takes for the demo's device, spread over whatever the app passes. */
export interface DemoStoreOptions {
  readonly connect: (options: TransportOptions) => Transport;
  readonly get: <T>(device: Device, path: string) => Promise<T>;
  readonly post: <T>(device: Device, path: string, body: unknown) => Promise<T>;
  readonly put: <T>(device: Device, path: string, body: unknown) => Promise<T>;
  readonly patch: <T>(device: Device, path: string, body: unknown) => Promise<T>;
  readonly remove: <T>(device: Device, path: string, body?: unknown) => Promise<T>;
  readonly openCache: (key: string) => Cache;
  readonly now: () => string;
  /** Holds nothing: the demo is never written where the device keeps its workspaces (point 7). */
  readonly deviceStorage: DeviceStorage;
}

/**
 * Something You did that the server took, by a tap or by the film: an event down the socket, or a
 * write over HTTP, by its path and its body.
 */
export type Heard =
  | { readonly via: "socket"; readonly event: ClientEvent }
  | { readonly via: "http"; readonly path: string; readonly body: Body };

type Body = Readonly<Record<string, unknown>>;

export interface DemoServer {
  readonly storeOptions: DemoStoreOptions;
  /** The demo's link, which `useLink` registers for the demo's device. */
  readonly link: Link;
  /** Say these, as the demo's harnesses would: stamped, logged, and sent to the store in order. */
  readonly play: (drafts: readonly Draft[]) => void;
  /** Hear what You did through the store, as the server took it, once the store has it too. */
  readonly onPerson: (listener: (heard: Heard) => void) => () => void;
  /** Answer You's messages with the one canned answer: once the film is over (point 7). */
  readonly answering: (on: boolean) => void;
  /** A harness connected again, or gone offline (ADR 0083): the directory, and a `presence` frame. */
  readonly presence: (harnessId: string, connected: boolean) => void;
  /** The newest message in a room with these words, by the id of the event that carried it. */
  readonly lineOf: (spaceId: string, text: string) => string | undefined;
}

export interface ServeOptions {
  readonly clock?: DemoClock | undefined;
  /** The film to play, by its key: the first when none is named. */
  readonly film?: string | DemoFilm | undefined;
  /**
   * The chapter of the film to start at: the workspace then holds everything the chapters before
   * it played, You's own messages, answers and changes as the server would have taken them, so a
   * store started here is where one that had played to here would be. The film's chapter count is
   * the whole film played: Look around.
   */
  readonly from?: number | undefined;
  /**
   * What the device showing the demo calls itself, as it would pair ("iPhone 17 Pro", "Safari on
   * Mac"): the one device of the made-up workspace, in You's Devices.
   */
  readonly deviceName?: string | undefined;
}

const MINUTE = 60_000;
/** How long the canned answer takes to come, so it reads as an answer and not an echo. */
const ANSWER_MS = 1200;
/** Chips's own relay, the one a server is given when it has none of its own (ADR 0245). */
const DEMO_RELAY = "wss://relay.chipschat.ai";

const iso = (ms: number) => new Date(ms).toISOString();

/** A chapter to start at, kept to the film: its chapter count is the whole film played. */
export function startingAt(film: DemoFilm, from: number | undefined): number {
  return Math.max(0, Math.min(from ?? 0, film.chapters.length));
}

/** The played time before a film's chapter: where the film had got to when it starts. */
function playedBefore(film: DemoFilm, chapter: number): number {
  return film.chapters.slice(0, chapter).reduce((sum, each) => sum + chapterLength(each), 0);
}

/** What the server holds and does, which the film is replayed into and the store talks to. */
interface Hands {
  readonly book: Book;
  readonly agents: DemoAgents;
  /** A write You made, done at `ts`: the server's answer, or its refusal thrown. */
  readonly write: (route: string, body: Body, ts: string) => unknown;
  readonly presence: (harnessId: string, connected: boolean, ts: string) => void;
}

export function serveDemo(options: ServeOptions = {}): DemoServer {
  const clock = options.clock ?? REAL_CLOCK;
  const film = filmOf(options.film);
  const from = startingAt(film, options.from);
  /** When this film started, as if it had played to `from` just now. */
  const start = clock.now() - playedBefore(film, from);
  const opened = start - before(film);
  const since = iso(start - 30 * MINUTE);
  const book = createBook();
  /** The harnesses offline now, with since when (ADR 0083). */
  const offline = new Map<string, string>();
  const agents = keepAgents(book, { since, offline: (harness) => offline.has(harness) });
  const hands: Hands = {
    book,
    agents,
    write: (route, body, ts) => {
      const done = agents.write(route, body, ts) ?? spendCeiling(book, route, body, ts);
      if (done === undefined) throw notInDemo(route);
      return done;
    },
    presence: (harnessId, connected, ts) => {
      if (connected) offline.delete(harnessId);
      else offline.set(harnessId, ts);
    },
  };
  for (const { ago, draft } of HISTORY) book.say(draft, iso(opened - ago));
  replayFilm(hands, film, from, start);
  const readTo = Object.fromEntries(book.rooms().map((room) => [room, book.lastSeqIn(room)]));

  const wires = new Map<TransportOptions, { upTo: number }>();
  const listeners = new Set<(heard: Heard) => void>();
  let answering = false;

  /** Everything logged that this store has not been sent, in order. */
  const push = (wire: TransportOptions): void => {
    const sent = wires.get(wire);
    if (sent === undefined) return;
    for (const event of book.events) {
      if (event.seq > sent.upTo) wire.onEvent(event);
    }
    sent.upTo = book.events.at(-1)?.seq ?? sent.upTo;
  };
  const pushAll = () => {
    for (const wire of wires.keys()) push(wire);
  };
  const tell = (heard: Heard) => {
    for (const listener of listeners) listener(heard);
  };

  const play = (drafts: readonly Draft[]): void => {
    for (const draft of drafts) book.say(draft, iso(clock.now()));
    later(pushAll);
  };

  /**
   * A person's message once the film is over: the one canned answer, from the agent it was for,
   * unless that agent's harness is offline, when the room's waiting line says so instead.
   */
  const answer = (event: ClientEvent): void => {
    if (!answering || event.type !== "message.post" || event.space_id === undefined) return;
    const space = event.space_id;
    const aimed = (event["addressed_to"] as readonly string[] | undefined)?.[0];
    const agent = book.agent(aimed ?? book.members(space).find(book.isAgent) ?? "");
    if (agent === undefined || offline.has(agent.harness)) return;
    clock.setTimeout(() => {
      const actor = { kind: "agent", id: agent.id, harness_id: agent.harness };
      const said = { type: "message.post", space_id: space, actor, text: CANNED_ANSWER };
      book.record(said, iso(clock.now()));
      later(pushAll);
    }, ANSWER_MS);
  };

  /** What the store hears back for something it sent: the echo, a receipt, the ack or the refusal. */
  const answerFor = (wire: TransportOptions, key: string, taken: Taken): void => {
    if (!wires.has(wire)) return;
    if (taken.kind === "refused") {
      const message = NOT_IN_DEMO_WORDS;
      wire.onError?.({ code: NOT_IN_DEMO, message, idempotencyKey: key, refusal: NOT_IN_DEMO });
      return;
    }
    pushAll();
    if (taken.steered) wire.onReceipt?.({ idempotencyKey: key, disposition: "steered" });
    const duplicate = taken.kind === "again";
    wire.onAck?.({ idempotencyKey: key, seq: taken.event.seq, duplicate });
    if (duplicate) return;
    tell({ via: "socket", event: taken.event });
    answer(taken.event);
  };

  const connect = (wire: TransportOptions): Transport => {
    later(() => {
      wires.set(wire, { upTo: wire.since });
      wire.onState("open");
      wire.onEvent(helloOf(book));
      push(wire);
    });
    return {
      send: (sent) => {
        const taken = book.take(sent, iso(clock.now()));
        later(() => answerFor(wire, sent.idempotency_key, taken));
      },
      withdraw: () => undefined,
      wake: () => undefined,
      goDirect: async () => false,
      onlyDirect: () => undefined,
      close: () => {
        wires.delete(wire);
      },
    };
  };

  /**
   * A write You made over HTTP: done now, as the server does it, and its events sent to the store
   * before the player hears of it, as a socket brings them after the answer.
   */
  const written = (path: string, raw: unknown): unknown => {
    const [route = ""] = path.split("?");
    const body: Body = typeof raw === "object" && raw !== null ? (raw as Body) : {};
    const done = hands.write(route, body, iso(clock.now()));
    later(() => {
      pushAll();
      tell({ via: "http", path: route, body });
    });
    return done;
  };

  const reads = readsOf(hands, {
    now: () => iso(clock.now()),
    since,
    offline,
    deviceName: options.deviceName ?? "This device",
  });
  return {
    storeOptions: {
      connect,
      get: async <T>(_device: Device, path: string) => reads(path) as T,
      post: async <T>(_device: Device, path: string, body: unknown) => written(path, body) as T,
      put: refuse,
      patch: refuse,
      remove: refuse,
      openCache: () => memoryCache(readTo),
      now: () => iso(clock.now()),
      deviceStorage: NOWHERE,
    },
    link: demoLink,
    play,
    onPerson: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    answering: (on) => {
      answering = on;
    },
    presence: (harnessId, connected) => {
      const ts = iso(clock.now());
      hands.presence(harnessId, connected, ts);
      later(() => {
        for (const wire of wires.keys()) {
          wire.onPresence?.({ participantId: harnessId, state: { connected, since: ts } });
        }
      });
    },
    lineOf: book.lineOf,
  };
}

/** After what is running now, as anything a socket delivers comes. */
function later(run: () => void): void {
  void Promise.resolve().then(run);
}

/** How long the films a film starts after played, back to the first: when the workspace opened. */
function before(film: DemoFilm): number {
  if (film.after === undefined) return 0;
  const after = filmOf(film.after);
  return before(after) + filmLength(after);
}

/**
 * A film played into the server up to `from`, after every film it starts from played whole, each
 * ending as the next begins at `start`.
 */
function replayFilm(hands: Hands, film: DemoFilm, from: number, start: number): void {
  if (film.after !== undefined) {
    const after = filmOf(film.after);
    replayFilm(hands, after, after.chapters.length, start - filmLength(after));
  }
  let at = start;
  for (const chapter of film.chapters.slice(0, from)) {
    replayChapter(hands, chapter, `demo-${film.key}-${chapter.key}`, at);
    at += chapterLength(chapter);
  }
}

/**
 * One chapter played into the server as the film plays it: each act done by the player when its
 * wait runs out, an answer approved, and every event and change at the time it would have come.
 */
function replayChapter(hands: Hands, chapter: DemoChapter, key: string, at: number): void {
  let time = at;
  for (const beat of chapter.beats) {
    time += beat.wait;
    for (const draft of beat.play ?? []) hands.book.say(draft, iso(time));
    if (beat.presence !== undefined) {
      hands.presence(beat.presence.harnessId, beat.presence.connected, iso(time));
    }
    if (beat.act === undefined) continue;
    replayAct(hands, beat.act, key, iso(time));
  }
}

/** An act done as the store would have sent it, and as the server takes it. */
function replayAct(hands: Hands, act: Act, key: string, ts: string): void {
  for (const request of requestsOf(act, key, hands)) {
    if (request.via === "socket") hands.book.take(request.event, ts);
    else hands.write(request.path, request.body, ts);
  }
}

/** What the store sends for an act: events down the socket, and writes over HTTP, in order. */
type Request =
  | { readonly via: "socket"; readonly event: OutboxEvent }
  | { readonly via: "http"; readonly path: string; readonly body: Body };

/**
 * Where the store writes for an act over HTTP, as its own method writes it, or nothing for an act
 * it sends down the socket. The player knows a person's tap by it.
 */
export function writePathOf(act: Act): string | undefined {
  const agent = "agentId" in act ? `/v1/agents/${encodeURIComponent(act.agentId)}` : "";
  switch (act.kind) {
    case "model":
      return `${agent}/model/changes`;
    case "context":
      return `${agent}/context/edits`;
    case "compact":
      return `${agent}/context-window/compactions`;
    case "fork":
      return `${agent}/fork`;
    case "move":
      return `${agent}/move`;
    case "spend":
      return `/v1/spaces/${encodeURIComponent(act.spaceId)}/spend-ceiling`;
    default:
      return undefined;
  }
}

/**
 * What the store sends for an act, as its own methods send it: `send`, `resolveApproval` and
 * `sendFeedback` down the socket; the agent's page's writes over HTTP; and `forkIntoNewRoom` both,
 * the room first.
 */
function requestsOf(act: Act, key: string, hands: Hands): Request[] {
  const path = writePathOf(act) ?? "";
  switch (act.kind) {
    case "send":
    case "approve":
      return [{ via: "socket", event: sentBy(act, key) }];
    case "notRight": {
      const line = hands.book.lineOf(act.spaceId, act.said);
      if (line === undefined) return [];
      const event = {
        type: "feedback",
        space_id: act.spaceId,
        message_id: messageIdOf(line),
        kind: "correction",
        text: act.text,
        idempotency_key: key,
      };
      return [{ via: "socket", event }];
    }
    case "model":
      return [{ via: "http", path, body: { model: act.model, effort: act.effort } }];
    case "context": {
      const copy = hands.agents.read(`/v1/agents/${act.agentId}/context`) as
        | { files: { name: string; hash?: string }[] }
        | undefined;
      const hash = copy?.files.find((file) => file.name === act.name)?.hash ?? null;
      return [{ via: "http", path, body: { name: act.name, text: act.text, base_hash: hash } }];
    }
    case "compact":
      return [{ via: "http", path, body: {} }];
    case "fork": {
      // The room's id is the store's to mint (`newId`); a replay mints the next of the demo's.
      const spaceId = demoId("space", hands.book.rooms().length + 1);
      const room = { type: "space.created", space_id: spaceId, kind: "group", title: act.title };
      return [
        { via: "socket", event: { ...room, idempotency_key: `${key}-room` } },
        { via: "http", path, body: { space_id: spaceId } },
      ];
    }
    case "move":
      return [{ via: "http", path, body: { space_id: act.spaceId } }];
    case "spend":
      return [{ via: "http", path, body: { usd: act.usd } }];
  }
}

/** What the store sends for a message or an answer, as its `send` and `resolveApproval` send it. */
export function sentBy(act: Extract<Act, { kind: "send" | "approve" }>, key: string): OutboxEvent {
  if (act.kind === "send") {
    const to = act.to === undefined ? {} : { to: act.to };
    return {
      type: "message.post",
      space_id: act.spaceId,
      text: act.text,
      ...to,
      idempotency_key: key,
    };
  }
  return {
    type: "approval.resolved",
    space_id: act.spaceId,
    run_id: act.runId,
    approval_id: act.approvalId,
    decision: "approved",
    scope: "once",
    idempotency_key: key,
  };
}

/**
 * What a room allows a job (ADR 0117, ADR 0196), set by You as the workspace's owner: logged as
 * the server logs it, or nothing changed when it is what the room allows already. Nothing for any
 * other path.
 */
function spendCeiling(book: Book, route: string, body: Body, ts: string): unknown {
  const spaceId = /^\/v1\/spaces\/([^/]+)\/spend-ceiling$/.exec(route)?.[1];
  if (spaceId === undefined) return undefined;
  const room = decodeURIComponent(spaceId);
  if (!book.rooms().includes(room)) {
    throw refusal(404, "not_found", "No space of that id that you are in.");
  }
  const usd = body["usd"];
  if (usd !== null && !(typeof usd === "number" && isSpendCeiling(usd))) {
    const message = "A job may be allowed from $0.25 to $100.00, in steps of 25 cents.";
    throw refusal(422, "invalid_event", message);
  }
  if ((book.ceilingOf(room) ?? null) === usd) return { space_id: room, usd, changed: false };
  book.record(
    {
      type: "space.spend_ceiling_set",
      space_id: room,
      actor: { kind: "person", id: DEMO_PERSON_ID },
      idempotency_key: `spend-ceiling-${room}-${usd ?? "default"}-at-${book.events.length}`,
      usd,
    },
    ts,
  );
  return { space_id: room, usd, changed: true };
}

function helloOf(book: Book): ClientEvent {
  return {
    type: "hello",
    spaces: book.rooms(),
    workspace: { id: DEMO_WORKSPACE_ID, name: DEMO_WORKSPACE_NAME },
  } as unknown as ClientEvent;
}

/** The reads the demo answers, by path, and every other turned away. */
function readsOf(
  hands: Hands,
  seen: {
    readonly now: () => string;
    readonly since: string;
    readonly offline: ReadonlyMap<string, string>;
    readonly deviceName: string;
  },
): (path: string) => unknown {
  const { book } = hands;
  // The made-up workspace's one device is the one showing it, here since the demo began; there
  // is no server to say it did not answer.
  const devices = () => ({
    devices: [
      {
        device_id: DEMO_DEVICE_ID,
        name: seen.deviceName,
        paired_at: seen.since,
        last_seen_at: seen.now(),
        revoked_at: null,
        current: true,
      },
    ],
  });
  const exact: Readonly<Record<string, (query: Query) => unknown>> = {
    "/v1/participants": () => ({
      participants: directoryRows(
        { now: seen.now(), since: seen.since },
        book.agents(),
        seen.offline,
      ),
    }),
    "/v1/me/space-icons": () => ({ icons: roomFaces() }),
    "/v1/me/hidden-spaces": () => ({ spaces: [] }),
    "/v1/me/pinned-spaces": () => ({ spaces: [] }),
    "/v1/me/pins": () => ({ pins: [] }),
    "/v1/me/notifications": () => ({ settings: null }),
    "/v1/devices": devices,
    // The switch as a server starts it with Chips's relay: off, its one device on its network. You
    // says Off on its row, and the page under it said nothing at all (the Duo simulator, 2 November
    // 2026). Turning it on is a write, and not in the demo.
    "/v1/relay": () => ({
      configured: true,
      url: DEMO_RELAY,
      on: false,
      status: "off",
      why: null,
      set_by: null,
      set_at: null,
      devices: [
        {
          device_id: DEMO_DEVICE_ID,
          participant_id: DEMO_PERSON_ID,
          name: seen.deviceName,
          now: "lan",
          last_via: "lan",
          last_via_at: seen.since,
          direct_at: seen.now(),
        },
      ],
      kept_link: null,
    }),
    "/v1/join": () => ({ requests: [] }),
    "/v1/direct-asks": () => ({ asks: [], kept_link: null }),
    "/v1/direct-asks/mine": () => ({ ask: null }),
    "/v1/events": (query) => ({ events: roomHistory(book, query), next_cursor: null }),
    "/v1/search": (query) => ({ hits: search(book, query), next_cursor: null }),
  };
  const patterns: readonly (readonly [RegExp, (id: string, query: Query) => unknown])[] = [
    [/^\/v1\/spaces\/([^/]+)\/spend$/, (id) => jobSpend(book, id)],
    [/^\/v1\/spaces\/([^/]+)\/files$/, (id, query) => ({ files: roomFiles(book, id, query) })],
    [
      /^\/v1\/people\/([^/]+)\/devices$/,
      (id) => (id === DEMO_PERSON_ID ? devices() : { devices: [] }),
    ],
  ];
  return (path) => {
    const [route = "", search = ""] = path.split("?");
    const query = queryOf(search);
    const read = exact[route];
    if (read !== undefined) return read(query);
    for (const [pattern, answer] of patterns) {
      const id = pattern.exec(route)?.[1];
      if (id !== undefined) return answer(decodeURIComponent(id), query);
    }
    const agents = hands.agents.read(route);
    if (agents !== undefined) return agents;
    throw notInDemo(route);
  };
}

type Query = ReadonlyMap<string, string>;

/** A query string, read by hand: React Native's `URL` has no `searchParams` to read it with. */
function queryOf(search: string): Query {
  const query = new Map<string, string>();
  for (const pair of search.split("&")) {
    if (pair === "") continue;
    const [name = "", value = ""] = pair.split("=");
    query.set(decodeURIComponent(name), decodeURIComponent(value.replace(/\+/g, " ")));
  }
  return query;
}

function roomHistory(book: Book, query: Query): readonly ClientEvent[] {
  const since = Number(query.get("since") ?? 0);
  const space = query.get("space_id");
  return book.events.filter((event) => event.space_id === space && event.seq > since);
}

/**
 * Whether a message holds the words, in the room asked about or in any: by the server's rule
 * (core's `holdsTerms`), the earlier words whole and the last a word's start.
 */
function holds(event: ClientEvent, terms: readonly string[], space: string | undefined): boolean {
  const text = event["text"];
  return (
    event.type === "message.post" &&
    (space === undefined || event.space_id === space) &&
    typeof text === "string" &&
    holdsTerms(text, terms)
  );
}

/** The demo's messages that hold the words, newest first, as the server's search finds them. */
function search(book: Book, query: Query): readonly Record<string, unknown>[] {
  const terms = searchTerms(query.get("q") ?? "");
  const space = query.get("space_id");
  const limit = Number(query.get("limit") ?? 20);
  if (terms.length === 0) return [];
  return book.events
    .filter((event) => holds(event, terms, space))
    .reverse()
    .slice(0, limit)
    .map((event) => ({
      kind: "message",
      space_id: event.space_id,
      at: event.ts,
      snippet: snippetOf(event["text"] as string, terms),
      message_id: messageIdOf(event.id),
      author_id: event.actor.id,
    }));
}

/** The words around the first match, each word found marked as the server marks it. */
function snippetOf(text: string, terms: readonly string[]): string {
  const plain = text.replace(/\s+/g, " ");
  const marks = wordMarks(plain, terms);
  const first = marks[0] ?? { start: 0, end: 0 };
  const from = Math.max(0, first.start - 40);
  const to = Math.min(plain.length, first.end + 60);
  let snippet = from > 0 ? "…" : "";
  let cut = from;
  for (const mark of marks) {
    if (mark.end > to) break;
    snippet += plain.slice(cut, mark.start) + SNIPPET_OPEN;
    snippet += plain.slice(mark.start, mark.end) + SNIPPET_CLOSE;
    cut = mark.end;
  }
  return snippet + plain.slice(cut, to) + (to < plain.length ? "…" : "");
}

/**
 * What a room's job has spent (ADR 0117), as the server works it out from the log: the job began
 * at the last thing a person did there, and each run counts what it reported costing after that,
 * its report being its total so far. A run of the job that reported nothing counts nothing, and
 * is said. Against what the room allows a job: its own, once You has set one, or the default.
 */
function jobSpend(book: Book, spaceId: string): Readonly<Record<string, number>> {
  const here = book.events.filter((event) => event.space_id === spaceId);
  const acts = here.filter(
    (event) => event.actor.kind === "person" && resetsTheCount(event.type, event),
  );
  const since = acts.at(-1)?.seq ?? 0;
  const reported = reportsOf(here, since);
  const working = new Set(
    here.flatMap((event) => (event.seq > since && byAgent(event) ? [event.run_id ?? ""] : [])),
  );
  working.delete("");
  const spent = [...working].reduce((sum, run) => sum + costAfter(reported.get(run)), 0);
  const uncounted = [...working].filter((run) => !(reported.get(run)?.after ?? 0)).length;
  return {
    ceiling_usd: book.ceilingOf(spaceId) ?? DEFAULT_SPEND_CEILING_USD,
    spent_usd: Math.round(spent * 100) / 100,
    since_seq: since,
    uncounted_runs: uncounted,
  };
}

const byAgent = (event: ClientEvent): boolean =>
  event.run_id !== undefined && isAgentKind(event.actor.kind);

/** Each run's last reported cost before the job began, and since, by run. */
function reportsOf(
  events: readonly ClientEvent[],
  since: number,
): Map<string, { before: number; after: number }> {
  const reported = new Map<string, { before: number; after: number }>();
  for (const event of events) {
    const usd = (event["cost"] as { usd?: number } | undefined)?.usd;
    if (!byAgent(event) || usd === undefined) continue;
    const run = event.run_id as string;
    const totals = reported.get(run) ?? { before: 0, after: 0 };
    if (event.seq > since) totals.after = usd;
    else totals.before = usd;
    reported.set(run, totals);
  }
  return reported;
}

/** What a run spent after the job began: its last total, less what it had reported before. */
function costAfter(
  totals: { readonly before: number; readonly after: number } | undefined,
): number {
  return totals === undefined || totals.after === 0 ? 0 : totals.after - totals.before;
}

/** A room's files, as `GET /v1/spaces/:id/files` lists them: the card, once Theo has posted it. */
function roomFiles(book: Book, spaceId: string, query: Query): readonly Record<string, unknown>[] {
  const name = query.get("name");
  return book.events
    .filter((event) => event.type === "message.post" && event.space_id === spaceId)
    .flatMap((event) =>
      ((event["attachments"] as (typeof CARD)[] | undefined) ?? []).map((file) => ({
        name: file.filename,
        version: 1,
        attachment_id: file.attachment_id,
        sha256: file.sha256,
        byte_size: file.byte_size,
        mime_type: file.mime_type,
        by: { id: event.actor.id, kind: event.actor.kind, name: book.nameOf(event.actor.id) },
        at: event.ts,
        message_id: messageIdOf(event.id),
        width: file.width,
        height: file.height,
      })),
    )
    .filter((file) => name === undefined || file.name === name);
}

const capital = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/** The refusal of anything the demo does not do: in the server's words, as a refusal comes. */
function notInDemo(path: string): ServerRefused {
  const message = `${capital(NOT_IN_DEMO_WORDS)}.`;
  const error = { code: NOT_IN_DEMO, refusal: NOT_IN_DEMO, message, path };
  return new ServerRefused(message, 501, { error });
}

/** Every write the store makes over HTTP that no film makes: none is in the demo. */
async function refuse<T>(_device: Device, path: string): Promise<T> {
  throw notInDemo(path);
}

/** The device storage the demo's store is given: it keeps nothing, and lists nothing. */
const NOWHERE: DeviceStorage = {
  entries: async () => [],
  put: async () => undefined,
  remove: async () => undefined,
};

/**
 * The cache, in memory: the store's own for as long as the demo runs, and nothing after. It starts
 * with each room read to where the film begins, as somebody who had read their rooms would have it.
 */
function memoryCache(readTo: ReadState): Cache {
  const events = new Map<number, ClientEvent>();
  let cursor = 0;
  let readState: ReadState = readTo;
  let outbox: QueuedMessage[] = [];
  let madeHere: KeptSpace[] = [];
  let participants: readonly unknown[] | undefined;
  let icons: Readonly<Record<string, unknown>> | undefined;
  let hidden: readonly string[] | undefined;
  let pinned: readonly string[] | undefined;
  return {
    loadEvents: async () => [...events.values()].sort((a, b) => a.seq - b.seq),
    saveEvents: async (batch) => {
      for (const event of batch) events.set(event.seq, event);
    },
    forgetSpaces: async (spaceIds) => {
      for (const [seq, event] of events) {
        if (event.space_id !== undefined && spaceIds.includes(event.space_id)) events.delete(seq);
      }
    },
    loadCursor: async () => cursor,
    saveCursor: async (seq) => {
      cursor = seq;
    },
    loadReadState: async () => readState,
    saveReadState: async (next) => {
      readState = next;
    },
    loadOutbox: async () => outbox,
    saveOutbox: async (messages) => {
      outbox = [...messages];
    },
    loadMadeHere: async () => madeHere,
    saveMadeHere: async (spaces) => {
      madeHere = [...spaces];
    },
    loadParticipants: async () => participants,
    saveParticipants: async (rows) => {
      participants = rows;
    },
    loadSpaceIcons: async () => icons,
    saveSpaceIcons: async (next) => {
      icons = next;
    },
    loadHiddenSpaces: async () => hidden,
    saveHiddenSpaces: async (spaceIds) => {
      hidden = spaceIds;
    },
    loadPinnedSpaces: async () => pinned,
    savePinnedSpaces: async (spaceIds) => {
      pinned = spaceIds;
    },
  };
}

/** The path of a URL, or the path it already is: the demo's device names no server. */
function pathOfUrl(url: string): string {
  return url.replace(/^[a-z]+:\/\/[^/]+/i, "");
}

/**
 * The demo's link: a tunnel to nowhere, which answers the invite card when a room asks for it by
 * id, in any of its variants, and says anything else is not in the demo. A tunnel, so no grant or
 * page door is asked for (`grantAttachment`): the bytes are fetched, as through the relay.
 */
export const demoLink: Link = {
  kind: "tunnel",
  fetch: async (url, init) => {
    const asked = /^\/v1\/attachments\/([^/?]+)(?:\?.*)?$/.exec(pathOfUrl(url))?.[1];
    if ((init?.method ?? "GET").toUpperCase() === "GET" && asked === CARD.attachment_id) {
      const bytes = inviteCardBytes();
      return new Response(bytes, {
        status: 200,
        headers: { "content-type": CARD.mime_type, "content-length": String(bytes.byteLength) },
      });
    }
    const message = `${capital(NOT_IN_DEMO_WORDS)}.`;
    return new Response(JSON.stringify({ error: { code: NOT_IN_DEMO, message } }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  },
  socket: () => {
    throw new Error(`${capital(NOT_IN_DEMO_WORDS)}: the demo has no server to open a socket to.`);
  },
  close: () => undefined,
};
