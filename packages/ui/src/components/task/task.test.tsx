import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TaskCard } from "./task.js";

const TRAIL = [
  { name: "Arjun", kind: "person" as const },
  { name: "Scout", kind: "harness" as const },
  { name: "Ledger", kind: "harness" as const },
];

describe("TaskCard", () => {
  it("shows the lane from the specialist's side, with the trail", () => {
    render(
      <TaskCard
        trail={TRAIL}
        title="Check the three Northwind quotes against last quarter's prices"
        quote="Are the Northwind quotes in line with last quarter?"
        constraints={["Use the finance warehouse, not the CRM"]}
        deadline="today, 6pm"
        attachments={[{ id: "a", name: "PO-4471.pdf", meta: "212 KB", href: "/att/1" }]}
        openHref="/c/scout"
        openLabel="Open in Scout's chat"
      />,
    );
    expect(screen.getByRole("article", { name: /^Task: Check the three/ })).toBeTruthy();
    expect(screen.getByLabelText("Trail: Arjun → Scout → Ledger")).toBeTruthy();
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(screen.getByText(/Check the three Northwind quotes/)).toBeTruthy();
    expect(screen.getByText(/Are the Northwind quotes/)).toBeTruthy();
    expect(screen.getByText("Use the finance warehouse, not the CRM")).toBeTruthy();
    expect(screen.getByText("Needed by today, 6pm")).toBeTruthy();
    expect(screen.getByRole("link", { name: /PO-4471\.pdf/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open in Scout's chat" }).getAttribute("href")).toBe(
      "/c/scout",
    );
  });

  it("draws a hop that is a room in the face chosen for it", () => {
    render(
      <TaskCard
        trail={[
          { name: "Arjun", kind: "person" },
          { name: "J", kind: "harness", icon: { icon: "wafer", ground: 2 } },
          { name: "the game of life", kind: "harness", icon: { icon: "rocket", ground: 0 } },
        ]}
        title="Why does the glider die?"
      />,
    );
    const [person, lead, here] = screen.getAllByRole("img");
    expect(person?.querySelector(".ui-face path")).toBeNull();
    expect(lead?.getAttribute("style")).toContain("--avatar-color: var(--avatar-3)");
    expect(here?.querySelector(".ui-face path")).not.toBeNull();
  });
});
