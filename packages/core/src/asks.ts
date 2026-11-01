/**
 * A new agent in a room (ADR 0108), as the clients read it: which harnesses a person may ask for
 * one here, what it is called when they leave the name empty, what the room's line says while it
 * waits, once the agent joins, and when the harness didn't make it, and the @ the asker's field
 * holds once it is here. In core so the phone and the desktop offer the same harnesses and say the
 * same words.
 *
 * - **Who may.** Who may fork (ADR 0087, point 4): the harness's owner, or an owner or admin of the
 *   workspace, in a room they are in and not as a guest, of a harness that declares `new_agents`.
 *   Never into a Main room, a closed room or a thread.
 * - **The name.** What the person types, or else the harness's name numbered to the first nobody
 *   here answers to (ADR 0091), as the server names it: *Jacobian 2*.
 * - **The line.** The ask is a line in the room. It waits for `NEW_AGENT_WAIT_MS` from the ask,
 *   timed here as the server times it: the agent joining answers it, and after the minute its
 *   harness didn't make it.
 */

import {
  clashKey,
  freeAgentName,
  HARNESS_CAPABILITIES,
  NEW_AGENT_WAIT_MS,
  nameProblem,
  notAnAgentName,
  noteHandle,
} from "@chipschat/protocol";
import { type Directory, nameOf, type Participant } from "./events.js";
import { administers, myRole } from "./model/readers.js";
import type { Line, Space, WorkspaceModel } from "./model/types.js";

/** Whether a harness makes new agents for a room when asked (ADR 0108). */
export function makesNewAgents(directory: Directory, harnessId: string): boolean {
  const harness = directory[harnessId];
  return (
    harness?.kind === "harness" &&
    harness.removedAt === undefined &&
    harness.capabilities?.includes(HARNESS_CAPABILITIES.newAgents) === true
  );
}

/**
 * The harnesses this person may ask for a new agent in this room, in the directory's order: none
 * in a Main room, a closed room or a thread, or for a guest.
 */
export function newAgentHarnesses(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
  space: Space,
): Participant[] {
  if (space.state !== "open" || space.home === true || space.parentSpaceId !== undefined) {
    return [];
  }
  const role = myRole(model, selfId);
  if (role === "guest" || space.roles[selfId] === "guest") return [];
  return Object.values(directory).filter(
    (each) => makesNewAgents(directory, each.id) && (each.ownerId === selfId || administers(role)),
  );
}

/** The names nobody else may be given here: every person's, and every agent's but an archived one. */
function takenNames(directory: Directory): Set<string> {
  return new Set(
    Object.values(directory)
      .filter(
        (each) =>
          each.removedAt === undefined &&
          (each.kind === "person" || (each.kind === "agent" && each.archived !== true)),
      )
      .map((each) => clashKey(each.displayName)),
  );
}

/**
 * What a new agent of this harness is called when the person leaves the name empty, or, given a
 * name, what it will be: the name numbered to the first nobody here answers to (ADR 0091).
 */
export function newAgentName(directory: Directory, harnessId: string, typed = ""): string {
  const wanted = typed.trim() === "" ? nameOf(directory, harnessId) : typed.trim();
  return freeAgentName(wanted, takenNames(directory));
}

/**
 * Why a name typed for a new agent can't be had, or moves to `name`, or nothing when it is had as
 * typed: a hidden character or mixed letters, which the server refuses (SEC-33), Main or You, which
 * no agent is called, or a name somebody here has (ADR 0091).
 */
function typedNameHint(typed: string, name: string): string | undefined {
  const asked = typed.trim();
  if (asked === "") return undefined;
  const problem = nameProblem(asked);
  if (problem !== undefined) return problem;
  if (clashKey(name) === clashKey(asked)) return undefined;
  if (notAnAgentName(asked)) return `An agent can't be called Main or You, so it will be ${name}.`;
  return `${asked} is taken here, so it will be ${name}.`;
}

/**
 * What the field under the name says (ADR 0108): who the agent will be when it is left empty, why a
 * name typed can't be had or what it will be instead, or what the name is for.
 */
export function newAgentHint(directory: Directory, harnessId: string, typed: string): string {
  const name = newAgentName(directory, harnessId, typed);
  if (typed.trim() === "") return `Left empty, it's ${name}.`;
  return typedNameHint(typed, name) ?? "What everyone here will @ it by.";
}

