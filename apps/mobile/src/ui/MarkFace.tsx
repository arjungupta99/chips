/**
 * A mark from the library, drawn as folded paper (`marks.ts`): on a room's lit ground, filling the
 * face it is in, or in ink tones on a neutral cell, which is how the picker shows the marks not
 * yet chosen — so the grid already shows the fold before anything is picked.
 *
 * The mark is drawn in its own 24-point coordinates, and the view box is the whole face expressed
 * in them, rather than the mark being scaled into the face by a transform. That keeps the ground
 * and the cut paint in one coordinate space: a hole cut through the paper shows the gradient that
 * is behind it to the pixel, where a gradient mapped through a transform is at the renderer's
 * mercy about which space its stops are in.
 *
 * An agent's face is the same paper in another outline (`outline`, ADR 0089): the ground is the
 * bitten body of the Chips mark rather than the whole box, the mark is a little smaller and sits
 * a little away from the bite, and nothing is drawn where the bite is.
 *
 * The ground is painted in this phone's face theme here (ADR 0176): Soothing as it was handed in,
 * or its Bright sister. The paper stays white in both.
 *
 * Decoration only: the face it sits in already says the room's name.
 */

import { useId } from "react";
import {
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
  Svg,
} from "react-native-svg";
import { useFacePaint } from "./faceTheme";
import { litGround, mixHex } from "./lit";
import {
  type Layer,
  LIBRARY_MARKS,
  MARK_BOX,
  MARK_SCALE,
  type MarkName,
  type Paint,
  SMALL_FACE,
} from "./marks";
import { AGENT_MARK, bittenPath } from "./outline";

/** Where a mark is drawn: on a room's ground, or in ink on a neutral cell. */
export type MarkOn =
  | { readonly kind: "ground"; readonly ground: string }
  | { readonly kind: "cell"; readonly ink: string; readonly cell: string };

interface Painted {
  readonly colour: string;
  readonly opacity?: number | undefined;
}

/** A paint on a coloured ground: white and the ground, in the proportions the library names. */
function onGround(paint: Paint, ground: string, cut: string): Painted {
  switch (paint) {
    case "face":
      return { colour: "#ffffff" };
    case "shade":
      return { colour: mixHex("#ffffff", ground, 0.26) };
    case "deep":
      return { colour: mixHex("#ffffff", ground, 0.55) };
    case "far":
      return { colour: "#ffffff", opacity: 0.45 };
    case "air":
      return { colour: "#ffffff", opacity: 0.16 };
    case "cut":
      return { colour: cut };
  }
}

/** The same paints on a neutral cell: the ink stands in for white, the cell for the ground. */
function onCell(paint: Paint, ink: string, cell: string): Painted {
  switch (paint) {
    case "face":
      return { colour: ink };
    case "shade":
      return { colour: mixHex(cell, ink, 0.62) };
    case "deep":
      return { colour: mixHex(cell, ink, 0.4) };
    case "far":
      return { colour: ink, opacity: 0.4 };
    case "air":
      return { colour: ink, opacity: 0.1 };
    case "cut":
      return { colour: cell };
  }
}

/** The clip a layer names, as a shape in the mark's box. */
function ClipShape({ clip }: { readonly clip: NonNullable<NonNullable<Layer[2]>["clip"]> }) {
  if (clip[0] === "right") return <Rect x={clip[1]} y={-20} width={60} height={70} />;
  if (clip[0] === "path") return <Path d={clip[1]} />;
  // Everything past the diagonal x + y = n: the side of the fold turned from the light.
  const n = clip[1];
  return <Polygon points={`${n + 20},-20 60,-20 60,60 -20,60 -20,${n + 20}`} />;
}

