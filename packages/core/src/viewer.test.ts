import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Attachment } from "./attachments.js";
import type { Directory } from "./events.js";
import type { Lane, Line, Space } from "./model.js";
import {
  clampPan,
  clipRect,
  coverRect,
  DECK_WINDOW,
  type DeckItem,
  deckOf,
  deckOfOne,
  deckOfVersions,
  dismissDecision,
  dismissProgress,
  filesOf,
  fitRect,
  glideAt,
  indexOfItem,
  mediaFilesWords,
  newestDeckOf,
  newestFilesOf,
  type Placement,
  type Point,
  pinchGrip,
  pinchTo,
  type Rect,
  rubberBand,
  rubberBandPull,
  SPRING_REST,
  snapPage,
  springAt,
  springCurve,
  springShare,
  transformTo,
  zoomLimits,
} from "./viewer.js";

// ---------------------------------------------------------------------------------------------
// A room, built from a description a property can generate: what each line is, which files it
// carries by their place in a pool, and the lanes a route or a task line draws.

/** A `video` the server measured; a `clip` it never did, which the room draws as a row. */
type Tag = "photo" | "video" | "clip" | "voice" | "file" | "svg";

const MIME: Record<Tag, readonly string[]> = {
  photo: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  video: ["video/mp4", "video/quicktime"],
  clip: ["video/mp4", "video/quicktime"],
  voice: ["audio/mp4", "audio/mpeg"],
  file: ["application/pdf", "text/plain"],
  svg: ["image/svg+xml"],
};

const isMedia = (tag: Tag) => tag === "photo" || tag === "video";

interface LineSpec {
  readonly kind: "text" | "summary" | "system" | "route" | "task";
  /** A system line with nothing to say, which the room does not draw. */
  readonly empty: boolean;
  readonly deleted: boolean;
  /** Places in the pool; the same place twice is the same attachment twice. */
  readonly files: readonly number[];
  /** Which lane a route or a task line draws, by place; past the lanes, one the room never heard of. */
  readonly lane: number;
}

interface LaneSpec {
  readonly files: readonly number[];
  /** Home here and linked here too: its task card is not drawn beside its route card. */
  readonly here: boolean;
}

interface RoomSpec {
  readonly pool: readonly Tag[];
  readonly lines: readonly LineSpec[];
  readonly lanes: readonly LaneSpec[];
}

interface Room {
  readonly space: Space;
  readonly lanes: readonly Lane[];
  readonly spec: RoomSpec;
}

const DIRECTORY: Directory = {
  per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" },
  hrn_relay: { id: "hrn_relay", kind: "harness", displayName: "Relay", ownerId: "per_arjun" },
  hrn_loose: { id: "hrn_loose", kind: "harness", displayName: "Loose" },
};

function attachment(place: number, tag: Tag): Attachment {
  const mimes = MIME[tag];
  return {
    id: `att_${place}`,
    filename: `file-${place}`,
    mimeType: mimes[place % mimes.length] ?? "application/octet-stream",
    byteSize: 1000 + place,
    ...(tag === "video" ? { durationMs: 42_500 + place } : {}),
  };
}

function build(spec: RoomSpec): Room {
  const files = (places: readonly number[]) =>
    places.map((place) =>
      attachment(place % spec.pool.length, spec.pool[place % spec.pool.length] ?? "file"),
    );
  const lanes = spec.lanes.map(
    (lane, index): Lane => ({
      laneId: `lane_${index}`,
      leadId: "hrn_lead",
      specialistId: `hrn_specialist_${index}`,
      onBehalfOf: "per_arjun",
      homeSpaceId: lane.here ? "spc_room" : "spc_elsewhere",
      linkedSpaceIds: ["spc_room"],
      goal: "Find the receipts",
      constraints: [],
      state: "completed",
      delivery: "delivered",
      depth: 1,
      trail: [],
      attachments: files(lane.files),
    }),
  );
  const lines = spec.lines.map(
    (line, index): Line => ({
      id: `ln_${index}`,
      seq: index + 1,
      kind: line.kind,
      authorId: "per_arjun",
      authorKind: "person",
      text: line.kind === "system" && line.empty ? "" : `line ${index}`,
      ts: new Date(Date.UTC(2026, 8, 13, 10, 0, index)).toISOString(),
      ...(line.kind === "route" || line.kind === "task" ? { laneId: `lane_${line.lane}` } : {}),
      ...(line.deleted ? { deleted: true } : {}),
      ...(line.files.length > 0 ? { attachments: files(line.files) } : {}),
    }),
  );
  const space: Space = {
    id: "spc_room",
    kind: "group",
    members: ["per_arjun"],
    roles: {},
    state: "open",
    lastEventSeq: lines.length,
    lines,
    runs: [],
    sessions: [],
    pins: [],
    glimpse: false,
  };
  return { space, lanes, spec };
}

const tagArb = fc.constantFrom<Tag>("photo", "video", "clip", "voice", "file", "svg");

const roomArb: fc.Arbitrary<Room> = fc
  .record({
    pool: fc.array(tagArb, { minLength: 1, maxLength: 16 }),
    lanes: fc.array(
      fc.record({ files: fc.array(fc.nat(40), { maxLength: 4 }), here: fc.boolean() }),
      { maxLength: 4 },
    ),
    lines: fc.array(
      fc.record({
        kind: fc.constantFrom<LineSpec["kind"]>(
          "text",
          "text",
          "summary",
          "system",
          "route",
          "task",
        ),
        empty: fc.boolean(),
        deleted: fc.nat(5).map((roll) => roll === 0),
        files: fc.array(fc.nat(40), { maxLength: 6 }),
        lane: fc.nat(5),
      }),
      { maxLength: 60 },
    ),
  })
  .map(build);

/** A room and a place to tap in it: one of its lines, or now and then one it does not have. */
const tappedArb = roomArb.chain((room) =>
  fc
    .oneof(
      { weight: 9, arbitrary: fc.nat({ max: Math.max(0, room.space.lines.length - 1) }) },
      { weight: 1, arbitrary: fc.constant(-1) },
    )
    .map((at) => ({ room, around: room.space.lines[at]?.id ?? "ln_nowhere" })),
);

// The rules the deck is written to, said in the room's own terms rather than read off its lines.

const laneOf = (room: Room, line: LineSpec) =>
  (line.kind === "route" || line.kind === "task") && line.lane < room.spec.lanes.length
    ? room.spec.lanes[line.lane]
    : undefined;

/** The indices of the lines the room draws. */
function drawn(room: Room): number[] {
  return room.spec.lines.flatMap((line, index) => {
    const hidden =
      (line.kind === "system" && line.empty) ||
      (line.kind === "task" && laneOf(room, line)?.here === true);
    return hidden ? [] : [index];
  });
}

/** The window's lines, by index into the room: ten before the tapped line, or the room's last twenty. */
function windowOf(room: Room, around: string): number[] {
  const lines = drawn(room);
  const at = lines.findIndex((index) => `ln_${index}` === around);
  const foot = Math.max(0, lines.length - DECK_WINDOW);
  const start = at < 0 || at >= foot ? foot : Math.max(0, at - DECK_WINDOW / 2);
  return lines.slice(start, start + DECK_WINDOW);
}

