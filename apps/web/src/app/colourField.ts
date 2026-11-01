/**
 * How tall the field your own bubbles wear is: the room's list's height, as the phone's band is
 * its glass's (`scrollField.ts`).
 *
 * The stylesheet draws the field (`.msg[data-mine="true"] .bub`) and moves it with a
 * scroll-driven animation, which knows where each bubble is in the list but not how tall the list
 * is. That changes only when the window or the things above and below the list change size —
 * never on a scroll — so it is said as a custom property on the list when the list is laid out
 * and when it changes shape, and the bubbles inherit it.
 */
import { type RefObject, useLayoutEffect } from "react";

export function useColourField(list: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const element = list.current;
    if (element === null) return;
    const place = () => element.style.setProperty("--field-height", `${element.clientHeight}px`);
    place();
    const watcher = new ResizeObserver(place);
    watcher.observe(element);
    return () => watcher.disconnect();
  }, [list]);
}
