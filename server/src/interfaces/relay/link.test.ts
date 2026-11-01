/**
 * The relay link, end to end: a real relay on a port, chipsd dialling out to it, and a phone
 * stand-in — the tunnel's caller over Node's own WebSocket — pairing, signing, opening a socket
 * and posting a message through it, against the same app and the same hub the port serves.
 */

import { generateKeyPairSync, sign } from "node:crypto";
import { createLogger, systemClock } from "@chipschat/platform";
import { RELAY_VERSION } from "@chipschat/protocol";
import { startRelay } from "@chipschat/relay";
import {
  type Caller,
  connectThroughRelay,
  createCaller,
  createChannel,
  fromBase64url,
  initiateHandshake,
  type ResponseOutput,
  type SocketFactory,
  type SocketLike,
  type TunnelSocket,
  text,
  toHex,
  utf8,
} from "@chipschat/tunnel";
import { afterEach, describe, expect, it } from "vitest";
import { signingPayload } from "../../infrastructure/auth/credentials.js";
import { createRelayIdentity } from "../../infrastructure/relay/identity.js";
import { createServerKeys } from "../../infrastructure/store/server-keys.js";
import { createTestWorkspace } from "../../testing/workspace.js";
import { UNAUTHENTICATED_BODY_BYTES } from "../http/app.js";
import { addressFrom, createRelayLink } from "./link.js";

const logger = createLogger({ level: "silent", name: "link-test" });
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function relayOnPort(port = 0) {
  const relay = await startRelay({ host: "127.0.0.1", port, logger });
  cleanups.push(() => relay.close());
  return relay;
}

/** A workspace whose server dials out to the relay, listening. */
async function servedThrough(relayUrl: string) {
  const ws = await createTestWorkspace({
    config: { relay: { url: relayUrl, host: "127.0.0.1", port: 4440, maxSessionsPerServer: 32 } },
  });
  cleanups.push(() => ws.close());
  const listening = await ws.gateway.listen();
  if (listening.relay === undefined) throw new Error("no relay link");
  await listening.relay.connected();
  return { ws, listening, link: listening.relay };
}

/** A phone's end of a tunnel: the caller, and the handshake hash its signatures name. */
type Phone = Caller & { readonly handshakeHash: string };

/**
 * The phone: through the relay, the handshake done, requests and sockets from here. Its first
 * message goes right behind the ask, as the phone's own does (ADR 0253), so the relay here puts
 * through bytes that came before it said `connected`.
 */
async function phoneThrough(relayUrl: string, key: string): Promise<Phone> {
  const started = await initiateHandshake(fromBase64url(key));
  const link = await connectThroughRelay({
    url: relayUrl,
    serverKey: key,
    first: Promise.resolve(started.message),
  });
  const answered = new Promise<Uint8Array>((resolve) => {
    link.wire.onmessage = resolve;
  });
  const tunnel = await started.complete(await answered);
  const caller = createCaller(createChannel(tunnel, link.wire));
  cleanups.push(async () => caller.close());
  return Object.assign(caller, { handshakeHash: toHex(tunnel.handshakeHash) });
}

const json = (response: ResponseOutput) =>
  JSON.parse(text(response.body)) as Record<string, unknown>;
const JSON_HEADERS = { "content-type": "application/json" };

/** A key the phone made, signing the way a browser's device does (ADR 0006). */
function deviceKey() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    sign(
      deviceId: string,
      method: string,
      target: string,
      body = "",
      handshakeHash?: string,
    ): Record<string, string> {
      const timestamp = Date.now();
      const signature = sign(
        null,
        Buffer.from(signingPayload({ method, target, timestamp, body, handshakeHash }), "utf8"),
        privateKey,
      );
      return {
        "x-chips-device": deviceId,
        "x-chips-timestamp": String(timestamp),
        "x-chips-signature": signature.toString("base64"),
        ...(handshakeHash === undefined ? {} : { "x-chips-signed": "v2" }),
      };
    },
  };
}

