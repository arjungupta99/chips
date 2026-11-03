#!/usr/bin/env node
/**
 * The SDK as tarballs a harness outside this repository installs: `@chipschat/protocol`,
 * `@chipschat/harness` and `@chipschat/conformance`, built and packed into `dist/sdk/`.
 *
 *   pnpm release:sdk [folder]
 *
 * These tarballs are what goes to npm, in this order, since each names the one before it by
 * version: protocol, then harness, then conformance. 1.0.0 went by hand on 1 November 2026; a
 * release after it is a version commit reaching the public repository's main, where
 * `.github/workflows/publish-sdk.yml` packs with this and publishes with provenance. A bridge
 * in a repo of its own may also take them as `file:` dependencies, all three together. Packing
 * uses each package's `publishConfig`, so what is installed is the built `dist`, not the
 * sources.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const PACKAGES = ["protocol", "sdk-ts", "conformance"];
const out = resolve(process.argv[2] ?? join(REPO, "dist", "sdk"));

mkdirSync(out, { recursive: true });
// `tsc` writes over `dist` but never empties it, so a checkout built under an older layout packs
// files nothing exports: protocol 1.0.0 went out with a stale `dist/index.js` beside `dist/src/`.
for (const name of PACKAGES)
  rmSync(join(REPO, "packages", name, "dist"), { recursive: true, force: true });
const run = (args, cwd) =>
  execFileSync("pnpm", args, { cwd, stdio: ["ignore", "pipe", "inherit"] });
run(
  [
    "--filter",
    "@chipschat/protocol",
    "--filter",
    "@chipschat/harness",
    "--filter",
    "@chipschat/conformance",
    "build",
  ],
  REPO,
);
for (const name of PACKAGES) {
  const packed = run(["pack", "--pack-destination", out], join(REPO, "packages", name));
  process.stdout.write(packed.toString().trim().split("\n").at(-1) ?? "");
  process.stdout.write("\n");
}