/** The ids of the photos and measured videos a line carries, as the room shows them as tiles. */
function mediaIds(room: Room, index: number): string[] {
  const line = room.spec.lines[index];
  if (line === undefined || line.deleted) return [];
  const lane = line.kind === "route" ? laneOf(room, line) : undefined;
  const places = lane === undefined ? line.files : lane.files;
  return places
    .map((place) => place % room.spec.pool.length)
    .filter((place) => isMedia(room.spec.pool[place] ?? "file"))
    .map((place) => `att_${place}`);
}

const lineIndex = (item: DeckItem) => Number(item.lineId.slice("ln_".length));
const deckOfRoom = (room: Room, around: string) =>
  deckOf(room.space, room.lanes, { around, messages: DECK_WINDOW }, DIRECTORY);

// ---------------------------------------------------------------------------------------------

describe("the deck", () => {
  it("cuts the window of twenty drawn lines around the tapped one, clamped to the room's ends", () => {
    fc.assert(
      fc.property(fc.nat(70), fc.nat(), (count, pick) => {
        // A room where every line is one photo of its own, so the deck is the window itself.
        const room = build({
          pool: Array.from({ length: count + 1 }, () => "photo" as const),
          lanes: [],
          lines: Array.from({ length: count }, (_, index) => ({
            kind: "text" as const,
            empty: false,
            deleted: false,
            files: [index],
            lane: 0,
          })),
        });
        const at = count === 0 ? 0 : pick % count;
        const ids = deckOfRoom(room, `ln_${at}`).map((item) => item.lineId);
        expect(ids).toHaveLength(Math.min(count, DECK_WINDOW));
        if (count === 0) return;
        expect(ids).toContain(`ln_${at}`);
        const first = Number((ids[0] ?? "").slice("ln_".length));
        // Twenty in a row.
        expect(ids).toEqual(ids.map((_, offset) => `ln_${first + offset}`));
        if (at >= count - DECK_WINDOW) {
          // Tapped among the last twenty: the room's last twenty.
          expect(first).toBe(Math.max(0, count - DECK_WINDOW));
        } else {
          // Further up: ten said before it, or all there are.
          expect(first).toBe(Math.max(0, at - DECK_WINDOW / 2));
        }
      }),
    );
  });

  it("takes its items from the window's lines only, and every photo and video in them", () => {
    fc.assert(
      fc.property(tappedArb, ({ room, around }) => {
        const deck = deckOfRoom(room, around);
        const lines = windowOf(room, around);
        for (const item of deck) expect(lines).toContain(lineIndex(item));
        const expected = new Set(lines.flatMap((index) => mediaIds(room, index)));
        expect(new Set(deck.map((item) => item.attachment.id))).toEqual(expected);
      }),
    );
  });

  it("keeps the order the lines were said in", () => {
    fc.assert(
      fc.property(tappedArb, ({ room, around }) => {
        const deck = deckOfRoom(room, around);
        for (const [index, item] of deck.entries()) {
          const before = deck[index - 1];
          if (before === undefined) continue;
          expect(lineIndex(item)).toBeGreaterThanOrEqual(lineIndex(before));
          expect(item.ts >= before.ts).toBe(true);
        }
      }),
    );
  });

  it("keeps a message's photos together, with inMessage counting them from one", () => {
    fc.assert(
      fc.property(tappedArb, ({ room, around }) => {
        const deck = deckOfRoom(room, around);
        const runs: DeckItem[][] = [];
        for (const item of deck) {
          const run = runs.at(-1);
          if (run?.[0]?.lineId === item.lineId) run.push(item);
          else runs.push([item]);
        }
        // Each message's items are one run, never split by another message's.
        expect(new Set(runs.map((run) => run[0]?.lineId)).size).toBe(runs.length);
        for (const run of runs) {
          expect(run.map((item) => item.inMessage)).toEqual(
            run.map((_, index) => ({ index: index + 1, of: run.length })),
          );
          // In the order the message listed them.
          const ids = run.map((item) => item.attachment.id);
          const listed = [...new Set(mediaIds(room, lineIndex(run[0] as DeckItem)))];
          expect(listed.filter((id) => ids.includes(id))).toEqual(ids);
        }
      }),
    );
  });

  it("keeps each attachment once, where it was first carried", () => {
    fc.assert(
      fc.property(tappedArb, ({ room, around }) => {
        const deck = deckOfRoom(room, around);
        const ids = deck.map((item) => item.attachment.id);
        expect(new Set(ids).size).toBe(ids.length);
        const lines = windowOf(room, around);
        for (const item of deck) {
          const first = lines.find((index) => mediaIds(room, index).includes(item.attachment.id));
          expect(lineIndex(item)).toBe(first);
        }
      }),
    );
  });

  it("includes a route row's files where the row stands, as the specialist's", () => {
    fc.assert(
      fc.property(tappedArb, ({ room, around }) => {
        for (const item of deckOfRoom(room, around)) {
          const line = room.spec.lines[lineIndex(item)];
          const lane = line === undefined ? undefined : laneOf(room, line);
          if (line?.kind === "route" && lane !== undefined) {
            expect(item.saidBy).toBe(`hrn_specialist_${line.lane}`);
            expect(lane.files.map((place) => `att_${place % room.spec.pool.length}`)).toContain(
              item.attachment.id,
            );
          }
        }
      }),
    );
  });

  it("leaves out unmeasured videos, voice notes, files, SVGs, deleted lines and lines not drawn", () => {
    fc.assert(
      fc.property(tappedArb, ({ room, around }) => {
        const shown = drawn(room);
        for (const item of deckOfRoom(room, around)) {
          const place = Number(item.attachment.id.slice("att_".length));
          const tag = room.spec.pool[place] ?? "file";
          expect(isMedia(tag)).toBe(true);
          expect(item.kind).toBe(tag);
          const line = room.spec.lines[lineIndex(item)];
          expect(line?.deleted).toBe(false);
          expect(shown).toContain(lineIndex(item));
        }
      }),
    );
  });

  it("reads diagram A: a video, an album of six, and a receipt beside a voice note", () => {
    const room = build({
      pool: [
        "video",
        "photo",
        "photo",
        "photo",
        "photo",
        "photo",
        "photo",
        "photo",
        "voice",
        "file",
        "clip",
      ],
      lanes: [],
      lines: [
        { kind: "text", empty: false, deleted: false, files: [0], lane: 0 }, // Scout · IMG_4410.MOV
        { kind: "text", empty: false, deleted: false, files: [1, 2, 3, 4, 5, 6], lane: 0 }, // Priya
        { kind: "text", empty: false, deleted: false, files: [7, 8], lane: 0 }, // Arjun · receipt
        // Ledger · invoice.pdf, and a clip from before the server measured videos: two rows.
        { kind: "text", empty: false, deleted: false, files: [9, 10], lane: 0 },
      ],
    });
    const deck = deckOfRoom(room, "ln_3");
    expect(deck).toHaveLength(8);
    expect(deck.map((item) => item.kind)).toEqual([
      "video",
      "photo",
      "photo",
      "photo",
      "photo",
      "photo",
      "photo",
      "photo",
    ]);
    expect(
      deck.slice(1, 7).map((item) => `${item.inMessage.index} of ${item.inMessage.of}`),
    ).toEqual(["1 of 6", "2 of 6", "3 of 6", "4 of 6", "5 of 6", "6 of 6"]);
    expect(deck[7]).toMatchObject({ lineId: "ln_2", inMessage: { index: 1, of: 1 } });
    expect(indexOfItem(deck, "att_7")).toBe(7);
    expect(indexOfItem(deck, "att_8")).toBe(-1);
  });

  it("says a relayed line is its person's, and the harness's where it has no owner", () => {
    const room = build({
      pool: ["photo", "photo", "photo"],
      lanes: [],
      lines: [0, 1, 2].map((index) => ({
        kind: "text" as const,
        empty: false,
        deleted: false,
        files: [index],
        lane: 0,
      })),
    });
    const lines = room.space.lines;
    const space: Space = {
      ...room.space,
      lines: [
        { ...(lines[0] as Line), via: "hrn_relay", authorId: "hrn_relay", authorKind: "harness" },
        { ...(lines[1] as Line), via: "hrn_loose", authorId: "hrn_loose", authorKind: "harness" },
        lines[2] as Line,
      ],
    };
    const deck = deckOf(space, [], { around: "ln_2", messages: DECK_WINDOW }, DIRECTORY);
    expect(deck.map((item) => item.saidBy)).toEqual(["per_arjun", "hrn_loose", "per_arjun"]);
  });

  it("opens a video the server never measured on its own, from its row, and nothing else so", () => {
    const room = build({
      pool: ["photo", "clip", "voice", "clip"],
      lanes: [{ files: [3], here: true }],
      lines: [
        { kind: "text", empty: false, deleted: false, files: [0, 1, 2], lane: 0 },
        { kind: "route", empty: false, deleted: false, files: [], lane: 0 },
        { kind: "text", empty: false, deleted: true, files: [1], lane: 0 },
      ],
    });
    const one = (lineId: string, attachmentId: string) =>
      deckOfOne(room.space, room.lanes, { lineId, attachmentId }, DIRECTORY);
    expect(one("ln_0", "att_1")).toEqual([
      {
        attachment: expect.objectContaining({ id: "att_1" }),
        lineId: "ln_0",
        saidBy: "per_arjun",
        ts: room.space.lines[0]?.ts,
        kind: "video",
        inMessage: { index: 1, of: 1 },
      },
    ]);
    // A route row's clip is the specialist's, as its photos would be.
    expect(one("ln_1", "att_3")[0]?.saidBy).toBe("hrn_specialist_0");
    // Not a video, not carried there, taken back, or no such line: nothing to open.
    expect(one("ln_0", "att_0")).toEqual([]);
    expect(one("ln_0", "att_2")).toEqual([]);
    expect(one("ln_0", "att_3")).toEqual([]);
    expect(one("ln_2", "att_1")).toEqual([]);
    expect(one("ln_9", "att_1")).toEqual([]);
  });

  it("holds still while it is up: the whole room, kept to the lines it opened with", () => {
    const room = build({
      pool: Array.from({ length: 30 }, () => "photo" as const),
      lanes: [],
      lines: Array.from({ length: 25 }, (_, index) => ({
        kind: "text" as const,
        empty: false,
        deleted: false,
        files: [index],
        lane: 0,
      })),
    });
    const opened = deckOfRoom(room, "ln_24");
    const held = new Set(opened.map((item) => item.lineId));
    const landed: Line = { ...(room.space.lines[24] as Line), id: "ln_new", seq: 26 };
    const later: Space = { ...room.space, lines: [...room.space.lines, landed] };
    // Asked around the same line again, the window would have moved on by one.
    expect(
      deckOf(later, [], { around: "ln_24", messages: DECK_WINDOW }, DIRECTORY)[0]?.lineId,
    ).toBe("ln_6");
    const everything = deckOf(
      later,
      [],
      { around: "ln_24", messages: later.lines.length },
      DIRECTORY,
    );
    expect(everything.filter((item) => held.has(item.lineId))).toEqual(opened);
  });
});

