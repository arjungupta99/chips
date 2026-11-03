/**
 * How a device reaches its server (M4.1, ADR 0038 decision 1; ADR 0191): a tunnel to the key it
 * pinned at pairing, through the door on the server's own network first, and through the relay
 * when that network does not answer.
 *
 * Every call the client makes — a signed request, the socket opened with a ticket — goes
 * through a `Link`. A link is a Noise NK handshake against the server's key and then the same
 * requests and the same socket as messages inside it (`@chipschat/tunnel`); nothing above this
 * file knows which way the tunnel went. The plain `fetch` and `WebSocket` link that the LAN
 * path used to be stays for three things only: the one exchange a first pairing by a typed code
 * makes, before the device holds a key; the one health read a device paired before servers had
 * keys makes to take its first (the transport's, ADR 0191 Phase 3); and a browser the server
 * itself served, which ADR 0191 leaves to TLS. A device holding a key never uses it.
 *
 * A device that names a relay tries the door first, on a short timeout, and falls back on its
 * own; it never asks the person which network they are on, and there is no setting for it. The
 * link a device is using right now is kept here by device id, so the store's reads and the
 * transport's socket agree; the transport chooses again on every reconnect, because the phone
 * may have come home in between.
 */

import { serverKey as serverKeyShape, TUNNEL_DOOR_PATH } from "@chipschat/protocol";
import {
  type Caller,
  concat,
  connectThroughRelay,
  createCaller,
  createChannel,
  dialTunnelDoor,
  fromBase64url,
  type Initiated,
  initiateHandshake,
  RelayError,
  type SocketFactory,
  type StreamedOutput,
  type Tunnel,
  TunnelClosedError,
  type TunnelSocket,
  toHex,
  type Wire,
} from "@chipschat/tunnel";

/**
 * Which way a link goes: `tunnel`, through the door on the server's own network; `relay`, the
 * same tunnel through the relay; `direct`, the plain link, which authenticates nothing.
 */
export type LinkKind = "direct" | "tunnel" | "relay";

/** A stretch of time the socket went one way (ADR 0211). */
export interface LinkStretch {
  readonly kind: LinkKind;
  readonly since: string;
  readonly until: string;
}

/**
 * Why a link could not be made, in the three shapes a person can act on.
 *
 * `no_such_server` is the one worth a type of its own: the relay answered, and what it said is
 * that no server of that key is registered with it. The network is fine, the relay is fine, and
 * the machine Chips runs on is not there — asleep, most likely, since it is a laptop that shut
 * its lid. That is a different instruction from *Reconnecting…*: a dropped network is worth
 * waiting two seconds for, a sleeping server is worth going home and opening the laptop, and
 * the relay cannot help because there is nothing awake on the far side to reach.
 *
 * `busy` is the relay saying another tunnel already holds this server. `unreachable` is the
 * honest remainder: the door did not answer and neither did the relay, or there is no relay to
 * ask, so which of the two is broken is not knowable from here.
 */
export type LinkFailure = "no_such_server" | "busy" | "unreachable";

export class LinkError extends Error {
  override readonly name = "LinkError";
  constructor(
    readonly reason: LinkFailure,
    message: string,
  ) {
    super(message);
  }
}

/**
 * The relay's code, as one of the three. `replaced` joins `busy` because both mean a second
 * tunnel to the same server; the rest — a timeout, a closed socket, a frame nobody understood —
 * are all *we could not get through*, and no screen would say anything different for them.
 */
function failureOf(code: RelayError["code"]): LinkFailure {
  if (code === "no_such_server") return "no_such_server";
  if (code === "busy" || code === "replaced") return "busy";
  return "unreachable";
}

/** Where a server's relay is, and the key the server is known by there. */
export interface RelayAddress {
  readonly url: string;
  readonly serverKey: string;
}

/**
 * What is needed to reach a server: its address on the network, the key it is known by — what
 * every tunnel to it is a handshake against — and its relay, when it has one.
 */
export interface Reachable {
  readonly serverUrl?: string | undefined;
  readonly serverKey?: string | undefined;
  readonly relayUrl?: string | undefined;
  /** Only direct (ADR 0211, Phase 2): the relay is not tried, whatever the device knows of it. */
  readonly onlyDirect?: boolean | undefined;
}

