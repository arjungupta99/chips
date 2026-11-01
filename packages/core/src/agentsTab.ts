/**
 * The Agents tab (ADR 0087, Phase 5): every agent with a row, a card, and a message history. In
 * core so the phone and the desktop list the same agents in the same order and say the same
 * words about them.
 *
 * The history is the rooms an agent has been in, oldest first, from the server
 * (`GET /v1/agents/:id/stays`), each drawn from the lines of that room this client already holds:
 * what the agent said, what was addressed to it, and what people said to the room before Chips
 * said who a message is for (ADR 0081). A room the reader is not in is its dates and a count.
 */

import type { SpaceIcon } from "@chipschat/protocol";
import {
  belongsTo,
  type Directory,
  harnessOf,
  isRemoved,
  nameOf,
  type Participant,
} from "./events.js";
import { FORK_SUFFIX, forkedFrom, mayFork } from "./forks.js";
import { administers, myRole, spaceById } from "./model/readers.js";
import type { Lane, Line, Space, WorkspaceModel } from "./model/types.js";
import { agentLocked, mayKeepAgent, mayLockAgent } from "./putAway.js";
import { mayFace, mayMove, roomName, showsAgent } from "./rooms.js";

/** What an agent is doing now, from the runs by it in its room: the ring on its face. */
export type AgentDoing = "idle" | "working" | "waiting";

/** One agent's row on the tab. */
export interface AgentRow {
  readonly id: string;
  readonly name: string;
  readonly harnessId: string;
  /** The words under its name: its harness, and where it is when its room isn't named after it. */
  readonly line: string;
  /** When its room last spoke, for the right of the row; absent for a room this reader can't see. */
  readonly at?: string | undefined;
  readonly lead: boolean;
  readonly archived: boolean;
  /** In no room (rule 4): an archive freed it, or it was taken out, or it has never been in one. */
  readonly free: boolean;
  /** How many of its words wait for its next room (rule 6): *1 waiting*. */
  readonly held: number;
  readonly doing: AgentDoing;
  /** The face a person chose for it (ADR 0089); absent while it wears its initials. */
  readonly face?: SpaceIcon | undefined;
}

/** The tab, in its order: the Main agents, the agents, the archived ones, and the harnesses. */
export interface AgentsTab {
  readonly leads: readonly AgentRow[];
  /** Free ones first, since they want a room, then by when their room last spoke. */
  readonly agents: readonly AgentRow[];
  readonly archived: {
    /** Archived agents whose last room this reader can read: their histories have lines. */
    readonly here: readonly AgentRow[];
    /** Archived agents whose rooms this reader isn't in: their histories are counts. */
    readonly elsewhere: readonly AgentRow[];
  };
  /** The harnesses, by name, not one that was removed. */
  readonly harnesses: readonly Participant[];
}

/** Whether an agent belongs on the tab: an agent, and neither it nor its harness removed. */
function listed(directory: Directory, each: Participant): boolean {
  return (
    each.kind === "agent" &&
    !isRemoved(directory, each.id) &&
    !isRemoved(directory, harnessOf(directory, each.id))
  );
}

/** The participants of some ids the directory knows. */
function agentsIn(directory: Directory, ids: ReadonlySet<string>): Participant[] {
  return Array.from(ids, (id) => directory[id]).filter((each) => each !== undefined);
}

/** The room an agent is in now, or the one it was last in while archived or free. */
function roomOf(agent: Participant): string | undefined {
  if (typeof agent.room === "string") return agent.room;
  return agent.releasedFrom ?? agent.lastRoom ?? undefined;
}

/**
 * A room this reader can read: one they are a member of. The model can hold a room by an id it
 * has only heard named — the room an agent is in, which the reader left (Scout's PO-4471, which
 * Arjun left on 5 September) — with no title and nothing in it; that one is a room they're not in.
 */
