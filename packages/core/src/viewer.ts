/**
 * The media viewer's deck, and the arithmetic every viewer shares (the media viewer proposal,
 * §4.1). The phone and the web open the same deck from the same room and settle a page, a
 * dismiss and a zoom by the same numbers, so they cannot disagree on either.
 *
 * The deck is the media of the twenty messages around the one that was tapped, in the order it
 * was said (Arjun, 13 September 2026: not the whole room — the last twenty messages). At the
 * room's foot that is its last twenty; further up, the tapped message with what was said either
 * side of it. The rest is geometry: where a picture stands fitted on a stage, what a tile crops,
 * how far it may be zoomed and panned, and when a swipe has gone far enough to page or close.
 *
 * The arithmetic is marked `"worklet"`: the phone runs it inside gesture callbacks on the UI
 * thread (§4.2), where a function is callable only when it is a worklet itself. Anywhere else the
 * directive is an unknown one, which JavaScript ignores. **A worklet is declared after everything
 * it calls.** The worklets Babel plugin turns each one into a value made where it is declared,
 * holding what it calls as it stands at that moment, so a helper declared further down is
 * `undefined` on the UI thread — which is how the phone's first drag failed (14 September 2026).
 * `viewer.test.ts` reads this file and holds it to that order.
 */

import type { Attachment } from "./attachments.js";
import { hasThumbnail, inAlbum, kindOf } from "./attachments.js";
import type { Directory } from "./events.js";
import type { RoomFileOf } from "./model/files.js";
import type { Lane, Line, Space } from "./model.js";
import { visibleLines } from "./model.js";

/** One picture or one video in the deck, with what the viewer says about it. */
export interface DeckItem {
  readonly attachment: Attachment;
  /** The message, or the route line, it hangs under: what *Go to message* lands on. */
  readonly lineId: string;
  /** Who, resolved the way the room resolves it: a relayed line is its person's. */
  readonly saidBy: string;
  /** When the line it hangs under was said. */
  readonly ts: string;
  readonly kind: "photo" | "video";
  /**
   * Where it stands among the media of its own message, counted from one as it is said: `1 of
   * 4`, in an album. A message's items stand together in the deck, so these run 1 to `of` in a row.
   */
  readonly inMessage: { readonly index: number; readonly of: number };
}

/**
 * The tapped line, and how many of the room's lines around it make the deck: `DECK_WINDOW`.
 * A viewer that is up holds the lines its deck opened with; to read the room again without the
 * window moving under a finger, it asks for every line (`messages` of at least the room's length)
 * and keeps the items whose lines it holds.
 */
export interface DeckWindow {
  readonly around: string;
  readonly messages: number;
}

/** Twenty messages: the tapped one, ten said before it and nine after — or the room's last twenty. */
export const DECK_WINDOW = 20;

/**
 * The deck a tap opens: the photos and videos of the `window.messages` lines around the tapped
 * one, oldest first, each attachment once.
 *
 * The lines are the ones the room draws, whatever their kind, and a deleted one counts toward
 * the window with nothing to give. The window is ten lines before the tapped one and the rest
 * after, moved as a block at the room's head, and it is the room's last lines whenever the tapped
 * line is among them — so a tap at the foot opens the last twenty, and a room of twenty or more
 * always gives twenty. A line the room does not draw is not a place to stand, and a tap on one
 * opens the room's last lines.
 *
 * A message gives its attachments in the order it listed them; a route row gives the files its
 * lane's answer carried, where the row stands, as said by the specialist who answered. A photo
 * is what the server made a thumbnail of, and a video is one the server measured — the same two
 * tests the room draws a tile by, so every item has a tile to open from and a picture to show
 * while it comes. A video the server never measured has no poster and is a row in the room, as
 * voice notes, files and SVGs are: read and opened there, and not here.
 */
export function deckOf(
  space: Space,
  lanes: readonly Lane[],
  window: DeckWindow,
  directory: Directory,
): readonly DeckItem[] {
  const lines = visibleLines(space, lanes);
  const byLane = new Map(lanes.map((lane) => [lane.laneId, lane]));
  const { start, end } = windowAround(
    lines.findIndex((line) => line.id === window.around),
    lines.length,
    window.messages,
  );
  const seen = new Set<string>();
  const deck: DeckItem[] = [];
  for (const line of lines.slice(start, end)) {
    const lane = line.laneId === undefined ? undefined : byLane.get(line.laneId);
    const media = mediaOf(line, lane).filter((each) => {
      const fresh = !seen.has(each.id);
      seen.add(each.id);
      return fresh;
    });
    const saidBy = speakerOf(line, lane, directory);
    for (const [index, attachment] of media.entries()) {
      deck.push({
        attachment,
        lineId: line.id,
        saidBy,
        ts: line.ts,
        kind: hasThumbnail(attachment.mimeType) ? "photo" : "video",
        inMessage: { index: index + 1, of: media.length },
      });
    }
  }
  return deck;
}

