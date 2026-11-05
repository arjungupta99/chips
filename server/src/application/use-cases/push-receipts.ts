/**
 * What became of the pushes the push service took (the stranger review, 4 November 2026).
 *
 * Expo answers a push with a ticket at once, and learns only later, from Apple or Google, that the
 * phone's app was deleted or the push wasn't delivered. That is in the push's receipt, asked for by
 * the ticket's id, and nothing asked: a phone whose app was deleted was pushed for ever, and a
 * push that never reached its phone was logged as pushed.
 *
 * So every push goes through the sender this hands out. It notes each ticket's id and the token
 * it was for, and forgets at once a token a ticket already says no phone has, whichever use case
 * sent it. The sweep asks for the receipts once the service has had `RECEIPT_AFTER_MS` to know,
 * forgets a token whose receipt says `DeviceNotRegistered` wherever it is held, and logs how many
 * pushes didn't reach their phones. An id the service doesn't answer for yet is asked again at the
 * next sweep, while Expo keeps receipts (a day). Nothing is kept on disk: a restart forgets what it
 * waited for, and the next push to a dead token has a receipt of its own.
 */

import type { Logger } from "@chipschat/platform";
import type { Clock } from "../ports/clock.js";
import type {
  PushMessage,
  PushReceipt,
  PushRegistry,
  PushSender,
  PushTicket,
} from "../ports/push.js";

/** How long Expo asks a sender to wait before asking for a push's receipt. */
export const RECEIPT_AFTER_MS = 15 * 60_000;
/** How long Expo keeps a receipt. */
export const RECEIPT_KEPT_MS = 24 * 60 * 60_000;
/** The tickets waited on at once; past it the oldest is let go, unasked. */
export const MOST_WAITING = 10_000;

/** What the push service says of a token no phone has. */
const DEAD = "DeviceNotRegistered";

export interface PushReceiptsDeps {
  readonly sender: PushSender;
  readonly push: Pick<PushRegistry, "removeToken">;
  readonly clock: Clock;
  readonly logger: Logger;
}

interface Waiting {
  readonly token: string;
  readonly at: number;
}

export function createPushReceipts(deps: PushReceiptsDeps) {
  /** Each ticket's id still waiting on its receipt, with the token it was for. */
  const waiting = new Map<string, Waiting>();

  function keep(id: string, token: string, at: number): void {
    if (waiting.size >= MOST_WAITING) {
      const oldest = waiting.keys().next().value;
      if (oldest !== undefined) waiting.delete(oldest);
    }
    waiting.set(id, { token, at });
  }

  /** Note the tickets of a batch; the tokens they already say no phone has. */
  function note(messages: readonly PushMessage[], tickets: readonly PushTicket[]): string[] {
    const at = deps.clock.nowMs();
    const dead: string[] = [];
    tickets.forEach((ticket, index) => {
      const to = messages[index]?.to;
      if (to === undefined) return;
      if (ticket.error === DEAD) dead.push(to);
      else if (ticket.ok && ticket.id !== undefined && deps.sender.receipts !== undefined) {
        keep(ticket.id, to, at);
      }
    });
    return dead;
  }

  /** Forget each token wherever it is held; how many rows held them. */
  async function forget(tokens: readonly string[]): Promise<number> {
    let forgotten = 0;
    for (const token of new Set(tokens)) forgotten += await deps.push.removeToken(token);
    return forgotten;
  }

  /** The ids whose receipts are due, letting go of those Expo keeps no more. */
  function due(now: number): string[] {
    const ids: string[] = [];
    for (const [id, kept] of waiting) {
      if (now - kept.at > RECEIPT_KEPT_MS) waiting.delete(id);
      else if (now - kept.at >= RECEIPT_AFTER_MS) ids.push(id);
    }
    return ids;
  }

  /** Settle the receipts that came: the dead tokens, how many missed, and the first reason. */
  function settle(receipts: ReadonlyMap<string, PushReceipt>) {
    const dead: string[] = [];
    let missed = 0;
    let why: string | undefined;
    for (const [id, receipt] of receipts) {
      const kept = waiting.get(id);
      waiting.delete(id);
      if (receipt.ok || kept === undefined) continue;
      missed += 1;
      why ??= receipt.error ?? receipt.message;
      if (receipt.error === DEAD) dead.push(kept.token);
    }
    return { dead, missed, why };
  }

  const sender: PushSender = {
    async send(messages) {
      const tickets = await deps.sender.send(messages);
      // A sender throws at nobody: a token that couldn't be forgotten now is forgotten next time.
      await forget(note(messages, tickets)).catch(() => 0);
      return tickets;
    },
    readiness: () => deps.sender.readiness(),
    standing: () => deps.sender.standing(),
  };

  return {
    /** The sender every use case pushes through. */
    sender,
    /** How many tickets wait on their receipts. */
    waiting: () => waiting.size,
    /** Ask for the receipts that are due; how many push tokens were forgotten for them. */
    async check(): Promise<number> {
      const ids = due(deps.clock.nowMs());
      if (ids.length === 0 || deps.sender.receipts === undefined) return 0;
      const receipts = await deps.sender.receipts(ids);
      if (typeof receipts === "string") {
        deps.logger.debug({ event: "push.receipts_unread", why: receipts }, "no push receipts now");
        return 0;
      }
      const { dead, missed, why } = settle(receipts);
      const forgotten = await forget(dead);
      if (missed > 0) {
        deps.logger.warn(
          { event: "push.undelivered", phones: missed, why: why ?? "unknown", forgotten },
          "pushes the push service took didn't reach their phones",
        );
      }
      return forgotten;
    },
  };
}

export type PushReceipts = ReturnType<typeof createPushReceipts>;
