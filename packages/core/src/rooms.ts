/**
 * One room per agent (ADR 0087), as a room reads it: which agents are here, which of the ones an
 * archive took out are in another room now, what the room says when no agent is left, which agents
 * a person may add, and who may move one. In core so the phone's room sheet and the desktop's
 * (ADR 0151) offer the same agents in the same words.
 */

import { DEFAULT_SPEND_CEILING_USD, type NO_SPEND_CEILING } from "@chipschat/protocol";
import { type Directory, harnessOf, isAgent, isRemoved, nameOf } from "./events.js";
import { administers, myRole, spaceById, spaceTitle } from "./model/readers.js";
import type { AgentLeft, Space, WorkspaceModel } from "./model/types.js";

/** An agent an archive took out of this room, which is in another room now. */
export interface Elsewhere {
  readonly agentId: string;
  /** The room it is in. */
  readonly spaceId: string;
}

export interface RoomAgents {
  /** The agents here, in the order they joined. */
  readonly here: readonly string[];
  /** Agents the room's archive released that are in other rooms now: Move back (rule 4). */
  readonly elsewhere: readonly Elsewhere[];
  /** No agent here, and the one that left last (rule 10): who, and why. */
  readonly gone?: AgentLeft | undefined;
}

/** Whether a participant is an agent the directory knows. */
function isAgentHere(directory: Directory, id: string): boolean {
  return directory[id]?.kind === "agent" && !isRemoved(directory, id);
}

export function roomAgents(space: Space, directory: Directory): RoomAgents {
  const here = space.members.filter((id) => isAgentHere(directory, id));
  const left = space.left ?? [];
  const elsewhere = left.flatMap((each) => {
    const room = directory[each.agentId]?.room;
    const away = each.reason === "archived" && typeof room === "string" && room !== space.id;
    return away ? [{ agentId: each.agentId, spaceId: room }] : [];
  });
  const last = left.reduce<AgentLeft | undefined>(
    (latest, each) => (latest === undefined || each.seq > latest.seq ? each : latest),
    undefined,
  );
  const gone =
    here.length === 0 && space.state === "open" && last !== undefined && last.reason !== "deleted"
      ? last
      : undefined;
  return { here, elsewhere, ...(gone === undefined ? {} : { gone }) };
}

/**
 * What a room calls another room: its title when the reader has it, and an untitled one — a
 * harness's direct room — by the agents in it, as the list names it.
 */
export function roomName(
  model: WorkspaceModel,
  spaceId: string | null | undefined,
  directory?: Directory,
): string {
  if (spaceId === null || spaceId === undefined) return "another space";
  const space = spaceById(model, spaceId);
  if (space?.title !== undefined) return space.title;
  const here =
    space === undefined || directory === undefined ? [] : roomAgents(space, directory).here;
  return here.length === 0
    ? "another space"
    : here.map((id) => nameOf(directory ?? {}, id)).join(", ");
}

/**
 * What an empty field says (ADR 0268, the phone's words since its composer was built): a message,
 * or a command, which goes in the same field; and, in a closed space, that nothing goes.
 */
export const FIELD_PLACEHOLDER = "Message, or /command";
export const CLOSED_FIELD_PLACEHOLDER = "This space is closed";

/** Said over a room while photos or files are dragged over it (ADR 0256 §6, ADR 0268). */
export const ROOM_DROP_WORDS = "Drop to add to your message";

/** What the notice above the field says when no agent is left in a room (rule 10). */
export interface NoAgentNotice {
  readonly title: string;
  readonly body: string;
  /** The agent to move back, when it is somewhere it can be moved from. */
  readonly moveBack?: string | undefined;
}

export function noAgentNotice(
  model: WorkspaceModel,
  space: Space,
  directory: Directory,
): NoAgentNotice | undefined {
  const { gone } = roomAgents(space, directory);
  if (gone === undefined) return undefined;
  const name = nameOf(directory, gone.agentId);
  const where = directory[gone.agentId]?.room;
  const what = goneWords(model, directory, gone, name, where);
  // Wherever it is now, or in no room at all: a move brings it either way. Not while an older
  // server says nothing of where it is.
  const back = movable(directory, gone.agentId) && where !== undefined;
  return {
    title: "No agent in this space",
    body: `${what} Messages here reach people only.`,
    ...(back ? { moveBack: gone.agentId } : {}),
  };
}

