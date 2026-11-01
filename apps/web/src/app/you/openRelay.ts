/**
 * The way to the Relay card from anywhere in the app: You, scrolled to it (ADR 0245). The shell
 * provides it. A sheet whose link opens only at home offers it to an owner, so they can turn the
 * relay on without hunting for it.
 */

import { createContext, useContext } from "react";

export const OpenRelay = createContext<(() => void) | undefined>(undefined);

/** Open You at the Relay card; nothing outside the shell, as in a test of one sheet. */
export function useOpenRelay(): (() => void) | undefined {
  return useContext(OpenRelay);
}
