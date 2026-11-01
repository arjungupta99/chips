/**
 * The phone's cache against a stand-in for `expo-sqlite`: a database kept in a `Map`, which
 * speaks the statements this module speaks and throws at any other, and which refuses a
 * transaction inside a transaction as SQLite does — the refusal that lost whole batches until
 * 11 September 2026. The real `expo-sqlite` is native and is exercised on a device; what is
 * proved here is what the module does with what it answers: every batch kept when two saves
 * arrive together, a space forgotten and no other, the cursor's and the participants' round trips
 * (ADR 0049), and the one write whose failure the store must hear.
 */

import type { ClientEvent } from "@chipschat/core";
import * as SQLite from "expo-sqlite";
import { deleteSqliteCache, openSqliteCache } from "./sqlite";

jest.mock("expo-sqlite", () => {
  // Named `mock…`: Jest's hoisting reads a type's name as a variable the factory must not reach.
  interface MockRow {
    space_id: string | null;
    json: string;
  }
  interface MockFile {
    events: Map<number, MockRow>;
    meta: Map<string, string>;
    /** Every transaction on the file fails, as one does on a database another hand holds. */
    locked: boolean;
  }
  const files = new Map<string, MockFile>();
  const fileNamed = (name: string): MockFile => {
    let file = files.get(name);
    if (file === undefined) {
      file = { events: new Map(), meta: new Map(), locked: false };
      files.set(name, file);
    }
    return file;
  };
  /** `runAsync(sql, [a, b])` and `runAsync(sql, a, b)` are both `expo-sqlite`'s. */
  const flat = (params: unknown[]): unknown[] =>
    params.length === 1 && Array.isArray(params[0]) ? (params[0] as unknown[]) : params;
  const unspoken = (sql: string) => new Error(`not spoken here: ${sql}`);

  class FakeDatabase {
    private busy = false;
    private readonly file: MockFile;
    constructor(file: MockFile) {
      this.file = file;
    }
    closed = false;
    async execAsync(sql: string): Promise<void> {
      if (this.closed) throw new Error("database is closed");
      if (!sql.includes("CREATE TABLE")) throw unspoken(sql);
    }
    async closeAsync(): Promise<void> {
      this.closed = true;
    }
    async runAsync(sql: string, ...raw: unknown[]): Promise<void> {
      const params = flat(raw);
      if (sql.startsWith("INSERT INTO meta")) return this.putMeta(params);
      if (sql.startsWith("INSERT INTO events")) return this.putEvent(params);
      if (sql.startsWith("DELETE FROM events WHERE space_id IN")) return this.forget(params);
      throw unspoken(sql);
    }
    private putMeta(params: unknown[]): void {
      this.file.meta.set(String(params[0]), String(params[1]));
    }
    private putEvent(params: unknown[]): void {
      this.file.events.set(Number(params[0]), {
        space_id: params[1] === null ? null : String(params[1]),
        json: String(params[2]),
      });
    }
    private forget(params: unknown[]): void {
      const gone = new Set(params.map(String));
      for (const [seq, row] of this.file.events) {
        if (row.space_id !== null && gone.has(row.space_id)) this.file.events.delete(seq);
      }
    }
    async getFirstAsync(sql: string, ...raw: unknown[]): Promise<{ json: string } | null> {
      if (!sql.startsWith("SELECT json FROM meta")) throw unspoken(sql);
      const json = this.file.meta.get(String(flat(raw)[0]));
      return json === undefined ? null : { json };
    }
    async getAllAsync(sql: string): Promise<{ json: string }[]> {
      if (!sql.startsWith("SELECT json FROM events")) throw unspoken(sql);
      return [...this.file.events.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, row]) => ({ json: row.json }));
    }
    async withTransactionAsync(fn: () => Promise<void>): Promise<void> {
      if (this.file.locked) throw new Error("database is locked");
      if (this.busy) throw new Error("cannot start a transaction within a transaction");
      this.busy = true;
      try {
        await fn();
      } finally {
        this.busy = false;
      }
    }
  }

  return {
    openDatabaseAsync: async (name: string) => new FakeDatabase(fileNamed(name)),
    deleteDatabaseAsync: async (name: string) => {
      if (!files.delete(name)) throw new Error("no such database");
    },
    /** The test's hand on the file: locked, every transaction on it fails. */
    mockLock: (name: string, locked: boolean) => {
      fileNamed(name).locked = locked;
    },
  };
});

/** The stand-in's own control, beside the module's real surface. */
const stand = SQLite as unknown as { mockLock: (name: string, locked: boolean) => void };

function line(seq: number, spaceId = "spc_1"): ClientEvent {
  return {
    seq,
    type: "message.post",
    id: `evt_${seq}`,
    ts: "2026-09-11T00:00:00.000Z",
    workspace_id: "ws_1",
    space_id: spaceId,
    actor: { kind: "harness", id: "hrn_1" },
    text: `message ${seq}`,
  };
}

