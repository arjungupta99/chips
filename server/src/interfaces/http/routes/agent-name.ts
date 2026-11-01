/**
 * An agent's name (ADR 0091).
 *
 * `PUT /v1/agents/:id/name {name}` renames an agent, for everybody: a person's to do, never a
 * guest's and never a harness's, which names its agents when it registers them. A name somebody
 * here answers to already, case and spaces aside, is refused with who has it; the same name
 * again changes nothing and records nothing. From then on the agent keeps the name whatever its
 * harness asks for, and the directory (`GET /v1/participants`) carries it.
 */

import type { Hono } from "hono";
import type { AgentNameRefusal } from "../../../application/index.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

const STATUS = {
  not_allowed: "forbidden",
  unknown_agent: "not_found",
  invalid: "invalid_event",
  taken: "invalid_event",
} as const;

function readName(raw: string): string {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  const name = (body as { name?: unknown } | null)?.name;
  if (typeof name !== "string") throw new HttpError("invalid_event", "Say the name as `name`.");
  return name;
}

export function registerAgentNameRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.put("/v1/agents/:id/name", async (c) => {
    const agentId = c.req.param("id");
    const name = readName(c.get("rawBody"));
    const result = await deps.renameAgent({ principal: c.get("principal"), agentId, name });
    if (!result.ok) throw refusal(result.error);
    if (result.changed) c.get("logger").info({ agentId }, "agent renamed");
    return c.json({ agent_id: agentId, name: result.name });
  });
}

function refusal(error: AgentNameRefusal): HttpError {
  return new HttpError(STATUS[error.kind], error.message);
}
