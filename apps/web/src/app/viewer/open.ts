/**
 * The open and its return, as a FLIP with the Web Animations API (the media viewer proposal,
 * §4.3 and §4.6). The tile's `getBoundingClientRect`, a clone of its thumbnail at that rect, and
 * `element.animate` to the fitted rect on the design system's `--ease` over 350 ms, with the
 * backdrop and the chrome behind it.
 *
 * `document.startViewTransition` would be shorter to write, and is not used: the desktop shell's
 * WKWebView on macOS 13 has no view transitions, and WAAPI is everywhere.
 *
 * The clone keeps `object-fit: cover` the whole way, which is what makes the morph exact rather
 * than a squeeze. In the room the tile crops the picture; the rect it flies to is `fitRect`'s,
 * which has the picture's own shape — and at its own shape, cover shows the whole picture. So one
 * animation of the four edges carries the tile's crop open into the whole of it, with no moment
 * where the picture is the wrong shape and no second element to cross-fade.
 *
 * Reduce Motion takes the travel out and leaves the crossfade `base.css` already asks for
 * everywhere else: `STILL_MS`, as the sheet and `Arrive`.
 */

/** Open and return: UIKit's 0.35 s response, which the phone's spring settles in (§4.6). */
export const OPEN_MS = 350;
/** The chrome arrives after the picture, so the eye follows one thing. */
export const CHROME_MS = 120;
/** Reduce Motion: no travel, a crossfade. */
export const STILL_MS = 160;

/** Where something stands on the page, in the viewport's pixels. */
export interface Frame {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Whether this person asked for less movement. Read at each open, not once at load. */
export function reduceMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** A motion token's length in milliseconds, read from the page: 120 for `--motion-fast`. */
export function motionMs(token: string, otherwise: number): number {
  const said = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const value = Number.parseFloat(said);
  if (Number.isNaN(value)) return otherwise;
  return said.endsWith("ms") ? value : value * 1000;
}

/** The design system's curve, read from the page so the token stays the one definition. */
export function ease(): string {
  const token = getComputedStyle(document.documentElement).getPropertyValue("--ease").trim();
  return token === "" ? "cubic-bezier(0.2, 0.7, 0.2, 1)" : token;
}

function edges(frame: Frame): Keyframe {
  return {
    left: `${frame.left}px`,
    top: `${frame.top}px`,
    width: `${frame.width}px`,
    height: `${frame.height}px`,
  };
}

/** A frame from an element on the page, or nothing where it is not on it any more. */
export function frameOf(element: HTMLElement | undefined): Frame | undefined {
  if (element === undefined || !element.isConnected) return undefined;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return undefined;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/**
 * Fly a picture between the tile and the stage. `from` and `to` are frames in the viewport; the
 * clone is drawn over everything, taken away when it lands, and `onDone` is called either way —
 * when it lands, when it is cancelled, and at once where there is nothing to fly (no tile, or
 * Reduce Motion), so the caller never waits on an animation that will not come.
 *
 * Returns a cancel: closing mid-open must not leave a picture in the air.
 */
export function fly(options: {
  readonly src: string;
  readonly from: Frame | undefined;
  readonly to: Frame | undefined;
  readonly onDone: () => void;
  /** The radius the tile is drawn with, so a rounded tile does not square off as it leaves. */
  readonly radius?: string;
}): () => void {
  const { src, from, to, onDone } = options;
  if (from === undefined || to === undefined || reduceMotion()) {
    onDone();
    return () => {};
  }
  const clone = document.createElement("img");
  clone.src = src;
  clone.alt = "";
  clone.className = "viewer-fly";
  clone.setAttribute("aria-hidden", "true");
  Object.assign(clone.style, {
    position: "fixed",
    objectFit: "cover",
    borderRadius: options.radius ?? "0px",
    zIndex: "2147483647",
    pointerEvents: "none",
    ...(edges(from) as Record<string, string>),
  });
  document.body.append(clone);

  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    clone.remove();
    onDone();
  };
  const animation = clone.animate(
    [
      { ...edges(from), borderRadius: options.radius ?? "0px" },
      { ...edges(to), borderRadius: "0px" },
    ],
    { duration: OPEN_MS, easing: ease(), fill: "forwards" },
  );
  animation.addEventListener("finish", done);
  animation.addEventListener("cancel", done);
  return () => {
    animation.cancel();
    done();
  };
}
