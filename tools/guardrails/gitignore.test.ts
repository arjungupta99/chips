/**
 * What never belongs in the repository is ignored by name (SEC-16): a database and the files
 * SQLite keeps beside it, Apple's push and signing keys, certificates, provisioning profiles, any
 * private key or PEM. The history was rewritten once to take a data directory out (September 2026);
 * the ignore list is what keeps the next one from going in. Asked of `git` itself, at the root and
 * in a folder, so the rule is the one the working tree lives under, not a copy of it.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../", import.meta.url));

/** Whether git would ignore a file at this path, were it there. */
function ignored(path: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "-q", "--no-index", path], { cwd: REPO, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("what is ignored by name (SEC-16)", () => {
  it("keeps a database's sidecars and every kind of key out, wherever they land", () => {
    for (const name of [
      "chips.db",
      "chips.db-wal",
      "chips.db-shm",
      "AuthKey_ABC123DEF4.p8",
      "distribution.p12",
      "server.pem",
      "relay.key",
      "Chips_Dev.mobileprovision",
    ]) {
      expect(ignored(name), name).toBe(true);
      expect(ignored(`server/data/${name}`), `server/data/${name}`).toBe(true);
    }
  });

  it("still takes the sources beside them", () => {
    for (const name of ["server/src/gateway.ts", "docs/SECURITY.md", "tools/phone/team.mjs"]) {
      expect(ignored(name), name).toBe(false);
    }
  });
});
