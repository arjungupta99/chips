/**
 * The socket: one connection, one event stream, one place that knows how to talk to `chipsd`.
 *
 * It keeps the `seq` it got to, so a reconnect resumes rather than starts over, and reconnects
 * on its own with backoff. What it is asked to send goes into the outbox first and to the wire
 * second: a send made before the socket is open, or while it is down, waits there, and every
 * socket that opens sends the unanswered events before anything else — so a message typed
 * during a reconnect is neither dropped nor shown as sending forever (phase-1-interim-review
 * finding 4). The server's `ack`, `error` and `receipt` frames settle the outbox and are passed
 * up, so the store can confirm a decision, mark a message as refused, or say what Chips did
 * with a message sent mid-run.
 *
 * Everything above it — the model, the cache, optimistic sends — is in the store, so this stays
 * a thin, replaceable adapter over a real WebSocket. Under Node it is never constructed; the
 * Playwright suite drives the real thing, and the outbox is tested on its own.
 */

import {
  type AgentState,
  type FolderOpenFrame,
  type FolderRunFrame,
  folderOpenFrame,
  folderRunFrame,
  folderRunStateFrame,
  type HeldRun,
  type JoinRequestView,
  joinFrame,
  presenceFrame,
} from "@chipschat/protocol";
import type { Device } from "./device.js";
import { endpoint, signRequest, socketOrigin } from "./device.js";
import type { ClientEvent } from "./events.js";
import {
  DEFAULT_PROBE_MS,
  directLink,
  doorLink,
  establishLink,
  type Link,
  LinkError,
  type LinkKind,
  type LinkSocket,
  linkFor,
  type NamedReach,
  type RelayAddress,
  reached,
  reachNamedBy,
  readOnLink,
  relayNamedBy,
  relayVerdict,
  servedThisPage,
  useLink,
} from "./link.js";
import { createOutbox, type OutboxEvent } from "./outbox.js";

/**
 * `rejected` is terminal and means something different from the other three: the server does
 * not know this device's key. Retrying cannot fix it — only pairing again can — so the client
 * stops rather than knocking on the door for ever (found by hand, 4 September 2026: a browser
 * holding a key from a workspace that had been replaced showed an empty shell and nothing else).
 *
 * `removed` is terminal too, and says more: the server knows this device, and its person was
 * removed from the workspace (ADR 0160). Pairing again cannot help either; a new invite can. The
 * screen says so rather than asking for a pairing that would never be let in.
 *
 * `asleep` is `closed` with a reason: the relay answered and said it has no server of this key.
 * It reconnects like `closed` does — a laptop that opens its lid registers again — but the
 * screen says something a person can act on rather than *Reconnecting…* (M4.2 scope change,
 * 6 September 2026).
 */
export type ConnectionState = "connecting" | "open" | "closed" | "rejected" | "removed" | "asleep";

/** The server has never heard of this device. Thrown by the ticket request, and terminal. */
export class UnknownDeviceError extends Error {
  override readonly name = "UnknownDeviceError";
}

/** This device's person was removed from the workspace (ADR 0160). Terminal, as unknown is. */
export class PersonRemovedError extends Error {
  override readonly name = "PersonRemovedError";
}

/** The server's own close for a removed person's sockets (ADR 0160), beside 4001's. */
export const CLOSE_PERSON_REMOVED = 4003;
/** The server's close for a socket it did not let in: no good ticket, or an ask it refused. */
const CLOSE_UNAUTHORIZED = 4001;

/** Whether a refusal of the ticket says the person was removed, rather than the key unknown. */
async function refusedAsRemoved(response: { json: () => Promise<unknown> }): Promise<boolean> {
  try {
    const body = (await response.json()) as { error?: { refusal?: unknown } } | null;
    return body?.error?.refusal === "person_removed";
  } catch {
    return false;
  }
}

/** The server's answer to one client event: it was appended, at this sequence number. */
export interface Ack {
  readonly idempotencyKey: string;
  readonly seq: number;
  /** True when the key had already been applied, so the resend changed nothing. */
  readonly duplicate: boolean;
}

/** The server refused something. With a key, it refused that event; without, the frame at large. */
export interface WireError {
  readonly code: string;
  readonly message: string;
  readonly idempotencyKey?: string | undefined;
  /** Which rule refused the event, when the server names one a client can offer a way on from. */
  readonly refusal?: string | undefined;
  /** For `agent_elsewhere`: the room the agent is in. */
  readonly spaceId?: string | undefined;
}

/** A harness's state changed (ADR 0083): whether it is connected, and what it says is wrong. */
export interface Presence {
  readonly participantId: string;
  readonly state: AgentState;
}

/** What Chips did with a message sent mid-run: queued for the harness's next look, or steered. */
export interface Receipt {
  readonly idempotencyKey: string;
  readonly disposition: "queued" | "steered";
}

