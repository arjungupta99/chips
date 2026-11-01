/** What `chips doctor` found: one check, how it went, and what to do about it. */

export type Health = "ok" | "warn" | "bad";

export interface Finding {
  readonly check: string;
  readonly health: Health;
  /** What was found, in one line. */
  readonly detail: string;
  /** The one thing to do about it. Absent only when nothing is wrong. */
  readonly fix?: string;
  readonly docs?: string;
}
