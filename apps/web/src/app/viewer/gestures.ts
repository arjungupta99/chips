/**
 * Every gesture the stage hears, and the scale, the pan and the drag they move — kept apart from
 * the component so `Stage` reads as what it draws (the media viewer proposal, §4.3 and §4.6).
 *
 * The arithmetic is core's, so the web and the phone cannot disagree about when a swipe pages, when
 * a drag closes, or how far a picture may be zoomed and panned.
 */

import {
  clampPan,
  type DeckItem,
  dismissDecision,
  dismissProgress,
  type Point,
  type Rect,
  rubberBand,
  type Size,
  snapPage,
} from "@chipschat/core";
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  type RefObject,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

/** A touch means nothing until it has moved this far; the phone learned it on the emulator. */
const SLOP = 10;
/** Let go of a pinch under this and the viewer closes, as Photos does (§4.6). */
const PINCH_CLOSE = 0.75;
/** A double click zooms here and back: §4.3's two times for a pointer, §4.6's 2.5 for a tap. */
const DOUBLE_POINTER = 2;
const DOUBLE_TOUCH = 2.5;
/** What the zoom keys step by. */
export const ZOOM_STEP = 1.5;

/** What the keys ask of the stage, since zoom lives here (§4.3: `+` `−` `0`). */
export interface StageHandle {
  /** Zoom about the middle of the stage by a factor, clamped to what the picture allows. */
  readonly zoomBy: (factor: number) => void;
  /** Back to fitted. */
  readonly fit: () => void;
}

/** What one gesture is doing, once its first movement has decided. */
type Doing = "none" | "undecided" | "page" | "dismiss" | "pan" | "pinch";

interface Live {
  readonly pointers: Map<number, Point>;
  doing: Doing;
  start: Point;
  startedAt: number;
  /** The scale and translate the gesture began from. */
  fromScale: number;
  fromTranslate: Point;
  /** A pinch's first spread and midpoint. */
  fromSpread: number;
  /** The last movement, for a flick's speed. */
  last: { at: number; x: number; y: number };
  velocity: Point;
  /** Whether this gesture has moved past the slop at all: a tap has not. */
  moved: boolean;
  /** What made the last touch: a `dblclick` does not say, and the zoom differs by hand. */
  hand: string;
}

export interface Gestures {
  readonly scale: number;
  readonly translate: Point;
  /** How far a page swipe or a dismiss drag has carried, before it settles. */
  readonly drag: Point;
  /** Whether a released gesture is springing home, which is the only time it is animated. */
  readonly settling: boolean;
  readonly onPointerDown: (event: ReactPointerEvent) => void;
  readonly onPointerMove: (event: ReactPointerEvent) => void;
  readonly onPointerUp: (event: ReactPointerEvent) => void;
  readonly onDoubleClick: (event: ReactMouseEvent) => void;
  readonly onWheel: (event: ReactWheelEvent) => void;
}

