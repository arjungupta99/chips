/**
 * What a harness runs on its own (ADR 0299).
 *
 * - `PUT /v1/harnesses/:id/own-rules`: the harness's copy of what its own settings let through,
 *   whole.
 * - `GET /v1/harnesses/:id/own-rules`: the copy and when Chips heard it, for the harness's owner
 *   or an owner or admin of the workspace; `null` for both before the harness sends one.
 */

import { type OwnRulesRead, ownRules } from "@chipschat/protocol";
import type { Hono } from "hono";
import type { OwnRulesRefusal } from "../../../application/use-cases/own-rules.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";
import { body } from "./body.js";

const STATUS = { not_allowed: "forbidden", unknown: "not_found" } as const;

const refusal = (error: OwnRulesRefusal): HttpError =>
  new HttpError(STATUS[error.kind], error.message);

export function registerOwnRulesRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.put("/v1/harnesses/:id/own-rules", async (c) => {
    const sent = body(
      ownRules,
      c.get("rawBody"),
      "Send where you read your own settings and what they let through without asking.",
    );
    const result = await deps.ownRules.put({
      principal: c.get("principal"),
      harnessId: c.req.param("id"),
      ownRules: sent,
    });
    if (!result.ok) throw refusal(result.error);
    return c.json({ heard_at: result.value.heardAt });
  });

  app.get("/v1/harnesses/:id/own-rules", async (c) => {
    const result = await deps.ownRules.read({
      principal: c.get("principal"),
      harnessId: c.req.param("id"),
    });
    if (!result.ok) throw refusal(result.error);
    const view: OwnRulesRead = {
      own_rules: result.value?.ownRules ?? null,
      heard_at: (result.value?.heardAt ?? null) as OwnRulesRead["heard_at"],
    };
    return c.json(view);
  });
}
