/**
 * The tabs, as data: what each is called, and the mark it wears.
 *
 * One list, read by every bar — the system's on an iPad and on Android, which these are handed to
 * (`app/(tabs)/_layout.tsx`), the one drawn on an iPhone (`PhoneBar.tsx`, ADR 0233), and the one
 * the web target keeps (`TabBar.tsx`) — so the app can never offer three tabs in one place and four
 * in another, and so a tab's name is written once for the bar, the navigation bar above its screen,
 * and the screen reader alike.
 *
 * Each mark is said three times because three drawing systems draw them and none can read
 * another's: an SF Symbol on iOS (the iPhone's drawn bar wears it too, so it looks as UIKit's
 * did), a Material glyph on Android, and the design system's own path for the web's bar
 * (`icons.ts`). They are the same ideas throughout, and the desktop's rail points at them with the
 * same shapes.
 *
 * Runtime is not part of the app a person uses — it is the report that turned the first run on a
 * real phone into numbers rather than a feeling — so it is a tab in development and hidden in a
 * release, where the route behind it stays for a link to reach.
 *
 * Spaces is the index route, so it is where the app opens. For you stood there until 22 September
 * 2026, when it was withdrawn (ADR 0065): an ask is answered in its room.
 *
 * Search is a tab of its own since 6 October 2026 (ADR 0132), between Agents and You. It is an
 * ordinary tab: the slot of the search kind at the end of an iPad's bar is the +'s
 * (`app/(tabs)/_layout.tsx`), and stays so.
 */

import type { NativeTabsTriggerIconProps } from "expo-router/unstable-native-tabs";
import type { IconName } from "./icons";

interface Tab {
  readonly title: string;
  /** The system's own mark: an SF Symbol on iOS, a Material glyph on Android. */
  readonly symbol: NativeTabsTriggerIconProps;
  /** The drawn mark, for the web's bar. */
  readonly mark: IconName;
  /** In the bar in a development bundle, and not in a release. */
  readonly onlyInDev?: true;
}

/** Keyed by the route each tab is, as the tabs navigator names it. */
export const TABS = {
  index: {
    title: "Spaces",
    symbol: { sf: "bubble.left.and.bubble.right", md: "chat" },
    mark: "chat",
  },
  // Harnesses until 30 September 2026 (ADR 0087, Phase 5): the tab lists agents now, and the
  // harnesses behind them at its foot; `/harnesses` still reaches it.
  agents: { title: "Agents", symbol: { sf: "cpu", md: "memory" }, mark: "chip" },
  search: { title: "Search", symbol: { sf: "magnifyingglass", md: "search" }, mark: "search" },
  you: { title: "You", symbol: { sf: "person.crop.circle", md: "account_circle" }, mark: "user" },
  runtime: {
    title: "Runtime",
    symbol: { sf: "bolt", md: "bolt" },
    mark: "bolt",
    onlyInDev: true,
  },
} as const satisfies Record<string, Tab>;

export type TabName = keyof typeof TABS;

/** Left to right, or top to bottom on a rail: Spaces first, because it is where the app opens. */
export const TAB_ORDER: readonly TabName[] = ["index", "agents", "search", "you", "runtime"];

/** Whether a bundle shows this tab at all. Runtime is the only one that ever answers no. */
export function inBar(name: TabName, dev: boolean): boolean {
  return dev || !("onlyInDev" in TABS[name]);
}

/** The tabs a person can see and reach in this bundle, in order. */
export function tabsShown(dev: boolean): readonly TabName[] {
  return TAB_ORDER.filter((name) => inBar(name, dev));
}
