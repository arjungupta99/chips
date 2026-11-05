/**
 * A screen: the safe area, the page colour, and a title. Every tab starts with one, so the
 * background is the palette's rather than the platform's white and nothing sits under the notch.
 *
 * The title is what says whether this screen is the top of the window. A tab is: it draws its
 * own name, large, and has to clear the notch itself. A screen pushed onto the stack is not —
 * a navigation bar stands above it with the name already in it, and it must not claim the top
 * inset a second time. `react-native-screens` reports the window's insets inside a screen
 * whatever its header does, so a pushed screen asking for `top` gets a band of empty page
 * between the bar and the first words.
 *
 * A tab's name should be the platform's rather than this one's, and on 12 September 2026 (WP3)
 * it was tried: each tab a stack of one screen with `headerLargeTitleEnabled`, which is how an
 * iPhone draws the name of a list and shrinks it into the bar as the list goes up. It does not
 * work inside the phone's own tab bar in expo-router 57.0.19 over react-native-screens 4.26.0.
 * The bar comes up at the full height a large title needs and draws nothing in it: only the tab
 * the app launched into ever showed one, and that one lost it the moment another tab had been
 * in front. The small title was there all along — it appeared as soon as the list was scrolled
 * — so it is the large label alone, and neither the styling, nor declaring the title on the
 * screen rather than the navigator, nor handing the stack the scroll view's insets moved it.
 * A name that is there on the first screen of a session and gone from every one after is worse
 * than a name this app draws itself, so this draws it. The bar itself is the platform's
 * everywhere it works: the tabs (`app/(tabs)/_layout.tsx`) and every pushed screen.
 *
 * So it draws it at the size iOS would have: `TEXT.title` is 34, bold, sixteen points in from the
 * left edge (WP5; it was 26 until 12 September 2026). If the name is going to be this app's, it
 * should at least be the right size and in the right place — the eye reads the top of a list
 * against every other list it has ever seen on this phone, and a name two sizes small is the
 * sort of thing that reads as *not quite* long before anybody can say why.
 *
 * ## A name over glass
 *
 * The tabs a person lives in — Spaces, Agents, You — float their name (`glass`). The name was a
 * shelf: the page's own colour, with the list cut off hard along its foot, which is how a bar
 * looked before iOS 7 and nothing like one now (Arjun, 26 September 2026: make the top nav bar
 * semi-transparent). Now the list runs the whole height of the window, up under the status bar,
 * and the name floats over it on the band of blur a room already stands its bar on
 * (`EdgeBand`, `Glass.tsx`): the rows are there under the name, blurred, and come clear below
 * it. One material for the top of every screen that has something passing under it, dialled
 * once (`glassDial.ts`).
 *
 * The list has to be told how much of its top the name covers, since it is no longer pushed down
 * by it: its scroll view (`UnderName`) takes that as padding above its first row and as an inset
 * for its scroll bar. The status bar's share is the window's to give — each list already takes
 * the window's insets (`contentInsetAdjustmentBehavior="automatic"`), which is what keeps its
 * last row clear of the tab bar, and a vertical scroll view always bounces, so iOS adjusts its
 * top too. Where there is no glass — the web target, Android, Reduce Transparency on, a build
 * without the band's module — the name is the shelf it was, and the list is told nothing. The ramp
 * comes down only once the list has moved (`Floating`, below);
 * [ADR 0076](../../../../docs/decisions/0076-a-tabs-name-floats-on-the-rooms-glass.md) has why,
 * and [ADR 0098](../../../../docs/decisions/0098-a-tabs-glass-follows-its-list-natively.md) why
 * the list moves it from the native side.
 */

