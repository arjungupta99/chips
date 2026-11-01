/**
 * Time comes through a port so tests are deterministic (technical-plan 6.1).
 * Nothing in Chips calls `Date.now()` directly; it asks a `Clock`.
 */

export interface Clock {
  /** Milliseconds since the Unix epoch. */
  nowMs: () => number;
  /** The same instant as a `Date`. */
  now: () => Date;
  /** The same instant as an ISO 8601 string, the form every event envelope uses. */
  nowIso: () => string;
}

export interface ManualClock extends Clock {
  /** Move the clock forward. Negative values are rejected: time does not run backwards. */
  advance: (milliseconds: number) => void;
  /** Place the clock at an instant. */
  set: (instant: number | Date) => void;
}

export const systemClock: Clock = {
  nowMs: () => Date.now(),
  now: () => new Date(),
  nowIso: () => new Date().toISOString(),
};

/** A clock a test drives by hand. Starts at the given instant and never moves on its own. */
export function manualClock(start: number | Date = 0): ManualClock {
  let current = toMillis(start);
  return {
    nowMs: () => current,
    now: () => new Date(current),
    nowIso: () => new Date(current).toISOString(),
    advance(milliseconds: number) {
      if (!Number.isFinite(milliseconds) || milliseconds < 0) {
        throw new RangeError(
          `a clock advances by a finite, non-negative amount, got ${milliseconds}`,
        );
      }
      current += milliseconds;
    },
    set(instant: number | Date) {
      current = toMillis(instant);
    },
  };
}

/** A clock that runs, and that a test may also move forward: the system's time, plus a lead. */
export interface LeadingClock extends Clock {
  /** Move it forward by this much more. Negative values are rejected, as a manual clock's are. */
  advance: (milliseconds: number) => void;
}

/**
 * A running clock a dev-mode test can move on: a join request that lasts ten minutes expires in a
 * call, while everything else about the server keeps the real time (ADR 0122).
 */
export function leadingClock(base: Clock = systemClock): LeadingClock {
  let lead = 0;
  const nowMs = () => base.nowMs() + lead;
  return {
    nowMs,
    now: () => new Date(nowMs()),
    nowIso: () => new Date(nowMs()).toISOString(),
    advance(milliseconds: number) {
      if (!Number.isFinite(milliseconds) || milliseconds < 0) {
        throw new RangeError(
          `a clock advances by a finite, non-negative amount, got ${milliseconds}`,
        );
      }
      lead += milliseconds;
    },
  };
}

function toMillis(instant: number | Date): number {
  return typeof instant === "number" ? instant : instant.getTime();
}
