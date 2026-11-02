/**
 * The offline cache on the phone: the same stores as the browser's, in SQLite.
 *
 * `@chipschat/core`'s cache is IndexedDB, which a phone does not have. The contract is what
 * matters and it is small — the events this workspace has seen, the cursor they are whole up to
 * (ADR 0049), where each space was last read, what was sent and not yet answered, and who the
 * server last said is who — so this is that contract over `expo-sqlite`, keyed as the browser's
 * is, by workspace and by the server the phone was paired with (core's `cacheKey`, SEC-8), so two
 * workspaces on one phone do not tread on each other, and nor do two servers naming one.
 *
 * Like the browser's, every method but `saveEvents` swallows its own failure and answers with
 * nothing. A phone whose storage will not open still runs; it just starts empty and holds
 * nothing between launches, which is a worse app rather than a broken one. `saveEvents` alone
 * lets its failure through, because the store must hear it: it holds the cursor back and writes
 * the batch again, so a relaunch reads what was lost rather than resuming past it.
 */

import type { Cache, ClientEvent } from "@chipschat/core";
import * as SQLite from "expo-sqlite";

/**
 * `read_state`, `outbox`, `cursor`, `participants` and `space-icons` are one JSON document each,
 * as they are in IndexedDB's `meta`.
 */
const READ_STATE = "read-state";
const OUTBOX = "outbox";
const MADE_HERE = "made-here";
const CURSOR = "cursor";
const PARTICIPANTS = "participants";
const SPACE_ICONS = "space-icons";
const HIDDEN_SPACES = "hidden-spaces";
const PINNED_SPACES = "pinned-spaces";

/** A plain object of values by key, as a JSON document keeps one: not an array, not null. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, space_id TEXT, json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS events_by_space ON events (space_id);
CREATE TABLE IF NOT EXISTS meta (name TEXT PRIMARY KEY, json TEXT NOT NULL);
`;

/** A key is `wsp_…@host:port`, but a file name is not the place to trust that. */
function fileFor(key: string): string {
  return `chips-cache-${key.replace(/[^A-Za-z0-9_-]/g, "_")}.db`;
}

/** The databases open now, by file, so a delete can close the one it is about to remove. */
const opened = new Map<string, Promise<SQLite.SQLiteDatabase>>();

/**
 * Delete a device's cache file (SEC-32): closed first when a store still holds it open, so the
 * next person with this phone reads nothing of a workspace it is no longer in. Nothing to delete
 * is nothing to do.
 */
export async function deleteSqliteCache(key: string): Promise<void> {
  const file = fileFor(key);
  const open = opened.get(file);
  opened.delete(file);
  try {
    if (open !== undefined) await (await open).closeAsync();
  } catch {
    // Not open after all.
  }
  try {
    await SQLite.deleteDatabaseAsync(file);
  } catch {
    // No such file: nothing kept.
  }
}

