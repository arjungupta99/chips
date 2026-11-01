/**
 * What somebody let in by an invite meets while they are in no room yet (JR-4): who let them in,
 * as what, and what happens next, in place of "No spaces yet", which is the owner's empty
 * workspace and says nothing to a person who has just arrived in somebody else's. In core so the
 * desktop's pane and the phone's Spaces tab say the same thing.
 */

import { FIRST_PERSON_NAME, type WorkspaceRole } from "@chipschat/protocol";
import type { Directory } from "./events.js";
import type { PersonModel, WorkspaceModel } from "./model/types.js";
import { roomName } from "./rooms.js";

export interface Welcome {
  readonly title: string;
  readonly words: string;
  /**
   * Whether to offer them a space of their own: an owner or an admin alone, as core's
   * `mayOpenSpace` has it (ADR 0196). A member and a guest are added to spaces.
   */
  readonly mayCreate: boolean;
}

/**
 * An empty Spaces for somebody who may not open a space and came by no invite we can name: where
 * their spaces come from (ADR 0196). The welcome's own last sentence, so both say it alike.
 */
export const ADDED_TO_A_SPACE_WORDS = "When somebody adds you to a space, it appears here.";

/** "a member", "an admin": a role as a sentence says it. */
export function withArticle(role: WorkspaceRole): string {
  return role === "owner" || role === "admin" ? `an ${role}` : `a ${role}`;
}

/** The welcome for this person, or nothing for one who came by no invite: the workspace's first. */
export function welcomeFor(
  people: Readonly<Record<string, PersonModel>>,
  directory: Directory,
  selfId: string,
  workspaceName: string,
): Welcome | undefined {
  const me = people[selfId];
  if (me?.invitedBy === undefined) return undefined;
  const named = directory[me.invitedBy]?.displayName ?? people[me.invitedBy]?.displayName;
  // Nobody's name for somebody still called what the server first called them: "You invited
  // you" would say nothing (JR-17).
  const invited =
    named === undefined || named === FIRST_PERSON_NAME
      ? `You were invited as ${withArticle(me.role)}.`
      : `${named} invited you as ${withArticle(me.role)}.`;
  const title = `You're in ${workspaceName}`;
  if (me.role === "guest") {
    const next = named === undefined || named === FIRST_PERSON_NAME ? "somebody adds" : "they add";
    return {
      title,
      words: `${invited} When ${next} you to a space, it appears here.`,
      mayCreate: false,
    };
  }
  return {
    title,
    words: `${invited} ${ADDED_TO_A_SPACE_WORDS}`,
    mayCreate: me.role === "owner" || me.role === "admin",
  };
}

/**
 * The line under a guest's Spaces (ADR 0196): why there is one row, "You're Arjun's guest in Japan
 * trip, so it's your one space here." A guest of the workspace is in one space at most, by the
 * server's rule, and nothing on the list said so. Nothing for anybody else, or while their space
 * is archived or they are in none, when the list has no row to explain.
 */
export function guestSpaceWords(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
): string | undefined {
  const me = model.people[selfId];
  if (me?.role !== "guest") return undefined;
  const space = model.spaces.find(
    (each) =>
      each.state === "open" && each.parentSpaceId === undefined && each.members.includes(selfId),
  );
  if (space === undefined) return undefined;
  const named =
    me.invitedBy === undefined
      ? undefined
      : (directory[me.invitedBy]?.displayName ?? model.people[me.invitedBy]?.displayName);
  // Nobody's name for somebody still called what the server first called them (JR-17).
  const whose = named === undefined || named === FIRST_PERSON_NAME ? "a guest" : `${named}'s guest`;
  return `You're ${whose} in ${roomName(model, space.id, directory)}, so it's your one space here.`;
}

/**
 * What Sign out tells this person will happen. Anybody but an owner has no computer of the
 * workspace's to make a pairing code on, so "pair again with a new code" told them of a way back
 * they don't have (the guest walk, 18 October 2026). Nor is a new invite link one: the server
 * turns it away, since somebody there goes by their name already (the new-person sweep's finding
 * 15). Theirs is an owner reconnecting them from their page in People (ADR 0206), or a code from
 * another device they are signed in on.
 */
export function signOutWords(
  people: Readonly<Record<string, PersonModel>>,
  selfId: string,
  /** The other workspaces this device holds, which stay (ADR 0197), and what it is called. */
  stays: { readonly names: readonly string[]; readonly device: string } = { names: [], device: "" },
): string {
  const kept =
    "Its key is withdrawn at the server and forgotten here. Nothing in the workspace is deleted";
  const back =
    people[selfId]?.role === "owner"
      ? `${kept}, and you can pair again with a new code.`
      : `${kept}. To come back, ask an owner to reconnect you: they choose Pair a new phone on your page in People. A code from another device you're signed in on works too.`;
  const { names, device } = stays;
  if (names.length === 0) return back;
  const listed =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${back} ${listed} ${names.length === 1 ? "stays" : "stay"} on this ${device}.`;
}
