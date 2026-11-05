/**
 * How You's views move on the Mac and the web (ADR 0265's addendum of 3 November 2026; Arjun:
 * "everything should have smooth transitions and look highly polished"). The list, each page
 * beside it, a form's page and Nothing open are views (`data-view`), and every change from one to
 * another moves:
 *
 * - **Deeper** (a person from People, Go direct from Connection, Turn off from Relay, and where You
 *   is narrow any page from the list) slides in from the trailing edge over the view it covers,
 *   which drifts a quarter of the way back and dims, as a navigation push does on the iPad.
 * - **Back** is the same move played the other way.
 * - **Across** (another row's page beside the list, or Nothing open) crossfades: what goes fades
 *   out quickly and what comes fades in, as the phone's `Swap` does. You itself comes in so.
 * - **In place**, inside a view that stays: the groups, rows and cards that a change moved (a
 *   switch that brings rows under it, a fold opened, a line that wrapped) are taken from where they
 *   stood to where they now stand, and the ones it brought fade in, so nothing below jumps.
 *
 * Which it is comes from the views' paths: one whose path continues the other's is deeper, and the
 * list's path, empty, is under every page. A page beside the list swapped for another turns
 * (`Turns`, in You's pane column, on the same moves and timings): the page going stays mounted and
 * inert under the one coming, so nothing of it is copied. Here are the views React hides rather
 * than takes away (the list where You is narrow, a page under the form it opened): one hidden is
 * drawn once more where it stood as the app's ghost (`ghost.ts`), in a layer React never draws,
 * kept at the scroll it had. Only transform and opacity move, by the Web Animations API, on the
 * tokens' durations and ease. With less motion asked for, or where the browser cannot animate (a
 * test's DOM), nothing moves. You itself comes in with the section it is (ADR 0274).
 */

import { type RefObject, useLayoutEffect } from "react";
import { ghostOf } from "../ghost.ts";

/** What a change of view is. */
export type Move = "deeper" | "back" | "across";

/** Whether `path` is under `over`: the list's empty path is over every page. */
function under(path: string, over: string): boolean {
  return over === "" ? path !== "" : path.startsWith(`${over}/`);
}

/** The move from the view at `from` to the view at `to`. */
export function moveOf(from: string | undefined, to: string | undefined): Move {
  if (from === undefined || to === undefined) return "across";
  if (under(to, from)) return "deeper";
  if (under(from, to)) return "back";
  return "across";
}

