/**
 * The commit a build is made from, handed to the bundler as `EXPO_PUBLIC_CHIPS_COMMIT` so You's
 * Version row can say it (ADR 0085): what is on a phone, told apart from what is on main. A "+"
 * after it when tracked files have changed since that commit, since then the build is not quite
 * the commit it names.
 */

import { spawnSync } from "node:child_process";

export function buildStamp(repo) {
  const head = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repo, encoding: "utf8" });
  const commit = (head.stdout ?? "").trim();
  if (head.status !== 0 || commit === "") return "";
  const clean = spawnSync("git", ["diff", "--quiet", "HEAD"], { cwd: repo }).status === 0;
  return clean ? commit : `${commit}+`;
}

/** The environment a native build runs in, with the stamp added. */
export function stampedEnv(repo, env = process.env) {
  return { ...env, EXPO_PUBLIC_CHIPS_COMMIT: buildStamp(repo) };
}
