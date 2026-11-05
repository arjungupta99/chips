/**
 * Pages that turn rather than swap (Arjun, 3 November 2026: "everything should have smooth
 * transitions and look highly polished"). The Agents page opens pages over itself — an agent's,
 * a harness's and the pages they open — and until now the one over it was simply there. Any view
 * that gives way to another can turn the same way: it names what it shows (`at`) and how deep it
 * stands (`depth`), and says what in it scrolls, if its place is to be kept (`keeps`).
 *
 * The page coming comes in over the one going, a few points from the side it was opened toward,
 * on `--motion-base`: from the right for one opened over it, from the left for one gone back to,
 * in place for one that takes the same depth (the list arriving over its blank). The page going
 * stays still and whole under it until the new one has come, so every frame is one page or the
 * two crossing, and never a blank one. Then it goes.
 *
 * The page going is the page itself, as it was last drawn, left where it stands: nothing of it is
 * drawn again, so the turn costs the frame no more than the page coming does (a copy of it cost
 * WebKit a second frame, 3 November 2026). While it goes nothing in it can be pressed, read out or
 * found by its test id or its id. Each page that comes is drawn anew, even one going back to a page
 * still on its way out.
 *
 * A page gone back to is where it was left, as the phone's stack keeps the page under: the scroll
 * of what `keeps` names is kept while it is read and put back when it is shown again. A page opened
 * anew starts at its top.
 *
 * The way is the depth's unless the view says its own (`way`): the shell's sections fade through,
 * the one going out and then the one coming in, never both at once (ADR 0274); You's pages push,
 * pop and fade across as the iPad's do (ADR 0265's addendum). Every view that gives way to another
 * turns here; only a dialog its owner has already taken away leaves as a ghost (`ghost.ts`).
 *
 * Under Reduce Motion, or with no screen to ask (a test's), the page is simply there.
 */

import {
  type AnimationEvent,
  type ReactNode,
  type UIEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { moving } from "./motion.ts";

/** Longer than the turn: a turn whose end is never drawn, in a tab in the background, still ends. */
const GONE_MS = 400;

/**
 * How a page comes: over the last, back to one under it, or in its place (the depth's); through
 * (the one going fades out first, a section's); or You's push, pop and across.
 */
export type Way = "on" | "back" | "over" | "through" | "push" | "pop" | "across";

interface Turning {
  /** The page shown, how deep it is, and which turn drew it. */
  readonly at: string;
  readonly depth: number;
  readonly turn: number;
  /** The way it came, while it is coming. */
  readonly way?: Way | undefined;
  /** The page going, as it was last drawn, under the one coming. */
  readonly going?: { readonly key: string; readonly node: ReactNode } | undefined;
}

export function Turns(props: {
  /** Which page this is: another turns. */
  readonly at: string;
  /** How many pages are under it: deeper is opened over, shallower is gone back to. */
  readonly depth: number;
  /** What scrolls in a page, a selector, whose place is kept for when it is gone back to. */
  readonly keeps?: string | undefined;
  /** The way a page comes from the page before it, where the depth does not say it. */
  readonly way?: ((from: string, to: string) => Way) | undefined;
  /** What turns here, for the page's styles and its tests: the shell's sections, or You's pages. */
  readonly name?: string | undefined;
  readonly children: ReactNode;
}) {
  const { at, depth, keeps, children } = props;
  // What was last drawn, so the page going stands as it was.
  const drawn = useRef<ReactNode>(children);
  // Where each page in the stack was scrolled to, by its depth and name.
  const places = useRef(new Map<string, number>());
  const page = useRef<HTMLDivElement>(null);
  const [turning, setTurning] = useState<Turning>({ at, depth, turn: 0 });
  if (turning.at !== at) {
    const way = props.way?.(turning.at, at) ?? wayOf(depth, turning);
    const going = moving() ? { key: keyOf(turning), node: drawn.current } : undefined;
    const turn = turning.turn + 1;
    setTurning({ at, depth, turn, way: going === undefined ? undefined : way, going });
    forget(places.current, depth, way === "back" ? undefined : at);
  }
  useEffect(() => {
    drawn.current = children;
  });
  // A page gone back to is put where it was before it is drawn.
  // biome-ignore lint/correctness/useExhaustiveDependencies: put back once, as each page comes.
  useLayoutEffect(() => {
    const top = places.current.get(placeOf(depth, at));
    const scrolls = keeps === undefined ? null : page.current?.querySelector<HTMLElement>(keeps);
    if (top !== undefined && scrolls != null) scrolls.scrollTop = top;
  }, [at, depth]);
  const going = turning.at === at ? turning.going : undefined;
  const ended = () => setTurning((now) => (now.at === at ? { at, depth, turn: now.turn } : now));
  // Should the turn never be drawn to its end, it ends anyway.
  // biome-ignore lint/correctness/useExhaustiveDependencies: armed once for each page going.
  useEffect(() => {
    if (going === undefined) return;
    const timer = setTimeout(ended, GONE_MS);
    return () => clearTimeout(timer);
  }, [going]);
  return (
    <div className="turns" data-turns={props.name}>
      {going !== undefined && (
        <div
          key={going.key}
          ref={unnamed}
          className="turn"
          data-turn="going"
          data-way={turning.way}
          inert
          aria-hidden="true"
        >
          {going.node}
        </div>
      )}
      <div
        key={keyOf(turning)}
        ref={page}
        className="turn"
        data-turn={turning.at === at ? turning.way : undefined}
        onAnimationEnd={(event: AnimationEvent<HTMLElement>) => {
          if (event.target === event.currentTarget) ended();
        }}
        onScrollCapture={(event: UIEvent<HTMLElement>) => {
          const scrolled = event.target;
          if (keeps !== undefined && scrolled instanceof HTMLElement && scrolled.matches(keeps)) {
            places.current.set(placeOf(depth, at), scrolled.scrollTop);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The page going, from the frame it starts to go: nothing in it is found by its test id or its id,
 * so the page coming is the only one that answers to them. A face's gradients are found by their
 * ids, so a drawing keeps its own.
 */
function unnamed(going: HTMLDivElement | null): void {
  if (going === null) return;
  for (const each of going.querySelectorAll("[data-testid], [id]")) {
    each.removeAttribute("data-testid");
    if (!(each instanceof SVGElement)) each.removeAttribute("id");
  }
}

/** A page's place among the turns: drawn anew each time it comes. */
function keyOf(turning: Turning): string {
  return `${turning.turn} ${turning.at}`;
}

/** Which way a page comes: over the last, back to one under it, or in its place. */
function wayOf(depth: number, from: Turning): Way {
  if (depth > from.depth) return "on";
  if (depth < from.depth) return "back";
  return "over";
}

function placeOf(depth: number, at: string): string {
  return `${depth} ${at}`;
}

/**
 * The places no longer kept as a page turns to `depth`: those deeper than it, and its own when it
 * is opened anew (`at`), which starts at its top.
 */
function forget(places: Map<string, number>, depth: number, at: string | undefined): void {
  if (at !== undefined) places.delete(placeOf(depth, at));
  for (const key of places.keys()) {
    if (Number(key.split(" ")[0]) > depth) places.delete(key);
  }
}
