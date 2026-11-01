/**
 * What this phone keeps, sorted into the spaces it came from (ADR 0159): one tile per attachment
 * whatever the phone holds of it, each space's files under its name, biggest space first, and
 * what no room on the phone carries in Other, last.
 */

import type { Attachment, Directory, Lane, Line, Space } from "@chipschat/core";
import { describe, expect, it } from "vitest";
import type { Corners } from "../media/tiles";
import type { KeptFile } from "../spaces/local";
import { idsOf, keptDeck, keptSections, keptTotal, OTHER, rowsOf, spaceMedia } from "./kept";

const DIRECTORY: Directory = {
  per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" },
};

const KB = 1024;

function attachment(
  id: string,
  mimeType: string,
  filename: string,
  over: Partial<Attachment> = {},
) {
  return { id, filename, mimeType, byteSize: 100, ...over };
}

const PHOTO = (id: string) => attachment(id, "image/jpeg", `${id}.jpg`);
const VIDEO = (id: string) => attachment(id, "video/mp4", `${id}.mp4`, { durationMs: 31_000 });
const PDF = (id: string) => attachment(id, "application/pdf", `${id}.pdf`);
const VOICE = (id: string) => attachment(id, "audio/mp4", `${id}.m4a`, { durationMs: 14_000 });

function line(id: string, minute: number, attachments: Attachment[], over: Partial<Line> = {}) {
  return {
    id,
    seq: minute,
    kind: "text",
    authorId: "per_arjun",
    authorKind: "person",
    text: id,
    ts: new Date(Date.UTC(2026, 9, 13, 10, minute)).toISOString(),
    attachments,
    ...over,
  } as Line;
}

function space(id: string, lines: Line[]): Space {
  return {
    id,
    kind: "group",
    title: id,
    members: ["per_arjun"],
    roles: {},
    state: "open",
    lastEventSeq: lines.length,
    lines,
    runs: [],
    sessions: [],
    pins: [],
    glimpse: false,
  } as Space;
}

const kept = (name: string, size: number): KeptFile => ({
  name,
  uri: `file:///cache/attachments/${name}`,
  size,
});

const POMODORO = space("spc_pomodoro", [
  line("ln_1", 1, [PHOTO("att_ring"), PDF("att_spec")]),
  line("ln_2", 2, [VIDEO("att_rec")]),
  line("ln_3", 3, [VOICE("att_note")]),
]);
const CHESS = space("spc_chess", [line("ln_9", 9, [PHOTO("att_board")])]);

