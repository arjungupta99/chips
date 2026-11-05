/**
 * The tabs and the gold + in the iPhone Duo's column (ADR 0256, the mock's section 11).
 *
 * The Duo stands an app's bars in a column down the edge of the screen, the status bar at its top,
 * the buttons of the screen in front under it and the tabs at its foot, and keeps the column clear
 * in the safe area (`duo.tsx`). UIKit moves its own bars there; the tab bar Chips draws (ADR 0233)
 * it does not, and at the foot of the screen it stood across the room's composer on the open Duo
 * (the simulator, 2 November 2026). So on the Duo the tabs stand here instead: a capsule of glass
 * at the foot of the column, a tab under another, the gold + under them.
 *
 * Where the Duo says the lane down the column that UIKit keeps its own buttons in, they stand in
 * it, so the tabs line up under a room's back button: six points in from the column's middle, away
 * from the curve of the screen's edge (the simulator, iOS 27.2). Where it doesn't, they stand in the
 * middle of the column, at the foot of the safe area.
 *
 * It doesn't shrink while a list is read, as the bar at the foot does: it stands beside the list
 * and not over it, so there is nothing to give back. It steps aside, as the bar does, for a
 * screen's own bar (ADR 0181).
 */

import { Image } from "expo-image";
import { memo, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Frame } from "./duo";
import { alpha, Capsule } from "./Glass";
import { TABS, type TabName } from "./tabs";
import { usePalette, useScheme } from "./theme";

/** A tab, the padding round them in their capsule, and the + under it, as the mock drew them. */
const TAB_WIDTH = 44;
const TAB_HEIGHT = 46;
const PAD = 5;
const GAP = 10;
export const COLUMN_PLUS = 50;
/** Above the foot of the safe area, as the mock keeps the column's foot. */
const FOOT = 16;

export const SideColumn = memo(function SideColumn({
  side,
  width,
  lane,
  tabs,
  chosen,
  plus,
  aside,
  onChoose,
}: {
  readonly side: "left" | "right";
  /** The column's width: the safe area on its side. */
  readonly width: number;
  /** The lane down it UIKit keeps its own buttons in, in the window, where the Duo says it. */
  readonly lane: Frame | undefined;
  readonly tabs: readonly TabName[];
  readonly chosen: TabName;
  /** The gold +, or nothing for a member or a guest (ADR 0196). */
  readonly plus: ReactNode;
  /** Stepped aside for a screen's own bar (ADR 0181): gone, untouchable. */
  readonly aside: boolean;
  readonly onChoose: (tab: TabName) => void;
}) {
  const palette = usePalette();
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents={aside ? "none" : "box-none"}
      style={[
        styles.column,
        lane === undefined
          ? [
              side === "right" ? styles.right : styles.left,
              { top: 0, bottom: 0, width, paddingBottom: Math.max(insets.bottom, FOOT) },
            ]
          : { left: lane.x, top: lane.y, width: lane.width, height: lane.height },
        { opacity: aside ? 0 : 1 },
      ]}
      testID="side-column"
    >
      <Capsule style={styles.tabs} interactive>
        <View accessibilityRole="tablist" style={styles.inside}>
          {tabs.map((name) => {
            const on = name === chosen;
            const { title, symbol } = TABS[name];
            return (
              <Pressable
                key={name}
                accessibilityRole="tab"
                accessibilityLabel={title}
                accessibilityState={{ selected: on }}
                onPress={() => onChoose(name)}
                style={({ pressed }) => [
                  styles.tab,
                  on
                    ? { backgroundColor: alpha(palette.ink, scheme === "dark" ? 0.13 : 0.07) }
                    : null,
                  { opacity: pressed && !on ? 0.6 : 1 },
                ]}
                testID={`tab-${name}`}
              >
                <Image
                  source={`sf:${symbol.sf}`}
                  tintColor={on ? palette.accent : palette.ink}
                  contentFit="scale-down"
                  style={styles.mark}
                  accessible={false}
                />
              </Pressable>
            );
          })}
        </View>
      </Capsule>
      {plus}
    </View>
  );
});

const styles = StyleSheet.create({
  column: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: GAP,
  },
  left: { left: 0 },
  right: { right: 0 },
  tabs: { borderRadius: (TAB_WIDTH + PAD * 2) / 2, padding: PAD },
  inside: { gap: 2 },
  tab: {
    width: TAB_WIDTH,
    height: TAB_HEIGHT,
    borderRadius: TAB_WIDTH / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  // An SF Symbol's point size and weight are read from the style's font (expo-image), as the bar's.
  mark: { width: 30, height: 30, fontSize: 21, fontWeight: "500" },
});
