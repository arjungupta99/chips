/**
 * The presence adapter for one process (ADR 0083). A harness is keyed by workspace and id, and
 * counted by its open sockets: an agent can hold more than one.
 *
 * Offline waits `graceMs` after the last socket closes, so a reconnect never flashes; and for
 * the first `graceMs` after a start every harness is taken as connected, because that is how
 * long they take to come back, after which one nobody has heard from is offline since the start.
 * Trouble ends when the harness says so, or when it goes offline.
 *
 * Restarting (ADR 0094) ends at the harness's next word: a socket of it that opens, or a status
 * it reports. Otherwise it ends `restartWaitMs` after the ask, and the state says again whatever
 * is true then. Going offline does not end it: a harness restarting its own process goes offline
 * on the way.
 */

import { type AgentState, RESTART_WAIT_MS } from "@chipschat/protocol";
import type { Presence, PresenceListener } from "../../application/ports/presence.js";

/** How long a harness with no socket is still taken as connected. */
export const PRESENCE_GRACE_MS = 15_000;

interface Entry {
  sockets: number;
  connected: boolean;
  /** When it connected, or went offline. */
  since: number;
  trouble: { readonly reason: string; readonly since: number } | undefined;
  /** Taken as connected because the process is just starting, not because a socket is open. */
  starting: boolean;
  offline: ReturnType<typeof setTimeout> | undefined;
  /** Who asked it to restart and when, and the timer that gives up waiting (ADR 0094). */
  restarting:
    | { readonly by: string; readonly since: number; readonly wait: ReturnType<typeof setTimeout> }
    | undefined;
}

