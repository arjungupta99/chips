/**
 * The media viewer on the phone (the media viewer proposal, §4.2; ADR 0057): the host a room
 * mounts once, and the viewer it opens over itself.
 *
 * **The provider.** `MediaProvider` wraps a room. It holds the tile registry (`tiles.ts`) and
 * which tile, if any, was tapped; the viewer's own state — the item it stands on, the chrome, the
 * menu — lives in the viewer below it, so paging through forty photos never redraws the room's
 * list. Opening puts the keyboard away, and it stays away as the viewer leaves. The room hears
 * from it twice: `onReveal`, when the item the viewer *comes to rest on* hangs under a line whose
 * tile is not on the glass, so the room can scroll there under the opaque stage and have a tile to
 * return to — once the paging settles, and never at a page a flick only passed through
 * (`useRevealing`); and `onGoTo`, after *Go to message* has closed the viewer onto a line.
 *
 * **The viewer.** A transparent `Modal` over everything, so the room shows through as the
 * backdrop clears; the stage (`Stage.tsx`), the bars (`Chrome.tsx`) and the menu (`Actions.tsx`)
 * inside it. It opens on the tile that was tapped, drawing the thumbnail that tile already has,
 * and fetches the view copy of the current item and its two neighbours, and nothing further; what
 * comes back while the picture is still in flight waits until it has landed. A video the server
 * never measured opens from its row on a deck of that one video, and with no tile to go back to it
 * closes with the shrink-and-fade.
 *
 * **A video** plays on the stage when it is landed on, pauses when it is left and goes on when it
 * is come back to (`VideoItem.tsx`, one player for the viewer). Its controls are iOS's own player's
 * (`Controls.tsx`), and so is a tap: it brings the bars or takes them away, and leaves the film
 * playing, or paused, as it was; the middle disc is what plays and pauses. The bars hide by
 * themselves three seconds into playing. A drag to dismiss pauses it, and springing home puts it
 * back as it was.
 *
 * Every way out — Close, the drag, the pinch, the platform's back, *Go to message* — goes through
 * `close`, which asks the current item's tile where it is at that moment and hands the stage its
 * frame to fly back to, or nothing, for the shrink-and-fade.
 *
 * **A screen reader** meets the stage as one adjustable element named for the item — *Photo 8 of
 * 8, receipt.jpg, from Arjun, today at 11:26 AM* — which a swipe up or down pages, and each page
 * is announced; the bars are buttons; the room behind is hidden, by `accessibilityViewIsModal` on
 * iOS and by the modal's own window on Android; and the escape gesture closes.
 */

import {
  type DeckItem,
  type Directory,
  hasPoster,
  type Lane,
  nameOf,
  type Rect,
  type Space,
} from "@chipschat/core";
import * as Clipboard from "expo-clipboard";
import type { VideoView } from "expo-video";
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
  type AccessibilityActionEvent,
  AccessibilityInfo,
  Keyboard,
  Modal,
  type ModalProps,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { faceProps } from "../agents/face";
import { thisDevice } from "../device/word";
import type { FileService, Viewed } from "../spaces/files";
import { base64Of, canSaveToLibrary, saveToLibrary } from "../spaces/local";
import { clockTime, dayLabel, separatorLabel } from "../spaces/when";
import { Button } from "../ui/Button";
import { isWide } from "../ui/layout";
import { useSheetRest } from "../ui/Sheet";
import { SPACE, TEXT } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";
import { type Action, Actions } from "./Actions";
import { Chrome, type Who } from "./Chrome";
import { type Closing, Stage, type StageItem } from "./Stage";
import {
  type Corners,
  type Covered,
  createTiles,
  measureView,
  type TileKey,
  type Tiles,
  uncovered,
} from "./tiles";
import { standing, useDeck } from "./useDeck";
import { SystemPlayer, useVideo, type Video, VideoItem } from "./VideoItem";
import { ViewerWindow } from "./ViewerWindow";

/** The bars arrive this long after the picture starts to move: the eye follows one thing. */
export const CHROME_AFTER_MS = 120;
/** How long a word after an action — *Saved*, *Copied* — stands in the caption. */
const NOTICE_MS = 2500;
/** A playing video's bars go by themselves this long after they came, or after a control was used. */
export const CHROME_HIDES_MS = 3000;
/** The room follows the viewer this long after the last page: a flick through ten photos asks once. */
export const REVEAL_AFTER_MS = 500;
/** The longest the flight waits for a picture once the modal is up: past this it flies with none. */
export const HELD_AT_MOST_MS = 300;
/** A pointer has no swipe, so the web target draws arrows. */
const POINTER = Platform.OS === "web";
const ORIENTATIONS: NonNullable<ModalProps["supportedOrientations"]> = ["portrait", "landscape"];
/** A room whose chrome stands beside its lines rather than over them. */
const NOTHING_COVERED: Covered = { top: 0, bottom: 0 };

