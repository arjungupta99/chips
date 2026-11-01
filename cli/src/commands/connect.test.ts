/**
 * `chips connect`: it says what it is about to change before it changes anything, and if the
 * answer is no it changes nothing. Then the token goes where a token goes, and `--rotate` puts
 * a new one there before withdrawing the old — never the other way round, which would leave a
 * harness mute for as long as the second call takes.
 */

import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Harness } from "../connections.js";
import { readConnections, writeConnection } from "../connections.js";
import type { CliDevice } from "../device.js";
import type { Keychain } from "../keychain.js";
import { scriptedConsole } from "../output.js";
import { connect } from "./connect.js";

const DEVICE: CliDevice = {
  deviceId: "dev_1",
  participantId: "usr_1",
  workspaceId: "ws_1",
  displayName: "Arjun",
  serverUrl: "http://127.0.0.1:4431",
  privateKey: generateKeyPairSync("ed25519").privateKey.export({
    type: "pkcs8",
    format: "pem",
  }) as string,
};

let home: string;
let connectionsFile: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "chips-connect-"));
  connectionsFile = join(home, "connections.json");
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

function keychain(): Keychain & { readonly secrets: Record<string, string> } {
  const secrets: Record<string, string> = {};
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

/** A server that answers the calls connect and rotate make, and records what it was sent. */
interface FakeServer {
  readonly calls: string[];
  /** Every body sent, so a test can read what was asked for. */
  readonly bodies: Record<string, unknown>[];
  readonly fetch: typeof fetch;
  readonly tokens: { id: string; revoked_at: string | null }[];
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function server(): FakeServer {
  const calls: string[] = [];
  const bodies: Record<string, unknown>[] = [];
  const tokens = [{ id: "tok_1", revoked_at: null as string | null }];

  const routes: Record<string, (url: URL) => Response> = {
    // A real server answers with no `space_id` when it was asked not to open one.
    // Each registration is a harness of its own, called what it was asked to be.
    "POST /v1/harnesses": () => {
      const asked = bodies.at(-1);
      const made = calls.filter((each) => each === "POST /v1/harnesses").length;
      return json(
        {
          harness_id: `hrn_${made}`,
          display_name: typeof asked?.["name"] === "string" ? asked["name"] : "Scout",
          token: "chips_at_first",
          ...(asked?.["open_direct_space"] === false ? {} : { space_id: "spc_1" }),
        },
        201,
      );
    },
    "GET /v1/harnesses/hrn_1/tokens": () => json({ tokens }),
    "POST /v1/harnesses/hrn_1/tokens": () => {
      tokens.push({ id: "tok_2", revoked_at: null });
      return json({ token_id: "tok_2", token: "chips_at_second" }, 201);
    },
  };

  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const call = `${method} ${url.pathname}`;
    calls.push(call);
    if (typeof init?.body === "string" && init.body !== "") {
      bodies.push(JSON.parse(init.body) as Record<string, unknown>);
    }
    if (method === "DELETE") {
      const id = url.pathname.split("/").at(-1);
      const token = tokens.find((each) => each.id === id);
      if (token !== undefined) token.revoked_at = "2026-09-04T12:00:00.000Z";
      return json({ token_id: id });
    }
    return routes[call]?.(url) ?? json({}, 404);
  }) as typeof fetch;

  return { calls, bodies, fetch: fetcher, tokens };
}

/** Connect one harness against a fake server, saying yes to everything. */
async function connectWith(backend: FakeServer, harness: Harness) {
  vi.stubGlobal("fetch", backend.fetch);
  return await connect({
    harness,
    console: scriptedConsole(true),
    assumeYes: true,
    device: DEVICE,
    keychain: keychain(),
    connectionsFile,
  });
}

