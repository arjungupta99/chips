/**
 * Whether an agent can answer, and a message it hasn't picked up (ADR 0083). In core so the phone
 * and the desktop mark the same agents and say it in the same words.
 *
 * Two things say an agent can't answer. The server says it is offline, or the agent said
 * something on its side is wrong: that is `cantAnswer`, from the directory, and it is known before
 * anybody writes. And the watch: a person's newest message to an agent, with nothing from that
 * agent in the room since, has waited `WATCH_MS`. That is `waitingOn`, from the room itself, and
 * it catches whatever nobody reported, a swallowed message included.
 */

import { type Directory, harnessOf, isRemoved, nameOf } from "./events.js";
import { harnessesIn } from "./model/readers.js";
import type { Line, Space } from "./model/types.js";

/** How long a message may wait on an agent that seems fine before the room says it does. */
export const WATCH_MS = 30_000;

/**
 * How long the room says an agent's hand-off waits on another agent (ADR 0291): the hour in which
 * Chips looks for it and hands it on. After that it is the room's history, as every such message
 * was before, and as it stays with a Chips too old to hand anything on.
 */
export const HAND_OFF_WATCH_MS = 60 * 60 * 1000;

/** Why an agent can't answer now. */
export interface CantAnswer {
  readonly kind: "offline" | "trouble" | "restarting";
  /** What the agent said is wrong, in its own words. */
  readonly reason?: string | undefined;
  /** Since when. Absent for an agent that has never connected. */
  readonly since?: string | undefined;
  /** For one restarting (ADR 0094): the person who asked. */
  readonly by?: string | undefined;
}

/**
 * Why an agent can't answer now, or nothing when it can, or when nothing says. A harness removed
 * from the workspace is not coming, and is nothing here: every list leaves it out already.
 */
export function cantAnswer(directory: Directory, id: string): CantAnswer | undefined {
  const agent = directory[id];
  if (agent === undefined || agent.kind === "person" || isRemoved(directory, id)) return undefined;
  // An agent answers when its harness can (ADR 0087): its connection is the harness's.
  const harness = directory[harnessOf(directory, id)];
  if (harness !== undefined && isRemoved(directory, harness.id)) return undefined;
  // Never connected: its token has never been used, so there is no since to give.
  const never = harness?.lastSeenAt === null;
  const state = agent.state;
  if (state === undefined) return never ? { kind: "offline" } : undefined;
  // Asked to restart (ADR 0094): that says more than the offline on its way back.
  if (state.restarting !== undefined) {
    return { kind: "restarting", since: state.restarting.since, by: state.restarting.by };
  }
  if (!state.connected)
    return never ? { kind: "offline" } : { kind: "offline", since: state.since };
  if (state.trouble === undefined) return undefined;
  return { kind: "trouble", reason: state.trouble.reason, since: state.trouble.since };
}

/** The agents in a room that can't answer now, in the order they joined it. */
export function cantAnswerIn(space: Space, directory: Directory): string[] {
  return harnessesIn(space, directory).filter((id) => cantAnswer(directory, id) !== undefined);
}

/** What a room's header adds while some of its agents can't answer: "1 can't answer". */
export function cantAnswerWords(count: number): string | undefined {
  return count === 0 ? undefined : `${count} can't answer`;
}

/** A message an agent hasn't picked up yet. */
export interface Waiting {
  /** The message: the newest to the agent, a person's or another agent's (ADR 0291). */
  readonly lineId: string;
  readonly harnessId: string;
  /** When it was sent. */
  readonly since: string;
  /** Another agent sent it, not a person: the room says it waits for an hour, and no longer. */
  readonly byAgent?: true | undefined;
}

/**
 * The messages the room's agents haven't picked up: for each agent, the newest message addressed
 * to it, when nothing from the agent in the room follows it: no line of its, no run of its whose
 * last event is later, and no turn it passed with `NO_REPLY` (ADR 0105). The newest message only,
 * so a room never shows a column of them; and only a message the server has, since the wait
 * starts when it arrives.
 *
 * A person's message, and since ADR 0291 another agent's too: work an agent handed to one whose
 * harness was down sat in the room with nothing to say so. Once Chips has handed such a message
 * on (`passedOn`), the room no longer waits on that agent for it: its line says who took it.
 */
export function waitingOn(space: Space, directory: Directory): Waiting[] {
  return harnessesIn(space, directory).flatMap((harnessId) => {
    const asked = space.lines.findLast((line) => askedOf(line, harnessId));
    if (asked === undefined) return [];
    const heard =
      asked.passedOn?.includes(harnessId) === true ||
      space.lines.some((line) => line.authorId === harnessId && line.seq > asked.seq) ||
      space.runs.some((run) => run.harnessId === harnessId && run.lastSeq > asked.seq) ||
      (space.passed?.[harnessId] ?? 0) > asked.seq;
    if (heard) return [];
    const byAgent = asked.authorKind === "person" ? {} : { byAgent: true as const };
    return [{ lineId: asked.id, harnessId, since: asked.ts, ...byAgent }];
  });
}

