/**
 * `chips remove` — a harness out of the workspace. What matters is that the server is asked
 * first, that this machine forgets its end only once the server has said yes, and that a harness
 * this machine never connected can still be removed by its id.
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
import { remove } from "./remove.js";

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

const SCOUT_ID = "hrn_01K4ZQPX000000000000000009";
const JACOBIAN_ID = "hrn_01K4ZQPX000000000000000004";
/** A harness connected from another machine: the server knows it, this one has no record. */
const ELSEWHERE_ID = "hrn_01K4ZQPX0000000000000000FF";
const REMOVED_AT = "2026-09-27T10:00:00.000Z";

let home: string;
let connectionsFile: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "chips-remove-"));
  connectionsFile = join(home, "connections.json");
  writeConnection(
    {
      harness: "custom",
      harnessId: SCOUT_ID,
      displayName: "Scout",
      serverUrl: DEVICE.serverUrl,
      account: `custom:${SCOUT_ID}`,
      secretStore: "keychain",
      wrote: [],
      connectedAt: "2026-09-05T12:00:00.000Z",
    },
    connectionsFile,
  );
  writeConnection(
    {
      harness: "custom",
      harnessId: JACOBIAN_ID,
      displayName: "Jacobian",
      serverUrl: DEVICE.serverUrl,
      account: `custom:${JACOBIAN_ID}`,
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

function keychain(): Keychain & { readonly secrets: Record<string, string> } {
  const secrets: Record<string, string> = {
    [`custom:${SCOUT_ID}`]: "chips_at_scout",
    [`custom:${JACOBIAN_ID}`]: "chips_at_jacobian",
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

/** A server that removes whatever it is asked to: the first time, or already, as it is told. */
function server(options: { alreadyRemoved?: boolean } = {}): { calls: string[] } {
  const calls: string[] = [];
  vi.stubGlobal("fetch", (async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    calls.push(`${init?.method ?? "GET"} ${path}`);
    const already = options.alreadyRemoved === true;
    return new Response(
      JSON.stringify({
        harness_id: path.split("/").at(-1),
        removed_at: REMOVED_AT,
        tokens_revoked: already ? 0 : 2,
        sockets_closed: already ? 0 : 1,
        already_removed: already,
        ...(already ? {} : { event_id: "evt_01K4ZQPX000000000000000010" }),
      }),
      { headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch);
  return { calls };
}

describe("chips remove", () => {
  it("removes a harness connected here, and forgets only its secret and its record", async () => {
    const backend = server();
    const store = keychain();
    const out = scriptedConsole(true);

    const result = await remove({
      harness: "Scout",
      console: out,
      assumeYes: true,
      device: DEVICE,
      keychain: store,
      connectionsFile,
    });

    expect(result).toEqual({
      declined: false,
      harnessId: SCOUT_ID,
      alreadyRemoved: false,
      tokensRevoked: 2,
      forgotten: true,
    });
    expect(backend.calls).toEqual([`DELETE /v1/harnesses/${SCOUT_ID}`]);
    expect(Object.keys(store.secrets)).toEqual([`custom:${JACOBIAN_ID}`]);
    expect(readConnections(connectionsFile).map((each) => each.harnessId)).toEqual([JACOBIAN_ID]);
    const said = out.lines.join("\n");
    expect(said).toContain("Remove Scout");
    expect(said).toContain("forget the secret in the keychain");
    expect(said).toContain("Scout is removed");
    expect(said).toContain(REMOVED_AT);
  });

  it("removes a harness this machine never connected, by its id, and touches nothing here", async () => {
    const backend = server();
    const store = keychain();
    const out = scriptedConsole(true);

    const result = await remove({
      harness: ELSEWHERE_ID,
      console: out,
      assumeYes: true,
      device: DEVICE,
      keychain: store,
      connectionsFile,
    });

    expect(result).toMatchObject({ declined: false, harnessId: ELSEWHERE_ID, forgotten: false });
    expect(backend.calls).toEqual([`DELETE /v1/harnesses/${ELSEWHERE_ID}`]);
    expect(Object.keys(store.secrets)).toHaveLength(2);
    expect(readConnections(connectionsFile)).toHaveLength(2);
    const said = out.lines.join("\n");
    // Nothing here to forget, so it does not say it will.
    expect(said).not.toContain("forget the secret");
    expect(said).toContain("had no record of it");
  });

  it("says what it will do, and does nothing when the answer is no", async () => {
    const backend = server();
    const store = keychain();
    const out = scriptedConsole(false);

    const result = await remove({
      harness: "Scout",
      console: out,
      device: DEVICE,
      keychain: store,
      connectionsFile,
    });

    expect(result).toEqual({ declined: true });
    expect(backend.calls).toEqual([]);
    expect(Object.keys(store.secrets)).toHaveLength(2);
    expect(readConnections(connectionsFile)).toHaveLength(2);
    const said = out.lines.join("\n");
    expect(said).toContain("withdraw every token it has");
    expect(said).toContain("keep what Scout said");
    expect(said).toContain("Nothing was changed.");
  });

  it("passes on what the server refused, and keeps this machine's end as it was", async () => {
    vi.stubGlobal(
      "fetch",
      (async () =>
        new Response(
          JSON.stringify({
            error: { code: "forbidden", message: "Only its owner or an admin removes a harness." },
          }),
          { status: 403, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
    );
    const store = keychain();

    await expect(
      remove({
        harness: "Scout",
        console: scriptedConsole(true),
        assumeYes: true,
        device: DEVICE,
        keychain: store,
        connectionsFile,
      }),
    ).rejects.toThrow("Only its owner or an admin removes a harness.");

    expect(store.secrets[`custom:${SCOUT_ID}`]).toBe("chips_at_scout");
    expect(readConnections(connectionsFile)).toHaveLength(2);
  });

  it("says a harness was removed already, and still forgets it here", async () => {
    const backend = server({ alreadyRemoved: true });
    const store = keychain();
    const out = scriptedConsole(true);

    const result = await remove({
      harness: JACOBIAN_ID,
      console: out,
      assumeYes: true,
      device: DEVICE,
      keychain: store,
      connectionsFile,
    });

    expect(result).toEqual({
      declined: false,
      harnessId: JACOBIAN_ID,
      alreadyRemoved: true,
      tokensRevoked: 0,
      forgotten: true,
    });
    expect(backend.calls).toEqual([`DELETE /v1/harnesses/${JACOBIAN_ID}`]);
    expect(Object.keys(store.secrets)).toEqual([`custom:${SCOUT_ID}`]);
    expect(readConnections(connectionsFile).map((each) => each.displayName)).toEqual(["Scout"]);
    expect(out.lines.join("\n")).toContain("Jacobian was removed already");
  });

  it("says what to do for a harness it cannot name, and for a machine that is not paired", async () => {
    const backend = server();
    await expect(
      remove({
        harness: "claw",
        console: scriptedConsole(true),
        assumeYes: true,
        device: DEVICE,
        keychain: keychain(),
        connectionsFile,
      }),
    ).rejects.toThrow("claw is not connected here. Give its id instead: `chips remove hrn_…`.");
    await expect(
      remove({
        harness: ELSEWHERE_ID,
        console: scriptedConsole(true),
        assumeYes: true,
        device: undefined,
        keychain: keychain(),
        connectionsFile: join(home, "nothing.json"),
      }),
    ).rejects.toThrow("This machine is not paired with a server: `chips pair <code>` first.");
    expect(backend.calls).toEqual([]);
  });
});
