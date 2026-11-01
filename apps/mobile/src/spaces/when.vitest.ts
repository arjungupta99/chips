import { describe, expect, it } from "vitest";
import { clockTime, dayLabel, relativeTime, separatorLabel } from "./when";

/**
 * The day separator. The clock itself is the platform's `toLocaleTimeString` and is not tested
 * — that would test the platform — but which day a line belongs to is arithmetic, and the
 * boundaries are where arithmetic about days goes wrong.
 */
describe("the time on a line", () => {
  it("is the hour and the minute, in the phone's own zone", () => {
    // Which is the only sensible zone on a device somebody carries between them.
    expect(clockTime("2026-09-07T14:05:00")).toMatch(/\d{1,2}[:.]\d{2}/);
  });

  it("says nothing rather than Invalid Date when a timestamp cannot be read", () => {
    expect(clockTime("whenever")).toBe("");
  });
});

describe("the day a line belongs to", () => {
  const now = new Date("2026-09-07T14:00:00").getTime();

  it("says today for anything since midnight, and for the future", () => {
    expect(dayLabel("2026-09-07T00:00:01", now)).toBe("Today");
    expect(dayLabel("2026-09-07T13:59:00", now)).toBe("Today");
    expect(dayLabel("2026-09-08T09:00:00", now)).toBe("Today");
  });

  it("says yesterday for the day before, however late in it", () => {
    expect(dayLabel("2026-09-06T23:59:59", now)).toBe("Yesterday");
    expect(dayLabel("2026-09-06T00:00:00", now)).toBe("Yesterday");
  });

  it("names the day for anything older", () => {
    expect(dayLabel("2026-09-05T12:00:00", now)).toMatch(/5/);
  });

  it("says nothing at all for a timestamp it cannot read", () => {
    expect(dayLabel("not a date", now)).toBe("");
  });
});

describe("how long ago a space was live", () => {
  const now = new Date("2026-09-07T14:00:00Z").getTime();
  const ago = (ms: number) => relativeTime(new Date(now - ms).toISOString(), now);

  it("says now for the last three quarters of a minute", () => {
    expect(ago(0)).toBe("now");
    expect(ago(44_000)).toBe("now");
  });

  it("counts minutes, then hours, then days", () => {
    expect(ago(5 * 60_000)).toBe("5m");
    expect(ago(3 * 3_600_000)).toBe("3h");
    expect(ago(4 * 86_400_000)).toBe("4d");
  });

  it("names the date once a week has gone by", () => {
    expect(ago(30 * 86_400_000)).toMatch(/Aug/);
  });

  it("says nothing at all for a timestamp it cannot read", () => {
    expect(relativeTime("not a date", now)).toBe("");
  });
});

describe("the separator over a line", () => {
  const now = new Date("2026-09-07T14:00:00").getTime();

  it("is the day and the clock, and nothing for a timestamp that cannot be read", () => {
    expect(separatorLabel("2026-09-07T11:26:00", now)).toMatch(/^Today \d{1,2}[:.]\d{2}/);
    expect(separatorLabel("2026-09-06T21:02:00", now)).toMatch(/^Yesterday \d{1,2}[:.]\d{2}/);
    expect(separatorLabel("whenever", now)).toBe("");
  });
});
