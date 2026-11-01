import { describe, expect, it } from "vitest";
import { timeLeft } from "./when";

const now = Date.parse("2026-09-07T12:00:00.000Z");
const at = (ms: number) => new Date(now + ms).toISOString();

describe("timeLeft", () => {
  it("says nothing when there is no deadline, and nothing for a deadline it cannot read", () => {
    expect(timeLeft(undefined, now)).toBeUndefined();
    expect(timeLeft("soon", now)).toBeUndefined();
  });

  it("counts down in the unit that reads best", () => {
    expect(timeLeft(at(30_000), now)).toBe("in under a minute");
    expect(timeLeft(at(4 * 60_000), now)).toBe("in 4 min");
    expect(timeLeft(at(3 * 3_600_000), now)).toBe("in 3 h");
    expect(timeLeft(at(2 * 86_400_000), now)).toBe("in 2 d");
  });

  it("says so once it has lapsed, on the boundary as well as after it", () => {
    expect(timeLeft(at(0), now)).toBe("expired");
    expect(timeLeft(at(-1), now)).toBe("expired");
  });
});
