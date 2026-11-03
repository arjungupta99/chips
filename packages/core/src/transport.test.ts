/**
 * Two rules from the transport: a socket that has gone quiet is not a socket, and a key the
 * server has never heard of is not a connection problem.
 *
 * The rest of this file is a real WebSocket and stays Playwright's — faking a socket to test a
 * socket would test the fake. This is different: it is a timer over "when did I last hear
 * anything", and the fake here is scenery. The server pings every twenty seconds and closes a
 * socket that has been silent for sixty (decision 5); a client that had no matching rule would
 * sit looking connected to something that is not there — a proxy that outlived what it proxied,
 * a NAT that dropped the flow, a laptop that woke up — because a socket like that never closes
 * and never says anything either.
 */

import { type ResponseOutput, TunnelClosedError, utf8 } from "@chipschat/tunnel";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Device } from "./device.js";
import { LinkError, readOnLink } from "./link.js";
import { fakeServer } from "./testing/fake-server.js";
import {
  connect,
  DEFAULT_SILENCE_MS,
  deleteJson,
  getJson,
  OPEN_MS,
  postJson,
  putJson,
} from "./transport.js";

vi.mock("./device.js", () => ({
  signRequest: async () => ({ "x-chips-device": "dev_1" }),
  endpoint: (_device: unknown, path: string) => path,
  socketOrigin: () => "ws://chips.test",
}));

/**
 * The one thing `establishLink` is asked to do here is fail in a particular way. Which failures
 * it produces from which relay codes is `link.test.ts`'s subject, against a relay; this file is
 * only about what the transport does when it is handed one.
 */
const linkFails = vi.hoisted(() => ({ with: undefined as Error | undefined }));
vi.mock("./link.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("./link.js")>();
  return {
    ...real,
    establishLink: async (...args: Parameters<typeof real.establishLink>) => {
      if (linkFails.with !== undefined) throw linkFails.with;
      return real.establishLink(...args);
    },
  };
});

const device = { deviceId: "dev_1" } as unknown as Device;

/** Every socket a run opens, so a test can see the second one appear. */
const opened: FakeSocket[] = [];

class FakeSocket {
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  onclose: ((event?: { code: number; reason: string }) => void) | null = null;
  closed = false;
  readonly sent: string[] = [];

  constructor(readonly url: string) {
    opened.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }

  /** The server closing it, with a code of its own. */
  closedBy(code: number, reason: string): void {
    this.closed = true;
    this.onclose?.({ code, reason });
  }

  /** The server saying anything at all, which is what resets the clock. */
  say(frame: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

afterEach(() => {
  opened.length = 0;
  linkFails.with = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A transport with its socket faked and its ticket answered. */
async function connected(silenceMs?: number) {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal(
    "fetch",
    async () => new Response(JSON.stringify({ ticket: "tkt_1" }), { status: 200 }),
  );
  const states: string[] = [];
  const events: unknown[] = [];
  const transport = connect({
    device,
    since: 0,
    onEvent: (event) => events.push(event),
    onState: (state) => states.push(state),
    ...(silenceMs === undefined ? {} : { silenceMs }),
  });
  // The ticket is a promise; let it settle, then open the socket the way a browser would.
  await vi.advanceTimersByTimeAsync(0);
  const socket = opened[0] as FakeSocket;
  socket.onopen?.();
  return { transport, states, socket, events };
}

/** A transport whose ticket request is refused with `status`. */
function refused(status: number, body = "{}") {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("fetch", async () => new Response(body, { status }));
  const states: string[] = [];
  const transport = connect({
    device,
    since: 0,
    onEvent: () => {},
    onState: (state) => states.push(state),
  });
  return { transport, states };
}

describe("a replay in pages (ADR 0043)", () => {
  it("asks for them, folds each event of a page once, and carries the cursor to the last", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ ticket: "tkt_1" }), { status: 200 }),
    );
    const seen: number[] = [];
    connect({
      device,
      since: 0,
      onEvent: (event) => seen.push(event.seq),
      onState: () => {},
    });
    await vi.advanceTimersByTimeAsync(0);
    const socket = opened[0] as FakeSocket;
    // A WebSocket of the platform's own takes nothing until it opens, so it is greeted then.
    expect(socket.sent).toEqual([]);
    socket.onopen?.();

    const hello = JSON.parse(socket.sent[0] as string) as { accepts?: string[] };
    expect(hello.accepts).toEqual(["events", "presence", "join"]);

    socket.say({ frame: "events", events: [{ seq: 1 }, { seq: 2 }, { seq: 3 }] });
    socket.say({ frame: "event", event: { seq: 4 } });
    expect(seen).toEqual([1, 2, 3, 4]);

    // The cursor is the last of the page: a reconnect resumes after it, not after the page's first.
    socket.close();
    await vi.advanceTimersByTimeAsync(10_000);
    const again = opened[1] as FakeSocket;
    again.onopen?.();
    const subscribe = JSON.parse(again.sent[1] as string) as { since?: number };
    expect(subscribe.since).toBe(4);
  });

  it("ignores a page that is not one, rather than throwing on the socket", async () => {
    const seen: number[] = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ ticket: "tkt_1" }), { status: 200 }),
    );
    connect({ device, since: 0, onEvent: (event) => seen.push(event.seq), onState: () => {} });
    await vi.advanceTimersByTimeAsync(0);
    const socket = opened[0] as FakeSocket;
    socket.onopen?.();
    socket.say({ frame: "events" });
    socket.say({ frame: "events", events: "not a page" });
    expect(seen).toEqual([]);
  });
});

