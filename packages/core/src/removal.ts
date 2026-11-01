/**
 * Removing a harness (ADR 0078) or a person (ADR 0160) from the workspace: who may, and what the
 * sheet that asks first says. In core for the reason `putAway.ts` is: the phone's sheet and the desktop's dialog offer
 * it to the same people as the server allows, in the same words.
 */

import type { Directory } from "./events.js";
import { administers, myRole, type WorkspaceModel } from "./model.js";
import { selfLabel } from "./people.js";
import type { Asking } from "./putAway.js";

/**
 * A harness still in the workspace, and a reader who owns it or runs the workspace as its owner
 * or an admin: the rule for its tokens and its handing-on (ADR 0023). Never a guest, and never a
 * harness removed already.
 */
export function mayRemoveHarness(
  model: WorkspaceModel,
  directory: Directory,
  harnessId: string,
  selfId: string,
): boolean {
  const harness = directory[harnessId];
  if (harness?.kind !== "harness" || harness.removedAt !== undefined) return false;
  const standing = myRole(model, selfId);
  if (standing === "guest") return false;
  return harness.ownerId === selfId || administers(standing);
}

/** What the sheet that asks before a removal says. `name` is the harness's. */
export function removeAsking(name: string): Asking {
  return {
    title: `Remove ${name}?`,
    body: `Its tokens are withdrawn, so it can't connect again, and it leaves Harnesses, the + and every space's Add for everyone here. What ${name} said stays in its spaces, under its name.`,
    note: "Spaces that were its home can be archived or deleted like any other. To use it again, connect it as a new harness.",
    confirm: "Remove",
  };
}

/**
 * Whether this reader may remove a person from the workspace (ADR 0160), as the door has it: an
 * owner or an admin, an admin never an owner, and never themselves (an owner who wants out hands
 * the workspace on first).
 */
export function mayRemovePerson(model: WorkspaceModel, personId: string, selfId: string): boolean {
  const person = model.people[personId];
  if (person === undefined || personId === selfId) return false;
  const standing = myRole(model, selfId);
  if (!administers(standing)) return false;
  return !(standing === "admin" && person.role === "owner");
}

/**
 * Whether this reader may pair a new phone for a person already here (ADR 0206), as the door has
 * it: an owner, for somebody else in the workspace. An admin may not: a phone paired as a member
 * reads as that member.
 */
export function mayPairFor(model: WorkspaceModel, personId: string, selfId: string): boolean {
  if (model.people[personId] === undefined || personId === selfId) return false;
  return myRole(model, selfId) === "owner";
}

/**
 * Whether this reader may sign out a device of this person's (ADR 0236), as the door has it:
 * their own, or anybody's for an owner or an admin, an admin never an owner's.
 */
export function maySignOutDevicesOf(
  model: WorkspaceModel,
  personId: string,
  selfId: string,
): boolean {
  const person = model.people[personId];
  if (person === undefined) return false;
  if (personId === selfId) return true;
  const standing = myRole(model, selfId);
  if (!administers(standing)) return false;
  return !(standing === "admin" && person.role === "owner");
}

/**
 * Who a device that asks to join may be paired as, by this reader (ADR 0206): themselves first,
 * then, for an owner, everybody else here by name. One entry is no choice at all.
 */
