/**
 * The workspace's people as You and a room's sheet draw them, on the phone and the desktop
 * (ADR 0034, ADR 0160; `docs/proposals/people-first-class-review.md`, Phase 1): what each role is
 * called and may do, who invites and for how long, the roles a changer may set and what each change
 * asks first, how a person stands in a room, and what taking somebody out of a room, or leaving
 * one, asks first. In core for the reason `removal.ts` is: both apps offer the same things to the
 * same people as the door allows, in the same words.
 */

import { APP_STORE_LINK, FIRST_PERSON_NAME } from "@chipschat/protocol";
import { type Directory, harnessOf, nameOf } from "./events.js";
import type { PersonModel, Space, WorkspaceModel, WorkspaceRole } from "./model.js";
import { administers, myRole, spaceTitle } from "./model.js";
import type { Asking } from "./putAway.js";
import { roomName } from "./rooms.js";
import type { Invite } from "./store.js";
import { withArticle } from "./welcome.js";

export const ROLE_WORDS: Readonly<Record<WorkspaceRole, string>> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  guest: "Guest",
};

/**
 * How the reader reads themselves among people: "Arjun (you)". An owner nobody has named yet goes
 * by "You", and "You (you)" says it twice (NP-1): they are "You", once, on Pair it as, People and
 * their own page alike.
 */
export function selfLabel(name: string): string {
  return name === FIRST_PERSON_NAME ? name : `${name} (you)`;
}

/**
 * The line under your name at the top of You, on the phone and the desktop alike (ADR 0085): your
 * role here, and where here is, "Owner · Demo"; the workspace alone while the role is unread.
 */
export function standingWords(role: WorkspaceRole | undefined, workspace: string): string {
  return role === undefined ? workspace : `${ROLE_WORDS[role]} · ${workspace}`;
}

/**
 * A guest's line under their name: the one space they are in and who let them in, "Guest in Japan
 * trip · invited by Arjun" (ADR 0196). A workspace is a word a guest never needs. Nothing while
 * they are in no space yet, and `standingWords` says it.
 */
export function guestStandingWords(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
): string | undefined {
  const space = model.spaces.find((each) => each.state === "open" && each.members.includes(selfId));
  if (space === undefined) return undefined;
  const invitedBy = model.people[selfId]?.invitedBy;
  const by = invitedBy === undefined ? "" : ` · invited by ${nameOf(directory, invitedBy)}`;
  return `Guest in ${roomName(model, space.id, directory)}${by}`;
}

/** What each role may do, as a sentence: under a role picked for an invite or a person. */
export const ROLE_MEANS: Readonly<Record<WorkspaceRole, string>> = {
  owner: "An owner does everything: invites people, changes roles, and removes anybody.",
  admin: "An admin changes roles and removes anybody but an owner. Only an owner invites.",
  member:
    "A member works in the spaces they're added to, and adds people to them. They see everybody here, and only the agents in their spaces.",
  guest:
    "A guest is in one space: the first one they're added to. They see only the people and agents there.",
};

/** Inviting is an owner's alone (his call of 14 October 2026; ADR 0034's addendum). */
export function mayInvite(role: WorkspaceRole | undefined): boolean {
  return role === "owner";
}

/**
 * Opening a space is an owner's or an admin's (his call of 18 October 2026, ADR 0196): a space a
 * member opened would be answered by the workspace's agents, on the owner's computer and account.
 * The server refuses a member's new space; every + and "new room" in both apps asks this first.
 */
export function mayOpenSpace(role: WorkspaceRole | undefined): boolean {
  return administers(role);
}

/** Naming the workspace again is an owner's alone, as inviting is (ADR 0194). */
export function mayRenameWorkspace(role: WorkspaceRole | undefined): boolean {
  return role === "owner";
}

/**
 * What Can be used means, under it: whom the link lets in, and when it stops. Every link lasts 30
 * minutes, and there is no choosing longer (ADR 0232).
 */
export function inviteUsesMeans(uses: "once" | "open"): string {
  if (uses === "once") {
    return "The first person to join by it uses it up. Unused, it stops working after 30 minutes.";
  }
  return "Everyone you send it to can join by it, until it stops working after 30 minutes or you withdraw it.";
}

