/**
 * Universe's mark (ADR 0227), as the phone draws it: four rings in the ink round a gold sun, a
 * blue, green, coral and violet planet on them, each with a thin edge of the ground it stands on.
 */

import { type ReactNode, useEffect, useState } from "react";

const RX = 10.4;
const RY = 3;
const RINGS = [0, 45, 90, 135] as const;
/** Where each ring's planet stands along it, in degrees round the ring: spread so none touch. */
const ALONG = [205, 340, 25, 160] as const;
const PLANETS = ["#3b82f6", "#10b981", "#f2545b", "#8b5cf6"] as const;
const SUN = "#f7b81f";

/** A point on a ring, `along` degrees round it, the ring turned `ring` degrees about the middle. */
function pointOn(ring: number, along: number): { readonly x: number; readonly y: number } {
  const turn = (ring * Math.PI) / 180;
  const at = (along * Math.PI) / 180;
  const x = RX * Math.cos(at);
  const y = RY * Math.sin(at);
  return {
    x: 12 + x * Math.cos(turn) - y * Math.sin(turn),
    y: 12 + x * Math.sin(turn) + y * Math.cos(turn),
  };
}

const PLACES = RINGS.map((ring, at) => ({
  ...pointOn(ring, ALONG[at] ?? 0),
  colour: PLANETS[at] ?? SUN,
}));

/** Each planet's time round its ring while Universe reads: each its own pace, as on the phone. */
const PERIODS = ["2.6s", "3.4s", "2.2s", "3s"] as const;

/** A planet's ring as a path from where it stands, all the way round, for it to travel. */
function ringPath(ring: number, along: number): string {
  const from = pointOn(ring, along);
  const across = pointOn(ring, along + 180);
  const arc = (to: { x: number; y: number }) => `A ${RX} ${RY} ${ring} 1 1 ${to.x} ${to.y}`;
  return `M ${from.x} ${from.y} ${arc(across)} ${arc(from)}`;
}

const stillPlease = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * The mark. With `orbit`, its planets travel their rings while Universe reads the space and its
 * page opens (Arjun's pick on the mock, 24 October 2026: "Orbit loading motion looks good"); it
 * stands still for a reader who asked the system for less motion.
 */
export function UniverseMark({
  size = 20,
  orbit = false,
}: {
  readonly size?: number;
  readonly orbit?: boolean;
}) {
  const moving = orbit && !stillPlease();
  return (
    <svg
      className="universe-mark"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {RINGS.map((ring) => (
        <ellipse
          key={ring}
          cx={12}
          cy={12}
          rx={RX}
          ry={RY}
          transform={`rotate(${ring} 12 12)`}
          fill="none"
          stroke="currentColor"
          strokeWidth={size <= 24 ? 1.15 : 0.8}
          opacity={0.55}
        />
      ))}
      <circle cx={12} cy={12} r={3.5} fill={SUN} stroke="var(--universe-ground, var(--bg))">
        {moving && (
          <animate attributeName="r" values="3.5;3.78;3.5" dur="1.6s" repeatCount="indefinite" />
        )}
      </circle>
      {PLACES.map((place, at) => (
        <circle
          key={place.colour}
          cx={moving ? 0 : place.x}
          cy={moving ? 0 : place.y}
          r={2.05}
          fill={place.colour}
          stroke="var(--universe-ground, var(--bg))"
          strokeWidth={0.9}
        >
          {moving && (
            <animateMotion
              dur={PERIODS[at] ?? "3s"}
              repeatCount="indefinite"
              path={ringPath(RINGS[at] ?? 0, ALONG[at] ?? 0)}
            />
          )}
        </circle>
      ))}
    </svg>
  );
}

/** Universe reading the space, or opening its page: the mark's planets round their rings. */
export function UniverseReading({ words }: { readonly words: string }) {
  return (
    <div className="universe-reading" role="status" data-testid="universe-reading">
      <UniverseMark size={72} orbit />
      <p className="sheet-hint">{words}</p>
    </div>
  );
}

/**
 * A page of the project arriving where the planets went round, as on the phone (`Arrival`; Arjun,
 * 24 October 2026: "the content showing after loading is very abrupt, need a transition"). They
 * step back and fade as the page fades in and rises into place, a beat behind. The page is there
 * but unseen until `ready`, its frame loaded, so a frame's white canvas never shows before the page
 * has painted over it. Once they have faded, the planets are taken away.
 */
export function UniverseArrival({
  ready,
  words,
  children,
}: {
  readonly ready: boolean;
  readonly words: string;
  readonly children?: ReactNode;
}) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!ready) setGone(false);
  }, [ready]);
  return (
    <div className="universe-arrival" data-ready={ready ? "" : undefined}>
      <div className="universe-arrival-came" inert={!ready}>
        {children}
      </div>
      {gone ? null : (
        <div
          className="universe-arrival-waiting"
          aria-hidden={ready ? true : undefined}
          onTransitionEnd={() => {
            if (ready) setGone(true);
          }}
        >
          <UniverseReading words={words} />
        </div>
      )}
    </div>
  );
}
