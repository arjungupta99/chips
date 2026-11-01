/**
 * Who a person sees and what they may do, worked out from their role and the rooms they are in, as
 * You's People, a person's page and Invite someone say it on the phone and the desktop alike (ADR
 * 0209, his "A · Roster" of 20 October 2026). The rules are the ones the door keeps: a guest sees
 * the people and agents of their one room (ADR 0034); anybody else sees every person, and the
 * agents in their rooms and of their own harnesses, unless they run the workspace, when they see
 * every agent (the 19 October addendum, `showsAgent`).
 *
 * Only the rooms the reader is in reach them (events are a room's members' alone), so a person's
 * rooms here are the ones the reader shares with them. An owner is in most.
 *
 * And the links: which one brought a person, who joined by each, how long each has left, and what
 * You's rows say of both lists at a glance.
 */

import { type Directory, harnessOf, isRemoved, nameOf } from "./events.js";
import type { PersonModel, Space, WorkspaceModel, WorkspaceRole } from "./model.js";
import { administers, spaceTitle } from "./model.js";
import { mayInviteToSpace, namesWords, peopleOf, SPACE_INVITE_ROLES } from "./people.js";
import type { Invite } from "./store.js";

/** What somebody sees: rooms, people and agents, by id. */
export interface Seen {
  readonly spaces: readonly string[];
  readonly people: readonly string[];
  readonly agents: readonly string[];
}

/** The open rooms a person is in, that the reader knows: not threads, not archived. */
export function roomsOf(model: WorkspaceModel, personId: string): Space[] {
  return model.spaces.filter(
    (space) =>
      space.parentSpaceId === undefined &&
      space.state !== "closed" &&
      space.members.includes(personId),
  );
}

/** An agent, or a harness in a room as its own agent, neither removed nor archived. */
function isAgent(directory: Directory, id: string): boolean {
  const known = directory[id];
  if (known === undefined || known.kind === "person") return false;
  if (known.kind === "agent" && known.archived === true) return false;
  return !isRemoved(directory, id) && !isRemoved(directory, harnessOf(directory, id));
}

/** Every agent there is, by name: what an owner or an admin sees. */
function everyAgent(directory: Directory): string[] {
  return byName(
    directory,
    Object.values(directory)
      .filter((each) => each.kind === "agent" && isAgent(directory, each.id))
      .map((each) => each.id),
  );
}

/** The agents of the harnesses a person owns, which they see wherever the agents are. */
function ownAgents(directory: Directory, personId: string): string[] {
  return Object.values(directory)
    .filter(
      (each) =>
        each.kind === "agent" &&
        directory[harnessOf(directory, each.id)]?.ownerId === personId &&
        isAgent(directory, each.id),
    )
    .map((each) => each.id);
}

function byName(directory: Directory, ids: readonly string[]): string[] {
  return [...new Set(ids)].sort((a, b) => nameOf(directory, a).localeCompare(nameOf(directory, b)));
}

/** The people of some rooms, the longest here first. */
function peopleIn(model: WorkspaceModel, rooms: readonly Space[]): string[] {
  const there = new Set(rooms.flatMap((space) => space.members));
  return peopleOf(model)
    .map((each) => each.participantId)
    .filter((id) => there.has(id));
}

function agentsIn(directory: Directory, rooms: readonly Space[]): string[] {
  return rooms.flatMap((space) => space.members).filter((id) => isAgent(directory, id));
}

/**
 * What a person sees as this role (theirs, unless another is asked about): the rooms they are in,
 * and the people and agents those let them see, themselves left out.
 */
export function seenBy(
  model: WorkspaceModel,
  directory: Directory,
  personId: string,
  role: WorkspaceRole | undefined = model.people[personId]?.role,
): Seen {
  const rooms = roomsOf(model, personId);
  const everybody = peopleOf(model).map((each) => each.participantId);
  const people = role === "guest" ? peopleIn(model, rooms) : everybody;
  const agents = administers(role)
    ? everyAgent(directory)
    : byName(directory, [
        ...agentsIn(directory, rooms),
        ...(role === "guest" ? [] : ownAgents(directory, personId)),
      ]);
  return {
    spaces: rooms.map((space) => space.id),
    people: people.filter((id) => id !== personId),
    agents,
  };
}

/**
 * What somebody joining by a link will see (ADR 0168): a guest, the people and agents of the room
 * it brings them into; a member, everybody, and that room's agents; an owner or admin, everybody
 * and every agent.
 */