/** The links that still let somebody in: not withdrawn, not spent, not expired. */
export function liveInvites(invites: readonly Invite[], nowMs: number): Invite[] {
  return invites.filter(
    (each) =>
      each.revokedAt === undefined &&
      !(each.singleUse && each.uses > 0) &&
      Date.parse(each.expiresAt) > nowMs,
  );
}

/** How a link is used, as its row says: "Once", or "By several, used 2 times". */
export function inviteUseWords(invite: Pick<Invite, "singleUse" | "uses">): string {
  if (invite.singleUse) return "Once";
  return `By several, used ${invite.uses} ${invite.uses === 1 ? "time" : "times"}`;
}

/**
 * What Share sends with a link: how to get Chips first, then the link (the guest walk, 18 October
 * 2026; the onboarding audit, items 1 and 41). With a relay the link is the relay's page, which on
 * an iPhone with Chips opens the app at the invite (ADR 0207), and without Chips says where to get
 * it too. The store's link holds no `invite=`, so Paste still finds the invite in the words.
 */
export function inviteShareWords(url: string, store: string = APP_STORE_LINK): string {
  return `No Chips yet? Get it on the App Store for iPhone or iPad: ${store}\n\nThen tap this link to join:\n\n${url}`;
}

/** Everyone in the workspace, the longest here first. */
export function peopleOf(model: WorkspaceModel): PersonModel[] {
  return Object.values(model.people).sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
}

/** Who let somebody in, as the reader says it: "you" for their own invites. */
export function invitedByWords(
  invitedBy: string | undefined,
  selfId: string,
  directory: Directory,
): string | undefined {
  if (invitedBy === undefined) return undefined;
  return invitedBy === selfId ? "you" : nameOf(directory, invitedBy);
}

/**
 * The roles this changer may set for this person, their own among them, or nothing when they may
 * not: an admin never touches an owner or makes one, and the last owner stays. The door says the
 * same (rule 11).
 */
export function rolesOffered(
  changer: WorkspaceRole | undefined,
  person: PersonModel,
  owners: number,
): readonly WorkspaceRole[] {
  if (!administers(changer)) return [];
  if (changer === "admin" && person.role === "owner") return [];
  const all: WorkspaceRole[] = ["owner", "admin", "member", "guest"];
  return all.filter((role) => {
    if (role === "owner" && changer !== "owner") return false;
    if (person.role === "owner" && role !== "owner" && owners <= 1) return false;
    return true;
  });
}

/**
 * The rooms a person and the reader are both in (threads aside), as the reader's list has them:
 * a person's page draws each with its face (ADR 0209's addendum).
 */
export function sharedSpaces(model: WorkspaceModel, personId: string, selfId: string): Space[] {
  return model.spaces.filter(
    (space) =>
      space.parentSpaceId === undefined &&
      space.members.includes(personId) &&
      space.members.includes(selfId),
  );
}

/**
 * Whether somebody besides the reader reads this room (ADR 0234), which the Spaces row and its
 * details say with the shared tag: another person in it, or an agent somebody else owns, whose
 * owner can read what it is told. The reader's own agents never count, wherever their harness
 * runs, nor does an agent whose harness has no owner on record: there is nobody to name. A thread
 * is its room's, so it says nothing of its own.
 */
export function isShared(space: Space, directory: Directory, selfId: string): boolean {
  if (space.parentSpaceId !== undefined) return false;
  return space.members.some((id) => {
    if (id === selfId) return false;
    if (directory[id]?.kind === "person") return true;
    const ownerId = directory[harnessOf(directory, id)]?.ownerId;
    return ownerId !== undefined && ownerId !== selfId;
  });
}

/** The open spaces the reader shares with this person, by title: a person's page lists them. */
export function spacesShared(
  model: WorkspaceModel,
  directory: Directory,
  personId: string,
  selfId: string,
): string[] {
  return sharedSpaces(model, personId, selfId).map((space) => spaceTitle(space, directory, selfId));
}

