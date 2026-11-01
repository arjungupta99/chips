import { describe, expect, it } from "vitest";
import { dayWords, untilWords } from "./words";

describe("when a link ends, as the phone says it", () => {
  const now = new Date(2026, 9, 30, 15, 12).getTime();
  const time = (at: Date) =>
    at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  it("says the time for a link that ends today, not the day (ADR 0232's 30 minutes)", () => {
    const ends = new Date(2026, 9, 30, 15, 42);
    expect(untilWords(ends.toISOString(), now)).toBe(`until ${time(ends)}`);
    expect(untilWords(ends.toISOString(), ends.getTime() + 60_000)).toBe(
      `expired at ${time(ends)}`,
    );
  });

  it("says the day for one that ends another day", () => {
    const later = new Date(2026, 10, 2, 9, 0).toISOString();
    expect(untilWords(later, now)).toBe(`until ${dayWords(later)}`);
    const earlier = new Date(2026, 9, 28, 9, 0).toISOString();
    expect(untilWords(earlier, now)).toBe(`expired ${dayWords(earlier)}`);
  });
});
