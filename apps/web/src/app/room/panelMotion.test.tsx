/**
 * The run panel's coming and going (ADR 0268 addendum). What is worth proving: that in the open
 * room it comes and goes with its motion, the column laid out at once and the panel kept drawn
 * while it goes, the room gliding from where it stood; that a room opened is drawn as it is; and
 * that Reduce Motion moves nothing.
 */

import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePanelMotion } from "./panelMotion.ts";

function screenWith(reduce: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: reduce })),
  );
}

function panel(side: string | undefined, roomId: string) {
  return renderHook((props) => usePanelMotion(props.side, props.roomId), {
    initialProps: { side, roomId },
  });
}

describe("the run panel beside the open room", () => {
  beforeEach(() => vi.useFakeTimers());
  const animate = Element.prototype.animate;
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Element.prototype.animate = animate;
  });

  it("comes in the room that is open", () => {
    screenWith(false);
    const { result, rerender } = panel(undefined, "a");
    expect(result.current).toEqual({ laid: false, shown: undefined, motion: undefined });
    rerender({ side: "run", roomId: "a" });
    expect(result.current).toEqual({ laid: true, shown: "run", motion: "came" });
    act(() => vi.runAllTimers());
    expect(result.current).toEqual({ laid: true, shown: "run", motion: undefined });
  });

  it("glides the room from where it stood, measured once its column has changed", () => {
    screenWith(false);
    const glides = vi.fn();
    Element.prototype.animate = glides as unknown as Element["animate"];
    // The room's column as the shell lays it out: narrower with the panel beside it.
    function Room({ side }: { readonly side: string | undefined }) {
      const panel = usePanelMotion(side, "a");
      return (
        <div className="conv">
          <div className="msgs" style={{ paddingLeft: panel.laid ? "20px" : "170px" }} />
        </div>
      );
    }
    const { rerender } = render(<Room side={undefined} />);
    rerender(<Room side="run" />);
    expect(glides).toHaveBeenCalledTimes(1);
    expect(glides.mock.calls[0]?.[0]).toEqual([
      { transform: "translateX(150px)" },
      { transform: "none" },
    ]);
    act(() => vi.runAllTimers());
    rerender(<Room side={undefined} />);
    expect(glides).toHaveBeenCalledTimes(2);
    expect(glides.mock.calls[1]?.[0]).toEqual([
      { transform: "translateX(-150px)" },
      { transform: "none" },
    ]);
  });

  it("is done coming once its slide has ended, however late the slide began", () => {
    screenWith(false);
    const { result, rerender } = panel(undefined, "a");
    rerender({ side: "run", roomId: "a" });
    expect(result.current.motion).toBe("came");
    const slid = document.createElement("aside");
    slid.className = "runpanel";
    document.body.append(slid);
    const end = (name: string) => {
      const event = new Event("animationend", { bubbles: true });
      Object.defineProperty(event, "animationName", { value: name });
      act(() => {
        slid.dispatchEvent(event);
      });
    };
    // Its slide's clock has run out, but the slide, begun late, has not ended.
    act(() => vi.advanceTimersByTime(300));
    expect(result.current.motion).toBe("came");
    end("something-else");
    expect(result.current.motion).toBe("came");
    end("runpanel-in");
    expect(result.current.motion).toBeUndefined();
    slid.remove();
  });

  it("goes as its run ends: the room has the width at once, the panel drawn until it has gone", () => {
    screenWith(false);
    const { result, rerender } = panel("run", "a");
    rerender({ side: undefined, roomId: "a" });
    expect(result.current).toEqual({ laid: false, shown: "run", motion: "leaving" });
    act(() => vi.runAllTimers());
    expect(result.current).toEqual({ laid: false, shown: undefined, motion: undefined });
  });

  it("is drawn as it is in a room opened, as the iPad opens one", () => {
    screenWith(false);
    const { result, rerender } = panel("run", "a");
    rerender({ side: undefined, roomId: "b" });
    expect(result.current).toEqual({ laid: false, shown: undefined, motion: undefined });
    rerender({ side: "other", roomId: "c" });
    expect(result.current).toEqual({ laid: true, shown: "other", motion: undefined });
  });

  it("moves nothing with Reduce Motion", () => {
    screenWith(true);
    const { result, rerender } = panel("run", "a");
    rerender({ side: undefined, roomId: "a" });
    expect(result.current).toEqual({ laid: false, shown: undefined, motion: undefined });
  });
});
