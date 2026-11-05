/**
 * The workspace's log says when each decision was made: the clock alone today, and the day with it
 * before then, since the log runs back to the workspace's first day.
 */

import { describe, expect, it } from "vitest";
import { loggedWhen } from "./Audit.tsx";
import { clockTime, shortDayWords } from "./time.ts";

const NOW = Date.parse("2026-11-03T15:00:00");

describe("when a decision was made", () => {
  it("is the clock time today", () => {
    const today = "2026-11-03T09:14:00";
    expect(loggedWhen(today, NOW)).toBe(clockTime(today));
  });

  it("is the day and the clock time before today", () => {
    const before = "2026-10-21T09:14:00";
    expect(loggedWhen(before, NOW)).toBe(`${shortDayWords(before)} · ${clockTime(before)}`);
    expect(loggedWhen(before, NOW)).not.toBe(loggedWhen("2026-11-03T09:14:00", NOW));
  });
});
