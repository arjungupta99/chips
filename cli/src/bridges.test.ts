/**
 * A harness's bridge from npm (ADR 0218): the card's package and major, the newest release of that
 * major, the registry's checksum, the folder it lives in through every update, and its one bin.
 * The registry is a stand-in in memory; the tarballs are real, packed by `tar`.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bridgeFolder,
  bridgeMain,
  fetchBridge,
  integrityMatches,
  newestInMajor,
  packageSpec,
  readRecord,
  stepIn,
} from "./bridges.js";
import { packed, sriOf, standIn } from "./testing/registry.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "chips-bridges-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const manifest = (version: string) => ({
  name: "@chipschat/fake",
  version,
  bin: { "chips-fake": "dist/main.js" },
});

describe("a card's package", () => {
  it("is a name and the major that speaks this server's protocol", () => {
    expect(packageSpec("@chipschat/hermes@1")).toEqual({ name: "@chipschat/hermes", major: 1 });
    expect(packageSpec("plain-name@12")).toEqual({ name: "plain-name", major: 12 });
    expect(packageSpec("@chipschat/hermes")).toBeUndefined();
    expect(packageSpec("@chipschat/hermes@^1")).toBeUndefined();
    expect(packageSpec("@chipschat/hermes@1.2.0")).toBeUndefined();
  });

  it("lives in one folder through every update", () => {
    expect(bridgeFolder("/data/bridges", "@chipschat/acp")).toBe("/data/bridges/chipschat-acp");
  });
});

describe("the newest release of a major", () => {
  const listed = (versions: Record<string, object>) => ({
    versions: Object.fromEntries(
      Object.entries(versions).map(([version, more]) => [
        version,
        { dist: { tarball: `t/${version}`, integrity: "sha512-x" }, ...more },
      ]),
    ),
  });

  it("is the highest 1.x, never 2.x, a prerelease or one deprecated", () => {
    const packument = listed({
      "1.0.0": {},
      "1.2.0": {},
      "1.10.1": {},
      "1.11.0": { deprecated: "A bad publish: use 1.10.1." },
      "1.12.0-beta.1": {},
      "2.0.0": {},
    });
    expect(newestInMajor(packument, 1)?.version).toBe("1.10.1");
    expect(newestInMajor(packument, 2)?.version).toBe("2.0.0");
    expect(newestInMajor(packument, 3)).toBeUndefined();
  });

  it("is none that the registry gives no SHA-512 for", () => {
    const packument = {
      versions: {
        "1.0.0": { dist: { tarball: "t", integrity: "sha1-abc" } },
        "1.0.1": { dist: { tarball: "t" } },
      },
    };
    expect(newestInMajor(packument, 1)).toBeUndefined();
    expect(newestInMajor(null, 1)).toBeUndefined();
  });
});

describe("the registry's checksum", () => {
  it("is the bytes' SHA-512, and nothing else will do", () => {
    const bytes = new TextEncoder().encode("a bridge");
    expect(integrityMatches(bytes, sriOf(bytes))).toBe(true);
    expect(integrityMatches(bytes, `sha1-x ${sriOf(bytes)}`)).toBe(true);
    expect(integrityMatches(new TextEncoder().encode("another"), sriOf(bytes))).toBe(false);
    expect(integrityMatches(bytes, "sha256-abc")).toBe(false);
  });
});

describe("fetching a bridge", () => {
  const spec = { name: "@chipschat/fake", major: 1 };
  const bridges = () => join(dir, "bridges");

  it("downloads the newest of its major, checks it, unpacks it, and reuses it next time", async () => {
    const one = packed(dir, manifest("1.0.0"), { "dist/main.js": "// 1.0.0\n" });
    const registry = standIn({ "@chipschat/fake": { "1.0.0": { bytes: one } } });
    const heard: string[] = [];
    const first = await fetchBridge({
      registry: "https://registry.test",
      spec,
      bridges: bridges(),
      fetch: registry.fetch,
      onRelease: (version, reused) => heard.push(`${version} ${reused}`),
    });
    expect(first).toEqual({
      folder: join(bridges(), "chipschat-fake"),
      version: "1.0.0",
      reused: false,
    });
    expect(readFileSync(join(first.folder, "package", "dist", "main.js"), "utf8")).toBe(
      "// 1.0.0\n",
    );
    expect(readRecord(first.folder)).toEqual({
      package: "@chipschat/fake",
      version: "1.0.0",
      integrity: sriOf(one),
      kept: {},
    });

    const again = await fetchBridge({
      registry: "https://registry.test",
      spec,
      bridges: bridges(),
      fetch: registry.fetch,
      onRelease: (version, reused) => heard.push(`${version} ${reused}`),
    });
    expect(again.reused).toBe(true);
    expect(heard).toEqual(["1.0.0 false", "1.0.0 true"]);
    expect(registry.asked.filter((url) => url.endsWith(".tgz"))).toHaveLength(1);
  });

  it("puts a newer release in the same folder, keeping what it knew of the cards", async () => {
    const one = packed(dir, manifest("1.0.0"), { "dist/main.js": "// 1.0.0\n" });
    const two = packed(dir, manifest("1.1.0"), { "dist/main.js": "// 1.1.0\n" });
    const folder = join(bridges(), "chipschat-fake");
    await fetchBridge({
      registry: "https://registry.test",
      spec,
      bridges: bridges(),
      fetch: standIn({ "@chipschat/fake": { "1.0.0": { bytes: one } } }).fetch,
    });
    const record = readRecord(folder);
    writeFileSync(
      join(folder, "bridge.json"),
      JSON.stringify({ ...record, kept: { fake: { label: "chat.chips.fake", args: [] } } }),
    );
    const got = await fetchBridge({
      registry: "https://registry.test",
      spec,
      bridges: bridges(),
      fetch: standIn({ "@chipschat/fake": { "1.0.0": { bytes: one }, "1.1.0": { bytes: two } } })
        .fetch,
    });
    expect(got).toEqual({ folder, version: "1.1.0", reused: false });
    expect(readFileSync(join(folder, "package", "dist", "main.js"), "utf8")).toBe("// 1.1.0\n");
    expect(readRecord(folder)?.kept).toEqual({ fake: { label: "chat.chips.fake", args: [] } });
  });

  it("refuses a download that doesn't match the registry's checksum, and unpacks nothing", async () => {
    const one = packed(dir, manifest("1.0.0"), { "dist/main.js": "// 1.0.0\n" });
    const other = packed(dir, manifest("1.0.0"), { "dist/main.js": "// not it\n" });
    const registry = standIn({
      "@chipschat/fake": { "1.0.0": { bytes: other, integrity: sriOf(one) } },
    });
    await expect(
      fetchBridge({
        registry: "https://registry.test",
        spec,
        bridges: bridges(),
        fetch: registry.fetch,
      }),
    ).rejects.toThrow(
      "@chipschat/fake 1.0.0 does not match the registry's checksum, so nothing of it was unpacked.",
    );
    expect(existsSync(join(bridges(), "chipschat-fake", "package"))).toBe(false);
  });

  it("says plainly when the registry has no such package, or no release of its major", async () => {
    const registry = standIn({
      "@chipschat/fake": { "2.0.0": { bytes: packed(dir, manifest("2.0.0"), {}) } },
    });
    await expect(
      fetchBridge({
        registry: "https://registry.test",
        spec: { name: "@chipschat/none", major: 1 },
        bridges: bridges(),
        fetch: registry.fetch,
      }),
    ).rejects.toThrow("https://registry.test has no package @chipschat/none.");
    await expect(
      fetchBridge({
        registry: "https://registry.test",
        spec,
        bridges: bridges(),
        fetch: registry.fetch,
      }),
    ).rejects.toThrow("https://registry.test has no release 1.x of @chipschat/fake.");
  });
});

describe("a bridge's bin", () => {
  it("is its package's one .js file", () => {
    const folder = join(dir, "chipschat-fake");
    mkdirSync(join(folder, "package"), { recursive: true });
    const write = (bin: unknown) =>
      writeFileSync(join(folder, "package", "package.json"), JSON.stringify({ bin }));
    write({ "chips-fake": "dist/main.js" });
    expect(bridgeMain(folder)).toBe(join(folder, "package", "dist", "main.js"));
    write("dist/main.js");
    expect(bridgeMain(folder)).toBe(join(folder, "package", "dist", "main.js"));
    for (const bin of [{ a: "a.js", b: "b.js" }, "dist/main.ts", "../../elsewhere.js", undefined]) {
      write(bin);
      expect(() => bridgeMain(folder)).toThrow("holds no bridge Chips can run");
    }
  });
});

describe("a bridge's step", () => {
  it("is a line the SDK marks, and nothing else is", () => {
    expect(stepIn('chips-step {"step":"keeping","label":"chat.chips.fake"}')).toEqual({
      step: "keeping",
      label: "chat.chips.fake",
    });
    expect(stepIn("2026-10-22T10:00:00.000Z answering for Fake")).toBeUndefined();
    expect(stepIn("chips-step not json")).toBeUndefined();
    expect(stepIn('chips-step {"no":"step"}')).toBeUndefined();
  });
});
