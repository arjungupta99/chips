/**
 * An agent's context window (ADR 0146).
 *
 * - `PUT /v1/agents/:id/context-window`: a harness's copy of one of its agents' context window,
 *   whole; it may answer or refuse an ask as it goes.
 * - `GET /v1/agents/:id/context-window`: the copy, for the harness's owner or an admin, with
 *   whether the harness is away and what became of the last limit and the last Compact now.
 * - `POST /v1/agents/:id/context-window/changes`: the owner or an admin changes the limit it
 *   compacts itself at; `202` with the change, waiting.
 * - `POST /v1/agents/:id/context-window/compactions`: the owner or an admin asks it to compact
 *   now; `202` with the ask, waiting.
 *
 * Either ask is refused as `harness_away` when nothing of the harness hears it, and as
 * `change_waiting` while the last of its kind waits inside its minute (or the agent is compacting).
 */

import {
  type AgentContextWindowView,
  agentContextWindowPut,
  windowLimitAsk,
} from "@chipschat/protocol";
import type { Hono } from "hono";
import type {
  WindowRead,
  WindowRefusal,
} from "../../../application/use-cases/agent-context-windows.js";
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

function refusal(error: WindowRefusal): HttpError {
  const rule = error.kind === "away" || error.kind === "waiting" ? RULE[error.kind] : undefined;
  return new HttpError(STATUS[error.kind], error.message, undefined, undefined, rule);
}

function viewOf({ kept, away, change, compaction }: WindowRead): AgentContextWindowView {
  return {
    agent_id: kept.agentId as AgentContextWindowView["agent_id"],
    harness_id: kept.harnessId as AgentContextWindowView["harness_id"],
    ...kept.said,
    read_at: kept.readAt,
    away,
    ...(change === undefined ? {} : { change }),
    ...(compaction === undefined ? {} : { compaction }),
  };
}

export function registerAgentContextWindowRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.put("/v1/agents/:id/context-window", async (c) => {
    const put = body(
      agentContextWindowPut,
      c.get("rawBody"),
      "Send how many tokens the agent holds, its model's window, whether it takes a Compact now, and its limit with the limits it offers.",
    );
    const result = await deps.agentContextWindows.put({
      principal: c.get("principal"),
      agentId: c.req.param("id"),
      put,
    });
    if (!result.ok) throw refusal(result.error);
    return c.json({ read_at: result.value.readAt });
  });

  app.get("/v1/agents/:id/context-window", async (c) => {
    const result = await deps.agentContextWindows.read({
      principal: c.get("principal"),
      agentId: c.req.param("id"),
    });
    if (!result.ok) throw refusal(result.error);
    return c.json(viewOf(result.value));
  });

  app.post("/v1/agents/:id/context-window/changes", async (c) => {
    const ask = body(
      windowLimitAsk,
      c.get("rawBody"),
      "Say the limit it compacts itself at, as a percent of its window, or null for only when asked.",
    );
    const principal = c.get("principal");
    const agentId = c.req.param("id");
    const result = await deps.agentContextWindows.ask({ principal, agentId, ask });
    if (!result.ok) throw refusal(result.error);
    c.get("logger").info(
      { agentId, change: result.value.change_id, by: principal.participantId },
      "context window limit asked",
    );
    return c.json(result.value, 202);
  });

  app.post("/v1/agents/:id/context-window/compactions", async (c) => {
    const principal = c.get("principal");
    const agentId = c.req.param("id");
    const result = await deps.agentContextWindows.compact({ principal, agentId });
    if (!result.ok) throw refusal(result.error);
    c.get("logger").info(
      { agentId, compaction: result.value.change_id, by: principal.participantId },
      "compact now asked",
    );
    return c.json(result.value, 202);
  });
}
