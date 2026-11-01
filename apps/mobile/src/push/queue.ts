/**
 * Decisions made on the lock screen, kept until the server has them.
 *
 * The order matters and is the whole reason this exists: the decision is written here *before*
 * anything is sent. A person pressing Deny on a train in a tunnel has decided; the phone owes
 * them the delivery, whenever the signal comes back. On the next foreground the queue is
 * drained, and a row goes only once the server has taken it.
 *
 * Its own SQLite file, not the prefs one: a pref is a hint about the interface and this is a
 * person's answer to a question that is holding a run up. `queue.web.ts` is the same shape over
 * `localStorage`, for the web target the Playwright suite drives.
 */

import * as SQLite from "expo-sqlite";
import type { PendingDecision } from "./payload";

const DATABASE = "chips-pending.db";

let opening: Promise<SQLite.SQLiteDatabase> | undefined;

function database(): Promise<SQLite.SQLiteDatabase> {
  opening ??= (async () => {
    const db = await SQLite.openDatabaseAsync(DATABASE);
    await db.execAsync(
      `CREATE TABLE IF NOT EXISTS pending_decisions (
         approval_id TEXT PRIMARY KEY,
         space_id TEXT NOT NULL,
         run_id TEXT NOT NULL,
         decision TEXT NOT NULL,
         at TEXT NOT NULL
       )`,
    );
    // Which workspace's server is owed it (ADR 0197), on a table made before there could be two.
    const columns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(pending_decisions)");
    if (!columns.some((column) => column.name === "device_id")) {
      await db.execAsync("ALTER TABLE pending_decisions ADD COLUMN device_id TEXT");
    }
    return db;
  })();
  return opening;
}

/**
 * Remember a decision. The first answer to an ask wins: a second press on a notification that
 * is still on screen does not overwrite what the person already said.
 */
export async function remember(decision: PendingDecision): Promise<void> {
  const db = await database();
  await db.runAsync(
    `INSERT OR IGNORE INTO pending_decisions (approval_id, space_id, run_id, decision, at, device_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      decision.approvalId,
      decision.spaceId,
      decision.runId,
      decision.decision,
      decision.at,
      decision.deviceId ?? null,
    ],
  );
}

/** Everything still owed to the server, oldest first. */
export async function pending(): Promise<PendingDecision[]> {
  const db = await database();
  const rows = await db.getAllAsync<{
    approval_id: string;
    space_id: string;
    run_id: string;
    decision: string;
    at: string;
    device_id: string | null;
  }>("SELECT * FROM pending_decisions ORDER BY at");
  return rows.map((row) => ({
    approvalId: row.approval_id,
    spaceId: row.space_id,
    runId: row.run_id,
    decision: row.decision === "approved" ? "approved" : "denied",
    at: row.at,
    ...(row.device_id === null ? {} : { deviceId: row.device_id }),
  }));
}

/** The server has it. */
export async function forget(approvalId: string): Promise<void> {
  const db = await database();
  await db.runAsync("DELETE FROM pending_decisions WHERE approval_id = ?", [approvalId]);
}

/**
 * The room is gone (ADR 0067): an answer owed into it can never be taken, and would be sent again
 * at every foreground for ever, since nothing would ever show its ask answered.
 */
export async function forgetSpace(spaceId: string): Promise<void> {
  const db = await database();
  await db.runAsync("DELETE FROM pending_decisions WHERE space_id = ?", [spaceId]);
}
