import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AutonomyDial } from "./dial.js";

describe("AutonomyDial", () => {
  it("reads as the level's name when it cannot be turned", () => {
    render(<AutonomyDial value={2} />);
    const dial = screen.getByRole("img", { name: "L2 · Ask when it matters" });
    expect(dial.querySelectorAll("[data-on='true']")).toHaveLength(3);
  });

  it("is four radios when it can be turned, one checked", () => {
    render(<AutonomyDial value={1} onChange={() => undefined} />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(4);
    expect(screen.getByRole("radio", { name: "L1 · Ask first" })).toHaveProperty("checked", true);
    expect(screen.getByRole("group", { name: "Autonomy" })).toBeTruthy();
    expect(screen.getByText(/Reads are free/)).toBeTruthy();
  });

  it("reports the level a person chooses", () => {
    const onChange = vi.fn();
    render(<AutonomyDial value={1} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "L3 · Autonomous, report back" }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("will not go above the workspace cap", () => {
    const onChange = vi.fn();
    render(<AutonomyDial value={1} max={2} onChange={onChange} />);
    // Disabled is what keeps a browser from choosing it; jsdom still fires the event, so
    // the assertion is on the attribute, not on the click.
    const top = screen.getByRole("radio", { name: "L3 · Autonomous, report back" });
    expect(top).toHaveProperty("disabled", true);
    expect(top.closest("label")?.getAttribute("data-capped")).toBe("true");
    const within = screen.getByRole("radio", { name: "L2 · Ask when it matters" });
    expect(within).toHaveProperty("disabled", false);
    fireEvent.click(within);
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("can be told to hold still", () => {
    render(<AutonomyDial value={3} onChange={() => undefined} readOnly />);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByRole("img", { name: "L3 · Autonomous, report back" })).toBeTruthy();
  });
});
