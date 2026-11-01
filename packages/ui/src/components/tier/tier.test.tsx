import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TierBadge } from "./tier.js";

describe("TierBadge", () => {
  it("names the three tiers of attention in their colours", () => {
    render(
      <>
        <TierBadge tier="decide" />
        <TierBadge tier="review" />
        <TierBadge tier="fyi" />
      </>,
    );
    expect(screen.getByText("Decide now").getAttribute("data-tone")).toBe("amber");
    expect(screen.getByText("Review today").getAttribute("data-tone")).toBe("blue");
    expect(screen.getByText("FYI").getAttribute("data-tone")).toBe("neutral");
  });

  it("explains itself on hover", () => {
    render(<TierBadge tier="fyi" />);
    expect(screen.getByText("FYI").getAttribute("title")).toContain("Checkpoints");
  });
});
