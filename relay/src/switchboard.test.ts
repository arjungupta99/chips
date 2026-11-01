/**
 * The switchboard with two fake peers and no port: a server proves its key and is listed, a
 * phone is put through by that key, bytes cross under the session id, and every way a session
 * ends tells the side that is still there. A relay with a list lists nobody else, a peer that
 * falls behind slows whoever sends to it and then loses its session, and nothing logged at info
 * names a key or an address.
 */

import { RELAY_VERSION, type RelayFrame } from "@chipschat/protocol";
import {
  concat,
  fromBase64url,
  fromHex,
  generateKeyPair,
  proveKey,
  toBase64url,
  utf8,
} from "@chipschat/tunnel";
import { describe, expect, it } from "vitest";
import {
  CLOSE_PEER_GONE,
  createSwitchboard,
  type End,
  type Peer,
  SERVERS_PER_ADDRESS,
  SESSIONS_PER_ADDRESS,
  TOO_SLOW,
} from "./switchboard.js";

class FakePeer implements Peer {
  readonly texts: RelayFrame[] = [];
  readonly bytes: Uint8Array[] = [];
  closedWith: [number, string] | undefined;
  /** Bytes waiting to leave for this peer: what a socket that cannot keep up would report. */
  backlog = 0;
  paused = false;
  private drains: { below: number; then: () => void }[] = [];
  constructor(readonly address = "203.0.113.5") {}
  sendText(text: string): void {
    this.texts.push(JSON.parse(text) as RelayFrame);
  }
  sendBytes(data: Uint8Array): number {
    this.bytes.push(new Uint8Array(data));
    return this.backlog;
  }
  close(code: number, reason: string): void {
    this.closedWith = [code, reason];
  }
  pause(): void {
    this.paused = true;
  }
  resume(): void {
    this.paused = false;
  }
  whenDrained(below: number, then: () => void): void {
    if (this.backlog <= below) then();
    else this.drains.push({ below, then });
  }
  /** The socket caught up to `to` bytes waiting. */
  drain(to = 0): void {
    this.backlog = to;
    const due = this.drains.filter((each) => to <= each.below);
    this.drains = this.drains.filter((each) => to > each.below);
    for (const each of due) each.then();
  }
  last(): RelayFrame | undefined {
    return this.texts.at(-1);
  }
}

const say = (end: End, frame: object) => end.text(JSON.stringify(frame));

/** A server through the challenge: listed, with its end and its peer. */
async function listedServer(
  board = createSwitchboard({ maxSessionsPerServer: 2 }),
  address = "198.51.100.7",
) {
  const key = await generateKeyPair();
  const peer = new FakePeer(address);
  const end = await board.serverArrived(peer);
  const challenge = peer.last();
  if (challenge?.frame !== "challenge") throw new Error("no challenge");
  const proof = await proveKey(
    key,
    fromBase64url(challenge.nonce),
    fromBase64url(challenge.ephemeral),
  );
  await say(end, {
    frame: "serve",
    v: RELAY_VERSION,
    key: toBase64url(key.publicKey),
    proof: toBase64url(proof),
    candidates: [],
  });
  return { board, key: toBase64url(key.publicKey), pair: key, peer, end };
}

/** A server that answers its challenge with a proof of `key`, listed or not. */
async function serveAs(
  board: ReturnType<typeof createSwitchboard>,
  key: Awaited<ReturnType<typeof generateKeyPair>>,
  address = "198.51.100.7",
) {
  const peer = new FakePeer(address);
  const end = await board.serverArrived(peer);
  const challenge = peer.last();
  if (challenge?.frame !== "challenge") throw new Error("no challenge");
  const proof = await proveKey(
    key,
    fromBase64url(challenge.nonce),
    fromBase64url(challenge.ephemeral),
  );
  await say(end, {
    frame: "serve",
    v: RELAY_VERSION,
    key: toBase64url(key.publicKey),
    proof: toBase64url(proof),
    candidates: [],
  });
  return { peer, end };
}

async function throughPhone(
  board: ReturnType<typeof createSwitchboard>,
  key: string,
  address = "203.0.113.5",
) {
  const peer = new FakePeer(address);
  const end = board.clientArrived(peer);
  await say(end, { frame: "connect", v: RELAY_VERSION, key, candidates: [] });
  return { peer, end };
}

