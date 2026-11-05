/**
 * The relay on a real port, with a real server end and a real phone end from `@chipschat/tunnel`
 * over Node's own WebSocket: a Noise handshake crosses it, a request and a socket cross the
 * tunnel, and the capture of every byte the relay forwarded holds no plaintext. A relay with a
 * list turns other servers away, a message bigger than any peer of the relay's sends closes its
 * socket, and the log at info says how many and never which.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "@chipschat/platform";
import { PUSH_WORDS } from "@chipschat/protocol";
import {
  connectThroughRelay,
  createAnswerer,
  createCaller,
  createChannel,
  generateKeyPair,
  initiateHandshake,
  type RelaySession,
  respondHandshake,
  serveThroughRelay,
  text,
  toBase64url,
  utf8,
} from "@chipschat/tunnel";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket as NodeSocket } from "ws";
import { addressOf, pathOf, type RunningRelay, startRelay } from "./server.js";

const logger = createLogger({ level: "silent", name: "relay-test" });
const running: RunningRelay[] = [];

afterEach(async () => {
  for (const relay of running.splice(0)) await relay.close();
});

async function relayOnAnyPort(options: Partial<Parameters<typeof startRelay>[0]> = {}) {
  const relay = await startRelay({ host: "127.0.0.1", port: 0, logger, ...options });
  running.push(relay);
  return relay;
}

/** The server's side of a session: the handshake answered, then requests and sockets served. */
function answerSessions(key: Awaited<ReturnType<typeof generateKeyPair>>, seen: string[]) {
  return (session: RelaySession) => {
    session.wire.onmessage = (first) => {
      void respondHandshake(key, first).then(({ message, tunnel }) => {
        session.wire.send(message);
        const channel = createChannel(tunnel, session.wire);
        createAnswerer(channel, {
          request: async (input) => {
            seen.push(`${input.method} ${input.target} ${text(input.body ?? new Uint8Array())}`);
            return {
              status: 201,
              headers: { "content-type": "application/json" },
              body: utf8(`{"from":"${session.from}"}`),
            };
          },
          socket: async (_target, peer) => {
            peer.onmessage = (message) => peer.send(`echo ${message}`);
            return { ok: true };
          },
        });
      });
    };
  };
}

