import { describe, expect, it } from "vitest";
import { leadingClock, manualClock, systemClock } from "./clock.js";

describe("systemClock", () => {
  it("reports the three shapes of the same instant", () => {
    const before = Date.now();
    const ms = systemClock.nowMs();
    const date = systemClock.now();
    const iso = systemClock.nowIso();
    const after = Date.now();

    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(after);
    expect(date.getTime()).toBeGreaterThanOrEqual(before);
    expect(Date.parse(iso)).toBeGreaterThanOrEqual(before);
  });
});

describe("manualClock", () => {
  it("stays where it was put", () => {
    const clock = manualClock(1_700_000_000_000);
    expect(clock.nowMs()).toBe(1_700_000_000_000);
    expect(clock.nowMs()).toBe(1_700_000_000_000);
  });

  it("starts at the epoch by default", () => {
    expect(manualClock().nowIso()).toBe("1970-01-01T00:00:00.000Z");
  });

  it("accepts a Date as its starting instant", () => {
    const clock = manualClock(new Date("2026-09-02T12:00:00.000Z"));
    expect(clock.nowIso()).toBe("2026-09-02T12:00:00.000Z");
  });

  it("moves forward when advanced", () => {
    const clock = manualClock(1000);
    clock.advance(500);
    expect(clock.nowMs()).toBe(1500);
  });

  it("refuses to run backwards", () => {
    const clock = manualClock(1000);
    expect(() => clock.advance(-1)).toThrow(RangeError);
  });

  it("refuses a non-finite advance", () => {
    const clock = manualClock(1000);
    expect(() => clock.advance(Number.NaN)).toThrow(RangeError);
  });

  it("can be placed at an instant", () => {
    const clock = manualClock(1000);
    clock.set(new Date("2026-01-01T00:00:00.000Z"));
    expect(clock.nowIso()).toBe("2026-01-01T00:00:00.000Z");
    clock.set(42);
    expect(clock.now().getTime()).toBe(42);
  });
});

describe("leadingClock", () => {
  it("runs with the clock under it, and keeps whatever lead it is given", () => {
    const base = manualClock(Date.parse("2026-10-05T21:00:00.000Z"));
    const clock = leadingClock(base);
    expect(clock.nowIso()).toBe("2026-10-05T21:00:00.000Z");
    clock.advance(600_000);
    expect(clock.nowIso()).toBe("2026-10-05T21:10:00.000Z");
    base.advance(1000);
    expect(clock.now().toISOString()).toBe("2026-10-05T21:10:01.000Z");
    expect(() => clock.advance(-1)).toThrow(RangeError);
  });
});
