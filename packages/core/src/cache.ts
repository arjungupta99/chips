/**
 * The offline cache: the events a workspace has seen, how far they are whole, and where each
 * space was last read, in IndexedDB.
 *
 * It is what makes "reloading offline shows cached history" true (M1.2 acceptance). On start
 * the store loads the cache and folds it, so a person sees their spaces before — or
 * without — a network; the socket then resumes from the cursor recorded here and fills in what
 * changed. The cursor is the store's to move, and it moves only behind a batch of events that
 * has landed: the phone's cache once lost whole batches to a failed write, and a resume from the
 * highest event it held left the hole for ever (11 September 2026, ADR 0049). Where to resume is
 * recorded, never read off the events themselves. Read state lives here too, because where you
 * last looked is a property of the device, not of the log.
 *
 * What was sent and not yet answered is here too — the outbox, as the store last flushed it —
 * so a message typed while the socket was down is not lost to a reload: the next load shows it
 * pending again and sends it once the socket opens.
 *
 * And who is who, as the server last listed them: without it a launch knew nobody until
 * `GET /v1/participants` answered, so the Agents tab said "Agents · 0" and "No agents yet" on
 * every cold start, for as long as that took, and for good while offline (14 October 2026).
 * The faces a person chose for their rooms likewise, as `GET /v1/me/space-icons` last answered:
 * without them a launch drew every room's initials until it did, and for good when that read
 * failed (16 October 2026). And the rooms they hid from their list (ADR 0205), for the same reason.
 *
 * Keyed by workspace and by the server the device was paired with (`cacheKey`, SEC-8), so two
 * workspaces on one device do not tread on each other, and a server that claims another's
 * workspace id is handed nothing of the other's. Under Node it is never opened; the Playwright
 * suite exercises the real IndexedDB.
 */

import type { ClientEvent } from "./events.js";
import type { QueuedMessage } from "./pending.js";
import type { ReadState } from "./read-state.js";

export { cacheKey } from "./cacheKey.js";

const DB_PREFIX = "chips-cache";
const EVENTS = "events";
const META = "meta";
const READ_STATE_KEY = "read-state";
const OUTBOX_KEY = "outbox";
const CURSOR_KEY = "cursor";
const PARTICIPANTS_KEY = "participants";
const SPACE_ICONS_KEY = "space-icons";
const HIDDEN_SPACES_KEY = "hidden-spaces";
const PINNED_SPACES_KEY = "pinned-spaces";