export function pairAsChoices(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
): readonly PairAsChoice[] {
  const own = nameOfPerson(directory, selfId);
  const self = { id: selfId, name: own, label: selfLabel(own) };
  if (myRole(model, selfId) !== "owner") return [self];
  const others = Object.keys(model.people)
    .filter((id) => id !== selfId && directory[id]?.removedAt === undefined)
    .map((id) => {
      const name = nameOfPerson(directory, id);
      return { id, name, label: name };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return [self, ...others];
}

/** One person a device may be paired as: their name, and how the choice reads. */
export interface PairAsChoice {
  readonly id: string;
  readonly name: string;
  readonly label: string;
}

/** What allowing a device says it will be, under the choice of whom it is paired as (ADR 0206). */
export function pairedAsWords(
  choices: readonly { readonly id: string; readonly name: string }[],
  as: string | undefined,
): string {
  const chosen = choices.find((each) => each.id === as);
  if (chosen === undefined || chosen === choices[0]) {
    return "It is paired as you, as if you had scanned your code with it.";
  }
  return `It is paired as ${chosen.name}, with their spaces and everything they said: for ${chosen.name}'s new phone.`;
}

function nameOfPerson(directory: Directory, id: string): string {
  return directory[id]?.displayName ?? "Somebody";
}

/**
 * What the confirm says before a person is removed: that it happens everywhere at once, which
 * harnesses become the reader's, what stays, and the one way back.
 */
export function removePersonAsking(input: {
  readonly name: string;
  readonly workspace: string;
  /** The names of the harnesses they own, which become the reader's. */
  readonly harnesses: readonly string[];
}): Asking {
  const { name, harnesses } = input;
  const handed =
    harnesses.length === 0
      ? ""
      : ` ${listWords(harnesses)} ${harnesses.length === 1 ? "becomes" : "become"} yours.`;
  return {
    title: `Remove ${name} from ${input.workspace}?`,
    body: `${name} is signed out on every device now and taken out of every space.${handed} What ${name} said stays where it was said.`,
    note: `To come back, ${name} needs a new invite.`,
    confirm: "Remove",
  };
}

/** The harnesses they own, from the directory: what the confirm says becomes the reader's. */
export function harnessesOf(directory: Directory, personId: string): string[] {
  return Object.values(directory)
    .filter(
      (each) =>
        each.kind === "harness" && each.ownerId === personId && each.removedAt === undefined,
    )
    .map((each) => each.displayName);
}

/** "Scout", "Scout and Ledger", "Scout, Ledger and Atlas". */
function listWords(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * What deleting your own account says (ADR 0243): what goes and what stays, and what to type before
 * Delete wakes; or, for the only owner, why there is nothing here to delete, since the workspace is
 * theirs, on the computer it runs on. One for the phone's sheet and the desktop's dialog.
 */
export type DeleteAccountSheet =
  | { readonly kind: "only_owner"; readonly title: string; readonly body: string }
  | {
      readonly kind: "delete";
      readonly title: string;
      readonly lead: string;
      readonly goes: readonly string[];
      readonly stays: readonly string[];
      /** The workspace's name, typed before Delete wakes. */
      readonly typed: string;
      readonly placeholder: string;
      readonly confirm: string;
    };

export function deleteAccountSheet(input: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly workspace: string;
  /** How many devices hold the reader's key, once read; undefined until then. */
  readonly devices?: number | undefined;
}): DeleteAccountSheet {
  const { model, directory, selfId, workspace, devices } = input;
  const owner = myRole(model, selfId) === "owner";
  // The server hands what they own to an owner who stays: the first, as the people list has them.
  const owners = Object.entries(model.people)
    .filter(
      ([id, person]) =>
        id !== selfId && person.role === "owner" && directory[id]?.removedAt === undefined,
    )
    .map(([id]) => nameOfPerson(directory, id));
  if (owner && owners.length === 0) {
    return {
      kind: "only_owner",
      title: `You own ${workspace}`,
      body: "It runs on the computer you set it up on, with everything in it. To delete it, run chips uninstall --remove-data there. To leave it running, make someone else an owner first.",
    };
  }
  return {
    kind: "delete",
    title: "Delete your account",
    lead: `You leave ${workspace} for good.`,
    goes: accountGoes(devices, directory[selfId]?.face != null, owner),
    stays: accountStays(
      model.spaces.filter((space) => space.members.includes(selfId)).length,
      harnessesOf(directory, selfId),
      owners.length === 1 ? (owners[0] as string) : "an owner",
    ),
    typed: workspace,
    placeholder: `Type ${workspace} to delete`,
    confirm: "Delete your account",
  };
}

/** What goes with an account: its devices, then its face and, for an owner, the invites they made. */
function accountGoes(devices: number | undefined, face: boolean, owner: boolean): string[] {
  const signIns =
    devices === undefined
      ? "Your devices and their sign-ins, and push to them"
      : devices === 1
        ? "This device and its sign-in, and push to it"
        : `Your ${devices} devices and their sign-ins, and push to them`;
  const theirs = [
    face ? "Your face" : undefined,
    owner ? "the invites you made" : undefined,
  ].filter((each) => each !== undefined);
  if (theirs.length === 0) return [signIns];
  const said = theirs.join(", and ");
  return [signIns, said.charAt(0).toUpperCase() + said.slice(1)];
}

/** What stays: what they said, and the harnesses they connected, with whom they go to. */
function accountStays(spaces: number, harnesses: readonly string[], heir: string): string[] {
  const words =
    spaces === 0
      ? "What you said, under your name"
      : `What you said, in its ${spaces === 1 ? "space" : `${spaces} spaces`}, under your name`;
  if (harnesses.length === 0) return [words];
  const go = harnesses.length === 1 ? "it goes" : "they go";
  return [words, `${listWords(harnesses)}, which you connected: ${go} to ${heir}`];
}

/** Whether what was typed is the workspace's name, as a person would type it: case and spaces aside. */
export function deleteAccountTyped(typed: string, workspace: string): boolean {
  const plain = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();
  return plain(typed) !== "" && plain(typed) === plain(workspace);
}
