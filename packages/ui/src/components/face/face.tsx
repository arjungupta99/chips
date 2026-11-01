/**
 * A mark from the library drawn as folded paper on a space's lit ground (`library.ts`), filling
 * the avatar it sits in. The phone draws the same table the same way (`MarkFace` in
 * `apps/mobile`); this is the desktop's.
 *
 * Every paint is worked out from the avatar's own `--avatar-color`, in CSS: the shaded side and
 * the deep detail are `color-mix` of the ground into white, and the lit ground's two stops are
 * `--avatar-top` and `--avatar-foot`, which `avatar.css` works out in OKLCH where the browser can
 * and leaves flat where it cannot. So the palette stays in `tokens.css`, a theme that moves a hue
 * moves the face with it, and there is no table of colours here to drift.
 *
 * The mark is drawn in its own 24-point box and the view box is the whole face expressed in it,
 * so the cut paint and the ground behind it are one gradient in one space, to the pixel.
 *
 * An agent's face is the same paper in another outline (`outline`, ADR 0089): the ground is the
 * bitten body of the Chips mark rather than the whole box, the mark is a little smaller and sits
 * a little away from the bite, and nothing is drawn where the bite is.
 */

import { useId } from "react";
import {
  type Layer,
  LIBRARY_MARKS,
  MARK_BOX,
  MARK_SCALE,
  type MarkName,
  type Paint,
} from "./library.js";
import { AGENT_MARK, bittenPath } from "./outline.js";

interface Painted {
  readonly fill: string;
  readonly opacity?: number;
}

/** A paint as CSS, from the ground the avatar is wearing. */
function painted(paint: Paint, cut: string): Painted {
  switch (paint) {
    case "face":
      return { fill: "#fff" };
    case "shade":
      return { fill: "color-mix(in srgb, var(--avatar-color) 26%, #fff)" };
    case "deep":
      return { fill: "color-mix(in srgb, var(--avatar-color) 55%, #fff)" };
    case "far":
      return { fill: "#fff", opacity: 0.45 };
    case "air":
      return { fill: "#fff", opacity: 0.16 };
    case "cut":
      return { fill: cut };
  }
}

/** Whether a layer is left out when the face is small: the halo, and hairlines that go grey. */
function dropped(layer: Layer, small: boolean): boolean {
  if (!small) return false;
  const stroke = layer[2]?.stroke;
  return layer[0] === "air" || (stroke !== undefined && stroke < 1.05);
}

function ClipShape({ clip }: { readonly clip: NonNullable<NonNullable<Layer[2]>["clip"]> }) {
  if (clip[0] === "right") return <rect x={clip[1]} y={-20} width={60} height={70} />;
  if (clip[0] === "path") return <path d={clip[1]} />;
  // Everything past the diagonal x + y = n: the side of the fold turned from the light.
  const n = clip[1];
  return <polygon points={`${n + 20},-20 60,-20 60,60 -20,60 -20,${n + 20}`} />;
}

function LayerShape({ layer, cut }: { readonly layer: Layer; readonly cut: string }) {
  const [paint, d, options] = layer;
  const { fill, opacity } = painted(paint, cut);
  const style =
    options?.stroke === undefined
      ? {
          fill,
          ...(options?.soften === undefined
            ? {}
            : { stroke: fill, strokeWidth: options.soften, strokeLinejoin: "round" as const }),
        }
      : {
          fill: "none",
          stroke: fill,
          strokeWidth: options.stroke,
          strokeLinecap: "round" as const,
          strokeLinejoin: "round" as const,
        };
  return (
    <path
      d={d}
      style={style}
      {...(opacity === undefined ? {} : { opacity })}
      {...(options?.transform === undefined ? {} : { transform: options.transform })}
    />
  );
}

export interface SpaceMarkProps {
  /** Absent, and it is the lit ground alone: a face chosen as a colour, wearing initials. */
  readonly name?: MarkName | undefined;
  /** At chat size the halo and the hairlines are left out; they blur to grey there. */
  readonly small?: boolean;
  /** An agent's outline: the ground is the bitten body, and the mark is kept inside it. */
  readonly outline?: "bite" | undefined;
}

/** The face's box in the mark's own coordinates: a room's whole square, or an agent's body. */
function boxOf(outline: "bite" | undefined): { x: number; y: number; side: number } {
  if (outline === undefined) {
    const side = MARK_BOX / MARK_SCALE;
    return { x: MARK_BOX / 2 - side / 2, y: MARK_BOX / 2 - side / 2, side };
  }
  // The mark sits a little down and to the left of the centre, away from the bite: the box is
  // moved the other way round it.
  const side = MARK_BOX / AGENT_MARK.scale;
  const centre = MARK_BOX / 2 - side / 2;
  return { x: centre - AGENT_MARK.dx * side, y: centre - AGENT_MARK.dy * side, side };
}

export function SpaceMark({ name, small = false, outline }: SpaceMarkProps) {
  // One id per drawing: a document holds many faces, and SVG ids are the document's.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const box = boxOf(outline);
  const { side } = box;
  const body = outline === undefined ? undefined : bittenPath(box.x, box.y, side);
  const drawn: readonly Layer[] = name === undefined ? [] : LIBRARY_MARKS[name];
  // Each layer keyed once, here: its place in the mark is its identity, and names its clip.
  const layers = drawn
    .filter((layer) => !dropped(layer, small))
    .map((layer, at) => ({ layer, key: `${id}c${at}` }));
  const cut = `url(#${id}g)`;
  return (
    <svg
      className="ui-face"
      viewBox={`${box.x} ${box.y} ${side} ${side}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id={`${id}g`}
          x1={0}
          y1={box.y}
          x2={0}
          y2={box.y + side}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset={0} style={{ stopColor: "var(--avatar-top)" }} />
          <stop offset={1} style={{ stopColor: "var(--avatar-foot)" }} />
        </linearGradient>
        {body === undefined ? null : (
          <clipPath id={`${id}b`}>
            <path d={body} />
          </clipPath>
        )}
        {layers.map(({ layer, key }) =>
          layer[2]?.clip === undefined ? null : (
            <clipPath key={key} id={key}>
              <ClipShape clip={layer[2].clip} />
            </clipPath>
          ),
        )}
      </defs>
      {body === undefined ? (
        <rect x={box.x} y={box.y} width={side} height={side} style={{ fill: cut }} />
      ) : (
        <path d={body} style={{ fill: cut }} />
      )}
      <g {...(body === undefined ? {} : { clipPath: `url(#${id}b)` })}>
        {layers.map(({ layer, key }) => (
          <g key={key} {...(layer[2]?.clip === undefined ? {} : { clipPath: `url(#${key})` })}>
            <LayerShape layer={layer} cut={cut} />
          </g>
        ))}
      </g>
    </svg>
  );
}