describe("a room's folder asked for from another device (ADR 0225)", () => {
  it("says folders in its hello only with a listener, and hands it each ask", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ ticket: "tkt_1" }), { status: 200 }),
    );
    const asks: unknown[] = [];
    connect({
      device,
      since: 0,
      onEvent: () => {},
      onState: () => {},
      onFolderAsk: (ask) => asks.push(ask),
    });
    await vi.advanceTimersByTimeAsync(0);
    const socket = opened[0] as FakeSocket;
    socket.onopen?.();
    const hello = JSON.parse(socket.sent[0] as string) as { accepts?: string[] };
    expect(hello.accepts).toEqual(["events", "presence", "join", "folders"]);

    socket.say({
      frame: "folder.open",
      space_id: "spc_01K4ZQPX000000000000000001",
      asked_from: "iPhone",
      asked_at: "2026-10-23T22:05:00.000Z",
    });
    socket.say({
      frame: "folder.run",
      space_id: "spc_01K4ZQPX000000000000000001",
      op: "run",
      command: "make",
      asked_from: "iPhone",
      asked_at: "2026-10-24T09:05:00.000Z",
    });
    // The room's page, in Chips for Mac (ADR 0227).
    socket.say({
      frame: "folder.open",
      space_id: "spc_01K4ZQPX000000000000000001",
      what: "page",
      asked_from: "iPhone",
      asked_at: "2026-10-24T18:05:00.000Z",
    });
    // Not one, and it is dropped; nor is a run that would do anything else.
    socket.say({ frame: "folder.open", space_id: "../../etc" });
    socket.say({
      frame: "folder.run",
      space_id: "spc_01K4ZQPX000000000000000001",
      op: "rm",
      asked_from: "iPhone",
      asked_at: "2026-10-24T09:05:00.000Z",
    });
    expect(asks).toEqual([
      {
        spaceId: "spc_01K4ZQPX000000000000000001",
        op: "open",
        from: "iPhone",
        at: "2026-10-23T22:05:00.000Z",
      },
      {
        spaceId: "spc_01K4ZQPX000000000000000001",
        op: "run",
        command: "make",
        from: "iPhone",
        at: "2026-10-24T09:05:00.000Z",
      },
      {
        spaceId: "spc_01K4ZQPX000000000000000001",
        op: "page",
        from: "iPhone",
        at: "2026-10-24T18:05:00.000Z",
      },
    ]);
  });
});

describe("a relay the server names (ADR 0038)", () => {
  const KEY = "k".repeat(43);
  const named = { url: "wss://relay.test", key: KEY };

  /** The server: a ticket for a ticket, and its facts naming `relay`. */
  function serverNaming(relay: unknown) {
    vi.stubGlobal("fetch", async (url: string) =>
      url.endsWith("/v1/server")
        ? new Response(JSON.stringify({ status: "ok", relay }), { status: 200 })
        : new Response(JSON.stringify({ ticket: "tkt_1" }), { status: 200 }),
    );
  }

  it("is learnt by a device that had none, once, and kept for the reconnect", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
    serverNaming(named);
    const learnt: unknown[] = [];
    connect({
      device,
      since: 0,
      onEvent: () => {},
      onState: () => {},
      onRelay: (relay) => learnt.push(relay),
    });
    await vi.advanceTimersByTimeAsync(0);
    (opened[0] as FakeSocket).onopen?.();
    expect(learnt).toEqual([{ url: "wss://relay.test", serverKey: KEY }]);

    // The reconnect goes the way a device with a relay goes, and has nothing new to learn.
    (opened[0] as FakeSocket).close();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(opened).toHaveLength(2);
    expect(learnt).toHaveLength(1);
  });

  it("is learnt while connected when an owner turns the relay on, not at the next connection", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
    // Chips's own relay, never turned on (ADR 0245): the server names none yet.
    serverNaming({ status: "off", url: null, key: null });
    const learnt: unknown[] = [];
    connect({
      device,
      since: 0,
      onEvent: () => {},
      onState: () => {},
      onRelay: (relay) => learnt.push(relay),
    });
    await vi.advanceTimersByTimeAsync(0);
    const socket = opened[0] as FakeSocket;
    socket.onopen?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(learnt).toEqual([]);
    // Turned on from the Mac: the server names it, and this device hears and asks again.
    serverNaming(named);
    socket.say({ frame: "event", event: { seq: 5, type: "relay.set", on: true } });
    await vi.advanceTimersByTimeAsync(0);
    expect(learnt).toEqual([{ url: "wss://relay.test", serverKey: KEY }]);
    expect(opened).toHaveLength(1);
  });

  it("is not learnt again by a device that has it, nor from a server that names none", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
    serverNaming(named);
    const learnt: unknown[] = [];
    const holding = {
      deviceId: "dev_1",
      serverKey: KEY,
      relayUrl: "wss://relay.test",
    } as unknown as Device;
    connect({
      device: holding,
      since: 0,
      onEvent: () => {},
      onState: () => {},
      onRelay: (relay) => learnt.push(relay),
    });
    await vi.advanceTimersByTimeAsync(0);
    serverNaming({ status: "off", url: null, key: null });
    connect({
      device,
      since: 0,
      onEvent: () => {},
      onState: () => {},
      onRelay: (relay) => learnt.push(relay),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(learnt).toEqual([]);
  });

  it("moves with the server when it names its relay at another address, under the same key", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
    serverNaming({ url: "wss://elsewhere.test", key: KEY });
    const learnt: unknown[] = [];
    const refused: unknown[] = [];
    const holding = {
      deviceId: "dev_1",
      serverKey: KEY,
      relayUrl: "wss://relay.test",
    } as unknown as Device;
    connect({
      device: holding,
      since: 0,
      onEvent: () => {},
      onState: () => {},
      onRelay: (relay) => learnt.push(relay),
      onRekeyed: (named) => refused.push(named),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(learnt).toEqual([{ url: "wss://elsewhere.test", serverKey: KEY }]);
    expect(refused).toEqual([]);
  });

  it("never takes another key from its server's facts: it is said as rekeyed, and the device keeps its own (SEC-2)", async () => {
    // A browser the server served reads its facts over the plain link, which authenticates nothing:
    // whoever answers at the stored address would otherwise name their relay and their key, and
    // own every remote connection from then on. The key pinned at pairing stands until the
    // person pairs again.
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
    const OTHER = "x".repeat(43);
    serverNaming({ url: "wss://relay.test", key: OTHER });
    const learnt: unknown[] = [];
    const refused: unknown[] = [];
    const holding = {
      deviceId: "dev_1",
      serverKey: KEY,
      relayUrl: "wss://relay.test",
    } as unknown as Device;
    connect({
      device: holding,
      since: 0,
      onEvent: () => {},
      onState: () => {},
      onRelay: (relay) => learnt.push(relay),
      onRekeyed: (named) => refused.push(named),
    });
    await vi.advanceTimersByTimeAsync(0);
    (opened[0] as FakeSocket).onopen?.();
    expect(learnt).toEqual([]);
    expect(refused).toEqual([{ url: "wss://relay.test", serverKey: OTHER }]);
    // Said again on the reconnect, and still not taken: the stranger's facts are just as wrong twice.
    (opened[0] as FakeSocket).close();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(opened).toHaveLength(2);
    expect(learnt).toEqual([]);
    expect(refused).toHaveLength(2);
    // Another address under another key is the same refusal, not a move.
    serverNaming({ url: "wss://elsewhere.test", key: OTHER });
    (opened[1] as FakeSocket).close();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(learnt).toEqual([]);
    expect(refused.at(-1)).toEqual({ url: "wss://elsewhere.test", serverKey: OTHER });
  });
});

