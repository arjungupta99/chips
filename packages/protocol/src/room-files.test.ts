import { describe, expect, it } from "vitest";
import { renderContext, roomContext } from "./context.js";
import { messagePost } from "./events/harness-to-chips.js";
import {
  currentFiles,
  type PostedFile,
  type RoomFile,
  renderRoomFiles,
  STALE_FILE,
  staleRefusal,
  staleVersion,
  versionsNamed,
  versionsOf,
} from "./room-files.js";

const OC2 = "agt_01K4ZQPX000000000000000002";
const OC3 = "agt_01K4ZQPX000000000000000003";

const sha = (letter: string): string => letter.repeat(64);
const att = (n: number): string => `att_01K4ZQPX${String(n).padStart(18, "0")}`;

/** The ASCII Art room's page, posted as it was: A–E, F–J, then F–J again, and someone's own. */
function posted(n: number, filename: string, bytes: string, by = OC2): PostedFile {
  return {
    seq: n * 10,
    at: `2026-10-02T18:${String(n).padStart(2, "0")}:00.000Z`,
    by,
    attachment_id: att(n),
    filename,
    sha256: sha(bytes),
    byte_size: 100 + n,
    mime_type: "text/html",
  };
}

const PAGE = "ascii-alphabet.html";

describe("a room's files", () => {
  it("are versions of a name in the order they were posted, the same bytes again no new one", () => {
    const versions = versionsOf([
      posted(1, PAGE, "a"),
      posted(2, PAGE, "b", OC3),
      posted(3, PAGE, "b"),
      posted(4, "notes.md", "c"),
      posted(5, PAGE, "a"),
    ]);
    expect(versions.get(PAGE)?.map((each) => [each.version, each.attachment_id, each.by])).toEqual([
      [1, att(1), OC2],
      [2, att(2), OC3],
      [3, att(5), OC2],
    ]);
    expect(versions.get("notes.md")?.map((each) => each.version)).toEqual([1]);
  });

  it("are listed at their current version, newest first, as many as asked", () => {
    const files = [posted(1, PAGE, "a"), posted(2, "notes.md", "c"), posted(3, PAGE, "b", OC3)];
    expect(currentFiles(files, 20).map((each) => [each.filename, each.version])).toEqual([
      [PAGE, 2],
      ["notes.md", 1],
    ]);
    expect(currentFiles(files, 1).map((each) => each.filename)).toEqual([PAGE]);
    expect(currentFiles([], 20)).toEqual([]);
  });

  it("of one name are its versions, newest first, as many as asked (ADR 0100)", () => {
    const files = [
      posted(1, PAGE, "a"),
      posted(2, "notes.md", "c"),
      posted(3, PAGE, "b", OC3),
      posted(4, PAGE, "b"),
      posted(5, PAGE, "d"),
    ];
    expect(versionsNamed(files, PAGE, 20).map((each) => [each.version, each.by])).toEqual([
      [3, OC2],
      [2, OC3],
      [1, OC2],
    ]);
    expect(versionsNamed(files, PAGE, 2).map((each) => each.version)).toEqual([3, 2]);
    expect(versionsNamed(files, "missing.txt", 20)).toEqual([]);
  });
});

describe("a post made from a version", () => {
  const versions = versionsOf([posted(1, PAGE, "a"), posted(2, PAGE, "b", OC3)]);

  it("is taken when made from the current version", () => {
    expect(
      staleVersion([{ filename: PAGE, sha256: sha("d"), from: sha("b") }], versions),
    ).toBeUndefined();
  });

  it("is refused when made from one that is no longer current, naming the file and who changed it", () => {
    const current = staleVersion([{ filename: PAGE, sha256: sha("d"), from: sha("a") }], versions);
    expect(current?.attachment_id).toBe(att(2));
    expect(current === undefined ? undefined : staleRefusal(current, "Oc3")).toEqual({
      kind: STALE_FILE,
      message: "ascii-alphabet.html is now v2, by Oc3. Fetch it and redo.",
    });
  });

  it("is taken when what it posts is the current version already, or the name has none", () => {
    expect(
      staleVersion([{ filename: PAGE, sha256: sha("b"), from: sha("a") }], versions),
    ).toBeUndefined();
    expect(
      staleVersion([{ filename: "new.md", sha256: sha("d"), from: sha("a") }], versions),
    ).toBeUndefined();
  });

  it("made from bytes a revert made current again is made from the current version", () => {
    const reverted = versionsOf([
      posted(1, PAGE, "a"),
      posted(2, PAGE, "b", OC3),
      posted(3, PAGE, "a"),
    ]);
    expect(
      staleVersion([{ filename: PAGE, sha256: sha("d"), from: sha("a") }], reverted),
    ).toBeUndefined();
  });
});

describe("on the wire", () => {
  const file: RoomFile = {
    name: PAGE,
    version: 2,
    attachment_id: att(2),
    sha256: sha("b"),
    byte_size: 102,
    mime_type: "text/html",
    by: { id: OC3, kind: "agent", name: "Oc3" },
    at: "2026-10-02T18:02:00.000Z",
    url: "https://chips.example/v1/uploads/att_2?grant=x",
    url_expires_at: "2026-10-02T18:12:00.000Z",
  };

  it("a context lists files, and a context from before files still reads", () => {
    const lines = { lines: [], since_seq: 0, truncated: false, before: 1 };
    expect(roomContext.parse({ ...lines, files: [file] }).files).toEqual([file]);
    expect(roomContext.parse(lines).files).toBeUndefined();
  });

  it("a post says what each file was made from, as a map of its own files' ids", () => {
    const payload = messagePost.payload;
    expect(
      payload.safeParse({ text: "v3", upload_ids: [att(9)], replaces: { [att(9)]: att(2) } })
        .success,
    ).toBe(true);
    expect(payload.safeParse({ text: "v3", replaces: { "page.html": att(2) } }).success).toBe(
      false,
    );
  });

  it("the plain form lists them after the lines, and alone when there are no lines", () => {
    const line = {
      seq: 3,
      at: "2026-10-02T18:03:00.000Z",
      kind: "said" as const,
      from: { id: OC2, kind: "agent" as const, name: "Oc2" },
      text: "Done F–J",
    };
    const listed = `Files in this space:\nascii-alphabet.html · v2 · by Oc3 · 2026-10-02T18:02:00.000Z · ${file.url}`;
    expect(renderRoomFiles([file])).toBe(listed);
    expect(renderContext({ lines: [line], files: [file] })).toBe(
      `Said in this space since you last spoke:\nOc2: Done F–J\n\n${listed}`,
    );
    expect(renderContext({ lines: [], files: [file] })).toBe(listed);
    expect(renderContext({ lines: [], files: [] })).toBe("");
  });
});
