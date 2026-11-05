import { type ReactNode, useRef, useState } from "react";

/** Less motion asked for, or a document that draws no animation (a test's): words change at once. */
function lessMotion(): boolean {
  if (typeof Element.prototype.animate !== "function") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * Words that change where they stand: what was there fades out, what comes fades in rising three
 * pixels (`.swap-in`, `.swap-out`), both in the one grid cell so neither moves the other: what the
 * room's strip is doing, and a row of You's settling on what it was just set to (ADR 0265's
 * addendum). With less motion asked for they change at once, and nothing is left fading: the
 * stylesheet's animations are off then, so the words going would never say they had gone.
 */
export function Swap({
  id,
  className,
  children,
}: {
  readonly id: string;
  readonly className: string;
  readonly children: ReactNode;
}) {
  const [was, setWas] = useState<{ readonly id: string; readonly words: ReactNode }>({
    id,
    words: children,
  });
  const [going, setGoing] = useState<{ readonly id: string; readonly words: ReactNode }>();
  if (was.id !== id) {
    if (!lessMotion()) setGoing(was);
    setWas({ id, words: children });
  }
  const changed = useRef(false);
  if (going !== undefined) changed.current = true;
  return (
    <span className={`swap ${className}`}>
      <span key={id} className={changed.current ? "swap-now swap-in" : "swap-now"}>
        {children}
      </span>
      {going === undefined ? null : (
        <span
          key={`going:${going.id}`}
          className="swap-out"
          aria-hidden="true"
          onAnimationEnd={() => setGoing(undefined)}
        >
          {going.words}
        </span>
      )}
    </span>
  );
}
