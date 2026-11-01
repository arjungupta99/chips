/**
 * `GET /v1/approvals/:id/wait?timeout=` — the long poll a pre-tool hook blocks on.
 *
 * The shell script in the blueprint is two curl calls: one to post the request, one to wait
 * here. A non-zero exit from the hook is a refusal to the harness, so what this returns has to
 * be enough to decide with, and nothing more.
 */

import type { Hono } from "hono";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

/** The ceiling on one poll. Longer than a load balancer will hold a connection open is useless. */
const MAX_TIMEOUT_SECONDS = 900;

export function registerApprovalRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.get("/v1/approvals/:approvalId/wait", async (c) => {
    const requested = Number.parseInt(c.req.query("timeout") ?? "60", 10);
    if (!Number.isFinite(requested) || requested < 0) {
      throw new HttpError("invalid_frame", "`timeout` is a number of seconds.");
    }
    const timeoutSeconds = Math.min(requested, MAX_TIMEOUT_SECONDS);

    const outcome = await deps.waitForApproval({
      workspaceId: c.get("principal").workspaceId,
      approvalId: c.req.param("approvalId"),
      timeoutSeconds,
    });

    if (outcome.kind === "not_found") {
      throw new HttpError("not_found", "No approval with that id in this workspace.");
    }

    const { approval } = outcome;
    c.get("logger").info(
      { approvalId: approval.approval_id, state: approval.state },
      "approval poll finished",
    );

    // `resolution` is the field the hook script reads. It is null while pending, so a script
    // can loop on it without parsing a state machine.
    return c.json({
      approval_id: approval.approval_id,
      run_id: approval.run_id,
      state: approval.state,
      resolution: approval.decision,
      scope: approval.scope,
      reason: approval.reason,
      resolved_by: approval.resolved_by,
      resolved_at: approval.resolved_at,
      updated_input: approval.updated_input,
      expires_at: approval.expires_at,
      fallback: approval.fallback,
    });
  });

  app.get("/v1/approvals/:approvalId", async (c) => {
    const approval = await deps.readModels.approval(
      c.get("principal").workspaceId,
      c.req.param("approvalId"),
    );
    if (approval === undefined) {
      throw new HttpError("not_found", "No approval with that id in this workspace.");
    }
    return c.json(approval);
  });
}
