/**
 * What a release is (`tools/release/release.mjs`), without building one: its platforms, names,
 * the shim that finds the install from a link, the bundle's settings, the natives' versions and
 * their lock, and the notices for the software it carries (ADR 0128).
 */

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  artifactName,
  bundleOptions,
  EXTERNAL,
  hostTarget,
  LICENCE_FILE,
  licenceSection,
  lockFault,
  NATIVE,
  nativeVersions,
  nodeDist,
  noticesFile,
  packageRoot,
  prunable,
  RUNTIME,
  runtimeManifest,
  SHIM,
  SIGNING,
  shasumFor,
  signerOf,
  sumsFile,
  TARGETS,
} from "../release/release.mjs";

describe("a release", () => {
  it("is built for the four platforms Node and the natives ship for", () => {
    expect(TARGETS).toEqual(["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64"]);
    expect(hostTarget("darwin", "arm64")).toBe("darwin-arm64");
    expect(hostTarget("win32", "x64")).toBeUndefined();
    expect(artifactName("0.2.0", "linux-x64")).toBe("chips-0.2.0-linux-x64");
  });

  it("takes Node from nodejs.org, checked against its own sums", () => {
    const dist = nodeDist("22.22.2", "darwin-arm64");
    expect(dist.url).toBe("https://nodejs.org/dist/v22.22.2/node-v22.22.2-darwin-arm64.tar.gz");
    expect(dist.sums).toBe("https://nodejs.org/dist/v22.22.2/SHASUMS256.txt");
    const hash = "a".repeat(64);
    const sums = `${"b".repeat(64)}  node-v22.22.2-linux-x64.tar.gz\n${hash}  ${dist.file}\n`;
    expect(shasumFor(sums, dist.file)).toBe(hash);
    expect(shasumFor(sums, "missing.tar.gz")).toBeUndefined();
    expect(shasumFor("not-a-hash  x.tar.gz", "x.tar.gz")).toBeUndefined();
  });

  it("writes SHA256SUMS the way `shasum -a 256 -c` reads it", () => {
    expect(sumsFile([{ file: "a.tar.gz", hash: "f".repeat(64) }])).toBe(
      `${"f".repeat(64)}  a.tar.gz\n`,
    );
  });

  it("bundles to one ESM file for Node 22, with its version, and the natives outside", () => {
    const options = bundleOptions({
      entry: "cli/bin/chips.ts",
      outfile: "lib/chips.mjs",
      version: "0.2.0",
    });
    expect(options).toMatchObject({
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node22",
    });
    expect(options.define).toEqual({ __CHIPS_RELEASE__: '"0.2.0"' });
    for (const name of NATIVE) expect(EXTERNAL).toContain(name);
    expect(options.banner.js).toContain("createRequire");
  });

  it("leaves out what this platform never loads, and keeps its own SQLite build", () => {
    const pruned = prunable("/r/lib/node_modules", "darwin-arm64");
    expect(pruned).toContain("/r/lib/node_modules/better-sqlite3/prebuilds/linux-x64.node");
    expect(pruned).toContain("/r/lib/node_modules/@img/sharp-wasm32");
    expect(pruned).not.toContain("/r/lib/node_modules/better-sqlite3/prebuilds/darwin-arm64.node");
  });

  it("pins the natives to the server's exact versions", () => {
    const server = JSON.parse(
      readFileSync(join(import.meta.dirname, "..", "..", "server", "package.json"), "utf8"),
    );
    expect(Object.keys(nativeVersions(server))).toEqual(["better-sqlite3", "sharp", "esbuild"]);
    expect(() =>
      nativeVersions({
        dependencies: { "better-sqlite3": "^13.0.0", sharp: "0.35.4", esbuild: "0.28.2" },
      }),
    ).toThrow(/exact version/);
  });

  it("is signed with the one key install.sh carries, for its principal and namespace (SEC-36)", () => {
    const script = readFileSync(
      join(import.meta.dirname, "..", "..", "packaging", "install.sh"),
      "utf8",
    );
    const { line, key } = signerOf(script);
    expect(line).toBe(`${SIGNING.principal} namespaces="${SIGNING.namespace}" ${key}`);
    expect(key).toMatch(/^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5[A-Za-z0-9+/]{43,}$/);
    expect(script).toContain(`-I ${SIGNING.principal} -n ${SIGNING.namespace}`);
    expect(() => signerOf("#!/bin/sh\n")).toThrow(/no SIGNER/);
  });

  it("installs the natives from their lock, every package from npm with its integrity (SEC-36)", () => {
    const repo = join(import.meta.dirname, "..", "..");
    const json = (path: string) => JSON.parse(readFileSync(join(repo, path), "utf8"));
    const server = json("server/package.json");
    const manifest = json(`${RUNTIME}/package.json`);
    const lock = json(`${RUNTIME}/package-lock.json`);
    expect(manifest).toEqual(runtimeManifest(server));
    expect(lockFault(server, manifest, lock)).toBeUndefined();
    // A native moved in the server and not in the lock, and a package with nothing to check it by.
    const moved = { dependencies: { ...server.dependencies, sharp: "0.35.6" } };
    expect(lockFault(moved, runtimeManifest(moved), lock)).toMatch(/does not hold sharp 0\.35\.6/);
    const loose = structuredClone(lock);
    delete loose.packages["node_modules/semver"].integrity;
    expect(lockFault(server, manifest, loose)).toMatch(/node_modules\/semver/);
  });

  it("has a shim that follows a link back to the install", () => {
    // A fake install: `runtime/node` echoes what it was asked to run.
    const root = mkdtempSync(join(tmpdir(), "chips-shim-"));
    mkdirSync(join(root, "install", "bin"), { recursive: true });
    mkdirSync(join(root, "install", "runtime"), { recursive: true });
    mkdirSync(join(root, "path"));
    writeFileSync(join(root, "install", "bin", "chips"), SHIM);
    writeFileSync(join(root, "install", "runtime", "node"), '#!/bin/sh\necho "$1 $2"\n');
    chmodSync(join(root, "install", "bin", "chips"), 0o755);
    chmodSync(join(root, "install", "runtime", "node"), 0o755);
    symlinkSync(join(root, "install", "bin", "chips"), join(root, "path", "chips"));
    const said = execFileSync(join(root, "path", "chips"), ["up"], { encoding: "utf8" }).trim();
    expect(said).toMatch(/\/install\/lib\/chips\.mjs up$/);
  });

  it("names the package each bundled file comes from, and none for its own code", () => {
    expect(packageRoot("node_modules/.pnpm/hono@4.9.0/node_modules/hono/dist/index.js")).toBe(
      "node_modules/.pnpm/hono@4.9.0/node_modules/hono",
    );
    expect(
      packageRoot(
        "node_modules/.pnpm/@hono+node-server@1.19.0/node_modules/@hono/node-server/dist/x.mjs",
      ),
    ).toBe("node_modules/.pnpm/@hono+node-server@1.19.0/node_modules/@hono/node-server");
    expect(packageRoot("/r/lib/node_modules/@img/sharp-libvips-darwin-arm64")).toBe(
      "/r/lib/node_modules/@img/sharp-libvips-darwin-arm64",
    );
    expect(packageRoot("packages/protocol/src/index.ts")).toBeUndefined();
    expect(packageRoot("/r/lib/node_modules/@img/")).toBeUndefined();
    expect(
      ["LICENSE", "LICENSE.md", "license-MIT", "COPYING", "NOTICE.txt"].every((file) =>
        LICENCE_FILE.test(file),
      ),
    ).toBe(true);
    expect(LICENCE_FILE.test("licensed.js")).toBe(false);
  });

  it("carries each package's licence once, by name, in a fence its text cannot close", () => {
    const notices = noticesFile([
      {
        name: "zod",
        version: "4.5.4",
        license: "MIT",
        texts: [{ file: "LICENSE", text: "MIT ```" }],
      },
      { name: "hono", version: "4.9.0", license: "MIT", texts: [{ file: "LICENSE", text: "MIT" }] },
      {
        name: "zod",
        version: "4.5.4",
        license: "MIT",
        texts: [{ file: "LICENSE", text: "MIT ```" }],
      },
      { name: "bare", version: "1.0.0", license: undefined, texts: [] },
    ]);
    expect([...notices.matchAll(/^## (.+)$/gm)].map(([, head]) => head)).toEqual([
      "bare 1.0.0",
      "hono 4.9.0",
      "zod 4.5.4",
    ]);
    expect(notices).toContain("Licence: not stated\n\nThe package ships no licence file.");
    expect(notices).toContain("````text\nMIT ```\n````");
    expect(notices).toMatch(/Functional Source License 1\.1, in `LICENSE`/);
  });

  it("takes a README's licence section when a package ships no licence file", () => {
    const readme =
      "# libvips\n\nIntro.\n\n## Licensing\n\n| cairo | MPL-2.0 |\n\n### Notes\n\nMore.\n\n## Building\n\nNo.\n";
    expect(licenceSection(readme)).toBe(
      "## Licensing\n\n| cairo | MPL-2.0 |\n\n### Notes\n\nMore.",
    );
    expect(licenceSection("# x\n\n## License\n\nMIT\n")).toBe("## License\n\nMIT");
    expect(licenceSection("# x\n\nNo licence here.\n")).toBeUndefined();
  });
});
