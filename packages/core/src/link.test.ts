/**
 * How a device reaches its server: a tunnel to the key it holds, through the door on the server's
 * own network first and the relay when the door does not answer (ADR 0191) — and, through a
 * server played by a scripted socket with a real answerer behind it, the same requests and the
 * same socket in `fetch` and `WebSocket` clothing.
 */

import { RELAY_VERSION } from "@chipschat/protocol";
import {
  type SocketLike,
  TunnelClosedError,
  TunnelError,
  toBase64url,
  utf8,
} from "@chipschat/tunnel";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ConnectionDropped,
  directLink,
  doorLink,
  doorUrl,
  dropLink,
  establishLink,
  type Link,
  LinkError,
  type LinkSocket,
  linkFor,
  reached,
  reachNamedBy,
  readOnLink,
  relayLink,
  relayNamedBy,
  relayVerdict,
  responseOf,
  useLink,
} from "./link.js";
import { fakeServer, okJson } from "./testing/fake-server.js";

const LAN = "http://192.168.1.20:4431";
const DOOR = "ws://192.168.1.20:4431/v1/tunnel";
const RELAY_DOOR = "wss://relay.test/v1/connect";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A `fetch` that must not be called: a device holding a key sends nothing plain. */
function noPlainFetch(): { readonly calls: string[] } {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    throw new Error(`plain fetch of ${url}`);
  });
  return { calls };
}

describe("where the door is", () => {
  it("is the server's address, as a socket, at the tunnel's path", () => {
    expect(doorUrl("http://mini.local:4431")).toBe("ws://mini.local:4431/v1/tunnel");
    expect(doorUrl("https://chips.example/")).toBe("wss://chips.example/v1/tunnel");
  });
});

