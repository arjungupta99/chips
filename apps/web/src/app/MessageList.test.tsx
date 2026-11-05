/**
 * Windowing, in a jsdom that has been told how tall things are. jsdom lays nothing out, so the
 * heights are stubbed: a row is 40 pixels, a spacer is whatever its style says, and the
 * scroller is 400 tall. That is enough to prove the arithmetic — which rows are in the DOM,
 * how tall the spacers are, and that a scroll moves the window — and the real thing is proved
 * against a browser in `e2e/windowing.spec.ts`.
 */

import type { Line } from "@chipschat/core";
import { act, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Focus, follow, MessageList } from "./MessageList.tsx";

const ROW = 40;
const VIEWPORT = 400;

function line(seq: number): Line {
  return {
    id: `msg_${seq}`,
    seq,
    kind: "text",
    authorId: "usr_1",
    authorKind: "person",
    text: `Message ${seq}`,
    ts: "2026-09-04T10:00:00.000Z",
  };
}

/** The first `count` lines of a space. */
function lines(count: number): Line[] {
  return Array.from({ length: count }, (_, index) => line(index + 1));
}

/** A scroller of a known height, holding rows of a known height. */
function Harness({
  count,
  items,
  height = VIEWPORT,
  focus,
  sent,
}: {
  count?: number;
  /** The lines themselves, where it matters which stands where. */
  items?: Line[];
  height?: number;
  focus?: Focus;
  sent?: number;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  return (
    <div className="msgs" data-testid="messages" ref={scroller} style={{ height }}>
      <MessageList
        items={items ?? lines(count ?? 0)}
        keyOf={(each) => each.id}
        scroller={scroller}
        sent={sent}
        // A new object each render, as the room hands it one.
        {...(focus === undefined ? {} : { focus: { ...focus } })}
        row={(each) => (
          <div className="msg" key={each.id} data-testid="row">
            {each.text}
          </div>
        )}
      />
    </div>
  );
}

const originals = {
  clientHeight: Object.getOwnPropertyDescriptor(Element.prototype, "clientHeight"),
  scrollHeight: Object.getOwnPropertyDescriptor(Element.prototype, "scrollHeight"),
  offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight"),
};

function stubHeights(): void {
  Object.defineProperty(Element.prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("msgs") ? Number.parseFloat(this.style.height) : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      if (this.classList.contains("msgs-spacer")) return Number.parseFloat(this.style.height) || 0;
      return this.classList.contains("msg") ? ROW : 0;
    },
  });
  // Enough of a layout model for the scroller: its content is as tall as its children, rows
  // carrying the margin between them.
  Object.defineProperty(Element.prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement) {
      if (!this.classList.contains("msgs")) return 0;
      return [...this.children].reduce((sum, child) => {
        const row = child.classList.contains("msgs-spacer") ? 0 : 12;
        return sum + (child as HTMLElement).offsetHeight + row;
      }, 0);
    },
  });
}

afterEach(() => {
  for (const [name, descriptor] of Object.entries(originals)) {
    const target = name === "offsetHeight" ? HTMLElement.prototype : Element.prototype;
    if (descriptor !== undefined) Object.defineProperty(target, name, descriptor);
    else Reflect.deleteProperty(target, name);
  }
});

