/**
 * What `chips connect` wrote down.
 *
 * One record per harness: which harness it is, where the server is, where the config it wrote
 * lives, and which account in the keychain holds the token. Never the token — that is the
 * keychain's, and this file is ordinary reading. `chips doctor` reads this to know what it is
 * meant to be checking, and `chips connect` reads it to know what it is about to replace.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { connectionsPath } from "./home.js";
import type { SecretStore } from "./keychain.js";

/**
 * Which adapter a connection was made with: the id of an entry in `harnesses.ts`. A string and
 * not a union, because a record written by an older build may name an adapter this one no longer
 * has — `jacobian`, until 12 September 2026 (ADR 0051) — and must still read: `doctor` says so,
 * `--rotate` and `disconnect` still take it as a custom harness, which every harness is on the wire.
 */
export type Harness = string;

export interface Connection {
  readonly harness: Harness;
  readonly harnessId: string;
  readonly displayName: string;
  readonly serverUrl: string;
  /**
   * The direct space between the person and the harness, when one was opened. A harness whose
   * spaces are worktrees has none: it opens its own as it finds them (ADR 0024).
   */
  readonly spaceId?: string | undefined;
  /** The keychain account the token is under. */
  readonly account: string;
  readonly secretStore: SecretStore;
  /** Files this connection wrote or edited, so `doctor` can check them and say where they are. */
  readonly wrote: readonly string[];
  readonly connectedAt: string;
}

export function readConnections(path = connectionsPath()): Connection[] {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Connection[];
  } catch {
    return [];
  }
}

/**
 * One record per harness, by its id: a rotation replaces its own record, and a second harness
 * made with the same adapter — two custom harnesses — is written beside the first, not over it.
 */
export function writeConnection(connection: Connection, path = connectionsPath()): Connection[] {
  const kept = readConnections(path).filter((each) => each.harnessId !== connection.harnessId);
  const all = [...kept, connection];
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(all, null, 2)}\n`, { mode: 0o600 });
  return all;
}

/**
 * The connection a word on the command line means: a harness id, a harness's name, or the adapter
 * it was connected with. Several harnesses made with one adapter are told apart by name, so the
 * adapter's word alone is refused when it means more than one, with the names that would do.
 */
export function findConnection(
  connections: readonly Connection[],
  wanted: string,
): Connection | undefined {
  const byId = connections.find((each) => each.harnessId === wanted);
  if (byId !== undefined) return byId;
  const lower = wanted.toLowerCase();
  const byName = connections.filter((each) => each.displayName.toLowerCase() === lower);
  const found = byName.length > 0 ? byName : connections.filter((each) => each.harness === lower);
  if (found.length > 1) {
    const which = found.map((each) => `${nameFor(each, connections)} (${each.harnessId})`);
    throw new Error(
      `Several harnesses here answer to ${wanted}: ${which.join(", ")}. Say which one.`,
    );
  }
  return found[0];
}

/**
 * What to type to mean this connection and no other: its name when that is its own, and its id
 * when the name is shared. Not the adapter it was made with, even while it is the only one: every
 * harness a person makes themselves is `custom`, which says nothing about which one it is.
 */
export function nameFor(connection: Connection, connections: readonly Connection[]): string {
  const lower = connection.displayName.toLowerCase();
  const named = connections.filter((each) => each.displayName.toLowerCase() === lower);
  if (named.length > 1) return connection.harnessId;
  return typed(connection.displayName);
}

/** A name as it is typed on the command line: quoted when it has a space in it. */
export function typed(name: string): string {
  return /\s/.test(name) ? JSON.stringify(name) : name;
}

/** The keychain account a harness's token lives under. */
export function accountFor(harness: Harness, harnessId: string): string {
  return `${harness}:${harnessId}`;
}
