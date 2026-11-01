#!/usr/bin/env node
/**
 * `pnpm --filter @chipschat/film jumps <clip.mp4 | frames folder> …`: the films' jump check
 * (`loneJumps`, as `pnpm film` holds every shot and film to it) over any clip or folder of frames:
 * the site's clips, a shot of one's own. Prints each one's frames that jump, by their number from
 * one, and fails if any does.
 */

import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { measured } from "./compose.mjs";
import { loneJumps } from "./motion.mjs";

const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  console.error("pnpm --filter @chipschat/film jumps <clip.mp4 | frames folder> …");
  process.exit(1);
}
const work = mkdtempSync(join(tmpdir(), "chips-jumps-"));
let jumped = false;
try {
  for (const [n, input] of inputs.entries()) {
    if (!existsSync(input)) throw new Error(`no such clip or folder: ${input}`);
    const frames = statSync(input).isDirectory() ? join(input, "%05d.png") : input;
    const diffs = measured(frames, join(work, `${n}.txt`));
    const jumps = loneJumps(diffs).map((i) => i + 1);
    if (jumps.length > 0) jumped = true;
    const said = jumps.length === 0 ? "no frame jumps" : `jumps at frames ${jumps.join(", ")}`;
    console.log(`${basename(input)}: ${diffs.length + 1} frames, ${said}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
process.exit(jumped ? 1 : 0);