export interface Transport {
  /** Send a client event. The store adds the idempotency key and the optimistic line. */
  readonly send: (event: OutboxEvent) => void;
  /**
   * Take an event out of the outbox, so a socket that opens does not send it. For a message a
   * person took back while it was still held: once the socket has carried it, withdrawing it
   * here changes nothing, which is why the app only offers it while the socket is shut.
   */
  readonly withdraw: (key: string) => void;
  /**
   * Something outside says this connection is worth checking now: an app coming back to the
   * foreground, most of all. A socket that is down is retried at once rather than after the
   * backoff, and one that has been quiet is closed and replaced rather than trusted.
   *
   * A phone is where this matters. The operating system freezes a backgrounded app's sockets
   * and does not always close them, so an app reopened after an hour can hold a socket that
   * looks open, will never say anything, and would take the silence check a further minute to
   * give up on. `AppState` is the signal, and it belongs to the app rather than here — the
   * browser's own equivalents, `online` and `offline`, are wired up below.
   */
  readonly wake: () => void;
  /**
   * Leave the relay for the server's own network now, if it answers (ADR 0211). A socket on the
   * relay is replaced by one through the door, opened first and let go of second, so nothing
   * blinks; a socket already direct, or a door that does not answer, changes nothing. Resolves
   * whether the socket goes direct now. The transport tries this itself every
   * `DIRECT_CHECK_MS`, on `wake` and when the network comes back; Go direct asks it more often.
   */
  readonly goDirect: () => Promise<boolean>;
  /**
   * Only direct, turned on or off (ADR 0211, Phase 2). On, a socket on the relay moves to the
   * server's own address if it answers, and is let go if it does not, so the next is dialled
   * there alone; off, a transport that could not connect tries again now, the relay with it.
   */
  readonly onlyDirect: (on: boolean) => void;
  readonly close: () => void;
}

/**
 * The person's ask, from another of their devices, for a room's folder: open it in Finder
 * (ADR 0225), open its page in Chips for Mac (ADR 0227), or run its project or stop it (ADR 0226).
 */
export interface FolderAsk {
  readonly spaceId: string;
  readonly op: "open" | "page" | "run" | "stop";
  /** For a run, what the asking device showed would run. */
  readonly command?: string | undefined;
  /** The name of the device that asked: "iPhone". */
  readonly from: string;
  readonly at: string;
}

/** What a folder frame asks: Run's start or stop, or Open's folder or page. */
function folderOpOf(asked: FolderOpenFrame | FolderRunFrame): FolderAsk["op"] {
  if ("op" in asked) return asked.op;
  return asked.what === "page" ? "page" : "open";
}

export interface TransportOptions {
  readonly device: Device;
  /**
   * Nothing is said on a socket until this settles (ADR 0253): the store's history read and
   * folded, so what the server replays lands on it. The way to the server is found meanwhile.
   */
  readonly greetAfter?: Promise<unknown> | undefined;
  readonly onEvent: (event: ClientEvent) => void;
  readonly onState: (state: ConnectionState) => void;
  readonly onAck?: ((ack: Ack) => void) | undefined;
  readonly onError?: ((error: WireError) => void) | undefined;
  readonly onReceipt?: ((receipt: Receipt) => void) | undefined;
  /** A harness's state changed (ADR 0083). */
  readonly onPresence?: ((presence: Presence) => void) | undefined;
  /** A join request is waiting, or changed (ADR 0122): an owner's or admin's socket hears these. */
  readonly onJoin?: ((request: JoinRequestView) => void) | undefined;
  /**
   * The person asked, from another of their devices, for a room's folder to be opened here
   * (ADR 0225), or its project run or stopped (ADR 0226). Given, the hello says `folders`, so the
   * server sends these: the Mac app's.
   */
  readonly onFolderAsk?: ((ask: FolderAsk) => void) | undefined;
  /**
   * The person's Mac said how a run of theirs stands (ADR 0226). Given, the hello says
   * `folder_runs`, so the server sends these to this person's sockets alone.
   */
  readonly onRunState?: ((spaceId: string, run: HeldRun) => void) | undefined;
  /** Which way this socket reached the server: the door on its network, the relay, or plain (M4.1, ADR 0191). */
  readonly onLink?: ((kind: LinkKind) => void) | undefined;
  /**
   * The server names a relay this device did not have, or the relay it had at another address
   * under the same key (ADR 0144). The transport reconnects through it from then on; this is for
   * keeping it with the device.
   */
  readonly onRelay?: ((relay: RelayAddress) => void) | undefined;
  /**
   * The server names a relay under a key this device did not pin at pairing (SEC-2,
   * `relayVerdict`). It is not taken and not kept: the device goes on with the relay it has, and
   * the person is told to pair again to follow the server to its new key.
   */
  readonly onRekeyed?: ((named: RelayAddress) => void) | undefined;
  /**
   * A device paired before servers had keys took its first from health, once (ADR 0191, Phase
   * 3), and its relay when the server names one. The transport tunnels to it from now on; this is
   * for keeping it with the device, so the next launch starts with the key.
   */
  readonly onFirstKey?: ((named: NamedReach) => void) | undefined;
  /**
   * Resume from here. The store passes the cursor its cache recorded — the `seq` it holds
   * everything up to — and never the highest `seq` it happens to hold (ADR 0049).
   */
  readonly since: number;
  /**
   * How long a socket may say nothing before this client gives up on it and opens another.
   *
   * The server pings every twenty seconds and closes a socket that has been silent for sixty
   * (decision 5); this is the same rule from the other end, which the protocol did not have.
   * Without it a socket that is open but dead — a proxy that outlived what it proxied, a NAT
   * that dropped the flow, a laptop that woke up — leaves the app looking connected for as long
   * as nobody sends anything. `close` is what the browser tells us; silence is what it does not.
   */
  readonly silenceMs?: number | undefined;
}

