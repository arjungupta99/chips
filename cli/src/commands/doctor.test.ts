/**
 * M2.1's acceptance for `doctor`: five induced failures, each detected and each explained.
 *
 * Every failure here is induced rather than described — the server is really not answering, the
 * key really is not the one the server knows, the token really has been taken out of the
 * keychain — because a check that only passes against a mock is a check about the mock.
 */

import { describe, expect, it } from "vitest";
import type { Connection } from "../connections.js";
import type { CliDevice } from "../device.js";
import { connectionShapeOf, customAdapter, type HarnessAdapter } from "../harnesses.js";
import type { Keychain } from "../keychain.js";
import { scriptedConsole } from "../output.js";
import { doctor, type Finding, report } from "./doctor.js";
import type { Here } from "./doctor-here.js";

const DEVICE: CliDevice = {
  deviceId: "dev_1",
  participantId: "usr_1",
  workspaceId: "ws_1",
  displayName: "Arjun",
  serverUrl: "http://127.0.0.1:4431",
  // A real key: the checks sign with it, so a fake one would fail for the wrong reason.
  privateKey: (await import("node:crypto"))
    .generateKeyPairSync("ed25519")
    .privateKey.export({ type: "pkcs8", format: "pem" }) as string,
};

const CONNECTION: Connection = {
  harness: "custom",
  harnessId: "hrn_1",
  displayName: "Scout",
  serverUrl: "http://127.0.0.1:4431",
  spaceId: "spc_1",
  account: "custom:hrn_1",
  secretStore: "keychain",
  wrote: [],
  connectedAt: "2026-09-04T10:00:00.000Z",
};

function keychain(secrets: Record<string, string>): Keychain {
  return {
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

/** A server that answers however this test needs it to. */
function server(answers: Record<string, Response | (() => Response)>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const answer = answers[url.pathname];
    if (answer === undefined) throw new Error("connect ECONNREFUSED");
    return typeof answer === "function" ? answer() : answer.clone();
  }) as typeof fetch;
}

