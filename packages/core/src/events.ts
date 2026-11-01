/**
 * An event as the client holds it: the envelope fields it always reads, plus whatever else the
 * event carries. The server has already validated it, so the client reads fields without
 * re-checking their shape (the model's `required` vs `field` is about optional, not about
 * trust).
 */

import { type AgentState, HARNESS_CAPABILITIES, type SpaceIcon } from "@chipschat/protocol";

export interface ClientEvent {
  readonly seq: number;
  readonly type: string;
  readonly id: string;
  readonly ts: string;
  readonly workspace_id: string;
  readonly space_id?: string;
  readonly run_id?: string;
  /** Who did it; for an agent, the harness it spoke through (ADR 0087). */
  readonly actor: { readonly kind: string; readonly id: string; readonly harness_id?: string };
  readonly [field: string]: unknown;
}

/** A person, harness or agent by id, for naming authors the event stream only gives an id. */
export interface Participant {
  readonly id: string;
  /**
   * A person; a harness, the software behind agents; or an agent (ADR 0087), who takes part in
   * rooms. A kind this build has never heard of is read as a harness.
   */
  readonly kind: "person" | "harness" | "agent";
  /** For an agent: the harness it speaks through, whose presence and connection are its. */
  readonly harnessId?: string | undefined;
  readonly displayName: string;
  readonly ownerId?: string | undefined;
  /** A person's standing in the workspace (ADR 0034), as the directory reports it. */
  readonly role?: "owner" | "admin" | "member" | "guest" | undefined;
  /**
   * For a guest (ADR 0034): the one space they are in, whatever its state, or `null` while they
   * are in none. Absent for everybody else, and from a server older than it.
   */
  readonly guestOf?: string | null | undefined;
  /** What a harness declared it can do, as registered (ADR 0046). Absent when it declared nothing. */
  readonly capabilities?: readonly string[] | undefined;
  /**
   * When a person removed the harness from the workspace (ADR 0078). It is still here to name
   * what it said, and every list a person picks from leaves it out.
   */
  readonly removedAt?: string | undefined;
  /**
   * When one of a harness's tokens was last used, or `null` when the server says none ever was:
   * whether it has ever connected, never whether it is connected now. Absent for a person, and
   * from a server older than the field, which says nothing either way.
   */
  readonly lastSeenAt?: string | null | undefined;
  /**
   * Whether a harness can answer now (ADR 0083): a socket of it open, and any trouble it said it
   * is in. Kept current by the `presence` frame. Absent for a person, for a removed harness, and
   * from a server older than it.
   */
  readonly state?: AgentState | undefined;
  /**
   * For an agent (ADR 0087): the open room it is in, one at a time, or `null` while it is free.
   * Absent from a server older than it.
   */
  readonly room?: string | null | undefined;
  /** For an agent: archived in its harness, so offered nowhere. */
  readonly archived?: boolean | undefined;
  /** For an agent: its harness's Main agent, which stays in its Main room. */
  readonly lead?: boolean | undefined;
  /** For an agent: how many of its words wait for its next room (rule 6), *1 waiting*. */
  readonly held?: number | undefined;
  /** For a free agent: the room an archive took it out of, which an unarchive brings it back to. */
  readonly releasedFrom?: string | null | undefined;
  /** For an agent: the room it was last taken out of. */
  readonly lastRoom?: string | null | undefined;
  /** For a fork's copy (ADR 0087, Fork): the agent it is a copy of. */
  readonly forkedFrom?: string | undefined;
  /**
   * For an agent (ADR 0199): its changes locked by a person, so that nobody renames, archives or
   * deletes it until somebody lets them go. Absent for one that never was, or was let go again.
   */
  readonly locked?: boolean | undefined;
  /**
   * For an agent (ADR 0089): the face a person chose for it, a mark and the index of its ground,
   * the same for everybody. For a person (ADR 0139): the face they chose for themselves, the same.
   * A mark may be letters instead. Absent while it wears its initials.
   */
  readonly face?: SpaceIcon | undefined;
  /**
   * For a harness waiting in a room under the first name held for its agent (ADR 0150), as the
   * room's directory has it (`roomDirectory`): the harness's own name. Absent everywhere else.
   */
  readonly harnessName?: string | undefined;
}

/** Names for the ids in the stream, fetched once from `GET /v1/participants`. */
export type Directory = Readonly<Record<string, Participant>>;

/** The name to show for a participant id, falling back to something legible. */
export function nameOf(directory: Directory, id: string): string {
  return directory[id]?.displayName ?? shorten(id);
}

