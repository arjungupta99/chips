/**
 * Chips' domain is chipschat.ai (Arjun's, with chipschat.io). chips.chat is someone else's: an AI
 * model service registered in September 2025. Until 6 October 2026 the repository named it in 172
 * files (the disclosure mailboxes, the relay, the installer, the docs links and every schema
 * `$id`), and every one now says chipschat.ai. The session log and the review packets keep what
 * they said at the time.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
/**
 * The reviews kept as written, this file, which has to name it, and the distribution page, whose
 * table of names says it is a stranger's (16 October 2026). None of them links to it.
 */
const AS_WRITTEN = [
  "docs/reviews/",
  "tools/guardrails/no-foreign-domain.test.ts",
  "docs/chips-distribution.html",
];

describe("the domain", () => {
  it("is chipschat.ai everywhere but the reviews kept as written", () => {
    const grep = spawnSync(
      "git",
      ["grep", "-l", "-F", "chips.chat", "--", ".", ...AS_WRITTEN.map((path) => `:!${path}`)],
      { cwd: REPO, encoding: "utf8" },
    );
    // git grep exits 1 when it finds nothing, and 2 or more when it fails.
    expect(grep.status, grep.stderr).toBeLessThan(2);
    expect(grep.stdout.split("\n").filter((line) => line !== "")).toEqual([]);
  }, 30_000);
});
