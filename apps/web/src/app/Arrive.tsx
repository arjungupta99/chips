/**
 * What comes and goes in a list on the Agents page, in place (Arjun, 3 November 2026: "everything
 * should have smooth transitions"): a row or a tile that comes into a list already drawn grows into
 * its place as it fades in (`useArrivals`), and what opens under a fold unfolds to its size and
 * folds shut again (`Fold`), each on `--motion-base`. What a list is first drawn with simply is.
 *
 * Under Reduce Motion, or with no screen to ask (a test's), they are simply there, and gone.
 */

import {
  type AnimationEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { moving } from "./motion.ts";

/** Longer than an arrival (`--motion-base`): it is let go then, drawn to its end or not. */
const ARRIVED_MS = 400;

const NONE: ReadonlySet<string> = new Set();

/**
 * Which of a list's ids came into it since it was first drawn, for as long as they take to arrive.
 * Known before the frame they come in is drawn, so a row never shows whole first.
 */
export function useArrivals(ids: readonly string[]): ReadonlySet<string> {
  const known = useRef<ReadonlySet<string> | undefined>(undefined);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [arriving, setArriving] = useState<ReadonlySet<string>>(NONE);
  const key = ids.join("\n");
  useLayoutEffect(() => {
    const was = known.current;
    const now = new Set(key === "" ? [] : key.split("\n"));
    known.current = now;
    if (was === undefined || !moving()) return;
    const fresh = [...now].filter((id) => !was.has(id));
    if (fresh.length === 0) return;
    setArriving((then) => new Set([...then, ...fresh]));
    timers.current.push(
      setTimeout(() => {
        setArriving((then) => new Set([...then].filter((id) => !fresh.includes(id))));
      }, ARRIVED_MS),
    );
  }, [key]);
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
    };
  }, []);
  return arriving;
}

type Folding = "open" | "opening" | "closing" | "shut";

/**
 * What a fold's button opens: it unfolds to its size when opened, and folds shut when closed,
 * drawn until it has.
 */
export function Fold(props: { readonly open: boolean; readonly children: ReactNode }) {
  const [folding, setFolding] = useState<Folding>(props.open ? "open" : "shut");
  const next = foldingTo(props.open, folding);
  if (next !== folding) setFolding(next);
  // What it held, drawn as it was while it folds shut.
  const held = useRef<ReactNode>(props.children);
  if (props.open) held.current = props.children;
  // Should a fold never be drawn to its end, in a tab in the background, it ends anyway.
  useEffect(() => {
    if (folding !== "opening" && folding !== "closing") return;
    const timer = setTimeout(() => setFolding(ended), ARRIVED_MS);
    return () => clearTimeout(timer);
  }, [folding]);
  if (folding === "shut") return null;
  return (
    <div
      className="fold"
      data-fold={folding === "open" ? undefined : folding}
      inert={folding === "closing"}
      onAnimationEnd={(event: AnimationEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget) return;
        setFolding(ended);
      }}
    >
      <div className="fold-in">{folding === "closing" ? held.current : props.children}</div>
    </div>
  );
}

/** Which way a fold goes when it is opened or closed: on its way, or there at once. */
function foldingTo(open: boolean, now: Folding): Folding {
  const there = now === (open ? "open" : "shut") || now === (open ? "opening" : "closing");
  if (there) return now;
  if (!moving()) return open ? "open" : "shut";
  return open ? "opening" : "closing";
}

/** Where a fold comes to rest: open, or shut. */
function ended(now: Folding): Folding {
  if (now === "opening") return "open";
  if (now === "closing") return "shut";
  return now;
}
