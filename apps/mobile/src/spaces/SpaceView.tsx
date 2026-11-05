/**
 * One space: the header, the lines, and the composer.
 *
 * The list is a `FlatList`, inverted. Inverted because a chat is read from the bottom and a
 * phone's keyboard comes up from it, and a `FlatList` rather than a `ScrollView` because a space
 * with ten thousand lines in it is the normal case after a week — the platform's windowing is
 * the difference between opening a space and waiting for one.
 *
 * Reading marks the space read to its last line, exactly as the web does when its tab is
 * visible: being here is what read means.
 *
 * A link or a push lands here on the message it is about — `at`, the same word in the link —
 * and the message flashes once so the eye finds it; the asks the space is holding sit at the
 * foot of the room, as cards to decide on (Arjun, 9 September 2026: one tap to the message, not
 * a screen about the card first). The same cards stood in For you until it was withdrawn
 * (ADR 0065); the room is where an ask is answered now. A room opened on a message is opened
 * there, placed before it is seen, and a search's words are marked in it for a moment (ADR 0133,
 * `useLanding`).
 *
 * The room moves the way a room should (Arjun, 11 September 2026: the layout and the animations
 * need to be fluid). Whatever changes at its foot is laid out once, and every row and bubble it
 * moved is taken from where it was to where it is on one spring, on the UI thread
 * (`RoomMotion.tsx`, ADR 0074): a line that lands rises in from below with the rows above it; what
 * each harness is doing while it works is a bubble at the foot, which comes a beat after its run
 * begins, stays put while replies land over it and goes when the run ends (`Thinking.tsx`); a
 * bubble that gives its time up closes over it. The list keeps its place only under a reader who
 * has scrolled up while lines land below — `maintainVisibleContentPosition`, the platform's own
 * way of doing what every chat does (`ColourList`).
 *
 * It reads the way a phone's room reads (ADR 0050): one author's bubbles said close together
 * close up into a turn, two points apart, with the time on the last of them; a turn stands off
 * the one before it; and a separator says the day and the hour over the first line and after
 * any silence of a quarter of an hour (`groupLines`, in `spaces.ts`).
 *
 * In a room with more than one harness it says who each message was for (ADR 0081): a person's
 * message wears the lane's route over it where their address changed (`routesIn`, A2), and a run
 * of harnesses talking to each other folds into one row, open on a tap, with the guard's line under
 * it where Chips stopped them (`Fold`).
 *
 * A message you send takes the room to the foot (Arjun, 12 September 2026). The list holds its
 * place for a reader who has scrolled up while lines land below, which is right for somebody
 * else's line and wrong for your own: a message sent from half way up the history landed out of
 * sight, and the only sign of it was the field clearing. So the send scrolls, and only the send —
 * the rule is that the room follows you where you put something, and follows nobody else.
 *
 * Except with the answer to it, which the room follows too (Arjun, 5 October 2026: "it does not
 * scroll to the latest message"). Waiting for a reply, the hand drags the room down to put the
 * keyboard away, and a drag down an inverted list is a scroll up its history — the length of the
 * drag, a few hundred points, which is past where the room starts holding a reader's place. The
 * reply then landed out of sight below, with the reply before yours on the glass and nothing to
 * say it had come (the simulator, a copy of his room). What you were waiting for is not somebody
 * else's line: the first line said after yours takes the room to it, from wherever it is.
 *
 * And a reply taller than the glass is read from its start (Arjun, 6 October 2026: "show the
 * start of long replies"): it rises in only until its first line is under the bar, and the answer
 * gone to from up the history is gone to there (ADR 0130, `RoomMotion.tsx`).
 *
 * It waits for the line rather than going as the button is pressed (`useFollowOwn`). Sending only
 * asks; the room is taken to the foot as the line is drawn, because holding the place is exactly
 * what the room does up the history to a list a line has just been put on top of (`keep`, in
 * `RoomMotion.tsx`) — a room told to go first arrives at what *was* the foot, and is then held there
 * while the message lands under it, off the bottom of the screen (the simulator, 12 September
 * 2026, which is how this was written the first time).
 *
 * And the words you sent fly to their bubble from the field (Arjun, 24 September 2026, the send
 * animation's A): a copy of their bubble leaves the field from where they were typed and goes for
 * where the bubble will stand as the room rises to it on the same spring, and the bubble is kept
 * out of sight until the copy is on it (`SendFlight.tsx`, `sendLanding.ts`).
 *
 * The composer rides the keyboard rather than being told about it. React Native's own
 * `KeyboardAvoidingView` is driven by the show and hide events, which arrive with the keyboard
 * already part-way up and carry a duration a JS animation then tries to match, so the field lands
 * late and in two moves — the jump (Arjun, 11 September 2026). The room's frame instead pads its
 * own foot by the keyboard's measured frame, read on the UI thread frame by frame
 * (`KeyboardRoom.tsx`), so the field is wherever the keys are, including part-way through a drag.
 * The list dismisses interactively for the same reason: swiping down the room takes the keyboard
 * with the finger and gives it back if the finger goes up again. A tap puts it away outright
 * (Arjun, 20 September 2026) — on a message, on the space between two of them, on the empty room
 * — and a tap something in the room wanted is still that thing's (`TapAway`).
 *
 * A photo opens the media viewer over the room (`media/`, ADR 0057), and the room is its host: it
 * mounts the provider once, and answers the viewer twice. When the viewer pages onto an item whose
 * tile is not on the glass, the room scrolls to its line without animation, under the opaque stage,
 * so a dismiss has a tile to fly back to — the move iOS Photos makes under its own viewer. And after
 * *Go to message*, the room lands on the line and flashes it, as a link to it does.
 *
 * Over four hundred lines because the room is one thing — the list, its foot, its landing, its
 * keyboard, its composer — and the hooks above the component are its own, named so the component
 * reads as a page; a file per hook would be five files to open to understand one screen. What
 * has a life of its own is elsewhere: the bubble (`Thinking.tsx`), the motion (`RoomMotion.tsx`).
 */

import type {
  Directory,
  Doing,
  ExchangeLine,
  Lane,
  Line as LineModel,
  NeedsYouItem,
  ReplyCard as ReplyCardModel,
  Run,
  Snapshot,
  Space,
  Store,
  TakenOut,
  UnsentNote,
} from "@chipschat/core";
import {
  betweenHarnesses,
  changeOf,
  deleteForEveryoneAsking,
  exchangeLine,
  filesChangedWords,
  harnessesIn,
  isAgent,
  lanesInSpace,
  mayAnswer,
  mayDelete,
  mayPin,
  mayReply,
  myRole,
  nameOf,
  namesAuthors,
  pinnedLines,
  plainWords,
  readMark,
  repliesTo,
  replyCard,
  replyLane,
  roomLeadOf,
  routesIn,
  routeWords,
  searchTerms,
  spaceDoing,
  standingIn,
  visibleLines,
} from "@chipschat/core";
import type { ExchangeLimits } from "@chipschat/protocol";
import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Keyboard,
  type LayoutChangeEvent,
  PixelRatio,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { thisDevice } from "../device/word";
import { MediaProvider } from "../media/MediaViewer";
import type { Chosen } from "../needs/Ask";
import { NeedsCard } from "../needs/NeedsCard";
import { useChips } from "../store/provider";
import { useDuo } from "../ui/duo";
import { Aside, alpha, EdgeBand, GLASS } from "../ui/Glass";
import { useLayout } from "../ui/layout";
import { Empty, useRoomColumn } from "../ui/Screen";
import { useSplitSide } from "../ui/Split";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { useHandler } from "../ui/useHandler";
import { useNow } from "../ui/useNow";
import { approvalFor, questionFor } from "../words";
import { BackPill } from "./BackPill";
import { Composer, quietFoot, startReply } from "./Composer";
import { DustLayer, useDust } from "./Dust";
import type { Given } from "./Feedback";
import { ForkLine, NewAgentLine } from "./ForkLine";
import type { FileService } from "./files";
import { useHeldReplies } from "./heldReplies";
import { KeyboardRoom } from "./KeyboardRoom";
import { Arrow, Faces, stepOf } from "./LaneChain";
import { RoomSeen } from "./LiftedMotion";
import { type Deleting, Line, stampWords } from "./Line";
import type { LineChange } from "./LinePages";
import { Flash } from "./Motion";
import { TakenOutNotice } from "./NoRooms";
import { PausedBanner } from "./PausedBanner";
import { ReplySwipe } from "./ReplySwipe";
import { type Arrival, homeward, Moving, madeHere, NEAR } from "./RoomMotion";
import { RoomNotice } from "./RoomNotice";
import { type ProjectActions, projectActions } from "./RoomProject";
import type { RouteDrawn } from "./RouteSheet";
import { returning } from "./returning";
import { ColourList, type Field, useColourField } from "./ScrollColours";
import { FlightLayer } from "./SendFlight";
import { sameLanes } from "./sameLanes";
import {
  heldBack,
  type Landing,
  type Launch,
  SendLandingContext,
  useSendFlight,
  useSendFoot,
} from "./sendLanding";
import {
  type Drawn,
  type FoldRow,
  type FootRow,
  foldRuns,
  groupLines,
  isFold,
  isFoot,
  laneLive,
  openAsks,
  parseTarget,
  type Row,
  saidBy,
  type Target,
  targetIndex,
} from "./spaces";
import { NOBODY, ThinkingBubble, useInTouch, useThinking } from "./Thinking";
import { type Undoing, UndoPill } from "./UndoPill";
import { Unstarted } from "./Unstarted";
import { WaitsProvider } from "./Waits";
import { separatorLabel } from "./when";

/**
 * A reader who has scrolled up to read is not moved by a line landing below; one at the end
 * follows it as the end moves, on the list's own ease. Index 0 is the newest row, at the foot,
 * the list being inverted. For a room that does not move on its own transition: Reduce Motion,
 * the web. One that does keeps a reader's place its own way (`ColourList`).
 */
const KEEP_PLACE = { minIndexForVisible: 0, autoscrollToTopThreshold: NEAR } as const;
/** How far a turn stands off the one before it, and a bubble under the last of its own turn. */
const TURN_GAP = SPACE.lg;
const GROUPED_GAP = 2;

/** A line by the send it was, so that a line of yours, confirmed, is not a second landing. */
function keyOfLine(line: LineModel): string {
  return line.key ?? line.id;
}

/**
 * A row by the send it was: the list's key, one function for the life of the app. By id, a line
 * of yours was a new row the moment the server confirmed it — `pending:<key>` became the event's
 * id — and a line still rising into its place jumped the rest of the way when the round trip
 * came back inside the rise (23 September 2026). With the author, because the server holds a key
 * unique per author, not per room.
 */
function keyOfRow(row: Row): string {
  if (isFoot(row)) return "foot";
  if (isFold(row)) return `fold:${row.lines[0]?.id ?? ""}`;
  const { line } = row;
  return line.key === undefined ? line.id : `${line.authorId}:${line.key}`;
}

/**
 * The routes the room draws over its people's messages (ADR 0081, A2), by line id, each the same
 * object for as long as it says the same thing: the rows are memoised on their props, and a fresh
 * route would draw every routed row again on every event in the room. Each with its words and
 * the room's lead, for the sheet a tap on it opens (ADR 0113).
 */
function useRoutes(space: Space | undefined, directory: Directory) {
  const kept = useRef(new Map<string, RouteDrawn>());
  return useMemo(() => {
    const routes = new Map<string, RouteDrawn>();
    if (space === undefined) return routes;
    const lead = space.home === true ? undefined : roomLeadOf(space);
    for (const [id, trail] of routesIn(space, directory)) {
      const route: RouteDrawn = {
        ...trail,
        words: routeWords(trail, space, directory),
        ...(lead === undefined ? {} : { lead }),
      };
      const said = `${route.from}>${route.to.join(",")}>${route.words}>${route.lead ?? ""}`;
      const same = kept.current.get(said) ?? route;
      kept.current.set(said, same);
      routes.set(id, same);
    }
    return routes;
  }, [space, directory]);
}

