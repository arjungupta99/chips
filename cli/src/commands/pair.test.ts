/**
 * `chips pair --issue`: a paired machine asks the server for a code, and prints it — and a QR
 * that another device on the network can actually open.
 */

import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type CliDevice, PairingError } from "../device.js";
import { scriptedConsole } from "../output.js";
import {
  issuePairingCode,
  PAIR_DEFAULT_SERVER,
  pairingAsked,
  pairingFailed,
  requestPairingCode,
} from "./pair.js";

const key = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" });

function device(serverUrl: string): CliDevice {
  return {
    deviceId: "dev_1",
    participantId: "usr_1",
    workspaceId: "ws_1",
    displayName: "Arjun",
    serverUrl,
    privateKey: key as string,
  };
}

/** A server that issues a code, and remembers what it was asked. */
function server(now: number, offer: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${new URL(String(input)).pathname}`);
    return new Response(
      JSON.stringify({
        code: "ABC-DEF",
        expires_at: new Date(now + 900_000).toISOString(),
        ...offer,
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  return { calls, fetch: fetcher };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chips pair --issue", () => {
  it("asks the server for a code and prints it, with a QR another device can open", async () => {
    const now = Date.parse("2026-09-05T10:00:00.000Z");
    const backend = server(now);
    vi.stubGlobal("fetch", backend.fetch);
    const out = scriptedConsole(true);

    const issued = await issuePairingCode({
      console: out,
      device: device("http://127.0.0.1:4431"),
      lan: (port) => `http://192.168.1.20:${port}`,
      now: () => now,
    });

    expect(backend.calls).toEqual(["POST /v1/pairing-codes"]);
    expect(issued).toEqual({
      code: "ABC-DEF",
      expiresAt: "2026-09-05T10:15:00.000Z",
      url: "http://192.168.1.20:4431",
    });
    const printed = out.lines.join("\n");
    expect(printed).toContain("Pair another device");
    expect(printed).toContain("code       ABC-DEF");
    expect(printed).toContain("15 minutes, once");
    expect(printed).toContain("server     http://192.168.1.20:4431");
    expect(printed).toContain("█");
  });

  it("keeps the server's own address when it is not this machine", async () => {
    const backend = server(Date.now());
    vi.stubGlobal("fetch", backend.fetch);
    const issued = await issuePairingCode({
      console: scriptedConsole(true),
      device: device("http://mini.local:4431"),
      lan: () => "http://192.168.1.20:4431",
    });
    expect(issued.url).toBe("http://mini.local:4431");
  });

  it("takes the address the server names over anything this machine could work out", async () => {
    const backend = server(Date.now(), { server_url: "http://100.64.0.7:4431" });
    vi.stubGlobal("fetch", backend.fetch);
    const out = scriptedConsole(true);
    const issued = await issuePairingCode({
      console: out,
      device: device("http://127.0.0.1:4431"),
      lan: (port) => `http://192.168.1.20:${port}`,
    });
    expect(issued.url).toBe("http://100.64.0.7:4431");
    expect(out.lines.join("\n")).toContain("server     http://100.64.0.7:4431");
  });

  it("will not issue from a machine that has no credential of its own", async () => {
    await expect(
      issuePairingCode({ console: scriptedConsole(true), device: undefined }),
    ).rejects.toThrow(/not paired/);
  });
});

describe("the QR beside the code (M4.1)", () => {
  it("carries the relay and the server's key when the server offers them", async () => {
    const now = Date.parse("2026-09-06T10:00:00.000Z");
    const key = "k".repeat(43);
    vi.stubGlobal("fetch", server(now, { relay: "wss://relay.example", server_key: key }).fetch);
    const out = scriptedConsole(true);
    const issued = await issuePairingCode({
      console: out,
      device: device("http://127.0.0.1:4431"),
      lan: (port) => `http://192.168.1.20:${port}`,
      now: () => now,
    });
    expect(issued.relay).toBe("wss://relay.example");
    expect(issued.serverKey).toBe(key);
    expect(out.lines.join("\n")).toContain("wss://relay.example");
  });
});

/**
 * The machine that runs the server (ADR 0048): its device may be gone, or never have existed,
 * and the token the server left beside its database issues a code all the same.
 */