function goneWords(
  model: WorkspaceModel,
  directory: Directory,
  gone: AgentLeft,
  name: string,
  where: string | null | undefined,
): string {
  if (typeof where === "string") return `${name} is in ${roomName(model, where, directory)}.`;
  if (gone.reason === "agent_archived") {
    const by = gone.by === undefined ? undefined : directory[gone.by];
    return by?.kind === "person"
      ? `${name} was archived by ${by.displayName}.`
      : `${name} was archived in ${nameOf(directory, harnessOf(directory, gone.agentId))}.`;
  }
  if (gone.reason === "agent_deleted") return `${name} was deleted.`;
  const by = gone.by === undefined ? undefined : directory[gone.by];
  if (gone.reason === "removed" && by?.kind === "person") {
    return `${name} was removed by ${by.displayName}.`;
  }
  if (where === null) return `${name} isn't in a space now.`;
  if (gone.reason === "moved")
    return `${name} moved to ${roomName(model, gone.movedTo, directory)}.`;
  return `${name} left.`;
}

/** Whether an agent may be put in a room at all: not the Main agent, not archived, still here. */
function movable(directory: Directory, agentId: string): boolean {
  const agent = directory[agentId];
  if (agent?.kind !== "agent" || agent.lead === true || agent.archived === true) return false;
  return !isRemoved(directory, agentId) && !isRemoved(directory, harnessOf(directory, agentId));
}

/** An agent a room offers to add, and where it is. */
export interface Addable {
  readonly agentId: string;
  readonly name: string;
  /** Its harness's name, under its own. */
  readonly harness: string;
  /** The room it is in, or `null` while it is free. */
  readonly room: string | null;
}

/** What a room with nobody in it but people says where its lines would be (ADR 0148). */
export const AWAITING_AGENTS = {
  title: "Nobody's here yet",
  body: "Add agents, then say what this space is for.",
  add: "Add agents",
} as const;

/**
 * Whether a room is as Empty on the + leaves it (ADR 0148): open, no Main room and no thread,
 * nobody in it but people, no agent that left it (that is `noAgentNotice`'s to say), and nothing
 * said in it. It says so, with Add agents, where its lines would be. Somebody the directory has
 * not named yet is not known to be a person, so a room still being read says nothing of it.
 */
export function awaitsAgents(space: Space, directory: Directory): boolean {
  if (!startable(space) || !unsaid(space)) return false;
  const agents = roomAgents(space, directory);
  return (
    space.members.every((id) => directory[id]?.kind === "person") &&
    agents.elsewhere.length === 0 &&
    agents.gone === undefined
  );
}

/** What a room says in its middle while its agents wait for the first message (ADR 0149). */
export const WAITING_ROOM = { title: "What would you like to do?" } as const;

/**
 * Who waits in an open room where nobody has said anything (ADR 0149): its agents, or a harness
 * that is a member itself until it makes its agent, as one asked from the + is until the person's
 * first message (ADR 0087). They say nothing until then, so the room asks what the person would
 * like to do. Empty when there is nobody to wait, and the room says what it always says.
 */
export function waitingIn(space: Space, directory: Directory): readonly string[] {
  if (!startable(space) || !unsaid(space)) return [];
  return space.members.filter((id) => isAgent(directory, id) && !isRemoved(directory, id));
}

/**
 * The line under the room's question, naming who waits: "Kit is here and waits for your first
 * message", "Kit and Lux are here and wait…", "Kit, Lux and 2 more are here and wait…".
 */
export function waitingRoomWords(names: readonly string[]): string {
  const [first, second] = names;
  if (first === undefined) return "";
  if (second === undefined) return `${first} is here and waits for your first message.`;
  const who =
    names.length <= 3
      ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
      : `${first}, ${second} and ${names.length - 2} more`;
  return `${who} are here and wait for your first message.`;
}

/** A room work can be started in: open, and neither a Main room nor a thread. */
function startable(space: Space): boolean {
  return space.state === "open" && space.home !== true && space.parentSpaceId === undefined;
}