/** The runtime's `WebSocket`, played by the fake server's factory: `new` hands back its socket. */
function socketsOf(server: Awaited<ReturnType<typeof fakeServer>>) {
  return class {
    constructor(url: string) {
      // biome-ignore lint/correctness/noConstructorReturn: a constructor that is a factory
      return server.factory(url);
    }
  };
}

const ticketAndFacts =
  (relay: unknown) =>
  async (input: { target: string }): Promise<ResponseOutput> => ({
    status: 200,
    headers: { "content-type": "application/json" },
    body: utf8(
      JSON.stringify(input.target === "/v1/server" ? { status: "ok", relay } : { ticket: "tkt_1" }),
    ),
  });

describe("through the door on the server's own network (ADR 0191)", () => {
  it("opens its socket inside the tunnel on its ticket's ask, and sends nothing plain", async () => {
    const home = await fakeServer(ticketAndFacts({ status: "off", url: null, key: null }), {
      echo: false,
    });
    vi.stubGlobal("WebSocket", socketsOf(home));
    const plain: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      plain.push(url);
      throw new TypeError("plain fetch");
    });
    const states: string[] = [];
    const links: string[] = [];
    const transport = connect({
      device: {
        deviceId: "dev_door",
        serverUrl: "http://192.168.1.20:4431",
        serverKey: home.serverKey,
      } as unknown as Device,
      since: 0,
      onEvent: () => {},
      onState: (state) => states.push(state),
      onLink: (kind) => links.push(kind),
    });
    await vi.waitFor(() => expect(states).toContain("open"));
    expect(links).toEqual(["tunnel"]);
    expect(home.opened).toEqual(["ws://192.168.1.20:4431/v1/tunnel"]);
    // No ticket asked for first: the open carried the ask (ADR 0253). The facts are the one read.
    await vi.waitFor(() => expect(home.seen).toHaveLength(1));
    expect(home.seen.map((each) => each.target)).toEqual(["/v1/server"]);
    expect(home.sockets).toEqual(["/v1/ws"]);
    expect(home.asks).toEqual([{ "x-chips-device": "dev_1" }]);
    expect(plain).toEqual([]);
    transport.close();
  });

  it("asks a server from before for a ticket at once, on the same tunnel, and for tickets from then on", async () => {
    const home = await fakeServer(ticketAndFacts({ status: "off", url: null, key: null }), {
      echo: false,
      takesAsks: false,
    });
    vi.stubGlobal("WebSocket", socketsOf(home));
    const states: string[] = [];
    const transport = connect({
      device: {
        deviceId: "dev_door",
        serverUrl: "http://192.168.1.20:4431",
        serverKey: home.serverKey,
      } as unknown as Device,
      since: 0,
      onEvent: () => {},
      onState: (state) => states.push(state),
    });
    await vi.waitFor(() => expect(states).toContain("open"));
    expect(home.opened).toEqual(["ws://192.168.1.20:4431/v1/tunnel"]);
    expect(home.sockets).toEqual(["/v1/ws", "/v1/ws?ticket=tkt_1"]);
    // Asked again without waiting out a backoff, and never said closed on the way.
    expect(states).toEqual(["connecting", "connecting", "open"]);
    // The next connection asks for a ticket first.
    home.answerer()?.close("gone");
    await vi.waitFor(() => expect(home.sockets).toHaveLength(3), { timeout: 3000 });
    expect(home.sockets.at(-1)).toBe("/v1/ws?ticket=tkt_1");
    transport.close();
  });

  it("learns its relay inside the tunnel under its own key, and refuses one under another even with no relay held", async () => {
    const device = (serverKey: string) =>
      ({
        deviceId: "dev_door",
        serverUrl: "http://192.168.1.20:4431",
        serverKey,
      }) as unknown as Device;
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("plain fetch");
    });
    const learnt: unknown[] = [];
    const refused: unknown[] = [];
    const hear = (of: Device) =>
      connect({
        device: of,
        since: 0,
        onEvent: () => {},
        onState: () => {},
        onRelay: (relay) => learnt.push(relay),
        onRekeyed: (named) => refused.push(named),
      });

    // A relay named under another key than the one this device pinned is refused, although the
    // device held no relay to keep instead: the key is held on its own now (ADR 0191), and only
    // pairing again changes it.
    const OTHER = "k".repeat(43);
    const naming = await fakeServer(ticketAndFacts({ url: "wss://relay.test", key: OTHER }), {
      echo: false,
    });
    vi.stubGlobal("WebSocket", socketsOf(naming));
    const first = hear(device(naming.serverKey));
    await vi.waitFor(() =>
      expect(refused).toEqual([{ url: "wss://relay.test", serverKey: OTHER }]),
    );
    expect(learnt).toEqual([]);
    first.close();

    // Under its own key the relay is taken, key beside it: how a device paired on the network
    // before its server had a relay learns the relay without pairing again.
    let own = "";
    const self = await fakeServer(
      (input) => ticketAndFacts({ url: "wss://relay.test", key: own })(input),
      { echo: false },
    );
    own = self.serverKey;
    vi.stubGlobal("WebSocket", socketsOf(self));
    const second = hear(device(self.serverKey));
    await vi.waitFor(() =>
      expect(learnt).toEqual([{ url: "wss://relay.test", serverKey: self.serverKey }]),
    );
    expect(refused).toHaveLength(1);
    second.close();
  });

  it("finds its way and opens its socket while the history is folded, and greets it after", async () => {
    const home = await fakeServer(ticketAndFacts({ status: "off", url: null, key: null }), {
      echo: false,
    });
    vi.stubGlobal("WebSocket", socketsOf(home));
    let folded: () => void = () => undefined;
    const states: string[] = [];
    const transport = connect({
      device: {
        deviceId: "dev_door",
        serverUrl: "http://192.168.1.20:4431",
        serverKey: home.serverKey,
      } as unknown as Device,
      since: 3,
      greetAfter: new Promise<void>((resolve) => {
        folded = resolve;
      }),
      onEvent: () => {},
      onState: (state) => states.push(state),
    });
    await vi.waitFor(() => expect(states).toEqual(["connecting", "open"]));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(home.heard).toEqual([]);
    folded();
    await vi.waitFor(() => expect(home.heard).toHaveLength(2));
    expect(home.heard.map((each) => (JSON.parse(each) as { frame: string }).frame)).toEqual([
      "hello",
      "subscribe",
    ]);
    transport.close();
  });

  it("greets a tunnel's socket behind its open, before the server has said it took it (ADR 0253)", async () => {
    let take: () => void = () => undefined;
    const home = await fakeServer(ticketAndFacts({ status: "off", url: null, key: null }), {
      echo: false,
      takesAfter: new Promise<void>((resolve) => {
        take = resolve;
      }),
    });
    vi.stubGlobal("WebSocket", socketsOf(home));
    const states: string[] = [];
    const transport = connect({
      device: {
        deviceId: "dev_door",
        serverUrl: "http://192.168.1.20:4431",
        serverKey: home.serverKey,
      } as unknown as Device,
      since: 7,
      onEvent: () => {},
      onState: (state) => states.push(state),
    });
    await vi.waitFor(() => expect(home.sockets).toEqual(["/v1/ws"]));
    // The server is still deciding: nothing read yet, and the screen still connecting.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(home.heard).toEqual([]);
    expect(states).toEqual(["connecting"]);
    take();
    // Taken: the hello and the subscribe were already there, behind the open, in order.
    await vi.waitFor(() => expect(states).toEqual(["connecting", "open"]));
    const frames = home.heard.map((each) => JSON.parse(each) as { frame: string; since?: number });
    expect(frames.map((each) => each.frame)).toEqual(["hello", "subscribe"]);
    expect(frames[1]?.since).toBe(7);
    transport.close();
  });
});