function readableIn(
  model: WorkspaceModel,
  selfId: string,
  spaceId: string | undefined,
): Space | undefined {
  const space = spaceIn(model, spaceId);
  return space?.members.includes(selfId) === true ? space : undefined;
}

function spaceIn(model: WorkspaceModel, spaceId: string | undefined): Space | undefined {
  return spaceId === undefined ? undefined : spaceById(model, spaceId);
}

/**
 * What an agent is doing in its room: its newest run there, as the room's own bubble reads it.
 * Any run of its that had not ended used to count, so one left going by an agent that was taken
 * out of the room before its work was stopped read as Working for ever (agents review, finding
 * 12). The server ends such runs now; a run older than the agent's newest says nothing either way.
 */
export function agentDoing(model: WorkspaceModel, agentId: string, spaceId?: string): AgentDoing {
  const newest = spaceIn(model, spaceId)?.runs.findLast((run) => run.harnessId === agentId);
  if (newest?.state === "waiting") return "waiting";
  return newest?.state === "running" || newest?.state === "queued" ? "working" : "idle";
}

/**
 * What an agent is, said under its name: its harness, or to a guest, whose it is, `Arjun's agent`
 * (ADR 0196). A guest runs no harness and is never shown one, so its name told them nothing; the
 * person whose agent it is does. Its harness still, where Chips doesn't know whose it is.
 */
export function agentByline(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
  agentId: string,
): string {
  const harness = nameOf(directory, harnessOf(directory, agentId));
  if (myRole(model, selfId) !== "guest") return harness;
  const owner = belongsTo(directory, agentId, selfId);
  return owner === undefined ? harness : `${owner}'s agent`;
}

/**
 * What an agent is, under its name on a room's details (ADR 0234): whose it is, where that is
 * somebody else, and then its harness, `Dana's agent · Hermes`, for whoever reads it. A guest is
 * never shown a harness, so to a guest whose it is alone (`agentByline`); its harness alone where
 * it is the reader's, or Chips doesn't know whose.
 */
export function roomByline(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
  agentId: string,
): string {
  const byline = agentByline(model, directory, selfId, agentId);
  const owner = belongsTo(directory, agentId, selfId);
  if (owner === undefined || myRole(model, selfId) === "guest") return byline;
  return `${owner}'s agent · ${byline}`;
}

/**
 * Where an agent is, in a few words under its name: `Free · Jacobian`, `OpenClaw · in Hello`,
 * `OpenClaw · with you`, `Scout · in a room you're not in`, or just its harness when its room is
 * named after it, as a Space's room is. The Main agent's says where it is too (`Jacobian · in
 * Jacobian main`): its row wears the Main tag (ADR 0145), which says what this line used to. A
 * guest's says whose it is in its harness's place (`agentByline`): `Arjun's agent · in Japan trip`.
 */
export function agentLine(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
  agentId: string,
): string {
  const agent = directory[agentId];
  const harness = agentByline(model, directory, selfId, agentId);
  if (agent === undefined) return harness;
  if (agent.archived !== true && agent.room === null) return `Free · ${harness}`;
  const spaceId = roomOf(agent);
  if (spaceId === undefined) return harness;
  const space = readableIn(model, selfId, spaceId);
  const was = agent.archived === true ? "was in" : "in";
  if (space === undefined) return `${harness} · ${was} a space you're not in`;
  if (space.title === agent.displayName) return harness;
  const alone = space.members.filter((id) => directory[id]?.kind === "agent").length <= 1;
  if (space.title === undefined && alone && space.members.includes(selfId)) {
    return `${harness} · with you`;
  }
  return `${harness} · ${was} ${roomName(model, spaceId, directory)}`;
}

