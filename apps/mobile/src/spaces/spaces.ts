/**
 * How a room's lines group. Pure, so the phone and the desktop can be checked against each other
 * rather than eyeballed. What a space is called and how the list is ordered are core's `spaceTitle`
 * and `spaceList`, which search reads too; the line under its name is core's `spaceSubtitle`, which
 * the desktop's header says too; which lines a room draws is core's `visibleLines`, because the
 * media viewer's deck reads the same lines.
 */

import type {
  Directory,
  Doing,
  ExchangeLine,
  Lane,
  Line,
  NeedsYouItem,
  Snapshot,
  Space,
} from "@chipschat/core";
import { closesRun } from "@chipschat/core";

/** Lines by one author under three minutes apart read as one turn; past fifteen the room says the time. */
export const GROUP_WITHIN_MS = 3 * 60_000;
export const SEPARATOR_AFTER_MS = 15 * 60_000;

/** Where a bubble stands in its group: alone, or the first, one of the middle, or the last of a run. */
export type Place = "only" | "first" | "middle" | "last";

export interface Drawn {
  readonly line: Line;
  readonly place: Place;
  /** A separator saying the time stands over this line: the first, or one after a long silence. */
  readonly separator: boolean;
}

/**
 * The room's foot: what each harness at work is doing, and the asks waiting on somebody, under the
 * newest line. A row of the list rather than its header, so it moves with the rest of the room
 * (`RoomMotion.tsx`): a header is laid out outside the rows, and stood still while they moved.
 * It carries the snapshot its cards read, so a new one redraws the foot and no other row.
 */
export interface FootRow {
  readonly foot: true;
  /** The room: what a bubble's Pause, Resume and Stop are said about (ADR 0293). */
  readonly spaceId: string;
  /** A bubble apiece, in the order they stand (`useThinking`); empty when nobody is at work. */
  readonly doing: readonly Doing[];
  readonly asks: readonly NeedsYouItem[];
  readonly snapshot: Snapshot;
  /** Out of touch with the server, so the bubbles stand still (`useInTouch`, `ThinkingBubble`). */
  readonly resting: boolean;
}

/**
 * Harnesses talking to each other, folded into one row of the room (ADR 0081): who, how many, the
 * latest line, and the lines themselves, open on a tap. The margin line under it is the
 * referee's (ADR 0097), once the talk is worth one.
 */
export interface FoldRow {
  readonly fold: true;
  /** Oldest first, as the fold reads them when it is open. */
  readonly lines: readonly Line[];
  /** The referee's line (`exchangeLine`) as of the fold's newest line, from the warning on. */
  readonly guard?: ExchangeLine | undefined;
  /** A separator saying the time stands over it, as over the first of its lines. */
  readonly separator: boolean;
}

/** A row of the room's list: a line, harnesses talking folded into one, or the foot. */
export type Row = Drawn | FoldRow | FootRow;

export function isFoot(row: Row): row is FootRow {
  return "foot" in row;
}

export function isFold(row: Row): row is FoldRow {
  return "fold" in row;
}

/**
 * The drawn lines, newest first, with each run of harnesses talking to each other folded into one
 * row (`betweenHarnesses`), a run of one included, as the desktop folds them. `guardOf` says the
 * referee's line as of a line, and a fold carries the one as of its newest.
 */
export function foldRuns(
  drawn: readonly Drawn[],
  between: (line: Line) => boolean,
  guardOf: (line: Line) => ExchangeLine | undefined,
): (Drawn | FoldRow)[] {
  const rows: (Drawn | FoldRow)[] = [];
  let run: Drawn[] = [];
  const close = () => {
    const oldest = run.at(-1);
    if (oldest === undefined) return;
    const lines = run.map((each) => each.line).reverse();
    const guard = [...lines]
      .reverse()
      .map(guardOf)
      .find((words) => words !== undefined);
    rows.push({ fold: true, lines, guard, separator: oldest.separator });
    run = [];
  };
  for (const each of drawn) {
    if (between(each.line)) {
      run.push(each);
      continue;
    }
    close();
    rows.push(each);
  }
  close();
  return rows;
}

/** Only a bubble groups; a card, a margin line and a tombstone stand alone. */
function isBubble(line: Line): boolean {
  return (line.kind === "text" || line.kind === "summary") && line.deleted !== true;
}

function gapMs(before: Line, line: Line): number {
  return new Date(line.ts).getTime() - new Date(before.ts).getTime();
}

function sameTurn(
  before: Line,
  line: Line,
  speakerOf: (line: Line) => string,
  starts: (line: Line, before: Line) => boolean,
): boolean {
  return (
    isBubble(before) &&
    isBubble(line) &&
    !starts(line, before) &&
    speakerOf(before) === speakerOf(line) &&
    Math.abs(gapMs(before, line)) < GROUP_WITHIN_MS
  );
}

/**
 * The lines as the room draws them, in the order they were said (ADR 0050): grouped where one
 * author's bubbles follow each other within `GROUP_WITHIN_MS`, so the corners between them can
 * close up and the time can go on the last alone; and with a separator before the first line and
 * after any silence longer than `SEPARATOR_AFTER_MS`, which ends a group too, because the time
 * it says is a break in the conversation. `speakerOf` is who a line reads as said by — a relayed
 * line is its person's (`saidBy`), so it groups with what they typed here themselves. A line that
 * `starts` a turn of its own after the one before it never joins it: one wearing a route over it
 * (ADR 0081), so the route stands in a turn's gap rather than in the two points between two
 * bubbles, and either side of harnesses talking to each other, which fold into a row of their own.
 */
