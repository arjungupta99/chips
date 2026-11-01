/**
 * The relay link (M4.1, ADR 0038, ADR 0039): the home server dialling out.
 *
 * With `CHIPS_RELAY_URL` set, chipsd keeps one WebSocket open to the relay, proves its tunnel
 * key there, and is told `open` each time a phone asks for it. Each phone's bytes are a Noise
 * NK handshake and then a tunnel, and what crosses the tunnel is what would have crossed the
 * port: a request becomes a `Request` for the same Hono app the port serves — same
 * authentication, same routes, same door — and a socket opened with a ticket becomes a session
 * in the same hub as a socket at `/v1/ws`. The relay sees ciphertext; this end sees exactly what
 * the port would see, plus the address the relay saw the phone at, for the limiter.
 *
 * Two things the port does not have. A cap on unauthenticated requests per tunnel per minute
 * (phase-5-review finding 8): pairing, invites and the passkey challenge are the doors with no
 * credential, and a tunnel is a stranger until one of them lets it in. And a reconnect loop with
 * backoff: the relay is a box somebody else runs, and the link comes back on its own. A relay
 * that serves a list of servers and has not been told this one's key turns it away; the log then
 * says the key and where it goes, and the loop lists the server once the relay has it.
 *
 * The answering of one tunnel — the handshake, the request handler, the socket handler, the
 * stranger cap and the body budgets — is `answerTunnel`, which the relay's sessions and the
 * tunnel door on the server's own network (`interfaces/tunnel/door.ts`, ADR 0191) both call.
 * What differs between them is the `TunnelPeer`: the wire the bytes arrive on, whose word the
 * address is, and what the app and the hub are told about where the phone came from.
 */

import { isIP } from "node:net";
import type { Logger } from "@chipschat/platform";
import { RELAY_ERROR_CODES, RELAY_VERSION } from "@chipschat/protocol";
import {
  type AnswererHandlers,
  createAnswerer,
  createChannel,
  type KeyPair,
  RelayError,
  type RelayServerLink,
  type RelaySession,
  type RequestInput,
  type ResponseOutput,
  respondHandshake,
  type SocketFactory,
  type StreamedOutput,
  serveThroughRelay,
  toBase64url,
  toHex,
  type Wire,
} from "@chipschat/tunnel";
import { isOpenRoute, UNAUTHENTICATED_BODY_BYTES } from "../http/app.js";
import type { GatewayEnv, RelayStatus, RelayTrouble } from "../http/context.js";
import { errorBody } from "../http/errors.js";
import type { SessionHub } from "../ws/hub.js";

export interface RelayLinkLimits {
  /** Requests with no credential a tunnel may make in a minute. */
  readonly unauthenticatedPerMinute?: number | undefined;
  readonly maxInFlight?: number | undefined;
  readonly maxSockets?: number | undefined;
  /** The most a tunnelled request's body may hold: an upload's, so the attachment limit. */
  readonly maxBodyBytes?: number | undefined;
  /** The most a tunnelled socket's one message may hold; `maxBodyBytes` unless said. */
  readonly maxSocketMessageBytes?: number | undefined;
  /**
   * The most a request with no credential in its headers may hold (SEC-11), whoever holds the
   * server's public key being able to send one: `UNAUTHENTICATED_BODY_BYTES` unless said.
   */
  readonly unauthenticatedBodyBytes?: number | undefined;
}

/** What answering a tunnel needs, whichever way the phone came in. */
export interface TunnelAnswerOptions {
  readonly keyPair: () => Promise<KeyPair>;
  /** The Hono app, as `app.fetch`: the same one the port serves. */
  readonly app: {
    readonly fetch: (request: Request, env: GatewayEnv["Bindings"]) => Response | Promise<Response>;
  };
  readonly hub: Pick<SessionHub, "open" | "redeemTicket">;
  readonly limits?: RelayLinkLimits | undefined;
  readonly now?: (() => number) | undefined;
}

