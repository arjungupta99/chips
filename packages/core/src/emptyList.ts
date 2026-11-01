/**
 * What a list of rooms says when it has none to show. In core so the phone's Spaces tab and the
 * desktop's rail tell the same story from the same snapshot.
 *
 * "No spaces yet" is a claim, and only the server can make it: an empty model also means the
 * cache has not been read yet, or the socket has not said hello, or it has and the rooms are
 * still coming in. Each of those said "No spaces yet" until 6 October 2026, on every launch.
 */

import type { Snapshot } from "./store.js";
import type { ConnectionState } from "./transport.js";

/**
 * - `reading`: the cache is still being read. Nothing is worth drawing for that long.
 * - `fetching`: the server has listed rooms that have not come in yet.
 * - `none`: the server has said there are none. Only this one is "No spaces yet".
 * - otherwise the connection, while it has not said: on its way, or why it cannot.
 *
 * `removed` is said whatever the list holds (ADR 0160): the rooms a removed person's cache still
 * has are no longer theirs, and the list stands aside for the words that say so.
 */
export type EmptyList = "reading" | "fetching" | "none" | Exclude<ConnectionState, "open">;

export function emptyList(
  snapshot: Pick<Snapshot, "connection" | "readingCache" | "awaiting">,
): EmptyList {
  if (snapshot.readingCache === true) return "reading";
  const { connection, awaiting } = snapshot;
  if (connection === "removed") return "removed";
  if (awaiting === 0) return "none";
  // Open and not yet said hello is a moment from saying it: still on its way.
  if (connection === "open") return awaiting === undefined ? "connecting" : "fetching";
  return connection;
}

/**
 * What the Agents tab shows, which is the directory and nothing else (14 October 2026). Its rows
 * are the server's word, now or as this device kept it from the last answer; until there is one,
 * an empty directory means nobody has said yet, and the tab said "No agents yet" for that.
 *
 * - `reading`: the cache is still being read.
 * - `listed`: the server's word, now or kept: its rows, and "No agents yet" only when it has none.
 * - `fetching`: this device has never had the server's word, and is asking for it.
 * - `failed`: it asked a server that is there, and the answer did not come.
 * - otherwise why it cannot ask: the connection, as `emptyList` says it. `removed` is said
 *   whatever the directory holds (ADR 0160), as it is over the rooms.
 */
export type AgentsLook =
  | "reading"
  | "listed"
  | "fetching"
  | "failed"
  | Exclude<ConnectionState, "open" | "connecting">;

export function agentsLook(
  snapshot: Pick<Snapshot, "connection" | "readingCache" | "directoryFrom" | "directoryFailed">,
): AgentsLook {
  if (snapshot.readingCache === true) return "reading";
  const { connection } = snapshot;
  if (connection === "removed") return "removed";
  if (snapshot.directoryFrom !== undefined) return "listed";
  if (connection === "connecting") return "fetching";
  if (connection === "open") return snapshot.directoryFailed === true ? "failed" : "fetching";
  return connection;
}

/**
 * How long a first load stands its stand-in through trouble before it says so: the Agents tab's
 * blank agents, and Spaces' "Reaching your server" with no room kept. A launch through the relay
 * can close and open its socket, or miss its first read, inside a second or two, and that is not
 * "Can't reach your server" (his iPhone, 14 October 2026); an outage still is, after this.
 */
export const PATIENCE_MS = 4000;

/** What the tab shows: a look, or the server being reached again once trouble has been said. */
export type ShownAgents = AgentsLook | "connecting";

/** A look that says something is wrong, which a first load is patient with. */
export function troubled(look: AgentsLook | EmptyList): boolean {
  return look === "closed" || look === "asleep" || look === "failed";
}

/**
 * What the tab shows of `look`, given whether trouble has lasted `PATIENCE_MS` since the list was
 * last on screen (`told`, the app's to time). Before then trouble is still the blank agents.
 * After, it is said; and when the socket tries again it says the server is being reached, rather
 * than going back to blank agents and out again with every try.
 */
export function patientLook(
  look: AgentsLook,
  connection: ConnectionState,
  told: boolean,
): ShownAgents {
  if (troubled(look)) return told ? look : "fetching";
  if (look === "fetching" && told && connection !== "open") return "connecting";
  return look;
}

/**
 * What a list with no room to show says of `look`, given whether trouble has lasted
 * `PATIENCE_MS` since it last had rooms or the server's word that there are none (`told`, the
 * app's to time). Before then it is the server being reached, which it is: the socket tries again
 * on its own within a second. Rejected and removed are said at once: waiting cannot change them.
 */
export function patientEmpty(look: EmptyList, told: boolean): EmptyList {
  return troubled(look) && !told ? "connecting" : look;
}
