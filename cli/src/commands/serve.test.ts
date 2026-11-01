/**
 * `chips serve` on a clean machine: it makes a workspace, prints a code you can pair with, and
 * says where it is. The server it starts is the real one, on a real port, in a temporary
 * directory — the point of this command is the wiring, so there is nothing here worth faking.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig } from "@chipschat/platform";
import { openDatabase, operatorTokenPath } from "@chipschat/server";
import { afterEach, describe, expect, it } from "vitest";
import { type CliDevice, call, loadDevice } from "../device.js";
import type { Advertisement } from "../discovery.js";
import { scriptedConsole } from "../output.js";
import { serve } from "./serve.js";

/** Discovery has its own test; these are about the server, and share no socket with anything. */
const quietly = (): Advertisement => ({ stop: async () => {} });

const directories: string[] = [];
const stops: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function config() {
  const directory = mkdtempSync(join(tmpdir(), "chips-serve-"));
  directories.push(directory);
  const base = defaultConfig();
  return {
    ...base,
    // Port zero: the operating system picks one, so two runs never collide.
    server: { ...base.server, port: 0, host: "127.0.0.1" },
    data: { dir: directory, databaseUrl: `sqlite:${join(directory, "chips.db")}` },
    log: { ...base.log, level: "silent" as const },
  };
}

/** Where a run keeps the machine's own credential: beside its database, never the real one. */
function deviceFile(settings: ReturnType<typeof config>): string {
  return join(settings.data.dir, "device.json");
}

