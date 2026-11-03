/**
 * What became of a batch of pushes, said as it was (ADR 0244). The tickets say which phones the
 * push service took a push for; the rest were not pushed, and the log doesn't say they were.
 */

import type { Logger } from "@chipschat/platform";
import type { PushTicket } from "./ports/push.js";

/**
 * Log `<what> was pushed` for the phones reached, and `<what> could not be pushed` with the
 * first reason for the rest. `fields` names what it was about: an approval, a room, a request.
 */
export function sayPushed(
  logger: Logger,
  tickets: readonly PushTicket[],
  what: string,
  fields: Readonly<Record<string, unknown>>,
): void {
  const missed = tickets.filter((ticket) => !ticket.ok);
  const reached = tickets.length - missed.length;
  if (reached > 0)
    logger.info({ event: "push.sent", ...fields, phones: reached }, `${what} was pushed`);
  const [first] = missed;
  if (first === undefined) return;
  logger.warn(
    {
      event: "push.not_sent",
      ...fields,
      phones: missed.length,
      why: first.error ?? first.message ?? "unknown",
    },
    `${what} could not be pushed`,
  );
}