/**
 * The deck of one: a video the server never measured, opened from its row (the media viewer,
 * Phase 2). It has no poster to stand in and no tile to fly back to, so it is in no room's deck;
 * its row's Play opens the viewer on it alone, said by whoever the room says sent its line, and the
 * viewer closes it with the shrink-and-fade. Nothing when the line is not drawn, was taken back, or
 * does not carry that video.
 */
export function deckOfOne(
  space: Space,
  lanes: readonly Lane[],
  at: { readonly lineId: string; readonly attachmentId: string },
  directory: Directory,
): readonly DeckItem[] {
  const line = visibleLines(space, lanes).find((each) => each.id === at.lineId);
  if (line === undefined || line.deleted === true) return [];
  const lane = lanes.find((each) => each.laneId === line.laneId);
  const attachment = carriedBy(line, lane).find((each) => each.id === at.attachmentId);
  if (attachment === undefined || kindOf(attachment.mimeType) !== "video") return [];
  return [
    {
      attachment,
      lineId: line.id,
      saidBy: speakerOf(line, lane, directory),
      ts: line.ts,
      kind: "video",
      inMessage: { index: 1, of: 1 },
    },
  ];
}

/**
 * A room's file's versions that open in the viewer, in the order they were posted (ADR 0100): the
 * deck Files opens a photo or a video on, so a swipe goes from one version to the next. Their lines
 * may be older than any this device holds, so the deck is the server's list and not the room's.
 */
export function deckOfVersions(versions: readonly RoomFileOf[]): readonly DeckItem[] {
  return [...versions]
    .filter((file) => inAlbum(file.attachment))
    .sort((a, b) => a.version - b.version)
    .map((file) => ({
      attachment: file.attachment,
      lineId: file.lineId ?? file.attachment.id,
      saidBy: file.by,
      ts: file.at,
      kind: kindOf(file.attachment.mimeType) === "video" ? "video" : "photo",
      inMessage: { index: 1, of: 1 },
    }));
}

/** Where an attachment stands in the deck, or -1 when it is not in it. */
export function indexOfItem(deck: readonly DeckItem[], attachmentId: string): number {
  return deck.findIndex((item) => item.attachment.id === attachmentId);
}

/** The slice of `count` lines the deck reads, around the line at `at` (-1: none). */
function windowAround(at: number, count: number, messages: number): { start: number; end: number } {
  const size = Number.isNaN(messages) ? 0 : Math.max(0, Math.floor(messages));
  const foot = Math.max(0, count - size);
  const start = at < 0 || at >= foot ? foot : Math.max(0, at - Math.floor(size / 2));
  return { start, end: Math.min(count, start + size) };
}

/** The files a line shows: a route row draws its lane's, and without the lane, the line's own. */
function carriedBy(line: Line, lane: Lane | undefined): readonly Attachment[] {
  return (line.kind === "route" && lane !== undefined ? lane.attachments : line.attachments) ?? [];
}

/** The photos and videos a line gives the deck, before any is dropped as seen already. */
function mediaOf(line: Line, lane: Lane | undefined): readonly Attachment[] {
  if (line.deleted === true) return [];
  return carriedBy(line, lane).filter(inAlbum);
}

/** A file a room's line carries: the file, and the line it hangs under. */
export interface CarriedFile {
  readonly attachment: Attachment;
  readonly lineId: string;
  /** When that line was said. */
  readonly ts: string;
}

/**
 * Every file a room draws, photos and videos and every other kind, each once under the first line
 * that carried it, in the order the room draws them: how the phone's Media on this phone finds the
 * room a kept file came from (ADR 0159). A line taken back keeps its files here, unlike the deck:
 * the phone may still keep them, and they are still the room's.
 */