// ---------------------------------------------------------------------------------------------

/**
 * Within a hair of each other, relative to the largest number the two were worked out from: a
 * sum of large terms that cancels keeps the rounding of the terms.
 */
const near = (a: number, b: number, ...from: number[]) =>
  Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b), ...from.map(Math.abs));
const atMost = (a: number, b: number, ...from: number[]) => a <= b || near(a, b, ...from);

const lengthArb = (max: number) => fc.double({ min: 1, max, noNaN: true });
const sizeArb = (max: number) => fc.record({ width: lengthArb(max), height: lengthArb(max) });
const contentArb = sizeArb(20_000);
const stageArb = sizeArb(4000);

/** The ids of every file a line carries, of any kind, taken back or not, as the room lists them. */
function carriedIds(room: Room, index: number): string[] {
  const line = room.spec.lines[index];
  if (line === undefined) return [];
  const lane = line.kind === "route" ? laneOf(room, line) : undefined;
  return (lane === undefined ? line.files : lane.files).map(
    (place) => `att_${place % room.spec.pool.length}`,
  );
}

describe("the files a room carries (Media on this phone, ADR 0159)", () => {
  it("lists every file of every drawn line, each once, under the first line that carried it", () => {
    fc.assert(
      fc.property(roomArb, (room) => {
        const files = filesOf(room.space, room.lanes);
        const ids = files.map((file) => file.attachment.id);
        expect(new Set(ids).size).toBe(ids.length);
        const lines = drawn(room);
        expect(new Set(ids)).toEqual(new Set(lines.flatMap((index) => carriedIds(room, index))));
        for (const file of files) {
          const first = lines.find((index) => carriedIds(room, index).includes(file.attachment.id));
          expect(file.lineId).toBe(`ln_${first}`);
          expect(file.ts).toBe(room.space.lines[first as number]?.ts);
        }
      }),
    );
  });

  it("keeps the order the room draws its lines in", () => {
    fc.assert(
      fc.property(roomArb, (room) => {
        const order = filesOf(room.space, room.lanes).map((file) => Number(file.lineId.slice(3)));
        expect(order).toEqual([...order].sort((a, b) => a - b));
      }),
    );
  });

  it("keeps a taken-back line's files and a route's lane files, which the deck leaves out", () => {
    const room = build({
      pool: ["photo", "file", "voice", "video"],
      lanes: [{ files: [3], here: false }],
      lines: [
        { kind: "text", empty: false, deleted: true, files: [0], lane: 0 },
        { kind: "text", empty: false, deleted: false, files: [1, 2], lane: 0 },
        { kind: "route", empty: false, deleted: false, files: [], lane: 0 },
      ],
    });
    expect(
      filesOf(room.space, room.lanes).map((file) => [file.attachment.id, file.lineId]),
    ).toEqual([
      ["att_0", "ln_0"],
      ["att_1", "ln_1"],
      ["att_2", "ln_1"],
      ["att_3", "ln_2"],
    ]);
  });
});