function LayerShape({ layer, painted }: { readonly layer: Layer; readonly painted: Painted }) {
  const [, d, options] = layer;
  const common = {
    d,
    ...(painted.opacity === undefined ? {} : { opacity: painted.opacity }),
    ...(options?.transform === undefined ? {} : { transform: options.transform }),
  };
  if (options?.stroke !== undefined)
    return (
      <Path
        {...common}
        fill="none"
        stroke={painted.colour}
        strokeWidth={options.stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  return (
    <Path
      {...common}
      fill={painted.colour}
      {...(options?.soften === undefined
        ? {}
        : {
            stroke: painted.colour,
            strokeWidth: options.soften,
            strokeLinejoin: "round" as const,
          })}
    />
  );
}

/** Whether a layer is left out at this size: the halo, and hairlines that would blur to grey. */
function dropped(layer: Layer, small: boolean): boolean {
  if (!small) return false;
  const stroke = layer[2]?.stroke;
  return layer[0] === "air" || (stroke !== undefined && stroke < 1.05);
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

/** The lit ground: the whole box for a room, the bitten body for an agent, nothing on a cell. */
function Ground({
  lit,
  body,
  box,
  fill,
}: {
  readonly lit: boolean;
  readonly body: string | undefined;
  readonly box: { readonly x: number; readonly y: number; readonly side: number };
  readonly fill: string;
}) {
  if (!lit) return null;
  if (body !== undefined) return <Path d={body} fill={fill} />;
  return <Rect x={box.x} y={box.y} width={box.side} height={box.side} fill={fill} />;
}

export function MarkFace({
  name,
  size,
  on,
  outline,
}: {
  /** Absent, and it is the lit ground alone: a face chosen as a colour, wearing initials. */
  readonly name?: MarkName | undefined;
  /** The side of the face or cell the mark fills, in points. */
  readonly size: number;
  readonly on: MarkOn;
  /** An agent's outline: the ground is the bitten body, and the mark is kept inside it. */
  readonly outline?: "bite" | undefined;
}) {
  // One id per drawing: the web target renders real SVG, where ids are the document's.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const box = boxOf(outline);
  const { side } = box;
  const body = outline === undefined ? undefined : bittenPath(box.x, box.y, side);
  const small = size < SMALL_FACE;
  const drawn: readonly Layer[] = name === undefined ? [] : LIBRARY_MARKS[name];
  // Each layer keyed once, here: its place in the mark is its identity, and names its clip.
  const layers = drawn
    .filter((layer) => !dropped(layer, small))
    .map((layer, at) => ({ layer, key: `${id}c${at}` }));
  const faces = useFacePaint();
  const ground = on.kind === "ground" ? faces.ground(on.ground) : undefined;
  const lit = ground === undefined ? undefined : litGround(ground);
  const paint = (layer: Layer) =>
    on.kind === "ground"
      ? onGround(layer[0], ground ?? on.ground, `url(#${id}g)`)
      : onCell(layer[0], on.ink, on.cell);
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`${box.x} ${box.y} ${side} ${side}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        {lit === undefined ? null : (
          <LinearGradient
            id={`${id}g`}
            x1={0}
            y1={box.y}
            x2={0}
            y2={box.y + side}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset={0} stopColor={lit.top} />
            <Stop offset={1} stopColor={lit.foot} />
          </LinearGradient>
        )}
        {body === undefined ? null : (
          <ClipPath id={`${id}b`}>
            <Path d={body} />
          </ClipPath>
        )}
        {layers.map(({ layer, key }) =>
          layer[2]?.clip === undefined ? null : (
            <ClipPath key={key} id={key}>
              <ClipShape clip={layer[2].clip} />
            </ClipPath>
          ),
        )}
      </Defs>
      <Ground lit={lit !== undefined} body={body} box={box} fill={`url(#${id}g)`} />
      <G {...(body === undefined ? {} : { clipPath: `url(#${id}b)` })}>
        {layers.map(({ layer, key }) => (
          <G key={key} {...(layer[2]?.clip === undefined ? {} : { clipPath: `url(#${key})` })}>
            <LayerShape layer={layer} painted={paint(layer)} />
          </G>
        ))}
      </G>
    </Svg>
  );
}
