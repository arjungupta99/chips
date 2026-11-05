/**
 * What an agent's card says beyond its facts (ADR 0087, Phase 5; on the desktop as the phone since
 * ADR 0270): the room picker its Put, Move and Fork rows open, with a title and a line on what each
 * does, and the rooms it offers; and the Message history row, with how many spaces its history
 * holds. The phone drew these first (`apps/mobile/src/agents/RoomPicker.tsx`, `AgentCard.tsx`).
 */

import type { AgentStay } from "./agentsTab.js";
import type { Space } from "./model/types.js";

/** Which act the room picker is for: a free agent put in a room, one moved, or a copy forked. */
export type RoomPick = "put" | "move" | "fork";

/** What each act's row on the card says. */
export const ROOM_PICK_ROW: Readonly<Record<RoomPick, string>> = {
  put: "Put in a space…",
  move: "Move to another space…",
  fork: "Fork into a space…",
};

/** What the picker says it is for: its title, and a line on what the act does to the agent. */
export function roomPickWords(
  mode: RoomPick,
  name: string,
  here: string,
): { readonly title: string; readonly hint: string } {
  switch (mode) {
    case "put":
      return {
        title: `Put ${name} in a space`,
        hint: "It's in one space at a time. What it said while in none is said there.",
      };
    case "move":
      return {
        title: `Move ${name} to another space`,
        hint: "It's in one space at a time, so it leaves the one it's in.",
      };
    case "fork":
      return {
        title: `Fork ${name} into a space`,
        hint: `A copy joins. ${name} stays in ${here}.`,
      };
  }
}

/**
 * The rooms an agent may go to, the latest to speak first: the reader's open rooms, never a
 * channel, a Main room (which takes people and no other agent, rule 7), a thread, or the room it
 * is in.
 */
export function pickableRooms(
  spaces: readonly Space[],
  here: string | undefined,
): readonly Space[] {
  return spaces
    .filter(
      (space) =>
        space.state === "open" &&
        space.kind !== "channel" &&
        space.home !== true &&
        space.parentSpaceId === undefined &&
        space.id !== here,
    )
    .sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""));
}

/** The Message history row's value: how many spaces its history holds, once the server has said. */
export function historyRoomsWords(stays: readonly AgentStay[] | undefined): string | undefined {
  if (stays === undefined) return undefined;
  const rooms = new Set(stays.map((stay) => stay.spaceId ?? stay.from)).size;
  return `${rooms} ${rooms === 1 ? "space" : "spaces"}`;
}

/** Why the server didn't say where an agent has been: an old server plainly, else its own words. */
export function staysFailedWords(error: unknown): string {
  const said = error instanceof Error ? error.message : "";
  if (/no route matches/i.test(said)) {
    return "This server is older than the app, and can't say where an agent has been yet.";
  }
  return said === "" ? "The server didn't say where it has been." : said;
}