describe("the room sheet's Media & files (ADR 0202)", () => {
  it("lists what the room carries newest first", () => {
    fc.assert(
      fc.property(roomArb, (room) => {
        expect(newestFilesOf(room.space, room.lanes)).toEqual(
          [...filesOf(room.space, room.lanes)].reverse(),
        );
      }),
    );
  });

  it("opens Media & files' pictures on the room's every one, newest first, as the page lists them", () => {
    fc.assert(
      fc.property(roomArb, (room) => {
        const all = deckOf(
          room.space,
          room.lanes,
          { around: "", messages: Number.POSITIVE_INFINITY },
          DIRECTORY,
        );
        expect(newestDeckOf(room.space, room.lanes, DIRECTORY)).toEqual([...all].reverse());
      }),
    );
  });

  it("says how many things and how many files, None yet when there are neither, and nothing while files are read", () => {
    expect(mediaFilesWords(9, 4)).toBe("9 · 4 files");
    expect(mediaFilesWords(9, 1)).toBe("9 · 1 file");
    expect(mediaFilesWords(9, 0)).toBe("9");
    expect(mediaFilesWords(9, undefined)).toBe("9");
    expect(mediaFilesWords(0, 2)).toBe("2 files");
    expect(mediaFilesWords(0, 0)).toBe("None yet");
    expect(mediaFilesWords(0, undefined)).toBe("");
  });
});

describe("fitting a picture", () => {
  it("never exceeds the stage, keeps the picture's shape, and meets the stage on one side", () => {
    fc.assert(
      fc.property(contentArb, stageArb, (content, stage) => {
        const fitted = fitRect(content, stage);
        expect(fitted.x).toBeGreaterThanOrEqual(0);
        expect(fitted.y).toBeGreaterThanOrEqual(0);
        expect(atMost(fitted.x + fitted.width, stage.width)).toBe(true);
        expect(atMost(fitted.y + fitted.height, stage.height)).toBe(true);
        expect(near(fitted.width * content.height, fitted.height * content.width)).toBe(true);
        expect(near(fitted.width, stage.width) || near(fitted.height, stage.height)).toBe(true);
        // Centred.
        expect(near(fitted.x * 2 + fitted.width, stage.width)).toBe(true);
        expect(near(fitted.y * 2 + fitted.height, stage.height)).toBe(true);
      }),
    );
  });

  it("fills the stage with a picture whose size is not known yet", () => {
    expect(fitRect({ width: 0, height: 0 }, { width: 393, height: 852 })).toEqual({
      x: 0,
      y: 0,
      width: 393,
      height: 852,
    });
    expect(fitRect({ width: 4032, height: 3024 }, { width: 0, height: 852 }).width).toBe(0);
  });
});

describe("what a tile crops", () => {
  const frameArb = fc.record({
    x: fc.double({ min: -2000, max: 2000, noNaN: true }),
    y: fc.double({ min: -2000, max: 2000, noNaN: true }),
    width: lengthArb(2000),
    height: lengthArb(2000),
  });

  it("covers its frame, keeps the picture's shape, and meets the frame on one side", () => {
    fc.assert(
      fc.property(contentArb, frameArb, (content, frame) => {
        const cover = coverRect(content, frame);
        expect(atMost(cover.x, frame.x)).toBe(true);
        expect(atMost(cover.y, frame.y)).toBe(true);
        expect(atMost(frame.x + frame.width, cover.x + cover.width)).toBe(true);
        expect(atMost(frame.y + frame.height, cover.y + cover.height)).toBe(true);
        expect(near(cover.width * content.height, cover.height * content.width)).toBe(true);
        expect(near(cover.width, frame.width) || near(cover.height, frame.height)).toBe(true);
      }),
    );
  });
});

describe("where the flight is clipped", () => {
  const glassArb = fc.record({
    x: fc.double({ min: -100, max: 400, noNaN: true }),
    y: fc.double({ min: -100, max: 400, noNaN: true }),
    width: lengthArb(2000),
    height: lengthArb(2000),
  });

  it("is the room's glass at the tile and the whole stage at the stage", () => {
    fc.assert(
      fc.property(glassArb, stageArb, (glass, stage) => {
        expect(clipRect(glass, stage, 0)).toEqual(glass);
        expect(clipRect(glass, stage, 1)).toEqual({
          x: 0,
          y: 0,
          width: stage.width,
          height: stage.height,
        });
      }),
    );
  });

  it("clips as if at the end the spring overshoots past", () => {
    fc.assert(
      fc.property(
        glassArb,
        stageArb,
        fc.double({ min: 0.01, max: 0.3, noNaN: true }),
        (glass, stage, past) => {
          expect(clipRect(glass, stage, -past)).toEqual(clipRect(glass, stage, 0));
          expect(clipRect(glass, stage, 1 + past)).toEqual(clipRect(glass, stage, 1));
        },
      ),
    );
  });

  it("stays between the two, wherever the flight is", () => {
    fc.assert(
      fc.property(
        glassArb,
        stageArb,
        fc.double({ min: 0, max: 1, noNaN: true }),
        (glass, stage, share) => {
          const clip = clipRect(glass, stage, share);
          const within = (at: number, one: number, other: number) =>
            atMost(Math.min(one, other), at) && atMost(at, Math.max(one, other));
          expect(within(clip.x, glass.x, 0)).toBe(true);
          expect(within(clip.y, glass.y, 0)).toBe(true);
          expect(within(clip.width, glass.width, stage.width)).toBe(true);
          expect(within(clip.height, glass.height, stage.height)).toBe(true);
        },
      ),
    );
  });

  it("does not clip at all for a room that cannot say where its lines are", () => {
    const stage = { width: 402, height: 874 };
    const whole = { x: 0, y: 0, width: 402, height: 874 };
    expect(clipRect({ x: 0, y: 0, width: 0, height: 0 }, stage, 0)).toEqual(whole);
    expect(clipRect({ x: 0, y: 96, width: 402, height: 0 }, stage, 0)).toEqual(whole);
  });
});

