/**
 * The owner's relay switch over HTTP (ADR 0211, Phase 4): an owner sees every device with its way
 * in and turns the relay off; health then names no relay, and new pairing and invite links carry
 * none, so they open only where the server's own address does. A server with no relay has none
 * to turn. The registry is the real one, on the test workspace's database.
 */

import { CHIPS_RELAY, defaultConfig } from "@chipschat/platform";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTestWorkspace,
  type TestPerson,
  type TestWorkspace,
} from "../../../testing/workspace.js";

let ws: TestWorkspace;
const BASE = "http://chips.local";
const RELAY = "wss://relay.test";

afterEach(async () => {
  await ws.close();
});

const withRelay = () =>
  createTestWorkspace({ config: { relay: { ...defaultConfig().relay, url: RELAY } } });

async function as(who: TestPerson, method: string, path: string, body?: unknown) {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const response = await ws.gateway.app.fetch(
    new Request(`${BASE}${path}`, {
      method,
      headers: { "content-type": "application/json", ...who.sign(method, path, raw) },
      ...(raw === "" ? {} : { body: raw }),
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/** The relay as health names it to `chips doctor` beside the server (SEC-28). */
const health = async () =>
  (
    (await (
      await ws.gateway.app.fetch(new Request("http://127.0.0.1:4431/v1/health"), {
        incoming: { socket: { remoteAddress: "127.0.0.1" } },
      })
    ).json()) as {
      relay: { url: string | null; status: string; why: string | null };
    }
  ).relay;

describe("the relay switch", () => {
  it("shows an owner each device's way in, and turns the relay off for the links too", async () => {
    ws = await withRelay();
    const dana = {
      kind: "person" as const,
      participantId: ws.dana.participantId,
      workspaceId: ws.workspaceId,
      displayName: "Dana",
      role: "member" as const,
      via: "device_key" as const,
      deviceId: ws.dana.deviceId,
    };
    await ws.gateway.deps.relaySwitch.noteWay(dana, "relay");

    const seen = await as(ws.arjun, "GET", "/v1/relay");
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ configured: true, on: true, set_by: null, kept_link: null });
    const devices = seen.body["devices"] as Record<string, unknown>[];
    expect(devices.find((each) => each["device_id"] === ws.dana.deviceId)).toMatchObject({
      last_via: "relay",
      direct_at: null,
      now: null,
    });
    expect((await health()).url).toBe(RELAY);

    const off = await as(ws.arjun, "PUT", "/v1/relay", { on: false });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ on: false, set_by: ws.arjun.participantId });
    // Answered first; the relay goes a moment later (no moment at all here).
    await vi.waitFor(async () =>
      expect(await health()).toMatchObject({ url: null, status: "off" }),
    );
    const code = await as(ws.arjun, "POST", "/v1/pairing-codes", {});
    expect(code.body["relay"]).toBeNull();
    expect(String(code.body["link"])).not.toContain("relay.test");
    const invite = await as(ws.arjun, "POST", "/v1/invites", { role: "member" });
    expect(String(invite.body["url"])).not.toContain("relay.test");

    // On again: the relay is named again, and links go by it.
    await as(ws.arjun, "PUT", "/v1/relay", { on: true });
    expect((await health()).url).toBe(RELAY);
    const after = await as(ws.arjun, "POST", "/v1/invites", { role: "member" });
    expect(String(after.body["url"])).toContain("relay.test");
  });

  it("stays off across a start: the server does not dial a relay an owner turned off", async () => {
    ws = await withRelay();
    await as(ws.arjun, "PUT", "/v1/relay", { on: false });
    const started = await ws.gateway.listen();
    expect(started.relay).toBeUndefined();
    expect((await health()).status).toBe("off");
  });

  it("is an owner's, and takes only true or false", async () => {
    ws = await createTestWorkspace();
    expect((await as(ws.dana, "GET", "/v1/relay")).status).toBe(403);
    expect((await as(ws.dana, "PUT", "/v1/relay", { on: false })).status).toBe(403);
    expect((await as(ws.arjun, "PUT", "/v1/relay", { on: "off" })).status).toBe(422);
  });

  it("is Chips's own relay without one set up, off until an owner turns it on (ADR 0245)", async () => {
    ws = await createTestWorkspace();
    const first = await as(ws.arjun, "GET", "/v1/relay");
    expect(first.body).toMatchObject({
      configured: true,
      url: CHIPS_RELAY,
      on: false,
      // Not dialled, so not connected, and no reason why: it is off.
      status: "off",
      why: null,
      set_at: null,
    });
    expect(await health()).toMatchObject({ url: null, status: "off", why: null });
    // It dials nothing as it starts.
    expect((await ws.gateway.listen()).relay).toBeUndefined();
    await ws.close();

    ws = await createTestWorkspace();
    const on = await as(ws.arjun, "PUT", "/v1/relay", { on: true });
    expect(on.body).toMatchObject({ on: true, set_by: ws.arjun.participantId });
    expect((await health()).url).toBe(CHIPS_RELAY);
    const invite = await as(ws.arjun, "POST", "/v1/invites", { role: "member" });
    expect(String(invite.body["url"])).toContain("relay.chipschat.ai");
  });
});