export function filesOf(space: Space, lanes: readonly Lane[]): readonly CarriedFile[] {
  const byLane = new Map(lanes.map((lane) => [lane.laneId, lane]));
  const seen = new Set<string>();
  const files: CarriedFile[] = [];
  for (const line of visibleLines(space, lanes)) {
    const lane = line.laneId === undefined ? undefined : byLane.get(line.laneId);
    for (const attachment of carriedBy(line, lane)) {
      if (seen.has(attachment.id)) continue;
      seen.add(attachment.id);
      files.push({ attachment, lineId: line.id, ts: line.ts });
    }
  }
  return files;
}

/**
 * What a room's lines carry, newest first: what the room sheet's Media & files card and page show
 * (ADR 0202), the phone's and the desktop's alike.
 */
export function newestFilesOf(space: Space, lanes: readonly Lane[]): readonly CarriedFile[] {
  return [...filesOf(space, lanes)].reverse();
}

/**
 * A room's every photo and video for the viewer, newest first: the deck Media & files opens on,
 * in the order its page lists them, so the next picture is the next square (ADR 0202). The room
 * itself keeps the oldest first, as its lines run.
 */
export function newestDeckOf(
  space: Space,
  lanes: readonly Lane[],
  directory: Directory,
): readonly DeckItem[] {
  const all = deckOf(space, lanes, { around: "", messages: Number.POSITIVE_INFINITY }, directory);
  return [...all].reverse();
}

/**
 * What the Media & files card says of what the room holds (ADR 0202): how many things its lines
 * carry and how many files it has, `12 · 3 files`; `None yet` once the server has said there are
 * no files and the lines carry nothing; nothing at all while the files are still being read.
 */
export function mediaFilesWords(media: number, files: number | undefined): string {
  const filed =
    files === undefined || files === 0 ? undefined : files === 1 ? "1 file" : `${files} files`;
  if (media === 0) return filed ?? (files === undefined ? "" : "None yet");
  return filed === undefined ? String(media) : `${media} · ${filed}`;
}

/**
 * Who a line's media reads as sent by. A route row's files are the specialist's answer; a task
 * card's words are the person's who asked; a relayed line is its person's where the harness that
 * relayed it has an owner, and the harness's where it has none (`saidBy` in the phone's room).
 */