/**
 * What a device does with the relay its server's health names, against what it holds (ADR
 * 0144, SEC-2): keep what it holds, since nothing differs; take the named one; or refuse it.
 *
 * The key is pinned at pairing and is never replaced from health. A relay at another address
 * under the pinned key is taken, which is how a device follows a relay that moved; a relay under
 * another key is refused and said, so the person can pair again if the server really has a new
 * key. Since ADR 0191 health is read inside a tunnel to the pinned key, so the server naming the
 * relay is the one that holds it; the rule stays, because a browser the server served still
 * reads health over the plain link, and the rule costs nothing.
 *
 * A device holding no key takes the first relay named, and the key with it. It has nothing to
 * hold the named one against, and the alternative is pairing again for every device paired
 * before its server had a key. A device with an address takes its first key from health once,
 * before anything else, and tunnels from then on (ADR 0191, Phase 3: `reachNamedBy` in the
 * transport); so the one still taking a key here is a browser the server itself served, which
 * trusts the plain link for every request it makes anyway.
 */
export type RelayVerdict = "keep" | "take" | "refuse";

export function relayVerdict(
  held: Pick<Reachable, "serverKey" | "relayUrl">,
  named: RelayAddress,
): RelayVerdict {
  if (held.serverKey === undefined) return "take";
  if (held.serverKey !== named.serverKey) return "refuse";
  return held.relayUrl === named.url ? "keep" : "take";
}

/** What a server's health names of how to reach it: its key, and its relay when it has one. */
export interface NamedReach {
  readonly serverKey: string;
  readonly relayUrl?: string | undefined;
}

/**
 * The server's key, and its relay when it names one, as `GET /v1/server` says them over `link`
 * to a device that signed for them (ADR 0144, ADR 0191; SEC-28). Nothing when the server does not
 * answer, names no key, or names one that is not the shape of a key, since a handshake against
 * that could never complete and a device that pinned it could never connect.
 */
export async function reachNamedBy(
  link: Link,
  serverUrl: string,
  init?: RequestInit,
): Promise<NamedReach | undefined> {
  try {
    const response = await link.fetch(serverUrl, init);
    if (!response.ok) return undefined;
    const facts = (await response.json()) as { relay?: { url?: unknown; key?: unknown } };
    const { url, key } = facts.relay ?? {};
    const parsed = serverKeyShape.safeParse(key);
    if (!parsed.success) return undefined;
    return typeof url === "string" && url !== ""
      ? { serverKey: parsed.data, relayUrl: url }
      : { serverKey: parsed.data };
  } catch {
    return undefined;
  }
}

/**
 * The relay a server names in `GET /v1/server`, asked over whichever link reaches it now (ADR
 * 0144): how a device paired before its server had a relay, or before the relay moved, learns
 * where it is without pairing again. Nothing when the server names none, or does not answer.
 */
export async function relayNamedBy(
  link: Link,
  serverUrl: string,
  init?: RequestInit,
): Promise<RelayAddress | undefined> {
  const named = await reachNamedBy(link, serverUrl, init);
  return named?.relayUrl === undefined
    ? undefined
    : { url: named.relayUrl, serverKey: named.serverKey };
}

/** A socket as the transport drives it: the browser's `WebSocket`, or the tunnel's. */
export interface LinkSocket {
  readonly send: (data: string) => void;
  readonly close: (code?: number, reason?: string) => void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onclose: ((event: { readonly code: number; readonly reason: string }) => void) | null;
}

export interface Link {
  readonly kind: LinkKind;
  /** `fetch`, or the tunnel's answer to the same request. */
  readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
  /**
   * A socket at the URL, or the tunnel's channel to the same path. Inside a tunnel its open may
   * carry `headers`, the ask for its ticket (ADR 0253); the plain link's WebSocket cannot.
   */
  readonly socket: (url: string, headers?: Record<string, string>) => LinkSocket;
  readonly close: () => void;
  /**
   * The Noise handshake hash of this link's tunnel, hex, which a request signed inside it names
   * as its fifth line (ADR 0191, decision 6): both ends hold it and nothing else does, so the
   * signature is good in this tunnel and nowhere else. Nothing on the plain link, which has no
   * tunnel to name; a tunnel still to be chosen answers with its choice's, once chosen.
   */
  readonly handshakeHash?: (() => Promise<string | undefined>) | undefined;
}

