/**
 * The mark: a chip, a rounded square with round pins on the sides and one bite out of the corner.
 * It works at 16 pixels and in gold on ink (blueprint, Brand). Decorative unless given a label.
 *
 * Drawn from the outline (`../face/outline.ts`, ADR 0096), the same numbers an agent's face and the
 * app icons are drawn from, in a 24 box with the pins standing inside it. The pins are behind the
 * body, so each tucks under it with no seam. The body is lit from above as an agent's face is, a
 * little lighter at the top and deeper at the foot, at half an agent's light (`mark.css`).
 *
 * `state` is the mark standing for a harness rather than for the product, which is what the room
 * draws beside a turn's work (`apps/web/src/app/TaskBubble.tsx`, and the phone's own copy in
 * `apps/mobile/src/ui/ChipPulse.tsx`): *working* lights its pins one after another round the
 * circuit, *done* stands it down in grey. Without one it is the mark at rest, its pins a little dim
 * (the outline's `PIN_REST.mark`, handed to the stylesheet as `--pin-rest`).
 *
 * Two more are the connection's, as the phone's mark wears them (ADR 0131): *failed* is the mark
 * still, in red, for a server that cannot be reached, and *back* is every pin lit on a green body,
 * for the beat after it is reached again.
 *
 * *blank* is an agent's face with nobody in it yet: the quiet ground, its pins in the ink, lit in
 * turn. The Agents page stands rows of them while its first list is on its way, each a `delay`
 * behind the one above, so the light runs down the list (as the phone's `Arriving` does).
 */

import { type CSSProperties, useId } from "react";
import "./mark.css";
import { BODY_WITH_PINS, bittenPath, PIN_REST, PIN_STEP_MS, pinsOf } from "../face/outline.js";

export interface ChipMarkProps {
  readonly size?: number;
  readonly label?: string;
  readonly className?: string;
  /**
   * What the mark is saying, when it is saying anything: work going on, or work over; for the
   * connection, a server that cannot be reached, or one reached again.
   */
  readonly state?: "working" | "done" | "failed" | "back" | "blank" | undefined;
  /** How long the light waits before its first round, in ms: a row's place down a list. */
  readonly delay?: number | undefined;
}

const BOX = 24;
const SIDE = BOX * BODY_WITH_PINS;
const AT = (BOX - SIDE) / 2;
const BODY = bittenPath(AT, AT, SIDE);
const round = (value: number) => Math.round(value * 100) / 100;
/** The pins in the order the light goes round: clockwise from the top. */
const PINS = pinsOf(SIDE).map((pin) => ({
  key: pin.key,
  x: round(pin.x + AT),
  y: round(pin.y + AT),
  w: round(pin.w),
  h: round(pin.h),
  r: round(Math.min(pin.w, pin.h) / 2),
}));

const REST = { "--pin-rest": PIN_REST.mark } as CSSProperties;

export function ChipMark({ size = 24, label, className, state, delay = 0 }: ChipMarkProps) {
  const named = label !== undefined;
  // One id per drawing: a document holds many marks, and SVG ids are the document's.
  const id = `${useId().replace(/[^a-zA-Z0-9_-]/g, "")}lit`;
  return (
    <svg
      className={className === undefined ? "ui-mark" : `ui-mark ${className}`}
      data-state={state}
      width={size}
      height={size}
      viewBox={`0 0 ${BOX} ${BOX}`}
      role={named ? "img" : undefined}
      aria-label={label}
      aria-hidden={named ? undefined : true}
      focusable="false"
    >
      <g className="ui-mark__pins" style={REST}>
        {PINS.map((pin, index) => (
          <rect
            key={pin.key}
            className="ui-mark__pin"
            x={pin.x}
            y={pin.y}
            width={pin.w}
            height={pin.h}
            rx={pin.r}
            style={{ animationDelay: `${delay + index * PIN_STEP_MS}ms` }}
          />
        ))}
      </g>
      <defs>
        <linearGradient id={id} x1={0} y1={AT} x2={0} y2={AT + SIDE} gradientUnits="userSpaceOnUse">
          <stop className="ui-mark__top" offset={0} />
          <stop className="ui-mark__foot" offset={1} />
        </linearGradient>
      </defs>
      <path className="ui-mark__body" d={BODY} fill={`url(#${id})`} />
    </svg>
  );
}
