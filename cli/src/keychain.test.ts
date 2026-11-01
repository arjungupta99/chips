/**
 * Where a secret goes when there is no keychain: one file, owner-only, and honest about it.
 *
 * The macOS path is `/usr/bin/security` and is not exercised here — a test that adds items to
 * the developer's own login keychain is a test that leaves things behind — so this covers the
 * fallback, which is what every other platform gets and what `doctor` reports as `file`.
 */

import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configHome, connectionsPath, devicePath } from "./home.js";
import { addPasswordCommand, openKeychain } from "./keychain.js";

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "chips-keychain-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const noKeychain = () => ({ CHIPS_CONFIG_HOME: home, CHIPS_NO_KEYCHAIN: "true" });

describe("the file store", () => {
  it("keeps a secret, gives it back, and says it is a file", () => {
    const keychain = openKeychain(noKeychain());
    expect(keychain.kind).toBe("file");
    keychain.set("custom:hrn_1", "chips_at_one");
    expect(keychain.get("custom:hrn_1")).toBe("chips_at_one");
    expect(keychain.get("nobody")).toBeUndefined();
  });

  it("writes it where nobody else on the machine can read it", () => {
    openKeychain(noKeychain()).set("a", "secret");
    const mode = statSync(join(home, "secrets.json")).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("replaces a secret rather than keeping both, which is what a rotation needs", () => {
    const keychain = openKeychain(noKeychain());
    keychain.set("a", "first");
    keychain.set("a", "second");
    expect(keychain.get("a")).toBe("second");
  });

  it("removes one, and takes the file away with the last", () => {
    const keychain = openKeychain(noKeychain());
    keychain.set("a", "one");
    keychain.set("b", "two");
    keychain.remove("a");
    expect(keychain.get("a")).toBeUndefined();
    expect(keychain.get("b")).toBe("two");
    keychain.remove("b");
    expect(keychain.get("b")).toBeUndefined();
    keychain.remove("gone already");
  });
});

describe("where the CLI keeps its things", () => {
  it("follows CHIPS_CONFIG_HOME, then XDG_CONFIG_HOME, then the home directory", () => {
    expect(configHome({ CHIPS_CONFIG_HOME: "/tmp/one" })).toBe("/tmp/one");
    expect(configHome({ XDG_CONFIG_HOME: "/tmp/two" })).toBe("/tmp/two/chips");
    expect(configHome({})).toMatch(/\.config\/chips$/);
  });

  it("puts the device key and the connections beside each other", () => {
    const environment = { CHIPS_CONFIG_HOME: home };
    expect(devicePath(environment)).toBe(join(home, "device.json"));
    expect(connectionsPath(environment)).toBe(join(home, "connections.json"));
  });
});

describe("the keychain's command (SEC-34)", () => {
  it("carries the secret to the tool's stdin, quoted, and never onto its argv", () => {
    expect(addPasswordCommand("openclaw:hrn_1", 'chips_at_se"c\\ret')).toBe(
      'add-generic-password -U -a "openclaw:hrn_1" -s "chips" -w "chips_at_se\\"c\\\\ret"\n',
    );
    expect(() => addPasswordCommand("a\nb", "x")).toThrow("one line");
    expect(() => addPasswordCommand("a", "x\r")).toThrow("one line");
  });
});