/**
 * Id prefixes that are never a person's: a harness's, and an agent's, which a server that has
 * agents (ADR 0087) names participants by. Only a person's id is not one of these.
 */
const NOT_A_PERSON = ["hrn_", "agt_"];

/**
 * Whether an id is a person or a harness, for a view that has to draw one or the other and
 * cannot wait. The directory answers when it knows; when it does not — an id from a trail
 * written before this client fetched the room — the prefix does, because a face on a card is a
 * circle or a squircle and there is no third shape to fall back to. A kind this build has never
 * heard of is not a person's, and is drawn as a harness is (ADR 0088's forward tolerance), so a
 * build installed now survives a server that has grown one.
 */
export function participantKind(directory: Directory, id: string): "person" | "harness" {
  const kind = directory[id]?.kind as string | undefined;
  if (kind !== undefined) return kind === "person" ? "person" : "harness";
  return NOT_A_PERSON.some((prefix) => id.startsWith(prefix)) ? "harness" : "person";
}

/**
 * How a participant's face is drawn (ADR 0089): a person's, an agent's, or a harness's. An agent
 * wears an outline of its own and the face a person chose for it, so a screen that draws one asks
 * this rather than `participantKind`, which answers *harness* for both. An id the directory does
 * not have is read by its prefix, as `participantKind` reads it.
 */
export function faceKind(directory: Directory, id: string): "person" | "agent" | "harness" {
  const kind = directory[id]?.kind as string | undefined;
  if (kind === "agent" || (kind === undefined && id.startsWith("agt_"))) return "agent";
  return participantKind(directory, id);
}

/**
 * The face chosen for somebody, when one was: an agent's (ADR 0089) or a person's own (ADR 0139).
 */
export function faceOf(directory: Directory, id: string): SpaceIcon | undefined {
  return directory[id]?.face;
}

/**
 * Whether a participant takes part in rooms as an agent (ADR 0087): an agent, or a harness still
 * in a room from before the upgrade gave it one — which Phase 2 alone allows, and Phase 7 takes
 * away. Every reader of "who in the room answers" asks this, so that change is one line.
 */
export function isAgent(directory: Directory, id: string): boolean {
  return participantKind(directory, id) === "harness";
}

/**
 * The harness a participant speaks through: an agent's, or a harness itself. What presence, the
 * connection and "never connected" are kept on (ADR 0083, ADR 0087).
 */
export function harnessOf(directory: Directory, id: string): string {
  const known = directory[id];
  return known?.kind === "agent" && known.harnessId !== undefined ? known.harnessId : id;
}

/**
 * Whose an agent is, for its page's Belongs to row (ADR 0196): its harness's owner's name, when
 * that is somebody other than the reader. Chips knows who owns a harness, not which computer runs
 * it, so the row names a person rather than a machine.
 */
export function belongsTo(
  directory: Directory,
  agentId: string,
  selfId: string,
): string | undefined {
  const ownerId = directory[harnessOf(directory, agentId)]?.ownerId;
  if (ownerId === undefined || ownerId === selfId) return undefined;
  return directory[ownerId]?.displayName;
}

/** The harness an event came through: its agent's, or the harness itself (ADR 0087). */
export function harnessOfActor(actor: {
  readonly id: string;
  readonly harness_id?: string;
}): string {
  return actor.harness_id ?? actor.id;
}

/**
 * Who did something, as this build draws them: a person, Chips itself, or anything else — a
 * harness, or a kind of participant from a newer server — as a harness.
 */
export function actorKind(actor: { readonly kind: string }): "person" | "harness" | "system" {
  return actor.kind === "person" || actor.kind === "system" ? actor.kind : "harness";
}

/**
 * Whether a harness takes the autonomy dial — reads the level and the rules Chips sends it and
 * asks accordingly — which is what makes the dial worth drawing (ADR 0046). It says so in its
 * manifest; a harness that has not said so, or that the directory has no row for, gets no dial,
 * because a control that changes nothing the harness can see is a lie with a label.
 */
export function takesAutonomy(directory: Directory, harnessId: string): boolean {
  const harness = directory[harnessOf(directory, harnessId)];
  return harness?.capabilities?.includes(HARNESS_CAPABILITIES.autonomy) ?? false;
}

/**
 * Whether a harness has a restart of its own and runs it when a person asks (ADR 0094). Its
 * manifest says so (`restarts`); the server refuses to ask one that has not, and only then is
 * Restart drawn on its page.
 */