import {
  createContext,
  type ReactNode,
  type Ref,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FlatList,
  type FlatListProps,
  findNodeHandle,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewProps,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { BAR_ROOM } from "./barShape";
import { EdgeBand, GLASS, useGlassy } from "./Glass";
import { OnGround, useGround } from "./ground";
import { Icon } from "./Icon";
import { useLayout } from "./layout";
import { useInReadingTabs } from "./phoneBarNative";
import { hasScrollBand, ScrollBand } from "./ScrollBand";
import { PANE_COLUMN, ROOM_SHARE, useSides, useSplitSide } from "./Split";
import { Swap } from "./Swap";
import { Sweep } from "./SwitchMotion";
import { usePalette } from "./theme";
import { RADIUS, SPACE, TEXT } from "./tokens";
import {
  type Glide,
  UnderBand,
  UnderBody,
  UnderLine,
  UnderRoom,
  UnderShelf,
  useGlide,
} from "./UnderMotion";
import { useRaisedTop, useTabTop } from "./windowInsets";

export function Screen({
  title,
  count,
  action,
  opens,
  head,
  under,
  testID,
  glass,
  grouped,
  children,
}: {
  readonly title?: string | undefined;
  /** A number beside the name, when the screen is about a number. Nothing when it is zero. */
  readonly count?: number | undefined;
  /**
   * What stands at the trailing end of the name, where a navigation bar keeps its right-hand
   * button: the connection's mark, and nothing else so far (`Connection.tsx`). It is drawn on
   * the same row as the name rather than above the list, so that a thing which comes and goes
   * costs the list below it nothing.
   */
  readonly action?: ReactNode;
  /**
   * The name opens something: Spaces' name is the workspace's, and opens its switcher (ADR 0197's
   * addendum). A ▾ follows the name, and a dot when something waits elsewhere.
   */
  readonly opens?: Opens | undefined;
  /**
   * A handle on the screen itself, for a test that must say which one it means: a tab visited
   * stays mounted under the one in front, and on the web target it is drawn there in full.
   */
  readonly testID?: string | undefined;
  /**
   * The list runs under the name, and the name floats over it on glass (above). Only where the
   * list is an `UnderName`: a screen whose body cannot be told where the name ends would
   * start underneath it.
   */
  readonly glass?: true | undefined;
  /**
   * A screen of inset groups, as You is: it stands on the grouped ground, under the paper in light,
   * so its white cards read as cards (ADR 0192's addendum, `ground.tsx`).
   */
  readonly grouped?: true | undefined;
  /**
   * What stands where the name would, in its place: the Search tab's field (ADR 0132), which is
   * that screen's name as much as anything is. The tab's name is still the bar's and VoiceOver's.
   */
  readonly head?: ReactNode;
  /**
   * What stands just under the head while there is something to show, and its height, known
   * before it is drawn: Search's chips, which come with the first letter typed. The list and the
   * glass make room for it in the same frame it appears. Measured, as the head is, the room came a
   * frame or two late, and the first results jumped down under the chips (7 October 2026).
   *
   * It comes and goes on a spring (`UnderMotion.tsx`): the list's room for it opens, and it fades
   * and drops into it; going, it fades first and the room shuts after it. Search's results are
   * laid out under its chips at once, since they come with them.
   */
  readonly under?: Under | undefined;
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  const glassy = useGlassy();
  const aligned = useHeadColumn();
  const named =
    head ??
    (title === undefined ? null : (
      <Head title={title} count={count} action={action} opens={opens} />
    ));
  const top = named === null ? null : <View style={aligned}>{named}</View>;
  const { kept, glide, live } = useUnder(under);
  const below =
    kept === undefined ? undefined : { ...kept, node: <View style={aligned}>{kept.node}</View> };
  if (glass === true && glassy && hasScrollBand() && top !== null) {
    return grounded(
      grouped,
      <Floating head={top} under={below} glide={glide} live={live} testID={testID}>
        {children}
      </Floating>,
    );
  }
  const body = <View style={styles.body}>{children}</View>;
  const heads = shelved(top, below, glide, live);
  return grounded(
    grouped,
    <Page
      edges={top === null ? SIDES : TOP_AND_SIDES}
      style={[
        styles.page,
        BODY_FIRST ? styles.bodyFirst : null,
        { backgroundColor: grouped ? palette.grouped : palette.bg },
      ]}
      testID={testID}
    >
      {BODY_FIRST ? body : heads}
      {BODY_FIRST ? heads : body}
    </Page>,
  );
}

/** A screen of inset groups stands on the grouped ground; any other, on whatever it is in. */
function grounded(grouped: true | undefined, screen: ReactNode): ReactNode {
  return grouped ? <OnGround kind="grouped">{screen}</OnGround> : screen;
}

/**
 * The name where it is a shelf, and the line under it on a shelf of its own, opened and shut on
 * its spring (`UnderShelf`): the list below moves down as it opens.
 */
function shelved(top: ReactNode, below: Under | undefined, glide: Glide, live: boolean) {
  if (below === undefined) return top;
  return (
    <View>
      {top}
      <UnderShelf glide={glide} height={below.height}>
        <View pointerEvents={live ? "box-none" : "none"} style={styles.fill}>
          {below.node}
        </View>
      </UnderShelf>
    </View>
  );
}

/** What stands under a screen's name, and how tall it is (`Screen`'s `under`). */
interface Under {
  readonly node: ReactNode;
  readonly height: number;
}

/**
 * The line under the name, kept while it goes so that it can fade (`kept`), the spring it comes
 * and goes on, and whether it is still asked for (`live`): going, it takes no presses.
 */
function useUnder(under: Under | undefined) {
  const live = under !== undefined;
  const glide = useGlide(live);
  const last = useRef(under);
  if (under !== undefined) last.current = under;
  return { kept: under ?? (glide.there ? last.current : undefined), glide, live };
}

/**
 * A page that is not a glass one: padded with the window's top and the insets of the edges it
 * stands at, from the root (`useTabTop`, `useSides`), never the native safe-area view's.
 *
 * On Android that view measures on a pre-draw pass, and the launch picture holds every pre-draw
 * until the app has something to show (`expo-splash-screen`): the first frames of a tab drew its
 * name under the status bar, and it dropped into place a beat later (the emulator, 16 October
 * 2026). On the iPhone Duo it padded a page beside the column with the column's 84 points as well,
 * wherever the page stood, and its top with the window's 0, under UIKit's own bars' 24 (the
 * simulator, 2 November 2026): Invite someone stood in half its page.
 */
function Page({
  edges,
  style,
  testID,
  children,
}: {
  readonly edges: typeof SIDES | typeof TOP_AND_SIDES;
  readonly style: StyleProp<ViewStyle>;
  readonly testID: string | undefined;
  readonly children: ReactNode;
}) {
  const top = useTabTop();
  const sides = useSides();
  const padding = {
    paddingTop: edges === TOP_AND_SIDES ? top : 0,
    paddingLeft: sides.left,
    paddingRight: sides.right,
  };
  return (
    <View style={[style, padding]} testID={testID}>
      {children}
    </View>
  );
}

/**
 * How far down the window the name reaches, in two halves — the status bar's and its own — what
 * stands under it and how open its room is, and which view the list under it is, for the band to
 * follow.
 */
interface NameRoom {
  readonly top: number;
  readonly name: number;
  readonly under: UnderRoomOf | undefined;
  /** The spring the line's room opens and shuts on, wherever the name floats. */
  readonly glide: Glide | undefined;
  readonly list: ((tag: number | null) => void) | undefined;
}

/** The line under the name, as a list makes room for it: its height, and whether still asked for. */
interface UnderRoomOf {
  readonly height: number;
  readonly live: boolean;
}

const NO_ROOM: NameRoom = { top: 0, name: 0, under: undefined, glide: undefined, list: undefined };

const NameRoomContext = createContext<NameRoom>(NO_ROOM);

/** The title's line: what iOS gives thirty-four points of its own face, written down. */
const TITLE_LINE = 41;

/**
 * The name's height before it has been measured: its padding and one line of the title at its
 * own line height. It is what the list is laid out with on the first frame, so that the first
 * row is not drawn under the name and then moved; a larger text size moves it once, when the
 * name has measured itself.
 */
const NAME_GUESS = SPACE.md + TITLE_LINE + SPACE.sm;

/**
 * A screen whose list runs under its name (`glass`, above).
 *
 * The band is the room's: solid behind the status bar and the name, and a ramp below the name
 * where the rows come clear. Below it, not across the name's lower half — tried on 26 September
 * 2026, and a row's words half way up the ramp stood sharp enough to read through the title. But
 * a ramp below the name lies over the list's first row while nothing has scrolled at all, and
 * dims the search field for no reason. So it does what UIKit's own edge effect does, and is only
 * there once something is passing under: at rest the band stands a ramp's length higher, its
 * ramp tucked into the name, and it comes down into place over the first points the list
 * scrolls. It moves by transform — a blur's opacity is the one thing UIKit asks never to animate.
 *
 * The list moves it on the native side, and nothing of React Native's stands between them
 * (`ScrollBand`, ADR 0098). Until 2 October 2026 a native-driven `Animated.event` did. On Arjun's
 * iPhone the glass sometimes ended far above the name. That was blamed on the move, twice. It was
 * the size (ADR 0107): on iOS 27 a tab off screen is told its top inset is 0. The band was drawn
 * 62 points short, and its masks were not drawn again when it grew. So the status bar's height
 * comes from the window (`useWindowInsets`), and the band is drawn afresh at each size (`EdgeBand`).
 */
function Floating({
  head,
  under,
  glide,
  live,
  testID,
  children,
}: {
  /** The name's row, or what stands in its place. */
  readonly head: ReactNode;
  /** What stands under it, at a height known before it is drawn (`Screen`'s `under`). */
  readonly under?: Under | undefined;
  /** The spring it comes and goes on, and whether it is still asked for (`useUnder`). */
  readonly glide: Glide;
  readonly live: boolean;
  readonly testID?: string | undefined;
  readonly children: ReactNode;
}) {
  const { ground } = useGround();
  // The window's sides, and its top or the tab's own, whichever is lower: on iOS 27 a tab off
  // screen is told its top is 0 (ADR 0107), and on an iPad the tab's own top is under its tab bar
  // (ADR 0177).
  const sides = useSides();
  const top = useTabTop();
  const [name, setName] = useState(NAME_GUESS);
  const [list, setList] = useState<number | null>(null);
  // The name, and what stands under it with the spring its room opens on: what the list leaves
  // above its first row.
  const below = under?.height ?? 0;
  const lined = under !== undefined;
  const room = useMemo(
    () => ({
      top,
      name,
      under: lined ? { height: below, live } : undefined,
      glide,
      list: setList,
    }),
    [top, name, lined, below, glide, live],
  );
  const ramp = GLASS.rampTop;
  const band = <EdgeBand edge="top" height={top + name + below + ramp} ramp={ramp} />;
  return (
    // The window's sides, as padding, rather than a safe-area view's: that view lays out all it
    // holds again whenever any of its insets changes, the bottom included, which it does not even
    // pad, and a tab's bottom moves as the tab bar steps aside and comes back (ADR 0181).
    <View
      style={[
        styles.page,
        { backgroundColor: ground, paddingLeft: sides.left, paddingRight: sides.right },
      ]}
      testID={testID}
    >
      {/* First among the page's children, for the tab bar's sake (`BODY_FIRST`, below). */}
      <NameRoomContext.Provider value={room}>
        <View style={styles.body}>{children}</View>
      </NameRoomContext.Provider>
      <ScrollBand
        scrollView={list}
        ramp={ramp}
        style={[styles.band, { height: top + name + below + ramp }]}
      >
        {lined ? (
          <UnderBand glide={glide} height={below}>
            {band}
          </UnderBand>
        ) : (
          band
        )}
      </ScrollBand>
      <View
        pointerEvents="box-none"
        style={[styles.floating, { top, left: sides.left, right: sides.right }]}
        onLayout={(event) => setName(event.nativeEvent.layout.height)}
      >
        {head}
      </View>
      {under === undefined ? null : (
        <View
          pointerEvents={live ? "box-none" : "none"}
          style={[
            styles.floating,
            {
              top: top + name,
              left: sides.left,
              right: sides.right,
              height: under.height,
            },
          ]}
        >
          <UnderLine glide={glide} style={styles.fill}>
            {under.node}
          </UnderLine>
        </View>
      )}
    </View>
  );
}

/**
 * A screen's list, which knows where a floating name ends: room above its first row, on top of
 * whatever padding the list gives itself, its scroll bar kept below the name, and which view it
 * is handed to the band (`Floating`, above). On a screen whose name is a shelf it is a plain
 * `ScrollView`.
 *
 * A scroll view of its own rather than a hook, because the name's height is the screen's to
 * know, and the list is drawn inside the screen by a component that is drawn outside it.
 *
 * A `ref` reaches the scroll view itself, for a page that moves its own list: Invite someone glides
 * down to the link it makes (`useScrollGlide`).
 */
export function UnderName({
  contentContainerStyle,
  scrollIndicatorInsets,
  children,
  ref: own,
  ...rest
}: ScrollViewProps & { readonly ref?: Ref<ScrollView> | undefined }) {
  const { name: covered, under, glide, list } = useContext(NameRoomContext);
  // What iOS leaves out of the list's own inset, on the iPhone Duo (`useRaisedTop`).
  const name = covered + useRaisedTop();
  const foot = useBarFoot();
  const ref = useCallback(
    (view: ScrollView | null) => {
      list?.(view === null ? null : findNodeHandle(view));
      if (typeof own === "function") own(view);
      else if (own) own.current = view;
    },
    [list, own],
  );
  if (list === undefined || glide === undefined) {
    return (
      <ScrollView
        {...rest}
        ref={own}
        contentContainerStyle={contentContainerStyle}
        scrollIndicatorInsets={withFoot(scrollIndicatorInsets, foot)}
      >
        {children}
      </ScrollView>
    );
  }
  // The name's room is padding. The line's is a view at the head of the list, laid open at once,
  // and the list's own content below it, in the list's own style, is moved by a transform while
  // the room opens and shuts (`UnderRoom`, `UnderBody`), so the rows glide rather than jump, and
  // are not laid out again on every frame.
  const line = under?.height ?? 0;
  return (
    <ScrollView
      {...rest}
      ref={ref}
      contentContainerStyle={{ paddingTop: name }}
      scrollIndicatorInsets={{
        ...withFoot(scrollIndicatorInsets, foot),
        top: (scrollIndicatorInsets?.top ?? 0) + name + line,
      }}
    >
      {under === undefined ? null : <UnderRoom glide={glide} height={line} />}
      <UnderBody glide={glide} height={line} style={contentContainerStyle}>
        {children}
      </UnderBody>
    </ScrollView>
  );
}

/** A list `UnderNameList` can draw in: a `FlatList`, or one with its props that moves its rows. */
export type ListOf<T> = (
  props: FlatListProps<T> & { readonly ref?: Ref<FlatList<T>> },
) => ReactNode;

/**
 * `UnderName` for a list that draws its rows as they come into view: a `FlatList`, told the same
 * things. Search's results (ADR 0132), which may be every room there is, in a list that moves its
 * rows as they come and go (`List`, ADR 0189).
 */
export function UnderNameList<T>({
  contentContainerStyle,
  scrollIndicatorInsets,
  List = FlatList as unknown as ListOf<T>,
  ...rest
}: FlatListProps<T> & { readonly List?: ListOf<T> }) {
  const { name: covered, under, list } = useContext(NameRoomContext);
  const name = covered + useRaisedTop();
  const foot = useBarFoot();
  const ref = useCallback(
    (view: FlatList<T> | null) =>
      list?.(view === null ? null : (view.getScrollableNode() as number | null)),
    [list],
  );
  if (list === undefined) {
    return (
      <List
        {...rest}
        contentContainerStyle={contentContainerStyle}
        scrollIndicatorInsets={withFoot(scrollIndicatorInsets, foot)}
      />
    );
  }
  // Laid out under the line at once, while it fades in: Search's results come with its chips.
  const lined = under?.live === true ? under.height : 0;
  return (
    <List
      {...rest}
      ref={ref}
      {...belowName(name + lined, contentContainerStyle, withFoot(scrollIndicatorInsets, foot))}
    />
  );
}

/**
 * How far above the foot of the window a tab's scroll bar stops: clear of the bar drawn over the
 * list on an iPhone (ADR 0233), whose rows already keep that room (`PlusRoom`). UIKit's bar was in
 * the safe area, and the scroll bar stopped above it by itself.
 */
function useBarFoot(): number {
  return useInReadingTabs() ? BAR_ROOM : 0;
}

/** A scroll bar's insets with the bar's room added at the foot. */
function withFoot(
  insets: ScrollViewProps["scrollIndicatorInsets"],
  foot: number,
): ScrollViewProps["scrollIndicatorInsets"] {
  return foot === 0 ? insets : { ...insets, bottom: (insets?.bottom ?? 0) + foot };
}

/** Room above the first row for the name, on top of the list's own padding, and for its scroll bar. */
function belowName(
  name: number,
  contentContainerStyle: ScrollViewProps["contentContainerStyle"],
  scrollIndicatorInsets: ScrollViewProps["scrollIndicatorInsets"],
) {
  const flat = StyleSheet.flatten(contentContainerStyle) ?? {};
  const own = flat.paddingTop ?? flat.paddingVertical ?? flat.padding ?? 0;
  return {
    contentContainerStyle: [
      contentContainerStyle,
      { paddingTop: (typeof own === "number" ? own : 0) + name },
    ],
    scrollIndicatorInsets: {
      ...scrollIndicatorInsets,
      top: (scrollIndicatorInsets?.top ?? 0) + name,
    },
  };
}

/**
 * The screen's own title, and its heading: the tab navigator draws no header, so this is the one
 * place the screen says what it is, to an eye and to a screen reader alike. The count is said in
 * the heading rather than beside it, so the reader who cannot see the chip is told how many as
 * part of the name of where they are.
 */
function Head({
  title,
  count,
  action,
  opens,
}: {
  readonly title: string;
  readonly count?: number | undefined;
  readonly action?: ReactNode;
  readonly opens?: Opens | undefined;
}) {
  const palette = usePalette();
  const counted = count !== undefined && count !== 0;
  // Crossfaded as the words change, not as a count in them does (`Swap`).
  const name = (
    <Swap swapKey={title.replace(/\d+/g, "#")} roll={opens !== undefined}>
      <Text
        accessibilityRole="header"
        accessibilityLabel={counted ? `${title}, ${count}` : title}
        // A workspace's name is often "Meera's workspace": a little smaller before it is cut short.
        numberOfLines={opens === undefined ? undefined : 1}
        adjustsFontSizeToFit={opens !== undefined}
        minimumFontScale={0.7}
        style={[styles.title, { color: palette.ink }]}
      >
        {title}
      </Text>
    </Swap>
  );
  return (
    <View style={styles.head}>
      {opens === undefined ? (
        name
      ) : (
        <Opening opens={opens} label={title}>
          {name}
        </Opening>
      )}
      {counted ? (
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.count, { backgroundColor: palette.amberSoft, color: palette.amberInk }]}
        >
          {count}
        </Text>
      ) : null}
      {action === undefined ? null : <View style={styles.action}>{action}</View>}
      {opens?.busy === true ? (
        <Sweep
          color={palette.gold}
          track={palette.line}
          style={styles.sweep}
          testID={opens.testID === undefined ? undefined : `${opens.testID}-arriving`}
        />
      ) : null}
    </View>
  );
}