function open(key: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`${DB_PREFIX}:${key}`, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      // Events are keyed by `seq`, so writing the same event twice is one row and a page loads
      // in order for free.
      if (!db.objectStoreNames.contains(EVENTS)) db.createObjectStore(EVENTS, { keyPath: "seq" });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    request.onsuccess = () => {
      const db = request.result;
      // A delete (`deleteCache`) waits on every open connection: this one closes when asked.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a device's cache (SEC-32): what signing out and being removed do with the history a
 * shared browser would otherwise keep under the next person's eyes. Resolves when the database
 * is gone, or at once where there is none to delete.
 */
export function deleteCache(key: string): Promise<void> {
  if (typeof indexedDB === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(`${DB_PREFIX}:${key}`);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

export interface Cache {
  readonly loadEvents: () => Promise<ClientEvent[]>;
  /**
   * Write a batch. Resolves once it is in; rejects when it is not, so the store holds the cursor
   * back and writes the batch again — never a quiet yes over a dropped batch, which is exactly
   * the hole the cursor is there to close. Without storage at all it resolves without writing:
   * there is nothing for a cursor to run ahead of.
   */
  readonly saveEvents: (events: readonly ClientEvent[]) => Promise<void>;
  /** Drop every event of these spaces: the reader has left them, and a reload must not bring them back. */
  readonly forgetSpaces: (spaceIds: readonly string[]) => Promise<void>;
  /**
   * Where the socket resumes (ADR 0049): every event this device was sent up to this `seq` is in
   * the cache. Zero when none was ever recorded — a fresh cache, or one from before the cursor
   * was kept — and the socket then reads the log from the start, which fills whatever such a
   * cache lacks.
   */
  readonly loadCursor: () => Promise<number>;
  readonly saveCursor: (seq: number) => Promise<void>;
  readonly loadReadState: () => Promise<ReadState>;
  readonly saveReadState: (readState: ReadState) => Promise<void>;
  /** The messages sent and not yet answered when the page last flushed, to go again after a reload. */
  readonly loadOutbox: () => Promise<QueuedMessage[]>;
  readonly saveOutbox: (messages: readonly QueuedMessage[]) => Promise<void>;
  /**
   * The rows `GET /v1/participants` last answered with, as they came: the store reads them as it
   * reads the server's, so a row a later build reads differently is read the new way. `undefined`
   * when this device has never had an answer, which is not the same as an answer with nobody in it.
   */
  readonly loadParticipants: () => Promise<readonly unknown[] | undefined>;
  readonly saveParticipants: (participants: readonly unknown[]) => Promise<void>;
  /**
   * The faces this person chose for their rooms, by space id, as `GET /v1/me/space-icons` last
   * answered or a pick since left them: read the way the server's are, each kept when it is a
   * face. `undefined` when this device has never had an answer.
   */
  readonly loadSpaceIcons: () => Promise<Readonly<Record<string, unknown>> | undefined>;
  readonly saveSpaceIcons: (icons: Readonly<Record<string, unknown>>) => Promise<void>;
  /**
   * The rooms this person hid from their list (ADR 0205), by space id, as
   * `GET /v1/me/hidden-spaces` last answered or a hide since left them. `undefined` when this
   * device has never had an answer.
   */
  readonly loadHiddenSpaces: () => Promise<readonly string[] | undefined>;
  readonly saveHiddenSpaces: (spaceIds: readonly string[]) => Promise<void>;
  /**
   * The rooms this person pinned to the top of their list (ADR 0240), newest pin first, as
   * `GET /v1/me/pinned-spaces` last answered or a pin since left them. `undefined` when this
   * device has never had an answer.
   */
  readonly loadPinnedSpaces: () => Promise<readonly string[] | undefined>;
  readonly savePinnedSpaces: (spaceIds: readonly string[]) => Promise<void>;
}

/** A plain object of values by key, as a JSON document keeps one: not an array, not null. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One value out of `meta`, or `fallback` when its key was never written. */
function getMeta<T>(db: IDBDatabase, key: string, fallback: T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const request = db.transaction(META, "readonly").objectStore(META).get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? fallback);
    request.onerror = () => reject(request.error);
  });
}

/** One value into `meta` under its key, as one transaction. */
function putMeta(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META, "readwrite");
    tx.objectStore(META).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * A cache that quietly does nothing when IndexedDB is not there — a private window, or a browser
 * with storage disabled. The app still works; it just starts empty and holds nothing between
 * loads. Every method but `saveEvents` swallows its own failure for the same reason; that one
 * reports it, so the store can hold the cursor back (see the interface).
 */
export function openCache(key: string): Cache {
  const withDb = async <T>(fn: (db: IDBDatabase) => Promise<T>, fallback: T): Promise<T> => {
    if (typeof indexedDB === "undefined") return fallback;
    try {
      return await fn(await open(key));
    } catch {
      return fallback;
    }
  };

  return {
    loadEvents: () =>
      withDb(
        (db) =>
          new Promise<ClientEvent[]>((resolve, reject) => {
            const request = db.transaction(EVENTS, "readonly").objectStore(EVENTS).getAll();
            request.onsuccess = () => resolve(request.result as ClientEvent[]);
            request.onerror = () => reject(request.error);
          }),
        [],
      ),

    saveEvents: async (events) => {
      if (typeof indexedDB === "undefined") return;
      const db = await open(key);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(EVENTS, "readwrite");
        const store = tx.objectStore(EVENTS);
        for (const event of events) store.put(event);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        // A write the browser cannot make — out of quota, most likely — aborts the transaction,
        // and an abort is not always announced by an error first.
        tx.onabort = () => reject(tx.error ?? new Error("The cache transaction was aborted."));
      });
    },

    forgetSpaces: (spaceIds) =>
      withDb(async (db) => {
        const gone = new Set(spaceIds);
        if (gone.size === 0) return;
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(EVENTS, "readwrite");
          const request = tx.objectStore(EVENTS).openCursor();
          request.onsuccess = () => {
            const cursor = request.result;
            if (cursor === null) return;
            const row = cursor.value as ClientEvent;
            if (typeof row.space_id === "string" && gone.has(row.space_id)) cursor.delete();
            cursor.continue();
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }, undefined),

    loadCursor: () =>
      withDb(async (db) => {
        const recorded = await getMeta<unknown>(db, CURSOR_KEY, 0);
        return typeof recorded === "number" ? recorded : 0;
      }, 0),

    saveCursor: (seq) => withDb((db) => putMeta(db, CURSOR_KEY, seq), undefined),

    loadReadState: () => withDb((db) => getMeta<ReadState>(db, READ_STATE_KEY, {}), {}),

    saveReadState: (readState) => withDb((db) => putMeta(db, READ_STATE_KEY, readState), undefined),

    loadOutbox: () => withDb((db) => getMeta<QueuedMessage[]>(db, OUTBOX_KEY, []), []),

    saveOutbox: (messages) => withDb((db) => putMeta(db, OUTBOX_KEY, [...messages]), undefined),

    loadParticipants: () =>
      withDb(async (db) => {
        const kept = await getMeta<unknown>(db, PARTICIPANTS_KEY, undefined);
        return Array.isArray(kept) ? kept : undefined;
      }, undefined),

    saveParticipants: (participants) =>
      withDb((db) => putMeta(db, PARTICIPANTS_KEY, [...participants]), undefined),

    loadSpaceIcons: () =>
      withDb(async (db) => {
        const kept = await getMeta<unknown>(db, SPACE_ICONS_KEY, undefined);
        return isRecord(kept) ? kept : undefined;
      }, undefined),

    saveSpaceIcons: (icons) =>
      withDb((db) => putMeta(db, SPACE_ICONS_KEY, { ...icons }), undefined),

    loadHiddenSpaces: () =>
      withDb(async (db) => {
        const kept = await getMeta<unknown>(db, HIDDEN_SPACES_KEY, undefined);
        return Array.isArray(kept) ? kept.filter((id) => typeof id === "string") : undefined;
      }, undefined),

    saveHiddenSpaces: (spaceIds) =>
      withDb((db) => putMeta(db, HIDDEN_SPACES_KEY, [...spaceIds]), undefined),

    loadPinnedSpaces: () =>
      withDb(async (db) => {
        const kept = await getMeta<unknown>(db, PINNED_SPACES_KEY, undefined);
        return Array.isArray(kept) ? kept.filter((id) => typeof id === "string") : undefined;
      }, undefined),

    savePinnedSpaces: (spaceIds) =>
      withDb((db) => putMeta(db, PINNED_SPACES_KEY, [...spaceIds]), undefined),
  };
}
