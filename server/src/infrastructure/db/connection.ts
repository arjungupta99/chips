/**
 * The SQLite connection. Solo mode is one process and one file (ADR 0002, ADR 0003).
 *
 * The pragmas are not decoration. WAL lets a reader run while a writer holds the log open;
 * `foreign_keys` is off by default in SQLite and has to be asked for; `busy_timeout` turns a
 * lock collision into a wait instead of an error.
 */

import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { isNoReply } from "@chipschat/protocol";
import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import type { Database } from "./schema.js";

export class DatabaseUrlError extends Error {
  override readonly name = "DatabaseUrlError";
  constructor(url: string) {
    super(`expected a sqlite: database URL, got ${JSON.stringify(url)}`);
  }
}

/** `sqlite:./.chips/chips.db` -> `./.chips/chips.db`, and `sqlite::memory:` -> `:memory:`. */
export function sqlitePathFrom(databaseUrl: string): string {
  if (!databaseUrl.startsWith("sqlite:")) throw new DatabaseUrlError(databaseUrl);
  return databaseUrl.slice("sqlite:".length);
}

export interface ConnectionOptions {
  /** A `sqlite:` URL, as it appears in the configuration. */
  readonly databaseUrl: string;
  /** Create the containing directory if it is missing. Defaults to true. */
  readonly createDirectory?: boolean;
}

export interface Connection {
  readonly db: Kysely<Database>;
  readonly close: () => Promise<void>;
}

export function openDatabase(options: ConnectionOptions): Connection {
  const path = sqlitePathFrom(options.databaseUrl);

  if (path !== ":memory:" && options.createDirectory !== false) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  }

  const sqlite = new SQLite(path);
  // The log is the workspace: every message, every decision, the digests of every token. It is
  // the owner's to read, like every file the CLI writes, rather than the umask's. Done before
  // WAL mode, because SQLite gives the -wal and -shm files the mode the database has.
  if (path !== ":memory:") ownerOnly(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  // The log is the truth and it is fsynced by the WAL checkpoint; NORMAL is the right trade
  // for a single-process server and roughly an order of magnitude faster on append.
  sqlite.pragma("synchronous = NORMAL");
  // Whether words pass a turn (ADR 0105), for a query that leaves out what such a turn did: the
  // protocol's own rule, so the server reads `NO_REPLY` as the clients and the fake do.
  sqlite.function("no_reply", { deterministic: true }, (text: unknown) =>
    isNoReply(text) ? 1 : 0,
  );

  const db = new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });

  return {
    db,
    close: async () => {
      await db.destroy();
    },
  };
}

/** Owner-only, on the file and on the WAL and SHM files if they are already there. */
function ownerOnly(path: string): void {
  for (const file of [path, `${path}-wal`, `${path}-shm`]) {
    if (existsSync(file)) chmodSync(file, 0o600);
  }
}