const seqs = (events: readonly ClientEvent[]) => events.map((event) => event.seq);

describe("the phone's cache", () => {
  it("deletes a device's cache, closing it first when a store still holds it (SEC-32)", async () => {
    const cache = openSqliteCache("ws_gone");
    await cache.saveCursor(7);
    expect(await cache.loadCursor()).toBe(7);
    await deleteSqliteCache("ws_gone");
    // Opened again, it is a new cache: no cursor recorded yet.
    expect(await openSqliteCache("ws_gone").loadCursor()).toBe(0);
    // Deleting what is not there is nothing to do.
    await expect(deleteSqliteCache("ws_never")).resolves.toBeUndefined();
  });

  it("keeps every batch when two saves arrive within the same tick", async () => {
    const cache = openSqliteCache("ws_burst");
    // Not awaited between them: the store saves as each batch arrives and does not wait.
    const first = cache.saveEvents([line(1), line(2)]);
    const second = cache.saveEvents([line(3)]);
    await Promise.all([first, second]);
    expect(seqs(await cache.loadEvents())).toEqual([1, 2, 3]);
  });

  it("drops a space's events when the reader has left it, and no other's", async () => {
    const cache = openSqliteCache("ws_left");
    await cache.saveEvents([line(1, "spc_1"), line(2, "spc_2"), line(3, "spc_1")]);
    await cache.forgetSpaces(["spc_2"]);
    expect(seqs(await cache.loadEvents())).toEqual([1, 3]);
  });

  it("has no cursor until one is recorded, and then the one recorded (ADR 0049)", async () => {
    const cache = openSqliteCache("ws_cursor");
    expect(await cache.loadCursor()).toBe(0);
    await cache.saveEvents([line(1), line(2)]);
    await cache.saveCursor(2);
    // A second opening of the same file reads it back: this is what a relaunch resumes from.
    expect(await openSqliteCache("ws_cursor").loadCursor()).toBe(2);
  });

  it("has no participants until an answer is kept, and an empty answer is kept as one", async () => {
    const cache = openSqliteCache("ws_people");
    expect(await cache.loadParticipants()).toBeUndefined();
    await cache.saveParticipants([]);
    expect(await cache.loadParticipants()).toEqual([]);
    const rows = [{ id: "agt_1", kind: "agent", display_name: "Mira", owner_id: null }];
    await cache.saveParticipants(rows);
    // A relaunch reads it back: this is what the Agents tab lists before the server answers.
    expect(await openSqliteCache("ws_people").loadParticipants()).toEqual(rows);
  });

  it("has no room faces until an answer is kept, and then the faces kept, after a relaunch too", async () => {
    const cache = openSqliteCache("ws_faces");
    expect(await cache.loadSpaceIcons()).toBeUndefined();
    await cache.saveSpaceIcons({});
    expect(await cache.loadSpaceIcons()).toEqual({});
    const faces = { spc_1: { icon: "lighthouse", ground: 23 }, spc_2: { icon: "", ground: 4 } };
    await cache.saveSpaceIcons(faces);
    expect(await openSqliteCache("ws_faces").loadSpaceIcons()).toEqual(faces);
  });

  it("has no hidden rooms until an answer is kept, then those kept, after a relaunch too (ADR 0205)", async () => {
    const cache = openSqliteCache("ws_hidden");
    expect(await cache.loadHiddenSpaces()).toBeUndefined();
    await cache.saveHiddenSpaces([]);
    expect(await cache.loadHiddenSpaces()).toEqual([]);
    await cache.saveHiddenSpaces(["spc_1", "spc_2"]);
    expect(await openSqliteCache("ws_hidden").loadHiddenSpaces()).toEqual(["spc_1", "spc_2"]);
  });

  it("keeps the rooms pinned in their order, after a relaunch too (ADR 0240)", async () => {
    const cache = openSqliteCache("ws_pinned");
    expect(await cache.loadPinnedSpaces()).toBeUndefined();
    await cache.savePinnedSpaces(["spc_2", "spc_1"]);
    expect(await openSqliteCache("ws_pinned").loadPinnedSpaces()).toEqual(["spc_2", "spc_1"]);
  });

  it("lets a failed write be heard, so the store holds the cursor back, and writes again once it can", async () => {
    const cache = openSqliteCache("ws_locked");
    stand.mockLock("chips-cache-ws_locked.db", true);
    await expect(cache.saveEvents([line(1)])).rejects.toThrow("database is locked");
    // The other writes keep their quiet fallback: a cursor that cannot be read is none.
    expect(await cache.loadCursor()).toBe(0);
    stand.mockLock("chips-cache-ws_locked.db", false);
    await cache.saveEvents([line(1)]);
    expect(seqs(await cache.loadEvents())).toEqual([1]);
  });
});