function speakerOf(line: Line, lane: Lane | undefined, directory: Directory): string {
  if (lane !== undefined && line.kind === "route") return lane.specialistId;
  if (lane !== undefined && line.kind === "task") return lane.onBehalfOf;
  if (line.via === undefined) return line.authorId;
  return directory[line.via]?.ownerId ?? line.via;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect extends Size {
  readonly x: number;
  readonly y: number;
}

/** Whether a size has a shape: both sides finite and more than nothing. */
function sized(size: Size): boolean {
  "worklet";
  return (
    Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0
  );
}

/**
 * Where a picture stands fitted on the stage: as large as it goes with all of it showing, kept to
 * its own shape, centred. A picture whose size is not known fills the stage until it is.
 */
export function fitRect(content: Size, stage: Size): Rect {
  "worklet";
  if (!sized(stage)) return { x: 0, y: 0, width: 0, height: 0 };
  if (!sized(content)) return { x: 0, y: 0, width: stage.width, height: stage.height };
  const scale = Math.min(stage.width / content.width, stage.height / content.height);
  // One side meets the stage exactly; the min only keeps a rounding from poking past it.
  const width = Math.min(stage.width, content.width * scale);
  const height = Math.min(stage.height, content.height * scale);
  return { x: (stage.width - width) / 2, y: (stage.height - height) / 2, width, height };
}

/**
 * What a tile crops: the picture as small as it goes while covering the whole frame, kept to its
 * own shape, centred on the frame and in the frame's coordinates. A picture whose size is not
 * known is drawn as the frame.
 */
export function coverRect(content: Size, frame: Rect): Rect {
  "worklet";
  if (!sized(content) || !sized(frame)) {
    return { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
  }
  const scale = Math.max(frame.width / content.width, frame.height / content.height);
  const width = Math.max(frame.width, content.width * scale);
  const height = Math.max(frame.height, content.height * scale);
  return {
    x: frame.x + (frame.width - width) / 2,
    y: frame.y + (frame.height - height) / 2,
    width,
    height,
  };
}

/** From `from` to `to`, `share` of the way; exactly either at its end, whatever the arithmetic. */
function between(from: number, to: number, share: number): number {
  "worklet";
  if (!(share > 0)) return from;
  if (share >= 1) return to;
  return from + (to - from) * share;
}

/**
 * Where the flight from a tile is clipped, `share` of the way up to the stage: the room's own
 * glass at the tile, the whole stage at the stage.
 *
 * A room clips its tiles — a photo at the foot of the lines runs under the composer, and in a
 * wide layout the pane's edge cuts it — and until this, the flight did not: a picture flying home
 * to a tile the composer half covers was drawn over the composer for the last of its flight, and
 * then gone the instant the viewer left (Arjun, 20 September 2026). Clipped to the same glass, it
 * goes under the composer as the tile does, and the last frame of the flight is the tile itself,
 * so there is nothing to see in the handover.
 *
 * A room that cannot say where its lines are does not clip at all, which is what the flight did
 * before, and `share` outside 0..1 — the spring overshoots both ends — clips as if at the end it
 * is past.
 */
export function clipRect(glass: Rect, stage: Size, share: number): Rect {
  "worklet";
  const whole = { x: 0, y: 0, width: stage.width, height: stage.height };
  if (!sized(glass) || !sized(stage)) return whole;
  const at = Number.isNaN(share) ? 1 : Math.min(1, Math.max(0, share));
  return {
    x: between(glass.x, whole.x, at),
    y: between(glass.y, whole.y, at),
    width: between(glass.width, whole.width, at),
    height: between(glass.height, whole.height, at),
  };
}

/** How a view is drawn somewhere other than where it was laid out: as `transformTo` says. */
export interface Drawn {
  /** How far its middle moves. */
  readonly x: number;
  readonly y: number;
  /** How much each of its sides scales, about its middle. */
  readonly sx: number;
  readonly sy: number;
}

/**
 * How a view laid out at `frame` is drawn as `box`, by a transform alone: a translate of its middle
 * to the box's, then a scale of each side, which a transform takes about the view's middle. The
 * phone flies a picture this way from its tile to the stage, where laying the view out again at
 * every frame would commit the whole tree each time (ADR 0061). Either rect of no size draws the
 * view where it is.
 */
export function transformTo(frame: Rect, box: Rect): Drawn {
  "worklet";
  if (!sized(frame) || !sized(box)) return { x: 0, y: 0, sx: 1, sy: 1 };
  return {
    x: box.x + box.width / 2 - (frame.x + frame.width / 2),
    y: box.y + box.height / 2 - (frame.y + frame.height / 2),
    sx: box.width / frame.width,
    sy: box.height / frame.height,
  };
}

/** How far a zoom goes at least: three times, whatever the picture. */
const ZOOM_AT_LEAST = 3;

/**
 * How far a fitted picture may be zoomed: from fitted, to the larger of three times and the scale
 * at which one of its pixels is one of the screen's — so a twelve-megapixel receipt can be read at
 * full resolution on a phone, and a small picture is not blown up past sense.
 */
export function zoomLimits(
  content: Size,
  stage: Size,
  pixelRatio: number,
): { min: 1; max: number } {
  "worklet";
  const fitted = fitRect(content, stage);
  if (!sized(content) || !sized(fitted) || !(pixelRatio > 0) || !Number.isFinite(pixelRatio)) {
    return { min: 1, max: ZOOM_AT_LEAST };
  }
  // At scale 1 an image pixel is `fitted.width / content.width` points, and a device pixel is
  // `1 / pixelRatio` of one.
  return { min: 1, max: Math.max(ZOOM_AT_LEAST, content.width / (fitted.width * pixelRatio)) };
}

/** One axis of `clampPan`: a picture `length` long, centred at `centre` before the move. */
function clampAxis(length: number, centre: number, extent: number, offset: number): number {
  "worklet";
  const middle = extent / 2 - centre;
  if (!(length > extent)) return middle;
  const leading = length / 2 - centre; // its leading edge on the stage's
  const trailing = extent - length / 2 - centre; // its trailing edge on the stage's
  return Math.min(leading, Math.max(trailing, Number.isNaN(offset) ? middle : offset));
}

/**
 * Where a zoomed picture may be moved to. `translate` is in the stage's points, applied after the
 * scale about the picture's own centre — `[{ translateX }, { translateY }, { scale }]` on a view
 * framed at `fitted`. On each axis where the picture is longer than the stage it keeps the stage
 * covered, edge to edge at most; where it is shorter, it stands in the middle.
 */
export function clampPan(scale: number, fitted: Rect, stage: Size, translate: Point): Point {
  "worklet";
  return {
    x: clampAxis(fitted.width * scale, fitted.x + fitted.width / 2, stage.width, translate.x),
    y: clampAxis(fitted.height * scale, fitted.y + fitted.height / 2, stage.height, translate.y),
  };
}

/** The platform's own resistance, so a pull past the deck's end feels like a list's. */
const RUBBER_BAND = 0.55;

/**
 * How far a pull `overshoot` points past an end shows, on something `extent` long: UIKit's curve,
 * as much as the pull at first and never as much as the extent, in the pull's direction.
 */
export function rubberBand(overshoot: number, extent: number): number {
  "worklet";
  if (!(extent > 0) || Number.isNaN(overshoot) || overshoot === 0) return 0;
  const pull = Math.abs(overshoot);
  const shown = (1 - 1 / ((pull * RUBBER_BAND) / extent + 1)) * extent;
  return overshoot < 0 ? -shown : shown;
}

/**
 * `rubberBand` taken back: the pull that shows as `shown`. Something the band is showing can be
 * held again where it is, and not pulled in by the band a second time.
 */
export function rubberBandPull(shown: number, extent: number): number {
  "worklet";
  if (!(extent > 0) || Number.isNaN(shown) || shown === 0) return 0;
  // The band never shows the whole extent; this is as near as it gets in a double.
  const share = Math.min(Math.abs(shown) / extent, 1 - 1e-12);
  const pull = (share / (1 - share)) * (extent / RUBBER_BAND);
  return shown < 0 ? -pull : pull;
}

/** A pinch's fingers, as gesture handler reads them: the scale since it began, their middle, how many. */
export interface Fingers {
  readonly scale: number;
  readonly focal: Point;
  /** None for a trackpad's pinch, which zooms all the same. */
  readonly count: number;
}

/** A picture's zoom over its fitted size and its pan, as `clampPan` takes them. */
export interface Placement {
  readonly zoom: number;
  readonly x: number;
  readonly y: number;
}

/**
 * What a pinch holds the picture by: where it was and where the fingers were when the pinch took
 * hold, or when a finger last came or went. The zoom is the one the fingers asked for, before the
 * band past the limit.
 */
export interface PinchGrip {
  readonly at: Placement;
  readonly fingers: Fingers;
}

/** The zoom shown for one asked for: past `max`, on the rubber band. */
function banded(asked: number, max: number): number {
  "worklet";
  return asked > max ? max + rubberBand(asked - max, max) : asked;
}

/**
 * A grip on the picture where it stands. Taken again whenever a finger comes or goes, because the
 * fingers' middle leaps there: iOS and Android both keep a pinch going until the last finger lifts,
 * and the one left behind is the middle from then on. A grip moves nothing.
 */
export function pinchGrip(at: Placement, fingers: Fingers, max: number): PinchGrip {
  "worklet";
  const asked = at.zoom > max ? max + rubberBandPull(at.zoom - max, max) : at.zoom;
  return { at: { zoom: asked, x: at.x, y: at.y }, fingers };
}

/**
 * Where the fingers put the picture: zoomed by as much as their spread has grown since the grip,
 * past `max` on the rubber band, with the point of the picture that was under them still under
 * them. One finger moves the picture and does not zoom it. `fingers` has as many as the grip; a
 * reading with more or fewer is a new grip (`pinchGrip`), never a move.
 */
export function pinchTo(grip: PinchGrip, fingers: Fingers, fitted: Rect, max: number): Placement {
  "worklet";
  const pinching = fingers.count !== 1 && grip.fingers.scale > 0;
  const asked = pinching ? (grip.at.zoom * fingers.scale) / grip.fingers.scale : grip.at.zoom;
  const zoom = banded(asked, max);
  const grown = zoom / banded(grip.at.zoom, max);
  const centreX = fitted.x + fitted.width / 2;
  const centreY = fitted.y + fitted.height / 2;
  return {
    zoom,
    x: fingers.focal.x - centreX - (grip.fingers.focal.x - centreX - grip.at.x) * grown,
    y: fingers.focal.y - centreY - (grip.fingers.focal.y - centreY - grip.at.y) * grown,
  };
}

/** A page turns at 40 % of the width, or at a flick of 500 points a second. */
const PAGE_DISTANCE = 0.4;
const PAGE_VELOCITY = 500;

/** One page on, one page back, or none: a flick in its own direction, else the distance. */
function pageStep(offset: number, velocity: number, width: number): -1 | 0 | 1 {
  "worklet";
  if (velocity >= PAGE_VELOCITY) return offset < 0 ? 0 : 1;
  if (velocity <= -PAGE_VELOCITY) return offset > 0 ? 0 : -1;
  const past = width > 0 ? PAGE_DISTANCE * width : Number.POSITIVE_INFINITY;
  if (offset >= past) return 1;
  if (offset <= -past) return -1;
  return 0;
}

/**
 * The page a released swipe settles on, one at a time and never past either end. `offset` and
 * `velocity` are toward the next item — newer, forward: a finger moving left in a left-to-right
 * room — so a drag the other way is negative. A flick decides in its own direction, unless it is
 * thrown back against where the page had been carried, which cancels the swipe; short of a flick,
 * the distance decides.
 */
export function snapPage(
  offset: number,
  velocity: number,
  width: number,
  count: number,
  from: number,
): number {
  "worklet";
  const last = Math.max(0, (Math.floor(count) || 0) - 1);
  const here = Math.min(last, Math.max(0, Math.round(from) || 0));
  return Math.min(last, Math.max(0, here + pageStep(offset, velocity, width)));
}

/** Over 300 points the stage clears to 0.3; over 600 the picture shrinks to 0.75. */
const BACKDROP_OVER = 300;
const BACKDROP_TO = 0.3;
const SCALE_OVER = 600;
const SCALE_TO = 0.75;

/** From 1 toward `to`, `share` of the way and no further; exactly `to` at the end of it. */
function fromOne(to: number, share: number): number {
  "worklet";
  const done = Math.min(1, share);
  return 1 - done + to * done;
}

/**
 * How a picture being dragged to dismiss looks `dy` points from home, up or down: the stage
 * clears so the room shows behind before the decision, and the picture shrinks a little.
 */
export function dismissProgress(dy: number): { backdrop: number; scale: number } {
  "worklet";
  const distance = Number.isNaN(dy) ? 0 : Math.abs(dy);
  return {
    backdrop: fromOne(BACKDROP_TO, distance / BACKDROP_OVER),
    scale: fromOne(SCALE_TO, distance / SCALE_OVER),
  };
}

/**
 * The dismiss line: 120 points from home, or a flick of 900 points a second. The distance is
 * exported because the phone clicks as a drag crosses it, and the click and the decision must be
 * the one number.
 */
export const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;

/**
 * Whether a released dismiss drag closes the viewer: at or past 120 points from home, or at a
 * flick of 900 points a second, either way up — the same `>=` the selection click fires on, so
 * the click says *let go now* exactly where letting go closes. A flick thrown back toward home
 * keeps it, however far the drag had gone: the thumb changed its mind.
 */
export function dismissDecision(dy: number, vy: number): "close" | "stay" {
  "worklet";
  const flung = Math.abs(vy) >= DISMISS_VELOCITY;
  if (flung && dy !== 0 && Math.sign(vy) !== Math.sign(dy)) return "stay";
  return flung || Math.abs(dy) >= DISMISS_DISTANCE ? "close" : "stay";
}

/** A spring as `Animated.spring` and Reanimated take one: the app's is `IOS_SPRING`. */
export interface Spring {
  readonly stiffness: number;
  readonly damping: number;
  readonly mass: number;
}

/**
 * A spring is at rest once what is left of its travel stays under this share of it: a fifth of a
 * percent, under a point of a 400-point flight. It was a twentieth of a percent, and the app's
 * spring took 525 ms to reach that — some 200 ms after the eye had seen it land — so a picture
 * flown home stood on its tile for that long before the room was handed back (23 September 2026).
 */
export const SPRING_REST = 0.002;

/**
 * How near critical a spring's damping is taken as critical. The forms under and over critical
 * divide by a number that goes to nothing there, so within this the critical form stands for both
 * sides; it is a step from them, small as the band is narrow. A thousandth was off by a quarter of
 * a point at its edges for a spring let go at speed, which is where a test of it went red now and
 * then (2 October 2026); a millionth is under what a test can tell, and the numbers divided by
 * stay over a thousandth of the spring's rate.
 */
const CRITICAL_BAND = 1e-6;

/**
 * How far a spring let go from rest has come after `elapsed` milliseconds: `share` of its travel,
 * and whether it has `settled`, when what is left stays under a fifth of a percent of the travel
 * (`SPRING_REST`) — under a point of a 400-point flight.
 *
 * The closed form of the spring from rest, with no step to integrate, so any moment of it can be
 * asked for: the phone's flight asks for moments on a clock of its own (`Stage.tsx`), which a
 * frame the phone could not draw does not move on. The three dampings each have theirs: under
 * critical it overshoots a little and comes back (the app's own spring, by a fifth of a percent),
 * at critical and over it creeps in from one side.
 */
export function springShare(
  spring: Spring,
  elapsed: number,
): { readonly share: number; readonly settled: boolean } {
  "worklet";
  const t = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0) / 1000;
  const natural = Math.sqrt(spring.stiffness / spring.mass);
  const ratio = spring.damping / (2 * Math.sqrt(spring.stiffness * spring.mass));
  let left: number;
  let bound: number;
  if (Math.abs(ratio - 1) < CRITICAL_BAND) {
    left = Math.exp(-natural * t) * (1 + natural * t);
    bound = left;
  } else if (ratio < 1) {
    const decay = ratio * natural;
    const ringing = natural * Math.sqrt(1 - ratio * ratio);
    const envelope = Math.exp(-decay * t);
    left = envelope * (Math.cos(ringing * t) + (decay / ringing) * Math.sin(ringing * t));
    bound = envelope * Math.sqrt(1 + (decay / ringing) ** 2);
  } else {
    const root = Math.sqrt(ratio * ratio - 1);
    const fast = -natural * (ratio + root);
    const slow = -natural * (ratio - root);
    left = (fast * Math.exp(slow * t) - slow * Math.exp(fast * t)) / (fast - slow);
    bound = left;
  }
  const settled = bound < SPRING_REST;
  return { share: settled ? 1 : 1 - left, settled };
}

/**
 * A spring let go from rest as a curve a browser can run: its share of the travel every `stepMs`
 * until it has settled, and how long that took. A web page hands the shares to CSS's `linear()`
 * easing over `ms`, so what it moves lands as the phone's does on the same spring (Search's rows,
 * ADR 0189). The last share is 1.
 */
export function springCurve(
  spring: Spring,
  stepMs: number = 1000 / 60,
): { readonly ms: number; readonly shares: readonly number[] } {
  const shares = [0];
  let elapsed = 0;
  for (;;) {
    elapsed += stepMs;
    const { share, settled } = springShare(spring, elapsed);
    shares.push(settled ? 1 : share);
    // A spring that never settles is cut off at five seconds, which no motion here comes near.
    if (settled || elapsed >= 5000) return { ms: elapsed, shares };
  }
}

/**
 * A spring's offset from rest is at rest once whatever it has left to swing through stays under
 * this many points: a fifth of a point, under a pixel on a phone's glass.
 */
const SPRING_REST_POINTS = 0.2;

/**
 * Where a spring is `elapsed` milliseconds after it was let go `offset` points from its rest,
 * moving at `velocity` points a second: its offset and velocity then, and whether it has
 * `settled` — when all it has left to swing through is under a fifth of a point.
 *
 * `springShare` is this from rest, as a share of the travel. A spring let go with the velocity
 * it already had is what a move retargeted while it is going needs: the room's rows keep their
 * speed when a second line lands under the first, and so they stay together (`RoomMotion.tsx`).
 * The motion is linear, so a move retargeted this way is the old move and the new one added up,
 * and two things moved by the same changes are in the same place relative to each other however
 * the changes overlap.
 */
export function springAt(
  spring: Spring,
  offset: number,
  velocity: number,
  elapsed: number,
): { readonly offset: number; readonly velocity: number; readonly settled: boolean } {
  "worklet";
  const t = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0) / 1000;
  const x0 = Number.isFinite(offset) ? offset : 0;
  const v0 = Number.isFinite(velocity) ? velocity : 0;
  const natural = Math.sqrt(spring.stiffness / spring.mass);
  const ratio = spring.damping / (2 * Math.sqrt(spring.stiffness * spring.mass));
  let x: number;
  let v: number;
  let left: number;
  if (Math.abs(ratio - 1) < CRITICAL_BAND) {
    const envelope = Math.exp(-natural * t);
    const rate = v0 + natural * x0;
    x = envelope * (x0 + rate * t);
    v = envelope * (v0 - natural * rate * t);
    left = Math.abs(x) + Math.abs(v) / natural;
  } else if (ratio < 1) {
    const decay = ratio * natural;
    const ringing = natural * Math.sqrt(1 - ratio * ratio);
    const envelope = Math.exp(-decay * t);
    const sine = (v0 + decay * x0) / ringing;
    const c = Math.cos(ringing * t);
    const s = Math.sin(ringing * t);
    x = envelope * (x0 * c + sine * s);
    v = envelope * ((ringing * sine - decay * x0) * c - (decay * sine + ringing * x0) * s);
    left = Math.sqrt(x * x + ((v + decay * x) / ringing) ** 2);
  } else {
    const root = Math.sqrt(ratio * ratio - 1);
    const slow = -natural * (ratio - root);
    const fast = -natural * (ratio + root);
    const a = (v0 - fast * x0) / (slow - fast);
    const b = x0 - a;
    x = a * Math.exp(slow * t) + b * Math.exp(fast * t);
    v = a * slow * Math.exp(slow * t) + b * fast * Math.exp(fast * t);
    left = Math.abs(x) + Math.abs(v) / natural;
  }
  const settled = left < SPRING_REST_POINTS;
  return settled ? { offset: 0, velocity: 0, settled } : { offset: x, velocity: v, settled };
}

