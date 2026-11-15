import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BODY_WITH_PINS } from "../face/outline.js";
import { ChipMark } from "./mark.js";

describe("ChipMark", () => {
  it("is decoration by default", () => {
    const { container } = render(<ChipMark />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("holds a blank face's light back by its delay, each pin a step behind the last", () => {
    // The Agents page's blank rows: each row's light a little behind the row above.
    const { container } = render(<ChipMark state="blank" delay={280} />);
    expect(container.querySelector("svg")?.getAttribute("data-state")).toBe("blank");
    const delays = [...container.querySelectorAll<SVGRectElement>(".ui-mark__pin")].map(
      (pin) => pin.style.animationDelay,
    );
    expect(delays[0]).toBe("280ms");
    expect(delays[1]).toBe("430ms");
  });

  it("rests its pins a little dim, as the outline says", () => {
    const { container } = render(<ChipMark />);
    const pins = container.querySelector<SVGGElement>(".ui-mark__pins");
    expect(pins?.style.getPropertyValue("--pin-rest")).toBe("0.55");
    expect(pins?.children).toHaveLength(10);
  });

  it("lights its body from above with a gradient of its own, down the body's square", () => {
    const { container } = render(
      <>
        <ChipMark />
        <ChipMark />
      </>,
    );
    const fills = [...container.querySelectorAll(".ui-mark__body")].map((body) =>
      body.getAttribute("fill"),
    );
    const ids = [...container.querySelectorAll("linearGradient")].map((g) => g.id);
    expect(fills).toEqual(ids.map((id) => `url(#${id})`));
    expect(new Set(ids).size).toBe(2);
    const gradient = container.querySelector("linearGradient");
    const side = 24 * BODY_WITH_PINS;
    expect(Number(gradient?.getAttribute("y1"))).toBeCloseTo((24 - side) / 2);
    expect(Number(gradient?.getAttribute("y2"))).toBeCloseTo((24 + side) / 2);
    expect([...(gradient?.children ?? [])].map((stop) => stop.getAttribute("class"))).toEqual([
      "ui-mark__top",
      "ui-mark__foot",
    ]);
  });

  it("is an image when it stands for the product", () => {
    render(<ChipMark label="Chips" size={16} />);
    const mark = screen.getByRole("img", { name: "Chips" });
    expect(mark.getAttribute("width")).toBe("16");
  });

  it("wears its own red and green for the connection, its pins a shade of the chip's colour", () => {
    // ADR 0131's addendum of 12 November 2026, as the phone's `connectionPaint` does.
    // From this file's own path: Vite rewrites a URL built on it, in a component's test, to its server's.
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "mark.css"), "utf8");
    const rule = (selector: string) => {
      const at = css.indexOf(`${selector} {`);
      return at === -1 ? "" : css.slice(at, css.indexOf("}", at));
    };
    expect(rule('.ui-mark[data-state="failed"]')).toContain("--mark-body: var(--mark-red);");
    expect(rule('.ui-mark[data-state="failed"] .ui-mark__pins')).toContain(
      "fill: var(--mark-red-pin);",
    );
    expect(rule('.ui-mark[data-state="back"]')).toContain("--mark-body: var(--mark-green);");
    expect(rule('.ui-mark[data-state="back"] .ui-mark__pins')).toContain(
      "fill: var(--mark-green-pin);",
    );
    expect(rule('.ui-mark:is([data-state="failed"], [data-state="back"]) .ui-mark__pin')).toContain(
      "opacity: 1;",
    );
    expect(css).not.toMatch(/var\(--(red|green)\)/);
  });
});