describe("chips-relay", () => {
  it("puts a phone through to its server, and sees nothing but ciphertext on the way", async () => {
    const captured: Uint8Array[] = [];
    const relay = await relayOnAnyPort({
      tap: (_direction, data) => captured.push(new Uint8Array(data)),
    });
    const key = await generateKeyPair();
    const seen: string[] = [];
    const link = await serveThroughRelay({
      url: relay.url,
      key,
      onOpen: answerSessions(key, seen),
    });
    expect(link.sessionLimit).toBe(32);
    // Health says it is alive and which release, and how many it carries only on the box itself:
    // a request Caddy forwarded is told nothing more (SEC-28).
    const health = async (headers: Record<string, string> = {}) =>
      (await fetch(`http://127.0.0.1:${relay.port}/health`, { headers })).json();
    expect(await health()).toEqual({
      status: "ok",
      name: "chips-relay",
      version: "0.0.0",
      pushes: "no_access_token",
      servers: 1,
      sessions: 0,
    });
    expect(await health({ "x-forwarded-for": "203.0.113.9" })).toEqual({
      status: "ok",
      name: "chips-relay",
      version: "0.0.0",
      pushes: "no_access_token",
    });

    const phone = await connectThroughRelay({
      url: relay.url,
      serverKey: toBase64url(key.publicKey),
    });
    const started = await initiateHandshake(key.publicKey);
    const answered = new Promise<Uint8Array>((resolve) => {
      phone.wire.onmessage = resolve;
    });
    phone.wire.send(started.message);
    const tunnel = await started.complete(await answered);
    const caller = createCaller(createChannel(tunnel, phone.wire));

    const secret = "the words of a message nobody at the relay may read";
    const response = await caller.fetch({
      method: "POST",
      target: "/v1/pair",
      body: utf8(`{"code":"ABC-234","text":"${secret}"}`),
    });
    expect(response.status).toBe(201);
    expect(JSON.parse(text(response.body))).toEqual({ from: "127.0.0.1" });
    expect(seen).toEqual([`POST /v1/pair {"code":"ABC-234","text":"${secret}"}`]);

    const socket = caller.open("/v1/ws?ticket=t");
    await new Promise<void>((resolve) => {
      socket.onopen = resolve;
    });
    const echoed = new Promise<string>((resolve) => {
      socket.onmessage = resolve;
    });
    socket.send(`{"frame":"hello","secret":"${secret}"}`);
    expect(await echoed).toBe(`echo {"frame":"hello","secret":"${secret}"}`);
    expect(relay.stats()).toEqual({ servers: 1, sessions: 1 });

    // The capture: every byte the relay moved, in both directions, and none of it is ours.
    expect(captured.length).toBeGreaterThan(4);
    const everything = captured.map((each) => Buffer.from(each).toString("latin1")).join("\n");
    for (const word of [secret, "/v1/pair", "ABC-234", "hello", "ticket", "content-type", '"t":']) {
      expect(everything, word).not.toContain(word);
    }

    caller.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(relay.stats()).toEqual({ servers: 1, sessions: 0 });
    link.close();
  });

  it("tells a phone when nobody holds the key, and tells it when its server goes", async () => {
    const relay = await relayOnAnyPort();
    await expect(
      connectThroughRelay({ url: relay.url, serverKey: "n".repeat(43) }),
    ).rejects.toMatchObject({
      code: "no_such_server",
    });
    // Bytes behind the ask, as a phone sends its handshake (ADR 0253), go nowhere with it.
    await expect(
      connectThroughRelay({
        url: relay.url,
        serverKey: "n".repeat(43),
        first: Promise.resolve(new Uint8Array(48)),
      }),
    ).rejects.toMatchObject({ code: "no_such_server" });
    expect(relay.stats()).toEqual({ servers: 0, sessions: 0 });

    const key = await generateKeyPair();
    const link = await serveThroughRelay({ url: relay.url, key, onOpen: () => undefined });
    const phone = await connectThroughRelay({
      url: relay.url,
      serverKey: toBase64url(key.publicKey),
    });
    const closed = new Promise<string>((resolve) => {
      phone.wire.onclose = resolve;
    });
    link.close();
    expect(await closed).toBe("server_gone");
  });

  it("lists the newest proof of a key, and lets the old socket go without unlisting it", async () => {
    const relay = await relayOnAnyPort();
    const key = await generateKeyPair();
    const first = await serveThroughRelay({ url: relay.url, key, onOpen: () => undefined });
    const firstGone = new Promise<string>((resolve) => {
      first.onclose = resolve;
    });
    const second = await serveThroughRelay({ url: relay.url, key, onOpen: () => undefined });
    expect(await firstGone).toBe("replaced");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(relay.stats().servers).toBe(1);
    const phone = await connectThroughRelay({
      url: relay.url,
      serverKey: toBase64url(key.publicKey),
    });
    expect(phone.session).toMatch(/^[0-9a-f]{32}$/);
    second.close();
  });

  it("answers health, refuses other paths, and closes a socket that never finishes its first exchange", async () => {
    const relay = await relayOnAnyPort({ handshakeTimeoutMs: 30 });
    expect((await fetch(`http://127.0.0.1:${relay.port}/nothing`)).status).toBe(404);
    const upgrade = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`${relay.url}/v1/other`);
      ws.onerror = () => resolve(-1);
      ws.onclose = (event) => resolve(event.code);
    });
    expect(upgrade).not.toBe(1000);

    const silent = await new Promise<{ code: number; reason: string }>((resolve) => {
      const ws = new WebSocket(`${relay.url}/v1/connect`);
      ws.onclose = (event) => resolve({ code: event.code, reason: event.reason });
    });
    expect(silent).toEqual({ code: 1008, reason: "handshake_timeout" });
  });

  it("answers a target no URL can be read from with a 400, at either handler, and keeps serving (SEC-41)", async () => {
    const relay = await relayOnAnyPort();
    // `fetch` would tidy `//` away; a plain request sends it as written.
    const asked = (path: string) =>
      new Promise<number>((resolve, reject) => {
        httpRequest({ host: "127.0.0.1", port: relay.port, path }, (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        })
          .on("error", reject)
          .end();
      });
    expect(await asked("//")).toBe(400);
    expect(await asked("///")).toBe(400);
    const upgrade = await new Promise<number>((resolve) => {
      const ws = new NodeSocket(`${relay.url}//`);
      ws.on("unexpected-response", (_request, response) => resolve(response.statusCode ?? 0));
      ws.on("error", () => resolve(-1));
    });
    expect(upgrade).toBe(400);
    expect((await fetch(`http://127.0.0.1:${relay.port}/health`)).status).toBe(200);
    // A query is no part of the path: the pages a link opens are served whatever follows them.
    expect((await fetch(`http://127.0.0.1:${relay.port}/join?from=messages`)).status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${relay.port}/pair?from=messages`)).status).toBe(200);
  });

  it("reads a request's path, and nothing from a target no URL can be read from", () => {
    expect(pathOf("/join?from=messages")).toBe("/join");
    expect(pathOf(undefined)).toBe("/");
    expect(pathOf("//")).toBeUndefined();
    expect(pathOf("///")).toBeUndefined();
  });

  it("serves the invite page and the app's association file beside its doors (ADR 0207)", async () => {
    const relay = await relayOnAnyPort();
    const page = await fetch(`http://127.0.0.1:${relay.port}/join`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(page.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(await page.text()).toContain("Open in Chips");
    const head = await fetch(`http://127.0.0.1:${relay.port}/join`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    const association = await fetch(
      `http://127.0.0.1:${relay.port}/.well-known/apple-app-site-association`,
    );
    expect(association.headers.get("content-type")).toBe("application/json");
    expect(await association.json()).toMatchObject({
      applinks: { details: [{ appIDs: [expect.any(String)] }] },
    });
    const posted = await fetch(`http://127.0.0.1:${relay.port}/join`, { method: "POST" });
    expect(posted.status).toBe(404);
  });

  it("turns away a server whose key is not on its list, and lists one whose key is", async () => {
    const mine = await generateKeyPair();
    const stranger = await generateKeyPair();
    const relay = await relayOnAnyPort({ allowKeys: [toBase64url(mine.publicKey)] });
    await expect(
      serveThroughRelay({ url: relay.url, key: stranger, onOpen: () => undefined }),
    ).rejects.toMatchObject({ code: "not_allowed" });
    const link = await serveThroughRelay({ url: relay.url, key: mine, onOpen: () => undefined });
    expect(relay.stats().servers).toBe(1);
    link.close();
  });

  it("closes a socket that sends a message bigger than any peer of the relay's would", async () => {
    const relay = await relayOnAnyPort({ maxMessageBytes: 1024 });
    const closed = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`${relay.url}/v1/connect`);
      ws.onopen = () => ws.send(new Uint8Array(4096));
      ws.onclose = (event) => resolve(event.code);
    });
    expect(closed).toBe(1009);
  });

  it("stops reading a server while its phone is not reading, and delivers every byte after", async () => {
    const relay = await relayOnAnyPort({
      flow: { pauseAt: 64 * 1024, resumeAt: 16 * 1024, dropAt: 256 * 1024 * 1024 },
    });
    const key = await generateKeyPair();
    let serverSocket: WebSocket | undefined;
    const opened = new Promise<RelaySession>((resolve) => {
      void serveThroughRelay({
        url: relay.url,
        key,
        socket: (url) => {
          serverSocket = new WebSocket(url);
          return serverSocket as never;
        },
        onOpen: resolve,
      });
    });
    await expect.poll(() => relay.stats().servers).toBe(1);

    // A phone that asks for the server and then stops reading, as a phone in a tunnel does.
    const phone = new NodeSocket(`${relay.url}/v1/connect`);
    let received = 0;
    const through = new Promise<void>((resolve) => {
      phone.on("message", (data, isBinary) => {
        if (isBinary) received += (data as Buffer).length;
        else if (String(data).includes('"connected"')) resolve();
      });
    });
    phone.on("open", () =>
      phone.send(
        JSON.stringify({ frame: "connect", v: 1, key: toBase64url(key.publicKey), candidates: [] }),
      ),
    );
    await through;
    const session = await opened;
    phone.pause();

    const chunk = new Uint8Array(32 * 1024).fill(7);
    const chunks = 400;
    for (let i = 0; i < chunks; i += 1) session.wire.send(chunk);
    // Given time to drain, it does not: the relay has stopped reading the server, so most of
    // what the server sent is still waiting on the server's side and not in the relay.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(serverSocket?.bufferedAmount ?? 0).toBeGreaterThan((chunk.length * chunks) / 2);
    expect(relay.stats().sessions).toBe(1);

    phone.resume();
    await expect.poll(() => received, { timeout: 10_000 }).toBe(chunk.length * chunks);
    phone.close();
  });

  it("logs how many servers and sessions there are at info, and never which", async () => {
    const lines: Record<string, unknown>[] = [];
    const counting = createLogger({
      level: "info",
      name: "relay-test",
      destination: { write: (line: string) => lines.push(JSON.parse(line)) },
    });
    const relay = await relayOnAnyPort({ logger: counting, countsEveryMs: 10 });
    const key = await generateKeyPair();
    const serverKey = toBase64url(key.publicKey);
    const link = await serveThroughRelay({ url: relay.url, key, onOpen: () => undefined });
    const phone = await connectThroughRelay({ url: relay.url, serverKey });
    await expect
      .poll(() => lines.filter((line) => line["msg"] === "relay counts").at(-1))
      .toMatchObject({ servers: 1, sessions: 1 });
    phone.wire.close();
    link.close();
    const said = JSON.stringify(lines);
    expect(said).not.toContain(serverKey);
    expect(said).not.toContain(phone.session);
  });

  it("writes the day's counts to its file when it stops: how many, and never which", async () => {
    const dir = mkdtempSync(join(tmpdir(), "chips-relay-counts-"));
    const countsFile = join(dir, "counts.jsonl");
    try {
      const relay = await startRelay({ host: "127.0.0.1", port: 0, logger, countsFile });
      const key = await generateKeyPair();
      const serverKey = toBase64url(key.publicKey);
      const seen: string[] = [];
      const link = await serveThroughRelay({
        url: relay.url,
        key,
        onOpen: answerSessions(key, seen),
      });
      const phone = await connectThroughRelay({ url: relay.url, serverKey });
      const started = await initiateHandshake(key.publicKey);
      const answered = new Promise<Uint8Array>((resolve) => {
        phone.wire.onmessage = resolve;
      });
      phone.wire.send(started.message);
      const caller = createCaller(
        createChannel(await started.complete(await answered), phone.wire),
      );
      expect((await caller.fetch({ method: "GET", target: "/v1/health" })).status).toBe(201);
      caller.close();
      link.close();
      await relay.close();

      const lines = readFileSync(countsFile, "utf8").trim().split("\n");
      expect(lines).toHaveLength(1);
      const day = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
      expect(day).toMatchObject({ servers: 1, reached: 1, sessions: 1, peak_sessions: 1 });
      expect(day["bytes_to_servers"]).toBeGreaterThan(0);
      expect(day["bytes_to_phones"]).toBeGreaterThan(0);
      expect(lines[0]).not.toContain(serverKey);
      expect(lines[0]).not.toContain(phone.session);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("takes a phone's address from the proxy in front only when the connection is local", () => {
    const request = (remote: string, forwarded?: string | string[]) =>
      ({
        socket: { remoteAddress: remote },
        headers: forwarded === undefined ? {} : { "x-forwarded-for": forwarded },
      }) as never;
    // The proxy's own entry is the last; the ones before it are whatever the phone sent.
    expect(addressOf(request("127.0.0.1", "10.0.0.1, 203.0.113.5"))).toBe("203.0.113.5");
    expect(addressOf(request("::1", "203.0.113.5"))).toBe("203.0.113.5");
    expect(addressOf(request("::ffff:127.0.0.1", " 2001:db8::7 "))).toBe("2001:db8::7");
    expect(addressOf(request("127.0.0.1", ["10.0.0.1", "10.0.0.2, 203.0.113.6"]))).toBe(
      "203.0.113.6",
    );
    expect(addressOf(request("198.51.100.7", "203.0.113.5"))).toBe("198.51.100.7");
    expect(addressOf(request("127.0.0.1"))).toBe("127.0.0.1");
    expect(addressOf(request("127.0.0.1", ""))).toBe("127.0.0.1");
    // An empty last entry is the socket's, not the entry before it.
    expect(addressOf(request("127.0.0.1", "203.0.113.5, "))).toBe("127.0.0.1");
  });

  it("does not believe an address a phone put ahead of the one a proxy appended", () => {
    // Behind Cloudflare or nginx, which append: the phone sent `X-Forwarded-For: 192.0.2.1`,
    // hoping to be counted as a fresh address on every tunnel.
    const forged = {
      socket: { remoteAddress: "127.0.0.1" },
      headers: { "x-forwarded-for": "192.0.2.1, 198.51.100.23" },
    } as never;
    expect(addressOf(forged)).toBe("198.51.100.23");
  });
});

describe("the push door (ADR 0246)", () => {
  const TOKEN = "ExponentPushToken[abcdefghijklmnopqrstuv]";
  const pushes = (count: number) =>
    JSON.stringify(Array.from({ length: count }, () => ({ to: TOKEN, ...PUSH_WORDS.message })));
  const JSON_TYPE = { "content-type": "application/json" };
  /** Expo, standing in: a ticket for each push, and the token each request carried. */
  const expo = () => {
    const tokens: (string | null)[] = [];
    const fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      tokens.push(new Headers(init?.headers).get("authorization"));
      const sent = JSON.parse(String(init?.body)) as unknown[];
      return Response.json({ data: sent.map(() => ({ status: "ok", id: "t" })) });
    }) as unknown as typeof globalThis.fetch;
    return { fetch, tokens };
  };

  it("sends a server's pushes on with the app's token, and counts them in the day", async () => {
    const dir = mkdtempSync(join(tmpdir(), "chips-relay-push-"));
    try {
      const countsFile = join(dir, "counts.jsonl");
      const upstream = expo();
      const relay = await relayOnAnyPort({
        countsFile,
        push: {
          accessToken: "app-token",
          upstream: "https://expo.example/send",
          fetch: upstream.fetch,
        },
      });
      const response = await fetch(`http://127.0.0.1:${relay.port}/v1/push`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: pushes(2),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        data: [
          { status: "ok", id: "t" },
          { status: "ok", id: "t" },
        ],
      });
      expect(upstream.tokens).toEqual(["Bearer app-token"]);
      await relay.close();
      const day = JSON.parse(readFileSync(countsFile, "utf8").trim()) as Record<string, unknown>;
      expect(day["pushes"]).toBe(2);
      expect(readFileSync(countsFile, "utf8")).not.toContain(TOKEN);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a body bigger than a hundred pushes hold", async () => {
    const relay = await relayOnAnyPort({
      push: {
        accessToken: "app-token",
        upstream: "https://expo.example/send",
        fetch: expo().fetch,
      },
    });
    const response = await fetch(`http://127.0.0.1:${relay.port}/v1/push`, {
      method: "POST",
      headers: JSON_TYPE,
      body: "x".repeat(600 * 1024),
    });
    expect(response.status).toBe(413);
  });

  it("takes pushes only as a server sends them, never as a page can be made to", async () => {
    const upstream = expo();
    const relay = await relayOnAnyPort({
      push: {
        accessToken: "app-token",
        upstream: "https://expo.example/send",
        fetch: upstream.fetch,
      },
    });
    const asked = [
      // A form or a `no-cors` fetch from any page: plain text, no preflight.
      { "content-type": "text/plain" },
      {},
      // JSON from a page says the page's origin.
      { ...JSON_TYPE, origin: "https://somewhere.example" },
    ];
    for (const headers of asked) {
      const response = await fetch(`http://127.0.0.1:${relay.port}/v1/push`, {
        method: "POST",
        headers,
        body: pushes(1),
      });
      expect(response.status, JSON.stringify(headers)).toBe(403);
    }
    expect(upstream.tokens).toEqual([]);
  });

  it("says on its health, to anybody, whether Expo took the pushes it was last given", async () => {
    let status = 403;
    const upstream = (async (_url: string | URL | Request, init?: RequestInit) => {
      if (status !== 200) return new Response("no", { status });
      const sent = JSON.parse(String(init?.body)) as unknown[];
      return Response.json({ data: sent.map(() => ({ status: "ok", id: "t" })) });
    }) as unknown as typeof globalThis.fetch;
    const relay = await relayOnAnyPort({
      push: { accessToken: "app-token", upstream: "https://expo.example/send", fetch: upstream },
    });
    const pushesNow = async () =>
      (
        (await (
          await fetch(`http://127.0.0.1:${relay.port}/health`, {
            headers: { "x-forwarded-for": "203.0.113.9" },
          })
        ).json()) as { pushes?: unknown }
      ).pushes;
    const send = () =>
      fetch(`http://127.0.0.1:${relay.port}/v1/push`, {
        method: "POST",
        headers: JSON_TYPE,
        body: pushes(1),
      });
    expect(await pushesNow()).toBe("ready");
    expect((await send()).status).toBe(503);
    expect(await pushesNow()).toBe("refused");
    status = 200;
    expect((await send()).status).toBe(200);
    expect(await pushesNow()).toBe("ready");
  });

  it("asks Expo for receipts as a server asks, and never as a page can be made to", async () => {
    const asked: string[] = [];
    const upstream = (async (url: string | URL | Request) => {
      asked.push(String(url));
      return Response.json({ data: { "aaaa-1": { status: "ok" } } });
    }) as unknown as typeof globalThis.fetch;
    const relay = await relayOnAnyPort({
      push: { accessToken: "app-token", upstream: "https://expo.example/send", fetch: upstream },
    });
    const receipts = (headers: Record<string, string>) =>
      fetch(`http://127.0.0.1:${relay.port}/v1/push/receipts`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ids: ["aaaa-1"] }),
      });
    expect((await receipts({ "content-type": "text/plain" })).status).toBe(403);
    expect((await receipts({ ...JSON_TYPE, origin: "https://somewhere.example" })).status).toBe(
      403,
    );
    expect(asked).toEqual([]);
    const response = await receipts(JSON_TYPE);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { "aaaa-1": { status: "ok" } } });
    expect(asked).toEqual(["https://expo.example/getReceipts"]);
    await relay.close();
  });

  it("has no push door without the app's token", async () => {
    const relay = await relayOnAnyPort();
    const response = await fetch(`http://127.0.0.1:${relay.port}/v1/push`, {
      method: "POST",
      body: pushes(1),
    });
    expect(response.status).toBe(404);
  });
});