describe("chips connect", () => {
  it("declares the dial by default, and none when told the harness's permission model is its own", async () => {
    const backend = server();
    vi.stubGlobal("fetch", backend.fetch);
    await connectWith(backend, "custom");
    expect(backend.bodies[0]).toMatchObject({ capabilities: [HARNESS_CAPABILITIES.autonomy] });

    const out = scriptedConsole(true);
    const { connection } = await connect({
      harness: "custom",
      console: out,
      assumeYes: true,
      dial: false,
      name: "Jacobian",
      device: DEVICE,
      keychain: keychain(),
      connectionsFile,
    });
    // `--no-dial`: registered with nothing declared, and still given its direct space.
    expect(backend.bodies[1]).toMatchObject({ name: "Jacobian", capabilities: [] });
    expect(backend.bodies[1]?.["open_direct_space"]).toBeUndefined();
    expect(connection?.spaceId).toBe("spc_1");
    expect(out.lines.join("\n")).toContain("declare no autonomy dial");
  });

  it("declares what else it takes as it registers, beside the dial, and says so first", async () => {
    const backend = server();
    vi.stubGlobal("fetch", backend.fetch);
    const out = scriptedConsole(true);
    await connect({
      harness: "custom",
      console: out,
      assumeYes: true,
      capabilities: [HARNESS_CAPABILITIES.agents, HARNESS_CAPABILITIES.newSpaces],
      device: DEVICE,
      keychain: keychain(),
      connectionsFile,
    });
    expect(backend.bodies[0]).toMatchObject({
      capabilities: [
        HARNESS_CAPABILITIES.autonomy,
        HARNESS_CAPABILITIES.agents,
        HARNESS_CAPABILITIES.newSpaces,
      ],
    });
    expect(out.lines.join("\n")).toContain("declare that it takes agents, new_spaces");
  });

  it("refuses a harness the manifest does not have, and names what it has", async () => {
    const backend = server();
    await expect(connectWith(backend, "jacobian")).rejects.toThrow(
      "No such harness: jacobian. One of: custom.",
    );
    expect(backend.calls).toEqual([]);
  });

  it("prints a custom harness's address and token once, for its own environment", async () => {
    const backend = server();
    vi.stubGlobal("fetch", backend.fetch);
    const out = scriptedConsole(true);
    await connect({
      harness: "custom",
      console: out,
      assumeYes: true,
      device: DEVICE,
      keychain: keychain(),
      connectionsFile,
    });
    const said = out.lines.join("\n");
    expect(said).toContain("print its address and token once");
    expect(said).toContain("CHIPS_URL=http://127.0.0.1:4431");
    expect(said).toContain("CHIPS_HARNESS_ID=hrn_1");
    expect(said).toContain("CHIPS_HARNESS_TOKEN=chips_at_first");
    expect(said).toContain("CHIPS_SPACE_ID=spc_1");
    expect(said).toContain("Hello from my harness");
    // Its own name, not the adapter's word, even while it is the only custom harness here.
    expect(said).toContain('Undo with    chips disconnect "Custom harness"');
  });

  it("prints a custom harness's new token when it is rotated", async () => {
    const backend = server();
    vi.stubGlobal("fetch", backend.fetch);
    const store = keychain();
    const common = { device: DEVICE, keychain: store, connectionsFile };
    await connect({
      harness: "custom",
      console: scriptedConsole(true),
      assumeYes: true,
      ...common,
    });
    const out = scriptedConsole(true);
    await connect({ harness: "custom", console: out, assumeYes: true, rotate: true, ...common });
    const said = out.lines.join("\n");
    expect(said).toContain("CHIPS_HARNESS_TOKEN=chips_at_second");
    expect(said).toContain("CHIPS_SPACE_ID=spc_1");
    expect(store.secrets["custom:hrn_1"]).toBe("chips_at_second");
  });

  it("still opens one for a harness with nowhere else to speak", async () => {
    const fake = server();
    const { connection } = await connectWith(fake, "custom");

    expect(fake.bodies[0]?.["open_direct_space"]).toBeUndefined();
    expect(connection?.spaceId).toBe("spc_1");
  });

  it("says what it will change, and changes nothing when the answer is no", async () => {
    const out = scriptedConsole(false);
    const store = keychain();
    const backend = server();
    vi.stubGlobal("fetch", backend.fetch);

    const result = await connect({
      harness: "custom",
      console: out,
      device: DEVICE,
      keychain: store,
      connectionsFile,
    });

    expect(result.declined).toBe(true);
    const said = out.lines.join("\n");
    expect(said).toContain("register a harness");
    expect(said).toContain("login keychain");
    expect(said).toContain("print its address and token once");
    expect(said).toContain("Nothing was changed");
    expect(backend.calls).toEqual([]);
    expect(store.secrets).toEqual({});
    expect(readConnections(connectionsFile)).toEqual([]);
  });

  it("registers the harness, stores the token, and writes down where it went", async () => {
    const store = keychain();
    const backend = server();
    vi.stubGlobal("fetch", backend.fetch);

    const { connection } = await connect({
      harness: "custom",
      console: scriptedConsole(true),
      assumeYes: true,
      device: DEVICE,
      keychain: store,
      connectionsFile,
      now: () => "2026-09-04T11:00:00.000Z",
    });

    expect(backend.calls).toEqual(["POST /v1/harnesses"]);
    expect(connection?.harnessId).toBe("hrn_1");
    expect(store.secrets["custom:hrn_1"]).toBe("chips_at_first");
    const written = readConnections(connectionsFile);
    expect(written).toHaveLength(1);
    // The record says where the token is, and never what it is.
    expect(JSON.stringify(written)).not.toContain("chips_at_");
    expect(written[0]?.account).toBe("custom:hrn_1");
  });

  it("rotates: the new token is stored before the old one is withdrawn", async () => {
    const store = keychain();
    const backend = server();
    vi.stubGlobal("fetch", backend.fetch);
    await connect({
      harness: "custom",
      console: scriptedConsole(true),
      assumeYes: true,
      device: DEVICE,
      keychain: store,
      connectionsFile,
    });
    backend.calls.length = 0;

    await connect({
      harness: "custom",
      console: scriptedConsole(true),
      assumeYes: true,
      rotate: true,
      device: DEVICE,
      keychain: store,
      connectionsFile,
    });

    expect(backend.calls).toEqual([
      "GET /v1/harnesses/hrn_1/tokens",
      "POST /v1/harnesses/hrn_1/tokens",
      "DELETE /v1/harnesses/hrn_1/tokens/tok_1",
    ]);
    expect(store.secrets["custom:hrn_1"]).toBe("chips_at_second");
    expect(backend.tokens.find((each) => each.id === "tok_1")?.revoked_at).not.toBeNull();
    expect(backend.tokens.find((each) => each.id === "tok_2")?.revoked_at).toBeNull();
  });

  it("rotates a record an older build wrote under an adapter this build does not have", async () => {
    // Until 12 September 2026 the CLI had a `jacobian` adapter (ADR 0051). Its record still
    // reads, and its token is a token: rotated like a custom harness's, the new one said as the
    // four lines every harness is given.
    const store = keychain();
    store.secrets["jacobian:hrn_1"] = "chips_at_first";
    writeConnection(
      {
        harness: "jacobian",
        harnessId: "hrn_1",
        displayName: "Jacobian",
        serverUrl: DEVICE.serverUrl,
        account: "jacobian:hrn_1",
        secretStore: "keychain",
        wrote: [],
        connectedAt: "2026-09-05T11:00:00.000Z",
      },
      connectionsFile,
    );
    const backend = server();
    vi.stubGlobal("fetch", backend.fetch);
    const out = scriptedConsole(true);
    await connect({
      harness: "jacobian",
      console: out,
      assumeYes: true,
      rotate: true,
      device: DEVICE,
      keychain: store,
      connectionsFile,
    });
    expect(store.secrets["jacobian:hrn_1"]).toBe("chips_at_second");
    const said = out.lines.join("\n");
    expect(said).toContain("Rotate Jacobian's token");
    expect(said).toContain("CHIPS_HARNESS_TOKEN=chips_at_second");
  });

  it("keeps two harnesses made with one adapter side by side, and tells them apart by name", async () => {
    const backend = server();
    vi.stubGlobal("fetch", backend.fetch);
    const store = keychain();
    const common = { device: DEVICE, keychain: store, connectionsFile, assumeYes: true };
    await connect({
      harness: "custom",
      name: "Jacobian",
      console: scriptedConsole(true),
      ...common,
    });
    const out = scriptedConsole(true);
    await connect({ harness: "custom", name: "OpenClaw", console: out, ...common });

    // Written beside the first, not over it, each token under its own account.
    expect(readConnections(connectionsFile).map((each) => each.displayName)).toEqual([
      "Jacobian",
      "OpenClaw",
    ]);
    expect(store.secrets["custom:hrn_1"]).toBe("chips_at_first");
    expect(store.secrets["custom:hrn_2"]).toBe("chips_at_first");
    // `custom` means two harnesses now, so the way back names this one.
    expect(out.lines.join("\n")).toContain("Undo with    chips disconnect OpenClaw");

    // A third by a name already here is a new harness, and says so before it is made.
    const again = scriptedConsole(false);
    await connect({
      harness: "custom",
      name: "jacobian",
      console: again,
      ...common,
      assumeYes: false,
    });
    expect(again.lines.join("\n")).toContain(
      "make a second harness beside the “Jacobian” connected earlier (hrn_1)",
    );

    // A rotation must say which; by name it renews that one alone.
    await expect(
      connect({ harness: "custom", rotate: true, console: scriptedConsole(true), ...common }),
    ).rejects.toThrow(
      "Several harnesses here answer to custom: Jacobian (hrn_1), OpenClaw (hrn_2)",
    );
    backend.calls.length = 0;
    await connect({ harness: "Jacobian", rotate: true, console: scriptedConsole(true), ...common });
    expect(backend.calls[0]).toBe("GET /v1/harnesses/hrn_1/tokens");
    expect(store.secrets["custom:hrn_1"]).toBe("chips_at_second");
    expect(store.secrets["custom:hrn_2"]).toBe("chips_at_first");
    expect(readConnections(connectionsFile)).toHaveLength(2);
  });

  it("has nothing to rotate before anything is connected", async () => {
    await expect(
      connect({
        harness: "custom",
        console: scriptedConsole(true),
        assumeYes: true,
        rotate: true,
        device: DEVICE,
        keychain: keychain(),
        connectionsFile,
      }),
    ).rejects.toThrow(/not connected yet/);
  });

  it("will not connect from a machine that has no credential of its own", async () => {
    await expect(
      connect({
        harness: "custom",
        console: scriptedConsole(true),
        assumeYes: true,
        device: undefined,
        keychain: keychain(),
        connectionsFile,
      }),
    ).rejects.toThrow(/not paired/);
  });
});
