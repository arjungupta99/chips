/**
 * What a list says, and keeps, while it picks rows to archive or delete together: the Spaces list's
 * rooms (ADR 0181) and the Agents tab's agents (ADR 0182), on the phone and on the desktop alike.
 * Who may be picked, and what the asking says, are `putAway`'s.
 */

import { type Directory, harnessOf, nameOf } from "./events.js";
import type { Space } from "./model.js";

/** A row on its way out of the list, drawn where it stood until it has gone. */
export interface HeldRow<T> {
  readonly item: T;
  /** Where it stood in its run of rows when it started to go. */
  readonly index: number;
}

/**
 * The rows, with those on their way out put back where they stood: a room archived or deleted
 * leaves the store at once, and its row folds away, or goes to dust and then folds, after.
 */
export function keepLeaving<T extends { readonly id: string }>(
  list: readonly T[],
  held: readonly HeldRow<T>[],
): T[] {
  const out = [...list];
  const present = new Set(list.map((item) => item.id));
  for (const each of [...held].sort((a, b) => a.index - b.index)) {
    if (present.has(each.item.id)) continue;
    out.splice(Math.min(each.index, out.length), 0, each.item);
  }
  return out;
}

/**
 * What the line under the name says while picking, about the rows that can't be picked. Short
 * enough to stand beside Select all on a phone: "the Main room" in full did not (the simulator,
 * 16 October 2026).
 */
export function hintWords(locked: boolean, main: boolean): string | undefined {
  if (locked && main) return "Locked spaces and Main can't be picked";
  if (locked) return "Locked spaces can't be picked";
  if (main) return "The Main space can't be picked";
  return undefined;
}

/**
 * What the line under the Agents tab's name says while picking (ADR 0182), about the rows that
 * can't be picked: the Main agents, the ones whose changes are locked (ADR 0199), and others'
 * agents for somebody who may not change them.
 */
export function agentHintWords(main: boolean, others: boolean, locked = false): string | undefined {
  const kinds = [main ? "Main" : "", locked ? "locked" : "", others ? "others'" : ""].filter(
    (kind) => kind !== "",
  );
  if (kinds.length === 0) return undefined;
  const last = kinds.pop() as string;
  const said = kinds.length === 0 ? last : `${kinds.join(", ")} and ${last}`;
  return `${said.charAt(0).toUpperCase()}${said.slice(1)} agents can't be picked`;
}

/** Why a room can't be picked, said when it is pressed (ADR 0181). */
export function whyNotPicked(space: Space, title: string): string {
  if (space.locked === true) {
    return `${title} is locked. Unlock it in its details to archive or delete it.`;
  }
  if (space.home === true) return `${title} is the Main space. It's always here.`;
  return `You can't archive or delete ${title}.`;
}

/** Why an agent can't be picked, said when it is pressed (ADR 0182). */
export function whyNotPickedAgent(
  directory: Directory,
  agent: { readonly id: string; readonly name: string; readonly lead: boolean },
): string {
  if (agent.lead) {
    return `${agent.name} is its harness's Main agent: it can't be archived or deleted.`;
  }
  // A locked agent is never picked (ADR 0199), as a locked room is not.
  if (directory[agent.id]?.locked === true) {
    return `${agent.name} is locked. Unlock it on its card to archive or delete it.`;
  }
  const harness = nameOf(directory, harnessOf(directory, agent.id));
  return `Only ${harness}'s owner or an admin can archive or delete ${agent.name}.`;
}
