/**
 * `pnpm phone`'s check on the node Xcode runs, without Homebrew (`tools/phone/node.mjs`): a path
 * the last `brew upgrade` deleted, one the next will, and the line that names a steady one instead
 * — the build that died in "[Hermes] Replace Hermes" on 16 October 2026.
 */

import { describe, expect, it } from "vitest";
import { nodeTrouble, withNode } from "../phone/node.mjs";

const CELLAR = "/opt/homebrew/Cellar/node/26.0.0/bin/node";
const exists =
  (...there: string[]) =>
  (path: string) =>
    there.includes(path);

describe("the node Xcode runs", () => {
  it("is gone when Homebrew upgraded node from under it", () => {
    expect(nodeTrouble(`export NODE_BINARY=${CELLAR}\n`, exists())).toEqual({
      path: CELLAR,
      trouble: "gone",
    });
  });

  it("is pinned while that version's folder is still there, so the next upgrade cannot break it", () => {
    expect(nodeTrouble(`export NODE_BINARY=${CELLAR}\n`, exists(CELLAR))?.trouble).toBe("pinned");
    const versioned = "/opt/homebrew/Cellar/node@22/22.20.0/bin/node";
    expect(nodeTrouble(`export NODE_BINARY=${versioned}`, exists(versioned))?.trouble).toBe(
      "pinned",
    );
  });

  it("is fine at Homebrew's own link, or left to the shell, or not named at all", () => {
    const steady = "/opt/homebrew/bin/node";
    expect(nodeTrouble(`export NODE_BINARY=${steady}\n`, exists(steady))).toBeUndefined();
    expect(nodeTrouble("export NODE_BINARY=$(command -v node)\n", exists())).toBeUndefined();
    expect(nodeTrouble("", exists())).toBeUndefined();
  });
});

describe("naming a steady node", () => {
  it("replaces the line, and keeps whatever else the file says", () => {
    expect(
      withNode(`# mine\nexport NODE_BINARY=${CELLAR}\nexport X=1\n`, "/opt/homebrew/bin/node"),
    ).toBe("# mine\nexport NODE_BINARY=/opt/homebrew/bin/node\nexport X=1\n");
  });

  it("adds the line to a file that had none", () => {
    expect(withNode("", "/opt/homebrew/bin/node")).toBe(
      "export NODE_BINARY=/opt/homebrew/bin/node\n",
    );
    expect(withNode("export X=1", "/opt/homebrew/bin/node")).toBe(
      "export X=1\nexport NODE_BINARY=/opt/homebrew/bin/node\n",
    );
  });
});
