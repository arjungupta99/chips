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

/** What a batch did: the rows the server took, by id, and those it would not, with what it said. */
export interface ActedAll<T> {
  readonly done: string[];
  readonly refused: { readonly item: T; readonly error: unknown }[];
}

/**
 * Asks the server to act on every picked row (ADR 0181, ADR 0182): all at once, since each ask is
 * a round trip and through the relay a batch of them in turn took seconds a row. Rows in one lane
 * are asked in turn, in the order given, each once the one before has answered; one the server
 * refuses does not stop the rest. What it did, and what it would not, come back in the order given.
 */
export async function actAll<T extends { readonly id: string }>(
  items: readonly T[],
  act: (item: T) => Promise<void> | void,
  laneOf: (item: T) => string = (item) => item.id,
): Promise<ActedAll<T>> {
  const lanes = new Map<string, T[]>();
  for (const item of items) {
    const lane = laneOf(item);
    lanes.set(lane, [...(lanes.get(lane) ?? []), item]);
  }
  const failed = new Map<T, unknown>();
  await Promise.all(
    [...lanes.values()].map(async (lane) => {
      for (const item of lane) {
        try {
          await act(item);
        } catch (error) {
          failed.set(item, error);
        }
      }
    }),
  );
  return {
    done: items.filter((item) => !failed.has(item)).map((item) => item.id),
    refused: items
      .filter((item) => failed.has(item))
      .map((item) => ({ item, error: failed.get(item) })),
  };
}

/**
 * An agent's lane in a batch (ADR 0182): its room's, so a room's agents go one at a time. The
 * last of them may take the room with it (`roomGoesWith`), which the server refuses while another
 * is still there, and two leaving at once could both find the room empty and archive it twice. An
 * agent in no room has a lane of its own.
 */
export function agentLane(directory: Directory, agentId: string): string {
  return directory[agentId]?.room ?? agentId;
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
