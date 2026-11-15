/**
 * The server as its people see it (ADR 0170), and the gallery's cards from the docs (ADR 0171).
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createTestWorkspace,
  type TestPerson,
  type TestWorkspace,
} from "../../../testing/workspace.js";

let ws: TestWorkspace | undefined;
const BASE = "http://chips.local";

afterEach(async () => {
  await ws?.close();
  ws = undefined;
});

async function call(path: string, as: TestPerson) {
  const response = await (ws as TestWorkspace).gateway.app.fetch(
    new Request(`${BASE}${path}`, { method: "GET", headers: as.sign("GET", path, "") }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const OPENCLAW = {
  id: "openclaw",
  name: "OpenClaw",
  line: "On a server or this Mac",
  kind: "one-line",
  command: "npx chips-openclaw connect {link}",
  sentence: "Connect yourself to my Chips: run `npx chips-openclaw connect {link}` where you run.",
};

describe("GET /v1/server", () => {
  it("says the machine, the version, where it is reached and its relay, to a person", async () => {
    ws = await createTestWorkspace({ machine: "Arjun's Mac mini" });
    const read = await call("/v1/server", ws.arjun);
    expect(read.status).toBe(200);
    // With the server's tunnel key, which open health keeps from strangers (SEC-28).
    expect(read.body).toMatchObject({
      machine: "Arjun's Mac mini",
      version: "0.0.0-test",
      relay: { url: null, status: "off", key: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) },
      // The test workspace has no access token for Expo, so it pushes through Chips's push relay
      // (ADR 0246), and can.
      pushes: "ready",
    });
    expect(String(read.body["public_url"])).toMatch(/^http:\/\//);
  });

  it("names no releases where the server reads none, as a checkout starts (ADR 0296)", async () => {
    ws = await createTestWorkspace();
    const read = await call("/v1/server", ws.arjun);
    expect(read.body).not.toHaveProperty("updates");
  });

  it("is not a harness's", async () => {
    ws = await createTestWorkspace();
    const refused = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/server`, { headers: ws.scout.headers }),
    );
    expect(refused.status).toBe(403);
  });
});

describe("the computer's own update (everything in step, phase 6)", () => {
  async function put(as: TestPerson, body: unknown) {
    const path = "/v1/server/self-update";
    const raw = JSON.stringify(body);
    const response = await (ws as TestWorkspace).gateway.app.fetch(
      new Request(`${BASE}${path}`, {
        method: "PUT",
        headers: { ...as.sign("PUT", path, raw), "content-type": "application/json" },
        body: raw,
      }),
    );
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  it("tells an owner whether this computer can update itself, off until they turn it on", async () => {
    let started = 0;
    ws = await createTestWorkspace({
      selfUpdate: {
        start: () => {
          started += 1;
        },
        last: () => ({
          state: "failed",
          from: "1.2.5",
          at: "2026-11-20T02:30:00.000Z",
          why: "No release.",
        }),
      },
    });
    expect((await call("/v1/server", ws.arjun)).body["self_update"]).toEqual({
      available: true,
      automatic: false,
      last: { state: "failed", from: "1.2.5", at: "2026-11-20T02:30:00.000Z", why: "No release." },
    });
    // A member sees nothing of it, and can't turn it on.
    expect((await call("/v1/server", ws.dana)).body).not.toHaveProperty("self_update");
    expect((await put(ws.dana, { automatic: true })).status).toBe(403);

    const turned = await put(ws.arjun, { automatic: true });
    expect(turned.status).toBe(200);
    expect(turned.body).toMatchObject({ available: true, automatic: true });
    expect((await call("/v1/server", ws.arjun)).body["self_update"]).toMatchObject({
      automatic: true,
    });
    expect((await put(ws.arjun, { automatic: "yes" })).status).toBe(422);
    expect(started).toBe(0);
  });

  it("is an owner's alone: an admin is told nothing of it and can't turn it on", async () => {
    ws = await createTestWorkspace({
      selfUpdate: { start: () => undefined, last: () => undefined },
    });
    const admin = await ws.addPerson("Ada", "admin");
    expect((await call("/v1/server", admin)).body).not.toHaveProperty("self_update");
    expect((await put(admin, { automatic: true })).status).toBe(403);
    expect((await call("/v1/server", ws.arjun)).body["self_update"]).toMatchObject({
      automatic: false,
    });
  });

  it("refuses a body that isn't JSON, and one that says nothing", async () => {
    ws = await createTestWorkspace({
      selfUpdate: { start: () => undefined, last: () => undefined },
    });
    const path = "/v1/server/self-update";
    for (const raw of ["{ cut off", "", "[]"]) {
      const response = await ws.gateway.app.fetch(
        new Request(`${BASE}${path}`, {
          method: "PUT",
          headers: { ...ws.arjun.sign("PUT", path, raw), "content-type": "application/json" },
          body: raw,
        }),
      );
      expect(response.status).toBe(422);
    }
  });

  it("says how the last update went, with where it went to", async () => {
    ws = await createTestWorkspace({
      selfUpdate: {
        start: () => undefined,
        last: () => ({
          state: "updated",
          from: "1.2.5",
          to: "1.2.6",
          at: "2026-11-20T02:30:00.000Z",
        }),
      },
    });
    expect((await call("/v1/server", ws.arjun)).body["self_update"]).toEqual({
      available: true,
      automatic: false,
      last: { state: "updated", from: "1.2.5", to: "1.2.6", at: "2026-11-20T02:30:00.000Z" },
    });
  });

  it("says a computer that can't update itself can't, and keeps its switch off", async () => {
    ws = await createTestWorkspace();
    expect((await call("/v1/server", ws.arjun)).body["self_update"]).toEqual({
      available: false,
      automatic: false,
    });
    const refused = await put(ws.arjun, { automatic: true });
    expect(refused.status).toBe(422);
    expect(JSON.stringify(refused.body)).toContain("not_available");
    expect((await call("/v1/server", ws.arjun)).body["self_update"]).toMatchObject({
      automatic: false,
    });
  });
});

describe("a computer Chips for Mac carries (ADR 0298)", () => {
  it("tells its owner the release in the app it starts again on, once that is newer", async () => {
    let onDisk = "1.2.5";
    ws = await createTestWorkspace({
      version: "1.2.5",
      restartOnto: { onDisk: () => onDisk, restart: () => undefined },
    });
    // It follows the app, which is said whether or not a newer release is in the app yet.
    expect((await call("/v1/server", ws.arjun)).body["self_update"]).toEqual({
      available: false,
      automatic: false,
      with_app: true,
    });
    onDisk = "1.2.6";
    expect((await call("/v1/server", ws.arjun)).body["self_update"]).toEqual({
      available: false,
      automatic: false,
      with_app: true,
      restarts_onto: "1.2.6",
    });
    expect((await call("/v1/server", ws.dana)).body).not.toHaveProperty("self_update");
  });
});

describe("GET /v1/connectors", () => {
  it("is no cards when the server was told nowhere", async () => {
    ws = await createTestWorkspace();
    const read = await call("/v1/connectors", ws.arjun);
    expect(read).toEqual({ status: 200, body: { connectors: [] } });
  });

  it("passes on the docs' cards from a file, leaving out one that doesn't read", async () => {
    const dir = mkdtempSync(join(tmpdir(), "chips-connectors-"));
    const file = join(dir, "connectors.json");
    // A docs file from before a card wore its harness's face still reads; its face is left out.
    const before = { ...OPENCLAW, face: { ground: 12 } };
    writeFileSync(file, JSON.stringify({ connectors: [before, { id: "Bad id", name: "" }] }));
    ws = await createTestWorkspace({ config: { server: { connectors: file } } as never });
    const read = await call("/v1/connectors", ws.arjun);
    expect(read.status).toBe(200);
    expect(read.body["connectors"]).toEqual([OPENCLAW]);
    expect(read.body["read_at"]).toEqual(expect.any(String));
  });

  it("is no cards, not an error, when the file isn't there", async () => {
    ws = await createTestWorkspace({
      config: { server: { connectors: "/nowhere/connectors.json" } } as never,
    });
    expect(await call("/v1/connectors", ws.arjun)).toEqual({
      status: 200,
      body: { connectors: [] },
    });
  });

  it("is not a harness's", async () => {
    ws = await createTestWorkspace();
    const refused = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/connectors`, { headers: ws.scout.headers }),
    );
    expect(refused.status).toBe(403);
  });
});
