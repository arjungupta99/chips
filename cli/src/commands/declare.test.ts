/**
 * `chips declare` — what a harness takes, said again (ADR 0046). What matters is that it finds
 * the harness by what a person would type, sends the whole list, and says what it replaced.
 */

import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeConnection } from "../connections.js";
import type { CliDevice } from "../device.js";
import { scriptedConsole } from "../output.js";
import { declare } from "./declare.js";

const DEVICE: CliDevice = {
  deviceId: "dev_01K4ZQPX000000000000000001",
  participantId: "usr_01K4ZQPX000000000000000002",
  workspaceId: "ws_01K4ZQPX000000000000000003",
  displayName: "Arjun",
  serverUrl: "http://127.0.0.1:4431",
  privateKey: generateKeyPairSync("ed25519").privateKey.export({
    type: "pkcs8",
    format: "pem",
  }) as string,
};

const JACOBIAN_ID = "hrn_01K4ZQPX000000000000000004";

let home: string;
let connectionsFile: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "chips-declare-"));
  connectionsFile = join(home, "connections.json");
  writeConnection(
    {
      harness: "jacobian",
      harnessId: JACOBIAN_ID,
      displayName: "Jacobian",
      serverUrl: DEVICE.serverUrl,
      account: `jacobian:${JACOBIAN_ID}`,
      secretStore: "keychain",
      wrote: [],
      connectedAt: "2026-09-05T11:00:00.000Z",
    },
    connectionsFile,
  );
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

/** A server that takes whatever it is sent, and had nothing declared before. */
function server(): { calls: { method: string; path: string; body: unknown }[] } {
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", (async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { capabilities: string[] };
    calls.push({ method: init?.method ?? "GET", path: new URL(String(input)).pathname, body });
    return new Response(JSON.stringify({ capabilities: body.capabilities, previous: null }), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch);
  return { calls };
}

describe("chips declare", () => {
  it("finds a connected harness by name, sends the whole list, and says what it replaced", async () => {
    const backend = server();
    const out = scriptedConsole(true);
    const declared = await declare({
      harness: "Jacobian",
      capabilities: ["new_spaces"],
      console: out,
      device: DEVICE,
      connectionsFile,
    });
    expect(declared).toEqual({
      harnessId: JACOBIAN_ID,
      capabilities: ["new_spaces"],
      previous: null,
    });
    expect(backend.calls).toEqual([
      {
        method: "PATCH",
        path: `/v1/harnesses/${JACOBIAN_ID}`,
        body: { capabilities: ["new_spaces"] },
      },
    ]);
    const said = out.lines.join("\n");
    expect(said).toContain("nothing");
    expect(said).toContain("new_spaces");
  });

  it("takes an id as it is, for a harness connected from somewhere else", async () => {
    const backend = server();
    const other = "hrn_01K4ZQPX0000000000000000FF";
    await declare({
      harness: other,
      capabilities: ["autonomy", "new_spaces"],
      console: scriptedConsole(true),
      device: DEVICE,
      connectionsFile,
    });
    expect(backend.calls[0]?.path).toBe(`/v1/harnesses/${other}`);
  });

  it("says what to do for a harness it cannot name, and for a machine that is not paired", async () => {
    server();
    await expect(
      declare({
        harness: "claw",
        capabilities: ["new_spaces"],
        console: scriptedConsole(true),
        device: DEVICE,
        connectionsFile,
      }),
    ).rejects.toThrow("Give its id instead");
    await expect(
      declare({
        harness: JACOBIAN_ID,
        capabilities: ["new_spaces"],
        console: scriptedConsole(true),
        device: undefined,
        connectionsFile,
      }),
    ).rejects.toThrow(/not paired|chips pair/);
  });

  it("passes on what the server refused", async () => {
    vi.stubGlobal(
      "fetch",
      (async () =>
        new Response(
          JSON.stringify({ error: { message: "What a harness takes is said by its owner." } }),
          { status: 403, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
    );
    await expect(
      declare({
        harness: JACOBIAN_ID,
        capabilities: ["new_spaces"],
        console: scriptedConsole(true),
        device: DEVICE,
        connectionsFile,
      }),
    ).rejects.toThrow("said by its owner");
  });
});
