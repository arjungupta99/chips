/** A swipe right approves and a swipe left denies — by what the gesture handler really says. */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { swipeDecision } from "./swipe.js";

describe("what a swipe decides", () => {
  it("approves when the card went right, uncovering Approve", () => {
    expect(swipeDecision("right")).toBe("approved");
  });

  it("denies when the card went left, uncovering Deny", () => {
    expect(swipeDecision("left")).toBe("denied");
  });
});

describe("the gesture handler this rests on", () => {
  // The file Metro bundles: the package's `react-native` entry points at its sources.
  const root = dirname(
    createRequire(import.meta.url).resolve("react-native-gesture-handler/package.json"),
  );
  const source = readFileSync(
    join(root, "src/components/ReanimatedSwipeable/ReanimatedSwipeable.tsx"),
    "utf8",
  );

  it("hands onSwipeableOpen the way the card moved: right when it went right", () => {
    // `toValue` is where the card comes to rest, positive to the right of its closed place.
    expect(source).toMatch(
      /runOnJS\(onSwipeableOpen\)\(\s*toValue > 0 \? SwipeDirection\.RIGHT : SwipeDirection\.LEFT\s*\)/,
    );
  });
});
