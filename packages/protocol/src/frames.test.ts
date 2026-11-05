import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "./envelope.js";
import { parseEvent } from "./events/catalogue.js";
import {
  ackFrame,
  clientFrame,
  clientHelloFrame,
  errorFrame,
  FRAME_NAMES,
  negotiateProtocol,
  serverFrame,
  subscribeFrame,
} from "./frames.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/frames/", import.meta.url));

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(`${FIXTURES}${name}.json`, "utf8"));
}

const CLIENT_FRAMES = ["hello", "subscribe", "event", "ping", "pong"];
const SERVER_FRAMES = [
  "event",
  "events",
  "ack",
  "receipt",
  "presence",
  "restart",
  "join",
  "folder.open",
  "folder.run",
  "folder.run_state",
  "read",
  "context.edit",
  "model.change",
  "heartbeat.change",
  "context_window.compact",
  "context_window.change",
  "job.change",
  "ping",
  "pong",
  "error",
];

describe("frames", () => {
  it("names the ten frames of Appendix B, restart (ADR 0094), join (ADR 0122), folder.open (ADR 0225), folder.run and folder.run_state (ADR 0226), read (ADR 0262), context.edit (ADR 0134), model.change (ADR 0140), heartbeat.change (ADR 0143), context_window.compact and context_window.change (ADR 0146), and job.change (ADR 0252)", () => {
    expect([...FRAME_NAMES]).toEqual([
      "hello",
      "subscribe",
      "event",
      "events",
      "ack",
      "receipt",
      "presence",
      "restart",
      "join",
      "folder.open",
      "folder.run",
      "folder.run_state",
      "read",
      "context.edit",
      "model.change",
      "heartbeat.change",
      "context_window.compact",
      "context_window.change",
      "job.change",
      "ping",
      "pong",
      "error",
    ]);
  });

  it.each(CLIENT_FRAMES)("accepts the %s fixture as a client frame", (name) => {
    const result = clientFrame.safeParse(fixture(name));
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it.each(SERVER_FRAMES)("accepts the %s fixture as a server frame", (name) => {
    const result = serverFrame.safeParse(fixture(name));
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it("asks for a room's page, not its folder, with `what` (ADR 0227)", () => {
    const result = serverFrame.safeParse(fixture("folder.open.page"));
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ frame: "folder.open", what: "page" });
    expect(
      serverFrame.safeParse({ ...(fixture("folder.open") as object), what: "x" }).success,
    ).toBe(false);
  });

  it("carries a real event inside an event frame", () => {
    const frame = fixture("event") as { event: unknown };
    expect(parseEvent(frame.event).ok).toBe(true);
  });

  it("carries a page of real events inside an events frame", () => {
    const frame = fixture("events") as { events: unknown[] };
    expect(frame.events.every((each) => parseEvent(each).ok)).toBe(true);
  });

  it("takes a hello that says which frames beyond the base set it understands", () => {
    const hello = fixture("hello") as Record<string, unknown>;
    expect(clientFrame.safeParse({ ...hello, accepts: ["events"] }).success).toBe(true);
    // A client that says nothing is sent one frame per event, as it always was.
    expect(clientHelloFrame.parse(hello).accepts).toBeUndefined();
    // A name it does not know is taken and ignored, so an older server answers a newer client.
    expect(clientFrame.safeParse({ ...hello, accepts: ["events", "shouts"] }).success).toBe(true);
    // Still names: nothing empty, nothing long, not hundreds.
    expect(clientFrame.safeParse({ ...hello, accepts: [""] }).success).toBe(false);
    expect(clientFrame.safeParse({ ...hello, accepts: ["x".repeat(41)] }).success).toBe(false);
    expect(
      clientFrame.safeParse({ ...hello, accepts: Array.from({ length: 33 }, (_, n) => `f${n}`) })
        .success,
    ).toBe(false);
  });

  it("takes a harness's hello that hears restarts, and a restart that names who asked (ADR 0094)", () => {
    const hello = fixture("hello") as Record<string, unknown>;
    expect(clientFrame.safeParse({ ...hello, accepts: ["events", "restart"] }).success).toBe(true);
    const restart = fixture("restart") as Record<string, unknown>;
    expect(serverFrame.safeParse({ ...restart, asked_by: undefined }).success).toBe(false);
    // Chips sends no command: anything more than who asked and when is not a restart frame's.
    expect(serverFrame.parse({ ...restart, command: "rm -rf /" })).not.toHaveProperty("command");
  });

  it("takes a hello that says how much of a room it wants with a question (ADR 0088)", () => {
    const hello = fixture("hello") as Record<string, unknown>;
    expect(clientHelloFrame.parse({ ...hello, context: { lines: 50 } }).context).toEqual({
      lines: 50,
    });
    // More than Chips hands over is a wish it trims, not a frame it refuses.
    expect(
      clientFrame.safeParse({ ...hello, context: { lines: 900, chars: 99_000 } }).success,
    ).toBe(true);
    expect(clientFrame.safeParse({ ...hello, context: { lines: -1 } }).success).toBe(false);
    expect(clientHelloFrame.parse(hello).context).toBeUndefined();
  });

  it("refuses a frame with a name nothing declares", () => {
    expect(clientFrame.safeParse({ frame: "shout", text: "hi" }).success).toBe(false);
  });

  it("refuses a subscribe with no workspace", () => {
    expect(subscribeFrame.safeParse({ frame: "subscribe" }).success).toBe(false);
  });

  it("defaults an ack to not being a duplicate", () => {
    const parsed = ackFrame.parse({ frame: "ack", idempotency_key: "k", seq: 1 });
    expect(parsed.duplicate).toBe(false);
  });

  it("keeps error codes a closed set, so a client can branch on them", () => {
    expect(errorFrame.safeParse({ frame: "error", code: "made_up", message: "x" }).success).toBe(
      false,
    );
    expect(
      errorFrame.safeParse({ frame: "error", code: "too_far_behind", message: "x" }).success,
    ).toBe(true);
  });
});

describe("protocol negotiation", () => {
  it("picks the highest version both sides speak", () => {
    expect(negotiateProtocol({ min: 1, max: 3 }, { min: 1, max: 2 })).toBe(2);
  });

  it("agrees with itself on the current version", () => {
    expect(negotiateProtocol({ min: PROTOCOL_VERSION, max: PROTOCOL_VERSION })).toBe(
      PROTOCOL_VERSION,
    );
  });

  it("refuses when the ranges do not overlap", () => {
    expect(negotiateProtocol({ min: 4, max: 5 }, { min: 1, max: 2 })).toBeUndefined();
    expect(negotiateProtocol({ min: 1, max: 1 }, { min: 2, max: 3 })).toBeUndefined();
  });

  it("never picks a version outside either range", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 1, max: 8 }),
        (a, b, c, d) => {
          const client = { min: Math.min(a, b), max: Math.max(a, b) };
          const server = { min: Math.min(c, d), max: Math.max(c, d) };
          const chosen = negotiateProtocol(client, server);
          if (chosen === undefined) {
            expect(Math.min(client.max, server.max)).toBeLessThan(Math.max(client.min, server.min));
            return;
          }
          expect(chosen).toBeGreaterThanOrEqual(client.min);
          expect(chosen).toBeLessThanOrEqual(client.max);
          expect(chosen).toBeGreaterThanOrEqual(server.min);
          expect(chosen).toBeLessThanOrEqual(server.max);
        },
      ),
    );
  });
});
