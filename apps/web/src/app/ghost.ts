/**
 * The ghost (ADR 0274): a still copy of a view that is being closed or hidden, drawn where it
 * stood while it goes, since React has taken it off the page, or hidden it, before it has
 * finished leaving. One for the whole app, and only for these: a dialog its owner closed
 * (`dialogMotion.ts`), and the views of You's that React hides rather than takes away
 * (`you/motion.ts`). A view that gives way to another is not a ghost: it turns, staying as it is,
 * mounted, under the one coming (`Turns.tsx`).
 *
 * A ghost is a picture of the view. Nothing in it can be pressed, read out or found by its id or
 * its test id, so the view that came is the only one answering to them; a drawing keeps its own
 * ids, which its gradients are found by. What would play or load again (a page's frame, a video, a
 * canvas) is an empty box of its size. Each list in it is where it was scrolled to, and whatever was
 * moving in it is held where it was rather than starting again (`styles.css`, `.ghost`). How it
 * leaves, and where it is drawn, is its caller's.
 */

/** What would play or load again if copied: drawn as an empty box of its size in the copy. */
const LIVE = "iframe, video, audio, canvas, object, embed";

/** How far an element is scrolled. */
export interface Scroll {
  readonly top: number;
  readonly left: number;
}

/** A still copy, and how to put its lists where they were once it is on the page. */
export interface Ghost {
  readonly copy: HTMLElement;
  /** Scroll the copy's lists to where the view's were: once the copy is drawn. */
  readonly scroll: () => void;
}

/** How far an element on the page is scrolled now, or nothing for one at its start. */
export function scrolledNow(element: Element): Scroll | undefined {
  const { scrollTop: top, scrollLeft: left } = element;
  return top === 0 && left === 0 ? undefined : { top, left };
}

/**
 * A still copy of `view`. `scrolled` says how far each element in it was scrolled: read from the
 * page while the view is on it, or kept as it scrolled for one already taken off. `strip` names
 * more attributes no copy should keep.
 */
export function ghostOf(
  view: Element,
  scrolled: (element: Element) => Scroll | undefined = scrolledNow,
  strip: readonly string[] = [],
): Ghost {
  const copy = view.cloneNode(true) as HTMLElement;
  // The two in the same order, read before the copy is changed: each scrolled one paired.
  const from = [view, ...view.querySelectorAll("*")];
  const to = [copy, ...copy.querySelectorAll("*")];
  const scrolls: [Element, Scroll][] = [];
  from.forEach((each, index) => {
    const by = scrolled(each);
    const into = to[index];
    if (by !== undefined && into !== undefined) scrolls.push([into, by]);
  });
  holdStill(from, to);
  to.forEach((each, index) => {
    const original = from[index];
    if (each.matches(LIVE) && original !== undefined) each.replaceWith(sized(original));
  });
  for (const each of [copy, ...copy.querySelectorAll("*")]) {
    each.removeAttribute("data-testid");
    if (!(each instanceof SVGElement)) each.removeAttribute("id");
    for (const name of strip) each.removeAttribute(name);
  }
  copy.classList.add("ghost");
  copy.setAttribute("aria-hidden", "true");
  copy.inert = true;
  const scroll = () => {
    for (const [element, by] of scrolls) {
      element.scrollTop = by.top;
      element.scrollLeft = by.left;
    }
  };
  return { copy, scroll };
}

/**
 * What was moving in the view, held in the copy where it was: the copy plays no animation of its
 * own, so each part caught mid-way keeps the place and the fade it had. Nothing to hold in a view
 * already off the page, which has neither animations nor styles to read.
 */
function holdStill(from: readonly Element[], to: readonly Element[]): void {
  const view = from[0];
  if (view === undefined || !view.isConnected || typeof view.getAnimations !== "function") return;
  for (const moving of view.getAnimations({ subtree: true })) {
    const effect = moving.effect;
    if (!(effect instanceof KeyframeEffect) || effect.pseudoElement !== null) continue;
    const target = effect.target;
    const there = target === null ? undefined : to[from.indexOf(target)];
    if (!(there instanceof HTMLElement || there instanceof SVGElement)) continue;
    const now = getComputedStyle(target as Element);
    there.style.transform = now.transform;
    there.style.opacity = now.opacity;
  }
}

/** An empty box standing where something live stood, at its size there. */
function sized(live: Element): HTMLElement {
  const box = document.createElement("div");
  const style = live.getAttribute("style");
  if (style !== null) box.setAttribute("style", style);
  const className = live.getAttribute("class");
  if (className !== null) box.setAttribute("class", className);
  if (live instanceof HTMLElement && live.isConnected) {
    box.style.width = `${live.offsetWidth}px`;
    box.style.height = `${live.offsetHeight}px`;
  }
  return box;
}
