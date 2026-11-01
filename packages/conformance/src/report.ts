/**
 * The report: the connection checklist the app shows, lit by what the harness sent, and the
 * notes underneath it. The rows are the protocol's own list, so `chips conformance` and the
 * Harnesses tab cannot disagree about what an adapter has earned.
 *
 * Passing means the rows the plan's M2.5 names — and the two a run cannot do without. Messages,
 * Runs, Steps, Approvals, Cost and Finished must be lit, and nothing the harness sent may have
 * been refused. Questions and Context are reported and not required: a harness with no
 * questions to ask and no window size to report is complete without them.
 */

import { CONNECTION_CHECKLIST, HARNESS_CAPABILITIES } from "@chipschat/protocol";

export interface RowResult {
  readonly label: string;
  readonly types: readonly string[];
  readonly gives: string;
  readonly lit: boolean;
  /** How many events of the row's types the harness sent. */
  readonly count: number;
  readonly required: boolean;
}

export type Severity = "error" | "warn" | "note";

export interface Finding {
  readonly severity: Severity;
  readonly message: string;
}

/** What became of a capability the harness declared: its check passed or failed, or none sees it. */
export type Outcome = "passed" | "failed" | "declared";

export interface CapabilityResult {
  readonly capability: string;
  readonly outcome: Outcome;
}

/**
 * How far the harness got, by the plan's four levels (open-source harnesses plan, §2): it talks,
 * it is supervised, it lives in Chips, it is managed from Chips. The first two are rows of the
 * checklist; the last two count the capabilities whose checks passed, or that no check can see.
 */
export interface LevelResult {
  readonly label: string;
  readonly has: number;
  readonly of: number;
  /** For the two levels made of capabilities: each one the harness declared, and how it did. */
  readonly capabilities?: readonly CapabilityResult[];
}

export interface Report {
  readonly adapter: string;
  readonly rows: readonly RowResult[];
  readonly levels: readonly LevelResult[];
  readonly findings: readonly Finding[];
  /** How many events the harness sent that the log took. */
  readonly events: number;
  readonly durationMs: number;
  readonly passed: boolean;
}

export const REQUIRED_ROWS: ReadonlySet<string> = new Set([
  "Messages",
  "Runs",
  "Steps",
  "Approvals",
  "Cost",
  "Finished",
]);

/** The rows, lit by the types the harness sent. */
export function rowsOf(sent: readonly string[]): RowResult[] {
  return CONNECTION_CHECKLIST.map((row) => {
    const count = sent.filter((type) => row.types.includes(type)).length;
    return {
      label: row.label,
      types: row.types,
      gives: row.gives,
      lit: count > 0,
      count,
      required: REQUIRED_ROWS.has(row.label),
    };
  });
}

/** The capabilities each of the upper two levels is made of, in the order the report says them. */
export const LEVEL_CAPABILITIES: Readonly<Record<string, readonly string[]>> = {
  "Lives in Chips": [
    HARNESS_CAPABILITIES.agents,
    HARNESS_CAPABILITIES.newSpaces,
    HARNESS_CAPABILITIES.forks,
    HARNESS_CAPABILITIES.newAgents,
    HARNESS_CAPABILITIES.followsRooms,
    HARNESS_CAPABILITIES.restarts,
  ],
  "Managed from Chips": [
    HARNESS_CAPABILITIES.contextFiles,
    HARNESS_CAPABILITIES.models,
    HARNESS_CAPABILITIES.heartbeats,
    HARNESS_CAPABILITIES.contextWindows,
    HARNESS_CAPABILITIES.jobs,
    HARNESS_CAPABILITIES.autonomy,
  ],
};