/**
 * The plain link: the browser's `fetch` and `WebSocket` against the server's address, which
 * authenticates nothing. For a first pairing by a typed code, before the device holds a key
 * (ADR 0191, decision 5); for the one health read that takes a first key for a device paired
 * before servers had keys (Phase 3); and for a browser the server itself served. `establishLink`
 * hands it to nothing else but a device whose server still names no key, which has nothing to
 * shake hands against.
 */
export const directLink: Link = {
  kind: "direct",
  fetch: (url, init) => fetch(url, init),
  socket: (url) => new WebSocket(url) as unknown as LinkSocket,
  close: () => undefined,
};

/** The path and query of a URL: what a tunnel carries, since the origin is the tunnel's end. */
function targetOf(url: string): string {
  const parsed = new URL(url, "http://relay.local");
  return `${parsed.pathname}${parsed.search}`;
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  if (init?.headers === undefined) return headers;
  new Headers(init.headers).forEach((value, name) => {
    headers[name] = value;
  });
  return headers;
}

async function bodyOf(init: RequestInit | undefined): Promise<Uint8Array | undefined> {
  const body = init?.body;
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  throw new Error("The tunnel carries a string, bytes or a Blob.");
}

/** A socket over the tunnel, in the shape the transport expects of a WebSocket. */
function socketOver(tunnelSocket: TunnelSocket): LinkSocket {
  const socket: LinkSocket = {
    onopen: null,
    onmessage: null,
    onclose: null,
    send: (data) => tunnelSocket.send(data),
    close: (code, reason) => tunnelSocket.close(code, reason),
  };
  tunnelSocket.onopen = () => socket.onopen?.({});
  tunnelSocket.onmessage = (message) => socket.onmessage?.({ data: message });
  tunnelSocket.onclose = (code, reason) => socket.onclose?.({ code, reason });
  return socket;
}

let holdsStreams: boolean | undefined;

/**
 * Whether this platform's `Response` can hold a body that is still coming. A browser's and Node's
 * can. React Native's is a polyfill over whole bodies, which would take a stream for a string.
 */
function responseHoldsStreams(): boolean {
  if (holdsStreams === undefined) {
    try {
      holdsStreams = new Response(new ReadableStream()).body instanceof ReadableStream;
    } catch {
      holdsStreams = false;
    }
  }
  return holdsStreams;
}

/**
 * A tunnelled answer as a `Response` where the platform's own cannot hold a body still coming. It
 * carries what the client reads of a response: the status, the headers, the body as a stream, and
 * the body whole as bytes, text or JSON.
 */
class StreamedResponse {
  readonly ok: boolean;
  readonly statusText = "";
  readonly headers: Headers;
  readonly redirected = false;
  readonly type = "default";
  readonly url = "";
  private used = false;
  constructor(
    readonly status: number,
    headers: Record<string, string>,
    readonly body: ReadableStream<Uint8Array>,
  ) {
    this.ok = status >= 200 && status < 300;
    this.headers = new Headers(headers);
  }
  get bodyUsed(): boolean {
    return this.used;
  }
  async bytes(): Promise<Uint8Array<ArrayBuffer>> {
    if (this.used) throw new TypeError("The body has already been read.");
    this.used = true;
    const reader = this.body.getReader();
    const parts: Uint8Array[] = [];
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      parts.push(read.value);
    }
    return concat(...parts);
  }
  async arrayBuffer(): Promise<ArrayBuffer> {
    return (await this.bytes()).buffer;
  }
  async text(): Promise<string> {
    return new TextDecoder().decode(await this.bytes());
  }
  async json(): Promise<unknown> {
    return JSON.parse(await this.text());
  }
  async blob(): Promise<Blob> {
    const type = this.headers.get("content-type") ?? "";
    return new Blob([await this.arrayBuffer()], { type });
  }
}

/**
 * A tunnelled answer as the `Response` a `fetch` gives: handed over when its headers arrive, with
 * a body a reader can take chunk by chunk as the tunnel brings it (the media viewer, Phase 2), so
 * a download through the tunnel can say how far it has got, as one on the plain link does.
 */
