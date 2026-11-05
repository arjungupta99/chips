/**
 * Small facts about this phone that are not the workspace's business: which appearance the
 * person chose, who took new spaces when the directory was last read (`newSpace/remembered.ts`),
 * who each room's field was last told a draft is for (`spaces/picks.ts`), and what was searched
 * for here (`search/recent.ts`).
 * A setting has a value and can be changed. It is not the workspace's — the server
 * never hears about it — which is why it is here and not in the store.
 *
 * There were flags here too, raised once and kept, for the one tip the app taught: the swipe on
 * a card in For you. That went with For you on 22 September 2026 (ADR 0065), and the flags with
 * it. A phone that raised one keeps the row in a table nothing reads.
 *
 * SQLite rather than the Keychain, because none of it is secret, and a table of its own rather
 * than the device store's, because the device store is about credentials and mixing the two
 * would put a UI hint next to a key reference. `prefs.web.ts` is the same shape over
 * `localStorage`, for the web target the Playwright suite drives.
 */

import * as SQLite from "expo-sqlite";

const DATABASE = "chips-prefs.db";

let opening: Promise<SQLite.SQLiteDatabase> | undefined;

function database(): Promise<SQLite.SQLiteDatabase> {
  opening ??= (async () => {
    const db = await SQLite.openDatabaseAsync(DATABASE);
    await db.execAsync(
      "CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    return db;
  })();
  return opening;
}

/** A setting's value, or nothing when it has never been set. */
export async function readSetting(name: string): Promise<string | undefined> {
  const db = await database();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE name = ?",
    [name],
  );
  return row?.value;
}

/** Set it, over whatever it was. */
export async function writeSetting(name: string, value: string): Promise<void> {
  const db = await database();
  await db.runAsync("INSERT OR REPLACE INTO settings (name, value) VALUES (?, ?)", [name, value]);
}

/** Every setting this app keeps, in one place so they cannot collide by accident. */
export const SETTINGS = {
  appearance: "appearance",
  /** Which colours the faces wear here, Soothing or Bright (`ui/faceTheme.ts`, ADR 0176). */
  faces: "faces",
  newSpace: "new-space",
  /** Whether this person turned Chips's pushes off here (ADR 0085). */
  push: "push",
  /** Who each room's field was last told a draft is for (`spaces/picks.ts`, ADR 0114). */
  picks: "picks",
  /** What was searched for here, newest first (`search/recent.ts`, ADR 0132). */
  recentSearches: "search.recent",
  /** The change each space's Universe was last opened at here (`spaces/universeSeen.ts`). */
  universeSeen: "universe.seen",
  /** The setup card put away, per paired device: `setup.hidden.<deviceId>` (ADR 0170). */
  setupHidden: "setup.hidden",
  /** Whether this phone has asked, once, to turn notifications on at an agent's ask (ADR 0170). */
  pushAsked: "push.asked",
  /**
   * The made-up workspace kept after its film, Look around (ADR 0213): `look-around`, or nothing.
   * The demo is never written where the device keeps its workspaces; this word builds it again.
   */
  demo: "demo",
} as const;
