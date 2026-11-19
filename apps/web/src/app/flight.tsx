/**
 * The update dot's flight into About's first update button, on the Mac and the web (ADR 0296,
 * addendum of 17 November 2026): core's store (`dotFlights`), kept for the page, the hooks that
 * read it, and the dot on its way.
 *
 * Clicked, the dot takes off from where it stands, in the Mac's title strip or the rail's top row,
 * and About opens beside You's list. About's first update button says where it stands once the page
 * has come in, and the dot flies there, x and y on different curves so its path bends, swelling to
 * meet the button, which grows out of it as it lands. A copy of the dot is drawn over the page for
 * the flight, so nothing it passes over clips it. With reduced motion it never takes off.
 */

import { type DotFlight, type DotPoint, dotFlights, UPDATE_MOTION } from "@chipschat/core";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

export const flights = dotFlights();

export function useDotFlight(): DotFlight {
  return useSyncExternalStore(flights.subscribe, flights.now, flights.now);
}

const curve = (points: readonly number[]) => `cubic-bezier(${points.join(", ")})`;

/** Whether this page moves at all: reduced motion keeps the dot where it is. */
export function flies(): boolean {
  return (
    typeof window.matchMedia !== "function" ||
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** The dot was clicked: it takes off from where it stands, if this page moves. */
export function takeOff(from: Element): void {
  const box = from.getBoundingClientRect();
  // A dot that isn't drawn (one of the places that doesn't fit this window) has nowhere to set off from.
  if (!flies() || box.width === 0) return;
  const id = flights.takeOff();
  flights.from(id, { x: box.left + box.width / 2, y: box.top + box.height / 2 });
}

/**
 * Once whatever is bringing `el` in has finished (the page sliding in beside the list), where its
 * middle will stand. Only motions with an end are waited for, and not for longer than `waitMs`
 * leaves for the flight.
 */
async function settledMiddle(el: Element): Promise<DotPoint> {
  const moving =
    typeof document.getAnimations === "function"
      ? document.getAnimations().filter((motion) => {
          const target = (motion.effect as KeyframeEffect | null)?.target;
          return (
            target instanceof Element &&
            target !== el &&
            target.contains(el) &&
            motion.playState === "running" &&
            Number.isFinite(Number(motion.effect?.getComputedTiming().endTime))
          );
        })
      : [];
  if (moving.length > 0) {
    await Promise.race([
      Promise.all(moving.map((motion) => motion.finished.catch(() => undefined))),
      new Promise((done) => setTimeout(done, UPDATE_MOTION.waitMs - UPDATE_MOTION.flyMs)),
    ]);
  }
  const box = el.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/**
 * For the first update button: say where it stands while the dot is on its way, once laid out and
 * come in, or when the dot is clicked while About already shows it.
 */
export function useAim(el: { readonly current: Element | null }, first: boolean): void {
  const flight = useDotFlight();
  const up = flight.stage === "up" ? flight.id : undefined;
  useLayoutEffect(() => {
    const at = el.current;
    if (!first || up === undefined || at === null) return;
    void settledMiddle(at).then((middle) => flights.aim(up, middle));
  }, [first, up, el]);
}

/**
 * For About's Updates group: with no update button to land on, a dot on its way goes out where it
 * stands at once, rather than after the wait.
 */
export function useMissWithoutButton(buttons: boolean): void {
  const flight = useDotFlight();
  useEffect(() => {
    if (!buttons && flight.stage === "up") flights.miss(flight.id);
  }, [buttons, flight.stage, flight.id]);
}

/** The dot on its way, over the page. Drawn once, by the shell. */
export function DotFlightLayer() {
  const flight = useDotFlight();
  const [shown, setShown] = useState<{ readonly id: number; readonly from: DotPoint }>();
  useEffect(() => {
    if (flight.stage === "up" && flight.from !== undefined && shown?.id !== flight.id) {
      setShown({ id: flight.id, from: flight.from });
    }
  }, [flight, shown?.id]);
  if (shown === undefined) return null;
  const mine = flight.id === shown.id;
  return createPortal(
    <Flying
      key={shown.id}
      id={shown.id}
      from={shown.from}
      to={mine && flight.stage === "up" ? flight.to : undefined}
      missed={!mine || flight.stage === "missed" || flight.stage === "rest"}
      onDone={() => setShown((was) => (was?.id === shown.id ? undefined : was))}
    />,
    document.body,
  );
}

function Flying(props: {
  readonly id: number;
  readonly from: DotPoint;
  readonly to: DotPoint | undefined;
  readonly missed: boolean;
  readonly onDone: () => void;
}) {
  const { id, from, to, missed } = props;
  const across = useRef<HTMLSpanElement>(null);
  const down = useRef<HTMLSpanElement>(null);
  const done = useRef(props.onDone);
  done.current = props.onDone;
  const flying = useRef(false);
  const toX = to?.x;
  const toY = to?.y;
  useEffect(() => {
    const x = across.current;
    const y = down.current;
    if (toX === undefined || toY === undefined || flying.current || x === null || y === null)
      return;
    flying.current = true;
    const landed = () => {
      // The button grows out of it from here: the dot is gone in the same frame.
      flights.land(id);
      done.current();
    };
    if (typeof x.animate !== "function") {
      landed();
      return;
    }
    const timing = { duration: UPDATE_MOTION.flyMs, fill: "forwards" as const };
    x.animate([{ transform: "translateX(0)" }, { transform: `translateX(${toX - from.x}px)` }], {
      ...timing,
      easing: curve(UPDATE_MOTION.flyX),
    });
    const fall = y.animate(
      [
        { transform: "translateY(0) scale(1)" },
        { transform: `translateY(${toY - from.y}px) scale(${UPDATE_MOTION.flyScale})` },
      ],
      { ...timing, easing: curve(UPDATE_MOTION.flyY) },
    );
    flights.depart(id);
    fall.finished.then(landed, () => undefined);
  }, [toX, toY, id, from.x, from.y]);
  useEffect(() => {
    const y = down.current;
    if (!missed || flying.current || y === null) return;
    if (typeof y.animate !== "function") {
      done.current();
      return;
    }
    y.animate(
      [
        { opacity: 1, transform: "scale(1)" },
        { opacity: 0, transform: "scale(0.3)" },
      ],
      {
        duration: 200,
        easing: "ease-out",
        fill: "forwards",
      },
    ).finished.then(
      () => done.current(),
      () => undefined,
    );
  }, [missed]);
  return (
    <span
      ref={across}
      className="update-dot-flying"
      style={{ left: from.x, top: from.y }}
      aria-hidden="true"
      data-testid="update-dot-flying"
    >
      <span ref={down} className="update-dot-flying-core" />
    </span>
  );
}
