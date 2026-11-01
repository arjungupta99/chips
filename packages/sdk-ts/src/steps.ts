/**
 * A bridge's steps, said to the `chips connect` that started it (ADR 0218). `chips connect` sets
 * `CHIPS_STEPS=json` and reads standard output for lines that open with `chips-step `: `joining`
 * when `join()` starts, `keeping` when keep starts the service. A bridge says its own check of its
 * harness, `checking` and `checked`, with a few words of its own under it (`detail`), and where it
 * stopped, `failed`, with its words for a sheet (`StopWords`), which Chips for Mac shows (phase 5).
 * Everything else a bridge writes is its own, and passed on as it is. With nothing set, nothing is
 * written.
 */

import { writeSync } from "node:fs";
import type { Environment } from "./keep.js";

/** What opens a step's line: the rest of it is JSON. */
export const STEP_MARK = "chips-step ";

export type StepName = "checking" | "checked" | "joining" | "keeping" | "failed";

/**
 * Where a bridge stopped, for a sheet: a few words under the step ("Nothing answers on port
 * 8642"), its sentence ("Its API server is off."), what to do, and a line to copy. Its full
 * sentence still goes to standard error, for a terminal.
 */
export interface StopWords {
  readonly detail?: string;
  readonly says?: string;
  readonly doing?: string;
  readonly copy?: string;
}

/** The step on standard output, as a line, when `chips connect` asked for them. */
export function reportStep(
  step: StepName,
  detail: Readonly<Record<string, string>> | StopWords = {},
  // biome-ignore lint/style/noProcessEnv: `chips connect` asks for the steps in the environment.
  env: Environment = process.env,
  write: (line: string) => void = (line) => void writeSync(1, line),
): void {
  if (env["CHIPS_STEPS"] !== "json") return;
  try {
    write(`${STEP_MARK}${JSON.stringify({ step, ...detail })}\n`);
  } catch {
    // Nobody is reading: the step was for them alone.
  }
}