/** Whether a line is harnesses talking to each other, which the room folds (ADR 0081). */
function useBetween(directory: Directory) {
  return useCallback(
    (line: LineModel) => betweenHarnesses(line, (id) => isAgent(directory, id)),
    [directory],
  );
}

/**
 * The space, and what the room draws of it: its lanes, its lines newest first — grouped into
 * turns, with the separators — its runs by id, and its asks.
 *
 * The lanes keep their identity while they say the same thing. The model hands out fresh lane
 * objects on every event anywhere in the workspace, and the rows are memoised on their props,
 * so a fresh array here would redraw the whole room for a message in another one (`sameLanes`,
 * 17 September 2026).
 */
function useRoom(snapshot: Snapshot, spaceId: string) {
  const space = snapshot.model.spaces.find((each) => each.id === spaceId);
  const { directory } = snapshot;
  const read = space === undefined ? [] : lanesInSpace(snapshot.model, space.id);
  const held = useRef(read);
  if (held.current !== read && !sameLanes(held.current, read)) held.current = read;
  const lanes = held.current;
  const routes = useRoutes(space, directory);
  const between = useBetween(directory);
  // Inverted, so the newest is at the bottom of the screen and the top of the array. A routed line
  // starts a turn, and so does either side of harnesses talking, which folds into its own row.
  const kept = useRef(new Map<string, Drawn>());
  const drawn = useMemo(() => {
    if (space === undefined) return [];
    const grouped = groupLines(
      visibleLines(space, lanes),
      (line) => saidBy(line, directory).id,
      (line, before) => routes.has(line.id) || between(line) || between(before),
    );
    // Each row the same object while it says the same thing, so the list draws again only the rows
    // that changed (`useRoomView`).
    const rows = new Map<string, Drawn>();
    const same = grouped.map((each) => {
      const was = kept.current.get(each.line.id);
      const row =
        was !== undefined &&
        was.line === each.line &&
        was.place === each.place &&
        was.separator === each.separator
          ? was
          : each;
      rows.set(each.line.id, row);
      return row;
    });
    kept.current = rows;
    return same.reverse();
  }, [space, lanes, directory, routes, between]);
  const lines = useMemo(() => drawn.map((each) => each.line), [drawn]);
  const asks = useMemo(() => (space === undefined ? [] : openAsks(space)), [space]);
  // A room with a harness in it has a run per message; a row finds the one it closed by id
  // rather than walking them all, once per row per render.
  const runs = useMemo(
    () => new Map((space?.runs ?? []).map((run) => [run.runId, run] as const)),
    [space],
  );
  // Being here is what read means: the mark goes to the last line drawn, or past a run that
  // has ended — `readMark`, in core, says how far and why.
  const mark = space === undefined ? 0 : readMark(space);
  return { space, lanes, drawn, lines, asks, runs, mark, routes, between };
}

/**
 * The rows of the room's list from what it draws: each run of harnesses talking to each other one
 * folded row, with the referee's line under it once the talk is worth one (ADR 0097).
 */
function useFolded(
  drawn: readonly Drawn[],
  space: Space | undefined,
  directory: Directory,
  between: (line: LineModel) => boolean,
  limits: ExchangeLimits,
): readonly (Drawn | FoldRow)[] {
  return useMemo(() => {
    const guardOf = (line: LineModel) => {
      const at = space?.lines.findIndex((each) => each.id === line.id) ?? -1;
      return space === undefined || at < 0 ? undefined : exchangeLine(space, at, directory, limits);
    };
    return foldRuns(drawn, between, guardOf);
  }, [drawn, space, directory, between, limits]);
}

/** Which row of the list a line is drawn in: its own, or the fold it is in. */
function rowOfLine(rows: readonly Row[], lineId: string): number {
  return rows.findIndex((row) =>
    isFoot(row)
      ? false
      : isFold(row)
        ? row.lines.some((line) => line.id === lineId)
        : row.line.id === lineId,
  );
}

/**
 * The lines that were in the room when it opened, by the send they were, so that they are
 * drawn as they are and only a line that lands afterwards arrives (`Motion.tsx`).
 */
function useKnown(lines: readonly LineModel[]): Set<string> {
  const known = useRef<Set<string> | undefined>(undefined);
  if (known.current === undefined) known.current = new Set(lines.map(keyOfLine));
  return known.current;
}

/**
 * Whether this room is already drawing a lane it handed on as going: a route row with the dots
 * breathing in it (`LaneChain.tsx`). While one is, the thinking bubbles at the foot stand down —
 * the lead's run and the lane it routed are the same waiting, and the room said it twice (Arjun,
 * 12 September 2026). Every harness's bubble does, not only the lead's: the rule was made for a
 * room with one harness in it, and is kept as it was. The specialist's own room is untouched: what
 * it draws is a caption over a past exchange, not a line at the foot, and the bubble there is the
 * only sign of work.
 *
 * The lanes come first and there are a handful; the lines are only walked when one is going.
 */
function routing(lines: readonly LineModel[], lanes: readonly Lane[]): boolean {
  const going = new Set(
    lanes.filter((lane) => laneLive(lane) === "working").map((lane) => lane.laneId),
  );
  if (going.size === 0) return false;
  return lines.some((line) => line.kind === "route" && going.has(line.laneId ?? ""));
}

/** The run a summary or a status line closes, and the lane a route or task card draws. */
function behind(
  runs: ReadonlyMap<string, Run>,
  lanes: readonly Lane[],
  line: LineModel,
): { readonly run: Run | undefined; readonly lane: Lane | undefined } {
  const drawnLane =
    line.laneId === undefined ? undefined : lanes.find((lane) => lane.laneId === line.laneId);
  return {
    run: line.runId === undefined ? undefined : runs.get(line.runId),
    lane: drawnLane ?? replyLane(line, lanes),
  };
}

/**
 * How long a room opened on a line may stay unseen while it places it. Past this it is shown
 * wherever its list is, and the line is gone to from there, as a room already open goes to one.
 */
export const PLACING_MS = 1500;
/** The rows a room draws at once from its foot: a screenful, and some. */
const FIRST_ROWS = 12;
/** And past a line far up it is placing, so the glass above the line is drawn when it is shown. */
const REACH_PAST = 8;
/**
 * How many frames a line placed unseen is placed again once the list has it, while the rows round
 * it are drawn and measured: the rows between it and the foot are an estimate until they are.
 */
const SETTLE_FRAMES = 3;
/**
 * How long the words a search looked for stay marked in the line it opened, from when the room is
 * shown: past the flash's fade (`Flash`), and then gone at once, since a nested `Text` cannot fade
 * on the native driver (ADR 0133).
 */
export const MARKS_MS = 2500;

/** What the list says when it is asked for a row it has not laid out yet. */
interface Missed {
  readonly index: number;
  readonly averageItemLength: number;
}

/** The room's one way of taking its list to a row (`useRowScroll`). */
interface RowScroll {
  /** Centres the row, on a glide or at once. */
  readonly go: (index: number, going: Going) => void;
  /** The list's `onScrollToIndexFailed`. */
  readonly failed: (missed: Missed) => void;
}

/** How a row is gone to. */
interface Going {
  readonly animated: boolean;
  /** For a row placed unseen: told once it is there and the rows round it have settled. */
  readonly placed?: (() => void) | undefined;
}

/**
 * How the room takes its list to a row, centred on the glass: the landing's way and the media
 * viewer's. A row far up a long room is not laid out yet, and the list says so as it is asked
 * (`failed`): it is sent roughly there at once, by the rows' average height, and asked again each
 * frame until it has measured the row. A row placed unseen for somebody waiting on it (`placed`)
 * is not sent anywhere roughly — the room is drawing every row up to it (`useLanding`) — and once
 * the list has it, it is placed again for a few frames more, while the rows round it are drawn and
 * measured, and then they are told. All of it from an effect or a frame callback, never inside a
 * mount (ADR 0130).
 */
function useRowScroll(list: Field["list"]): RowScroll {
  const missed = useRef<Missed | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  const stop = useCallback(() => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
  }, []);
  useEffect(() => stop, [stop]);
  return useMemo(
    () => ({
      failed: (info: Missed) => {
        missed.current = info;
      },
      go: (index: number, { animated, placed }: Going) => {
        stop();
        const until = Date.now() + PLACING_MS;
        // Asks in a row that found it there: one is enough for a scroll somebody watches, and a
        // placing waits for the rows round it to settle.
        let found = 0;
        const enough = placed === undefined ? 1 : SETTLE_FRAMES + 1;
        const roughly = placed === undefined;
        const attempt = () => {
          frame.current = undefined;
          found = askFor(list, missed, index, animated, roughly) ? found + 1 : 0;
          if (found >= enough || Date.now() > until) return placed?.();
          frame.current = requestAnimationFrame(attempt);
        };
        attempt();
      },
    }),
    [list, stop],
  );
}

/**
 * One ask of the list for a row, centred: whether it had it. One it had not laid out it said so
 * of as it was asked (`missed`), and the list is sent `roughly` there, to lay it out.
 */
function askFor(
  list: Field["list"],
  missed: RefObject<Missed | undefined>,
  index: number,
  animated: boolean,
  roughly: boolean,
): boolean {
  missed.current = undefined;
  list.current?.scrollToIndex({ index, viewPosition: 0.5, animated });
  const said = missed.current as Missed | undefined;
  if (said === undefined) return true;
  const offset = said.averageItemLength * index;
  if (roughly && offset > 0) list.current?.scrollToOffset({ offset, animated: false });
  return false;
}

/** What a landing marks in the line it lands on: the words a search looked for (ADR 0133). */
interface Marking {
  readonly id: string;
  readonly terms: readonly string[];
}

/** The line a link names, and the row it is drawn in, when this room has it. */
function lineOf(
  target: Target,
  lines: readonly LineModel[],
  rows: readonly Row[],
): { readonly id: string; readonly row: number } | undefined {
  const id = lines[targetIndex(lines, target)]?.id;
  const row = id === undefined ? -1 : rowOfLine(rows, id);
  return id === undefined || row < 0 ? undefined : { id, row };
}

/** Whether a link names a line this room already has, which it is then opened at. */
function opensOnLine(at: string | undefined, lines: readonly LineModel[], rows: readonly Row[]) {
  const target = parseTarget(at);
  return (
    target !== undefined && target.kind !== "asks" && lineOf(target, lines, rows) !== undefined
  );
}

/**
 * Land once per link, and say which line to flash, and what to mark in it. A line the replay has
 * not brought yet is tried again as the lines change, which is what a phone opening a push before
 * its cache has caught up looks like.
 *
 * A room opened on a line it has is opened there (ADR 0133): it went up to it from the foot, in
 * view, as the screen came in — a few hundred points for a line near the foot, and seconds through
 * the history for one far up, with the flash spent before the line arrived (the simulator, 7
 * October 2026). Now its list is held unseen until the room is built — its foot measured, so
 * nothing it corrects moves the line after — and the line is placed at once (`useRowScroll`), and
 * then the list fades up with the line in the middle of the glass, flashed. A link followed in a
 * room already open goes there in view, as before.
 *
 * A list with no `getItemLayout` ends its content at the last row it has measured, and draws a few
 * rows past it at a time, each guessed at the height of the ones it has: the room went up to a line
 * a hundred and seventy rows up five or so rows a step, at a guess of 1,374 points a row from the
 * long replies at its foot (the simulator, 7 October 2026). So while it places a line it draws
 * every row to it at once (`reach`, the list's rows kept from its foot), unseen, and lets the rows
 * between go again once the marks have. Past its first rows it does so once the room has begun to
 * come into view (`inView`), since drawing them takes JavaScript a third of a second and the bar
 * needs a moment of it first.
 *
 * With the words searched for (`words`, from a message a search found), the line marks them for
 * `MARKS_MS` from when it is shown. A step's run lands on the line that closed it, which is not
 * where the words were, so only a line is marked.
 */