/**
 * Why this person can't be made a guest, or nothing when they can: a guest is in one space at
 * most, and the door refuses somebody in more (Gate 5). The reader counts only the spaces they can
 * see, so the door may still refuse; it says why, and the screen shows it.
 */
export function guestRefusal(model: WorkspaceModel, personId: string): string | undefined {
  const spaces = model.spaces.filter(
    (space) => space.parentSpaceId === undefined && space.members.includes(personId),
  ).length;
  return spaces > 1 ? `In ${spaces} spaces: a guest is in one` : undefined;
}

const A: Readonly<Record<WorkspaceRole, string>> = {
  owner: "an owner",
  admin: "an admin",
  member: "a member",
  guest: "a guest",
};

const THEY_CAN: Readonly<Record<WorkspaceRole, string>> = {
  owner: "can do everything you can: invite people, change roles, and remove anybody.",
  admin: "can change roles and remove anybody but an owner. Only an owner invites.",
  member: "can work in the spaces they're added to, and add people and agents to them.",
  guest: "stays in one space and sees only the people and agents there.",
};

/**
 * What a role change asks first: what the person will be able to do, and that it can be undone.
 * Given what the change does to what they see (core's `roleChangeSees`, by name), it says that
 * too: who they stop seeing, who they start seeing, and for a guest the room they stay in and who
 * is there (ADR 0209).
 */
export function roleChangeAsking(input: {
  readonly name: string;
  readonly to: WorkspaceRole;
  /** True when the reader is changing their own role. */
  readonly yourself?: boolean | undefined;
  readonly sees?:
    | {
        readonly stops: readonly string[];
        readonly starts: readonly string[];
        readonly room: string | undefined;
        readonly there: readonly string[];
      }
    | undefined;
}): Asking {
  const { name, to, sees } = input;
  if (input.yourself === true) {
    return {
      title: `Make yourself ${A[to]}?`,
      body: `You ${THEY_CAN[to].replace("can do everything you can", "can do everything")}`,
      note: "Only an owner can make you an owner again.",
      confirm: `Make ${ROLE_WORDS[to].toLowerCase()}`,
    };
  }
  const undo =
    to === "owner" ? "Only an owner can undo it." : "You can change it back at any time.";
  const body =
    to === "guest" && sees?.room !== undefined
      ? `${name} stays in ${sees.room}, and sees only who's there${sees.there.length === 0 ? "" : `: ${namesWords(sees.there, 4)}`}.`
      : `${name} ${THEY_CAN[to]}`;
  const changes = [
    ...(sees === undefined || sees.stops.length === 0
      ? []
      : [
          `They stop seeing ${namesWords(sees.stops, 4)}${to === "guest" ? ", and can't add anybody" : ""}.`,
        ]),
    ...(sees === undefined || sees.starts.length === 0
      ? []
      : [`They'll see ${namesWords(sees.starts, 4)} too.`]),
  ];
  return {
    title: `Make ${name} ${A[to]}?`,
    body,
    note: [...changes, undo].join(" "),
    confirm: `Make ${ROLE_WORDS[to].toLowerCase()}`,
  };
}

/** "Scout", "Scout and Ledger", "Scout, Ledger and Atlas", and past `most`, "… and 4 more". */
export function namesWords(names: readonly string[], most = 3): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length > most) {
    const shown = names.slice(0, most - 1);
    return `${shown.join(", ")} and ${names.length - shown.length} more`;
  }
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * How a person stands in a room, as its sheet says it: the room's owner, or an owner or admin of
 * the workspace, named as such, since they can take others out; a guest; everyone else a member.
 */
export function standingInRoom(space: Space, model: WorkspaceModel, personId: string): string {
  if (space.roles[personId] === "owner") return ROLE_WORDS.owner;
  const role = model.people[personId]?.role;
  if (role === "owner" || role === "admin") return ROLE_WORDS[role];
  if (role === "guest" || space.roles[personId] === "guest") return ROLE_WORDS.guest;
  return ROLE_WORDS.member;
}

/** What taking somebody out of a room asks first (his call of 14 October 2026: it asks). */
export function takeOutAsking(input: { readonly name: string; readonly room: string }): Asking {
  const { name, room } = input;
  return {
    title: `Take ${name} out of ${room}?`,
    body: `${name} sees that you took them out, where the space was. What ${name} said stays.`,
    note: "You can add them back, and they find the space whole.",
    confirm: "Take out",
  };
}

