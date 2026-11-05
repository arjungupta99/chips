/**
 * The app's ghost (ADR 0274): a still copy of a view going, which names nothing, plays and loads
 * nothing, takes no clicks, and is scrolled where the view was.
 */

import { afterEach, describe, expect, it } from "vitest";
import { ghostOf } from "./ghost.ts";

afterEach(() => {
  document.body.replaceChildren();
});

/** A view with a heading, a face drawn with a gradient, a page's frame, and a list scrolled down. */
function view() {
  const page = document.createElement("main");
  page.dataset["testid"] = "room";
  page.innerHTML = `
    <h1 id="title" data-testid="room-title">PO-4471</h1>
    <svg><linearGradient id="face-ground"></linearGradient></svg>
    <iframe class="page-frame" style="border: 0" src="about:blank"></iframe>
    <ul class="list"><li>one</li><li>two</li></ul>`;
  document.body.append(page);
  return page;
}

describe("a ghost", () => {
  it("names nothing a test or a link could find, but a drawing keeps its gradients", () => {
    const { copy } = ghostOf(view());
    expect(copy.hasAttribute("data-testid")).toBe(false);
    expect(copy.querySelector("[data-testid], h1[id]")).toBeNull();
    expect(copy.querySelector("linearGradient")?.id).toBe("face-ground");
    expect(copy.textContent).toContain("PO-4471");
  });

  it("is a picture nobody can reach", () => {
    const { copy } = ghostOf(view());
    expect(copy.classList.contains("ghost")).toBe(true);
    expect(copy.getAttribute("aria-hidden")).toBe("true");
    expect(copy.inert).toBe(true);
  });

  it("draws a page's frame as an empty box where it stood, which loads nothing", () => {
    const { copy } = ghostOf(view());
    expect(copy.querySelector("iframe")).toBeNull();
    const box = copy.querySelector(".page-frame");
    expect(box?.tagName).toBe("DIV");
    expect(box?.getAttribute("style")).toContain("border: 0");
  });

  it("keeps the names its caller says to take off too", () => {
    const page = view();
    page.dataset["view"] = "people";
    page.hidden = true;
    const { copy } = ghostOf(page, () => undefined, ["data-view", "hidden"]);
    expect(copy.hasAttribute("data-view")).toBe(false);
    expect(copy.hidden).toBe(false);
  });

  it("is scrolled where the view was, once it is drawn", () => {
    const page = view();
    const list = page.querySelector(".list");
    const { copy, scroll } = ghostOf(page, (each) =>
      each === list ? { top: 240, left: 0 } : undefined,
    );
    document.body.append(copy);
    scroll();
    expect(copy.querySelector(".list")?.scrollTop).toBe(240);
  });
});
