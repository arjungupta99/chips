/**
 * The tabs on the web target, drawn by hand.
 *
 * The phone gets UIKit's own bar (`_layout.tsx`); a browser has no such thing, and the
 * navigator's fallback there is a floating pill over the top of the page — not a phone's bar,
 * not an iPad's rail, and over the top of the screen every spec reads. So this target keeps the
 * bar this app drew for itself (`src/ui/TabBar.tsx`): the mark in front in amber, the word under
 * it, a press that lands where the thumb does, and a rail on the left where the window is an
 * iPad's.
 *
 * Both bars are the same tabs from the same list (`src/ui/tabs.ts`), so the two targets
 * cannot drift apart in what they offer, only in who draws it.
 */

import type { Store } from "@chipschat/core";
import { Redirect, Tabs } from "expo-router";
import { useRef } from "react";
import { type ColorValue, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNewSpace } from "../../src/newSpace/NewSpace";
import { useOpens } from "../../src/newSpace/opens";
import { Plus } from "../../src/newSpace/Plus";
import { PLUS_SIZE } from "../../src/newSpace/plusRoom";
import { useChips } from "../../src/store/provider";
import { Icon } from "../../src/ui/Icon";
import type { IconName } from "../../src/ui/icons";
import { useLayout } from "../../src/ui/layout";
import { OpenedProvider } from "../../src/ui/opened";
import { RAIL_WIDTH, TabBar } from "../../src/ui/TabBar";
import { TabBarAsideProvider, useTabBarAside } from "../../src/ui/tabBarAside";
import { inBar, TAB_ORDER, TABS } from "../../src/ui/tabs";
import { usePalette } from "../../src/ui/theme";
import { SPACE } from "../../src/ui/tokens";

export default function TabsLayout() {
  const { ready, paired } = useChips();
  if (!ready) return null;
  if (paired === undefined) return <Redirect href="/pair" />;
  return (
    <TabBarAsideProvider>
      <OpenedProvider>
        {/* Drawn afresh for each workspace, at Spaces (ADR 0197). */}
        <View key={paired.device.deviceId} style={styles.fill}>
          <Bar />
          <NewSpacePlus store={paired.store} selfId={paired.device.participantId} />
        </View>
      </OpenedProvider>
    </TabBarAsideProvider>
  );
}

/**
 * The + for a new space (`src/newSpace`), whoever there is to ask (ADR 0148): above the end of the
 * bar on a phone's width, at the foot of the rail on a wide screen. This bar has no slot for it to
 * stand over, as the phone's own does (`_layout.tsx`), so it floats. Only for an owner or an
 * admin, who open spaces (ADR 0196).
 */
function NewSpacePlus({ store, selfId }: { readonly store: Store; readonly selfId: string }) {
  const opens = useOpens(store, selfId);
  const { open } = useNewSpace();
  const { wide } = useLayout();
  const insets = useSafeAreaInsets();
  const plus = useRef<View>(null);
  // Stepped aside, with the bar, for a screen's own bar (ADR 0181).
  const aside = useTabBarAside();
  const grow = () =>
    plus.current?.measureInWindow((x, y, width, height) => open({ x, y, width, height }));
  const at = wide
    ? { left: (RAIL_WIDTH - PLUS_SIZE) / 2, bottom: insets.bottom + SPACE.lg }
    : { right: SPACE.lg, bottom: insets.bottom + ABOVE_BAR };
  if (!opens) return null;
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Plus ref={plus} onPress={grow} away={aside} style={[styles.plus, at]} />
    </View>
  );
}

/** Clear of the drawn bar: its fifty points, its padding, and a little air. */
const ABOVE_BAR = 68;

function Bar() {
  const palette = usePalette();
  const { wide } = useLayout();
  const aside = useTabBarAside();

  return (
    <Tabs
      tabBar={(props) => (aside ? null : <TabBar {...props} />)}
      screenOptions={{
        // Each screen draws its own name, large, the way a phone does (`ui/Screen.tsx`). The
        // navigator's header would put the same words above them a second time.
        headerShown: false,
        // On a wide screen the bar is a rail on the left, the way the desktop keeps it.
        tabBarPosition: wide ? "left" : "bottom",
        sceneStyle: { backgroundColor: palette.bg },
      }}
    >
      {TAB_ORDER.map((name) => {
        const tab = TABS[name];
        const hidden = inBar(name, __DEV__) ? {} : { href: null };
        return (
          <Tabs.Screen
            key={name}
            name={name}
            options={{ title: tab.title, tabBarIcon: mark(tab.mark), ...hidden }}
          />
        );
      })}
      {/* The phone's slot for the + (`_layout.tsx`); this bar draws the + itself. */}
      <Tabs.Screen name="new" options={{ href: null }} />
    </Tabs>
  );
}

/** The bar hands each tab's mark its colour — amber in front, grey behind — and the mark wears it. */
function mark(name: IconName) {
  return ({ color }: { readonly color: ColorValue }) => (
    <Icon name={name} color={color} size={24} />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  plus: { position: "absolute" },
});