function askedOf(line: Line, harnessId: string): boolean {
  return (
    line.kind === "text" &&
    // Chips's own lines and an agent's held words are for nobody.
    (line.authorKind === "person" ||
      (line.authorKind !== "system" && line.authorId !== harnessId && line.held !== true)) &&
    line.pending !== true &&
    (line.addressedTo ?? []).includes(harnessId)
  );
}

/** What the room says under a waiting message: a title, how long, and why when it is known. */
export interface WaitWords {
  readonly title: string;
  /** How long it has waited, for a wait nobody has explained: "40s". */
  readonly waited?: string | undefined;
  /** Why, when the agent can't answer: "Can't reach its gateway · since 6:12 PM". */
  readonly why?: string | undefined;
  /** True when the room knows the agent can't answer; the line is marked as a warning. */
  readonly known: boolean;
}

/**
 * The words under a waiting message, or nothing yet. An agent known to be unable to answer is
 * said at once, and why; one that seems fine only once the message has waited `WATCH_MS`.
 */
export function waitWords(
  wait: Waiting,
  directory: Directory,
  now: number,
  clock: (iso: string, now: number) => string = clockOf,
): WaitWords | undefined {
  const name = nameOf(directory, wait.harnessId);
  const why = cantAnswer(directory, wait.harnessId);
  // An agent's hand-off from long ago is the room's history, not something it still waits on.
  if (wait.byAgent === true && now - Date.parse(wait.since) > HAND_OFF_WATCH_MS) return undefined;
  if (why !== undefined) {
    return { title: `${name} can't answer yet`, why: whyWords(why, now, clock), known: true };
  }
  const waited = now - Date.parse(wait.since);
  if (!(waited >= WATCH_MS)) return undefined;
  return { title: `${name} hasn't picked this up`, waited: agoWords(waited), known: false };
}

/**
 * Why an agent can't answer, in a line: "Can't reach its gateway · since 6:12 PM",
 * "Offline · since 6:12 PM", "Restarting · since 8:31 AM", "Never connected".
 */
export function whyWords(
  why: CantAnswer,
  now: number,
  clock: (iso: string, now: number) => string = clockOf,
): string {
  if (why.kind === "offline" && why.since === undefined) return "Never connected";
  const what =
    why.kind === "trouble"
      ? (why.reason ?? "In trouble")
      : why.kind === "restarting"
        ? "Restarting"
        : "Offline";
  return why.since === undefined ? what : `${what} · since ${clock(why.since, now)}`;
}

/**
 * That a harness is there now, and since when: "Connected · since 8:02 AM", which its page's head
 * says where it once said how its last run ended (ADR 0254). Nothing while it can't answer, which
 * `agentStateWords` says instead, and nothing from a server that keeps no state for it.
 */
export function connectedWords(
  directory: Directory,
  id: string,
  now: number,
  clock: (iso: string, now: number) => string = clockOf,
): string | undefined {
  const state = directory[id]?.state;
  if (state?.connected !== true || cantAnswer(directory, id) !== undefined) return undefined;
  return `Connected · since ${clock(state.since, now)}`;
}

/**
 * An agent's state, for its row on the Harnesses tab: why it can't answer and for how long, or
 * nothing when it can. "Can't reach its gateway · 23 min", "Offline · since 6:12 PM",
 * "Restarting · asked by you 8:31 AM" — `selfId` is who is reading, for the "you".
 */
export function agentStateWords(
  directory: Directory,
  id: string,
  now: number,
  clock: (iso: string, now: number) => string = clockOf,
  selfId?: string,
): string | undefined {
  const why = cantAnswer(directory, id);
  if (why === undefined) return undefined;
  if (why.kind === "offline") return whyWords(why, now, clock);
  if (why.kind === "restarting") {
    const who =
      why.by === undefined ? "" : ` by ${why.by === selfId ? "you" : nameOf(directory, why.by)}`;
    return why.since === undefined
      ? "Restarting"
      : `Restarting · asked${who} ${clock(why.since, now)}`;
  }
  const what = why.reason ?? "In trouble";
  return why.since === undefined ? what : `${what} · ${agoWords(now - Date.parse(why.since))}`;
}

/** How long, briefly: "40s", "3 min", "2 h", "3 d". Under a minute, to the ten seconds. */
export function agoWords(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${Math.floor(seconds / 10) * 10}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

/** When, on a clock: "6:12 PM" today, "Sep 27" before. In the reader's own time zone. */
export function clockOf(iso: string, now: number): string {
  const at = new Date(iso);
  const today = new Date(now);
  const sameDay = at.toDateString() === today.toDateString();
  return sameDay
    ? at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : at.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