describe("leaving the relay when the server's own network answers (ADR 0211)", () => {
  /** A device on the relay, its door refusing: a phone away from home. */
  async function onTheRelay() {
    const home = await fakeServer(ticketAndFacts({ status: "off", url: null, key: null }), {
      door: "refuses",
      echo: false,
    });
    vi.stubGlobal("WebSocket", socketsOf(home));
    const states: string[] = [];
    const links: string[] = [];
    const transport = connect({
      device: {
        deviceId: `dev_away_${Math.random().toString(36).slice(2, 8)}`,
        serverUrl: "http://192.168.1.20:4431",
        serverKey: home.serverKey,
        relayUrl: home.relay.url,
      } as unknown as Device,
      since: 0,
      onEvent: () => {},
      onState: (state) => states.push(state),
      onLink: (kind) => links.push(kind),
    });
    await vi.waitFor(() => expect(states).toContain("open"));
    expect(links).toEqual(["relay"]);
    return { home, transport, states, links };
  }

  it("moves to the door once it answers, opening the new socket before letting the relay's go", async () => {
    const { home, transport, states, links } = await onTheRelay();
    const before = states.length;
    home.door = "answers";
    expect(await transport.goDirect()).toBe(true);
    expect(links).toEqual(["relay", "tunnel"]);
    expect(home.opened.at(-1)).toBe("ws://192.168.1.20:4431/v1/tunnel");
    // Two sockets on their asks: the relay's, then the door's.
    expect(home.sockets).toEqual(["/v1/ws", "/v1/ws"]);
    // Nothing blinked: no closed or connecting on the way over.
    expect(states.slice(before)).toEqual([]);
    // Asked again, it is direct already and does nothing.
    expect(await transport.goDirect()).toBe(true);
    expect(home.sockets).toHaveLength(2);
    transport.close();
  });

  it("stays on the relay while the door does not answer", async () => {
    const { home, transport, links, states } = await onTheRelay();
    expect(await transport.goDirect()).toBe(false);
    expect(links).toEqual(["relay"]);
    expect(home.sockets).toHaveLength(1);
    expect(states.at(-1)).toBe("open");
    transport.close();
  });

  it("with Only direct turned on, moves to the door when it answers (Phase 2)", async () => {
    const { home, transport, links, states } = await onTheRelay();
    const before = states.length;
    home.door = "answers";
    transport.onlyDirect(true);
    await vi.waitFor(() => expect(links).toEqual(["relay", "tunnel"]));
    expect(states.slice(before)).toEqual([]);
    transport.close();
  });

  it("with Only direct turned on and the door shut, lets the relay go and dials the door alone", async () => {
    const { home, transport, links, states } = await onTheRelay();
    const relayed = home.opened.filter((url) => url.startsWith(home.relay.url)).length;
    transport.onlyDirect(true);
    await vi.waitFor(() => expect(states.at(-1)).toBe("closed"));
    // Dialled again, at the door alone: the relay is not tried.
    await vi.waitFor(() =>
      expect(home.opened.filter((url) => url.endsWith("/v1/tunnel")).length).toBeGreaterThan(1),
    );
    expect(home.opened.filter((url) => url.startsWith(home.relay.url))).toHaveLength(relayed);
    expect(links).toEqual(["relay"]);
    // Off again, it reaches the server the way it can, the relay with it.
    transport.onlyDirect(false);
    await vi.waitFor(() => expect(states.at(-1)).toBe("open"));
    expect(links).toEqual(["relay", "relay"]);
    transport.close();
  });
});

