/**
 * A person's devices (ADR 0034): `GET /v1/devices` lists their own, `GET /v1/people/:id/devices`
 * somebody's for an owner or an admin, who may already withdraw them (ADR 0209: a person's page
 * says which phones they're on and when each was last seen), and `DELETE /v1/devices/:id`
 * withdraws one — their own, or anybody's for an owner or admin, which is how a person is put
 * out of a workspace without touching their passkeys, which are theirs alone. An admin does not
 * withdraw an owner's, though (Gate 5): the rank that keeps an admin from changing an owner's
 * role keeps them from locking an owner out. A withdrawn device is refused at its next request
 * and its sockets are closed now, as a revoked token's are (ADR 0023). Its push token goes with
 * it: a phone that may no longer read the ask is not told there is one.
 */

import type { Hono } from "hono";
import type { Principal } from "../../../application/ports/identity.js";
import type { DeviceView } from "../../../application/use-cases/pair-device.js";
import { administers, outranks } from "../../../domain/index.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";

function person(principal: Principal): Principal {
  if (principal.kind !== "person") {
    throw new HttpError("forbidden", "Devices are a person's. A harness has tokens.");
  }
  return principal;
}

/** The device named, live, or not found. */
async function liveDevice(deps: GatewayDeps, workspaceId: string, deviceId: string) {
  const device = await deps.devices.device(workspaceId, deviceId);
  if (device === undefined || device.revokedAt !== null) {
    throw new HttpError("not_found", "No live device of that id here.");
  }
  return device;
}

/** Somebody else's device is withdrawn by an owner or admin, and an owner's only by an owner. */
async function refuseAnothers(deps: GatewayDeps, me: Principal, device: DeviceView) {
  if (device.participantId === me.participantId) return;
  if (!administers(me.role)) {
    throw new HttpError("forbidden", "Only its person, or an owner or admin, withdraws a device.");
  }
  const theirs = await deps.readModels.workspaceRole(me.workspaceId, device.participantId);
  if (outranks(theirs ?? "member", me.role ?? "member")) {
    throw new HttpError("forbidden", "An admin does not withdraw an owner's device.");
  }
}

/** A person's devices as the wire says them, the one asking marked. */
function listed(devices: readonly DeviceView[], asking: Principal) {
  return {
    devices: devices.map((device) => ({
      device_id: device.deviceId,
      name: device.name,
      paired_at: device.pairedAt,
      last_seen_at: device.lastSeenAt,
      revoked_at: device.revokedAt,
      current: device.deviceId === asking.deviceId,
    })),
  };
}

export function registerDeviceRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.get("/v1/devices", async (c) => {
    const principal = person(c.get("principal"));
    const devices = await deps.devices.devicesOf(principal.workspaceId, principal.participantId);
    return c.json(listed(devices, principal));
  });

  app.get("/v1/people/:id/devices", async (c) => {
    const principal = person(c.get("principal"));
    const personId = c.req.param("id");
    if (personId !== principal.participantId && !administers(principal.role)) {
      throw new HttpError("forbidden", "Only an owner or an admin reads somebody else's devices.");
    }
    const role = await deps.readModels.workspaceRole(principal.workspaceId, personId);
    if (role === undefined) throw new HttpError("not_found", "Nobody of that id is here.");
    const devices = await deps.devices.devicesOf(principal.workspaceId, personId);
    return c.json(listed(devices, principal));
  });

  app.delete("/v1/devices/:id", async (c) => {
    const principal = person(c.get("principal"));
    const deviceId = c.req.param("id");
    const device = await liveDevice(deps, principal.workspaceId, deviceId);
    await refuseAnothers(deps, principal, device);
    const at = deps.clock.nowIso();
    await deps.devices.revokeDevice({ workspaceId: principal.workspaceId, deviceId, at });
    // And where it could be reached (M4.3). A push to a phone that may no longer read anything
    // is a banner about a decision it cannot open.
    await deps.push.remove(deviceId);
    const closed = deps.sessions.closeDevice(deviceId);
    c.get("logger").info({ deviceId, closed }, "device withdrawn");
    return c.json({ device_id: deviceId, revoked_at: at, sockets_closed: closed });
  });
}