function useLanding({
  at,
  words,
  lines,
  rows,
  list,
  built,
  inView,
  scroll,
}: {
  readonly at: string | undefined;
  readonly words: string | undefined;
  readonly lines: readonly LineModel[];
  readonly rows: readonly Row[];
  readonly list: Field["list"];
  /** The room built: its foot measured. */
  readonly built: boolean;
  /** And begun to come into view, which the rows to a line far up wait for (`SpaceView`'s `inView`). */
  readonly inView: boolean;
  readonly scroll: RowScroll;
}) {
  const landed = useRef<string | undefined>(undefined);
  const [flash, setFlash] = useState<string | undefined>(undefined);
  const [marking, setMarking] = useState<Marking | undefined>(undefined);
  const [placing, setPlacing] = useState(() => opensOnLine(at, lines, rows));
  // How many rows the list keeps drawn from its foot: every one to a line far up while it is placed.
  const [reach, setReach] = useState(FIRST_ROWS);
  const show = useCallback(() => setPlacing(false), []);
  useEffect(() => {
    if (!placing) return;
    const timer = setTimeout(show, PLACING_MS);
    return () => clearTimeout(timer);
  }, [placing, show]);
  useEffect(() => {
    if (placing || reach === FIRST_ROWS) return;
    const timer = setTimeout(() => setReach(FIRST_ROWS), MARKS_MS);
    return () => clearTimeout(timer);
  }, [placing, reach]);
  // A room placing a line waits to be built, and for a line past its first rows, to be in view.
  const ready = useCallback(
    (row: number) => !placing || (built && (inView || row < FIRST_ROWS)),
    [placing, built, inView],
  );
  // Unseen, it is placed and then shown, lit; in view, it is lit and gone to.
  const landOn = useCallback(
    (id: string, row: number, terms: readonly string[]) => {
      const lit = () => {
        setFlash(id);
        setMarking(terms.length === 0 ? undefined : { id, terms });
      };
      if (!placing) {
        lit();
        scroll.go(row, { animated: true });
        return;
      }
      setReach((now) => Math.max(now, row + 1 + REACH_PAST));
      scroll.go(row, {
        animated: false,
        placed: () => {
          show();
          lit();
        },
      });
    },
    [placing, scroll, show],
  );
  useEffect(() => {
    const target = parseTarget(at);
    if (target === undefined || landed.current === at) return;
    if (target.kind === "asks") {
      landed.current = at;
      list.current?.scrollToOffset({ offset: 0, animated: true });
      return;
    }
    const found = lineOf(target, lines, rows);
    if (found === undefined || !ready(found.row)) return;
    landed.current = at;
    landOn(found.id, found.row, target.kind === "line" ? searchTerms(words ?? "") : []);
  }, [at, words, lines, rows, list, ready, landOn]);
  useEffect(() => {
    if (marking === undefined) return;
    const timer = setTimeout(() => setMarking(undefined), MARKS_MS);
    return () => clearTimeout(timer);
  }, [marking]);
  return { flash, marking, placing, reach };
}

/**
 * The room's two answers to the media viewer: scroll a line into view at once, and land on a line
 * and flash it, each the room's one way (`useRowScroll`). The line gone to stays the one marked,
 * as a link's landing does, and the flash is the moment it is marked again (`pulse`), so a second
 * *Go to message* onto the same line — or onto the line a card landed on — flashes as the first did.
 */
function useViewerAnswers(
  rows: readonly Row[],
  scroll: RowScroll,
  landed: string | undefined,
): {
  readonly reveal: (lineId: string) => void;
  readonly goTo: (lineId: string) => void;
  /** The line to flash: the one gone to from the viewer, else the one a link landed on. */
  readonly flash: string | undefined;
  /** Moves on at each *Go to message*, so a line already lit by a link flashes again. */
  readonly pulse: number;
} {
  const [goneTo, setGoneTo] = useState<{ readonly id: string; readonly pulse: number }>();
  const where = useRef(rows);
  where.current = rows;
  const reveal = useCallback(
    (lineId: string) => {
      const index = rowOfLine(where.current, lineId);
      if (index >= 0) scroll.go(index, { animated: false });
    },
    [scroll],
  );
  const goTo = useCallback(
    (lineId: string) => {
      const index = rowOfLine(where.current, lineId);
      if (index < 0) return;
      scroll.go(index, { animated: true });
      setGoneTo((now) => ({ id: lineId, pulse: (now?.pulse ?? 0) + 1 }));
    },
    [scroll],
  );
  return { reveal, goTo, flash: goneTo?.id ?? landed, pulse: goneTo?.pulse ?? 0 };
}

/** A row is in view once half of it is. */
const SEEN = { itemVisiblePercentThreshold: 50 } as const;

/** The reply the pill goes back to, and whether it is the reader's own. */
interface BackTo {
  readonly id: string;
  readonly mine: boolean;
}

/**
 * A reply's card takes the room to the message it quotes (ADR 0219), the room's one way (`goTo`),
 * and a pill above the composer, "Back to your reply", takes it back. The pill holds the reply, and
 * goes once pressed, on a send, or once the reply is in view again: after it has left the glass,
 * since it is in view as the room begins to glide away from it. A message already in view is lit
 * where it is, with no pill: the reply never left, so there is nothing to go back to.
 */
function useBackToReply(rows: readonly Row[], goTo: (lineId: string) => void) {
  const [back, setBack] = useState<BackTo | undefined>(undefined);
  const where = useRef(rows);
  where.current = rows;
  // The rows half in view, as the list last said.
  const shown = useRef<ReadonlySet<number>>(new Set());
  const watching = useRef<{ readonly id: string; left: boolean } | undefined>(undefined);
  const clear = useCallback(() => {
    watching.current = undefined;
    setBack(undefined);
  }, []);
  const quote = useCallback(
    (reply: LineModel, quoted: string, mine: boolean) => {
      const there = shown.current.has(rowOfLine(where.current, quoted));
      goTo(quoted);
      if (there) return;
      watching.current = { id: reply.id, left: false };
      setBack({ id: reply.id, mine });
    },
    [goTo],
  );
  const goBack = useCallback(() => {
    const id = watching.current?.id;
    clear();
    if (id !== undefined) goTo(id);
  }, [clear, goTo]);
  const seen = useCallback(
    ({ viewableItems }: { readonly viewableItems: readonly ViewToken<Row>[] }) => {
      shown.current = new Set(viewableItems.flatMap((each) => each.index ?? []));
      const watched = watching.current;
      if (watched === undefined) return;
      const row = rowOfLine(where.current, watched.id);
      if (!shown.current.has(row)) watched.left = true;
      else if (watched.left) clear();
    },
    [clear],
  );
  return { back, quote, toReplies: goTo, goBack, clear, seen };
}

/**
 * The room follows your own message to the foot, once it is there to follow, and then the answer
 * to it. Sending records the line the room ended on and arms both. The first line of yours to land
 * after it, and then the first that is neither yours nor the system's, are told so as their cells
 * are first drawn (`follows`, `answers`, asked by `useArrivals`), and the room goes to each as it
 * lands, from however far up the history (`RoomMotion.tsx`, `send` and `answer`): a frame after the
 * mount, once the list has kept the reader's place, which a scroll asked for from here could land
 * before, to be undone by it (the simulator, 6 October 2026). From near the foot, where the room
 * keeps nobody's place, the change that draws your line takes the list down to it, flown or not
 * (`homeward`, asked by `useRoomFlight`). What was asked is answered where it was asked, and that is
 * where the person who asked it is going next. A room that does not move on its transition — Reduce Motion — is taken to the
 * foot from here. A command puts no line in the room and never arms either (`Composer`).
 */
function useFollowOwn(newest: LineModel | undefined, selfId: string, field: Field): Follow {
  const sent = useRef<string | undefined>(undefined);
  const own = useRef(false);
  const answer = useRef(false);
  // A line followed in the render just drawn, which a room that does not move is scrolled to: after
  // every render, since the line is marked as its cell is drawn.
  const followed = useRef(false);
  useEffect(() => {
    if (!followed.current) return;
    followed.current = false;
    // Nought is the foot of an inverted list, which is where the line just drawn is.
    if (!field.moves) field.list.current?.scrollToOffset({ offset: 0, animated: true });
  });
  return {
    sent: (flew) => {
      sent.current = newest?.id;
      own.current = !flew;
      answer.current = true;
    },
    follows: (line) => {
      if (!own.current || line.id === sent.current || line.authorId !== selfId) return false;
      own.current = false;
      followed.current = true;
      return true;
    },
    answers: (line) => {
      if (!answer.current || line.id === sent.current) return false;
      if (line.authorId === selfId || line.authorKind === "system") return false;
      answer.current = false;
      if (field.scroll.value > NEAR) followed.current = true;
      return true;
    },
  };
}

/** What sending tells the room (`sent`), and which lines landing after it it follows to the foot. */
interface Follow {
  readonly sent: (flew: boolean) => void;
  readonly follows: (line: LineModel) => boolean;
  readonly answers: (line: LineModel) => boolean;
}

/**
 * The room's side of a send's flight (`sendLanding.ts`): whether it flies here, and the send the
 * composer reports, which puts the words in the air — or, for one that does not fly, takes the
 * room to its foot as it always did — and has the room follow the answer either way. Not with
 * Reduce Motion, on a wide screen — the room there is a pane beside the list, with its own column
 * — or on the web; and not from up the history, where the room keeps the reader's place and the
 * new line lands off the glass with nothing on it to fly to.
 *
 * Up the history is what the room's own transition says it is (`Field.far`: past `NEAR`, and back
 * only inside `BACK`), not the offset alone. Asked of the offset, a send made between the two on
 * the way back down flew to a line the room was holding off the glass below it (PH-21).
 *
 * And a send from near the foot asks the room for the foot (`homeward`): the change that draws its
 * line takes the list there with the rows it moves, so a list left a little above it — by a thumb,
 * or by a reply read from its start — does not put the line under the field.
 */
function useRoomFlight({
  store,
  spaceId,
  selfId,
  field,
  follow,
}: {
  readonly store: Store;
  readonly spaceId: string;
  readonly selfId: string;
  readonly field: Field;
  readonly follow: (flew: boolean) => void;
}) {
  const { wide } = useLayout();
  const far = useCallback(() => field.far.value === 1, [field]);
  const flight = useSendFlight({
    store,
    spaceId,
    selfId,
    enabled: !field.still && !wide && Platform.OS !== "web",
    far,
  });
  const { launch } = flight;
  const sent = useCallback(
    (launched: Launch | undefined) => {
      if (field.moves && !far()) homeward(field);
      follow(launch(launched));
    },
    [field, far, follow, launch],
  );
  return { ...flight, sent };
}

/**
 * The room's foot as a row of its list, under the newest line: what the harnesses are doing, and
 * the asks. Always there, and empty when there is neither: a row put in under the lines renumbers
 * every row above it, and each is drawn again in the frame the thinking bubble comes (the
 * simulator, 25 September 2026: a stall, and the room a third of the way up in one frame).
 */
function useFoot(
  doing: readonly Doing[],
  asks: readonly NeedsYouItem[],
  snapshot: Snapshot,
  resting: boolean,
): FootRow {
  return useMemo(
    () => ({ foot: true as const, doing, asks, snapshot, resting }),
    [doing, asks, snapshot, resting],
  );
}

/**
 * The lines the room draws: all of them, until a send's words are in the air; then what it drew
 * before and the sender's own, until they have landed (`heldBack`, in `sendLanding.ts`). The keys
 * the room has drawn are the ones it keeps while it is open (`useKnown`), so a line held back is
 * not among them, and arrives as any line does once the words are down.
 */
