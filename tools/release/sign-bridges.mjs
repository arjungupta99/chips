#!/usr/bin/env node
/**
 * Writes and signs the list of bridge releases a computer may take on its own
 * (`docs/proposals/bridges-keep-current.md`, rule 6): `bridges.json` and `bridges.json.sig`, which
 * the site serves at chipschat.ai/bridges.json. Each computer from a release reads it once a day and
 * keeps the bridges in its own data folder on the releases it names, only when the signature is
 * the release key's (`ssh-keygen -Y sign -n chips-bridges`, checked against the key
 * `packaging/install.sh` carries). Run on the machine that holds the key, after each bridge release.
 *
 *   pnpm release:sign-bridges                    every release npm lists of the bridges the cards name
 *   --withdraw @chipschat/acp@1.0.31             taken back: computers on it go to the newest allowed
 *   --urgent @chipschat/acp@1.0.32               taken without the two days' wait
 *   --out <folder>                               where the two files go, dist/bridges unless said
 *   --first                                      the very first list: no list before it to keep marks from
 *   CHIPS_RELEASE_KEY=<path>                     the private key, ~/.ssh/chips_release unless said
 *
 * Marks already in the folder's `bridges.json` are kept, which is why the folder must hold the
 * list signed before: `--out` is the site's copy of it. A mark for a package the cards don't name,
 * or a version npm doesn't list, stops the script before anything is signed. A release npm has
 * deprecated is left out and marked withdrawn. A release that names the oldest harness it works
 * with (`"engines": { "hermes": ">=0.9.0" }`, by the card it is kept for) is listed with it, and
 * one that writes it any other way stops the script. The list says when it was signed, and a
 * computer never takes an older one over a newer. Then the two files go to the site, beside `releases.json`.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bridgeListOf, packagesOf } from "./bridge-list.mjs";
import { SIGNING, signerOf } from "./release.mjs";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
// The bridges the cards name (`package`, `@chipschat/<name>@<major>`): Chips names no harness of
// its own, so the list is whatever the gallery a release carries says.
const CARDS = JSON.parse(
  readFileSync(join(REPO, "apps", "docs", "public", "connectors.json"), "utf8"),
);
const PACKAGES = packagesOf(CARDS);
if (PACKAGES.length === 0) throw new Error("The cards name no bridge package");
const NAMESPACE = "chips-bridges";
const REGISTRY = "https://registry.npmjs.org";
const say = (line) => process.stdout.write(`${line}\n`);

const args = process.argv.slice(2);
const flag = (name) =>
  args.flatMap((each, at) => (each === name && args[at + 1] !== undefined ? [args[at + 1]] : []));
const out = resolve(flag("--out")[0] ?? join(REPO, "dist", "bridges"));
const key = process.env.CHIPS_RELEASE_KEY ?? join(homedir(), ".ssh", "chips_release");
const file = join(out, "bridges.json");

if (!existsSync(key)) throw new Error(`No release key at ${key}`);
const signer = signerOf(readFileSync(join(REPO, "packaging", "install.sh"), "utf8"));
const held = execFileSync("ssh-keygen", ["-y", "-f", key], { encoding: "utf8" }).trim();
if (!held.startsWith(signer.key)) {
  throw new Error(`${key} is not the release key packaging/install.sh carries`);
}

// The marks live in the list signed before: without it every release taken back would be let out
// again, so a folder with no list in it is said, and gone on with only when that is meant.
if (!existsSync(file) && !args.includes("--first")) {
  throw new Error(
    `No bridges.json in ${out} to keep the withdrawn and urgent marks from. Point --out at the folder that holds the list on the site, or pass --first for the very first list.`,
  );
}
const kept = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { packages: {} };

const packuments = {};
for (const name of PACKAGES) {
  const answer = await fetch(`${REGISTRY}/${name.replace("/", "%2f")}`);
  if (!answer.ok) throw new Error(`${REGISTRY} answered ${answer.status} for ${name}`);
  packuments[name] = await answer.json();
}
const list = bridgeListOf({
  packuments,
  kept,
  withdraw: flag("--withdraw"),
  urgent: flag("--urgent"),
  signed: new Date().toISOString(),
  // A release that names the oldest harness it works with names it by its card (rule 13).
  cards: CARDS,
});
for (const [name, each] of Object.entries(list.packages)) {
  say(
    `${name}: ${each.releases.length} releases, newest ${each.releases[0]?.version ?? "none"}, ${each.withdrawn.length} withdrawn`,
  );
}

mkdirSync(out, { recursive: true });
writeFileSync(file, `${JSON.stringify(list, null, 2)}\n`);
rmSync(`${file}.sig`, { force: true });
execFileSync("ssh-keygen", ["-Y", "sign", "-q", "-f", key, "-n", NAMESPACE, file], {
  stdio: ["ignore", "inherit", "inherit"],
});

// Checked as a computer checks it, so a list that went wrong never leaves this machine.
const scratch = mkdtempSync(join(tmpdir(), "chips-sign-bridges-"));
try {
  writeFileSync(join(scratch, "signers"), `${SIGNING.principal} ${signer.key}\n`);
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
      NAMESPACE,
      "-s",
      `${file}.sig`,
    ],
    { input: readFileSync(file), stdio: ["pipe", "ignore", "inherit"] },
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
say(`Signed ${file}.sig with the release key. Both files go to the site beside releases.json.`);
