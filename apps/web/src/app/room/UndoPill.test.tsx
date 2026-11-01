/**
 * The Undo pill's count (ADR 0167, ADR 0195): it belongs to a deletion, so a page that draws the
 * pill again as it updates, with a new object for the deletion and a new callback, does not start
 * it again; a second deletion does.
 */

import { UNDO_MS } from "@chipschat/core";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UndoPill } from "./UndoPill.tsx";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const pill = (at: number, onGone: () => void) => (
  <UndoPill undoing={{ lineId: "rule-1", at }} onUndo={() => {}} onGone={onGone} page />
);

describe("the Undo pill", () => {
  it("runs out once, however often its page draws it again", () => {
    vi.useFakeTimers();
    const onGone = vi.fn();
    const { rerender } = render(pill(1000, onGone));
    for (let second = 1; second < UNDO_MS / 1000; second += 1) {
      act(() => vi.advanceTimersByTime(1000));
      rerender(pill(1000, () => onGone()));
    }
    expect(onGone).not.toHaveBeenCalled();
    expect(screen.getByTestId("undo-pill")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1000));
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it("starts the count again for a second deletion", () => {
    vi.useFakeTimers();
    const onGone = vi.fn();
    const { rerender } = render(pill(1000, onGone));
    act(() => vi.advanceTimersByTime(UNDO_MS - 1000));
    rerender(pill(2000, onGone));
    act(() => vi.advanceTimersByTime(UNDO_MS - 1000));
    expect(onGone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(onGone).toHaveBeenCalledTimes(1);
  });
});