export function responseOf(answer: StreamedOutput, streams = responseHoldsStreams()): Response {
  const { status, headers } = answer;
  // A body is not allowed on these statuses, and `Response` says so loudly.
  if (status === 204 || status === 205 || status === 304) {
    void answer.body.cancel();
    return new Response(null, { status, headers });
  }
  if (streams) return new Response(answer.body, { status, headers });
  return new StreamedResponse(status, headers, answer.body) as unknown as Response;
}

/**
 * A link over a caller: the tunnel's requests and sockets in `fetch` and `WebSocket` clothing,
 * naming the tunnel's handshake hash for the signatures made inside it.
 */
export function linkOverCaller(
  caller: Caller,
  kind: LinkKind = "relay",
  handshakeHash?: string,
): Link {
  return {
    kind,
    handshakeHash: async () => handshakeHash,
    async fetch(url, init) {
      const answer = await caller.stream({
        method: init?.method ?? "GET",
        target: targetOf(url),
        headers: headersOf(init),
        body: await bodyOf(init),
        signal: init?.signal ?? undefined,
      });
      return responseOf(answer);
    },
    socket: (url, headers) => socketOver(caller.open(targetOf(url), headers)),
    close: () => caller.close(),
  };
}

export interface RelayLinkOptions {
  readonly socket?: SocketFactory | undefined;
  /** How long a dial gets, the socket and then the handshake: `DEFAULT_DIAL_MS` unless said. */
  readonly timeoutMs?: number | undefined;
}

/** How long the relay, or the door with no relay behind it, gets to answer. The relay's own. */
export const DEFAULT_DIAL_MS = 10_000;

/**
 * A tunnel over a wire, to the server of `serverKey`: the Noise NK handshake, then the caller in
 * `fetch` and `WebSocket` clothing. The relay and the door share it; what differs is how the
 * wire was got — through the relay's frames, or the socket itself. The handshake's first message
 * is made while the socket opens and goes with the dial (ADR 0253), so here it is only answered.
 * A server that cannot answer it is not the server of that key, and the wire is closed on it
 * having been sent nothing but that message: not a request, not a health read.
 */
async function tunnelOver(
  wire: Wire,
  started: Initiated,
  kind: LinkKind,
  timeoutMs: number,
): Promise<Link> {
  const answered = new Promise<Uint8Array>((resolve, reject) => {
    const timer = setTimeout(() => {
      wire.close();
      reject(new Error("The server did not answer the handshake in time."));
    }, timeoutMs);
    wire.onmessage = (message) => {
      clearTimeout(timer);
      resolve(message);
    };
    wire.onclose = (reason) => {
      clearTimeout(timer);
      reject(new Error(`The connection closed during the handshake: ${reason}.`));
    };
  });
  let tunnel: Tunnel;
  try {
    tunnel = await started.complete(await answered);
  } catch (error) {
    wire.close();
    throw error;
  }
  return linkOverCaller(
    createCaller(createChannel(tunnel, wire)),
    kind,
    toHex(tunnel.handshakeHash),
  );
}

/**
 * The handshake's first message, for a dial to send as its socket opens (ADR 0253). Begun just
 * before the dial asks for its socket, the keys are worked out while the socket opens; a key that
 * makes no message is said by the handshake itself, which the caller awaits beside the dial.
 */
function firstMessage(handshake: Promise<Initiated>): Promise<Initiated["message"]> {
  const first = handshake.then((started) => started.message);
  first.catch(() => undefined);
  return first;
}

/** Through the relay: dial it, ask for the server by key with the handshake behind, and speak. */
export async function relayLink(
  relay: RelayAddress,
  options: RelayLinkOptions = {},
): Promise<Link> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_DIAL_MS;
  const handshake = initiateHandshake(fromBase64url(relay.serverKey));
  const [started, connected] = await Promise.all([
    handshake,
    connectThroughRelay({
      url: relay.url,
      serverKey: relay.serverKey,
      socket: options.socket,
      timeoutMs,
      first: firstMessage(handshake),
    }),
  ]);
  return tunnelOver(connected.wire, started, "relay", timeoutMs);
}

/**
 * Where a server's tunnel door is, from its address on the network (ADR 0191):
 * `http://mini.local:4431` → `ws://mini.local:4431/v1/tunnel`, and `https` → `wss`.
 */
export function doorUrl(serverUrl: string): string {
  return `${serverUrl.replace(/^http/, "ws").replace(/\/+$/, "")}${TUNNEL_DOOR_PATH}`;
}