export function inviteSees(
  model: WorkspaceModel,
  directory: Directory,
  role: WorkspaceRole,
  spaceId?: string | undefined,
): Seen {
  const room = model.spaces.find((each) => each.id === spaceId);
  const rooms = room === undefined ? [] : [room];
  return {
    spaces: rooms.map((each) => each.id),
    people:
      role === "guest" ? peopleIn(model, rooms) : peopleOf(model).map((each) => each.participantId),
    agents: administers(role)
      ? everyAgent(directory)
      : byName(directory, agentsIn(directory, rooms)),
  };
}

/** One line of what a person can do: yes or no, the words, and the faces it is about. */
export interface CanDo {
  readonly can: boolean;
  readonly words: string;
  /** People and agents the line names, to draw beside it. */
  readonly faces?: readonly string[] | undefined;
  /** Rooms the line names, to draw beside it. */
  readonly spaces?: readonly string[] | undefined;
}

/**
 * What a person can and can't do here, in a few lines a person's page lists with a tick or a
 * cross: from their role, and for a member or a guest from their rooms too.
 */
export function canDo(
  model: WorkspaceModel,
  directory: Directory,
  personId: string,
  reader: { readonly selfId: string; readonly workspace: string },
): readonly CanDo[] {
  const role = model.people[personId]?.role;
  if (role === "owner") {
    return [
      { can: true, words: "Invites people, changes roles, and removes anybody" },
      { can: true, words: "Sees everybody here, and every agent" },
      { can: true, words: "Opens spaces, and sets what a space may spend" },
    ];
  }
  if (role === "admin") {
    return [
      { can: true, words: "Changes roles, and removes anybody but an owner" },
      { can: true, words: "Sees everybody here, and every agent" },
      { can: true, words: "Opens spaces" },
      { can: false, words: "Can't invite people, or change an owner" },
    ];
  }
  const seen = seenBy(model, directory, personId, role);
  const titles = roomsOf(model, personId).map((space) =>
    spaceTitle(space, directory, reader.selfId),
  );
  const names = (ids: readonly string[]) => ids.map((id) => nameOf(directory, id));
  if (role === "guest") {
    const there = [...seen.people, ...seen.agents];
    return [
      {
        can: true,
        words: titles.length === 0 ? "Is in no space yet" : `Is in ${titles[0]} only`,
        spaces: seen.spaces,
      },
      there.length === 0
        ? { can: true, words: "Sees nobody until they're added to a space" }
        : { can: true, words: `Sees only who's there: ${namesWords(names(there))}`, faces: there },
      { can: false, words: "Can't add anybody, or see any other space" },
    ];
  }
  const own = ownAgents(directory, personId).length > 0;
  return [
    {
      can: true,
      words:
        titles.length === 0
          ? "Works in the spaces they're added to: none yet"
          : `Works in ${namesWords(titles)}, and any space they're added to`,
      spaces: seen.spaces,
    },
    { can: true, words: `Sees everybody in ${reader.workspace}`, faces: seen.people },
    seen.agents.length === 0
      ? { can: true, words: "Sees no agents until they're in a space with one" }
      : {
          can: true,
          words: `Sees ${own ? "their own agents and " : ""}the agents in their spaces: ${namesWords(names(seen.agents))}`,
          faces: seen.agents,
        },
    { can: true, words: "Adds people to their spaces" },
    {
      can: false,
      words: "Can't invite, open a space, or put agents that aren't theirs in a space",
    },
  ];
}

/**
 * What a role change would change in what a person sees, for the page that asks first: who they
 * would stop seeing and start seeing, and for a guest the room they stay in and who is there.
 */
export function roleChangeSees(
  model: WorkspaceModel,
  directory: Directory,
  personId: string,
  to: WorkspaceRole,
  selfId: string,
): {
  readonly stops: readonly string[];
  readonly starts: readonly string[];
  readonly room: string | undefined;
  readonly there: readonly string[];
} {
  const before = seenBy(model, directory, personId);
  const after = seenBy(model, directory, personId, to);
  const was = [...before.people, ...before.agents];
  const will = [...after.people, ...after.agents];
  const room = roomsOf(model, personId)[0];
  return {
    stops: was.filter((id) => !will.includes(id)),
    starts: will.filter((id) => !was.includes(id)),
    room: room === undefined ? undefined : spaceTitle(room, directory, selfId),
    there: will,
  };
}

// ------------------------------------------------------------------------------------- links