function rowOf(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
  agent: Participant,
): AgentRow {
  const spaceId = roomOf(agent);
  return {
    id: agent.id,
    name: agent.displayName,
    harnessId: harnessOf(directory, agent.id),
    line: agentLine(model, directory, selfId, agent.id),
    at: readableIn(model, selfId, spaceId)?.lastActivityAt,
    lead: agent.lead === true,
    archived: agent.archived === true,
    free: agent.archived !== true && agent.room === null,
    held: agent.held ?? 0,
    doing: typeof agent.room === "string" ? agentDoing(model, agent.id, agent.room) : "idle",
    ...(agent.face === undefined ? {} : { face: agent.face }),
  };
}

/** Newest first; a room this reader can't see has no time, and goes last. */
const byRecent = (a: AgentRow, b: AgentRow) =>
  (b.at ?? "").localeCompare(a.at ?? "") || a.name.localeCompare(b.name);

/**
 * The tab's sections, or one harness's agents for its page, or only some agents in the tab's
 * order, as search lists the ones it found. The agents run in the order of their rooms' last
 * line, as Spaces does, with the free ones first.
 */
export function agentsTab(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
  options: {
    readonly harnessId?: string | undefined;
    /** Only these agents: a row is drawn for each, so search draws the ones it found alone. */
    readonly only?: ReadonlySet<string> | undefined;
  } = {},
): AgentsTab {
  // A member or guest is shown the agents with them, and their own (ADR 0034's addendum).
  const shown = (each: Participant) => showsAgent(model, directory, selfId, each.id);
  const rows = (
    options.only === undefined ? Object.values(directory) : agentsIn(directory, options.only)
  )
    .filter((each) => listed(directory, each) && shown(each))
    .filter((each) => options.harnessId === undefined || each.harnessId === options.harnessId)
    .map((each) => rowOf(model, directory, selfId, each));
  const archived = rows.filter((row) => row.archived).sort(byRecent);
  const active = rows.filter((row) => !row.archived);
  return {
    leads: active.filter((row) => row.lead).sort(byRecent),
    agents: active
      .filter((row) => !row.lead)
      .sort((a, b) => Number(b.free) - Number(a.free) || byRecent(a, b)),
    archived: {
      here: archived.filter((row) => row.at !== undefined),
      elsewhere: archived.filter((row) => row.at === undefined),
    },
    harnesses: Object.values(directory)
      .filter((each) => each.kind === "harness" && !isRemoved(directory, each.id))
      .filter((each) => options.harnessId === undefined || each.id === options.harnessId)
      .filter((each) => showsHarness(model, directory, selfId, each.id))
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
  };
}

/**
 * Whether the tab shows a harness: to whoever is shown every agent, every one; to anybody else, one
 * they own, or one with an agent they are shown (ADR 0034's addendum). Naming the harness behind
 * an agent the server named for a room's history is not a reason to list it.
 */
function showsHarness(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
  harnessId: string,
): boolean {
  const role = myRole(model, selfId);
  if (role === undefined || administers(role)) return true;
  if (directory[harnessId]?.ownerId === selfId) return true;
  return Object.values(directory).some(
    (each) =>
      each.kind === "agent" &&
      each.harnessId === harnessId &&
      showsAgent(model, directory, selfId, each.id),
  );
}

/**
 * The line under a guest's agents (ADR 0196): whose they are, and where they answer, `Jacobian is
 * Arjun's agent and answers in Japan trip.` A guest sees only the agents in their one space, all
 * somebody else's, and nothing on the tab said so. Nothing for anybody else, or where Chips doesn't
 * know whose an agent is: its row says its harness then, and so the line would be wrong.
 */
