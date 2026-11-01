/**
 * A person's notifications (M5.6): their settings, and the claims that keep a banner to one
 * device.
 *
 * `GET /v1/me/notifications` reads the caller's settings — the defaults, until they save any —
 * and `PUT /v1/me/notifications` replaces them, validated against the protocol's schema. Both
 * are the person's own: no route reads another person's, an owner's or admin's included,
 * since a shared server holds private things and shows them to nobody (Gate 5's focus).
 *
 * `POST /v1/me/notifications/claims` takes `{ keys }` and answers `{ granted }`: the keys this
 * device may raise a banner for. A key another device of the same person claimed first is not
 * among them, which is what makes "exactly one notification per event per person" true.
 */

import { parseNotificationSettings } from "@chipschat/protocol";
import type { Hono } from "hono";
import type { Principal } from "../../../application/ports/identity.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

const MAX_KEYS = 200;

function person(principal: Principal): Principal & { readonly deviceId: string } {
  if (principal.kind !== "person" || principal.deviceId === undefined) {
    throw new HttpError("forbidden", "Notifications are a person's, on a device.");
  }
  return { ...principal, deviceId: principal.deviceId };
}

function readKeys(raw: string): string[] {
  let body: { keys?: unknown };
  try {
    body = JSON.parse(raw === "" ? "{}" : raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  if (!Array.isArray(body.keys) || body.keys.length > MAX_KEYS) {
    throw new HttpError("invalid_event", `Send \`keys\`: up to ${MAX_KEYS} of them.`);
  }
  const keys = body.keys.filter(
    (key): key is string => typeof key === "string" && key.length > 0 && key.length <= 200,
  );
  if (keys.length !== body.keys.length) {
    throw new HttpError("invalid_event", "A key is a short string.");
  }
  return keys;
}

export function registerNotificationRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.get("/v1/me/notifications", async (c) => {
    const me = person(c.get("principal"));
    const settings = await deps.notifications.settings(me.workspaceId, me.participantId);
    return c.json({ settings: settings ?? null });
  });

  app.put("/v1/me/notifications", async (c) => {
    const me = person(c.get("principal"));
    let raw: unknown;
    try {
      raw = JSON.parse(c.get("rawBody"));
    } catch {
      throw new HttpError("invalid_event", "The body is not JSON.");
    }
    const parsed = parseNotificationSettings(raw);
    if (!parsed.ok) throw new HttpError("invalid_event", `Not settings: ${parsed.message}`);
    // An app older than ADR 0198 sends no word per room: the words saved stand.
    const saved =
      parsed.value.spaces === undefined
        ? (await deps.notifications.settings(me.workspaceId, me.participantId))?.spaces
        : undefined;
    const settings = saved === undefined ? parsed.value : { ...parsed.value, spaces: saved };
    await deps.notifications.saveSettings({
      workspaceId: me.workspaceId,
      participantId: me.participantId,
      settings,
      at: deps.clock.nowIso(),
    });
    return c.json({ settings });
  });

  app.post("/v1/me/notifications/claims", async (c) => {
    const me = person(c.get("principal"));
    const keys = readKeys(c.get("rawBody"));
    const granted = await deps.notifications.claim({
      workspaceId: me.workspaceId,
      participantId: me.participantId,
      deviceId: me.deviceId,
      keys,
      at: deps.clock.nowIso(),
    });
    return c.json({ granted });
  });
}
