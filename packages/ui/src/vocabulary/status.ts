/**
 * The harness status vocabulary (blueprint, Look): seven states, each a colour plus a word,
 * never a colour alone. "Working" always carries a verb phrase, so a fleet list reads like a
 * room full of people busy with something.
 */

export const HARNESS_STATUSES = [
  "idle",
  "thinking",
  "working",
  "waiting",
  "blocked",
  "done",
  "failed",
] as const;
export type HarnessStatus = (typeof HARNESS_STATUSES)[number];

/** The five colours status may use. Gold is not one of them: the brand stays out of status. */
export type Tone = "neutral" | "blue" | "amber" | "red" | "green";

/** How a status dot is drawn: filled, an outline while thinking, pulsing while working. */
export type DotKind = "solid" | "hollow" | "pulse";

export interface StatusStyle {
  readonly label: string;
  readonly tone: Tone;
  readonly dot: DotKind;
}

export const STATUS: Readonly<Record<HarnessStatus, StatusStyle>> = {
  idle: { label: "Idle", tone: "neutral", dot: "solid" },
  thinking: { label: "Thinking", tone: "blue", dot: "hollow" },
  working: { label: "Working", tone: "blue", dot: "pulse" },
  waiting: { label: "Waiting on you", tone: "amber", dot: "solid" },
  blocked: { label: "Blocked", tone: "red", dot: "solid" },
  done: { label: "Done", tone: "green", dot: "solid" },
  failed: { label: "Failed", tone: "red", dot: "solid" },
};

/** The word for a status, with the verb phrase when there is one to carry. */
export function statusLabel(status: HarnessStatus, verbPhrase?: string): string {
  const { label } = STATUS[status];
  return status === "working" && verbPhrase !== undefined ? `${label} · ${verbPhrase}` : label;
}

/**
 * The ring a harness's avatar wears. Idle wears none: the ring is state, and a harness with
 * nothing going on has no state to show.
 */
export function ringTone(status: HarnessStatus | undefined): Tone | undefined {
  if (status === undefined || status === "idle") return undefined;
  return STATUS[status].tone;
}
