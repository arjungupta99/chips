import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button.js";

describe("Button", () => {
  it("is a button, not a submit, unless told otherwise", () => {
    render(<Button>Approve</Button>);
    expect(screen.getByRole("button", { name: "Approve" }).getAttribute("type")).toBe("button");
  });

  it("submits when a form needs it to", () => {
    render(<Button type="submit">Pair</Button>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("submit");
  });

  it("does what it is told, and nothing when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Deny
      </Button>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("calls back on a click", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Approve</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("wears its variant and size", () => {
    render(
      <Button variant="primary" size="lg">
        Approve
      </Button>,
    );
    const button = screen.getByRole("button");
    expect(button.getAttribute("data-variant")).toBe("primary");
    expect(button.getAttribute("data-size")).toBe("lg");
  });

  it("carries an icon beside the word, or alone with a name", () => {
    render(<Button icon="pause">Pause</Button>);
    expect(screen.getByRole("button").querySelector("[data-icon='pause']")).toBeTruthy();
    render(<Button icon="clip" iconOnly aria-label="Attach a file" />);
    const alone = screen.getByRole("button", { name: "Attach a file" });
    expect(alone.getAttribute("data-icon-only")).toBe("true");
  });
});