describe("establishLink", () => {
  it("is the plain link for a device with no key, and for a browser the server itself served", async () => {
    // No key to shake hands against: Phase 3 of ADR 0191 takes such a device's first key.
    expect(await establishLink({ serverUrl: LAN })).toBe(directLink);
    expect(await establishLink({})).toBe(directLink);
    // A key, but no address: the page's own origin served this device, which ADR 0191 leaves to TLS.
    expect(await establishLink({ serverKey: "k".repeat(43) })).toBe(directLink);
    expect(await establishLink({ serverUrl: "", serverKey: "k".repeat(43) })).toBe(directLink);
  });

  it("is a tunnel through the door when the server answers there, and nothing goes plain", async () => {
    const plain = noPlainFetch();
    const home = await fakeServer(okJson);
    const link = await establishLink(
      { serverUrl: LAN, serverKey: home.serverKey, relayUrl: home.relay.url },
      { socket: home.factory },
    );
    expect(link.kind).toBe("tunnel");
    expect(home.opened).toEqual([DOOR]);
    const response = await link.fetch(`${LAN}/v1/events?since=41`);
    expect(await response.json()).toEqual({ target: "/v1/events?since=41", method: "GET" });
    expect(plain.calls).toEqual([]);
    link.close();
  });

  it("is the relay when the door does not answer in the time a tap would wait", async () => {
    const home = await fakeServer(okJson, { door: "silent" });
    const started = Date.now();
    const away = await establishLink(
      { serverUrl: LAN, serverKey: home.serverKey, relayUrl: home.relay.url },
      { socket: home.factory, probeMs: 50 },
    );
    expect(away.kind).toBe("relay");
    expect(Date.now() - started).toBeLessThan(1000);
    expect(home.opened).toEqual([DOOR, RELAY_DOOR]);
    away.close();

    // A door that refuses the socket outright is the same, and quicker.
    home.door = "refuses";
    const refused = await establishLink(
      { serverUrl: LAN, serverKey: home.serverKey, relayUrl: home.relay.url },
      { socket: home.factory },
    );
    expect(refused.kind).toBe("relay");
    refused.close();
  });

  it("dials the relay beside a door slow to answer, takes the first through, and closes the other (ADR 0253)", async () => {
    const home = await fakeServer(okJson);
    const doorClosed: string[] = [];
    const factory = (url: string): SocketLike => {
      const socket = home.factory(url);
      if (!url.endsWith("/v1/tunnel")) return socket;
      // The door answers, but only after the relay is through.
      let opened: SocketLike["onopen"] = null;
      const close = socket.close.bind(socket);
      return Object.defineProperties(socket, {
        onopen: {
          get: () => (event: unknown) => setTimeout(() => opened?.(event), 300),
          set: (next: SocketLike["onopen"]) => {
            opened = next;
          },
        },
        close: {
          value: (code?: number, reason?: string) => {
            doorClosed.push(reason ?? "");
            close(code, reason);
          },
        },
      });
    };
    const started = Date.now();
    const link = await establishLink(
      { serverUrl: LAN, serverKey: home.serverKey, relayUrl: home.relay.url },
      { socket: factory, probeMs: 5000, headStartMs: 20 },
    );
    // Through the relay long before the door's five seconds were up.
    expect(link.kind).toBe("relay");
    expect(Date.now() - started).toBeLessThan(1000);
    expect(home.opened).toEqual([DOOR, RELAY_DOOR]);
    // The door came through after, and was let go having been sent only the handshake.
    await vi.waitFor(() => expect(doorClosed).toEqual(["done"]));
    expect(home.seen).toEqual([]);
    link.close();
  });

  it("does not dial the relay at all when the door answers within its head start", async () => {
    const home = await fakeServer(okJson);
    const link = await establishLink(
      { serverUrl: LAN, serverKey: home.serverKey, relayUrl: home.relay.url },
      { socket: home.factory, headStartMs: 1000 },
    );
    expect(link.kind).toBe("tunnel");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(home.opened).toEqual([DOOR]);
    link.close();
  });

  it("waits for a door still trying when the relay says no, and says the relay's no when both fail", async () => {
    const relayNo = refusingRelay("no_such_server", "No server of that key is here.");
    const slowDoor = (url: string): SocketLike => {
      if (!url.endsWith("/v1/tunnel")) return relayNo(url);
      const socket = relayNo("wss://relay.test/v1/connect");
      // Never opens: the door is given up on at the probe's time, after the relay said no.
      socket.onopen = null;
      return Object.defineProperty(socket, "onopen", { get: () => null, set: () => undefined });
    };
    const started = Date.now();
    const failed = await establishLink(AWAY, {
      socket: slowDoor,
      probeMs: 120,
      headStartMs: 10,
    }).catch((error: unknown) => error);
    expect(Date.now() - started).toBeGreaterThanOrEqual(100);
    expect((failed as LinkError).reason).toBe("no_such_server");
  });

  it("sends a server at the address that is not this device's server nothing but the handshake, and goes to the relay", async () => {
    const plain = noPlainFetch();
    const home = await fakeServer(okJson);
    const stranger = await fakeServer(okJson);
    // Whoever has the stored address answers the door; the device's own server is at the relay.
    const factory = (url: string) =>
      url.endsWith("/v1/tunnel") ? stranger.factory(url) : home.factory(url);
    const link = await establishLink(
      { serverUrl: LAN, serverKey: home.serverKey, relayUrl: home.relay.url },
      { socket: factory },
    );
    expect(link.kind).toBe("relay");
    expect(stranger.opened).toEqual([DOOR]);
    // The handshake's first message, and nothing after it: no request, no health read.
    expect(stranger.frames()).toBe(1);
    expect(stranger.seen).toEqual([]);
    expect(stranger.answerer()).toBeUndefined();
    expect(plain.calls).toEqual([]);
    expect(home.seen).toEqual([]);
    link.close();
  });

  it("says unreachable when the door does not answer and there is no relay to try", async () => {
    const home = await fakeServer(okJson, { door: "refuses" });
    const failed = await establishLink(
      { serverUrl: LAN, serverKey: home.serverKey },
      { socket: home.factory },
    ).catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(LinkError);
    expect((failed as LinkError).reason).toBe("unreachable");
    expect((failed as LinkError).message).toMatch(/did not answer at its door/);
    expect(home.opened).toEqual([DOOR]);

    // With no relay behind it, the door gets the whole dial rather than a tap's wait.
    const slow = await fakeServer(okJson, { door: "silent" });
    const waited = await establishLink(
      { serverUrl: LAN, serverKey: slow.serverKey },
      { socket: slow.factory, probeMs: 10, timeoutMs: 80 },
    ).catch((error: unknown) => error);
    expect((waited as LinkError).reason).toBe("unreachable");
    expect((waited as LinkError).message).toMatch(/in time/);
  });

  it("gives up on a door that opens and then says nothing, within the same time", async () => {
    const mute = (_url: string): SocketLike => {
      const socket: SocketLike = {
        binaryType: "blob",
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
        send: () => undefined,
        close: () => undefined,
      };
      queueMicrotask(() => socket.onopen?.({}));
      return socket;
    };
    const started = Date.now();
    const failed = await establishLink(
      { serverUrl: LAN, serverKey: "k".repeat(43) },
      { socket: mute, timeoutMs: 60 },
    ).catch((error: unknown) => error);
    expect((failed as LinkError).reason).toBe("unreachable");
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

/**
 * A relay that says no. The phone dials, the relay answers with an `error` frame, and what
 * comes back out of `establishLink` is the reason a screen can act on rather than the tunnel's
 * own vocabulary — which nothing above core should have to know. The door, tried first, is a
 * dead address.
 */
function refusingRelay(code: string, message: string) {
  const factory = (url: string): SocketLike => {
    const socket: SocketLike = {
      binaryType: "blob",
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      send: () =>
        queueMicrotask(() =>
          socket.onmessage?.({
            data: JSON.stringify({ frame: "error", v: RELAY_VERSION, code, message }),
          }),
        ),
      close: () => undefined,
    };
    if (url.endsWith("/v1/tunnel"))
      queueMicrotask(() => socket.onclose?.({ code: 1006, reason: "" }));
    else queueMicrotask(() => socket.onopen?.({}));
    return socket;
  };
  return factory;
}

const AWAY = {
  serverUrl: LAN,
  serverKey: toBase64url(new Uint8Array(32).fill(7)),
  relayUrl: "wss://relay.test",
};

describe("when the link cannot be made", () => {
  it("says the server is not there when the relay says so", async () => {
    const failed = await establishLink(AWAY, {
      socket: refusingRelay("no_such_server", "No server of that key is here."),
    }).catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(LinkError);
    expect((failed as LinkError).reason).toBe("no_such_server");
    expect((failed as LinkError).message).toBe("No server of that key is here.");
  });

  it("says busy for the two codes that mean another tunnel holds it", async () => {
    for (const code of ["busy", "replaced"]) {
      const failed = await establishLink(AWAY, {
        socket: refusingRelay(code, "Somebody else is on it."),
      }).catch((error: unknown) => error);
      expect((failed as LinkError).reason).toBe("busy");
    }
  });

  it("says unreachable for everything else the relay can refuse with", async () => {
    for (const code of ["bad_proof", "unknown_version", "bad_frame"]) {
      const failed = await establishLink(AWAY, {
        socket: refusingRelay(code, "No."),
      }).catch((error: unknown) => error);
      expect((failed as LinkError).reason).toBe("unreachable");
    }
  });

  it("leaves a device with no key alone, so its plain link costs no round trip", async () => {
    const opened: string[] = [];
    const link = await establishLink(
      { serverUrl: "http://mini.local:4431", relayUrl: "wss://relay.test" },
      {
        socket: (url) => {
          opened.push(url);
          throw new Error("not opened");
        },
      },
    );
    expect(link).toBe(directLink);
    expect(opened).toEqual([]);
  });
});

describe("a link through the relay", () => {
  it("answers fetch with a Response, carrying the method, the path and query, headers and body", async () => {
    const { relay, factory, seen } = await fakeServer(okJson);
    const link = await relayLink(relay, { socket: factory });
    const response = await link.fetch("http://192.168.1.20:4431/v1/events?since=41", {
      headers: { "x-chips-device": "dev_1" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual({ target: "/v1/events?since=41", method: "GET" });
    expect(seen[0]).toMatchObject({
      method: "GET",
      target: "/v1/events?since=41",
      headers: { "x-chips-device": "dev_1" },
    });

    // A relative URL, as a browser the server served uses; a string body; a byte body.
    await link.fetch("/v1/pair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"code":"ABC-234"}',
    });
    expect(seen[1]?.target).toBe("/v1/pair");
    expect(new TextDecoder().decode(seen[1]?.body)).toBe('{"code":"ABC-234"}');
    await link.fetch("/v1/uploads/u1", { method: "PUT", body: new Uint8Array([1, 2, 3]) });
    expect(seen[2]?.body).toEqual(new Uint8Array([1, 2, 3]));
    await link.fetch("/v1/uploads/u2", { method: "PUT", body: new Uint8Array([4, 5]).buffer });
    expect(seen[3]?.body).toEqual(new Uint8Array([4, 5]));
    await link.fetch("/v1/uploads/u3", { method: "PUT", body: new Blob([new Uint8Array([6])]) });
    expect(seen[4]?.body).toEqual(new Uint8Array([6]));
    await expect(
      link.fetch("/v1/uploads/u4", { method: "PUT", body: new URLSearchParams("a=1") }),
    ).rejects.toThrow("string, bytes or a Blob");
    link.close();
  });

  it("sends the handshake right behind the ask, before the relay says it is through (ADR 0253)", async () => {
    const home = await fakeServer(okJson);
    const said: string[] = [];
    const nameOf = (data: unknown) =>
      typeof data === "string" ? (JSON.parse(data) as { frame: string }).frame : "bytes";
    const factory = (url: string): SocketLike => {
      const socket = home.factory(url);
      const send = socket.send.bind(socket);
      let heard: SocketLike["onmessage"] = null;
      return Object.defineProperties(socket, {
        send: {
          value: (data: string | ArrayBufferLike | ArrayBufferView) => {
            said.push(`sent ${nameOf(data)}`);
            send(data);
          },
        },
        onmessage: {
          get: () => heard,
          set: (next: SocketLike["onmessage"]) => {
            heard =
              next === null
                ? null
                : (event) => {
                    said.push(`heard ${nameOf(event.data)}`);
                    next(event);
                  };
          },
        },
      });
    };
    const link = await relayLink(home.relay, { socket: factory });
    expect(said.slice(0, 4)).toEqual([
      "sent connect",
      "sent bytes",
      "heard connected",
      "heard bytes",
    ]);
    expect(home.frames()).toBe(1);
    link.close();
  });

  it("gives up on a fetch its signal lets go, as fetch does, and carries on for the rest", async () => {
    const { relay, factory } = await fakeServer(async (input) =>
      input.target === "/v1/never"
        ? await new Promise<never>(() => undefined)
        : { status: 200, headers: {}, body: new TextEncoder().encode("ok") },
    );
    const link = await relayLink(relay, { socket: factory });
    const giving = new AbortController();
    const page = link.fetch("/v1/never", { signal: giving.signal });
    giving.abort();
    await expect(page).rejects.toMatchObject({ name: "AbortError" });
    expect(await (await link.fetch("/v1/after")).text()).toBe("ok");
    link.close();
  });

  it("gives a bodiless status no body, and a socket the shape the transport drives", async () => {
    const { relay, factory } = await fakeServer(async () => ({
      status: 204,
      headers: {},
      body: new Uint8Array(),
    }));
    const link = await relayLink(relay, { socket: factory });
    expect((await link.fetch("/v1/devices/dev_2", { method: "DELETE" })).status).toBe(204);

    const socket: LinkSocket = link.socket("ws://192.168.1.20:4431/v1/ws?ticket=t1");
    await new Promise<void>((resolve) => {
      socket.onopen = () => resolve();
    });
    const heard = new Promise<unknown>((resolve) => {
      socket.onmessage = (event) => resolve(event.data);
    });
    socket.send('{"frame":"ping","ts":1}');
    expect(await heard).toBe('echo {"frame":"ping","ts":1}');
    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
      socket.onclose = (event) => resolve(event);
    });
    socket.close(1000, "done");
    expect(await closed).toEqual({ code: 1000, reason: "done" });

    const refused = link.socket("ws://192.168.1.20:4431/v1/ws");
    const refusal = new Promise<{ code: number; reason: string }>((resolve) => {
      refused.onclose = (event) => resolve(event);
    });
    expect(await refusal).toEqual({ code: 4001, reason: "unauthorized" });
    link.close();
  });
});

describe("a relayed answer, read as it comes", () => {
  it("gives a reader the body in the chunks the tunnel brought, with its length up front", async () => {
    const video = new Uint8Array(100_000).map((_, i) => i % 251);
    const { relay, factory } = await fakeServer(async () => ({
      status: 200,
      headers: { "content-type": "video/mp4", "content-length": String(video.length) },
      body: video,
    }));
    const link = await relayLink(relay, { socket: factory });
    const response = await link.fetch("/v1/attachments/att_1?variant=play");
    expect(response.headers.get("content-length")).toBe("100000");
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const sizes: number[] = [];
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      sizes.push(read.value.length);
    }
    // Four tunnel chunks of 32 KiB and what is left, not one lump at the end.
    expect(sizes.length).toBeGreaterThan(1);
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(video.length);
    link.close();
  });

  it("is a Response a React Native polyfill could not have made, reading whole or by the chunk", async () => {
    const chunks = (...parts: string[]) =>
      new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(controller) {
          for (const part of parts) controller.enqueue(utf8(part));
          controller.close();
        },
      });
    const json = responseOf(
      { status: 200, headers: { "content-type": "application/json" }, body: chunks('{"a":', "1}") },
      false,
    );
    expect(json).not.toBeInstanceOf(Response);
    expect(json.ok).toBe(true);
    expect(json.headers.get("content-type")).toBe("application/json");
    expect(await json.json()).toEqual({ a: 1 });
    expect(json.bodyUsed).toBe(true);
    await expect(json.text()).rejects.toThrow("already been read");

    const bytes = responseOf({ status: 404, headers: {}, body: chunks("no ", "such") }, false);
    expect(bytes.ok).toBe(false);
    expect(new TextDecoder().decode(await bytes.arrayBuffer())).toBe("no such");
    const blob = responseOf(
      { status: 200, headers: { "content-type": "text/plain" }, body: chunks("x") },
      false,
    );
    expect((await blob.blob()).type).toBe("text/plain");

    const read = responseOf({ status: 200, headers: {}, body: chunks("one", "two") }, false);
    const reader = (read.body as ReadableStream<Uint8Array>).getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("one");

    // A bodiless status is the platform's own Response, whichever the platform.
    expect(responseOf({ status: 204, headers: {}, body: chunks() }, false)).toBeInstanceOf(
      Response,
    );
  });
});

describe("the link a device is using", () => {
  it("is the network until one is chosen, and the chosen one after, until it is dropped", async () => {
    expect(linkFor({ deviceId: "dev_x" })).toBe(directLink);
    const { relay, factory, answerer } = await fakeServer(okJson);
    const link = await relayLink(relay, { socket: factory });
    useLink("dev_x", link);
    expect(linkFor({ deviceId: "dev_x" })).toBe(link);
    // Choosing another closes the one before it.
    const closed = new Promise<string>((resolve) => {
      const current = answerer();
      if (current !== undefined) current.onclose = resolve;
    });
    useLink("dev_x", directLink);
    expect(await closed).toBe("done");
    expect(linkFor({ deviceId: "dev_x" })).toBe(directLink);
    dropLink("dev_x");
    expect(linkFor({ deviceId: "dev_x" })).toBe(directLink);
    dropLink("dev_never");
    expect(linkFor({ deviceId: "dev_never" })).toBe(directLink);
  });
});

describe("the handshake hash a link names (ADR 0191, decision 6)", () => {
  it("is the tunnel's, which both ends agree on; none on the plain link; the choice's for a tunnel still to be chosen", async () => {
    expect(directLink.handshakeHash).toBeUndefined();
    const home = await fakeServer(okJson);
    const device = { deviceId: "dev_hash", serverUrl: LAN, serverKey: home.serverKey };
    const waiting = linkFor(device).handshakeHash?.();
    const link = await doorLink(LAN, home.serverKey, { socket: home.factory });
    const hash = await link.handshakeHash?.();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(home.handshakeHash());
    useLink(device.deviceId, link);
    expect(await waiting).toBe(hash);
    // Another tunnel is another hash: a signature over one is no good in the other.
    const again = await doorLink(LAN, home.serverKey, { socket: home.factory });
    expect(await again.handshakeHash?.()).not.toBe(hash);
    again.close();
    dropLink(device.deviceId);
  });
});

describe("before the transport has chosen a link (ADR 0191)", () => {
  const KEY = "k".repeat(43);

  it("hands a device holding a key a tunnel still to be chosen, which waits for the transport's, and never the plain link", async () => {
    const plain = noPlainFetch();
    const home = await fakeServer(okJson);
    const device = { deviceId: "dev_cold", serverUrl: LAN, serverKey: home.serverKey };
    const early = linkFor(device);
    expect(early.kind).toBe("tunnel");
    // A read at a cold launch, before the socket's handshake is done (ADR 0179's wait).
    const read = readOnLink(device, async (link) => (await link.fetch(`${LAN}/v1/server`)).json());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(home.seen).toEqual([]);
    expect(plain.calls).toEqual([]);
    useLink(device.deviceId, await doorLink(LAN, home.serverKey, { socket: home.factory }));
    reached(device.deviceId);
    expect(await read).toEqual({ target: "/v1/server", method: "GET" });
    expect(home.seen.map((each) => each.target)).toEqual(["/v1/server"]);
    expect(plain.calls).toEqual([]);
    // Chosen, the device's link is the chosen one itself.
    expect(linkFor(device).kind).toBe("tunnel");
    expect(linkFor(device)).not.toBe(early);
    dropLink(device.deviceId);
  });

  it("opens a socket asked of it on the chosen link, or closes it when none comes", async () => {
    const home = await fakeServer(okJson);
    const device = { deviceId: "dev_sock", serverUrl: LAN, serverKey: home.serverKey };
    const socket = linkFor(device).socket(`ws://192.168.1.20:4431/v1/ws?ticket=t1`);
    const opened = new Promise<void>((resolve) => {
      socket.onopen = () => resolve();
    });
    useLink(device.deviceId, await doorLink(LAN, home.serverKey, { socket: home.factory }));
    await opened;
    const heard = new Promise<unknown>((resolve) => {
      socket.onmessage = (event) => resolve(event.data);
    });
    socket.send("ping");
    expect(await heard).toBe("echo ping");
    const closed = new Promise<{ code: number }>((resolve) => {
      socket.onclose = (event) => resolve(event);
    });
    socket.close(1000, "done");
    expect((await closed).code).toBe(1000);
    dropLink(device.deviceId);

    // Closed before any link came: closed as asked, on nothing.
    const never = { deviceId: "dev_never_chosen", serverUrl: LAN, serverKey: KEY };
    const early = linkFor(never, 30).socket("ws://192.168.1.20:4431/v1/ws");
    const gone = new Promise<{ code: number }>((resolve) => {
      early.onclose = (event) => resolve(event);
    });
    early.close(1001, "leaving");
    expect((await gone).code).toBe(1001);
    const unchosen = linkFor(never, 30).socket("ws://192.168.1.20:4431/v1/ws");
    const noTunnel = new Promise<{ code: number; reason: string }>((resolve) => {
      unchosen.onclose = (event) => resolve(event);
    });
    expect(await noTunnel).toEqual({ code: 1006, reason: "no_tunnel" });
  });

  it("gives up as a closed tunnel when no link is chosen in time, which a read asks again on the next", async () => {
    const device = { deviceId: "dev_slow", serverUrl: LAN, serverKey: KEY };
    await expect(linkFor(device, 30).fetch(`${LAN}/v1/server`)).rejects.toBeInstanceOf(
      TunnelClosedError,
    );
  });

  it("is the plain link only for a device the page itself served; one with an address and no key waits too (Phase 3)", async () => {
    expect(linkFor({ deviceId: "dev_page" })).toBe(directLink);
    expect(linkFor({ deviceId: "dev_bare", serverUrl: "" })).toBe(directLink);
    // A device paired before servers had keys: the transport takes its first key before it
    // chooses, so a cold launch's reads wait for that rather than going plain ahead of it.
    const plain = noPlainFetch();
    const keyless = { deviceId: "dev_keyless", serverUrl: LAN };
    expect(linkFor(keyless).kind).toBe("tunnel");
    const read = readOnLink(keyless, async (link) => (await link.fetch(`${LAN}/v1/server`)).json());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(plain.calls).toEqual([]);
    // A server that names no key leaves the device on the plain link, which the transport chooses.
    useLink(keyless.deviceId, directLink);
    reached(keyless.deviceId);
    await expect(read).rejects.toThrow(/plain fetch/);
    expect(plain.calls).toEqual([`${LAN}/v1/server`]);
    dropLink(keyless.deviceId);
  });
});

/** A link whose `fetch` is whatever the test says, one ask after another. */
function scriptedLink(
  kind: Link["kind"],
  ...answers: (() => Promise<Response>)[]
): Link & { readonly asked: string[] } {
  const asked: string[] = [];
  return {
    kind,
    asked,
    fetch: (url) => {
      asked.push(url);
      const next = answers.shift();
      return next === undefined ? Promise.reject(new Error("asked once too often")) : next();
    },
    socket: () => {
      throw new Error("no sockets here");
    },
    close: () => undefined,
  };
}

const networkLink = (...answers: (() => Promise<Response>)[]) => scriptedLink("direct", ...answers);
const json = (value: unknown) => async () => Response.json(value);
const noNetwork = () => Promise.reject(new TypeError("Network request failed"));

describe("a read the connection drops under (ADR 0179)", () => {
  it("is asked again through the next tunnel once the device reaches its server again", async () => {
    const gone = await fakeServer(() => new Promise(() => undefined));
    const back = await fakeServer(okJson);
    const device = { deviceId: "dev_restart" };
    useLink(device.deviceId, await relayLink(gone.relay, { socket: gone.factory }));
    const kinds: string[] = [];
    const read = readOnLink(device, async (link) => {
      kinds.push(link.kind);
      return (await link.fetch("https://server.test/v1/attachments/att_1?variant=view")).json();
    });
    await expect.poll(() => gone.seen.length).toBe(1);
    // The server restarts: the relay closes the tunnel under the read.
    gone.answerer()?.close("server_gone");
    await new Promise((resolve) => setTimeout(resolve, 10));
    useLink(device.deviceId, await relayLink(back.relay, { socket: back.factory }));
    reached(device.deviceId);
    expect(await read).toEqual({ target: "/v1/attachments/att_1?variant=view", method: "GET" });
    expect(kinds).toEqual(["relay", "relay"]);
    expect(back.seen).toHaveLength(1);
    dropLink(device.deviceId);
  });

  it("is asked again on the network once the socket is open again, or at once if it already is", async () => {
    const device = { deviceId: "dev_wifi" };
    const network = networkLink(noNetwork, json({ n: 1 }), noNetwork, json({ n: 2 }));
    useLink(device.deviceId, network);
    const waiting = readOnLink(device, async (link) => (await link.fetch("https://s/a")).json());
    await expect.poll(() => network.asked.length).toBe(1);
    reached(device.deviceId);
    expect(await waiting).toEqual({ n: 1 });
    // Back before the failure was heard: nothing to wait for.
    const late = readOnLink(device, async (link) => {
      const asked = link.fetch("https://s/b");
      reached(device.deviceId);
      return (await asked).json();
    });
    expect(await late).toEqual({ n: 2 });
    expect(network.asked).toEqual(["https://s/a", "https://s/a", "https://s/b", "https://s/b"]);
    dropLink(device.deviceId);
  });

  it("says so in words when the connection does not come back in time, or drops again", async () => {
    const device = { deviceId: "dev_away" };
    useLink(device.deviceId, networkLink(noNetwork));
    const read = (link: Link) => link.fetch("https://s/a");
    await expect(readOnLink(device, read, 10)).rejects.toEqual(
      new ConnectionDropped("The connection dropped."),
    );
    const twice = networkLink(noNetwork, noNetwork);
    useLink(device.deviceId, twice);
    const again = readOnLink(device, read, 1000);
    await expect.poll(() => twice.asked.length).toBe(1);
    reached(device.deviceId);
    await expect(again).rejects.toBeInstanceOf(ConnectionDropped);
    expect(twice.asked).toHaveLength(2);
    dropLink(device.deviceId);
  });

  it("is not asked again for anything but a drop", async () => {
    const device = { deviceId: "dev_said" };
    const abort = Object.assign(new Error("The download was let go of."), { name: "AbortError" });
    const network = networkLink(
      () => Promise.reject(abort),
      json({}),
      async () => new Response("no", { status: 500 }),
    );
    useLink(device.deviceId, network);
    const read = async (link: Link) => (await link.fetch("https://s/a")).json();
    await expect(readOnLink(device, read, 1000)).rejects.toBe(abort);
    // What the read itself throws, after the fetch came back, is the read's.
    await expect(
      readOnLink(device, async (link) => {
        await link.fetch("https://s/a");
        throw new TypeError("not a network failure");
      }),
    ).rejects.toThrow("not a network failure");
    expect((await readOnLink(device, (link) => link.fetch("https://s/a"))).status).toBe(500);
    expect(network.asked).toHaveLength(3);
    // Through the relay, an answer the tunnel refused would be refused again.
    const refused = new TunnelError("The answer is too long.");
    const relay = scriptedLink("relay", () => Promise.reject(refused));
    useLink(device.deviceId, relay);
    await expect(readOnLink(device, read, 1000)).rejects.toBe(refused);
    expect(relay.asked).toHaveLength(1);
    dropLink(device.deviceId);
  });
});

describe("the relay a server's health names (ADR 0144, SEC-2)", () => {
  const KEY = "k".repeat(43);
  const held = { serverKey: KEY, relayUrl: "wss://relay.test" };
  const named = { url: "wss://relay.test", serverKey: KEY };

  it("is taken by a device with no key, kept when nothing differs, and followed to another address", () => {
    expect(relayVerdict({}, named)).toBe("take");
    expect(relayVerdict({ relayUrl: "wss://old.test" }, named)).toBe("take");
    expect(relayVerdict(held, named)).toBe("keep");
    expect(relayVerdict(held, { url: "wss://elsewhere.test", serverKey: KEY })).toBe("take");
    // A device holding the key and no relay yet learns the relay under that key (ADR 0191).
    expect(relayVerdict({ serverKey: KEY }, named)).toBe("take");
  });

  it("is refused under any key but the one pinned at pairing, at the same address or another", () => {
    // The key is held on its own since ADR 0191: a server naming a relay under another key is
    // refused whether or not the device had a relay before.
    const other = "x".repeat(43);
    expect(relayVerdict(held, { url: "wss://relay.test", serverKey: other })).toBe("refuse");
    expect(relayVerdict(held, { url: "wss://elsewhere.test", serverKey: other })).toBe("refuse");
    expect(relayVerdict({ serverKey: KEY }, { url: "wss://relay.test", serverKey: other })).toBe(
      "refuse",
    );
  });

  it("is read from health as an address and a key, and nothing where either is missing", async () => {
    const answering = (body: unknown, status = 200): Link => ({
      kind: "direct",
      fetch: async () => new Response(JSON.stringify(body), { status }),
      socket: () => {
        throw new Error("not opened here");
      },
      close: () => undefined,
    });
    // On the wire the key is `key`; the device keeps it as the server's key at that relay.
    const wire = { url: "wss://relay.test", key: KEY };
    expect(await relayNamedBy(answering({ status: "ok", relay: wire }), "/v1/server")).toEqual({
      url: "wss://relay.test",
      serverKey: KEY,
    });
    for (const relay of [
      undefined,
      null,
      { url: "wss://relay.test" },
      { key: KEY },
      { url: "", key: KEY },
      { url: "wss://relay.test", key: 7 },
    ]) {
      expect(await relayNamedBy(answering({ status: "ok", relay }), "/v1/server")).toBeUndefined();
    }
    expect(await relayNamedBy(answering({ relay: wire }, 503), "/v1/server")).toBeUndefined();
    const failing: Link = {
      ...answering({}),
      fetch: async () => {
        throw new Error("no route");
      },
    };
    expect(await relayNamedBy(failing, "/v1/server")).toBeUndefined();
  });

  it("names the server's key with or without a relay, and nothing for a key that is not one (ADR 0191, Phase 3)", async () => {
    const answering = (body: unknown): Link => ({
      kind: "direct",
      fetch: async () => new Response(JSON.stringify(body), { status: 200 }),
      socket: () => {
        throw new Error("not opened here");
      },
      close: () => undefined,
    });
    // A server with no relay names its key all the same (ADR 0191, decision 1).
    const alone = { status: "off", url: null, key: KEY };
    expect(await reachNamedBy(answering({ relay: alone }), "/v1/server")).toEqual({
      serverKey: KEY,
    });
    expect(
      await reachNamedBy(answering({ relay: { url: "wss://relay.test", key: KEY } }), "/v1/server"),
    ).toEqual({ serverKey: KEY, relayUrl: "wss://relay.test" });
    // A key that is not the shape of one is not named: a handshake against it could never complete.
    for (const relay of [
      undefined,
      { url: "wss://relay.test", key: null },
      { url: "wss://relay.test", key: "not a key" },
      { url: "wss://relay.test", key: 7 },
    ]) {
      expect(await reachNamedBy(answering({ status: "ok", relay }), "/v1/server")).toBeUndefined();
    }
  });
});
