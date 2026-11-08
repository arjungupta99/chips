/**
 * What a queued turn's message is drawn as. The reading itself is core's
 * (`packages/core/src/taskWords.test.ts`); this is what the room does with what it read.
 */

import { readTaskBubble } from "@chipschat/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TaskBubble } from "./TaskBubble.tsx";

function drawn(text: string) {
  const task = readTaskBubble(text);
  if (task === undefined) throw new Error(`not a task bubble: ${text}`);
  return render(<TaskBubble task={task} colour="#14879a" />);
}

describe("a queued turn's bubble", () => {
  it("reads the runtime's prefix off the call and draws the markers rather than saying them", () => {
    const { container } = drawn(
      "💭 Preparing tool call for app start\n▸ local-dev__serve · stop\n▸ show_app",
    );
    expect(screen.getByText("Preparing tool call for app start")).toBeTruthy();
    expect(screen.getByText("serve · stop")).toBeTruthy();
    expect(screen.getByText("show app")).toBeTruthy();
    expect(container.textContent).not.toContain("local-dev__");
    expect(container.textContent).not.toContain("▸");
    expect(container.textContent).not.toContain("💭");
  });

  it("wears lit dots in its face's colour while the turn works, and none once it is over", () => {
    const { container } = drawn("💭 Working…\n▸ show_app");
    // ADR 0126: the dots, as the thinking bubble wears them, where the gold mark was.
    const dots = container.querySelector(".lit-dots") as HTMLElement;
    expect(dots.style.getPropertyValue("--dots")).toBe("#14879a");
    expect(container.querySelector(".ui-mark")).toBeNull();
    // The dots beside it say the work is going on; the word need not say it twice.
    expect(screen.getByText("Working")).toBeTruthy();

    const done = drawn("💭 Worked 25s · 2 steps");
    // Three dots standing still in a receipt read as words left unsaid.
    expect(done.container.querySelector(".lit-dots")).toBeNull();
    expect(screen.getByText("Worked 25s · 2 steps")).toBeTruthy();
    expect(done.container.querySelector(".task-steps")).toBeNull();
  });

  it("draws a call by its kind, and lights the one in hand in its face's colour", () => {
    const { container } = drawn(
      "💭 Checking the hours\n▸ web_search · Tin How Temple hours\n▸ browser · https://www.chinatownsf.com/visit/",
    );
    const pills = [...container.querySelectorAll(".call-pill")];
    expect(pills.map((pill) => pill.getAttribute("data-kind"))).toEqual(["search", "web"]);
    expect(pills.map((pill) => pill.textContent)).toEqual([
      "Tin How Temple hours",
      "chinatownsf.com/visit",
    ]);
    expect((container.querySelector(".task") as HTMLElement).style.getPropertyValue("--face")).toBe(
      "#14879a",
    );
  });

  it("hangs three calls and no more, and lights the one in hand", () => {
    const { container } = drawn("💭 Working…\n▸ one\n▸ two\n▸ three");
    const steps = [...container.querySelectorAll(".task-step")];
    expect(steps.map((step) => step.textContent)).toEqual(["one", "two", "three"]);
    expect(steps.at(-1)?.querySelector(".task-dot")).toBeTruthy();
  });

  it("keeps the question a queued Space asked above the work", () => {
    drawn("❓ Engineer asks: Deny and reopen?\n💭 Worked 40s · 1 step");
    expect(screen.getByText("❓ Engineer asks: Deny and reopen?")).toBeTruthy();
  });

  it("stands still when it is drawn, and rises and lights only when an edit changes what it says", () => {
    const at = (text: string) => {
      const task = readTaskBubble(text);
      if (task === undefined) throw new Error(`not a task bubble: ${text}`);
      return <TaskBubble task={task} colour="#14879a" />;
    };
    // A room drawn anew, as on switching back to it: nothing crosses a bubble already there.
    const { container, rerender } = render(at("💭 Worked 25s · 2 steps"));
    expect(container.querySelector(".task-sheen")).toBeNull();
    expect(container.querySelector(".task-words")?.hasAttribute("data-edited")).toBe(false);

    const working = render(at("💭 Checking the hours\n▸ web_search · hours"));
    expect(working.container.querySelector(".task-sheen")).toBeNull();
    // The message edited while it is seen: the words rise and the light crosses on that beat.
    working.rerender(at("💭 Reading the page\n▸ web_search · hours\n▸ browser · https://a.b/c"));
    expect(working.container.querySelector(".task-sheen")).not.toBeNull();
    expect(working.container.querySelector(".task-words")?.getAttribute("data-edited")).toBe(
      "true",
    );
    // An edit that says the same thing moves nothing new.
    rerender(at("💭 Worked 25s · 2 steps"));
    expect(container.querySelector(".task-sheen")).toBeNull();
  });
});
