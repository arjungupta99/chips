/**
 * The tabs on an iPad: a bar of glass at the window's bottom left, across the foot of the list, with
 * the gold + at its end (ADR 0276 and its addendum of 5 November 2026, which replaced ADR 0256's
 * sidebar beside the list and its fold into iPadOS's pill).
 *
 * The four tabs' marks stand in it, the one in front on its grey pill, and a press chooses one. The
 * bar and the + run across the list's foot, 16 points in from each side, as the iPhone's run across
 * the phone, and the bar's middle stands level with a room's composer, so the gold + and the
 * composer's + are on one line (`chrome.tsx`'s `PAD_BAR`). It never takes a column of its own, so
 * nothing under it moves.
 *
 * Where a detail stands at the window's edge under it and is narrow, the bar folds down to the tab
 * in front, so a room's composer keeps its width (`chrome.tsx`'s `barFolds`), the way iOS 26's own
 * bar shrinks to the tab in front. A press on it opens the four out again over the room's foot, and
 * a tab, the one in front again, or a tap beside them folds them back.
 *
 * It folds and opens out with the panes, when it is their move that makes it: after the room's
 * words have gone, as the list steps aside under it or comes back (`Foot.lead`, ADR 0279). Ahead of
 * them, it opened out over an iPad's composer upright while the list had yet to come back (the
 * 13-inch simulator, 7 November 2026).
 *
 * Until 5 November 2026 it was a smaller capsule with ☰ in it, and ☰ grew a sidebar up out of it
 * with the tabs' names, the pinned spaces and the workspaces. Arjun's words that day: "the hamburger
 * icon and floating section needs to go away. The bottom tab bar needs to become slightly bigger
 * (with the new extra space)". The pinned spaces stand first in Spaces (ADR 0240), and the
 * workspaces open from its name (ADR 0197), so nothing went with it. The motion is
 * `PadBarMotion.tsx`.
 *
 * UIKit's bar is hidden on an iPad, as it is under the iPhone's drawn bar (ADR 0233), and a tab is
 * chosen the same way the drawn bar chooses one (`chooseTab`). It steps aside while a screen puts a
 * bar of its own at the foot: the Spaces list's, while spaces are being picked (ADR 0181).
 */

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { barAcross, barFolds, PAD_BAR, useChrome } from "./chrome";
import { Capsule } from "./Glass";
import { Icon } from "./Icon";
import { Fading, type Frame, Moving } from "./PadBarMotion";
import { listWidth } from "./Split";
import { TABS, type TabName } from "./tabs";
import { usePalette } from "./theme";

export function PadBar({
  tabs,
  chosen,
  onChoose,
  plus,
  aside,
}: {
  readonly tabs: readonly TabName[];
  readonly chosen: TabName;
  readonly onChoose: (tab: TabName) => void;
  /** The gold +, where there is one: for an owner or an admin (ADR 0196). */
  readonly plus: ReactNode;
  /** A screen has a bar of its own at the foot: the bar steps aside for it. */
  readonly aside: boolean;
}) {
  const palette = usePalette();
  const { feet } = useChrome();
  const at = usePlaces(tabs.length);
  const foot = feet[chosen];
  const folds = barFolds(foot);
  // Folded, the four opened out again over the room's foot.
  const [out, setOut] = useState(false);
  useEffect(() => {
    if (!folds) setOut(false);
  }, [folds]);
  const { wait, now } = useWait(chosen, folds, foot?.lead ?? 0);
  const folded = folds && !out;
  const chosenAt = Math.max(0, tabs.indexOf(chosen));
  const press = (tab: TabName) => {
    now();
    if (tab === chosen && folds) {
      setOut(!out);
      return;
    }
    setOut(false);
    onChoose(tab);
  };
  return (
    <Fading
      shown={!aside}
      pointerEvents={aside ? "none" : "box-none"}
      style={StyleSheet.absoluteFill}
    >
      {folds && out ? (
        <Beside
          onPress={() => {
            now();
            setOut(false);
          }}
        />
      ) : null}
      <Moving frame={folded ? at.round : at.bar} wait={wait} testID="pad-bar">
        {/*
         * Opened out over a room, the glass stands on the ground it has over the list: through it
         * alone the composer's + and its faces showed between the tabs (the 13-inch simulator,
         * 5 November 2026).
         */}
        <Fading
          shown={folds && out}
          wait={wait}
          style={[styles.glass, { backgroundColor: palette.bg }]}
        />
        <Capsule style={styles.glass}>
          <View />
        </Capsule>
      </Moving>
      <Moving frame={folded ? at.round : at.pill(chosenAt)} wait={wait} pointerEvents="none">
        <Fading shown={!folded} wait={wait} style={styles.fill}>
          <Chosen />
        </Fading>
      </Moving>
      {tabs.map((tab, index) => (
        <Tab
          key={tab}
          tab={tab}
          chosen={tab === chosen}
          frame={folded ? at.round : at.tab(index)}
          // Folding, the last one sets off first; opening out, the first.
          delay={(folded ? tabs.length - 1 - index : index) * 16}
          wait={wait}
          fold={folds ? (folded ? "folded" : "out") : undefined}
          onPress={() => press(tab)}
        />
      ))}
      {plus === null ? null : (
        <Moving frame={at.plusAt(folded)} wait={wait}>
          {plus}
        </Moving>
      )}
    </Fading>
  );
}

