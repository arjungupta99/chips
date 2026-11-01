/**
 * The operator token file (ADR 0048): written owner-only on start, and taken away on stop —
 * but only when it is still this server's own token. The last part is what keeps a second,
 * short-lived `chipsd` sharing the data directory from orphaning a long-running server's token.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  newOperatorToken,
  operatorTokenFile,
  operatorTokenPath,
  readOperatorToken,
  removeOperatorToken,
  writeOperatorToken,
} from "./operator.js";

/** A config with only the two parts the token's path is made of. */
function workspace(directory: string, port = 4431) {
  return { data: { dir: directory, databaseUrl: "" }, server: { host: "127.0.0.1", port } };
}

const dirs: string[] = [];
function dir(): string {
  const made = mkdtempSync(join(tmpdir(), "chips-operator-"));
  dirs.push(made);
  return made;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("the operator token file", () => {
  it("is written owner-only and read back, and a fresh token is base64url of 32 bytes", () => {
    const path = operatorTokenPath(workspace(dir()));
    const token = newOperatorToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    writeOperatorToken(path, token);
    expect(readOperatorToken(path)).toBe(token);
  });

  it("is named for the port it belongs to", () => {
    expect(operatorTokenFile(4431)).toBe("operator.4431.token");
    expect(operatorTokenPath(workspace("/tmp/ws", 4499))).toBe("/tmp/ws/operator.4499.token");
  });

  it("gives two servers on one data directory different files, because ports cannot collide", () => {
    const directory = dir();
    const agent = operatorTokenPath(workspace(directory, 4431));
    const scratch = operatorTokenPath(workspace(directory, 4499));
    expect(agent).not.toBe(scratch);

    const live = newOperatorToken();
    writeOperatorToken(agent, live);
    // The scratch server starts beside the long-running one and stops again. Neither its write
    // nor its removal can reach the token the live server is still answering with.
    const passing = newOperatorToken();
    writeOperatorToken(scratch, passing);
    removeOperatorToken(scratch, passing);
    expect(readOperatorToken(agent)).toBe(live);
  });

  it("is nothing when there is no file", () => {
    const path = operatorTokenPath(workspace(dir()));
    expect(readOperatorToken(path)).toBeUndefined();
  });

  it("is removed on stop when the file still holds this server's token", () => {
    const path = operatorTokenPath(workspace(dir()));
    const token = newOperatorToken();
    writeOperatorToken(path, token);
    removeOperatorToken(path, token);
    expect(existsSync(path)).toBe(false);
  });

  it("leaves a token another server wrote — a stray chipsd cannot orphan the live one", () => {
    const path = operatorTokenPath(workspace(dir()));
    const live = newOperatorToken();
    writeOperatorToken(path, live);
    // A second, short-lived server stops; the token it once had is not the one on disk now.
    removeOperatorToken(path, newOperatorToken());
    expect(existsSync(path)).toBe(true);
    expect(readOperatorToken(path)).toBe(live);
  });

  it("is a no-op, not a throw, when the file is already gone", () => {
    const path = operatorTokenPath(workspace(dir()));
    expect(() => removeOperatorToken(path, newOperatorToken())).not.toThrow();
  });

  it("does not mistake a substring or a differently-trimmed value for its own", () => {
    const path = operatorTokenPath(workspace(dir()));
    const token = newOperatorToken();
    writeOperatorToken(path, token);
    // The file is stored with a trailing newline; the compare trims, so the exact token matches
    // and a prefix of it does not.
    writeFileSync(path, `${token}extra\n`);
    removeOperatorToken(path, token);
    expect(existsSync(path)).toBe(true);
  });
});
