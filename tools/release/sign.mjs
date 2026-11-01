#!/usr/bin/env node
/**
 * Signs a release's SHA256SUMS with the release key (SEC-36), so `install.sh` installs it from the
 * web: `SHA256SUMS.sig` beside it, made by `ssh-keygen -Y sign` and checked at once against the key
 * `packaging/install.sh` carries. A key that isn't that one is refused before anything is signed.
 *
 *   pnpm release:sign                  dist/release, what `pnpm release:build` wrote
 *   pnpm release:sign <folder>         a release's files, from the draft or anywhere
 *   CHIPS_RELEASE_KEY=<path>           the private key, ~/.ssh/chips_release unless said
 *
 * Then `SHA256SUMS.sig` goes up beside SHA256SUMS: `gh release upload <tag> <folder>/SHA256SUMS.sig`
 * for a draft, or to the download host with the tarballs.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SIGNING, signerOf } from "./release.mjs";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const folder = resolve(process.argv[2] ?? join(REPO, "dist", "release"));
const sums = join(folder, "SHA256SUMS");
const key = process.env.CHIPS_RELEASE_KEY ?? join(homedir(), ".ssh", "chips_release");
const say = (line) => process.stdout.write(`${line}\n`);

if (!existsSync(sums)) throw new Error(`No SHA256SUMS in ${folder}`);
if (!existsSync(key)) throw new Error(`No release key at ${key}`);

const signer = signerOf(readFileSync(join(REPO, "packaging", "install.sh"), "utf8"));
const held = execFileSync("ssh-keygen", ["-y", "-f", key], { encoding: "utf8" }).trim();
if (!held.startsWith(signer.key)) {
  throw new Error(`${key} is not the release key packaging/install.sh carries`);
}

rmSync(`${sums}.sig`, { force: true });
execFileSync("ssh-keygen", ["-Y", "sign", "-q", "-f", key, "-n", SIGNING.namespace, sums], {
  stdio: ["ignore", "inherit", "inherit"],
});

// Checked the way install.sh checks it, so a signature that went wrong never leaves this machine.
const scratch = mkdtempSync(join(tmpdir(), "chips-sign-"));
try {
  writeFileSync(join(scratch, "signers"), `${signer.line}\n`);
  execFileSync(
    "ssh-keygen",
    [
      "-Y",
      "verify",
      "-f",
      join(scratch, "signers"),
      "-I",
      SIGNING.principal,
      "-n",
      SIGNING.namespace,
      "-s",
      `${sums}.sig`,
    ],
    { input: readFileSync(sums), stdio: ["pipe", "ignore", "inherit"] },
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
say(`Signed ${sums}.sig, checked against the key install.sh carries.`);