/** The four levels, from the rows lit and what became of each capability declared. */
export function levelsOf(
  rows: readonly RowResult[],
  outcomes: ReadonlyMap<string, Outcome>,
): LevelResult[] {
  const lit = (label: string) => rows.some((row) => row.label === label && row.lit);
  const supervised = rows.every((row) => row.lit || !row.required);
  return [
    { label: "Talks", has: lit("Messages") ? 1 : 0, of: 1 },
    { label: "Supervised", has: supervised ? 1 : 0, of: 1 },
    ...Object.entries(LEVEL_CAPABILITIES).map(([label, all]) => {
      const capabilities = all
        .filter((capability) => outcomes.has(capability))
        .map((capability) => ({ capability, outcome: outcomes.get(capability) ?? "failed" }));
      const has = capabilities.filter((each) => each.outcome !== "failed").length;
      return { label, has, of: all.length, capabilities };
    }),
  ];
}

export function passes(rows: readonly RowResult[], findings: readonly Finding[]): boolean {
  return (
    rows.every((row) => row.lit || !row.required) &&
    findings.every((finding) => finding.severity !== "error")
  );
}

/** The reference page for an event type: the one an unlit row in the app links to. */
export function docsFor(type: string): string {
  return `https://chipschat.ai/reference/events/${type.replace(/\./g, "-")}/`;
}

const MARK: Readonly<Record<Severity, string>> = { error: "x", warn: "!", note: "·" };

/** One row, as the app draws it: a mark, the label, and what was sent or what to send. */
function rowLine(row: RowResult, width: number): string {
  const mark = row.lit ? "●" : "○";
  const first = row.types[0] ?? "";
  const times = row.count > 1 ? ` ×${row.count}` : "";
  const detail = row.lit ? `sent ${first}${times}` : `send ${first} for ${row.gives}`;
  return `    ${mark} ${row.label.padEnd(width)}   ${detail}`;
}

/** What is missing, in a sentence. */
function verdict(report: Report): string {
  if (report.passed) return "  Passed. Every required row is lit and nothing was refused.";
  const dark = report.rows.filter((row) => row.required && !row.lit).map((row) => row.label);
  const errors = report.findings.filter((finding) => finding.severity === "error").length;
  const parts = [
    ...(dark.length === 0 ? [] : [`${listOf(dark)} ${dark.length === 1 ? "is" : "are"} not lit`]),
    ...(errors === 0 ? [] : [`${errors} thing${errors === 1 ? "" : "s"} to fix below`]),
  ];
  return `  Not passed: ${parts.join("; ")}.`;
}

function listOf(words: readonly string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

const MARKS: Readonly<Record<Outcome, string>> = {
  passed: "✓",
  failed: "✗",
  declared: "· not checked",
};

/** A level as one line: lit or not for the first two, a count and each capability for the rest. */
function levelLine(level: LevelResult, width: number): string {
  if (level.capabilities === undefined) return `    ${level.has === 1 ? "●" : "○"} ${level.label}`;
  const label = level.label.padEnd(width);
  const each = level.capabilities
    .map(({ capability, outcome }) => `${capability.replace(/_/g, " ")} ${MARKS[outcome]}`)
    .join(", ");
  const mark = level.has === level.of ? "●" : level.has > 0 ? "◐" : "○";
  return `    ${mark} ${label}   ${level.has} of ${level.of}${each === "" ? "" : `: ${each}`}`;
}

/** The report as lines, ready for a console. */
export function formatReport(report: Report): string[] {
  const width = Math.max(...report.rows.map((row) => row.label.length));
  const lines = report.rows.map((row) => rowLine(row, width));
  const levelWidth = Math.max(...report.levels.map((level) => level.label.length));
  lines.push("", ...report.levels.map((level) => levelLine(level, levelWidth)));
  lines.push("");
  lines.push(
    `    ${report.events} event${report.events === 1 ? "" : "s"} in ${(report.durationMs / 1000).toFixed(1)} s`,
  );
  if (report.findings.length > 0) {
    lines.push("", "  Notes");
    for (const finding of report.findings) {
      lines.push(`    ${MARK[finding.severity]} ${finding.message}`);
    }
  }
  const unlit = report.rows.filter((row) => !row.lit);
  if (unlit.length > 0) {
    lines.push("", "  Each unlit row links to the page that lights it:");
    for (const row of unlit)
      lines.push(`    ${row.label.padEnd(width)}   ${docsFor(row.types[0] ?? "")}`);
  }
  lines.push("", verdict(report));
  return lines;
}
