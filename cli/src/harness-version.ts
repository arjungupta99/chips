/**
 * The release of the harness behind a kept bridge, as the harness's own command says it
 * (`opencode --version`), for a bridge release that names the oldest it works with
 * (bridges-keep-current.md, rule 13). Asked by the computer before it takes such a release.
 *
 * None where it can't be told: the command isn't on the service's PATH, it doesn't answer in
 * time, or its first line names no release. Then the release is taken, and the bridge checks
 * again itself when it starts.
 */

import { execFile } from "node:child_process";

/** How long the command has to answer. */
export const VERSION_WAIT_MS = 8000;

/**
 * The release a `--version` line names: its first word that is a release number, with or without
 * a `v` (`opencode v2.0.25`, `2.1.292 (Claude Code)`, `codex-cli 0.156.0`). A number inside
 * brackets is something else, such as the day it was built, and a line that says its version is
 * unknown names none.
 */
export function versionIn(output: string): string | undefined {
  const line = output.split("\n").find((each) => each.trim() !== "") ?? "";
  for (const word of line.trim().split(/\s+/)) {
    const found = /^v?(\d+\.\d+\.\d+)(?:[-+.,;:]\S*)?$/.exec(word)?.[1];
    if (found !== undefined) return found;
  }
  return undefined;
}

export type RunVersion = (
  program: string,
  env: Readonly<Record<string, string | undefined>>,
) => Promise<string | undefined>;

/** `<program> --version`, run with the environment given, and what it printed; none when it didn't. */
const runIt: RunVersion = (program, env) =>
  new Promise((resolve) => {
    execFile(
      program,
      ["--version"],
      { env: env as NodeJS.ProcessEnv, timeout: VERSION_WAIT_MS, windowsHide: true },
      (error, stdout) => resolve(error === null ? stdout : undefined),
    );
  });

export async function harnessVersionOf(
  program: string,
  env: Readonly<Record<string, string | undefined>>,
  run: RunVersion = runIt,
): Promise<string | undefined> {
  const output = await run(program, env);
  return output === undefined ? undefined : versionIn(output);
}
