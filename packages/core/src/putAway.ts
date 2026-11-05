/**
 * Archiving and erasing a space (ADR 0066, ADR 0067): who may, and what the sheet that asks
 * first says. In core because the phone's sheet and the desktop's dialog say the same thing and
 * offer it to the same people, as the server decides them — a difference between them would be
 * a bug in whichever was written second.
 */

import { type Directory, followsRooms, harnessOf, isRemoved, nameOf } from "./events.js";
import { administers, myRole, type Space, type WorkspaceModel } from "./model.js";
import { mayLock, roomAgents, roomName } from "./rooms.js";

/**
 * Anybody in the room who is not a guest, here or in the workspace. Never a harness's home, which
 * is always there (ADR 0069) — though one somehow put away may be brought back — and never a room
 * whose changes are locked (ADR 0156), which may still be brought back.
 */
export function mayArchive(model: WorkspaceModel, space: Space, selfId: string): boolean {
  if (space.state === "open" && (space.home === true || space.locked === true)) return false;
  const role = space.roles[selfId];
  return role !== undefined && role !== "guest" && myRole(model, selfId) !== "guest";
}

/**
 * Whether the reader may hide this room from their own list (ADR 0205): they are in it, a guest
 * too. Never a thread, which goes with its space, nor a harness's home, which is always there (ADR
 * 0069). A room whose changes are locked may be hidden: the lock stops changes for everybody, and
 * Hide changes nothing for anybody else.
 */
export function mayHideRoom(space: Space, selfId: string): boolean {
  if (space.parentSpaceId !== undefined || space.home === true) return false;
  return space.members.includes(selfId);
}

/**
 * What a row pushed right offers (ADR 0205): Unhide on a room this person hid, wherever it stands;
 * Hide on an open room they may hide; nothing on an archived one, which is off the list already.
 */
export function hideAct(
  space: Space,
  selfId: string,
  hidden: ReadonlySet<string>,
): "hide" | "unhide" | undefined {
  if (hidden.has(space.id)) return "unhide";
  return space.state !== "closed" && mayHideRoom(space, selfId) ? "hide" : undefined;
}

/**
 * Whether the reader may pin this room to the top of their own list (ADR 0240): they are in it, a
 * guest too. Never a thread, which goes with its space. Unlike Hide, the Main room may be pinned,
 * and so may a room whose changes are locked: a pin changes nothing for anybody else.
 */
export function mayPinRoom(space: Space, selfId: string): boolean {
  if (space.parentSpaceId !== undefined) return false;
  return space.members.includes(selfId);
}

/**
 * What a row pushed right offers first, from its leading edge (ADR 0240): Unpin on a room this
 * person pinned, Pin on one they may pin. Only in the open run, where pins stand: a hidden or an
 * archived room offers neither, and keeps its pin for when it comes back.
 */
export function pinAct(
  space: Space,
  selfId: string,
  pinned: readonly string[],
  hidden: ReadonlySet<string>,
): "pin" | "unpin" | undefined {
  if (space.state === "closed" || hidden.has(space.id)) return undefined;
  if (pinned.includes(space.id)) return "unpin";
  return mayPinRoom(space, selfId) ? "pin" : undefined;
}

/** No room pinned. */
export const NO_PINS: readonly string[] = [];

/**
 * What a Spaces row offers: from its leading end Pin or Unpin and Hide or Unhide, the reader's own
 * (ADRs 0240, 0205); from its trailing end Archive or Unarchive and Delete (ADRs 0066, 0067), or
 * Locked in their place on a room whose changes are locked, for whoever may let them go (ADR 0156).
 * The phone's swipes lay them out from each end; the desktop's menu on a row lists them in this
 * order.
 */
export type SpaceRowAct =
  | "pin"
  | "unpin"
  | "hide"
  | "unhide"
  | "archive"
  | "unarchive"
  | "delete"
  | "locked";

/** A row's acts, in the order of `SpaceRowAct`: what core offers this reader on this room. */
export function spaceRowActs(
  model: WorkspaceModel,
  space: Space,
  selfId: string,
  pinned: readonly string[],
  hidden: ReadonlySet<string>,
): readonly SpaceRowAct[] {
  const acts: SpaceRowAct[] = [];
  const pin = pinAct(space, selfId, pinned, hidden);
  if (pin !== undefined) acts.push(pin);
  const hide = hideAct(space, selfId, hidden);
  if (hide !== undefined) acts.push(hide);
  if (mayArchive(model, space, selfId))
    acts.push(space.state === "closed" ? "unarchive" : "archive");
  if (mayErase(model, space, selfId)) acts.push("delete");
  if (space.locked === true && mayLock(space, selfId)) acts.push("locked");
  return acts;
}

