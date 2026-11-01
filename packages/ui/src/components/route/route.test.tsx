import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RouteCard } from "./route.js";

describe("RouteCard", () => {
  it("shows the lane from the lead's side", () => {
    const { container } = render(
      <RouteCard
        from={{ name: "Scout" }}
        to={{ name: "Ledger", status: "done" }}
        goal="Check the three quotes against last quarter"
        status="done"
        contextPercent={23}
        costUsd={0.03}
        replyPlaceholder="Reply to Ledger…"
      >
        <p>All three are within 2% of Q2.</p>
      </RouteCard>,
    );
    expect(screen.getByText("Routed to Ledger")).toBeTruthy();
    expect(screen.getByText("Check the three quotes against last quarter")).toBeTruthy();
    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.getByRole("meter", { name: "Ledger's context, 23% full" })).toBeTruthy();
    expect(screen.getByText("≈$0.03")).toBeTruthy();
    expect(screen.getByText("All three are within 2% of Q2.")).toBeTruthy();
    expect(screen.getByText("Reply to Ledger…")).toBeTruthy();
    expect(container.querySelector("details")?.hasAttribute("open")).toBe(true);
    expect(screen.getByRole("img", { name: "Ledger, done" })).toBeTruthy();
  });

  it("draws each end in the face chosen for its room, and keeps initials where none was", () => {
    render(
      <RouteCard
        from={{ name: "J", icon: { icon: "wafer", ground: 2 } }}
        to={{ name: "the game of life", status: "working", icon: { icon: "rocket", ground: 0 } }}
        goal="Why does the glider die?"
      />,
    );
    const from = screen.getByRole("img", { name: "J" });
    const to = screen.getByRole("img", { name: "the game of life, working" });
    expect(from.getAttribute("style")).toContain("--avatar-color: var(--avatar-3)");
    expect(to.getAttribute("style")).toContain("--avatar-color: var(--avatar-1)");
    expect(from.querySelector(".ui-face path")).not.toBeNull();
    expect(to.textContent).toBe("");
  });

  it("takes a title for a fan-out", () => {
    render(
      <RouteCard
        from={{ name: "Scout" }}
        to={{ name: "Ledger" }}
        title="Routed to 3 harnesses · 1 done"
        goal="Reconcile"
        open={false}
      />,
    );
    expect(screen.getByText("Routed to 3 harnesses · 1 done")).toBeTruthy();
  });
});