describe("the windowed message list", () => {
  it("puts every row in the DOM when nothing can be measured", () => {
    // A container with no height — before layout, and in every other component test here —
    // says nothing about what is in view, so everything is shown.
    render(<Harness count={200} height={0} />);
    expect(screen.getAllByTestId("row")).toHaveLength(200);
  });

  it("keeps only the rows near the viewport once it knows how tall things are", () => {
    stubHeights();
    render(<Harness count={1000} />);
    const rows = screen.getAllByTestId("row");
    // Ten rows fill four hundred pixels, plus the margin above and below.
    expect(rows.length).toBeGreaterThan(8);
    expect(rows.length).toBeLessThan(40);
    // A space opens at its end, and stays there: the newest line is on the page.
    expect(rows.at(-1)?.textContent).toBe("Message 1000");
  });

  it("stands the rows it left out in two spacers, so the scrollbar is honest", () => {
    stubHeights();
    render(<Harness count={1000} />);
    const before = screen.getByTestId("rows-before");
    const after = before.parentElement?.lastElementChild as HTMLElement;
    const shown = screen.getAllByTestId("row").length;
    const height = (element: HTMLElement) => Number.parseFloat(element.style.height) || 0;
    // A row measures 40 and carries 12 of margin; every one of the thousand is accounted for.
    expect(height(before) + shown * (ROW + 12) + height(after)).toBe(1000 * (ROW + 12));
  });

  it("lands on a jump once, not again each time the room draws (ADR 0132's addendum)", () => {
    stubHeights();
    const landed = vi.fn();
    const had = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = landed;
    try {
      // The jump comes after the room is drawn, as the room's own effect hands it over.
      const { rerender } = render(<Harness count={1000} />);
      rerender(<Harness count={1000} focus={{ index: 400, nonce: 1 }} />);
      // On the row asked for, though the guess at where it was ran past it: it aimed again.
      expect(landed).toHaveBeenCalledTimes(1);
      expect((landed.mock.contexts[0] as Element).textContent).toBe("Message 401");
      // A line arrives, and the reader who has scrolled away from the jump stays where they are.
      rerender(<Harness count={1001} focus={{ index: 400, nonce: 1 }} />);
      rerender(<Harness count={1002} focus={{ index: 400, nonce: 1 }} />);
      expect(landed).toHaveBeenCalledTimes(1);
      // The same line asked for again is a jump.
      rerender(<Harness count={1002} focus={{ index: 400, nonce: 2 }} />);
      expect(landed).toHaveBeenCalledTimes(2);
    } finally {
      Element.prototype.scrollIntoView = had;
    }
  });

  it("keeps the newest line on the page as the space grows", () => {
    stubHeights();
    const { rerender } = render(<Harness count={1000} />);
    rerender(<Harness count={1200} />);
    expect(screen.getAllByTestId("row").at(-1)?.textContent).toBe("Message 1200");
  });

  // A harness's word the room held while its run was at work is let go after the lines that came
  // since (ADR 0147, point 12), so it lands above the newest. Cut at its old place, the window
  // took the newest row off the page and drew it again, and the focus on it was lost.
  for (const [where, scrollTop] of [
    ["at the end", undefined],
    ["a little up the space, where the window still reaches it", 51_400],
  ] as const) {
    it(`keeps the newest row, the same element, when a line is drawn above it ${where}`, () => {
      stubHeights();
      const space = lines(1000);
      const { rerender } = render(<Harness items={space} />);
      if (scrollTop !== undefined) {
        const scroller = screen.getByTestId("messages");
        act(() => {
          scroller.scrollTop = scrollTop;
          scroller.dispatchEvent(new Event("scroll"));
        });
      }
      const newest = screen.getByText("Message 1000");
      const held = { ...line(2000), id: "msg_held", text: "Held a moment" };
      rerender(<Harness items={[...space.slice(0, 999), held, space[999] as Line]} />);
      expect(screen.getByText("Held a moment")).toBeDefined();
      expect(screen.getByText("Message 1000")).toBe(newest);
    });
  }

  it("follows the reader back up the space, and stops sticking to the end", () => {
    stubHeights();
    render(<Harness count={1000} />);
    const scroller = screen.getByTestId("messages");
    act(() => {
      scroller.scrollTop = 20_000;
      scroller.dispatchEvent(new Event("scroll"));
    });
    const rows = screen.getAllByTestId("row");
    expect(rows.at(-1)?.textContent).not.toBe("Message 1000");
    // 20,000 pixels in, at 52 a row: somewhere around the 385th, less the margin above.
    expect(rows.map((row) => row.textContent)).toContain("Message 385");
    expect(rows.length).toBeLessThan(40);
  });

  it("takes the reader to the end with a line of theirs sent from up the space (ADR 0268 addendum)", () => {
    stubHeights();
    const { rerender } = render(<Harness count={1000} sent={0} />);
    const scroller = screen.getByTestId("messages");
    act(() => {
      scroller.scrollTop = 20_000;
      scroller.dispatchEvent(new Event("scroll"));
    });
    expect(screen.getAllByTestId("row").at(-1)?.textContent).not.toBe("Message 1000");
    rerender(<Harness count={1001} sent={1} />);
    expect(screen.getAllByTestId("row").at(-1)?.textContent).toBe("Message 1001");
  });
});

