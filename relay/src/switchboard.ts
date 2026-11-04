/**
 * The switchboard (M4.1, ADR 0038 decision 2): it matches a phone to a server by the server's
 * key and moves bytes between them. It learns which keys are here, which phones asked for
 * them and from where, and when; it reads no event, holds no role, and cannot open the bytes
 * it moves, which are the tunnel's ciphertext.
 *
 * Nothing in this file touches a socket. Each side is a `Peer` the adapter hands in — send
 * text, send bytes, close — and what arrives comes through the `End` this hands back, so the
 * whole conversation can be driven in a test with two objects and no port. `server.ts` is the
 * `ws` around it.
 *
 * The rules, few enough to list: a server proves it holds the key it claims before it is
 * listed, and the newest proof for a key wins, since a server that restarted must be able to
 * come back before its old socket has timed out. A relay given a list of keys lists those and
 * no others. A phone that asks for a key nobody holds is told so and closed. A server holds at
 * most a fixed number of phones, and only so many of them from any one address, since a server's
 * key is in every QR and anyone holding it may ask for that server (SEC-12). And a server that
 * is full makes room for a phone from a place holding fewer of its sessions than another does,
 * by ending the oldest session of the place holding most: whoever holds the key, an old invite's
 * or a removed member's, could otherwise fill a server's sessions from two addresses and keep
 * its own people out of it for as long as they liked. Every frame carries a version; a newer
 * peer's frame is read by the fields this version knows.
 *
 * And one rule about speed: the relay holds what one end sends until the other end takes it, and
 * it holds only so much. Past a few megabytes waiting for a peer, whoever is sending to it stops
 * being read until it drains, which is how TCP itself would have slowed the sender with no relay
 * in between; past a few more, the session is ended. One slow phone cannot fill the relay.
 *
 * What it logs names a key and an address together only at debug: at info it says how many
 * (`server.ts`), and its terms say the logs go after seven days.
 */

import { countedAs } from "@chipschat/platform";
import {
  parseRelayFrame,
  RELAY_SESSION_ID_BYTES,
  RELAY_VERSION,
  type RelayErrorCode,
  type RelayFrame,
} from "@chipschat/protocol";
import {
  checkProof,
  concat,
  fromBase64url,
  generateKeyPair,
  type KeyPair,
  randomBytes,
  toBase64url,
  toHex,
} from "@chipschat/tunnel";

/** One socket, as the switchboard needs it. */
export interface Peer {
  /** Where it came from, for the server's limiter, the log and `SESSIONS_PER_ADDRESS`. */
  readonly address: string;
  readonly sendText: (text: string) => void;
  /** Answers how many bytes are waiting to leave for this peer, these among them. */
  readonly sendBytes: (data: Uint8Array) => number;
  readonly close: (code: number, reason: string) => void;
  /** Stop reading what this peer sends, and start again. */
  readonly pause: () => void;
  readonly resume: () => void;
  /** Call `then` once, when what waits to leave for this peer is `below` bytes or fewer. */
  readonly whenDrained: (below: number, then: () => void) => void;
}

/** What the adapter calls when the socket speaks or goes. */
export interface End {
  readonly text: (text: string) => Promise<void>;
  readonly bytes: (data: Uint8Array) => void;
  readonly closed: () => void;
  /** Past its first exchange: a server listed, a phone put through. */
  readonly isSettled: () => boolean;
}

export type LogLevel = "info" | "warn" | "debug";

export interface SwitchboardOptions {
  readonly maxSessionsPerServer?: number | undefined;
  /**
   * The servers this relay lists, by key; any other is refused `not_allowed`. Absent, any server
   * that proves its key is listed.
   */
  readonly allowKeys?: ReadonlySet<string> | undefined;
  /**
   * Bytes waiting for one peer: past `pauseAt` whoever sends to it is not read until it is down
   * to `resumeAt`, and past `dropAt` the session is ended. 4 MiB, 1 MiB and 16 MiB.
   */
  readonly flow?:
    | { readonly pauseAt: number; readonly resumeAt: number; readonly dropAt: number }
    | undefined;
  readonly onLog?:
    | ((level: LogLevel, message: string, fields: Record<string, unknown>) => void)
    | undefined;
  /** Nonces and session ids. Injected so a test can watch for one. */
  readonly random?: ((length: number) => Uint8Array) | undefined;
  /**
   * Every byte forwarded, by direction, as it is forwarded. The tests' packet capture — what
   * this sees is what the relay could ever see — and M6.4's meter for ADR 0038's threshold.
   */
  readonly tap?: ((direction: "to_server" | "to_client", data: Uint8Array) => void) | undefined;
  /**
   * A server was listed, or a phone put through to one, by the server's key: what the day's
   * counts are made of (`tally.ts`), which keep the number and forget the key.
   */
  readonly counted?: ((what: "listed" | "opened", key: string) => void) | undefined;
}

