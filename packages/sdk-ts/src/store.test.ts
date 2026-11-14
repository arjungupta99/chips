/**
 * What a harness keeps across a restart, as the file holds it: written whole, read back as it
 * was, and read with whatever it shouldn't hold left out, since the file may be an older SDK's, a
 * newer one's, or cut short.
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fileStore, type HarnessState, memoryStore } from "./store.js";

const folders: string[] = [];
const scratch = () => {
  const folder = mkdtempSync(join(tmpdir(), "chips-sdk-store-"));
  folders.push(folder);
  return folder;
};

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const KEPT: HarnessState = {
  since: 41,
  unanswered: [39, 40],
  unansweredAt: { "39": 1_794_000_000_000, "40": 1_794_000_060_000 },
  outbox: [{ type: "message.post", idempotency_key: "k1", text: "Half said." }],
  runs: [{ runId: "run_1", spaceId: "spc_1", agentId: "agt_1" }],
};

/** What the store reads from a file holding `held`. */
function read(held: unknown): HarnessState | undefined {
  const path = join(scratch(), "state.json");
  writeFileSync(path, typeof held === "string" ? held : JSON.stringify(held));
  return fileStore(path).load();
}

describe("a harness's state in a file", () => {
  it("is nothing before the first save", () => {
    expect(fileStore(join(scratch(), "state.json")).load()).toBeUndefined();
  });

  it("is read back as it was saved", () => {
    const path = join(scratch(), "state.json");
    const store = fileStore(path);
    store.save(KEPT);
    expect(store.load()).toEqual(KEPT);
    // Another process, as after a restart, reads the same.
    expect(fileStore(path).load()).toEqual(KEPT);
  });

  it("is written whole into a folder made for it, for its user alone", () => {
    const folder = join(scratch(), "bridge", "state");
    const path = join(folder, "state.json");
    fileStore(path).save(KEPT);
    // Renamed into place: nothing half-written is left beside it.
    expect(readdirSync(folder)).toEqual(["state.json"]);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readFileSync(path, "utf8").endsWith("\n")).toBe(true);
    // A second save takes the first one's place.
    fileStore(path).save({ ...KEPT, since: 42 });
    expect(readdirSync(folder)).toEqual(["state.json"]);
    expect(fileStore(path).load()?.since).toBe(42);
  });

  it("starts fresh from a file nobody can read", () => {
    expect(read("{ not json")).toBeUndefined();
    expect(read("")).toBeUndefined();
    // A file that parses to no object at all.
    expect(read("null")).toBeUndefined();
  });

  it("reads an older SDK's file, which keeps no messages waiting", () => {
    expect(read({ since: 7, outbox: [], runs: [] })).toEqual({ since: 7, outbox: [], runs: [] });
    // And one that kept nothing but where it was.
    expect(read({ since: 7 })).toEqual({ since: 7, outbox: [], runs: [] });
    expect(read({})).toEqual({ outbox: [], runs: [] });
  });

  it("leaves out what isn't what it should be", () => {
    expect(
      read({
        since: "41",
        unanswered: [39, "40", 40.5, null, 41],
        unansweredAt: { "39": 1_794_000_000_000, "41": "then", "50": null },
        outbox: "none",
        runs: { run: 1 },
      }),
    ).toEqual({
      unanswered: [39, 41],
      unansweredAt: { "39": 1_794_000_000_000 },
      outbox: [],
      runs: [],
    });
  });

  it("keeps messages waiting whose times it can't read, with no times", () => {
    // The connection lets those go at once: a message with no time has waited for ever.
    for (const times of [undefined, null, "soon", 7]) {
      expect(read({ since: 9, unanswered: [8], unansweredAt: times })).toEqual({
        since: 9,
        unanswered: [8],
        unansweredAt: {},
        outbox: [],
        runs: [],
      });
    }
  });

  it("names no messages waiting when none are", () => {
    const kept = read({ since: 9, unanswered: [], unansweredAt: { "8": 1 } });
    expect(kept).toEqual({ since: 9, outbox: [], runs: [] });
    expect(read({ since: 9, unanswered: "none" })).toEqual({ since: 9, outbox: [], runs: [] });
  });
});

describe("a harness's state in memory", () => {
  it("starts with what it was given, and holds what was last saved", () => {
    expect(memoryStore().load()).toBeUndefined();
    const store = memoryStore(KEPT);
    expect(store.load()).toBe(KEPT);
    const next = { ...KEPT, since: 42 };
    store.save(next);
    expect(store.load()).toBe(next);
    expect(store.state()).toBe(next);
  });
});