/**
 * Whether the reader may leave this room from its sheet: they are in it, it is not a thread (whose
 * people are its space's), somebody else is in it to add them back, and they are not the
 * workspace's owner. Alone in a room, they put it away instead: archive or delete. The owner's
 * agents are the ones answering there, and Jacobian answers a room only with an owner in it (ADR
 * 0204), so Arjun's "owner should not be offered to leave room" of 19 October 2026, under Foodie's
 * Leave Foodie. The workspace's role is the model's, as the sheet's Owner is; else the directory's.
 */
export function mayLeave(
  space: Space,
  directory: Directory,
  selfId: string,
  model?: WorkspaceModel,
): boolean {
  if (space.parentSpaceId !== undefined || !space.members.includes(selfId)) return false;
  const role = model === undefined ? directory[selfId]?.role : myRole(model, selfId);
  if (role === "owner") return false;
  return space.members.some((id) => id !== selfId && directory[id]?.kind === "person");
}

/** What leaving a room asks first. */
export function leaveAsking(room: string): Asking {
  return {
    title: `Leave ${room}?`,
    body: "It goes from your Spaces, and the space says you left.",
    note: "Anybody still in it can add you back.",
    confirm: "Leave",
  };
}

/**
 * Whether the reader may add anybody to this room from its sheet: anybody in it but a guest, as
 * the door has it (rule 7).
 */
export function mayAddToRoom(space: Space, model: WorkspaceModel, selfId: string): boolean {
  if (!space.members.includes(selfId) || space.roles[selfId] === "guest") return false;
  return myRole(model, selfId) !== "guest";
}

/**
 * What the room sheet's Add says: a Main room takes people alone (rule 7: its Main agent is its
 * own), and any other room both agents and people.
 */
export function addWords(main: boolean): string {
  return main ? "Add a person" : "Add agents or people";
}

// ------------------------------------------------------------- joining from the apps (ADR 0164)

/** What an invite says of itself before anybody has a name here: whose, where to, as what. */
export interface InviteSaid {
  readonly workspaceName: string;
  readonly role: WorkspaceRole;
  readonly invitedByName?: string | undefined;
  /** The space the link brings them into (ADR 0168). */
  readonly spaceName?: string | undefined;
}

/**
 * "Arjun invited you to Demo as a member.", or "You were invited to Demo …" when nobody is named.
 * A space's link names the space first: "Arjun invited you to Bakery in Demo as a guest."
 */
export function invitedWords(invite: InviteSaid): string {
  const who =
    invite.invitedByName === undefined ? "You were invited" : `${invite.invitedByName} invited you`;
  const where =
    invite.spaceName === undefined
      ? invite.workspaceName
      : `${invite.spaceName} in ${invite.workspaceName}`;
  return `${who} to ${where} as ${withArticle(invite.role)}.`;
}

/** The card's title: "Join Bakery" for a space's link, "Join Demo" for the workspace's. */
export function joinTitle(invite: InviteSaid): string {
  return `Join ${invite.spaceName ?? invite.workspaceName}`;
}

/** What the role means on a card or a form: for a space's link, said of that space. */
export function roleMeansFor(role: WorkspaceRole, spaceName?: string | undefined): string {
  if (spaceName === undefined) return ROLE_MEANS[role];
  if (role === "guest") {
    return `A guest is in ${spaceName} only, and sees only the people and agents there.`;
  }
  if (role === "member") {
    return `A member starts in ${spaceName}, and can be added to other spaces later. They see everybody here, and only the agents in their spaces.`;
  }
  return ROLE_MEANS[role];
}

/**
 * What a newcomer is told under the role on a join card, from what the invite knows (the guest
 * walk, 18 October 2026): that a space's history is there to read, since a joiner reads all of it
 * (ADR 0168) and nothing said so; and that there is nothing to set up, since the agents come with
 * the workspace rather than with the person.
 */
