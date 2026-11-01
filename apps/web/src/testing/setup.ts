/** Testing Library unmounts what a test rendered only when `afterEach` is global, and here it is not. */

// Before React DOM loads, which reads what the platform has once, as it loads.
import "./animation.ts";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { pageStorage } from "./storage.ts";

afterEach(cleanup);

/** Each test opens the page with nothing kept (`storage.ts` says why it isn't jsdom's). */
beforeEach(() => {
  vi.stubGlobal("localStorage", pageStorage());
});

/**
 * jsdom draws a `<dialog>` and refuses to open one: `showModal`, `close` and the top layer are not
 * implemented (jsdom #3294). The media viewer is a modal dialog, so without these a test of it
 * throws before it renders anything.
 *
 * What is stood in for is only the bit of the platform the viewer leans on — `open`, and a `close`
 * that raises the event React listens for. The focus trap, the inert room behind and the backdrop
 * are the real platform's, and a browser is where they are proven: `e2e/viewer.spec.ts` asks
 * Escape, the focus's return and axe of a real dialog.
 */
if (typeof HTMLDialogElement !== "undefined") {
  const dialog = HTMLDialogElement.prototype as HTMLDialogElement & {
    showModal?: () => void;
    show?: () => void;
    close?: (value?: string) => void;
  };
  if (typeof dialog.showModal !== "function") {
    dialog.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
    dialog.show = function show(this: HTMLDialogElement) {
      this.open = true;
    };
    dialog.close = function close(this: HTMLDialogElement, value?: string) {
      this.open = false;
      if (value !== undefined) this.returnValue = value;
      this.dispatchEvent(new Event("close"));
    };
  }
}

/**
 * jsdom has no `ResizeObserver`. The viewer's stage measures itself once and then watches for the
 * window changing shape, which under jsdom never happens — so a stand-in that observes nothing is
 * the whole of it. A real one is what a browser gives `e2e/viewer.spec.ts`.
 */
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

/**
 * jsdom draws a `<video>` and plays nothing: `play` and `pause` are not implemented, and `play`
 * throws rather than returning a promise. The viewer plays a video when it lands on it, so without
 * these the effect that does it throws. What is asserted about playing is which source the element
 * was given and whether it was asked to play — a real decoder is the browser's, in `viewer.spec.ts`.
 */
if (typeof HTMLMediaElement !== "undefined") {
  const media = HTMLMediaElement.prototype as HTMLMediaElement & {
    play?: () => Promise<void>;
    pause?: () => void;
  };
  media.play = function play(this: HTMLMediaElement) {
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  };
  media.pause = function pause(this: HTMLMediaElement) {
    this.dispatchEvent(new Event("pause"));
  };
}

/**
 * jsdom lays nothing out, so it has no `scrollIntoView`. The viewer asks for it twice — the
 * filmstrip keeps the current thumb centred, and closing brings the tile it flies back into onto
 * the glass — and both are about where something ends up on a screen, which is a browser's to say.
 */
if (typeof Element !== "undefined" && typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {};
}