describe("chips serve", () => {
  it("leaves its operator token beside the database while it runs, and takes it back after (ADR 0048)", async () => {
    const settings = config();
    const serving = await serve({
      config: settings,
      console: scriptedConsole(true),
      advertise: quietly,
      devicePath: deviceFile(settings),
    });
    const tokenPath = operatorTokenPath(settings);
    const token = readFileSync(tokenPath, "utf8").trim();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(statSync(tokenPath).mode & 0o777).toBe(0o600);

    // The token is a door: it issues a code, for the person this run made.
    const minted = await fetch(`${serving.url}/v1/operator/pairing-code`, {
      method: "POST",
      headers: { "x-chips-operator": token },
    });
    expect(minted.status).toBe(201);
    const { code } = (await minted.json()) as { code: string };
    expect(code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
    const wrong = await fetch(`${serving.url}/v1/operator/pairing-code`, {
      method: "POST",
      headers: { "x-chips-operator": "x".repeat(43) },
    });
    expect(wrong.status).toBe(401);

    await serving.stop();
    expect(existsSync(tokenPath)).toBe(false);
  });

  it("makes a workspace on a clean machine, and prints a code to pair with", async () => {
    const out = scriptedConsole(true);
    const settings = config();
    const serving = await serve({
      config: settings,
      console: out,
      advertise: quietly,
      devicePath: deviceFile(settings),
    });
    stops.push(serving.stop);

    expect(serving.workspaceId).toMatch(/^ws_/);
    expect(serving.pairingCode).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
    const printed = out.lines.join("\n");
    expect(printed).toContain("A new workspace is ready");
    expect(printed).toContain(serving.pairingCode);
    // Bound to loopback: nothing else could reach it, so it does not say it is there.
    expect(printed).toContain("not advertised: nothing else can reach it");
    // The QR is the same code, drawn: a phone camera reads one and a keyboard reads the other.
    expect(printed).toContain("█");

    // And the code pairs: the server it started is the real thing.
    const paired = await fetch(`${serving.url}/v1/health`);
    expect(paired.ok).toBe(true);
  });

  it("puts the relay and the server's key in the QR when the server dials out to one (M4.1)", async () => {
    const settings = config();
    const alone = await serve({
      config: settings,
      console: scriptedConsole(true),
      advertise: quietly,
      devicePath: deviceFile(settings),
    });
    stops.push(alone.stop);
    expect(alone.pairingUrl).toBe(`${alone.url}/#pair=${alone.pairingCode}&v=1`);
    await alone.stop();

    const out = scriptedConsole(true);
    const through = await serve({
      config: { ...settings, relay: { ...settings.relay, url: "wss://relay.example" } },
      console: out,
      advertise: quietly,
      devicePath: deviceFile(settings),
      lan: () => "http://192.168.1.20:4431",
    });
    stops.push(through.stop);
    expect(out.lines.join("\n")).toContain("wss://relay.example");
    const carried = new URL(through.pairingUrl);
    // Bound to loopback, so the QR carries the server's own address, not the network's.
    expect(carried.origin).toBe(new URL(through.url).origin);
    const fields = new URLSearchParams(carried.hash.slice(1));
    expect(fields.get("pair")).toBe(through.pairingCode);
    expect(fields.get("v")).toBe("1");
    expect(fields.get("relay")).toBe("wss://relay.example");
    expect(fields.get("key")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // The same key next time: it was made once and kept beside the workspace.
    await through.stop();
    const again = await serve({
      config: { ...settings, relay: { ...settings.relay, url: "wss://relay.example" } },
      console: scriptedConsole(true),
      advertise: quietly,
      devicePath: deviceFile(settings),
    });
    stops.push(again.stop);
    expect(new URLSearchParams(new URL(again.pairingUrl).hash.slice(1)).get("key")).toBe(
      fields.get("key"),
    );
  });

  it("leaves a workspace it finds alone, and says so", async () => {
    const settings = config();
    const devicePath = deviceFile(settings);
    const first = await serve({
      config: settings,
      console: scriptedConsole(true),
      advertise: quietly,
      devicePath,
    });
    await first.stop();

    const out = scriptedConsole(true);
    const again = await serve({ config: settings, console: out, advertise: quietly, devicePath });
    stops.push(again.stop);
    expect(again.workspaceId).toBe(first.workspaceId);
    expect(out.lines.join("\n")).toContain("Chips is running");
  });

  it("pairs the machine it runs on, once, so connect and pair --issue work there", async () => {
    const settings = config();
    const devicePath = deviceFile(settings);
    const out = scriptedConsole(true);
    const serving = await serve({
      config: settings,
      console: out,
      advertise: quietly,
      devicePath,
      personName: "You",
    });
    stops.push(serving.stop);

    expect(serving.pairedAs).toMatch(/^dev_/);
    expect(out.lines.join("\n")).toContain("paired now, as You");
    const device = loadDevice(devicePath);
    expect(device?.deviceId).toBe(serving.pairedAs);
    expect(device?.serverUrl).toBe(serving.url);
    // The credential is real: a signed request is accepted, and can issue a code for the next device.
    const issued = await call<{ code: string }>(device as CliDevice, "POST", "/v1/pairing-codes");
    expect(issued.code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);

    // Started again, it finds the key it made and makes no second device.
    await serving.stop();
    const again = await serve({
      config: settings,
      console: scriptedConsole(true),
      advertise: quietly,
      devicePath,
    });
    stops.push(again.stop);
    expect(again.pairedAs).toBeUndefined();
    expect(loadDevice(devicePath)?.deviceId).toBe(device?.deviceId);
  });

  it("names a new workspace's first person as it was told, and the workspace after them (ADR 0170, ADR 0194)", async () => {
    const settings = config();
    const devicePath = deviceFile(settings);
    const first = await serve({
      config: settings,
      console: scriptedConsole(true),
      advertise: quietly,
      devicePath,
      personName: "Ada",
    });
    stops.push(first.stop);
    const device = loadDevice(devicePath) as CliDevice;
    const named = async (url: string) =>
      (
        await call<{ participants: { display_name: string; kind: string }[] }>(
          { ...device, serverUrl: url },
          "GET",
          "/v1/participants",
        )
      ).participants
        .filter((each) => each.kind === "person")
        .map((each) => each.display_name);
    expect(await named(first.url)).toEqual(["Ada"]);
    // And the workspace is called after them, until its owner renames it (ADR 0194).
    const db = openDatabase({ databaseUrl: settings.data.databaseUrl });
    const workspace = await db.db
      .selectFrom("workspaces")
      .select("name")
      .where("id", "=", first.workspaceId)
      .executeTakeFirst();
    await db.close();
    expect(workspace?.name).toBe("Ada's workspace");

    await first.stop();
    const again = await serve({
      config: settings,
      console: scriptedConsole(true),
      advertise: quietly,
      devicePath,
      personName: "Somebody else",
    });
    stops.push(again.stop);
    // On another port: zero asks the system for one each time.
    expect(await named(again.url)).toEqual(["Ada"]);
  });

  it("bound to loopback, says only this machine can reach it and offers no network address", async () => {
    const out = scriptedConsole(true);
    const settings = config();
    const serving = await serve({
      config: settings,
      console: out,
      advertise: quietly,
      lan: () => "http://192.168.1.20:4431",
      devicePath: deviceFile(settings),
    });
    stops.push(serving.stop);
    const printed = out.lines.join("\n");
    expect(printed).not.toContain("on this network");
    expect(printed).toContain("CHIPS_HOST=0.0.0.0");
  });

  it("bound to every address, names the one another device can reach", async () => {
    const out = scriptedConsole(true);
    const settings = config();
    const serving = await serve({
      config: { ...settings, server: { ...settings.server, host: "0.0.0.0" } },
      console: out,
      advertise: quietly,
      lan: () => "http://192.168.1.20:4431",
      devicePath: deviceFile(settings),
    });
    stops.push(serving.stop);
    expect(serving.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const printed = out.lines.join("\n");
    expect(printed).toContain("on this network   http://192.168.1.20:4431");
    expect(printed).not.toContain("CHIPS_HOST=0.0.0.0");
  });
});
