/**
 * The database is the workspace, and it is the owner's: the directory `openDatabase` makes and
 * every file SQLite writes there are readable by nobody else on the machine.
 */

import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./connection.js";
import { migrateToLatest } from "./migrator.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function mode(path: string): string {
  return (statSync(path).mode & 0o777).toString(8);
}

describe("openDatabase", () => {
  it("makes the directory and the database owner-only, and the WAL files with them", async () => {
    const directory = mkdtempSync(join(tmpdir(), "chips-connection-"));
    directories.push(directory);
    const path = join(directory, "data", "chips.db");
    const connection = openDatabase({ databaseUrl: `sqlite:${path}` });
    // A write, so the WAL and SHM files exist to be checked.
    await migrateToLatest(connection.db, () => "2026-09-05T00:00:00.000Z");

    expect(mode(join(directory, "data"))).toBe("700");
    expect(mode(path)).toBe("600");
    expect(mode(`${path}-wal`)).toBe("600");
    expect(mode(`${path}-shm`)).toBe("600");
    await connection.close();
  });

  it("tightens a database it finds with a looser mode", async () => {
    const directory = mkdtempSync(join(tmpdir(), "chips-connection-"));
    directories.push(directory);
    const path = join(directory, "chips.db");
    const first = openDatabase({ databaseUrl: `sqlite:${path}` });
    await first.close();
    const { chmodSync } = await import("node:fs");
    chmodSync(path, 0o644);

    const again = openDatabase({ databaseUrl: `sqlite:${path}` });
    expect(mode(path)).toBe("600");
    await again.close();
  });
});