describe("a server at the switchboard", () => {
  it("is challenged, proves its key, and is listed with the session limit", async () => {
    const { peer, end, board } = await listedServer();
    expect(peer.texts.map((each) => each.frame)).toEqual(["challenge", "serving"]);
    expect(peer.last()).toEqual({ frame: "serving", v: RELAY_VERSION, session_limit: 2 });
    expect(end.isSettled()).toBe(true);
    expect(board.stats()).toEqual({ servers: 1, sessions: 0 });
  });

  it("is refused with a wrong proof, or a proof for another key", async () => {
    const board = createSwitchboard();
    const key = await generateKeyPair();
    const other = await generateKeyPair();
    const peer = new FakePeer();
    const end = await board.serverArrived(peer);
    const challenge = peer.last();
    if (challenge?.frame !== "challenge") throw new Error("no challenge");
    const proof = await proveKey(
      other,
      fromBase64url(challenge.nonce),
      fromBase64url(challenge.ephemeral),
    );
    await say(end, {
      frame: "serve",
      v: RELAY_VERSION,
      key: toBase64url(key.publicKey),
      proof: toBase64url(proof),
      candidates: [],
    });
    expect(peer.last()).toMatchObject({ frame: "error", code: "bad_proof" });
    expect(peer.closedWith).toEqual([1008, "bad_proof"]);
    expect(end.isSettled()).toBe(false);
    expect(board.stats().servers).toBe(0);
  });

  it("is replaced by a newer proof of the same key, and its phones are told", async () => {
    const first = await listedServer();
    const phone = await throughPhone(first.board, first.key);
    expect(first.board.stats()).toEqual({ servers: 1, sessions: 1 });

    const peer = new FakePeer("198.51.100.8");
    const end = await first.board.serverArrived(peer);
    const challenge = peer.last();
    if (challenge?.frame !== "challenge") throw new Error("no challenge");
    const proof = await proveKey(
      first.pair,
      fromBase64url(challenge.nonce),
      fromBase64url(challenge.ephemeral),
    );
    await say(end, {
      frame: "serve",
      v: RELAY_VERSION,
      key: first.key,
      proof: toBase64url(proof),
      candidates: [],
    });
    expect(peer.last()?.frame).toBe("serving");
    expect(first.peer.last()).toMatchObject({ frame: "error", code: "replaced" });
    expect(first.peer.closedWith).toEqual([1008, "replaced"]);
    expect(phone.peer.last()).toMatchObject({ frame: "close", reason: "replaced" });
    expect(phone.peer.closedWith).toEqual([CLOSE_PEER_GONE, "replaced"]);
    expect(first.board.stats()).toEqual({ servers: 1, sessions: 0 });
    // The old socket going away afterwards does not unlist the new one.
    first.end.closed();
    expect(first.board.stats().servers).toBe(1);
  });

  it("is listed by a relay with a list only when its key is on it", async () => {
    const mine = await generateKeyPair();
    const stranger = await generateKeyPair();
    const logged: [string, string, Record<string, unknown>][] = [];
    const board = createSwitchboard({
      allowKeys: new Set([toBase64url(mine.publicKey)]),
      onLog: (level, message, fields) => logged.push([level, message, fields]),
    });

    const refused = await serveAs(board, stranger);
    expect(refused.peer.last()).toMatchObject({ frame: "error", code: "not_allowed" });
    expect(refused.peer.closedWith).toEqual([1008, "not_allowed"]);
    expect(refused.end.isSettled()).toBe(false);
    // The key is what its operator needs to add it, and it is said without an address.
    expect(logged).toContainEqual([
      "warn",
      "server not on the list",
      { key: toBase64url(stranger.publicKey) },
    ]);

    const listed = await serveAs(board, mine);
    expect(listed.peer.last()?.frame).toBe("serving");
    expect(board.stats().servers).toBe(1);
  });

  it("is refused a frame that is not a server's, or that is not a frame", async () => {
    const { peer, end } = await listedServer();
    await say(end, { frame: "connect", v: RELAY_VERSION, key: "k".repeat(43) });
    expect(peer.last()).toMatchObject({ frame: "error", code: "bad_frame" });
    const again = await listedServer();
    await again.end.text("{");
    expect(again.peer.closedWith).toEqual([1008, "bad_frame"]);
  });
});