/** Nothing said yet: no line but the room's own, about who came and went. */
function unsaid(space: Space): boolean {
  return space.lines.every((line) => line.kind === "system");
}

/** Who is reading a list: what `showsAgent` asks of them. */
export interface Reader {
  readonly model: WorkspaceModel;
  readonly selfId: string;
}

/**
 * Whether this reader's lists show an agent (his call of 19 October 2026, ADR 0034's addendum):
 * every agent, to an owner or admin; to anybody else, one in a room they are in now, and one of a
 * harness they own. The server names a member or guest more than that, every agent that has been
 * in a room of theirs, so what one said in a room it has left keeps its name; it is not listed.
 * While the reader's role is not yet known, the directory is shown as it came.
 */
export function showsAgent(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
  agentId: string,
): boolean {
  const role = myRole(model, selfId);
  if (role === undefined || administers(role)) return true;
  const owner = directory[harnessOf(directory, agentId)]?.ownerId ?? directory[agentId]?.ownerId;
  if (owner === selfId) return true;
  return model.spaces.some(
    (space) => space.members.includes(agentId) && space.members.includes(selfId),
  );
}

/**
 * Whether this person may put an agent, or a harness as its default agent, in a room (his call of
 * 19 October 2026, ADR 0034's addendum): as they would move it, as its harness's owner or an owner
 * or admin of the workspace; the server refuses anybody else. While the reader's role is not yet
 * known, it is offered, and the server says.
 */
export function mayPutIn(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
  id: string,
): boolean {
  const role = myRole(model, selfId);
  if (role === undefined || administers(role)) return true;
  const owner = directory[harnessOf(directory, id)]?.ownerId ?? directory[id]?.ownerId;
  return owner === selfId;
}

/**
 * The agents a room offers to add (ADR 0087): the free ones, and the ones in other rooms, which
 * move. Never the Main agent, never an archived one, nothing but people for a Main room, and
 * nothing at all for an archived room, which takes no agent until it is unarchived (agents
 * review, finding 5). Given a reader, only the agents their lists show (`showsAgent`).
 */
