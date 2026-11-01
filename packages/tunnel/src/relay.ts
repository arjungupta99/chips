/**
 * Both ends of the relay's conversation, over a WebSocket (ADR 0038, ADR 0039).
 *
 * The relay is a switchboard and this is how each side speaks to it. A **server** dials
 * `/v1/serve`, answers the relay's challenge with a proof that it holds its key, and is then
 * told `open` each time a phone asks for it; every phone's bytes arrive on that one socket
 * under a sixteen-byte session id, and go back the same way. A **phone** dials `/v1/connect`,
 * names the key it wants, and once `connected` its socket is the tunnel's wire, raw.
 *
 * The socket is whatever the runtime has — the browser's, Node's global one, a phone's — and
 * is handed in as a factory, so this file needs no library and a test can pass a pair of fakes.
 * What the relay says is read with the protocol package's frames; what the relay moves is
 * never read here at all.
 */

import {
  parseRelayFrame,
  RELAY_SESSION_ID_BYTES,
  RELAY_VERSION,
  type RelayErrorCode,
  type RelayFrame,
} from "@chipschat/protocol";
import {
  asBytes,
  type Bytes,
  concat,
  copy,
  fromBase64url,
  fromHex,
  toBase64url,
  toHex,
} from "./bytes.js";
import { type KeyPair, proveKey } from "./keys.js";
import type { Wire } from "./mux.js";

/** What this file needs of a WebSocket: the browser's shape, which Node's global one shares. */
export interface SocketLike {
  binaryType: string;
  readonly send: (data: string | ArrayBufferLike | ArrayBufferView) => void;
  readonly close: (code?: number, reason?: string) => void;
  /** Bytes sent and not yet on the network; what paces a streamed body (ADR 0152). */
  readonly bufferedAmount?: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

function defaultSocket(url: string): SocketLike {
  const Ctor = (globalThis as { WebSocket?: new (url: string) => SocketLike }).WebSocket;
  if (Ctor === undefined) throw new RelayError("no_socket", "This runtime has no WebSocket.");
  return new Ctor(url);
}

/** Where a relay's two doors are. `wss://relay.example` or `ws://127.0.0.1:4440`, no path. */
export function relayEndpoint(url: string, door: "serve" | "connect"): string {
  return `${url.replace(/\/+$/, "")}/v1/${door}`;
}

export type RelayFailure =
  | RelayErrorCode
  | "closed"
  | "timeout"
  | "bad_frame"
  | "no_socket"
  | "socket_error";

export class RelayError extends Error {
  override readonly name = "RelayError";
  constructor(
    readonly code: RelayFailure,
    message: string,
  ) {
    super(message);
  }
}

/** The relay's socket closes with this when the other end of a session went away. */
export const CLOSE_PEER_GONE = 4002;

const DEFAULT_TIMEOUT_MS = 10_000;

function sendFrame(socket: SocketLike, frame: RelayFrame): void {
  socket.send(JSON.stringify(frame));
}

/** One settled-or-failed outcome for a dial, with the timeout the relay gets to answer in. */
function pending<T>(socket: SocketLike, timeoutMs: number) {
  let settled = false;
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const timer = setTimeout(() => fail("timeout", "The relay did not answer in time."), timeoutMs);
  function fail(code: RelayFailure, message: string): void {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    socket.close(1000, code);
    reject(new RelayError(code, message));
  }
  function done(value: T): void {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve(value);
  }
  return { promise, fail, done, isSettled: () => settled };
}

/**
 * A handler, and what came for it before one was set, kept for the first one set. A handler set
 * after another let go is not saved up for.
 */
class KeptFor<T> {
  private handler: ((value: T) => void) | undefined;
  private heard = false;
  private readonly early: T[] = [];

  get(): ((value: T) => void) | undefined {
    return this.handler;
  }

