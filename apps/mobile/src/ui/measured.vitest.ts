/**
 * `measured` asks what Reanimated's `measure` asks, without its warning (AN-30). That holds only
 * while `measure` is the runtime's `_measure` and a warning: read in Reanimated's own source, as
 * Metro bundles it, so an upgrade that changes either says so here.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

describe("the measure `measured` stands in for", () => {
  const root = dirname(
    createRequire(import.meta.url).resolve("react-native-reanimated/package.json"),
  );
  const source = readFileSync(join(root, "src/platformFunctions/measure.ts"), "utf8");

  it("asks the runtime's _measure with what the ref answers", () => {
    expect(source).toMatch(/const viewTag = animatedRef\(\);/);
    expect(source).toMatch(/global\._measure!\(viewTag as ShadowNodeWrapper\)/);
  });

  it("answers nothing when _measure does, with a warning and nothing else", () => {
    expect(source).toMatch(
      /if \(measured === null\) \{\s*logger\.warn\([^;]*LayoutMetrics[^;]*\);\s*return null;\s*\}/,
    );
  });
});