describe("drawing a view as another rect", () => {
  const rectArb = fc.record({
    x: fc.double({ min: -500, max: 500, noNaN: true }),
    y: fc.double({ min: -500, max: 500, noNaN: true }),
    width: fc.double({ min: 1, max: 2000, noNaN: true }),
    height: fc.double({ min: 1, max: 2000, noNaN: true }),
  });

  /** Where a point of a view laid out at `frame` lands, drawn as `transformTo` says. */
  function land(
    frame: Rect,
    drawn: ReturnType<typeof transformTo>,
    point: { x: number; y: number },
  ) {
    const middle = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
    return {
      x: middle.x + drawn.x + drawn.sx * (point.x - middle.x),
      y: middle.y + drawn.y + drawn.sy * (point.y - middle.y),
    };
  }

  it("lands the frame's corners on the box's", () => {
    fc.assert(
      fc.property(rectArb, rectArb, (frame, box) => {
        const drawn = transformTo(frame, box);
        const topLeft = land(frame, drawn, { x: frame.x, y: frame.y });
        const bottomRight = land(frame, drawn, {
          x: frame.x + frame.width,
          y: frame.y + frame.height,
        });
        expect(topLeft.x).toBeCloseTo(box.x, 6);
        expect(topLeft.y).toBeCloseTo(box.y, 6);
        expect(bottomRight.x).toBeCloseTo(box.x + box.width, 6);
        expect(bottomRight.y).toBeCloseTo(box.y + box.height, 6);
      }),
    );
  });

  it("leaves a view where it is when either rect has no size", () => {
    const none = { x: 0, y: 0, sx: 1, sy: 1 };
    expect(
      transformTo({ x: 0, y: 0, width: 0, height: 10 }, { x: 5, y: 5, width: 10, height: 10 }),
    ).toEqual(none);
    expect(
      transformTo({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 0 }),
    ).toEqual(none);
    expect(
      transformTo({ x: 3, y: 4, width: 10, height: 20 }, { x: 3, y: 4, width: 10, height: 20 }),
    ).toEqual(none);
  });
});

describe("how far a picture zooms", () => {
  it("goes to three times at least, and to one image pixel per device pixel where that is further", () => {
    fc.assert(
      fc.property(contentArb, stageArb, fc.constantFrom(1, 2, 3, 3.5), (content, stage, ratio) => {
        const { min, max } = zoomLimits(content, stage, ratio);
        expect(min).toBe(1);
        expect(max).toBeGreaterThanOrEqual(3);
        const fitted = fitRect(content, stage);
        // At the limit, a pixel of the picture is at least a pixel of the screen.
        expect(atMost(content.width, fitted.width * max * ratio)).toBe(true);
      }),
    );
  });

  it("reads a twelve-megapixel photo at full resolution on a phone", () => {
    const { max } = zoomLimits({ width: 4032, height: 3024 }, { width: 393, height: 852 }, 3);
    expect(max).toBeCloseTo(4032 / (393 * 3), 9);
    expect(zoomLimits({ width: 640, height: 480 }, { width: 393, height: 852 }, 3).max).toBe(3);
    expect(zoomLimits({ width: 0, height: 0 }, { width: 393, height: 852 }, 3).max).toBe(3);
  });
});

describe("panning a zoomed picture", () => {
  const panArb = fc
    .record({
      content: contentArb,
      stage: stageArb,
      ratio: fc.constantFrom(1, 2, 3),
      toward: fc.double({ min: 0, max: 1, noNaN: true }),
      translate: fc.record({
        x: fc.double({ min: -50_000, max: 50_000, noNaN: true }),
        y: fc.double({ min: -50_000, max: 50_000, noNaN: true }),
      }),
    })
    .map(({ content, stage, ratio, toward, translate }) => {
      const { max } = zoomLimits(content, stage, ratio);
      return { stage, translate, fitted: fitRect(content, stage), scale: 1 + (max - 1) * toward };
    });

  it("keeps the picture over the stage at every scale from fitted to the limit", () => {
    fc.assert(
      fc.property(panArb, ({ stage, translate, fitted, scale }) => {
        const moved = clampPan(scale, fitted, stage, translate);
        const axes = [
          [fitted.x, fitted.width, stage.width, moved.x],
          [fitted.y, fitted.height, stage.height, moved.y],
        ] as const;
        for (const [at, length, extent, offset] of axes) {
          const scaled = length * scale;
          const leading = at + length / 2 + offset - scaled / 2;
          if (scaled > extent) {
            // Longer than the stage: the stage stays covered.
            expect(atMost(leading, 0, scaled, at)).toBe(true);
            expect(atMost(extent, leading + scaled, scaled, at)).toBe(true);
          } else {
            // Shorter: it stands in the middle.
            expect(near(leading * 2 + scaled, extent, at)).toBe(true);
          }
        }
        // A picture already where it may be is left there.
        expect(clampPan(scale, fitted, stage, moved)).toEqual(moved);
      }),
    );
  });
});

describe("the rubber band", () => {
  it("shows less than the pull and never the whole extent, in the pull's direction", () => {
    fc.assert(
      fc.property(
        // Past a hair, where the pull's share of the extent is still a number.
        fc
          .double({ min: -10_000, max: 10_000, noNaN: true })
          .filter((x) => x === 0 || Math.abs(x) > 1e-6),
        lengthArb(4000),
        (overshoot, extent) => {
          const shown = rubberBand(overshoot, extent);
          expect(Math.abs(shown)).toBeLessThan(extent);
          expect(atMost(Math.abs(shown), Math.abs(overshoot) * 0.55)).toBe(true);
          expect(Math.sign(shown)).toBe(Math.sign(overshoot) || 0);
          expect(Math.abs(rubberBand(overshoot * 2, extent))).toBeGreaterThanOrEqual(
            Math.abs(shown),
          );
        },
      ),
    );
    expect(rubberBand(100, 0)).toBe(0);
  });

  it("is taken back by the pull that shows as much", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -20, max: 20, noNaN: true }),
        lengthArb(4000),
        (share, extent) => {
          const pull = share * extent;
          expect(near(rubberBandPull(rubberBand(pull, extent), extent), pull, extent * 1e3)).toBe(
            true,
          );
        },
      ),
    );
    expect(rubberBandPull(0, 100)).toBe(0);
    expect(rubberBandPull(100, 0)).toBe(0);
    expect(Number.isFinite(rubberBandPull(100, 100))).toBe(true);
  });
});

