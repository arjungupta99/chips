/**
 * Where a push may reach this phone (M4.3, ADR 0045).
 *
 * `PUT /v1/me/push-token` registers the token Expo issued this installation, the platform, and
 * the phone's own IANA zone — which is what quiet hours are computed in, since the server's
 * clock says nothing about when it is ten at night where the phone is — and, from a phone with a
 * notification extension, `seal_key`: the 32 bytes the words of a push are sealed to (ADR 0158),
 * base64. It is kept and never sent back. `DELETE` forgets it all.
 *
 * Both are a person's own device and nobody else's, as the notification routes are: the token
 * belongs to the installation that holds the key, and there is no route by which one person
 * registers, reads or removes another's.
 */

import type { Hono } from "hono";
import type { Principal } from "../../../application/ports/identity.js";
import type { PushPlatform } from "../../../application/ports/push.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

const PLATFORMS: readonly string[] = ["ios", "android"];

/** Expo's own token, and long enough to hold an APNs or FCM one if a later sender wants it. */
const MAX_TOKEN = 500;

/** IANA zone names are short; this is room to spare. */
const MAX_ZONE = 100;

/** An AES-256 key: 32 bytes, which base64 writes in 44 characters. */
const SEAL_KEY_BYTES = 32;

function person(principal: Principal): Principal & { readonly deviceId: string } {
  if (principal.kind !== "person" || principal.deviceId === undefined) {
    throw new HttpError("forbidden", "A push token belongs to a person's device.");
  }
  return { ...principal, deviceId: principal.deviceId };
}

interface Registration {
  readonly token: string;
  readonly platform: PushPlatform;
  readonly timeZone: string;
  readonly sealKey?: string | undefined;
}

/** A sealing key is base64 of exactly 32 bytes; anything else is refused, never kept half-right. */
function readSealKey(sealKey: unknown): string | undefined {
  if (sealKey === undefined || sealKey === null) return undefined;
  const bytes =
    typeof sealKey === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(sealKey)
      ? Buffer.from(sealKey, "base64")
      : undefined;
  if (bytes?.length !== SEAL_KEY_BYTES || bytes.toString("base64") !== sealKey) {
    throw new HttpError("invalid_event", "Send `seal_key` as base64 of 32 bytes, or leave it out.");
  }
  return sealKey;
}

function readRegistration(raw: string): Registration {
  let body: { token?: unknown; platform?: unknown; time_zone?: unknown; seal_key?: unknown };
  try {
    body = JSON.parse(raw === "" ? "{}" : raw);
  } catch {
    throw new HttpError("invalid_event", "The body is not JSON.");
  }
  const { token, platform, time_zone: timeZone } = body;
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN) {
    throw new HttpError("invalid_event", "Send `token`: the one the push service issued.");
  }
  if (typeof platform !== "string" || !PLATFORMS.includes(platform)) {
    throw new HttpError("invalid_event", "Send `platform`: `ios` or `android`.");
  }
  if (typeof timeZone !== "string" || timeZone.length === 0 || timeZone.length > MAX_ZONE) {
    throw new HttpError("invalid_event", "Send `time_zone`: this phone's own IANA zone.");
  }
  const sealKey = readSealKey(body.seal_key);
  return {
    token,
    platform: platform as PushPlatform,
    timeZone,
    ...(sealKey === undefined ? {} : { sealKey }),
  };
}

export function registerPushRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.put("/v1/me/push-token", async (c) => {
    const me = person(c.get("principal"));
    const registration = readRegistration(c.get("rawBody"));
    await deps.push.register({
      workspaceId: me.workspaceId,
      participantId: me.participantId,
      deviceId: me.deviceId,
      token: registration.token,
      platform: registration.platform,
      timeZone: registration.timeZone,
      ...(registration.sealKey === undefined ? {} : { sealKey: registration.sealKey }),
      at: deps.clock.nowIso(),
    });
    return c.json({
      device_id: me.deviceId,
      platform: registration.platform,
      sealed: registration.sealKey !== undefined,
    });
  });

  app.delete("/v1/me/push-token", async (c) => {
    const me = person(c.get("principal"));
    await deps.push.remove(me.deviceId);
    return c.json({ device_id: me.deviceId, removed: true });
  });
}
