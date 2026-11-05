/**
 * A page a phone pushes over the tabs, on a wide screen, where it stands beside a tab's list
 * instead (ADR 0177, ADR 0256): back to the tabs it was pushed over, with what it opens in that
 * tab's params, which the tab keeps (`opened.tsx`).
 *
 * A link or a push's tap lands on the pushed route, and so does a phone's window made wide under a
 * pushed page: the iPhone Duo opened, where the page stood across the fold (the simulator, 2
 * November 2026). A `Redirect` put a second copy of the tabs over the first in the route's place,
 * whose tab presses then chose the hidden copy's: after a link or a push's tap, no tab could be
 * chosen.
 */

import { useRouter } from "expo-router";
import { useEffect } from "react";

/** The tabs a pushed page goes back to: Spaces, Agents or You. */
export type TabsHome = "/(tabs)" | "/(tabs)/agents" | "/(tabs)/you";

export function BackToTabs({
  tab,
  params,
}: {
  readonly tab: TabsHome;
  readonly params: Readonly<Record<string, string>>;
}) {
  const router = useRouter();
  const said = JSON.stringify(params);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the params by what they say, not by the object
  useEffect(() => {
    router.dismissTo({ pathname: tab, params });
  }, [router, tab, said]);
  return null;
}