/** Frames off a tunnelled socket, awaited by shape. */
function listen(socket: TunnelSocket) {
  const heard: Record<string, unknown>[] = [];
  const waiting: {
    match: (frame: Record<string, unknown>) => boolean;
    resolve: (frame: Record<string, unknown>) => void;
  }[] = [];
  socket.onmessage = (message) => {
    const frame = JSON.parse(message) as Record<string, unknown>;
    heard.push(frame);
    for (const waiter of [...waiting]) {
      if (waiter.match(frame)) {
        waiting.splice(waiting.indexOf(waiter), 1);
        waiter.resolve(frame);
      }
    }
  };
  return {
    heard,
    next: (match: (frame: Record<string, unknown>) => boolean) =>
      new Promise<Record<string, unknown>>((resolve) => {
        const already = heard.find(match);
        if (already !== undefined) resolve(already);
        else waiting.push({ match, resolve });
      }),
  };
}

const closeOf = (socket: TunnelSocket) =>
  new Promise<[number, string]>((resolve) => {
    socket.onclose = (code, reason) => resolve([code, reason]);
  });

describe("the relay's word on where a phone is (SEC-27)", () => {
  it("is taken as an address, and anything else is one bucket that is not the server's own", () => {
    expect(addressFrom("203.0.113.5")).toBe("203.0.113.5");
    expect(addressFrom("2001:db8:1:2::9")).toBe("2001:db8:1:2::9");
    expect(addressFrom("::ffff:203.0.113.5")).toBe("::ffff:203.0.113.5");
    expect(addressFrom("")).toBe("unknown");
    expect(addressFrom("local")).toBe("unknown");
    expect(addressFrom("203.0.113.5 or so")).toBe("unknown");
  });
});