describe("a device paired before servers had keys (ADR 0191, Phase 3)", () => {
  const LAN = "http://192.168.1.20:4431";
  const keyless = { deviceId: "dev_old", serverUrl: LAN } as unknown as Device;

  /**
   * The plain port: the server's facts as it names them to a signed read (SEC-28), counted with
   * who signed, and a ticket where the test says the server is one from before keys; nothing else
   * is answered there. (`endpoint` is mocked to the bare path above, so the calls are paths.)
   */
  function plainPort(
    facts: unknown,
    tickets = false,
  ): { readonly calls: string[]; readonly signers: (string | undefined)[] } {
    const calls: string[] = [];
    const signers: (string | undefined)[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push(url);
      signers.push((init?.headers as Record<string, string> | undefined)?.["x-chips-device"]);
      if (url.endsWith("/v1/server")) return Response.json(facts);
      if (tickets && url.endsWith("/v1/socket-tickets")) return Response.json({ ticket: "tkt_1" });
      throw new TypeError("plain fetch");
    });
    return { calls, signers };
  }

  it("reads its server's facts plain once, signed, takes the key they name as its first, and tunnels from then on", async () => {
    const home = await fakeServer(ticketAndFacts({ status: "off", url: null, key: null }), {
      echo: false,
    });
    const plain = plainPort({
      status: "ok",
      relay: { status: "off", url: null, key: home.serverKey },
    });
    vi.stubGlobal("WebSocket", socketsOf(home));
    const taken: unknown[] = [];
    const links: string[] = [];
    const states: string[] = [];
    const transport = connect({
      device: keyless,
      since: 0,
      onEvent: () => {},
      onState: (state) => states.push(state),
      onLink: (kind) => links.push(kind),
      onFirstKey: (named) => taken.push(named),
    });
    await vi.waitFor(() => expect(states).toContain("open"));
    // The one plain read, signed, then everything inside the tunnel to the key it named.
    expect(plain.calls).toEqual(["/v1/server"]);
    expect(plain.signers).toEqual(["dev_1"]);
    expect(taken).toEqual([{ serverKey: home.serverKey }]);
    expect(links).toEqual(["tunnel"]);
    expect(home.opened).toEqual([`ws://192.168.1.20:4431/v1/tunnel`]);
    await vi.waitFor(() => expect(home.seen).toHaveLength(1));
    expect(home.seen.map((each) => each.target)).toEqual(["/v1/server"]);
    // The next connection: the device holds the key now, so nothing goes plain again.
    home.answerer()?.close("gone");
    await vi.waitFor(() => expect(links).toEqual(["tunnel", "tunnel"]), { timeout: 5000 });
    expect(plain.calls).toEqual(["/v1/server"]);
    expect(taken).toHaveLength(1);
    transport.close();
  });

  it("takes the relay with the key when the server names one", async () => {
    const home = await fakeServer(ticketAndFacts({ status: "off", url: null, key: null }), {
      echo: false,
    });
    plainPort({ status: "ok", relay: { url: "wss://relay.test", key: home.serverKey } });
    vi.stubGlobal("WebSocket", socketsOf(home));
    const taken: unknown[] = [];
    const states: string[] = [];
    const transport = connect({
      device: keyless,
      since: 0,
      onEvent: () => {},
      onState: (state) => states.push(state),
      onFirstKey: (named) => taken.push(named),
    });
    await vi.waitFor(() => expect(states).toContain("open"));
    expect(taken).toEqual([{ serverKey: home.serverKey, relayUrl: "wss://relay.test" }]);
    transport.close();
  });

  it("never reads anything plain for a device holding a key", async () => {
    const home = await fakeServer(ticketAndFacts({ status: "off", url: null, key: null }), {
      echo: false,
    });
    const plain = plainPort({
      status: "ok",
      relay: { status: "off", url: null, key: home.serverKey },
    });
    vi.stubGlobal("WebSocket", socketsOf(home));
    const taken: unknown[] = [];
    const states: string[] = [];
    const transport = connect({
      device: { ...keyless, serverKey: home.serverKey },
      since: 0,
      onEvent: () => {},
      onState: (state) => states.push(state),
      onFirstKey: (named) => taken.push(named),
    });
    await vi.waitFor(() => expect(states).toContain("open"));
    expect(plain.calls).toEqual([]);
    expect(taken).toEqual([]);
    transport.close();
  });

  it("leaves the device as it was when its server names no key, and asks again on the next connection", async () => {
    // A server from before keys: it names no relay and no key. The device stays on the
    // plain link, which is all it has, and reads its facts again next time, in case the server
    // has been updated in between.
    const plain = plainPort({ status: "ok", relay: null }, true);
    vi.stubGlobal("WebSocket", FakeSocket);
    const taken: unknown[] = [];
    const links: string[] = [];
    const states: string[] = [];
    const connected = () =>
      connect({
        device: keyless,
        since: 0,
        onEvent: () => {},
        onState: (state) => states.push(state),
        onLink: (kind) => links.push(kind),
        onFirstKey: (named) => taken.push(named),
      });
    const first = connected();
    await vi.waitFor(() => expect(links).toEqual(["direct"]));
    expect(taken).toEqual([]);
    // Health first, for the key; then the ticket on the plain link, which is all there is (the
    // relay read after the socket opens is the one every connection makes, ADR 0144).
    expect(plain.calls.slice(0, 2)).toEqual(["/v1/server", "/v1/socket-tickets"]);
    first.close();
    const before = plain.calls.length;
    const second = connected();
    await vi.waitFor(() => expect(links).toEqual(["direct", "direct"]));
    expect(plain.calls.slice(before, before + 2)).toEqual(["/v1/server", "/v1/socket-tickets"]);
    expect(taken).toEqual([]);
    second.close();
  });
});

describe("presence (ADR 0083)", () => {
  it("hands on each agent's change of state, and drops a frame that is not one", async () => {
    const heard: unknown[] = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ ticket: "tkt_1" }), { status: 200 }),
    );
    connect({
      device,
      since: 0,
      onEvent: () => {},
      onState: () => {},
      onPresence: (presence) => heard.push(presence),
    });
    await vi.advanceTimersByTimeAsync(0);
    const socket = opened[0] as FakeSocket;
    socket.onopen?.();
    const state = { connected: false, since: "2026-09-28T18:11:12.000Z" };
    socket.say({ frame: "presence", participant_id: "hrn_01K4ZQPX000000000000000004", state });
    socket.say({ frame: "presence", participant_id: "hrn_01K4ZQPX000000000000000004" });
    expect(heard).toEqual([{ participantId: "hrn_01K4ZQPX000000000000000004", state }]);
  });
});

