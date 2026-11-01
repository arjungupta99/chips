/**
 * The referee's limits, on the server's side (ADR 0187). When Chips tells the agents to stop, when
 * it holds them, and whether circles count are the protocol's to read and to judge, shared with
 * every client; what is here refuses an `exchange.limits_set` the referee could not keep: a stop
 * at or past the hold would hold the agents before it told them to stop.
 */

import { exchangeLimitsOf, limitsProblem } from "@chipschat/protocol";
import type { Refusal } from "./authorize.js";

export const EXCHANGE_LIMITS_EVENT = "exchange.limits_set";

/** Nothing unless this is a limits event the referee could not keep. */
export function refuseLimits(event: Readonly<Record<string, unknown>>): Refusal | undefined {
  if (event["type"] !== EXCHANGE_LIMITS_EVENT) return undefined;
  const why = limitsProblem(exchangeLimitsOf(event));
  return why === undefined ? undefined : { kind: "invalid", message: why };
}