export function guestAgentsWords(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
  tab: AgentsTab,
): string | undefined {
  if (myRole(model, selfId) !== "guest") return undefined;
  const rows = [...tab.leads, ...tab.agents];
  const owners = rows.map((row) => belongsTo(directory, row.id, selfId));
  if (rows.length === 0 || owners.some((owner) => owner === undefined)) return undefined;
  const named = [...new Set(owners)].map((owner) => `${owner}'s`);
  const whose =
    named.length === 1 ? named[0] : `${named.slice(0, -1).join(", ")} and ${named.at(-1)}`;
  const rooms = new Set(rows.map((row) => directory[row.id]?.room));
  const [only] = rooms;
  const where =
    rooms.size === 1 && typeof only === "string" && readableIn(model, selfId, only) !== undefined
      ? roomName(model, only, directory)
      : undefined;
  const [one] = rows;
  if (rows.length === 1 && one !== undefined) {
    const said = `${one.name} is ${whose} agent`;
    return where === undefined ? `${said}.` : `${said} and answers in ${where}.`;
  }
  const said = `They're ${whose} agents`;
  return where === undefined ? `${said}.` : `${said} and answer in ${where}.`;
}

/** A room an agent has been in, as the server says it (`GET /v1/agents/:id/stays`). */
export interface AgentStay {
  /** Whether this reader is in the room: then it is named, and drawn from its lines here. */
  readonly readable: boolean;
  readonly spaceId?: string | undefined;
  readonly fromSeq?: number | undefined;
  /** `null` while the agent is still there. */
  readonly toSeq?: number | null | undefined;
  readonly from: string;
  readonly to: string | null;
  /** How many lines of its history the stay holds; what a room the reader isn't in shows. */
  readonly lines: number;
}

/** A stretch of the history under its divider. */
export type Stretch =
  | {
      readonly kind: "room";
      readonly spaceId: string;
      readonly name: string;
      readonly from: string;
      readonly to: string | null;
      /** The room the agent is in now: its divider says *now*. */
      readonly now: boolean;
      readonly archived: boolean;
      readonly lines: readonly Line[];
    }
  | {
      /** A room the reader isn't in: no name, the dates, and how many lines. */
      readonly kind: "away";
      readonly from: string;
      readonly to: string | null;
      readonly count: number;
    };

/** Whether a line of a room is in an agent's history. */
function isTheirs(line: Line, agentId: string, lanes: readonly Lane[]): boolean {
  if (line.kind === "system" || line.kind === "checkpoint") return false;
  if (line.kind === "route" || line.kind === "task") {
    const lane = lanes.find((each) => each.laneId === line.laneId);
    return lane !== undefined && (lane.leadId === agentId || lane.specialistId === agentId);
  }
  if (line.authorId === agentId) return true;
  if (line.addressedTo !== undefined) return line.addressedTo.includes(agentId);
  // Before Chips said who a message is for (ADR 0081), a person spoke to the room's agents.
  return line.authorKind === "person";
}

/**
 * An agent's message history (rule 3.11), oldest first: a stretch per room it has been in, each
 * the lines of its own in that room's history here. A room the server named but this client
 * doesn't hold yet reads as one the reader isn't in.
 */
export function agentHistory(
  model: WorkspaceModel,
  directory: Directory,
  agentId: string,
  stays: readonly AgentStay[],
): Stretch[] {
  const here = directory[agentId]?.room;
  return stays.map((stay): Stretch => {
    const space = stay.readable ? spaceIn(model, stay.spaceId) : undefined;
    if (space === undefined) {
      return { kind: "away", from: stay.from, to: stay.to, count: stay.lines };
    }
    const from = stay.fromSeq ?? 0;
    const to = stay.toSeq ?? null;
    return {
      kind: "room",
      spaceId: space.id,
      name: roomName(model, space.id, directory),
      from: stay.from,
      to: stay.to,
      now: stay.to === null && here === space.id,
      archived: space.state === "closed",
      lines: space.lines.filter(
        (line) =>
          line.seq >= from &&
          (to === null || line.seq <= to) &&
          isTheirs(line, agentId, model.lanes),
      ),
    };
  });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function day(at: Date, year: boolean): string {
  return `${at.getDate()} ${MONTHS[at.getMonth()]}${year ? ` ${at.getFullYear()}` : ""}`;
}

/**
 * A stretch's dates on its divider: `5–20 Sep`, `28 Sep – 2 Oct`, `30 Sep`, and `5 Sep –` with
 * `now` for one still going, which a client sets in italics after it. The year only when it
 * isn't this one.
 */
export function stretchDates(
  from: string,
  to: string | null,
  now: number = Date.now(),
): { readonly dates: string; readonly ongoing: boolean } {
  const start = new Date(from);
  const thisYear = new Date(now).getFullYear();
  if (to === null) {
    return { dates: `${day(start, start.getFullYear() !== thisYear)} –`, ongoing: true };
  }
  const end = new Date(to);
  const year = end.getFullYear() !== thisYear;
  if (start.toDateString() === end.toDateString()) return { dates: day(end, year), ongoing: false };
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return { dates: `${start.getDate()}–${day(end, year)}`, ongoing: false };
  }
  const startYear = start.getFullYear() !== end.getFullYear();
  return { dates: `${day(start, startYear)} – ${day(end, year)}`, ongoing: false };
}

