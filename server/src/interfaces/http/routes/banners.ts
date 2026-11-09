/**
 * What a person wants of the gold banner a space shows while an agent works without asking (8
 * November 2026, ADR 0286).
 *
 * `GET /v1/me/banners` reads the caller's. `PUT` and `DELETE` on `choices/:target` show it or not
 * for an agent or a harness, or take that back; a harness's takes all its agents with it, so one set
 * apart comes back in line. `PUT` and `DELETE` on `closed/:spaceId/:asker` close one banner for now
 * or show it again. Each goes to the caller's sockets that said `banners`, so their other devices
 * draw it at once. Theirs alone, as the rooms they hid are: no route reads or writes another
 * person's, an owner's or an admin's included.
 *
 * It changes what a person sees and nothing about what an agent may do.
 */

import { bannerChoiceBody, closedBannerBody } from "@chipschat/protocol";
import type { Hono } from "hono";
import type { Principal } from "../../../application/ports/identity.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";
import { body } from "./body.js";

function person(principal: Principal): Principal {
  if (principal.kind !== "person") {
    throw new HttpError("forbidden", "What the banner shows is a person's own.");
  }
  return principal;
}

export function registerBannerRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.get("/v1/me/banners", async (c) => {
    const me = person(c.get("principal"));
    return c.json(await deps.banners.forPerson(me.workspaceId, me.participantId));
  });

  app.put("/v1/me/banners/choices/:target", async (c) => {
    const me = person(c.get("principal"));
    const { shown } = body(
      bannerChoiceBody,
      c.get("rawBody"),
      "Send `shown`: whether you want the banner.",
    );
    const target = await chosen(deps, me, c.req.param("target"));
    const at = deps.clock.nowIso();
    const { workspaceId, participantId } = me;
    if (target.kind === "harness") {
      const agents = await deps.readModels.agentsOf(workspaceId, target.id);
      await deps.banners.chooseForHarness({
        workspaceId,
        participantId,
        harnessId: target.id,
        agentIds: agents.map((agent) => agent.agent_id),
        shown,
        at,
      });
    } else {
      await deps.banners.choose({ workspaceId, participantId, target: target.id, shown, at });
    }
    await tell(deps, me);
    return c.body(null, 204);
  });

  app.delete("/v1/me/banners/choices/:target", async (c) => {
    const me = person(c.get("principal"));
    const target = await chosen(deps, me, c.req.param("target"));
    await deps.banners.unchoose({
      workspaceId: me.workspaceId,
      participantId: me.participantId,
      target: target.id,
    });
    await tell(deps, me);
    return c.body(null, 204);
  });

  app.put("/v1/me/banners/closed/:spaceId/:asker", async (c) => {
    const me = person(c.get("principal"));
    const spaceId = c.req.param("spaceId");
    await seen(deps, me, spaceId);
    const { since } = body(
      closedBannerBody,
      c.get("rawBody"),
      "Send `since`: when the yes this banner stands for was given.",
    );
    await deps.banners.close({
      workspaceId: me.workspaceId,
      participantId: me.participantId,
      spaceId,
      asker: c.req.param("asker"),
      since,
      at: deps.clock.nowIso(),
    });
    await tell(deps, me);
    return c.body(null, 204);
  });

  app.delete("/v1/me/banners/closed/:spaceId/:asker", async (c) => {
    const me = person(c.get("principal"));
    const spaceId = c.req.param("spaceId");
    await seen(deps, me, spaceId);
    await deps.banners.reopen({
      workspaceId: me.workspaceId,
      participantId: me.participantId,
      spaceId,
      asker: c.req.param("asker"),
    });
    await tell(deps, me);
    return c.body(null, 204);
  });
}

/** The whole of it, to every socket of this person that hears it. */
async function tell(deps: GatewayDeps, me: Principal): Promise<void> {
  const view = await deps.banners.forPerson(me.workspaceId, me.participantId);
  deps.sessions.banners(me.workspaceId, me.participantId, { frame: "banners", ...view });
}

/** An agent or a harness in this workspace, or a `not_found` like any other. */
async function chosen(
  deps: GatewayDeps,
  me: Principal,
  id: string,
): Promise<{ readonly id: string; readonly kind: "agent" | "harness" }> {
  const found = await deps.readModels.participant(me.workspaceId, id);
  if (found === undefined || found.kind === "person") {
    throw new HttpError("not_found", "No such agent or harness.");
  }
  return { id: found.id, kind: found.kind };
}

/** A room the caller is in, or a `not_found` that says nothing about whether it exists. */
async function seen(deps: GatewayDeps, me: Principal, spaceId: string): Promise<void> {
  const role = await deps.readModels.memberRole(me.workspaceId, spaceId, me.participantId);
  if (role === undefined) throw new HttpError("not_found", "No such space.");
}