describe("pinching", () => {
  const fitted: Rect = { x: 0, y: 169, width: 402, height: 536 };
  const max = 3.3;
  const pointArb = fc.record({
    x: fc.double({ min: -500, max: 900, noNaN: true }),
    y: fc.double({ min: -500, max: 1300, noNaN: true }),
  });
  const fingersArb = fc.record({
    scale: fc.double({ min: 0.2, max: 5, noNaN: true }),
    focal: pointArb,
    count: fc.constantFrom(0, 1, 2, 3),
  });
  // Anywhere a picture can stand, past the limit too, short of the band's whole extent.
  const placementArb = fc.record({
    zoom: fc.double({ min: 0.2, max: max * 1.9, noNaN: true }),
    x: fc.double({ min: -2000, max: 2000, noNaN: true }),
    y: fc.double({ min: -2000, max: 2000, noNaN: true }),
  });
  const closeTo = (a: Placement, b: Placement) =>
    near(a.zoom, b.zoom, 1e3) && near(a.x, b.x, 1e5) && near(a.y, b.y, 1e5);
  /** Where a point of the stage is on the picture, in fitted points from its middle. */
  const onPicture = (at: Placement, point: Point) => ({
    x: (point.x - (fitted.x + fitted.width / 2) - at.x) / at.zoom,
    y: (point.y - (fitted.y + fitted.height / 2) - at.y) / at.zoom,
  });

  it("moves nothing when it takes hold, wherever the picture is and however many fingers", () => {
    fc.assert(
      fc.property(placementArb, fingersArb, (at, fingers) => {
        const grip = pinchGrip(at, fingers, max);
        expect(closeTo(pinchTo(grip, fingers, fitted, max), at)).toBe(true);
      }),
    );
  });

  it("keeps the point under two fingers under them, and zooms past the limit on the band", () => {
    fc.assert(
      fc.property(placementArb, fingersArb, fingersArb, (at, from, to) => {
        const grip = pinchGrip(at, { ...from, count: 2 }, max);
        const moved = pinchTo(grip, { ...to, count: 2 }, fitted, max);
        const held = onPicture(at, from.focal);
        const now = onPicture(moved, to.focal);
        expect(near(now.x, held.x, 1e5)).toBe(true);
        expect(near(now.y, held.y, 1e5)).toBe(true);
        expect(moved.zoom).toBeLessThan(max * 2);
      }),
    );
  });

  it("moves the picture with one finger and does not zoom it, whatever the scale reads", () => {
    fc.assert(
      fc.property(placementArb, fingersArb, fingersArb, (at, from, to) => {
        const grip = pinchGrip(at, { ...from, count: 1 }, max);
        const moved = pinchTo(grip, { ...to, count: 1 }, fitted, max);
        expect(near(moved.zoom, at.zoom, 1e3)).toBe(true);
        expect(near(moved.x, at.x + to.focal.x - from.focal.x, 1e5)).toBe(true);
        expect(near(moved.y, at.y + to.focal.y - from.focal.y, 1e5)).toBe(true);
      }),
    );
  });

  it("does not leap when one finger lifts before the other, as a pinch always ends on a phone", () => {
    // Two fingers 100 points apart about the middle spread to 300 and zoom the picture three times.
    const middle = { x: 201, y: 437 };
    let grip = pinchGrip({ zoom: 1, x: 0, y: 0 }, { scale: 1, focal: middle, count: 2 }, max);
    const zoomed = pinchTo(grip, { scale: 3, focal: middle, count: 2 }, fitted, max);
    expect(zoomed).toEqual({ zoom: 3, x: 0, y: 0 });
    // The left finger lifts. Gesture handler goes on reporting the pinch, with the right finger's
    // place for the middle: a grip, where the picture stands.
    const lifted = { scale: 3, focal: { x: 351, y: 437 }, count: 1 };
    grip = pinchGrip(zoomed, lifted, max);
    expect(pinchTo(grip, lifted, fitted, max)).toEqual(zoomed);
    // And the finger left behind carries the picture with it, 20 points across.
    const carried = pinchTo(grip, { ...lifted, focal: { x: 331, y: 437 } }, fitted, max);
    expect(carried).toEqual({ zoom: 3, x: -20, y: 0 });
  });
});

describe("settling a page", () => {
  const swipeArb = fc
    .record({
      count: fc.integer({ min: 1, max: 40 }),
      pick: fc.nat(),
      offset: fc.double({ min: -3000, max: 3000, noNaN: true }),
      velocity: fc.double({ min: -4000, max: 4000, noNaN: true }),
      width: lengthArb(2000),
    })
    .map((swipe) => ({ ...swipe, from: swipe.pick % swipe.count }));

  it("never leaves the deck and moves at most one page", () => {
    fc.assert(
      fc.property(swipeArb, ({ count, from, offset, velocity, width }) => {
        const to = snapPage(offset, velocity, width, count, from);
        expect(Number.isInteger(to)).toBe(true);
        expect(to).toBeGreaterThanOrEqual(0);
        expect(to).toBeLessThanOrEqual(count - 1);
        expect(Math.abs(to - from)).toBeLessThanOrEqual(1);
      }),
    );
  });

  it("turns past 40 % of the width or at 500 pt/s, and stays short of both", () => {
    fc.assert(
      fc.property(swipeArb, ({ count, from, offset, velocity, width }) => {
        const toward = (direction: number) => Math.min(count - 1, Math.max(0, from + direction));
        const flung = Math.abs(velocity) >= 500;
        const far = Math.abs(offset) >= 0.4 * width;
        // A flick thrown back against the drag cancels it.
        const against = Math.sign(offset) * Math.sign(velocity) < 0;
        const expected = flung
          ? toward(against ? 0 : Math.sign(velocity))
          : toward(far ? Math.sign(offset) : 0);
        expect(snapPage(offset, velocity, width, count, from)).toBe(expected);
      }),
    );
  });

  it("resists at the ends rather than wrapping", () => {
    expect(snapPage(-300, -800, 393, 5, 0)).toBe(0);
    expect(snapPage(300, 800, 393, 5, 4)).toBe(4);
    expect(snapPage(300, 0, 393, 1, 0)).toBe(0);
    expect(snapPage(160, 0, 393, 5, 2)).toBe(3);
    expect(snapPage(150, 0, 393, 5, 2)).toBe(2);
  });
});

describe("dragging to dismiss", () => {
  const dragArb = fc.record({
    dy: fc.double({ min: -1000, max: 1000, noNaN: true }),
    vy: fc.double({ min: -5000, max: 5000, noNaN: true }),
  });

  it("closes at 120 points or 900 pt/s and not before", () => {
    fc.assert(
      fc.property(dragArb, ({ dy, vy }) => {
        const decided = dismissDecision(dy, vy);
        const far = Math.abs(dy) >= 120;
        const flung = Math.abs(vy) >= 900;
        const thrownBack = flung && dy !== 0 && Math.sign(vy) !== Math.sign(dy);
        if (!far && !flung) expect(decided).toBe("stay");
        else if (thrownBack) expect(decided).toBe("stay");
        else expect(decided).toBe("close");
      }),
    );
    expect(dismissDecision(119.9, 0)).toBe("stay");
    expect(dismissDecision(120, 0)).toBe("close");
    expect(dismissDecision(-120, 0)).toBe("close");
    expect(dismissDecision(10, 900)).toBe("close");
    expect(dismissDecision(10, 899)).toBe("stay");
    expect(dismissDecision(200, -1200)).toBe("stay");
  });

  it("clears the stage to 0.3 over 300 points and shrinks the picture to 0.75 over 600", () => {
    fc.assert(
      fc.property(dragArb, ({ dy }) => {
        const { backdrop, scale } = dismissProgress(dy);
        expect(atMost(0.3, backdrop) && atMost(backdrop, 1)).toBe(true);
        expect(atMost(0.75, scale) && atMost(scale, 1)).toBe(true);
        expect(dismissProgress(-dy)).toEqual({ backdrop, scale });
        const further = dismissProgress(Math.abs(dy) + 10);
        expect(further.backdrop).toBeLessThanOrEqual(backdrop);
        expect(further.scale).toBeLessThanOrEqual(scale);
      }),
    );
    expect(dismissProgress(0)).toEqual({ backdrop: 1, scale: 1 });
    expect(dismissProgress(150).backdrop).toBeCloseTo(0.65, 9);
    expect(dismissProgress(300)).toMatchObject({ backdrop: 0.3 });
    expect(dismissProgress(600)).toEqual({ backdrop: 0.3, scale: 0.75 });
  });
});