/** What a room the reader isn't in says under its divider. */
export function awayWords(count: number): string {
  if (count === 0) return "Nothing of its in a space you're not in";
  return `${count} ${count === 1 ? "message" : "messages"} in a space you're not in`;
}

/** The count on a free agent's row: `1 waiting`. */
export function waitingWords(held: number): string | undefined {
  return held > 0 ? `${held} waiting` : undefined;
}

/** The fact on an agent's card that says since when it has been in its room, or when it was there. */
export interface StayFact {
  readonly word: "Since" | "Was there";
  /** `27 Sep`, `5–20 Sep`; undefined until the server has said. */
  readonly dates: string | undefined;
}

/**
 * The card's dates: its last stay in the room the card names, else its last anywhere, from the
 * server's stays (`GET /v1/agents/:id/stays`).
 *
 * The fact is the card's from its first frame whenever the card names a room, and the answer only
 * fills in the dates. Drawn once the answer came, it put itself between Room and Now just after the
 * card had opened, and everything after it moved (Arjun, 2 October 2026). Until the answer, an
 * agent in its room has been there since, and one archived or free was there. Nothing when the
 * server has answered with no stay to show, or could not answer (`asking` false, no stays).
 */
export function stayFact(
  card: AgentCard,
  stays: readonly AgentStay[] | undefined,
  asking: boolean,
  now: number = Date.now(),
): StayFact | undefined {
  const room = card.room;
  const last = stays?.filter((stay) => stay.spaceId === room?.spaceId).at(-1) ?? stays?.at(-1);
  const when = last === undefined ? undefined : stretchDates(last.from, last.to, now);
  if (when === undefined && !(asking && room !== undefined)) return undefined;
  const there = card.now !== "Archived" && card.now !== "Not in a space";
  return {
    word: (when?.ongoing ?? there) ? "Since" : "Was there",
    dates: when?.dates.replace(/ –$/, ""),
  };
}