describe("a phone at the switchboard", () => {
  it("is put through by the server's key, and the server hears where from", async () => {
    const server = await listedServer();
    const phone = await throughPhone(server.board, server.key, "203.0.113.9");
    const connected = phone.peer.last();
    expect(connected).toMatchObject({ frame: "connected", v: RELAY_VERSION });
    if (connected?.frame !== "connected") throw new Error("not connected");
    expect(server.peer.last()).toEqual({
      frame: "open",
      v: RELAY_VERSION,
      session: connected.session,
      from: "203.0.113.9",
    });
    expect(phone.end.isSettled()).toBe(true);

    // Bytes from the phone reach the server under the session id; bytes back lose it.
    phone.end.bytes(utf8("to the server"));
    expect(server.peer.bytes[0]).toEqual(concat(fromHex(connected.session), utf8("to the server")));
    server.end.bytes(concat(fromHex(connected.session), utf8("to the phone")));
    expect(phone.peer.bytes[0]).toEqual(utf8("to the phone"));
    // Bytes for a session that is not there go nowhere.
    server.end.bytes(concat(fromHex("ffffffffffffffffffffffffffffffff"), utf8("nobody")));
    server.end.bytes(utf8("short"));
    expect(phone.peer.bytes).toHaveLength(1);
  });

  it("is told when nobody holds that key, and when the server is full", async () => {
    const server = await listedServer();
    const nobody = await throughPhone(server.board, "n".repeat(43));
    expect(nobody.peer.last()).toMatchObject({ frame: "error", code: "no_such_server" });
    expect(nobody.peer.closedWith).toEqual([1008, "no_such_server"]);

    await throughPhone(server.board, server.key);
    await throughPhone(server.board, server.key);
    const third = await throughPhone(server.board, server.key);
    expect(third.peer.last()).toMatchObject({ frame: "error", code: "busy" });
    expect(server.board.stats()).toEqual({ servers: 1, sessions: 2 });
  });

  it("is told the server is busy when it holds as many from that address as it may (SEC-12)", async () => {
    // Whoever holds the key, which is in every QR, cannot take every session from one place.
    const server = await listedServer(createSwitchboard());
    const here = [];
    for (let i = 0; i < SESSIONS_PER_ADDRESS; i += 1) {
      here.push(await throughPhone(server.board, server.key, "203.0.113.5"));
    }
    const oneMore = await throughPhone(server.board, server.key, "::ffff:203.0.113.5");
    expect(oneMore.peer.last()).toMatchObject({ frame: "error", code: "busy" });
    expect(oneMore.peer.closedWith).toEqual([1008, "busy"]);
    // Another address is put through, and the first is again once one of its sessions goes.
    const elsewhere = await throughPhone(server.board, server.key, "198.51.100.20");
    expect(elsewhere.peer.last()?.frame).toBe("connected");
    here[0]?.end.closed();
    const after = await throughPhone(server.board, server.key, "203.0.113.5");
    expect(after.peer.last()?.frame).toBe("connected");

    // An IPv6 address is its /64, however many addresses in it ask.
    const six = await listedServer(createSwitchboard());
    for (let i = 1; i <= SESSIONS_PER_ADDRESS; i += 1) {
      await throughPhone(six.board, six.key, `2001:db8:1:2::${i.toString(16)}`);
    }
    const sameBlock = await throughPhone(six.board, six.key, "2001:db8:1:2:ffff::1");
    expect(sameBlock.peer.last()).toMatchObject({ frame: "error", code: "busy" });
    const nextBlock = await throughPhone(six.board, six.key, "2001:db8:1:3::1");
    expect(nextBlock.peer.last()?.frame).toBe("connected");
    expect(six.board.stats().sessions).toBe(SESSIONS_PER_ADDRESS + 1);
  });

  it("lists only so many servers from one address, an open relay's limit (ADR 0245)", async () => {
    const board = createSwitchboard();
    const here = [];
    for (let i = 0; i < SERVERS_PER_ADDRESS; i += 1) {
      here.push(await listedServer(board, "203.0.113.9"));
    }
    const oneMore = await listedServer(board, "::ffff:203.0.113.9");
    expect(oneMore.peer.last()).toMatchObject({ frame: "error", code: "busy" });
    expect(board.stats().servers).toBe(SERVERS_PER_ADDRESS);
    // Another address is listed; and one already listed from here comes back after a restart.
    const elsewhere = await listedServer(board, "198.51.100.30");
    expect(elsewhere.peer.last()?.frame).toBe("serving");
    const first = here[0];
    if (first === undefined) throw new Error("none listed");
    const again = await serveAs(board, first.pair, "203.0.113.9");
    expect(again.peer.last()?.frame).toBe("serving");
  });

  it("ends its session when it goes, when the server closes it, and when the server goes", async () => {
    const server = await listedServer();
    const gone = await throughPhone(server.board, server.key);
    gone.end.closed();
    expect(server.peer.last()).toMatchObject({ frame: "close", reason: "client_gone" });
    expect(server.board.stats().sessions).toBe(0);

    const dismissed = await throughPhone(server.board, server.key);
    const session = dismissed.peer.last();
    if (session?.frame !== "connected") throw new Error("not connected");
    await say(server.end, {
      frame: "close",
      v: RELAY_VERSION,
      session: session.session,
      reason: "done",
    });
    expect(dismissed.peer.last()).toMatchObject({ frame: "close", reason: "done" });
    expect(dismissed.peer.closedWith).toEqual([CLOSE_PEER_GONE, "done"]);

    const orphaned = await throughPhone(server.board, server.key);
    server.end.closed();
    expect(orphaned.peer.last()).toMatchObject({ frame: "close", reason: "server_gone" });
    expect(orphaned.peer.closedWith).toEqual([CLOSE_PEER_GONE, "server_gone"]);
    expect(server.board.stats()).toEqual({ servers: 0, sessions: 0 });
  });

  it("may hang up itself, and is refused what is not a phone's frame", async () => {
    const server = await listedServer();
    const polite = await throughPhone(server.board, server.key);
    await say(polite.end, {
      frame: "close",
      v: RELAY_VERSION,
      session: "0".repeat(32),
      reason: "bye",
    });
    expect(server.peer.last()).toMatchObject({ frame: "close", reason: "bye" });
    expect(polite.peer.closedWith).toEqual([1000, "bye"]);

    const rude = new FakePeer();
    const end = server.board.clientArrived(rude);
    await say(end, {
      frame: "serve",
      v: RELAY_VERSION,
      key: "k".repeat(43),
      proof: "p".repeat(43),
    });
    expect(rude.last()).toMatchObject({ frame: "error", code: "bad_frame" });
    // Bytes before being put through go nowhere.
    end.bytes(utf8("early"));
    expect(server.peer.bytes).toHaveLength(0);
  });

  it("reads a newer peer's frame by the fields this version knows, and logs it", async () => {
    const logged: string[] = [];
    const board = createSwitchboard({
      onLog: (level, message) => logged.push(`${level}:${message}`),
    });
    const server = await listedServer(board);
    const phone = new FakePeer();
    const end = board.clientArrived(phone);
    await say(end, {
      frame: "connect",
      v: 2,
      key: server.key,
      candidates: [{ address: "203.0.113.5:4431", kind: "srflx" }],
      punch: true,
    });
    expect(phone.last()?.frame).toBe("connected");
    expect(logged).toContain("debug:a newer peer");
  });

  it("is sent away when the relay stops", async () => {
    const server = await listedServer();
    const phone = await throughPhone(server.board, server.key);
    server.board.close();
    expect(phone.peer.closedWith).toEqual([1001, "relay_stopping"]);
    expect(server.peer.closedWith).toEqual([1001, "relay_stopping"]);
    expect(server.board.stats()).toEqual({ servers: 0, sessions: 0 });
  });
});

