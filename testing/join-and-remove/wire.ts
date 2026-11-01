/**
 * People on the wire: a person's device played by the test, the way the CLI plays one
 * (`cli/src/device.ts`). An Ed25519 key made here, a device paired with a code or an invite, every
 * request signed with it, and a socket opened with a ticket, as the apps open theirs. So a spec can
 * be the owner, Natalie and a stranger at once, each from an address of their own, and say what the
 * server answered each of them, step by step, while the browsers show what a person meets.
 *
 * Nothing here reaches into the server: what a device can send, the test sends.
 */

import { createHash, generateKeyPairSync, type KeyObject, sign } from "node:crypto";
import { type Frame, freshCode, SERVER, SERVER_PORT } from "../../apps/web/e2e/support.ts";
import { anAddress } from "./support.ts";

/** What the server answered: the status, and the body read as JSON, or nothing. */
export interface Answer {
  readonly status: number;
  // biome-ignore lint/suspicious/noExplicitAny: an answer is read field by field by the spec.
  readonly body: any;
}

/**
 * What a refusal is called, as the apps branch on it: its named `refusal` when it has one
 * (`name_taken`), else its code (`forbidden`, `unauthorized`, `person_removed`…).
 */
export function refusal(answer: Answer): string | undefined {
  const error = answer.body?.error as { code?: string; refusal?: string } | undefined;
  return error?.refusal ?? error?.code;
}

/** A fresh key: the public half as the server takes it, the private half kept here. */
export function newKey(): { readonly publicKey: string; readonly privateKey: KeyObject } {
  const pair = generateKeyPairSync("ed25519");
  return {
    publicKey: pair.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKey: pair.privateKey,
  };
}