/** What each of a row's acts is called, on a phone's swipe and in a desktop's menu alike. */
export const SPACE_ROW_ACT_WORDS: Readonly<Record<SpaceRowAct, string>> = {
  pin: "Pin",
  unpin: "Unpin",
  hide: "Hide",
  unhide: "Unhide",
  archive: "Archive",
  unarchive: "Unarchive",
  delete: "Delete",
  locked: "Locked, show details",
};

const NOT_TAKEN = {
  hide: "Not hidden",
  unhide: "Not unhidden",
  pin: "Not pinned",
  unpin: "Not unpinned",
} as const;

/**
 * Why a hide, a pin or their undoing did not hold, in words worth reading. A server from before
 * ADR 0205, or 0240 for a pin, has no such route, and says so as a 404.
 */
export function notTakenWords(act: keyof typeof NOT_TAKEN, error: unknown): string {
  const not = NOT_TAKEN[act];
  const said = error instanceof Error ? error.message : "";
  if (/404|no route matches/i.test(said)) return `${not}: this server is older than the app.`;
  return said === "" ? `${not}: the server would not take it.` : `${not}: ${said}`;
}

/**
 * A list's rooms in its three runs (ADR 0205): the open ones; those this person hid, under their
 * heading; and the archived ones, a hidden room among them, since archived is the room's own
 * state for everybody, and a hide only the reader's.
 *
 * The open run starts with the rooms the person pinned (ADR 0240), in the order of `pinned`, the
 * newest pin first, and they hold those places whatever is said in them; the rest follow in the
 * order they came, the most recently busy first.
 */
export function listRuns<S extends Space>(
  spaces: readonly S[],
  hidden: ReadonlySet<string> | undefined,
  pinned: readonly string[] = NO_PINS,
): { readonly open: S[]; readonly hidden: S[]; readonly closed: S[] } {
  const runs = { open: [] as S[], hidden: [] as S[], closed: [] as S[] };
  const pins: S[] = [];
  for (const space of spaces) {
    if (space.state === "closed") runs.closed.push(space);
    else if (hidden?.has(space.id) === true) runs.hidden.push(space);
    else if (pinned.includes(space.id)) pins.push(space);
    else runs.open.push(space);
  }
  if (pins.length === 0) return runs;
  pins.sort((a, b) => pinned.indexOf(a.id) - pinned.indexOf(b.id));
  return { ...runs, open: [...pins, ...runs.open] };
}

/**
 * The room's owner, or an owner or admin of the workspace who is in it; never a guest. Not a
 * thread, which goes with the space it grew in, and not a direct room nobody can open again —
 * the one a harness was handed when it was added, or two people's — which is archived instead.
 * A room a harness opened under a key of its own is erasable, direct or not, and so is one a
 * person asked a harness for from the +, whether the harness took it up or not. Never a
 * harness's home, the room its lead speaks in (ADR 0069), and never a room whose changes are
 * locked (ADR 0156).
 */
export function mayErase(model: WorkspaceModel, space: Space, selfId: string): boolean {
  if (space.parentSpaceId !== undefined || space.home === true || space.locked === true) {
    return false;
  }
  if (space.kind === "direct" && space.keyed !== true && space.askedOf === undefined) return false;
  const role = space.roles[selfId];
  const standing = myRole(model, selfId);
  if (role === undefined || role === "guest" || standing === "guest") return false;
  return role === "owner" || administers(standing);
}

/** What the sheet that asks first says, and what its button is called. */
export interface Asking {
  readonly title: string;
  readonly body: string;
  /** The smaller line under it, where there is one. */
  readonly note?: string | undefined;
  readonly confirm: string;
  /**
   * For a delete of a room with one agent, whose harness follows its rooms (ADR 0087, rules 5 and
   * 12): the switch that deletes the agent in its harness too, on at first, and what it says
   * either way.
   */
  readonly agentToo?: AgentToo | undefined;
  /**
   * For a delete of an agent that is the one in its room (ADR 0095, point 4): the switch that
   * erases the room too, on at first, and what it says either way.
   */
  readonly roomToo?: RoomToo | undefined;
  /**
   * For a delete of several rooms (ADR 0181): the one switch that deletes each one's lone agent in
   * its harness too, as rule 5's does for one room, and which rooms it is about.
   */
  readonly agentsToo?: AgentsToo | undefined;
  /**
   * For a delete of several agents (ADR 0182): the one switch that erases the rooms they leave
   * empty, as an agent's own switch does for its room, and which rooms it is about.
   */
  readonly roomsToo?: RoomsToo | undefined;
}

/** A switch a delete offers, on at first: what it is called, and what it means either way. */
export interface Too {
  readonly label: string;
  readonly on: string;
  readonly off: string;
}

