/**
 * An agent archived, unarchived, deleted or locked by a person (ADR 0095, ADR 0199).
 *
 * - `PUT /v1/agents/:id/state {state: "archived" | "active"}`: archive it, as its harness would,
 *   or bring it back to the room it left. The same state again changes nothing.
 * - `DELETE /v1/agents/:id`: delete it, for everybody. `{delete_room: true}` erases its room with
 *   it, for a room's one agent, as `DELETE /v1/spaces/:id` takes `{delete_agent: true}`.
 * - `POST /v1/agents/:id/lock {locked: boolean}`: lock its changes, so that no person renames,
 *   archives or deletes it, or let them go (ADR 0199). Saying what it is already changes nothing.
 *
 * Its harness's owner's to do, or an owner's or admin's of the workspace; never a guest's, never a
 * harness's, and never to the Main agent. While it is locked, a person's rename, archive and
 * delete are refused, and an unarchive still lands.
 */

import type { Hono } from "hono";
import type { AgentKeepRefusal, EraseFailure } from "../../../application/index.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

const STATUS = {
  not_allowed: "forbidden",
  unknown_agent: "not_found",
  unknown_space: "not_found",
  invalid: "invalid_event",
  agent_deleted: "not_found",
} as const;

function readBody(raw: string | undefined): Record<string, unknown> {
  if (raw === undefined || raw === "") return {};
  try {
    const body: unknown = JSON.parse(raw);
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
}

function readLocked(raw: string | undefined): boolean {
  const locked = readBody(raw)["locked"];
  if (typeof locked === "boolean") return locked;
  throw new HttpError("invalid_event", "Say whether the agent's changes are locked as `locked`.");
}

function readState(raw: string | undefined): "active" | "archived" {
  const state = readBody(raw)["state"];
  if (state === "active" || state === "archived") return state;
  throw new HttpError("invalid_event", "Say the state as `state`: `archived` or `active`.");
}

export function registerAgentKeepRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.put("/v1/agents/:id/state", async (c) => {
    const agentId = c.req.param("id");
    const state = readState(c.get("rawBody"));
    const result = await deps.archiveAgent({ principal: c.get("principal"), agentId, state });
    if (!result.ok) throw refusal(result.error);
    if (result.changed) c.get("logger").info({ agentId, state }, "agent archived or unarchived");
    return c.json({ agent_id: agentId, state: result.state });
  });

  app.post("/v1/agents/:id/lock", async (c) => {
    const agentId = c.req.param("id");
    const locked = readLocked(c.get("rawBody"));
    const result = await deps.setAgentLock({ principal: c.get("principal"), agentId, locked });
    if (!result.ok) throw refusal(result.error);
    if (result.changed) {
      c.get("logger").info(
        { agentId, locked: result.locked },
        "an agent's changes locked or let go",
      );
    }
    return c.json({ agent_id: agentId, locked: result.locked, changed: result.changed });
  });

  app.delete("/v1/agents/:id", async (c) => {
    const agentId = c.req.param("id");
    const deleteRoom = readBody(c.get("rawBody"))["delete_room"] === true;
    const result = await deps.deleteAgent({ principal: c.get("principal"), agentId, deleteRoom });
    if (!result.ok) throw refusal(result.error);
    c.get("logger").info({ agentId, room: result.room }, "agent deleted");
    return c.json({
      agent_id: agentId,
      room: result.room,
      ...(result.erased === undefined ? {} : { erased: result.erased }),
    });
  });
}

function refusal(error: AgentKeepRefusal | EraseFailure): HttpError {
  return new HttpError(STATUS[error.kind], error.message);
}
