import type { ReactNode } from "react";
import type { YouPages } from "./pages";

/**
 * A part of You that opens sheets: its group, for the screen's scroll, and its sheets, which stand
 * beside the scroll and not in it (`You.tsx`); and, beside the list on an iPad, those sheets as
 * pages, which the pane stands in its place (`YouPane.tsx`).
 */
export interface YouSection {
  readonly group: ReactNode;
  readonly overlays: ReactNode;
  readonly pages?: YouPages | undefined;
}
