/**
 * The address a request reached this server at, when it came from this machine straight to the
 * port: `http://127.0.0.1:4431` for a harness beside the server.
 *
 * The server's public address (`CHIPS_PUBLIC_URL`) is where it is for everything else, and on the
 * owner's machine that is a tailnet name. A harness on the same machine that is handed it leans on
 * Tailscale for nothing: with Tailscale down, it could fetch no file it was sent, and the SDK would
 * keep the tailnet name as where Chips is. So a link for something on this machine names the
 * address it used, which it reached by construction.
 *
 * Straight to the port means three things. The socket's peer is loopback. The host it asked for is
 * loopback too. And no proxy says it forwarded the request: Tailscale Serve, which is how the
 * server gets HTTPS on a tailnet, reaches the port from loopback as well, and writes
 * `X-Forwarded-For` for the device that asked. A request through either tunnel, the relay's or the
 * door on this network, has no socket of its own here, and is never this machine's.
 */

import type { IncomingMessage } from "node:http";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import type { GatewayEnv } from "./context.js";

/** The headers a proxy writes to say it forwarded a request. */
const FORWARDED = ["forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto"];

export interface Arrival {
  /** The socket's peer, as Node reports it. */
  readonly peer: string | undefined;
  /** The host the request asked for, with its port: `127.0.0.1:4431`. */
  readonly host: string | undefined;
  /** Whether a proxy said it forwarded the request. */
  readonly forwarded: boolean;
}

/** An address on this machine alone: `127.x.x.x`, `::1`, or an IPv4 one mapped into IPv6. */
function isLoopbackPeer(address: string): boolean {
  return /^127\./.test(address) || address === "::1" || /^::ffff:127\./.test(address);
}

/** A host name on this machine alone: `localhost`, `127.x.x.x` or `[::1]`. */
function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "[::1]" || /^127\./.test(hostname);
}

/** The origin a request arrived at when it came straight from this machine, or nothing. */
export function loopbackOrigin(arrival: Arrival): string | undefined {
  const { peer, host } = arrival;
  if (arrival.forwarded || host === undefined || host === "") return undefined;
  if (peer === undefined || !isLoopbackPeer(peer)) return undefined;
  let asked: URL;
  try {
    asked = new URL(`http://${host}`);
  } catch {
    return undefined;
  }
  return isLoopbackHost(asked.hostname) ? asked.origin : undefined;
}

/** Where an HTTP request arrived, when it came straight from this machine. */
export function requestArrivedAt(c: Context<GatewayEnv>): string | undefined {
  if (c.env?.relay !== undefined || c.env?.lan !== undefined) return undefined;
  let peer: string | undefined;
  try {
    peer = getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
  return loopbackOrigin({
    peer,
    host: new URL(c.req.url).host,
    forwarded: FORWARDED.some((name) => c.req.header(name) !== undefined),
  });
}

/** Where a socket's upgrade arrived, when it came straight from this machine. */
export function upgradeArrivedAt(request: IncomingMessage): string | undefined {
  return loopbackOrigin({
    peer: request.socket.remoteAddress,
    host: request.headers.host,
    forwarded: FORWARDED.some((name) => request.headers[name] !== undefined),
  });
}