/**
 * On iOS the body comes first among the page's children and is drawn below the name all the
 * same. UIKit looks for a tab's scroll view down the chain of first children only, and a list
 * it never finds is a list the tab bar cannot shrink away from as it goes up
 * (`app/(tabs)/_layout.tsx`): with the name first, the bar stood at full height over every list
 * until 24 September 2026. The web keeps the order it reads in, because a browser's reading and
 * tabbing order is the document's.
 */
const BODY_FIRST = Platform.OS === "ios";

/**
 * The width a column of cards or text stops growing at on a wide screen, centred in whatever is
 * left. A card stretched across an iPad is a line of text seventy words long, which nobody
 * reads; a phone never gets near the number and is not touched by it.
 */
export const COLUMN = 760;

/**
 * The style for a scroll view's content, or any column: full width on a phone, a page on an iPad.
 * Beside a list, a page has Settings' margins (ADR 0276): Arjun wanted what is on the right to take
 * the right's width rather than a column of 760 (3 November 2026), and then "some margin on left
 * and right, similar to how ipad settings have". A group's own margin is inside the column.
 */
export function useColumn(): ViewStyle {
  const { wide } = useLayout();
  const side = useSplitSide();
  if (side === "detail" || side === "third") return styles.pane;
  return wide ? styles.column : styles.full;
}

