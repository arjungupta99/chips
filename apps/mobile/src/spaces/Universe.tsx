/**
 * Universe on the phone (ADR 0227): what the space made, from the icon at the room's top right, in
 * a sheet with two tabs.
 *
 * - **Phone** has what opens here, under Media, Pages and Files (the addenda of 13 and 14 November
 *   2026), all always shown with their counts. **Media** is the project's pictures as the room's squares,
 *   newest first, each a small copy the computer makes, opening in the room's viewer on its screen
 *   copy (`universeMedia.ts`); a gold dot marks one somebody else brought since Universe was last
 *   opened here. **Pages** draws the start page the agents keep, or the one document, with chips
 *   above it for the documents beside it; several with no start page, listed. A link on a page to
 *   another file of the project opens that file over the sheet. The program's banner stands over
 *   the start page alone, whose links need it. A program never opens on the phone, and Pages says
 *   so. **Files** is every file of the project as Project › Files lists them, each opening where it
 *   belongs: code and other words on the file's own page, with its history, in Files' place.
 *   Universe opens on Pages when there is a start page, else on Media when it has pictures, else on
 *   Pages for a program, else on Files.
 * - **Desktop** is what happens on the person's Mac, as one list (the ADR's second addendum): the
 *   program, which runs on the Mac and never in Chips (ADR 0226's bar), the page, which Chips for
 *   Mac opens in its own window, and the folder, in Finder (ADR 0225).
 *
 * What the space has is core's `readUniverse`, read again as the project moves on.
 *
 * Wider than a phone the sheet is a wide card (`Sheet`'s `wide`): the page takes the window's width,
 * and the tabs stand in the head's line, what is a list kept to a reading width (Arjun, 3 November
 * 2026: "want to be able to make use of ipad width"). The tab is named for the device: iPad on an
 * iPad. A page drawn in the tab opens full screen from the head, over everything, as a page from a
 * link does: from the words already read, so it is there at once.
 */

import {
  commandOf,
  type Directory,
  documentKind,
  fileNameOf,
  fileOpensIn,
  filesInOrder,
  folderOnMacWords,
  isNewSince,
  MAC_ROWS,
  type MacsHeard,
  type MediaItem,
  markdownPage,
  mayUseMac,
  mediaInOrder,
  memberBanner,
  nameOf,
  noStartPageWords,
  ownerNameOf,
  PROGRAMS_ON_MAC,
  PROGRAMS_ON_OWNERS_MAC,
  type ProgramBanner,
  type ProjectChange,
  pageChipName,
  pageOnMacWords,
  pageRowWords,
  programBanner,
  type RecipeRead,
  readUniverse,
  type ShelfName,
  type Shelves,
  type Space,
  type Store,
  startOf,
  type Universe,
  universeOpensOn,
  withHtmlPolicy,
} from "@chipschat/core";
import { Image as Picture } from "expo-image";
import {
  lazy,
  type ReactNode,
  type RefObject,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MediaProvider, useViewerTile } from "../media/MediaViewer";
import { cornersOf } from "../media/tiles";
import { Arrival } from "../ui/Arrival";
import { Button, IconButton } from "../ui/Button";
import { useGround } from "../ui/ground";
import { Opens } from "../ui/growing";
import * as feel from "../ui/haptics";
import { Icon } from "../ui/Icon";
import { useLayout } from "../ui/layout";
import { IOS_SPRING } from "../ui/motion";
import { Segmented } from "../ui/Segmented";
import { Sheet, SheetScroll } from "../ui/Sheet";
import { CLOSE, CLOSE_RISE, CLOSE_ROOM } from "../ui/SheetClose";
import { useSplitSide } from "../ui/Split";
import { usePalette, useScheme } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { UniverseMark, UniverseReading } from "../ui/UniverseMark";
import { useReduceMotion } from "../ui/useReduceMotion";
import { previewBytes } from "./local";
import { Moves, Opening } from "./MacMotion";
import { MacRow, RowButton, RowMark } from "./MacRow";
import { PageSheet } from "./PageSheet";
import { LinkAskSheet, ProgramBannerView, useLinkAsk, useTailscaleLine } from "./ProgramBanner";
import { PAGE_WAITS_MS } from "./pages";
import {
  bytesWords,
  ChangePage,
  type ProjectActions,
  ProjectFilePage,
  projectActions,
} from "./RoomProject";
import { useThumb } from "./RoomTiles";
import { PhoneRun, type RunHeld, useRunBar, useRunOnMac } from "./RunBar";
import {
  createPictureFiles,
  deckOf,
  isRoomLine,
  type PictureFiles,
  picturesOf,
  type Shown,
} from "./universeMedia";
import { seenBefore } from "./universeSeen";
import { dayLabel, separatorLabel } from "./when";

// Required only once a page is drawn, for the reason `pages.ts` gives.
const PageView = lazy(async () => ({
  default: (require("./PageView") as typeof import("./PageView")).PageView,
}));

type Tab = "phone" | "desktop";

/** What the Phone tab shows: the pictures, the pages, or every file (the addenda of 13 and 14 November 2026). */
type Shelf = ShelfName;

/** The shelves as their tabs stand, Pages first (Arjun, 14 November 2026), and their words. */
const SHELVES: readonly { readonly shelf: Shelf; readonly name: string }[] = [
  { shelf: "pages", name: "Pages" },
  { shelf: "media", name: "Media" },
  { shelf: "files", name: "Files" },
];

/** What Files opened in its own place: a file's page, or a change from it, back to that file. */
type Opened =
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "change"; readonly commit: string; readonly from?: string | undefined };

/** A square's corners, as the room's Media squares have them: where the viewer flies from. */
const CORNERS = cornersOf(RADIUS.sm);

/** What the device's own tab is called: the phone's, or an iPad's. */
const HERE = Platform.OS === "ios" && Platform.isPad ? "iPad" : "Phone";

/** As wide as a list or a card of words stands in a wide sheet: a phone's, and a little more. */
const READING = 560;

/** Pages and Markdown read once for the project as it stands, by path: full screen opens at once. */
type Kept = Map<string, string>;

/**
 * A read the sheet waits on, made while it is up and again when what it reads changes. The sheet
 * closing gives it up, so a page still coming through the relay stops (ADR 0153's addendum), and
 * one that came is not read again when the sheet opens on the same thing.
 */