describe("the relay link", () => {
  it("lets a phone pair, sign, open a socket and post a message, all through the relay", async () => {
    const relay = await relayOnPort();
    const { ws, link } = await servedThrough(relay.url);
    expect(ws.gateway.deps.relay.status()).toBe("connected");
    const key = await ws.gateway.deps.relay.publicKey();
    const phone = await phoneThrough(relay.url, key);

    // The same health the port answers a stranger: it says the server is dialled in, and names
    // neither the relay nor the key, which a paired device reads signed (SEC-28).
    const health = await phone.fetch({ method: "GET", target: "/v1/health" });
    expect(health.status).toBe(200);
    expect(json(health)["relay"]).toEqual({ status: "connected" });

    // Pairing: the door with no credential, through the tunnel.
    const code = ws.gateway.deps.pairingCodes?.issue({
      workspaceId: ws.workspaceId,
      participantId: ws.arjun.participantId,
    });
    const device = deviceKey();
    const paired = await phone.fetch({
      method: "POST",
      target: "/v1/pair",
      headers: JSON_HEADERS,
      body: utf8(JSON.stringify({ code: code?.code, public_key: device.publicKey, name: "Phone" })),
    });
    expect(paired.status).toBe(201);
    const deviceId = json(paired)["device_id"] as string;
    expect(deviceId).toMatch(/^dev_/);

    // A signed read: the signature covers the path, as it does on the port, and names this
    // tunnel (ADR 0191, decision 6).
    const people = await phone.fetch({
      method: "GET",
      target: "/v1/participants",
      headers: device.sign(deviceId, "GET", "/v1/participants", "", phone.handshakeHash),
    });
    expect(people.status).toBe(200);
    expect((json(people)["participants"] as { id: string }[]).map((p) => p.id)).toContain(
      ws.arjun.participantId,
    );

    // A socket: a ticket, then the same session a port's socket gets.
    const ticketed = await phone.fetch({
      method: "POST",
      target: "/v1/socket-tickets",
      headers: device.sign(deviceId, "POST", "/v1/socket-tickets", "", phone.handshakeHash),
    });
    expect(ticketed.status).toBe(201);
    const ticket = json(ticketed)["ticket"] as string;
    const socket = phone.open(`/v1/ws?ticket=${encodeURIComponent(ticket)}`);
    const frames = listen(socket);
    await new Promise<void>((resolve) => {
      socket.onopen = resolve;
    });
    socket.send(
      JSON.stringify({
        frame: "hello",
        protocol: { min: 1, max: 1 },
        client: { name: "phone", version: "0" },
      }),
    );
    const hello = await frames.next((frame) => frame["frame"] === "event");
    expect((hello["event"] as { type: string }).type).toBe("hello");
    socket.send(JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId, since: 0 }));
    socket.send(
      JSON.stringify({
        frame: "event",
        event: {
          type: "message.post",
          space_id: ws.spaceId,
          text: "from the road",
          idempotency_key: "phone-1",
        },
      }),
    );
    const ack = await frames.next((frame) => frame["frame"] === "ack");
    expect(ack).toMatchObject({ idempotency_key: "phone-1", duplicate: false });
    const posted = await frames.next(
      (frame) =>
        frame["frame"] === "event" && (frame["event"] as { type: string }).type === "message.post",
    );
    expect((posted["event"] as { text: string }).text).toBe("from the road");
    expect(link.sessions()).toBe(1);
    expect(ws.gateway.deps.sessions.closeDevice("dev_nobody")).toBe(0);

    // The device withdrawn: the tunnelled session ends the way a port's would (ADR 0034).
    const closed = closeOf(socket);
    expect(ws.gateway.deps.sessions.closeDevice(deviceId)).toBe(1);
    expect(await closed).toEqual([4001, "device_revoked"]);
  });

  it("holds a signed request to the tunnel it was made in, so a capture replays nowhere (ADR 0191, decision 6)", async () => {
    const relay = await relayOnPort();
    const { ws, listening } = await servedThrough(relay.url);
    const key = await ws.gateway.deps.relay.publicKey();
    const phone = await phoneThrough(relay.url, key);
    const code = ws.gateway.deps.pairingCodes?.issue({
      workspaceId: ws.workspaceId,
      participantId: ws.arjun.participantId,
    });
    const device = deviceKey();
    const paired = await phone.fetch({
      method: "POST",
      target: "/v1/pair",
      headers: JSON_HEADERS,
      body: utf8(JSON.stringify({ code: code?.code, public_key: device.publicKey, name: "Phone" })),
    });
    const deviceId = json(paired)["device_id"] as string;
    const target = "/v1/participants";
    const bound = device.sign(deviceId, "GET", target, "", phone.handshakeHash);
    expect((await phone.fetch({ method: "GET", target, headers: bound })).status).toBe(200);

    // The same request, as captured, through a second tunnel to the same key: a signature over
    // another tunnel's hash. And on the plain port, where there is no tunnel for it to name.
    const other = await phoneThrough(relay.url, key);
    expect(other.handshakeHash).not.toBe(phone.handshakeHash);
    expect((await other.fetch({ method: "GET", target, headers: bound })).status).toBe(401);
    expect(
      (await fetch(`http://127.0.0.1:${listening.port}${target}`, { headers: bound })).status,
    ).toBe(401);

    // The four-line shape inside a tunnel is refused, in either tunnel, and from a device that has
    // never signed five as well (since 25 October 2026); the plain port still takes it.
    const unbound = device.sign(deviceId, "GET", target);
    expect((await other.fetch({ method: "GET", target, headers: unbound })).status).toBe(401);
    expect((await phone.fetch({ method: "GET", target, headers: unbound })).status).toBe(401);
    expect(
      (await fetch(`http://127.0.0.1:${listening.port}${target}`, { headers: unbound })).status,
    ).toBe(200);
    const old = ws.arjun.sign("GET", target, "");
    expect((await other.fetch({ method: "GET", target, headers: old })).status).toBe(401);
  });

  it("opens a socket on its ticket's ask with the hello behind it, and on no other say (ADR 0253)", async () => {
    const relay = await relayOnPort();
    const { ws } = await servedThrough(relay.url);
    const key = await ws.gateway.deps.relay.publicKey();
    const phone = await phoneThrough(relay.url, key);
    const code = ws.gateway.deps.pairingCodes?.issue({
      workspaceId: ws.workspaceId,
      participantId: ws.arjun.participantId,
    });
    const device = deviceKey();
    const paired = await phone.fetch({
      method: "POST",
      target: "/v1/pair",
      headers: JSON_HEADERS,
      body: utf8(JSON.stringify({ code: code?.code, public_key: device.publicKey, name: "Phone" })),
    });
    const deviceId = json(paired)["device_id"] as string;
    const ask = device.sign(deviceId, "POST", "/v1/socket-tickets", "", phone.handshakeHash);
    const said = (frame: Record<string, unknown>) => JSON.stringify(frame);
    const hello = said({
      frame: "hello",
      protocol: { min: 1, max: 1 },
      client: { name: "phone", version: "0" },
    });
    const subscribe = said({ frame: "subscribe", workspace_id: ws.workspaceId, since: 0 });
    const post = (text: string, key: string) =>
      said({
        frame: "event",
        event: { type: "message.post", space_id: ws.spaceId, text, idempotency_key: key },
      });

    // The open carries the ask, and the hello and subscribe go behind it before it is taken.
    const socket = phone.open("/v1/ws", ask);
    const frames = listen(socket);
    let opened = false;
    socket.onopen = () => {
      opened = true;
    };
    socket.send(hello);
    socket.send(subscribe);
    expect(opened).toBe(false);
    const greeted = await frames.next((frame) => frame["frame"] === "event");
    expect((greeted["event"] as { type: string }).type).toBe("hello");
    await expect.poll(() => opened).toBe(true);

    // Refused: the same ask in another tunnel, as a capture would be; an ask signed for another
    // path; a device that is nobody's; and no credential at all. What went behind each is never
    // read, so its message never lands.
    const other = await phoneThrough(relay.url, key);
    const refusals = [
      other.open("/v1/ws", ask),
      phone.open("/v1/ws", device.sign(deviceId, "POST", "/v1/devices", "", phone.handshakeHash)),
      phone.open(
        "/v1/ws",
        device.sign("dev_nobody", "POST", "/v1/socket-tickets", "", phone.handshakeHash),
      ),
      phone.open("/v1/ws", {}),
    ];
    const closes = refusals.map((refused, at) => {
      const closed = closeOf(refused);
      refused.send(hello);
      refused.send(post("never lands", `refused-${at}`));
      return closed;
    });
    for (const closed of closes) expect(await closed).toEqual([4001, "unauthorized"]);
    socket.send(post("lands", "taken-1"));
    const landed = await frames.next(
      (frame) =>
        frame["frame"] === "event" && (frame["event"] as { type: string }).type === "message.post",
    );
    expect((landed["event"] as { text: string }).text).toBe("lands");
    expect(JSON.stringify(frames.heard)).not.toContain("never lands");
  });

  it("refuses a socket without a good ticket, and a door that is not the socket's", async () => {
    const relay = await relayOnPort();
    const { ws } = await servedThrough(relay.url);
    const phone = await phoneThrough(relay.url, await ws.gateway.deps.relay.publicKey());
    expect(await closeOf(phone.open("/v1/ws?ticket=bogus"))).toEqual([4001, "unauthorized"]);
    expect(await closeOf(phone.open("/v1/ws"))).toEqual([4001, "unauthorized"]);
    expect(await closeOf(phone.open("/v1/events"))).toEqual([4004, "not_found"]);
    const nowhere = await phone.fetch({ method: "GET", target: "v1/health" });
    expect(nowhere.status).toBe(422);
  });

  it("limits a tunnel's requests without a credential, and the pairing door by the relay's address", async () => {
    const relay = await relayOnPort();
    const { ws } = await servedThrough(relay.url);
    const key = await ws.gateway.deps.relay.publicKey();

    // Five wrong codes from one address, then the sixth is told to wait (the app's own limiter,
    // keyed by the address the relay saw).
    const guesser = await phoneThrough(relay.url, key);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const answer = await guesser.fetch({
        method: "POST",
        target: "/v1/pair",
        headers: JSON_HEADERS,
        body: utf8(
          JSON.stringify({ code: "ZZZ-ZZZ", public_key: deviceKey().publicKey, name: "Guess" }),
        ),
      });
      statuses.push(answer.status);
      if (answer.status === 429)
        expect((json(answer)["error"] as { code: string }).code).toBe("rate_limited");
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);

    // And thirty requests with no credential in a minute is all one tunnel gets.
    const stranger = await phoneThrough(relay.url, key);
    let refusedAt: number | undefined;
    for (let i = 1; i <= 40 && refusedAt === undefined; i += 1) {
      const answer = await stranger.fetch({ method: "GET", target: "/v1/health" });
      if (answer.status === 429) {
        refusedAt = i;
        expect(json(answer)["error"]).toMatchObject({
          code: "rate_limited",
          retry_after_seconds: 60,
        });
      }
    }
    expect(refusedAt).toBe(31);
  });

  it("counts a request to an open door as a stranger's whatever headers it carries (SEC-21)", async () => {
    const relay = await relayOnPort();
    const { ws } = await servedThrough(relay.url);
    const key = await ws.gateway.deps.relay.publicKey();
    // A made-up device header on a door that checks no credential bought nothing but a way past
    // the cap. It is classified by where it is going now.
    const pretender = await phoneThrough(relay.url, key);
    let refusedAt: number | undefined;
    for (let i = 1; i <= 40 && refusedAt === undefined; i += 1) {
      const answer = await pretender.fetch({
        method: "GET",
        target: "/v1/health",
        headers: { "x-chips-device": "dev_01K4ZQPX00000000000000000Z", authorization: "Bearer x" },
      });
      if (answer.status === 429) refusedAt = i;
    }
    expect(refusedAt).toBe(31);
    // And the body budget goes the same way: an open door takes a stranger's body, no more.
    const bigger = await phoneThrough(relay.url, key);
    await expect(
      bigger.fetch({
        method: "POST",
        target: "/v1/pair",
        headers: { ...JSON_HEADERS, "x-chips-device": "dev_01K4ZQPX00000000000000000Z" },
        body: utf8("x".repeat(UNAUTHENTICATED_BODY_BYTES + 1)),
      }),
    ).rejects.toThrow("too long");
  });

  it("holds a stranger's body through the tunnel to the fixed budget, before it is put together (SEC-11)", async () => {
    const relay = await relayOnPort();
    const { ws } = await servedThrough(relay.url);
    const key = await ws.gateway.deps.relay.publicKey();
    const stranger = await phoneThrough(relay.url, key);
    await expect(
      stranger.fetch({
        method: "POST",
        target: "/v1/pair",
        headers: JSON_HEADERS,
        body: utf8("x".repeat(UNAUTHENTICATED_BODY_BYTES + 1)),
      }),
    ).rejects.toThrow("too long");
    // Under it, the body reaches the app, which answers it as the bad JSON it is.
    const under = await stranger.fetch({
      method: "POST",
      target: "/v1/pair",
      headers: JSON_HEADERS,
      body: utf8("x".repeat(1000)),
    });
    expect(under.status).toBe(422);
  });

  it("says its key when a relay with a list turns it away, and is listed once the relay has it", async () => {
    const ws = await createTestWorkspace();
    cleanups.push(() => ws.close());
    const listening = await ws.gateway.listen();
    const identity = createRelayIdentity({ keys: createServerKeys(ws.db), clock: systemClock });
    const key = await identity.publicKey();
    const strict = await startRelay({
      host: "127.0.0.1",
      port: 0,
      logger,
      allowKeys: ["o".repeat(43)],
    });
    const lines: Record<string, unknown>[] = [];
    const link = createRelayLink({
      url: strict.url,
      keyPair: () => identity.keyPair(),
      app: ws.gateway.app,
      hub: listening.ws.hub,
      logger: createLogger({
        level: "warn",
        name: "link-test",
        destination: { write: (line: string) => lines.push(JSON.parse(line)) },
      }),
      backoffMs: { min: 20, max: 40 },
    });
    cleanups.push(() => link.close());
    await expect
      .poll(() => lines.find((line) => line["key"] === key))
      .toMatchObject({
        url: strict.url,
        msg: expect.stringContaining("CHIPS_RELAY_ALLOW_KEYS"),
      });
    expect(link.status()).toBe("connecting");
    // Kept for the owner's switch, which says why it isn't connected (the sweep's finding 12).
    expect(link.trouble()).toBe("not_allowed");

    // Its operator adds the key and restarts the relay on the same port.
    const port = strict.port;
    await strict.close();
    const listed = await startRelay({ host: "127.0.0.1", port, logger, allowKeys: [key] });
    cleanups.push(() => listed.close());
    await link.connected();
    expect(listed.stats().servers).toBe(1);
    expect(link.trouble()).toBeUndefined();
  });

  it("keeps busy when the relay lists as many servers from its address as it may", async () => {
    const ws = await createTestWorkspace();
    cleanups.push(() => ws.close());
    const listening = await ws.gateway.listen();
    const identity = createRelayIdentity({ keys: createServerKeys(ws.db), clock: systemClock });
    // A relay that turns the ninth server from one address away, as the switchboard does.
    const busy: SocketFactory = () => {
      const socket: SocketLike = {
        binaryType: "arraybuffer",
        send: () => undefined,
        close: () => undefined,
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
      };
      const frame = { frame: "error", v: RELAY_VERSION, code: "busy", message: "Too many." };
      queueMicrotask(() => socket.onmessage?.({ data: JSON.stringify(frame) }));
      return socket;
    };
    const link = createRelayLink({
      url: "ws://127.0.0.1:9",
      keyPair: () => identity.keyPair(),
      app: ws.gateway.app,
      hub: listening.ws.hub,
      logger,
      socket: busy,
      backoffMs: { min: 60_000, max: 60_000 },
    });
    cleanups.push(() => link.close());
    await expect.poll(() => link.trouble()).toBe("busy");
    expect(link.status()).toBe("connecting");
  });

  it("dials again, with backoff, when the relay goes and comes back", async () => {
    const relay = await relayOnPort();
    const ws = await createTestWorkspace();
    cleanups.push(() => ws.close());
    const listening = await ws.gateway.listen();
    const identity = createRelayIdentity({ keys: createServerKeys(ws.db), clock: systemClock });
    const link = createRelayLink({
      url: relay.url,
      keyPair: () => identity.keyPair(),
      app: ws.gateway.app,
      hub: listening.ws.hub,
      logger,
      backoffMs: { min: 20, max: 60 },
    });
    cleanups.push(() => link.close());
    await link.connected();
    expect(link.status()).toBe("connected");
    const key = await identity.publicKey();
    const before = await phoneThrough(relay.url, key);
    expect((await before.fetch({ method: "GET", target: "/v1/health" })).status).toBe(200);

    const port = relay.port;
    await relay.close();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(link.status()).toBe("connecting");
    // Nothing answers where the relay was.
    await expect.poll(() => link.trouble()).toBe("unreachable");
    const again = await relayOnPort(port);
    await link.connected();
    expect(link.status()).toBe("connected");
    expect(link.trouble()).toBeUndefined();
    const after = await phoneThrough(again.url, key);
    expect((await after.fetch({ method: "GET", target: "/v1/health" })).status).toBe(200);
    await link.close();
    expect(link.status()).toBe("off");
  });
});
