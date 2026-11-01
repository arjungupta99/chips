/**
 * `chips disconnect` — undo is a delete. What matters is that it takes back exactly what
 * `connect` wrote and nothing else, and that the harness itself survives.
 */

import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readConnections, writeConnection } from "../connections.js";
import type { CliDevice } from "../device.js";
import type { Keychain } from "../keychain.js";
import { scriptedConsole } from "../output.js";
import { disconnect } from "./disconnect.js";

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

const CUSTOM_ID = "hrn_01K4ZQPX000000000000000009";
/** A record an older build wrote, under the adapter it had until 12 September 2026 (ADR 0051). */
const JACOBIAN_ID = "hrn_01K4ZQPX000000000000000004";

let home: string;
let connectionsFile: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "chips-disconnect-"));
  connectionsFile = join(home, "connections.json");
  writeConnection(
    {
      harness: "custom",
      harnessId: CUSTOM_ID,
      displayName: "Scout",
      serverUrl: DEVICE.serverUrl,
      spaceId: "spc_01K4ZQPX000000000000000005",
      account: `custom:${CUSTOM_ID}`,
      secretStore: "keychain",
      wrote: [],
      connectedAt: "2026-09-05T12:00:00.000Z",
    },
    connectionsFile,
  );
});

/** The older build's record, beside the custom one. */
function writeOlderRecord(): void {
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
}

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

function keychain(): Keychain & { readonly secrets: Record<string, string> } {
  const secrets: Record<string, string> = {
    [`jacobian:${JACOBIAN_ID}`]: "chips_at_token",
    [`custom:${CUSTOM_ID}`]: "chips_at_other",
  };
  return {
    secrets,
    kind: "keychain",
    set: (account, secret) => {
      secrets[account] = secret;
    },
    get: (account) => secrets[account],
    remove: (account) => {
      delete secrets[account];
    },
  };
}

