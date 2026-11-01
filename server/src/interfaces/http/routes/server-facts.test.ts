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

  it("is not a harness's", async () => {
    ws = await createTestWorkspace();
    const refused = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/server`, { headers: ws.scout.headers }),
    );
    expect(refused.status).toBe(403);
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