function useRead<T>(
  read: (signal: AbortSignal) => Promise<T>,
  key: string,
  live: boolean,
): { readonly value?: T; readonly failed?: string } {
  const [state, setState] = useState<{ key?: string; value?: T; failed?: string }>({});
  const has = state.key === key && state.value !== undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again only when what it reads changes.
  useEffect(() => {
    if (!live || has) return;
    const reading = new AbortController();
    read(reading.signal).then(
      (value) => {
        if (!reading.signal.aborted) setState({ key, value });
      },
      (error: unknown) => {
        if (reading.signal.aborted) return;
        setState({ key, failed: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => reading.abort();
  }, [key, live, has]);
  return state;
}

export function UniverseSheet({
  store,
  space,
  selfId,
  title,
  open,
  onClose,
  onGoTo,
}: {
  readonly store: Store;
  /** The room; Universe is only for one with a project. */
  readonly space: Space | undefined;
  /** Who reads it: Desktop is an owner's (ADR 0231). */
  readonly selfId: string;
  readonly title: string;
  readonly open: boolean;
  readonly onClose: () => void;
  /** *Go to message* from Media's viewer: Universe closes onto the reply that brought the picture. */
  readonly onGoTo?: ((lineId: string) => void) | undefined;
}) {
  if (space?.project === undefined) return null;
  return (
    <UniverseOf
      store={store}
      space={space}
      selfId={selfId}
      title={title}
      open={open}
      onClose={onClose}
      onGoTo={onGoTo}
    />
  );
}

function UniverseOf({
  store,
  space,
  selfId,
  title,
  open,
  onClose,
  onGoTo,
}: {
  readonly store: Store;
  readonly space: Space;
  readonly selfId: string;
  readonly title: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onGoTo: ((lineId: string) => void) | undefined;
}) {
  const { tab, setTab, toDesktop } = useWhere(store, selfId);
  const project = useMemo(() => projectActions(store, space.id, selfId), [store, space.id, selfId]);
  const head = space.project?.changes[0]?.commit ?? "";
  const read = useRead(() => readUniverse(store, space.id), `${space.id}:${head}`, open);
  // biome-ignore lint/correctness/useExhaustiveDependencies: what was read is the project's at `head`.
  const kept = useMemo<Kept>(() => new Map(), [space.id, head]);
  const { paged, setPaged, failed, setFailed, openFile } = useOpening(project);
  const owner = toDesktop !== undefined;
  const ran = useProgram(store, project, read.value, owner, open);
  const shelves = read.value?.shelves;
  const where = useShelves(read.value);
  const pictures = useMemo(() => createPictureFiles(project, space.id), [project, space.id]);
  // What this phone had seen before this opening, which opening has just moved on to the newest.
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again at each opening.
  const seen = useMemo(() => seenBefore(space.id), [space.id, open]);
  const glass = useRef<View>(null);
  const phone = tab === "phone";
  return (
    <Sheet
      open={open}
      onClose={onClose}
      onGone={() => {
        setTab("phone");
        where.reset();
        setPaged(undefined);
        setFailed(undefined);
        ran.links.close();
      }}
      sizing="full"
      wide
      testID="universe-sheet"
    >
      <ViewerHost store={store} files={pictures} glass={glass} onClose={onClose} onGoTo={onGoTo}>
        <View style={styles.sheet}>
          <Top
            title={title}
            tab={tab}
            onTab={toDesktop === undefined ? undefined : setTab}
            whole={phone ? where.whole : undefined}
            onFile={openFile}
          />
          {phone ? (
            <ShelfTabs shelves={shelves} shelf={where.shown} onShelf={where.setShelf} />
          ) : null}
          {failed === undefined ? null : <Said words={failed} failed />}
          {read.failed !== undefined ? (
            <Said words={read.failed} failed />
          ) : (
            <Arrival
              ready={read.value !== undefined}
              waiting={<UniverseReading words="Reading the space…" />}
            >
              {read.value === undefined ? null : phone ? (
                <Shelved key={where.key} fades={where.picked}>
                  <PhoneShelf
                    universe={read.value}
                    where={where}
                    media={{ changes: space.project?.changes, head, selfId, seen, pictures, glass }}
                    files={{ store, space, project, onFile: openFile }}
                    pages={{
                      project,
                      kept,
                      live: open,
                      banner: ran.banner,
                      onFile: openFile,
                      onAddress: ran.onAddress,
                      onPage: ran.onPage,
                      onDesktop: toDesktop,
                    }}
                  />
                </Shelved>
              ) : (
                <DesktopTab universe={read.value} project={project} held={ran.held} />
              )}
            </Arrival>
          )}
        </View>
      </ViewerHost>
      {paged === undefined ? null : (
        <PageSheet
          key={paged}
          page={pageOf(paged, project, kept)}
          onFile={openFile}
          onAddress={ran.onAddress}
          onClose={() => setPaged(undefined)}
        />
      )}
      <LinkAskSheet
        asked={ran.links.asked}
        open={ran.links.open}
        onGo={ran.links.go}
        onAnyway={ran.links.anyway}
        onClose={ran.links.close}
        onGone={ran.links.gone}
      />
    </Sheet>
  );
}

/**
 * Which shelf the Phone tab shows and which document Pages draws: where Universe opens until the
 * person picks, and the start page until a chip picks another.
 */
function useShelves(universe: Universe | undefined) {
  const shelves = universe?.shelves;
  const [shelf, setShelf] = useState<Shelf | undefined>(undefined);
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  const [opened, setOpened] = useState<Opened | undefined>(undefined);
  const known = chosen !== undefined && shelves?.pages.includes(chosen) === true;
  const shown = shelf ?? universeOpensOn(universe);
  const page = known ? chosen : shelves?.first;
  const inFiles = shown === "files" ? opened : undefined;
  return {
    shown,
    /** What the shelf shows, so a file opened in Files fades in where the list was, and back. */
    key:
      inFiles === undefined
        ? shown
        : `${shown}:${inFiles.kind === "file" ? inFiles.path : inFiles.commit}`,
    /** Turned to by the person, so the shelf fades in rather than simply being there. */
    picked: shelf !== undefined || inFiles !== undefined,
    page,
    /** The file's page, or the change, Files shows in place of its list. */
    opened: inFiles,
    /** The page Pages draws, which opens full screen from the head. */
    whole: shown === "pages" ? drawable(page) : undefined,
    setShelf,
    setChosen,
    setOpened,
    /** A document tapped in Files: Pages, drawing it. */
    toPage: (path: string) => {
      setChosen(path);
      setShelf("pages");
    },
    reset: () => {
      setShelf(undefined);
      setChosen(undefined);
      setOpened(undefined);
    },
  };
}

/**
 * The viewer's host, the sheet's own, so the viewer stands over Universe as it stands over the room
 * sheet's Sent in chat page: iOS presents a modal only from the one that holds it. Go to message
 * closes Universe onto the reply that brought the picture, or only closes it when none did.
 */
function ViewerHost({
  store,
  files,
  glass,
  onClose,
  onGoTo,
  children,
}: {
  readonly store: Store;
  readonly files: PictureFiles;
  readonly glass: RefObject<View | null>;
  readonly onClose: () => void;
  readonly onGoTo: ((lineId: string) => void) | undefined;
  readonly children: ReactNode;
}) {
  const room = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return (
    <MediaProvider
      space={undefined}
      lanes={room.model.lanes}
      directory={room.directory}
      files={files}
      glass={glass}
      onReveal={stay}
      onGoTo={(lineId) => {
        onClose();
        if (isRoomLine(lineId)) onGoTo?.(lineId);
      }}
    >
      {children}
    </MediaProvider>
  );
}

/**
 * The space's program, where Universe shows a page (ADR 0227's addendum of 9 November 2026): the
 * person's run of it, read and heard while Universe is up, the banner over the page, and what a
 * tapped link does. The Desktop tab's bar is handed the same run, so the two never disagree.
 */
function useProgram(
  store: Store,
  project: ProjectActions,
  universe: Universe | undefined,
  owner: boolean,
  open: boolean,
) {
  const recipe: RecipeRead =
    universe?.program ?? (universe?.why === undefined ? undefined : { why: universe.why });
  const program = universe?.program !== undefined;
  const held = useRunOnMac(project.runs, open && owner && program);
  const bar = useRunBar(held, project.runs, recipe, false);
  const ownerName = useSyncExternalStore(store.subscribe, () => {
    const { model, directory } = store.getSnapshot();
    return ownerNameOf(model, directory);
  });
  const banner = owner ? programBanner(bar) : memberBanner(ownerName);
  const links = useLinkAsk({ held, banner, recipe, program, owner, ownerName });
  const usable = recipe !== undefined && !("why" in recipe) ? recipe : undefined;
  // The page the Phone tab shows, so the banner can say its links need Tailscale.
  const [page, setPage] = useState<string | undefined>(undefined);
  const line = useTailscaleLine(page, open && owner && program, isUp(banner.kind));
  // Until the first read answers, whether it runs isn't known: no banner says it doesn't.
  const shown = program && (!owner || held.known);
  return {
    program,
    held: program && owner ? held : undefined,
    links,
    // Every page's links are looked at first where they need it (ADR 0227's addendum of 10
    // November 2026); the program's question is asked only where there is a program.
    onAddress: links.tap,
    onPage: setPage,
    banner: shown ? (
      <ProgramBannerView
        banner={banner}
        busy={held.busy}
        hereOnly={links.hereOnly}
        line={line}
        onRun={() => {
          if (usable !== undefined) void held.press({ op: "run", command: commandOf(usable) });
        }}
        onStop={() => void held.press({ op: "stop" })}
      />
    ) : null,
  };
}

/** Running, or on its way: the banner's Tailscale line says only Tailscale is missing. */
function isUp(kind: ProgramBanner["kind"]): boolean {
  return kind === "running" || kind === "starting";
}

/**
 * A document opened from the page or the list: a page or Markdown over the sheet, anything else in
 * Quick Look, or why it couldn't be.
 */
function useOpening(project: ProjectActions) {
  const [paged, setPaged] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const openFile = (path: string) => {
    setFailed(undefined);
    const kind = documentKind(path);
    if (kind === "page" || kind === "markdown") {
      setPaged(path);
      return;
    }
    project
      .file(path)
      .then(({ bytes, type }) => previewBytes(bytes, fileNameOf(path), type))
      .catch((error: unknown) => setFailed(error instanceof Error ? error.message : String(error)));
  };
  return { paged, setPaged, failed, setFailed, openFile };
}

/** The document Pages draws, where it draws it as a page: what opens full screen. */
function drawable(path: string | undefined): string | undefined {
  if (path === undefined) return undefined;
  const kind = documentKind(path);
  return kind === "page" || kind === "markdown" ? path : undefined;
}

/** The viewer stays where it is: Media's squares are all on the page. */
const stay = (): void => undefined;

const NO_CHANGES: readonly never[] = [];

/** Files' sizes before the listing says them. */
const NO_SIZES: Readonly<Record<string, number>> = {};

/** A page or Markdown of the project, as the page sheet opens it. */
function pageOf(path: string, project: ProjectActions, kept: Kept) {
  const markdown = documentKind(path) === "markdown";
  return {
    name: fileNameOf(path),
    mimeType: markdown ? "text/markdown" : "text/html",
    read: textOf(path, project, markdown, kept),
  };
}

/**
 * A page built into one document, or Markdown's own words: what a view of it draws from. Kept once
 * read, so the same page opened again, full screen, is not asked for again.
 */
function textOf(path: string, project: ProjectActions, markdown: boolean, kept: Kept) {
  return async (signal: AbortSignal) => {
    const had = kept.get(path);
    if (had !== undefined) return had;
    const text = markdown
      ? new TextDecoder().decode((await project.file(path, undefined, signal)).bytes)
      : await project.page(path, undefined, signal);
    kept.set(path, text);
    return text;
  };
}

/** The head, and the tabs under it or, on a wide sheet, in its line where there are two. */
function Top({
  title,
  tab,
  onTab,
  whole,
  onFile,
}: {
  readonly title: string;
  readonly tab: Tab;
  readonly onTab: ((tab: Tab) => void) | undefined;
  /** The page Pages draws, which opens full screen. */
  readonly whole: string | undefined;
  readonly onFile: (path: string) => void;
}) {
  const { roomy } = useLayout();
  // In a column of its own beside the room (ADR 0276) the tabs stand under the name, as on a phone:
  // on its line they ran over the name and the X.
  const column = useSplitSide() === "third";
  const tabs = <WhereTabs tab={tab} onTab={onTab} />;
  const inLine = roomy && !column && onTab !== undefined;
  return (
    <>
      <Head
        title={title}
        tabs={inLine ? tabs : null}
        onWhole={whole === undefined ? undefined : () => onFile(whole)}
      />
      {inLine ? null : tabs}
    </>
  );
}

/**
 * Universe, with the space's name under it, clear of the sheet's X; on a wide sheet the tabs in the
 * middle of its line; and at its end Full screen, while the tab draws a page.
 */
function Head({
  title,
  tabs,
  onWhole,
}: {
  readonly title: string;
  readonly tabs: ReactNode;
  readonly onWhole: (() => void) | undefined;
}) {
  const palette = usePalette();
  const on = useGround();
  return (
    <View style={styles.head} testID="universe-head">
      <View style={styles.headStart}>
        <View style={[styles.mark, { backgroundColor: on.fill }]}>
          <UniverseMark size={22} ink={palette.ink} ground={on.fill} />
        </View>
        <View style={styles.named}>
          <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
            Universe
          </Text>
          <Text numberOfLines={1} style={[styles.under, { color: palette.ink3 }]}>
            {title}
          </Text>
        </View>
      </View>
      {tabs === null ? null : <View style={styles.headTabs}>{tabs}</View>}
      <View style={[styles.headEnd, tabs === null ? null : styles.headEndWide]}>
        {onWhole === undefined ? null : (
          <IconButton
            icon="fullScreen"
            label="Full screen"
            tone="quiet"
            size={CLOSE}
            onPress={onWhole}
            testID="universe-full-screen"
          />
        )}
      </View>
    </View>
  );
}

/** Words where the tab has nothing else: reading, nothing yet, or why it couldn't. */
function Said({ words, failed = false }: { readonly words: string; readonly failed?: boolean }) {
  const palette = usePalette();
  return (
    <Text
      style={[styles.said, { color: failed ? palette.red : palette.ink3 }]}
      testID={failed ? "universe-failed" : "universe-said"}
    >
      {words}
    </Text>
  );
}

/**
 * Phone or Desktop, and Desktop only for an owner (ADR 0231): Run and Open on the Mac are theirs,
 * so nobody else is shown it at all.
 */
function useWhere(store: Store, selfId: string) {
  const [chosen, setTab] = useState<Tab>("phone");
  const mac = useSyncExternalStore(store.subscribe, () =>
    mayUseMac(store.getSnapshot().model, selfId),
  );
  return {
    tab: mac ? chosen : ("phone" as Tab),
    setTab,
    toDesktop: mac ? () => setTab("desktop") : undefined,
  };
}

/** The two tabs, where there is a Desktop to choose; nothing where there isn't. */
function WhereTabs({
  tab,
  onTab,
}: {
  readonly tab: Tab;
  readonly onTab: ((tab: Tab) => void) | undefined;
}) {
  if (onTab === undefined) return null;
  return (
    <View style={styles.tabs}>
      <Segmented
        label="Where it opens"
        options={[
          { value: "phone", label: HERE },
          { value: "desktop", label: "Desktop" },
        ]}
        chosen={tab}
        onChoose={(value) => onTab(value === "desktop" ? "desktop" : "phone")}
        testID="universe-tabs"
      />
    </View>
  );
}

/**
 * Media, Pages and Files, under Phone (or Desktop) (the addenda of 13 and 14 November 2026): words
 * with their counts, all always there so they stand where they were learnt, and a gold line that
 * slides to the one chosen on the spring the segmented control's tile moves on.
 */
function ShelfTabs({
  shelves,
  shelf,
  onShelf,
}: {
  /** What there is; nothing while Universe reads the space, and no tabs till then. */
  readonly shelves: Shelves | undefined;
  readonly shelf: Shelf;
  readonly onShelf: (shelf: Shelf) => void;
}) {
  const palette = usePalette();
  const still = useReduceMotion();
  const [spots, setSpots] = useState<Partial<Record<Shelf, { x: number; w: number }>>>({});
  const [x] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(1));
  const placed = useRef(false);
  const spot = spots[shelf];
  useEffect(() => {
    if (spot === undefined) return;
    // The line is drawn BAR wide and scaled about its middle to the word's width.
    const toX = spot.x + (spot.w - BAR) / 2;
    const toScale = spot.w / BAR;
    if (!placed.current || still) {
      x.setValue(toX);
      scale.setValue(toScale);
      placed.current = true;
      return;
    }
    Animated.parallel([
      Animated.spring(x, { toValue: toX, ...IOS_SPRING, useNativeDriver: true }),
      Animated.spring(scale, { toValue: toScale, ...IOS_SPRING, useNativeDriver: true }),
    ]).start();
  }, [spot, still, x, scale]);
  if (shelves === undefined) return null;
  const counts: Record<Shelf, number> = {
    media: shelves.media.length,
    pages: shelves.pages.length,
    files: shelves.files.length,
  };
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.shelves, { borderBottomColor: palette.line }]}
      testID="universe-shelves"
    >
      {SHELVES.map(({ shelf: each, name }) => {
        const on = each === shelf;
        const count = counts[each];
        return (
          <Pressable
            key={each}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${name}, ${count}`}
            onLayout={(event) => {
              const { x: left, width } = event.nativeEvent.layout;
              setSpots((now) =>
                now[each]?.x === left && now[each]?.w === width
                  ? now
                  : { ...now, [each]: { x: left, w: width } },
              );
            }}
            onPress={() => {
              if (on) return;
              feel.tick();
              onShelf(each);
            }}
            hitSlop={{ top: SPACE.sm, bottom: SPACE.xs, left: SPACE.sm, right: SPACE.sm }}
            style={styles.shelf}
            testID={`universe-shelf-${each}`}
          >
            <Text style={[styles.shelfWords, { color: on ? palette.ink : palette.ink3 }]}>
              {name}
              <Text style={[styles.shelfCount, { color: on ? palette.ink3 : palette.ink4 }]}>
                {` ${count}`}
              </Text>
            </Text>
          </Pressable>
        );
      })}
      {spot === undefined ? null : (
        <Animated.View
          style={[
            styles.shelfLine,
            { backgroundColor: palette.gold, transform: [{ translateX: x }, { scaleX: scale }] },
          ]}
        />
      )}
    </View>
  );
}

/** The shelf the Phone tab shows: Media's squares, Pages, or Files. */
function PhoneShelf({
  universe,
  where,
  media,
  pages,
  files,
}: {
  readonly universe: Universe;
  readonly where: ReturnType<typeof useShelves>;
  readonly media: Omit<Parameters<typeof MediaShelf>[0], "shelves" | "changes"> & {
    readonly changes: readonly ProjectChange[] | undefined;
  };
  readonly pages: Omit<Parameters<typeof PagesShelf>[0], "universe" | "page" | "onChoose">;
  readonly files: Pick<Parameters<typeof FilesShelf>[0], "store" | "space" | "project" | "onFile">;
}) {
  const changes = media.changes ?? NO_CHANGES;
  if (where.shown === "media") {
    return <MediaShelf {...media} shelves={universe.shelves} changes={changes} />;
  }
  if (where.shown === "files") {
    return (
      <FilesShelf
        {...media}
        {...files}
        shelves={universe.shelves}
        changes={changes}
        opened={where.opened}
        onOpened={where.setOpened}
        onPage={where.toPage}
      />
    );
  }
  return <PagesShelf {...pages} universe={universe} page={where.page} onChoose={where.setChosen} />;
}

/** How wide the gold line is drawn before it is scaled to its word. */
const BAR = 100;

/** A shelf the person turned to fades in where the other was; the first is simply there. */
function Shelved({ fades, children }: { readonly fades: boolean; readonly children: ReactNode }) {
  const still = useReduceMotion();
  const [shown] = useState(() => new Animated.Value(fades && !still ? 0 : 1));
  useEffect(() => {
    Animated.timing(shown, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [shown]);
  return <Animated.View style={[styles.shelved, { opacity: shown }]}>{children}</Animated.View>;
}

/** Words where a shelf has nothing yet: what would be there. */
function Empty({
  title,
  body,
  testID,
}: {
  readonly title: string;
  readonly body: string;
  readonly testID: string;
}) {
  const palette = usePalette();
  return (
    <View style={styles.empty} testID={testID}>
      <Text style={[styles.emptyTitle, { color: palette.ink }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: palette.ink3 }]}>{body}</Text>
    </View>
  );
}

/**
 * The project's pictures as the room's squares, newest first under the day each came, each opening
 * in the room's viewer on Media's pictures; three across on a phone, five on a wide sheet.
 */
function MediaShelf({
  shelves,
  changes,
  head,
  selfId,
  seen,
  pictures,
  glass,
}: {
  readonly shelves: Shelves | undefined;
  readonly changes: readonly ProjectChange[];
  readonly head: string;
  readonly selfId: string;
  /** The change Universe was opened at before this opening: what came after it is new. */
  readonly seen: string | undefined;
  readonly pictures: PictureFiles;
  readonly glass: RefObject<View | null>;
}) {
  const palette = usePalette();
  const { roomy } = useLayout();
  const column = useSplitSide() === "third";
  const across = roomy && !column ? 5 : 3;
  const media = shelves?.media ?? NO_CHANGES;
  const sizes = shelves?.sizes;
  const shown = useMemo(
    () => picturesOf(mediaInOrder(media, changes), head, sizes ?? {}, pictures),
    [media, changes, head, sizes, pictures],
  );
  // The deck is read as a square is tapped, with each picture's size as far as it is known by then.
  const deck = () => deckOf(shown, pictures);
  if (shown.length === 0) {
    return (
      <Empty
        title="No pictures yet"
        body="A picture that an agent keeps in this space shows here."
        testID="universe-media-empty"
      />
    );
  }
  const days = byDay(shown, Date.now());
  return (
    <View ref={glass} collapsable={false} style={styles.glass}>
      <SheetScroll
        style={styles.scroll}
        contentContainerStyle={styles.media}
        testID="universe-media"
      >
        {days.map((day, at) => (
          <View key={day.label} style={styles.day}>
            <View style={styles.dayHead}>
              <Text style={[styles.dayWords, { color: palette.ink3 }]}>{day.label}</Text>
              {at === 0 ? (
                <Text style={[styles.dayAside, { color: palette.ink4 }]}>Newest first</Text>
              ) : null}
            </View>
            <Squares
              shown={day.shown}
              across={across}
              deck={deck}
              pictures={pictures}
              fresh={(each) => isNewSince(each.item, changes, selfId, seen)}
            />
          </View>
        ))}
      </SheetScroll>
    </View>
  );
}

/** Media under the day each picture came, newest first; one no change names, under Earlier. */
function byDay(
  shown: readonly Shown[],
  now: number,
): readonly { readonly label: string; readonly shown: readonly Shown[] }[] {
  const days: { label: string; shown: Shown[] }[] = [];
  for (const each of shown) {
    const at = each.item.change?.at;
    const label = at === undefined ? "Earlier" : dayLabel(at, now);
    const last = days.at(-1);
    if (last?.label === label) last.shown.push(each);
    else days.push({ label, shown: [each] });
  }
  return days;
}

/** A day's squares, `across` to a row, the last row's gaps kept so every square is the same size. */
function Squares({
  shown,
  across,
  deck,
  pictures,
  fresh,
}: {
  readonly shown: readonly Shown[];
  readonly across: number;
  readonly deck: () => ReturnType<typeof deckOf>;
  readonly pictures: PictureFiles;
  readonly fresh: (each: Shown) => boolean;
}) {
  const rows: (Shown | undefined)[][] = [];
  for (let at = 0; at < shown.length; at += across) {
    const row: (Shown | undefined)[] = shown.slice(at, at + across);
    while (row.length < across) row.push(undefined);
    rows.push(row);
  }
  return (
    <View style={styles.grid}>
      {rows.map((row, at) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows of a fixed grid.
        <View key={at} style={styles.gridRow}>
          {row.map((each, place) =>
            each === undefined ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: spacers, all alike.
              <View key={`gap-${place}`} style={styles.cell} />
            ) : (
              <Square
                key={each.attachment.id}
                shown={each}
                deck={deck}
                pictures={pictures}
                fresh={fresh(each)}
              />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

/**
 * One picture's square: its small copy, faded in as it comes; a tile to the viewer, measured to fly
 * from and back to and hidden while its picture is up; and a gold dot while it is new.
 */
function Square({
  shown,
  deck,
  pictures,
  fresh,
}: {
  readonly shown: Shown;
  /** Media's deck, read at the tap. */
  readonly deck: () => ReturnType<typeof deckOf>;
  readonly pictures: PictureFiles;
  readonly fresh: boolean;
}) {
  const palette = usePalette();
  const { attachment } = shown;
  const picture = useThumb(pictures, attachment.id);
  const tile = useViewerTile(shown.lineId, attachment.id, CORNERS);
  return (
    <Pressable
      ref={tile.ref}
      accessibilityRole="button"
      accessibilityLabel={`Open ${attachment.filename}${fresh ? ", new" : ""}`}
      onPress={() => openPicture(tile.open, picture, shown, deck, pictures)}
      testID={`universe-media-${shown.item.path}`}
      style={({ pressed }) => [
        styles.cell,
        styles.square,
        { backgroundColor: palette.surface3 },
        pressed ? styles.pressed : null,
        tile.hidden ? styles.away : null,
      ]}
    >
      {picture === undefined ? null : (
        <Picture
          source={{ uri: picture }}
          contentFit="cover"
          transition={180}
          recyclingKey={attachment.id}
          accessibilityIgnoresInvertColors
          style={StyleSheet.absoluteFill}
        />
      )}
      {fresh ? (
        <View
          style={[styles.fresh, { backgroundColor: palette.gold }]}
          testID={`universe-new-${shown.item.path}`}
        />
      ) : null}
    </Pressable>
  );
}

/**
 * A picture tapped, in Media or Files: into the viewer on the deck, flying from where it was tapped;
 * Quick Look where there is no viewer to fly to.
 */
function openPicture(
  open: ReturnType<typeof useViewerTile>["open"],
  picture: string | undefined,
  shown: Shown,
  deck: () => ReturnType<typeof deckOf>,
  pictures: PictureFiles,
) {
  if (open === undefined) {
    void pictures.preview(shown.attachment).catch(() => undefined);
    return;
  }
  // Its own copy first, which says its size, when the tap came before it had: a moment.
  if (picture !== undefined) open(picture, deck());
  else
    void pictures.thumb(shown.attachment.id).then(
      (uri) => open(uri, deck()),
      () => open(undefined, deck()),
    );
}

/** A Files row's mark's corners: where the viewer flies from and back to. */
const MARK_CORNERS = cornersOf(RADIUS.md);

/**
 * Files (the addendum of 14 November 2026): every file of the project under its folder, as Project
 * › Files lists them, each with its size, who changed it last and when, and a gold dot while it is
 * new. A tap opens it where it belongs (core's `fileOpensIn`): a picture in the viewer, a document
 * on Pages, a program's page in the page sheet, words on the file's own page in Files' place, with
 * its history and its changes, and anything else in Quick Look. Arjun, 14 November 2026, of a space
 * whose agent wrote one Python file: "I think we need a 'files' section as well?".
 */
function FilesShelf({
  shelves,
  changes,
  head,
  selfId,
  seen,
  pictures,
  glass,
  store,
  space,
  project,
  opened,
  onOpened,
  onPage,
  onFile,
}: Omit<Parameters<typeof MediaShelf>[0], "shelves"> & {
  readonly shelves: Shelves | undefined;
  readonly store: Store;
  readonly space: Space;
  readonly project: ProjectActions;
  readonly opened: Opened | undefined;
  readonly onOpened: (opened: Opened | undefined) => void;
  /** A document of Pages: Pages, drawing it. */
  readonly onPage: (path: string) => void;
  /** A program's page in the page sheet; anything the phone can't draw in Quick Look. */
  readonly onFile: (path: string) => void;
}) {
  const { directory } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  if (opened !== undefined) {
    return (
      <FileOpened
        opened={opened}
        directory={directory}
        space={space}
        selfId={selfId}
        project={project}
        onOpened={onOpened}
      />
    );
  }
  const files = shelves?.files ?? NO_CHANGES;
  if (files.length === 0) {
    return (
      <Empty
        title="No files yet"
        body="A file that an agent keeps in this space shows here."
        testID="universe-files-empty"
      />
    );
  }
  return (
    <FileList
      shelves={shelves ?? { media: [], pages: [], files }}
      changes={changes}
      head={head}
      directory={directory}
      fresh={(item) => isNewSince(item, changes, selfId, seen)}
      pictures={pictures}
      glass={glass}
      onWords={(path) => onOpened({ kind: "file", path })}
      onPage={onPage}
      onFile={onFile}
    />
  );
}

/** A file Files opened in its place: its own page, or a change from its history, each with its way back. */
function FileOpened({
  opened,
  directory,
  space,
  selfId,
  project,
  onOpened,
}: {
  readonly opened: Opened;
  readonly directory: Directory;
  readonly space: Space;
  readonly selfId: string;
  readonly project: ProjectActions;
  readonly onOpened: (opened: Opened | undefined) => void;
}) {
  if (opened.kind === "file") {
    return (
      <ProjectFilePage
        path={opened.path}
        directory={directory}
        project={project}
        onBack={() => onOpened(undefined)}
        onChange={(commit) => onOpened({ kind: "change", commit, from: opened.path })}
      />
    );
  }
  const back = () =>
    onOpened(opened.from === undefined ? undefined : { kind: "file", path: opened.from });
  return (
    <ChangePage
      space={space}
      directory={directory}
      commit={opened.commit}
      guest={space.roles[selfId] === "guest"}
      project={project}
      onBack={back}
      onDone={back}
      onFile={(path) => onOpened({ kind: "file", path })}
    />
  );
}

/** Files' list: the folders, the project's top first, and each one's files as rows in a card. */
function FileList({
  shelves,
  changes,
  head,
  directory,
  fresh,
  pictures,
  glass,
  onWords,
  onPage,
  onFile,
}: {
  readonly shelves: Shelves;
  readonly changes: readonly ProjectChange[];
  readonly head: string;
  readonly directory: Directory;
  readonly fresh: (item: MediaItem) => boolean;
  readonly pictures: PictureFiles;
  readonly glass: RefObject<View | null>;
  readonly onWords: (path: string) => void;
  readonly onPage: (path: string) => void;
  readonly onFile: (path: string) => void;
}) {
  const palette = usePalette();
  const on = useGround();
  const sizes = shelves.sizes ?? NO_SIZES;
  const groups = useMemo(() => filesInOrder(shelves.files, changes), [shelves.files, changes]);
  // Media's pictures as Media shows them, so one tapped here pages on through Media's.
  const media = useMemo(
    () => picturesOf(mediaInOrder(shelves.media, changes), head, sizes, pictures),
    [shelves.media, changes, head, sizes, pictures],
  );
  const now = Date.now();
  const row = (item: MediaItem, first: boolean) => {
    const opens = fileOpensIn(item.path, shelves);
    const words = {
      item,
      first,
      under: fileUnder(sizes[item.path], item.change, directory, now),
      fresh: fresh(item),
    };
    const picture = pictureIn(item, opens, media, () => picturesOf([item], head, sizes, pictures));
    if (picture !== undefined) {
      return (
        <PictureRow
          key={item.path}
          {...words}
          shown={picture.shown}
          deck={() => deckOf(picture.deck, pictures)}
          pictures={pictures}
        />
      );
    }
    const open = opens === "pages" ? onPage : opens === "words" ? onWords : onFile;
    return (
      <FileRow
        key={item.path}
        {...words}
        code={opens === "words"}
        onPress={() => open(item.path)}
      />
    );
  };
  return (
    <View ref={glass} collapsable={false} style={styles.glass}>
      <SheetScroll
        style={styles.scroll}
        contentContainerStyle={styles.files}
        testID="universe-files"
      >
        {groups.map(({ folder, items }) => (
          <View key={folder} style={styles.folder}>
            {folder === "" ? null : (
              <Text style={[styles.folderName, { color: palette.ink3 }]} numberOfLines={1}>
                {`${folder}/`}
              </Text>
            )}
            <View style={[styles.card, { backgroundColor: on.fill }]}>
              {items.map((item, at) => row(item, at === 0))}
            </View>
          </View>
        ))}
      </SheetScroll>
    </View>
  );
}

/**
 * A picture tapped in Files, as the viewer takes it: one of Media's pages on through Media's, and
 * any other (a program's icon) alone.
 */
function pictureIn(
  item: MediaItem,
  opens: ReturnType<typeof fileOpensIn>,
  media: readonly Shown[],
  alone: () => readonly Shown[],
): { readonly shown: Shown; readonly deck: readonly Shown[] } | undefined {
  if (opens === "media") {
    const shown = media.find((each) => each.item.path === item.path);
    return shown === undefined ? undefined : { shown, deck: media };
  }
  if (opens !== "picture") return undefined;
  const [shown] = alone();
  return shown === undefined ? undefined : { shown, deck: [shown] };
}

/** Under a file's name: its size, who changed it last, and when; as much of that as is known. */
function fileUnder(
  bytes: number | undefined,
  change: ProjectChange | undefined,
  directory: Directory,
  now: number,
): string {
  const said: string[] = bytes === undefined ? [] : [bytesWords(bytes)];
  if (change !== undefined) {
    const day = dayLabel(change.at, now);
    const when = day === "Today" || day === "Yesterday" ? separatorLabel(change.at, now) : day;
    said.push(nameOf(directory, change.by), when);
  }
  return said.join(" · ");
}

/** What a Files row says: the file, whether it leads its card, the line under it, and if it is new. */
interface RowSaid {
  readonly item: MediaItem;
  readonly first: boolean;
  readonly under: string;
  readonly fresh: boolean;
}

/** A file that isn't a picture: its kind's mark, code or a document, and where a tap takes it. */
function FileRow({
  code,
  onPress,
  ...said
}: RowSaid & {
  /** Words that are no document: code, data, a script. */
  readonly code: boolean;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <RowFrame {...said} onPress={onPress}>
      <View
        style={[styles.fileMark, { backgroundColor: code ? palette.blueSoft : palette.surface3 }]}
      >
        <Icon name={code ? "code" : "doc"} size={18} color={code ? palette.blue : palette.ink3} />
        {said.fresh ? <FreshDot path={said.item.path} /> : null}
      </View>
    </RowFrame>
  );
}

/** A picture's row: its small copy as its mark, which the viewer flies from and back to. */
function PictureRow({
  shown,
  deck,
  pictures,
  ...said
}: RowSaid & {
  readonly shown: Shown;
  readonly deck: () => ReturnType<typeof deckOf>;
  readonly pictures: PictureFiles;
}) {
  const palette = usePalette();
  const { attachment } = shown;
  const picture = useThumb(pictures, attachment.id);
  const tile = useViewerTile(shown.lineId, attachment.id, MARK_CORNERS);
  return (
    <RowFrame {...said} onPress={() => openPicture(tile.open, picture, shown, deck, pictures)}>
      <View
        ref={tile.ref}
        collapsable={false}
        style={[
          styles.fileMark,
          { backgroundColor: palette.surface3 },
          tile.hidden ? styles.away : null,
        ]}
      >
        {picture === undefined ? null : (
          <Picture
            source={{ uri: picture }}
            contentFit="cover"
            transition={180}
            recyclingKey={attachment.id}
            accessibilityIgnoresInvertColors
            style={[StyleSheet.absoluteFill, styles.fileMarkPicture]}
          />
        )}
        {said.fresh ? <FreshDot path={said.item.path} /> : null}
      </View>
    </RowFrame>
  );
}

/** A Files row: its mark, its name cut in the middle so the end shows, the line under it, and ›. */
function RowFrame({
  item,
  first,
  under,
  fresh,
  onPress,
  children,
}: RowSaid & { readonly onPress: () => void; readonly children: ReactNode }) {
  const palette = usePalette();
  const name = fileNameOf(item.path);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}${fresh ? ", new" : ""}`}
      accessibilityHint={under}
      onPress={onPress}
      testID={`universe-file-${item.path}`}
      style={({ pressed }) => [
        styles.row,
        styles.fileRow,
        first ? null : [styles.part, { borderTopColor: palette.line }],
        pressed ? { backgroundColor: palette.surface3 } : null,
      ]}
    >
      {children}
      <View style={styles.rowWords}>
        <Text
          style={[styles.rowName, { color: palette.ink }]}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {name}
        </Text>
        {under === "" ? null : (
          <Text style={[styles.under, { color: palette.ink3 }]} numberOfLines={1}>
            {under}
          </Text>
        )}
      </View>
      <Icon name="next" size={18} color={palette.ink4} />
    </Pressable>
  );
}

/** The gold dot on a new file's mark, at its corner. */
function FreshDot({ path }: { readonly path: string }) {
  const palette = usePalette();
  const on = useGround();
  return (
    <View
      style={[styles.markDot, { backgroundColor: palette.gold, borderColor: on.fill }]}
      testID={`universe-new-${path}`}
    />
  );
}

/**
 * Pages: the start page, or the one document, drawn, with chips above it for the documents beside
 * it; several with no start page, listed; none, what would go here, or that the program runs on
 * the Mac. The program's banner stands over the start page alone, whose links need the program.
 */
function PagesShelf({
  universe,
  page,
  onChoose,
  project,
  kept,
  live,
  banner,
  onFile,
  onAddress,
  onPage,
  onDesktop,
}: {
  readonly universe: Universe;
  /** The document chosen to draw: the start page until a chip picks another. */
  readonly page: string | undefined;
  readonly onChoose: (path: string) => void;
  readonly project: ProjectActions;
  readonly kept: Kept;
  /** The sheet is up: its document is read, and given up on when it closes. */
  readonly live: boolean;
  readonly onFile: (path: string) => void;
  /** The program's banner, over the start page, where the space has a program. */
  readonly banner: ReactNode;
  /** A tapped link to a web address, for Universe to open or ask about first. */
  readonly onAddress: ((url: string, html?: string) => void) | undefined;
  /** The page the tab shows, once it's read. */
  readonly onPage: (html: string | undefined) => void;
  /** Desktop, for an owner; nobody else has it (ADR 0231). */
  readonly onDesktop: (() => void) | undefined;
}) {
  const pages = universe.shelves?.pages ?? NO_CHANGES;
  if (pages.length === 0) {
    if (universe.program !== undefined) return <ProgramsOnMac onDesktop={onDesktop} />;
    return (
      <Empty
        title="No pages here yet"
        body="An HTML page, a Markdown note or a PDF that an agent keeps in this space opens here."
        testID="universe-pages-empty"
      />
    );
  }
  if (page === undefined) {
    return (
      <Bannered banner={banner}>
        <SheetScroll style={styles.scroll} contentContainerStyle={styles.content}>
          <Said words={noStartPageWords(pages.length)} />
          <Rows paths={pages} onFile={onFile} />
        </SheetScroll>
      </Bannered>
    );
  }
  const start = startOf(universe);
  return (
    <View style={styles.pages}>
      {pages.length > 1 ? <PageChips pages={pages} chosen={page} onChoose={onChoose} /> : null}
      <Bannered banner={page === start ? banner : null}>
        <Start
          key={page}
          path={page}
          project={project}
          kept={kept}
          live={live}
          onFile={onFile}
          onAddress={onAddress}
          onPage={onPage}
        />
      </Bannered>
    </View>
  );
}

/** The documents of Pages as chips, the one drawn filled; they scroll sideways past the width. */
function PageChips({
  pages,
  chosen,
  onChoose,
}: {
  readonly pages: readonly string[];
  readonly chosen: string;
  readonly onChoose: (path: string) => void;
}) {
  const palette = usePalette();
  const on = useGround();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chips}
      contentContainerStyle={styles.chipsRow}
      accessibilityRole="tablist"
      testID="universe-page-chips"
    >
      {pages.map((path) => {
        const picked = path === chosen;
        return (
          <Pressable
            key={path}
            accessibilityRole="tab"
            accessibilityState={{ selected: picked }}
            onPress={() => {
              if (picked) return;
              feel.tick();
              onChoose(path);
            }}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: picked ? palette.ink : on.fill },
              pressed && !picked ? styles.pressed : null,
            ]}
            testID={`universe-page-chip-${path}`}
          >
            <Text
              numberOfLines={1}
              style={[styles.chipWords, { color: picked ? palette.grouped : palette.ink2 }]}
            >
              {pageChipName(path)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * What the tab shows, with the program's banner over it where the space has one: the banner opens
 * as it comes, and what is under it moves to its new place as the banner grows and folds.
 */
function Bannered({
  banner,
  children,
}: {
  readonly banner: ReactNode;
  readonly children: ReactNode;
}) {
  if (banner === null) return <>{children}</>;
  return (
    <View style={styles.bannered}>
      <Opening>{banner}</Opening>
      <Moves style={styles.bannerUnder}>{children}</Moves>
    </View>
  );
}

/** The start page, or the one document, as the phone draws it. */
function Start({
  path,
  project,
  kept,
  live,
  onFile,
  onAddress,
  onPage,
}: {
  readonly path: string;
  readonly project: ProjectActions;
  readonly kept: Kept;
  readonly live: boolean;
  readonly onFile: (path: string) => void;
  readonly onAddress: ((url: string, html?: string) => void) | undefined;
  readonly onPage: (html: string | undefined) => void;
}) {
  const kind = documentKind(path);
  if (kind === "page" || kind === "markdown") {
    return (
      <Drawn
        path={path}
        project={project}
        kept={kept}
        live={live}
        onFile={onFile}
        onAddress={onAddress}
        onPage={onPage}
        markdown={kind === "markdown"}
      />
    );
  }
  return (
    <SheetScroll style={styles.scroll} contentContainerStyle={styles.content}>
      <Rows paths={[path]} onFile={onFile} />
    </SheetScroll>
  );
}

/** A page of the project, or Markdown made a page, loaded in the tab; its links open in Chips. */
function Drawn({
  path,
  project,
  kept,
  live,
  onFile,
  onAddress,
  onPage,
  markdown,
}: {
  readonly path: string;
  readonly project: ProjectActions;
  readonly kept: Kept;
  readonly live: boolean;
  readonly onFile: (path: string) => void;
  readonly onAddress: ((url: string, html?: string) => void) | undefined;
  readonly onPage: (html: string | undefined) => void;
  readonly markdown: boolean;
}) {
  const palette = usePalette();
  const scheme = useScheme();
  const read = useRead(textOf(path, project, markdown, kept), path, live);
  const [drawn, setDrawn] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const html = useMemo(() => {
    if (read.value === undefined) return undefined;
    return markdown
      ? markdownPage(read.value, { ...palette, scheme, size: TEXT.body })
      : withHtmlPolicy(read.value);
  }, [read.value, markdown, palette, scheme]);
  // The page, for the banner over it; nothing once it's gone.
  useEffect(() => {
    onPage(html);
    return () => onPage(undefined);
  }, [html, onPage]);
  // Seen once it says it has loaded, or after a while if it never does, as the page sheet's is.
  useEffect(() => {
    if (html === undefined || drawn) return;
    const waited = setTimeout(() => setDrawn(true), PAGE_WAITS_MS);
    return () => clearTimeout(waited);
  }, [html, drawn]);
  const why = read.failed ?? failed;
  if (why !== undefined) return <Said words={why} failed />;
  return (
    <View style={[styles.page, { borderColor: palette.line }]} testID="universe-page">
      <Arrival ready={drawn} waiting={<UniverseReading words="Opening…" />}>
        {html === undefined ? null : (
          <Suspense fallback={null}>
            <PageView
              html={html}
              title={fileNameOf(path)}
              ground={markdown ? palette.bg : undefined}
              onReady={() => setDrawn(true)}
              onFailed={setFailed}
              onFile={onFile}
              onAddress={onAddress}
            />
          </Suspense>
        )}
      </Arrival>
    </View>
  );
}

/** Documents as rows, each opening in Chips. */
function Rows({
  paths,
  onFile,
}: {
  readonly paths: readonly string[];
  readonly onFile: (path: string) => void;
}) {
  const palette = usePalette();
  const on = useGround();
  return (
    <View style={[styles.card, { backgroundColor: on.fill }]}>
      {paths.map((path, at) => (
        <Pressable
          key={path}
          accessibilityRole="button"
          accessibilityLabel={`Open ${fileNameOf(path)}`}
          onPress={() => onFile(path)}
          testID={`universe-document-${path}`}
          style={({ pressed }) => [
            styles.row,
            at === 0 ? null : [styles.part, { borderTopColor: palette.line }],
            pressed ? { backgroundColor: palette.surface3 } : null,
          ]}
        >
          <View style={[styles.rowMark, { backgroundColor: palette.surface3 }]}>
            <Icon name="doc" size={16} color={palette.ink3} />
          </View>
          <View style={styles.rowWords}>
            <Text style={[styles.rowName, { color: palette.ink }]} numberOfLines={1}>
              {fileNameOf(path)}
            </Text>
            {path.includes("/") ? (
              <Text style={[styles.under, { color: palette.ink3 }]} numberOfLines={1}>
                {path.slice(0, path.lastIndexOf("/"))}
              </Text>
            ) : null}
          </View>
          <Icon name="next" size={18} color={palette.ink4} />
        </Pressable>
      ))}
    </View>
  );
}

/**
 * A program's space on the phone: it runs on the Mac, never here. An owner is pointed to Desktop;
 * anybody else is told it runs on the owner's Mac (ADR 0231).
 */
function ProgramsOnMac({ onDesktop }: { readonly onDesktop: (() => void) | undefined }) {
  const palette = usePalette();
  const on = useGround();
  const words = onDesktop === undefined ? PROGRAMS_ON_OWNERS_MAC : PROGRAMS_ON_MAC;
  return (
    <View style={[styles.programs, { backgroundColor: on.fill }]} testID="universe-programs-here">
      <View style={[styles.mark, { backgroundColor: palette.surface3 }]}>
        <UniverseMark size={24} ink={palette.ink} ground={palette.surface3} />
      </View>
      <Text style={[styles.programsTitle, { color: palette.ink }]}>{words.title}</Text>
      <Text style={[styles.programsBody, { color: palette.ink3 }]}>{words.body}</Text>
      {onDesktop === undefined ? null : (
        <Button label="Go to Desktop" onPress={onDesktop} testID="universe-to-desktop" />
      )}
    </View>
  );
}

/** What a press from the phone said came of it: heard, or no Mac open. */
type Heard = { readonly words: string; readonly heard: boolean } | undefined;

/**
 * What happens on the person's Mac, as one list (ADR 0227's second addendum): the program, the
 * page, the folder, each a row with its button at the right, and once under them that they happen
 * on the Mac. What a list opens with is there; what opens in it after, opens.
 */
function DesktopTab({
  universe,
  project,
  held,
}: {
  readonly universe: Universe;
  readonly project: ProjectActions;
  /** The run as Universe holds it for the banner, so the bar says the same. */
  readonly held: RunHeld | undefined;
}) {
  const palette = usePalette();
  const on = useGround();
  const { documents, program, why } = universe;
  const runs = program !== undefined || why !== undefined;
  return (
    <SheetScroll style={styles.scroll} contentContainerStyle={styles.content}>
      {documents === undefined && !runs ? (
        <Said words="Nothing here opens on your Mac yet." />
      ) : null}
      <Opens>
        <Moves style={[styles.card, { backgroundColor: on.fill }]}>
          {runs ? (
            <PhoneRun runs={project.runs} recipe={program ?? { why: why ?? "" }} held={held} />
          ) : null}
          {documents === undefined ? null : (
            <PageRow documents={documents} project={project} parted={runs} />
          )}
          <AskMac
            icon="folder"
            title={MAC_ROWS.folder.title}
            body={MAC_ROWS.folder.body}
            label="Open folder in Mac"
            tone="blue"
            ask={project.openOnMac}
            say={folderOnMacWords}
            parted={runs || documents !== undefined}
            testID="universe-open-folder"
          />
        </Moves>
        <Moves>
          <Text style={[styles.under, styles.note, { color: palette.ink3 }]}>{MAC_ROWS.under}</Text>
        </Moves>
      </Opens>
    </SheetScroll>
  );
}

/** The page's row: Open page, or why there's nothing to open yet. */
function PageRow({
  documents,
  project,
  parted,
}: {
  readonly documents: NonNullable<Universe["documents"]>;
  readonly project: ProjectActions;
  readonly parted: boolean;
}) {
  if (!("start" in documents)) {
    return (
      <MacRow
        mark={<RowMark kind="quiet" icon="doc" />}
        title={MAC_ROWS.documents}
        body={noStartPageWords(documents.list.length)}
        bodyKey="none"
        actionKey="none"
        parted={parted}
      />
    );
  }
  const words = pageRowWords(documents.start);
  return (
    <AskMac
      icon="doc"
      title={words.title}
      body={words.body}
      label="Open page"
      tone="gold"
      ask={project.openPageOnMac}
      say={pageOnMacWords}
      parted={parted}
      testID="universe-open-page"
    />
  );
}

/** A row whose button asks the person's Mac, and whose words become what came of it. */
function AskMac({
  icon,
  title,
  body,
  label,
  tone,
  ask,
  say,
  parted,
  testID,
}: {
  readonly icon: "folder" | "doc";
  readonly title: string;
  /** What it opens, until it has been pressed. */
  readonly body: string;
  /** The whole of what the button does: "Open folder in Mac". */
  readonly label: string;
  /** Gold for the page, as Run is; the blue tint for the folder. */
  readonly tone: "gold" | "blue";
  /** The ask to the person's Macs, and what it came to. */
  readonly ask: () => Promise<MacsHeard>;
  /** The words for what it came to: "Sent to your Mac…" when a Mac heard it. */
  readonly say: (heard: MacsHeard) => string;
  readonly parted: boolean;
  readonly testID: string;
}) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Heard>(undefined);
  const press = async () => {
    setBusy(true);
    try {
      const heard = await ask();
      setSaid({ words: say(heard), heard: heard.macs > 0 });
    } catch (error) {
      setSaid({ words: error instanceof Error ? error.message : String(error), heard: false });
    } finally {
      setBusy(false);
    }
  };
  return (
    <MacRow
      mark={<RowMark kind="plain" icon={icon} />}
      title={title}
      body={said?.words ?? body}
      bodyKey={said?.words ?? body}
      voice={said === undefined ? "plain" : said.heard ? "heard" : "bad"}
      bodyTestID={said === undefined ? undefined : `${testID}-said`}
      action={
        <RowButton
          label="Open"
          busy={busy}
          onPress={() => void press()}
          tone={tone}
          accessibilityLabel={label}
          testID={testID}
        />
      }
      actionKey="open"
      parted={parted}
    />
  );
}

const styles = StyleSheet.create({
  // The whole height the sheet gives, the page below the tabs taking what is left.
  sheet: { flex: 1, minHeight: 0 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingRight: CLOSE_ROOM,
    paddingBottom: SPACE.sm,
  },
  headStart: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: SPACE.md },
  // On a wide sheet the tabs stand in the middle of the line, the two ends sharing what is left.
  headTabs: { width: 280 },
  // Full screen beside the sheet's X, the two the same size on the X's line.
  headEnd: {
    alignSelf: "flex-start",
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: -CLOSE_RISE,
  },
  headEndWide: { flex: 1 },
  mark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  named: { flex: 1, minWidth: 0 },
  title: { fontSize: TEXT.lg, fontWeight: "700" },
  under: { fontSize: TEXT.sm },
  tabs: { paddingVertical: SPACE.sm },
  said: { fontSize: TEXT.md, marginHorizontal: SPACE.xs, marginVertical: SPACE.sm },
  scroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  content: {
    gap: SPACE.md,
    paddingBottom: SPACE.lg,
    width: "100%",
    maxWidth: READING,
    alignSelf: "center",
  },
  page: {
    flex: 1,
    minHeight: 0,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  picture: { flex: 1, minHeight: 200 },
  card: { borderRadius: RADIUS.lg, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  part: { borderTopWidth: StyleSheet.hairlineWidth },
  rowMark: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  rowWords: { flex: 1, minWidth: 0 },
  rowName: { fontSize: TEXT.md, fontWeight: "600" },
  programs: {
    width: "100%",
    maxWidth: READING,
    alignSelf: "center",
    alignItems: "center",
    gap: SPACE.sm,
    padding: SPACE.lg,
    borderRadius: RADIUS.lg,
  },
  programsTitle: { fontSize: TEXT.body, fontWeight: "700", textAlign: "center" },
  programsBody: { fontSize: TEXT.sm, lineHeight: 19, textAlign: "center" },
  // The banner over the page, and the page under it taking what is left.
  bannered: { flex: 1, minHeight: 0, gap: SPACE.sm },
  bannerUnder: { flex: 1, minHeight: 0 },
  // The line under the Desktop tab's list, on its words' edge.
  note: { lineHeight: 18, marginHorizontal: SPACE.xs },
  // Media and Pages, under Phone | Desktop: two words on a hairline, the gold line under the one.
  shelves: {
    flexDirection: "row",
    gap: SPACE.xxl,
    paddingHorizontal: SPACE.xs,
    marginTop: SPACE.xs,
    marginBottom: SPACE.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  shelf: { paddingTop: 2, paddingBottom: SPACE.sm + 2 },
  shelfWords: { fontSize: TEXT.md, fontWeight: "600" },
  shelfCount: { fontSize: TEXT.sm, fontWeight: "500" },
  shelfLine: {
    position: "absolute",
    left: 0,
    bottom: -StyleSheet.hairlineWidth,
    width: BAR,
    height: 2.5,
    borderRadius: 2,
  },
  shelved: { flex: 1, minHeight: 0 },
  empty: { alignItems: "center", gap: SPACE.xs, paddingTop: 56, paddingHorizontal: SPACE.xxl },
  emptyTitle: { fontSize: TEXT.body, fontWeight: "700", textAlign: "center" },
  emptyBody: { fontSize: TEXT.sm, lineHeight: 19, textAlign: "center", maxWidth: 320 },
  // Media: the squares scroll in what the sheet leaves them, and the viewer's flight is clipped to it.
  glass: { flex: 1, minHeight: 0 },
  // Files: the folders' cards, a reading width wide, scrolling in what the sheet leaves them.
  files: {
    gap: SPACE.lg,
    paddingBottom: SPACE.xxl,
    width: "100%",
    maxWidth: READING,
    alignSelf: "center",
  },
  folder: { gap: SPACE.sm },
  folderName: { fontSize: TEXT.sm, fontWeight: "600", marginHorizontal: SPACE.xs },
  fileRow: { minHeight: 60 },
  fileMark: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  fileMarkPicture: { borderRadius: RADIUS.md },
  markDot: {
    position: "absolute",
    top: -3,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  media: { gap: SPACE.lg, paddingBottom: SPACE.xxl },
  day: { gap: SPACE.sm },
  dayHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginHorizontal: SPACE.xs,
  },
  dayWords: { fontSize: TEXT.sm, fontWeight: "600" },
  dayAside: { fontSize: TEXT.sm },
  // The room's Media squares: four points apart, each rounded on its own.
  grid: { gap: 4 },
  gridRow: { flexDirection: "row", gap: 4 },
  cell: { flex: 1, aspectRatio: 1 },
  square: { borderRadius: RADIUS.sm, overflow: "hidden" },
  pressed: { opacity: 0.7 },
  away: { opacity: 0 },
  fresh: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.35)",
  },
  // Pages: the chips, then what is drawn, taking what is left.
  pages: { flex: 1, minHeight: 0, gap: SPACE.sm },
  chips: { flexGrow: 0, marginHorizontal: -SPACE.lg },
  chipsRow: { gap: SPACE.sm, paddingHorizontal: SPACE.lg },
  chip: {
    height: 30,
    maxWidth: 240,
    paddingHorizontal: SPACE.md,
    borderRadius: 15,
    justifyContent: "center",
  },
  chipWords: { fontSize: TEXT.sm, fontWeight: "600" },
});
