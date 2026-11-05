/**
 * A dialog that grows out of what opened it and folds back into it (ADR 0084): once its owner says
 * it is leaving, it is gone when its fold ends, and at once with Reduce Motion (ADR 0274), where
 * there is no fold to end.
 */

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GrowingDialog } from "./GrowingDialog.tsx";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function leaving(onGone: () => void) {
  return (
    <GrowingDialog
      from={undefined}
      labelledBy="title"
      className="test-dialog"
      testId="test-dialog"
      focus="h2"
      leaving
      onLeave={() => undefined}
      onGone={onGone}
    >
      <h2 id="title">Asked</h2>
    </GrowingDialog>
  );
}

describe("a dialog its owner has said is leaving", () => {
  it("waits for its fold, however long a tab in the background takes to draw it", () => {
    const gone = vi.fn();
    render(leaving(gone));
    act(() => vi.advanceTimersByTime(100));
    expect(gone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(400));
    expect(gone).toHaveBeenCalledTimes(1);
  });

  it("goes at once with Reduce Motion, which has no fold", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
    const gone = vi.fn();
    render(leaving(gone));
    act(() => vi.advanceTimersByTime(0));
    expect(gone).toHaveBeenCalledTimes(1);
  });
});
