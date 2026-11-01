/**
 * The window's safe-area insets, read once at the root, where the view is always on screen.
 *
 * Every tab reads its insets from a provider of its own: `NativeTabs` wraps each screen in one.
 * On iOS 27, a tab that is not on screen is told its top inset is 0. That happens to every such
 * tab each time the app comes back from the background, and lasts until the tab is shown and the
 * real inset arrives a few frames later. Arjun's iPhone recorded it on 3 October 2026, at 13:53
 * and again at 16:10. A tab's name and its glass are placed by the status bar's height, so they
 * took the 0, and the glass drawn at that height stayed short (ADR 0107). The root view never
 * leaves the window, so the insets it reads are the window's, and a tab's top is taken from here.
 *
 * A sheet takes all four from here too (`Sheet`). It covers the window, and a tab's bottom inset
 * is its tab bar's top, 49 points above the window's.
 */

import { createContext, type ReactNode, useContext } from "react";
import { type EdgeInsets, useSafeAreaInsets } from "react-native-safe-area-context";

const WindowInsetsContext = createContext<EdgeInsets | null>(null);

/** Read the window's insets for everything below: put at the root, above the navigators. */
export function WindowInsets({ children }: { readonly children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <WindowInsetsContext.Provider value={insets}>{children}</WindowInsetsContext.Provider>;
}

/** The window's insets; this view's own where nothing above has read them, as in a test. */
export function useWindowInsets(): EdgeInsets {
  const own = useSafeAreaInsets();
  return useContext(WindowInsetsContext) ?? own;
}

/**
 * Where a tab's name starts down the window: below the status bar, and on an iPad below its tab
 * bar too (ADR 0177). iPadOS stands the bar at the top of the window over a regular width, and
 * tells the tab it is there through the tab's own top inset, which the window's knows nothing of:
 * read from the window alone, Search's field stood under the bar (the iPad simulator, 15 October
 * 2026). The larger of the two, because a tab off screen on iOS 27 is told its own top is 0, which
 * the window's covers (above).
 */
export function useTabTop(): number {
  const own = useSafeAreaInsets().top;
  const window = useWindowInsets().top;
  return Math.max(own, window);
}
