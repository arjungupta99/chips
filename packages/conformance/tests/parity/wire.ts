/**
 * A harness on the wire, for a parity scenario: HTTP with its token and one socket, the same
 * client against the real server and the fake. It keeps every event the socket was sent, in
 * order, which is what the two are compared by.
 */

import type { Address } from "./worlds.js";

type Json = Record<string, unknown>;

export interface Answer {
  readonly status: number;
  readonly json: Json;
}

export class HarnessWire {
  private readonly frames: Json[] = [];
  private readonly waiting = new Set<() => void>();
  private keys = 0;

  private constructor(
    private readonly address: Address,
    private readonly socket: WebSocket,
  ) {
    socket.addEventListener("message", (message) => {
      const frame = JSON.parse(String(message.data)) as Json;
      if (frame["frame"] === "ping") {
        socket.send(JSON.stringify({ frame: "pong", ts: frame["ts"] }));
        return;
      }
      this.frames.push(frame);
      for (const wake of [...this.waiting]) wake();
    });
  }

  /** Open the socket, say hello and subscribe from now: only what follows is heard. */
  static async connect(address: Address): Promise<HarnessWire> {
    const base = address.url.replace(/^http/, "ws");
    const socket = new WebSocket(`${base}/v1/ws?token=${encodeURIComponent(address.token)}`);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("the socket would not open")), {
        once: true,
      });
    });
    const wire = new HarnessWire(address, socket);
    socket.send(
      JSON.stringify({
        frame: "hello",
        protocol: { min: 1, max: 1 },
        client: { name: "parity", version: "0.0.0" },
      }),
    );
    await wire.until((frame) => frame["frame"] === "event" && typeOf(frame) === "hello");
    socket.send(JSON.stringify({ frame: "subscribe", workspace_id: address.workspaceId }));
    return wire;
  }

  /** A call with the harness's token, before or without a socket. */
  static async call(
    address: Address,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Answer> {
    const response = await fetch(`${address.url}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${address.token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return { status: response.status, json: text === "" ? {} : (JSON.parse(text) as Json) };
  }

  /** A call with the harness's token. */
  http(method: string, path: string, body?: unknown): Promise<Answer> {
    return HarnessWire.call(this.address, method, path, body);
  }

  /** An event on the socket: the ack, or the refusal's code and rule. */
  async send(event: Json): Promise<{ ok: boolean; code?: string; refusal?: string }> {
    this.keys += 1;
    const key = `parity-${this.keys}`;
    this.socket.send(JSON.stringify({ frame: "event", event: { idempotency_key: key, ...event } }));
    const answered = await this.until(
      (frame) =>
        (frame["frame"] === "ack" || frame["frame"] === "error") &&
        frame["idempotency_key"] === key,
    );
    if (answered["frame"] === "ack") return { ok: true };
    return {
      ok: false,
      code: String(answered["code"]),
      ...(typeof answered["refusal"] === "string" ? { refusal: answered["refusal"] } : {}),
    };
  }

  /** Every event the socket was sent, in order, less the handshake. */
  events(): Json[] {
    return this.frames
      .filter((frame) => frame["frame"] === "event")
      .map((frame) => frame["event"] as Json)
      .filter((event) => event["type"] !== "hello");
  }

  /** The first frame that matches, already here or arriving within the time. */
  async until(match: (frame: Json) => boolean, timeoutMs = 5000): Promise<Json> {
    const found = () => this.frames.find(match);
    const already = found();
    if (already !== undefined) return already;
    return new Promise<Json>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(look);
        reject(new Error(`nothing matched on the socket within ${timeoutMs} ms`));
      }, timeoutMs);
      const look = () => {
        const frame = found();
        if (frame === undefined) return;
        clearTimeout(timer);
        this.waiting.delete(look);
        resolve(frame);
      };
      this.waiting.add(look);
    });
  }

  /** The first event that matches, already here or arriving within the time. */
  async heard(match: (event: Json) => boolean, timeoutMs = 5000): Promise<Json> {
    const frame = await this.until(
      (each) => each["frame"] === "event" && match(each["event"] as Json),
      timeoutMs,
    );
    return frame["event"] as Json;
  }

  close(): void {
    this.socket.close();
  }
}

function typeOf(frame: Json): unknown {
  return (frame["event"] as Json | undefined)?.["type"];
}
