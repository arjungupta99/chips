import { describe, expect, it } from "vitest";
import { titleRoom } from "./titleRoom";

/**
 * How wide a room's name may stand in a phone's bar: between the way back and what stands at the
 * bar's right, as UIKit lays them out on an iPhone 17 Pro, 402 points across.
 */
describe("the room's name in a phone's bar", () => {
  it("has the bar from the way back to its trailing end, with nothing at the right", () => {
    // 16 in, 44 of the way back, 12 clear of it; 16 in at the other end.
    expect(titleRoom(402, undefined)).toBe(402 - 16 - 44 - 12 - 16);
  });

  // Arjun's iPhone, 17 November 2026: held to 300, the name ran under Universe's rings.
  it("stops short of Universe's rings in their glass", () => {
    // The rings' slot is 36 across, in 4 points of glass either side, and the name keeps 12 clear.
    expect(titleRoom(402, 36)).toBe(402 - 16 - 44 - 12 - (12 + 4 + 36 + 4) - 16);
    expect(titleRoom(402, 36)).toBeLessThan(300);
  });

  it("gives way to the connection's mark beside the rings", () => {
    expect(titleRoom(402, 83)).toBe(titleRoom(402, 36) - (83 - 36));
  });

  it("keeps clear of glass UIKit draws wider than what is in it", () => {
    // The mark alone is 30 across, and UIKit's glass holds at least 36.
    expect(titleRoom(402, 30)).toBe(titleRoom(402, 36));
  });

  it("is never less than nothing", () => {
    expect(titleRoom(100, 83)).toBe(0);
  });
});
