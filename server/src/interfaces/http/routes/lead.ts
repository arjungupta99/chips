/**
 * Who leads a room (ADR 0104).
 *
 * - `POST /v1/spaces/:id/lead {agent_id: "agt_…" | null}`: one of the room's agents leads it, or
 *   nobody does. The lead hands out the work, and Chips hands it what was nobody's turn once the
 *   room goes still. Choosing the lead it has already changes nothing.
 *
 * A person's in the room who is not a guest; never a harness's.
 */

import type { Hono } from "hono";
import type { LeadRefusal } from "../../../application/index.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

const STATUS = {
  not_allowed: "forbidden",
  unknown_space: "not_found",
  not_there: "invalid_event",
} as const;

function readAgent(raw: string | undefined): string | null {
  let body: unknown;
  try {
    body = raw === undefined || raw === "" ? {} : JSON.parse(raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  const agent =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)["agent_id"]
      : undefined;
  if (agent === null || (typeof agent === "string" && agent.length > 0 && agent.length <= 120)) {
    return agent;
  }
  throw new HttpError("invalid_event", "Say who leads as `agent_id`, or `null` for nobody.");
}

export function registerLeadRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.post("/v1/spaces/:id/lead", async (c) => {
    const spaceId = c.req.param("id");
    const agentId = readAgent(c.get("rawBody"));
    const result = await deps.setLead({ principal: c.get("principal"), spaceId, agentId });
    if (!result.ok) throw refusal(result.error);
    if (result.changed)
      c.get("logger").info({ spaceId, lead: result.lead }, "a space's lead chosen");
    return c.json({ space_id: spaceId, agent_id: result.lead, changed: result.changed });
  });
}

function refusal(error: LeadRefusal): HttpError {
  return new HttpError(STATUS[error.kind], error.message);
}