/**
 * Through the door on the server's own network (ADR 0191, decision 3): dial it, shake hands,
 * and speak. The whole of it — the socket opening and the server answering the handshake —
 * is bounded by `timeoutMs`, since the handshake is the probe.
 */
export async function doorLink(
  serverUrl: string,
  serverKey: string,
  options: RelayLinkOptions = {},
): Promise<Link> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_DIAL_MS;
  const deadline = Date.now() + timeoutMs;
  const handshake = initiateHandshake(fromBase64url(serverKey));
  const [started, { wire }] = await Promise.all([
    handshake,
    dialTunnelDoor({
      url: doorUrl(serverUrl),
      socket: options.socket,
      timeoutMs,
      first: firstMessage(handshake),
    }),
  ]);
  return tunnelOver(wire, started, "tunnel", Math.max(1, deadline - Date.now()));
}

export interface EstablishOptions extends RelayLinkOptions {
  /** How long the door gets in all, when the device names a relay to fall back on. */
  readonly probeMs?: number | undefined;
  /** How long the door has to itself before the relay is dialled beside it. */
  readonly headStartMs?: number | undefined;
}

/** The default: long enough for a sleepy Wi-Fi, short enough that the relay is not a wait. */
export const DEFAULT_PROBE_MS = 1500;

/**
 * How long the door has to itself before the relay is dialled beside it (ADR 0253): a door on the
 * same network answers well inside it, and one that has not by then is raced rather than waited
 * out, as RFC 8305 has a phone race its two kinds of address.
 */
export const DOOR_HEAD_START_MS = 250;

/**
 * Whether a server's address is this page's own origin, or names none, which means the same:
 * a browser the server itself served. It got the page in the clear, and a tunnel inside it would
 * protect nothing the page's loader did not, so ADR 0191 leaves it on the plain link, to TLS.
 */
export function servedThisPage(serverUrl: string): boolean {
  if (serverUrl === "") return true;
  const page = (globalThis as { location?: { origin?: string } }).location;
  return page?.origin !== undefined && page.origin === serverUrl;
}

/**
 * The link to use now (ADR 0191, decision 3). A device that holds its server's key reaches it
 * through a tunnel to that key and nothing else: the door on the server's own network, where the
 * handshake is the probe — a server at the stored address that cannot complete it is not this
 * device's server, and is sent nothing more — and the relay when the device names one. The door
 * is dialled first, and the relay beside it once the door has had `DOOR_HEAD_START_MS` to itself
 * or has failed (ADR 0253); the first tunnel through is the link, and the other is closed when it
 * comes, having been sent nothing but the handshake. The door is given up on after the time a
 * person would wait for a tap. With no relay to fall back on the door gets the whole dial, since
 * nothing waits behind it, and a door that does not answer is said as `unreachable`: only the
 * relay can tell *the server is not there* from *I cannot get out*.
 *
 * Two devices still get the plain link: a browser the server itself served, and a device with no
 * key to shake hands against — a first pairing by a typed code, or a device paired before servers
 * had keys whose server still names none (the transport takes a first key before it asks here,
 * ADR 0191 Phase 3).
 */
/** The relay to fall back on, unless Only direct keeps the device from it (ADR 0211, Phase 2). */
function relayOf(target: Reachable): string | undefined {
  return target.onlyDirect === true ? undefined : target.relayUrl;
}

export async function establishLink(
  target: Reachable,
  options: EstablishOptions = {},
): Promise<Link> {
  const serverUrl = target.serverUrl ?? "";
  if (target.serverKey === undefined || servedThisPage(serverUrl)) return directLink;
  const { serverKey } = target;
  const relayUrl = relayOf(target);
  if (relayUrl === undefined) {
    try {
      return await doorLink(serverUrl, serverKey, {
        socket: options.socket,
        timeoutMs: options.timeoutMs,
      });
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      throw new LinkError("unreachable", `The server did not answer at its door: ${why}`);
    }
  }
  return firstThrough(
    () =>
      doorLink(serverUrl, serverKey, {
        socket: options.socket,
        timeoutMs: options.probeMs ?? DEFAULT_PROBE_MS,
      }),
    () =>
      relayLink({ url: relayUrl, serverKey }, options).catch((error: unknown) => {
        if (error instanceof RelayError) throw new LinkError(failureOf(error.code), error.message);
        throw error;
      }),
    options.headStartMs ?? DOOR_HEAD_START_MS,
  );
}

