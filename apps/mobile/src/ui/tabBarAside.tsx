/**
 * Whether the tab bar steps aside for a bar of a screen's own where it stands: the Spaces list's,
 * while spaces are being picked (ADR 0181). On an iPhone the bar is drawn and slides down itself
 * (`PhoneBar.tsx`, ADR 0233); elsewhere it is the system's, told through its navigator
 * (`app/(tabs)/_layout.tsx`). The gold + at its end goes with it.
 *
 * Outside the tabs there is nothing to step aside, and asking does nothing.
 */

import { createContext, type ReactNode, useContext, useLayoutEffect, useState } from "react";

/** Whether the bar is aside: read by the bar, which moves. */
const Aside = createContext(false);
/**
 * How a screen asks for it: set once, and never changed. Kept apart from whether the bar is aside,
 * so a screen that asks is not drawn again when the bar moves. Kept together, each Select drew the
 * whole Spaces list a second time, and the Agents tab under it, unseen (19 October 2026).
 */
const SetAside = createContext<(aside: boolean) => void>(() => undefined);

export function TabBarAsideProvider({ children }: { readonly children: ReactNode }) {
  const [aside, setAside] = useState(false);
  return (
    <SetAside.Provider value={setAside}>
      <Aside.Provider value={aside}>{children}</Aside.Provider>
    </SetAside.Provider>
  );
}

/** Whether a screen has asked the tab bar to step aside. */
export function useTabBarAside(): boolean {
  return useContext(Aside);
}

/**
 * Asks the tab bar to step aside while `aside` holds, and back when it stops or the screen goes.
 * Asked as React lays the screen out, so the bar goes in the frame the screen changes in, not a
 * render after it (the simulator, 16 October 2026).
 */
export function useStepTabBarAside(aside: boolean): void {
  const setAside = useContext(SetAside);
  useLayoutEffect(() => {
    if (!aside) return;
    setAside(true);
    return () => setAside(false);
  }, [aside, setAside]);
}