export interface RelayLinkOptions extends TunnelAnswerOptions {
  readonly url: string;
  readonly logger: Logger;
  readonly socket?: SocketFactory | undefined;
  /** How long to wait before dialling again, from the first failure to the most patient. */
  readonly backoffMs?: { readonly min: number; readonly max: number } | undefined;
}

/**
 * The other end of one tunnel, as this end is to treat it: where its bytes arrive, whose word
 * its address is, and what the app and the hub are told about it. The relay's sessions and the
 * tunnel door (ADR 0191) differ in nothing else.
 */
export interface TunnelPeer {
  /** The bytes, both ways: a relay session's frames, or the door's own socket. */
  readonly wire: Wire;
  /** The phone's address: the relay's word, or the door's socket's own peer. */
  readonly from: string;
  /**
   * What `app.fetch` is handed with every request: `relay` for a phone the relay saw, `lan` for
   * one at the door, so the limiter counts it and the join rules judge it as its way in deserves.
   */
  readonly env: GatewayEnv["Bindings"];
  /** The address a tunnelled request's URL is built on. Nothing resolves it; the path is what matters. */
  readonly origin: string;
  /** The transport the hub names a tunnelled socket's session by, for the log. */
  readonly via: "relay" | "lan";
}

/** What the caller of `answerTunnel` hears, so it can count what is open. */
export interface TunnelHooks {
  /** The handshake is done and the tunnel answers from here. */
  readonly onOpen?: (() => void) | undefined;
  /** The tunnel is over, after `onOpen`; a handshake that failed is not a tunnel and is not said. */
  readonly onClose?: ((reason: string) => void) | undefined;
}

export interface RelayLink {
  readonly status: () => RelayStatus;
  /** Why the last try to dial failed, until one succeeds: what the owner's switch shows. */
  readonly trouble: () => RelayTrouble | undefined;
  /** Tunnels open right now. */
  readonly sessions: () => number;
  /** Resolves the next time the link is up. For a test, and for `chips doctor` one day. */
  readonly connected: () => Promise<void>;
  readonly close: () => Promise<void>;
}

/** The address the app is given for a request through the relay. Nothing resolves it; the path is what matters. */
const RELAY_ORIGIN = "http://relay.local";

/** What the relay said when it turned the server away, or that it could not be reached. */
function troubleOf(error: unknown): RelayTrouble {
  if (!(error instanceof RelayError)) return "unreachable";
  if (error.code === "busy" || error.code === "not_allowed") return error.code;
  return (RELAY_ERROR_CODES as readonly string[]).includes(error.code) ? "refused" : "unreachable";
}
const MINUTE_MS = 60_000;
const DEFAULT_UNAUTHENTICATED_PER_MINUTE = 30;

/**
 * Where a tunnel's phone is, on the relay's word, which the server never authenticates (SEC-27):
 * an address is taken as given, and anything else — nothing, or words — is one bucket for the
 * limiter, `unknown`, which no join card shows and which the server's own `local` bucket is not.
 */
export function addressFrom(from: string): string {
  return isIP(from) === 0 ? "unknown" : from;
}

/** The close code a tunnelled socket hears when its target is not `/v1/ws`. */
const CLOSE_NO_SUCH_DOOR = 4004;
/** The close code a tunnelled socket hears when its ticket is not good. */
const CLOSE_UNAUTHORIZED = 4001;

/**
 * Whether the app will check no credential on this request, so it is a stranger's: one bound for
 * an open door, whatever headers it carries (SEC-21: a made-up `x-chips-device` on `/v1/pair`
 * was not counted), or one bound anywhere with no credential offered at all.
 */
function isStrangers(input: Pick<RequestInput, "method" | "target" | "headers">): boolean {
  // The path alone matters, whichever origin a tunnelled request's URL is built on.
  const path = new URL(input.target, RELAY_ORIGIN).pathname;
  if (isOpenRoute(input.method.toUpperCase(), path)) return true;
  const names = new Set(Object.keys(input.headers ?? {}).map((name) => name.toLowerCase()));
  return !names.has("authorization") && !names.has("x-chips-device");
}

