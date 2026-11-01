import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SPACE_ICON_GROUNDS } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import { FIELD_MARGIN, FIELD_STOPS } from "../spaces/scrollField";
import {
  AVATAR_HUES,
  CSS_NAMES,
  dark,
  FACE_INK,
  ICON_GROUND_NAMES,
  ICON_GROUND_ROWS,
  ICON_GROUNDS,
  ICON_GROUNDS_BRIGHT,
  LEADING,
  light,
  OUTGOING,
  type Palette,
  RADIUS,
  SPACE,
} from "./tokens";

/**
 * The phone transcribes the design system's tokens rather than importing them, so this is the
 * thing that stops the two drifting: the stylesheet is read, its `:root` and `[data-theme=dark]`
 * blocks are parsed, and every value here is checked against the one there.
 */
const css = readFileSync(
  fileURLToPath(new URL("../../../../packages/ui/src/styles/tokens.css", import.meta.url)),
  "utf8",
);

function block(selector: string): Readonly<Record<string, string>> {
  const at = css.indexOf(`${selector} {`);
  if (at === -1) throw new Error(`no ${selector} block in tokens.css`);
  const body = css.slice(at, css.indexOf("\n}", at));
  const found: Record<string, string> = {};
  for (const [, name, value] of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    if (name !== undefined && value !== undefined) found[name] = value.trim();
  }
  return found;
}

describe("the phone's tokens", () => {
  it("holds the same names in light and dark", () => {
    expect(Object.keys(dark)).toEqual(Object.keys(light));
    expect(Object.keys(CSS_NAMES).sort()).toEqual(Object.keys(light).sort());
  });

  it("matches the design system's light palette", () => {
    const theirs = block(":root");
    for (const [name, css] of Object.entries(CSS_NAMES)) {
      expect(`${name}: ${light[name as keyof Palette]}`).toBe(`${name}: ${theirs[css]}`);
    }
  });

  it("matches the design system's dark palette", () => {
    const theirs = block('[data-theme="dark"]');
    for (const [name, css] of Object.entries(CSS_NAMES)) {
      expect(`${name}: ${dark[name as keyof Palette]}`).toBe(`${name}: ${theirs[css]}`);
    }
  });

  it("keeps the same spacing and the same corners", () => {
    const theirs = block(":root");
    const spacing = [SPACE.xs, SPACE.sm, SPACE.md, SPACE.lg, SPACE.xl, SPACE.xxl];
    expect(spacing.map((step) => `${step}px`)).toEqual(
      [1, 2, 3, 4, 5, 6].map((n) => theirs[`--space-${n}`]),
    );

    const corners: ReadonlyArray<[keyof typeof RADIUS, string]> = [
      ["xs", "--radius-xs"],
      ["sm", "--radius-sm"],
      ["md", "--radius-md"],
      ["lg", "--radius-lg"],
      ["xl", "--radius-xl"],
      ["xxl", "--radius-2xl"],
    ];
    for (const [name, css] of corners)
      expect(`${name}: ${RADIUS[name]}px`).toBe(`${name}: ${theirs[css]}`);
    expect(`${LEADING}`).toBe(theirs["--leading"]);
  });

  it("wears the same eight avatar hues", () => {
    const theirs = block(":root");
    expect([...AVATAR_HUES]).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => theirs[`--avatar-${n}`]));
  });

  it("offers the grounds the desktop draws, as many as the wire takes", () => {
    const theirs = block(":root");
    const beyond = ICON_GROUNDS.slice(AVATAR_HUES.length);
    expect(ICON_GROUNDS).toHaveLength(SPACE_ICON_GROUNDS);
    expect(beyond).toEqual(beyond.map((_, n) => theirs[`--icon-ground-${n + 1}`]));
    expect(theirs[`--icon-ground-${beyond.length + 1}`]).toBeUndefined();
  });

  it("colours your own bubbles with the desktop's field, and its teal and white", () => {
    const theirs = block(":root");
    const at = (where: number) => FIELD_STOPS.find(([stop]) => stop === where)?.[1];
    expect([at(FIELD_MARGIN), at(0.5), at(1 - FIELD_MARGIN)]).toEqual([
      theirs["--mine-top"],
      theirs["--mine-middle"],
      theirs["--mine-foot"],
    ]);
    expect([OUTGOING.ground, OUTGOING.ink]).toEqual([theirs["--mine"], theirs["--mine-ink"]]);
  });
});

describe("the faces' two themes (ADR 0176)", () => {
  /** A face block's grounds in index order, as the phone's tables keep them, and its ink. */
  const faces = (theme: "soothing" | "bright") => {
    const theirs = block(`[data-faces="${theme}"]`);
    const grounds = ICON_GROUNDS.map((_, at) =>
      at < AVATAR_HUES.length
        ? theirs[`--avatar-${at + 1}`]
        : theirs[`--icon-ground-${at - AVATAR_HUES.length + 1}`],
    );
    return { grounds, ink: theirs["--on-avatar"], names: Object.keys(theirs).length };
  };

  it("paints Bright with the phone's Bright grounds and dark letters", () => {
    expect(faces("bright")).toEqual({
      grounds: [...ICON_GROUNDS_BRIGHT],
      ink: FACE_INK.bright,
      names: ICON_GROUNDS.length + 1,
    });
  });

  it("says Soothing as the root does, for a preview held in it", () => {
    const root = block(":root");
    expect(faces("soothing")).toEqual({
      grounds: [...ICON_GROUNDS],
      ink: FACE_INK.soothing,
      names: ICON_GROUNDS.length + 1,
    });
    expect(root["--on-avatar"]).toBe(FACE_INK.soothing);
  });
});

describe("the picker's grounds", () => {
  it("names each one, and lays each out once, nine across", () => {
    expect(ICON_GROUND_NAMES).toHaveLength(ICON_GROUNDS.length);
    expect(new Set(ICON_GROUND_NAMES).size).toBe(ICON_GROUNDS.length);
    for (const row of ICON_GROUND_ROWS) expect(row).toHaveLength(9);
    expect([...ICON_GROUND_ROWS.flat()].sort((a, b) => a - b)).toEqual(
      ICON_GROUNDS.map((_, index) => index),
    );
  });
});