describe("from the machine that runs the server", () => {
  const TOKEN = "t".repeat(43);
  let directory: string;
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  /** A token file where a running server would have left one, or none. */
  function tokenFile(present: boolean): string {
    directory = mkdtempSync(join(tmpdir(), "chips-pair-"));
    const path = join(directory, "operator.token");
    if (present) writeFileSync(path, `${TOKEN}\n`);
    return path;
  }

  /** A server that has withdrawn this machine's device but answers its operator. */
  function serverThatTurnedUsAway(now: number) {
    const calls: string[] = [];
    const tokens: (string | null)[] = [];
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      calls.push(`${init?.method ?? "GET"} ${path}`);
      if (path === "/v1/pairing-codes") {
        return new Response(
          JSON.stringify({ error: { message: "That credential is not valid here." } }),
          { status: 401, headers: { "content-type": "application/json" } },
        );
      }
      tokens.push(new Headers(init?.headers).get("x-chips-operator"));
      return new Response(
        JSON.stringify({
          code: "GHJ-KLM",
          expires_at: new Date(now + 900_000).toISOString(),
          server_url: "http://100.64.0.7:4431",
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    return { calls, tokens, fetch: fetcher };
  }

  it("falls back to the server's own token when this machine's device is turned away", async () => {
    const now = Date.parse("2026-09-10T22:00:00.000Z");
    const backend = serverThatTurnedUsAway(now);
    vi.stubGlobal("fetch", backend.fetch);
    const out = scriptedConsole(true);

    const issued = await issuePairingCode({
      console: out,
      device: device("http://127.0.0.1:4431"),
      operator: { serverUrl: "http://127.0.0.1:4431", tokenPath: tokenFile(true) },
      now: () => now,
    });

    expect(backend.calls).toEqual(["POST /v1/pairing-codes", "POST /v1/operator/pairing-code"]);
    expect(backend.tokens).toEqual([TOKEN]);
    expect(issued.code).toBe("GHJ-KLM");
    expect(issued.url).toBe("http://100.64.0.7:4431");
    const printed = out.lines.join("\n");
    expect(printed).toContain("code       GHJ-KLM");
    expect(printed).toContain("turned away (That credential is not valid here.)");
    expect(printed).toContain("comes from the server itself");
  });

  it("issues with no device at all, as long as a server of this machine's left its token", async () => {
    const backend = serverThatTurnedUsAway(Date.now());
    vi.stubGlobal("fetch", backend.fetch);
    const out = scriptedConsole(true);
    const issued = await issuePairingCode({
      console: out,
      device: undefined,
      operator: { serverUrl: "http://127.0.0.1:4431", tokenPath: tokenFile(true) },
    });
    expect(backend.calls).toEqual(["POST /v1/operator/pairing-code"]);
    expect(issued.code).toBe("GHJ-KLM");
    expect(out.lines.join("\n")).toContain("no device of its own");
  });

  it("still refuses when there is neither a device nor a token here, and says to start one", async () => {
    const backend = serverThatTurnedUsAway(Date.now());
    vi.stubGlobal("fetch", backend.fetch);
    await expect(
      issuePairingCode({
        console: scriptedConsole(true),
        device: undefined,
        operator: { serverUrl: "http://127.0.0.1:4431", tokenPath: tokenFile(false) },
      }),
    ).rejects.toThrow(/not paired yet\. Run `chips up` to start Chips here/);
    expect(backend.calls).toEqual([]);
  });

  it("asks the server here by its token first for `chips up`, since the device may be another's", async () => {
    const backend = serverThatTurnedUsAway(Date.now());
    vi.stubGlobal("fetch", backend.fetch);
    // This machine's device is paired to a server elsewhere: it is never asked.
    const issued = await requestPairingCode({
      device: device("http://192.168.1.50:4431"),
      operator: { serverUrl: "http://127.0.0.1:4800", tokenPath: tokenFile(true) },
      operatorFirst: true,
    });
    expect(backend.calls).toEqual(["POST /v1/operator/pairing-code"]);
    expect(backend.tokens).toEqual([TOKEN]);
    expect(issued.code).toBe("GHJ-KLM");
    expect(issued.note).toBeUndefined();
  });

  it("asks the device for `chips up` when there is no token here to read", async () => {
    const fallback = serverThatTurnedUsAway(Date.now());
    vi.stubGlobal("fetch", fallback.fetch);
    await expect(
      requestPairingCode({
        device: device("http://127.0.0.1:4431"),
        operator: { serverUrl: "http://127.0.0.1:4431", tokenPath: tokenFile(false) },
        operatorFirst: true,
      }),
    ).rejects.toThrow(/not valid here/);
    expect(fallback.calls).toEqual(["POST /v1/pairing-codes"]);
  });

  it("passes the device's refusal on when no token is here to fall back to", async () => {
    const backend = serverThatTurnedUsAway(Date.now());
    vi.stubGlobal("fetch", backend.fetch);
    await expect(
      issuePairingCode({
        console: scriptedConsole(true),
        device: device("http://127.0.0.1:4431"),
        operator: { serverUrl: "http://127.0.0.1:4431", tokenPath: tokenFile(false) },
      }),
    ).rejects.toThrow(/not valid here/);
  });
});

describe("a code only this machine can use (the onboarding audit, item 29)", () => {
  it("draws no QR for a phone when the server answers this machine alone, and says how to let one in", async () => {
    vi.stubGlobal("fetch", server(Date.now(), { server_url: "http://127.0.0.1:4431" }).fetch);
    const out = scriptedConsole(true);
    await issuePairingCode({ console: out, device: device("http://127.0.0.1:4431") });
    const printed = out.lines.join("\n");
    expect(printed).toContain("code       ABC-DEF");
    expect(printed).toContain(
      "Only this machine can reach this Chips, so a phone can't use the code.",
    );
    expect(printed).toContain("`chips up --reach lan`");
    expect(printed).not.toContain("█");
  });

  it("draws the phone's QR when a relay reaches it from anywhere", async () => {
    vi.stubGlobal(
      "fetch",
      server(Date.now(), {
        server_url: "http://127.0.0.1:4431",
        relay: "wss://relay.example",
        server_key: "k".repeat(43),
      }).fetch,
    );
    const out = scriptedConsole(true);
    await issuePairingCode({ console: out, device: device("http://127.0.0.1:4431") });
    const printed = out.lines.join("\n");
    expect(printed).toContain("On a phone, scan this with its camera.");
    expect(printed).toContain("█");
  });
});

describe("chips pair <code> (the onboarding audit, item 6)", () => {
  it("finds the code wherever it stands, as the guides put --server first", () => {
    expect(pairingAsked(["ABC-234"], "http://mini.local:4431")).toEqual({
      ok: true,
      code: "ABC-234",
      server: "http://mini.local:4431",
    });
    expect(pairingAsked(["abc234"], undefined)).toEqual({
      ok: true,
      code: "ABC-234",
      server: PAIR_DEFAULT_SERVER,
    });
    expect(pairingAsked(["http://192.168.1.20:4431/", "ABC-234"], undefined)).toEqual({
      ok: true,
      code: "ABC-234",
      server: "http://192.168.1.20:4431",
    });
  });

  it("gives an address without its http:// one", () => {
    expect(pairingAsked(["ABC-234"], "192.168.1.20:4431")).toMatchObject({
      server: "http://192.168.1.20:4431",
    });
  });

  it("says what is missing or wrong instead of sending it", () => {
    expect(pairingAsked([], undefined)).toMatchObject({ ok: false });
    expect(pairingAsked(["hello"], undefined)).toMatchObject({
      ok: false,
      problem: expect.stringContaining("isn't a pairing code"),
    });
    expect(pairingAsked(["ABC-234"], "ftp://x")).toMatchObject({
      ok: false,
      problem: expect.stringContaining("isn't a server's address"),
    });
  });

  it("says a failure in words: the server's own, or that nothing answered", () => {
    expect(pairingFailed(new PairingError("That pairing code is not valid."), "http://x:1")).toBe(
      "That pairing code is not valid.",
    );
    expect(pairingFailed(new TypeError("fetch failed"), PAIR_DEFAULT_SERVER)).toContain(
      "Chips isn't running on this machine: `chips up` starts it",
    );
    expect(pairingFailed(new TypeError("fetch failed"), "http://mini.local:4431")).toBe(
      "Nothing answered at http://mini.local:4431. Check the address, and that Chips is running there and this machine is on its network.",
    );
  });
});