/** A request with no device behind it: a stranger's, from an address of its own. */
export async function plain(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  from = anAddress(),
): Promise<Answer> {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const response = await fetch(`${SERVER}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": from },
    ...(raw === "" ? {} : { body: raw }),
  });
  return { status: response.status, body: await response.json().catch(() => undefined) };
}

export interface DeviceOf {
  readonly deviceId: string;
  readonly participantId: string;
  readonly workspaceId: string;
  readonly displayName: string;
}

/** A person's device, paired: it signs what it sends, and opens sockets. */
export class Wire {
  private constructor(
    readonly device: DeviceOf,
    private readonly key: KeyObject,
    /** The address it is somewhere on the internet as: the server counts wrong answers by it. */
    readonly from: string,
  ) {}

  get id(): string {
    return this.device.participantId;
  }

  get name(): string {
    return this.device.displayName;
  }

  /** A device made from a server's answer to a pairing or a redeemed invite. */
  static of(body: Record<string, unknown>, key: KeyObject, from: string): Wire {
    return new Wire(
      {
        deviceId: String(body["device_id"]),
        participantId: String(body["participant_id"]),
        workspaceId: String(body["workspace_id"]),
        displayName: String(body["display_name"]),
      },
      key,
      from,
    );
  }

  /**
   * Pair a new device with a code: the answer, and the device when the server took it. A code a
   * person's device made waits for that person, as an invite does (ADR 0232): they allow it, and
   * the device collects itself, 200. The operator's codes (`freshCode`) let it in at once, 201.
   */
  static async tryPair(code: string, name = "e2e device"): Promise<Answer & { wire?: Wire }> {
    const key = newKey();
    const from = anAddress();
    const answer = await plain("POST", "/v1/pair", { code, public_key: key.publicKey, name }, from);
    if (answer.status === 202) return Wire.collect(answer, Wire.makers.get(code), key, from);
    if (answer.status !== 201) return answer;
    return { ...answer, wire: Wire.of(answer.body, key.privateKey, from) };
  }

  /** Pair with a code that must work. */
  static async pair(code: string, name?: string): Promise<Wire> {
    const paired = await Wire.tryPair(code, name);
    if (paired.wire === undefined) {
      throw new Error(`pairing answered ${paired.status} ${JSON.stringify(paired.body)}`);
    }
    return paired.wire;
  }

  /** The demo's first person, the workspace's owner, on a device of its own. */
  static async owner(): Promise<Wire> {
    return Wire.pair(await freshCode(), "e2e owner");
  }

  /**
   * Who made each invite and pairing code of this run, by its token or code. This suite's server
   * has its relay on, so every one asks the person who made it before it lets anyone in (ADR 0232).
   */
  private static readonly makers = new Map<string, Wire>();

  /**
   * Somebody opens an invite and joins by it under a name: the answer, and their device when the
   * server took them in. A refusal comes first, as it did before links asked (a blank name, a spent
   * or withdrawn link). Otherwise the link waits: its maker allows the request with the six digits
   * it shows, and the joiner collects their device, which `/v1/join/:id/redeem` answers 200.
   */
  static async redeem(token: string, name: string): Promise<Answer & { wire?: Wire }> {
    const key = newKey();
    const from = anAddress();
    const answer = await plain(
      "POST",
      "/v1/invites/redeem",
      { token, display_name: name, public_key: key.publicKey, device_name: "e2e phone" },
      from,
    );
    if (answer.status === 202) return Wire.collect(answer, Wire.makers.get(token), key, from);
    if (answer.status !== 201) return answer;
    return { ...answer, wire: Wire.of(answer.body, key.privateKey, from) };
  }

  /**
   * A waiting join allowed by whoever made its link, and collected (ADR 0232): the allow's answer
   * when it was refused, else the collect's. Left waiting when nobody of this run made the link.
   */
  private static async collect(
    waiting: Answer,
    maker: Wire | undefined,
    key: { readonly privateKey: KeyObject },
    from: string,
  ): Promise<Answer & { wire?: Wire }> {
    if (maker === undefined) return waiting;
    const id = String(waiting.body["request_id"]);
    const allowed = await maker.call("POST", `/v1/join/${id}/allow`, {
      code: waiting.body["code"],
    });
    if (allowed.status !== 200) return allowed;
    const answer = await plain(
      "POST",
      `/v1/join/${id}/redeem`,
      { secret: waiting.body["secret"] },
      from,
    );
    if (answer.status !== 200) return answer;
    return { ...answer, wire: Wire.of(answer.body, key.privateKey, from) };
  }

  /** The headers a signed request carries: method, target, time and the body's digest, signed. */
  private signed(method: string, target: string, raw: string): Record<string, string> {
    const timestamp = Date.now();
    const digest = createHash("sha256").update(raw, "utf8").digest("hex");
    const payload = [method.toUpperCase(), target, String(timestamp), digest].join("\n");
    return {
      "x-chips-device": this.device.deviceId,
      "x-chips-timestamp": String(timestamp),
      "x-chips-signature": sign(null, Buffer.from(payload, "utf8"), this.key).toString("base64"),
    };
  }

  /** A signed request, answered whatever it says. */
  async call(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<Answer> {
    const raw = body === undefined ? "" : JSON.stringify(body);
    const response = await fetch(`${SERVER}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": this.from,
        ...this.signed(method, path, raw),
      },
      ...(raw === "" ? {} : { body: raw }),
    });
    const answer = { status: response.status, body: await response.json().catch(() => undefined) };
    // A code this device made is allowed by this device when somebody pairs with it.
    if (method === "POST" && path === "/v1/pairing-codes" && answer.status === 201) {
      Wire.makers.set(String(answer.body.code), this);
    }
    return answer;
  }

  /** A signed request that must succeed; its body. */
  // biome-ignore lint/suspicious/noExplicitAny: read field by field by the spec.
  async ok(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<any> {
    const answer = await this.call(method, path, body);
    if (answer.status >= 300) {
      throw new Error(`${method} ${path} answered ${answer.status} ${JSON.stringify(answer.body)}`);
    }
    return answer.body;
  }

  /** An invite of this person's making: its token, as a link carries it. */
  async invite(
    role: "admin" | "member" | "guest" = "member",
    options: { single_use?: boolean; space_id?: string; expires_in_seconds?: number } = {},
  ): Promise<{ token: string; id: string }> {
    const made = await this.ok("POST", "/v1/invites", { role, ...options });
    Wire.makers.set(String(made.token), this);
    return { token: String(made.token), id: String(made.invite_id) };
  }

  /** Everybody here as this person's device reads them. */
  async participants(): Promise<Record<string, unknown>[]> {
    const read = await this.ok("GET", "/v1/participants");
    return (read.participants ?? read) as Record<string, unknown>[];
  }

  /** A socket of this device's, said hello on and subscribed to its workspace. */
  async socket(): Promise<Socket> {
    const ticket = await this.call("POST", "/v1/socket-tickets");
    if (ticket.status !== 200 && ticket.status !== 201) {
      throw new SocketRefused(ticket);
    }
    return Socket.open(String(ticket.body.ticket), this.device.workspaceId);
  }
}

