/**
 * Asks so far (ADR 0255): what the dots on When it asks you stand for, opened. Arjun's A of 1
 * November 2026: a tap on the dots pushes a page of every ask newest first, under its day, with a
 * filter for the yeses and the noes; an ask opens whole, with its space a tap away.
 *
 * - **A row** says the ask's own words (its question, else its preview's title, else what its kind
 *   does, never the kind when Chips has words for it), the answer in words ("You said no"), and
 *   who asked where ("Thea in Memory match again"), under its day, at its time.
 * - **The key** under the dots counts every ask by how it ended: "8 yes", "4 no".
 * - **An ask, whole** says the answer and when it came: "At 5:37 AM, 4 minutes after Thea asked."
 *
 * In core so the phone, the web and the Mac say the same thing.
 */

import { type AskDot, actionWords, dayMonth, harnessAsks } from "./asking.js";
import { type Directory, harnessOf, nameOf } from "./events.js";
import { mayAnswer } from "./model/readers.js";
import type { Approval, Run, WorkspaceModel } from "./model/types.js";
import { roomName } from "./rooms.js";

/** The heading over the dots, and the way to the page. */
export const ASKS_SO_FAR = "Asks so far";
export const SEE_ALL = "See all";
/** The page's name in its bar. */
export const ASKS_TITLE = "Asks";
/** What the page says with nothing in it, as when a filter keeps nothing. */
export const ASKS_NONE = "Nothing yet.";

/**
 * How an ask ended, as its row's mark draws it: a person's yes this once, a yes that stands for the
 * session or always, a no, a yes from its rules, a yes in the harness's own tools, nobody answered,
 * or still waiting.
 */
export type AskEnd = "yes" | "standing" | "no" | "policy" | "own" | "lapsed" | "open";

/** Which of the page's filters an ask falls under; one still waiting is under All alone. */
export type AskFilter = "all" | "yes" | "no";

export interface AskRow {
  readonly approvalId: string;
  readonly spaceId: string;
  readonly runId: string;
  /** What it asked, in its own words: `Allow it to node --check game.js?`. */
  readonly words: string;
  readonly end: AskEnd;
  /** The answer, said: `You said no`, `Dana said yes for the session`, `Waiting for you`. */
  readonly answer: string;
  /** Who asked, and where: `Thea in Memory match again`. */
  readonly where: string;
  readonly askedAt: string;
  /** `5:33 AM`. */
  readonly time: string;
  /** The heading it stands under: `Today`, `Yesterday`, `Friday 23 October`. */
  readonly day: string;
  readonly filter: Exclude<AskFilter, "all"> | undefined;
}

