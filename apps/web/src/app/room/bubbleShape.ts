/**
 * A bubble whose words change where it stands takes its new shape on the room's spring (ADR 0284's
 * second addendum): a queued turn's bubble, edited by its harness as it works, a call more at a
 * time and folded to its receipt at the end, and a line edited.
 *
 * The rows under such a bubble went to their new places on the room's spring (`roomMotion.ts`), but
 * the bubble itself was drawn at its new size from the frame its words changed: a call added stood
 * a line taller in a frame, and a receipt folded a line away in one (Arjun, 7 November 2026: "I am
 * seeing some abruptness. everything should look very polished"). Now its words are laid out at
 * their new shape at once and held there, and the bubble's box goes from the shape it was drawn at
 * to the new one on the room's spring, clipping what it does not hold yet, as a frame on the phone
 * does. A change while it goes goes on from where it is drawn.
 *
 * A bubble that changes shape because the room did (a column moving, a window drawn wider) is the
 * room's to move (`widthGlide.ts`), and with less motion asked for it is simply its new shape.
 */

import { ROOM_SPRING, springCurve } from "@chipschat/core";
import { useCallback, useLayoutEffect, useRef } from "react";
import { moving } from "../motion.ts";

/** A spring's look, for a browser that cannot draw `linear()`. */
const NEAR_SPRING = "cubic-bezier(0.25, 0.8, 0.3, 1)";

/** The room's spring as an easing and how long it runs, worked out once, when a bubble first moves. */
let roomEasing: { readonly easing: string; readonly ms: number } | undefined;
function roomSpring(): { readonly easing: string; readonly ms: number } {
  if (roomEasing !== undefined) return roomEasing;
  const { ms, shares } = springCurve(ROOM_SPRING);
  const linear = `linear(${shares.map((share) => Math.round(share * 10_000) / 10_000).join(", ")})`;
  const drawable = typeof CSS !== "undefined" && CSS.supports("transition-timing-function", linear);
  roomEasing = { easing: drawable ? linear : NEAR_SPRING, ms };
  return roomEasing;
}

interface Shape {
  readonly width: number;
  readonly height: number;
}

/** A bubble's shape on its way: the glide, and letting its words go when it is over. */
interface Going {
  readonly glide: Animation;
  readonly letGo: () => void;
}

/** What the hook keeps of its bubble: the element, its shape at rest, and its glide. */
interface Kept {
  bubble: HTMLElement | undefined;
  rest: Shape | undefined;
  going: Going | undefined;
}

/**
 * The ref for a bubble saying `said`: when what it says changes, its box goes from the shape it was
 * drawn at to its new one.
 */
export function useBubbleShape(said: string): (bubble: HTMLElement | null) => () => void {
  const kept = useRef<Kept>({ bubble: undefined, rest: undefined, going: undefined });

  // Its shape at rest, followed while nothing of its own moves it: a room grown wider moves it too.
  const ref = useCallback((bubble: HTMLElement | null) => {
    const state = kept.current;
    if (bubble === null || typeof ResizeObserver === "undefined") return () => undefined;
    state.bubble = bubble;
    const watcher = new ResizeObserver((entries) => {
      if (state.going !== undefined) return;
      const box = entries[entries.length - 1]?.borderBoxSize?.[0];
      state.rest =
        box === undefined ? shapeOf(bubble) : { width: box.inlineSize, height: box.blockSize };
    });
    watcher.observe(bubble);
    return () => {
      watcher.disconnect();
      stop(state);
      state.bubble = undefined;
      state.rest = undefined;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: what it says is what moves it.
  useLayoutEffect(() => {
    const state = kept.current;
    const bubble = state.bubble;
    if (bubble === undefined) return;
    // Where it is drawn: at rest, or on its way from an earlier change.
    const drawn = state.going === undefined ? state.rest : shapeOf(bubble);
    stop(state);
    const now = shapeOf(bubble);
    state.rest = now;
    if (drawn !== undefined && glides(bubble, drawn, now))
      state.going = reshape(state, bubble, drawn, now);
  }, [said]);

  return ref;
}

/**
 * Whether the bubble goes to its new shape: it changed, motion is asked for, and the room is not
 * taking a new width, which draws its bubbles itself.
 */
function glides(bubble: HTMLElement, drawn: Shape, now: Shape): boolean {
  if (!moving() || typeof bubble.animate !== "function") return false;
  if (!moves(drawn.width - now.width) && !moves(drawn.height - now.height)) return false;
  return bubble.closest(".msgs[data-held]") === null;
}

/** The box from the shape it is drawn at to its new one, round its words held at their new shape. */
function reshape(state: Kept, bubble: HTMLElement, drawn: Shape, now: Shape): Going {
  const held = [...bubble.children].filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  const widths = held.map((child) => child.getBoundingClientRect().width);
  for (const [index, child] of held.entries()) child.style.width = `${widths[index]}px`;
  bubble.style.overflow = "hidden";
  bubble.style.boxSizing = "border-box";
  const { easing, ms } = roomSpring();
  const glide = bubble.animate(
    [
      { width: `${drawn.width}px`, height: `${drawn.height}px` },
      { width: `${now.width}px`, height: `${now.height}px` },
    ],
    { duration: ms, easing },
  );
  const letGo = () => {
    for (const child of held) child.style.width = "";
    bubble.style.overflow = "";
    bubble.style.boxSizing = "";
  };
  const going: Going = { glide, letGo };
  glide.onfinish = () => {
    if (state.going !== going) return;
    state.going = undefined;
    letGo();
    state.rest = shapeOf(bubble);
  };
  return going;
}

/** The glide stopped where it is, and the words let go, at once. */
function stop(state: Kept): void {
  const going = state.going;
  if (going === undefined) return;
  state.going = undefined;
  going.glide.cancel();
  going.letGo();
}

function shapeOf(bubble: HTMLElement): Shape {
  const box = bubble.getBoundingClientRect();
  return { width: box.width, height: box.height };
}

/** Half a pixel or more: under that is no move. */
function moves(px: number): boolean {
  return Math.abs(px) >= 0.5;
}
