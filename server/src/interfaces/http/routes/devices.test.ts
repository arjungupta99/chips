/**
 * A person's devices (ADR 0034): listed by their person, withdrawn by their person or by an
 * owner or admin, and refused at the next request once withdrawn.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestWorkspace,
  type TestPerson,
  type TestWorkspace,
} from "../../../testing/workspace.js";

let ws: TestWorkspace;
const BASE = "http://chips.local";

beforeEach(async () => {
  ws = await createTestWorkspace();
});
afterEach(async () => {
  await ws.close();
});

async function call(method: string, path: string, as: TestPerson) {
  const response = await ws.gateway.app.fetch(
    new Request(`${BASE}${path}`, { method, headers: as.sign(method, path, "") }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe("GET /v1/devices", () => {
  it("lists a person's own devices, marking the one asking", async () => {
    const listed = await call("GET", "/v1/devices", ws.arjun);
    expect(listed.status).toBe(200);
    expect(listed.body["devices"]).toEqual([
      expect.objectContaining({
        device_id: ws.arjun.deviceId,
        name: "Arjun's laptop",
        current: true,
        revoked_at: null,
      }),
    ]);
    const harness = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/devices`, { headers: ws.scout.headers }),
    );
    expect(harness.status).toBe(403);
  });
});

describe("GET /v1/people/:id/devices", () => {
  it("gives an owner or an admin somebody's devices, and nobody else another's", async () => {
    const path = `/v1/people/${ws.dana.participantId}/devices`;
    const byOwner = await call("GET", path, ws.arjun);
    expect(byOwner.status).toBe(200);
    expect(byOwner.body["devices"]).toEqual([
      expect.objectContaining({ device_id: ws.dana.deviceId, current: false, revoked_at: null }),
    ]);
    const priya = await ws.addPerson("Priya", "admin");
    expect((await call("GET", path, priya)).status).toBe(200);
    const own = await call("GET", path, ws.dana);
    expect(own.body["devices"]).toEqual([
      expect.objectContaining({ device_id: ws.dana.deviceId, current: true }),
    ]);
    const leo = await ws.addPerson("Leo", "member");
    expect((await call("GET", path, leo)).status).toBe(403);
    expect((await call("GET", "/v1/people/usr_nobody/devices", ws.arjun)).status).toBe(404);
  });
});

describe("DELETE /v1/devices/:id", () => {
  it("lets a member withdraw their own device and not another's, and an owner anybody's", async () => {
    const notHers = await call("DELETE", `/v1/devices/${ws.arjun.deviceId}`, ws.dana);
    expect(notHers.status).toBe(403);
    expect(
      (await call("DELETE", "/v1/devices/dev_01K4ZQPX00000000000000000Z", ws.arjun)).status,
    ).toBe(404);

    const byOwner = await call("DELETE", `/v1/devices/${ws.dana.deviceId}`, ws.arjun);
    expect(byOwner.status).toBe(200);
    expect(byOwner.body).toMatchObject({ device_id: ws.dana.deviceId, sockets_closed: 0 });
    // Dana's next request is refused; the list Arjun sees for himself is unchanged.
    expect((await call("GET", "/v1/devices", ws.dana)).status).toBe(401);
    expect((await call("DELETE", `/v1/devices/${ws.dana.deviceId}`, ws.arjun)).status).toBe(404);

    const own = await call("DELETE", `/v1/devices/${ws.arjun.deviceId}`, ws.arjun);
    expect(own.status).toBe(200);
    expect((await call("GET", "/v1/devices", ws.arjun)).status).toBe(401);
  });

  it("lets an admin withdraw a member's device and another admin's, and never an owner's (Gate 5)", async () => {
    const priya = await ws.addPerson("Priya", "admin");
    const sam = await ws.addPerson("Sam", "admin");
    const ownersDevice = await call("DELETE", `/v1/devices/${ws.arjun.deviceId}`, priya);
    expect(ownersDevice.status).toBe(403);
    expect(ownersDevice.body["error"]).toMatchObject({ message: expect.stringMatching(/owner/) });
    // The owner is still here.
    expect((await call("GET", "/v1/devices", ws.arjun)).status).toBe(200);
    expect((await call("DELETE", `/v1/devices/${sam.deviceId}`, priya)).status).toBe(200);
    expect((await call("DELETE", `/v1/devices/${ws.dana.deviceId}`, priya)).status).toBe(200);
  });
});
