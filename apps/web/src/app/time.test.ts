import { describe, expect, it } from "vitest";
import { clockTime, relativeTime, remainingMs, untilWords } from "./time.ts";

const NOW = Date.parse("2026-09-03T12:00:00.000Z");

describe("relativeTime", () => {
  it.each([
    ["2026-09-03T11:59:30.000Z", "now"],
    ["2026-09-03T11:55:00.000Z", "5m"],
    ["2026-09-03T09:00:00.000Z", "3h"],
    ["2026-09-01T12:00:00.000Z", "2d"],
  ])("says how long ago %s was", (ts, expected) => {
    expect(relativeTime(ts, NOW)).toBe(expected);
  });

  it("falls back to a date after a week", () => {
    expect(relativeTime("2026-08-20T12:00:00.000Z", NOW)).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });

  it("never says a future stamp is negative", () => {
    expect(relativeTime("2026-09-03T12:05:00.000Z", NOW)).toBe("now");
  });
});

describe("remainingMs", () => {
  it("counts down to an expiry, and past it", () => {
    expect(remainingMs("2026-09-03T13:00:00.000Z", NOW)).toBe(3_600_000);
    expect(remainingMs("2026-09-03T11:00:00.000Z", NOW)).toBe(-3_600_000);
  });

  it("is nothing when there is no expiry", () => {
    expect(remainingMs(undefined, NOW)).toBeUndefined();
  });
});

describe("clockTime", () => {
  it("is a wall-clock time", () => {
    expect(clockTime("2026-09-03T12:00:00.000Z")).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe("untilWords (JR-2)", () => {
  it("says the day something lasting ends, and never 'now' for a day to come", () => {
    const day = (iso: string) =>
      new Date(iso).toLocaleDateString([], { month: "long", day: "numeric" });
    expect(untilWords("2026-09-10T12:00:00.000Z", NOW)).toBe(
      `until ${day("2026-09-10T12:00:00.000Z")}`,
    );
    expect(untilWords("2026-09-01T12:00:00.000Z", NOW)).toBe(
      `expired ${day("2026-09-01T12:00:00.000Z")}`,
    );
  });

  it("says the time for one that ends today: a 30-minute link isn't 'until' a whole day", () => {
    const now = new Date(2026, 9, 30, 15, 12).getTime();
    const ends = new Date(2026, 9, 30, 15, 42);
    const time = ends.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    expect(untilWords(ends.toISOString(), now)).toBe(`until ${time}`);
    expect(untilWords(ends.toISOString(), ends.getTime() + 60_000)).toBe(`expired at ${time}`);
  });
});
