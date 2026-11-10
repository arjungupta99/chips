/**
 * The Node a harness's bridge is kept on (ADR 0218), and what the server's service runs: the
 * install's `current` one, which an upgrade moves, or the release's own where nothing points at it.
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pruneReleases, releasesToRemove, stableCommand, stableNode, writeText } from "./system.js";

let lib: string;
beforeEach(() => {
  lib = realpathSync(mkdtempSync(join(tmpdir(), "chips-lib-")));
  mkdirSync(join(lib, "0.2.0", "runtime"), { recursive: true });
});
afterEach(() => rmSync(lib, { recursive: true, force: true }));

describe("the Node a bridge is kept on", () => {
  it("is the one under `current` when `current` is this release, so an upgrade moves it", () => {
    symlinkSync(join(lib, "0.2.0"), join(lib, "current"));
    expect(stableNode({ version: "0.2.0", root: join(lib, "0.2.0") }, {})).toBe(
      join(lib, "current", "runtime", "node"),
    );
  });

  it("is the release's own where `current` is another, or isn't there (Chips.app)", () => {
    expect(stableNode({ version: "0.2.0", root: join(lib, "0.2.0") }, {})).toBe(
      join(lib, "0.2.0", "runtime", "node"),
    );
    mkdirSync(join(lib, "0.3.0"));
    symlinkSync(join(lib, "0.3.0"), join(lib, "current"));
    expect(stableNode({ version: "0.2.0", root: join(lib, "0.2.0") }, {})).toBe(
      join(lib, "0.2.0", "runtime", "node"),
    );
  });

  it("from a checkout, is the PATH's node, which `brew upgrade node` keeps, not this version's own", () => {
    const bin = join(lib, "bin");
    mkdirSync(bin);
    writeText(join(bin, "node"), "#!/bin/sh\n");
    chmodSync(join(bin, "node"), 0o755);
    expect(stableNode(undefined, { PATH: `${join(lib, "none")}:${bin}:/usr/bin` })).toBe(
      join(bin, "node"),
    );
  });
});

describe("what the server's service runs", () => {
  it("is the install's own Node and CLI, by `current` when that is this release", () => {
    symlinkSync(join(lib, "0.2.0"), join(lib, "current"));
    expect(stableCommand({ version: "0.2.0", root: join(lib, "0.2.0") })).toEqual([
      join(lib, "current", "runtime", "node"),
      join(lib, "current", "lib", "chips.mjs"),
    ]);
  });

  it("is the release's own inside Chips.app, which has no `current`", () => {
    const root = join(lib, "Chips.app", "Contents", "Resources", "chips");
    expect(stableCommand({ version: "0.2.0", root })).toEqual([
      join(root, "runtime", "node"),
      join(root, "lib", "chips.mjs"),
    ]);
  });
});

describe("the service's file", () => {
  it("is readable by this user alone, new or rewritten, since it carries push's token", () => {
    const file = join(lib, "LaunchAgents", "chat.chips.serve.plist");
    writeText(file, "first");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    chmodSync(file, 0o644);
    writeText(file, "second");
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });
});

// Each update kept the release before it, about 170 MB each (the onboarding audit, item 33).
describe("the releases chips up takes away", () => {
  it("are all but the running one and the newest other, by their numbers", () => {
    expect(releasesToRemove(["1.2.10", "1.2.9", "1.1.0", "1.2.2"], "1.2.10")).toEqual([
      "1.1.0",
      "1.2.2",
    ]);
    // Gone back to an older one: the newer stays to go forward to again.
    expect(releasesToRemove(["1.2.0", "1.2.1", "1.2.2"], "1.2.1")).toEqual(["1.2.0"]);
    expect(releasesToRemove(["1.2.2", "1.2.1"], "1.2.2")).toEqual([]);
  });

  it("are removed from beside an installed release, `current` and the one before left", () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), "chips-home-")));
    const chips = join(home, ".local", "lib", "chips");
    for (const version of ["1.2.0", "1.2.1", "1.2.2"]) {
      mkdirSync(join(chips, version), { recursive: true });
    }
    symlinkSync(join(chips, "1.2.2"), join(chips, "current"));
    const machine = { platform: "darwin", home, environment: {} };
    // Run through `current`, as the service runs it: still known as 1.2.2.
    expect(pruneReleases({ version: "1.2.2", root: join(chips, "current") }, machine)).toEqual([
      "1.2.0",
    ]);
    expect(existsSync(join(chips, "1.2.0"))).toBe(false);
    expect(existsSync(join(chips, "1.2.1"))).toBe(true);
    expect(existsSync(join(chips, "current"))).toBe(true);
    rmSync(home, { recursive: true, force: true });
  });

  it("are none for a release install.sh didn't put there", () => {
    const tarball = join(lib, "0.2.0");
    mkdirSync(join(lib, "0.1.0"));
    expect(
      pruneReleases(
        { version: "0.2.0", root: tarball },
        { platform: "darwin", home: lib, environment: {} },
      ),
    ).toEqual([]);
    expect(existsSync(join(lib, "0.1.0"))).toBe(true);
  });
});
