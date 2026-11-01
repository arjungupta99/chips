/**
 * The words and colours the screens use for state, transcribed from `packages/ui/src/vocabulary`.
 *
 * The tables there are pure TypeScript and would import cleanly, but `@chipschat/ui`'s entry point
 * pulls its stylesheets in with it and Metro has nothing to do with a `.css` file — which is
 * also why the dependency rules forbid this app from reaching into that package at all. So the
 * tables are copied, and `vocabulary.vitest.ts` reads the originals and fails when a label, a
 * tone or a dot here stops matching. The same bargain the tokens made.
 *
 * The rule the tables encode: state is always a colour *and* a word, never a colour alone.
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

/** How a status dot is drawn. The phone has no pulse — see `Pill.tsx`. */
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

/**
 * Trust is a dial, not a switch. Four levels, each a name and a sentence the profile shows
 * under the segmented control.
 */
export type AutonomyLevel = 0 | 1 | 2 | 3;

export interface AutonomyLevelInfo {
  readonly level: AutonomyLevel;
  readonly name: string;
  readonly summary: string;
}

export const AUTONOMY_LEVELS: readonly AutonomyLevelInfo[] = [
  {
    level: 0,
    name: "Observe",
    summary:
      "Reads and proposes. Every action needs a yes. For brand-new harnesses and sensitive spaces.",
  },
  {
    level: 1,
    name: "Ask first",
    summary: "Reads are free. Every write and every external action asks. Where most people start.",
  },
  {
    level: 2,
    name: "Ask when it matters",
    summary:
      "Policy decides. Money, external messages, deletions and anything irreversible ask. Everything else runs and shows up in the receipt.",
  },
  {
    level: 3,
    name: "Autonomous, report back",
    summary:
      "Runs end to end, posts a summary and a receipt. You audit or roll back. Earned, not granted.",
  },
];

export function autonomyInfo(level: AutonomyLevel): AutonomyLevelInfo {
  // The array is indexed by level, and the type says the index is in range.
  return AUTONOMY_LEVELS[level] as AutonomyLevelInfo;
}

/** The short form the fleet and the run header use: `L2 · Ask when it matters`. */
export function autonomyLabel(level: AutonomyLevel): string {
  return `L${level} · ${autonomyInfo(level).name}`;
}

export interface RiskInfo {
  readonly label: string;
  /** The ones the policy engine will almost always ask about; drawn in red rather than grey. */
  readonly hot: boolean;
}

export const RISK: Readonly<Record<string, RiskInfo>> = {
  external: { label: "External", hot: true },
  external_communication: { label: "External message", hot: true },
  irreversible: { label: "Not reversible", hot: false },
  destructive: { label: "Destructive", hot: true },
  financial: { label: "Money", hot: true },
  credential: { label: "Credentials", hot: true },
  privacy: { label: "Personal data", hot: false },
  legal: { label: "Legal", hot: false },
};

export function riskLabel(risk: string): string {
  return RISK[risk]?.label ?? risk;
}

/** Two initials, as the design system draws them; a channel is a hash. */
export function initials(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith("#")) return "#";
  // A word of punctuation alone is no initial: "Shopping · fork" is SF (ADR 0087, Fork).
  const words = trimmed.split(/\s+/).filter((word) => word.length > 0 && !/^\p{P}+$/u.test(word));
  const letters = words
    .slice(0, 2)
    .map((word) => [...word][0] ?? "")
    .join("");
  return letters.toUpperCase() || "?";
}
