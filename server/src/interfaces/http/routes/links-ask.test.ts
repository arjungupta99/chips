/**
 * Links that ask before they let anyone in (ADR 0232), over HTTP, on a server with a relay: an
 * invite redeemed, or a pairing code used, waits for the one person who handed it out, with six
 * digits from the joining device's key; nothing exists until they allow it; and nobody else sees
 * or decides it. With no relay a link lets its person in at once, as `invites.test.ts` has it.
 */

import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { keyCode, signingPayload } from "../../../infrastructure/auth/credentials.js";
import {
  createTestWorkspace,
  type TestPerson,
  type TestWorkspace,
} from "../../../testing/workspace.js";

let ws: TestWorkspace;
const BASE = "http://chips.local";

beforeEach(async () => {
  ws = await createTestWorkspace({
    config: {
      relay: {
        url: "wss://relay.example",
        host: "127.0.0.1",
        port: 4440,
        maxSessionsPerServer: 32,
      },
    },
  });
});
afterEach(async () => {
  await ws.close();
});

type Env = { relay: { from: string } } | { lan: { from: string } };

async function call(
  method: string,
  path: string,
  options: { body?: unknown; as?: TestPerson; env?: Env } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const raw = options.body === undefined ? "" : JSON.stringify(options.body);
  const response = await ws.gateway.app.fetch(
    new Request(`${BASE}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(options.as === undefined ? {} : options.as.sign(method, path, raw)),
      },
      ...(raw === "" ? {} : { body: raw }),
    }),
    options.env,
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/** A fresh device key, and what a request it signs carries. */
function newDevice() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const signs = (deviceId: string, method: string, target: string) => {
    const timestamp = Date.now();
    const payload = signingPayload({ method, target, timestamp, body: "" });
    return {
      "x-chips-device": deviceId,
      "x-chips-timestamp": String(timestamp),
      "x-chips-signature": sign(null, Buffer.from(payload, "utf8"), privateKey).toString("base64"),
    };
  };
  return { spki, signs };
}

async function invite(role = "guest") {
  const made = await call("POST", "/v1/invites", { as: ws.arjun, body: { role } });
  expect(made.status).toBe(201);
  return String(made.body["token"]);
}

async function redeem(token: string, key: string, name = "Priya") {
  return await call("POST", "/v1/invites/redeem", {
    body: { token, display_name: name, public_key: key, device_name: "Priya's iPhone" },
  });
}

async function poll(waiting: Record<string, unknown>) {
  return await call("POST", `/v1/join/${String(waiting["request_id"])}/redeem`, {
    body: { secret: waiting["secret"] },
  });
}

async function people(): Promise<string[]> {
  const rows = await ws.db.selectFrom("participants").select("display_name").execute();
  return rows.map((row) => row.display_name);
}

describe("an invite through the relay's page", () => {
  it("waits for its maker's Allow, showing six digits from the key, and lets nobody in until then", async () => {
    const token = await invite();
    const priya = newDevice();
    const waiting = await redeem(token, priya.spki);
    expect(waiting.status).toBe(202);
    expect(waiting.body).toMatchObject({
      state: "waiting",
      code: keyCode(priya.spki),
      interval: 3,
    });
    expect(String(waiting.body["code"])).toMatch(/^[0-9]{6}$/);
    expect(await people()).not.toContain("Priya");
    expect((await poll(waiting.body)).status).toBe(202);

    // Arjun's list has it, with the same code to compare, and what she joins as.
    const listed = await call("GET", "/v1/join?state=waiting", { as: ws.arjun });
    expect(listed.body["requests"]).toEqual([
      expect.objectContaining({
        request_id: waiting.body["request_id"],
        kind: "invite",
        code: waiting.body["code"],
        name: "Priya",
        machine: "Priya's iPhone",
        role: "guest",
      }),
    ]);

    const allowed = await call("POST", `/v1/join/${String(waiting.body["request_id"])}/allow`, {
      as: ws.arjun,
      body: { capabilities: [] },
    });
    expect(allowed.status).toBe(200);
    const joined = await poll(waiting.body);
    expect(joined.status).toBe(200);
    expect(joined.body).toMatchObject({ kind: "device", display_name: "Priya", role: "guest" });
    expect(await people()).toContain("Priya");

    // The device it paired signs from its first request.
    const deviceId = String(joined.body["device_id"]);
    const devices = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/devices`, { headers: priya.signs(deviceId, "GET", "/v1/devices") }),
    );
    expect(devices.status).toBe(200);

    // Spent once collected: a one-use link takes nobody else.
    expect((await redeem(token, newDevice().spki, "Mallory")).status).toBe(401);
  });

  it("lets nothing in when its maker says no", async () => {
    const waiting = await redeem(await invite(), newDevice().spki);
    const id = String(waiting.body["request_id"]);
    expect((await call("DELETE", `/v1/join/${id}`, { as: ws.arjun })).status).toBe(200);
    const polled = await poll(waiting.body);
    expect(polled.status).toBe(403);
    expect(await people()).not.toContain("Priya");
  });

  it("is seen and decided by its maker alone, not by another owner or an admin", async () => {
    const waiting = await redeem(await invite(), newDevice().spki);
    const id = String(waiting.body["request_id"]);
    for (const other of [await ws.addPerson("Sam", "owner"), await ws.addPerson("Lee", "admin")]) {
      const listed = await call("GET", "/v1/join?state=waiting", { as: other });
      expect(listed.body["requests"]).toEqual([]);
      expect((await call("GET", `/v1/join/${id}`, { as: other })).status).toBe(404);
      const allowed = await call("POST", `/v1/join/${id}/allow`, {
        as: other,
        body: { capabilities: [] },
      });
      expect(allowed.status).toBe(404);
    }
    expect((await call("POST", `/v1/join/${id}/allow`, { as: ws.dana, body: {} })).status).toBe(
      403,
    );
    expect((await poll(waiting.body)).status).toBe(202);
  });

  it("lets several wait on one link, and the one allowed spends it", async () => {
    const token = await invite();
    const stranger = await redeem(token, newDevice().spki, "Priya N");
    const priya = await redeem(token, newDevice().spki);
    expect(stranger.body["code"]).not.toBe(priya.body["code"]);
    await call("POST", `/v1/join/${String(priya.body["request_id"])}/allow`, {
      as: ws.arjun,
      body: { capabilities: [] },
    });
    expect((await poll(priya.body)).status).toBe(200);
    await call("POST", `/v1/join/${String(stranger.body["request_id"])}/allow`, {
      as: ws.arjun,
      body: { capabilities: [] },
    });
    const late = await poll(stranger.body);
    expect(late.status).toBe(403);
    expect(late.body).toMatchObject({ error: { refusal: "spent" } });
  });
});