function useHeldArrivals(
  all: readonly Drawn[],
  holding: boolean,
  known: ReadonlySet<string>,
  selfId: string,
): { readonly drawn: readonly Drawn[]; readonly lines: readonly LineModel[] } {
  const drawn = useMemo(
    () => (holding ? heldBack(all, known, selfId) : all),
    [all, holding, known, selfId],
  );
  const lines = useMemo(() => drawn.map((each) => each.line), [drawn]);
  return { drawn, lines };
}

/**
 * The words in the air, over the room and its composer, going to the line they were sent as: what
 * its time says as they go, and whether it closes up to one of yours above it.
 */
function Flown({
  flight,
  field,
  drawn,
  directory,
  offline,
}: {
  readonly flight: ReturnType<typeof useRoomFlight>;
  readonly field: Field;
  readonly drawn: readonly Drawn[];
  readonly directory: Directory;
  readonly offline: boolean;
}) {
  const { flying } = flight;
  const flown =
    flying?.key === undefined
      ? undefined
      : drawn.find((each) => keyOfLine(each.line) === flying.key);
  return (
    <FlightLayer
      flying={flying}
      stamp={stampWords(flown?.line ?? ON_ITS_WAY, offline)}
      joins={flown?.place === "last"}
      told={flight.told}
      tolds={flight.landing.tolds}
      routeTold={flight.routeTold}
      directory={directory}
      field={field}
      onLanded={flight.landed}
    />
  );
}

/**
 * A room that is not on this phone. Somebody took the reader out of it while it was on screen: it
 * says by whom, and OK goes back (JR-6); added back, the room is here again in its place. A room
 * made here and turned away says why (ADR 0149's third addendum). Else it has not replayed yet.
 *
 * Under the room's head, which floats over the room on glass: the words stood under the status bar,
 * over the clock (his iPhone, 1 November 2026). And it says it has drawn (`onDrawn`): the + window
 * over a room it opened waits for that, and filled the screen with nothing for a second and a half
 * before going into these words. Not `onListed`, which hands UIKit's edge settings to a list there
 * is not yet.
 */
function NotHere({
  taken,
  notice,
  onSeen,
  headHeight,
  onDrawn,
}: {
  readonly taken: TakenOut | undefined;
  readonly notice: string | undefined;
  readonly onSeen: (() => void) | undefined;
  readonly headHeight: number;
  readonly onDrawn: (() => void) | undefined;
}) {
  if (taken !== undefined) return <TakenOutNotice taken={taken} onSeen={() => onSeen?.()} />;
  return (
    <View style={{ paddingTop: headHeight }} onLayout={onDrawn}>
      <Empty>
        {notice ?? `This space is not on ${thisDevice()}. It may not have replayed yet.`}
      </Empty>
    </View>
  );
}

/** How long a line put back by Undo is looked for, to form again as it is drawn. */
const RETURN_MS = 3000;
/** How long the room waits on the server for a line taken back, as the reader's own change. */
const TAKE_BACK_MS = 3000;

/**
 * Deleting a line in this room (ADR 0167): the room's dust, what its rows are given to delete with
 * (the same object while nothing it is made of changes, so no row draws again for it), and Undo
 * for a line deleted for the reader alone. The question before a deletion for everyone says
 * whether the room has an agent in it; the room's field held still is no dust, as on the web.
 *
 * Each is the reader's own change to the room (`madeHere`): the room closes over a line deleted,
 * and opens for one brought back, on its spring, up the history as at the foot.
 */
function useDeleting(
  store: Store,
  spaceId: string,
  room: {
    readonly space: Space | undefined;
    readonly directory: Directory;
    readonly field: Field;
  },
) {
  const { field } = room;
  const agents = room.space !== undefined && harnessesIn(room.space, room.directory).length > 0;
  const dust = useDust(field.still || Platform.OS === "web");
  const [undoing, setUndoing] = useState<Undoing | undefined>(undefined);
  const hide = useCallback(
    (said: LineModel) => {
      madeHere(field);
      store.hideMessage({ spaceId, lineId: said.id });
      setUndoing({ lineId: said.id, at: Date.now() });
    },
    [store, spaceId, field],
  );
  const takeBack = useCallback(
    (said: LineModel) => {
      madeHere(field, TAKE_BACK_MS);
      store.deleteMessage({ spaceId, lineId: said.id });
    },
    [store, spaceId, field],
  );
  const undo = useCallback(
    (lineId: string) => {
      // The line comes back to form again from its dust, not to arrive as a new one would. Its
      // row takes it off as it is drawn; a line that never came back is forgotten soon after.
      returning.add(lineId);
      setTimeout(() => returning.delete(lineId), RETURN_MS);
      madeHere(field);
      store.showMessage({ spaceId, lineId });
      setUndoing(undefined);
    },
    [store, spaceId, field],
  );
  const undone = useCallback(() => setUndoing(undefined), []);
  const deleting = useMemo<Deleting>(
    () => ({ dust: dust.asker, hide, takeBack, asking: deleteForEveryoneAsking(agents) }),
    [dust.asker, hide, takeBack, agents],
  );
  return { dust, deleting, undoing, undo, undone };
}

/** A line not drawn yet, as its time would say it: on its way. */
const ON_ITS_WAY = { pending: true, ts: "" } as const;