export interface AgentToo extends Too {
  readonly agentId: string;
}

export interface RoomToo extends Too {
  readonly spaceId: string;
}

export interface AgentsToo extends Too {
  /** The rooms whose one agent the switch deletes, of those being deleted. */
  readonly spaceIds: readonly string[];
}

export interface RoomsToo extends Too {
  /** The rooms the switch erases: those every agent of which is being deleted. */
  readonly spaceIds: readonly string[];
}

/** Names in a sentence: "A", "A and B", "A, B and C". */
function listed(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * Who is at work in a room: each whose newest run there is going. An older run still marked as
 * going is one that was left behind, and the sheet does not promise to stop a reply that ended
 * weeks ago (agents review, finding 12).
 */
function working(space: Space, directory: Directory): string[] {
  const newest = new Map<string, (typeof space.runs)[number]>();
  for (const run of space.runs) newest.set(run.harnessId, run);
  const live = [...newest.values()].filter(
    (run) => run.state === "running" || run.state === "waiting",
  );
  return [...new Set(live.map((run) => nameOf(directory, run.harnessId)))];
}

/**
 * What archiving does to a room's agents (ADR 0087, rule 3): their work is stopped, by name, and
 * they are freed; an unarchive brings back the ones still free.
 */
function agentWords(
  space: Space,
  directory: Directory,
): { body: string; note: string } | undefined {
  const here = roomAgents(space, directory).here.map((id) => nameOf(directory, id));
  if (here.length === 0) return undefined;
  const busy = working(space, directory);
  const stopped =
    busy.length === 0
      ? ""
      : `${listed(busy.map((name) => `${name}'s`))} ${busy.length === 1 ? "reply" : "replies"} will be stopped. `;
  const one = here.length === 1;
  return {
    body: `${stopped}${listed(here)} will be free to join another space. Nothing said here is lost.`,
    note: `Unarchive brings ${one ? "it" : "them"} back, unless ${one ? "it's" : "they're"} in another space by then.`,
  };
}

/**
 * The harness that opened this room under a key of its own, by name, when it has declared that it
 * keeps its side in step (`follows_rooms`): only then is there anything to promise on its behalf.
 */
function reopener(space: Space, directory: Directory): string | undefined {
  if (space.keyed !== true || space.openedBy === undefined) return undefined;
  if (directory[space.openedBy]?.kind !== "harness") return undefined;
  if (!followsRooms(directory, space.openedBy)) return undefined;
  return nameOf(directory, space.openedBy);
}

/**
 * What the harness does with its side of a room erased here (ADR 0069): deletes it, when the
 * person erasing owns the harness; puts it away for its owner to decide, when they do not.
 */
function harnessSide(space: Space, directory: Directory, selfId: string): string | undefined {
  const harness = reopener(space, directory);
  if (harness === undefined || space.openedBy === undefined) return undefined;
  return directory[space.openedBy]?.ownerId === selfId
    ? `It's deleted in ${harness} too.`
    : `${harness} archives it on its side, for its owner to delete there.`;
}

/** `name` is what the room is called on the screen asking, which each client works out. */
export function archiveAsking(space: Space, name: string, directory: Directory): Asking {
  const harness = reopener(space, directory);
  const agents = agentWords(space, directory);
  if (agents !== undefined) {
    return {
      title: `Archive ${name}?`,
      body: agents.body,
      note: harness === undefined ? agents.note : `${agents.note} ${harness} archives it too.`,
      confirm: "Archive",
    };
  }
  return {
    title: `Archive ${name}?`,
    body: "It moves to Archived at the foot of your list. Nothing in it is lost, and anything new still lands in it.",
    note:
      harness === undefined
        ? "It stays archived until you unarchive it."
        : `It stays archived until you unarchive it, here or in ${harness}.`,
    confirm: "Archive",
  };
}

/**
 * The switch a delete offers for a room's one agent (ADR 0087, rule 5): only where its harness
 * follows its rooms (rule 12), so there is a side to delete there, and only to somebody who may
 * have it deleted there: the harness's owner, or an owner or admin of the workspace, as for a
 * move. It was offered, on, to whoever could delete the room (agents review, finding 4).
 */
function agentToo(space: Space, directory: Directory, selfId: string): AgentToo | undefined {
  const here = roomAgents(space, directory).here;
  const only = here[0];
  if (here.length !== 1 || only === undefined) return undefined;
  // An agent whose changes are locked is not deleted with its room (ADR 0199, point 4).
  if (agentLocked(directory, only)) return undefined;
  const harnessId = harnessOf(directory, only);
  if (!followsRooms(directory, harnessId)) return undefined;
  const standing = directory[selfId]?.role;
  const mine = directory[harnessId]?.ownerId === selfId;
  if (!mine && standing !== "owner" && standing !== "admin") return undefined;
  const name = nameOf(directory, only);
  const harness = nameOf(directory, harnessId);
  return {
    agentId: only,
    label: `Delete ${name} in ${harness} too`,
    on: `It's deleted in ${harness} as well.`,
    off: `${name} stays in ${harness}, free to join another space.`,
  };
}

/**
 * What becomes of a room's agents as it goes, when no switch says it: free to join another room,
 * and for a lone agent whose changes are locked, why it was not offered to go too (ADR 0199).
 */
function freedWords(here: readonly string[], directory: Directory): string {
  const [only] = here;
  if (here.length === 1 && only !== undefined && agentLocked(directory, only)) {
    return `${nameOf(directory, only)}'s changes are locked, so it stays, free to join another space.`;
  }
  return `${listed(here.map((id) => nameOf(directory, id)))} will be free to join another space.`;
}

export function eraseAsking(
  space: Space,
  name: string,
  directory: Directory,
  selfId: string,
): Asking {
  const too = agentToo(space, directory, selfId);
  const here = roomAgents(space, directory).here;
  // A room's agents are freed as it goes (ADR 0087, rule 5), and one whose harness follows its
  // rooms may go with it: the switch says so. From before agents, the harness's own side.
  const note =
    too !== undefined
      ? undefined
      : here.length > 0
        ? freedWords(here, directory)
        : harnessSide(space, directory, selfId);
  return {
    title: `Delete ${name}?`,
    body: "What was said in it, its files and its search entries are erased from the server, for everyone in it. This can't be undone.",
    ...(note === undefined ? {} : { note }),
    confirm: "Delete",
    ...(too === undefined ? {} : { agentToo: too }),
  };
}

/**
 * Whether a room may be picked for a batch (ADR 0181): one a swipe would offer Archive, Unarchive
 * or Delete on, and never one whose changes are locked. A locked room archived before it was
 * locked may still be brought back by its own swipe, but a batch leaves every locked room alone,
 * so the list can say it once: a locked room can't be picked.
 */
export function mayPick(model: WorkspaceModel, space: Space, selfId: string): boolean {
  if (space.locked === true) return false;
  return mayArchive(model, space, selfId) || mayErase(model, space, selfId);
}

/** What each of a batch's buttons acts on: the picked rooms it may take, in the order given. */
export interface Batch {
  readonly archive: readonly Space[];
  readonly unarchive: readonly Space[];
  readonly erase: readonly Space[];
}

export function batchOf(model: WorkspaceModel, spaces: readonly Space[], selfId: string): Batch {
  const picked = spaces.filter((space) => mayPick(model, space, selfId));
  const putAway = picked.filter((space) => mayArchive(model, space, selfId));
  return {
    archive: putAway.filter((space) => space.state !== "closed"),
    unarchive: putAway.filter((space) => space.state === "closed"),
    erase: picked.filter((space) => mayErase(model, space, selfId)),
  };
}

/** A room as the screen asking about it names it, which each client works out. */
export interface Named {
  readonly space: Space;
  readonly name: string;
}

/** Each harness of these rooms that keeps its side in step, by name, once. */
function reopeners(rooms: readonly Named[], directory: Directory): string[] {
  const names = rooms.map((room) => reopener(room.space, directory));
  return [...new Set(names.filter((name): name is string => name !== undefined))];
}

/**
 * What the sheet asking before several rooms are archived says (ADR 0181). One room is asked
 * about as its swipe asks.
 */
export function archiveManyAsking(rooms: readonly Named[], directory: Directory): Asking {
  const [only] = rooms;
  if (rooms.length === 1 && only !== undefined) {
    return archiveAsking(only.space, only.name, directory);
  }
  const count = rooms.length;
  const agents = rooms.some((room) => roomAgents(room.space, directory).here.length > 0);
  const busy = [...new Set(rooms.flatMap((room) => working(room.space, directory)))];
  const stopped =
    busy.length === 0
      ? ""
      : `${listed(busy.map((name) => `${name}'s`))} ${busy.length === 1 ? "reply" : "replies"} will be stopped. `;
  const harnesses = reopeners(rooms, directory);
  const there =
    harnesses.length === 0
      ? ""
      : ` ${listed(harnesses)} ${harnesses.length === 1 ? "archives its side" : "archive their sides"} too.`;
  return {
    title: `Archive ${count} spaces?`,
    body: agents
      ? `They move to Archived at the foot of your list. ${stopped}Their agents will be free to join another space, and nothing said in them is lost.`
      : "They move to Archived at the foot of your list. Nothing in them is lost, and anything new still lands in them.",
    note: `${agents ? "Unarchive brings the agents back, unless they're in another space by then." : "They stay archived until you unarchive them."}${there}`,
    confirm: `Archive ${count}`,
  };
}

/**
 * What a harness does with its side of several rooms erased here (ADR 0069), one sentence for
 * each harness: deletes it, for its owner; puts it away for its owner to decide, for anybody else.
 */
function harnessSides(rooms: readonly Named[], directory: Directory, selfId: string): string[] {
  const [only] = rooms;
  if (rooms.length === 1 && only !== undefined) {
    const side = harnessSide(only.space, directory, selfId);
    return side === undefined ? [] : [side];
  }
  const harnesses = new Set<string>();
  for (const room of rooms) {
    if (reopener(room.space, directory) !== undefined && room.space.openedBy !== undefined) {
      harnesses.add(room.space.openedBy);
    }
  }
  return [...harnesses].map((id) =>
    directory[id]?.ownerId === selfId
      ? `${nameOf(directory, id)} deletes its side too.`
      : `${nameOf(directory, id)} archives its side, for its owner to delete there.`,
  );
}

/**
 * The one switch for the lone agents of rooms being deleted together (ADR 0087 rule 5, ADR 0181),
 * worded as a room's own switch where only one of them has such an agent.
 */
function agentsToo(
  rooms: readonly Named[],
  directory: Directory,
  selfId: string,
): AgentsToo | undefined {
  const asked = rooms.flatMap((room) => {
    const too = agentToo(room.space, directory, selfId);
    return too === undefined ? [] : [{ spaceId: room.space.id, too }];
  });
  const [first] = asked;
  if (first === undefined) return undefined;
  const spaceIds = asked.map((each) => each.spaceId);
  if (asked.length === 1) {
    const { label, on, off } = first.too;
    return { label, on, off, spaceIds };
  }
  const harnesses = listed([
    ...new Set(asked.map((each) => nameOf(directory, harnessOf(directory, each.too.agentId)))),
  ]);
  return {
    label: `Delete their ${asked.length} agents too`,
    on: `They're deleted in ${harnesses} as well.`,
    off: `They stay in ${harnesses}, free to join another space.`,
    spaceIds,
  };
}

/**
 * What the sheet asking before several rooms are deleted says (ADR 0181): what goes, the one
 * switch for their lone agents, what their harnesses do, and which of the picked rooms stay, since
 * this person may only archive them (`staying`). One room going is asked about as its swipe asks.
 */
export function eraseManyAsking(
  going: readonly Named[],
  staying: readonly Named[],
  directory: Directory,
  selfId: string,
): Asking {
  const [only] = going;
  const count = going.length;
  const one = count === 1 && only !== undefined;
  const too = agentsToo(going, directory, selfId);
  const switched = new Set(too?.spaceIds ?? []);
  // Agents freed without being asked about: in a room with more than one, or a harness that keeps
  // no rooms.
  const freed = going
    .filter((room) => !switched.has(room.space.id))
    .flatMap((room) => roomAgents(room.space, directory).here.map((id) => nameOf(directory, id)));
  const quiet = going.filter((room) => roomAgents(room.space, directory).here.length === 0);
  const notes = [
    ...(freed.length === 0 ? [] : [`${listed(freed)} will be free to join another space.`]),
    ...harnessSides(quiet, directory, selfId),
    ...(staying.length === 0
      ? []
      : [
          `${listed(staying.map((room) => room.name))} ${staying.length === 1 ? "stays: you can only archive that space" : "stay: you can only archive those spaces"}.`,
        ]),
  ];
  return {
    title: one ? `Delete ${only.name}?` : `Delete ${count} spaces?`,
    body: one
      ? "What was said in it, its files and its search entries are erased from the server, for everyone in it. This can't be undone."
      : "What was said in them, their files and their search entries are erased from the server, for everyone in them. This can't be undone.",
    ...(notes.length === 0 ? {} : { note: notes.join(" ") }),
    confirm: one ? "Delete" : `Delete ${count}`,
    ...(too === undefined ? {} : { agentsToo: too }),
  };
}

/**
 * Whether this person may archive or delete an agent (ADR 0095, point 1): whoever may lock its
 * changes, while they are not locked (ADR 0199). An archived agent that is locked is still
 * unarchived by the same people (`mayUnarchiveAgent`): that only puts it back.
 */
export function mayKeepAgent(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
  agentId: string,
): boolean {
  return mayLockAgent(model, directory, selfId, agentId) && directory[agentId]?.locked !== true;
}

/**
 * Whether this person may bring an archived agent back (ADR 0095): whoever may lock it, locked or
 * not, since an unarchive only puts it back (ADR 0199, point 2).
 */
export function mayUnarchiveAgent(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
  agentId: string,
): boolean {
  return directory[agentId]?.archived === true && mayLockAgent(model, directory, selfId, agentId);
}

/** Whether an agent's changes are locked (ADR 0199): no rename, archive or delete. */
export function agentLocked(directory: Directory, agentId: string): boolean {
  return directory[agentId]?.locked === true;
}

/**
 * Whether this person may lock an agent's changes or let them go (ADR 0199, point 5): whoever may
 * archive or delete it, its harness's owner or an owner or admin of the workspace, as for a move;
 * never a guest, never the Main agent, and never one that is gone already.
 */
export function mayLockAgent(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
  agentId: string,
): boolean {
  const agent = directory[agentId];
  if (agent?.kind !== "agent" || agent.lead === true) return false;
  const harnessId = harnessOf(directory, agentId);
  if (isRemoved(directory, agentId) || isRemoved(directory, harnessId)) return false;
  const standing = myRole(model, selfId);
  if (standing === "guest") return false;
  return (directory[harnessId]?.ownerId ?? agent.ownerId) === selfId || administers(standing);
}

/** The room an agent is in, as this reader has it, and whether it is the only agent there. */
function agentRoom(
  model: WorkspaceModel,
  directory: Directory,
  agentId: string,
): { space: Space; name: string; alone: boolean; own: boolean } | undefined {
  const spaceId = directory[agentId]?.room;
  if (typeof spaceId !== "string") return undefined;
  const space = model.spaces.find((each) => each.id === spaceId);
  if (space === undefined) return undefined;
  const name = roomName(model, spaceId, directory);
  return {
    space,
    name,
    alone: roomAgents(space, directory).here.length <= 1,
    // Named after the agent, as a Space's room is: "its room" says it better than its name twice.
    own: name === nameOf(directory, agentId),
  };
}

/**
 * What the sheet asking before an agent is archived says (ADR 0095, point 2): what becomes of its
 * room, that its work stops, and what its harness does.
 */
export function agentArchiveAsking(
  model: WorkspaceModel,
  directory: Directory,
  agentId: string,
): Asking {
  const name = nameOf(directory, agentId);
  const harnessId = harnessOf(directory, agentId);
  const room = agentRoom(model, directory, agentId);
  const busy = room !== undefined && working(room.space, directory).includes(name);
  const stopped = busy ? `${name}'s reply will be stopped. ` : "";
  const back = room?.alone === true && room.space.locked !== true ? "both" : "it";
  return {
    title: `Archive ${name}?`,
    body: room === undefined ? "It moves to Archived." : `${stopped}${archiveLeaving(room)}`,
    note: followsRooms(directory, harnessId)
      ? `${nameOf(directory, harnessId)} archives it too. Unarchive brings ${back} back.`
      : `Unarchive brings ${back} back.`,
    confirm: "Archive",
  };
}

/**
 * Where an agent being archived goes from: its room archived with it when it is the one agent
 * there, unless the room's changes are locked (ADR 0156).
 */
function archiveLeaving(room: NonNullable<ReturnType<typeof agentRoom>>): string {
  const where = room.own ? "its space" : room.name;
  if (!room.alone) {
    return `It leaves ${room.name}, which stays open for the others, and moves to Archived.`;
  }
  if (room.space.locked === true) {
    return `It leaves ${where}, which stays open since its changes are locked, and moves to Archived.`;
  }
  const its = room.own ? "Its space" : room.name;
  return `It leaves ${where} and moves to Archived. ${its} is archived with it, since no other agent is there.`;
}

/**
 * What the sheet asking before an agent is deleted says (ADR 0095, point 4): that it goes for
 * everyone and its words stay, what its harness does, and, for the one agent in its room, the
 * switch that erases the room too — offered to somebody who may delete that room.
 */
export function agentDeleteAsking(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
  agentId: string,
): Asking {
  const room = agentRoom(model, directory, agentId);
  const roomToo =
    room?.alone === true && mayErase(model, room.space, selfId)
      ? {
          spaceId: room.space.id,
          label: `Delete the space \u201c${room.name}\u201d too`,
          on: "The space and everything said in it are erased from the server.",
          off: "The space stays, archived, with everything said in it.",
        }
      : undefined;
  return {
    title: `Delete ${nameOf(directory, agentId)}?`,
    body: "It goes from Chips for everyone, and doesn't come back. What it said stays in the spaces it was in, under its name.",
    note: `${leavingWords(room, roomToo !== undefined)}${deleteSide(directory, selfId, agentId)}`,
    confirm: "Delete",
    ...(roomToo === undefined ? {} : { roomToo }),
  };
}

/** What a delete does to the room the agent is in, when the switch doesn't say it. */
function leavingWords(room: ReturnType<typeof agentRoom>, switched: boolean): string {
  if (room === undefined || switched) return "";
  if (!room.alone) return `It leaves ${room.name}, which stays open for the others. `;
  // A room whose changes are locked is not archived by its agent going (ADR 0156).
  if (room.space.locked === true) {
    return `${room.own ? "Its space" : room.name} stays open: its changes are locked. `;
  }
  return `${room.own ? "Its space" : room.name} is archived. `;
}

/**
 * What the agent's harness does with its side (ADR 0095, point 4): deletes it for its owner, puts
 * it away for anybody else, as rule 5's switch did; a harness that keeps no rooms keeps its copy.
 */
function deleteSide(directory: Directory, selfId: string, agentId: string): string {
  const harnessId = harnessOf(directory, agentId);
  const harness = nameOf(directory, harnessId);
  if (!followsRooms(directory, harnessId)) return `${harness} keeps its own copy of what was said.`;
  return directory[harnessId]?.ownerId === selfId
    ? `${harness} deletes it as well.`
    : `${harness} archives it on its side, for its owner to delete there.`;
}

/**
 * Whether an agent may be picked for a batch on the Agents tab (ADR 0182): one its swipe would
 * offer Archive and Delete on (`mayKeepAgent`), so never a Main agent, nor somebody else's for a
 * person who doesn't administer the workspace, nor one whose changes are locked (ADR 0199), as a
 * locked room is never picked (ADR 0181).
 */
export function mayPickAgent(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
  agentId: string,
): boolean {
  return mayKeepAgent(model, directory, selfId, agentId);
}

/** The rooms some agents are in, each once, with which of the agents are in it. */
function agentRooms(
  model: WorkspaceModel,
  directory: Directory,
  agentIds: readonly string[],
): { room: AgentRoom; agents: string[] }[] {
  const rooms = new Map<string, { room: AgentRoom; agents: string[] }>();
  for (const id of agentIds) {
    const room = agentRoom(model, directory, id);
    if (room === undefined) continue;
    const had = rooms.get(room.space.id);
    if (had === undefined) rooms.set(room.space.id, { room, agents: [id] });
    else had.agents.push(id);
  }
  return [...rooms.values()];
}

/** Whether every agent in a room is one of those going: the room is left with none. */
function emptied(room: AgentRoom, agents: readonly string[], directory: Directory): boolean {
  return roomAgents(room.space, directory).here.every((id) => agents.includes(id));
}

/** Rooms by name while there are two at most, and by how many past that. */
function roomsWords(names: readonly string[]): string {
  return names.length <= 2 ? listed(names) : `${names.length} of their spaces`;
}

/** Each harness of these agents, once, with how many of them are its: "it" or "them". */
function harnessesOf(
  directory: Directory,
  agentIds: readonly string[],
): { id: string; name: string; them: "it" | "them" }[] {
  const counts = new Map<string, number>();
  for (const id of agentIds) {
    const harnessId = harnessOf(directory, id);
    counts.set(harnessId, (counts.get(harnessId) ?? 0) + 1);
  }
  return [...counts].map(([id, count]) => ({
    id,
    name: nameOf(directory, id),
    them: count === 1 ? "it" : "them",
  }));
}

/** What the harnesses that keep their rooms do with agents archived here. */
function archiveSides(directory: Directory, agentIds: readonly string[]): string {
  const following = harnessesOf(directory, agentIds).filter((each) =>
    followsRooms(directory, each.id),
  );
  const [only] = following;
  if (only === undefined) return "";
  if (following.length === 1) return `${only.name} archives ${only.them} too. `;
  return `${listed(following.map((each) => each.name))} archive theirs too. `;
}

/**
 * What the sheet asking before several agents are archived says (ADR 0182): whose replies stop,
 * which of their rooms are archived with them — each one they leave with no agent in it, unless its
 * changes are locked — and what their harnesses do. One agent is asked about as its swipe asks.
 */
export function agentsArchiveAsking(
  model: WorkspaceModel,
  directory: Directory,
  agentIds: readonly string[],
): Asking {
  const [only] = agentIds;
  if (agentIds.length === 1 && only !== undefined) {
    return agentArchiveAsking(model, directory, only);
  }
  const count = agentIds.length;
  const rooms = agentRooms(model, directory, agentIds);
  const busy = rooms.flatMap(({ room, agents }) => {
    const at = working(room.space, directory);
    return agents.map((id) => nameOf(directory, id)).filter((name) => at.includes(name));
  });
  const stopped =
    busy.length === 0
      ? ""
      : ` ${listed(busy.map((name) => `${name}'s`))} ${busy.length === 1 ? "reply" : "replies"} will be stopped.`;
  const closing = rooms
    .filter(({ room, agents }) => emptied(room, agents, directory) && room.space.locked !== true)
    .map(({ room }) => room.name);
  const withThem =
    closing.length === 0
      ? ""
      : ` ${roomsWords(closing)} ${closing.length === 1 ? "is" : "are"} archived with them, since no other agent is there.`;
  const there = archiveSides(directory, agentIds);
  // Free agents are in no room to leave.
  const leaving =
    rooms.length === 0 ? "They move to Archived." : "They leave their spaces and move to Archived.";
  return {
    title: `Archive ${count} agents?`,
    body: `${leaving}${stopped}${withThem}`,
    note: `${there}Unarchive brings them back${closing.length === 0 ? "" : ", and the spaces archived with them"}.`,
    confirm: `Archive ${count}`,
  };
}

/**
 * What the sheet asking before several agents are deleted says (ADR 0182): that they go for
 * everyone and their words stay, the one switch that erases the rooms they leave empty — those this
 * person may delete — what becomes of the rest, and what their harnesses do. One agent is asked
 * about as its swipe asks.
 */
export function agentsDeleteAsking(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
  agentIds: readonly string[],
): Asking {
  const [only] = agentIds;
  if (agentIds.length === 1 && only !== undefined) {
    return agentDeleteAsking(model, directory, selfId, only);
  }
  const count = agentIds.length;
  const empty = agentRooms(model, directory, agentIds)
    .filter(({ room, agents }) => emptied(room, agents, directory))
    .map(({ room }) => room);
  const roomsToo = roomsTooOf(empty.filter((room) => mayErase(model, room.space, selfId)));
  const switched = new Set(roomsToo?.spaceIds ?? []);
  const notes = [
    ...leftRooms(empty.filter((room) => !switched.has(room.space.id))),
    ...deleteSides(directory, selfId, agentIds),
  ];
  return {
    title: `Delete ${count} agents?`,
    body: "They go from Chips for everyone, and don't come back. What they said stays in the spaces they were in, under their names.",
    ...(notes.length === 0 ? {} : { note: notes.join(" ") }),
    confirm: `Delete ${count}`,
    ...(roomsToo === undefined ? {} : { roomsToo }),
  };
}

type AgentRoom = NonNullable<ReturnType<typeof agentRoom>>;

/** The switch for the rooms a delete leaves empty, worded as an agent's own for one room. */
function roomsTooOf(rooms: readonly AgentRoom[]): RoomsToo | undefined {
  const [first] = rooms;
  if (first === undefined) return undefined;
  if (rooms.length === 1) {
    return {
      label: `Delete the space \u201c${first.name}\u201d too`,
      on: "The space and everything said in it are erased from the server.",
      off: "The space stays, archived, with everything said in it.",
      spaceIds: [first.space.id],
    };
  }
  return {
    label: `Delete their ${rooms.length} spaces too`,
    on: "The spaces and everything said in them are erased from the server.",
    off: "The spaces stay, archived, with everything said in them.",
    spaceIds: rooms.map((room) => room.space.id),
  };
}

/** What becomes of the rooms a delete leaves empty that the switch is not about. */
function leftRooms(rooms: readonly AgentRoom[]): string[] {
  const archived = rooms.filter((room) => room.space.locked !== true).map((room) => room.name);
  const locked = rooms.filter((room) => room.space.locked === true).map((room) => room.name);
  const one = locked.length === 1;
  return [
    ...(archived.length === 0
      ? []
      : [`${roomsWords(archived)} ${archived.length === 1 ? "is" : "are"} archived.`]),
    ...(locked.length === 0
      ? []
      : [
          `${listed(locked)} ${one ? "stays" : "stay"} open: ${one ? "its" : "their"} changes are locked.`,
        ]),
  ];
}

/** What each harness of several agents being deleted does with its side, once a harness. */
function deleteSides(directory: Directory, selfId: string, agentIds: readonly string[]): string[] {
  return harnessesOf(directory, agentIds).map(({ id, name, them }) => {
    if (!followsRooms(directory, id)) return `${name} keeps its own copy of what was said.`;
    return directory[id]?.ownerId === selfId
      ? `${name} deletes ${them} as well.`
      : `${name} archives ${them} on its side, for its owner to delete there.`;
  });
}

/**
 * Which of several agents being deleted take their room with them (ADR 0182): of the rooms the
 * switch is about, the last of each room's agents in the order given, since the server erases a
 * room only with the one agent left in it.
 */
export function roomGoesWith(
  directory: Directory,
  agentIds: readonly string[],
  spaceIds: readonly string[],
): ReadonlySet<string> {
  const last = new Map<string, string>();
  for (const id of agentIds) {
    const spaceId = directory[id]?.room;
    if (typeof spaceId === "string" && spaceIds.includes(spaceId)) last.set(spaceId, id);
  }
  return new Set(last.values());
}
