/**
 * An agent's heartbeat (ADR 0143).
 *
 * - `PUT /v1/agents/:id/heartbeat`: a harness's copy of one of its agents' heartbeat, whole; it
 *   may answer or refuse a change as it goes.
 * - `GET /v1/agents/:id/heartbeat`: the copy, for the harness's owner or an admin, with whether
 *   the harness is away and what became of the last change.
 * - `POST /v1/agents/:id/heartbeat/changes`: the owner or an admin switches it or times it; `202`
 *   with the change, waiting. Refused as `harness_away` when nothing of the harness hears it, and
 *   as `change_waiting` while the last one waits inside its minute.
 */

import {
  type AgentHeartbeatView,
  agentHeartbeatPut,
  heartbeatChangeAsk,
} from "@chipschat/protocol";
import type { Hono } from "hono";
import type {
  HeartbeatRead,
  HeartbeatRefusal,
} from "../../../application/use-cases/agent-heartbeats.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";
import { body } from "./body.js";

const STATUS = {
  not_allowed: "forbidden",
  unknown: "not_found",
  invalid: "invalid_event",
  away: "invalid_event",
  waiting: "invalid_event",
} as const;

const RULE = { away: "harness_away", waiting: "change_waiting" } as const;

function refusal(error: HeartbeatRefusal): HttpError {
  const rule = error.kind === "away" || error.kind === "waiting" ? RULE[error.kind] : undefined;
  return new HttpError(STATUS[error.kind], error.message, undefined, undefined, rule);
}

function viewOf({ kept, away, change }: HeartbeatRead): AgentHeartbeatView {
  return {
    agent_id: kept.agentId as AgentHeartbeatView["agent_id"],
    harness_id: kept.harnessId as AgentHeartbeatView["harness_id"],
    ...kept.said,
    read_at: kept.readAt,
    away,
    ...(change === undefined ? {} : { change }),
  };
}

export function registerAgentHeartbeatRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.put("/v1/agents/:id/heartbeat", async (c) => {
    const put = body(
      agentHeartbeatPut,
      c.get("rawBody"),
      "Send whether the agent beats, how often in minutes, and the intervals it offers: twelve at most.",
    );
    const result = await deps.agentHeartbeats.put({
      principal: c.get("principal"),
      agentId: c.req.param("id"),
      put,
    });
    if (!result.ok) throw refusal(result.error);
    return c.json({ read_at: result.value.readAt });
  });

  app.get("/v1/agents/:id/heartbeat", async (c) => {
    const result = await deps.agentHeartbeats.read({
      principal: c.get("principal"),
      agentId: c.req.param("id"),
    });
    if (!result.ok) throw refusal(result.error);
    return c.json(viewOf(result.value));
  });

  app.post("/v1/agents/:id/heartbeat/changes", async (c) => {
    const ask = body(
      heartbeatChangeAsk,
      c.get("rawBody"),
      "Say on or off, and how often in minutes, or nothing for the interval it has.",
    );
    const principal = c.get("principal");
    const agentId = c.req.param("id");
    const result = await deps.agentHeartbeats.ask({ principal, agentId, ask });
    if (!result.ok) throw refusal(result.error);
    c.get("logger").info(
      { agentId, change: result.value.change_id, by: principal.participantId },
      "heartbeat change asked",
    );
    return c.json(result.value, 202);
  });
}
