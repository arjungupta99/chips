/**
 * The tabs, drawn by the phone itself.
 *
 * `NativeTabs` is UIKit's own tab controller. What stood here before it was a bar of this app's
 * own making — five marks over five words in the app's own amber, with its own press — and a bar
 * of one's own is a bar that is nobody's (Arjun, 11 September 2026: the app feels like Android's).
 * So the switching is the phone's, and on an iPad and on Android so is the bar.
 *
 * On an iPhone the bar is drawn over UIKit's, which is hidden (ADR 0233): out of the phone's own
 * parts, where UIKit's stood and the size it was, because it does what UIKit's has no setting for.
 * While a list is read it gets a little smaller and its names go, and the + with it; UIKit's
 * folded down to the tab in front instead. The lists say when (`ui/phoneBarNative.tsx`), and keep
 * room for the bar at their foot (`PlusRoom`), since the window's inset no longer includes it.
 *
 * The rail this app drew on an iPad goes with it: where a tab bar stands on an iPad is iPadOS's
 * to decide, and over a regular width it stands it at the top of the window, a pill of glass in
 * the middle (first seen on the iPad simulator, 15 October 2026; ADR 0177). The tabs' names stand
 * below it (`useTabTop`). The web target at an iPad's size keeps the rail it always drew.
 *
 * The web target keeps the drawn bar (`_layout.web.tsx`). The navigator's own fallback there is
 * a floating pill over the top of the page, which is neither a phone's bar nor an iPad's rail,
 * and the web target is where thirteen specs drive this app.
 *
 * What each tab opens is pushed over the whole window by the root stack rather than inside the
 * tab (`app/_layout.tsx`): a room has a composer at the foot of it, and a tab bar under a
 * keyboard is a row of buttons nobody meant to press.
 */

import type { Store } from "@chipschat/core";
import { Redirect, useRouter, useSegments } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { memo, useCallback, useEffect, useRef } from "react";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { topMiddle } from "../../src/newSpace/geometry";
import { useNewSpace } from "../../src/newSpace/NewSpace";
import { useOpens } from "../../src/newSpace/opens";
import { Plus } from "../../src/newSpace/Plus";
import { PLUS_GAP, PLUS_SIZE } from "../../src/newSpace/plusRoom";
import { useChips } from "../../src/store/provider";
import { barFrame, barLift } from "../../src/ui/barShape";
import { alpha } from "../../src/ui/Glass";
import { OpenedProvider } from "../../src/ui/opened";
import { PhoneBar, shrinkTo } from "../../src/ui/PhoneBar";
import { chooseTab, ReadingFeed } from "../../src/ui/phoneBarNative";
import { TabBarAsideProvider, useTabBarAside } from "../../src/ui/tabBarAside";
import { inBar, TAB_ORDER, TABS, type TabName, tabsShown } from "../../src/ui/tabs";
import { usePalette } from "../../src/ui/theme";
import type { Palette } from "../../src/ui/tokens";
import { useReduceMotion } from "../../src/ui/useReduceMotion";

export default function TabsLayout() {
  const { ready, paired } = useChips();

  // Nothing is drawn until the storage has answered: a flash of the pairing screen on every
  // launch, for a phone that is already paired, is a bug people remember.
  if (!ready) return null;
  if (paired === undefined) return <Redirect href="/pair" />;
  return (
    <TabBarAsideProvider>
      {/* Drawn afresh for each workspace, at Spaces (ADR 0197): a tab's state belongs to its store. */}
      <Tabs
        key={paired.device.deviceId}
        store={paired.store}
        selfId={paired.device.participantId}
      />
    </TabBarAsideProvider>
  );
}