export function SpaceView({
  store,
  snapshot,
  spaceId,
  selfId,
  at,
  words,
  onDetails,
  files: givenFiles,
  onOpenSpace,
  onOpenAgent,
  onOpenRoom,
  headHeight = 0,
  bandReach = 0,
  inView = true,
  onListed,
  onDrawn,
  onTakenSeen,
}: {
  /** The reader, told they were taken out of this room, said OK: back to the list (JR-6). */
  readonly onTakenSeen?: (() => void) | undefined;
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly spaceId: string;
  readonly selfId: string;
  /** Where to land: `line:<id>`, `run:<id>` or `asks`, as a link or a push says it. */
  readonly at?: string | undefined;
  /** What a search looked for, when it opened this room at a message: marked there (ADR 0133). */
  readonly words?: string | undefined;
  /** An ask's own screen, for what a card cannot do: scope, edit, a reason, a hand-on. */
  readonly onDetails?: ((item: NeedsYouItem) => void) | undefined;
  /** How files are uploaded and opened (M4.4). Absent, the pairing's own service is used. */
  readonly files?: FileService | undefined;
  /** Opens another space: the one at the other end of a lane drawn here. */
  readonly onOpenSpace?: ((spaceId: string) => void) | undefined;
  /** Opens an agent's page: the one a line about it names, as a compaction's (ADR 0146). */
  readonly onOpenAgent?: ((agentId: string) => void) | undefined;
  /**
   * How tall the navigation bar standing over this room is, when it is standing *over* it: the
   * phone's room is drawn under a transparent bar (`app/spaces/[id].tsx`), and the room beside an
   * iPad's list under its floating name (`RoomPane.tsx`), so the list has to hold that many points
   * clear at its top and the band of blur has to be that tall. Nought, or absent, is a room with a
   * bar above it rather than behind it — the pane where there is no glass — and neither the inset
   * nor the band belongs there.
   */
  readonly headHeight?: number | undefined;
  /**
   * How far above the room its band of blur reaches. The room beside an iPad's list stops short
   * of the tab bar standing above it (`RoomPane.tsx`), and a band that stopped with it cut what it
   * blurred off in a line under the bar — a violet bubble passing under the name was a violet
   * strip with a hard top (the iPad simulator, 16 October 2026). Run up to the window's top, as a
   * phone's runs up under the status bar, the blur carries what passes under the name off into
   * the page.
   */
  readonly bandReach?: number | undefined;
  /** Opens the room's sheet, to add an agent: the no-agent notice's Add an agent (ADR 0087). */
  readonly onOpenRoom?: ((page?: "who" | "add") => void) | undefined;
  /**
   * Whether the room has begun to come into view, when it slides in (`app/spaces/[id].tsx`). The
   * rows a room opened far up draws to its line wait for it: drawn the moment the room was mounted,
   * they kept the bar's name and its way back off the screen for the whole slide — both are laid out
   * natively and committed through JavaScript, which the rows held for a third of a second — and
   * by the slide's start both are in (the simulator, 7 October 2026).
   */
  readonly inView?: boolean | undefined;
  /** The room's list has laid out, and is the scroll view its screen finds (`app/spaces/[id].tsx`). */
  readonly onListed?: (() => void) | undefined;
  /** The room has drawn what it has, a list or the words saying it is not here: the + window goes. */
  readonly onDrawn?: (() => void) | undefined;
}) {
  const chips = useChips();
  const files = givenFiles ?? chips.paired?.files;
  const column = useRoomColumn();
  // The band at the bottom of the glass, which the composer holds clear itself and the room's
  // foot therefore stands on (`quietFoot`, `Composer.tsx`).
  const insets = useSafeAreaInsets();
  // The room's colour, made here rather than in the list, so the words flying to a bubble over
  // the list can take it where they are; and the list itself, which those words scroll.
  const field = useColourField();
  const { list } = field;
  // What the room clips its lines to, which the media viewer's flight is clipped to as well.
  const glass = useRef<View>(null);
  const {
    space,
    lanes,
    drawn: all,
    lines: allLines,
    asks,
    runs,
    mark,
    routes,
    between,
  } = useRoom(snapshot, spaceId);
  // Every row holds one handler for the life of the room (`useHandler`): the screen makes these
  // closures afresh on each render, and a memoised row given new ones would draw again on every
  // event the store delivers, with nothing to draw differently.
  const openSpace = useHandler(onOpenSpace);
  const openAgent = useHandler(onOpenAgent);
  const feedback = useHandler((said: LineModel, given: Given) =>
    store.sendFeedback({ spaceId, lineId: said.id, ...given }),
  );
  // Pin and Edit, from a lifted message's capsule (ADR 0200): the store's own acts (M5.4).
  const pin = useHandler((said: LineModel, on: boolean) =>
    on
      ? store.pinMessage({ spaceId, lineId: said.id })
      : store.unpinMessage({ spaceId, lineId: said.id }),
  );
  const edit = useHandler((said: LineModel, text: string) =>
    store.editMessage({ spaceId, lineId: said.id, text }),
  );
  // Deleting a line (ADR 0167): its dust, over the room, and Undo for one deleted for you alone.
  const { dust, deleting, undoing, undo, undone } = useDeleting(store, spaceId, {
    space,
    directory: snapshot.directory,
    field,
  });
  const known = useKnown(allLines);
  // The words of a send in the air, and what the room holds back while they are (`useHeldArrivals`).
  // Following a line of yours in is what the flight does when it does not fly, and following the
  // answer is what both do; the line each follows is the newest drawn, reached through the ref
  // because it is known only after the hold.
  const followRef = useRef<Follow>({
    sent: () => undefined,
    follows: () => false,
    answers: () => false,
  });
  const follow = useCallback((flew: boolean) => followRef.current.sent(flew), []);
  const follows = useCallback((line: LineModel) => followRef.current.follows(line), []);
  const answers = useCallback((line: LineModel) => followRef.current.answers(line), []);
  const flight = useRoomFlight({ store, spaceId, selfId, field, follow });
  // A harness's reply waits for its run to close, so it lands as the bubble goes (`heldReplies.ts`).
  const waiting = useHeldReplies(space);
  const replied = useMemo(
    () => (waiting.size === 0 ? all : all.filter((each) => !waiting.has(each.line.id))),
    [all, waiting],
  );
  const { drawn, lines } = useHeldArrivals(replied, flight.flying !== undefined, known, selfId);
  // What each harness at work is doing, as a bubble apiece at the foot, a beat after its run
  // begins and never before the newest line — the one just sent — is confirmed and its words are
  // down: the beat counts from their landing, so the room rises for the words, rests, and rises
  // again for the thinking, rather than a fifth of a second after it had settled (ADR 0050,
  // amended). A bubble already up stays up through the next send.
  const thinking = useThinking(
    space === undefined ? NOBODY : spaceDoing(space),
    lines[0]?.pending !== true && flight.flying === undefined,
  );
  // Unless a chain row in this room is already breathing the same news (`routing`).
  const doing = routing(lines, lanes) ? NOBODY : thinking;
  // Out of touch with the server — or a beat after it is back, while it catches up — a bubble
  // says what was known, and stands still (`ThinkingBubble`'s `resting`).
  const inTouch = useInTouch(snapshot.connection);
  const foot = useFoot(doing, asks, snapshot, !inTouch);
  const folded = useFolded(
    drawn,
    space,
    snapshot.directory,
    between,
    snapshot.model.exchangeLimits,
  );
  const rows = useMemo(() => [foot, ...folded], [foot, folded]);
  useEffect(() => {
    if (mark > 0) store.markRead(spaceId, mark);
  }, [store, spaceId, mark]);

  followRef.current = useFollowOwn(lines[0], selfId, field);
  // What the floating chrome covers, in points, measured because it changes: the composer grows
  // with what is typed, with what is attached and with what it was refused, and the pinned strip
  // is there or it is not. The list holds both clear — inverted, so its own top is the room's
  // foot and the two paddings are the other way round from the way they read.
  //
  // The foot stands at what a quiet one stands at until it has measured itself, rather than at
  // nought, because a measure is a frame late and this one is the height of the field: the room
  // drew its newest line under the composer and then took the whole conversation up to where it
  // belonged, on its own spring, every time a room was opened (Arjun, 2 October 2026 — "the
  // bubbles initially start below the text box, and they shift up"). Nought is right for the
  // strip above, which is nothing at all until a line in the room is pinned.
  const [reported, setReported] = useState<number | undefined>(undefined);
  // Not dropping with the composer as a send empties it, until the line is in (`useSendFoot`).
  const footHeight = useSendFoot(
    reported ?? quietFoot(insets.bottom),
    flight.landing,
    flight.flying !== undefined,
  );
  const [pinsHeight, setPinsHeight] = useState(0);
  // And a room being opened is not a room moving: nothing the build changes is carried to its
  // place on the room's spring (`RoomMotion.tsx`), because nothing in the room has been seen yet
  // for a spring to come from. It begins to move once it has been drawn at the height its own
  // foot measured — the render after that measure lands, so where the quiet foot was short of it
  // (a notice over the field, a draft of several lines) the correction is drawn where it belongs
  // rather than sprung there.
  const [built, setBuilt] = useState(false);
  useEffect(() => {
    if (reported !== undefined) setBuilt(true);
  }, [reported]);
  // Where a link lands, and the media viewer's answers, each taking the list to a row one way.
  const scroll = useRowScroll(list);
  const landing = useLanding({ at, words, lines, rows, list, built, inView, scroll });
  const viewer = useViewerAnswers(rows, scroll, landing.flash);
  const { flash, pulse } = viewer;
  // A reply's card goes to the message it quotes, and the pill comes back (ADR 0219).
  const replying = useBackToReply(rows, viewer.goTo);
  const { clear: letBackGo } = replying;
  const { sent: flown } = flight;
  const sent = useCallback(
    (launched: Launch | undefined) => {
      letBackGo();
      flown(launched);
    },
    [letBackGo, flown],
  );
  // The field open into the list of who a message goes to (ADR 0081): how a tap on the room closes
  // it, while it is open.
  const closeAddress = useRef<(() => void) | undefined>(undefined);
  const addressOpen = useCallback((close: (() => void) | undefined) => {
    closeAddress.current = close;
  }, []);
  const head = headHeight + pinsHeight;
  // Where a line read from its start is put: where the room's first line stands (`RoomMotion.tsx`).
  useEffect(() => {
    field.top.value = head + SPACE.md;
  }, [field, head]);
  const content = useMemo(
    () => [
      styles.lines,
      column,
      { paddingTop: footHeight + SPACE.md, paddingBottom: head + SPACE.md },
    ],
    [column, footHeight, head],
  );
  // The bar that says where in the room you are keeps between the chrome, as the lines do: it ran
  // the full height of the glass, up under the name (Arjun, 23 September 2026). Inverted, so its
  // top is the foot here too, and UIKit's own adjustment is off because these already hold the
  // safe areas — the bar's height is measured from the top of the screen, and the foot's padding
  // carries the home indicator's inset.
  const indicator = useMemo(() => ({ top: footHeight, bottom: head }), [footHeight, head]);
  const details = useHandler(onDetails);
  const roomView = useRoomView({
    space,
    lanes,
    runs,
    routes,
    flash,
    pulse,
    marking: landing.marking,
    snapshot,
    selfId,
    files,
    openSpace,
    openAgent,
    feedback,
    pin,
    edit,
    store,
    details,
    deleting,
    quote: replying.quote,
    toReplies: replying.toReplies,
  });
  const arrives = useArrivals({
    known,
    flown: flight.landing,
    selfId,
    directory: snapshot.directory,
    follows,
    answers,
  });

  if (space === undefined) {
    return (
      <NotHere
        taken={snapshot.model.takenOut[spaceId]}
        notice={snapshot.notices?.get(spaceId)}
        onSeen={onTakenSeen}
        headHeight={headHeight}
        onDrawn={onDrawn}
      />
    );
  }

  return (
    <MediaProvider
      space={space}
      lanes={lanes}
      directory={snapshot.directory}
      files={files}
      glass={glass}
      covered={{ top: head, bottom: footHeight }}
      onReveal={viewer.reveal}
      onGoTo={viewer.goTo}
    >
      <WaitsProvider space={space} directory={snapshot.directory}>
        <KeyboardRoom testID="room">
          <SendLandingContext.Provider value={flight.landing}>
            <View style={styles.stack}>
              {/* Where a held message's copy starts and ends: what is seen under the bar's band and
                  above the composer (ADR 0200). */}
              <RoomSeen top={head + (headHeight > 0 ? GLASS.rampTop : 0)} bottom={footHeight}>
                <TapAway glass={glass} closeAddress={closeAddress}>
                  {
                    // The list is there from the room's first frame, empty or not. The platform's
                    // settings for the room's scroll view — iOS's edge effects off (`app/spaces/[id].tsx`)
                    // — are given to the scroll view the screen finds as it is set up; a room that
                    // opened empty had none to give them to, and when its first line put the list in,
                    // iOS's own edge effect washed the whole conversation pale once it reached the top
                    // (the simulator, 27 September 2026: every new room, on its first message with a
                    // route over it or its third without).
                    <RoomRows.Provider value={roomView}>
                      <ColourList
                        ref={list}
                        field={field}
                        inverted
                        testID="space-lines"
                        style={styles.list}
                        onLayout={onListed}
                        // Unseen while a room opened on a line places it (`useLanding`).
                        shown={!landing.placing}
                        data={rows}
                        keyExtractor={keyOfRow}
                        // The foot over the rows, so a line rising in from under the thinking bubble
                        // comes out from behind it rather than across it.
                        CellRendererComponentStyle={footOver}
                        // A line that lands comes in under the one above it (`RoomMotion.tsx`).
                        arrives={arrives}
                        contentContainerStyle={content}
                        built={built}
                        // The room holds its own clearance under the floating chrome (`content`), and
                        // UIKit would add its own on top: a scroll view inside a navigation controller is
                        // inset by the bar unless it is told otherwise, and a transparent bar is still a
                        // bar to it. Told otherwise, in both of the places it can be told.
                        contentInsetAdjustmentBehavior="never"
                        automaticallyAdjustContentInsets={false}
                        scrollIndicatorInsets={indicator}
                        automaticallyAdjustsScrollIndicatorInsets={false}
                        // A chat is read a screen at a time: rows are kept for four screens either side of
                        // the glass, drawn eight at a go, and the foot's first screenful comes at once. The
                        // defaults keep ten screens each way, which is a week of a busy room mounted for a
                        // reader who is looking at this morning.
                        windowSize={9}
                        maxToRenderPerBatch={8}
                        // More while a landing places a line far up (`useLanding`).
                        initialNumToRender={landing.reach}
                        updateCellsBatchingPeriod={40}
                        // The list would otherwise walk every row it holds on every mount to detach
                        // the ones off the glass — and a mount is every frame the room moves or the
                        // colour field does (`RoomMotion.tsx`, `ScrollColours.tsx`), and every line
                        // that lands. Sampled on the simulator (25 September 2026): that walk was six
                        // tenths of the room's per-frame commit and four tenths of a landing's mount,
                        // the one thing on the main thread a phone at 120 Hz cannot fit in a frame.
                        // Four screens of rows either side stay attached instead; the phone draws none
                        // of them.
                        removeClippedSubviews={false}
                        // A tap the room has taken — a photo, a card's button — keeps the keyboard; one it
                        // has not is `TapAway`'s, and puts the keyboard away.
                        keyboardShouldPersistTaps="handled"
                        // Drag the room down and the keyboard goes down with the finger, as it does in Mail
                        // and Messages; let go half way and it comes back. The controller tracks that drag,
                        // so the composer follows it rather than waiting for the keyboard to finish leaving.
                        keyboardDismissMode="interactive"
                        maintainVisibleContentPosition={field.moves ? undefined : KEEP_PLACE}
                        // A line far up the room is not laid out yet; go roughly there, then exactly.
                        onScrollToIndexFailed={scroll.failed}
                        // Whether the reply the pill goes back to is in view again (ADR 0219).
                        onViewableItemsChanged={replying.seen}
                        viewabilityConfig={SEEN}
                        renderItem={renderRow}
                      />
                    </RoomRows.Provider>
                  }
                  {lines.length === 0 && doing.length === 0 && asks.length === 0 ? (
                    // A room of people offers Add agents (ADR 0148); one with agents asks what the
                    // person would like to do, since they wait for the first message (ADR 0149).
                    <Unstarted
                      space={space}
                      directory={snapshot.directory}
                      onAdd={onOpenRoom === undefined ? undefined : () => onOpenRoom("add")}
                    />
                  ) : null}
                </TapAway>
                <Head
                  space={space}
                  headHeight={headHeight}
                  reach={bandReach}
                  onHeight={setPinsHeight}
                />
                <Foot
                  store={store}
                  space={space}
                  snapshot={snapshot}
                  selfId={selfId}
                  files={files}
                  onHeight={setReported}
                  onSent={sent}
                  onAddressOpen={addressOpen}
                  closeAddress={closeAddress}
                  onOpenRoom={onOpenRoom}
                  bar={headHeight}
                />
                <Flown
                  flight={flight}
                  field={field}
                  drawn={drawn}
                  directory={snapshot.directory}
                  offline={snapshot.connection !== "open"}
                />
                <DustLayer dust={dust} field={field} />
                <UndoPill
                  undoing={undoing}
                  bottom={footHeight + SPACE.sm}
                  onUndo={undo}
                  onGone={undone}
                />
                <BackPill
                  back={replying.back}
                  bottom={footHeight + SPACE.sm}
                  onPress={replying.goBack}
                />
              </RoomSeen>
            </View>
          </SendLandingContext.Provider>
        </KeyboardRoom>
      </WaitsProvider>
    </MediaProvider>
  );
}

/**
 * A height the room's chrome reports, on the screen's own pixel grid. Yoga lays the floating foot
 * out again on every frame the keys move under it and hands its height back as 162, 161.99997,
 * 162.00003: each a new number to React, so the whole room drew again on every frame of the keys'
 * ride, which went at half its rate, and a reply's keys rose a third of the way over the field
 * before the room moved (the simulator, 23 October 2026). On the grid a height that has not
 * changed is the same number, and React leaves the room as it is.
 */
function heightOf(event: LayoutChangeEvent): number {
  return PixelRatio.roundToNearestPixel(event.nativeEvent.layout.height);
}