export function joinFacts(invite: InviteSaid): string[] {
  return [
    ...(invite.spaceName === undefined
      ? []
      : [`Everything said in ${invite.spaceName} so far is there for you to read.`]),
    `Nothing to set up: the agents there come with ${invite.workspaceName}.`,
  ];
}

/** What a link that was used, withdrawn or has lapsed says, on every card that opens one. */
export const DEAD_INVITE = {
  title: "This invite can't be used",
  body: "It was used already, withdrawn, or has expired. Ask whoever sent it for a new link.",
} as const;

/**
 * An invite to the workspace this device is already in: it says so and opens it, and the link is
 * left unused for somebody else. One person to a device; joining as somebody else is a sign-out.
 */
export function alreadyInAsking(input: {
  readonly workspace: string;
  readonly name: string;
  /** "phone", "browser", "Mac": where you are, as the sentence says it. */
  readonly here: string;
}): Asking {
  return {
    title: `You're already in ${input.workspace}`,
    body: `As ${input.name}, on this ${input.here}. The link stays unused, so it can go to somebody else.`,
    confirm: `Open ${input.workspace}`,
  };
}

/**
 * An invite to another workspace, which a browser, the Mac and the phone (ADR 0197) each hold
 * beside the one in front: it joins alongside, under the name you go by in the one in front. On a
 * phone (`on`) the sheet's head says who invited you already, and the words say where it stays
 * and where to switch: the top of Spaces, not the sidebar.
 *
 * A name taken there is asked for again in a field (`naming`), which says it, so the line that
 * says it goes.
 */
export function joinAlongsideAsking(input: {
  readonly invite: InviteSaid;
  readonly here: string;
  readonly name: string;
  readonly on?: { readonly device: string; readonly place: string } | undefined;
  readonly naming?: boolean | undefined;
}): Asking {
  const there = input.invite.workspaceName;
  const { on } = input;
  return {
    title: `Join ${there} too?`,
    body:
      on === undefined
        ? `${invitedWords(input.invite)} ${input.here} stays: switch between them at the top of the sidebar.`
        : `${input.here} stays on this ${on.device}. Switch between them from the top of ${on.place}.`,
    ...(input.naming === true
      ? {}
      : { note: `You join as ${input.name}. You can change your name there in You.` }),
    confirm: `Join ${there}`,
  };
}

/**
 * Why joining alongside was refused for its name (ADR 0197), over the field to type another into.
 * Not the server's words: its "here" is where the joiner is going, and the sheet stands over
 * where they are.
 */
export function nameTakenWords(input: {
  readonly name: string;
  readonly workspace: string;
}): string {
  const name = input.name.trim().replace(/\s+/g, " ");
  return `The name ${name} is taken in ${input.workspace}. Join under another one.`;
}

// ------------------------------------------------------------------- invite to a space (ADR 0168)

/** The roles a space's link may give, the one it starts on first: a guest of the space. */
export const SPACE_INVITE_ROLES: readonly WorkspaceRole[] = ["guest", "member"];

/**
 * Whether the reader may make a link into this room: an owner of the workspace (only an owner
 * invites) who is in the room, while it is open, and not a thread. A room of one agent, which the
 * wire calls direct, takes a link like any other (ADR 0168's addendum). The server asks the same.
 */
export function mayInviteToSpace(space: Space, model: WorkspaceModel, selfId: string): boolean {
  if (!mayInvite(myRole(model, selfId)) || !space.members.includes(selfId)) return false;
  return space.state === "open" && space.parentSpaceId === undefined;
}

/**
 * What an Add page's People says when it offers nobody: that nobody else is in the workspace yet,
 * which an owner answers with the link under it; that everybody is in the room already; or that
 * the rest are each a guest of another space, which no second room may take (ADR 0034).
 */
export function nobodyToAddWords(
  space: Space,
  people: Readonly<Record<string, PersonModel>>,
  selfId: string,
): string {
  const others = Object.values(people).filter((each) => each.participantId !== selfId);
  if (others.length === 0) return "Nobody else is in your workspace yet";
  if (others.every((each) => space.members.includes(each.participantId))) {
    return "Everyone in your workspace is here";
  }
  return "Everyone else is a guest in another space";
}

