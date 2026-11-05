/**
 * Pushes' receipts (the stranger review, 4 November 2026): every push's ticket is noted, its
 * receipt asked for once due, and a token no phone has any more forgotten wherever it is held.
 */

import { createLogger, manualClock } from "@chipschat/platform";
import { describe, expect, it, vi } from "vitest";
import type { PushMessage, PushReceipt, PushSender, PushTicket } from "../ports/push.js";
import {
  createPushReceipts,
  MOST_WAITING,
  RECEIPT_AFTER_MS,
  RECEIPT_KEPT_MS,
} from "./push-receipts.js";

const message = (to: string): PushMessage => ({
  to,
  title: "A new message",
  body: "Open Chips to read it.",
  data: {},
});

function harness(
  options: {
    tickets?: (messages: readonly PushMessage[]) => PushTicket[];
    receipts?: PushSender["receipts"] | null;
  } = {},
) {
  const clock = manualClock(Date.parse("2026-11-04T12:00:00.000Z"));
  const removed: string[] = [];
  let next = 0;
  const asked: string[][] = [];
  const answers = new Map<string, PushReceipt>();
  const inner: PushSender = {
    send: async (messages) =>
      options.tickets?.(messages) ??
      messages.map(() => {
        next += 1;
        return { ok: true, id: `ticket-${next}` };
      }),
    readiness: () => "ready",
    standing: () => "ready",
    ...(options.receipts === null
      ? {}
      : {
          receipts:
            options.receipts ??
            (async (ids) => {
              asked.push([...ids]);
              return new Map([...answers].filter(([id]) => ids.includes(id)));
            }),
        }),
  };
  const logger = createLogger({ level: "silent" });
  const warn = vi.spyOn(logger, "warn");
  const receipts = createPushReceipts({
    sender: inner,
    push: {
      removeToken: async (token) => {
        removed.push(token);
        return 1;
      },
    },
    clock,
    logger,
  });
  return { receipts, clock, removed, asked, answers, warn };
}

describe("a push's receipt", () => {
  it("is asked for once the service has had fifteen minutes, and a dead token is forgotten", async () => {
    const { receipts, clock, removed, asked, answers, warn } = harness();
    const tickets = await receipts.sender.send([
      message("ExponentPushToken[alive]"),
      message("ExponentPushToken[deleted]"),
    ]);
    expect(tickets.map((each) => each.id)).toEqual(["ticket-1", "ticket-2"]);
    // Too soon: nothing asked.
    clock.advance(RECEIPT_AFTER_MS - 1);
    expect(await receipts.check()).toBe(0);
    expect(asked).toEqual([]);

    answers.set("ticket-1", { ok: true });
    answers.set("ticket-2", { ok: false, error: "DeviceNotRegistered", message: "gone" });
    clock.advance(1);
    expect(await receipts.check()).toBe(1);
    expect(asked).toEqual([["ticket-1", "ticket-2"]]);
    expect(removed).toEqual(["ExponentPushToken[deleted]"]);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "push.undelivered", phones: 1, why: "DeviceNotRegistered" }),
      expect.any(String),
    );
    // Settled: never asked again.
    clock.advance(RECEIPT_AFTER_MS);
    await receipts.check();
    expect(asked).toHaveLength(1);
    expect(receipts.waiting()).toBe(0);
  });

  it("is asked for again while the service has none yet, and let go once Expo keeps it no more", async () => {
    const { receipts, clock, asked, answers } = harness();
    await receipts.sender.send([message("ExponentPushToken[slow]")]);
    clock.advance(RECEIPT_AFTER_MS);
    await receipts.check();
    clock.advance(RECEIPT_AFTER_MS);
    await receipts.check();
    expect(asked).toEqual([["ticket-1"], ["ticket-1"]]);
    clock.advance(RECEIPT_KEPT_MS);
    await receipts.check();
    expect(asked).toHaveLength(2);
    expect(receipts.waiting()).toBe(0);
    // A receipt that comes after it was let go changes nothing.
    answers.set("ticket-1", { ok: false, error: "DeviceNotRegistered" });
  });

  it("keeps its tickets when the service couldn't say, to ask at the next sweep", async () => {
    let down = true;
    const asked: string[][] = [];
    const { receipts, clock, removed } = harness({
      receipts: async (ids) => {
        asked.push([...ids]);
        return down
          ? "unreachable"
          : new Map([[ids[0] ?? "", { ok: false, error: "DeviceNotRegistered" }]]);
      },
    });
    await receipts.sender.send([message("ExponentPushToken[deleted]")]);
    clock.advance(RECEIPT_AFTER_MS);
    expect(await receipts.check()).toBe(0);
    down = false;
    expect(await receipts.check()).toBe(1);
    expect(removed).toEqual(["ExponentPushToken[deleted]"]);
    expect(asked).toHaveLength(2);
  });

  it("forgets at once a token its ticket already says no phone has, whoever sent the push", async () => {
    const { receipts, removed } = harness({
      tickets: (messages) =>
        messages.map((each) =>
          each.to.includes("deleted")
            ? { ok: false, error: "DeviceNotRegistered" }
            : { ok: true, id: "ticket-x" },
        ),
    });
    await receipts.sender.send([
      message("ExponentPushToken[deleted]"),
      message("ExponentPushToken[deleted]"),
      message("ExponentPushToken[alive]"),
    ]);
    // One token, held by however many rows: forgotten once.
    expect(removed).toEqual(["ExponentPushToken[deleted]"]);
    expect(receipts.waiting()).toBe(1);
  });

  it("waits on nothing for a sender with no receipts, and on at most MOST_WAITING", async () => {
    const without = harness({ receipts: null });
    await without.receipts.sender.send([message("ExponentPushToken[one]")]);
    expect(without.receipts.waiting()).toBe(0);
    expect(await without.receipts.check()).toBe(0);

    const { receipts } = harness();
    const many = Array.from({ length: MOST_WAITING + 5 }, (_, i) =>
      message(`ExponentPushToken[p${i}]`),
    );
    await receipts.sender.send(many);
    expect(receipts.waiting()).toBe(MOST_WAITING);
  });

  it("says what its sender says of whether pushes can go", () => {
    const { receipts } = harness();
    expect(receipts.sender.readiness()).toBe("ready");
    expect(receipts.sender.standing()).toBe("ready");
  });
});
