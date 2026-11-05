/**
 * Dialogs grow out of what opened them and fold back into it (ADR 0084), on the design system's
 * motion (ADR 0274): in and out on `--motion-base` and `--ease`.
 *
 * `GrowingDialog` is told what opened it, and its owner holds it while it folds. `ConfirmDialog`
 * is opened from twenty places and told neither: it grows out of what was pressed a moment before
 * it opened (`recentPress`), a row's menu item or a Delete button, and when its owner takes it
 * away it folds back there as a ghost (`foldAway`), a still copy of it drawn over the page for the
 * length of the fold. The press is kept with where its control stood, since a menu item has gone
 * by the time the dialog it opened has to say where it came from.
 *
 * With Reduce Motion nothing grows or folds: `base.css` stops the animations, and no ghost is made;
 * nor where nothing can be animated (a test's page).
 */

import { ghostOf } from "./ghost.ts";
import { ease, motionMs, reduceMotion } from "./viewer/open.ts";

/** A press, and where what was pressed stood when it was. */
export interface Press {
  readonly element: HTMLElement;
  readonly box: DOMRect;
  readonly at: number;
}

/** A press longer ago than this, when a dialog opens, is not what opened it. */
const RECENT_MS = 1000;
/** What a press lands on that may open a dialog. */
const CONTROL =
  "button, a[href], summary, [role='button'], [role='menuitem'], [role='option'], [role='tab']";

let last: Press | undefined;

function pressed(event: Event): void {
  if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return;
  const control =
    event.target instanceof Element ? event.target.closest<HTMLElement>(CONTROL) : null;
  if (control === null) return;
  last = { element: control, box: control.getBoundingClientRect(), at: performance.now() };
}

/** Keep each press from now on, for `recentPress`. */
export function watchPresses(where: Window = window): () => void {
  where.addEventListener("pointerdown", pressed, true);
  where.addEventListener("keydown", pressed, true);
  return () => {
    where.removeEventListener("pointerdown", pressed, true);
    where.removeEventListener("keydown", pressed, true);
    last = undefined;
  };
}

/** The press that opened a dialog opening now: one a moment ago, or none. */
export function recentPress(): Press | undefined {
  return last !== undefined && performance.now() - last.at < RECENT_MS ? last : undefined;
}

/** Where something stands now, or for a press whose control has gone, where it stood. */
export function boxOf(from: HTMLElement | Press | null | undefined): DOMRect | undefined {
  if (from === null || from === undefined) return undefined;
  const element = from instanceof HTMLElement ? from : from.element;
  const now = element.isConnected ? element.getBoundingClientRect() : undefined;
  if (now !== undefined && now.width > 0 && now.height > 0) return now;
  if (from instanceof HTMLElement) return undefined;
  return from.box.width > 0 && from.box.height > 0 ? from.box : undefined;
}

/** The middle of `from`, in `box`'s own pixels: the point a dialog grows from and folds into. */
function origin(from: DOMRect, box: DOMRect): string {
  const x = from.left + from.width / 2 - box.left;
  const y = from.top + from.height / 2 - box.top;
  return `${Math.round(x)}px ${Math.round(y)}px`;
}

/**
 * Grow the dialog from `from`. Measured with the growing held off for the moment, since its box is
 * otherwise already the first frame of it, scaled down about its middle; letting it go again
 * starts it from the top. Without `from` it grows from its own middle.
 */
export function growFrom(dialog: HTMLElement, from: DOMRect | undefined): void {
  if (from === undefined) return;
  dialog.style.animation = "none";
  const box = dialog.getBoundingClientRect();
  dialog.style.animation = "";
  dialog.style.setProperty("--grow-from", origin(from, box));
}

/**
 * The dialog, about to be taken off the page by its owner, folds into `to` all the same: a copy of
 * it, and of the dim behind it, drawn where it stood and folded away. Measured now, while it is
 * still on the page; drawn once the page has let it go, so a dialog put straight back (React's
 * strict mode, in development) leaves no ghost. The copy names nothing (no ids, no test ids) and
 * takes no clicks, and is gone when its fold ends. It stands in the top layer, as the dialog did,
 * over a dialog still open under it (the room sheet a Delete was asked from).
 */
export function foldAway(dialog: HTMLElement, to: Press | undefined): void {
  if (reduceMotion() || typeof dialog.animate !== "function") return;
  const box = dialog.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return;
  // The app's ghost of it (`ghost.ts`), drawn as a box rather than a dialog, which the page would
  // otherwise draw as one more dialog of its own.
  const still = ghostOf(dialog);
  const ghost = document.createElement("div");
  ghost.className = `${still.copy.className} dialog-ghost`;
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  ghost.append(...still.copy.childNodes);
  ghost.style.left = `${box.left}px`;
  ghost.style.top = `${box.top}px`;
  ghost.style.width = `${box.width}px`;
  ghost.style.height = `${box.height}px`;
  const into = boxOf(to);
  if (into !== undefined) ghost.style.setProperty("--grow-from", origin(into, box));
  const dim = document.createElement("div");
  dim.className = "dialog-ghost-dim";
  queueMicrotask(() => {
    if (dialog.isConnected) return;
    document.body.append(dim, ghost);
    for (const drawn of [dim, ghost]) {
      if (typeof drawn.showPopover !== "function") continue;
      drawn.popover = "manual";
      drawn.showPopover();
    }
    still.scroll();
    const gone = () => {
      ghost.remove();
      dim.remove();
    };
    // Folded on the design system's motion, the dim with it, as `GrowingDialog` folds.
    const base = motionMs("--motion-base", 200);
    const timing = { duration: base, easing: ease(), fill: "forwards" } as const;
    dim.animate([{ opacity: 1 }, { opacity: 0 }], timing);
    ghost
      .animate(
        [
          { opacity: 1, transform: "none" },
          { opacity: 1, offset: 0.6 },
          { opacity: 0, transform: "scale(0.2)" },
        ],
        timing,
      )
      .finished.then(gone, gone);
    // A tab put in the background mid-fold never finishes it.
    setTimeout(gone, base + 300);
  });
}
