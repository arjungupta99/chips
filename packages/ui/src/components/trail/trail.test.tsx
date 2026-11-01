import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FaceGroup, Trail, trailLabel } from "./trail.js";

const ARJUN = { name: "Arjun", kind: "person" as const };
const SCOUT = { name: "Scout", kind: "harness" as const };
const LEDGER = { name: "Ledger", kind: "harness" as const };

describe("Trail", () => {
  it("draws each hop's face, arrows between them, and says it in words", () => {
    render(<Trail hops={[ARJUN, SCOUT, LEDGER]} />);
    const trail = screen.getByRole("list", { name: "Trail: Arjun → Scout → Ledger" });
    const hops = within(trail).getAllByRole("listitem");
    expect(hops).toHaveLength(3);
    expect(
      within(trail)
        .getAllByRole("img")
        .map((face) => face.getAttribute("aria-label")),
    ).toEqual(["Arjun", "Scout", "Ledger"]);
    // No arrow before the first hop, one before each after it.
    expect(trail.querySelectorAll(".ui-trail__arrow")).toHaveLength(2);
    expect(hops[0]?.querySelector(".ui-trail__arrow")).toBeNull();
  });

  it("draws a hop of several as their faces overlapped, one hop", () => {
    render(<Trail hops={[ARJUN, [SCOUT, LEDGER]]} />);
    const trail = screen.getByRole("list", { name: "Trail: Arjun → Scout and Ledger" });
    const hops = within(trail).getAllByRole("listitem");
    expect(hops).toHaveLength(2);
    const group = hops[1]?.querySelector(".ui-faces");
    expect(group?.getAttribute("data-many")).toBe("true");
    expect(group?.querySelectorAll(".ui-avatar")).toHaveLength(2);
    expect(hops[0]?.querySelector(".ui-faces")?.getAttribute("data-many")).toBeNull();
  });

  it("takes the name it is given, and draws small faces for a line of words", () => {
    render(<Trail hops={[ARJUN, SCOUT]} label="Route: Arjun → Scout" small />);
    const trail = screen.getByRole("list", { name: "Route: Arjun → Scout" });
    expect(trail.getAttribute("data-size")).toBe("small");
    expect(trail.querySelector(".ui-faces")?.getAttribute("data-size")).toBe("small");
  });

  it("starts at an arrow when it goes onward from what it sits beside", () => {
    const { container } = render(<Trail hops={[[SCOUT, LEDGER]]} onward label="Route" />);
    expect(container.querySelectorAll(".ui-trail__arrow")).toHaveLength(1);
    expect(container.querySelector(".ui-trail__hop")?.firstElementChild?.className).toBe(
      "ui-trail__arrow",
    );
  });

  it("writes a trail as arrows, and a group as a list of names", () => {
    expect(trailLabel([ARJUN, SCOUT, LEDGER])).toBe("Arjun → Scout → Ledger");
    expect(trailLabel([ARJUN, [SCOUT, LEDGER]])).toBe("Arjun → Scout and Ledger");
    expect(trailLabel([ARJUN, [SCOUT, LEDGER, { name: "Hermes", kind: "harness" }]])).toBe(
      "Arjun → Scout, Ledger and Hermes",
    );
  });
});

describe("FaceGroup", () => {
  it("is one face alone, and several overlapped, in a span a button may hold", () => {
    const { container } = render(
      <button type="button">
        <FaceGroup faces={[SCOUT, LEDGER]} small />
      </button>,
    );
    const faces = container.querySelector("button > span.ui-faces");
    expect(faces?.getAttribute("data-many")).toBe("true");
    expect(within(screen.getByRole("button")).getAllByRole("img")).toHaveLength(2);
  });
});