describe("a read the connection dropped under (ADR 0179)", () => {
  it("is asked again once the next socket is open, and not before", async () => {
    const { transport, socket } = await connected();
    let asks = 0;
    const read = readOnLink(device, async () => {
      asks += 1;
      if (asks === 1) throw new TunnelClosedError("server_gone");
      return "came";
    });
    socket.closedBy(1006, "server_gone");
    await vi.advanceTimersByTimeAsync(1000);
    // The ticket for the next socket has been asked for; the socket is not open yet.
    expect(opened).toHaveLength(2);
    expect(asks).toBe(1);
    opened[1]?.onopen?.();
    expect(await read).toBe("came");
    expect(asks).toBe(2);
    transport.close();
  });

  it("is every signed GET: one the network failed is asked again on the next socket", async () => {
    const { transport, socket } = await connected();
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      if (url === "/v1/devices" && asked.filter((each) => each === url).length === 1)
        throw new TypeError("Load failed");
      return new Response(
        JSON.stringify(url === "/v1/devices" ? { devices: [] } : { ticket: "t" }),
      );
    });
    const read = getJson<{ devices: unknown[] }>(device, "/v1/devices");
    socket.closedBy(1006, "gone");
    await vi.advanceTimersByTimeAsync(1000);
    expect(asked.filter((each) => each === "/v1/devices")).toHaveLength(1);
    opened[1]?.onopen?.();
    expect(await read).toEqual({ devices: [] });
    expect(asked.filter((each) => each === "/v1/devices")).toHaveLength(2);
    transport.close();
  });

  it("is not a refusal, which is said at once", async () => {
    const { transport } = await connected();
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 403 }));
    await expect(getJson(device, "/v1/devices")).rejects.toThrow("/v1/devices answered 403");
    transport.close();
  });
});

describe("a key the server does not know", () => {
  it("is said out loud, once, rather than retried for ever", async () => {
    // Found by hand on 4 September 2026: a browser holding a key from a workspace that had been
    // replaced showed an empty shell and knocked on the door every five seconds in silence.
    const { transport, states } = refused(401);
    await vi.advanceTimersByTimeAsync(0);
    expect(states).toEqual(["connecting", "rejected"]);

    // No reconnection: waiting cannot turn this key into one the server has.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(states).toEqual(["connecting", "rejected"]);
    expect(opened).toHaveLength(0);
    transport.close();
  });

  it("is told apart from a server having a bad moment, which is worth another try", async () => {
    const { transport, states } = refused(503);
    await vi.advanceTimersByTimeAsync(0);
    expect(states).toEqual(["connecting", "closed"]);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(states.filter((state) => state === "connecting").length).toBeGreaterThan(1);
    transport.close();
  });
});

describe("an app coming back to the foreground", () => {
  it("replaces a socket that has been quiet, rather than trusting it", async () => {
    // A phone's sockets are frozen while it is in the background and are not always closed, so
    // an app reopened after an hour can hold one that looks open and will never say anything.
    //
    // Twelve seconds of silence and twelve seconds one hundred milliseconds on the clock: past
    // the rule, and between two sweeps, which fire at five and ten. So the socket is closed by
    // this call and by nothing else — which is what `wake` is for, since waiting for the sweep
    // is up to five more seconds of an app that looks connected and is not.
    const { transport, socket, states } = await connected(12_000);
    expect(states).toEqual(["connecting", "open"]);
    await vi.advanceTimersByTimeAsync(12_100);
    expect(socket.closed).toBe(false);

    transport.wake();
    // The next is on its way at once, not a backoff's second later: a phone back from the
    // background showed a turn long over as still going for as long as this took.
    await vi.advanceTimersByTimeAsync(0);
    expect(opened).toHaveLength(2);
    expect(states).toEqual(["connecting", "open", "closed", "connecting"]);
    // And the quiet one is closed once the next is open.
    expect(socket.closed).toBe(false);
    (opened[1] as FakeSocket).onopen?.();
    expect(socket.closed).toBe(true);
    expect(states).toEqual(["connecting", "open", "closed", "connecting", "open"]);
    transport.close();
  });

  it("still hears what the quiet socket was holding while the next one opens", async () => {
    // A phone the relay let go of while it slept is handed the frames sent before it did a moment
    // after it is told it is in front: the end of the turn it missed, among them.
    const { transport, socket, events } = await connected(12_000);
    await vi.advanceTimersByTimeAsync(12_100);
    transport.wake();
    socket.say({ frame: "event", event: { id: "evt_end", type: "run.completed", seq: 7 } });
    expect(events).toEqual([{ id: "evt_end", type: "run.completed", seq: 7 }]);
    // Its own close says nothing: the next socket is already on its way.
    socket.closedBy(1006, "");
    await vi.advanceTimersByTimeAsync(0);
    expect(opened).toHaveLength(2);
    // The next one resumes after what the quiet one brought.
    const next = opened[1] as FakeSocket;
    next.onopen?.();
    expect(next.sent.some((sent) => sent.includes('"since":7'))).toBe(true);
    transport.close();
  });

  it("replaces a quiet socket that never says it has closed", async () => {
    const { transport, socket, states } = await connected(12_000);
    socket.close = () => {
      socket.closed = true;
    };
    await vi.advanceTimersByTimeAsync(12_100);
    transport.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(opened).toHaveLength(2);
    (opened[1] as FakeSocket).onopen?.();
    expect(socket.closed).toBe(true);
    expect(states).toEqual(["connecting", "open", "closed", "connecting", "open"]);
    transport.close();
  });

  it("leaves a socket that has been heard from alone", async () => {
    const { transport, socket } = await connected();
    await vi.advanceTimersByTimeAsync(5000);
    socket.say({ frame: "ping", ts: 1 });
    transport.wake();
    expect(socket.closed).toBe(false);
    transport.close();
  });

  it("retries a connection that is down at once, rather than after the backoff", async () => {
    const { transport, states } = refused(503);
    await vi.advanceTimersByTimeAsync(0);
    expect(states).toEqual(["connecting", "closed"]);
    // No timers advanced: the reconnect is this call's doing, not the backoff's.
    transport.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(states).toEqual(["connecting", "closed", "connecting", "closed"]);
    transport.close();
  });

  it("does nothing for a key the server does not know, which waking cannot fix", async () => {
    const { transport, states } = refused(401);
    await vi.advanceTimersByTimeAsync(0);
    expect(states).toEqual(["connecting", "rejected"]);
    transport.wake();
    await vi.advanceTimersByTimeAsync(1000);
    expect(states).toEqual(["connecting", "rejected"]);
    transport.close();
  });
});

