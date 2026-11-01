/**
 * M2.1's acceptance for `export` and `import`: a round trip yields identical projections.
 *
 * The check is worth what the import does not do. It never copies a projection row — only the
 * log and the registry travel — so the projections on the other side exist because `rebuild`
 * replayed the log through exactly the code live traffic uses. Comparing them is therefore a
 * test of ADR 0004's central claim, not of a file copy.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSqliteEventStore,
  type Database,
  migrateToLatest,
  openDatabase,
  PROJECTION_TABLES,
} from "@chipschat/server";
import type { Kysely } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../../../server/src/testing/workspace.js";
import {
  ATTACHMENTS_DIR,
  exportWorkspace,
  ImportError,
  importWorkspace,
  readFolder,
  restoreAttachments,
  writeFolder,
} from "./transfer.js";

const temporary: string[] = [];
const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const close of closers.splice(0)) await close();
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function scratch(): string {
  const directory = mkdtempSync(join(tmpdir(), "chips-transfer-"));
  temporary.push(directory);
  return directory;
}

/** An empty database of the same shape, to import into. */
async function emptyDatabase(): Promise<{ db: Kysely<Database>; directory: string }> {
  const directory = scratch();
  const connection = openDatabase({ databaseUrl: `sqlite:${join(directory, "chips.db")}` });
  closers.push(() => connection.close());
  await migrateToLatest(connection.db);
  return { db: connection.db, directory };
}

/** Every projection row for a workspace, in a shape two databases can be compared by. */
async function projections(db: Kysely<Database>, workspaceId: string) {
  const all: Record<string, unknown[]> = {};
  for (const table of PROJECTION_TABLES) {
    all[table] = await db
      .selectFrom(table)
      .selectAll()
      .where("workspace_id", "=", workspaceId)
      .orderBy("workspace_id")
      .execute();
  }
  return all;
}

/** The golden scenario's workspace, with its events already in the log. */
async function source(): Promise<TestWorkspace> {
  const ws = await createTestWorkspace();
  closers.push(() => ws.close());
  return ws;
}

describe("chips export and chips import", () => {
  it("carries the log and the registry, and replays the projections into place", async () => {
    const ws = await source();
    const before = await projections(ws.db, ws.workspaceId);
    expect(Object.values(before).some((rows) => rows.length > 0)).toBe(true);

    const folder = join(scratch(), "workspace");
    const snapshot = await exportWorkspace({
      db: ws.db,
      workspaceId: ws.workspaceId,
      at: "2026-09-04T12:00:00.000Z",
    });
    const attachments = scratch();
    await mkdir(join(attachments, "ab"), { recursive: true });
    writeFileSync(join(attachments, "ab", "cdef"), "an attachment's bytes");
    await writeFolder({ snapshot, folder, attachmentsRoot: attachments });

    const destination = await emptyDatabase();
    const read = await readFolder(folder);
    const store = createSqliteEventStore({ db: destination.db, now: () => "2026-09-04T12:00:01Z" });
    const result = await importWorkspace({
      db: destination.db,
      snapshot: read,
      rebuild: store.rebuild,
    });
    const restored = await restoreAttachments({
      folder,
      attachmentsRoot: join(destination.directory, ATTACHMENTS_DIR),
    });

    expect(result.workspaceId).toBe(ws.workspaceId);
    expect(result.replayed).toBe(snapshot.tables["events"]?.length);
    expect(restored.files).toBe(1);
    // The acceptance: identical projections, and the import never wrote one.
    expect(await projections(destination.db, ws.workspaceId)).toEqual(before);
  });

  it("carries the credentials nothing can derive, and says so by carrying them", async () => {
    const ws = await source();
    const snapshot = await exportWorkspace({
      db: ws.db,
      workspaceId: ws.workspaceId,
      at: "2026-09-04T12:00:00.000Z",
    });
    // A device's public key and a token's digest are registry rows, not log entries (ADR 0018):
    // without them an imported workspace would have no way to recognise anyone.
    expect(snapshot.tables["devices"]?.length).toBeGreaterThan(0);
    expect(snapshot.tables["harness_tokens"]?.length).toBeGreaterThan(0);
    expect(Object.keys(snapshot.tables)).not.toContain("messages");
  });

  it("refuses to import into a database that already holds the workspace", async () => {
    const ws = await source();
    const snapshot = await exportWorkspace({
      db: ws.db,
      workspaceId: ws.workspaceId,
      at: "2026-09-04T12:00:00.000Z",
    });
    const store = createSqliteEventStore({ db: ws.db, now: () => "2026-09-04T12:00:01Z" });
    await expect(
      importWorkspace({ db: ws.db, snapshot, rebuild: store.rebuild }),
    ).rejects.toBeInstanceOf(ImportError);
  });

  it("refuses a folder that holds no export", async () => {
    await expect(readFolder(scratch())).rejects.toBeInstanceOf(ImportError);
  });
});
