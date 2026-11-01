/**
 * The tunnel door on the server's own network (ADR 0191), end to end: a server listening with no
 * relay configured, and a phone stand-in — the tunnel's caller over a WebSocket at `/v1/tunnel`
 * — pairing, signing, opening a socket and posting a message through it, against the same app and
 * the same hub the port serves, with the socket's own address standing where the relay's word
 * stands on the other path.
 */

import { generateKeyPairSync, sign } from "node:crypto";
import { TUNNEL_DOOR_PATH } from "@chipschat/protocol";
import {
  asBytes,
  type Caller,
  createCaller,
  createChannel,
  fromBase64url,
  generateKeyPair,
  initiateHandshake,
  type ResponseOutput,
  type TunnelSocket,
  text,
  toHex,
  utf8,
  type Wire,
} from "@chipschat/tunnel";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { signingPayload } from "../../infrastructure/auth/credentials.js";
import { createTestWorkspace } from "../../testing/workspace.js";

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A workspace with no relay, listening: the door is on the port regardless. */
async function listening() {
  const ws = await createTestWorkspace();
  cleanups.push(() => ws.close());
  const started = await ws.gateway.listen();
  return { ws, port: started.port, door: started.door };
}

/** A socket open at the door, before any byte has crossed it. */
async function socketAtDoor(port: number): Promise<WebSocket> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${TUNNEL_DOOR_PATH}`);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return socket;
}

/** The socket as the tunnel's wire, the phone's end: binary frames in, binary frames out. */
function wireOver(socket: WebSocket): Wire {
  const wire: Wire = {
    onmessage: undefined,
    onclose: undefined,
    send: (data) => socket.send(data),
    close: () => socket.close(1000, "done"),
    backlog: () => socket.bufferedAmount,
  };
  socket.on("message", (data) => {
    const bytes = asBytes(data);
    if (bytes !== undefined) wire.onmessage?.(bytes);
  });
  socket.on("close", (code, reason) => wire.onclose?.(reason.toString() || `closed_${code}`));
  return wire;
}

/** A phone's end of a tunnel: the caller, and the handshake hash its signatures name. */
type Phone = Caller & { readonly handshakeHash: string };

/** The phone: at the door, the handshake done against `key`, requests and sockets from here. */
async function phoneAtDoor(port: number, key: string): Promise<Phone> {
  const wire = wireOver(await socketAtDoor(port));
  const started = await initiateHandshake(fromBase64url(key));
  const answered = new Promise<Uint8Array>((resolve) => {
    wire.onmessage = resolve;
  });
  wire.send(started.message);
  const tunnel = await started.complete(await answered);
  const caller = createCaller(createChannel(tunnel, wire));
  cleanups.push(async () => caller.close());
  return Object.assign(caller, { handshakeHash: toHex(tunnel.handshakeHash) });
}

/** Health over the plain port, which is where a phone with no key yet would read it. */
async function plainHealth(port: number): Promise<Record<string, unknown>> {
  const response = await fetch(`http://127.0.0.1:${port}/v1/health`);
  return (await response.json()) as Record<string, unknown>;
}

const json = (response: ResponseOutput) =>
  JSON.parse(text(response.body)) as Record<string, unknown>;
const JSON_HEADERS = { "content-type": "application/json" };
const KEY_SHAPE = /^[A-Za-z0-9_-]{43}$/;

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

