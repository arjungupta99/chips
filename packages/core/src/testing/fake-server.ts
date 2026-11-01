/**
 * A server with both ways in, for the link's and the transport's tests: a socket at the relay's
 * `/v1/connect` is answered `connected` and then carries the tunnel's bytes; a socket at the
 * door's `/v1/tunnel` carries them from the start (ADR 0191). Behind either is the same server
 * end — the Noise handshake with the server's key, then an answerer with the handler — so a test
 * can say which way a phone went by which URL its socket opened, and read what reached the server.
 */

import { RELAY_VERSION } from "@chipschat/protocol";
import {
  type Answerer,
  createAnswerer,
  createChannel,
  generateKeyPair,
  type KeyPair,
  type RequestInput,
  type ResponseOutput,
  respondHandshake,
  type SocketLike,
  toBase64url,
  toHex,
  type Wire,
} from "@chipschat/tunnel";
import type { RelayAddress } from "../link.js";

const SESSION = "0123456789abcdef0123456789abcdef";

/** What the door does with a socket: answer it, close it at once, or never open it. */
export type DoorMood = "answers" | "refuses" | "silent";

export interface FakeServer {
  readonly key: KeyPair;
  /** The server's key as a device holds it. */
  readonly serverKey: string;
  readonly relay: RelayAddress;
  /** The socket factory a device is handed: it serves the relay's door and the server's own. */
  readonly factory: (url: string) => SocketLike;
  /** Every URL a socket was opened at, in order. */
  readonly opened: string[];
  /** Every request that reached the server, through either door. */
  readonly seen: RequestInput[];
  /** Binary frames the server's end received, handshakes included. */
  readonly frames: () => number;
  readonly answerer: () => Answerer | undefined;
  /** The handshake hash of the last tunnel opened, hex, as the server's end holds it. */
  readonly handshakeHash: () => string | undefined;
  /** Every target a socket was opened at inside a tunnel, and the asks its open carried. */
  readonly sockets: string[];
  readonly asks: (Record<string, string> | undefined)[];
  /** What a quiet tunnelled socket read, once it was taken. */
  readonly heard: string[];
  door: DoorMood;
}

export interface FakeServerOptions {
  /** The server's own key; a fresh one unless said. */
  readonly key?: KeyPair | undefined;
  readonly door?: DoorMood | undefined;
  /**
   * Whether a socket inside a tunnel echoes what it is sent, which the link's tests read. A
   * transport's test wants it quiet: an echo is not a frame, and the socket would close on it.
   */
  readonly echo?: boolean | undefined;
  /**
   * Whether a socket's open may carry its ticket's ask (ADR 0253), as a server since does; one
   * from before lets a socket in on a ticket only.
   */
  readonly takesAsks?: boolean | undefined;
  /** Until this settles, a socket is not taken: the server is still deciding. */
  readonly takesAfter?: Promise<void> | undefined;
}

/** A server end: the handshake with `key`, then an answerer over the wire. */
function serve(
  server: {
    readonly key: KeyPair;
    readonly seen: RequestInput[];
    readonly sockets: string[];
    readonly asks: (Record<string, string> | undefined)[];
    readonly handle: (input: RequestInput) => Promise<ResponseOutput>;
    readonly took: (answerer: Answerer, handshakeHash: string) => void;
    readonly echo: boolean;
    readonly takesAsks: boolean;
    readonly heard: string[];
    readonly takesAfter: Promise<void> | undefined;
  },
  wire: Wire,
): void {
  wire.onmessage = (first) => {
    void respondHandshake(server.key, first).then(
      ({ message, tunnel }) => {
        wire.send(message);
        server.took(
          createAnswerer(createChannel(tunnel, wire), {
            request: async (input) => {
              server.seen.push(input);
              return server.handle(input);
            },
            socket: async (target, peer, headers) => {
              server.sockets.push(target);
              server.asks.push(headers);
              const ticketed = target.startsWith("/v1/ws?ticket=");
              const asked =
                server.takesAsks &&
                target === "/v1/ws" &&
                headers?.["x-chips-device"] !== undefined;
              if (!ticketed && !asked) return { ok: false, code: 4001, reason: "unauthorized" };
              peer.onmessage = server.echo
                ? (message) => peer.send(`echo ${message}`)
                : (message) => server.heard.push(message);
              await server.takesAfter;
              return { ok: true };
            },
          }),
          toHex(tunnel.handshakeHash),
        );
      },
      // Not the key the phone asked for, or not a handshake at all: the server says nothing and
      // closes, as the real one does (`answerTunnel`).
      () => wire.close(),
    );
  };
}