describe("what this phone keeps, by space", () => {
  it("makes one tile per attachment from every part kept of it, and draws it from its thumbnail", () => {
    const [section] = keptSections(
      [
        kept("att_ring-att_ring.jpg", 900 * KB),
        kept("att_ring-thumb-thumb.webp", 20 * KB),
        kept("att_ring-view-view.webp", 300 * KB),
      ],
      [POMODORO],
      [],
    );
    expect(section?.key).toBe("spc_pomodoro");
    expect(section?.items).toEqual([
      {
        id: "att_ring",
        bytes: 1220 * KB,
        picture: "file:///cache/attachments/att_ring-thumb-thumb.webp",
        file: "file:///cache/attachments/att_ring-att_ring.jpg",
        kind: "photo",
        name: "att_ring.jpg",
        attachment: PHOTO("att_ring"),
        lineId: "ln_1",
        ts: POMODORO.lines[0]?.ts,
      },
    ]);
    expect(section?.bytes).toBe(1220 * KB);
  });

  it("draws a photo from its viewer's copy, then its own file, when no thumbnail is kept", () => {
    const [viewOnly] = keptSections([kept("att_ring-view-view.jpg", 1)], [POMODORO], []);
    expect(viewOnly?.items[0]?.picture).toBe("file:///cache/attachments/att_ring-view-view.jpg");
    const [fileOnly] = keptSections([kept("att_ring-att_ring.jpg", 1)], [POMODORO], []);
    expect(fileOnly?.items[0]?.picture).toBe("file:///cache/attachments/att_ring-att_ring.jpg");
  });

  it("says what each file is from its line: photo, video, voice note, file", () => {
    const [section] = keptSections(
      [
        kept("att_ring-thumb-thumb.webp", 1),
        kept("att_spec-att_spec.pdf", 1),
        kept("att_rec-thumb-thumb.webp", 1),
        kept("att_note-att_note.m4a", 1),
      ],
      [POMODORO],
      [],
    );
    const kinds = Object.fromEntries((section?.items ?? []).map((item) => [item.id, item.kind]));
    expect(kinds).toEqual({
      att_ring: "photo",
      att_spec: "file",
      att_rec: "video",
      att_note: "voice",
    });
    // A file and a voice note have no picture: their tiles say what they are.
    expect(section?.items.find((item) => item.id === "att_spec")?.picture).toBeUndefined();
  });

  it("puts a space's newest files first", () => {
    const [section] = keptSections(
      [
        kept("att_ring-thumb-thumb.webp", 1),
        kept("att_note-att_note.m4a", 1),
        kept("att_rec-thumb-thumb.webp", 1),
      ],
      [POMODORO],
      [],
    );
    expect(section?.items.map((item) => item.id)).toEqual(["att_note", "att_rec", "att_ring"]);
  });

  it("stands the biggest space first, and Other last however big it is", () => {
    const sections = keptSections(
      [
        kept("att_ring-thumb-thumb.webp", 10 * KB),
        kept("att_board-att_board.jpg", 400 * KB),
        kept("att_gone-att_gone.mov", 9000 * KB),
      ],
      [POMODORO, CHESS],
      [],
    );
    expect(sections.map((section) => [section.key, section.bytes])).toEqual([
      ["spc_chess", 400 * KB],
      ["spc_pomodoro", 10 * KB],
      [OTHER, 9000 * KB],
    ]);
    expect(keptTotal(sections)).toEqual({ bytes: 9410 * KB, count: 3 });
    expect(idsOf(sections)).toEqual(["att_board", "att_ring", "att_gone"]);
  });

  it("guesses what a file in Other is from what the phone has of it", () => {
    const [other] = keptSections(
      [
        kept("att_a-thumb-thumb.webp", 1),
        kept("att_b-play-clip.mp4", 1),
        kept("att_c-memo.m4a", 1),
        kept("att_d-notes.pdf", 1),
        kept("att_e-IMG_0042.HEIC", 1),
      ],
      [],
      [],
    );
    expect(other?.space).toBeUndefined();
    const of = (id: string) => other?.items.find((item) => item.id === id);
    expect(of("att_a")?.kind).toBe("photo");
    expect(of("att_b")?.kind).toBe("video");
    expect(of("att_c")?.kind).toBe("voice");
    expect(of("att_d")?.kind).toBe("file");
    expect(of("att_d")?.name).toBe("notes.pdf");
    expect(of("att_e")).toMatchObject({ kind: "photo", picture: of("att_e")?.file });
  });

  it("reads a file sent as thumb-… or view-… as the file it is", () => {
    const room = space("spc_room", [
      line("ln_1", 1, [attachment("att_x", "application/pdf", "thumb-thumb.pdf")]),
    ]);
    const [section] = keptSections([kept("att_x-thumb-thumb.pdf", 5)], [room], []);
    expect(section?.items[0]).toMatchObject({
      kind: "file",
      picture: undefined,
      file: "file:///cache/attachments/att_x-thumb-thumb.pdf",
    });
  });

  it("files what a lane handed back under the room its route card is in", () => {
    const lane = {
      laneId: "lane_1",
      leadId: "hrn_lead",
      specialistId: "hrn_specialist",
      onBehalfOf: "per_arjun",
      homeSpaceId: "spc_specialist",
      linkedSpaceIds: ["spc_pomodoro"],
      goal: "Draw the timer",
      constraints: [],
      state: "completed",
      delivery: "delivered",
      depth: 1,
      trail: [],
      attachments: [PHOTO("att_answer")],
    } as Lane;
    const room = space("spc_pomodoro", [
      line("ln_route", 5, [], { kind: "route", laneId: "lane_1" }),
    ]);
    const [section] = keptSections([kept("att_answer-thumb-thumb.webp", 1)], [room], [lane]);
    expect(section).toMatchObject({ key: "spc_pomodoro", items: [{ id: "att_answer" }] });
  });
});

describe("a space's own Media (ADR 0165)", () => {
  it("is every file the space carries, voice notes and documents too, newest first, with what this phone keeps of each", () => {
    const section = spaceMedia(
      POMODORO,
      [],
      [
        kept("att_rec-thumb-thumb.webp", 30 * KB),
        kept("att_rec-play-play.mp4", 4000 * KB),
        kept("att_board-thumb-thumb.webp", 10 * KB),
      ],
    );
    expect(section.key).toBe("spc_pomodoro");
    // The voice note and the PDF are rows in the room, and here too, as Media on this phone has them.
    expect(section.items.map((item) => [item.id, item.kind, item.bytes])).toEqual([
      ["att_note", "voice", 0],
      ["att_rec", "video", 4030 * KB],
      ["att_ring", "photo", 0],
      ["att_spec", "file", 0],
    ]);
    // What the phone keeps draws the tile; what it does not is fetched by the tile, as a room's.
    expect(section.items[1]?.picture).toBe("file:///cache/attachments/att_rec-thumb-thumb.webp");
    expect(section.items[2]?.picture).toBeUndefined();
    expect(section.items[2]?.lineId).toBe("ln_1");
    // Only this space's: Chess's board, kept here, is not counted.
    expect(section.bytes).toBe(4030 * KB);
  });

  it("holds a video the server never measured, which has no poster to draw it with", () => {
    const room = space("spc_raw", [
      line("ln_1", 1, [attachment("att_raw", "video/mp4", "raw.mp4")]),
    ]);
    expect(
      spaceMedia(room, [], []).items.map((item) => [item.id, item.kind, item.picture]),
    ).toEqual([["att_raw", "video", undefined]]);
  });
});