export interface Switchboard {
  /** A server arrived at `/v1/serve`. It is challenged at once. */
  readonly serverArrived: (peer: Peer) => Promise<End>;
  /** A phone arrived at `/v1/connect`. */
  readonly clientArrived: (peer: Peer) => End;
  readonly stats: () => { servers: number; sessions: number };
  /** Each server listed now, by key, with how many sessions it has open. */
  readonly listing: () => Array<readonly [key: string, sessions: number]>;
  /** Everybody off: the relay is stopping. */
  readonly close: () => void;
}

/** The socket close code a peer hears when the other end of its session went away. */
export const CLOSE_PEER_GONE = 4002;
/** Why a session ends when one end could not keep up with the other. */
export const TOO_SLOW = "too_slow";
/**
 * The sessions one server may hold from one place: an address, an IPv6 address by its /64, as
 * the server's limiter counts them. A household away together, or a team in one office, shares an
 * address, and each phone, tablet and Mac is a session, two for a moment while one reconnects.
 */
export const SESSIONS_PER_ADDRESS = 16;

/**
 * The servers one place may have listed at once (ADR 0245), counted as `SESSIONS_PER_ADDRESS` is.
 * A home or an office runs one or two, a bench a few more; an open relay needs a limit somewhere,
 * or one address could list servers until the box ran out of memory.
 */
export const SERVERS_PER_ADDRESS = 8;

const MIB = 1024 * 1024;
const DEFAULT_FLOW = { pauseAt: 4 * MIB, resumeAt: 1 * MIB, dropAt: 16 * MIB };
/** The socket close code for a frame the relay would not take. */
const CLOSE_POLICY = 1008;
/** Why a session ends when its server was full and a phone from a place with fewer came. */
export const MADE_ROOM = "made_room";

interface ServerConn {
  readonly peer: Peer;
  /** Where it came from, as `SERVERS_PER_ADDRESS` counts it. */
  readonly place: string;
  key: string | undefined;
  challenge: { nonce: Uint8Array; ephemeral: KeyPair } | undefined;
  readonly sessions: Map<string, ClientConn>;
}

interface ClientConn {
  readonly peer: Peer;
  /** Where it came from, as `SESSIONS_PER_ADDRESS` counts it. */
  readonly place: string;
  server: ServerConn | undefined;
  session: string | undefined;
  readonly prefix: Uint8Array;
}

type ServeFrame = Extract<RelayFrame, { frame: "serve" }>;
type ConnectFrame = Extract<RelayFrame, { frame: "connect" }>;

/**
 * The session to end so a phone from `place` gets in a full server: the oldest of the place
 * holding most of its sessions, when that place holds more than `place` does; else nothing, and
 * the phone is told the server is busy. The oldest, so a phone that has squatted longest goes
 * first and the one that just came stays.
 */
function roomFor(sessions: ReadonlyMap<string, ClientConn>, place: string): ClientConn | undefined {
  const counts = new Map<string, number>();
  for (const session of sessions.values()) {
    counts.set(session.place, (counts.get(session.place) ?? 0) + 1);
  }
  const most = Math.max(0, ...counts.values());
  if (most <= (counts.get(place) ?? 0)) return undefined;
  // In the order they came, so the first found is the oldest.
  return [...sessions.values()].find((session) => counts.get(session.place) === most);
}

function frame(text: RelayFrame): string {
  return JSON.stringify(text);
}

function refuse(peer: Peer, code: RelayErrorCode, message: string): void {
  peer.sendText(frame({ frame: "error", v: RELAY_VERSION, code, message }));
  peer.close(CLOSE_POLICY, code);
}