/**
 * The first of two tunnels through: the door's, and the relay's dialled once the door has had
 * `headStartMs` or has failed. A second through as well is closed. Both failing is the relay's
 * failure, which says why in words a screen can act on.
 */
function firstThrough(
  door: () => Promise<Link>,
  relay: () => Promise<Link>,
  headStartMs: number,
): Promise<Link> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let failed = 0;
    let relayDialled = false;
    let relayFailure: unknown;
    const through = (link: Link) => {
      if (settled) {
        link.close();
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(link);
    };
    const notThrough = () => {
      failed += 1;
      if (settled || failed < 2) return;
      settled = true;
      reject(relayFailure);
    };
    const dialRelay = () => {
      if (relayDialled || settled) return;
      relayDialled = true;
      relay().then(through, (error: unknown) => {
        relayFailure = error;
        notThrough();
      });
    };
    const timer = setTimeout(dialRelay, headStartMs);
    door().then(through, () => {
      clearTimeout(timer);
      dialRelay();
      notThrough();
    });
  });
}

/** The link each device is using right now, by device id. */
const links = new Map<string, Link>();
/** Calls that came before a device's link was chosen, waiting for `useLink` (`linkFor`). */
const choosing = new Map<string, Set<(link: Link) => void>>();

/** Remember the link a device reaches its server by; the old one, if another, is closed. */
export function useLink(deviceId: string, link: Link): void {
  const previous = links.get(deviceId);
  if (previous !== undefined && previous !== link) previous.close();
  links.set(deviceId, link);
  const waiting = choosing.get(deviceId);
  choosing.delete(deviceId);
  for (const wake of waiting ?? []) wake(link);
}

/** The device's link once the transport has chosen one, or a closed tunnel's refusal after `ms`. */
function linkOnceChosen(deviceId: string, ms: number): Promise<Link> {
  const chosen = links.get(deviceId);
  if (chosen !== undefined) return Promise.resolve(chosen);
  return new Promise((resolve, reject) => {
    const wake = (link: Link) => {
      clearTimeout(timer);
      resolve(link);
    };
    const timer = setTimeout(() => {
      choosing.get(deviceId)?.delete(wake);
      reject(new TunnelClosedError("No tunnel to the server was open in time.", { sent: false }));
    }, ms);
    const waiting = choosing.get(deviceId) ?? new Set();
    waiting.add(wake);
    choosing.set(deviceId, waiting);
  });
}

/** A socket asked for before the link was chosen: opened on the chosen link once there is one. */
function socketOnceChosen(
  deviceId: string,
  url: string,
  headers: Record<string, string> | undefined,
  ms: number,
): LinkSocket {
  let inner: LinkSocket | undefined;
  let closedEarly:
    | { readonly code?: number | undefined; readonly reason?: string | undefined }
    | undefined;
  const socket: LinkSocket = {
    onopen: null,
    onmessage: null,
    onclose: null,
    send: (data) => inner?.send(data),
    close: (code, reason) => {
      if (inner === undefined) closedEarly = { code, reason };
      else inner.close(code, reason);
    },
  };
  /** Closed as it was asked to be, before any link came; else as a tunnel that never opened. */
  const closedUnopened = () =>
    socket.onclose?.(
      closedEarly === undefined
        ? { code: 1006, reason: "no_tunnel" }
        : { code: closedEarly.code ?? 1000, reason: closedEarly.reason ?? "" },
    );
  linkOnceChosen(deviceId, ms).then((link) => {
    if (closedEarly !== undefined) {
      closedUnopened();
      return;
    }
    inner = link.socket(url, headers);
    inner.onopen = (event) => socket.onopen?.(event);
    inner.onmessage = (event) => socket.onmessage?.(event);
    inner.onclose = (event) => socket.onclose?.(event);
  }, closedUnopened);
  return socket;
}

/**
 * The link a device holding a key uses before the transport has chosen one: a tunnel still to be
 * chosen, through which everything waits for the one the transport opens, as a read the
 * connection dropped under waits for the next (ADR 0179). Never the plain link: a device holding
 * a key sends nothing plain (ADR 0191), and at a cold launch the first reads — the server's
 * facts, the devices, the people — race the socket's handshake by a few hundred milliseconds,
 * which is how five of them crossed the plain port in the first walk. Given up on, it has closed
 * as a tunnel closes, which `readOnLink` asks again on the chosen one.
 */