const HEALTHY = {
  "/v1/participants": new Response("{}", { status: 200 }),
  "/v1/health": new Response("{}", { status: 200, headers: { date: new Date().toUTCString() } }),
  "/v1/harnesses/hrn_1/tokens": new Response(
    JSON.stringify({ tokens: [{ id: "tok_1", revoked_at: null }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  ),
};

/** This machine, with no server answering here. */
const HERE: Here = {
  port: 4431,
  local: "http://127.0.0.1:4431",
  release: undefined,
  node: "v22.22.2",
  networks: async () => ({ tailnet: undefined, lan: undefined }),
  serverExpectedHere: true,
  upHasRun: false,
};

const bad = (findings: readonly Finding[]): Finding[] =>
  findings.filter((each) => each.health === "bad");

describe("chips doctor", () => {
  it("says everything checks out when it does", async () => {
    const findings = await doctor({
      console: scriptedConsole(true),
      device: DEVICE,
      connections: [CONNECTION],
      keychain: keychain({ "custom:hrn_1": "chips_at_x" }),
      fetch: server(HEALTHY),
      freeBytes: () => 40 * 1024 * 1024 * 1024,
    });
    expect(bad(findings)).toEqual([]);
    const out = scriptedConsole(true);
    expect(report(out, findings)).toBe(0);
    expect(out.lines.join("\n")).toContain("Everything checks out");
  });

  it("names who a harness speaks as: its agents, the Lead first (ADR 0087)", async () => {
    const agent = (name: string, extra: Record<string, unknown> = {}) => ({
      id: `agt_${name}`,
      kind: "agent",
      display_name: name,
      harness_id: "hrn_1",
      ...extra,
    });
    const participants = [
      { id: "usr_1", kind: "person", display_name: "Arjun" },
      agent("Chess Game"),
      agent("J", { lead: true }),
      agent("Old", { state: "archived" }),
      { ...agent("Theirs"), harness_id: "hrn_2" },
    ];
    const findings = await doctor({
      console: scriptedConsole(true),
      device: DEVICE,
      connections: [CONNECTION],
      keychain: keychain({ "custom:hrn_1": "chips_at_x" }),
      fetch: server({
        ...HEALTHY,
        "/v1/participants": new Response(JSON.stringify({ participants }), { status: 200 }),
      }),
      freeBytes: () => 40 * 1024 * 1024 * 1024,
    });
    expect(findings.find((each) => each.check === "agents:Scout")).toEqual({
      check: "agents:Scout",
      health: "ok",
      detail: "Scout speaks as 3 agents: J (Lead), Chess Game; 1 archived.",
    });
  });

  it("says whether a harness is connected now, and what trouble it reports (ADR 0083)", async () => {
    const check = async (state: Record<string, unknown>) => {
      const participants = [{ id: "hrn_1", kind: "harness", display_name: "Scout", state }];
      const findings = await doctor({
        console: scriptedConsole(true),
        device: DEVICE,
        connections: [CONNECTION],
        keychain: keychain({ "custom:hrn_1": "chips_at_x" }),
        fetch: server({
          ...HEALTHY,
          "/v1/participants": () => new Response(JSON.stringify({ participants }), { status: 200 }),
        }),
        freeBytes: () => 40 * 1024 * 1024 * 1024,
      });
      return findings.find((each) => each.check === "Scout now");
    };
    expect(await check({ connected: true })).toEqual({
      check: "Scout now",
      health: "ok",
      detail: "Connected.",
    });
    expect((await check({ connected: false }))?.health).toBe("warn");
    expect(
      (await check({ connected: true, trouble: { reason: "Can't reach its gateway" } }))?.detail,
    ).toBe("Connected, and says: Can't reach its gateway");
    expect(await check({})).toBeUndefined();
  });

  it("1: this machine is not paired", async () => {
    const findings = await doctor({
      console: scriptedConsole(true),
      device: undefined,
      connections: [],
      keychain: keychain({}),
      fetch: server({}),
      freeBytes: () => 40 * 1024 * 1024 * 1024,
    });
    const [failure] = bad(findings);
    expect(failure?.check).toBe("pairing");
    expect(failure?.fix).toContain("chips pair");
  });

  it("1, for a new owner: before chips up has run here, the next step is chips up", async () => {
    const pairing = async (here: Partial<Here>) => {
      const findings = await doctor({
        console: scriptedConsole(true),
        device: undefined,
        connections: [],
        keychain: keychain({}),
        fetch: server({}),
        freeBytes: () => 40 * 1024 * 1024 * 1024,
        here: { ...HERE, ...here },
      });
      return findings.find((each) => each.check === "pairing")?.fix;
    };
    expect(await pairing({ upHasRun: false })).toBe(
      "Run `chips up` to start Chips on this machine, or `chips pair <code> --server <address>` to use one that runs on another.",
    );
    // After, this machine's own server gives the code, on the port its service has.
    expect(await pairing({ upHasRun: true })).toBe(
      "Run `chips pair --issue` for a code, then `chips pair <code>` with it.",
    );
    expect(await pairing({ upHasRun: true, port: 4800, local: "http://127.0.0.1:4800" })).toBe(
      "Run `chips pair --issue` for a code, then `chips pair <code> --server http://127.0.0.1:4800` with it.",
    );
  });

  it("2: the server is not answering", async () => {
    const findings = await doctor({
      console: scriptedConsole(true),
      device: DEVICE,
      connections: [],
      keychain: keychain({}),
      fetch: server({}),
      freeBytes: () => 40 * 1024 * 1024 * 1024,
    });
    const failure = bad(findings).find((each) => each.check === "server");
    expect(failure?.detail).toContain("not answering");
    expect(failure?.fix).toContain("Start it with `chips up` on the machine it runs on.");
  });

  it("3: the server does not accept this device key", async () => {
    const findings = await doctor({
      console: scriptedConsole(true),
      device: DEVICE,
      connections: [],
      keychain: keychain({}),
      fetch: server({ ...HEALTHY, "/v1/participants": new Response("{}", { status: 401 }) }),
      freeBytes: () => 40 * 1024 * 1024 * 1024,
    });
    const failure = bad(findings).find((each) => each.check === "credential");
    expect(failure?.fix).toContain("Pair again");
  });

  it("4: the clock is far enough out that a signature would be refused", async () => {
    const findings = await doctor({
      console: scriptedConsole(true),
      device: DEVICE,
      connections: [],
      keychain: keychain({}),
      fetch: server(HEALTHY),
      now: () => Date.now() + 20 * 60 * 1000,
      freeBytes: () => 40 * 1024 * 1024 * 1024,
    });
    const failure = bad(findings).find((each) => each.check === "clock");
    expect(failure?.detail).toMatch(/\d+ s from the server/);
    expect(failure?.fix).toContain("automatic time");
  });

  it("5: the harness's token is gone from the keychain", async () => {
    const findings = await doctor({
      console: scriptedConsole(true),
      device: DEVICE,
      connections: [CONNECTION],
      keychain: keychain({}),
      fetch: server(HEALTHY),
      freeBytes: () => 40 * 1024 * 1024 * 1024,
    });
    const failure = bad(findings).find((each) => each.check === "token:Scout");
    expect(failure?.fix).toContain("--rotate");
  });

  it("6: every token the harness had has been revoked", async () => {
    const findings = await doctor({
      console: scriptedConsole(true),
      device: DEVICE,
      connections: [CONNECTION],
      keychain: keychain({ "custom:hrn_1": "chips_at_x" }),
      fetch: server({
        ...HEALTHY,
        "/v1/harnesses/hrn_1/tokens": new Response(
          JSON.stringify({ tokens: [{ id: "tok_1", revoked_at: "2026-09-04T10:00:00.000Z" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      }),
      freeBytes: () => 40 * 1024 * 1024 * 1024,
    });
    const failure = bad(findings).find((each) => each.check === "harness:Scout");
    expect(failure?.detail).toContain("revoked");
    expect(failure?.fix).toContain("--rotate");
  });

  it("reads a record an older build wrote under an adapter this build does not have as custom", async () => {
    // `jacobian`, until 12 September 2026 (ADR 0051). The token still works and the checks still
    // run; the adapter's absence is said once, and every fix names the custom path.
    const older: Connection = {
      ...CONNECTION,
      harness: "jacobian",
      displayName: "Jacobian",
      account: "jacobian:hrn_1",
    };
    const at = (tokens: unknown[]): Response =>
      new Response(JSON.stringify({ tokens }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const findings = await doctor({
      console: scriptedConsole(true),
      device: DEVICE,
      connections: [older],
      keychain: keychain({ "jacobian:hrn_1": "chips_at_x" }),
      fetch: server({
        ...HEALTHY,
        "/v1/harnesses/hrn_1/tokens": at([{ id: "tok_1", revoked_at: null, last_used_at: null }]),
      }),
      freeBytes: () => 40 * 1024 * 1024 * 1024,
    });
    expect(bad(findings)).toEqual([]);
    expect(findings.find((each) => each.check === "adapter:Jacobian")).toMatchObject({
      health: "warn",
      detail:
        "Jacobian was connected as `jacobian`, an adapter this build does not have; it is read as a custom harness.",
    });
    expect(findings.find((each) => each.check === "adapter:Jacobian")?.fix).toContain(
      "`chips connect custom --name Jacobian`",
    );
    expect(findings.find((each) => each.check === "harness:Jacobian")).toMatchObject({
      health: "warn",
      fix: "Start the harness with its token.",
    });

    const forgotten = await doctor({
      console: scriptedConsole(true),
      device: DEVICE,
      connections: [older],
      keychain: keychain({ "jacobian:hrn_1": "chips_at_x" }),
      fetch: server({
        ...HEALTHY,
        "/v1/harnesses/hrn_1/tokens": new Response("{}", { status: 404 }),
      }),
      freeBytes: () => 40 * 1024 * 1024 * 1024,
    });
    expect(bad(forgotten).find((each) => each.check === "harness:Jacobian")?.fix).toBe(
      "Run `chips connect custom --name Jacobian` to register it again.",
    );
  });

  it("warns when a harness that runs elsewhere has never used its token, and says when it last spoke", async () => {
    // An adapter whose harness runs on another machine and reads a block it printed — the words
    // are the manifest's (ADR 0051), so the check reads them from there.
    const hermes: HarnessAdapter = {
      id: "hermes",
      name: "Hermes",
      connection: {
        ...connectionShapeOf("custom"),
        notYetUsed:
          "Paste the block `chips connect hermes` printed where Hermes runs, and restart it.",
      },
    };
    const adapters = [customAdapter, hermes];
    const jacobian: Connection = {
      ...CONNECTION,
      harness: "hermes",
      displayName: "Hermes",
      account: "hermes:hrn_1",
    };
    const at = (tokens: unknown[]): Response =>
      new Response(JSON.stringify({ tokens }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const now = Date.parse("2026-09-05T12:00:00.000Z");

    const silentSoFar = await doctor({
      console: scriptedConsole(true),
      device: DEVICE,
      connections: [jacobian],
      keychain: keychain({ "hermes:hrn_1": "chips_at_x" }),
      fetch: server({
        ...HEALTHY,
        "/v1/harnesses/hrn_1/tokens": at([{ id: "tok_1", revoked_at: null, last_used_at: null }]),
      }),
      now: () => now,
      freeBytes: () => 40 * 1024 * 1024 * 1024,
      adapters,
    });
    const warning = silentSoFar.find((each) => each.check === "harness:Hermes");
    expect(warning?.health).toBe("warn");
    expect(warning?.detail).toContain("has never used one");
    expect(warning?.fix).toContain("Paste the block `chips connect hermes` printed");
    expect(silentSoFar.find((each) => each.check === "adapter:Hermes")).toBeUndefined();

    const spoke = await doctor({
      console: scriptedConsole(true),
      device: DEVICE,
      connections: [jacobian],
      keychain: keychain({ "hermes:hrn_1": "chips_at_x" }),
      fetch: server({
        ...HEALTHY,
        "/v1/harnesses/hrn_1/tokens": at([
          { id: "tok_1", revoked_at: null, last_used_at: "2026-09-05T11:57:10.000Z" },
          { id: "tok_2", revoked_at: null, last_used_at: null },
        ]),
      }),
      now: () => now,
      freeBytes: () => 40 * 1024 * 1024 * 1024,
      adapters,
    });
    const fine = spoke.find((each) => each.check === "harness:Hermes");
    expect(fine).toEqual({
      check: "harness:Hermes",
      health: "ok",
      detail: "Hermes has 2 live tokens; last spoke 3 minutes ago.",
    });

    // A harness that has never spoken warns whichever harness it is; only the fix differs.
    const custom = await doctor({
      console: scriptedConsole(true),
      device: DEVICE,
      connections: [CONNECTION],
      keychain: keychain({ "custom:hrn_1": "chips_at_x" }),
      fetch: server({
        ...HEALTHY,
        "/v1/harnesses/hrn_1/tokens": at([{ id: "tok_1", revoked_at: null, last_used_at: null }]),
      }),
      now: () => now,
      freeBytes: () => 40 * 1024 * 1024 * 1024,
    });
    const quiet = custom.find((each) => each.check === "harness:Scout");
    expect(quiet?.health).toBe("warn");
    expect(quiet?.fix).toBe("Start the harness with its token.");
  });

  it("checks two custom harnesses each by its own name, and says which one to renew", async () => {
    const claw: Connection = {
      ...CONNECTION,
      harnessId: "hrn_2",
      displayName: "OpenClaw",
      account: "custom:hrn_2",
    };
    const findings = await doctor({
      console: scriptedConsole(true),
      device: DEVICE,
      connections: [CONNECTION, claw],
      // Scout's token is there and OpenClaw's is not.
      keychain: keychain({ "custom:hrn_1": "chips_at_x" }),
      fetch: server({
        ...HEALTHY,
        "/v1/harnesses/hrn_2/tokens": HEALTHY["/v1/harnesses/hrn_1/tokens"],
      }),
      freeBytes: () => 40 * 1024 * 1024 * 1024,
    });
    const checks = findings.map((each) => each.check);
    expect(checks).toEqual(expect.arrayContaining(["token:Scout", "token:OpenClaw"]));
    expect(checks).toEqual(expect.arrayContaining(["harness:Scout", "harness:OpenClaw"]));
    expect(bad(findings).find((each) => each.check === "token:OpenClaw")?.fix).toBe(
      "Run `chips connect OpenClaw --rotate` to mint another.",
    );
  });

  it("quotes a name with a space in it, and tells two harnesses of one name apart by id", async () => {
    // `Claude Code`, from an adapter this build does not have: every fix it prints is typed whole.
    const older: Connection = {
      ...CONNECTION,
      harness: "claude-code",
      harnessId: "hrn_3",
      displayName: "Claude Code",
      account: "claude-code:hrn_3",
    };
    const twin: Connection = { ...CONNECTION, harnessId: "hrn_2", account: "custom:hrn_2" };
    const findings = await doctor({
      console: scriptedConsole(true),
      device: DEVICE,
      connections: [CONNECTION, twin, older],
      keychain: keychain({ "custom:hrn_1": "chips_at_x", "custom:hrn_2": "chips_at_x" }),
      fetch: server({
        ...HEALTHY,
        "/v1/harnesses/hrn_2/tokens": HEALTHY["/v1/harnesses/hrn_1/tokens"],
        "/v1/harnesses/hrn_3/tokens": new Response("{}", { status: 404 }),
      }),
      freeBytes: () => 40 * 1024 * 1024 * 1024,
    });
    const checks = findings.map((each) => each.check);
    expect(checks).toEqual(expect.arrayContaining(["harness:hrn_1", "harness:hrn_2"]));
    expect(bad(findings).find((each) => each.check === 'token:"Claude Code"')?.fix).toBe(
      'Run `chips connect "Claude Code" --rotate` to mint another.',
    );
    expect(bad(findings).find((each) => each.check === 'harness:"Claude Code"')?.fix).toBe(
      'Run `chips connect custom --name "Claude Code"` to register it again.',
    );
  });

  it("7: the disk where Chips writes is nearly full", async () => {
    const findings = await doctor({
      console: scriptedConsole(true),
      device: DEVICE,
      connections: [],
      keychain: keychain({}),
      fetch: server(HEALTHY),
      freeBytes: () => 12 * 1024 * 1024,
    });
    const failure = bad(findings).find((each) => each.check === "disk");
    expect(failure?.detail).toContain("12 MB free");
  });

  it("prints a warning's fix after the failures', and passes with only warnings", () => {
    const out = scriptedConsole(true);
    const findings = [
      {
        check: "video",
        health: "warn" as const,
        detail: "ffmpeg isn't here.",
        fix: "Install ffmpeg.",
      },
      { check: "disk", health: "ok" as const, detail: "40 GB free." },
    ];
    expect(report(out, findings)).toBe(0);
    const printed = out.lines.join("\n");
    expect(printed).toContain("Everything checks out");
    expect(printed).toContain("video: Install ffmpeg.");
  });

  it("prints the fix under every failure, with somewhere to read more", async () => {
    const findings = await doctor({
      console: scriptedConsole(true),
      device: undefined,
      connections: [],
      keychain: keychain({}),
      fetch: server({}),
      freeBytes: () => 1024,
    });
    const out = scriptedConsole(true);
    expect(report(out, findings)).toBe(1);
    const printed = out.lines.join("\n");
    expect(printed).toContain("2 to fix");
    for (const failure of bad(findings)) {
      expect(failure.fix).toBeDefined();
      expect(printed).toContain(failure.fix as string);
      expect(printed).toContain(failure.docs as string);
    }
  });
});
