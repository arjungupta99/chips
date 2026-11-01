/**
 * The Agents page before this device has ever had the server's list (14 October 2026): it said
 * "No harnesses yet." and "No agents yet" until the server answered. Now blank agents stand where
 * the list will be, or the page says why the list can't be had; "No agents yet" is the server's.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { type AgentsService, AgentsWaiting } from "./Agents.tsx";

/** The page's service, of which only `refresh` is asked for here. */
function service(refresh: () => Promise<void>): AgentsService {
  const never = () => Promise.reject(new Error("not here"));
  return {
    stays: async () => [],
    move: never,
    fork: never,
    forkRoom: never,
    put: () => undefined,
    newRoom: () => "spc_new",
    refresh,
    rename: never,
    archive: never,
    remove: never,
    lock: never,
  };
}

describe("the Agents page before its first list", () => {
  it("stands blank agents where the list will be, and never says there are none", () => {
    const { container } = render(
      <AgentsWaiting
        look="fetching"
        connection="connecting"
        server={undefined}
        agents={undefined}
        onWake={vi.fn()}
      />,
    );
    expect(screen.getByTestId("agents-fetching")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Loading your agents");
    // A Main agent's place and three more, their light a row behind the row above.
    const blank = [...container.querySelectorAll('.ui-mark[data-state="blank"]')];
    expect(blank).toHaveLength(4);
    const firstPin = (mark: Element) => (mark.querySelector(".ui-mark__pin") as SVGElement).style;
    expect(blank.map((mark) => firstPin(mark).animationDelay)).toEqual([
      "0ms",
      "140ms",
      "280ms",
      "420ms",
    ]);
    expect(screen.queryByText(/No agents yet/)).toBeNull();
    expect(screen.queryByText(/No harnesses yet/)).toBeNull();
  });

  it("says nothing while the cache is read, nor for a browser sent to pairing", () => {
    for (const look of ["reading", "rejected", "removed"] as const) {
      const { container, unmount } = render(
        <AgentsWaiting
          look={look}
          connection="closed"
          server={undefined}
          agents={undefined}
          onWake={vi.fn()}
        />,
      );
      expect(container.querySelector(".harnesses-body")?.children).toHaveLength(0);
      unmount();
    }
  });

  /** Fake timers for one test: the first load's patience is four seconds of trouble. */
  async function patiently(test: () => Promise<void>): Promise<void> {
    vi.useFakeTimers();
    try {
      await test();
    } finally {
      vi.useRealTimers();
    }
  }
  const waitOut = () =>
    act(async () => {
      vi.advanceTimersByTime(4000);
    });

  it("stands blank agents through a launch's blip, then says the server can't be reached", () =>
    patiently(async () => {
      const wake = vi.fn();
      render(
        <AgentsWaiting
          look="closed"
          connection="closed"
          server="100.64.0.7:4431"
          agents={undefined}
          onWake={wake}
        />,
      );
      expect(screen.getByTestId("agents-fetching")).toBeTruthy();
      expect(screen.queryByText("Can't reach your server")).toBeNull();
      await waitOut();
      expect(screen.getByTestId("no-agents-closed")).toBeTruthy();
      expect(screen.getByText(/^Your agents will show here as soon as it answers/)).toBeTruthy();
      expect(screen.getByText("100.64.0.7:4431")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(wake).toHaveBeenCalledOnce();
    }));

  it("says the server is being reached when it tries again, once trouble was said", () =>
    patiently(async () => {
      const page = (look: "closed" | "fetching", connection: "closed" | "connecting") => (
        <AgentsWaiting
          look={look}
          connection={connection}
          server={undefined}
          agents={undefined}
          onWake={vi.fn()}
        />
      );
      const { rerender } = render(page("closed", "closed"));
      await waitOut();
      rerender(page("fetching", "connecting"));
      expect(screen.getByTestId("no-agents-connecting")).toBeTruthy();
      expect(screen.getByText("Reaching your server")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    }));

  it("says the server is asleep in its own words", () =>
    patiently(async () => {
      render(
        <AgentsWaiting
          look="asleep"
          connection="asleep"
          server={undefined}
          agents={undefined}
          onWake={vi.fn()}
        />,
      );
      await waitOut();
      expect(screen.getByText("Your server is asleep")).toBeTruthy();
    }));

  it("says the list didn't come when the server is there, and asks for it again", () =>
    patiently(async () => {
      let release: (() => void) | undefined;
      const refresh = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
      render(
        <AgentsWaiting
          look="failed"
          connection="open"
          server={undefined}
          agents={service(refresh)}
          onWake={vi.fn()}
        />,
      );
      expect(screen.getByTestId("agents-fetching")).toBeTruthy();
      await waitOut();
      expect(screen.getByText("Couldn't load your agents")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(refresh).toHaveBeenCalledOnce();
      // While it asks, the button says so and takes no second click.
      const asking = screen.getByRole("button", { name: "Trying…" });
      expect(asking).toHaveProperty("disabled", true);
      await act(async () => release?.());
      expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    }));
});
