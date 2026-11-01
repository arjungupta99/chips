/**
 * The git a room's project runs on (ADR 0220): found where the media tools are found, and held to
 * 2.31 or newer, the first that takes configuration through its environment (`GIT_CONFIG_COUNT`),
 * which is how the server hands git its limits and a bridge hands git its token. Without one,
 * rooms' projects are off and say so; nothing else changes.
 */

import { execFileSync } from "node:child_process";
import { PROJECT_GIT_VERSION } from "@chipschat/protocol";
import { findTool } from "../media/tools.js";

export interface Git {
  /** The program, by its absolute path. */
  readonly path: string;
  /** `2.50.1`, as `git --version` says it. */
  readonly version: string;
}

/** Git, or why there is none, in words that follow "rooms' projects are off:". */
export type GitFound =
  | { readonly ok: true; readonly git: Git }
  | { readonly ok: false; readonly why: string };

/** `[2, 50, 1]` from `git version 2.50.1 (Apple Git-155)`; nothing from words that aren't one. */
export function versionOf(said: string): readonly number[] | undefined {
  const match = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(said);
  if (match === null) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

/** Whether a version is at least another, part by part. */
export function atLeast(version: readonly number[], least: readonly number[]): boolean {
  for (let at = 0; at < least.length; at += 1) {
    const mine = version[at] ?? 0;
    const theirs = least[at] ?? 0;
    if (mine !== theirs) return mine > theirs;
  }
  return true;
}

/** Git on this machine, new enough, or why there is none. */
export function findGit(options: { readonly path?: string | undefined } = {}): GitFound {
  const path = findTool("git", { path: options.path });
  if (path === undefined) {
    return { ok: false, why: "git was not found on this machine" };
  }
  let said: string;
  try {
    said = execFileSync(path, ["--version"], { encoding: "utf8", env: { PATH: "/usr/bin:/bin" } });
  } catch {
    return { ok: false, why: `${path} would not run` };
  }
  const version = versionOf(said);
  const least = versionOf(PROJECT_GIT_VERSION) ?? [];
  if (version === undefined || !atLeast(version, least)) {
    return {
      ok: false,
      why: `${said.trim()} is older than ${PROJECT_GIT_VERSION}`,
    };
  }
  return { ok: true, git: { path, version: version.join(".") } };
}