/** The link that brought a person, when the reader can read it (an owner lists them). */
export function cameBy(person: PersonModel, invites: readonly Invite[]): Invite | undefined {
  if (person.inviteId === undefined) return undefined;
  return invites.find((each) => each.inviteId === person.inviteId);
}

/**
 * "Your member link to Foodie, made 14 October", or "Sam's guest link, made 3 October, used 3
 * times" for one more than one person came by. The day is the screen's to say.
 */
export function cameByWords(input: {
  readonly invite: Invite;
  /** Who made it, as the reader says it: "you" for their own. */
  readonly by: string;
  readonly space: string | undefined;
  readonly made: string;
}): string {
  const { invite } = input;
  const whose = input.by === "you" ? "Your" : `${input.by}'s`;
  const where = input.space === undefined ? "" : ` to ${input.space}`;
  const used = invite.singleUse || invite.uses <= 1 ? "" : `, used ${invite.uses} times`;
  return `${whose} ${invite.role} link${where}, made ${input.made}${used}`;
}

/** Who joined by a link, the first first. */
export function joinedBy(model: WorkspaceModel, invite: Pick<Invite, "inviteId">): PersonModel[] {
  return peopleOf(model).filter((each) => each.inviteId === invite.inviteId);
}

/** The links somebody here joined by, the newest first, and at most `most` of them. */
export function usedInvites(model: WorkspaceModel, invites: readonly Invite[], most = 8): Invite[] {
  return invites
    .filter((each) => joinedBy(model, each).length > 0)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, most);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A span ahead, as a link's time left says it: "45 min", "20 h", "1 day", "5 days". */
export function spanWords(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.ceil(ms / MINUTE))} min`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h`;
  const days = Math.floor(ms / DAY);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** "5 days left", "20 h left", or "Ran out" for a link past its time. */
export function leftWords(expiresAt: string, now: number): string {
  const left = Date.parse(expiresAt) - now;
  return left <= 0 ? "Ran out" : `${spanWords(left)} left`;
}

/** How much of a link's time is left, from 1 as it is made to 0 as it runs out. */
export function lifeLeft(invite: Pick<Invite, "createdAt" | "expiresAt">, now: number): number {
  const made = Date.parse(invite.createdAt);
  const ends = Date.parse(invite.expiresAt);
  if (!(ends > made)) return 0;
  return Math.min(1, Math.max(0, (ends - now) / (ends - made)));
}

/**
 * Whether a link is near its end, when its ring and its time left go amber: in the last quarter of
 * its own life, and never more than its last day. A fixed day made every link amber from the
 * moment it was made once links lived 30 minutes (ADR 0232); now a 30-minute link turns in its
 * last seven and a half.
 */
export function linkEnding(invite: Pick<Invite, "createdAt" | "expiresAt">, now: number): boolean {
  const made = Date.parse(invite.createdAt);
  const ends = Date.parse(invite.expiresAt);
  return ends - now < Math.min(DAY, (ends - made) / 4);
}

/**
 * What a link made once says when somebody has joined by it: "Used: Bea joined by it". Nothing
 * while it can still be used, and nothing for a link made for several, which a join doesn't use up.
 */
export function linkUsedWords(
  model: WorkspaceModel,
  directory: Directory,
  invite: Pick<Invite, "inviteId" | "singleUse">,
): string | undefined {
  if (!invite.singleUse) return undefined;
  const came = joinedBy(model, invite);
  if (came.length === 0) return undefined;
  return `Used: ${namesWords(came.map((each) => nameOf(directory, each.participantId)))} joined by it`;
}

/**
 * What You's Invite someone row says of the open links: "2 open links · the next runs out in
 * 20 h", "1 open link · runs out in 5 days", or nothing while there are none.
 */
export function openLinksWords(live: readonly Invite[], now: number): string | undefined {
  if (live.length === 0) return undefined;
  const next = Math.min(...live.map((each) => Date.parse(each.expiresAt)));
  const count = `${live.length} open ${live.length === 1 ? "link" : "links"}`;
  return `${count} · ${live.length === 1 ? "runs" : "the next runs"} out in ${spanWords(next - now)}`;
}

// ------------------------------------------------------------------------------------- people

const COUNTED: readonly (readonly [WorkspaceRole, string, string])[] = [
  ["owner", "owner", "owners"],
  ["admin", "admin", "admins"],
  ["member", "member", "members"],
  ["guest", "guest", "guests"],
];