/** The row under People on a space's Add page, an owner's alone. */
export function inviteSomeoneNew(spaceName: string): {
  readonly title: string;
  readonly under: string;
} {
  return {
    title: "Invite someone new",
    under: `A link that brings them straight into ${spaceName}`,
  };
}

/** What the form says under its title, for a space. */
export function inviteToSpaceHint(workspace: string, spaceName: string): string {
  return `Whoever opens it names themselves, joins ${workspace}, and lands in ${spaceName}.`;
}

/** An open link's row: "Guest · once · Bakery", or "Member · by several" for the workspace's. */
export function inviteRowWords(
  invite: Pick<Invite, "role" | "singleUse" | "uses">,
  spaceName?: string | undefined,
): string {
  const words = `${ROLE_WORDS[invite.role]} · ${inviteUseWords(invite).toLowerCase()}`;
  return spaceName === undefined ? words : `${words} · ${spaceName}`;
}

/** A space's link opened by somebody in that space already: it opens, and the link stays unused. */
export function alreadyInSpaceAsking(spaceName: string): Asking {
  return {
    title: `You're already in ${spaceName}`,
    body: "The link stays unused, so it can go to somebody else.",
    confirm: `Open ${spaceName}`,
  };
}

/**
 * A space's link opened by somebody in the workspace but not the space (his "A" of 15 October):
 * it adds them, as the link's maker would, and the link stays unused for whoever it was made for.
 */
export function enterSpaceAsking(input: {
  readonly invite: InviteSaid & { readonly spaceName: string };
  /** The name they go by in the workspace. */
  readonly name: string;
}): Asking {
  const { invite } = input;
  const whose = invite.invitedByName === undefined ? "A link" : `${invite.invitedByName}'s link`;
  return {
    title: `Join ${invite.spaceName}?`,
    body: `${whose} to ${invite.spaceName}, in ${invite.workspaceName}. You're in ${invite.workspaceName} as ${input.name}, so it adds you to ${invite.spaceName}. The link stays unused, so it can go to somebody else.`,
    confirm: `Join ${invite.spaceName}`,
  };
}

/** A guest in a space already, given another space's link: a guest is in one space. */
export function guestElsewhereAsking(input: {
  readonly spaceName: string;
  /** The space they are a guest in, when the reader knows it. */
  readonly there?: string | undefined;
  readonly invitedByName?: string | undefined;
}): Asking {
  const where = input.there === undefined ? "another space" : input.there;
  const ask = input.invitedByName ?? "whoever sent it";
  return {
    title: "A guest is in one space",
    body: `You're a guest in ${where}, so this link can't add you to ${input.spaceName}. Ask ${ask} to make you a member.`,
    confirm: "OK",
  };
}

/**
 * What a space's link says to somebody already in its workspace (ADR 0168), on the phone and the
 * desktop alike: in the space already, it opens; a guest who is in another space is told why it
 * can't; anybody else is asked, and joining adds them to the space as the link's maker would.
 */
export function spaceLinkAsking(input: {
  readonly invite: InviteSaid;
  readonly spaceId: string;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  /** The name they go by in the workspace. */
  readonly name: string;
}): { readonly kind: "in" | "guest_elsewhere" | "enter"; readonly asking: Asking } {
  const { invite, model, selfId } = input;
  const spaceName = invite.spaceName ?? "the space";
  const mine = model.spaces.filter((each) => each.members.includes(selfId));
  if (mine.some((each) => each.id === input.spaceId)) {
    return { kind: "in", asking: alreadyInSpaceAsking(spaceName) };
  }
  // An archived room is not counted: a guest is in one open room at most (JR-24).
  const first = mine.find((each) => each.state !== "closed");
  if (myRole(model, selfId) === "guest" && first !== undefined) {
    const asking = guestElsewhereAsking({
      spaceName,
      there: spaceTitle(first, input.directory, selfId),
      invitedByName: invite.invitedByName,
    });
    return { kind: "guest_elsewhere", asking };
  }
  return {
    kind: "enter",
    asking: enterSpaceAsking({ invite: { ...invite, spaceName }, name: input.name }),
  };
}