/**
 * How long the bar waits before it moves: as long as the panes do, where it folds or opens out
 * because the foot of the tab in front moved with them (`lead`); at once for a tab chosen, or for a
 * press, which says so (`now`).
 */
function useWait(chosen: TabName, folds: boolean, lead: number) {
  const [moved, setMoved] = useState({ chosen, folds, wait: 0 });
  if (moved.chosen !== chosen || moved.folds !== folds) {
    setMoved({ chosen, folds, wait: moved.chosen === chosen ? lead : 0 });
  }
  const now = useCallback(() => setMoved((was) => ({ ...was, wait: 0 })), []);
  return { wait: moved.wait, now };
}

/**
 * Where everything stands, in the window: the bar at the bottom left across the list's foot, its
 * middle level with a room's composer; each tab its share of it; and the + past its end, or past the
 * round the bar folds to.
 */
function usePlaces(count: number) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const across = barAcross(listWidth(width));
  const top = height - insets.bottom - PAD_BAR.middle - PAD_BAR.height / 2;
  const inside = PAD_BAR.height - PAD * 2;
  const tab = count > 0 ? (across - PAD * 2) / count : 0;
  const tabAt = (index: number): Frame => ({
    left: PAD_BAR.left + PAD + index * tab,
    top: top + PAD,
    width: tab,
    height: inside,
  });
  return {
    bar: { left: PAD_BAR.left, top, width: across, height: PAD_BAR.height },
    round: { left: PAD_BAR.left, top, width: PAD_BAR.height, height: PAD_BAR.height },
    tab: tabAt,
    // A little wider than its tab, as UIKit drew the iPhone's (`barShape.ts`'s `PILL_SPILL`).
    pill: (index: number): Frame => {
      const under = tabAt(index);
      return { ...under, left: under.left - SPILL, width: (under.width ?? 0) + SPILL * 2 };
    },
    plusAt: (folded: boolean): Frame => ({
      left: PAD_BAR.left + (folded ? PAD_BAR.height : across) + PAD_BAR.gap,
      top: top + (PAD_BAR.height - PAD_BAR.plus) / 2,
    }),
  };
}

/** A tap beside the tabs opened out over a narrow room folds them back. */
function Beside({ onPress }: { readonly onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel="Fold the tabs"
      onPress={onPress}
      style={StyleSheet.absoluteFill}
      testID="pad-bar-beside"
    />
  );
}

/** The ground under the tab in front. */
function Chosen() {
  const palette = usePalette();
  return <View style={[styles.fill, styles.pill, { backgroundColor: palette.surface3 }]} />;
}

/**
 * A tab: its mark, in its share of the bar, or alone in the round the bar folds to. Folded, only the
 * tab in front is there, and a press on it opens the four out again.
 */
function Tab({
  tab,
  chosen,
  frame,
  delay,
  wait,
  fold,
  onPress,
}: {
  readonly tab: TabName;
  readonly chosen: boolean;
  readonly frame: Frame;
  readonly delay: number;
  /** How long the bar waits before it moves (`PadBarMotion`'s `wait`). */
  readonly wait: number;
  /** Over a narrow room, the bar folded or opened out again; nothing on a bar that has not folded. */
  readonly fold: "folded" | "out" | undefined;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  const shown = chosen || fold !== "folded";
  // On the chosen ground (`surface3`), the accent's darker ink reads at 4.5:1 in light.
  const ink = chosen ? palette.accentInk : palette.ink;
  const { mark, title } = TABS[tab];
  const front = chosen && fold !== undefined;
  return (
    <Moving frame={frame} delay={delay} wait={wait} pointerEvents={shown ? "box-none" : "none"}>
      <Fading shown={shown} after={chosen ? 0 : 160} wait={wait} style={styles.fill}>
        <Pressable
          accessibilityRole="tab"
          accessibilityLabel={title}
          accessibilityHint={front && fold === "folded" ? "Shows every tab" : undefined}
          accessibilityState={
            front ? { selected: chosen, expanded: fold === "out" } : { selected: chosen }
          }
          onPress={onPress}
          style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.6 : 1 }]}
          testID={`pad-bar-${tab}`}
        >
          <Icon name={mark} size={MARK} color={ink} weight={1.9} />
        </Pressable>
      </Fading>
    </Moving>
  );
}

/** Inside the bar, round its tabs. */
const PAD = 4;
/** How much wider than its tab the chosen tab's pill is, each side. */
const SPILL = 2;
/** A tab's mark: the capsule's 21, grown into the room ☰ left. */
const MARK = 25;

const styles = StyleSheet.create({
  glass: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: PAD_BAR.height / 2,
  },
  fill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  pill: { borderRadius: (PAD_BAR.height - PAD * 2) / 2 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center" },
});
