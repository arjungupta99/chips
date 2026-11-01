/**
 * The workspace's own name (ADR 0194).
 *
 * `POST /v1/workspace/name` — name the workspace again: `{ name }`. An owner's alone. Trimmed,
 * its spaces collapsed, one to 120 characters. The registry is written and `workspace.renamed`
 * recorded, which every device connected takes the name from at once; a device that connects
 * later is told by the hello (ADR 0193). The same name again changes nothing and records nothing.
 */

import type { Hono } from "hono";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

function readName(raw: string): string {
  let body: { name?: unknown };
  try {
    body = JSON.parse(raw === "" ? "{}" : raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  if (typeof body.name !== "string") {
    throw new HttpError("invalid_event", "Send the workspace's `name`.");
  }
  return body.name;
}

export function registerWorkspaceRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.post("/v1/workspace/name", async (c) => {
    const result = await deps.renameWorkspace({
      principal: c.get("principal"),
      name: readName(c.get("rawBody")),
    });
    if (!result.ok) {
      if (result.error.kind === "not_owner") throw new HttpError("forbidden", result.error.message);
      if (result.error.kind === "unknown_workspace")
        throw new HttpError("not_found", result.error.message);
      throw new HttpError("invalid_event", result.error.message);
    }
    const renamed = result.value;
    if (renamed.eventId !== undefined) {
      c.get("logger").info({ workspaceId: renamed.workspaceId }, "workspace renamed");
    }
    return c.json({
      workspace_id: renamed.workspaceId,
      name: renamed.name,
      previous_name: renamed.previousName,
      ...(renamed.eventId === undefined ? {} : { event_id: renamed.eventId }),
    });
  });
}
