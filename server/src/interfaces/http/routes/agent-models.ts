/**
 * An agent's model and effort (ADR 0140).
 *
 * - `PUT /v1/agents/:id/model`: a harness's copy of one of its agents' model and effort, whole; it
 *   may answer or refuse a change as it goes.
 * - `GET /v1/agents/:id/model`: the copy, for the harness's owner or an admin, with whether the
 *   harness is away and what became of the last change.
 * - `POST /v1/agents/:id/model/changes`: the owner or an admin changes it; `202` with the change,
 *   waiting. Refused as `harness_away` when nothing of the harness hears it, and as
 *   `change_waiting` while the last one waits inside its minute.
 */

import { type AgentModelView, agentModelPut, modelChangeAsk } from "@chipschat/protocol";
import type { Hono } from "hono";
import type { ModelRead, ModelRefusal } from "../../../application/use-cases/agent-models.js";
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

function refusal(error: ModelRefusal): HttpError {
  const rule = error.kind === "away" || error.kind === "waiting" ? RULE[error.kind] : undefined;
  return new HttpError(STATUS[error.kind], error.message, undefined, undefined, rule);
}

function viewOf({ kept, away, change }: ModelRead): AgentModelView {
  return {
    agent_id: kept.agentId as AgentModelView["agent_id"],
    harness_id: kept.harnessId as AgentModelView["harness_id"],
    ...kept.said,
    read_at: kept.readAt,
    away,
    ...(change === undefined ? {} : { change }),
  };
}

export function registerAgentModelRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.put("/v1/agents/:id/model", async (c) => {
    const put = body(
      agentModelPut,
      c.get("rawBody"),
      "Send what the agent runs on, and the models it may: forty at most, eight levels each.",
    );
    const result = await deps.agentModels.put({
      principal: c.get("principal"),
      agentId: c.req.param("id"),
      put,
    });
    if (!result.ok) throw refusal(result.error);
    return c.json({ read_at: result.value.readAt });
  });

  app.get("/v1/agents/:id/model", async (c) => {
    const result = await deps.agentModels.read({
      principal: c.get("principal"),
      agentId: c.req.param("id"),
    });
    if (!result.ok) throw refusal(result.error);
    return c.json(viewOf(result.value));
  });

  app.post("/v1/agents/:id/model/changes", async (c) => {
    const ask = body(
      modelChangeAsk,
      c.get("rawBody"),
      "Say the model and its effort, or neither for the default.",
    );
    const principal = c.get("principal");
    const agentId = c.req.param("id");
    const result = await deps.agentModels.ask({ principal, agentId, ask });
    if (!result.ok) throw refusal(result.error);
    c.get("logger").info(
      { agentId, change: result.value.change_id, by: principal.participantId },
      "model change asked",
    );
    return c.json(result.value, 202);
  });
}