/** What an agent's card says about it, and what it offers. */
export interface AgentCard {
  readonly name: string;
  /** Under the name: `Main agent · Jacobian`, `Jacobian · archived in Jacobian`, `Jacobian · free`. */
  readonly sub: string;
  /** The room it is in, or the one it was last in; absent when it has never been in one. */
  readonly room?:
    | {
        readonly spaceId: string;
        /** Its name, or `A room you're not in`, which opens nothing. */
        readonly name: string;
        readonly readable: boolean;
        readonly archived: boolean;
      }
    | undefined;
  /** `Working`, `Waiting on you`, `Idle`, `Archived`, or `In no room`. */
  readonly now: string;
  /** What it is doing in its room, for its face; idle when it is archived or in no room. */
  readonly doing: AgentDoing;
  readonly held: number;
  /** Under what waits: who said it, and where it goes (`heldNote`); absent while nothing waits. */
  readonly heldNote: string | undefined;
  /** The face a person chose for it (ADR 0089); absent while it wears its initials. */
  readonly face?: SpaceIcon | undefined;
  /** Change its face (ADR 0089): anybody's who is not a guest. */
  readonly mayFace: boolean;
  /**
   * Rename it (ADR 0091): anybody's who is not a guest, as its face is, while its changes are not
   * locked (ADR 0199).
   */
  readonly mayName: boolean;
  /**
   * Its name as it is called, which a rename starts from: `name` without the " · fork" a copy
   * wears on screen.
   */
  readonly ownName: string;
  /** Its harness's name: what it would be called again by, and what can no longer rename it. */
  readonly harnessName: string;
  /** Move it to another room (ADR 0087, point 4): its harness's owner's, or an owner's or admin's. */
  readonly mayMove: boolean;
  /** Ask its harness for a copy in another room (ADR 0087, Fork): as Move, where it forks. */
  readonly mayFork: boolean;
  /**
   * Archive it, and delete it (ADR 0095): its harness's owner's, or an owner's or admin's; never the
   * Main agent, and never while its changes are locked (ADR 0199).
   */
  readonly mayKeep: boolean;
  /**
   * Bring it back while it is archived (ADR 0095): the same people, locked or not, since that only
   * puts it back (ADR 0199, point 2).
   */
  readonly mayUnarchive: boolean;
  /** Lock its changes, or let them go (ADR 0199): the people who may archive or delete it. */
  readonly mayLock: boolean;
  /** Whether its changes are locked (ADR 0199): no rename, archive or delete. */
  readonly locked: boolean;
  /** Archived, in its harness or by a person: the card offers Unarchive in place of Archive. */
  readonly archived: boolean;
  /** The agent it is a copy of, for a fork's copy. */
  readonly forkedFrom?: { readonly agentId: string; readonly name: string } | undefined;
  /** What the foot of the card says, when there is something to explain. */
  readonly note?: string | undefined;
}

/** Where an agent stands, which decides what its card says. */
type Standing = "lead" | "archived" | "free" | "in";

function standingOf(agent: Participant | undefined): Standing {
  if (agent?.lead === true) return "lead";
  if (agent?.archived === true) return "archived";
  return agent?.room === null ? "free" : "in";
}

const SUBS: Readonly<Record<Standing, (harness: string) => string>> = {
  lead: (harness) => `Main agent · ${harness}`,
  archived: (harness) => `${harness} · archived`,
  free: (harness) => `${harness} · free`,
  in: (harness) => harness,
};

const DOING_WORDS: Readonly<Record<AgentDoing, string>> = {
  working: "Working",
  waiting: "Waiting on you",
  idle: "Idle",
};

/**
 * What the foot of the card says: where it stands, and, while its changes are locked, that they
 * are and who may let them go (ADR 0199).
 */
function noteOf(
  standing: Standing,
  name: string,
  harness: string,
  held: number,
  room: { readonly readable: boolean; readonly known: boolean },
  lock: { readonly mayLock: boolean; readonly locked: boolean },
): string | undefined {
  const where = whereNote(standing, name, harness, held, room, lock.mayLock);
  if (!lock.locked || standing === "lead") return where;
  const why = lock.mayLock
    ? "Changes are locked. Unlock them to rename, archive or delete it."
    : `Its changes are locked. ${harness}'s owner, or an owner or admin here, can unlock them.`;
  return where === undefined ? why : `${where} ${why}`;
}

