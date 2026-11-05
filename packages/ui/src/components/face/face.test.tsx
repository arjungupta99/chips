import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpaceMark } from "./face.js";

/** Every paint a drawn mark uses: its fills and strokes, as its paths say them. */
function paints(container: HTMLElement): string[] {
  return [...container.querySelectorAll("path, rect")].flatMap((shape) => {
    const style = (shape as SVGElement).style;
    return [style.fill, style.stroke].filter((each) => each !== "" && each !== "none");
  });
}

describe("SpaceMark", () => {
  it("draws a mark as paper on its lit ground: white, the ground mixed into white, the gradient", () => {
    const { container } = render(<SpaceMark name="chip" />);
    const used = paints(container);
    expect(used.some((each) => each.startsWith("url("))).toBe(true);
    expect(used.some((each) => each.includes("var(--avatar-color)"))).toBe(true);
    expect(used.some((each) => each.includes("--mark-"))).toBe(false);
  });

  it("draws a mark not chosen in ink on a neutral cell, with no ground of its own (ADR 0272)", () => {
    const { container } = render(<SpaceMark name="chip" cell />);
    const used = paints(container);
    expect(used.length).toBeGreaterThan(0);
    expect(used.every((each) => each.includes("var(--mark-"))).toBe(true);
    expect(container.querySelector("rect")?.style.fill).toBe("var(--mark-cell)");
  });
});
