#!/usr/bin/env node
/**
 * The SDK as tarballs a harness outside this repository installs: `@chipschat/protocol`,
 * `@chipschat/harness` and `@chipschat/conformance`, built and packed into `dist/sdk/`.
 *
 *   pnpm release:sdk [folder]
 *
 * These tarballs are what goes to npm, by hand and in this order, since each names the one before
 * it by version: `npm publish <folder>/chipschat-protocol-<version>.tgz`, then harness, then
 * conformance. A bridge in a repo of its own may also take them as `file:` dependencies, all three
 * together. Packing uses each package's `publishConfig`, so what is installed is the built
 * `dist`, not the sources.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const PACKAGES = ["protocol", "sdk-ts", "conformance"];
const out = resolve(process.argv[2] ?? join(REPO, "dist", "sdk"));

mkdirSync(out, { recursive: true });
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