/**
 * How fast a slide let go slows: UIKit's normal rate (`UIScrollView.DecelerationRate.normal`), a
 * velocity times 0.998 every millisecond, so a flick comes to rest half its speed in points further on.
 */
const DECELERATION = -1000 * Math.log(0.998);

/** The slide alone, `elapsed` milliseconds on: how far it has come and how fast it still goes. */
function slideAt(velocity: number, elapsed: number): { travel: number; velocity: number } {
  "worklet";
  const left = Math.exp((-DECELERATION * elapsed) / 1000);
  return { travel: (velocity / DECELERATION) * (1 - left), velocity: velocity * left };
}

/** How long a slide takes to come `distance` points: where its speed has fallen by that times the rate. */
function reachOf(distance: number, velocity: number): number {
  "worklet";
  return (-1000 * Math.log(1 - (distance * DECELERATION) / velocity)) / DECELERATION;
}

/**
 * Where something let go at `from`, moving at `velocity` points a second, is `elapsed` milliseconds
 * later, when it may stand anywhere from `low` to `high`: a zoomed picture flicked about.
 *
 * Inside, it slides and slows as a scroll view does. If the slide would carry it past an edge, it
 * reaches the edge still moving, and `spring` takes that speed out past the edge and brings it back
 * to stand on it. Let go already past an edge, the spring brings it back from there. It is one
 * curve, so nothing jumps where the slide meets the spring.
 *
 * It replaced Reanimated's `withDecay` and its rubber band (7 October 2026), which pulled back from
 * past an edge by taking a share of the distance off the velocity every frame, so its spring was
 * stiffer at 120 Hz than at 60 and barely damped, and it ended the moment the picture came back
 * inside, snapping it to the edge at whatever speed it had: "it bounces oddly at the edges".
 */