/** Where a paired device reads its server's relay and key (SEC-28). */
const SERVER_FACTS = "/v1/server";

/**
 * What `GET /v1/server` names to this device over `link`, read by `read` and signed for that link
 * (SEC-28). Nothing from a device with no key of its own to sign with: a stranger is told nothing.
 */
async function signedFacts<T>(
  device: Device,
  link: Link,
  read: (link: Link, url: string, init: RequestInit) => Promise<T | undefined>,
): Promise<T | undefined> {
  let headers: Record<string, string>;
  try {
    headers = await signRequest(device, "GET", SERVER_FACTS, "", link);
  } catch {
    return undefined;
  }
  return read(link, endpoint(device, SERVER_FACTS), { headers });
}

/**
 * The device with its first key, where it had none (ADR 0191, Phase 3). A device paired before
 * servers had keys holds an address and no key, so no tunnel can be made for it: on its first
 * connection after the update it reads `GET /v1/server`, signed, over the plain link one last time
 * and takes the key the server names, silently, as its first — SEC-2's `relayVerdict` admits a
 * first key — and every connection from then on is a tunnel to it. This is the one plain read
 * left in the transport, and a device makes it once: the key is kept with the record
 * (`onFirstKey`), and a device holding one is not asked here. A server that names no key leaves
 * the device as it was, to be asked again on its next connection; a browser the server itself
 * served names no address and is left to TLS, as everywhere.
 */
async function withFirstKey(
  device: Device,
  onFirstKey: TransportOptions["onFirstKey"],
): Promise<Device> {
  if (device.serverKey !== undefined || servedThisPage(device.serverUrl ?? "")) return device;
  const named = await signedFacts(device, directLink, reachNamedBy);
  if (named === undefined) return device;
  onFirstKey?.(named);
  return {
    ...device,
    serverKey: named.serverKey,
    ...(named.relayUrl === undefined ? {} : { relayUrl: named.relayUrl }),
  };
}

/** Where a socket's ticket is asked for. */
const SOCKET_TICKETS = "/v1/socket-tickets";

/**
 * The socket, over `link`. Inside a tunnel its open carries its ticket's ask — the signed request
 * for one, made in this tunnel and good in no other (ADR 0191, decision 6) — which the server
 * answers as the socket opens, a round trip sooner than asking first (ADR 0253). A browser cannot
 * set headers on a WebSocket handshake, and a device signature in the URL would be a durable
 * credential where URLs get logged (ADR 0006): so on the plain link, and to a server from before
 * the ask went in the open (`ask` false), the client makes the one signed request for a
 * single-use ticket first, then opens the socket with it.
 */
async function openSocket(device: Device, link: Link, ask: boolean): Promise<LinkSocket> {
  if (!ask || link.kind === "direct") return ticketedSocket(device, link);
  const headers = await signRequest(device, "POST", SOCKET_TICKETS, "", link);
  return link.socket(`${socketOrigin(device)}/v1/ws`, headers);
}

/** A ticket asked for over `link`, and the socket opened with it there. */
async function ticketedSocket(device: Device, link: Link): Promise<LinkSocket> {
  const target = SOCKET_TICKETS;
  const headers = await signRequest(device, "POST", target, "", link);
  const response = await link.fetch(endpoint(device, target), { method: "POST", headers });
  // 401 and 403 are the server saying this credential is not one of its own. Everything else —
  // a 500, a proxy, no network at all — is worth another try in a moment.
  if (response.status === 401 || response.status === 403) {
    if (await refusedAsRemoved(response)) {
      throw new PersonRemovedError("This device's person was removed from the workspace.");
    }
    throw new UnknownDeviceError("This server does not know this device.");
  }
  if (!response.ok) throw new Error(`${target} answered ${response.status}`);
  const { ticket } = (await response.json()) as { ticket: string };
  const url = `${socketOrigin(device)}/v1/ws?${new URLSearchParams({ ticket }).toString()}`;
  return link.socket(url);
}