function refused(
  status: number,
  code: "rate_limited" | "invalid_event",
  message: string,
  retryAfter?: number,
): ResponseOutput {
  const body = JSON.stringify(errorBody(code, message, "relay", undefined, retryAfter));
  return {
    status,
    headers: { "content-type": "application/json" },
    body: new TextEncoder().encode(body) as Uint8Array<ArrayBuffer>,
  };
}

/** Requests with no credential, counted per tunnel over a sliding minute. */
function strangerCounter(perMinute: number, now: () => number) {
  const times: number[] = [];
  return {
    /** Count one. False when this tunnel has had its share for the minute. */
    allow(): boolean {
      const since = now() - MINUTE_MS;
      while (times.length > 0 && (times[0] ?? 0) < since) times.shift();
      if (times.length >= perMinute) return false;
      times.push(now());
      return true;
    },
  };
}

/** What the tunnel brought, as the `Request` the port would have handed the app. */
function requestOf(input: RequestInput, headers: Record<string, string>, origin: string): Request {
  const method = input.method.toUpperCase();
  // A copy over its own buffer: what `Request` takes, whatever buffer the tunnel handed over.
  const body =
    method === "GET" || method === "HEAD" || input.body === undefined
      ? undefined
      : new Uint8Array(input.body);
  return new Request(`${origin}${input.target}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body }),
  });
}

/** A tunnelled request, as a `Request` for the app, with the peer's word on where it came from. */
function requestHandler(
  peer: TunnelPeer,
  options: TunnelAnswerOptions,
  log: Logger,
): AnswererHandlers["request"] {
  const now = options.now ?? Date.now;
  const strangers = strangerCounter(
    options.limits?.unauthenticatedPerMinute ?? DEFAULT_UNAUTHENTICATED_PER_MINUTE,
    now,
  );
  return async (input: RequestInput): Promise<ResponseOutput | StreamedOutput> => {
    if (!input.target.startsWith("/")) return refused(422, "invalid_event", "A target is a path.");
    const headers = input.headers ?? {};
    if (isStrangers(input) && !strangers.allow()) {
      log.warn({ target: input.target }, "tunnel rate limited");
      return refused(
        429,
        "rate_limited",
        "Too many requests without a credential through this tunnel. Try again in a minute.",
        60,
      );
    }
    const response = await options.app.fetch(requestOf(input, headers, peer.origin), peer.env);
    const answer = { status: response.status, headers: Object.fromEntries(response.headers) };
    // The body as it is read (ADR 0152): a file goes out a frame at a time, behind nothing and
    // ahead of nothing for long, rather than read whole and queued before anything else.
    return response.body === null
      ? { ...answer, body: new Uint8Array(0) }
      : { ...answer, body: response.body };
  };
}

/** Where a socket's ticket is asked for, which a tunnelled open may carry the ask of. */
const SOCKET_TICKETS = "/v1/socket-tickets";
/** The close code a tunnelled socket hears when the app could not answer its ask for a ticket. */
const CLOSE_UNANSWERED = 1011;

type Refusal = { readonly ok: false; readonly code: number; readonly reason: string };
const UNAUTHORIZED: Refusal = { ok: false, code: CLOSE_UNAUTHORIZED, reason: "unauthorized" };
const UNANSWERED: Refusal = { ok: false, code: CLOSE_UNANSWERED, reason: "unanswered" };

/**
 * The ticket a socket's open asks for in its headers (ADR 0253): the request it would have made
 * for one, `POST /v1/socket-tickets` signed in this tunnel, put to the app as that request, so
 * the same authentication, the same rules and the same say let it in or do not. One with no
 * credential at all is a stranger's, which the app would refuse, and is refused without asking it.
 */
async function ticketAsked(
  headers: Record<string, string>,
  peer: TunnelPeer,
  options: TunnelAnswerOptions,
): Promise<string | Refusal> {
  const ask = { method: "POST", target: SOCKET_TICKETS, headers };
  if (isStrangers(ask)) return UNAUTHORIZED;
  const response = await options.app.fetch(requestOf(ask, headers, peer.origin), peer.env);
  if (response.status === 401 || response.status === 403) return UNAUTHORIZED;
  const body: unknown = response.ok ? await response.json().catch(() => undefined) : undefined;
  const ticket = (body as { ticket?: unknown } | undefined)?.ticket;
  return typeof ticket === "string" ? ticket : UNANSWERED;
}

/** The ticket a socket comes with: in its target, or asked for in its open's headers. */
function ticketFor(
  url: URL,
  headers: Record<string, string> | undefined,
  peer: TunnelPeer,
  options: TunnelAnswerOptions,
): string | Refusal | Promise<string | Refusal> {
  const ticket = url.searchParams.get("ticket");
  if (ticket !== null) return ticket;
  return headers === undefined ? UNAUTHORIZED : ticketAsked(headers, peer, options);
}

/**
 * A tunnelled socket: a session in the same hub, for a ticket spent at the same door — or for the
 * ticket's own ask, carried in the open and answered here (ADR 0253), so the socket is open a
 * round trip sooner on exactly the same say. A refusal is `unauthorized` either way, which a phone
 * asks a ticket of in the old way to hear the reason; what the caller sent behind the open is
 * never read unless the socket is taken.
 */
function socketHandler(peer: TunnelPeer, options: TunnelAnswerOptions): AnswererHandlers["socket"] {
  const { hub } = options;
  return async (target, socket, headers) => {
    const url = new URL(target, peer.origin);
    if (url.pathname !== "/v1/ws") {
      return { ok: false, code: CLOSE_NO_SUCH_DOOR, reason: "not_found" };
    }
    const ticket = await ticketFor(url, headers, peer, options);
    if (typeof ticket !== "string") return ticket;
    const principal = hub.redeemTicket(ticket);
    if (principal === undefined) return UNAUTHORIZED;
    const opened = hub.open(
      { send: (data) => socket.send(data), close: (code, reason) => socket.close(code, reason) },
      principal,
      peer.via,
    );
    socket.onmessage = (message) => opened.receive(message);
    socket.onclose = () => opened.disconnected();
    return { ok: true };
  };
}

/**
 * The peer with its tunnel's handshake hash on what the app is told of each request (ADR 0191,
 * decision 6): the one way in that was given stays the one given, with the hash beside its
 * address, so the authenticator holds a signature made inside this tunnel to this tunnel.
 */
function boundTo(peer: TunnelPeer, handshakeHash: string): TunnelPeer {
  const { relay, lan } = peer.env;
  return {
    ...peer,
    env: {
      ...(relay === undefined ? {} : { relay: { ...relay, handshakeHash } }),
      ...(lan === undefined ? {} : { lan: { ...lan, handshakeHash } }),
    },
  };
}

/**
 * One tunnel, answered: the Noise handshake on the wire's first message, then the app and the
 * hub behind it for as long as the wire lasts. A handshake that fails — a phone holding another
 * server's key, or bytes that are not a handshake — closes the wire and is said in the log; a
 * tunnel that opens is counted through the hooks until it closes.
 */
export function answerTunnel(
  peer: TunnelPeer,
  options: TunnelAnswerOptions,
  log: Logger,
  hooks: TunnelHooks = {},
): void {
  peer.wire.onmessage = (first) => {
    void options
      .keyPair()
      .then((key) => respondHandshake(key, first))
      .then(({ message, tunnel }) => {
        peer.wire.send(message);
        hooks.onOpen?.();
        // The handlers are made once the handshake is done, since what the app is told of each
        // request names the tunnel's hash, which only the handshake gives.
        const bound = boundTo(peer, toHex(tunnel.handshakeHash));
        const handlers: AnswererHandlers = {
          request: requestHandler(bound, options, log),
          socket: socketHandler(bound, options),
        };
        const strangerBodyBytes =
          options.limits?.unauthenticatedBodyBytes ?? UNAUTHENTICATED_BODY_BYTES;
        const answerer = createAnswerer(createChannel(tunnel, peer.wire), handlers, {
          maxInFlight: options.limits?.maxInFlight,
          maxSockets: options.limits?.maxSockets,
          maxBodyBytes: options.limits?.maxBodyBytes,
          maxSocketMessageBytes: options.limits?.maxSocketMessageBytes,
          // A request with no credential gets a stranger's budget for its body (SEC-11), before
          // the body is put together, so the public key alone fills no memory here.
          bodyBytesFor: (request) => (isStrangers(request) ? strangerBodyBytes : undefined),
        });
        answerer.onclose = (reason) => {
          hooks.onClose?.(reason);
          log.info({ reason }, "tunnel closed");
        };
        log.info({}, "tunnel open");
      })
      .catch((error: unknown) => {
        log.warn({ err: error }, "tunnel handshake failed");
        peer.wire.close();
      });
  };
}

export function createRelayLink(options: RelayLinkOptions): RelayLink {
  const { logger } = options;
  const backoff = options.backoffMs ?? { min: 1000, max: 30_000 };

  let status: RelayStatus = "connecting";
  let trouble: RelayTrouble | undefined;
  let link: RelayServerLink | undefined;
  let closed = false;
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sessions = 0;
  let waiting: (() => void)[] = [];

  /** One tunnel the relay opened: answered as any tunnel is, with the relay's word on the address. */
  const takeSession = (session: RelaySession) => {
    const from = addressFrom(session.from);
    const log = logger.child({ relaySession: session.id, from });
    answerTunnel(
      {
        wire: session.wire,
        from,
        env: { relay: { from } },
        origin: RELAY_ORIGIN,
        via: "relay",
      },
      options,
      log,
      {
        onOpen: () => {
          sessions += 1;
        },
        onClose: () => {
          sessions -= 1;
        },
      },
    );
  };

  const schedule = () => {
    if (closed) return;
    attempts += 1;
    const delay = Math.min(backoff.max, backoff.min * 2 ** Math.min(attempts - 1, 10));
    timer = setTimeout(() => void dial(), delay);
    timer.unref?.();
  };

  const dial = async () => {
    if (closed) return;
    status = "connecting";
    try {
      const key = await options.keyPair();
      link = await serveThroughRelay({
        url: options.url,
        key,
        ...(options.socket === undefined ? {} : { socket: options.socket }),
        onOpen: takeSession,
      });
    } catch (error) {
      trouble = troubleOf(error);
      if (error instanceof RelayError && error.code === "not_allowed") {
        const key = toBase64url((await options.keyPair()).publicKey);
        logger.warn(
          { url: options.url, key, attempt: attempts + 1 },
          "the relay serves a list of servers and this one is not on it: add this key to the relay's CHIPS_RELAY_ALLOW_KEYS",
        );
      } else {
        logger.warn({ err: error, url: options.url, attempt: attempts + 1 }, "relay not reached");
      }
      schedule();
      return;
    }
    attempts = 0;
    status = "connected";
    trouble = undefined;
    const sessionLimit = link.sessionLimit;
    logger.info({ url: options.url, v: RELAY_VERSION, sessionLimit }, "relay connected");
    for (const wake of waiting.splice(0)) wake();
    link.onclose = (reason) => {
      link = undefined;
      status = "connecting";
      logger.warn({ reason }, "relay disconnected");
      schedule();
    };
  };

  void dial();

  return {
    status: () => (closed ? "off" : status),
    trouble: () => (closed ? undefined : trouble),
    sessions: () => sessions,
    connected: () =>
      status === "connected"
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            waiting.push(resolve);
          }),
    async close() {
      closed = true;
      clearTimeout(timer);
      status = "off";
      waiting = [];
      link?.close();
      link = undefined;
    },
  };
}
