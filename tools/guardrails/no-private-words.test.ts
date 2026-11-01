/**
 * The repository is what goes public, so nothing private is in a tracked file (28 October 2026):
 * not the name of a person Chips was tried with, the maintainer's tailnet, machines, home folder or
 * other projects, and not the notes kept beside the checkout instead (`~/Work/Chips/chips-notes`:
 * STATUS, and the testing guides and scenarios with their dated runs).
 *
 * The words are checked by their SHA-256, so this file doesn't publish what it guards. Every word,
 * hyphenated name, dotted address and `/Users/` folder in every tracked text file is lowercased,
 * hashed and looked up. To guard another, add `printf %s '<word>' | shasum -a 256`.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../", import.meta.url));

/** A person's name, a tailnet, two machine names, a home folder, a device and two projects. */
const PRIVATE = new Set([
  "2889fcad83cc53aa4dc2c08055eedfb90631ca2c5c40a5b0f30f8e2b88204938",
  "27d15c7cf0138be457ab7820722c4b364514031e1e1799cb1370b78b0a2a0e63",
  "0ae9cfb7f9f93ddb74befd0be25ccc184fe873711b8ca03ae402fa47dcb54fd7",
  "385a6d1180412544a74c53e517b16d92a89c4dedfd2358759f6210301a51ac32",
  "59415366f677136450dd650f7db40e7fc5f2cfea1a449ae238a3fd54fbd6c6e1",
  "4ce20393df24713b3b061b51cb5914525cf17eddac3bfb9b760c2e25965fedea",
  "4568138d4fd86d6356c898e9712c68138d8c8aef6e687d91e1d629d6c9f3ad96",
  "201c6ff39e7a7139d6d93e6ee2c3be2b69d1dcdc1414f4518dce219d532c4cfc",
  "12d1859bbbf44803fa8965ed72a1aa02c986e88442f2730a16b4648285815886",
]);

/** The notes that live outside the repository now, and must not come back with a rebase. */
const KEPT_OUTSIDE = /^docs\/STATUS\.md$|^docs\/history-rewrite-|^testing\/(?!join-and-remove\/)/;

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** Everything in a text that is checked: words, hyphenated names, addresses, home folders. */
function pieces(text: string): Set<string> {
  const lower = text.toLowerCase();
  return new Set([
    ...(lower.match(/[a-z0-9]+/g) ?? []),
    ...(lower.match(/[a-z0-9]+(?:-[a-z0-9]+)+/g) ?? []),
    ...(lower.match(/\d{1,3}(?:\.\d{1,3}){3}/g) ?? []),
    ...[...lower.matchAll(/\/(users\/[a-z0-9._-]+)/g)].map((match) => match[1] ?? ""),
  ]);
}

/** The pieces of a text whose hash is guarded. */
function privateIn(text: string, guarded: ReadonlySet<string>): string[] {
  return [...pieces(text)].filter((piece) => guarded.has(sha256(piece)));
}

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 })
    .toString("utf8")
    .split("\0")
    .filter((path) => path !== "");
}

describe("a private word", () => {
  it("is found as a word, in a host's name, in an address and in a home folder", () => {
    const guarded = new Set(["ledger", "mini-one", "10.0.0.9", "users/ada"].map(sha256));
    const text = "Ledger said hi from mini-one.local (10.0.0.9), in /Users/ada/Work.";
    expect(privateIn(text, guarded).sort()).toEqual([
      "10.0.0.9",
      "ledger",
      "mini-one",
      "users/ada",
    ]);
    expect(privateIn("Ledgers and a mini-ones, 10.0.0.90, /Users/adam", guarded)).toEqual([]);
  });

  it("is in no tracked file", () => {
    const found: string[] = [];
    for (const path of trackedFiles()) {
      let bytes: Buffer;
      try {
        bytes = readFileSync(join(REPO, path));
      } catch {
        continue; // deleted in the working tree and not yet committed
      }
      if (bytes.subarray(0, 8000).includes(0)) continue; // binary
      const words = privateIn(bytes.toString("utf8"), PRIVATE);
      if (words.length > 0) found.push(`${path}: ${words.length} private word(s)`);
    }
    expect(found).toEqual([]);
  }, 60_000);

  it("stays in the notes outside the repository", () => {
    expect(trackedFiles().filter((path) => KEPT_OUTSIDE.test(path))).toEqual([]);
  });
});
