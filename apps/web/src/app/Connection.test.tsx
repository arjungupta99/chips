/**
 * The mark at the top of the rail, wearing the connection (ADR 0131): what it says and when, on
 * the phone's timings, and that pressing it while not connected tries again.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACK_MS, markWords, RailMark, SETTLES_MS } from "./Connection.tsx";

function mark(connection: Parameters<typeof RailMark>[0]["connection"], onRetry = () => {}) {
  return <RailMark connection={connection} server="100.64.0.7:4431" onRetry={onRetry} />;
}

const look = () => screen.getByTestId("rail-mark").getAttribute("data-look");

describe("the rail's mark", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is the mark at rest while connected", () => {
    render(mark("open"));
    expect(look()).toBe("rest");
  });

  it("waits out a blink before it says anything", () => {
    render(mark("connecting"));
    expect(look()).toBe("rest");
    act(() => vi.advanceTimersByTime(SETTLES_MS));
    expect(look()).toBe("reaching");
  });

  it("goes red when the server cannot be reached, and tries again when pressed", () => {
    const retry = vi.fn();
    render(mark("closed", retry));
    act(() => vi.advanceTimersByTime(SETTLES_MS));
    expect(look()).toBe("failed");
    fireEvent.click(screen.getByTestId("rail-mark"));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("says it is back for a beat after red, then rests", () => {
    const { rerender } = render(mark("closed"));
    act(() => vi.advanceTimersByTime(SETTLES_MS));
    rerender(mark("open"));
    expect(look()).toBe("back");
    act(() => vi.advanceTimersByTime(BACK_MS));
    expect(look()).toBe("rest");
  });

  it("just rests after a slow connect that never failed", () => {
    const { rerender } = render(mark("connecting"));
    act(() => vi.advanceTimersByTime(SETTLES_MS));
    rerender(mark("open"));
    expect(look()).toBe("rest");
  });

  it("does nothing when pressed while connected", () => {
    const retry = vi.fn();
    render(mark("open", retry));
    fireEvent.click(screen.getByTestId("rail-mark"));
    expect(retry).not.toHaveBeenCalled();
  });
});

describe("what the rail's mark says", () => {
  it("names the server, and since when it has not answered", () => {
    const lostAt = new Date(Date.now() - 4 * 60_000).toISOString();
    expect(markWords("failed", "closed", { server: "100.64.0.7:4431", lostAt })).toBe(
      "Can't reach your server · 100.64.0.7:4431 · last connected 4 min ago · press to try again",
    );
    expect(markWords("rest", "open", { server: "100.64.0.7:4431", link: "relay" })).toBe(
      "Connected through the relay · 100.64.0.7:4431",
    );
    expect(markWords("back", "open", {})).toBe("Connected again");
    expect(markWords("failed", "asleep", {})).toBe("Your server is asleep · press to try again");
  });

  it("says to pair again when the server names a relay under a key this device did not pin (SEC-2)", () => {
    expect(markWords("rest", "open", { server: "mini.local:4431", rekeyed: true })).toBe(
      "Connected · mini.local:4431 · the server names a relay under a new key · pair again to use it",
    );
    expect(markWords("failed", "closed", { rekeyed: true })).toBe(
      "Can't reach your server · press to try again · the server names a relay under a new key · pair again to use it",
    );
    expect(markWords("rest", "open", { rekeyed: false })).toBe("Connected");
  });
});