/**
 * The room's head: the band of blur behind the bar, and the pinned strip under it.
 *
 * Neither is in the list's way — the bar floats over the room, so the strip does too, and the
 * list is told how much of its top the two of them are covering rather than being pushed down by
 * them. The strip measures itself because pinning a line is a thing that happens while the room
 * is open, and the number it reports is half of that inset.
 *
 * A room with no bar over it — the pane where there is no glass — has no band: there is nothing
 * floating there to keep readable, and a band at the top of a pane is a smudge. One whose band
 * reaches above it (`bandReach`) has it drawn from that far up.
 */
function Head({
  space,
  headHeight,
  reach,
  onHeight,
}: {
  readonly space: Parameters<typeof visibleLines>[0];
  readonly headHeight: number;
  readonly reach: number;
  readonly onHeight: (height: number) => void;
}) {
  const band =
    headHeight === 0 ? null : (
      <EdgeBand edge="top" height={reach + headHeight + GLASS.rampTop} ramp={GLASS.rampTop} />
    );
  return (
    <>
      {reach === 0 || band === null ? (
        band
      ) : (
        <View pointerEvents="none" style={[styles.reach, { top: -reach }]}>
          {band}
        </View>
      )}
      <View
        style={[styles.pinned, { top: headHeight }]}
        onLayout={(event) => onHeight(heightOf(event))}
      >
        <Pins space={space} />
      </View>
    </>
  );
}

/**
 * The room's foot, floating: what the room has to say about itself, and the composer.
 *
 * It stands over the lines rather than under them, so the newest line passes beneath the field
 * as it arrives — which is the whole of what the glass is for. It measures itself and hands the
 * number up, because everything it holds can change height while the room is open: a line typed,
 * a file staged, a command refused. Nothing stands behind it: the band of blur that did until 23
 * September 2026 read as a bar across the foot of the room, and Arjun wanted the room to run to
 * the bottom of the glass as Messages' does (`ui/Glass.tsx`). What it holds is on glass instead.
 *
 * It is as wide as the room and as tall as what it holds, the field's open list included, so the
 * room beside the list is this view's and not `TapAway`'s: with the keys up the list stands nearly
 * the room's height, and a tap beside it, on what looks like the room, did nothing (Arjun's phone,
 * 10 October 2026). So a tap nothing in here wanted is off the menu, as one on the room is, and
 * closes the list only. A row, a circle, the field and the + are still their own taps: the
 * innermost view is asked first.
 *
 * On the iPhone Duo it stops short of the column iOS keeps down the screen's edge, where the room's
 * back button stands (ADR 0256): it floats, so the safe area that keeps the lines clear of the column
 * doesn't reach it, and the field ran under the clock (the simulator, 2 November 2026). In a split
 * the room's pane already stops there.
 */
function Foot({
  store,
  space,
  snapshot,
  selfId,
  files,
  onHeight,
  onSent,
  onAddressOpen,
  closeAddress,
  onOpenRoom,
  bar,
}: {
  readonly store: Store;
  readonly space: Space;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly files: FileService | undefined;
  readonly onHeight: (height: number) => void;
  readonly onSent: (launch: Launch | undefined) => void;
  readonly onAddressOpen: (close: (() => void) | undefined) => void;
  /** How to close the field's list, while it is open. */
  readonly closeAddress: RefObject<(() => void) | undefined>;
  readonly onOpenRoom?: ((page?: "who" | "add") => void) | undefined;
  /** Where the room's bar ends, which the field's list stops under (ADR 0113). */
  readonly bar: number;
}) {
  const palette = usePalette();
  const closed = space.state === "closed";
  // On an iPad the foot stands in the room's column, under the lines it answers (ADR 0256).
  const column = useRoomColumn();
  const clear = useClearOfDuo();
  return (
    <View style={[styles.floating, styles.footRow, clear]} pointerEvents="box-none">
      <View
        style={column}
        testID="room-foot"
        onStartShouldSetResponder={() => closeAddress.current !== undefined}
        onResponderRelease={() => closeAddress.current?.()}
        onLayout={(event) => onHeight(heightOf(event))}
      >
        {closed ? (
          <View style={styles.asides}>
            <Aside>
              <Text style={[styles.asideWords, { color: palette.ink3 }]} testID="closed">
                This space is archived. Its history stays; unarchive it from Spaces, or send
                /unarchive, to carry on.
              </Text>
            </Aside>
          </View>
        ) : null}
        <RoomNotice
          store={store}
          space={space}
          snapshot={snapshot}
          selfId={selfId}
          onAdd={onOpenRoom === undefined ? undefined : () => onOpenRoom("add")}
        />
        <PausedBanner store={store} space={space} snapshot={snapshot} />
        <Composer
          key={space.id}
          store={store}
          space={space}
          run={space.run}
          directory={snapshot.directory}
          selfId={selfId}
          disabled={snapshot.connection === "rejected"}
          files={files}
          caps={snapshot.model.attachmentCaps}
          onSent={onSent}
          onAddressOpen={onAddressOpen}
          roomNotice={snapshot.notices?.get(space.id)}
          bar={bar}
        />
      </View>
    </View>
  );
}

/** Where the Duo's column is kept clear by what floats at the room's edge: not in a split's pane. */
function useClearOfDuo(): ViewStyle | null {
  const { side, column } = useDuo();
  const split = useSplitSide();
  if (side === undefined || column === 0 || split !== undefined) return null;
  return side === "right" ? { right: column } : { left: column };
}

/**
 * The lines, and a tap on them putting the keyboard away (Arjun, 20 September 2026).
 *
 * The platform's own way of doing this is `keyboardShouldPersistTaps="never"`, and it takes the
 * tap with it: with the keys up, an Approve on a card at the foot of the room would want two
 * taps, one to close the keyboard and one to approve. So the room claims only what nothing else
 * wanted. The responder is offered to the innermost view first, so a photo, a card's button and a
 * lane's row are still their own tap, and a bubble — pressable already, for the hold — puts the
 * keyboard away on its own press (`Hold`, in `Line.tsx`). What is left for this view is the
 * message with nothing to offer, the space between two turns, the empty room.
 *
 * It asks for the touch only while there is a keyboard to put away, so a room at rest is a plain
 * view. A drag is the list's either way: the scroll's own gesture cancels the touch this holds,
 * which is how a button inside a list stops being pressed when the list starts moving.
 *
 * While the field is open into the list of who a message goes to, a tap on the room closes that,
 * and only that, as a tap off a menu does: the keys stay where they are (ADR 0081, Arjun's A). It
 * takes that touch before anything in the room is offered it: the room is mostly bubbles, each
 * pressable for its hold, and each took the tap for itself, so the list wanted several taps on the
 * room to close (Arjun's phone, 28 September 2026). A drag that the list takes closes it too.
 */
function TapAway({
  glass,
  closeAddress,
  children,
}: {
  /** The room's own glass: the media viewer measures it to clip a flight (`media/Stage.tsx`). */
  readonly glass: RefObject<View | null>;
  /** How to close the field's list, while it is open. */
  readonly closeAddress: RefObject<(() => void) | undefined>;
  readonly children: ReactNode;
}) {
  return (
    <View
      ref={glass}
      style={styles.list}
      accessible={false}
      testID="room-tap"
      onStartShouldSetResponderCapture={() => closeAddress.current !== undefined}
      onStartShouldSetResponder={() => closeAddress.current !== undefined || Keyboard.isVisible()}
      onResponderRelease={() => {
        const close = closeAddress.current;
        if (close !== undefined) close();
        else Keyboard.dismiss();
      }}
      onResponderTerminate={() => closeAddress.current?.()}
    >
      {children}
    </View>
  );
}

/** Everything a row is drawn from. */
interface RowContext {
  readonly space: Space | undefined;
  readonly lanes: readonly Lane[];
  readonly runs: ReadonlyMap<string, Run>;
  /** Where each routed message went (ADR 0081), by line id. */
  readonly routes: ReadonlyMap<string, RouteDrawn>;
  readonly flash: string | undefined;
  readonly pulse: number;
  /** The words a search looked for, in the line it opened, while they are marked (ADR 0133). */
  readonly marking: Marking | undefined;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly files: FileService | undefined;
  readonly openSpace: ((spaceId: string) => void) | undefined;
  readonly openAgent: ((agentId: string) => void) | undefined;
  readonly feedback: ((line: LineModel, given: Given) => void) | undefined;
  readonly pin: ((line: LineModel, on: boolean) => void) | undefined;
  readonly edit: ((line: LineModel, text: string) => void) | undefined;
  /** What the foot's cards answer through, and open an ask's own screen with. */
  readonly store: Store;
  readonly details: ((item: NeedsYouItem) => void) | undefined;
  /** How a line is deleted (ADR 0167). */
  readonly deleting: Deleting;
  /** Goes to the message a reply quotes, and to a reply from the mark under its message (ADR 0219). */
  readonly quote: (reply: LineModel, quoted: string, mine: boolean) => void;
  readonly toReplies: (reply: string) => void;
}

/** The reader's standing in the room and the workspace: whom they may delete a line for. */
interface Standing {
  readonly inSpace: ReturnType<typeof standingIn>;
  readonly inWorkspace: ReturnType<typeof myRole>;
}

/** What every row draws the same way, the same object while none of it changes. */
interface Shared {
  readonly here: string;
  readonly directory: Directory;
  readonly named: boolean;
  readonly offline: boolean;
  readonly spaceIcons: Snapshot["spaceIcons"];
  readonly selfId: string;
  readonly files: FileService | undefined;
  readonly openSpace: ((spaceId: string) => void) | undefined;
  readonly openAgent: ((agentId: string) => void) | undefined;
  readonly feedback: ((line: LineModel, given: Given) => void) | undefined;
  readonly pin: ((line: LineModel, on: boolean) => void) | undefined;
  readonly edit: ((line: LineModel, text: string) => void) | undefined;
  readonly store: Store;
  readonly details: ((item: NeedsYouItem) => void) | undefined;
  readonly deleting: Deleting;
  readonly standing: Standing;
  readonly quote: (reply: LineModel, quoted: string, mine: boolean) => void;
  readonly toReplies: (reply: string) => void;
  /** Starts a reply to a line in the field below (ADR 0219): a swipe on it, or Reply in its menu. */
  readonly reply: (line: LineModel) => void;
  /** The room's project, which a reply's change opens on (ADR 0222). */
  readonly project: ProjectActions;
}

/** The room as its rows read it (`RoomRow`). */
interface RoomView {
  /** The whole space, for the rows drawn from all of it: a fork, a new agent, a fold. */
  readonly space: Space;
  readonly lanes: readonly Lane[];
  readonly runs: ReadonlyMap<string, Run>;
  readonly routes: ReadonlyMap<string, RouteDrawn>;
  readonly busy: ReadonlySet<string>;
  /** Not right? notes the server turned away, by line, said under it (PM-4). */
  readonly unsent: ReadonlyMap<string, UnsentNote>;
  readonly flash: string | undefined;
  readonly pulse: number;
  readonly marking: Marking | undefined;
  /** The lines pinned to the top of the room, whose menus offer Unpin (ADR 0200). */
  readonly pinned: ReadonlySet<string>;
  readonly shared: Shared;
}

const RoomRows = createContext<RoomView | undefined>(undefined);

/**
 * The room as its rows read it, given them through `RoomRows` rather than through the list.
 *
 * The list drew every row again whenever it drew at all: its `renderItem` was a new function for
 * every event in the room, since it closed over the space, and a list not in `strictMode` hands
 * each row a new one on every render anyway. Some 700 components went again for each event, for
 * the send's tap and for its landing — the cell, its transition, the turn, the flash, for every
 * row in reach (the simulator, 4 October 2026). Now the list's `renderItem` is one for the room's
 * life (`renderRow`), its rows are the same objects while they say the same thing (`useRoom`), and
 * a row reads the room from here and draws again only when something it draws has changed.
 */