describe("the flight's spring", () => {
  const IOS = { stiffness: 320, damping: 32, mass: 1 };

  /** The same spring stepped through in hundredths of a millisecond, from rest at 0 toward 1. */
  function stepped(spring: { stiffness: number; damping: number; mass: number }, until: number) {
    let x = 0;
    let v = 0;
    const dt = 0.000_01;
    for (let t = 0; t < until / 1000 - dt / 2; t += dt) {
      v += ((-spring.stiffness * (x - 1) - spring.damping * v) / spring.mass) * dt;
      x += v * dt;
    }
    return x;
  }

  it("is where the spring itself is, at any damping", () => {
    fc.assert(
      fc.property(
        fc.record({
          stiffness: fc.double({ min: 50, max: 800, noNaN: true }),
          ratio: fc.double({ min: 0.3, max: 2.5, noNaN: true }),
          mass: fc.double({ min: 0.5, max: 3, noNaN: true }),
        }),
        fc.integer({ min: 1, max: 400 }),
        ({ stiffness, ratio, mass }, ms) => {
          const spring = { stiffness, damping: ratio * 2 * Math.sqrt(stiffness * mass), mass };
          const { share, settled } = springShare(spring, ms);
          const want = stepped(spring, ms);
          // Settled, it says 1, and the spring has under `SPRING_REST` of its travel left; the
          // stepped spring is itself up to about 0.0002 off the spring.
          expect(Math.abs(settled ? 1 - want : share - want)).toBeLessThan(
            settled ? SPRING_REST + 0.0005 : 0.002,
          );
        },
      ),
      {
        numRuns: 60,
        // Settled with most of `SPRING_REST` still left: red against the bound this test kept from
        // when the rest was a twentieth of a percent (2 October 2026).
        examples: [
          [{ stiffness: 395.203_847_225_289_1, ratio: 0.571_643_552_292_228_4, mass: 0.5 }, 399],
        ],
      },
    );
  });

  it("is drawn as a curve from nothing to the whole travel, a frame a step, until it settles", () => {
    const { ms, shares } = springCurve(IOS);
    expect(shares[0]).toBe(0);
    expect(shares.at(-1)).toBe(1);
    expect(ms).toBeCloseTo((shares.length - 1) * (1000 / 60), 6);
    expect(shares[1]).toBeCloseTo(springShare(IOS, 1000 / 60).share, 12);
    expect(springShare(IOS, ms).settled).toBe(true);
    expect(springShare(IOS, ms - 1000 / 60).settled).toBe(false);
  });

  it("starts at rest where it was let go, and the app's settles inside half a second", () => {
    expect(springShare(IOS, 0)).toEqual({ share: 0, settled: false });
    expect(springShare(IOS, -40)).toEqual({ share: 0, settled: false });
    expect(springShare(IOS, Number.NaN)).toEqual({ share: 0, settled: false });
    const first = springShare(IOS, 1000 / 60).share;
    expect(first).toBeGreaterThan(0.02);
    expect(first).toBeLessThan(0.06);
    expect(springShare(IOS, 400).settled).toBe(false);
    // Under a point of a 400-point flight left by 450 ms, which is when the room is handed back.
    expect(springShare(IOS, 450).settled).toBe(true);
    expect(springShare(IOS, 600)).toEqual({ share: 1, settled: true });
    for (let ms = 0; ms <= 1000; ms += 5) {
      const { share } = springShare(IOS, ms);
      expect(share).toBeLessThan(1.0025);
      if (ms >= 600) expect(springShare(IOS, ms).settled).toBe(true);
    }
  });

  it("goes on from wherever it was let go and however fast, at any damping", () => {
    /**
     * The spring stepped through from `x` points off rest at `v` points a second, a fourth-order
     * step every tenth of a millisecond. A first-order step every hundredth was itself more than a
     * twentieth of a point out for a light spring let go far off and fast (2 October 2026).
     */
    function from(
      spring: { stiffness: number; damping: number; mass: number },
      x0: number,
      v0: number,
      until: number,
    ) {
      const pull = (x: number, v: number) =>
        (-spring.stiffness * x - spring.damping * v) / spring.mass;
      const steps = Math.round(until * 10);
      const dt = until / 1000 / Math.max(1, steps);
      let x = x0;
      let v = v0;
      for (let n = 0; n < steps; n += 1) {
        const a1 = pull(x, v);
        const a2 = pull(x + (v * dt) / 2, v + (a1 * dt) / 2);
        const v2 = v + (a1 * dt) / 2;
        const v3 = v + (a2 * dt) / 2;
        const a3 = pull(x + (v2 * dt) / 2, v3);
        const v4 = v + a3 * dt;
        const a4 = pull(x + v3 * dt, v4);
        x += ((v + 2 * v2 + 2 * v3 + v4) * dt) / 6;
        v += ((a1 + 2 * a2 + 2 * a3 + a4) * dt) / 6;
      }
      return { x, v };
    }
    fc.assert(
      fc.property(
        fc.record({
          stiffness: fc.double({ min: 50, max: 800, noNaN: true }),
          ratio: fc.double({ min: 0.3, max: 2.5, noNaN: true }),
          mass: fc.double({ min: 0.5, max: 3, noNaN: true }),
        }),
        fc.double({ min: -300, max: 300, noNaN: true }),
        fc.double({ min: -3000, max: 3000, noNaN: true }),
        fc.integer({ min: 0, max: 400 }),
        ({ stiffness, ratio, mass }, x0, v0, ms) => {
          const spring = { stiffness, damping: ratio * 2 * Math.sqrt(stiffness * mass), mass };
          const got = springAt(spring, x0, v0, ms);
          const want = from(spring, x0, v0, ms);
          // Settled, it says rest, and the spring has under a fifth of a point left in it.
          expect(Math.abs(got.offset - want.x)).toBeLessThan(got.settled ? 0.25 : 0.05);
          if (!got.settled) expect(Math.abs(got.velocity - want.v)).toBeLessThan(5);
        },
      ),
      {
        numRuns: 80,
        // A thousandth from critical, let go fast: the critical form stood in there and was off by
        // a twentieth of a point (2 October 2026).
        examples: [
          [
            { stiffness: 50, ratio: 0.999, mass: 1.396_861_033_420_842_7 },
            0,
            -1601.095_924_539_579_8,
            145,
          ],
        ],
      },
    );
  });

  it("is the spring from rest when let go at rest, and a move retargeted is two moves added up", () => {
    const ROOM = { stiffness: 130, damping: 19, mass: 1 };
    for (let ms = 0; ms <= 600; ms += 20) {
      const { share, settled } = springShare(ROOM, ms);
      const at = springAt(ROOM, -100, 0, ms);
      if (!settled && !at.settled) expect(at.offset).toBeCloseTo(-100 * (1 - share), 6);
    }
    // A row 80 points off its place and 300 ms into its move is sent 60 points further. Let go
    // again from where it is, at the speed it has, it goes where the first move and a second one
    // from rest, started then, go together.
    const first = springAt(ROOM, -80, 0, 300);
    for (let ms = 0; ms <= 900; ms += 15) {
      const again = springAt(ROOM, first.offset - 60, first.velocity, ms);
      const sum = springAt(ROOM, -80, 0, 300 + ms).offset + springAt(ROOM, -60, 0, ms).offset;
      expect(Math.abs(again.offset - sum)).toBeLessThan(0.45);
    }
    expect(springAt(ROOM, 0, 0, 0)).toEqual({ offset: 0, velocity: 0, settled: true });
    expect(springAt(ROOM, -80, 0, 5000).settled).toBe(true);
    expect(springAt(ROOM, Number.NaN, Number.NaN, Number.NaN)).toEqual({
      offset: 0,
      velocity: 0,
      settled: true,
    });
  });

  it("creeps in from one side at critical damping and over it, and never jumps", () => {
    for (const ratio of [0.9995, 1, 1.0005, 1.6]) {
      const spring = { stiffness: 320, damping: ratio * 2 * Math.sqrt(320), mass: 1 };
      let before = 0;
      for (let ms = 0; ms <= 1500; ms += 1) {
        const { share } = springShare(spring, ms);
        expect(share).toBeGreaterThanOrEqual(before - 1e-9);
        expect(share - before).toBeLessThan(0.02);
        before = share;
      }
      expect(before).toBe(1);
    }
  });
});

