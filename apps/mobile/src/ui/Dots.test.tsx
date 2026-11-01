/**
 * The three dots: breathing in the chain row, and lit in the thinking bubble (ADR 0126), where the
 * light runs across them in the colour of the face beside them and a dot grows as it lights.
 */

import { render, screen } from "@testing-library/react-native";
import { type StyleProp, StyleSheet, type ViewStyle } from "react-native";
import { Dots } from "./Dots";

const hidden = { includeHiddenElements: true };

/** A drawn dot's style, flattened: a child here is always a view, never a string. */
function styleOf(node: unknown): ViewStyle {
  return StyleSheet.flatten((node as { props: { style: StyleProp<ViewStyle> } }).props.style);
}

describe("the dots", () => {
  it("are three, in the colour given, on a line as tall as a message's by default", async () => {
    await render(<Dots colour="#14879a" testID="dots" />);
    const dots = screen.getByTestId("dots", hidden);
    expect(StyleSheet.flatten(dots.props["style"])["height"]).toBe(22);
    expect(dots.children).toHaveLength(3);
    for (const dot of dots.children) expect(dot).toHaveStyle({ backgroundColor: "#14879a" });
  });

  it("stand on the line they are given, and grow as they light when lit", async () => {
    await render(<Dots colour="#7b44e0" lit line={19} testID="dots" />);
    const dots = screen.getByTestId("dots", hidden);
    expect(StyleSheet.flatten(dots.props["style"])["height"]).toBe(19);
    for (const dot of dots.children) {
      expect(styleOf(dot).transform).toBeDefined();
    }
  });

  it("rest unlit and still while the far side is not heard from", async () => {
    await render(<Dots colour="#7b44e0" lit resting testID="dots" />);
    for (const dot of screen.getByTestId("dots", hidden).children) {
      expect(styleOf(dot)).toEqual(
        expect.objectContaining({ opacity: 0.28, transform: undefined }),
      );
    }
  });

  it("only breathe in the chain row: nothing grows there", async () => {
    await render(<Dots colour="#8a8d97" testID="dots" />);
    for (const dot of screen.getByTestId("dots", hidden).children) {
      expect(styleOf(dot).transform).toBeUndefined();
    }
  });
});