/** A ticket refused: the device is not one the server knows now, or its person was removed. */
export class SocketRefused extends Error {
  constructor(readonly answer: Answer) {
    super(`a socket ticket answered ${answer.status} ${JSON.stringify(answer.body)}`);
  }
}

let sequence = 0;

/** A person's socket: every frame kept, one event sent at a time and answered. */
export class Socket {
  readonly frames: Frame[] = [];
  /** How it closed, once it has: the code and the reason the server gave. */
  closed: { code: number; reason: string } | undefined;
  private readonly waiters: { match: (frame: Frame) => boolean; resolve: (f: Frame) => void }[] =
    [];
  private readonly closers: ((closed: { code: number; reason: string }) => void)[] = [];

  private constructor(private readonly raw: WebSocket) {}

  static async open(ticket: string, workspaceId: string): Promise<Socket> {
    const raw = new WebSocket(
      `ws://127.0.0.1:${SERVER_PORT}/v1/ws?${new URLSearchParams({ ticket }).toString()}`,
    );
    const socket = new Socket(raw);
    raw.addEventListener("message", (message) => socket.receive(String(message.data)));
    raw.addEventListener("close", (event) => {
      socket.closed = { code: event.code, reason: event.reason };
      for (const closer of socket.closers.splice(0)) closer(socket.closed);
    });
    await new Promise<void>((resolve, reject) => {
      raw.addEventListener("open", () => resolve());
      raw.addEventListener("error", () => reject(new Error("the socket failed")));
    });
    raw.send(
      JSON.stringify({
        frame: "hello",
        protocol: { min: 1, max: 1 },
        client: { name: "e2e-person", version: "0.0.0" },
      }),
    );
    await socket.waitFor((frame) => eventOf(frame)?.["type"] === "hello", "hello");
    raw.send(JSON.stringify({ frame: "subscribe", workspace_id: workspaceId }));
    return socket;
  }

  private receive(text: string): void {
    const frame = JSON.parse(text) as Frame;
    if (frame["frame"] === "ping") {
      this.raw.send(JSON.stringify({ frame: "pong", ts: frame["ts"] }));
      return;
    }
    this.frames.push(frame);
    for (const waiter of [...this.waiters]) {
      if (waiter.match(frame)) {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        waiter.resolve(frame);
      }
    }
  }