export function addableAgents(
  space: Space,
  directory: Directory,
  reader?: Reader | undefined,
): { readonly free: readonly Addable[]; readonly elsewhere: readonly Addable[] } {
  if (space.home === true || space.state === "closed") return { free: [], elsewhere: [] };
  const offered = Object.values(directory)
    .filter((each) => movable(directory, each.id) && !space.members.includes(each.id))
    .filter(
      (each) => reader === undefined || showsAgent(reader.model, directory, reader.selfId, each.id),
    )
    .map((each) => ({
      agentId: each.id,
      name: each.displayName,
      harness: nameOf(directory, harnessOf(directory, each.id)),
      room: typeof each.room === "string" ? each.room : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    free: offered.filter((each) => each.room === null),
    elsewhere: offered.filter((each) => each.room !== null),
  };
}

/**
 * The free agents Add offers while it stays up (ADR 0148): the ones free now, and the ones put in
 * the room from it since it came up (`kept`), which keep their place among them, ticked, so a
 * pick does not take its row out from under the finger. In name order, as `addableAgents`.
 */
export function addableKept(
  space: Space,
  directory: Directory,
  kept: readonly string[],
  reader?: Reader | undefined,
): readonly Addable[] {
  const { free } = addableAgents(space, directory, reader);
  const here = kept
    .filter(
      (id) =>
        space.members.includes(id) &&
        isAgentHere(directory, id) &&
        !free.some((each) => each.agentId === id),
    )
    .map((id) => ({
      agentId: id,
      name: nameOf(directory, id),
      harness: nameOf(directory, harnessOf(directory, id)),
      room: null,
    }));
  return [...free, ...here].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Whether this person may move an agent (ADR 0087, point 4): its harness's owner, or an owner or
 * admin of the workspace. Anybody else in the room sees it as elsewhere, and asks.
 */
export function mayMove(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
  agentId: string,
): boolean {
  if (!movable(directory, agentId)) return false;
  const owner = directory[harnessOf(directory, agentId)]?.ownerId ?? directory[agentId]?.ownerId;
  return owner === selfId || administers(myRole(model, selfId));
}

/**
 * Whether this person may change an agent's face (ADR 0089): anybody who is not a guest. A face
 * changes nothing the agent does and takes it out of no room, so it is not kept to its harness's
 * owner as a move is.
 */
export function mayFace(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
  agentId: string,
): boolean {
  return directory[agentId]?.kind === "agent" && myRole(model, selfId) !== "guest";
}

/**
 * Why an agent cannot be added to a room, in words for the person who asked, or nothing when it
 * can: the door's rules (ADR 0087, rules 1 and 7), read from what the app already holds, so
 * `/add` says why rather than sending what the server will turn away (agents review, finding
 * 13). An agent that is in another room is not refused here: it is moved, by whoever may.
 */
export function whyNotAdd(space: Space, directory: Directory, agentId: string): string | undefined {
  const agent = directory[agentId];
  if (agent?.kind !== "agent") return undefined;
  const name = agent.displayName;
  if (agent.lead === true) return `${name} is a Main agent, and stays in its Main space.`;
  if (space.home === true) return "A Main space takes people, and no other agent.";
  if (space.state === "closed") return "This space is archived. Unarchive it first.";
  if (agent.archived === true) return `${name} is archived. Unarchive it first, from Agents.`;
  return undefined;
}

/**
 * Whether a member may be taken out of a room at all (rule 7; agents review, finding 9): anybody
 * but the Main agent in its Main room, which no screen would put back.
 */
export function mayRemove(space: Space, directory: Directory, memberId: string): boolean {
  return !(space.home === true && directory[memberId]?.lead === true);
}

/**
 * Whether this reader may take a member out of a room (ADR 0111), as the server's rule 7 has it:
 * the room's owner, or an owner or admin of the workspace who is in the room, and never a guest.
 * Not themselves, which is leaving (`/leave`), nobody who is not in the room, not the Main agent
 * from its Main room (`mayRemove`), and an owner of the workspace by an owner alone (rule 11,
 * JR-23). Without the workspace to hand, the room's owner only.
 */
export function mayRemoveMember(
  space: Space,
  directory: Directory,
  selfId: string,
  memberId: string,
  model?: WorkspaceModel,
): boolean {
  if (memberId === selfId || !space.members.includes(memberId)) return false;
  if (!space.members.includes(selfId) || !mayRemove(space, directory, memberId)) return false;
  if (
    model !== undefined &&
    myRole(model, memberId) === "owner" &&
    myRole(model, selfId) !== "owner"
  ) {
    return false;
  }
  const role = space.roles[selfId];
  if (role === "owner") return true;
  if (role === "guest" || model === undefined) return false;
  return administers(myRole(model, selfId));
}

/**
 * Whether this reader may rename the room (ADR 0112), as the server's rule 7 has it: anybody in
 * it but a guest, while its changes are not locked (ADR 0156).
 */
export function mayRename(space: Space, selfId: string): boolean {
  return mayLock(space, selfId) && space.locked !== true;
}

/**
 * Whether this reader may lock the room's changes or let them go (ADR 0156), as the server has
 * it: anybody in it but a guest.
 */
export function mayLock(space: Space, selfId: string): boolean {
  return space.members.includes(selfId) && space.roles[selfId] !== "guest";
}

/**
 * The colour of each tile's mark on the room sheet's first page (ADR 0202's addendum of 23 October
 * 2026), as the index a face's `ground` is sent as (ADR 0064), so the phone and the web turn it into
 * the same colour in either faces' theme: Project blue, Lead violet, Spend per job green,
 * Notifications red, Lock changes teal and, while shut, ochre for the padlock in gold, Hide pink.
 */
export const ROOM_TILE_GROUNDS = {
  project: 4,
  lead: 5,
  spend: 7,
  notify: 12,
  lock: 3,
  locked: 9,
  hide: 0,
} as const;

/** A tile on the room sheet, by the colour its mark wears. */
export type RoomTileGround = keyof typeof ROOM_TILE_GROUNDS;

/**
 * Whether this reader may set what the room allows a job (ADR 0117), as the server has it: the
 * workspace's owner, in the room, since a job is paid for on the owner's account (his call of 18
 * October 2026, ADR 0196). A lock leaves it alone.
 */
export function maySetSpend(space: Space, model: WorkspaceModel, selfId: string): boolean {
  return mayLock(space, selfId) && myRole(model, selfId) === "owner";
}

/**
 * Whether this reader sees what the room allows a job at all: anybody in it but a guest (ADR
 * 0196). A guest's work is paid for by somebody else, and the amount is no business of theirs.
 */
export function maySeeSpend(space: Space, model: WorkspaceModel, selfId: string): boolean {
  return mayLock(space, selfId) && myRole(model, selfId) !== "guest";
}

/**
 * Whether this reader may choose who leads the room (ADR 0104), as the server has it: anybody in
 * it who is a guest neither of the room nor of the workspace (ADR 0196: a guest's row is read
 * only, rather than a picker the server refuses).
 */
export function mayChooseLead(space: Space, model: WorkspaceModel, selfId: string): boolean {
  return mayLock(space, selfId) && myRole(model, selfId) !== "guest";
}

/**
 * The workspace's owner, as a sentence names them: who sets what a job may spend, for a member's
 * read-only row. The first owner, when there are several; nothing when the model has none yet.
 */
export function workspaceOwnerName(
  model: WorkspaceModel,
  directory: Directory,
): string | undefined {
  const owner = Object.values(model.people)
    .filter((person) => person.role === "owner")
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))[0];
  return owner === undefined ? undefined : nameOf(directory, owner.participantId);
}

/** What the room allows a job (ADR 0117): what a person set, No cap (ADR 0292), or the default. */
export function spendCeilingOf(space: Space): number | typeof NO_SPEND_CEILING {
  return space.spendCeiling ?? DEFAULT_SPEND_CEILING_USD;
}

/** The Main agent a room is the Main room of (rule 7), when it is one. */
export function leadOf(space: Space, directory: Directory): string | undefined {
  if (space.home !== true) return undefined;
  return space.members.find((id) => directory[id]?.lead === true);
}

/**
 * The line under a room's name, in the phone's bar and the desktop's header, and nothing where the
 * name has already said it. A room with a harness in it is named after the work, so the second line
 * is who is doing it; a room of people is named after the people, so there is nothing left to add
 * unless there are more of them than the name can hold, and then it is how many.
 *
 * Two lines rather than one because a room's name on a phone is a chevron, forty characters and the
 * rest of the trip: *Santa Barbara 2026 trip* tells you where you are and not who is in there with
 * you, which is the one thing you want before you send anything. The phone's until 11 October 2026,
 * when the desktop's header took it in place of whose harness it was and how much rope it had.
 */
export function spaceSubtitle(space: Space, directory: Directory): string | undefined {
  // A Main room says whose it is (ADR 0087, rule 7); a room its last agent left says so (rule 10).
  const lead = leadOf(space, directory);
  if (lead !== undefined) return `Main agent · ${nameOf(directory, harnessOf(directory, lead))}`;
  if (roomAgents(space, directory).gone !== undefined) return "No agent";
  const harnesses = space.members.filter((id) => isAgent(directory, id));
  const harnessId = harnesses[0] ?? space.run?.harnessId;
  if (harnessId !== undefined) {
    const name = nameOf(directory, harnessId);
    return name === spaceTitle(space, directory) ? undefined : name;
  }
  const people = space.members.filter((id) => directory[id]?.kind === "person").length;
  return people < 3 ? undefined : `${people} people`;
}

/**
 * What the room sheet says under the room's name, on the phone and the desktop: who is in it, or
 * that it is a Main room.
 */
export function whoIsHere(space: Space, directory: Directory): string {
  if (leadOf(space, directory) !== undefined) {
    return "The Main space. People can join it; other agents can't.";
  }
  const agents = roomAgents(space, directory).here.length;
  const people = space.members.filter((id) => directory[id]?.kind === "person").length;
  const them = agents === 0 ? "No agents" : agents === 1 ? "1 agent" : `${agents} agents`;
  return `${them} and ${people === 1 ? "you" : `${people} people`}`;
}
