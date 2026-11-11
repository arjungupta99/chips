/**
 * Where a harness keeps its key: the command the macOS keychain is given carries the secret on
 * stdin, never on argv (SEC-34).
 */

import { describe, expect, it } from "vitest";
import { addPasswordCommand, type KeyStore, orInTheFile } from "./keep.js";

describe("the keychain's command (SEC-34)", () => {
  it("carries the secret to the tool's stdin, quoted, and never onto its argv", () => {
    expect(addPasswordCommand("hermes@http://127.0.0.1:4431", 'chips_at_se"c\\ret')).toBe(
      'add-generic-password -U -a "hermes@http://127.0.0.1:4431" -s "chips" -w "chips_at_se\\"c\\\\ret"\n',
    );
    expect(() => addPasswordCommand("a\nb", "x")).toThrow("one line");
  });
});

describe("a keychain that won't take the key (audit Part 2, item 9)", () => {
  /** A store in memory, which refuses every key when told to. */
  function store(kind: KeyStore["kind"], refuses = false) {
    const kept = new Map<string, string>();
    return {
      kept,
      kind,
      get: (account: string) => kept.get(account),
      set(account: string, secret: string) {
        if (refuses) throw new Error("User interaction is not allowed.");
        kept.set(account, secret);
      },
      remove: (account: string) => void kept.delete(account),
    };
  }

  it("keeps it in the file instead, says where, and reads it back from there", () => {
    const said: string[] = [];
    const locked = store("keychain", true);
    const plain = { ...store("file"), path: "/home/sam/.config/chips/harness-keys.json" };
    const keys = orInTheFile(locked, plain, (line) => void said.push(line));
    keys.set("hermes@http://127.0.0.1:4431", "the key");
    expect(plain.kept.get("hermes@http://127.0.0.1:4431")).toBe("the key");
    expect(keys.get("hermes@http://127.0.0.1:4431")).toBe("the key");
    expect(said).toEqual([
      "The keychain wouldn't take its key, so it's kept in /home/sam/.config/chips/harness-keys.json, which only you can read.",
    ]);
    keys.remove("hermes@http://127.0.0.1:4431");
    expect(keys.get("hermes@http://127.0.0.1:4431")).toBeUndefined();
  });

  it("keeps it in the keychain when the keychain takes it, and says nothing", () => {
    const said: string[] = [];
    const open = store("keychain");
    const plain = store("file");
    orInTheFile(open, plain, (line) => void said.push(line)).set("a", "k");
    expect(open.kept.get("a")).toBe("k");
    expect(plain.kept.size).toBe(0);
    expect(said).toEqual([]);
  });
});