/** A form's path under the place it stands: a page's, or the list's. */
export function pathUnder(over: string, name: string): string {
  return over === "" ? name : `${over}/${name}`;
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Where a view was last laid out in You, and the column that clips it, ignoring any motion. */
interface Laid extends Box {
  readonly clip: Box;
}

/** Where `element` stands in `root`, as laid out: a transform under way is not counted. */
function offsetIn(element: HTMLElement, root: HTMLElement): Box {
  let x = 0;
  let y = 0;
  let at: HTMLElement | null = element;
  while (at !== null && at !== root) {
    x += at.offsetLeft;
    y += at.offsetTop;
    at = at.offsetParent as HTMLElement | null;
  }
  return { x, y, width: element.offsetWidth, height: element.offsetHeight };
}

/** A token's milliseconds: 300 for `--motion-slow: 300ms`. */
function token(name: string, fallback: number): number {
  const said = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const ms = Number.parseFloat(said);
  if (!Number.isFinite(ms)) return fallback;
  return said.endsWith("ms") ? ms : ms * 1000;
}

/** The tokens a move is timed by, read as it starts. */
function timing() {
  const ease = getComputedStyle(document.documentElement).getPropertyValue("--ease").trim();
  return {
    fast: token("--motion-fast", 120),
    base: token("--motion-base", 200),
    slow: token("--motion-slow", 300),
    ease: ease === "" ? "ease" : ease,
  };
}

/** The views in `node`, itself among them. */
function viewsIn(node: Node): HTMLElement[] {
  if (!(node instanceof HTMLElement)) return [];
  const inside = [...node.querySelectorAll<HTMLElement>("[data-view]")];
  return node.matches("[data-view]") ? [node, ...inside] : inside;
}

/** Where the views going and coming went; the frames each is drawn through. */
const LEAVE: Readonly<Record<Move, Keyframe[]>> = {
  deeper: [
    { transform: "none", opacity: 1 },
    { transform: "translateX(-25%)", opacity: 0.4 },
  ],
  back: [{ transform: "none" }, { transform: "translateX(100%)" }],
  across: [{ opacity: 1 }, { opacity: 0 }],
};
const COME: Readonly<Record<Move, Keyframe[]>> = {
  deeper: [{ transform: "translateX(100%)" }, { transform: "none" }],
  back: [
    { transform: "translateX(-25%)", opacity: 0.4 },
    { transform: "none", opacity: 1 },
  ],
  across: [{ opacity: 0 }, { opacity: 1 }],
};

/** Whether a view's `hidden` changed it: hidden now and not before, it went; the other way, it came. */
function shownChange(record: MutationRecord): "went" | "came" | undefined {
  const view = record.target as HTMLElement;
  if (!view.matches("[data-view]")) return undefined;
  if (record.oldValue === null && view.hidden) return "went";
  if (record.oldValue !== null && !view.hidden) return "came";
  return undefined;
}

/** The views one change took away (`went`) or brought (`came`). */
function viewsChanged(record: MutationRecord, way: "went" | "came"): HTMLElement[] {
  if (record.type === "attributes") {
    return shownChange(record) === way ? [record.target as HTMLElement] : [];
  }
  const nodes = way === "went" ? record.removedNodes : record.addedNodes;
  // A whole page coming or going in a turn is the turn's to move (`Turns`).
  return [...nodes].filter((node) => !isTurn(node)).flatMap(viewsIn);
}

function isTurn(node: Node): boolean {
  return node instanceof HTMLElement && node.matches(".turn");
}

/** What a batch of the DOM's changes took away and brought, as views; the ghosts' own aside. */
function changesOf(records: readonly MutationRecord[], ghosts: HTMLElement) {
  const ours = records.filter((record) => !ghosts.contains(record.target));
  const going = ours.flatMap((record) => viewsChanged(record, "went"));
  const coming = ours.flatMap((record) => viewsChanged(record, "came"));
  return {
    gone: going.filter((view) => !coming.includes(view)),
    came: coming.filter((view) => !going.includes(view) && view.offsetParent !== null),
  };
}

/** What moves in place inside a view: its groups, the rows on a card, a page's cards. */
const BLOCKS = ".you-list > *, .you-gcard > *, .you-page > *, .you-card > *, .you-form-group > *";

/**
 * The blocks of the views that stay, where each stood, and the moves that take them from there to
 * where a change put them (FLIP: first, last, invert, play).
 */
class Blocks {
  private readonly at = new WeakMap<HTMLElement, number>();
  private readonly held = new WeakSet<Element>();

  /** Where every block of `views` stands now. */
  measure(views: readonly HTMLElement[]): void {
    for (const view of views) {
      for (const block of view.querySelectorAll<HTMLElement>(BLOCKS)) {
        this.at.set(block, offsetIn(block, view).y);
        if (block.parentElement !== null) this.held.add(block.parentElement);
      }
    }
  }

  /** Each block of `views` moved by a change slides from where it was; one it brought fades in. */
  settle(views: readonly HTMLElement[], slow: number, base: number, ease: string): void {
    for (const view of views) {
      for (const block of view.querySelectorAll<HTMLElement>(BLOCKS)) {
        this.settleOne(block, view, slow, base, ease);
      }
    }
  }

  private settleOne(
    block: HTMLElement,
    view: HTMLElement,
    slow: number,
    base: number,
    ease: string,
  ) {
    const was = this.at.get(block);
    if (was === undefined) {
      // New in a place that was drawn before: it fades in where it stands.
      if (block.parentElement !== null && this.held.has(block.parentElement)) {
        block.animate([{ opacity: 0 }, { opacity: 1 }], { duration: base, easing: ease });
      }
      return;
    }
    const by = was - offsetIn(block, view).y;
    if (Math.abs(by) < 1) return;
    block.animate([{ transform: `translateY(${by}px)` }, { transform: "none" }], {
      duration: slow,
      easing: ease,
      composite: "add",
    });
  }
}

/** You's views, where each was laid out and scrolled to, and the moves between them. */
class Views {
  private readonly laid = new WeakMap<HTMLElement, Laid>();
  // Where each element was scrolled to, read as it scrolls: a view gone has no scroll to read.
  private readonly tops = new WeakMap<Element, number>();
  private readonly blocks = new Blocks();

  constructor(
    private readonly you: HTMLElement,
    private readonly ghosts: HTMLElement,
  ) {}

  /** Where every view drawn now stands. */
  measure = (): void => {
    const shown = this.shown();
    for (const view of shown) {
      const column = view.parentElement?.closest<HTMLElement>(".you-pane-col") ?? this.you;
      this.laid.set(view, { ...offsetIn(view, this.you), clip: offsetIn(column, this.you) });
    }
    this.blocks.measure(shown);
  };

  private shown(): HTMLElement[] {
    const all = [...this.you.querySelectorAll<HTMLElement>("[data-view]")];
    return all.filter((view) => view.offsetParent !== null);
  }

  scrolled = (event: Event): void => {
    if (event.target instanceof Element) this.tops.set(event.target, event.target.scrollTop);
  };

  changed = (records: readonly MutationRecord[]): void => {
    const { gone, came } = changesOf(records, this.ghosts);
    if (gone.length > 0 || came.length > 0) {
      this.play(moveOf(gone[0]?.dataset["view"], came[0]?.dataset["view"]), gone, came);
    }
    // What stayed settles in place; a view that came is moving as a whole already.
    const { slow, base, ease } = timing();
    const stayed = this.shown().filter((view) => !came.includes(view));
    this.blocks.settle(stayed, slow, base, ease);
    this.measure();
  };

  private play(move: Move, gone: readonly HTMLElement[], came: readonly HTMLElement[]): void {
    const { fast, base, slow, ease } = timing();
    for (const view of gone) {
      const at = this.laid.get(view);
      if (at === undefined || at.width === 0) continue;
      const { box, copy } = this.ghost(view, at, move === "back");
      const leave = copy.animate(LEAVE[move], {
        duration: move === "across" ? fast : slow,
        easing: ease,
        fill: "forwards",
      });
      const done = () => box.remove();
      leave.finished.then(done, done);
    }
    for (const view of came) {
      // Deeper, the view coming is drawn over the one going.
      if (move === "deeper") view.style.zIndex = "1";
      const come = view.animate(COME[move], {
        duration: move === "across" ? base : slow,
        easing: ease,
        fill: "backwards",
      });
      const done = () => {
        view.style.zIndex = "";
      };
      come.finished.then(done, done);
    }
  }

  /** The view going, drawn once more where it stood: the app's ghost of it. */
  private ghost(view: HTMLElement, at: Laid, above: boolean) {
    const kept = (each: Element) => {
      const top = this.tops.get(each);
      return top === undefined ? undefined : { top, left: 0 };
    };
    const ghost = ghostOf(view, kept, ["data-view", "hidden"]);
    const { copy } = ghost;
    Object.assign(copy.style, {
      position: "absolute",
      left: `${at.x - at.clip.x}px`,
      top: `${at.y - at.clip.y}px`,
      width: `${at.width}px`,
      height: `${at.height}px`,
      margin: "0",
    });
    const box = document.createElement("div");
    box.className = "you-ghost";
    Object.assign(box.style, {
      left: `${at.clip.x}px`,
      top: `${at.clip.y}px`,
      width: `${at.clip.width}px`,
      height: `${at.clip.height}px`,
      zIndex: above ? "2" : "0",
    });
    box.append(copy);
    this.ghosts.append(box);
    // Where it was scrolled to, so it does not jump to its top as it goes.
    ghost.scroll();
    return { box, copy };
  }
}

/**
 * Moves You's views as they change. `root` is You; `layer` is an empty element in it that React
 * never draws into, where the views going are drawn as they go.
 */
export function useViewMotion(
  root: RefObject<HTMLElement | null>,
  layer: RefObject<HTMLElement | null>,
): void {
  useLayoutEffect(() => {
    const you = root.current;
    const ghosts = layer.current;
    if (you === null || ghosts === null || typeof you.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true) return;
    const views = new Views(you, ghosts);
    views.measure();
    const watch = new MutationObserver(views.changed);
    watch.observe(you, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["hidden"],
      attributeOldValue: true,
    });
    const resized = typeof ResizeObserver === "function" ? new ResizeObserver(views.measure) : null;
    resized?.observe(you);
    you.addEventListener("scroll", views.scrolled, { capture: true, passive: true });
    return () => {
      watch.disconnect();
      resized?.disconnect();
      you.removeEventListener("scroll", views.scrolled, { capture: true });
    };
  }, [root, layer]);
}