describe("a pairing code through the relay's page", () => {
  async function code(by: TestPerson): Promise<string> {
    const issued = await call("POST", "/v1/pairing-codes", { as: by });
    expect(String(issued.body["link"])).toMatch(/^https:\/\/relay\.example\/pair#/);
    return String(issued.body["code"]);
  }

  async function pair(code: string, key: string, env?: Env) {
    return await call("POST", "/v1/pair", {
      body: { code, public_key: key, name: "Studio" },
      ...(env === undefined ? {} : { env }),
    });
  }

  it("waits for the person whose device made it, typed or scanned, and pairs as them", async () => {
    // A code read from a QR comes in through the tunnel; a typed one plainly. Both wait.
    for (const env of [undefined, { relay: { from: "203.0.113.9" } }]) {
      const mac = newDevice();
      const waiting = await pair(await code(ws.arjun), mac.spki, env);
      expect(waiting.status).toBe(202);
      expect(waiting.body).toMatchObject({ state: "waiting", code: keyCode(mac.spki) });
      const listed = await call("GET", "/v1/join?state=waiting", { as: ws.arjun });
      expect(listed.body["requests"]).toEqual([
        expect.objectContaining({ kind: "pairing", name: "Studio", code: keyCode(mac.spki) }),
      ]);
      await call("POST", `/v1/join/${String(waiting.body["request_id"])}/allow`, {
        as: ws.arjun,
        body: { capabilities: [] },
      });
      const paired = await poll(waiting.body);
      expect(paired.status).toBe(200);
      expect(paired.body).toMatchObject({
        kind: "device",
        participant_id: ws.arjun.participantId,
      });
    }
  });

  it("is a member's own to allow, and no owner's", async () => {
    const waiting = await pair(await code(ws.dana), newDevice().spki);
    const id = String(waiting.body["request_id"]);
    const arjuns = await call("GET", "/v1/join?state=waiting", { as: ws.arjun });
    expect(arjuns.body["requests"]).toEqual([]);
    expect((await call("GET", `/v1/join/${id}`, { as: ws.arjun })).status).toBe(404);
    const danas = await call("GET", "/v1/join?state=waiting", { as: ws.dana });
    expect(danas.body["requests"]).toEqual([expect.objectContaining({ request_id: id })]);
    await call("POST", `/v1/join/${id}/allow`, { as: ws.dana, body: { capabilities: [] } });
    const paired = await poll(waiting.body);
    expect(paired.body).toMatchObject({ participant_id: ws.dana.participantId });
  });

  it("signs the old phone out only once a reconnecting one is allowed (ADR 0236)", async () => {
    const issued = await call("POST", "/v1/pairing-codes", {
      as: ws.arjun,
      body: { for: ws.dana.participantId, replaces: ws.dana.deviceId },
    });
    expect(issued.status).toBe(201);
    const waiting = await pair(String(issued.body["code"]), newDevice().spki);
    expect(waiting.status).toBe(202);
    const live = async () =>
      (
        await ws.db
          .selectFrom("devices")
          .select("revoked_at")
          .where("id", "=", ws.dana.deviceId)
          .executeTakeFirstOrThrow()
      ).revoked_at === null;
    expect(await live()).toBe(true);
    await call("POST", `/v1/join/${String(waiting.body["request_id"])}/allow`, {
      as: ws.arjun,
      body: { capabilities: [] },
    });
    const paired = await poll(waiting.body);
    expect(paired.body).toMatchObject({ kind: "device", participant_id: ws.dana.participantId });
    expect(await live()).toBe(false);
  });

  it("is spent by the first device to use it, as before", async () => {
    const used = await code(ws.arjun);
    expect((await pair(used, newDevice().spki)).status).toBe(202);
    expect((await pair(used, newDevice().spki)).status).toBe(401);
  });
});
