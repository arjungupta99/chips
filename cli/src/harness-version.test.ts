/**
 * What a harness's own command says it runs, for a bridge release that names the oldest harness
 * it works with (bridges-keep-current.md, rule 13).
 */

import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { harnessVersionOf, versionIn } from "./harness-version.js";

describe("the release a --version line names", () => {
  it("is its first word that is a release number, with or without a v", () => {
    expect(versionIn("opencode v2.0.25\n")).toBe("2.0.25");
    expect(versionIn("2.1.292 (Claude Code)\n")).toBe("2.1.292");
    expect(versionIn("codex-cli 0.156.0\n")).toBe("0.156.0");
    expect(versionIn("\n\nopenclaw 2026.11.3-beta.2\nmore\n")).toBe("2026.11.3");
    expect(versionIn("tool 1.2.3, built today")).toBe("1.2.3");
  });

  it("is none for a line that says its version is unknown, whatever is in brackets after", () => {
    expect(versionIn("Hermes Agent vunknown (2026.9.24)\nInstall directory: /x/0.22.0/lib")).toBe(
      undefined,
    );
    expect(versionIn("")).toBeUndefined();
    expect(versionIn("no numbers here")).toBeUndefined();
    // Two parts are not a release number, and nor is one run into a word.
    expect(versionIn("tool 1.2")).toBeUndefined();
    expect(versionIn("tool-1.2.3")).toBeUndefined();
  });

  it("reads only the first line that says anything", () => {
    expect(versionIn("warning: something\nreal 1.2.3")).toBeUndefined();
  });
});

describe("asking the harness's own command", () => {
  it("runs it with --version on the PATH given, and reads what it prints", async () => {
    const folder = mkdtempSync(join(tmpdir(), "chips-harness-version-"));
    try {
      const program = join(folder, "fakeharness");
      writeFileSync(program, '#!/bin/sh\n[ "$1" = "--version" ] && echo "fakeharness v3.4.5"\n');
      chmodSync(program, 0o755);
      expect(await harnessVersionOf("fakeharness", { PATH: folder })).toBe("3.4.5");
      // Not on that PATH: it can't be told.
      expect(await harnessVersionOf("fakeharness", { PATH: "/nonexistent" })).toBeUndefined();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("is none when the command fails or says nothing of a release", async () => {
    expect(await harnessVersionOf("x", {}, async () => undefined)).toBeUndefined();
    expect(await harnessVersionOf("x", {}, async () => "x version unknown")).toBeUndefined();
    expect(await harnessVersionOf("x", {}, async () => "x 9.9.9")).toBe("9.9.9");
  });
});