type Frame = Record<string, unknown>;

/** Decision 5's sixty seconds, from the client's side. */
export const DEFAULT_SILENCE_MS = 60_000;
/** How often the silence is checked. Often enough to be prompt, rarely enough to cost nothing. */
const SILENCE_CHECK_MS = 5000;
/**
 * How often a socket on the relay asks whether the server's own network answers now (ADR 0211):
 * a phone that came home, or turned Tailscale on, goes direct within this without a reconnect.
 */
export const DIRECT_CHECK_MS = 120_000;

export function connect(options: TransportOptions): Transport {
  /** The device as this transport reaches it: the relay its server named since, once it has. */
  let device = options.device;
  let socket: LinkSocket | undefined;
  /** A socket given up on as quiet, still heard until the next is open (`replace`). */
  let retired: LinkSocket | undefined;
  /**
   * Past the handshake — hello said, subscribed — so an event frame may follow. A tunnel's socket
   * is greeted before it opens (ADR 0253), so it is open as well only once `opening` is over.
   */
  let ready = false;
  /** Between asking for a ticket and the socket settling, so two opens never race. */
  let opening = false;
  /**
   * Whether the server takes a socket's ticket ask in its open (ADR 0253): until it turns one away,
   * as a server from before does, after which this transport asks for tickets.
   */
  let asksInOpen = true;
  /** The socket opened on its ticket's ask, until it opens: a refusal of it is asked again. */
  let asking: LinkSocket | undefined;
  let closed = false;
  /** Which way the socket held reached the server, once one has. */
  let kind: LinkKind | undefined;
  /** The link the socket held came over: what the server's relay is asked over again. */
  let held: Link | undefined;
  /** Leaving the relay is under way (`goDirect`): one try at a time. */
  let moving = false;
  let since = options.since;
  let retry = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** When this client last heard anything at all, including a ping. */
  let lastHeard = Date.now();
  const silenceMs = options.silenceMs ?? DEFAULT_SILENCE_MS;
  const outbox = createOutbox();

  const frame = (event: OutboxEvent) => JSON.stringify({ frame: "event", event });

  /**
   * An owner turned the relay on while this device was connected: ask the server for it now, so
   * the device can reach the server away from home without coming home first (the new-person
   * sweep's finding 2). Otherwise it would learn of it only on its next connection.
   */
  const heard = (event: ClientEvent) => {
    if (event.type === "relay.set" && event["on"] === true && held !== undefined) {
      void learnRelay(held);
    }
  };
  const onEventFrame = (received: Frame) => {
    const event = received["event"] as ClientEvent;
    if (typeof event.seq === "number") since = Math.max(since, event.seq);
    options.onEvent(event);
    heard(event);
  };
  /** A page of a replay (ADR 0043). The same path as a single event, once per event. */
  const onEventsFrame = (received: Frame) => {
    const events = received["events"];
    if (!Array.isArray(events)) return;
    for (const event of events as ClientEvent[]) {
      if (typeof event.seq === "number") since = Math.max(since, event.seq);
      options.onEvent(event);
      heard(event);
    }
  };
  const onAckFrame = (received: Frame) => {
    const key = String(received["idempotency_key"]);
    outbox.settle(key);
    options.onAck?.({
      idempotencyKey: key,
      seq: Number(received["seq"]),
      duplicate: received["duplicate"] === true,
    });
  };
  const onErrorFrame = (received: Frame) => {
    const key = received["idempotency_key"];
    if (typeof key === "string") outbox.settle(key);
    const refusal = received["refusal"];
    const spaceId = received["space_id"];
    options.onError?.({
      code: String(received["code"]),
      message: String(received["message"]),
      idempotencyKey: typeof key === "string" ? key : undefined,
      ...(typeof refusal === "string" ? { refusal } : {}),
      ...(typeof spaceId === "string" ? { spaceId } : {}),
    });
  };
  const onReceiptFrame = (received: Frame) => {
    options.onReceipt?.({
      idempotencyKey: String(received["idempotency_key"]),
      disposition: received["disposition"] === "steered" ? "steered" : "queued",
    });
  };
  const onPresenceFrame = (received: Frame) => {
    const parsed = presenceFrame.safeParse(received);
    if (!parsed.success) return;
    options.onPresence?.({ participantId: parsed.data.participant_id, state: parsed.data.state });
  };
  const onJoinFrame = (received: Frame) => {
    const parsed = joinFrame.safeParse(received);
    if (parsed.success) options.onJoin?.(parsed.data.request);
  };
  const onFolderAskFrame = (received: Frame) => {
    const parsed = (
      received["frame"] === "folder.run" ? folderRunFrame : folderOpenFrame
    ).safeParse(received);
    if (!parsed.success) return;
    const { space_id, asked_from, asked_at } = parsed.data;
    const command = "command" in parsed.data ? parsed.data.command : undefined;
    options.onFolderAsk?.({
      spaceId: space_id,
      op: folderOpOf(parsed.data),
      ...(command === undefined ? {} : { command }),
      from: asked_from,
      at: asked_at,
    });
  };
  const onRunStateFrame = (received: Frame) => {
    const parsed = folderRunStateFrame.safeParse(received);
    if (parsed.success) options.onRunState?.(parsed.data.space_id, parsed.data.run);
  };
  /** Every server frame but the ping, which needs the socket to answer on. */
  const handleFrame = (received: Frame): void => {
    switch (received["frame"]) {
      case "event":
        onEventFrame(received);
        break;
      case "events":
        onEventsFrame(received);
        break;
      case "ack":
        onAckFrame(received);
        break;
      case "error":
        onErrorFrame(received);
        break;
      case "receipt":
        onReceiptFrame(received);
        break;
      case "presence":
        onPresenceFrame(received);
        break;
      case "join":
        onJoinFrame(received);
        break;
      case "folder.open":
      case "folder.run":
        onFolderAskFrame(received);
        break;
      case "folder.run_state":
        onRunStateFrame(received);
        break;
      default:
        break;
    }
  };

  /** Whether a socket may be greeted yet (`greetAfter`), and the one waiting to be. */
  let greetable = options.greetAfter === undefined;
  let toGreet: LinkSocket | undefined;
  const mayGreet = () => {
    greetable = true;
    const waiting = toGreet;
    toGreet = undefined;
    if (waiting !== undefined && waiting === socket && !closed) greet(waiting);
  };
  options.greetAfter?.then(mayGreet, mayGreet);
  /** Greet a socket, and from here frames may follow the greeting on it. */
  const greet = (ws: LinkSocket) => {
    if (!greetable) {
      toGreet = ws;
      return;
    }
    lastHeard = Date.now();
    handshake(ws);
    ready = true;
  };

  const handshake = (ws: LinkSocket) => {
    ws.send(
      JSON.stringify({
        frame: "hello",
        protocol: { min: 1, max: 1 },
        client: { name: "chips-core", version: "0.0.0" },
        // A replay of ten thousand messages is ten thousand frames otherwise (ADR 0043); whether
        // each agent can answer, as it changes (ADR 0083); join requests, which the server
        // sends only to an owner's or admin's socket (ADR 0122); and on the Mac, the person's
        // asks from their other devices to open a room's folder (ADR 0225) or run its project, and
        // anywhere, how a run of theirs on their Mac stands (ADR 0226).
        accepts: [
          "events",
          "presence",
          "join",
          ...(options.onFolderAsk === undefined ? [] : ["folders"]),
          ...(options.onRunState === undefined ? [] : ["folder_runs"]),
        ],
      }),
    );
    ws.send(JSON.stringify({ frame: "subscribe", workspace_id: device.workspaceId, since }));
    // Whatever the last socket did not get an answer for goes first. The server acks a resend
    // it already applied as a duplicate, so sending twice is safe by design.
    for (const event of outbox.unanswered()) ws.send(frame(event));
  };

  /** No socket came of this attempt: say why, and try again unless trying cannot help. */
  const failedToOpen = (error: unknown) => {
    opening = false;
    if (error instanceof UnknownDeviceError || error instanceof PersonRemovedError) {
      // Not offline: unknown, or no longer let in. No amount of waiting changes either.
      closed = true;
      options.onState(error instanceof PersonRemovedError ? "removed" : "rejected");
      return;
    }
    // The relay knows the difference between a network that will not carry us and a server
    // that is not there. When it says the second, so does the screen — and the loop keeps
    // trying, because the far side wakes up.
    options.onState(
      error instanceof LinkError && error.reason === "no_such_server" ? "asleep" : "closed",
    );
    scheduleReconnect();
  };

  /**
   * Whether the server names a relay this device does not know: a device paired before its
   * server had one, or before it moved, reaches it through the relay from the next reconnect.
   * Never under another key (SEC-2): the key pinned at pairing is what every tunnel is a
   * handshake against, and the server's facts are read inside that tunnel (ADR 0191) — or, for a
   * browser the server served and a device with no key yet, over the plain link, which
   * authenticates nothing. Signed either way: the relay and the key are a paired device's to read,
   * not a stranger's (SEC-28).
   */
  const learnRelay = async (link: Link) => {
    const named = await signedFacts(device, link, relayNamedBy);
    if (named === undefined || closed) return;
    const verdict = relayVerdict(device, named);
    if (verdict === "keep") return;
    if (verdict === "refuse") {
      options.onRekeyed?.(named);
      return;
    }
    device = { ...device, serverKey: named.serverKey, relayUrl: named.url };
    options.onRelay?.(named);
  };

  /** A socket has opened: the connection is up, and one not greeted yet is greeted now. */
  const opened = (ws: LinkSocket, greeted: boolean) => {
    opening = false;
    if (asking === ws) asking = undefined;
    retired?.close();
    retired = undefined;
    lastHeard = Date.now();
    retry = 0;
    if (!greeted) greet(ws);
    // A read the connection dropped under was waiting for this (ADR 0179).
    reached(device.deviceId);
    options.onState("open");
  };

  /** The socket asked for on `link`, and the link this connection goes by from now. */
  const goesBy = (link: Link, ws: LinkSocket, asked: boolean) => {
    asking = asked && link.kind !== "direct" ? ws : undefined;
    kind = link.kind;
    held = link;
    options.onLink?.(link.kind);
    void learnRelay(link);
  };

  /** Open a socket: on `on`, the link held, or on the link that reaches the server now. */
  const open = async (on?: Link) => {
    if (closed || opening) return;
    opening = true;
    options.onState("connecting");

    let ws: LinkSocket;
    const ask = asksInOpen;
    try {
      device = await withFirstKey(device, options.onFirstKey);
      const link = on ?? (await establishLink(device));
      useLink(device.deviceId, link);
      ws = await openSocket(device, link, ask);
      goesBy(link, ws, ask);
    } catch (error) {
      failedToOpen(error);
      return;
    }
    // Closed while the link and the ticket were on their way: `close` had no socket to close
    // then, so this one is nobody's, and left open it would be a second socket for the device.
    if (closed) {
      opening = false;
      ws.close();
      return;
    }
    socket = ws;
    // A tunnel's socket carries what is sent behind its open, in order, and the server reads none
    // of it unless it takes the socket (ADR 0253): greeted now, the server has the hello with the
    // open, a round trip sooner than after `opened`. A WebSocket of the platform's own takes
    // nothing until it opens.
    const early = kind !== "direct";
    if (early) greet(ws);

    ws.onopen = () => opened(ws, early);
    attach(ws);
  };

  /** What a socket does once it is the one: answer pings, take frames, and reconnect when it goes. */
  const attach = (ws: LinkSocket) => {
    ws.onmessage = (message) => {
      lastHeard = Date.now();
      const received = JSON.parse(String(message.data)) as Frame;
      if (received["frame"] === "ping") {
        ws.send(JSON.stringify({ frame: "pong", ts: received["ts"] }));
      } else {
        handleFrame(received);
      }
    };

    ws.onclose = (event) => {
      opening = false;
      ready = false;
      if (toGreet === ws) toGreet = undefined;
      // Removed from the workspace (ADR 0160): said now, with no knock on the door it closed.
      if (event?.code === CLOSE_PERSON_REMOVED) {
        closed = true;
        options.onState("removed");
        return;
      }
      // Turned away on its ticket's ask before it opened: a server from before ADR 0253, which
      // reads no ask, or a device it does not let in. Asked again at once with a ticket, on the
      // same link, which a server of either age answers, and says why when it is a refusal.
      if (ws === asking && event?.code === CLOSE_UNAUTHORIZED && held !== undefined) {
        asking = undefined;
        asksInOpen = false;
        void open(held);
        return;
      }
      options.onState("closed");
      scheduleReconnect();
    };
  };

  /** The socket on the relay and where its door is, when leaving the relay may be tried now. */
  const mayGoDirect = () => {
    const address = device.serverUrl;
    const key = device.serverKey;
    if (closed || opening || !ready || moving || socket === undefined || kind !== "relay") {
      return undefined;
    }
    if (address === undefined || address === "" || key === undefined) return undefined;
    return { from: socket, address, key };
  };
  /**
   * Off the relay, when the server's own network answers (ADR 0211). The door is dialled and a
   * ticket asked for through it while the relay's socket goes on carrying everything; only once
   * the door's socket is open is the relay's let go, and the new one subscribes from the last
   * `seq` heard, so nothing is missed and nothing blinks. A door that does not answer in the
   * probe's time, or a socket that closes before it opens, leaves the relay's socket as it was.
   */
  const goDirect = async (): Promise<boolean> => {
    if (kind !== "relay") return ready && !opening && kind !== undefined;
    const may = mayGoDirect();
    if (may === undefined) return false;
    moving = true;
    let door: Link | undefined;
    try {
      door = await doorLink(may.address, may.key, { timeoutMs: DEFAULT_PROBE_MS });
      const ws = await openSocket(device, door, asksInOpen);
      const opened = await new Promise<boolean>((resolve) => {
        ws.onopen = () => resolve(true);
        ws.onclose = () => resolve(false);
      });
      if (!opened || closed || socket !== may.from || !ready) {
        ws.close();
        door.close();
        return false;
      }
      takeOver(ws, door, may.from);
      return true;
    } catch {
      door?.close();
      return false;
    } finally {
      moving = false;
    }
  };
  /** The door's socket is open: the relay's goes, and everything from here is through the door. */
  const takeOver = (ws: LinkSocket, door: Link, from: LinkSocket) => {
    from.onclose = null;
    from.close();
    socket = ws;
    useLink(device.deviceId, door);
    kind = door.kind;
    options.onLink?.(door.kind);
    attach(ws);
    lastHeard = Date.now();
    handshake(ws);
  };

  const onlyDirect = (on: boolean) => {
    device = { ...device, onlyDirect: on };
    if (on && kind === "relay") {
      void goDirect().then((moved) => {
        if (!moved && kind === "relay" && device.onlyDirect === true) replace();
      });
      return;
    }
    if (!on && !ready) wake();
  };

  const scheduleReconnect = () => {
    if (closed) return;
    retry += 1;
    clearTimeout(timer);
    timer = setTimeout(
      () => {
        timer = undefined;
        void open();
      },
      Math.min(1000 * retry, 5000),
    );
  };

  // The browser knows when the network goes before the socket does: a dropped connection can
  // sit half-open for a minute, looking fine. Close it on `offline`, so the screen says so and
  // sends wait in the outbox, and come straight back on `online` rather than after a backoff.
  const wentOffline = () => socket?.close();
  const cameOnline = () => {
    // A socket waiting for the history before it says hello is a connection, not a lack of one.
    if (closed || opening || (toGreet !== undefined && toGreet === socket)) return;
    // Connected already: the network that came back may be the server's own (ADR 0211).
    if (ready) {
      void goDirect();
      return;
    }
    clearTimeout(timer);
    timer = undefined;
    retry = 0;
    void open();
  };
  /**
   * Give up on the socket held and open the next one now. Its `onclose` is not waited for: a
   * socket that has gone quiet may never say it has closed, and the reconnect behind it waited
   * out the backoff as well. A phone back after nine minutes showed a turn that had ended long
   * before as still going for as long as the next socket took, through the relay, to bring the
   * end (Arjun's iPhone, 14 October 2026).
   *
   * Nor is it closed yet: it is heard until the next one is open. A phone the relay let go of
   * while it slept may be holding the frames sent before it did, the end of that turn among them,
   * and is handed them a moment after it is told it is in front again. Closed then, they went
   * with it, and the end came seconds later through the relay; heard, it is there at once (the
   * simulator, the same day). Whatever both bring is folded once, by its `seq`.
   */
  const replace = () => {
    const quiet = socket;
    socket = undefined;
    ready = false;
    lastHeard = Date.now();
    if (quiet !== undefined) {
      quiet.onclose = null;
      retired?.close();
      retired = quiet;
    }
    options.onState("closed");
    cameOnline();
  };
  /**
   * Check this connection now. A socket that has been quiet for longer than the silence rule
   * allows is not a socket, whatever the runtime says about it: replacing it here reconnects at
   * once instead of leaving the app looking connected until the next sweep notices.
   */
  const wake = () => {
    if (closed) return;
    if (ready && Date.now() - lastHeard >= silenceMs) {
      replace();
      return;
    }
    // Back in front: a phone that came home on the way goes direct now (ADR 0211).
    cameOnline();
  };
  // Asking for the method, not for `window`. React Native defines `window` as an alias for the
  // global object and gives it no `addEventListener`, so its presence says nothing about what it
  // can do — a phone would pass the guard and then throw on the call (found on the first run on
  // a real iPhone). A runtime without these events falls back to the silence check below and the
  // reconnect backoff, which is slower to notice a dropped network but correct; on a phone the
  // equivalent signal is `AppState`, which belongs to the app rather than here.
  const listens = typeof window !== "undefined" && typeof window.addEventListener === "function";
  if (listens) {
    window.addEventListener("offline", wentOffline);
    window.addEventListener("online", cameOnline);
  }

  // And when the network does not go but the server does. A socket the browser still calls open
  // says nothing at all, so this is the only way to find out: the server pings every twenty
  // seconds, and silence for `silenceMs` means whatever is on the other end is not it.
  const listener = setInterval(() => {
    if (!ready || Date.now() - lastHeard < silenceMs) return;
    replace();
  }, SILENCE_CHECK_MS);
  // In Node this timer must not hold a finished process open. A browser's handle is a number
  // with nothing to call, which is also what the build's DOM-only typing sees.
  (listener as unknown as { unref?: () => void }).unref?.();
  // And while on the relay, whether the server's own network answers now (ADR 0211).
  const directCheck = setInterval(() => void goDirect(), DIRECT_CHECK_MS);
  (directCheck as unknown as { unref?: () => void }).unref?.();

  void open();

  return {
    send(event) {
      outbox.add(event);
      // Not `socket?.send`: a socket that is still connecting throws on send, and one that has
      // closed drops the frame. Either way the outbox has it for the next open.
      if (ready && socket !== undefined) socket.send(frame(event));
    },
    withdraw(key) {
      outbox.settle(key);
    },
    wake,
    goDirect,
    onlyDirect,
    close() {
      closed = true;
      clearTimeout(timer);
      clearInterval(listener);
      clearInterval(directCheck);
      if (listens) {
        window.removeEventListener("offline", wentOffline);
        window.removeEventListener("online", cameOnline);
      }
      retired?.close();
      socket?.close();
    },
  };
}