describe("a peer that falls behind", () => {
  const flow = { pauseAt: 100, resumeAt: 10, dropAt: 1000 };

  it("stops the server being read until the phone has caught up, and then reads it again", async () => {
    const server = await listedServer(createSwitchboard({ flow }));
    const phone = await throughPhone(server.board, server.key);
    const connected = phone.peer.texts.find((each) => each.frame === "connected");
    if (connected?.frame !== "connected") throw new Error("not connected");
    const toPhone = (words: string) =>
      server.end.bytes(concat(fromHex(connected.session), utf8(words)));

    phone.peer.backlog = 50;
    toPhone("within");
    expect(server.peer.paused).toBe(false);
    phone.peer.backlog = 500;
    toPhone("past the line");
    expect(server.peer.paused).toBe(true);
    phone.peer.drain(20);
    expect(server.peer.paused).toBe(true);
    phone.peer.drain(5);
    expect(server.peer.paused).toBe(false);
    expect(phone.peer.bytes).toHaveLength(2);
  });

  it("holds a server for as long as any one of its phones is behind", async () => {
    const server = await listedServer(createSwitchboard({ flow, maxSessionsPerServer: 2 }));
    const slow = await throughPhone(server.board, server.key);
    const slower = await throughPhone(server.board, server.key);
    for (const phone of [slow, slower]) {
      const connected = phone.peer.texts.find((each) => each.frame === "connected");
      if (connected?.frame !== "connected") throw new Error("not connected");
      phone.peer.backlog = 500;
      server.end.bytes(concat(fromHex(connected.session), utf8("a clip")));
    }
    expect(server.peer.paused).toBe(true);
    slow.peer.drain();
    expect(server.peer.paused).toBe(true);
    // The other one hangs up rather than catching up: nothing is waited on any more.
    slower.end.closed();
    expect(server.peer.paused).toBe(false);
  });

  it("stops a phone being read while its server's socket is behind", async () => {
    const server = await listedServer(createSwitchboard({ flow }));
    const phone = await throughPhone(server.board, server.key);
    server.peer.backlog = 500;
    phone.end.bytes(utf8("an upload"));
    expect(phone.peer.paused).toBe(true);
    server.peer.drain();
    expect(phone.peer.paused).toBe(false);
  });

  it("loses its session when it falls past the last line, and frees whoever it held", async () => {
    const server = await listedServer(createSwitchboard({ flow }));
    const phone = await throughPhone(server.board, server.key);
    const connected = phone.peer.texts.find((each) => each.frame === "connected");
    if (connected?.frame !== "connected") throw new Error("not connected");
    phone.peer.backlog = 500;
    server.end.bytes(concat(fromHex(connected.session), utf8("held")));
    expect(server.peer.paused).toBe(true);
    phone.peer.backlog = 5000;
    server.end.bytes(concat(fromHex(connected.session), utf8("too much")));
    expect(phone.peer.closedWith).toEqual([CLOSE_PEER_GONE, TOO_SLOW]);
    expect(server.peer.last()).toMatchObject({ frame: "close", reason: TOO_SLOW });
    expect(server.peer.paused).toBe(false);
    expect(server.board.stats().sessions).toBe(0);
  });
});