/**
 * Whether this person may ask a harness for a new agent from the harness's page, in a space of its
 * own (ADR 0190, point 4), of a harness that makes them. The ask opens that space, so it is for
 * whoever may open one: an owner or an admin of the workspace (ADR 0196). A member who owns the
 * harness asks for one in a room they are in (ADR 0108, point 4).
 */
export function mayAskFromPage(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
  harnessId: string,
): boolean {
  if (!makesNewAgents(directory, harnessId)) return false;
  return administers(myRole(model, selfId));
}

/**
 * A new agent's name from a harness's page: what the person typed, numbered where it is taken
 * (ADR 0091), or else the first name offered them (ADR 0150), which nobody here has.
 */
export function pageAgentName(
  directory: Directory,
  harnessId: string,
  typed: string,
  offered: string,
): string {
  return typed.trim() === "" ? offered : newAgentName(directory, harnessId, typed);
}

/** The line under the name on a harness's page: where the agent starts, or why its name moved. */
export function pageAgentHint(
  directory: Directory,
  harnessId: string,
  typed: string,
  offered: string,
): string {
  const name = pageAgentName(directory, harnessId, typed, offered);
  return typedNameHint(typed, name) ?? `It starts in a space of its own, called ${name}.`;
}

/** Where an ask stands: waiting for its agent, answered by one, or given up at the minute. */
export type AskState =
  | { readonly state: "waiting" }
  | { readonly state: "joined"; readonly agentId: string }
  | { readonly state: "not_made" };

export function askState(space: Space, line: Line, now: number): AskState {
  const agentId = space.made?.[line.id];
  if (agentId !== undefined) return { state: "joined", agentId };
  return now - Date.parse(line.ts) < NEW_AGENT_WAIT_MS
    ? { state: "waiting" }
    : { state: "not_made" };
}

/** The ask's line, as both clients draw it. */
export interface AskWords {
  readonly state: AskState["state"];
  /** `Asking Jacobian for Reviewer…`, `Reviewer joined`, or `Jacobian didn't make Reviewer`. */
  readonly title: string;
  /** The words under it; a client adds the ask's time to the waiting and joined ones. */
  readonly sub: string;
  /** The agent, once it joined: its face is on the line. */
  readonly agentId?: string | undefined;
  /** The harness asked, and the name asked for, to ask again with. */
  readonly harnessId: string;
  readonly name: string;
  /** Whether this reader may ask again, once the harness didn't make it. */
  readonly retry: boolean;
}

export function askWords(
  model: WorkspaceModel,
  space: Space,
  line: Line,
  directory: Directory,
  selfId: string,
  now: number,
): AskWords | undefined {
  const asked = line.newAgent;
  if (asked === undefined) return undefined;
  const { harnessId, name } = asked;
  const harness = nameOf(directory, harnessId);
  const at = askState(space, line, now);
  if (at.state === "joined") {
    return {
      state: "joined",
      title: `${nameOf(directory, at.agentId)} joined`,
      sub: `New in ${harness}, made for this space`,
      agentId: at.agentId,
      harnessId,
      name,
      retry: false,
    };
  }
  if (at.state === "waiting") {
    const who = line.authorId === selfId ? "You" : nameOf(directory, line.authorId);
    return {
      state: "waiting",
      title: `Asking ${harness} for ${name}…`,
      sub: `${who} asked for a new agent`,
      harnessId,
      name,
      retry: false,
    };
  }
  return {
    state: "not_made",
    title: `${harness} didn't make ${name}`,
    sub: "No agent came in a minute. Nothing was added.",
    harnessId,
    name,
    retry: newAgentHarnesses(model, directory, selfId, space).some((each) => each.id === harnessId),
  };
}

/** Whether any ask for a new agent in a room still waits, so a client keeps its clock going. */
export function askWaiting(space: Space, now: number): boolean {
  return space.lines.some(
    (line) => line.newAgent !== undefined && askState(space, line, now).state === "waiting",
  );
}

/**
 * The @ that reaches an agent in this room, as the room note gives it (ADR 0092): its whole name
 * without spaces, or its first word where that is its alone. What the asker's field holds once the
 * agent they asked for joins, ready for its first job.
 */
export function handleIn(space: Space, directory: Directory, agentId: string): string | undefined {
  const members = space.members.map((id) => ({
    id,
    kind: directory[id]?.kind === "person" ? ("person" as const) : ("agent" as const),
    name: nameOf(directory, id),
  }));
  const member = members.find((each) => each.id === agentId);
  return member === undefined ? undefined : noteHandle(member, members);
}