export function glideAt(
  spring: Spring,
  from: number,
  velocity: number,
  low: number,
  high: number,
  elapsed: number,
): { readonly at: number; readonly velocity: number; readonly settled: boolean } {
  "worklet";
  const t = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
  const x0 = Number.isFinite(from) ? from : low;
  const v0 = Number.isFinite(velocity) ? velocity : 0;
  if (x0 < low || x0 > high) {
    const edge = x0 < low ? low : high;
    const back = springAt(spring, x0 - edge, v0, t);
    return { at: edge + back.offset, velocity: back.velocity, settled: back.settled };
  }
  // Where the slide would stop, and the edge it would cross on the way; the rest itself if none.
  const rest = x0 + v0 / DECELERATION;
  const stop = Math.min(high, Math.max(low, rest));
  const reach = stop === rest ? Number.POSITIVE_INFINITY : reachOf(stop - x0, v0);
  if (t >= reach) {
    const past = springAt(spring, 0, v0 - (stop - x0) * DECELERATION, t - reach);
    return { at: stop + past.offset, velocity: past.velocity, settled: past.settled };
  }
  const slide = slideAt(v0, t);
  if (Math.abs(slide.velocity) / DECELERATION < SPRING_REST_POINTS) {
    return { at: stop, velocity: 0, settled: true };
  }
  return { at: x0 + slide.travel, velocity: slide.velocity, settled: false };
}