export function takesRestarts(directory: Directory, harnessId: string): boolean {
  const harness = directory[harnessOf(directory, harnessId)];
  return harness?.capabilities?.includes(HARNESS_CAPABILITIES.restarts) ?? false;
}

/**
 * Whether a harness takes a new room a person asks it into, and claims it with a thing of its
 * own. Its manifest says so (`new_spaces`); the server refuses to ask one that has not, so a
 * client asks this before offering it.
 */
export function takesNewSpaces(directory: Directory, harnessId: string): boolean {
  const harness = directory[harnessOf(directory, harnessId)];
  return harness?.capabilities?.includes(HARNESS_CAPABILITIES.newSpaces) ?? false;
}

/**
 * Whether a harness keeps its side of a room it opened in step with the room — carries a
 * person's archive over, deletes its own thing on a delete (`follows_rooms`). Only then do the
 * sheets that ask first promise it on the harness's behalf.
 */
export function followsRooms(directory: Directory, harnessId: string): boolean {
  const harness = directory[harnessOf(directory, harnessId)];
  return harness?.capabilities?.includes(HARNESS_CAPABILITIES.followsRooms) ?? false;
}

/** Whether a harness was removed from the workspace (ADR 0078): named still, and offered nowhere. */
export function isRemoved(directory: Directory, id: string): boolean {
  return directory[id]?.removedAt !== undefined;
}

/**
 * The harnesses in the workspace, by name: what the Harnesses list shows. Not one that was
 * removed, whose name the directory keeps only for what it said (ADR 0078).
 */
export function workspaceHarnesses(directory: Directory): Participant[] {
  return Object.values(directory)
    .filter((each) => each.kind === "harness" && each.removedAt === undefined)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * The harnesses a new space can be asked of, by name. None, and there is no + to draw: a room
 * asked of nobody who answers is a room that waits for ever. A removed harness answers nobody.
 */
export function newSpaceHarnesses(directory: Directory): Participant[] {
  return workspaceHarnesses(directory).filter((each) => takesNewSpaces(directory, each.id));
}

/**
 * Whether this is a guest who is in an open room already (ADR 0034). A guest is in one open room
 * at most, an archived one aside (JR-24), and the server refuses them a second, so no list offers
 * them one (finding PP-2: a walk with a second person was offered a guest, and then refused).
 */
export function guestElsewhere(directory: Directory, id: string): boolean {
  return typeof directory[id]?.guestOf === "string";
}

/**
 * Who can be added to a room with these members: anybody in the directory not in it already,
 * but never a harness that was removed, which the server refuses (ADR 0078), nor a guest who is in
 * another space. A harness is added as its default agent, so one with an agent here already is not
 * offered again; and an agent is not offered on its own — picking one agent that may be in another
 * room is Phase 4's Move (ADR 0087's addendum, point 5).
 */
export function addableTo(directory: Directory, members: readonly string[]): Participant[] {
  const harnessesHere = new Set(members.map((id) => harnessOf(directory, id)));
  return Object.values(directory).filter(
    (each) =>
      each.kind !== "agent" &&
      !members.includes(each.id) &&
      !harnessesHere.has(each.id) &&
      each.removedAt === undefined &&
      !guestElsewhere(directory, each.id),
  );
}

/**
 * What a room with no title is called: who is in it, and the person reading first, as "You". The
 * demo named its first person "You", so every such room read "You, Scout" by accident; once a
 * person could take their own name (ADR 0082) the same room read "Arjun, Scout" in Arjun's own
 * list. Without a reader, everybody by name. In core so the phone and the desktop say the same.
 */
export function membersName(
  members: readonly string[],
  directory: Directory,
  selfId?: string | undefined,
): string {
  const others = members.filter((id) => id !== selfId).map((id) => nameOf(directory, id));
  const names = selfId !== undefined && members.includes(selfId) ? ["You", ...others] : others;
  return names.length === 0 ? "Space" : names.join(", ");
}

/**
 * Whether the server says a harness has never connected: no token of its has ever been used. A
 * harness starts hearing a room from its first connection, so what was said before that is heard
 * by nobody (the OpenClaw test, finding 18). A harness the server says nothing of is not claimed.
 */
export function neverConnected(directory: Directory, harnessId: string): boolean {
  const harness = directory[harnessOf(directory, harnessId)];
  return harness?.kind === "harness" && harness.lastSeenAt === null;
}

/** `hrn_01K4…7Z` → `hrn_…7Z`, so an unknown id is at least recognisable as one. */
function shorten(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 4)}…${id.slice(-2)}`;
}
