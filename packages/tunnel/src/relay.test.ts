/**
 * Both ends of the relay's conversation, against a scripted socket: the server proves its key
 * and takes sessions under their ids; the phone asks by key and is put through or told why not.
 */

import { RELAY_VERSION, type RelayFrame } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import { concat, fromBase64url, fromHex, randomBytes, toBase64url, utf8 } from "./bytes.js";
import { checkProof, generateKeyPair } from "./keys.js";
import {
  connectThroughRelay,
  dialTunnelDoor,
  RelayError,
  relayEndpoint,
  type SocketLike,
  serveThroughRelay,
} from "./relay.js";

class FakeSocket implements SocketLike {
  binaryType = "blob";
  readonly sent: unknown[] = [];
  closedWith: [number | undefined, string | undefined] | undefined;
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;
  constructor(readonly url: string) {}
  send(data: string | ArrayBufferLike | ArrayBufferView): void {
    this.sent.push(data);
  }
  close(code?: number, reason?: string): void {
    this.closedWith = [code, reason];
  }
  open(): void {
    this.onopen?.({});
  }
  say(frame: RelayFrame): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
  deliver(data: Uint8Array): void {
    this.onmessage?.({
      data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    });
  }
  hangUp(code: number, reason: string): void {
    this.onclose?.({ code, reason });
  }
  /** The last text frame this end sent, parsed. */
  lastFrame(): RelayFrame {
    const last = [...this.sent].reverse().find((each) => typeof each === "string");
    return JSON.parse(last as string) as RelayFrame;
  }
}

const SESSION = "0123456789abcdef0123456789abcdef";

/** Until the end has sent a frame of this kind: the proof takes a few turns of WebCrypto. */
async function sentFrame(socket: FakeSocket, kind: string): Promise<RelayFrame> {
  for (let i = 0; i < 200; i += 1) {
    const found = socket.sent.find(
      (each) => typeof each === "string" && (JSON.parse(each) as RelayFrame).frame === kind,
    );
    if (found !== undefined) return JSON.parse(found as string) as RelayFrame;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`no ${kind} frame was sent`);
}

describe("relayEndpoint", () => {
  it("names the two doors, whatever the address ends with", () => {
    expect(relayEndpoint("wss://relay.example", "serve")).toBe("wss://relay.example/v1/serve");
    expect(relayEndpoint("ws://127.0.0.1:4440/", "connect")).toBe("ws://127.0.0.1:4440/v1/connect");
  });
});