export function useStageGestures(what: {
  readonly deck: readonly DeckItem[];
  readonly index: number;
  /** Where the current picture stands on the stage, and how big the stage is. */
  readonly fitted: Rect;
  readonly stage: Size;
  readonly limits: { readonly min: number; readonly max: number };
  /** The stage's element, for turning a page's pixels into the stage's. */
  readonly surface: RefObject<HTMLDivElement | null>;
  readonly onIndex: (index: number) => void;
  readonly onClose: () => void;
  readonly onChrome: () => void;
  readonly onDismissing: (progress: { backdrop: number; dragging: boolean }) => void;
  readonly handle: RefObject<StageHandle | null>;
}): Gestures {
  const { deck, index, fitted, stage, limits, surface, onIndex, onClose, onChrome } = what;
  const { onDismissing } = what;
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState<Point>({ x: 0, y: 0 });
  const [drag, setDrag] = useState<Point>({ x: 0, y: 0 });
  const [settling, setSettling] = useState(false);

  // A page resets the zoom, as the phone's pager does: a settled page shows a fitted picture.
  useEffect(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const live = useRef<Live>({
    pointers: new Map(),
    doing: "none",
    start: { x: 0, y: 0 },
    startedAt: 0,
    fromScale: 1,
    fromTranslate: { x: 0, y: 0 },
    fromSpread: 0,
    last: { at: 0, x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    moved: false,
    hand: "mouse",
  });

  /** Zoom to `next` keeping the content under `at` (stage pixels) where it is. */
  const zoomAt = useCallback(
    (next: number, at: Point, fromScale: number, fromTranslate: Point) => {
      const centre = { x: fitted.x + fitted.width / 2, y: fitted.y + fitted.height / 2 };
      const ratio = next / fromScale;
      const moved = {
        x: (at.x - centre.x) * (1 - ratio) + fromTranslate.x * ratio,
        y: (at.y - centre.y) * (1 - ratio) + fromTranslate.y * ratio,
      };
      setScale(next);
      setTranslate(next <= 1 ? { x: 0, y: 0 } : clampPan(next, fitted, stage, moved));
    },
    [fitted, stage],
  );

  useImperativeHandle(
    what.handle,
    () => ({
      zoomBy: (factor: number) => {
        const middle = { x: stage.width / 2, y: stage.height / 2 };
        const next = Math.min(limits.max, Math.max(limits.min, scale * factor));
        setSettling(true);
        zoomAt(next, middle, scale, translate);
      },
      fit: () => {
        setSettling(true);
        setScale(1);
        setTranslate({ x: 0, y: 0 });
      },
    }),
    [limits, scale, translate, stage, zoomAt],
  );

  const spreadOf = (points: Point[]): { spread: number; middle: Point } => {
    const [a, b] = points;
    if (a === undefined || b === undefined) return { spread: 0, middle: { x: 0, y: 0 } };
    return {
      spread: Math.hypot(a.x - b.x, a.y - b.y),
      middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };

  const pointOf = (event: ReactPointerEvent): Point => {
    const box = surface.current?.getBoundingClientRect();
    return { x: event.clientX - (box?.left ?? 0), y: event.clientY - (box?.top ?? 0) };
  };

  const onPointerDown = (event: ReactPointerEvent) => {
    const now = live.current;
    const at = pointOf(event);
    now.hand = event.pointerType;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A synthesised pointer — a spec dispatching its own swipe — has no capture to take.
    }
    now.pointers.set(event.pointerId, at);
    setSettling(false);
    if (now.pointers.size === 2) {
      const { spread } = spreadOf([...now.pointers.values()]);
      now.doing = "pinch";
      now.fromSpread = spread;
      now.fromScale = scale;
      now.fromTranslate = translate;
      return;
    }
    if (now.pointers.size > 2) return;
    now.doing = scale > 1.01 ? "pan" : "undecided";
    now.start = at;
    now.startedAt = event.timeStamp;
    now.last = { at: event.timeStamp, x: at.x, y: at.y };
    now.velocity = { x: 0, y: 0 };
    now.fromScale = scale;
    now.fromTranslate = translate;
    now.moved = false;
  };

  /** A pinch: the scale follows the spread of the two fingers, about the point between them. */
  const pinching = (now: Live) => {
    const { spread, middle } = spreadOf([...now.pointers.values()]);
    if (now.fromSpread <= 0) return;
    // Under one is allowed while the fingers are down: letting go there closes the viewer.
    zoomAt(
      Math.min(limits.max, (spread / now.fromSpread) * now.fromScale),
      middle,
      now.fromScale,
      now.fromTranslate,
    );
  };

  /** How fast the finger is going, for a flick, kept between one move and the next. */
  const keepSpeed = (now: Live, at: Point, stamp: number) => {
    const since = stamp - now.last.at;
    if (since <= 0) return;
    now.velocity = {
      x: ((at.x - now.last.x) / since) * 1000,
      y: ((at.y - now.last.y) / since) * 1000,
    };
    now.last = { at: stamp, x: at.x, y: at.y };
  };

  /** One pointer, moved: pan while zoomed, else page or dismiss, as its first movement decided. */
  const dragging = (now: Live, move: Point) => {
    if (now.doing === "pan") {
      setTranslate(
        clampPan(scale, fitted, stage, {
          x: now.fromTranslate.x + move.x,
          y: now.fromTranslate.y + move.y,
        }),
      );
      return;
    }
    if (now.doing === "page") {
      // The ends resist and nothing wraps.
      const wall = (move.x > 0 && index === 0) || (move.x < 0 && index === deck.length - 1);
      setDrag({ x: wall ? rubberBand(move.x, stage.width) : move.x, y: 0 });
      return;
    }
    if (now.doing === "dismiss") {
      setDrag({ x: 0, y: move.y });
      onDismissing({ backdrop: dismissProgress(move.y).backdrop, dragging: true });
    }
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const now = live.current;
    if (!now.pointers.has(event.pointerId)) return;
    const at = pointOf(event);
    now.pointers.set(event.pointerId, at);
    if (now.doing === "pinch") {
      pinching(now);
      return;
    }

    const move = { x: at.x - now.start.x, y: at.y - now.start.y };
    keepSpeed(now, at, event.timeStamp);
    // Nothing is decided until the touch has moved ten pixels: Android reports a pan's first
    // update at no distance, and `|dx| > |dy|` on nothing is a coin toss (the phone, Phase 1).
    if (Math.hypot(move.x, move.y) < SLOP) return;
    now.moved = true;
    if (now.doing === "undecided") {
      now.doing = Math.abs(move.x) > Math.abs(move.y) ? "page" : "dismiss";
    }
    dragging(now, move);
  };

  /** The last finger off a pinch: under three quarters closes, else the scale settles in range. */
  const endPinch = (now: Live) => {
    if (now.pointers.size > 0) return;
    now.doing = "none";
    if (scale < PINCH_CLOSE) {
      onClose();
      return;
    }
    setSettling(true);
    const settled = Math.min(limits.max, Math.max(limits.min, scale));
    setScale(settled);
    setTranslate(settled <= 1 ? { x: 0, y: 0 } : clampPan(settled, fitted, stage, translate));
  };

  /** Nothing moved: a tap. On the picture it hides and shows the chrome; off it, it closes. */
  const tapped = (at: Point) => {
    const onPicture =
      at.x >= fitted.x &&
      at.x <= fitted.x + fitted.width &&
      at.y >= fitted.y &&
      at.y <= fitted.y + fitted.height;
    if (onPicture) onChrome();
    else onClose();
  };

  /** A released page swipe: one page at a time, and never past either end (core's `snapPage`). */
  const settlePage = (now: Live) => {
    // `snapPage` counts toward the newer item, which is a finger moving left — the other way round
    // from the drag, which is why both are negated.
    const landed = snapPage(-drag.x, -now.velocity.x, stage.width, deck.length, index);
    setDrag({ x: 0, y: 0 });
    if (landed !== index) onIndex(landed);
  };

  /** A released dismiss drag: past the line or flicked it closes, short of it it springs home. */
  const settleDismiss = (now: Live) => {
    const decision = dismissDecision(drag.y, now.velocity.y);
    setDrag({ x: 0, y: 0 });
    onDismissing({ backdrop: 1, dragging: false });
    if (decision === "close") onClose();
  };

  const endGesture = (event: ReactPointerEvent) => {
    const now = live.current;
    now.pointers.delete(event.pointerId);
    if (now.doing === "pinch") {
      endPinch(now);
      return;
    }
    if (now.pointers.size > 0) return;
    const doing = now.doing;
    now.doing = "none";
    setSettling(true);
    if (doing === "page") return settlePage(now);
    if (doing === "dismiss") return settleDismiss(now);
    if (doing !== "pan" && !now.moved && event.type === "pointerup") tapped(pointOf(event));
  };

  const onDoubleClick = (event: ReactMouseEvent) => {
    const box = surface.current?.getBoundingClientRect();
    const at = { x: event.clientX - (box?.left ?? 0), y: event.clientY - (box?.top ?? 0) };
    setSettling(true);
    if (scale > 1.01) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
      return;
    }
    const to = live.current.hand === "touch" ? DOUBLE_TOUCH : DOUBLE_POINTER;
    zoomAt(Math.min(limits.max, to), at, 1, { x: 0, y: 0 });
  };

  const onWheel = (event: ReactWheelEvent) => {
    // A trackpad pinch arrives as a wheel with `ctrlKey`, which is why the two are one branch.
    if (event.ctrlKey || event.metaKey) {
      const box = surface.current?.getBoundingClientRect();
      const at = { x: event.clientX - (box?.left ?? 0), y: event.clientY - (box?.top ?? 0) };
      const next = Math.min(
        limits.max,
        Math.max(limits.min, scale * Math.exp(-event.deltaY / 200)),
      );
      setSettling(false);
      zoomAt(next, at, scale, translate);
      return;
    }
    if (scale > 1.01) {
      setSettling(false);
      setTranslate(
        clampPan(scale, fitted, stage, {
          x: translate.x - event.deltaX,
          y: translate.y - event.deltaY,
        }),
      );
    }
  };

  return {
    scale,
    translate,
    drag,
    settling,
    onPointerDown,
    onPointerMove,
    onPointerUp: endGesture,
    onDoubleClick,
    onWheel,
  };
}