export async function fakeServer(
  handle: (input: RequestInput) => Promise<ResponseOutput>,
  options: FakeServerOptions = {},
): Promise<FakeServer> {
  const key = options.key ?? (await generateKeyPair());
  const serverKey = toBase64url(key.publicKey);
  const seen: RequestInput[] = [];
  const sockets: string[] = [];
  const asks: (Record<string, string> | undefined)[] = [];
  const heard: string[] = [];
  const opened: string[] = [];
  let frames = 0;
  let answerer: Answerer | undefined;
  let handshakeHash: string | undefined;
  const server = {
    key,
    seen,
    sockets,
    asks,
    handle,
    echo: options.echo ?? true,
    takesAsks: options.takesAsks ?? true,
    heard,
    takesAfter: options.takesAfter,
    took: (made: Answerer, hash: string) => {
      answerer = made;
      handshakeHash = hash;
    },
  };

  /** What the relay's door says to a text frame: `connected`, or `error` for another key. */
  const relayFrameFor = (data: string): Record<string, unknown> => {
    const frame = JSON.parse(data) as { frame: string; key: string; v: number };
    if (frame.frame === "connect" && frame.v === RELAY_VERSION && frame.key === serverKey) {
      return { frame: "connected", v: RELAY_VERSION, session: SESSION };
    }
    return {
      frame: "error",
      v: RELAY_VERSION,
      code: "no_such_server",
      message: "No server of that key is here.",
    };
  };

  /** One socket, either door: the phone's end, and the wire the server end speaks on. */
  const socketAt = (viaRelay: boolean): SocketLike => {
    // The relay puts the phone through as it reads `connect`, before it says so, and carries
    // nothing for a phone it has not put through; the door carries everything.
    let through = !viaRelay;
    const onText = (data: string) => {
      // A text frame is not a tunnel's: the real door closes on it; the relay answers it.
      if (!viaRelay) {
        socket.close(1003, "binary_only");
        return;
      }
      const answer = relayFrameFor(data);
      through = answer["frame"] === "connected";
      const said = JSON.stringify(answer);
      queueMicrotask(() => socket.onmessage?.({ data: said }));
    };
    const onBinary = (data: ArrayBufferLike | ArrayBufferView) => {
      if (!through) return;
      const bytes =
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : new Uint8Array(data as ArrayBufferView as Uint8Array);
      frames += 1;
      queueMicrotask(() =>
        serverWire.onmessage?.(new Uint8Array(bytes) as Uint8Array<ArrayBuffer>),
      );
    };
    const socket: SocketLike = {
      binaryType: "blob",
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      send(data) {
        if (typeof data === "string") onText(data);
        else onBinary(data);
      },
      close(code, reason) {
        queueMicrotask(() => {
          socket.onclose?.({ code: code ?? 1000, reason: reason ?? "" });
          serverWire.onclose?.(reason ?? "closed");
        });
      },
    };
    const serverWire: Wire = {
      onmessage: undefined,
      onclose: undefined,
      send: (data) =>
        queueMicrotask(() =>
          socket.onmessage?.({
            data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
          }),
        ),
      close: () => queueMicrotask(() => socket.onclose?.({ code: 1000, reason: "server_closed" })),
    };
    serve(server, serverWire);
    queueMicrotask(() => socket.onopen?.({}));
    return socket;
  };

  /** A door that is not answering: closed at once, or never opened at all. */
  const deadDoor = (mood: Exclude<DoorMood, "answers">): SocketLike => {
    const socket: SocketLike = {
      binaryType: "blob",
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      send: () => undefined,
      close: () => undefined,
    };
    if (mood === "refuses") queueMicrotask(() => socket.onclose?.({ code: 1006, reason: "" }));
    return socket;
  };

  const made: FakeServer = {
    key,
    serverKey,
    relay: { url: "wss://relay.test", serverKey },
    opened,
    seen,
    sockets,
    asks,
    heard,
    frames: () => frames,
    answerer: () => answerer,
    handshakeHash: () => handshakeHash,
    door: options.door ?? "answers",
    factory: (url) => {
      opened.push(url);
      const atTheDoor = url.endsWith("/v1/tunnel");
      if (atTheDoor && made.door !== "answers") return deadDoor(made.door);
      return socketAt(!atTheDoor);
    },
  };
  return made;
}

/** A handler that answers every request with its method and target, as JSON. */
export const okJson = async (input: RequestInput): Promise<ResponseOutput> => ({
  status: 200,
  headers: { "content-type": "application/json" },
  body: new TextEncoder().encode(JSON.stringify({ target: input.target, method: input.method })),
});