/**
 * A write the server refused, with what it said: its code, the rule that refused it, and anything
 * else the answer carried (a context file as it is now, for a stale edit, ADR 0134). An `Error`, so
 * a caller that only shows the words reads `message` as before.
 */
export class ServerRefused extends Error {
  override readonly name = "ServerRefused";
  readonly code: string | undefined;
  readonly refusal: string | undefined;
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown> & {
      readonly error?: { readonly code?: string; readonly refusal?: string };
    },
  ) {
    super(message);
    this.code = body.error?.code;
    this.refusal = body.error?.refusal;
  }
}

/**
 * A signed GET, for reads that do not need a socket: the participant directory, the audit. One the
 * connection drops under, or asked before the device has reached its server at all, waits for
 * the next socket and is asked again (ADR 0179's addendum). Asked once, You's devices on a phone
 * back on 5G went the network's way before the relay was up and said the server did not answer
 * until the app was closed (Arjun's iPhone, 16 October 2026).
 */
export async function getJson<T>(device: Device, path: string): Promise<T> {
  return await readOnLink(device, async (link) => {
    const headers = await signRequest(device, "GET", path, "", link);
    const response = await link.fetch(endpoint(device, path), { headers });
    // The status rides along, so a read can tell "the server holds none" (404) from no answer.
    if (!response.ok)
      throw Object.assign(new Error(`${path} answered ${response.status}`), {
        status: response.status,
      });
    return (await response.json()) as T;
  });
}

