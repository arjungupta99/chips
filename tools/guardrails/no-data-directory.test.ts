/**
 * A data directory holds a database, attachments and tokens, so nothing of one is committed:
 * not `.chips/`, and not a copy of it. One copy, `.chips.bak-20260904-2019/`, was committed from
 * 4 September 2026 and taken out of the whole history on 13 September 2026
 * (its old→new map is kept outside the repository). A rebase of a branch made before then can
 * bring it back.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../", import.meta.url));

describe("a data directory", () => {
  it("is not tracked, nor any copy of one", () => {
    const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: REPO })
      .toString("utf8")
      .split("\0");
    expect(tracked.filter((path) => /(^|\/)\.chips(\.bak[^/]*)?\//.test(path))).toEqual([]);
  });

  it("is ignored, and so is a copy of one, so neither is added by accident", () => {
    for (const path of [".chips/chips.db", ".chips.bak-20260904-2019/demo.json"]) {
      const checked = spawnSync("git", ["check-ignore", "--no-index", "--quiet", path], {
        cwd: REPO,
      });
      expect(checked.status, path).toBe(0);
    }
  });
});