/**
 * The bar, and the + at its end, whoever there is to ask: with nobody, the room it makes is empty
 * (ADR 0148).
 *
 * On an iPhone both are drawn by this app (ADR 0233) and shrink together on one spring while the
 * list in front is read: the lists say so through `ReadingFeed`. They come back to full size for
 * another tab, and when the bar comes back from stepping aside. The tab in front pressed again
 * takes its list to the top. With the phone on its side they are the size they are upright, a
 * little higher, and stay shrunk.
 *
 * On an iPad the bar is UIKit's, which stands it at the top of the window (ADR 0177), and its own
 * + is the button: a tab of the search kind that is never selected (`disabled`), whose press opens
 * the window out of the top of the screen, since the bar does not say where its + is. The gold +
 * stood alone at the foot of the screen there, over the room's send button (the iPad simulator, 15
 * October 2026). On Android the + floats above the end of Material's bar.
 *
 * Both step aside while a screen puts a bar of its own in their place: the Spaces list's, while
 * spaces are being picked (ADR 0181). Neither + is there for a member or a guest, who are added to
 * spaces rather than opening them (ADR 0196).
 */
function Tabs({ store, selfId }: { readonly store: Store; readonly selfId: string }) {
  const opens = useOpens(store, selfId);
  const { open } = useNewSpace();
  const aside = useTabBarAside();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const still = useReduceMotion();
  const chosen = useChosenTab();
  const landscape = width > height;
  // On its side a phone has little height to spare, so there the bar is always shrunk.
  const rest = DRAWN && landscape ? 1 : 0;
  const shrink = useSharedValue<number>(rest);
  const plus = useRef<View>(null);
  // Whether the list in front is being read: the bar and the + shrink while it is.
  const reading = useCallback(
    (on: boolean) => shrinkTo(shrink, on ? 1 : rest, still),
    [shrink, still, rest],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: back to rest when any of these changes
  useEffect(() => shrinkTo(shrink, rest, still), [chosen, aside, rest]);
  // As a finger on UIKit's bar would, so the tab comes up in the frame it is pressed; pressed again,
  // its list goes to the top. Through the router where that can't be done.
  const choose = useCallback(
    (tab: TabName) => {
      if (tab === chosen) shrinkTo(shrink, rest, still);
      void chooseTab(TABS[tab].title).then((done) => {
        if (!done && tab !== chosen) router.navigate(HREF[tab]);
      });
    },
    [chosen, router, shrink, still, rest],
  );
  // The window grows out of the + where it is, measured at the press rather than assumed.
  const grow = useCallback(() => {
    const at = plus.current;
    if (at === null) {
      open(topMiddle(width, insets.top));
      return;
    }
    at.measureInWindow((x, y, w, h) => open({ x, y, width: w, height: h }));
  }, [open, width, insets.top]);
  return (
    <OpenedProvider>
      <View style={styles.fill}>
        <ReadingFeed.Provider value={DRAWN ? reading : null}>
          <Bar onNewSpace={grow} hidden={DRAWN || aside} opens={opens} />
        </ReadingFeed.Provider>
        {DRAWN ? (
          <PhoneBar
            tabs={SHOWN}
            chosen={chosen}
            plus={opens}
            shrink={shrink}
            aside={aside}
            onChoose={choose}
          />
        ) : null}
        {GOLD_PLUS && opens ? (
          <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            <Plus
              ref={plus}
              onPress={grow}
              away={aside}
              shrink={DRAWN ? shrink : undefined}
              style={
                ANDROID
                  ? [styles.fab, { bottom: insets.bottom + MATERIAL_BAR + PLUS_GAP }]
                  : [
                      styles.plus,
                      {
                        bottom: insets.bottom + barLift(landscape) - PLUS_SIZE / 2,
                        right: barFrame(width, height, true, SHOWN.length, insets).right,
                      },
                    ]
              }
            />
          </View>
        ) : null}
      </View>
    </OpenedProvider>
  );
}

/** Whether the bar is the one this app draws, over UIKit's hidden one: on an iPhone (ADR 0233). */
const DRAWN = Platform.OS === "ios" && !Platform.isPad;

/** Whether the + is the gold one: on an iPhone, at the drawn bar's end, and on Android. */
const GOLD_PLUS = !(Platform.OS === "ios" && Platform.isPad);

/** Whether the + is the bar's own slot, a tab of the search kind: on an iPad. */
const SLOT = Platform.OS === "ios" && Platform.isPad;

/** The tabs a person sees, in order: constant for the life of a bundle. */
const SHOWN = tabsShown(__DEV__);

/** Where each tab is, for the drawn bar to go to. */
const HREF = {
  index: "/",
  agents: "/agents",
  search: "/search",
  you: "/you",
  runtime: "/runtime",
} as const satisfies Record<TabName, string>;

/**
 * The tab in front: the route the tabs are at, and the last one while a screen pushed over the
 * whole window is in front (`app/_layout.tsx`).
 */
function useChosenTab(): TabName {
  const segments: readonly string[] = useSegments();
  const last = useRef<TabName>("index");
  const here = segments[0] === "(tabs)" ? (segments[1] ?? "index") : undefined;
  if (here !== undefined && here in TABS) last.current = here as TabName;
  return last.current;
}

/**
 * Android's bar is Material's, which keeps no slot for a search tab: the slot was a sixth item at
 * the end of the bar with the + over half of it (the emulator, 16 October 2026). There the slot is
 * left out and the + floats above the bar's trailing end, where Android keeps its floating action
 * button, the bar's own height and Material's margin clear of it.
 */
const ANDROID = Platform.OS === "android";
const MATERIAL_BAR = 80;

const Bar = memo(function Bar({
  onNewSpace,
  hidden,
  opens,
}: {
  readonly onNewSpace: () => void;
  /**
   * Hidden under the drawn bar on an iPhone (ADR 0233), and stepped aside for a screen's own bar
   * elsewhere (ADR 0181), slid down as UIKit slides it (patched).
   */
  readonly hidden: boolean;
  /** Whether there is a + at all: for an owner or an admin (ADR 0196). */
  readonly opens: boolean;
}) {
  const palette = usePalette();

  return (
    <NativeTabs
      tintColor={palette.accent}
      hidden={hidden}
      // iOS 26 folds the bar down as a list goes up. On an iPhone it is hidden under the drawn
      // bar, which shrinks its own way (ADR 0233).
      minimizeBehavior="onScrollDown"
      {...(ANDROID ? materialLook(palette) : null)}
    >
      {TAB_ORDER.map((name) => {
        const tab = TABS[name];
        return (
          <NativeTabs.Trigger
            key={name}
            name={name}
            // Constant for the life of a bundle: hiding a tab while the app runs remounts the
            // navigator, and `__DEV__` never changes under one.
            hidden={!inBar(name, __DEV__)}
            testID={`tab-${name}`}
          >
            <NativeTabs.Trigger.Label>{tab.title}</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf={tab.symbol.sf} md={tab.symbol.md} />
          </NativeTabs.Trigger>
        );
      })}
      <NativeTabs.Trigger
        name="new"
        role="search"
        hidden={!SLOT || !opens}
        disabled
        listeners={{ tabPress: onNewSpace }}
        testID="tab-new"
      >
        <NativeTabs.Trigger.Label>Create new space</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="plus" md="add" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
});

/**
 * Material's bar in the app's own colours rather than the wallpaper's: its defaults are Android's
 * dynamic ones, a lilac bar and a lilac pill under the chosen tab beside the app's warm page and
 * accent (the emulator, 16 October 2026). The bar is a step under the page, as Material's surface
 * container is, the pill is the amber's soft wash under the accent, and every tab keeps its name,
 * as Material asks of a bar of three to five; by default only the chosen one did.
 */
function materialLook(palette: Palette) {
  return {
    backgroundColor: palette.surface2,
    indicatorColor: palette.amberSoft,
    rippleColor: alpha(palette.accent, 0.16),
    iconColor: { default: palette.ink3, selected: palette.accent },
    labelStyle: { default: { color: palette.ink3 }, selected: { color: palette.accent } },
    labelVisibilityMode: "labeled",
  } as const;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  plus: { position: "absolute" },
  fab: { position: "absolute", right: PLUS_GAP },
});
