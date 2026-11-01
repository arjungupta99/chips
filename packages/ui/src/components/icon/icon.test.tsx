import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ICON_NAMES, Icon } from "./icon.js";

describe("Icon", () => {
  it("is decoration unless it is given a name", () => {
    const { container } = render(<Icon name="mail" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("role")).toBeNull();
  });

  it("becomes an image with the name it is given", () => {
    render(<Icon name="clip" label="Attach a file" />);
    expect(screen.getByRole("img", { name: "Attach a file" })).toBeTruthy();
  });

  it("draws every name in the set", () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      expect(container.querySelectorAll("path").length, name).toBeGreaterThan(0);
      expect(container.querySelector("svg")?.getAttribute("data-icon")).toBe(name);
      unmount();
    }
  });

  it("sizes in pixels", () => {
    const { container } = render(<Icon name="up" size={12} />);
    expect(container.querySelector("svg")?.getAttribute("width")).toBe("12");
  });
});