/** One ask with where it was asked: its run and its space. */
export interface FoundAsk {
  readonly approval: Approval;
  readonly run: Run;
  readonly spaceId: string;
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const DAY_MS = 86_400_000;

const midnight = (ms: number): number => {
  const at = new Date(ms);
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
};

/** `5:33 AM`, in the reader's own zone. */
export function askTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** `Today`, `Yesterday`, or `Friday 23 October` (with its year when it is not this one). */
export function askDay(iso: string, now: number = Date.now()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const days = Math.round((midnight(now) - midnight(at.getTime())) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${WEEKDAYS[at.getDay()]} ${dayMonth(iso, now)}`;
}

/** `Asked today at 9:12 AM`, `Asked Friday 23 October at 5:33 AM`. */
export function askedAtWords(iso: string, now: number = Date.now()): string {
  const day = askDay(iso, now);
  const said = day === "Today" || day === "Yesterday" ? day.toLowerCase() : day;
  return `Asked ${said} at ${askTime(iso)}`;
}

/** What an ask says on its row: its question, its preview's title, what its kind does, its kind. */
export function askRowWords(approval: Approval): string {
  return (
    approval.question ??
    approval.previewTitle ??
    actionWords(approval.actionKind) ??
    approval.actionKind
  );
}

/** Who asked, by name: the agent or harness whose run it was. */
export function askerName(run: Run, directory: Directory): string {
  return nameOf(directory, run.harnessId);
}

const said = (decision: string): string => (decision === "denied" ? "no" : "yes");

/** How far a person's yes reached, after it: ` for the session`, ` always`, ` with changes`. */
function reachOf(decision: string, scope: string): string {
  if (decision === "edited") return " with changes";
  if (decision === "denied") return "";
  if (scope === "session") return " for the session";
  if (scope === "always") return " always";
  return "";
}

/**
 * How an ask ended and the answer in words, from where the reader stands: `You said no`, `Dana said
 * yes for the session`, `Policy said yes`, `Kit said yes in its own tools`, `Nobody answered, so it
 * was denied`, `Waiting for you`.
 */
export function askAnswer(
  approval: Approval,
  directory: Directory,
  selfId: string | undefined,
  /** The participant whose run it was, so an answer in the harness's own tools says so. */
  asker?: string,
): AskAnswer {
  const resolved = approval.resolved;
  if (resolved === undefined) return waitingFor(approval, directory, selfId);
  const { decision, by } = resolved;
  if (decision === "expired") {
    const went = approval.fallback === "allow" ? "it went ahead" : "it was denied";
    return { end: "lapsed", words: `Nobody answered, so ${went}` };
  }
  const no = decision === "denied";
  if (by === "system") return { end: no ? "no" : "policy", words: `Policy said ${said(decision)}` };
  const kind = directory[by]?.kind;
  if (kind !== undefined && kind !== "person") return toolsAnswer(decision, by, directory, asker);
  return personAnswer(decision, resolved.scope, by === selfId ? "You" : nameOf(directory, by));
}

/** An answer, as its row says it. */
export interface AskAnswer {
  readonly end: AskEnd;
  readonly words: string;
}

/** An ask still open: `Waiting for you`, or for whoever it waits on. */
function waitingFor(
  approval: Approval,
  directory: Directory,
  selfId: string | undefined,
): AskAnswer {
  const mine = selfId !== undefined && mayAnswer(approval, selfId);
  const others = approval.approvers.map((id) => nameOf(directory, id)).join(" or ");
  return {
    end: "open",
    words: mine || others === "" ? "Waiting for you" : `Waiting for ${others}`,
  };
}

/**
 * An answer a harness or an agent gave: in the harness's own tools when it was the asker's own
 * harness; a lead answering for another harness (ADR 0036) answered as itself.
 */
function toolsAnswer(
  decision: string,
  by: string,
  directory: Directory,
  asker: string | undefined,
): AskAnswer {
  const own = asker === undefined || harnessOf(directory, by) === harnessOf(directory, asker);
  const name = nameOf(directory, own ? harnessOf(directory, by) : by);
  return {
    end: decision === "denied" ? "no" : "own",
    words: `${name} said ${said(decision)}${own ? " in its own tools" : ""}`,
  };
}

/** A person's answer: `You said no`, `Dana said yes for the session`, `You said yes always`. */
function personAnswer(decision: string, scope: string, who: string): AskAnswer {
  const words = `${who} said ${said(decision)}${reachOf(decision, scope)}`;
  if (decision === "denied") return { end: "no", words };
  const standing = decision !== "edited" && (scope === "session" || scope === "always");
  return { end: standing ? "standing" : "yes", words };
}

/** Which filter an ask is under: a yes, a no (and nobody answering is a no), or none while open. */
function filterOf(approval: Approval): AskRow["filter"] {
  const resolved = approval.resolved;
  if (resolved === undefined) return undefined;
  if (resolved.decision === "expired") return approval.fallback === "allow" ? "yes" : "no";
  return resolved.decision === "denied" ? "no" : "yes";
}

/**
 * Every ask of a harness's runs the reader can see, with its run and space, oldest first; with no
 * harness, every harness's, as You's Allowed always counts them (`workspaceAskHistory`).
 */
function asksWithRuns(
  model: WorkspaceModel,
  directory: Directory,
  harnessId: string | undefined,
): readonly FoundAsk[] {
  return model.spaces
    .flatMap((space) =>
      space.runs
        .filter(
          (run) => harnessId === undefined || harnessOf(directory, run.harnessId) === harnessId,
        )
        .flatMap((run) => run.approvals.map((approval) => ({ approval, run, spaceId: space.id }))),
    )
    .sort((a, b) => a.approval.askedAt.localeCompare(b.approval.askedAt));
}

/**
 * The page's rows: every ask of a harness the reader can see, newest first. With no harness, every
 * ask in the workspace: the page You's Allowed always opens from its dots.
 */
export function askRows(
  model: WorkspaceModel,
  directory: Directory,
  harnessId: string | undefined,
  selfId: string | undefined,
  now: number = Date.now(),
): readonly AskRow[] {
  return asksWithRuns(model, directory, harnessId)
    .map(({ approval, run, spaceId }): AskRow => {
      const answer = askAnswer(approval, directory, selfId, run.harnessId);
      return {
        approvalId: approval.approvalId,
        spaceId,
        runId: run.runId,
        words: askRowWords(approval),
        end: answer.end,
        answer: answer.words,
        where: `${askerName(run, directory)} in ${roomName(model, spaceId, directory)}`,
        askedAt: approval.askedAt,
        time: askTime(approval.askedAt),
        day: askDay(approval.askedAt, now),
        filter: filterOf(approval),
      };
    })
    .reverse();
}

/** The rows under one filter. */
export function rowsUnder(rows: readonly AskRow[], filter: AskFilter): readonly AskRow[] {
  return filter === "all" ? rows : rows.filter((row) => row.filter === filter);
}

/** One of the filters at the page's top, with its count: `All 12`, `Yes 8`, `No 4`. */
export interface AskFilterChoice {
  readonly id: AskFilter;
  readonly label: string;
}

/**
 * The filters the page offers: All, Yes and No with their counts, only when the asks are not all
 * one or the other; nothing to choose between is no filter at all.
 */
export function askFilters(rows: readonly AskRow[]): readonly AskFilterChoice[] {
  const yes = rows.filter((row) => row.filter === "yes").length;
  const no = rows.filter((row) => row.filter === "no").length;
  if (yes === 0 || no === 0) return [];
  return [
    { id: "all", label: `All ${rows.length}` },
    { id: "yes", label: `Yes ${yes}` },
    { id: "no", label: `No ${no}` },
  ];
}

/** Rows under the day each was asked: `[{ day: "Today", rows }, …]`, newest first. */
export function byDay(
  rows: readonly AskRow[],
): readonly { readonly day: string; readonly rows: readonly AskRow[] }[] {
  const days: { day: string; rows: AskRow[] }[] = [];
  for (const row of rows) {
    const last = days[days.length - 1];
    if (last !== undefined && last.day === row.day) last.rows.push(row);
    else days.push({ day: row.day, rows: [row] });
  }
  return days;
}

/** One entry of the key under the dots: its dot and its count, `8 yes`. */
export interface AskKey {
  readonly dot: AskDot;
  readonly words: string;
}

/** The key under the dots, counting every ask: `8 yes`, `4 no`, `1 unanswered`, `1 waiting`. */
export function askKey(asks: readonly Approval[]): readonly AskKey[] {
  let yes = 0;
  let no = 0;
  let lapsed = 0;
  let open = 0;
  for (const ask of asks) {
    const decision = ask.resolved?.decision;
    if (decision === undefined) open += 1;
    else if (decision === "expired") lapsed += 1;
    else if (decision === "denied") no += 1;
    else yes += 1;
  }
  return [
    { dot: "yes" as const, count: yes, words: `${yes} yes` },
    { dot: "no" as const, count: no, words: `${no} no` },
    { dot: "lapsed" as const, count: lapsed, words: `${lapsed} unanswered` },
    { dot: "open" as const, count: open, words: `${open} waiting` },
  ]
    .filter((each) => each.count > 0)
    .map(({ dot, words }) => ({ dot, words }));
}

/** The key under a harness's dots: every ask of it the reader can see. */
export function harnessAskKey(
  model: WorkspaceModel,
  directory: Directory,
  harnessId: string,
): readonly AskKey[] {
  return askKey(harnessAsks(model, directory, harnessId));
}

/** An ask by its id, wherever the reader can see it, with its run and space. */
export function findAsk(model: WorkspaceModel, approvalId: string): FoundAsk | undefined {
  for (const space of model.spaces) {
    for (const run of space.runs) {
      const approval = run.approvals.find((each) => each.approvalId === approvalId);
      if (approval !== undefined) return { approval, run, spaceId: space.id };
    }
  }
  return undefined;
}

/** How long one moment came after another: `under a minute`, `4 minutes`, `2 hours`, `3 days`. */
export function gapWords(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return hours === 1 ? "1 hour" : `${hours} hours`;
  const days = Math.floor(hours / 24);
  return `${days} days`;
}

/** An answered ask's verdict on its own page: the answer, and when it came. */
export interface AskVerdict {
  readonly end: AskEnd;
  /** `You said no`. */
  readonly words: string;
  /** `At 5:37 AM, 4 minutes after Thea asked.` */
  readonly line: string;
}

/**
 * What an ask's own page says of its answer: `You said no` over `At 5:37 AM, 4 minutes after Thea
 * asked.`, with the day when it came on another one; nothing while it still waits.
 */
export function askVerdict(
  found: FoundAsk,
  directory: Directory,
  selfId: string | undefined,
  now: number = Date.now(),
): AskVerdict | undefined {
  const { approval, run } = found;
  const resolved = approval.resolved;
  if (resolved === undefined) return undefined;
  const answer = askAnswer(approval, directory, selfId, run.harnessId);
  const day = askDay(resolved.at, now);
  const sameDay = day === askDay(approval.askedAt, now);
  const when = sameDay
    ? `At ${askTime(resolved.at)}`
    : `${day === "Today" || day === "Yesterday" ? day : `On ${day}`} at ${askTime(resolved.at)}`;
  const gap = gapWords(Date.parse(resolved.at) - Date.parse(approval.askedAt));
  const asker = askerName(run, directory);
  const line =
    resolved.decision === "expired"
      ? `${when}, when its time ran out, ${gap} after ${asker} asked.`
      : `${when}, ${gap} after ${asker} asked.`;
  return { end: answer.end, words: answer.words, line };
}
