/**
 * Fork (ADR 0087, Phase 6), as the clients read it: whether a person may ask for a copy of an
 * agent, what the room's line says while it waits, once the copy joins, and when the harness
 * didn't make it, and what a copy is called. In core so the phone and the desktop offer Fork in
 * the same places and say the same words.
 *
 * - **Who may.** Who may move the agent (point 4), for an agent in a room whose harness declares
 *   `forks` (rule 3.12). Never the Main agent, an archived agent or a free one.
 * - **The line.** The ask is a line in the room the copy is for. It waits for `FORK_WAIT_MS` from
 *   the ask, timed here as the server times it, so nothing about the wait is stored: the copy
 *   joining answers it, and after the minute its harness didn't make the copy.
 * - **The name.** A copy is called what its harness calls it. While that is the original's name,
 *   it is *Shopping · fork*, so the two are told apart in a list and in a room.
 */

import { FORK_WAIT_MS, HARNESS_CAPABILITIES, isFormOf } from "@chipschat/protocol";
import { type Directory, harnessOf, nameOf, type Participant } from "./events.js";
import type { Line, Space, WorkspaceModel } from "./model/types.js";
import { mayMove } from "./rooms.js";

/** What a copy is called while its harness calls it what the original is called. */
export const FORK_SUFFIX = " · fork";

/**
 * The directory with each copy that has its original's name called *Shopping · fork*. Chips
 * numbers a copy whose name is its original's (ADR 0091), so *Shopping 2* is one too, and so is
 * *Shopping 3* beside an original called *Shopping 2*. A copy its harness named for itself keeps
 * that name.
 */
export function withForkNames(directory: Directory): Directory {
  const renamed = Object.values(directory).flatMap((each): [string, Participant][] => {
    const original = each.forkedFrom === undefined ? undefined : directory[each.forkedFrom];
    if (original === undefined || !namedAfter(each.displayName, original.displayName)) return [];
    return [[each.id, { ...each, displayName: `${each.displayName}${FORK_SUFFIX}` }]];
  });
  return renamed.length === 0 ? directory : { ...directory, ...Object.fromEntries(renamed) };
}

/** Whether a copy's name is its original's, numbered or not: the name Chips gave it. */
function namedAfter(copy: string, original: string): boolean {
  const family = original.trim().replace(/\s+[1-9]\d*$/, "");
  return isFormOf(copy, original) || isFormOf(copy, family);
}

/**
 * What a new room for a copy is called: the name its harness will likely give the copy, the first
 * of `Shopping · fork`, `Shopping · fork 2`… no agent of that harness has yet, as Jacobian numbers
 * its copies. Only a room's title: the copy is called what its harness calls it.
 */
export function forkRoomTitle(directory: Directory, agentId: string): string {
  const base = nameOf(directory, agentId).replace(/ · fork( \d+)?$/, "");
  const harness = harnessOf(directory, agentId);
  const taken = new Set(
    Object.values(directory)
      .filter((each) => each.kind === "agent" && each.harnessId === harness)
      .map((each) => each.displayName.toLowerCase()),
  );
  for (let n = 1; ; n += 1) {
    const title = `${base}${FORK_SUFFIX}${n === 1 ? "" : ` ${n}`}`;
    if (!taken.has(title.toLowerCase())) return title;
  }
}

/** Whether an agent's harness makes copies of its agents (rule 3.12). */
export function forks(directory: Directory, agentId: string): boolean {
  const harness = directory[harnessOf(directory, agentId)];
  return harness?.capabilities?.includes(HARNESS_CAPABILITIES.forks) === true;
}

/**
 * Whether this person may ask for a copy of this agent (ADR 0087, Fork and point 4): who may move
 * it, for an agent in a room whose harness makes copies.
 */
export function mayFork(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
  agentId: string,
): boolean {
  if (typeof directory[agentId]?.room !== "string") return false;
  return forks(directory, agentId) && mayMove(model, directory, selfId, agentId);
}

/** Whether Fork is offered for this agent into this room: never the room it is in. */
export function mayForkInto(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
  agentId: string,
  space: Space,
): boolean {
  if (space.state !== "open" || space.home === true || space.parentSpaceId !== undefined) {
    return false;
  }
  return directory[agentId]?.room !== space.id && mayFork(model, directory, selfId, agentId);
}

/** Where an ask stands: waiting for its copy, answered by one, or given up at the minute. */
export type ForkState =
  | { readonly state: "waiting" }
  | { readonly state: "joined"; readonly copyId: string }
  | { readonly state: "not_made" };

export function forkState(space: Space, line: Line, now: number): ForkState {
  const copyId = space.forked?.[line.id];
  if (copyId !== undefined) return { state: "joined", copyId };
  return now - Date.parse(line.ts) < FORK_WAIT_MS ? { state: "waiting" } : { state: "not_made" };
}

/** The ask's line, as both clients draw it. */
export interface ForkWords {
  readonly state: ForkState["state"];
  /** `Forking Shopping…`, `Shopping · fork joined`, or `Jacobian didn't make the copy`. */
  readonly title: string;
  /** The words under it; a client adds the ask's time to the waiting and joined ones. */
  readonly sub: string;
  /** The copy, once it joined: its face is on the line. */
  readonly copyId?: string | undefined;
  /** The agent asked for, to ask again with. */
  readonly agentId: string;
  /** Whether this reader may ask again, once the harness didn't make it. */
  readonly retry: boolean;
}

export function forkWords(
  model: WorkspaceModel,
  space: Space,
  line: Line,
  directory: Directory,
  selfId: string,
  now: number,
): ForkWords | undefined {
  const agentId = line.fork?.agentId;
  if (agentId === undefined) return undefined;
  const original = nameOf(directory, agentId);
  const harness = nameOf(directory, harnessOf(directory, agentId));
  const at = forkState(space, line, now);
  if (at.state === "joined") {
    return {
      state: "joined",
      title: `${nameOf(directory, at.copyId)} joined`,
      sub: `A copy of ${original}`,
      copyId: at.copyId,
      agentId,
      retry: false,
    };
  }
  if (at.state === "waiting") {
    const who = line.authorId === selfId ? "You" : nameOf(directory, line.authorId);
    return {
      state: "waiting",
      title: `Forking ${original}…`,
      sub: `${who} asked ${harness} for a copy`,
      agentId,
      retry: false,
    };
  }
  return {
    state: "not_made",
    title: `${harness} didn't make the copy`,
    sub: `No copy in a minute. ${original} is as it was.`,
    agentId,
    retry: space.state === "open" && mayForkInto(model, directory, selfId, agentId, space),
  };
}

/** Whether any ask in a room still waits, so a client keeps its clock going. */
export function forkWaiting(space: Space, now: number): boolean {
  return space.lines.some(
    (line) => line.fork !== undefined && forkState(space, line, now).state === "waiting",
  );
}

/** The agent a copy was forked from, by name, for its card and the head of its history. */
export function forkedFrom(
  directory: Directory,
  agentId: string,
): { readonly agentId: string; readonly name: string } | undefined {
  const from = directory[agentId]?.forkedFrom;
  return from === undefined ? undefined : { agentId: from, name: nameOf(directory, from) };
}