export function createInProcessPresence(
  options: {
    readonly now?: () => number;
    readonly graceMs?: number;
    readonly restartWaitMs?: number;
  } = {},
): Presence {
  const now = options.now ?? Date.now;
  const grace = options.graceMs ?? PRESENCE_GRACE_MS;
  const restartWait = options.restartWaitMs ?? RESTART_WAIT_MS;
  const startedAt = now();
  const entries = new Map<
    string,
    { readonly workspaceId: string; readonly harnessId: string; readonly entry: Entry }
  >();
  const listeners = new Set<PresenceListener>();
  let started: ReturnType<typeof setTimeout> | undefined;

  const iso = (ms: number): string => new Date(ms).toISOString();
  const view = (entry: Entry): AgentState => ({
    connected: entry.connected,
    since: iso(entry.since),
    ...(entry.trouble === undefined
      ? {}
      : { trouble: { reason: entry.trouble.reason, since: iso(entry.trouble.since) } }),
    ...(entry.restarting === undefined
      ? {}
      : { restarting: { since: iso(entry.restarting.since), by: entry.restarting.by } }),
  });
  const tell = (workspaceId: string, harnessId: string, entry: Entry): void => {
    const state = view(entry);
    for (const listener of listeners) listener(workspaceId, harnessId, state);
  };

  /** Once the start's grace is over, every harness still unheard from is offline since the start. */
  const settleStart = (): void => {
    if (started !== undefined) return;
    started = setTimeout(
      () => {
        for (const { workspaceId, harnessId, entry } of entries.values()) {
          if (!entry.starting) continue;
          entry.starting = false;
          if (entry.sockets > 0) continue;
          entry.connected = false;
          entry.since = startedAt;
          tell(workspaceId, harnessId, entry);
        }
      },
      Math.max(0, startedAt + grace - now()),
    );
    started.unref?.();
  };

  const entryOf = (workspaceId: string, harnessId: string): Entry => {
    const key = `${workspaceId}\u0000${harnessId}`;
    const known = entries.get(key)?.entry;
    if (known !== undefined) return known;
    const starting = now() - startedAt < grace;
    const entry: Entry = {
      sockets: 0,
      connected: starting,
      since: startedAt,
      trouble: undefined,
      starting,
      offline: undefined,
      restarting: undefined,
    };
    entries.set(key, { workspaceId, harnessId, entry });
    if (starting) settleStart();
    return entry;
  };

  /** The trouble a harness reports, or that there is none. Returns whether anything changed. */
  const sayTrouble = (entry: Entry, trouble: string | undefined): boolean => {
    if (trouble === undefined) {
      if (entry.trouble === undefined) return false;
      entry.trouble = undefined;
      return true;
    }
    if (entry.trouble?.reason === trouble) return false;
    // In trouble since it first said so, whatever it says now.
    entry.trouble = { reason: trouble, since: entry.trouble?.since ?? now() };
    return true;
  };

  /** The harness said its next word since a restart was asked: it is no longer restarting. */
  const heard = (entry: Entry): boolean => {
    if (entry.restarting === undefined) return false;
    clearTimeout(entry.restarting.wait);
    entry.restarting = undefined;
    return true;
  };

  return {
    stateOf: (workspaceId, harnessId) => view(entryOf(workspaceId, harnessId)),
    added(workspaceId, harnessId) {
      const entry = entryOf(workspaceId, harnessId);
      if (entry.sockets > 0) return;
      // Nothing to come back from: not taken as connected while the process starts, and not
      // offline since the start, before it had a key.
      entry.starting = false;
      entry.connected = false;
      entry.since = now();
    },
    opened(workspaceId, harnessId) {
      const entry = entryOf(workspaceId, harnessId);
      entry.sockets += 1;
      if (entry.offline !== undefined) clearTimeout(entry.offline);
      entry.offline = undefined;
      const back = heard(entry);
      if (entry.starting) {
        // Taken as connected until now; connected in fact from here, and nobody was told otherwise.
        entry.starting = false;
        entry.since = now();
        if (back) tell(workspaceId, harnessId, entry);
        return;
      }
      if (entry.connected) {
        if (back) tell(workspaceId, harnessId, entry);
        return;
      }
      entry.connected = true;
      entry.since = now();
      tell(workspaceId, harnessId, entry);
    },
    closed(workspaceId, harnessId) {
      const entry = entryOf(workspaceId, harnessId);
      entry.sockets = Math.max(0, entry.sockets - 1);
      if (entry.sockets > 0 || entry.offline !== undefined) return;
      const closedAt = now();
      entry.offline = setTimeout(() => {
        entry.offline = undefined;
        if (entry.sockets > 0 || !entry.connected) return;
        entry.connected = false;
        entry.since = closedAt;
        // Offline says more, and a harness that comes back says again what is still wrong.
        entry.trouble = undefined;
        tell(workspaceId, harnessId, entry);
      }, grace);
      entry.offline.unref?.();
    },
    report(workspaceId, harnessId, trouble) {
      const entry = entryOf(workspaceId, harnessId);
      // Whatever it says, it said something: a restart it was asked for is over, well or not.
      const back = heard(entry);
      const changed = sayTrouble(entry, trouble);
      if (back || changed) tell(workspaceId, harnessId, entry);
      return view(entry);
    },
    restarting(workspaceId, harnessId, by) {
      const entry = entryOf(workspaceId, harnessId);
      if (entry.restarting !== undefined) return view(entry);
      const wait = setTimeout(() => {
        if (entry.restarting?.wait !== wait) return;
        entry.restarting = undefined;
        tell(workspaceId, harnessId, entry);
      }, restartWait);
      wait.unref?.();
      entry.restarting = { by, since: now(), wait };
      tell(workspaceId, harnessId, entry);
      return view(entry);
    },
    watch(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      if (started !== undefined) clearTimeout(started);
      for (const { entry } of entries.values()) {
        if (entry.offline !== undefined) clearTimeout(entry.offline);
        entry.offline = undefined;
        if (entry.restarting !== undefined) clearTimeout(entry.restarting.wait);
        entry.restarting = undefined;
      }
      listeners.clear();
    },
  };
}