function useRoomView(row: RowContext): RoomView | undefined {
  const { space, lanes, runs, routes, flash, pulse, marking, snapshot } = row;
  const { selfId, files, openSpace, openAgent, feedback, pin, edit, store, details, deleting } =
    row;
  const { quote, toReplies } = row;
  const here = space?.id;
  const named = space !== undefined && namesAuthors(space);
  const offline = snapshot.connection !== "open";
  const { directory, busy, spaceIcons } = snapshot;
  const unsent = snapshot.unsentNotes ?? NO_NOTES;
  const inSpace = space === undefined ? undefined : standingIn(snapshot.model, space, selfId);
  const inWorkspace = myRole(snapshot.model, selfId);
  const standing = useMemo(() => ({ inSpace, inWorkspace }), [inSpace, inWorkspace]);
  const reply = useCallback(
    (line: LineModel) => {
      if (here !== undefined) startReply(here, line.id);
    },
    [here],
  );
  const project = useMemo(() => projectActions(store, here ?? ""), [store, here]);
  const shared = useMemo(
    () =>
      here === undefined
        ? undefined
        : {
            here,
            directory,
            named,
            offline,
            spaceIcons,
            selfId,
            files,
            openSpace,
            openAgent,
            feedback,
            pin,
            edit,
            store,
            details,
            deleting,
            standing,
            quote,
            toReplies,
            reply,
            project,
          },
    [
      here,
      directory,
      named,
      offline,
      spaceIcons,
      selfId,
      files,
      openSpace,
      openAgent,
      feedback,
      pin,
      edit,
      store,
      details,
      deleting,
      standing,
      quote,
      toReplies,
      reply,
      project,
    ],
  );
  const pinned = useMemo(
    () => new Set(space === undefined ? [] : pinnedLines(space).map((line) => line.id)),
    [space],
  );
  return useMemo(
    () =>
      space === undefined || shared === undefined
        ? undefined
        : { space, lanes, runs, routes, busy, unsent, flash, pulse, marking, pinned, shared },
    [space, lanes, runs, routes, busy, unsent, flash, pulse, marking, pinned, shared],
  );
}

const NO_NOTES: ReadonlyMap<string, UnsentNote> = new Map();

/** The list's `renderItem`, one for the room's life: what a row draws, it reads from the room. */
function renderRow({ item }: { readonly item: Row }) {
  return <RoomRow item={item} />;
}

/**
 * A row: the line inside its turn, rising in if it has just landed and flashed if it was pointed
 * at; a fold of harnesses talking; or the foot, which carries what it draws.
 */
function RoomRow({ item }: { readonly item: Row }) {
  const room = useContext(RoomRows);
  if (room === undefined) return null;
  const { shared } = room;
  if (isFoot(item)) {
    return (
      <RoomFoot
        foot={item}
        store={shared.store}
        selfId={shared.selfId}
        onDetails={shared.details}
      />
    );
  }
  if (isFold(item)) {
    return (
      <Fold
        fold={item}
        directory={shared.directory}
        onExchange={(state) => {
          shared.store.setExchange(shared.here, state).catch(() => undefined);
        }}
      >
        {item.lines.map((line) => (
          <View key={line.id}>{drawLine(room, line, "only", true)}</View>
        ))}
      </Fold>
    );
  }
  return <TurnRow drawn={item} room={room} />;
}

/**
 * A line in its turn, drawn again only when what it draws has changed: the line and its place,
 * its run, its lane, its route, whether it is busy, a note on it refused, whether it is the one flashed, or what every
 * row draws the same way. A fork or a new agent is drawn from the whole space, and again with it.
 */
function TurnRow({ drawn, room }: { readonly drawn: Drawn; readonly room: RoomView }) {
  const { line } = drawn;
  const { run, lane } = behind(room.runs, room.lanes, line);
  const route = room.routes.get(line.id);
  const busy = room.busy.has(line.id);
  const unsent = room.unsent.get(line.id);
  const lit = room.flash === line.id ? room.pulse : -1;
  const marked = marksOn(room, line);
  const whole = line.fork !== undefined || line.newAgent !== undefined ? room.space : undefined;
  const pinned = room.pinned.has(line.id);
  // The message a reply quotes changes without the reply changing: an edit, a deletion.
  const quoted = cardKey(replyOf(room, line));
  const replies = repliesTo(room.space, line).join();
  const changed = changeKey(room, line);
  // biome-ignore lint/correctness/useExhaustiveDependencies: drawn from these alone (see above).
  return useMemo(
    () => <Turn drawn={drawn}>{drawLine(room, line, drawn.place, false)}</Turn>,
    [
      drawn,
      run,
      lane,
      route,
      busy,
      unsent,
      lit,
      marked,
      whole,
      pinned,
      quoted,
      replies,
      changed,
      room.shared,
    ],
  );
}

/** The change to the room's project a reply carries (ADR 0222), and what its page reads it with. */
function changeOfLine(room: RoomView, line: LineModel): LineChange | undefined {
  const change = changeOf(room.space.project, line.change);
  if (change === undefined) return undefined;
  const words = filesChangedWords(change);
  return {
    space: room.space,
    directory: room.shared.directory,
    commit: change.commit,
    words: change.undoneBy === undefined ? words : `${words} · Undone`,
    guest: room.shared.standing.inSpace === "guest",
    project: room.shared.project,
  };
}

/** What a reply's change draws, so its row draws again once the change is undone. */
function changeKey(room: RoomView, line: LineModel): string {
  const change = changeOf(room.space.project, line.change);
  return change === undefined ? "" : `${change.commit}:${change.undoneBy ?? ""}`;
}

/** The card of the message a line replies to (ADR 0219), as the room has that message now. */
function replyOf(room: RoomView, line: LineModel): ReplyCardModel | undefined {
  return line.replyTo === undefined
    ? undefined
    : replyCard(room.space, line, room.shared.directory, Date.now());
}

/** What a card draws, as one string, so a row draws again only when it changes. */
function cardKey(card: ReplyCardModel | undefined): string {
  if (card === undefined) return "";
  const photo = card.holds?.kind === "photo" ? card.holds.attachment.id : "";
  return [card.state, card.name, card.day, card.words, photo].join("\u0000");
}

/** The words marked in a line: a search's, in the line it opened, while that line is the one lit. */
function marksOn(room: RoomView, line: LineModel): readonly string[] | undefined {
  const { marking } = room;
  return marking?.id === line.id && room.flash === line.id ? marking.terms : undefined;
}

function drawLine(room: RoomView, line: LineModel, place: Drawn["place"], inFold: boolean) {
  const { shared, space } = room;
  const { selfId, store } = shared;
  return (
    <Flash on={room.flash === line.id} pulse={room.pulse} id={line.id}>
      {line.fork !== undefined ? (
        <ForkLine line={line} space={space} selfId={selfId} store={store} />
      ) : line.newAgent !== undefined ? (
        <NewAgentLine line={line} space={space} selfId={selfId} store={store} />
      ) : (
        <ReplySwipe enabled={mayReply(line)} onReply={() => shared.reply(line)}>
          <Line
            line={line}
            directory={shared.directory}
            selfId={selfId}
            named={shared.named || inFold}
            place={place}
            {...behind(room.runs, room.lanes, line)}
            route={room.routes.get(line.id)}
            busy={room.busy.has(line.id)}
            unsent={room.unsent.get(line.id)}
            offline={shared.offline}
            onFeedback={shared.feedback}
            onOpenSpace={shared.openSpace}
            onOpenAgent={shared.openAgent}
            here={shared.here}
            files={shared.files}
            faces={shared.spaceIcons}
            marks={marksOn(room, line)}
            deleting={shared.deleting}
            mayTakeBack={mayDelete(line, selfId, shared.standing)}
            onPin={pinsLine(line, shared.standing) ? shared.pin : undefined}
            pinned={room.pinned.has(line.id)}
            onEdit={shared.edit}
            reply={replyOf(room, line)}
            onQuote={shared.quote}
            replies={repliesTo(space, line)}
            onReplies={shared.toReplies}
            onReply={shared.reply}
            change={changeOfLine(room, line)}
          />
        </ReplySwipe>
      )}
    </Flash>
  );
}

/** Whether the reader may pin this line: a message in the log, by anyone in the room but a guest (M5.4). */
function pinsLine(line: LineModel, standing: Standing): boolean {
  const said = line.kind === "text" && line.pending !== true && line.deleted !== true;
  return said && mayPin(standing.inSpace);
}

/**
 * Whether a row has just landed, and how (`Arrival`), asked once for each as its cell is first
 * drawn (`ColourList`): a line that was not in the room when it opened. It comes in under the row
 * above it; any other is drawn where it stands. A line of yours rises in wherever that leaves it;
 * anybody else's is read from its start when it is taller than the glass (Arjun, 6 October 2026:
 * "show the start of long replies"), and the first after one of yours is its answer, which the room
 * goes to from up the history as well (`useFollowOwn`).
 *
 * The words of a send from this room's own field come in flying from it (`SendFlight.tsx`), so
 * they do not rise in as well: the rise is the UI thread's, which no measurement of the room sees,
 * and the words would land short by it.
 */
function useArrivals({
  known,
  flown,
  selfId,
  directory,
  follows,
  answers,
}: {
  readonly known: Set<string>;
  readonly flown: Landing;
  readonly selfId: string;
  readonly directory: Directory;
  readonly follows: (line: LineModel) => boolean;
  readonly answers: (line: LineModel) => boolean;
}): (row: Row) => Arrival | undefined {
  const decided = useRef(new Map<string, Arrival | undefined>());
  // Asked as a cell is drawn, which is before this render's effects: what it reads is this render's.
  return useCallback(
    (row: Row) => {
      const first = firstLine(row);
      if (first === undefined) return undefined;
      const key = isFold(row) ? `fold:${keyOfLine(first)}` : keyOfLine(first);
      // Back by Undo (ADR 0167): it forms again from its dust where it was, and does not arrive.
      if (returning.has(first.id)) {
        decided.current.set(key, undefined);
        return undefined;
      }
      if (decided.current.has(key)) return decided.current.get(key);
      const mine = saidBy(first, directory).id === selfId;
      const arrives = !known.has(keyOfLine(first)) && flown.held() !== key;
      known.add(keyOfLine(first));
      const arrival = arrives ? arrivalOf(first, mine, follows, answers) : undefined;
      decided.current.set(key, arrival);
      return arrival;
    },
    [known, directory, selfId, flown, follows, answers],
  );
}

/** The line a row draws first: its own, or the first of its fold; the foot draws none. */
function firstLine(row: Row): LineModel | undefined {
  if (isFoot(row)) return undefined;
  return isFold(row) ? row.lines[0] : row.line;
}

/** How a line that has just landed comes in: yours, the answer to yours, or anybody else's. */
function arrivalOf(
  line: LineModel,
  mine: boolean,
  follows: (line: LineModel) => boolean,
  answers: (line: LineModel) => boolean,
): Arrival {
  if (mine) return follows(line) ? "sent" : "rises";
  return answers(line) ? "answers" : "opens";
}

/** The foot over the rows above it (`CellRendererComponentStyle`), and every other row as it is. */
function footOver({ item }: { readonly item: Row }) {
  return isFoot(item) ? styles.over : undefined;
}

/**
 * The room's foot, under the newest line: the thinking of each harness at work, the first to work
 * in the room first, and the asks, above the composer, where the answer is wanted.
 */