/** A tap on a tile: which picture, under which line, from where on the glass, drawn with what. */
export interface Opening {
  readonly lineId: string;
  readonly attachmentId: string;
  /** The tile's frame in the window; nothing when it could not say, which opens with a crossfade. */
  readonly from: Rect | undefined;
  /** The tile's corners, when they are not a room tile's (ADR 0161). */
  readonly corners?: Corners | undefined;
  /** Where the room's lines were, so the flight is clipped as the room clips its tiles. */
  readonly within: Rect | undefined;
  /** The thumbnail the tile is drawing, so the first frame is those very pixels. */
  readonly thumb: string | undefined;
  /** A video the server never measured, opened from its row: the deck is that one video. */
  readonly alone?: boolean;
  /**
   * A deck handed over whole: a room's file's versions, from Files (ADR 0100), a space's kept
   * photos and videos, from Media on this phone (ADR 0161), or a room's, from its sheet's Media &
   * files (ADR 0202's addendum).
   */
  readonly deck?: readonly DeckItem[] | undefined;
}

interface Host {
  readonly tiles: Tiles;
  /** Where the room's lines are in the window now: the glass a flight is clipped to. */
  readonly within: () => Promise<Rect | undefined>;
  readonly open: (opening: Opening) => void;
}

const HostContext = createContext<Host | undefined>(undefined);

export function MediaProvider({
  space,
  lanes,
  directory,
  files,
  glass,
  covered,
  onReveal,
  onGoTo,
  children,
}: {
  /** The room whose lines a deck is cut from; none on a page whose tiles hand theirs over whole. */
  readonly space: Space | undefined;
  readonly lanes: readonly Lane[];
  readonly directory: Directory;
  readonly files: FileService | undefined;
  /**
   * The view the room's lines are in. The room clips its tiles to it — a photo at the foot runs
   * under the composer, and a wide layout's pane cuts one at its edge — and so does the flight.
   */
  readonly glass: RefObject<View | null>;
  /**
   * What the room's floating chrome covers of that view, in points — the bar and the pinned strip
   * at its head, the composer at its foot — so a flight is clipped to where a tile is seen, and
   * not to where the lines run. Nothing, for a room whose chrome stands beside its lines.
   */
  readonly covered?: Covered | undefined;
  /**
   * The viewer has come to rest on an item that hangs under this line, and its tile is off the
   * glass: scroll there, unanimated. Asked once the pages stop, not at each one (`useRevealing`).
   */
  readonly onReveal: (lineId: string) => void;
  /** *Go to message* closed the viewer onto this line: land on it, and flash it. */
  readonly onGoTo: (lineId: string) => void;
  readonly children: ReactNode;
}) {
  const [tiles] = useState(createTiles);
  const [opening, setOpening] = useState<Opening | undefined>(undefined);
  // Read as it is when a flight asks and not as it was when the host was made: the composer grows.
  const chrome = useRef<Covered>(NOTHING_COVERED);
  chrome.current = covered ?? NOTHING_COVERED;
  const host = useMemo<Host>(
    () => ({
      tiles,
      within: () =>
        measureView(glass.current).then((rect) =>
          rect === undefined ? undefined : uncovered(rect, chrome.current),
        ),
      open: (next) => {
        // Looking at a picture is not writing a message, so the keys go — by the field being let
        // go of, and not by the modal covering them, or iOS would hand the field its caret back as
        // the viewer left and the keyboard would rise again over the room (Arjun, 20 September
        // 2026). The tile has been measured by the time this is called, so the picture still flies
        // from where the thumb found it, and the frame it flies home to is asked for at the close,
        // by which time the room has settled behind the opaque stage.
        Keyboard.dismiss();
        setOpening((now) => now ?? next);
      },
    }),
    [tiles, glass],
  );
  return (
    <HostContext.Provider value={host}>
      {children}
      {opening === undefined ||
      files === undefined ||
      (space === undefined && opening.deck === undefined) ? null : (
        <MediaViewer
          opening={opening}
          space={space}
          lanes={lanes}
          directory={directory}
          files={files}
          tiles={tiles}
          within={host.within}
          onReveal={onReveal}
          onGoTo={onGoTo}
          onGone={() => setOpening(undefined)}
        />
      )}
    </HostContext.Provider>
  );
}

/**
 * A tile's part in the viewer: a ref to measure, whether its picture is up on the stage (and so
 * hidden here), and how to open the viewer from it — on the room's deck, or on one the tile hands
 * over whole, as Media on this phone hands a space's kept photos (ADR 0161). A tile whose corners
 * are not a room tile's says them, so the flight leaves and lands on its shape. Outside a provider,
 * or with no line to hang under, a tile opens nothing.
 *
 * A last tile that says +N also stands for the pictures past it (`beyond`), which have no tile of
 * their own: an album's, and the room sheet's Media & files' newest eight. They fly home to it, and
 * it hides while one of them is up. Without it, the viewer resting on an album's fifth photo found
 * no tile, took it to be off the glass, and sent the room to centre a line that was already in
 * view; and every one of them shrank and faded as the viewer closed (Foodie, 24 October 2026).
 */