describe("what the switchboard logs", () => {
  it("names a key and an address together only at debug", async () => {
    const logged: [string, Record<string, unknown>][] = [];
    const board = createSwitchboard({
      onLog: (level, _message, fields) => logged.push([level, fields]),
    });
    const server = await listedServer(board);
    const phone = await throughPhone(board, server.key, "203.0.113.9");
    phone.end.closed();
    server.end.closed();
    expect(logged.length).toBeGreaterThan(0);
    for (const [level, fields] of logged) {
      const both = "key" in fields && ("from" in fields || "address" in fields);
      const session = "session" in fields && "from" in fields;
      if (both || session) expect(level).toBe("debug");
    }
  });
});

describe("what the switchboard counts", () => {
  it("says each listing and each phone put through by key, and lists who is here now", async () => {
    const counted: [string, string][] = [];
    const board = createSwitchboard({ counted: (what, key) => counted.push([what, key]) });
    const server = await listedServer(board);
    expect(board.listing()).toEqual([[server.key, 0]]);

    const phone = await throughPhone(board, server.key);
    await throughPhone(board, "not-a-key-anyone-holds");
    expect(counted).toEqual([
      ["listed", server.key],
      ["opened", server.key],
    ]);
    expect(board.listing()).toEqual([[server.key, 1]]);

    phone.end.closed();
    expect(board.listing()).toEqual([[server.key, 0]]);
    server.end.closed();
    expect(board.listing()).toEqual([]);
  });
});