/** A server that lists one live token and withdraws whatever it is asked to. */
function server(): { calls: string[]; fetch: typeof fetch } {
  const calls: string[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
    if ((init?.method ?? "GET") === "GET") {
      return new Response(JSON.stringify({ tokens: [{ id: "tok_1", revoked_at: null }] }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("{}", { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetch: fetcher };
}

describe("chips disconnect", () => {
  it("says what it will take back, and takes nothing when the answer is no", async () => {
    const out = scriptedConsole(false);
    const store = keychain();
    const result = await disconnect({
      harness: "custom",
      console: out,
      device: DEVICE,
      keychain: store,
      connectionsFile,
    });

    expect(result.declined).toBe(true);
    expect(out.lines.join("\n")).toContain("withdraw its tokens");
    expect(Object.keys(store.secrets)).toHaveLength(2);
    expect(readConnections(connectionsFile)).toHaveLength(1);
  });

  it("forgets the secret, withdraws the tokens, and keeps the harness", async () => {
    const store = keychain();
    const backend = server();
    vi.stubGlobal("fetch", backend.fetch);

    const result = await disconnect({
      harness: "custom",
      console: scriptedConsole(true),
      assumeYes: true,
      device: DEVICE,
      keychain: store,
      connectionsFile,
    });

    expect(result).toMatchObject({ declined: false, tokensRevoked: 1 });
    // Only this harness's secret went; another harness's is not this command's to touch.
    expect(Object.keys(store.secrets)).toEqual([`jacobian:${JACOBIAN_ID}`]);
    expect(readConnections(connectionsFile)).toEqual([]);
    expect(backend.calls).toContain(`DELETE /v1/harnesses/${CUSTOM_ID}/tokens/tok_1`);
  });

  it("finishes locally even when the server cannot be reached, and says so", async () => {
    const out = scriptedConsole(true);
    vi.stubGlobal("fetch", (async () => {
      throw new Error("connect ECONNREFUSED");
    }) as typeof fetch);

    const result = await disconnect({
      harness: "custom",
      console: out,
      assumeYes: true,
      device: DEVICE,
      keychain: keychain(),
      connectionsFile,
    });

    expect(result).toMatchObject({ tokensRevoked: 0 });
    expect(readConnections(connectionsFile)).toEqual([]);
    expect(out.lines.join("\n")).toContain("Withdraw them from the harness's card");
  });

  it("takes back a record an older build wrote under an adapter this build does not have", async () => {
    writeOlderRecord();
    const out = scriptedConsole(true);
    const store = keychain();
    const backend = server();
    vi.stubGlobal("fetch", backend.fetch);

    const result = await disconnect({
      harness: "jacobian",
      console: out,
      assumeYes: true,
      device: DEVICE,
      keychain: store,
      connectionsFile,
    });

    expect(result).toMatchObject({ declined: false, tokensRevoked: 1 });
    expect(Object.keys(store.secrets)).toEqual([`custom:${CUSTOM_ID}`]);
    expect(readConnections(connectionsFile).map((each) => each.harness)).toEqual(["custom"]);
    const said = out.lines.join("\n");
    expect(said).toContain("Disconnect Jacobian");
    expect(said).toContain("`chips connect custom --name Jacobian` connects it again");
  });

  it("leaves the other harnesses' records alone", async () => {
    writeOlderRecord();
    const backend = server();
    vi.stubGlobal("fetch", backend.fetch);

    await disconnect({
      harness: "custom",
      console: scriptedConsole(true),
      assumeYes: true,
      device: DEVICE,
      keychain: keychain(),
      connectionsFile,
    });

    expect(readConnections(connectionsFile).map((each) => each.harness)).toEqual(["jacobian"]);
  });

  it("asks which of two custom harnesses, and takes back only the one named", async () => {
    const second = "hrn_01K4ZQPX000000000000000010";
    writeConnection(
      {
        harness: "custom",
        harnessId: second,
        displayName: "OpenClaw",
        serverUrl: DEVICE.serverUrl,
        account: `custom:${second}`,
        secretStore: "keychain",
        wrote: [],
        connectedAt: "2026-09-26T12:00:00.000Z",
      },
      connectionsFile,
    );
    const store = keychain();
    store.secrets[`custom:${second}`] = "chips_at_claw";
    const backend = server();
    vi.stubGlobal("fetch", backend.fetch);
    const common = {
      console: scriptedConsole(true),
      assumeYes: true,
      device: DEVICE,
      keychain: store,
      connectionsFile,
    };

    await expect(disconnect({ harness: "custom", ...common })).rejects.toThrow(
      `Several harnesses here answer to custom: Scout (${CUSTOM_ID}), OpenClaw (${second})`,
    );
    const out = scriptedConsole(true);
    await disconnect({ harness: "openclaw", ...common, console: out });
    // The way back keeps its name; `chips connect custom` alone would make a "Custom harness".
    expect(out.lines.join("\n")).toContain("`chips connect custom --name OpenClaw` puts it back");

    expect(readConnections(connectionsFile).map((each) => each.displayName)).toEqual(["Scout"]);
    expect(store.secrets[`custom:${second}`]).toBeUndefined();
    expect(store.secrets[`custom:${CUSTOM_ID}`]).toBe("chips_at_other");
    expect(backend.calls).toContain(`GET /v1/harnesses/${second}/tokens`);
    expect(backend.calls.join(" ")).not.toContain(CUSTOM_ID);
  });

  it("says plainly when there is nothing to disconnect", async () => {
    await expect(
      disconnect({
        harness: "custom",
        console: scriptedConsole(true),
        connectionsFile: join(home, "nothing.json"),
      }),
    ).rejects.toThrow("Custom harness is not connected here");
    await expect(
      disconnect({
        harness: "nowhere",
        console: scriptedConsole(true),
        connectionsFile,
      }),
    ).rejects.toThrow("nowhere is not connected here");
  });
});