/**
 * A signed GET whose answer is a file's bytes, not JSON: one file of a room's project (ADR 0222),
 * with the type the server says it is. `signal` gives up on it, and through a tunnel the server
 * sends no more of it.
 */
export async function getBytes(
  device: Device,
  path: string,
  signal?: AbortSignal,
): Promise<{ bytes: Uint8Array; type: string }> {
  return await readOnLink(device, async (link) => {
    const headers = await signRequest(device, "GET", path, "", link);
    const response = await link.fetch(endpoint(device, path), {
      headers,
      ...(signal === undefined ? {} : { signal }),
    });
    // A refusal in the server's words: a page that can't be built says why (ADR 0223).
    if (!response.ok) {
      const failure = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
        error?: { message?: string; code?: string; refusal?: string };
      };
      throw new ServerRefused(
        failure.error?.message ?? `${path} answered ${response.status}`,
        response.status,
        failure,
      );
    }
    const type = response.headers.get("content-type") ?? "application/octet-stream";
    return { bytes: new Uint8Array(await response.arrayBuffer()), type };
  });
}

/** A signed POST with a JSON body, for the few writes that are not events: adding a harness. */
export async function postJson<T>(device: Device, path: string, body: unknown): Promise<T> {
  return await sendJson<T>(device, "POST", path, body);
}

