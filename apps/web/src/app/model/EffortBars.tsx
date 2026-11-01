/**
 * An agent's effort as bars (ADR 0141, the phone's on the desktop): one per level its harness
 * gives, lowest first, rising, lit gold up to the one it runs at. Small at the right of the model
 * row; big in the dialog, where they are a radio group, each bar a radio with its level's name
 * under it (five levels or fewer; above that, only the chosen one's name, big, over them), and the
 * arrow keys move along them.
 *
 * Flat, as every control is, and the cool goes into motion: when the level moves, the light
 * sweeps along the bars that change, a bar every 50 ms (core's `sweepOf`), up when it rises and
 * down when it falls; in the dialog it sweeps up from nothing as the dialog grows, and the chosen
 * bar stands a little taller on a spring. Each bar's gold is a layer whose opacity moves, after its
 * own delay. Reduce Motion lights them at once (the stylesheet's).
 */

import { NAMED_BARS_MAX, sweepOf } from "@chipschat/core";
import type { EffortLevel } from "@chipschat/protocol";
import { useEffect, useId, useState } from "react";

/** A row's bars, and the dialog's: the shortest's height and the tallest's. */
const ROW = { low: 5, high: 13 };
const DIAL = { low: 16, high: 40 };

/** The height of the bar at `at` of `count`, rising evenly from `low` to `high`. */
function heightOf(at: number, count: number, low: number, high: number): number {
  if (count <= 1) return (low + high) / 2;
  return low + ((high - low) * at) / (count - 1);
}

/** Which bars are lit, up to `level`, and how long each waits before its light moves. */
interface Lit {
  readonly level: number;
  readonly delays: readonly number[];
}

function delaysOf(count: number, from: number, to: number): readonly number[] {
  const delays = Array.from({ length: count }, () => 0);
  for (const change of sweepOf(count, from, to)) delays[change.at] = change.delay;
  return delays;
}

/**
 * The bars' light, moved when `level` does. `fromNothing`: drawn first with none lit, and the
 * light sweeps up to the level. The move waits two frames, so the bars are drawn as they were
 * before their light goes; the bars are kept by place, so a model with other levels relabels them.
 */
function useSweep(count: number, level: number, fromNothing: boolean): Lit {
  const [lit, setLit] = useState<Lit>(() => ({ level: fromNothing ? -1 : level, delays: [] }));
  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() =>
        setLit((was) =>
          was.level === level ? was : { level, delays: delaysOf(count, was.level, level) },
        ),
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [count, level]);
  return lit;
}

/** A bar's gold, lit or not, after its delay. */
function Light({ lit, at }: { readonly lit: Lit; readonly at: number }) {
  return (
    <span
      className="model-light"
      data-lit={at <= lit.level}
      style={{ transitionDelay: `${lit.delays[at] ?? 0}ms` }}
    />
  );
}

/** The small bars at the right of the model row: hidden from readers, since the row says it. */
export function RowBars({
  levels,
  level,
  quiet,
}: {
  readonly levels: readonly EffortLevel[];
  readonly level: number;
  /** Away or read only: the lit bars in grey. */
  readonly quiet: boolean;
}) {
  const lit = useSweep(levels.length, level, false);
  if (levels.length === 0) return null;
  return (
    <span
      className="model-row-bars"
      data-quiet={quiet}
      aria-hidden="true"
      data-testid="model-row-bars"
    >
      {levels.map((_, at) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: a bar is its place, whatever level it shows.
          key={at}
          className="model-row-bar"
          style={{ height: heightOf(at, levels.length, ROW.low, ROW.high) }}
        >
          <Light lit={lit} at={at} />
        </span>
      ))}
    </span>
  );
}

/**
 * The dialog's bars: a radio group, rising, each with its level's name under it while there are
 * five or fewer. `off`: Same is on, and the bars show the default's level without taking a pick.
 */
export function DialBars({
  levels,
  level,
  off,
  onPick,
}: {
  readonly levels: readonly EffortLevel[];
  readonly level: number;
  readonly off: boolean;
  readonly onPick: (effortId: string) => void;
}) {
  const lit = useSweep(levels.length, level, true);
  const group = useId();
  const named = levels.length <= NAMED_BARS_MAX;
  return (
    <div
      className="model-dial-bars"
      role="radiogroup"
      aria-label="Effort"
      data-testid="model-levels"
    >
      {levels.map((each, at) => (
        <label
          // biome-ignore lint/suspicious/noArrayIndexKey: a bar is its place, whatever level it shows.
          key={at}
          className="model-step"
          data-chosen={at === level}
          data-testid={`model-level-${each.id}`}
        >
          <input
            type="radio"
            className="model-radio"
            name={group}
            value={each.id}
            checked={at === level}
            disabled={off}
            aria-label={each.label}
            onChange={() => onPick(each.id)}
          />
          <span
            className="model-bar"
            style={{ height: heightOf(at, levels.length, DIAL.low, DIAL.high) }}
          >
            <Light lit={lit} at={at} />
          </span>
          {named && (
            <span className="model-step-name" aria-hidden="true">
              {each.label}
            </span>
          )}
        </label>
      ))}
    </div>
  );
}
