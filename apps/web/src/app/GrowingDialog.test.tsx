/**
 * A dialog that grows out of what opened it and folds back into it (ADR 0084): once its owner says
 * it is leaving, it is gone when its fold ends, and at once with Reduce Motion (ADR 0274), where
 * there is no fold to end. Escape puts it away, but not Escape in a dialog opened from inside it.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createPortal } from "react-dom";
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

/** A page with a dialog opened from inside it, drawn over everything, as the viewer is. */
function withViewer(onLeave: () => void, inPlace: boolean) {
  return (
    <GrowingDialog
      from={undefined}
      labelledBy="title"
      className="test-dialog"
      testId="test-dialog"
      focus="h2"
      leaving={false}
      inPlace={inPlace}
      onLeave={onLeave}
      onGone={() => undefined}
    >
      <h2 id="title">Universe</h2>
      <button type="button">Media</button>
      {createPortal(
        <dialog data-testid="viewer" onCancel={(event) => event.preventDefault()}>
          <button type="button">Download</button>
        </dialog>,
        document.body,
      )}
    </GrowingDialog>
  );
}

describe("Escape", () => {
  it("puts a page away, but not from a dialog opened over it", () => {
    const leave = vi.fn();
    render(withViewer(leave, true));
    fireEvent.keyDown(screen.getByRole("button", { name: "Download", hidden: true }), {
      key: "Escape",
    });
    expect(leave).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("button", { name: "Media" }), { key: "Escape" });
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it("cancels a dialog, but not when the dialog opened from inside it is the one cancelled", () => {
    const leave = vi.fn();
    render(withViewer(leave, false));
    fireEvent(screen.getByTestId("viewer"), new Event("cancel", { cancelable: true }));
    expect(leave).not.toHaveBeenCalled();
    fireEvent(screen.getByTestId("test-dialog"), new Event("cancel", { cancelable: true }));
    expect(leave).toHaveBeenCalledTimes(1);
  });
});