/** What You's People row says under its name: "1 owner · 1 admin · 2 members · 1 guest". */
export function roleCountWords(model: WorkspaceModel): string {
  const people = peopleOf(model);
  return COUNTED.map(([role, one, many]) => {
    const count = people.filter((each) => each.role === role).length;
    return count === 0 ? undefined : `${count} ${count === 1 ? one : many}`;
  })
    .filter((each) => each !== undefined)
    .join(" · ");
}

/** The ways People narrows its list: everybody, those who run it, members, guests. */
export type PeopleFilter = "all" | "runs" | "member" | "guest";

/** Whether a person is in a filter's part of the list. */
export function inFilter(person: Pick<PersonModel, "role">, filter: PeopleFilter): boolean {
  if (filter === "all") return true;
  if (filter === "runs") return administers(person.role);
  return person.role === filter;
}

/** The filters People offers, each with how many it holds: one with nobody in it is left out. */
export function peopleFilters(
  people: readonly Pick<PersonModel, "role">[],
): readonly { readonly key: PeopleFilter; readonly label: string; readonly count: number }[] {
  const all: readonly (readonly [PeopleFilter, string])[] = [
    ["all", "All"],
    ["runs", "Owners and admins"],
    ["member", "Members"],
    ["guest", "Guests"],
  ];
  return all
    .map(([key, label]) => ({
      key,
      label,
      count: people.filter((each) => inFilter(each, key)).length,
    }))
    .filter((each) => each.key === "all" || each.count > 0);
}

/** A person's rooms on their People row: "Foodie, Garden and 3 more", or nothing for none. */
export function spacesLine(titles: readonly string[]): string | undefined {
  return titles.length === 0 ? undefined : namesWords(titles, 2);
}

// ------------------------------------------------------------------------------------- invites

/** The rooms Invite someone offers to bring somebody into: those a link may name (ADR 0168). */
export function inviteSpaces(model: WorkspaceModel, directory: Directory, selfId: string): Space[] {
  return model.spaces
    .filter((space) => mayInviteToSpace(space, model, selfId))
    .sort((a, b) =>
      spaceTitle(a, directory, selfId).localeCompare(spaceTitle(b, directory, selfId)),
    );
}

/**
 * What Invite someone says under who they'll see, as the role and room change: "A guest in Bakery
 * sees only who's there: Arjun, Priya and Scout. Nothing else in Demo."
 */
export function inviteSeesWords(input: InviteSeen): string {
  if (input.role === "guest") return guestSeesWords(input);
  if (input.role === "member") return memberSeesWords(input);
  if (input.role === "admin") {
    return "An admin sees everybody and every agent, changes roles, and removes anybody but an owner. Only an owner invites.";
  }
  return "An owner does everything: invites people, changes roles, and removes anybody.";
}

interface InviteSeen {
  readonly role: WorkspaceRole;
  readonly workspace: string;
  /** The room the link brings them into, by name. */
  readonly space?: string | undefined;
  /** Who and what they'll see there, by name: people, then agents. */
  readonly people: readonly string[];
  readonly agents: readonly string[];
}

function guestSeesWords({ space, workspace, people, agents }: InviteSeen): string {
  if (space === undefined)
    return "A guest in no space sees nobody until somebody adds them to one.";
  const there = [...people, ...agents];
  return there.length === 0
    ? `A guest in ${space} sees only who's there. Nothing else in ${workspace}.`
    : `A guest in ${space} sees only who's there: ${namesWords(there, 4)}. Nothing else in ${workspace}.`;
}

function memberSeesWords({ space, agents }: InviteSeen): string {
  const theirs =
    agents.length > 0
      ? namesWords(agents, 4)
      : space === undefined
        ? "none until they're added to one"
        : `none in ${space} yet`;
  const who = space === undefined ? "A member sees" : `A member starts in ${space}. They see`;
  return `${who} everybody here, and only the agents in their spaces: ${theirs}.`;
}

/**
 * What Invite someone says under the room a link brings somebody into: where they land, and what
 * happens there; or, for an admin or an owner, that a space's link is not theirs.
 */
export function inviteIntoWords(role: WorkspaceRole, room: string | undefined): string {
  if (!SPACE_INVITE_ROLES.includes(role)) {
    return "A space's link is for a guest or a member. Add an admin or owner to spaces afterwards.";
  }
  if (room === undefined) {
    return role === "guest"
      ? "They join in no space, and wait there until somebody adds them to one."
      : "They join in no space. Add them to spaces afterwards.";
  }
  return role === "guest"
    ? `They land in ${room}, and stay there: a guest is in one space.`
    : `They land in ${room}, and can be added to other spaces later.`;
}
