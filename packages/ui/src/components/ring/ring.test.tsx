import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContextRing } from "./ring.js";

describe("ContextRing", () => {
  it("is a meter that says how full the context is", () => {
    render(<ContextRing percent={41} />);
    const meter = screen.getByRole("meter", { name: "Context 41% full" });
    expect(meter).toHaveProperty("value", 41);
    expect(meter).toHaveProperty("max", 100);
    expect(meter.parentElement?.getAttribute("data-tone")).toBe("neutral");
  });

  it("turns amber at 70 and red at 90", () => {
    render(<ContextRing percent={78} />);
    expect(screen.getByRole("meter").parentElement?.getAttribute("data-tone")).toBe("warn");
  });

  it("clamps and rounds what it is given", () => {
    render(<ContextRing percent={120.6} />);
    const meter = screen.getByRole("meter");
    expect(meter).toHaveProperty("value", 100);
    expect(meter.parentElement?.getAttribute("data-tone")).toBe("hot");
  });

  it("shows the number inside when large", () => {
    render(<ContextRing percent={93} size="lg" />);
    expect(
      screen.getByRole("meter").parentElement?.querySelector(".ui-ring__value")?.textContent,
    ).toBe("93%");
  });

  it("takes a label of its own", () => {
    render(<ContextRing percent={23} label="Ledger's context window, 23% full" />);
    expect(screen.getByRole("meter", { name: "Ledger's context window, 23% full" })).toBeTruthy();
  });
});