function linkNotYetChosen(deviceId: string, ms: number): Link {
  return {
    kind: "tunnel",
    fetch: async (url, init) => (await linkOnceChosen(deviceId, ms)).fetch(url, init),
    socket: (url, headers) => socketOnceChosen(deviceId, url, headers, ms),
    close: () => undefined,
    handshakeHash: async () => (await linkOnceChosen(deviceId, ms)).handshakeHash?.(),
  };
}

/**
 * The link a device is using: the one chosen for it; before one is, a tunnel still to be chosen
 * for a device with an address, which waits `chooseMs` for the transport; and the plain link for
 * a device the page itself served. A device with an address and no key waits too: the transport
 * takes its first key before it chooses (ADR 0191, Phase 3), so nothing of a cold launch goes
 * plain ahead of that; what it chooses for a server that names no key is the plain link itself.
 */
export function linkFor(
  device: { readonly deviceId: string; readonly serverUrl?: string | undefined },
  chooseMs = DEFAULT_DIAL_MS,
): Link {
  const chosen = links.get(device.deviceId);
  if (chosen !== undefined) return chosen;
  if (servedThisPage(device.serverUrl ?? "")) return directLink;
  return linkNotYetChosen(device.deviceId, chooseMs);
}

/** Forget a device's link, closing a tunnel if it had one. */
export function dropLink(deviceId: string): void {
  links.get(deviceId)?.close();
  links.delete(deviceId);
}

/** How many times each device's socket has opened: each time, it reaches its server again. */
const reaches = new Map<string, number>();
/** Reads waiting for a device to reach its server again (`readOnLink`). */
const waiters = new Map<string, Set<() => void>>();

/**
 * Say that a device reaches its server: its socket opened, through the link it uses now. The
 * transport says it, since the socket opening is the one proof that the server answers on that
 * link; a link chosen is not, when there is no relay to try and the network is all there is.
 */
export function reached(deviceId: string): void {
  reaches.set(deviceId, (reaches.get(deviceId) ?? 0) + 1);
  const waiting = waiters.get(deviceId);
  waiters.delete(deviceId);
  for (const wake of waiting ?? []) wake();
}

/** Whether the device has reached its server since the `since`th time, or does within `ms`. */
function reachedSince(deviceId: string, since: number, ms: number): Promise<boolean> {
  if ((reaches.get(deviceId) ?? 0) > since) return Promise.resolve(true);
  return new Promise((resolve) => {
    const wake = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      waiters.get(deviceId)?.delete(wake);
      resolve(false);
    }, ms);
    const waiting = waiters.get(deviceId) ?? new Set();
    waiting.add(wake);
    waiters.set(deviceId, waiting);
  });
}

/**
 * How long a read the connection dropped under waits for it to come back: a server restarting, a
 * phone changing networks. The transport tries again one, two, three, four and five seconds apart,
 * so this covers a restart that takes ten seconds and the tries that find it back.
 */
export const REJOIN_MS = 20_000;

/**
 * How long a read the network failed waits for the socket to open again before it is asked again
 * anyway. The fetch may have failed alone, the socket standing all along, and then nothing will
 * say the device reached its server again: it waited out all of `REJOIN_MS` for nothing.
 */
export const REASK_MS = 2000;

/** The connection dropped under a read, and did not come back in time for it to be asked again. */
export class ConnectionDropped extends Error {
  override readonly name = "ConnectionDropped";
}

/**
 * Whether a read failed because its link went from under it, rather than for anything the server
 * said: the tunnel closed, or on the plain link the `fetch` itself rejected with a `TypeError`,
 * which is how it says nothing came back, in each platform's own words. A reader that let go
 * rejects with an `AbortError`, and what the read throws once the answer came is the read's own.
 */
function droppedUnder(error: unknown, link: Link, fetchFailed: unknown): boolean {
  if (error instanceof TunnelClosedError) return true;
  return link.kind === "direct" && error === fetchFailed && error instanceof TypeError;
}