/**
 * A signed DELETE, for what is removed rather than appended: a token, a room. A body says how,
 * where there is a choice: a room's one agent deleted with it (ADR 0087).
 */
export async function deleteJson<T>(device: Device, path: string, body?: unknown): Promise<T> {
  return await sendJson<T>(device, "DELETE", path, body);
}

/** A signed PUT with a JSON body, for what is replaced whole: a person's settings (M5.6). */
export async function putJson<T>(device: Device, path: string, body: unknown): Promise<T> {
  return await sendJson<T>(device, "PUT", path, body);
}

/** A signed PATCH with a JSON body: what a harness takes, said again (ADR 0046). */
export async function patchJson<T>(device: Device, path: string, body: unknown): Promise<T> {
  return await sendJson<T>(device, "PATCH", path, body);
}

async function sendJson<T>(
  device: Device,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const headers = {
    "content-type": "application/json",
    ...(await signRequest(device, method, path, raw)),
  };
  const response = await linkFor(device).fetch(endpoint(device, path), {
    method,
    headers,
    ...(raw === "" ? {} : { body: raw }),
  });
  if (!response.ok) {
    const failure = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
      error?: { message?: string; code?: string; refusal?: string };
    };
    throw new ServerRefused(
      failure.error?.message ?? `${path} answered ${response.status}`,
      response.status,
      failure,
    );
  }
  // A write that has nothing to say back answers `204` and no body, which is how putting a
  // space's face back to the default is answered. Parsing that as JSON threw on a write that
  // had worked, and the store took the reset back and said "not saved: JSON Parse error"
  // (Arjun, 26 September 2026).
  const text = await response.text();
  return (text === "" ? undefined : JSON.parse(text)) as T;
}
