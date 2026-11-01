/**
 * `/v1/me/notifications` (M5.6): a person's own settings, and nobody else's; the claims that
 * keep a banner to one device.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../../../testing/workspace.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTestWorkspace();
});

afterEach(async () => {
  await ws.close();
});

async function call(
  method: string,
  path: string,
  init: { headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  const response = await ws.gateway.app.fetch(
    new Request(`http://chips.local${path}`, {
      method,
      headers: { "content-type": "application/json", ...init.headers },
      ...(body === undefined ? {} : { body }),
    }),
  );
  const text = await response.text();
  return { status: response.status, body: text === "" ? {} : JSON.parse(text) };
}

function signed(person: TestWorkspace["arjun"], method: string, path: string, body?: unknown) {
  const raw = body === undefined ? "" : JSON.stringify(body);
  return { headers: person.sign(method, path, raw), ...(body === undefined ? {} : { body }) };
}

describe("settings", () => {
  it("are the defaults until saved, are validated on the way in, and are the person's own", async () => {
    const path = "/v1/me/notifications";
    const before = await call("GET", path, signed(ws.arjun, "GET", path));
    expect(before.status).toBe(200);
    expect(before.body["settings"]).toBeNull();

    const saved = await call(
      "PUT",
      path,
      signed(ws.arjun, "PUT", path, {
        decide: "now",
        review: "off",
        quiet: { from: "22:00", to: "07:00" },
        harnesses: { [ws.scout.participantId]: "none" },
      }),
    );
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    // The defaults are filled in where the person said nothing.
    expect(saved.body["settings"]).toEqual({
      decide: "now",
      review: "off",
      fyi: "daily",
      quiet: { from: "22:00", to: "07:00", breakthrough: "decide" },
      harnesses: { [ws.scout.participantId]: "none" },
    });
    const after = await call("GET", path, signed(ws.arjun, "GET", path));
    expect(after.body["settings"]).toEqual(saved.body["settings"]);

    // Dana sees her own — none — and never Arjun's.
    const danas = await call("GET", path, signed(ws.dana, "GET", path));
    expect(danas.body["settings"]).toBeNull();

    const bad = await call(
      "PUT",
      path,
      signed(ws.arjun, "PUT", path, { decide: "sometimes", quiet: { from: "25:00", to: "07:00" } }),
    );
    expect(bad.status).toBe(422);
    expect(String((bad.body["error"] as Record<string, unknown>)["message"])).toContain(
      "Not settings",
    );

    // A harness has no notifications.
    const scout = await call("GET", path, { headers: ws.scout.headers });
    expect(scout.status).toBe(403);
  });

  it("keep a word per room, which a save from an app that has none leaves as it was (ADR 0198)", async () => {
    const path = "/v1/me/notifications";
    const rooms = { [ws.spaceId]: "all", spc_quiet: "none" };
    const base = { decide: "now", review: "hourly", fyi: "daily", harnesses: {} };
    const saved = await call("PUT", path, signed(ws.dana, "PUT", path, { ...base, spaces: rooms }));
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect((saved.body["settings"] as Record<string, unknown>)["spaces"]).toEqual(rooms);

    // An older app sends its settings with no `spaces`: the rooms' words stay.
    const older = await call("PUT", path, signed(ws.dana, "PUT", path, { ...base, fyi: "off" }));
    expect(older.body["settings"]).toEqual({ ...base, fyi: "off", spaces: rooms });
    const after = await call("GET", path, signed(ws.dana, "GET", path));
    expect((after.body["settings"] as Record<string, unknown>)["spaces"]).toEqual(rooms);

    const bad = await call(
      "PUT",
      path,
      signed(ws.dana, "PUT", path, { ...base, spaces: { [ws.spaceId]: "loud" } }),
    );
    expect(bad.status).toBe(422);
  });
});

describe("claims", () => {
  it("grant a key to one device of a person, and tell the other it was taken", async () => {
    const path = "/v1/me/notifications/claims";
    const laptop = await call(
      "POST",
      path,
      signed(ws.arjun, "POST", path, { keys: ["approval:apr_1", "approval:apr_2"] }),
    );
    expect(laptop.status, JSON.stringify(laptop.body)).toBe(200);
    expect(laptop.body["granted"]).toEqual(["approval:apr_1", "approval:apr_2"]);

    // Dana is another person: the same key is hers to raise. (Two devices of one person race
    // in the registry's own test.)
    const dana = await call(
      "POST",
      path,
      signed(ws.dana, "POST", path, { keys: ["approval:apr_1", "approval:apr_9"] }),
    );
    expect(dana.body["granted"]).toEqual(["approval:apr_1", "approval:apr_9"]);

    // The same device again — a reload — raises nothing twice (Gate 5).
    const again = await call(
      "POST",
      path,
      signed(ws.arjun, "POST", path, { keys: ["approval:apr_1"] }),
    );
    expect(again.body["granted"]).toEqual([]);

    const silly = await call("POST", path, signed(ws.arjun, "POST", path, { keys: "x" }));
    expect(silly.status).toBe(422);
    const harness = await call("POST", path, { headers: ws.scout.headers, body: { keys: [] } });
    expect(harness.status).toBe(403);
  });
});
