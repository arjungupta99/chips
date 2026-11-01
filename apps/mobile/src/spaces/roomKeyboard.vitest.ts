import { describe, expect, it } from "vitest";
import { roomPadding, seenHeight, statusBarAside } from "./roomKeyboard";

/** An iPhone with a home indicator: the band the composer holds while the keyboard is away. */
const INSET = 34;

describe("the foot the keyboard takes", () => {
  it("holds the keys clear, less the band the composer is already holding", () => {
    expect(roomPadding(336, INSET)).toBe(302);
  });

  it("follows the keys rather than the share of the way they have come", () => {
    // Half way up, the keyboard covers half its height of the glass — not half of the padding
    // it will end on, which is what scaling a nought-to-one progress by the final height gives.
    expect(roomPadding(168, INSET)).toBe(134);
  });

  it("holds nothing while the keys are still inside the composer's own band", () => {
    expect(roomPadding(20, INSET)).toBe(0);
    expect(roomPadding(0, INSET)).toBe(0);
  });

  it("holds the whole keyboard on a phone with no band at the bottom", () => {
    expect(roomPadding(260, 0)).toBe(260);
  });
});

describe("what React Native's own observer saw", () => {
  it("is the settled height while the keyboard is up", () => {
    expect(seenHeight(true, { height: 336 })).toBe(336);
  });

  it("is nought when the keyboard is away, whatever the last frame said", () => {
    expect(seenHeight(false, { height: 336 })).toBe(0);
  });

  it("is nought when the keyboard has never been seen", () => {
    expect(seenHeight(true, undefined)).toBe(0);
    expect(seenHeight(true, null)).toBe(0);
  });
});

describe("React Native's height on Android (AN-26)", () => {
  it("is measured from the top of the navigation band, so the band is added back", () => {
    // Measured on a Pixel 9 in landscape: the controller said 261, React Native 237, the band 24.
    expect(seenHeight(true, { height: 237 }, 24)).toBe(261);
    expect(roomPadding(seenHeight(true, { height: 237 }, 24), 24)).toBe(roomPadding(261, 24));
  });

  it("is still nought while the keys are away", () => {
    expect(seenHeight(false, { height: 237 }, 24)).toBe(0);
  });
});

describe("the status bar standing aside for the keys (AN-26)", () => {
  const side = { width: 923, height: 411 };
  const upright = { width: 411, height: 923 };

  it("stands aside on Android, on its side, while the keys are up", () => {
    expect(statusBarAside("android", side, true)).toBe(true);
  });

  it("stays when the keys go, upright, and on an iPhone", () => {
    expect(statusBarAside("android", side, false)).toBe(false);
    expect(statusBarAside("android", upright, true)).toBe(false);
    expect(statusBarAside("ios", side, true)).toBe(false);
  });
});