export function useViewerTile(
  lineId: string | undefined,
  attachmentId: string,
  corners?: Corners,
  beyond?: readonly TileKey[],
): {
  readonly ref: RefObject<View | null>;
  readonly hidden: boolean;
  readonly open:
    | ((thumb: string | undefined, deck?: readonly DeckItem[] | undefined) => void)
    | undefined;
} {
  const host = useContext(HostContext);
  // A tile on a sheet is measured once the sheet is drawn at rest: one tapped as the room sheet
  // glides to its Media & files page measured where the page had been (ADR 0202's second addendum).
  const rested = useSheetRest();
  const ref = useRef<View>(null);
  const [hidden, setHidden] = useState(false);
  // Read when the viewer asks, not when the tile joined: the list reflows as files are deleted.
  const shape = useRef(corners);
  shape.current = corners;
  // As words, so a new array of the same keys is not a leave and a join.
  const others = JSON.stringify(beyond ?? []);
  useEffect(() => {
    if (host === undefined || lineId === undefined) return;
    const tile = {
      measure: () => measureView(ref.current),
      hide: setHidden,
      corners: () => shape.current,
    };
    const keys: readonly TileKey[] = [{ lineId, attachmentId }, ...JSON.parse(others)];
    const leaves = keys.map((key) => host.tiles.register(key.lineId, key.attachmentId, tile));
    return () => {
      for (const leave of leaves) leave();
    };
  }, [host, lineId, attachmentId, others]);
  const open =
    host === undefined || lineId === undefined
      ? undefined
      : (thumb: string | undefined, deck?: readonly DeckItem[] | undefined) => {
          // Both at once: a second measure in series would hold the viewer a frame.
          void rested()
            .then(() => Promise.all([measureView(ref.current), host.within()]))
            .then(([from, within]) =>
              host.open({
                lineId,
                attachmentId,
                from,
                corners: shape.current,
                within,
                thumb,
                deck,
              }),
            );
        };
  return { ref, hidden, open };
}

/**
 * A row's part in the viewer: how to open it on the one video the row plays, which the server never
 * measured. A row is no tile — nothing to fly from or back to — so it opens with the crossfade and
 * closes with the shrink-and-fade. Outside a provider, or with no line to hang under, nothing.
 */
export function useViewerRow(
  lineId: string | undefined,
  attachmentId: string,
): (() => void) | undefined {
  const host = useContext(HostContext);
  if (host === undefined || lineId === undefined) return undefined;
  return () =>
    host.open({
      lineId,
      attachmentId,
      from: undefined,
      within: undefined,
      thumb: undefined,
      alone: true,
    });
}

/** What the viewer has to draw an item with, as it arrives. */
interface Pictures {
  readonly thumbs: Readonly<Record<string, string>>;
  readonly views: Readonly<Record<string, Viewed>>;
  readonly failed: Readonly<Record<string, string>>;
  readonly retry: (attachmentId: string) => void;
}

/** The record without `key`, or the very same record where it had none, so nothing redraws. */
function withoutKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const { [key]: _gone, ...rest } = record;
  return rest;
}

function messageOf(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}

/** What a fetch brings back for an item: its thumbnail, or its picture. */
type Fetched = { readonly thumb: string } | { readonly viewed: Viewed };

/** One thing to fetch for an item, under the key that says it has been asked for. */
interface Wanted {
  readonly key: string;
  readonly id: string;
  /** The picture itself, whose failure the viewer says; a thumbnail that does not come is only absent. */
  readonly picture: boolean;
  readonly load: () => Promise<Fetched>;
}

/**
 * An item's thumbnail, and for a photo its view copy, or its original once that was asked for. A
 * video the server never measured has no poster to ask for.
 */
function wantedFor(item: DeckItem, originals: ReadonlySet<string>, files: FileService): Wanted[] {
  const { attachment } = item;
  const id = attachment.id;
  if (item.kind === "video" && !hasPoster(attachment)) return [];
  const thumb: Wanted = {
    key: `thumb:${id}`,
    id,
    picture: false,
    load: async () => ({ thumb: await files.thumb(id) }),
  };
  if (item.kind !== "photo") return [thumb];
  const original = originals.has(id);
  const picture: Wanted = {
    key: `${original ? "file" : "view"}:${id}`,
    id,
    picture: true,
    load: async () => ({
      viewed: original
        ? { uri: await files.file(attachment), original: true }
        : await files.view(attachment),
    }),
  };
  return [thumb, picture];
}

/**
 * The thumbnail and the picture of the current item and its two neighbours, and nothing else:
 * a neighbour's view copy is there when a swipe lands on it, and the one beyond is not fetched
 * until it is a neighbour. An item whose original was asked for gets the file itself.
 */
