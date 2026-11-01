/**
 * A person pauses the agents in a room, or lets them carry on (ADR 0097).
 *
 * - `POST /v1/spaces/:id/exchange {state: "paused" | "going"}`: pause them, so their messages to
 *   each other are held, or let them carry on, which starts the count again and hands over what
 *   was held. Pausing paused agents changes nothing.
 *
 * A person's in the room who is not a guest; never a harness's.
 */

import type { Hono } from "hono";
import type { ExchangeRefusal } from "../../../application/index.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

const STATUS = { not_allowed: "forbidden", unknown_space: "not_found" } as const;

function readState(raw: string | undefined): "paused" | "going" {
  let body: unknown;
  try {
    body = raw === undefined || raw === "" ? {} : JSON.parse(raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  const state =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)["state"]
      : undefined;
  if (state === "paused" || state === "going") return state;
  throw new HttpError("invalid_event", "Say the state as `state`: `paused` or `going`.");
}

export function registerExchangeRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.post("/v1/spaces/:id/exchange", async (c) => {
    const spaceId = c.req.param("id");
    const state = readState(c.get("rawBody"));
    const result = await deps.setExchange({ principal: c.get("principal"), spaceId, state });
    if (!result.ok) throw refusal(result.error);
    if (result.changed) c.get("logger").info({ spaceId, state }, "the agents paused or let go on");
    return c.json({ space_id: spaceId, state: result.state, changed: result.changed });
  });
}

function refusal(error: ExchangeRefusal): HttpError {
  return new HttpError(STATUS[error.kind], error.message);
}