function RoomFoot({
  foot,
  store,
  selfId,
  onDetails,
}: {
  readonly foot: FootRow;
  readonly store: Store;
  readonly selfId: string;
  readonly onDetails: ((item: NeedsYouItem) => void) | undefined;
}) {
  const { doing, asks, snapshot, resting } = foot;
  // Nothing at the foot stands nothing off the newest line.
  if (doing.length === 0 && asks.length === 0) return <View testID="space-foot" />;
  return (
    <View style={styles.foot} testID="space-foot">
      {doing.map((each) => (
        <ThinkingBubble
          key={each.harnessId}
          doing={each}
          directory={snapshot.directory}
          resting={resting}
        />
      ))}
      <Asks items={asks} snapshot={snapshot} selfId={selfId} store={store} onDetails={onDetails} />
    </View>
  );
}

/**
 * One row of the list: the separator, when the line begins after a silence, then the line —
 * standing off the turn before it, or two points under its own turn's last bubble. The margin
 * is the row's rather than the list's gap because a turn's bubbles are closer than turns are,
 * and it is inside the row's cell, so a row that lands comes in with its gap over it
 * (`MovingCell`).
 *
 * The gap moves with the room (`Moving`). A line deleted, or brought back by Undo, joins the turns
 * either side of it or parts them, and the line under it gains or loses a turn's gap: its cell grew
 * or shrank on the spring while the gap inside it changed at once, and the bubble jumped twelve
 * points and slid back, the list being inverted (the simulator, 15 October 2026, ADR 0167).
 */
function Turn({ drawn, children }: { readonly drawn: Drawn; readonly children: ReactNode }) {
  const palette = usePalette();
  const opens = drawn.place === "only" || drawn.place === "first";
  return (
    <Moving style={opens ? styles.turn : styles.grouped}>
      {drawn.separator ? (
        <Text style={[styles.separator, { color: palette.ink3 }]} testID="separator">
          {separatorLabel(drawn.line.ts, Date.now())}
        </Text>
      ) : null}
      {children}
    </Moving>
  );
}

/**
 * Harnesses talking to each other, folded (ADR 0081, point 7): their faces either side of a two-way
 * arrow, how many messages, and the latest line under them — collapsed by default, open on a tap,
 * never gone. Opened, the lines inside are the room's own lines. Under it, once the talk is worth a
 * word, the referee's line says how much they have said since you last acted (ADR 0097), in the
 * margin as the room's other margin lines are, drawn from the lines and never sent. At the
 * warning it offers *Let them carry on* and *Pause them*; once Chips holds them it says so.
 */
function Fold({
  fold,
  directory,
  onExchange,
  children,
}: {
  readonly fold: FoldRow;
  readonly directory: Directory;
  readonly onExchange: (state: "paused" | "going") => void;
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  const [open, setOpen] = useState(false);
  const who = foldParticipants(fold.lines);
  const [first, ...rest] = who;
  const latest = fold.lines.at(-1);
  const count = `${fold.lines.length} ${fold.lines.length === 1 ? "message" : "messages"}`;
  const names = who.map((id) => nameOf(directory, id)).join(" and ");
  return (
    <View style={styles.turn}>
      {fold.separator && latest !== undefined ? (
        <Text style={[styles.separator, { color: palette.ink3 }]} testID="separator">
          {separatorLabel(fold.lines[0]?.ts ?? latest.ts, Date.now())}
        </Text>
      ) : null}
      <View
        // Half the grey of a bubble, as the mock has it, so the bubbles inside stand out on it.
        style={[
          styles.fold,
          { borderColor: palette.line, backgroundColor: alpha(palette.surface2, FOLD_GROUND) },
        ]}
        testID="fold"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${names}, ${count}`}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((now) => !now)}
          style={styles.foldHead}
          testID="fold-head"
        >
          {first === undefined ? null : (
            <Faces step={stepOf(directory, [first])} size="xs" ground={palette.surface2} />
          )}
          {rest.length === 0 ? null : (
            <>
              <Arrow glyph="⇄" />
              <Faces step={stepOf(directory, rest)} size="xs" ground={palette.surface2} />
            </>
          )}
          <Text style={[styles.foldCount, { color: palette.ink2 }]}>{count}</Text>
          <View style={[styles.foldChevron, open ? styles.foldOpen : null]}>
            <Text style={{ color: palette.ink3 }}>›</Text>
          </View>
        </Pressable>
        {open ? (
          <View style={styles.foldLines}>{children}</View>
        ) : latest === undefined ? null : (
          <Text numberOfLines={1} style={[styles.foldLatest, { color: palette.ink3 }]}>
            <Text style={{ color: palette.ink2, fontWeight: "600" }}>
              {nameOf(directory, latest.authorId)}:
            </Text>{" "}
            {plainWords(latest.text)}
          </Text>
        )}
      </View>
      {fold.guard === undefined ? null : <RefereeLine guard={fold.guard} onExchange={onExchange} />}
    </View>
  );
}

/**
 * The referee's line under a fold (ADR 0097): how much they have said, and, at the warning, its
 * two taps; once Chips holds them, in red, with none.
 */
function RefereeLine({
  guard,
  onExchange,
}: {
  readonly guard: ExchangeLine;
  readonly onExchange: (state: "paused" | "going") => void;
}) {
  const palette = usePalette();
  return (
    <View style={styles.exchange} testID="exchange-line">
      <Text
        style={[styles.guard, { color: guard.stage === "held" ? palette.redInk : palette.ink3 }]}
        testID="guard-line"
      >
        {guard.text}
      </Text>
      {guard.stage === "warning" ? (
        <View style={styles.exchangeTaps}>
          <ExchangeTap label="Let them carry on" onPress={() => onExchange("going")} />
          <ExchangeTap label="Pause them" onPress={() => onExchange("paused")} />
        </View>
      ) : null}
    </View>
  );
}

/** One of the referee line's two taps (ADR 0097). */
function ExchangeTap({ label, onPress }: { readonly label: string; readonly onPress: () => void }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.exchangeTap, { borderColor: palette.line2 }]}
    >
      <Text style={[styles.exchangeTapWords, { color: palette.ink2 }]}>{label}</Text>
    </Pressable>
  );
}

/** How much of a bubble's grey the fold's card is drawn in. */
const FOLD_GROUND = 0.5;

/** Who talked in a fold: each author, and whom they addressed, in the order they came in. */
function foldParticipants(lines: readonly LineModel[]): string[] {
  const who: string[] = [];
  for (const line of lines) {
    for (const id of [line.authorId, ...(line.addressedTo ?? line.mentions ?? [])]) {
      if (!who.includes(id)) who.push(id);
    }
  }
  return who;
}

/**
 * The asks the space is holding, as cards: Approve and Deny for the reader
 * policy named, Details for the rest of what an ask can take, and a card with no buttons for
 * somebody else's, which the card says. A question is answered here, on its card, under what the
 * harness said about it — not on a screen of its own that shows the prompt alone.
 */
function Asks({
  items,
  snapshot,
  selfId,
  store,
  onDetails,
}: {
  readonly items: readonly NeedsYouItem[];
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly store: Store;
  readonly onDetails: ((item: NeedsYouItem) => void) | undefined;
}) {
  const now = useNow(items.some((item) => item.expiresAt !== undefined));
  if (items.length === 0) return null;
  return (
    <View style={styles.asks} testID="room-asks">
      {items.map((item) => {
        const approval = approvalFor(item, snapshot);
        const mine =
          approval !== undefined && approval.resolved === undefined && mayAnswer(approval, selfId);
        const runId = item.runId;
        const question = item.outside === true ? undefined : questionFor(item, snapshot);
        return (
          <NeedsCard
            key={`${item.kind}:${item.id}`}
            item={item}
            snapshot={snapshot}
            now={now}
            busy={snapshot.busy.has(item.id)}
            {...(mine && runId !== undefined
              ? {
                  onDecide: (_approval: unknown, decision: "approved" | "denied") =>
                    store.resolveApproval({
                      spaceId: item.spaceId,
                      runId,
                      approvalId: item.id,
                      decision,
                      scope: "once",
                    }),
                }
              : {})}
            {...(question === undefined
              ? {}
              : {
                  answer: {
                    question,
                    onAnswer: (answers: readonly Chosen[]) =>
                      store.answerQuestion({
                        spaceId: item.spaceId,
                        runId: question.runId,
                        askId: question.askId,
                        answers: answers.map((each) => ({ ...each })),
                      }),
                  },
                })}
            {...(onDetails === undefined ? {} : { onDetails: () => onDetails(item) })}
          />
        );
      })}
    </View>
  );
}

/**
 * The lines pinned to the top of the space, each by its words without marks. A strip, because a
 * phone has no margin to spare.
 */
function Pins({ space }: { readonly space: Parameters<typeof visibleLines>[0] }) {
  const palette = usePalette();
  const pinned = pinnedLines(space);
  if (pinned.length === 0) return null;
  return (
    <View style={[styles.pins, { borderColor: palette.line, backgroundColor: palette.surface2 }]}>
      {pinned.map((line) => (
        <Text key={line.id} numberOfLines={1} style={[styles.pin, { color: palette.ink2 }]}>
          📌 {plainWords(line.text)}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // The room's own box: the list fills it, and the chrome floats inside it. Everything that
  // floats is positioned against this rather than against the screen, so the keyboard taking
  // the bottom half takes it from here (`KeyboardRoom`) and the foot rides up with it.
  stack: { flex: 1 },
  // The list takes the screen's height. Without it the list is as tall as its content wants to
  // be, which inside a flex column is nothing at all: the lines render and are clipped away.
  list: { flex: 1 },
  // What an empty room says, over its list.
  pinned: { position: "absolute", left: 0, right: 0 },
  reach: { position: "absolute", left: 0, right: 0 },
  // The chrome at the room's foot, floating over the lines rather than standing under them.
  // `foot` below is the other one: the list's own, which is its header because it is inverted.
  floating: { position: "absolute", left: 0, right: 0, bottom: 0 },
  footRow: { alignItems: "center" },
  lines: { padding: SPACE.lg },
  // A turn stands off the one before it; a bubble inside a turn sits two points under the last.
  turn: { marginTop: TURN_GAP },
  grouped: { marginTop: GROUPED_GAP },
  separator: { alignSelf: "center", fontSize: TEXT.xs, fontWeight: "600", paddingBottom: SPACE.sm },
  // The foot of the room, under the newest line: what the harness is thinking, then its asks.
  foot: { gap: SPACE.lg, paddingTop: SPACE.lg },
  over: { zIndex: 1 },
  asks: { gap: SPACE.md, paddingBottom: SPACE.sm },
  pins: { borderBottomWidth: 1, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm, gap: 2 },
  pin: { fontSize: TEXT.sm },
  // What the room says of itself over the composer: that it is closed, who won't hear yet.
  asides: { paddingHorizontal: SPACE.md, gap: SPACE.sm },
  asideWords: { fontSize: TEXT.sm },
  // The fold (ADR 0081): a quiet card of the room's own grey, with the latest line under its head.
  fold: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, overflow: "hidden" },
  foldHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    minHeight: 36,
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.sm,
  },
  foldCount: { fontSize: TEXT.md - 1, fontWeight: "600" },
  foldChevron: { marginLeft: "auto" },
  foldOpen: { transform: [{ rotate: "90deg" }] },
  foldLatest: {
    fontSize: TEXT.md - 1,
    paddingHorizontal: SPACE.md,
    paddingTop: 2,
    paddingBottom: SPACE.sm + 1,
  },
  foldLines: { gap: SPACE.sm, padding: SPACE.sm + 2, paddingTop: SPACE.xs },
  // The referee's line and its taps, in the margin under the fold (ADR 0097).
  exchange: { alignItems: "center", gap: SPACE.xs },
  exchangeTaps: { flexDirection: "row", gap: SPACE.sm, justifyContent: "center" },
  exchangeTap: {
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
  },
  exchangeTapWords: { fontSize: TEXT.sm, fontWeight: "600" },
  // The guard's line, in the margin under the fold, as the room's other margin lines are.
  guard: {
    fontSize: TEXT.sm,
    textAlign: "center",
    paddingTop: SPACE.sm,
    lineHeight: TEXT.sm * 1.4,
  },
});
