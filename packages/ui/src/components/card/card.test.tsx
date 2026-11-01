import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./card.js";

describe("Card", () => {
  it("is a plain surface by default", () => {
    render(<Card>Hello</Card>);
    const card = screen.getByText("Hello");
    expect(card.tagName).toBe("DIV");
    expect(card.getAttribute("data-tone")).toBe("default");
    expect(card.getAttribute("data-padding")).toBe("md");
  });

  it("can be a landmark with a name", () => {
    render(
      <Card as="section" aria-label="Run" tone="ask" padding="none" elevated>
        …
      </Card>,
    );
    const region = screen.getByRole("region", { name: "Run" });
    expect(region.getAttribute("data-tone")).toBe("ask");
    expect(region.getAttribute("data-padding")).toBe("none");
    expect(region.getAttribute("data-elevated")).toBe("true");
  });
});
