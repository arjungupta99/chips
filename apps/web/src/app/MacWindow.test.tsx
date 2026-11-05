/**
 * Chips for Mac's window, from the page's side (ADR 0267): the page says it is in the Mac's
 * window, draws the strip the window is moved by, refuses a file let go where nothing takes it, and
 * says when it is drawn, so the window is never seen before it is (ADR 0274).
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MacWindow, refuseStrayDrops, whenDrawn } from "./MacWindow.tsx";

afterEach(cleanup);

/** A drag event as WebKit sends one, carrying files or words. */
function dragged(type: "dragover" | "drop", carrying: string[]) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    dataTransfer: { types: string[]; dropEffect: string };
  };
  event.dataTransfer = { types: carrying, dropEffect: "copy" };
  return event;
}

describe("Chips for Mac's window", () => {
  it("says the page is in it, and lays the strip under the traffic lights", () => {
    const view = render(<MacWindow />);
    expect(document.documentElement.dataset["shell"]).toBe("mac");
    const bar = view.container.querySelector(".mac-bar");
    expect(bar?.getAttribute("data-tauri-drag-region")).toBe("");
    view.unmount();
    expect(document.documentElement.dataset["shell"]).toBeUndefined();
  });
});

describe("a file let go where nothing takes it", () => {
  it("is shown refused and dropped, so the window never opens it in Chips' place", () => {
    const stop = refuseStrayDrops();
    const over = dragged("dragover", ["Files"]);
    window.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    expect(over.dataTransfer.dropEffect).toBe("none");
    const drop = dragged("drop", ["Files"]);
    window.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    stop();
  });

  it("is left to the room that takes it", () => {
    const stop = refuseStrayDrops();
    const room = document.createElement("main");
    document.body.append(room);
    room.addEventListener("dragover", (event) => event.preventDefault());
    const over = dragged("dragover", ["Files"]);
    room.dispatchEvent(over);
    expect(over.dataTransfer.dropEffect).toBe("copy");
    room.remove();
    stop();
  });

  it("leaves words dragged inside the page alone", () => {
    const stop = refuseStrayDrops();
    const over = dragged("dragover", ["text/plain"]);
    window.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(false);
    stop();
  });
});

describe("the window waits for the page (ADR 0274)", () => {
  it("is told once the page has something on it, and not for the strip alone", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    let told = 0;
    const stop = whenDrawn(() => {
      told += 1;
    }, root);
    const bar = document.createElement("div");
    bar.className = "mac-bar";
    root.append(bar);
    await Promise.resolve();
    expect(told).toBe(0);
    root.append(document.createElement("main"));
    await Promise.resolve();
    expect(told).toBe(1);
    root.append(document.createElement("aside"));
    await Promise.resolve();
    expect(told).toBe(1);
    stop();
    root.remove();
  });

  it("waits while the room's place is quiet, and is told when a room stands in it", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const quiet = document.createElement("main");
    quiet.dataset["windowWaits"] = "";
    root.append(quiet);
    let told = false;
    const stop = whenDrawn(() => {
      told = true;
    }, root);
    expect(told).toBe(false);
    delete quiet.dataset["windowWaits"];
    await Promise.resolve();
    expect(told).toBe(true);
    stop();
    root.remove();
  });
});