describe("an open that never settles", () => {
  /** A transport whose first socket is asked for and then neither opens nor closes. */
  async function stuck() {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ ticket: "tkt_1" })));
    const states: string[] = [];
    const transport = connect({
      device,
      since: 0,
      onEvent: () => {},
      onState: (state) => states.push(state),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(opened).toHaveLength(1);
    return { transport, states, first: opened[0] as FakeSocket };
  }

  it("is given up on when the app comes back long after, and the next begun at once", async () => {
    // Locked mid-dial: the socket being opened never says what became of it. Every wake found an
    // open under way and left it, and the phone tried nothing for hours (2 November 2026).
    const { transport, states, first } = await stuck();
    transport.wake();
    await vi.advanceTimersByTimeAsync(0);
    // Within its time it is left to finish.
    expect(opened).toHaveLength(1);
    vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);
    transport.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(opened).toHaveLength(2);
    expect(first.closed).toBe(true);
    expect(states).toEqual(["connecting", "closed", "connecting"]);
    (opened[1] as FakeSocket).onopen?.();
    expect(states).toEqual(["connecting", "closed", "connecting", "open"]);
    transport.close();
  });

  it("is given up on by itself after its time, with nothing to wake it", async () => {
    const { transport, states, first } = await stuck();
    await vi.advanceTimersByTimeAsync(OPEN_MS - 1000);
    expect(opened).toHaveLength(1);
    // The sweep after its time gives up on it; the next follows the backoff's first second.
    await vi.advanceTimersByTimeAsync(5000 + 1000);
    expect(first.closed).toBe(true);
    expect(opened).toHaveLength(2);
    expect(states).toEqual(["connecting", "closed", "connecting"]);
    transport.close();
  });

  it("lets go of what the open given up on brings late, so the device has one socket", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
    let late: ((response: Response) => void) | undefined;
    vi.stubGlobal("fetch", (url: string) => {
      if (url === "/v1/socket-tickets" && late === undefined) {
        return new Promise<Response>((resolve) => {
          late = resolve;
        });
      }
      return Promise.resolve(new Response(JSON.stringify({ ticket: "tkt_2" })));
    });
    const states: string[] = [];
    const transport = connect({
      device,
      since: 0,
      onEvent: () => {},
      onState: (s) => states.push(s),
    });
    await vi.advanceTimersByTimeAsync(0);
    // The ticket's answer is on its way when the phone is locked; nothing is open yet.
    expect(opened).toHaveLength(0);
    vi.setSystemTime(Date.now() + OPEN_MS);
    transport.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(opened).toHaveLength(1);
    (opened[0] as FakeSocket).onopen?.();
    // The first ticket comes after all: its socket is nobody's, and is closed.
    late?.(new Response(JSON.stringify({ ticket: "tkt_1" })));
    await vi.advanceTimersByTimeAsync(0);
    expect(opened).toHaveLength(2);
    expect((opened[1] as FakeSocket).closed).toBe(true);
    expect((opened[0] as FakeSocket).closed).toBe(false);
    expect(states).toEqual(["connecting", "closed", "connecting", "open"]);
    transport.close();
  });

  it("gives up on a tunnel's socket greeted and never opened, and opens a new tunnel", async () => {
    // The phone's way (ADR 0253): the socket is greeted, and so ready, before it opens. Locked
    // before the server took it, it was neither open nor closed, nor ever heard from.
    let take: () => void = () => undefined;
    const home = await fakeServer(ticketAndFacts({ status: "off", url: null, key: null }), {
      echo: false,
      takesAfter: new Promise<void>((resolve) => {
        take = resolve;
      }),
    });
    vi.stubGlobal("WebSocket", socketsOf(home));
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("plain fetch");
    });
    const states: string[] = [];
    const transport = connect({
      device: {
        deviceId: "dev_locked",
        serverUrl: "http://192.168.1.20:4431",
        serverKey: home.serverKey,
      } as unknown as Device,
      since: 0,
      onEvent: () => {},
      onState: (state) => states.push(state),
    });
    await vi.waitFor(() => expect(home.sockets).toEqual(["/v1/ws"]));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + OPEN_MS);
    transport.wake();
    take();
    await vi.waitFor(() => expect(states).toContain("open"));
    expect(home.opened).toEqual([
      "ws://192.168.1.20:4431/v1/tunnel",
      "ws://192.168.1.20:4431/v1/tunnel",
    ]);
    expect(states).toEqual(["connecting", "closed", "connecting", "open"]);
    transport.close();
  });

  it("holds a write the tunnel turned away unsent until the next socket is open, then sends it", async () => {
    const { transport, first } = await stuck();
    let asks = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      if (url !== "/v1/invites") return new Response(JSON.stringify({ ticket: "tkt_2" }));
      asks += 1;
      if (asks === 1) throw new TunnelClosedError(undefined, { sent: false });
      return new Response(JSON.stringify({ invite_id: "inv_1" }));
    });
    const made = postJson(device, "/v1/invites", { role: "member" });
    await vi.advanceTimersByTimeAsync(0);
    expect(asks).toBe(1);
    vi.setSystemTime(Date.now() + OPEN_MS);
    transport.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(first.closed).toBe(true);
    (opened[1] as FakeSocket).onopen?.();
    expect(await made).toEqual({ invite_id: "inv_1" });
    expect(asks).toBe(2);
    transport.close();
  });
});

