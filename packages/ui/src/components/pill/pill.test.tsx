import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dot, Pill, StatusPill } from "./pill.js";

describe("Pill", () => {
  it("is a word in a colour", () => {
    render(<Pill tone="green">Done</Pill>);
    const pill = screen.getByText("Done");
    expect(pill.getAttribute("data-tone")).toBe("green");
    expect(pill.querySelector(".ui-dot")).toBeNull();
  });

  it("carries a dot when asked", () => {
    render(
      <Pill tone="amber" dot="solid">
        3 need you
      </Pill>,
    );
    const dot = screen.getByText("3 need you").querySelector(".ui-dot");
    expect(dot?.getAttribute("data-tone")).toBe("amber");
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("StatusPill", () => {
  it("says the state with its colour and its dot", () => {
    render(<StatusPill status="waiting" />);
    const pill = screen.getByText("Waiting on you");
    expect(pill.getAttribute("data-tone")).toBe("amber");
    expect(pill.getAttribute("data-status")).toBe("waiting");
    expect(pill.querySelector(".ui-dot")?.getAttribute("data-dot")).toBe("solid");
  });

  it("pulses and carries the verb phrase while working", () => {
    render(<StatusPill status="working" verbPhrase="Drafting the reply…" />);
    const pill = screen.getByText("Working · Drafting the reply…");
    expect(pill.querySelector(".ui-dot")?.getAttribute("data-dot")).toBe("pulse");
  });

  it("is hollow while thinking", () => {
    render(<StatusPill status="thinking" />);
    expect(screen.getByText("Thinking").querySelector(".ui-dot")?.getAttribute("data-dot")).toBe(
      "hollow",
    );
  });
});

describe("Dot", () => {
  it("is hidden from assistive technology: the word beside it is the state", () => {
    const { container } = render(<Dot tone="red" />);
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });
});
