/**
 * `pnpm docs:check` — runs every sample and fails on any non-zero exit.
 *
 * Decision 13: "Every code sample in the docs is a file under `apps/docs/samples/` that CI
 * executes." A sample that stops working is a build failure, not a support ticket.
 *
 * The link checker is the other half, and it runs as part of `pnpm docs:build`:
 * `starlight-links-validator` fails the Astro build on a link that goes nowhere.
 */

import { execFile } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

const HERE = fileURLToPath(new URL("../", import.meta.url));
const SAMPLES = `${HERE}samples`;
const TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));

const files = readdirSync(SAMPLES)
  .filter((name) => name.endsWith(".ts"))
  .sort();

if (files.length === 0) {
  console.error("No samples found. If that is deliberate, delete this check.");
  process.exit(1);
}

let failed = 0;

for (const file of files) {
  const started = performance.now();
  try {
    const { stdout } = await run(TSX, [`${SAMPLES}/${file}`], {
      cwd: HERE,
      maxBuffer: 8 * 1024 * 1024,
    });
    const ms = (performance.now() - started).toFixed(0);
    console.log(`  ok  ${file}  (${ms} ms)`);
    for (const line of stdout.trimEnd().split("\n")) {
      if (line !== "") console.log(`      ${line}`);
    }
  } catch (error) {
    failed += 1;
    const { stdout = "", stderr = "" } = error;
    console.error(`  FAIL ${file}`);
    for (const line of `${stdout}${stderr}`.trimEnd().split("\n")) {
      console.error(`      ${line}`);
    }
  }
}

console.log(`\n${files.length - failed}/${files.length} samples passed.`);
if (failed > 0) {
  console.error("A sample in the documentation does not run. Fix the sample or the code.");
  process.exit(1);
}
