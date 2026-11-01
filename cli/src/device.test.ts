/**
 * The CLI's credential: it signs the way a browser does, because it signs with the server's own
 * definition of what is signed (`signingPayload`), and the server accepts what it produces.
 *
 * That last part is the test worth having: a signature this file thinks is right and the
 * authenticator does not is a bug nothing else would catch until a person tried to use it.
 */

import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../../server/src/testing/workspace.js";
import {
  type CliDevice,
  loadDevice,
  PairingError,
  pairDevice,
  publicKeyOf,
  signRequest,
} from "./device.js";

const directories: string[] = [];
const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const close of closers.splice(0)) await close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function scratch(): string {
  const directory = mkdtempSync(join(tmpdir(), "chips-device-"));
  directories.push(directory);
  return directory;
}

async function workspace(): Promise<TestWorkspace> {
  const ws = await createTestWorkspace({ config: { devMode: true } as never });
  closers.push(() => ws.close());
  return ws;
}

const device = (over: Partial<CliDevice> = {}): CliDevice => ({
  deviceId: "dev_1",
  participantId: "usr_1",
  workspaceId: "ws_1",
  displayName: "Arjun",
  serverUrl: "http://127.0.0.1:4431",
  privateKey: generateKeyPairSync("ed25519").privateKey.export({
    type: "pkcs8",
    format: "pem",
  }) as string,
  ...over,
});

describe("the CLI's device key", () => {
  it("signs what the server expects, and the server accepts it", async () => {
    const ws = await workspace();
    const path = join(scratch(), "device.json");
    const code = ws.gateway.deps.pairingCodes?.issue({
      workspaceId: ws.workspaceId,
      participantId: ws.arjun.participantId,
    });

    // Pair against the real gateway, through its own fetch handler.
    const original = globalThis.fetch;
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
      ws.gateway.app.fetch(new Request(String(input), init))) as typeof fetch;
    try {
      const paired = await pairDevice({
        serverUrl: "http://chips.local",
        code: code?.code ?? "",
        name: "chips CLI",
        path,
      });
      expect(paired.participantId).toBe(ws.arjun.participantId);
      expect(paired.workspaceId).toBe(ws.workspaceId);

      // It is on disk, owner-only, and reads back.
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(loadDevice(path)?.deviceId).toBe(paired.deviceId);
      expect(readFileSync(path, "utf8")).toContain("BEGIN PRIVATE KEY");

      // And the signature it makes is one the authenticator takes.
      const target = "/v1/participants";
      const response = await ws.gateway.app.fetch(
        new Request(`http://chips.local${target}`, {
          headers: signRequest(paired, "GET", target),
        }),
      );
      expect(response.status).toBe(200);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("refuses a code the server does not know, in the server's own words", async () => {
    const ws = await workspace();
    const original = globalThis.fetch;
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
      ws.gateway.app.fetch(new Request(String(input), init))) as typeof fetch;
    try {
      await expect(
        pairDevice({
          serverUrl: "http://chips.local",
          code: "AAA-AAA",
          name: "chips CLI",
          path: join(scratch(), "device.json"),
        }),
      ).rejects.toBeInstanceOf(PairingError);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("has nothing to load when nothing was ever paired", () => {
    expect(loadDevice(join(scratch(), "missing.json"))).toBeUndefined();
  });

  it("can say which public key it is, for a check that the server still knows it", () => {
    const one = device();
    expect(publicKeyOf(one)).toBe(publicKeyOf(one));
    expect(publicKeyOf(one)).not.toBe(publicKeyOf(device()));
  });
});
