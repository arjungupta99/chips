/**
 * `chips export` and `chips import` — a workspace, out of one machine and into another.
 *
 * What travels is the log and the registry, and the attachments' bytes. Not the projections:
 * every one of them is rebuildable from the log (ADR 0004), and replaying them on the way in is
 * what proves the claim rather than just repeating it. M2.1's acceptance is exactly that —
 * export then import yields identical projections — and it is a real check, because the import
 * never copies a projection row.
 *
 * The registry travels because it is not derivable: a device's public key and a token's digest
 * are not in the log and must not be (ADR 0018). That means an export is a credential-bearing
 * file, so it is written owner-only and the command says so.
 */

import { createReadStream, createWriteStream, existsSync, mkdirSync } from "node:fs";
import { copyFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import type { Database } from "@chipschat/server";
import type { Kysely } from "kysely";

/** The tables an export carries: the log, and the registry rows nothing can derive. */
export const EXPORTED_TABLES = [
  "workspaces",
  "participants",
  "devices",
  "harness_tokens",
  "events",
] as const;

export interface Snapshot {
  readonly version: 1;
  readonly exportedAt: string;
  readonly workspaceId: string;
  readonly tables: Readonly<Record<string, readonly Record<string, unknown>[]>>;
}

export async function exportWorkspace(input: {
  readonly db: Kysely<Database>;
  readonly workspaceId: string;
  readonly at: string;
}): Promise<Snapshot> {
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const table of EXPORTED_TABLES) {
    const rows = await input.db
      .selectFrom(table)
      .selectAll()
      .where(table === "workspaces" ? "id" : "workspace_id", "=", input.workspaceId)
      .execute();
    tables[table] = rows as Record<string, unknown>[];
  }
  return {
    version: 1,
    exportedAt: input.at,
    workspaceId: input.workspaceId,
    tables,
  };
}

export class ImportError extends Error {
  override readonly name = "ImportError";
}

/**
 * Everything in one transaction, and the projections replayed from the log afterwards. An
 * import into a database that already holds the workspace is refused rather than merged: two
 * logs with the same ids are not one log, and guessing which row wins is not something a
 * command should do quietly.
 */
export async function importWorkspace(input: {
  readonly db: Kysely<Database>;
  readonly snapshot: Snapshot;
  readonly rebuild: (workspaceId: string) => Promise<{ replayed: number }>;
}): Promise<{ workspaceId: string; replayed: number; rows: number }> {
  const { db, snapshot } = input;
  if (snapshot.version !== 1) {
    throw new ImportError(
      `This export says version ${String(snapshot.version)}; this build reads 1.`,
    );
  }
  const already = await db
    .selectFrom("workspaces")
    .select("id")
    .where("id", "=", snapshot.workspaceId)
    .executeTakeFirst();
  if (already !== undefined) {
    throw new ImportError(
      `${snapshot.workspaceId} is already in this database. Import into an empty one.`,
    );
  }

  let rows = 0;
  await db.transaction().execute(async (trx) => {
    for (const table of EXPORTED_TABLES) {
      const values = snapshot.tables[table] ?? [];
      if (values.length === 0) continue;
      // In pages: SQLite has a limit on how many variables one statement can bind, and an
      // event log is the one table that will always be long enough to find it.
      for (let from = 0; from < values.length; from += 200) {
        await trx
          .insertInto(table)
          .values(values.slice(from, from + 200) as never)
          .execute();
      }
      rows += values.length;
    }
  });
  const { replayed } = await input.rebuild(snapshot.workspaceId);
  return { workspaceId: snapshot.workspaceId, replayed, rows };
}

/**
 * A workspace folder: the snapshot, gzipped, and the attachments beside it. The plan's word is
 * "folder", and a folder is what a person can look inside, copy to a drive and hand over.
 */
export const SNAPSHOT_FILE = "workspace.json.gz";
export const ATTACHMENTS_DIR = "attachments";

export async function writeFolder(input: {
  readonly snapshot: Snapshot;
  readonly folder: string;
  readonly attachmentsRoot: string;
}): Promise<{ files: number }> {
  mkdirSync(input.folder, { recursive: true, mode: 0o700 });
  const gzip = createGzip();
  const written = pipeline(
    gzip,
    createWriteStream(join(input.folder, SNAPSHOT_FILE), { mode: 0o600 }),
  );
  gzip.end(JSON.stringify(input.snapshot));
  await written;

  const files = await attachmentFiles(input.attachmentsRoot);
  for (const file of files) {
    const to = join(input.folder, ATTACHMENTS_DIR, file);
    mkdirSync(dirname(to), { recursive: true });
    await copyFile(join(input.attachmentsRoot, file), to);
  }
  return { files: files.length };
}

export async function readFolder(folder: string): Promise<Snapshot> {
  const path = join(folder, SNAPSHOT_FILE);
  if (!existsSync(path)) throw new ImportError(`There is no export in ${folder}.`);
  const chunks: Buffer[] = [];
  const gunzip = createGunzip();
  createReadStream(path).pipe(gunzip);
  for await (const chunk of gunzip) chunks.push(chunk as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Snapshot;
  } catch {
    throw new ImportError(`${path} is not a Chips export.`);
  }
}

/** The attachments back beside the database they belong to. */
export async function restoreAttachments(input: {
  readonly folder: string;
  readonly attachmentsRoot: string;
}): Promise<{ files: number }> {
  const from = join(input.folder, ATTACHMENTS_DIR);
  const files = await attachmentFiles(from);
  for (const file of files) {
    const to = join(input.attachmentsRoot, file);
    mkdirSync(dirname(to), { recursive: true });
    await copyFile(join(from, file), to);
  }
  return { files: files.length };
}

/** The attachment files under a root, as paths relative to it. */
export async function attachmentFiles(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const found: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) found.push(relative(root, path));
    }
  };
  await walk(root);
  return found.sort();
}