export function groupLines(
  lines: readonly Line[],
  speakerOf: (line: Line) => string,
  starts: (line: Line, before: Line) => boolean = () => false,
): readonly Drawn[] {
  const drawn: Drawn[] = [];
  for (const [index, line] of lines.entries()) {
    const before = lines[index - 1];
    const separator = before === undefined || gapMs(before, line) >= SEPARATOR_AFTER_MS;
    const joins = !separator && before !== undefined && sameTurn(before, line, speakerOf, starts);
    const last = drawn.at(-1);
    if (joins && last !== undefined) {
      drawn[drawn.length - 1] = { ...last, place: last.place === "only" ? "first" : "middle" };
    }
    drawn.push({ line, place: joins ? "last" : "only", separator });
  }
  return drawn;
}

/**
 * The word a lane's row wears while there is something to say: working while the lane is live,
 * failed when it ended badly, and nothing once it is done or waiting — the reply under it and
 * the ask card at the room's foot say those (ADR 0050).
 */
export function laneLive(lane: Lane): "working" | "failed" | undefined {
  if (lane.state === "queued" || lane.state === "running") return "working";
  if (lane.state === "failed" || lane.state === "cancelled") return "failed";
  return undefined;
}

/**
 * Who said a line, which is not always who sent the event. A prompt typed at a terminal reaches
 * Chips as the harness's own `run.started`, but the person typed it, and showing it under the
 * harness's name would make a space of two people look like one talking to itself. The harness's
 * owner is who that is (ADR 0023: a harness has one), and if Chips does not know them the
 * harness's own name is the honest fallback.
 */
export function saidBy(
  line: Line,
  directory: Directory,
): { readonly id: string; readonly kind: "person" | "harness" } {
  const kind = line.authorKind === "harness" ? "harness" : "person";
  if (line.via === undefined) return { id: line.authorId, kind };
  const owner = directory[line.via]?.ownerId;
  return owner === undefined ? { id: line.via, kind: "harness" } : { id: owner, kind: "person" };
}

/**
 * Where something waiting on a person points, inside its space: the line it is about, or the
 * asks the room is holding at its foot. Carried in the link as `?at=`, so a push and a bookmark
 * land the same way; a tap is a trip to the message, not to a screen about it (Arjun,
 * 9 September 2026).
 */
export type Target =
  | { readonly kind: "line"; readonly id: string }
  | { readonly kind: "run"; readonly runId: string }
  | { readonly kind: "asks" };

/** A question in a space this person is in is answered in that room, on its card. */
export function answersInTheRoom(item: NeedsYouItem): boolean {
  return item.kind === "question" && item.outside !== true;
}

export function targetOf(item: NeedsYouItem): string {
  if (item.kind === "checkpoint") return `line:${item.id}`;
  if (item.kind === "summary" || item.kind === "failure") return `run:${item.id}`;
  return "asks";
}

export function parseTarget(at: string | undefined): Target | undefined {
  if (at === undefined || at === "") return undefined;
  if (at === "asks") return { kind: "asks" };
  const colon = at.indexOf(":");
  if (colon <= 0) return undefined;
  const kind = at.slice(0, colon);
  const id = at.slice(colon + 1);
  if (kind === "line") return { kind, id };
  if (kind === "run") return { kind, runId: id };
  return undefined;
}

/**
 * The line a target names, as an index into the lines as drawn — newest first, in the room. A
 * run's line is the one that closed it: the summary, or the status line a failure left. Nothing
 * found is -1, which is what a replay still on its way looks like.
 */
export function targetIndex(lines: readonly Line[], target: Target): number {
  if (target.kind === "asks") return -1;
  if (target.kind === "line") return lines.findIndex((line) => line.id === target.id);
  return lines.findIndex((line) => closesRun(line, target.runId));
}

/**
 * The asks a space is holding — every run's unanswered approvals and questions — as the cards
 * the room draws at its foot. Everyone's, not only the reader's: a person should see what the harness
 * is waiting on even when it is a colleague's to answer, and the card says whose.
 */
export function openAsks(space: Space): readonly NeedsYouItem[] {
  return space.runs.flatMap((run) => {
    const base = {
      spaceId: space.id,
      runId: run.runId,
      harnessId: run.harnessId,
      seq: space.lastEventSeq,
    };
    return [
      ...run.approvals
        .filter((approval) => approval.resolved === undefined)
        .map(
          (approval): NeedsYouItem => ({
            ...base,
            kind: "approval",
            tier: "decide",
            id: approval.approvalId,
            title: approval.actionKind + (approval.to === undefined ? "" : ` to ${approval.to}`),
            expiresAt: approval.expiresAt,
          }),
        ),
      ...run.questions
        .filter((question) => question.answered === undefined)
        .map(
          (question): NeedsYouItem => ({
            ...base,
            kind: "question",
            tier: question.questions.some((each) => each.defaultValue !== undefined)
              ? "review"
              : "decide",
            id: question.askId,
            title: question.questions[0]?.prompt ?? "A question",
            expiresAt: question.timeoutAt,
          }),
        ),
    ];
  });
}