describe("the server's end", () => {
  it("answers the challenge with a proof the relay can check, and takes sessions by id", async () => {
    const key = await generateKeyPair();
    const sockets: FakeSocket[] = [];
    const opened: { id: string; from: string }[] = [];
    const received: string[] = [];
    const link = serveThroughRelay({
      url: "ws://relay.test",
      key,
      socket: (url) => {
        const socket = new FakeSocket(url);
        sockets.push(socket);
        return socket;
      },
      onOpen: (session) => {
        opened.push({ id: session.id, from: session.from });
        session.wire.onmessage = (data) => received.push(new TextDecoder().decode(data));
        session.wire.send(utf8("from the server"));
      },
    });
    const socket = sockets[0] as FakeSocket;
    expect(socket.url).toBe("ws://relay.test/v1/serve");
    expect(socket.binaryType).toBe("arraybuffer");
    socket.open();

    const ephemeral = await generateKeyPair();
    const nonce = randomBytes(32);
    socket.say({
      frame: "challenge",
      v: RELAY_VERSION,
      nonce: toBase64url(nonce),
      ephemeral: toBase64url(ephemeral.publicKey),
    });
    const serve = await sentFrame(socket, "serve");
    expect(serve.frame).toBe("serve");
    if (serve.frame !== "serve") throw new Error("not a serve frame");
    expect(serve.candidates).toEqual([]);
    expect(fromBase64url(serve.key)).toEqual(key.publicKey);
    expect(
      await checkProof({
        claimedKey: key.publicKey,
        ephemeral,
        nonce,
        proof: fromBase64url(serve.proof),
      }),
    ).toBe(true);

    socket.say({ frame: "serving", v: RELAY_VERSION, session_limit: 8 });
    const serving = await link;
    expect(serving.sessionLimit).toBe(8);

    socket.say({ frame: "open", v: RELAY_VERSION, session: SESSION, from: "203.0.113.5" });
    expect(opened).toEqual([{ id: SESSION, from: "203.0.113.5" }]);
    expect(serving.sessions()).toBe(1);
    // What the session sent left under its id; what arrives under its id reaches it.
    const binary = socket.sent.find((each) => typeof each !== "string") as Uint8Array;
    expect(binary.subarray(0, 16)).toEqual(fromHex(SESSION));
    expect(new TextDecoder().decode(binary.subarray(16))).toBe("from the server");
    socket.deliver(concat(fromHex(SESSION), utf8("from the phone")));
    socket.deliver(concat(fromHex("ffffffffffffffffffffffffffffffff"), utf8("nobody's")));
    expect(received).toEqual(["from the phone"]);

    const closes: string[] = [];
    socket.say({ frame: "close", v: RELAY_VERSION, session: SESSION, reason: "client_gone" });
    expect(serving.sessions()).toBe(0);
    // The server's own close of a session it no longer has does nothing; a short binary frame
    // and a frame it cannot read are ignored; an error after listing closes the socket.
    socket.deliver(new Uint8Array(3));
    socket.onmessage?.({ data: "not json" });
    socket.say({ frame: "error", v: RELAY_VERSION, code: "replaced", message: "another" });
    expect(socket.closedWith).toEqual([1000, "replaced"]);
    serving.onclose = (reason) => closes.push(reason);
    socket.hangUp(1006, "");
    expect(closes).toEqual(["closed_1006"]);
  });

  it("is refused by the relay's word, and gives up when the relay says nothing", async () => {
    const key = await generateKeyPair();
    const sockets: FakeSocket[] = [];
    const factory = (url: string) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    };
    const refused = serveThroughRelay({
      url: "ws://relay.test",
      key,
      socket: factory,
      onOpen: () => undefined,
    });
    (sockets[0] as FakeSocket).open();
    (sockets[0] as FakeSocket).say({
      frame: "error",
      v: RELAY_VERSION,
      code: "bad_proof",
      message: "no",
    });
    await expect(refused).rejects.toMatchObject({ code: "bad_proof" });
    expect((sockets[0] as FakeSocket).closedWith).toEqual([1000, "bad_proof"]);

    const silent = serveThroughRelay({
      url: "ws://relay.test",
      key,
      socket: factory,
      timeoutMs: 5,
      onOpen: () => undefined,
    });
    await expect(silent).rejects.toMatchObject({ code: "timeout" });

    const gone = serveThroughRelay({
      url: "ws://relay.test",
      key,
      socket: factory,
      onOpen: () => undefined,
    });
    (sockets[2] as FakeSocket).hangUp(1006, "");
    await expect(gone).rejects.toBeInstanceOf(RelayError);
  });
});

describe("the runtime's own socket", () => {
  it("is what both ends dial with when none is handed in, and its absence is said plainly", async () => {
    const had = (globalThis as { WebSocket?: unknown }).WebSocket;
    (globalThis as { WebSocket?: unknown }).WebSocket = undefined;
    try {
      await expect(
        connectThroughRelay({ url: "ws://relay.test", serverKey: "k".repeat(43) }),
      ).rejects.toMatchObject({ code: "no_socket" });
    } finally {
      (globalThis as { WebSocket?: unknown }).WebSocket = had;
    }
  });
});

