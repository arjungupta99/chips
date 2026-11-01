/**
 * The gateway over a real socket, on a real port.
 *
 * `session.test.ts` drives the rules through a fake socket, which is where they belong. This
 * file exists to prove the adapter around them is wired correctly: that the upgrade
 * authenticates, that a token in a query parameter works for a browser that cannot set headers,
 * and that frames survive the trip both ways.
 */

import { createLogger, defaultConfig } from "@chipschat/platform";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { Gateway } from "../../gateway.js";
import { createTestWorkspace, type TestWorkspace } from "../../testing/workspace.js";

let ws: TestWorkspace;
let gateway: Gateway;
let port: number;
let close: (() => Promise<void>) | undefined;
/** What the server warned about, line by line. */
let warned: string[];

beforeEach(async () => {
  warned = [];
  const logger = createLogger({
    level: "warn",
    destination: {
      write: (line: string) =>
        void warned.push(String((JSON.parse(line) as { msg?: unknown }).msg)),
    },
  });
  ws = await createTestWorkspace({ logger });
  gateway = ws.gateway;
  const listening = await gateway.listen();
  port = listening.port;
  close = undefined;
});

afterEach(async () => {
  await close?.();
  await ws.close();
});

/** Open a socket and collect every frame it receives. */
function connect(query: string): {
  socket: WebSocket;
  frames: Record<string, unknown>[];
  open: Promise<void>;
  /** Resolve once a frame matching the predicate has arrived. */
  waitFor: (
    match: (frame: Record<string, unknown>) => boolean,
    what: string,
  ) => Promise<Record<string, unknown>>;
} {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/v1/ws?${query}`);
  const frames: Record<string, unknown>[] = [];
  const waiters: {
    match: (f: Record<string, unknown>) => boolean;
    resolve: (f: Record<string, unknown>) => void;
  }[] = [];

  socket.on("message", (data) => {
    const frame = JSON.parse(data.toString()) as Record<string, unknown>;
    frames.push(frame);
    for (const waiter of [...waiters]) {
      if (waiter.match(frame)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(frame);
      }
    }
  });

  const open = new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });

  return {
    socket,
    frames,
    open,
    waitFor: (match, what) =>
      new Promise((resolve, reject) => {
        const existing = frames.find(match);
        if (existing !== undefined) return resolve(existing);
        const timer = setTimeout(() => reject(new Error(`timed out waiting for ${what}`)), 5000);
        waiters.push({
          match,
          resolve: (frame) => {
            clearTimeout(timer);
            resolve(frame);
          },
        });
      }),
  };
}

const HELLO = JSON.stringify({
  frame: "hello",
  protocol: { min: 1, max: 1 },
  client: { name: "scout", version: "0.1.0" },
});

describe("the socket endpoint", () => {
  it("refuses an upgrade with no credential", async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/v1/ws`);
    const error = await new Promise<Error>((resolve) => socket.once("error", resolve));
    expect(error.message).toContain("401");
  });

  it("still takes a token in the query this release, and says it is deprecated (SEC-22)", async () => {
    const client = connect(`token=${encodeURIComponent(ws.scout.token)}`);
    close = async () => client.socket.close();
    await client.open;

    client.socket.send(HELLO);
    const hello = await client.waitFor(
      (frame) => (frame["event"] as Record<string, unknown> | undefined)?.["type"] === "hello",
      "hello",
    );
    expect((hello["event"] as Record<string, unknown>)["server"]).toMatchObject({ name: "chipsd" });
    const deprecations = () => warned.filter((line) => line.includes("(?token=) is deprecated"));
    expect(deprecations()).toHaveLength(1);

    // The header is the way, and says nothing.
    const headed = new WebSocket(`ws://127.0.0.1:${port}/v1/ws`, {
      headers: { authorization: `Bearer ${ws.scout.token}` },
    });
    await new Promise<void>((resolve, reject) => {
      headed.once("open", () => resolve());
      headed.once("error", reject);
    });
    headed.close();
    expect(deprecations()).toHaveLength(1);
  });

  it("carries an approval decision from one surface to the harness on another", async () => {
    const client = connect(`token=${encodeURIComponent(ws.scout.token)}`);
    close = async () => client.socket.close();
    await client.open;

    client.socket.send(HELLO);
    await client.waitFor(
      (frame) => (frame["event"] as Record<string, unknown> | undefined)?.["type"] === "hello",
      "hello",
    );
    client.socket.send(JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }));

    const runId = ws.ids.next("run");
    const approvalId = ws.ids.next("approval");

    client.socket.send(
      JSON.stringify({
        frame: "event",
        event: {
          type: "run.started",
          space_id: ws.spaceId,
          run_id: runId,
          goal: "Confirm PO #4471",
          plan: [],
          idempotency_key: "e2e-run",
        },
      }),
    );
    const ack = await client.waitFor((frame) => frame["frame"] === "ack", "an ack");
    expect(ack).toMatchObject({ idempotency_key: "e2e-run", duplicate: false });

    client.socket.send(
      JSON.stringify({
        frame: "event",
        event: {
          type: "approval.request",
          space_id: ws.spaceId,
          run_id: runId,
          approval_id: approvalId,
          action: { kind: "email.send", external: true },
          risk: ["external_communication"],
          expires_in: 3600,
          idempotency_key: "e2e-ask",
        },
      }),
    );
    await client.waitFor(
      (frame) => frame["frame"] === "ack" && frame["idempotency_key"] === "e2e-ask",
      "the approval ack",
    );

    // Arjun answers over HTTP, from a different surface entirely.
    const path = `/v1/runs/${runId}/events`;
    const body = {
      type: "approval.resolved",
      space_id: ws.spaceId,
      approval_id: approvalId,
      decision: "approved",
      scope: "once",
      resolved_by: ws.arjun.participantId,
      resolved_at: new Date().toISOString(),
      idempotency_key: "e2e-approve",
    };
    const raw = JSON.stringify(body);
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...ws.arjun.sign("POST", path, raw),
      },
      body: raw,
    });
    expect(response.status).toBe(201);

    const resolved = await client.waitFor(
      (frame) =>
        (frame["event"] as Record<string, unknown> | undefined)?.["type"] === "approval.resolved",
      "the decision",
    );
    expect(resolved["event"]).toMatchObject({
      approval_id: approvalId,
      decision: "approved",
      resolved_by: ws.arjun.participantId,
    });
  });

  it("tells a harness live of a room a person asked it for, before it is in it", async () => {
    const arjun = {
      kind: "person" as const,
      participantId: ws.arjun.participantId,
      workspaceId: ws.workspaceId,
      displayName: "Arjun",
      via: "device_key" as const,
      role: "owner" as const,
    };
    await gateway.deps.declareCapabilities({
      principal: arjun,
      harnessId: ws.scout.participantId,
      capabilities: ["new_spaces"],
    });
    const client = connect(`token=${encodeURIComponent(ws.scout.token)}`);
    close = async () => client.socket.close();
    await client.open;
    client.socket.send(HELLO);
    await client.waitFor(
      (frame) => (frame["event"] as Record<string, unknown> | undefined)?.["type"] === "hello",
      "hello",
    );
    // From the start, so the first replayed frame says the subscription is live: it is taken
    // before the replay begins, and what follows goes the live way, which is what is tested.
    client.socket.send(
      JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId, since: 0 }),
    );
    await client.waitFor(
      (frame) =>
        (frame["event"] as Record<string, unknown> | undefined)?.["type"] === "person.joined",
      "the replay",
    );

    // The phone's first send: the room asking Scout, Scout in it, and the words.
    const spaceId = ws.ids.next("space");
    const events = [
      { type: "space.created", kind: "direct", asked_of: ws.scout.participantId },
      {
        type: "membership.added",
        participant_id: ws.scout.participantId,
        participant_kind: "harness",
        role: "member",
      },
      { type: "message.post", text: "Plan the kitchen remodel." },
    ];
    for (const [index, event] of events.entries()) {
      const sent = await gateway.deps.submitEvent({
        event: { ...event, space_id: spaceId, idempotency_key: `asked-${index}` },
        principal: arjun,
      });
      expect(sent.ok).toBe(true);
    }

    const asked = await client.waitFor(
      (frame) =>
        (frame["event"] as Record<string, unknown> | undefined)?.["type"] === "space.created" &&
        (frame["event"] as Record<string, unknown>)["space_id"] === spaceId,
      "the room asked of it",
    );
    expect(asked["event"]).toMatchObject({ space_id: spaceId, asked_of: ws.scout.participantId });
    const words = await client.waitFor(
      (frame) =>
        (frame["event"] as Record<string, unknown> | undefined)?.["type"] === "message.new" &&
        (frame["event"] as Record<string, unknown>)["space_id"] === spaceId,
      "the first message",
    );
    expect(words["event"]).toMatchObject({ space_id: spaceId, text: "Plan the kitchen remodel." });
  });

  it("gives a harness on this machine its files at the address its socket used, and one through a proxy the public address", async () => {
    const PUBLIC = "https://mini.tail0000.ts.net";
    const at = await createTestWorkspace({ config: { server: { publicUrl: PUBLIC } as never } });
    try {
      const listening = await at.gateway.listen();
      /** Scout's socket, as a harness opens it, and the first file URL it is handed. */
      const harness = async (headers: Record<string, string>) => {
        const socket = new WebSocket(`ws://127.0.0.1:${listening.port}/v1/ws`, {
          headers: { authorization: `Bearer ${at.scout.token}`, ...headers },
        });
        const frames: Record<string, unknown>[] = [];
        socket.on("message", (data) => frames.push(JSON.parse(data.toString())));
        await new Promise<void>((resolve, reject) => {
          socket.once("open", () => resolve());
          socket.once("error", reject);
        });
        const eventOf = (frame: Record<string, unknown>) =>
          frame["event"] as Record<string, unknown> | undefined;
        const until = async <T>(found: () => T | undefined, what: string): Promise<T> => {
          for (let i = 0; i < 500; i += 1) {
            const it = found();
            if (it !== undefined) return it;
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          throw new Error(`timed out waiting for ${what}`);
        };
        socket.send(HELLO);
        await until(() => frames.find((f) => eventOf(f)?.["type"] === "hello"), "hello");
        socket.send(JSON.stringify({ frame: "subscribe", workspace_id: at.workspaceId, since: 0 }));
        await until(() => frames.find((f) => eventOf(f)?.["type"] === "person.joined"), "replay");
        const fileUrl = until(() => {
          const heard = frames.map(eventOf).find((event) => event?.["type"] === "message.new");
          const files = heard?.["attachments"] as Record<string, unknown>[] | undefined;
          return files?.[0]?.["url"] as string | undefined;
        }, "a message with a file");
        return { socket, fileUrl };
      };
      const beside = await harness({});
      const proxied = await harness({ "x-forwarded-for": "100.101.102.103" });

      // Arjun posts a file in the room both sockets are Scout's in.
      const bytes = new TextEncoder().encode("A–E");
      const slotBody = JSON.stringify({ filename: "notes.txt", byte_size: bytes.byteLength });
      const slot = await at.gateway.app.fetch(
        new Request("http://chips.local/v1/uploads", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...at.arjun.sign("POST", "/v1/uploads", slotBody),
          },
          body: slotBody,
        }),
      );
      const { upload_url: target, attachment_id: id } = (await slot.json()) as Record<
        string,
        string
      >;
      const put = await at.gateway.app.fetch(
        new Request(`http://chips.local${target}`, {
          method: "PUT",
          headers: {
            "content-type": "application/octet-stream",
            ...at.arjun.sign("PUT", String(target), bytes),
          },
          body: bytes,
        }),
      );
      expect(put.status).toBe(201);
      const posted = await at.gateway.deps.submitEvent({
        principal: {
          kind: "person",
          participantId: at.arjun.participantId,
          workspaceId: at.workspaceId,
          displayName: "Arjun",
          via: "device_key",
        },
        event: {
          type: "message.post",
          space_id: at.spaceId,
          text: "The notes.",
          upload_ids: [id],
          idempotency_key: "arjun-notes",
        },
      });
      expect(posted.ok).toBe(true);

      expect(await beside.fileUrl).toMatch(
        new RegExp(`^http://127\\.0\\.0\\.1:${listening.port}/v1/attachments/${id}\\?`),
      );
      expect(await proxied.fileUrl).toMatch(new RegExp(`^${PUBLIC}/v1/attachments/${id}\\?`));
      beside.socket.close();
      proxied.socket.close();
    } finally {
      await at.close();
    }
  });

  it("opens a person's socket with a single-use ticket (finding 5)", async () => {
    const ticket = await ws.arjun.socketTicket();
    const client = connect(`ticket=${encodeURIComponent(ticket)}`);
    close = async () => client.socket.close();
    await client.open;

    client.socket.send(HELLO);
    const hello = await client.waitFor(
      (frame) => (frame["event"] as Record<string, unknown> | undefined)?.["type"] === "hello",
      "hello",
    );
    expect((hello["event"] as Record<string, unknown>)["server"]).toMatchObject({ name: "chipsd" });
  });

  it("refuses a spent ticket, so a logged handshake is worthless (finding 5)", async () => {
    const ticket = await ws.arjun.socketTicket();
    const first = connect(`ticket=${encodeURIComponent(ticket)}`);
    await first.open;
    first.socket.close();

    // The same ticket a second time is refused: the upgrade never completes.
    const second = connect(`ticket=${encodeURIComponent(ticket)}`);
    close = async () => second.socket.close();
    await expect(second.open).rejects.toThrow();
  });

  it("no longer opens a socket from a device signature in the URL (finding 5)", async () => {
    // The old form — the durable credential in the URL this finding removed.
    const headers = ws.arjun.sign("GET", "/v1/ws", "");
    const query = new URLSearchParams({
      device: headers["x-chips-device"] ?? "",
      ts: headers["x-chips-timestamp"] ?? "",
      sig: headers["x-chips-signature"] ?? "",
    });
    const client = connect(query.toString());
    close = async () => client.socket.close();
    await expect(client.open).rejects.toThrow();
  });

  it("closes the socket a revoked token is holding, at once (ADR 0023)", async () => {
    const client = connect(`token=${encodeURIComponent(ws.scout.token)}`);
    close = async () => client.socket.close();
    await client.open;
    client.socket.send(HELLO);
    await client.waitFor(
      (frame) => (frame["event"] as Record<string, unknown> | undefined)?.["type"] === "hello",
      "hello",
    );

    const tokens = await gateway.deps.harnessTokens.list({
      principal: {
        kind: "person",
        participantId: ws.arjun.participantId,
        workspaceId: ws.workspaceId,
        displayName: "Arjun",
        via: "device_key",
      },
      harnessId: ws.scout.participantId,
    });
    expect(tokens.ok).toBe(true);
    const tokenId = (tokens as { ok: true; value: { id: string }[] }).value[0]?.id as string;

    const ended = new Promise<number>((resolve) => client.socket.once("close", resolve));
    const revoked = await gateway.deps.harnessTokens.revoke({
      principal: {
        kind: "person",
        participantId: ws.arjun.participantId,
        workspaceId: ws.workspaceId,
        displayName: "Arjun",
        via: "device_key",
      },
      harnessId: ws.scout.participantId,
      tokenId,
    });
    expect(revoked.ok).toBe(true);
    expect((revoked as { ok: true; value: { socketsClosed: number } }).value.socketsClosed).toBe(1);
    expect(await ended).toBe(4001);
  });

  it("closes a person's socket when their device is withdrawn (ADR 0034)", async () => {
    const client = connect(`ticket=${encodeURIComponent(await ws.arjun.socketTicket())}`);
    close = async () => client.socket.close();
    await client.open;
    client.socket.send(
      JSON.stringify({
        frame: "hello",
        protocol: { min: 1, max: 1 },
        client: { name: "test", version: "0" },
      }),
    );
    await client.waitFor((frame) => frame["frame"] === "event", "hello");

    const ended = new Promise<number>((resolve) => client.socket.once("close", resolve));
    const path = `/v1/devices/${ws.arjun.deviceId}`;
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "DELETE",
      headers: ws.arjun.sign("DELETE", path, ""),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ sockets_closed: 1 });
    expect(await ended).toBe(4001);
  });

  it("closes a person's sockets when they are removed, with a close of its own (ADR 0160)", async () => {
    const client = connect(`ticket=${encodeURIComponent(await ws.dana.socketTicket())}`);
    close = async () => client.socket.close();
    await client.open;
    client.socket.send(HELLO);
    await client.waitFor((frame) => frame["frame"] === "event", "hello");

    const ended = new Promise<{ code: number; reason: string }>((resolve) =>
      client.socket.once("close", (code, reason) => resolve({ code, reason: reason.toString() })),
    );
    const path = `/v1/people/${ws.dana.participantId}`;
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "DELETE",
      headers: ws.arjun.sign("DELETE", path, ""),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ sockets_closed: 1 });
    expect(await ended).toEqual({ code: 4003, reason: "person_removed" });

    // And no new one: a ticket is not minted for her, and the refusal says why.
    const ticket = await fetch(`http://127.0.0.1:${port}/v1/socket-tickets`, {
      method: "POST",
      headers: ws.dana.sign("POST", "/v1/socket-tickets", ""),
    });
    expect(ticket.status).toBe(401);
    expect(await ticket.json()).toMatchObject({ error: { refusal: "person_removed" } });
  });

  it("closes a person's sockets when their role changes, and the next opens with the role they have now (JR-9, SEC-26)", async () => {
    const ada = await ws.addPerson("Ada", "admin");
    const client = connect(`ticket=${encodeURIComponent(await ada.socketTicket())}`);
    close = async () => client.socket.close();
    await client.open;
    client.socket.send(HELLO);
    await client.waitFor((frame) => frame["frame"] === "event", "hello");
    const ended = new Promise<{ code: number; reason: string }>((resolve) =>
      client.socket.once("close", (code, reason) => resolve({ code, reason: reason.toString() })),
    );

    // Arjun makes Ada a member, over a socket of his own, while hers is open.
    const owner = connect(`ticket=${encodeURIComponent(await ws.arjun.socketTicket())}`);
    close = async () => {
      owner.socket.close();
      client.socket.close();
    };
    await owner.open;
    owner.socket.send(HELLO);
    await owner.waitFor((frame) => frame["frame"] === "event", "hello");
    owner.socket.send(
      JSON.stringify({
        frame: "event",
        event: {
          type: "role.changed",
          participant_id: ada.participantId,
          role: "member",
          idempotency_key: "jr9-demote",
        },
      }),
    );
    const demoted = await owner.waitFor(
      (frame) => frame["idempotency_key"] === "jr9-demote",
      "the demotion's answer",
    );
    expect(demoted).toMatchObject({ frame: "ack" });

    // Hers ends, with a close of its own; his, which the change did not name, stays open.
    expect(await ended).toEqual({ code: 4005, reason: "role_changed" });
    expect(owner.socket.readyState).toBe(WebSocket.OPEN);

    // Her next socket is a member's, and a member may not hand out roles.
    const again = connect(`ticket=${encodeURIComponent(await ada.socketTicket())}`);
    close = async () => {
      owner.socket.close();
      again.socket.close();
    };
    await again.open;
    again.socket.send(HELLO);
    await again.waitFor((frame) => frame["frame"] === "event", "hello");
    again.socket.send(
      JSON.stringify({
        frame: "event",
        event: {
          type: "role.changed",
          participant_id: ws.dana.participantId,
          role: "admin",
          idempotency_key: "jr9-promote",
        },
      }),
    );
    const answer = await again.waitFor(
      (frame) => frame["idempotency_key"] === "jr9-promote",
      "an answer to the promotion",
    );
    expect(answer).toMatchObject({ frame: "error", code: "forbidden" });
  });

  it("serves health over the same port", async () => {
    const response = await fetch(`http://127.0.0.1:${port}/v1/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok" });
  });
});

describe("the frame cap (SEC-11)", () => {
  it("closes a socket that sends a frame over the body limit, as a request over it is refused", async () => {
    const small = await createTestWorkspace({
      config: { limits: { ...defaultConfig().limits, maxBodyBytes: 1024 } },
    });
    try {
      const listening = await small.gateway.listen();
      const socket = new WebSocket(
        `ws://127.0.0.1:${listening.port}/v1/ws?token=${encodeURIComponent(small.scout.token)}`,
      );
      await new Promise<void>((resolve, reject) => {
        socket.once("open", () => resolve());
        socket.once("error", reject);
      });
      const closed = new Promise<number>((resolve) =>
        socket.once("close", (code) => resolve(code)),
      );
      socket.send(JSON.stringify({ frame: "hello", padding: "x".repeat(2000) }));
      expect(await closed).toBe(1009);
    } finally {
      await small.close();
    }
  });
});
