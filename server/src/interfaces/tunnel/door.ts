/**
 * The tunnel door on the server's own network (ADR 0191): `/v1/tunnel`, a WebSocket beside
 * `/v1/ws` on the same port.
 *
 * Away from home a phone reaches its server through the relay, inside a Noise tunnel to a key it
 * pinned at pairing (ADR 0039). At home it used to talk plain HTTP to whatever answered at a
 * stored address, which is where the security review's Wi-Fi findings came from: whoever answered
 * there could hand the phone a key (SEC-2), and a signed request, a bearer and every room's words
 * crossed the Wi-Fi in the clear, good for a replay for five minutes (SEC-9;
 * `docs/reviews/security-review.md`). This door is the relay path without the relay. A phone on
 * the network opens a socket here and is the Noise NK initiator against the key it holds; the
 * server is the responder with the pair it proves to the relay; and what runs inside is
 * `answerTunnel`, the same handshake, request handler, socket handler, stranger cap and body
 * budgets the relay's sessions get (`interfaces/relay/link.ts`). One code path, two ways in.
 *
 * Nothing authenticates the upgrade itself, as nothing does at the relay: the handshake
 * authenticates the server, and the device signatures inside authenticate the phone (ADR 0039).
 * A socket that cannot complete the handshake is closed having learnt nothing, not even health.
 * What differs from the relay is the peer: the socket's own remote address is `from`, handed to
 * the app as `lan` rather than `relay`, so the limiter counts it and the join rules judge it as
 * a request on the port is, which is what it is.
 */

import type { Server as HttpServer, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { Logger } from "@chipschat/platform";
import { TUNNEL_DOOR_PATH } from "@chipschat/protocol";
import { asBytes, MAX_MESSAGE_BYTES, type Wire } from "@chipschat/tunnel";
import { type WebSocket, WebSocketServer } from "ws";
import { answerTunnel, type TunnelAnswerOptions } from "../relay/link.js";

export interface TunnelDoorOptions extends TunnelAnswerOptions {
  readonly server: HttpServer;
  readonly logger: Logger;
  /** Where the door is; `TUNNEL_DOOR_PATH` unless a test says otherwise. */
  readonly path?: string | undefined;
}

export interface TunnelDoor {
  /** Tunnels open through this door right now. */
  readonly sessions: () => number;
  /** Takes no more sockets, and closes the ones it has. */
  readonly close: () => Promise<void>;
}

/** The address a request is built on when the socket's `Host` header is no use. */
const FALLBACK_ORIGIN = "http://tunnel.local";

/** A `Host` header as a URL can carry it: a name or an IPv4 address, or a bracketed IPv6 one, with a port or without. */
const HOST = /^(\[[0-9a-f:.]{2,45}\]|[a-z0-9](?:[a-z0-9.-]{0,252}[a-z0-9])?)(:\d{1,5})?$/i;

/** The close code a socket hears when it sends a text frame, which no tunnel does. */
const CLOSE_UNSUPPORTED_DATA = 1003;
/** The close code a socket hears when the server is closing the door. */
const CLOSE_GOING_AWAY = 1001;

/**
 * Where a tunnelled request's URL begins: the address the phone dialled, when its `Host` header
 * says one, so a join request through the door is told the address it can reach by construction
 * (`routes/join.ts`); a name nothing resolves otherwise.
 */
function originOf(host: string | undefined): string {
  return host !== undefined && HOST.test(host) ? `http://${host}` : FALLBACK_ORIGIN;
}

/** The socket's peer, an IPv4 address written plainly where a dual-stack socket maps it into IPv6. */
function peerOf(request: IncomingMessage): string {
  const address = request.socket.remoteAddress;
  if (address === undefined || address === "") return "unknown";
  return address.replace(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i, "$1");
}

/**
 * The socket as the tunnel's wire. Binary frames are the tunnel's and nothing else is: a text
 * frame is not a tunnel's, and the socket closes on it. The backlog is what the socket has taken
 * and not yet sent, which paces a streamed body (ADR 0152).
 */
function wireOver(socket: WebSocket, log: Logger): Wire {
  const wire: Wire = {
    onmessage: undefined,
    onclose: undefined,
    send: (data) => {
      if (socket.readyState === socket.OPEN) socket.send(data);
    },
    close: () => socket.close(1000, "done"),
    backlog: () => socket.bufferedAmount,
  };
  socket.on("message", (data, isBinary) => {
    if (!isBinary) {
      socket.close(CLOSE_UNSUPPORTED_DATA, "binary_only");
      return;
    }
    const bytes = asBytes(data);
    if (bytes !== undefined) wire.onmessage?.(bytes);
  });
  socket.on("close", (code, reason) => wire.onclose?.(reason.toString() || `closed_${code}`));
  socket.on("error", (error) => log.warn({ err: error }, "tunnel socket error"));
  return wire;
}

export function attachTunnelDoor(options: TunnelDoorOptions): TunnelDoor {
  const path = options.path ?? TUNNEL_DOOR_PATH;
  // A frame holds one Noise message at most (`MAX_MESSAGE_BYTES`); `ws` would otherwise take
  // 100 MiB a frame from anyone on the network.
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  let sessions = 0;

  /** One socket at the door: a peer for `answerTunnel`, with the socket's own word on where from. */
  const take = (socket: WebSocket, request: IncomingMessage) => {
    const from = peerOf(request);
    const log = options.logger.child({ door: path, from });
    answerTunnel(
      {
        wire: wireOver(socket, log),
        from,
        env: { lan: { from } },
        origin: originOf(request.headers.host),
        via: "lan",
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

  // Only this path; `/v1/ws` has its own listener on the same server, which ignores this one.
  const onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== path) return;
    wss.handleUpgrade(request, socket, head, (accepted) => take(accepted, request));
  };
  options.server.on("upgrade", onUpgrade);

  return {
    sessions: () => sessions,
    async close() {
      options.server.off("upgrade", onUpgrade);
      // Told rather than cut off: each phone hears the door is closing, then the server waits for
      // the last of them to go.
      for (const client of wss.clients) client.close(CLOSE_GOING_AWAY, "server_closing");
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}
