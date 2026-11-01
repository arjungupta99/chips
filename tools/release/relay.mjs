#!/usr/bin/env node
/**
 * The relay alone, as one file: `dist/release/chips-relay-<version>.mjs` and its SHA-256.
 *
 *   pnpm release:relay
 *
 * What the hosted relay's box runs until a release can be built for it
 * (`packaging/relay/README.md`, "Without a release"). It is plain JavaScript with no natives, so
 * it is built on any machine and runs on any Node 22, and it reports `<version>+<commit>` on
 * `/health` so the box says which commit it is running.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { bundleOptions } from "./release.mjs";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const read = (path) => readFileSync(join(REPO, path), "utf8");

const commit = execFileSync("git", ["rev-parse", "--short=8", "HEAD"], { cwd: REPO })
  .toString()
  .trim();
const version = `${JSON.parse(read("package.json")).version}+${commit}`;
const outRoot = join(REPO, "dist", "release");
const outfile = join(outRoot, `chips-relay-${version}.mjs`);

mkdirSync(outRoot, { recursive: true });
await build({
  ...bundleOptions({ entry: join(REPO, "relay", "bin", "chips-relay.ts"), outfile, version }),
  absWorkingDir: REPO,
});
const sum = createHash("sha256").update(readFileSync(outfile)).digest("hex");
process.stdout.write(`${outfile}\n${sum}  chips-relay-${version}.mjs\n`);