/**
 * A room's conversation and its composer: narrower than a page's column, since a line of chat is
 * read at a glance and its reply is typed under it. On a 13-inch on its side the reply sat a
 * thousand points from the send button before this (ADR 0256).
 */
export const ROOM_COLUMN = 680;

/**
 * The style for a room's lines and its foot: the whole room on a phone, a column on an iPad, and
 * beside the list margins in proportion to the room, its lines at most a page's column (ADR 0276's
 * addendums; Arjun, 3 and 4 November 2026: "we need the same left right margins for message window
 * as well in a space", and the same where the room stands at the window's edge beside its details).
 * In proportion rather than a column in the middle alone, so the room has its margins at every
 * width it moves through, beside the list or not: 70 either side on a 13-inch on its side beside the
 * list, 66 at the window's edge beside the details. A bubble keeps its own width.
 */
export function useRoomColumn(): ViewStyle {
  const { wide } = useLayout();
  const side = useSplitSide();
  if (side === "detail") return styles.roomPane;
  return wide ? styles.roomColumn : styles.full;
}

/**
 * The style for a screen's name and what stands under it: the page's column on a wide screen, so
 * the name stands over the cards it names rather than at the window's edge with the page beginning
 * two hundred points in from it (the iPad simulator, 15 October 2026: You, and the first run's
 * Welcome); and the list's own edge in a split's list, which is no wider than a column anyway.
 */