describe("the tunnel door", () => {
  it("is named by health, which carries the key with no relay to name", async () => {
    const { ws, port } = await listening();
    const health = await plainHealth(port);
    expect(health["tunnel"]).toEqual({ path: "/v1/tunnel" });
    const key = await ws.gateway.deps.relay.publicKey();
    expect(key).toMatch(KEY_SHAPE);
    expect(health["relay"]).toEqual({ status: "off", url: null, key, why: null });
  });

  it("lets a phone pair, sign, open a socket and post a message, all through the door", async () => {
    const { ws, port, door } = await listening();
    const key = (await plainHealth(port))["relay"] as { key: string };
    const phone = await phoneAtDoor(port, key.key);
    expect(door.sessions()).toBe(1);

    // The same health the port answers a stranger, now inside the tunnel (SEC-28).
    const health = await phone.fetch({ method: "GET", target: "/v1/health" });
    expect(health.status).toBe(200);
    expect(json(health)["relay"]).toEqual({ status: "off" });

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
          text: "from the sofa",
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
    expect((posted["event"] as { text: string }).text).toBe("from the sofa");

    // The device withdrawn: the tunnelled session ends the way a port's would (ADR 0034).
    const closed = closeOf(socket);
    expect(ws.gateway.deps.sessions.closeDevice(deviceId)).toBe(1);
    expect(await closed).toEqual([4001, "device_revoked"]);

    // The phone gone, the door counts it out.
    phone.close();
    await expect.poll(() => door.sessions()).toBe(0);
  });

  it("holds a signed request to the tunnel it was made in, so a capture replays nowhere (ADR 0191, decision 6)", async () => {
    const { ws, port } = await listening();
    const key = ((await plainHealth(port))["relay"] as { key: string }).key;
    const phone = await phoneAtDoor(port, key);
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
    const other = await phoneAtDoor(port, key);
    expect(other.handshakeHash).not.toBe(phone.handshakeHash);
    expect((await other.fetch({ method: "GET", target, headers: bound })).status).toBe(401);
    expect((await fetch(`http://127.0.0.1:${port}${target}`, { headers: bound })).status).toBe(401);

    // The four-line shape inside a tunnel is refused, in either tunnel, and from a device that has
    // never signed five as well (since 25 October 2026); the plain port still takes it.
    const unbound = device.sign(deviceId, "GET", target);
    expect((await other.fetch({ method: "GET", target, headers: unbound })).status).toBe(401);
    expect((await phone.fetch({ method: "GET", target, headers: unbound })).status).toBe(401);
    expect((await fetch(`http://127.0.0.1:${port}${target}`, { headers: unbound })).status).toBe(
      200,
    );
    const old = ws.arjun.sign("GET", target, "");
    expect((await other.fetch({ method: "GET", target, headers: old })).status).toBe(401);
  });

  it("closes on a handshake against another server's key, and on a frame that is not a tunnel's", async () => {
    const { port, door } = await listening();

    // A phone holding some other server's key learns nothing, not even health.
    const stranger = await socketAtDoor(port);
    const heard: unknown[] = [];
    stranger.on("message", (data) => heard.push(data));
    const closed = new Promise<[number, string]>((resolve) => {
      stranger.once("close", (code, reason) => resolve([code, reason.toString()]));
    });
    const other = await generateKeyPair();
    const started = await initiateHandshake(other.publicKey);
    stranger.send(started.message);
    expect(await closed).toEqual([1000, "done"]);
    expect(heard).toEqual([]);
    expect(door.sessions()).toBe(0);

    // A text frame is nobody's tunnel.
    const chatty = await socketAtDoor(port);
    const shut = new Promise<[number, string]>((resolve) => {
      chatty.once("close", (code, reason) => resolve([code, reason.toString()]));
    });
    chatty.send("hello?");
    expect(await shut).toEqual([1003, "binary_only"]);
  });

  it("limits the pairing door by the socket's own address, as the port does", async () => {
    const { ws, port } = await listening();
    const guesser = await phoneAtDoor(port, await ws.gateway.deps.relay.publicKey());
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
  });

  it("takes a device's ask to join from the door, since the door is on this network", async () => {
    const { ws, port } = await listening();
    const phone = await phoneAtDoor(port, await ws.gateway.deps.relay.publicKey());
    const asked = await phone.fetch({
      method: "POST",
      target: "/v1/join",
      headers: JSON_HEADERS,
      body: utf8(
        JSON.stringify({ kind: "device", name: "Pixel 9", public_key: deviceKey().publicKey }),
      ),
    });
    expect(asked.status).toBe(201);
    expect(json(asked)["code"]).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);

    // The owner sees it asked from the socket's address, and told the address it dialled.
    const seen = await phone.fetch({
      method: "GET",
      target: "/v1/join",
      headers: ws.arjun.sign("GET", "/v1/join", "", phone.handshakeHash),
    });
    expect(seen.status).toBe(200);
    expect(json(seen)["requests"]).toEqual([
      expect.objectContaining({
        kind: "device",
        from_addr: "127.0.0.1",
        url: `http://127.0.0.1:${port}`,
      }),
    ]);
  });
});
