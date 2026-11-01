/**
 * A kept file's name read back (ADR 0161): the names `keepLocally` gives each part of an attachment
 * come back as that attachment and that part, and a file sent under a name that looks like a part
 * is still the file.
 */

import { describe, expect, it } from "vitest";
import { partOf, safeName, sentName } from "./keptNames";

/** The name `keepLocally(id, name, …)` writes. */
const kept = (id: string, name: string) => `${safeName(id)}-${safeName(name)}`;

describe("a kept file's name", () => {
  it("reads back as the attachment and the part the file service kept it as", () => {
    const id = "att_01M38TZ1SR8B0MEVM07C86Y64X";
    expect(partOf(kept(`${id}-thumb`, "thumb.webp"))).toMatchObject({ id, part: "thumb" });
    expect(partOf(kept(`${id}-view`, "view.jpg"))).toMatchObject({ id, part: "view" });
    expect(partOf(kept(`${id}-play`, "clip.mp4"))).toMatchObject({ id, part: "play" });
    expect(partOf(kept(id, "receipt (1).jpg"))).toEqual({
      id,
      part: "file",
      rest: "receipt_1_.jpg",
    });
  });

  it("reads a file sent as thumb-… or view-… as the file it is", () => {
    expect(partOf(kept("att_x", "thumb-thumb.pdf")).part).toBe("file");
    expect(partOf(kept("att_x", "view-view.final.pdf")).part).toBe("file");
  });

  it("keeps a name to letters, digits and a few marks, eighty at most", () => {
    expect(safeName("a b/c:d.png")).toBe("a_b_c_d.png");
    expect(safeName("")).toBe("file");
    expect(safeName("x".repeat(100))).toHaveLength(80);
  });

  it("leaves the app under the name it was sent with, only made fit to be a file's", () => {
    expect(sentName("Trip plan (final).pdf")).toBe("Trip plan (final).pdf");
    expect(sentName("a/b\\c:d.png")).toBe("a_b_c_d.png");
    expect(sentName(" \u0007notes.md ")).toBe("_notes.md");
    expect(sentName("")).toBe("file");
    expect(sentName("..")).toBe("file");
    expect(sentName("x".repeat(200))).toHaveLength(120);
  });
});
