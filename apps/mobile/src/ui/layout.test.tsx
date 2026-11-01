/**
 * What "wide" means. It is the one word the tablet layout turns on, so it is worth pinning
 * exactly where the line is and which side of it each real window falls.
 */

import { renderHook } from "@testing-library/react-native";
import { Dimensions } from "react-native";
import { isRoomy, isWide, useLayout } from "./layout";

describe("a wide window", () => {
  it("is an iPad in either orientation, and not a phone on its side", () => {
    expect(isWide(393, 852)).toBe(false);
    // A Max on its side has the width and not the height: a rail beside a room four hundred
    // points tall is a rail beside nothing.
    expect(isWide(932, 430)).toBe(false);
    expect(isWide(834, 1194)).toBe(true);
    expect(isWide(1194, 834)).toBe(true);
    // An iPad in the narrow third of a split is a phone, and behaves like one.
    expect(isWide(507, 1194)).toBe(false);
  });

  it("is roomy before it is wide: an iPad mini upright, and never a phone", () => {
    expect(isRoomy(744, 1133)).toBe(true);
    expect(isWide(744, 1133)).toBe(false);
    expect(isRoomy(440, 956)).toBe(false);
    expect(isRoomy(956, 440)).toBe(false);
    expect(isRoomy(507, 1194)).toBe(false);
  });

  it("is read off the window", async () => {
    const was = Dimensions.get("window");
    Dimensions.set({ window: { width: 1024, height: 1366, scale: 2, fontScale: 1 } });
    try {
      const { result } = await renderHook(() => useLayout());
      expect(result.current).toEqual({ wide: true, roomy: true, landscape: false });
    } finally {
      Dimensions.set({ window: was });
    }
  });
});