function usePictures(
  deck: readonly DeckItem[],
  index: number,
  files: FileService,
  opening: Opening,
  originals: ReadonlySet<string>,
  opened: boolean,
): Pictures {
  const [thumbs, setThumbs] = useState<Record<string, string>>(() =>
    opening.thumb === undefined ? {} : { [opening.attachmentId]: opening.thumb },
  );
  const [views, setViews] = useState<Record<string, Viewed>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [tries, setTries] = useState(0);
  // The thumbnail the viewer opened with is the tile's own, and is not asked for again.
  const asked = useRef(
    new Set<string>(opening.thumb === undefined ? [] : [`thumb:${opening.attachmentId}`]),
  );
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const take = (id: string, fetched: Fetched) => {
    if ("thumb" in fetched) setThumbs((now) => ({ ...now, [id]: fetched.thumb }));
    else setViews((now) => ({ ...now, [id]: fetched.viewed }));
  };
  const held = useHeld(!opened && opening.thumb !== undefined, take);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tries` is how Try again asks once more.
  useEffect(() => {
    const nearby = deck.slice(Math.max(0, index - 1), index + 2);
    for (const each of nearby.flatMap((item) => wantedFor(item, originals, files))) {
      if (asked.current.has(each.key)) continue;
      asked.current.add(each.key);
      each.load().then(
        (fetched) => {
          if (!mounted.current) return;
          held.take(each.id, fetched);
          // Asked again by itself — the deck changed under it, a reconnect among the reasons — and
          // come: what was said about it is no longer so (ADR 0179).
          if (each.picture) setFailed((now) => withoutKey(now, each.id));
        },
        (failure: unknown) => {
          asked.current.delete(each.key);
          if (mounted.current && each.picture) {
            setFailed((now) => ({ ...now, [each.id]: messageOf(failure) }));
          }
        },
      );
    }
  }, [deck, index, files, originals, tries]);
  const retry = useCallback((attachmentId: string) => {
    setFailed((now) => withoutKey(now, attachmentId));
    setTries((now) => now + 1);
  }, []);
  return { thumbs, views, failed, retry };
}

/**
 * What comes back while the picture is in flight, held until it has landed. A view copy swapped
 * in under a flying picture is a decode and a crossfade on the frames the flight needs, and a
 * neighbour's thumbnail redraws the stage for nothing anyone can see yet; the first open in a
 * process, whose copies are all still to fetch, paid for both in the middle of its flight (Arjun,
 * 23 September 2026). A viewer that opened with nothing on its stage holds nothing back.
 */
function useHeld(
  holding: boolean,
  take: (id: string, fetched: Fetched) => void,
): { readonly take: (id: string, fetched: Fetched) => void } {
  const hold = useRef(holding);
  hold.current = holding;
  const waiting = useRef<{ readonly id: string; readonly fetched: Fetched }[]>([]);
  const latest = useRef(take);
  latest.current = take;
  useEffect(() => {
    if (holding) return;
    const came = waiting.current;
    waiting.current = [];
    for (const each of came) latest.current(each.id, each.fetched);
  }, [holding]);
  return useMemo(
    () => ({
      take: (id: string, fetched: Fetched) => {
        if (hold.current) waiting.current.push({ id, fetched });
        else latest.current(id, fetched);
      },
    }),
    [],
  );
}

/** `today at 11:26 AM`, `yesterday at 9:02 PM`, `on 4 September at 3:10 PM`: said, not read. */
function spokenWhen(ts: string, now: number): string {
  const day = dayLabel(ts, now);
  const said = day === "Today" || day === "Yesterday" ? day.toLowerCase() : `on ${day}`;
  return `${said} at ${clockTime(ts)}`;
}

/** *Photo 8 of 8, receipt.jpg, from Arjun, today at 11:26 AM*: what a screen reader hears first. */
export function labelOf(item: DeckItem, place: number, count: number, who: string): string {
  const kind = item.kind === "photo" ? "Photo" : "Video";
  return `${kind} ${place} of ${count}, ${item.attachment.filename}, from ${who}, ${spokenWhen(item.ts, Date.now())}`;
}

/**
 * The viewer on a deck handed over whole (ADR 0100): a room's file's versions, opened from Files,
 * whose lines may be older than any the room holds. It is drawn where it was opened from — inside
 * the room's sheet, so it stands over it, since iOS presents a modal only from the one that holds
 * it — and has no tile to fly from or back to: it opens with the crossfade and closes with the
 * shrink-and-fade. *Go to message* closes it onto the line, where the room has it.
 */
export function DeckViewer({
  deck,
  attachmentId,
  directory,
  files,
  onGoTo,
  onGone,
}: {
  readonly deck: readonly DeckItem[];
  readonly attachmentId: string;
  readonly directory: Directory;
  readonly files: FileService;
  readonly onGoTo: (lineId: string) => void;
  readonly onGone: () => void;
}) {
  const [tiles] = useState(createTiles);
  const [opening] = useState<Opening>(() => ({
    lineId: deck.find((item) => item.attachment.id === attachmentId)?.lineId ?? attachmentId,
    attachmentId,
    from: undefined,
    within: undefined,
    thumb: undefined,
    deck,
  }));
  return (
    <MediaViewer
      opening={opening}
      space={undefined}
      lanes={NO_LANES}
      directory={directory}
      files={files}
      tiles={tiles}
      within={nowhere}
      onReveal={nothing}
      onGoTo={onGoTo}
      onGone={onGone}
    />
  );
}

const NO_LANES: readonly Lane[] = [];
const nowhere = async (): Promise<Rect | undefined> => undefined;
const nothing = (): void => undefined;

function MediaViewer({
  opening,
  space,
  lanes,
  directory,
  files,
  tiles,
  within,
  onReveal,
  onGoTo,
  onGone,
}: {
  readonly opening: Opening;
  /** The room whose lines the deck is cut from; none for a deck handed over whole. */
  readonly space: Space | undefined;
  readonly lanes: readonly Lane[];
  readonly directory: Directory;
  readonly files: FileService;
  readonly tiles: Tiles;
  /** Where the room's lines are in the window now, asked again at the close. */
  readonly within: () => Promise<Rect | undefined>;
  readonly onReveal: (lineId: string) => void;
  readonly onGoTo: (lineId: string) => void;
  readonly onGone: () => void;
}) {
  const window = useWindowDimensions();
  const still = useReduceMotion();
  const deck = useDeck(
    space,
    lanes,
    directory,
    opening.lineId,
    opening.alone === true ? opening.attachmentId : undefined,
    opening.deck,
  );
  const [currentId, setCurrentId] = useState(opening.attachmentId);
  const before = useRef(0);
  const found = standing(deck, currentId, before.current);
  const index = found ?? 0;
  before.current = index;
  const item = deck[index];
  const [chrome, setChrome] = useState(false);
  const [going, setGoing] = useState(false);
  const statusBarHidden = useStatusBarHidden(chrome, going);
  const [closing, setClosing] = useState<Closing | undefined>();
  const [menu, setMenu] = useState<"open" | "closing" | "closed">("closed");
  const [originals, setOriginals] = useState<ReadonlySet<string>>(() => new Set());
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [opened, setOpened] = useState(false);
  const landed = useCallback(() => setOpened(true), []);
  const pictures = usePictures(deck, index, files, opening, originals, opened);
  const view = useRef<VideoView>(null);
  const video = useVideo(item?.kind === "video" ? item.attachment : undefined, files, view);
  const { pause } = video;
  const [used, setUsed] = useState(0);
  const nudge = useCallback(() => setUsed((now) => now + 1), []);
  const leaving = useRef<{ goTo: string | undefined; started: boolean }>({
    goTo: undefined,
    started: false,
  });
  const revealing = useRevealing(tiles, window, onReveal);

  const close = useCallback(() => {
    if (leaving.current.started) return;
    leaving.current.started = true;
    // Whatever the paging left waiting goes now, so the room ends where the picture did however
    // quickly the viewer was left; the flight measures what that leaves it, as it always has.
    revealing.now();
    pause();
    setChrome(false);
    setGoing(true);
    setMenu((now) => (now === "open" ? "closing" : now));
    const now = item;
    if (now === undefined) {
      // Nothing left on the stage to fly anywhere: every message in the deck was taken back.
      tiles.hide(undefined);
      onGone();
      return;
    }
    if (still) {
      setClosing({ to: undefined, within: undefined });
      return;
    }
    // The tile and the glass together: the flight goes back to the one, clipped by the other.
    void Promise.all([tiles.measure(now.lineId, now.attachment.id, window), within()]).then(
      ([to, glass]) =>
        setClosing({ to, within: glass, corners: tiles.corners(now.lineId, now.attachment.id) }),
    );
  }, [item, still, tiles, window, within, onGone, pause, revealing]);

  useArrival(setChrome);
  const follow = useFollow(
    item,
    { index: index + 1, count: deck.length },
    tiles,
    revealing.after,
    directory,
    close,
  );
  useEffect(() => {
    if (item !== undefined && item.attachment.id !== currentId) setCurrentId(item.attachment.id);
  }, [item, currentId]);

  useHidingWhilePlaying(
    item?.kind === "video" && video.state.playing && menu === "closed",
    chrome,
    setChrome,
    used,
  );
  // A video that has played to its end brings its bars back, with Play to go again.
  useEffect(() => {
    if (video.state.ended > 0) setChrome(true);
  }, [video.state.ended]);

  const say = useNotice(setNotice, setChrome);
  const act = useActions(item, files, originals, setOriginals, say, video, () => {
    leaving.current.goTo = item?.lineId;
    close();
  });

  const items = useStageItems(deck, pictures);
  const goTo = (at: number) => {
    const next = deck[at];
    if (next !== undefined && closing === undefined) setCurrentId(next.attachment.id);
  };
  const page = (by: -1 | 1) => goTo(index + by);

  if (item === undefined) return null;
  const { who, when } = describe(item, directory);
  const { card, missing } = whereSaid(failureOf(item, pictures, video));
  const playable = item.kind === "video" ? video : undefined;
  const onTap = () => {
    if (closing === undefined) setChrome((now) => !now);
  };
  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      supportedOrientations={ORIENTATIONS}
      onRequestClose={close}
      onShow={follow.shown}
      testID="viewer"
    >
      <ViewerWindow statusBarHidden={statusBarHidden} item={item} />
      <View style={StyleSheet.absoluteFill} accessibilityViewIsModal onAccessibilityEscape={close}>
        <Pages label={labelOf(item, index + 1, deck.length, who.name)} onPage={page}>
          <Stage
            items={items}
            index={index}
            from={opening.from}
            corners={opening.corners}
            within={opening.within}
            still={still}
            held={follow.held}
            closing={closing}
            onNext={() => page(1)}
            onPrevious={() => page(-1)}
            onDismiss={close}
            onOpened={landed}
            onDrawn={follow.drawn}
            onClosed={() => {
              tiles.hide(undefined);
              onGone();
              if (leaving.current.goTo !== undefined) onGoTo(leaving.current.goTo);
            }}
            onChrome={(shown) => setChrome(shown && closing === undefined)}
            onTap={onTap}
            onMenu={() => setMenu("open")}
            video={playable === undefined ? undefined : <VideoItem video={playable} />}
            onDragging={video.hold}
          />
        </Pages>
        {card === undefined ? null : (
          <Failure title={card.title} words={card.words} onRetry={card.onRetry} />
        )}
        <Chrome
          shown={chrome}
          item={item}
          deck={deck}
          place={{ index: index + 1, count: deck.length }}
          files={files}
          who={who}
          when={when}
          notice={notice}
          missing={missing}
          video={playable}
          onUsed={nudge}
          onClose={close}
          onShare={() => act("share")}
          onMenu={() => setMenu("open")}
          onGo={goTo}
          {...arrows(index, deck.length, isWide(window.width, window.height), goTo)}
        />
        {playable?.state.system === true ? <SystemPlayer video={playable} /> : null}
        {menu === "closed" ? null : (
          <Actions
            open={menu === "open"}
            item={item}
            who={who.name}
            when={when}
            showingOriginal={pictures.views[item.attachment.id]?.original ?? false}
            canSave={canSaveToLibrary}
            canSystemPlayer={playable?.state.ready ?? false}
            onAction={act}
            onClose={() => setMenu("closing")}
            onGone={() => setMenu("closed")}
          />
        )}
      </View>
    </Modal>
  );
}

/** What would not come, or would not play, with a way to ask again. */
interface Failed {
  readonly title: string;
  readonly words: string;
  readonly onRetry: () => void;
  /**
   * A photo whose preview is on the stage: there is a picture to look at, so it is said small at
   * the foot rather than over it (ADR 0179). A video's poster is not the video, and keeps the card.
   */
  readonly underPreview: boolean;
}

/** Where a failure is said: on a card over the stage, or as the foot's line over a preview. */
function whereSaid(failure: Failed | undefined): {
  readonly card: Failed | undefined;
  readonly missing: (() => void) | undefined;
} {
  return failure?.underPreview === true
    ? { card: undefined, missing: failure.onRetry }
    : { card: failure, missing: undefined };
}

/** What would not come, or would not play, on the stage: said, with a way to ask again. */
function failureOf(item: DeckItem, pictures: Pictures, video: Video): Failed | undefined {
  const id = item.attachment.id;
  const words = item.kind === "photo" ? pictures.failed[id] : video.state.failed;
  if (words === undefined) return undefined;
  if (item.kind === "photo") {
    return {
      title: "Could not fetch the photo.",
      words,
      onRetry: () => pictures.retry(id),
      underPreview: pictures.thumbs[id] !== undefined,
    };
  }
  // The poster stays, and says why: the copy is on its way, and Try again asks for it (§4.2).
  return video.state.waitingForCopy
    ? {
        title: `${thisDevice(true)} cannot play the original.`,
        words: "The copy that plays everywhere is being made. Try again in a minute.",
        onRetry: video.retry,
        underPreview: false,
      }
    : { title: "Could not play the video.", words, onRetry: video.retry, underPreview: false };
}

/** Who sent an item, as the room names them, and when, as the room's separator says it. */
function describe(
  item: DeckItem,
  directory: Directory,
): { readonly who: Who; readonly when: string } {
  return {
    who: { name: nameOf(directory, item.saidBy), ...faceProps(directory, item.saidBy) },
    when: separatorLabel(item.ts, Date.now()),
  };
}

/** The deck as the stage draws it, with whatever pictures have come. */
function useStageItems(deck: readonly DeckItem[], pictures: Pictures): readonly StageItem[] {
  const { thumbs, views } = pictures;
  return useMemo(
    () =>
      deck.map(
        ({ attachment, kind }): StageItem => ({
          id: attachment.id,
          kind,
          content: { width: attachment.width ?? 0, height: attachment.height ?? 0 },
          thumb: thumbs[attachment.id],
          picture: views[attachment.id]?.uri,
          original: views[attachment.id]?.original ?? false,
        }),
      ),
    [deck, thumbs, views],
  );
}

/**
 * Who gets arrows: an arrow each way there is somewhere to go, where there is a pointer to click
 * one — the web target, whatever the window — or where the window is wide, which is a tablet, a
 * foldable open, or a ChromeOS window (§4.4, rule 10). A phone gets none: the swipe is the whole
 * of it, and two marks over a four-inch stage are in the way of the picture.
 *
 * The window decides and never the device, so an iPad in the narrow third of a split loses them
 * with the filmstrip, and the web target keeps them there because a mouse still cannot swipe.
 */
function arrows(
  index: number,
  count: number,
  wide: boolean,
  goTo: (at: number) => void,
): { readonly onPrevious?: () => void; readonly onNext?: () => void } {
  if (!POINTER && !wide) return {};
  return {
    ...(index > 0 ? { onPrevious: () => goTo(index - 1) } : {}),
    ...(index < count - 1 ? { onNext: () => goTo(index + 1) } : {}),
  };
}

/**
 * The stage as a screen reader meets it: one element, named for the item, that a swipe up or
 * down pages — the reader's own gesture, where a finger's swipe would be taken for the reader's.
 */
function Pages({
  label,
  onPage,
  children,
}: {
  readonly label: string;
  readonly onPage: (by: -1 | 1) => void;
  readonly children: ReactNode;
}) {
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === "increment") onPage(1);
    if (event.nativeEvent.actionName === "decrement") onPage(-1);
  };
  return (
    <View
      style={StyleSheet.absoluteFill}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityActions={PAGE_ACTIONS}
      onAccessibilityAction={onAccessibilityAction}
    >
      {children}
    </View>
  );
}

const PAGE_ACTIONS = [{ name: "increment" }, { name: "decrement" }];

/**
 * Whether the status bar is away. It goes with the bars once they have come, and never before:
 * hidden from the viewer's first frame and shown again as the bars arrived 120 ms later, it
 * blinked at every open (Arjun, 23 September 2026). And it is the room's again from the moment
 * the viewer starts to leave (`going`), whatever the bars were doing, so the room is not handed it
 * back in a blink of its own as the modal goes.
 */
export function useStatusBarHidden(chrome: boolean, going: boolean): boolean {
  const barsCame = useRef(false);
  if (chrome) barsCame.current = true;
  return barsCame.current && !chrome && !going;
}

/** The bars come in a beat after the picture begins to move. */
function useArrival(setChrome: (shown: boolean) => void) {
  useEffect(() => {
    const timer = setTimeout(() => setChrome(true), CHROME_AFTER_MS);
    return () => clearTimeout(timer);
  }, [setChrome]);
}

/**
 * The room's scroll to the line the viewer stands on, held until the paging settles (rule 3).
 *
 * The whole of the room's list moves to answer this, and it moves under an opaque stage where
 * nobody can watch it: its one purpose is that there is a tile to fly home to when the viewer
 * closes. Asked at every page a flick passes through — a viewer opened at the foot of a long room
 * and paged back up it asks at each one, and each is a list re-laid out and a screenful of rows
 * mounted — it is that work, on the thread the swipe is drawn on, that the swipe loses its frames
 * to (Arjun, 21 September 2026).
 *
 * So a page asks and the ask waits: the item the viewer comes to rest on is the one the room
 * follows, and the pages passed through on the way ask for nothing. Closing sends whatever is
 * waiting at once, so the room ends where the picture did however quickly the viewer was left —
 * and a viewer closed inside that beat flies home only if the tile was there anyway, which is what
 * the shrink-and-fade has always been for.
 */
function useRevealing(
  tiles: Tiles,
  window: { readonly width: number; readonly height: number },
  onReveal: (lineId: string) => void,
): {
  /** The viewer landed on this item: the room follows, a beat after the pages stop. */
  readonly after: (lineId: string, attachmentId: string) => void;
  /** Whatever is waiting, now. */
  readonly now: () => void;
} {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const waiting = useRef<{ readonly lineId: string; readonly attachmentId: string } | undefined>(
    undefined,
  );
  // Read where the ask is answered rather than where it was made: the window may have turned since.
  const latest = useRef({ tiles, window, onReveal });
  latest.current = { tiles, window, onReveal };
  useEffect(() => () => clearTimeout(timer.current), []);
  const now = useCallback(() => {
    clearTimeout(timer.current);
    const wanted = waiting.current;
    waiting.current = undefined;
    if (wanted === undefined) return;
    const { tiles: joined, window: glass, onReveal: reveal } = latest.current;
    void joined.measure(wanted.lineId, wanted.attachmentId, glass).then((rect) => {
      if (rect === undefined) reveal(wanted.lineId);
    });
  }, []);
  const after = useCallback(
    (lineId: string, attachmentId: string) => {
      waiting.current = { lineId, attachmentId };
      clearTimeout(timer.current);
      timer.current = setTimeout(now, REVEAL_AFTER_MS);
    },
    [now],
  );
  return useMemo(() => ({ after, now }), [after, now]);
}

/**
 * As the viewer pages: the tile of the item on the stage is hidden in the room, a screen reader
 * hears where it now is, and the room is asked to follow, which it does once the pages stop
 * (`useRevealing`). A deck emptied under the viewer — every message in it taken back — closes it.
 *
 * The first tile goes once the viewer is up over it *and* has drawn its picture — the modal's
 * `onShow` and the stage's `onDrawn`, which this hands back — and not before. Hidden from the
 * viewer's first effect, it went while a cold open was still presenting the modal, and for two
 * frames the room had a hole where the tile had been and the picture was not yet drawn (Arjun, 22
 * September 2026); hidden at the modal's showing alone, the same hole waits on a phone whose first
 * decode in a process is slower than its first presentation. Later the tile and the picture overlap
 * for a frame or two instead, which nobody sees: the picture starts on the tile and only grows.
 *
 * The flight waits for the same two things (`held`), so its first frame is the tile's own pixels
 * and none of it is spent while the modal is still being presented; a picture that has not come
 * `HELD_AT_MOST_MS` after the modal is up lets the flight go anyway, with nothing to hide.
 */
function useFollow(
  item: DeckItem | undefined,
  place: { readonly index: number; readonly count: number },
  tiles: Tiles,
  settle: (lineId: string, attachmentId: string) => void,
  directory: Directory,
  close: () => void,
): { readonly shown: () => void; readonly drawn: () => void; readonly held: boolean } {
  const first = useRef(true);
  const up = useRef({ shown: false, drawn: false });
  const [held, setHeld] = useState(true);
  const latest = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(latest.current), []);
  const lineId = item?.lineId;
  const attachmentId = item?.attachment.id;
  const standing = useRef({ lineId, attachmentId });
  standing.current = { lineId, attachmentId };
  // biome-ignore lint/correctness/useExhaustiveDependencies: it follows the item by its ids; the rest is read as it is when the item changes.
  useEffect(() => {
    if (item === undefined || lineId === undefined || attachmentId === undefined) {
      close();
      return;
    }
    if (up.current.shown && up.current.drawn) tiles.hide({ lineId, attachmentId });
    if (first.current) {
      first.current = false;
      return;
    }
    AccessibilityInfo.announceForAccessibility(
      labelOf(item, place.index, place.count, nameOf(directory, item.saidBy)),
    );
    settle(lineId, attachmentId);
  }, [lineId, attachmentId]);
  const hide = useCallback(() => {
    const now = standing.current;
    if (!up.current.shown || !up.current.drawn) return;
    setHeld(false);
    if (now.lineId !== undefined && now.attachmentId !== undefined) {
      tiles.hide({ lineId: now.lineId, attachmentId: now.attachmentId });
    }
  }, [tiles]);
  const signals = useMemo(
    () => ({
      shown: () => {
        up.current.shown = true;
        hide();
        clearTimeout(latest.current);
        latest.current = setTimeout(() => setHeld(false), HELD_AT_MOST_MS);
      },
      drawn: () => {
        up.current.drawn = true;
        hide();
      },
    }),
    [hide],
  );
  return { ...signals, held };
}

/**
 * A playing video's bars go by themselves, three seconds after they came or after a control was
 * used, so the film is what is watched (§4.6). Paused, scrubbing or with the menu up, they stay.
 */
function useHidingWhilePlaying(
  playing: boolean,
  chrome: boolean,
  setChrome: (shown: boolean) => void,
  used: number,
) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: `used` is how a control keeps the bars a while longer.
  useEffect(() => {
    if (!playing || !chrome) return;
    const timer = setTimeout(() => setChrome(false), CHROME_HIDES_MS);
    return () => clearTimeout(timer);
  }, [playing, chrome, setChrome, used]);
}

/** A word in the caption for a moment, with the bars brought back to say it. */
function useNotice(
  setNotice: (words: string | undefined) => void,
  setChrome: (shown: boolean) => void,
): (words: string) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return useCallback(
    (words: string) => {
      clearTimeout(timer.current);
      setNotice(words);
      setChrome(true);
      timer.current = setTimeout(() => setNotice(undefined), NOTICE_MS);
    },
    [setNotice, setChrome],
  );
}

/** What each of the menu's rows, and the bar's Share, does with the item on the stage. */
function useActions(
  item: DeckItem | undefined,
  files: FileService,
  originals: ReadonlySet<string>,
  setOriginals: (next: ReadonlySet<string>) => void,
  say: (words: string) => void,
  video: Video,
  goTo: () => void,
): (action: Action) => void {
  return (action) => {
    if (item === undefined) return;
    const { attachment } = item;
    const shown = async () =>
      originals.has(attachment.id) ? files.file(attachment) : (await files.view(attachment)).uri;
    const doing: Record<Action, () => Promise<void> | void> = {
      share: () => files.open(attachment),
      save: async () => {
        await saveToLibrary(await files.file(attachment), attachment.filename);
        say(Platform.OS === "android" ? "Saved to the gallery" : "Saved to Photos");
      },
      copy: async () => {
        await Clipboard.setImageAsync(await base64Of(await shown()));
        say("Copied");
      },
      go: goTo,
      original: () => setOriginals(new Set([...originals, attachment.id])),
      system: video.systemPlayer,
    };
    void Promise.resolve()
      .then(doing[action])
      .catch((failure: unknown) => say(messageOf(failure)));
  };
}

/**
 * A photo or a video that would not come, or would not play (figure 9): the thumbnail stays, with
 * why and a way to ask again.
 */
function Failure({
  title,
  words,
  onRetry,
}: {
  readonly title: string;
  readonly words: string;
  readonly onRetry: () => void;
}) {
  return (
    <View style={styles.failure} pointerEvents="box-none" testID="viewer-failure">
      <View style={styles.failureCard}>
        <Text style={styles.failureTitle}>{title}</Text>
        <Text style={styles.failureWords}>{words}</Text>
        <Button label="Try again" onPress={onRetry} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  failure: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACE.xl,
  },
  failureCard: {
    alignItems: "center",
    gap: SPACE.sm,
    padding: SPACE.lg,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  failureTitle: { color: "#ffffff", fontSize: TEXT.md, fontWeight: "600" },
  failureWords: { color: "rgba(255,255,255,0.72)", fontSize: TEXT.sm, textAlign: "center" },
});
