/**
 * An agent's face (ADR 0089).
 *
 * `PUT /v1/agents/:id/face` gives an agent a mark and a ground, `{icon, ground}` as a space's
 * face is, and `DELETE /v1/agents/:id/face` gives it its initials back. A person's to do, never a
 * guest's and never a harness's. The face is one for everybody: it is recorded as
 * `agent.updated`, and the directory (`GET /v1/participants`) carries it as `face`. The same face
 * again changes nothing and records nothing.
 */

import { parseSpaceIcon } from "@chipschat/protocol";
import type { Hono } from "hono";
import type { FaceRefusal } from "../../../application/index.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

function refusal(error: FaceRefusal): HttpError {
  return new HttpError(error.kind === "not_allowed" ? "forbidden" : "not_found", error.message);
}

function readFace(raw: string) {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  const parsed = parseSpaceIcon(body);
  if (!parsed.ok) throw new HttpError("invalid_event", `Not a face: ${parsed.message}`);
  return parsed.value;
}

export function registerAgentFaceRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.put("/v1/agents/:id/face", async (c) => {
    const agentId = c.req.param("id");
    const face = readFace(c.get("rawBody"));
    const result = await deps.setAgentFace({ principal: c.get("principal"), agentId, face });
    if (!result.ok) throw refusal(result.error);
    if (result.changed) c.get("logger").info({ agentId }, "agent face set");
    return c.json({ agent_id: agentId, face: result.face });
  });

  app.delete("/v1/agents/:id/face", async (c) => {
    const agentId = c.req.param("id");
    const result = await deps.setAgentFace({ principal: c.get("principal"), agentId, face: null });
    if (!result.ok) throw refusal(result.error);
    if (result.changed) c.get("logger").info({ agentId }, "agent face cleared");
    return c.body(null, 204);
  });
}