describe("a person removed from the workspace (ADR 0160)", () => {
  it("is said as removed, not unknown, when the ticket is refused for it, and not retried", async () => {
    const body = JSON.stringify({
      error: { code: "unauthorized", message: "You were removed.", refusal: "person_removed" },
    });
    const { transport, states } = refused(401, body);
    await vi.advanceTimersByTimeAsync(0);
    expect(states).toEqual(["connecting", "removed"]);
    transport.wake();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(states).toEqual(["connecting", "removed"]);
    expect(opened).toHaveLength(0);
    transport.close();
  });

  it("is said at once when the server closes the socket for it, with no knock again", async () => {
    const { transport, states, socket } = await connected();
    socket.closedBy(4003, "person_removed");
    expect(states).toEqual(["connecting", "open", "removed"]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(opened).toHaveLength(1);
    transport.close();
  });
});

describe("a server the relay says is not there", () => {
  it("is asleep rather than reconnecting, and is still tried again", async () => {
    // The M4.2 scope change: a dropped network is worth waiting two seconds for, a laptop that
    // shut its lid is worth going home to open. Only the relay can tell the two apart, and when
    // it does the screen should say which.
    linkFails.with = new LinkError("no_such_server", "No server of that key is here.");
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 200 }));
    const states: string[] = [];
    const transport = connect({
      device,
      since: 0,
      onEvent: () => {},
      onState: (s) => states.push(s),
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(states).toEqual(["connecting", "asleep"]);
    expect(opened).toHaveLength(0);

    // Not terminal, unlike a key the server does not know: the far side wakes up.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(states.filter((state) => state === "connecting").length).toBeGreaterThan(1);
    transport.close();
  });

  it("is told apart from a relay that could not be reached at all", async () => {
    linkFails.with = new LinkError("unreachable", "The relay did not answer in time.");
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 200 }));
    const states: string[] = [];
    const transport = connect({
      device,
      since: 0,
      onEvent: () => {},
      onState: (s) => states.push(s),
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(states).toEqual(["connecting", "closed"]);
    transport.close();
  });
});

describe("a socket that says nothing", () => {
  it("is closed and replaced once the silence is longer than the rule allows", async () => {
    const { transport, socket } = await connected(1000);
    expect(socket.closed).toBe(false);

    await vi.advanceTimersByTimeAsync(1100 + 5000);
    // And it reconnects on its own: nobody clicked anything.
    expect(opened).toHaveLength(2);
    (opened[1] as FakeSocket).onopen?.();
    expect(socket.closed).toBe(true);
    transport.close();
  });

  it("is left alone while the server is still pinging", async () => {
    const { transport, socket } = await connected(1000);
    for (let n = 0; n < 6; n += 1) {
      await vi.advanceTimersByTimeAsync(600);
      socket.say({ frame: "ping", ts: Date.now() });
    }
    expect(socket.closed).toBe(false);
    expect(opened).toHaveLength(1);
    transport.close();
  });

  it("gives it the same sixty seconds the server gives a client", () => {
    expect(DEFAULT_SILENCE_MS).toBe(60_000);
  });

  it("closes the socket it was opening when it is closed before the socket arrives", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ ticket: "tkt_1" }), { status: 200 }),
    );
    const states: string[] = [];
    const transport = connect({
      device,
      since: 0,
      onEvent: () => {},
      onState: (state) => states.push(state),
    });
    // Closed while the ticket is on its way: nothing is holding the socket that comes after it.
    transport.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(opened).toHaveLength(1);
    expect(opened[0]?.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(opened).toHaveLength(1);
  });

  it("stops watching when the transport is closed", async () => {
    const { transport, socket } = await connected(1000);
    transport.close();
    const before = opened.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(opened).toHaveLength(before);
    expect(socket.closed).toBe(true);
  });
});

describe("a runtime whose `window` is not a browser's", () => {
  /**
   * React Native defines `window` as an alias for the global object and gives it no
   * `addEventListener`. A guard that asks whether `window` exists therefore passes on a phone
   * and then throws on the call — which is exactly what happened on the first run on a real
   * iPhone: the device paired, the store started, and `connect` died before the socket opened.
   */
  it("connects where `window` exists but has no addEventListener", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ ticket: "tkt_1" }), { status: 200 }),
    );
    // The phone's shape: a `window` that is the global object and nothing else.
    vi.stubGlobal("window", { navigator: {} });

    const states: string[] = [];
    const transport = connect({
      device,
      since: 0,
      onEvent: () => {},
      onState: (state) => states.push(state),
    });
    await vi.advanceTimersByTimeAsync(0);
    const socket = opened[0] as FakeSocket;
    socket.onopen?.();

    expect(states).toContain("open");
    // And closing does not reach for `removeEventListener` it never added.
    expect(() => transport.close()).not.toThrow();
  });
});

describe("a signed write", () => {
  /**
   * `DELETE /v1/me/space-icons/:id` answers `204` with no body. Reading that as JSON threw on a
   * write that had worked, so *Use the default* said "not saved: JSON Parse error" and the store
   * took the reset back (26 September 2026).
   */
  it("is done when the server answers with no content", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 204 }));
    await expect(deleteJson(device, "/v1/me/space-icons/spc_1")).resolves.toBeUndefined();
  });

  it("still hands back what a server that answers says", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ icon: "tent" })));
    await expect(putJson(device, "/v1/me/space-icons/spc_1", {})).resolves.toEqual({
      icon: "tent",
    });
  });

  it("still says why a refused one was refused", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ error: { message: "No such space." } }), { status: 404 }),
    );
    await expect(deleteJson(device, "/v1/me/space-icons/spc_1")).rejects.toThrow("No such space.");
  });
});

describe("how a run on the person's Mac stands (ADR 0226)", () => {
  it("says folder_runs in its hello with a listener, and hands it each word", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ ticket: "tkt_1" }), { status: 200 }),
    );
    const heard: unknown[] = [];
    connect({
      device,
      since: 0,
      onEvent: () => {},
      onState: () => {},
      onRunState: (spaceId, run) => heard.push({ spaceId, run }),
    });
    await vi.advanceTimersByTimeAsync(0);
    const socket = opened[0] as FakeSocket;
    socket.onopen?.();
    const hello = JSON.parse(socket.sent[0] as string) as { accepts?: string[] };
    expect(hello.accepts).toEqual(["events", "presence", "join", "folder_runs"]);

    const run = {
      state: "running",
      command: "python3 -m http.server 8000",
      mac: "Mac mini",
      said_at: "2026-10-24T09:05:03.000Z",
    };
    socket.say({ frame: "folder.run_state", space_id: "spc_01K4ZQPX000000000000000001", run });
    socket.say({ frame: "folder.run_state", space_id: "spc_01K4ZQPX000000000000000001", run: {} });
    expect(heard).toEqual([{ spaceId: "spc_01K4ZQPX000000000000000001", run }]);
  });
});
