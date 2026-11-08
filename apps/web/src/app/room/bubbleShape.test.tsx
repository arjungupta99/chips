/**
 * A bubble whose words change where it stands takes its new shape on the room's spring (ADR 0284's
 * second addendum). jsdom lays nothing out, so a bubble here is as big as its words say; the motion
 * itself was measured frame by frame in Chromium.
 */

import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBubbleShape } from "./bubbleShape.ts";

/** A bubble 20 wider than its words, ten a letter, and a line taller past twelve letters. */
function sizeOf(el: Element): { width: number; height: number } {
  const letters = el.textContent?.length ?? 0;
  const words = { width: letters * 10, height: letters > 12 ? 44 : 22 };
  return el.classList.contains("bub")
    ? { width: words.width + 20, height: words.height + 16 }
    : words;
}

interface Played {
  readonly target: Element;
  readonly keyframes: Keyframe[];
  readonly glide: { onfinish: (() => void) | null; cancel: ReturnType<typeof vi.fn> };
}

let played: Played[] = [];
let reduce = false;

beforeEach(() => {
  played = [];
  reduce = false;
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce") }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      readonly told: ResizeObserverCallback;
      constructor(told: ResizeObserverCallback) {
        this.told = told;
      }
      observe(el: Element) {
        const { width, height } = sizeOf(el);
        const entry = { target: el, borderBoxSize: [{ inlineSize: width, blockSize: height }] };
        this.told([entry as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      disconnect() {}
    },
  );
  Object.assign(HTMLElement.prototype, {
    getBoundingClientRect(this: HTMLElement) {
      // On its way, a bubble is drawn between its shapes.
      const going = this.classList.contains("bub") && this.style.overflow === "hidden";
      const { width, height } = going ? { width: 150, height: 50 } : sizeOf(this);
      return { left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0 };
    },
    animate(this: Element, keyframes: Keyframe[]) {
      const glide = { onfinish: null, cancel: vi.fn() };
      played.push({ target: this, keyframes, glide });
      return glide as unknown as Animation;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
  Reflect.deleteProperty(HTMLElement.prototype, "getBoundingClientRect");
});

function Said({ said, held = false }: { readonly said: string; readonly held?: boolean }) {
  const shape = useBubbleShape(said);
  return (
    <div className="msgs" data-held={held ? "true" : undefined}>
      <div ref={shape} className="bub" data-testid="bubble">
        <p>{said}</p>
      </div>
    </div>
  );
}

describe("a bubble whose words change", () => {
  it("goes from the shape it was drawn at to its new one, round its words held at their new shape", () => {
    const { getByTestId, rerender } = render(<Said said="Reading" />);
    expect(played).toEqual([]);

    rerender(<Said said="Searching the web" />);
    const bubble = getByTestId("bubble");
    expect(played.map(({ target, keyframes }) => ({ target, keyframes }))).toEqual([
      {
        target: bubble,
        keyframes: [
          { width: "90px", height: "38px" },
          { width: "190px", height: "60px" },
        ],
      },
    ]);
    expect(bubble.querySelector("p")?.style.width).toBe("170px");
    expect(bubble.style.overflow).toBe("hidden");

    played[0]?.glide.onfinish?.();
    expect(bubble.querySelector("p")?.style.width).toBe("");
    expect(bubble.style.overflow).toBe("");
  });

  it("goes on from where it is drawn when its words change again on the way", () => {
    const { rerender } = render(<Said said="Reading" />);
    rerender(<Said said="Searching the web" />);
    const first = played[0];
    rerender(<Said said="Done" />);
    expect(first?.glide.cancel).toHaveBeenCalled();
    // From where it is drawn on the way to its new shape.
    expect(played[1]?.keyframes).toEqual([
      { width: "150px", height: "50px" },
      { width: "60px", height: "38px" },
    ]);
  });

  it("is simply its new shape with less motion asked for, or in a room taking a new width", () => {
    reduce = true;
    const { rerender } = render(<Said said="Reading" />);
    rerender(<Said said="Searching the web" />);
    expect(played).toEqual([]);

    reduce = false;
    const held = render(<Said said="Reading" held />);
    held.rerender(<Said said="Searching the web" held />);
    expect(played).toEqual([]);
  });

  it("stays as it is when its words change and its shape does not", () => {
    const { rerender } = render(<Said said="Reading" />);
    rerender(<Said said="Writing" />);
    expect(played).toEqual([]);
  });
});
