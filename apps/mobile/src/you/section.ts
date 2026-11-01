import type { ReactNode } from "react";

/**
 * A part of You that opens sheets: its group, for the screen's scroll, and its sheets, which stand
 * beside the scroll and not in it (`You.tsx`).
 */
export interface YouSection {
  readonly group: ReactNode;
  readonly overlays: ReactNode;
}
