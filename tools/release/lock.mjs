#!/usr/bin/env node
/**
 * Writes the natives' lock (SEC-36): `tools/release/runtime/package.json`, naming the exact
 * versions `server/package.json` pins, and the `package-lock.json` npm resolves for it, with every
 * package's integrity. `build.mjs` installs from the lock with `npm ci`, so a release takes the
 * natives and everything under them as they were when this ran, and nothing a registry says later.
 *
 *   pnpm release:lock    after a native's version moves in server/package.json
 */

import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { lockFault, RUNTIME, runtimeManifest } from "./release.mjs";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const dir = join(REPO, RUNTIME);
const server = JSON.parse(readFileSync(join(REPO, "server", "package.json"), "utf8"));

writeFileSync(join(dir, "package.json"), `${JSON.stringify(runtimeManifest(server), null, 2)}\n`);
rmSync(join(dir, "package-lock.json"), { force: true });
execFileSync(
  "npm",
  ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"],
  { cwd: dir, stdio: "inherit" },
);

const fault = lockFault(
  server,
  JSON.parse(readFileSync(join(dir, "package.json"), "utf8")),
  JSON.parse(readFileSync(join(dir, "package-lock.json"), "utf8")),
);
if (fault !== undefined) throw new Error(fault);
process.stdout.write(`Wrote ${RUNTIME}/package-lock.json\n`);
