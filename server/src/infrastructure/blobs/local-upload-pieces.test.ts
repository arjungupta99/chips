import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalUploadPieces } from "./local-upload-pieces.js";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "chips-pieces-"));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const bytes = (...values: number[]) => new Uint8Array(values);

describe("the pieces of an unfinished upload, on disk", () => {
  it("appends pieces in order, counts what arrived, and hands the whole run back", async () => {
    const pieces = createLocalUploadPieces(join(directory, "not-made-yet"));
    expect(await pieces.size("att_1")).toBe(0);
    await pieces.append("att_1", bytes(1, 2, 3));
    await pieces.append("att_1", bytes(4, 5));
    expect(await pieces.size("att_1")).toBe(5);
    expect(await pieces.read("att_1")).toEqual(bytes(1, 2, 3, 4, 5));
    expect(await pieces.waiting()).toEqual(["att_1"]);
  });

  it("forgets a slot's pieces, and forgetting nothing is not an error", async () => {
    const pieces = createLocalUploadPieces(directory);
    await pieces.append("att_1", bytes(1));
    await pieces.discard("att_1");
    await pieces.discard("att_never");
    expect(await pieces.size("att_1")).toBe(0);
    expect(await pieces.read("att_1")).toEqual(bytes());
    expect(await pieces.waiting()).toEqual([]);
  });

  it("refuses an id that could name a path outside its directory", async () => {
    const pieces = createLocalUploadPieces(directory);
    await expect(pieces.append("../escape", bytes(1))).rejects.toThrow("not an upload id");
    await expect(pieces.discard("a/b")).rejects.toThrow("not an upload id");
  });
});