/**
 * A read that may outlive its connection (ADR 0179). When the link drops under it — the server
 * restarted, the phone changed networks, the relay let go — it waits for the device to reach its
 * server again, through whichever link that is, and is asked once more; given up on, it says so in
 * words a person can read. One the network failed while the socket stood is asked again after
 * `REASK_MS`, since no new socket is coming to say so. A read is safe to ask again. A write is
 * not, and is not asked here: its first try may have been done.
 *
 * `read` is handed the link to use, and asks everything through it, signing afresh each time.
 */
export async function readOnLink<T>(
  device: { readonly deviceId: string },
  read: (link: Link) => Promise<T>,
  waitMs = REJOIN_MS,
): Promise<T> {
  const since = reaches.get(device.deviceId) ?? 0;
  const tryOn = async (link: Link): Promise<Tried<T>> => {
    let fetchFailed: unknown;
    const watched: Link = {
      ...link,
      fetch: (url, init) =>
        link.fetch(url, init).catch((error: unknown) => {
          fetchFailed = error;
          throw error;
        }),
    };
    try {
      return { answer: await read(watched) };
    } catch (error) {
      if (!droppedUnder(error, link, fetchFailed)) throw error;
      return error instanceof TunnelClosedError ? "tunnel" : "network";
    }
  };
  const first = await tryOn(linkFor(device));
  if (typeof first === "object") return first.answer;
  const again = await askedAgain(device.deviceId, since, first, waitMs, () =>
    tryOn(linkFor(device)),
  );
  if (again !== undefined) return again.answer;
  throw new ConnectionDropped("The connection dropped.");
}

/** A read's answer, or how it dropped: its tunnel closed, or the network failed its fetch. */
type Tried<T> = { readonly answer: T } | "tunnel" | "network";

/**
 * A read that dropped, asked again. A tunnel that closed took the connection with it, and the read
 * waits for the next one. A fetch the network failed is asked again after a moment either way
 * (`REASK_MS`); dropped again before anything said the socket was back, it waits for it then.
 */
async function askedAgain<T>(
  deviceId: string,
  since: number,
  dropped: "tunnel" | "network",
  waitMs: number,
  ask: () => Promise<Tried<T>>,
): Promise<{ readonly answer: T } | undefined> {
  const pause = dropped === "network" ? Math.min(REASK_MS, waitMs) : waitMs;
  const back = await reachedSince(deviceId, since, pause);
  if (!back && dropped === "tunnel") return undefined;
  const counted = reaches.get(deviceId) ?? 0;
  const again = await ask();
  if (typeof again === "object") return again;
  if (back || !(await reachedSince(deviceId, counted, waitMs - pause))) return undefined;
  const last = await ask();
  return typeof last === "object" ? last : undefined;
}

/**
 * A write that waits for a link to take it. A write is not asked again once it has gone, since its
 * first try may have been done (`readOnLink`), but one the tunnel refused before anything went was
 * not done and not asked. That is every write in the first seconds after the phone comes back to
 * Chips, while the tunnel it held is closed and the next is not yet open: "Make a link" said "The
 * tunnel is closed." and made nothing (an iPhone, 2 November 2026). Such a write waits for the
 * device to reach its server again, as a read does, and goes then, once. A tunnel that closed
 * under it, or a connection that did not come back in time, says the connection dropped.
 *
 * `write` is handed the link to use, and signs afresh each time.
 */
export async function writeOnLink<T>(
  device: { readonly deviceId: string },
  write: (link: Link) => Promise<T>,
  waitMs = REJOIN_MS,
): Promise<T> {
  const since = reaches.get(device.deviceId) ?? 0;
  try {
    return await write(linkFor(device));
  } catch (error) {
    if (!refusedUnsent(error)) throw inWords(error);
  }
  if (!(await reachedSince(device.deviceId, since, waitMs))) {
    throw new ConnectionDropped("The connection dropped.");
  }
  try {
    return await write(linkFor(device));
  } catch (error) {
    throw inWords(error);
  }
}

/** A request the tunnel turned away before it went: nothing was asked of the server. */
function refusedUnsent(error: unknown): boolean {
  return error instanceof TunnelClosedError && !error.sent;
}

/** A closed tunnel as a person reads it; anything else as it was. */
function inWords(error: unknown): unknown {
  return error instanceof TunnelClosedError
    ? new ConnectionDropped("The connection dropped.")
    : error;
}