export function openSqliteCache(key: string): Cache {
  let opening: Promise<SQLite.SQLiteDatabase> | undefined;
  const open = (): Promise<SQLite.SQLiteDatabase> => {
    opening ??= (async () => {
      const db = await SQLite.openDatabaseAsync(fileFor(key));
      await db.execAsync(SCHEMA);
      return db;
    })();
    opened.set(fileFor(key), opening);
    return opening;
  };

  const withDb = async <T>(fn: (db: SQLite.SQLiteDatabase) => Promise<T>, fallback: T) => {
    try {
      return await fn(await open());
    } catch {
      // The next call opens again: a database that failed once may be there on the next launch.
      opening = undefined;
      return fallback;
    }
  };

  /**
   * `withDb` for the one write whose failure must be heard: the connection is dropped just the
   * same, and the error goes up in place of a fallback.
   */
  const orThrow = async <T>(fn: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> => {
    try {
      return await fn(await open());
    } catch (error) {
      opening = undefined;
      throw error;
    }
  };

  // Writes go one after another. The store saves each batch of events as it arrives and does
  // not wait for the save, and a harness finishing sends two batches within a few milliseconds:
  // the second opened a transaction on the connection the first still held, failed, and was
  // dropped on the floor by the catch above — five of a run's twelve events gone from the cache,
  // and the phone showing that run still going after every relaunch, since the store then
  // resumed from the highest event it had and never looked below it (11 September 2026, the
  // simulator's cache against the server's log: 4477 to 4481 missing, 4476 and 4482 kept). The
  // store now writes one batch at a time itself and resumes from a cursor it moves only behind a
  // batch that landed (ADR 0049); this queue is the second line, and keeps the meta writes
  // beside the events from crossing them.
  let queue: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => undefined);
    return next;
  };

  const meta = async <T>(name: string, fallback: T): Promise<T> =>
    withDb(async (db) => {
      const row = await db.getFirstAsync<{ json: string }>(
        "SELECT json FROM meta WHERE name = ?",
        name,
      );
      return row === null ? fallback : (JSON.parse(row.json) as T);
    }, fallback);

  const putMeta = (name: string, value: unknown) =>
    inTurn(() =>
      withDb(async (db) => {
        await db.runAsync(
          "INSERT INTO meta (name, json) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET json = excluded.json",
          name,
          JSON.stringify(value),
        );
      }, undefined),
    );

  return {
    loadEvents: () =>
      withDb<ClientEvent[]>(async (db) => {
        const rows = await db.getAllAsync<{ json: string }>("SELECT json FROM events ORDER BY seq");
        return rows.map((row) => JSON.parse(row.json) as ClientEvent);
      }, []),

    // The one write whose failure the store hears (the header): no fallback, the error goes up.
    saveEvents: (events) =>
      inTurn(() =>
        orThrow(async (db) => {
          if (events.length === 0) return;
          // One transaction: a page of a replay is five hundred events and five hundred
          // separate writes on a phone is seconds, not milliseconds.
          await db.withTransactionAsync(async () => {
            for (const event of events) {
              await db.runAsync(
                "INSERT INTO events (seq, space_id, json) VALUES (?, ?, ?) ON CONFLICT(seq) DO UPDATE SET space_id = excluded.space_id, json = excluded.json",
                event.seq,
                event.space_id ?? null,
                JSON.stringify(event),
              );
            }
          });
        }),
      ),

    forgetSpaces: (spaceIds) =>
      inTurn(() =>
        withDb(async (db) => {
          if (spaceIds.length === 0) return;
          const holes = spaceIds.map(() => "?").join(", ");
          await db.runAsync(`DELETE FROM events WHERE space_id IN (${holes})`, [...spaceIds]);
        }, undefined),
      ),

    loadCursor: async () => {
      const recorded = await meta<unknown>(CURSOR, 0);
      return typeof recorded === "number" ? recorded : 0;
    },
    saveCursor: (seq) => putMeta(CURSOR, seq),
    loadReadState: () => meta(READ_STATE, {}),
    saveReadState: (readState) => putMeta(READ_STATE, readState),
    loadOutbox: () => meta(OUTBOX, []),
    saveOutbox: (messages) => putMeta(OUTBOX, [...messages]),
    loadMadeHere: () => meta(MADE_HERE, []),
    saveMadeHere: (spaces) => putMeta(MADE_HERE, [...spaces]),
    loadParticipants: async () => {
      const kept = await meta<unknown>(PARTICIPANTS, undefined);
      return Array.isArray(kept) ? kept : undefined;
    },
    saveParticipants: (participants) => putMeta(PARTICIPANTS, [...participants]),
    loadSpaceIcons: async () => {
      const kept = await meta<unknown>(SPACE_ICONS, undefined);
      return isRecord(kept) ? kept : undefined;
    },
    saveSpaceIcons: (icons) => putMeta(SPACE_ICONS, { ...icons }),
    loadHiddenSpaces: async () => {
      const kept = await meta<unknown>(HIDDEN_SPACES, undefined);
      return Array.isArray(kept) ? kept.filter((id) => typeof id === "string") : undefined;
    },
    saveHiddenSpaces: (spaceIds) => putMeta(HIDDEN_SPACES, [...spaceIds]),
    loadPinnedSpaces: async () => {
      const kept = await meta<unknown>(PINNED_SPACES, undefined);
      return Array.isArray(kept) ? kept.filter((id) => typeof id === "string") : undefined;
    },
    savePinnedSpaces: (spaceIds) => putMeta(PINNED_SPACES, [...spaceIds]),
  };
}
