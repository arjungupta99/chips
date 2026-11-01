/**
 * `@chipschat/conformance` — the adapter conformance kit (technical-plan M2.5, ADR 0012).
 *
 * A fake Chips that speaks the wire and checks every event with the protocol's own schemas; a
 * driver that walks an adapter through the golden scenario, playing the person; and the report,
 * which is the connection checklist the app shows. `chips conformance <adapter>` is the command;
 * an adapter's own test suite can run the same thing.
 */

export type { DecideOptions, FakeChips, FakeChipsOptions } from "./fake-chips.js";
export { startFakeChips } from "./fake-chips.js";
export type { FakeJoinView } from "./fake-join.js";
export type { Finding, Report, RowResult, Severity } from "./report.js";
export { docsFor, formatReport, passes, REQUIRED_ROWS, rowsOf } from "./report.js";
export type { ConformanceOptions } from "./scenario.js";
export { GOLDEN_MESSAGE, NEW_SPACE_MESSAGE, runConformance } from "./scenario.js";
export type { ChipsAddress, Subject, Turn } from "./subject.js";
export { customSubject } from "./subject.js";
export type {
  ApprovalRow,
  AskedSpace,
  Claimed,
  Dropped,
  LaneOpened,
  OpenedSpace,
  Outcome,
  Principal,
  QuestionRow,
  Refusal,
  Refused,
  RunRow,
  RunState,
  SpaceRow,
  StoredEvent,
  Viewer,
} from "./workspace.js";
export { Workspace } from "./workspace.js";