describe("the phone's end", () => {
  it("asks for the server by key and is put through: the socket is the wire from then on", async () => {
    const sockets: FakeSocket[] = [];
    const link = connectThroughRelay({
      url: "wss://relay.example/",
      serverKey: "k".repeat(43),
      socket: (url) => {
        const socket = new FakeSocket(url);
        sockets.push(socket);
        return socket;
      },
    });
    const socket = sockets[0] as FakeSocket;
    expect(socket.url).toBe("wss://relay.example/v1/connect");
    socket.open();
    expect(socket.lastFrame()).toEqual({
      frame: "connect",
      v: RELAY_VERSION,
      key: "k".repeat(43),
      candidates: [],
    });
    socket.say({ frame: "connected", v: RELAY_VERSION, session: SESSION });
    const { wire, session } = await link;
    expect(session).toBe(SESSION);

    const heard: string[] = [];
    wire.onmessage = (data) => heard.push(new TextDecoder().decode(data));
    socket.deliver(utf8("ciphertext, notionally"));
    expect(heard).toEqual(["ciphertext, notionally"]);
    wire.send(utf8("back"));
    expect(socket.sent.at(-1)).toEqual(utf8("back"));

    const closes: string[] = [];
    wire.onclose = (reason) => closes.push(reason);
    // A frame it does not read is ignored; an error is a close by the relay's word.
    socket.onmessage?.({ data: "not json" });
    socket.say({ frame: "error", v: RELAY_VERSION, code: "busy", message: "full" });
    expect(socket.closedWith).toEqual([1000, "busy"]);
    socket.say({ frame: "close", v: RELAY_VERSION, session: SESSION, reason: "server_gone" });
    expect(socket.closedWith).toEqual([1000, "server_gone"]);
    socket.hangUp(1000, "server_gone");
    expect(closes).toEqual(["server_gone"]);
  });

  it("is told when nobody by that key is here, and when the relay cannot be reached", async () => {
    const sockets: FakeSocket[] = [];
    const factory = (url: string) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    };
    const nobody = connectThroughRelay({
      url: "ws://relay.test",
      serverKey: "k".repeat(43),
      socket: factory,
    });
    (sockets[0] as FakeSocket).open();
    (sockets[0] as FakeSocket).say({
      frame: "error",
      v: RELAY_VERSION,
      code: "no_such_server",
      message: "Nobody by that key is here.",
    });
    await expect(nobody).rejects.toMatchObject({ code: "no_such_server" });

    const unreachable = connectThroughRelay({
      url: "ws://relay.test",
      serverKey: "k".repeat(43),
      socket: factory,
    });
    (sockets[1] as FakeSocket).onerror?.({});
    await expect(unreachable).rejects.toMatchObject({ code: "socket_error" });

    const gibberish = connectThroughRelay({
      url: "ws://relay.test",
      serverKey: "k".repeat(43),
      socket: factory,
    });
    (sockets[2] as FakeSocket).open();
    (sockets[2] as FakeSocket).onmessage?.({ data: "not json" });
    await expect(gibberish).rejects.toMatchObject({ code: "bad_frame" });
  });
});

describe("the tunnel's first bytes, sent with the dial (ADR 0253)", () => {
  it("go to the relay right behind the ask, and an answer before anyone listens is held", async () => {
    let socket: FakeSocket | undefined;
    let make: (bytes: Uint8Array<ArrayBuffer>) => void = () => undefined;
    const first = new Promise<Uint8Array<ArrayBuffer>>((resolve) => {
      make = resolve;
    });
    const link = connectThroughRelay({
      url: "wss://relay.example",
      serverKey: "k".repeat(43),
      socket: (url) => {
        socket = new FakeSocket(url);
        return socket;
      },
      first,
    });
    const relay = socket as FakeSocket;
    // Open before the keys are worked out: the ask waits for them, so the two go together.
    relay.open();
    expect(relay.sent).toEqual([]);
    make(utf8("handshake"));
    await first;
    expect(relay.sent).toHaveLength(2);
    expect(relay.lastFrame()).toMatchObject({ frame: "connect", key: "k".repeat(43) });
    expect(relay.sent[1]).toEqual(utf8("handshake"));

    // The server's answer in the same breath as `connected`, ahead of the hand-over.
    relay.say({ frame: "connected", v: RELAY_VERSION, session: SESSION });
    relay.deliver(utf8("answer"));
    relay.deliver(utf8("and more"));
    const { wire } = await link;
    const heard: string[] = [];
    wire.onmessage = (data) => heard.push(new TextDecoder().decode(data));
    expect(heard).toEqual(["answer", "and more"]);
    relay.deliver(utf8("later"));
    expect(heard).toEqual(["answer", "and more", "later"]);
    // Held for the first listener only: one that lets go later is not saved up for.
    wire.onmessage = undefined;
    relay.deliver(utf8("to nobody"));
    wire.onmessage = (data) => heard.push(new TextDecoder().decode(data));
    expect(heard).toHaveLength(3);
  });

  it("go to the door as it opens, and a close before anyone listens is still heard", async () => {
    let socket: FakeSocket | undefined;
    const dialling = dialTunnelDoor({
      url: "ws://192.168.1.20:4431/v1/tunnel",
      socket: (url) => {
        socket = new FakeSocket(url);
        return socket;
      },
      first: Promise.resolve(utf8("handshake")),
    });
    const door = socket as FakeSocket;
    door.open();
    const { wire } = await dialling;
    expect(door.sent).toEqual([utf8("handshake")]);
    door.hangUp(1011, "not_this_key");
    const closed: string[] = [];
    wire.onclose = (reason) => closed.push(reason);
    expect(closed).toEqual(["not_this_key"]);
  });

  it("fail the dial when they cannot be made, and are not sent to a relay that said no", async () => {
    const sockets: FakeSocket[] = [];
    const factory = (url: string) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    };
    const unmade = connectThroughRelay({
      url: "ws://relay.test",
      serverKey: "k".repeat(43),
      socket: factory,
      first: Promise.reject(new Error("no such key")),
    });
    (sockets[0] as FakeSocket).open();
    await expect(unmade).rejects.toMatchObject({ code: "closed" });
    expect((sockets[0] as FakeSocket).sent).toEqual([]);

    const door = dialTunnelDoor({
      url: "ws://192.168.1.20:4431/v1/tunnel",
      socket: factory,
      first: Promise.reject(new Error("no such key")),
    });
    (sockets[1] as FakeSocket).open();
    await expect(door).rejects.toMatchObject({ code: "closed" });
    expect((sockets[1] as FakeSocket).sent).toEqual([]);

    // Gone before the keys were worked out: nothing goes on a socket the dial has given up.
    let make: (bytes: Uint8Array<ArrayBuffer>) => void = () => undefined;
    const late = connectThroughRelay({
      url: "ws://relay.test",
      serverKey: "k".repeat(43),
      socket: factory,
      first: new Promise((resolve) => {
        make = resolve;
      }),
    });
    const gone = sockets[2] as FakeSocket;
    gone.open();
    gone.hangUp(1006, "");
    await expect(late).rejects.toMatchObject({ code: "closed" });
    make(utf8("handshake"));
    await Promise.resolve();
    expect(gone.sent).toEqual([]);
  });
});