function useHeadColumn(): ViewStyle {
  const column = useColumn();
  return useSplitSide() === "list" ? styles.full : column;
}

export function Empty({ children }: { readonly children: ReactNode }) {
  const palette = usePalette();
  // Not in a list, so nothing adjusts it for the status bar: under a floating name it needs both.
  const { top, name, under } = useContext(NameRoomContext);
  const below = under?.height ?? 0;
  return (
    <Text style={[styles.empty, { color: palette.ink3, marginTop: top + name + below }]}>
      {children}
    </Text>
  );
}

const SIDES = ["left", "right"] as const;
const TOP_AND_SIDES = ["top", "left", "right"] as const;

/** What a name opens, and how it says so. */
export interface Opens {
  readonly onPress: () => void;
  /** What a screen reader hears it does. */
  readonly hint: string;
  /** Something waits that this opens the way to. */
  readonly dot?: boolean | undefined;
  /** What the name names is on its way: a line sweeps under it until it is here (ADR 0197). */
  readonly busy?: boolean | undefined;
  /** A word worn beside the name: Demo, for the made-up workspace (ADR 0213). */
  readonly tag?: string | undefined;
  readonly testID?: string | undefined;
}

/** The name as a button: the name, a ▾ after it, and the dot when something waits. */
function Opening({
  opens,
  label,
  children,
}: {
  readonly opens: Opens;
  readonly label: string;
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={opens.hint}
      onPress={opens.onPress}
      hitSlop={SPACE.xs}
      testID={opens.testID}
      style={({ pressed }) => [styles.opening, pressed ? styles.pressed : null]}
    >
      <View style={styles.shrink}>{children}</View>
      {opens.tag === undefined ? null : (
        <Text
          style={[styles.tag, { backgroundColor: palette.goldSoft, color: palette.goldDeep }]}
          maxFontSizeMultiplier={1.3}
          testID={opens.testID === undefined ? undefined : `${opens.testID}-tag`}
        >
          {opens.tag}
        </Text>
      )}
      <Icon name="down" size={22} color={palette.ink3} />
      {opens.dot === true ? (
        <View
          style={[styles.dot, { backgroundColor: palette.red }]}
          testID={opens.testID === undefined ? undefined : `${opens.testID}-dot`}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  bodyFirst: { flexDirection: "column-reverse" },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.md,
    paddingBottom: SPACE.sm,
  },
  title: {
    fontSize: TEXT.title,
    lineHeight: TITLE_LINE,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  // Hard against the trailing edge, whatever the name's length: the eye finds a bar's right-hand
  // button in the same place on every screen, and a name that grew should not move it.
  action: { marginLeft: "auto", paddingLeft: SPACE.sm },
  // A name that opens something: the ▾ stays in view however long the name, which gives way.
  opening: { flexDirection: "row", alignItems: "center", gap: SPACE.xs, flexShrink: 1 },
  shrink: { flexShrink: 1 },
  pressed: { opacity: 0.6 },
  dot: { width: 9, height: 9, borderRadius: 5, marginLeft: 2 },
  // A pill beside the name, as the Main tag is beside an agent's (ADR 0145).
  tag: {
    fontSize: TEXT.xs,
    fontWeight: "700",
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 2,
    overflow: "hidden",
  },
  // Across the foot of the name's row, in the room its padding leaves, so nothing moves for it.
  sweep: { position: "absolute", left: SPACE.lg, right: SPACE.lg, bottom: 1 },
  count: {
    fontSize: TEXT.sm,
    fontWeight: "700",
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 2,
    overflow: "hidden",
  },
  body: { flex: 1 },
  floating: { position: "absolute" },
  fill: { flex: 1 },
  band: { position: "absolute", top: 0, left: 0, right: 0 },
  empty: { padding: SPACE.lg, fontSize: TEXT.md },
  column: { width: "100%", maxWidth: COLUMN, alignSelf: "center" },
  pane: { width: "100%", maxWidth: PANE_COLUMN, alignSelf: "center" },
  roomPane: { width: `${ROOM_SHARE * 100}%`, maxWidth: PANE_COLUMN, alignSelf: "center" },
  roomColumn: { width: "100%", maxWidth: ROOM_COLUMN, alignSelf: "center" },
  full: { width: "100%" },
});
