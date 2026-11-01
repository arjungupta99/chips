/**
 * The connection checklist: which event lights which part of the interface.
 *
 * Agent Connect is progressive (blueprint, Connect). The minimum is three events — a run
 * started, a message, a run completed — and every further event a harness sends earns it
 * another part of the UI. This list is that promise, written down once: the Harnesses tab lights
 * a row as the type arrives, and `chips conformance` prints the same rows for an adapter, so the
 * two cannot say different things about what a harness has earned.
 */

export interface ChecklistRow {
  /** The event types that light this row. The first is the one the row names. */
  readonly types: readonly string[];
  readonly label: string;
  /** What sending it gets you, in the words the unlit row uses: "send X for <gives>". */
  readonly gives: string;
}

/** The rows, in the order the interface upgrades. */
export const CONNECTION_CHECKLIST: readonly ChecklistRow[] = [
  { types: ["message.post"], label: "Messages", gives: "a bubble in the space" },
  { types: ["run.started"], label: "Runs", gives: "a status pill and a run panel" },
  { types: ["step.log"], label: "Steps", gives: "a timeline and a receipt" },
  { types: ["approval.request"], label: "Approvals", gives: "an approval card in the space" },
  { types: ["question.ask"], label: "Questions", gives: "a question card with options" },
  { types: ["context.usage"], label: "Context", gives: "the context ring" },
  { types: ["usage"], label: "Cost", gives: "the cost meter" },
  { types: ["run.completed", "run.failed"], label: "Finished", gives: "a summary card" },
  { types: ["task"], label: "Lanes", gives: "a route card, and a task card where the work goes" },
];