  set(next: ((value: T) => void) | undefined): void {
    this.handler = next;
    if (next === undefined) return;
    this.heard = true;
    for (let value = this.early.shift(); value !== undefined; value = this.early.shift()) {
      next(value);
    }
  }

  give(value: T): void {
    if (this.handler !== undefined) this.handler(value);
    else if (!this.heard) this.early.push(value);
  }
}

/** What the relay says on a wire once it is one: a close or an error, which closes the socket. */
function closeOnRelayWord(socket: SocketLike, data: string): void {
  const said = parseRelayFrame(data);
  if (said.ok && said.frame.frame === "close") socket.close(1000, said.frame.reason);
  else if (said.ok && said.frame.frame === "error") socket.close(1000, said.frame.code);
}

/**
 * A wire over one socket whose binary frames are the tunnel's, raw. What arrives before anyone
 * listens, and a close, are kept for the first listener: the server's answer to a handshake sent
 * with the dial can come in the same breath as the relay's `connected`, ahead of the hand-over
 * (ADR 0253).
 */
function wireOver(socket: SocketLike): Wire {
  const messages = new KeptFor<Bytes>();
  const closes = new KeptFor<string>();
  const wire: Wire = {
    get onmessage() {
      return messages.get();
    },
    set onmessage(next) {
      messages.set(next);
    },
    get onclose() {
      return closes.get();
    },
    set onclose(next) {
      closes.set(next);
    },
    send: (data) => socket.send(data),
    close: () => socket.close(1000, "done"),
    backlog: () => socket.bufferedAmount ?? 0,
  };
  socket.onmessage = (received) => {
    if (typeof received.data === "string") closeOnRelayWord(socket, received.data);
    else {
      const data = asBytes(received.data);
      if (data !== undefined) messages.give(data);
    }
  };
  socket.onclose = (event) => closes.give(event.reason || `closed_${event.code}`);
  socket.onerror = () => undefined;
  return wire;
}

/**
 * Bytes to send the moment a socket is open (ADR 0253): the tunnel handshake's first message,
 * worked out while the socket was opening, so it goes with the dial rather than a round trip
 * after it. A message that could not be made fails the dial.
 */
function sendWhenMade(
  first: Promise<Bytes> | undefined,
  dial: {
    readonly fail: (code: RelayFailure, message: string) => void;
    readonly isSettled: () => boolean;
  },
  send: (bytes: Bytes | undefined) => void,
): void {
  if (first === undefined) {
    send(undefined);
    return;
  }
  first.then(
    (bytes) => {
      if (!dial.isSettled()) send(bytes);
    },
    () => dial.fail("closed", "The tunnel's first message could not be made."),
  );
}

export interface RelayClientOptions {
  readonly url: string;
  /** The server's tunnel key, base64url, from the pairing payload. */
  readonly serverKey: string;
  readonly socket?: SocketFactory | undefined;
  readonly timeoutMs?: number | undefined;
  /**
   * The tunnel's first bytes, sent right behind the `connect` frame (ADR 0253). The relay puts
   * the phone through as it reads `connect`, before it says so, so these reach the server a
   * round trip sooner than if they waited for `connected`; to a server that is not there they
   * go nowhere.
   */
  readonly first?: Promise<Bytes> | undefined;
}

export interface RelayClientLink {
  readonly wire: Wire;
  readonly session: string;
}

/**
 * The phone's side: ask the relay for the server by key, with the tunnel's `first` bytes behind
 * the ask. Resolves once the relay says `connected`, with the socket as the tunnel's wire;
 * rejects with the relay's word when it says no — `no_such_server` is the one a phone shows as
 * *your server is not reachable*.
 */
export function connectThroughRelay(options: RelayClientOptions): Promise<RelayClientLink> {
  let socket: SocketLike;
  try {
    socket = (options.socket ?? defaultSocket)(relayEndpoint(options.url, "connect"));
  } catch (error) {
    return Promise.reject(error);
  }
  socket.binaryType = "arraybuffer";
  const dial = pending<RelayClientLink>(socket, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  socket.onopen = () => {
    sendWhenMade(options.first, dial, (first) => {
      const key = options.serverKey;
      sendFrame(socket, { frame: "connect", v: RELAY_VERSION, key, candidates: [] });
      if (first !== undefined) socket.send(first);
    });
  };
  socket.onerror = () => dial.fail("socket_error", "The relay could not be reached.");
  socket.onclose = (event) =>
    dial.fail("closed", `The relay closed the connection: ${event.reason || event.code}.`);
  socket.onmessage = (event) => {
    if (typeof event.data !== "string") return;
    const read = parseRelayFrame(event.data);
    if (!read.ok) {
      dial.fail("bad_frame", "The relay said something this client cannot read.");
      return;
    }
    if (read.frame.frame === "error") dial.fail(read.frame.code, read.frame.message);
    else if (read.frame.frame === "connected") {
      dial.done({ wire: wireOver(socket), session: read.frame.session });
    }
  };
  return dial.promise;
}

export interface DoorClientOptions {
  /** Where the door is: `ws://192.168.1.20:4431/v1/tunnel`. */
  readonly url: string;
  readonly socket?: SocketFactory | undefined;
  readonly timeoutMs?: number | undefined;
  /** The tunnel's first bytes, sent as the socket opens (ADR 0253). */
  readonly first?: Promise<Bytes> | undefined;
}

/**
 * The phone's side of the tunnel door on the server's own network (ADR 0191): dial it, and once
 * the socket is open it is the tunnel's wire, raw, with the `first` bytes already on it. The
 * relay's conversation without the relay: there is nobody to ask for the server by key, since
 * whatever answered at the address is what the handshake that follows will hold to the key.
 * Rejects in the relay's words when nothing answers, or not in time.
 */
export function dialTunnelDoor(options: DoorClientOptions): Promise<{ readonly wire: Wire }> {
  let socket: SocketLike;
  try {
    socket = (options.socket ?? defaultSocket)(options.url);
  } catch (error) {
    return Promise.reject(error);
  }
  socket.binaryType = "arraybuffer";
  const dial = pending<{ readonly wire: Wire }>(socket, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  socket.onopen = () =>
    sendWhenMade(options.first, dial, (first) => {
      const wire = wireOver(socket);
      if (first !== undefined) wire.send(first);
      dial.done({ wire });
    });
  socket.onerror = () => dial.fail("socket_error", "The door could not be reached.");
  socket.onclose = (event) =>
    dial.fail("closed", `The door closed the connection: ${event.reason || event.code}.`);
  return dial.promise;
}

export interface RelaySession {
  readonly id: string;
  /** The phone's address as the relay saw it. */
  readonly from: string;
  readonly wire: Wire;
}

export interface RelayServerOptions {
  readonly url: string;
  readonly key: KeyPair;
  readonly socket?: SocketFactory | undefined;
  readonly timeoutMs?: number | undefined;
  /** A phone is through: its wire carries the handshake next. */
  readonly onOpen: (session: RelaySession) => void;
}

export interface RelayServerLink {
  /** How many phones the relay will hold open for this server at once. */
  readonly sessionLimit: number;
  readonly sessions: () => number;
  readonly close: () => void;
  onclose: ((reason: string) => void) | undefined;
}

/** The relay's challenge, answered with a proof the relay can check (`proveKey`). */
async function answerChallenge(
  socket: SocketLike,
  key: KeyPair,
  challenge: Extract<RelayFrame, { frame: "challenge" }>,
): Promise<void> {
  const proof = await proveKey(
    key,
    fromBase64url(challenge.nonce),
    fromBase64url(challenge.ephemeral),
  );
  sendFrame(socket, {
    frame: "serve",
    v: RELAY_VERSION,
    key: toBase64url(key.publicKey),
    proof: toBase64url(proof),
    candidates: [],
  });
}

/** The sessions the relay opens on a server's socket, each a wire under its id. */
class Sessions {
  private readonly wires = new Map<string, Wire>();
  constructor(private readonly socket: SocketLike) {}

  get size(): number {
    return this.wires.size;
  }

  open(id: string): Wire {
    const prefix = fromHex(id);
    const wire: Wire = {
      onmessage: undefined,
      onclose: undefined,
      send: (data) => this.socket.send(concat(prefix, data)),
      // One socket carries every phone's session, so they are all paced by its one backlog.
      backlog: () => this.socket.bufferedAmount ?? 0,
      close: () => {
        if (!this.wires.has(id)) return;
        this.wires.delete(id);
        sendFrame(this.socket, { frame: "close", v: RELAY_VERSION, session: id, reason: "done" });
      },
    };
    this.wires.set(id, wire);
    return wire;
  }

  end(id: string, reason: string): void {
    const wire = this.wires.get(id);
    if (wire === undefined) return;
    this.wires.delete(id);
    wire.onclose?.(reason);
  }

  endAll(reason: string): void {
    for (const id of [...this.wires.keys()]) this.end(id, reason);
  }

  /** A binary frame from the relay: the session's id, then the bytes for its wire. */
  deliver(data: Bytes): void {
    if (data.length < RELAY_SESSION_ID_BYTES) return;
    const id = toHex(data.subarray(0, RELAY_SESSION_ID_BYTES));
    this.wires.get(id)?.onmessage?.(copy(data.subarray(RELAY_SESSION_ID_BYTES)));
  }
}

/**
 * The server's side: dial the relay, prove the key, and take the sessions it opens. Resolves
 * once the relay says `serving`; every reconnect is the caller's, with whatever backoff it
 * likes, by calling this again.
 */
export function serveThroughRelay(options: RelayServerOptions): Promise<RelayServerLink> {
  let socket: SocketLike;
  try {
    socket = (options.socket ?? defaultSocket)(relayEndpoint(options.url, "serve"));
  } catch (error) {
    return Promise.reject(error);
  }
  socket.binaryType = "arraybuffer";
  const sessions = new Sessions(socket);
  const dial = pending<RelayServerLink>(socket, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let link: RelayServerLink | undefined;

  const onControl = (frame: RelayFrame) => {
    switch (frame.frame) {
      case "challenge":
        answerChallenge(socket, options.key, frame).catch(() =>
          dial.fail("bad_frame", "The relay's challenge could not be answered."),
        );
        return;
      case "serving":
        link = {
          sessionLimit: frame.session_limit,
          sessions: () => sessions.size,
          onclose: undefined,
          close: () => socket.close(1000, "done"),
        };
        dial.done(link);
        return;
      case "open":
        options.onOpen({ id: frame.session, from: frame.from, wire: sessions.open(frame.session) });
        return;
      case "close":
        sessions.end(frame.session, frame.reason);
        return;
      case "error":
        if (dial.isSettled()) socket.close(1000, frame.code);
        else dial.fail(frame.code, frame.message);
        return;
      default:
        return;
    }
  };

  socket.onopen = () => undefined;
  socket.onerror = () => dial.fail("socket_error", "The relay could not be reached.");
  socket.onclose = (event) => {
    const reason = event.reason || `closed_${event.code}`;
    sessions.endAll(reason);
    if (dial.isSettled()) link?.onclose?.(reason);
    else dial.fail("closed", `The relay closed the connection: ${reason}.`);
  };
  socket.onmessage = (event) => {
    if (typeof event.data === "string") {
      const read = parseRelayFrame(event.data);
      if (read.ok) onControl(read.frame);
      return;
    }
    const data = asBytes(event.data);
    if (data !== undefined) sessions.deliver(data);
  };
  return dial.promise;
}

/** A session id as the relay's binary frames carry it. Exported for the switchboard's tests. */
export function sessionPrefix(id: string): Bytes {
  return fromHex(id);
}
