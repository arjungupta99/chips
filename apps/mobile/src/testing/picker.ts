/**
 * The face picker draws its library a family a frame, once its grid knows how wide it is (ADR 0174's
 * addendum), and nothing is laid out in a test: this gives the grid a phone's width and waits for
 * the last family to arrive, so every mark can be found.
 */

import { fireEvent, screen } from "@testing-library/react-native";
import { LIBRARY_FAMILIES } from "../ui/marks";

/** A grid as wide as a phone's sheet: six marks of 54 points with their gaps. */
const WIDTH = 364;

/**
 * How long the library may take to arrive. A family a frame is nine frames, well under the
 * testing library's one-second default alone, but not with the whole suite running beside it:
 * under `pnpm check` the last family landed after the second had gone, and every picker test
 * failed on a grid that was still drawing (16 October 2026).
 */
const DRAWN_WITHIN_MS = 10_000;

export async function drawLibrary(): Promise<void> {
  await fireEvent(screen.getByTestId("icon-grid"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: WIDTH, height: 600 } },
  });
  const last = LIBRARY_FAMILIES.at(-1)?.marks.at(-1);
  await screen.findByTestId(`mark-${last}`, {}, { timeout: DRAWN_WITHIN_MS });
}
