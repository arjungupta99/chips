/**
 * Passkeys over HTTP (ADR 0034), with the real verifier and a pretend authenticator: a person
 * on a paired device registers one; a new device signs in with it and speaks as that person
 * from its first request; a withdrawn passkey signs nobody in; and the door with no credential
 * behind it is rate limited.
 */

import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signingPayload } from "../../../infrastructure/auth/credentials.js";
import { fakeAuthenticator } from "../../../testing/webauthn.js";
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

async function call(
  method: string,
  path: string,
  options: { body?: unknown; as?: TestPerson; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const raw = options.body === undefined ? "" : JSON.stringify(options.body);
  const response = await ws.gateway.app.fetch(
    new Request(`${BASE}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(options.as === undefined ? {} : options.as.sign(method, path, raw)),
        ...options.headers,
      },
      ...(raw === "" ? {} : { body: raw }),
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

function newDevice() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const signer = (deviceId: string) => (method: string, target: string, body: string) => {
    const timestamp = Date.now();
    const payload = signingPayload({ method, target, timestamp, body });
    return {
      "x-chips-device": deviceId,
      "x-chips-timestamp": String(timestamp),
      "x-chips-signature": sign(null, Buffer.from(payload, "utf8"), privateKey).toString("base64"),
    };
  };
  return { spki, signer };
}

/** Arjun registers a passkey from his laptop, the way the You screen does. */
async function registerFor(person: TestPerson, authenticator = fakeAuthenticator()) {
  const options = await call("POST", "/v1/passkeys/options", { as: person });
  expect(options.status).toBe(200);
  const challenge = String(options.body["challenge"]);
  const made = await call("POST", "/v1/passkeys", {
    as: person,
    body: { challenge, credential: authenticator.register(challenge), name: "MacBook" },
  });
  return { options, made, authenticator };
}

describe("registering a passkey", () => {
  it("takes the browser's answer to the challenge it was handed, and lists it without the key", async () => {
    const { options, made } = await registerFor(ws.arjun);
    expect(options.body).toMatchObject({
      rp: { name: "Solo" },
      user: { name: "Arjun" },
      attestation: "none",
    });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({
      name: "MacBook",
      algorithm: -7,
      transports: ["internal"],
      revoked_at: null,
    });
    expect(made.body["passkey_id"]).toMatch(/^pky_/);

    const listed = await call("GET", "/v1/passkeys", { as: ws.arjun });
    expect(listed.body["passkeys"]).toEqual([
      expect.objectContaining({ passkey_id: made.body["passkey_id"] }),
    ]);
    expect(JSON.stringify(listed.body)).not.toContain('"x"');
    // Dana sees none of Arjun's.
    expect((await call("GET", "/v1/passkeys", { as: ws.dana })).body["passkeys"]).toEqual([]);
  });

  it("refuses an answer to somebody else's challenge, and a harness altogether", async () => {
    const options = await call("POST", "/v1/passkeys/options", { as: ws.arjun });
    const challenge = String(options.body["challenge"]);
    const stolen = await call("POST", "/v1/passkeys", {
      as: ws.dana,
      body: { challenge, credential: fakeAuthenticator().register(challenge) },
    });
    expect(stolen.status).toBe(422);
    const harness = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/passkeys/options`, { method: "POST", headers: ws.scout.headers }),
    );
    expect(harness.status).toBe(403);
    expect((await call("POST", "/v1/passkeys", { as: ws.arjun, body: {} })).status).toBe(422);
  });
});

describe("signing in with a passkey", () => {
  it("pairs a new device for the passkey's person, who then signs from it", async () => {
    const { authenticator } = await registerFor(ws.arjun);
    const options = await call("POST", "/v1/passkeys/assertion-options");
    expect(options.status).toBe(200);
    const challenge = String(options.body["challenge"]);

    const device = newDevice();
    const signedIn = await call("POST", "/v1/passkeys/assert", {
      body: {
        challenge,
        credential: authenticator.assert(challenge),
        public_key: device.spki,
        device_name: "Arjun's phone",
      },
    });
    expect(signedIn.status).toBe(201);
    expect(signedIn.body).toMatchObject({
      participant_id: ws.arjun.participantId,
      workspace_id: ws.workspaceId,
      workspace_name: "Solo",
      display_name: "Arjun",
      role: "owner",
    });
    const deviceId = String(signedIn.body["device_id"]);
    const signer = device.signer(deviceId);
    const devices = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/devices`, { headers: signer("GET", "/v1/devices", "") }),
    );
    expect(devices.status).toBe(200);
    const listed = (await devices.json()) as { devices: Record<string, unknown>[] };
    expect(listed.devices).toContainEqual(
      expect.objectContaining({ device_id: deviceId, name: "Arjun's phone", current: true }),
    );
  });

  it("refuses a withdrawn passkey, a reused challenge, and six wrong answers in a minute", async () => {
    const { authenticator, made } = await registerFor(ws.arjun);
    const revoked = await call("DELETE", `/v1/passkeys/${String(made.body["passkey_id"])}`, {
      as: ws.arjun,
    });
    expect(revoked.status).toBe(200);

    const first = String((await call("POST", "/v1/passkeys/assertion-options")).body["challenge"]);
    const gone = await call("POST", "/v1/passkeys/assert", {
      body: {
        challenge: first,
        credential: authenticator.assert(first),
        public_key: newDevice().spki,
      },
    });
    expect(gone.status).toBe(401);
    // The challenge was spent by the attempt.
    const reused = await call("POST", "/v1/passkeys/assert", {
      body: {
        challenge: first,
        credential: authenticator.assert(first),
        public_key: newDevice().spki,
      },
    });
    expect(reused.status).toBe(401);

    for (let i = 0; i < 3; i += 1) {
      const challenge = String(
        (await call("POST", "/v1/passkeys/assertion-options")).body["challenge"],
      );
      expect(
        (
          await call("POST", "/v1/passkeys/assert", {
            body: {
              challenge,
              credential: authenticator.assert(challenge),
              public_key: newDevice().spki,
            },
          })
        ).status,
      ).toBe(401);
    }
    expect((await call("POST", "/v1/passkeys/assertion-options")).status).toBe(429);
  });

  it("counts every challenge against its address, answered or not, five a minute (SEC-13)", async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await call("POST", "/v1/passkeys/assertion-options")).status).toBe(200);
    }
    const sixth = await call("POST", "/v1/passkeys/assertion-options");
    expect(sixth.status).toBe(429);
    expect(sixth.body).toMatchObject({
      error: {
        message: "Too many sign-ins begun from this address. Try again in a minute.",
        retry_after_seconds: expect.any(Number),
      },
    });
  });

  it("refuses a signature by another key, and says nothing about which credentials exist", async () => {
    await registerFor(ws.arjun);
    const stranger = fakeAuthenticator();
    const challenge = String(
      (await call("POST", "/v1/passkeys/assertion-options")).body["challenge"],
    );
    const forged = await call("POST", "/v1/passkeys/assert", {
      body: { challenge, credential: stranger.assert(challenge), public_key: newDevice().spki },
    });
    expect(forged.status).toBe(401);
    expect(forged.body).toMatchObject({ error: { message: "That passkey answer is not valid." } });
  });
});