describe("a zoomed picture let go", () => {
  const IOS = { stiffness: 320, damping: 32, mass: 1 };
  const natural = Math.sqrt(IOS.stiffness / IOS.mass);
  const flickArb = fc
    .record({
      low: fc.double({ min: -3000, max: 0, noNaN: true }),
      room: fc.double({ min: 1, max: 3000, noNaN: true }),
      share: fc.double({ min: -0.3, max: 1.3, noNaN: true }),
      velocity: fc.double({ min: -6000, max: 6000, noNaN: true }),
    })
    .map(({ low, room, share, velocity }) => ({
      low,
      high: low + room,
      from: low + room * share,
      velocity,
    }));
  const at = (f: { from: number; velocity: number; low: number; high: number }, t: number) =>
    glideAt(IOS, f.from, f.velocity, f.low, f.high, t);

  it("comes to rest where it may stand, and far enough on to stay there", () => {
    fc.assert(
      fc.property(flickArb, (f) => {
        const end = at(f, 10_000);
        expect(end.settled).toBe(true);
        expect(atMost(f.low, end.at, f.low) && atMost(end.at, f.high, f.high)).toBe(true);
      }),
    );
  });

  it("never jumps, where the slide meets the spring least of all", () => {
    // What a millisecond may move it: as fast as it was let go, or as fast as a spring let go
    // that far out can make it; and the fifth of a point it is put down across when it settles.
    const settling = 0.2;
    fc.assert(
      fc.property(flickArb, (f) => {
        const edge = Math.min(f.high, Math.max(f.low, f.from));
        const fastest = Math.abs(f.velocity) + natural * Math.abs(f.from - edge) + 1;
        let was = at(f, 0).at;
        expect(Math.abs(was - f.from)).toBeLessThanOrEqual(settling + 1e-6);
        for (let t = 1; t <= 1500; t += 1) {
          const now = at(f, t).at;
          expect(Math.abs(now - was)).toBeLessThanOrEqual(fastest / 1000 + settling + 1e-6);
          was = now;
        }
      }),
      { numRuns: 60 },
    );
  });

  it("slides as a scroll view does, half its speed in points on, when that is inside", () => {
    const f = { from: -100, velocity: 150, low: -1000, high: 0 };
    expect(at(f, 10_000).at).toBeCloseTo(-100 + 150 / (-1000 * Math.log(0.998)), 6);
    let was = f.from;
    for (let t = 10; t <= 3000; t += 10) {
      const now = at(f, t).at;
      expect(now).toBeGreaterThanOrEqual(was);
      expect(now).toBeLessThanOrEqual(f.high);
      was = now;
    }
    expect(at({ ...f, velocity: 0 }, 500)).toEqual({ at: -100, velocity: 0, settled: true });
  });

  it("goes past an edge no further than its speed there carries it, and stands on the edge", () => {
    fc.assert(
      fc.property(flickArb, (f) => {
        let furthest = 0;
        for (let t = 0; t <= 3000; t += 2) {
          const now = at(f, t).at;
          furthest = Math.max(furthest, now - f.high, f.low - now);
        }
        // A damped spring only loses energy, so it swings out no further than the energy it had
        // where it was let go (inside, at most the speed it reaches the edge with) would carry it.
        const started = Math.max(0, f.from - f.high, f.low - f.from);
        expect(furthest).toBeLessThanOrEqual(
          Math.hypot(started, Math.abs(f.velocity) / natural) + 1e-6,
        );
      }),
      { numRuns: 60 },
    );
    // Flicked into the right-hand edge at 2000 points a second from 100 points short of it: it
    // reaches the edge still going, swings out a few tens of points, and stands on the edge.
    const flicked = { from: -100, velocity: 2000, low: -1000, high: 0 };
    const out = Math.max(...Array.from({ length: 1500 }, (_, t) => at(flicked, t).at));
    expect(out).toBeGreaterThan(10);
    expect(out).toBeLessThan(2000 / natural);
    expect(at(flicked, 3000)).toEqual({ at: 0, velocity: 0, settled: true });
  });

  it("comes back from past an edge to that edge, never the other", () => {
    fc.assert(
      fc.property(flickArb, (f) => {
        fc.pre(f.from > f.high || f.from < f.low);
        const end = at(f, 10_000).at;
        expect(end === (f.from > f.high ? f.high : f.low)).toBe(true);
      }),
    );
  });
});

describe("a room's file's versions (ADR 0100)", () => {
  const version = (n: number, mimeType: string, extra: Partial<Attachment> = {}) => ({
    name: "preview.png",
    version: n,
    attachment: { id: `att_${n}`, filename: "preview.png", mimeType, byteSize: 100, ...extra },
    by: "agt_oc2",
    byName: "Oc2",
    at: `2026-10-02T18:0${n}:00.000Z`,
    lineId: `evt_${n}`,
  });

  it("are a deck in the order they were posted, of the ones the viewer draws", () => {
    const deck = deckOfVersions([
      version(3, "image/png"),
      version(2, "image/svg+xml"),
      version(1, "image/png"),
    ]);
    expect(deck.map((item) => [item.attachment.id, item.lineId, item.kind, item.saidBy])).toEqual([
      ["att_1", "evt_1", "photo", "agt_oc2"],
      ["att_3", "evt_3", "photo", "agt_oc2"],
    ]);
  });

  it("hold a measured video, and not one the server never measured", () => {
    const deck = deckOfVersions([
      version(2, "video/mp4", { durationMs: 4000, width: 640, height: 360 }),
      version(1, "video/mp4"),
    ]);
    expect(deck.map((item) => [item.attachment.id, item.kind])).toEqual([["att_2", "video"]]);
  });
});