export function createSwitchboard(options: SwitchboardOptions = {}): Switchboard {
  const limit = options.maxSessionsPerServer ?? 32;
  const allowed = options.allowKeys;
  const flow = options.flow ?? DEFAULT_FLOW;
  const random = options.random ?? randomBytes;
  const log = options.onLog ?? (() => undefined);
  const tap = options.tap ?? (() => undefined);
  const counted = options.counted ?? (() => undefined);
  /** Servers by key: the one whose proof was newest. */
  const servers = new Map<string, ServerConn>();
  const everyone = new Set<Peer>();
  /** A sender not being read, and every peer it waits on to drain. */
  const heldBy = new Map<Peer, Set<Peer>>();

  /** Stop reading `sender` until `receiver` has drained. */
  const hold = (sender: Peer, receiver: Peer) => {
    let holders = heldBy.get(sender);
    if (holders?.has(receiver) === true) return;
    if (holders === undefined) {
      holders = new Set();
      heldBy.set(sender, holders);
      sender.pause();
    }
    holders.add(receiver);
    receiver.whenDrained(flow.resumeAt, () => release(sender, receiver));
  };

  const release = (sender: Peer, receiver: Peer) => {
    const holders = heldBy.get(sender);
    if (holders === undefined || !holders.delete(receiver)) return;
    if (holders.size > 0) return;
    heldBy.delete(sender);
    sender.resume();
  };

  /** A peer is gone: nobody waits on it, and it waits on nobody. */
  const forgetFlow = (gone: Peer) => {
    heldBy.delete(gone);
    for (const sender of [...heldBy.keys()]) release(sender, gone);
  };

  /** Bytes from one peer to another: `false` when the receiver is too far behind to keep. */
  const forward = (sender: Peer, receiver: Peer, data: Uint8Array): boolean => {
    const waiting = receiver.sendBytes(data);
    if (waiting > flow.dropAt) return false;
    if (waiting > flow.pauseAt) hold(sender, receiver);
    return true;
  };

  /** A frame read, or the peer refused and nothing. */
  const read = (peer: Peer, text: string): RelayFrame | undefined => {
    const parsed = parseRelayFrame(text);
    if (!parsed.ok) {
      refuse(peer, "bad_frame", "That is not a frame this relay understands.");
      return undefined;
    }
    if (parsed.frame.v > RELAY_VERSION) {
      log("debug", "a newer peer", { v: parsed.frame.v, from: peer.address });
    }
    return parsed.frame;
  };

  /** A session is over: whichever sides are told, and the phone's socket closed. */
  const endSession = (
    client: ClientConn,
    reason: string,
    tell: { server: boolean; client: boolean },
  ) => {
    const { server, session } = client;
    if (server === undefined || session === undefined) return;
    server.sessions.delete(session);
    client.server = undefined;
    client.session = undefined;
    const closing = frame({ frame: "close", v: RELAY_VERSION, session, reason });
    if (tell.server) server.peer.sendText(closing);
    if (tell.client) {
      client.peer.sendText(closing);
      client.peer.close(CLOSE_PEER_GONE, reason);
      forgetFlow(client.peer);
    }
    log("debug", "session closed", { session, reason, from: client.peer.address });
  };

  const unlist = (server: ServerConn, reason: string) => {
    if (server.key !== undefined && servers.get(server.key) === server) servers.delete(server.key);
    for (const client of [...server.sessions.values()]) {
      endSession(client, reason, { server: false, client: true });
    }
    server.key = undefined;
  };

  const list = (server: ServerConn, key: string) => {
    const previous = servers.get(key);
    if (previous !== undefined && previous !== server) {
      // The newest proof wins: a server that restarted is back before its old socket timed out.
      unlist(previous, "replaced");
      refuse(previous.peer, "replaced", "Another connection proved this key.");
    }
    server.key = key;
    servers.set(key, server);
    server.peer.sendText(frame({ frame: "serving", v: RELAY_VERSION, session_limit: limit }));
    counted("listed", key);
    log("debug", "server listed", {
      key,
      from: server.peer.address,
      replaced: previous !== undefined,
    });
  };

  const serve = async (server: ServerConn, said: ServeFrame) => {
    const challenge = server.challenge;
    server.challenge = undefined;
    if (server.key !== undefined || challenge === undefined) {
      refuse(server.peer, "bad_frame", "Answer the challenge once.");
      return;
    }
    // Before the proof, which costs a key agreement: a key not on the list is refused whether or
    // not its holder could prove it. A key alone is in every QR, so naming it here pairs it with
    // nothing.
    if (allowed !== undefined && !allowed.has(said.key)) {
      log("warn", "server not on the list", { key: said.key });
      refuse(
        server.peer,
        "not_allowed",
        "This relay serves the servers on its list, and this key is not on it.",
      );
      return;
    }
    // A key listed already from here is a server back after a restart, which replaces itself.
    const fromThere = [...servers.values()].filter(
      (other) => other.place === server.place && other.key !== said.key,
    );
    if (fromThere.length >= SERVERS_PER_ADDRESS) {
      log("warn", "too many servers from one place", { from: server.peer.address });
      refuse(server.peer, "busy", "This relay lists as many servers from your address as it may.");
      return;
    }
    const proved = await checkProof({
      claimedKey: fromBase64url(said.key),
      ephemeral: challenge.ephemeral,
      nonce: challenge.nonce,
      proof: fromBase64url(said.proof),
    });
    if (!proved) {
      log("warn", "bad proof", { from: server.peer.address });
      refuse(server.peer, "bad_proof", "That proof is not for that key.");
      return;
    }
    list(server, said.key);
  };

  /** A server's half of the conversation: its proof, and the sessions it closes. */
  const onServerFrame = async (server: ServerConn, said: RelayFrame) => {
    if (said.frame === "serve") {
      await serve(server, said);
      return;
    }
    if (said.frame === "close") {
      const client = server.sessions.get(said.session);
      if (client !== undefined) endSession(client, said.reason, { server: false, client: true });
      return;
    }
    refuse(server.peer, "bad_frame", `A server does not send ${said.frame}.`);
  };

  const serverEnd = (server: ServerConn): End => ({
    isSettled: () => server.key !== undefined,
    async text(text) {
      const said = read(server.peer, text);
      if (said !== undefined) await onServerFrame(server, said);
    },
    bytes(data) {
      if (data.length < RELAY_SESSION_ID_BYTES) return;
      const client = server.sessions.get(toHex(data.subarray(0, RELAY_SESSION_ID_BYTES)));
      if (client === undefined) return;
      const payload = data.subarray(RELAY_SESSION_ID_BYTES);
      tap("to_client", payload);
      if (!forward(server.peer, client.peer, payload)) {
        endSession(client, TOO_SLOW, { server: true, client: true });
      }
    },
    closed() {
      everyone.delete(server.peer);
      forgetFlow(server.peer);
      unlist(server, "server_gone");
    },
  });

  const connect = (client: ClientConn, said: ConnectFrame) => {
    const server = servers.get(said.key);
    if (server === undefined) {
      refuse(client.peer, "no_such_server", "Nobody by that key is here.");
      return;
    }
    if (server.sessions.size >= limit) {
      const room = roomFor(server.sessions, client.place);
      if (room === undefined) {
        refuse(client.peer, "busy", "That server has as many phones as this relay holds for it.");
        return;
      }
      endSession(room, MADE_ROOM, { server: true, client: true });
    }
    const fromThere = [...server.sessions.values()].filter((other) => other.place === client.place);
    if (fromThere.length >= SESSIONS_PER_ADDRESS) {
      refuse(client.peer, "busy", "That server has as many phones from your address as it may.");
      return;
    }
    const session = toHex(client.prefix);
    client.server = server;
    client.session = session;
    server.sessions.set(session, client);
    client.peer.sendText(frame({ frame: "connected", v: RELAY_VERSION, session }));
    const from = client.peer.address;
    server.peer.sendText(frame({ frame: "open", v: RELAY_VERSION, session, from }));
    counted("opened", said.key);
    log("debug", "session opened", { session, key: said.key, from });
  };

  /** A phone's half of the conversation: the server it wants, and its own hanging up. */
  const onClientFrame = (client: ClientConn, said: RelayFrame) => {
    if (said.frame === "connect") {
      if (client.session !== undefined)
        refuse(client.peer, "bad_frame", "You are through already.");
      else connect(client, said);
      return;
    }
    if (said.frame === "close") {
      endSession(client, said.reason, { server: true, client: false });
      client.peer.close(1000, said.reason);
      return;
    }
    refuse(client.peer, "bad_frame", `A phone does not send ${said.frame}.`);
  };

  const clientEnd = (client: ClientConn): End => ({
    isSettled: () => client.session !== undefined,
    async text(text) {
      const said = read(client.peer, text);
      if (said !== undefined) onClientFrame(client, said);
    },
    bytes(data) {
      if (client.server === undefined) return;
      tap("to_server", data);
      if (!forward(client.peer, client.server.peer, concat(client.prefix, data))) {
        endSession(client, TOO_SLOW, { server: true, client: true });
      }
    },
    closed() {
      everyone.delete(client.peer);
      forgetFlow(client.peer);
      endSession(client, "client_gone", { server: true, client: false });
    },
  });

  return {
    async serverArrived(peer) {
      everyone.add(peer);
      const challenge = { nonce: random(32), ephemeral: await generateKeyPair() };
      const server: ServerConn = {
        peer,
        place: countedAs(peer.address),
        key: undefined,
        challenge,
        sessions: new Map(),
      };
      peer.sendText(
        frame({
          frame: "challenge",
          v: RELAY_VERSION,
          nonce: toBase64url(challenge.nonce),
          ephemeral: toBase64url(challenge.ephemeral.publicKey),
        }),
      );
      return serverEnd(server);
    },
    clientArrived(peer) {
      everyone.add(peer);
      const prefix = random(RELAY_SESSION_ID_BYTES);
      const place = countedAs(peer.address);
      return clientEnd({ peer, place, server: undefined, session: undefined, prefix });
    },
    stats() {
      let sessions = 0;
      for (const server of servers.values()) sessions += server.sessions.size;
      return { servers: servers.size, sessions };
    },
    listing() {
      return [...servers].map(([key, server]) => [key, server.sessions.size] as const);
    },
    close() {
      for (const peer of [...everyone]) peer.close(1001, "relay_stopping");
      everyone.clear();
      servers.clear();
      heldBy.clear();
    },
  };
}