describe("the viewer's deck for a section", () => {
  it("is the section's photos and videos, in the order the section shows them", () => {
    const [section] = keptSections(
      [
        kept("att_ring-thumb-thumb.webp", 1),
        kept("att_spec-att_spec.pdf", 1),
        kept("att_rec-thumb-thumb.webp", 1),
      ],
      [POMODORO],
      [],
    );
    if (section === undefined) throw new Error("no section");
    const deck = keptDeck(section, [], DIRECTORY);
    expect(deck.map((item) => [item.attachment.id, item.kind, item.lineId])).toEqual([
      ["att_rec", "video", "ln_2"],
      ["att_ring", "photo", "ln_1"],
    ]);
    expect(deck[0]?.saidBy).toBe("per_arjun");
  });

  it("holds a video the server never measured in its place, as a room opens it from its row", () => {
    const clip = attachment("att_clip", "video/quicktime", "clip.mov");
    const room = space("spc_room", [
      line("ln_1", 1, [PHOTO("att_a")]),
      line("ln_2", 2, [clip]),
      line("ln_3", 3, [PHOTO("att_b")]),
    ]);
    const [section] = keptSections(
      [
        kept("att_a-thumb-thumb.webp", 1),
        kept("att_clip-play-clip.mp4", 1),
        kept("att_b-thumb-thumb.webp", 1),
      ],
      [room],
      [],
    );
    if (section === undefined) throw new Error("no section");
    expect(keptDeck(section, [], DIRECTORY).map((item) => [item.attachment.id, item.kind])).toEqual(
      [
        ["att_b", "photo"],
        ["att_clip", "video"],
        ["att_a", "photo"],
      ],
    );
  });

  it("leaves out a taken-back line's photo, which opens on its own instead, and Other's", () => {
    const room = space("spc_room", [
      line("ln_1", 1, [PHOTO("att_gone")], { deleted: true }),
      line("ln_2", 2, [PHOTO("att_here")]),
    ]);
    const sections = keptSections(
      [
        kept("att_gone-thumb-thumb.webp", 1),
        kept("att_here-thumb-thumb.webp", 1),
        kept("att_lost-thumb-thumb.webp", 1),
      ],
      [room],
      [],
    );
    const [inRoom, other] = sections;
    if (inRoom === undefined || other === undefined) throw new Error("two sections");
    expect(inRoom.items.map((item) => item.id)).toEqual(["att_here", "att_gone"]);
    expect(keptDeck(inRoom, [], DIRECTORY).map((item) => item.attachment.id)).toEqual(["att_here"]);
    expect(keptDeck(other, [], DIRECTORY)).toEqual([]);
  });
});

describe("the rows the page draws", () => {
  it("puts each space's head over its tiles, so many to a row, rounding each section's outer corners", () => {
    const sections = keptSections(
      [
        kept("att_ring-thumb-thumb.webp", 50),
        kept("att_spec-att_spec.pdf", 40),
        kept("att_rec-thumb-thumb.webp", 30),
        kept("att_note-att_note.m4a", 20),
        kept("att_board-att_board.jpg", 10),
      ],
      [POMODORO, CHESS],
      [],
    );
    // A tile's corners as four marks, clockwise from its top left: round (o) or square (·).
    const marks = (corners: Corners) =>
      [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft]
        .map((radius) => (radius === 12 ? "o" : radius === 0 ? "·" : "?"))
        .join("");
    const rows = rowsOf(sections, 3, 12).map((row) =>
      row.kind === "head"
        ? `head ${row.key}`
        : row.items.map((item, at) => `${item.id} ${marks(row.corners[at] as Corners)}`).join(", "),
    );
    expect(rows).toEqual([
      "head spc_pomodoro",
      "att_note o···, att_rec ····, att_ring ·o··",
      "att_spec ···o",
      "head spc_chess",
      "att_board o··o",
    ]);
  });
});