function whereNote(
  standing: Standing,
  name: string,
  harness: string,
  held: number,
  room: { readonly readable: boolean; readonly known: boolean },
  mayKeep: boolean,
) {
  const { readable } = room;
  if (standing === "lead") {
    return `${name} lives in the Main space, so it isn't moved. People can join that space; other agents can't.`;
  }
  if (standing === "archived") {
    // Who may bring it back, when it isn't this reader (ADR 0095); where to, when it is. No room
    // to go back to when the one it was in was deleted (agents review, finding 11).
    if (!mayKeep) return `${harness}'s owner, or an owner or admin here, can unarchive it.`;
    return room.known
      ? "Unarchive puts it back in its space, unless the space has gone."
      : "Unarchive brings it back, free to join a space.";
  }
  // Said by what waits, when anything does (`heldNote`).
  if (standing === "free")
    return held === 0
      ? "What it says while it isn't in a space waits, and is said in the next space it's in."
      : undefined;
  return readable ? undefined : "You're not in its space. Someone in it can add you.";
}

/**
 * What the card says under what waits (rule 6): that the agent said it while in no room, and where
 * it goes. At the card's foot, under its context and its buttons, it was not found: "What is the
 * '1 waiting' label indicate" (Arjun, 19 October 2026). The foot no longer says it while this does.
 */
function heldNote(name: string, held: number): string | undefined {
  if (held === 0) return undefined;
  return held === 1
    ? `${name} said this while it wasn't in a space. It's posted in the space it joins next.`
    : `${name} said these while it wasn't in a space. They're posted in the space it joins next.`;
}

/** What an agent is doing, and the word for it: its room's runs, or that it is in none. */
function nowOf(
  standing: Standing,
  model: WorkspaceModel,
  agentId: string,
  spaceId: string | undefined,
): { readonly doing: AgentDoing; readonly now: string } {
  if (standing === "archived") return { doing: "idle", now: "Archived" };
  if (standing === "free") return { doing: "idle", now: "Not in a space" };
  const doing = agentDoing(model, agentId, spaceId);
  return { doing, now: DOING_WORDS[doing] };
}

export function agentCard(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
  agentId: string,
): AgentCard {
  const agent = directory[agentId];
  const name = agent?.displayName ?? nameOf(directory, agentId);
  const harness = nameOf(directory, harnessOf(directory, agentId));
  const spaceId = agent === undefined ? undefined : roomOf(agent);
  const space = readableIn(model, selfId, spaceId);
  const standing = standingOf(agent);
  const { doing, now } = nowOf(standing, model, agentId, spaceId);
  const mayLock = mayLockAgent(model, directory, selfId, agentId);
  const locked = agentLocked(directory, agentId);
  const held = agent?.held ?? 0;
  return {
    name,
    sub: SUBS[standing](agentByline(model, directory, selfId, agentId)),
    room:
      spaceId === undefined
        ? undefined
        : {
            spaceId,
            name:
              space === undefined ? "A space you're not in" : roomName(model, spaceId, directory),
            readable: space !== undefined,
            archived: space?.state === "closed",
          },
    now,
    doing,
    held,
    heldNote: heldNote(name, held),
    ...(agent?.face === undefined ? {} : { face: agent.face }),
    mayFace: mayFace(model, directory, selfId, agentId),
    mayName: mayFace(model, directory, selfId, agentId) && !locked,
    ownName:
      agent?.forkedFrom !== undefined && name.endsWith(FORK_SUFFIX)
        ? name.slice(0, -FORK_SUFFIX.length)
        : name,
    harnessName: harness,
    mayMove: mayMove(model, directory, selfId, agentId),
    mayFork: mayFork(model, directory, selfId, agentId),
    mayKeep: mayKeepAgent(model, directory, selfId, agentId),
    mayUnarchive: standing === "archived" && mayLock,
    mayLock,
    locked,
    archived: standing === "archived",
    ...copyOf(directory, agentId),
    note: noteOf(
      standing,
      name,
      harness,
      held,
      { readable: spaceId === undefined || space !== undefined, known: spaceId !== undefined },
      { mayLock, locked },
    ),
  };
}

/** For a fork's copy: what it is a copy of. */
function copyOf(directory: Directory, agentId: string): Pick<AgentCard, "forkedFrom"> {
  const from = forkedFrom(directory, agentId);
  return from === undefined ? {} : { forkedFrom: from };
}