describe("the door on the server's own network (ADR 0191)", () => {
  it("is the wire as soon as the socket is open: no frames to the relay, since there is none", async () => {
    let socket: FakeSocket | undefined;
    const dialling = dialTunnelDoor({
      url: "ws://192.168.1.20:4431/v1/tunnel",
      socket: (url) => {
        socket = new FakeSocket(url);
        return socket;
      },
    });
    expect(socket?.url).toBe("ws://192.168.1.20:4431/v1/tunnel");
    expect(socket?.binaryType).toBe("arraybuffer");
    socket?.open();
    const { wire } = await dialling;
    // Nothing was said to get here: the first bytes on the wire are the handshake's.
    expect(socket?.sent).toEqual([]);
    const heard: Uint8Array[] = [];
    wire.onmessage = (data) => heard.push(data);
    wire.send(utf8("hello"));
    expect(socket?.sent).toEqual([utf8("hello")]);
    socket?.deliver(utf8("answer"));
    expect(heard.map((each) => new TextDecoder().decode(each))).toEqual(["answer"]);
    const closed: string[] = [];
    wire.onclose = (reason) => closed.push(reason);
    socket?.hangUp(1001, "server_closing");
    expect(closed).toEqual(["server_closing"]);
  });

  it("says so when nothing answers, when the door closes, and when it is slow", async () => {
    const refused = new FakeSocket("ws://192.168.1.20:4431/v1/tunnel");
    const dial = dialTunnelDoor({ url: refused.url, socket: () => refused });
    refused.hangUp(1006, "");
    await expect(dial).rejects.toMatchObject({ name: "RelayError", code: "closed" });

    const failing = new FakeSocket("ws://192.168.1.20:4431/v1/tunnel");
    const erred = dialTunnelDoor({ url: failing.url, socket: () => failing });
    failing.onerror?.({});
    await expect(erred).rejects.toMatchObject({ code: "socket_error" });

    const silent = new FakeSocket("ws://192.168.1.20:4431/v1/tunnel");
    const slow = dialTunnelDoor({ url: silent.url, socket: () => silent, timeoutMs: 20 });
    await expect(slow).rejects.toBeInstanceOf(RelayError);
    await expect(slow).rejects.toMatchObject({ code: "timeout" });
    expect(silent.closedWith).toEqual([1000, "timeout"]);

    await expect(
      dialTunnelDoor({
        url: "ws://192.168.1.20:4431/v1/tunnel",
        socket: () => {
          throw new Error("no sockets here");
        },
      }),
    ).rejects.toThrow("no sockets here");
  });
});
