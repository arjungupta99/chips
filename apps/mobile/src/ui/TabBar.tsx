/**
 * The bar of tabs, drawn by hand, on the web target alone.
 *
 * The navigator's own bar was five small marks over five small words, the one in front told
 * from the rest by a shade of grey, and a press that showed nothing until the screen behind it
 * changed — which is what made it read as bland and, worse, as not a thing you could tap
 * (Arjun, 9 September 2026). This one is the desktop rail's: the mark in front wears amber and
 * the word under it ink, and a press lands the moment a thumb does. On a wide screen it stands
 * on the left as a rail, which is where the desktop keeps it.
 *
 * The phone stopped drawing it on 12 September 2026 (WP3): there the bar is UIKit's own, marks
 * and press and glass and all (`app/(tabs)/_layout.tsx`), and an iPad gets iPadOS's tabs at the
 * top rather than this rail. What kept this file alive is the browser — the native navigator's
 * web fallback is a floating pill over the top of the page, and the web target is where thirteen
 * specs drive this app, in a window the size of a phone and a window the size of an iPad.
 *
 * It takes exactly what the navigator hands its own bar, so every tab is still declared in the
 * layout file — the title, the mark, whether it is hidden — and this only draws.
 */

import type { Tabs } from "expo-router";
import type { ComponentProps, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLayout } from "./layout";
import { usePalette } from "./theme";
import { RADIUS, SPACE, TEXT } from "./tokens";

export type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

type Options = TabBarProps["descriptors"][string]["options"];

/** A tab the layout turned off — Runtime, outside development — is not drawn at all. */
function hidden(options: Options | undefined): boolean {
  return StyleSheet.flatten(options?.tabBarItemStyle)?.display === "none";
}

export function TabBar({ state, descriptors, navigation, insets }: TabBarProps) {
  const palette = usePalette();
  const { wide } = useLayout();
  const routes = state.routes.filter((route) => !hidden(descriptors[route.key]?.options));
  return (
    <View
      accessibilityRole="tablist"
      testID="tab-bar"
      style={[
        wide ? styles.rail : styles.bar,
        wide
          ? {
              paddingTop: insets.top + SPACE.md,
              paddingLeft: insets.left,
              paddingBottom: insets.bottom,
            }
          : { paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right },
        { backgroundColor: palette.surface, borderColor: palette.line },
      ]}
    >
      {routes.map((route) => {
        const options = descriptors[route.key]?.options;
        const focused = state.routes[state.index]?.key === route.key;
        return (
          <Tab
            key={route.key}
            label={options?.title ?? route.name}
            focused={focused}
            wide={wide}
            onPress={() => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented)
                navigation.navigate(route.name, route.params);
            }}
            onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
          >
            {options?.tabBarIcon?.({
              focused,
              color: focused ? palette.accent : palette.ink3,
              size: 24,
            })}
          </Tab>
        );
      })}
    </View>
  );
}

function Tab({
  label,
  focused,
  wide,
  onPress,
  onLongPress,
  children,
}: {
  readonly label: string;
  readonly focused: boolean;
  readonly wide: boolean;
  readonly onPress: () => void;
  readonly onLongPress: () => void;
  /** The mark, already wearing its colour. */
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="tab"
      aria-selected={focused}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      style={wide ? styles.railTab : styles.tab}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.face,
            // The press is visible where the thumb is, not a screen later.
            pressed ? { backgroundColor: palette.surface2, transform: [{ scale: 0.94 }] } : null,
          ]}
        >
          <View>{children}</View>
          <Text
            numberOfLines={1}
            style={[
              styles.label,
              { color: focused ? palette.ink : palette.ink3, fontWeight: focused ? "700" : "600" },
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** The rail's width, for whatever has to lay out beside it. */
export const RAIL_WIDTH = 84;

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: SPACE.xs,
    paddingHorizontal: SPACE.xs,
  },
  rail: {
    flexDirection: "column",
    width: RAIL_WIDTH,
    alignItems: "center",
    gap: SPACE.xs,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  // A thumb's minimum, and then some: the bar is the most-pressed thing in the app.
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 2,
  },
  railTab: { width: 72, alignItems: "center", justifyContent: "center", minHeight: 60 },
  // Wide enough for the pill to read as one, narrow enough that "Harnesses" fits four abreast on
  // the narrowest phone in development, where Runtime makes a fourth.
  face: {
    alignItems: "center",
    gap: 3,
    minWidth: 60,
    paddingVertical: 5,
    paddingHorizontal: SPACE.xs,
    borderRadius: RADIUS.lg,
  },
  label: { fontSize: TEXT.xs - 1, letterSpacing: 0.1 },
});
