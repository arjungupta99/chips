/**
 * Dialogs grow out of what opened them and fold back into it (ADR 0084, ADR 0274): the press a
 * dialog grows from, where it stood when its control has gone, and the ghost a dialog folds away as
 * when its owner takes it off the page.
 */

import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { boxOf, foldAway, recentPress, watchPresses } from "./dialogMotion.ts";

let stop: () => void;
beforeEach(() => {
  stop = watchPresses();
});
afterEach(() => {
  stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

/** An element standing at a place on the page, as jsdom never lays one out. */
function at<T extends HTMLElement>(
  element: T,
  left: number,
  top: number,
  width: number,
  height: number,
): T {
  element.getBoundingClientRect = () => new DOMRect(left, top, width, height);
  return element;
}

describe("the press a dialog grows from", () => {
  it("is the control pressed a moment ago", () => {
    const button = at(document.createElement("button"), 100, 40, 80, 32);
    const label = document.createElement("span");
    button.append(label);
    document.body.append(button);
    label.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(recentPress()?.element).toBe(button);
  });

  it("is no press at all when the last was long ago", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    const button = at(document.createElement("button"), 100, 40, 80, 32);
    document.body.append(button);
    button.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    now.mockReturnValue(5000);
    expect(recentPress()).toBeUndefined();
  });

  it("stands where its control stood, once a menu that held it has gone", () => {
    const item = at(document.createElement("button"), 300, 200, 120, 28);
    item.setAttribute("role", "menuitem");
    document.body.append(item);
    item.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    const press = recentPress();
    item.remove();
    expect(boxOf(press)).toMatchObject({ left: 300, top: 200, width: 120, height: 28 });
  });
});

describe("a dialog taken away by its owner", () => {
  /** A dialog on the page, with a heading and a button named for tests. */
  function asking() {
    const dialog = at(document.createElement("dialog"), 400, 300, 420, 180);
    dialog.className = "confirm grows";
    dialog.innerHTML = `<h2 id="title">Delete PO-4471?</h2><button data-testid="confirm-go">Delete</button>`;
    document.body.append(dialog);
    return dialog;
  }

  /** Element.animate as a browser has it, each fold finishing when told. */
  function animations() {
    let finish = () => undefined as void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: () => ({ finished }),
    });
    onTestFinished(() => {
      Reflect.deleteProperty(HTMLElement.prototype, "animate");
    });
    return {
      finish: async () => {
        finish();
        await finished;
        await Promise.resolve();
      },
    };
  }

  it("folds into what opened it as a ghost that names nothing and takes no clicks", async () => {
    const fold = animations();
    const opener = at(document.createElement("button"), 100, 50, 40, 40);
    document.body.append(opener);
    opener.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    const dialog = asking();
    foldAway(dialog, recentPress());
    dialog.remove();
    await Promise.resolve();
    const ghost = document.querySelector<HTMLElement>(".dialog-ghost");
    expect(ghost?.className).toBe("confirm grows ghost dialog-ghost");
    expect(ghost?.getAttribute("aria-hidden")).toBe("true");
    expect(ghost?.querySelector("[id], [data-testid]")).toBeNull();
    expect(ghost?.textContent).toContain("Delete PO-4471?");
    expect(ghost?.style.left).toBe("400px");
    // The opener's middle, 120 by 70, is 280 left of the dialog's corner and 230 above it.
    expect(ghost?.style.getPropertyValue("--grow-from")).toBe("-280px -230px");
    expect(document.querySelector(".dialog-ghost-dim")).not.toBeNull();
    await fold.finish();
    expect(document.querySelector(".dialog-ghost")).toBeNull();
    expect(document.querySelector(".dialog-ghost-dim")).toBeNull();
  });

  it("leaves no ghost when it is put straight back, as React's strict mode does", async () => {
    animations();
    const dialog = asking();
    foldAway(dialog, undefined);
    await Promise.resolve();
    expect(document.querySelector(".dialog-ghost")).toBeNull();
  });

  it("leaves no ghost with Reduce Motion", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
    const dialog = asking();
    foldAway(dialog, undefined);
    dialog.remove();
    await Promise.resolve();
    expect(document.querySelector(".dialog-ghost")).toBeNull();
  });
});
