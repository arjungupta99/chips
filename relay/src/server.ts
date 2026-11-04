/**
 * `chips-relay` on `ws`: the sockets around the switchboard.
 *
 * Two doors on one port — `/v1/serve` for a home server dialling out, `/v1/connect` for a phone
 * dialling in — and `GET /health` beside them, with the page an invite link opens at and the file
 * that lets the iPhone app take that link (`join-page.ts`, ADR 0207). A relay given the Chips
 * app's Expo access token has a third, `POST /v1/push`, which sends pushes for servers that have
 * none (`push.ts`, ADR 0246). Everything a frame means is
 * decided in `switchboard.ts`; this file wraps each socket as a `Peer`, feeds what arrives to the
 * `End` it was given, pings, and closes what has gone silent or never finished its first exchange.
 *
 * Run it behind something that terminates TLS (Caddy, a load balancer) so the control frames —
 * keys, session ids, addresses — cross the internet under `wss://`; the tunnel inside is
 * ciphertext either way. A phone's address is taken from the last entry of `X-Forwarded-For`
 * when the connection itself came from loopback, which is what a proxy on the same box looks
 * like, and from the socket otherwise.
 *
 * No message is bigger than 256 KiB: the tunnel's are at most 64 KiB and a control frame is a
 * line of JSON, so anything bigger is not a peer of this relay's. And at info the log says how
 * many servers and sessions there are, once a minute when that changed, and never which; and at
 * the end of each UTC day, how many it served that day (`tally.ts`, ADR 0208), a line it also
 * appends to `countsFile` when it has one, since the log is kept a week and the counts are not.
 */

import { appendFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { countedAs, type Logger } from "@chipschat/platform";
import { type RawData, type WebSocket, WebSocketServer } from "ws";
import { relayPage } from "./join-page.js";
import { createPushDoor, type PushDoor } from "./push.js";
import {
  createSwitchboard,
  type End,
  type Peer,
  type Switchboard,
  type SwitchboardOptions,
} from "./switchboard.js";
import { createTally, type DayCounts } from "./tally.js";

export interface RelayOptions {
  readonly host: string;
  readonly port: number;
  readonly logger: Logger;
  readonly maxSessionsPerServer?: number | undefined;
  readonly version?: string | undefined;
  /** How often each socket is pinged, and how long silence is borne. Decision 5's numbers. */
  readonly heartbeatSeconds?: number | undefined;
  readonly idleTimeoutSeconds?: number | undefined;
  /** How long a socket may take over its first exchange before it is closed. */
  readonly handshakeTimeoutMs?: number | undefined;
  /** Every byte forwarded, by direction: the tests' capture, and M6.4's meter. */
  readonly tap?: SwitchboardOptions["tap"] | undefined;
  /** The servers this relay lists, by key. Absent, any server that proves its key. */
  readonly allowKeys?: readonly string[] | undefined;
  /** The biggest message a socket may send, in bytes. */
  readonly maxMessageBytes?: number | undefined;
  /** When a sender stops being read, and when a session is ended. See the switchboard. */
  readonly flow?: SwitchboardOptions["flow"] | undefined;
  /** How often the counts are logged at info, when they changed. */
  readonly countsEveryMs?: number | undefined;
  /** Where each day's counts are appended, a line of JSON each. Absent, they are only logged. */
  readonly countsFile?: string | undefined;
  /** What the day's counts read the time from. A test's own; the wall clock otherwise. */
  readonly clock?: (() => number) | undefined;
  /**
   * The push door (ADR 0246): the Chips app's Expo access token, and where pushes go on. Absent,
   * the relay has no push door.
   */
  readonly push?:
    | {
        readonly accessToken: string;
        readonly upstream: string;
        /** Injected so a test can stand in for Expo. */
        readonly fetch?: typeof globalThis.fetch | undefined;
      }
    | undefined;
}

export interface RunningRelay {
  readonly port: number;
  /** The address a server puts in `CHIPS_RELAY_URL`, and a phone finds in its pairing payload. */
  readonly url: string;
  readonly stats: () => { servers: number; sessions: number };
  readonly close: () => Promise<void>;
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** A tunnel message is at most 64 KiB and its session id sixteen bytes; this leaves room. */
const MAX_MESSAGE_BYTES = 256 * 1024;

/**
 * Where a connection came from, as the switchboard and the server's limiter will see it.
 *
 * From a proxy on this box, the last entry of `X-Forwarded-For`: the one the proxy wrote. The
 * entries before it are whatever the phone sent, and a proxy that appends, as Cloudflare and
 * nginx do, passes them on, so the first would let a phone name the address the server counts
 * its wrong pairing codes against (ADR 0056's addendum). From any other peer the header is only
 * the phone's own claim, and is not read.
 */
export function addressOf(request: IncomingMessage): string {
  // Nothing, not a word, when the socket has none: the server takes an address or nothing (SEC-27).
  const socket = request.socket.remoteAddress ?? "";
  const forwarded = request.headers["x-forwarded-for"];
  if (!LOOPBACK.has(socket) || forwarded === undefined) return socket;
  const last = [forwarded].flat().join(",").split(",").at(-1)?.trim();
  return last === undefined || last === "" ? socket : last;
}

/** The headers a proxy writes to say it forwarded a request: Caddy, in front of the hosted relay. */
const FORWARDED = ["forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto"];

/**
 * Whether a request came from this box straight to the port (SEC-28): the socket's peer and the
 * host it asked for are loopback, and no proxy says it forwarded it. The operator's `curl` on the
 * box and the suites beside a relay are; a request through Caddy, which reaches the port from
 * loopback too, says who it forwarded for and asks for the relay's own name.
 */
export function fromThisBox(request: IncomingMessage): boolean {
  if (!LOOPBACK.has(request.socket.remoteAddress ?? "")) return false;
  if (FORWARDED.some((name) => request.headers[name] !== undefined)) return false;
  const host = (request.headers.host ?? "").replace(/:\d+$/, "");
  return host === "localhost" || host === "[::1]" || /^127\./.test(host);
}

/**
 * The path a request asks for, or nothing when its target is not one a URL can be read from:
 * `//`, which `new URL` refuses, once took the whole relay down (SEC-41). Both the page handler
 * and the upgrade handler read the path here, so neither parses a target on its own.
 */
export function pathOf(target: string | undefined): string | undefined {
  try {
    return new URL(target ?? "/", "http://relay.local").pathname;
  } catch {
    return undefined;
  }
}

/** A push request's body: a hundred pushes of at most 4 KiB each, and their brackets. */
const MOST_PUSH_BODY = 512 * 1024;

/**
 * Whether a push request is a server's, as a server's sender makes one: JSON, and no page's
 * origin on it. A browser can be made to post plain text anywhere from any page it opens, which
 * would make every visitor's browser a sender; JSON from a page needs a preflight this relay
 * never answers, and a page's request says its origin.
 */
function fromAServer(request: IncomingMessage): boolean {
  const type = (request.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
  return type === "application/json" && request.headers.origin === undefined;
}

const NOT_A_SERVER = JSON.stringify({
  error: { code: "forbidden", message: "Pushes come from a Chips server, as JSON." },
});

/** A request's body as text, or nothing when it was bigger than `most` or never finished. */
function bodyOf(request: IncomingMessage, most: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      // Read to the end and dropped, so the answer still reaches the asker.
      if (size <= most) chunks.push(chunk);
    });
    request.on("end", () =>
      resolve(size <= most ? Buffer.concat(chunks).toString("utf8") : undefined),
    );
    request.on("error", () => resolve(undefined));
  });
}

/** A target no URL can be read from is the asker's mistake, and the relay answers it as one. */
const NOT_A_PATH = JSON.stringify({
  error: { code: "bad_request", message: "That isn't a path the relay can read." },
});

function toBytes(data: RawData): Uint8Array {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return new Uint8Array(data);
}

/**
 * A socket as the switchboard sees it. `held` is where a socket paused for a slow peer is kept,
 * so silence it was made to keep is not taken for a dead connection.
 */
