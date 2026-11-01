/**
 * The manifest is the whole of what a command knows about a harness (ADR 0051): an adapter that
 * exists nowhere but here, handed to the commands as their manifest, walks connect, rotate,
 * doctor, disconnect and conformance with no edit to any of them — the CLI's version of the
 * "synthetic third kind" vector Jacobian's components surface is frozen by.
 */

import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { conformance } from "./commands/conformance.js";
import { connect } from "./commands/connect.js";
import { disconnect } from "./commands/disconnect.js";
import { doctor } from "./commands/doctor.js";
import { readConnections } from "./connections.js";
import type { CliDevice } from "./device.js";
import {
  adapterFor,
  conformable,
  connectable,
  connectionShapeOf,
  customAdapter,
  type HarnessAdapter,
  harnessAdapters,
} from "./harnesses.js";
import type { Keychain } from "./keychain.js";
import { scriptedConsole } from "./output.js";

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

/** An adapter that exists only here: opens its own spaces, prints a block, and leaves it behind. */
const third: HarnessAdapter = {
  id: "third",
  name: "Third harness",
  connection: {
    capabilities: ["autonomy"],
    opensItsOwnSpaces: true,
    changes: ["print a block for its own config, with the token in it"],
    say: (out, address) => out.out(`BLOCK token=${address.token} url=${address.url}`),
    leaves: ["take the block out of its config by hand"],
    notYetUsed: "Paste the block and restart it.",
  },
  subject: () => ({ name: "third", start: async () => undefined, stop: async () => undefined }),
};
const MANIFEST: readonly HarnessAdapter[] = [customAdapter, third];

let home: string;
let connectionsFile: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "chips-harnesses-"));
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", date: new Date().toUTCString() },
  });
}

/** A server that answers what connect, rotate, doctor and disconnect ask, and keeps the bodies. */
function server() {
  const bodies: Record<string, unknown>[] = [];
  const tokens = [{ id: "tok_1", revoked_at: null as string | null, last_used_at: null }];
  const routes: Record<string, () => Response> = {
    "POST /v1/harnesses": () =>
      json({ harness_id: "hrn_1", display_name: "Third", token: "chips_at_first" }, 201),
    "GET /v1/harnesses/hrn_1/tokens": () => json({ tokens }),
    "POST /v1/harnesses/hrn_1/tokens": () => {
      tokens.push({ id: "tok_2", revoked_at: null, last_used_at: null });
      return json({ token_id: "tok_2", token: "chips_at_second" }, 201);
    },
    "GET /v1/participants": () => json({}),
    "GET /v1/health": () => json({}),
  };
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const method = init?.method ?? "GET";
    if (typeof init?.body === "string" && init.body !== "") {
      bodies.push(JSON.parse(init.body) as Record<string, unknown>);
    }
    if (method === "DELETE") {
      const token = tokens.find((each) => each.id === url.pathname.split("/").at(-1));
      if (token !== undefined) token.revoked_at = "2026-09-12T12:00:00.000Z";
      return json({});
    }
    return routes[`${method} ${url.pathname}`]?.() ?? json({}, 404);
  }) as typeof fetch;
  return { bodies, fetch: fetcher, tokens };
}

describe("the harness manifest", () => {
  it("connects custom, walks custom through conformance, and names nothing else", () => {
    expect(connectable().map((each) => each.id)).toEqual(["custom"]);
    expect(conformable().map((each) => each.id)).toEqual(["custom"]);
    expect(adapterFor("jacobian")).toBeUndefined();
    // A record from an older build reads as a custom harness, which every harness is on the wire.
    expect(connectionShapeOf("jacobian")).toBe(customAdapter.connection);
    for (const adapter of harnessAdapters) {
      expect(adapter.connection !== undefined || adapter.subject !== undefined).toBe(true);
    }
  });

  it("walks an adapter that exists nowhere else through every command, unchanged", async () => {
    const backend = server();
    vi.stubGlobal("fetch", backend.fetch);
    const store = keychain();
    const common = { device: DEVICE, keychain: store, connectionsFile, adapters: MANIFEST };

    // connect: registered the way the descriptor says, said the way the descriptor says.
    const out = scriptedConsole(true);
    const { connection } = await connect({
      harness: "third",
      console: out,
      assumeYes: true,
      ...common,
    });
    expect(backend.bodies[0]).toMatchObject({
      name: "Third harness",
      capabilities: ["autonomy"],
      open_direct_space: false,
    });
    expect(connection?.harnessId).toBe("hrn_1");
    expect(connection?.spaceId).toBeUndefined();
    expect(store.secrets["third:hrn_1"]).toBe("chips_at_first");
    let said = out.lines.join("\n");
    expect(said).toContain("Connect Third harness");
    expect(said).toContain("print a block for its own config, with the token in it");
    expect(said).toContain("BLOCK token=chips_at_first url=http://127.0.0.1:4431");
    expect(said).toContain("Undo with    chips disconnect Third");

    // rotate: the new token said the same way.
    const rotated = scriptedConsole(true);
    await connect({ harness: "third", console: rotated, assumeYes: true, rotate: true, ...common });
    expect(store.secrets["third:hrn_1"]).toBe("chips_at_second");
    expect(rotated.lines.join("\n")).toContain("BLOCK token=chips_at_second");

    // doctor: the descriptor's own sentence for a harness that has not connected, and no
    // word about an unknown adapter.
    const findings = await doctor({
      console: scriptedConsole(true),
      device: DEVICE,
      connections: readConnections(connectionsFile),
      keychain: store,
      fetch: backend.fetch,
      freeBytes: () => 40 * 1024 * 1024 * 1024,
      adapters: MANIFEST,
    });
    expect(findings.find((each) => each.check === "adapter:Third")).toBeUndefined();
    expect(findings.find((each) => each.check === "harness:Third")).toMatchObject({
      health: "warn",
      fix: "Paste the block and restart it.",
    });

    // conformance: the descriptor's subject is what the kit drives.
    const conformed = scriptedConsole(true);
    const { report } = await conformance({
      adapter: "third",
      console: conformed,
      timeoutSeconds: 1,
      adapters: MANIFEST,
    });
    expect(report.adapter).toBe("third");
    expect(conformed.lines.join("\n")).toContain("Conformance · third");

    // disconnect: what the descriptor says it leaves, and the way back.
    const gone = scriptedConsole(true);
    await disconnect({ harness: "third", console: gone, assumeYes: true, ...common });
    said = gone.lines.join("\n");
    expect(said).toContain("take the block out of its config by hand");
    expect(said).toContain("`chips connect third --name Third` puts it back");
    expect(readConnections(connectionsFile)).toEqual([]);
    expect(store.secrets).toEqual({});
  });
});