  waitFor(match: (frame: Frame) => boolean, what: string, timeoutMs = 10_000): Promise<Frame> {
    const already = this.frames.find(match);
    if (already !== undefined) return Promise.resolve(already);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${what}`)), timeoutMs);
      this.waiters.push({
        match,
        resolve: (frame) => {
          clearTimeout(timer);
          resolve(frame);
        },
      });
    });
  }

  /** The first event that matches, however long ago it came. */
  async event(match: (event: Frame) => boolean, what: string, timeoutMs?: number): Promise<Frame> {
    const frame = await this.waitFor(
      (each) => {
        const event = eventOf(each);
        return event !== undefined && match(event);
      },
      what,
      timeoutMs,
    );
    return eventOf(frame) as Frame;
  }

  /** The events seen so far that match. */
  seen(match: (event: Frame) => boolean): Frame[] {
    return this.frames
      .map(eventOf)
      .filter((each): each is Frame => each !== undefined && match(each));
  }

  /** Send one event and wait for the server's answer to it: the ack, or the refusal. */
  async send(event: Frame): Promise<Frame> {
    sequence += 1;
    const key = `e2e-person-${Date.now()}-${sequence}`;
    this.raw.send(JSON.stringify({ frame: "event", event: { idempotency_key: key, ...event } }));
    const keyOf = (event["idempotency_key"] as string | undefined) ?? key;
    return this.waitFor(
      (frame) =>
        (frame["frame"] === "ack" || frame["frame"] === "error") &&
        frame["idempotency_key"] === keyOf,
      `an answer for ${String(event["type"])}`,
    );
  }

  /** Resolves once the server closes it (or it was closed already). */
  whenClosed(timeoutMs = 10_000): Promise<{ code: number; reason: string }> {
    if (this.closed !== undefined) return Promise.resolve(this.closed);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("the socket stayed open")), timeoutMs);
      this.closers.push((closed) => {
        clearTimeout(timer);
        resolve(closed);
      });
    });
  }

  close(): void {
    this.raw.close();
  }
}

/** One push as the suite's sink was sent it (`push-sink.mjs`): to whose phone, and what. */
export interface Pushed {
  readonly to: string;
  readonly title: string;
  readonly data: { readonly space_id?: string; readonly message_id?: string };
  readonly at: number;
}

const PUSH = `http://127.0.0.1:${process.env["CHIPS_E2E_PUSH_PORT"] ?? "5597"}`;

/** Everything pushed since the sink started. */
export async function pushes(): Promise<Pushed[]> {
  return ((await (await fetch(`${PUSH}/seen`)).json()) as { seen: Pushed[] }).seen;
}

/** A phone's push token for `wire`'s device, registered as the phone app registers one. */
export async function pushToken(wire: Wire): Promise<string> {
  const token = `ExponentPushToken[e2e-${wire.device.deviceId}]`;
  const answer = await wire.call("PUT", "/v1/me/push-token", {
    token,
    platform: "ios",
    time_zone: "America/Los_Angeles",
  });
  if (answer.status !== 200) throw new Error(`push-token answered ${answer.status}`);
  return token;
}

/** The push to `token` of the message with these words' room, once it comes. */
export async function pushedTo(token: string, spaceId: string, since: number): Promise<Pushed> {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    const found = (await pushes()).find(
      (each) => each.to === token && each.data.space_id === spaceId && each.at >= since,
    );
    if (found !== undefined) return found;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`no push to ${token} for ${spaceId}`);
}

/**
 * The pushes to `token` for a room since then, after waiting long enough for one to have come:
 * the server pushes a moment after the message is in the log, never later than this.
 */
export async function pushesTo(token: string, spaceId: string, since: number): Promise<Pushed[]> {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return (await pushes()).filter(
    (each) => each.to === token && each.data.space_id === spaceId && each.at >= since,
  );
}

/** The event a frame carries, if it carries one. */
export function eventOf(frame: Frame): Frame | undefined {
  return frame["frame"] === "event" ? (frame["event"] as Frame | undefined) : undefined;
}

/** What one person adds to a room: a membership, as the room sheet sends it. */
export function added(spaceId: string, who: Wire | string, role: "member" | "guest" = "member") {
  return {
    type: "membership.added",
    space_id: spaceId,
    participant_id: typeof who === "string" ? who : who.id,
    participant_kind: "person",
    role,
  };
}

/** Somebody taken out of a room, or leaving it when they name themselves. */
export function removed(spaceId: string, who: Wire | string, idempotencyKey?: string) {
  return {
    type: "membership.removed",
    space_id: spaceId,
    participant_id: typeof who === "string" ? who : who.id,
    ...(idempotencyKey === undefined ? {} : { idempotency_key: idempotencyKey }),
  };
}

/** A fresh id of a kind, as a client mints one: the prefix and a ULID. */
export function newId(prefix: "spc" | "msg"): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let ulid = "01K4ZQPX";
  for (let i = 0; i < 18; i += 1) ulid += alphabet[Math.floor(Math.random() * 32)];
  return `${prefix}_${ulid}`;
}

/**
 * A room of this person's own, named for the test, with nobody asked into it: its id is the
 * client's to mint, as the apps mint it.
 */
export async function roomOf(socket: Socket, title: string): Promise<string> {
  const spaceId = newId("spc");
  const answer = await socket.send({
    type: "space.created",
    space_id: spaceId,
    kind: "group",
    title,
    idempotency_key: `space-${spaceId}`,
  });
  if (answer["frame"] !== "ack")
    throw new Error(`space.created answered ${JSON.stringify(answer)}`);
  return spaceId;
}

/** A message from a person into a room, with whom it is for when they chose. */
export function said(spaceId: string, text: string, to?: "all" | readonly string[]) {
  return {
    type: "message.post",
    space_id: spaceId,
    text,
    ...(to === undefined ? {} : { to: to === "all" ? "all" : [...to] }),
  };
}