function peerOver(ws: WebSocket, address: string, held: Set<WebSocket>): Peer {
  let waiting: { below: number; then: () => void }[] = [];
  /** A send has left: whoever waits for this socket to drain, and it has, goes on. */
  const sent = () => {
    if (waiting.length === 0) return;
    const now = ws.bufferedAmount;
    const due = waiting.filter((each) => now <= each.below);
    waiting = waiting.filter((each) => now > each.below);
    for (const each of due) each.then();
  };
  ws.once("close", () => {
    waiting = [];
  });
  return {
    address,
    sendText: (text) => {
      if (ws.readyState === ws.OPEN) ws.send(text);
    },
    sendBytes: (data) => {
      if (ws.readyState !== ws.OPEN) return 0;
      ws.send(data, { binary: true }, sent);
      return ws.bufferedAmount;
    },
    close: (code, reason) => ws.close(code, reason),
    pause: () => {
      held.add(ws);
      ws.pause();
    },
    resume: () => {
      held.delete(ws);
      ws.resume();
    },
    whenDrained: (below, then) => {
      if (ws.bufferedAmount <= below) then();
      else waiting.push({ below, then });
    },
  };
}

export async function startRelay(options: RelayOptions): Promise<RunningRelay> {
  const { logger } = options;
  const heartbeatMs = (options.heartbeatSeconds ?? 20) * 1000;
  const idleMs = (options.idleTimeoutSeconds ?? 60) * 1000;
  const handshakeMs = options.handshakeTimeoutMs ?? 10_000;
  const { countsFile } = options;
  const writeDay = (day: DayCounts) => {
    logger.info(day, "relay day");
    if (countsFile === undefined) return;
    try {
      appendFileSync(countsFile, `${JSON.stringify(day)}\n`);
    } catch (error) {
      logger.warn({ err: error, countsFile }, "could not write the day's counts");
    }
  };
  const switchboard: Switchboard = createSwitchboard({
    maxSessionsPerServer: options.maxSessionsPerServer,
    allowKeys: options.allowKeys === undefined ? undefined : new Set(options.allowKeys),
    flow: options.flow,
    onLog: (level, message, fields) => logger[level](fields, message),
    tap: (direction, data) => {
      tally.moved(direction, data.length);
      options.tap?.(direction, data);
    },
    counted: (what, key) => (what === "listed" ? tally.listed(key) : tally.opened(key)),
  });
  // After the switchboard, which it reads at once; the switchboard calls it only later.
  const tally = createTally({
    clock: options.clock ?? Date.now,
    stats: () => switchboard.stats(),
    listing: () => switchboard.listing(),
    write: writeDay,
  });
  const pushDoor: PushDoor | undefined =
    options.push === undefined
      ? undefined
      : createPushDoor({
          accessToken: options.push.accessToken,
          upstream: options.push.upstream,
          fetch: options.push.fetch,
          logger,
          clock: options.clock,
          counted: (pushes) => tally.pushed(pushes),
        });

  /** A server's pushes, sent on with the app's token; the answer written as the door gave it. */
  const push = async (door: PushDoor, request: IncomingMessage, response: ServerResponse) => {
    if (!fromAServer(request)) {
      request.resume();
      response.writeHead(403, { "content-type": "application/json" });
      response.end(NOT_A_SERVER);
      return;
    }
    const body = await bodyOf(request, MOST_PUSH_BODY);
    const sent =
      body === undefined
        ? {
            status: 413,
            body: JSON.stringify({
              error: { code: "too_large", message: "That's more pushes than one request holds." },
            }),
          }
        : await door.send(body, countedAs(addressOf(request)));
    response.writeHead(sent.status, { "content-type": "application/json" });
    response.end(sent.body);
  };
  /** Whether this is a push for the door, which then answers it. */
  const pushed = (request: IncomingMessage, response: ServerResponse, path: string) => {
    if (pushDoor === undefined || request.method !== "POST" || path !== "/v1/push") return false;
    push(pushDoor, request, response).catch((error: unknown) => {
      logger.warn({ err: error }, "push request failed");
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
    return true;
  };

  /**
   * Alive, which release, and whether the push door's last pushes went, for a monitor and for
   * whoever deploys it. How many servers and phones it carries is said only on the box itself,
   * not to a stranger (SEC-28).
   */
  const health = (request: IncomingMessage) =>
    JSON.stringify({
      status: "ok",
      name: "chips-relay",
      version: options.version ?? "0.0.0",
      pushes: pushDoor?.readiness() ?? "no_access_token",
      ...(fromThisBox(request) ? switchboard.stats() : {}),
    });

  const http: Server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(health(request));
      return;
    }
    const path = pathOf(request.url);
    if (path === undefined) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(NOT_A_PATH);
      return;
    }
    if (pushed(request, response, path)) return;
    const page = relayPage(request.method, path);
    if (page !== undefined) {
      response.writeHead(page.status, page.headers);
      response.end(request.method === "HEAD" ? undefined : page.body);
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        error: {
          code: "not_found",
          message: "Two doors, /v1/serve and /v1/connect, and the invite page at /join.",
        },
      }),
    );
  });

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: options.maxMessageBytes ?? MAX_MESSAGE_BYTES,
  });
  const lastHeard = new WeakMap<WebSocket, number>();
  const sockets = new Set<WebSocket>();
  /** Paused for a slow peer: not read, so not heard, and not dead for that. */
  const held = new Set<WebSocket>();

  const attach = (ws: WebSocket, end: End, address: string, door: string) => {
    sockets.add(ws);
    lastHeard.set(ws, Date.now());
    const handshake = setTimeout(() => {
      if (!end.isSettled()) ws.close(1008, "handshake_timeout");
    }, handshakeMs);
    ws.on("pong", () => lastHeard.set(ws, Date.now()));
    ws.on("message", (data, isBinary) => {
      lastHeard.set(ws, Date.now());
      if (isBinary) end.bytes(toBytes(data));
      else
        void end
          .text(data.toString())
          .catch((error: unknown) => logger.warn({ err: error, door }, "frame failed"));
    });
    const gone = () => {
      clearTimeout(handshake);
      if (!sockets.has(ws)) return;
      sockets.delete(ws);
      held.delete(ws);
      end.closed();
      logger.debug({ door, address }, "socket closed");
    };
    ws.on("close", gone);
    ws.on("error", (error) => {
      logger.warn({ err: error, door }, "socket error");
      gone();
    });
  };

  http.on("upgrade", (request, socket, head) => {
    const path = pathOf(request.url);
    if (path === undefined) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }
    const door = path === "/v1/serve" ? "serve" : path === "/v1/connect" ? "connect" : undefined;
    if (door === undefined) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }
    const address = addressOf(request);
    wss.handleUpgrade(request, socket, head, (ws) => {
      const peer = peerOver(ws, address, held);
      if (door === "connect") {
        attach(ws, switchboard.clientArrived(peer), address, door);
        return;
      }
      void switchboard
        .serverArrived(peer)
        .then((end) => attach(ws, end, address, door))
        .catch((error: unknown) => {
          logger.warn({ err: error }, "could not challenge a server");
          ws.close(1011, "challenge_failed");
        });
    });
  });

  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const ws of sockets) {
      // A held socket is silent because it is not being read. It is heard again when it is.
      if (held.has(ws)) lastHeard.set(ws, now);
      if (now - (lastHeard.get(ws) ?? now) > idleMs) {
        ws.terminate();
        continue;
      }
      if (ws.readyState === ws.OPEN) ws.ping();
    }
  }, heartbeatMs);
  heartbeat.unref?.();

  // How many, never which: the counts at info, once a minute and only when they changed; and
  // the day's, once it has ended.
  let counted = "";
  const counts = setInterval(() => {
    tally.tick();
    const now = switchboard.stats();
    const said = `${now.servers}/${now.sessions}`;
    if (said === counted) return;
    counted = said;
    logger.info(now, "relay counts");
  }, options.countsEveryMs ?? 60_000);
  counts.unref?.();

  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(options.port, options.host, () => {
      http.off("error", reject);
      resolve();
    });
  });
  const address = http.address();
  const port = typeof address === "object" && address !== null ? address.port : options.port;
  const host = options.host.includes(":") ? `[${options.host}]` : options.host;
  logger.info(
    {
      host: options.host,
      port,
      allowKeys: options.allowKeys?.length ?? "any",
      pushes: pushDoor !== undefined,
    },
    "chips-relay listening",
  );

  return {
    port,
    url: `ws://${host}:${port}`,
    stats: () => switchboard.stats(),
    async close() {
      clearInterval(heartbeat);
      clearInterval(counts);
      tally.stop();
      switchboard.close();
      for (const ws of sockets) ws.terminate();
      sockets.clear();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