/**
 * Following the end of a space. The rule that matters is the one about the ground moving: rows
 * are drawn at a guessed height and measured afterwards, so the list gets shorter as it settles,
 * and the browser takes the reader up with it. That is not somebody scrolling back, and reading
 * it as one leaves the newest message off the screen.
 */
describe("staying at the end", () => {
  function state(): {
    following: { current: boolean };
    top: { current: number };
    max: { current: number };
  } {
    return { following: { current: true }, top: { current: 0 }, max: { current: 0 } };
  }

  it("keeps following when the list shrinks under the reader", () => {
    const it_ = state();
    // At the end of a long list: 40,000 tall, 800 of it in view.
    follow(
      { scrollTop: 39_200, scrollHeight: 40_000, clientHeight: 800 },
      it_.following,
      it_.top,
      it_.max,
    );
    expect(it_.following.current).toBe(true);

    // The rows measured shorter than their estimates, so the list lost 4,000px and the browser
    // clamped the reader to the new bottom. Still at the end, and still following.
    follow(
      { scrollTop: 35_200, scrollHeight: 36_000, clientHeight: 800 },
      it_.following,
      it_.top,
      it_.max,
    );
    expect(it_.following.current).toBe(true);
  });

  it("keeps following when laying out what grew the list moves the scroll back", () => {
    const it_ = state();
    // At the end of a room on the demo's stage: 1,211 tall, 655 of it in view.
    follow(
      { scrollTop: 556, scrollHeight: 1211, clientHeight: 655 },
      it_.following,
      it_.top,
      it_.max,
    );
    // A picture at the end decoded: the list is 240px longer, and the Mac app's WebKit took the
    // scroll up 120px as it laid it out. Not the reader: still following.
    follow(
      { scrollTop: 436, scrollHeight: 1451, clientHeight: 655 },
      it_.following,
      it_.top,
      it_.max,
    );
    expect(it_.following.current).toBe(true);

    // Their own scroll back, the list standing still, ends it.
    follow(
      { scrollTop: 200, scrollHeight: 1451, clientHeight: 655 },
      it_.following,
      it_.top,
      it_.max,
    );
    expect(it_.following.current).toBe(false);
  });

  it("stops following when the reader actually scrolls back", () => {
    const it_ = state();
    follow(
      { scrollTop: 39_200, scrollHeight: 40_000, clientHeight: 800 },
      it_.following,
      it_.top,
      it_.max,
    );
    // Nothing changed height; they moved.
    follow(
      { scrollTop: 20_000, scrollHeight: 40_000, clientHeight: 800 },
      it_.following,
      it_.top,
      it_.max,
    );
    expect(it_.following.current).toBe(false);
  });

  it("follows again the moment they come back to the end", () => {
    const it_ = state();
    follow(
      { scrollTop: 10_000, scrollHeight: 40_000, clientHeight: 800 },
      it_.following,
      it_.top,
      it_.max,
    );
    follow(
      { scrollTop: 5000, scrollHeight: 40_000, clientHeight: 800 },
      it_.following,
      it_.top,
      it_.max,
    );
    expect(it_.following.current).toBe(false);
    follow(
      { scrollTop: 39_190, scrollHeight: 40_000, clientHeight: 800 },
      it_.following,
      it_.top,
      it_.max,
    );
    expect(it_.following.current).toBe(true);
  });

  it("does not mistake a shrink for permission to follow when they had scrolled away", () => {
    const it_ = state();
    follow(
      { scrollTop: 39_200, scrollHeight: 40_000, clientHeight: 800 },
      it_.following,
      it_.top,
      it_.max,
    );
    follow(
      { scrollTop: 10_000, scrollHeight: 40_000, clientHeight: 800 },
      it_.following,
      it_.top,
      it_.max,
    );
    expect(it_.following.current).toBe(false);
    // The list shrinks; they are still a long way from the end, so nothing changes.
    follow(
      { scrollTop: 10_000, scrollHeight: 36_000, clientHeight: 800 },
      it_.following,
      it_.top,
      it_.max,
    );
    expect(it_.following.current).toBe(false);
  });
});
