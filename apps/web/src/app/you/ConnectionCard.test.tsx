/**
 * Connection on You (ADR 0211): a browser on the server's own page says it is direct from this
 * browser; the Mac app through the relay says what the relay sees and times a round trip, and
 * when it leaves the relay says "Direct now" with the time now against the time before.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionCard, DIRECT_NOW_MS, TRIP_EVERY_MS, type WayFacts } from "./ConnectionCard.tsx";
import { GUIDE_CHECK_MS, GUIDE_DONE_MS } from "./GoDirectDialog.tsx";

const SINCE = "2026-10-20T07:40:00.000Z";

/** What the card asked of the store: to go direct, and Only direct on or off. */
const asked: string[] = [];

function facts(over: Partial<WayFacts> = {}, trips: number[] = []): WayFacts {
  return {
    owner: true,
    onlyDirect: false,
    wentDirect: false,
    goDirect: async () => {
      asked.push("goDirect");
      return false;
    },
    setOnlyDirect: (on) => {
      asked.push(`onlyDirect ${on}`);
    },
    connection: "open",
    link: "relay",
    since: SINCE,
    before: undefined,
    serverUrl: "https://adas-mac-mini.tail2f9c1e.ts.net",
    relayed: true,
    roundTrip: async () => trips.shift() ?? 400,
    machine: async () => "Arjun's Mac mini",
    myAsk: undefined,
    askDirect: async (tripMs) => {
      asked.push(`ask ${tripMs}`);
    },
    readMyAsk: async () => {
      asked.push("readMine");
    },
    ...over,
  };
}

const text = (testId: string) => screen.getByTestId(testId).textContent ?? "";

/** Lets the timers run on, and what they started come back. */
async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("Connection on You", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    asked.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it("says a browser on the server's own page is direct, and names no relay", async () => {
    render(
      <ConnectionCard
        way={facts({ link: "direct", relayed: false, serverUrl: "http://192.168.1.20:4431" })}
        desktop={false}
      />,
    );
    await wait(0);
    expect(text("connection-way")).toMatch("Direct, from this browser");
    expect(text("connection-words")).toMatch("Straight to Arjun's Mac mini on its own network");
    expect(screen.queryByTestId("connection-since")).toBeNull();
  });

  it("says the relay is in the way on the Mac, what it sees, and times a round trip", async () => {
    const trips = [410, 2000, 420];
    render(<ConnectionCard way={facts({}, trips)} desktop />);
    await wait(TRIP_EVERY_MS * 2);
    expect(text("connection-way")).toMatch("Through the relay");
    expect(text("connection-trip")).toMatch("420 ms round trip");
    expect(text("connection-words")).toMatch(/never what's said\.$/);
    expect(text("connection-since")).toMatch(/^Since(\d{1,2}:40\s(AM|PM)|[A-Z][a-z]{2} \d{1,2})$/);
  });

  it("says Direct now with the time now and before, for a few seconds", async () => {
    const trips = [410, 410, 410];
    const { rerender } = render(<ConnectionCard way={facts({}, trips)} desktop />);
    await wait(TRIP_EVERY_MS * 2);
    trips.push(38);
    rerender(
      <ConnectionCard
        way={facts(
          {
            link: "tunnel",
            since: "2026-10-20T09:43:00.000Z",
            before: { kind: "relay", since: SINCE, until: "2026-10-20T09:43:00.000Z" },
          },
          trips,
        )}
        desktop
      />,
    );
    await wait(0);
    expect(text("connection-now")).toMatch("Direct now · 38 ms, was 410 ms");
    expect(text("connection-way")).toMatch("Direct");
    expect(text("connection-before")).toMatch("Relay, 2 h");
    await wait(DIRECT_NOW_MS);
    expect(screen.queryByTestId("connection-now")).toBeNull();
  });

  it("offers the owner Go direct on the relay; the guide waits on the server, then folds away (Phase 2)", async () => {
    const { rerender } = render(<ConnectionCard way={facts()} desktop />);
    await wait(0);
    fireEvent.click(screen.getByTestId("go-direct-open"));
    expect(text("go-direct-step-2")).toMatch("Arjun's Mac mini is in tail2f9c1e.");
    expect(screen.getByTestId("go-direct-step-3").getAttribute("data-state")).toBe("waiting");
    await wait(GUIDE_CHECK_MS * 2);
    expect(asked.filter((each) => each === "goDirect")).toHaveLength(3);
    rerender(<ConnectionCard way={facts({ link: "tunnel", wentDirect: true })} desktop />);
    await wait(0);
    expect(screen.getByTestId("go-direct-step-1").getAttribute("data-state")).toBe("done");
    expect(text("go-direct-step-3")).toMatch("answered directly");
    expect(screen.getByTestId("go-direct-dialog").getAttribute("data-leaving")).toBeNull();
    await wait(GUIDE_DONE_MS);
    expect(screen.getByTestId("go-direct-dialog").getAttribute("data-leaving")).toBe("true");
    await wait(1000);
    expect(screen.queryByTestId("go-direct-dialog")).toBeNull();
  });

  it("guides somebody who is not an owner through an ask, and the invite once shared (Phase 3)", async () => {
    const guest = (over: Partial<WayFacts> = {}) => facts({ owner: false, ...over }, [430]);
    const { rerender } = render(<ConnectionCard way={guest()} desktop />);
    await wait(0);
    // Their ask is read as the card is drawn.
    expect(asked).toContain("readMine");
    expect(text("go-direct")).toMatch("An owner shares the server with you");
    fireEvent.click(screen.getByTestId("go-direct-open"));
    expect(text("go-direct-step-1")).toMatch("Chips asks the owners to share Arjun's Mac mini");
    expect(asked).not.toContain("goDirect");
    fireEvent.click(screen.getByTestId("go-direct-ask"));
    await wait(0);
    expect(asked).toContain("ask 430");
    const ask = { state: "asked" as const, askedAt: "2026-10-20T16:12:00.000Z" };
    rerender(<ConnectionCard way={guest({ myAsk: ask })} desktop />);
    await wait(0);
    expect(text("go-direct-step-1")).toMatch(/Asked at .+ when it's shared/);
    expect(screen.getByTestId("go-direct-step-1").getAttribute("data-state")).toBe("waiting");
    expect(screen.queryByTestId("go-direct-ask")).toBeNull();
    // Read again while it waits.
    const reads = asked.filter((each) => each === "readMine").length;
    await wait(GUIDE_CHECK_MS * 2);
    expect(asked.filter((each) => each === "readMine").length).toBe(reads + 2);
    const link = "https://login.tailscale.com/admin/invite/x";
    rerender(
      <ConnectionCard
        way={guest({ myAsk: { ...ask, state: "shared", sharer: "Natalie", link } })}
        desktop
      />,
    );
    await wait(0);
    expect(text("go-direct-step-1")).toMatch("Natalie shared it.");
    expect(screen.getByTestId("go-direct-step-1").getAttribute("data-state")).toBe("done");
    expect(screen.getByTestId("go-direct-invite").getAttribute("href")).toBe(link);
    await wait(GUIDE_CHECK_MS);
    expect(asked).toContain("goDirect");
  });

  it("offers Only direct once the Mac has gone direct, and says why it is not connected while on", async () => {
    const { rerender } = render(<ConnectionCard way={facts()} desktop />);
    await wait(0);
    const toggle = () => screen.getByTestId("only-direct-switch") as HTMLInputElement;
    expect(toggle().disabled).toBe(true);
    expect(text("only-direct")).toMatch("Connect directly once to turn this on.");
    rerender(<ConnectionCard way={facts({ link: "tunnel", wentDirect: true })} desktop />);
    expect(toggle().disabled).toBe(false);
    fireEvent.click(toggle());
    expect(asked).toContain("onlyDirect true");
    rerender(
      <ConnectionCard
        way={facts({ connection: "closed", link: "tunnel", wentDirect: true, onlyDirect: true })}
        desktop
      />,
    );
    expect(text("connection-words")).toMatch(
      /Only direct is on, so this computer won't use the relay/,
    );
  });

  it("says who turned the relay off once it cannot connect, and keeps Go direct offered (Phase 4)", async () => {
    const relayOff = { on: false, by: "Natalie", at: "2026-10-21T09:05:00.000Z" };
    const { rerender } = render(
      <ConnectionCard
        way={facts({
          connection: "closed",
          link: undefined,
          relayOff,
        })}
        desktop
      />,
    );
    await wait(0);
    expect(text("connection-words")).toMatch(
      /^Natalie turned the relay off at .+, so Chips reaches Arjun's Mac mini only over Tailscale now\. What you send waits here and goes once it is connected\.$/,
    );
    expect(screen.getByTestId("go-direct")).toBeTruthy();
    // Trying again says the same: the relay being off is still why.
    rerender(
      <ConnectionCard
        way={facts({ connection: "connecting", link: undefined, relayOff })}
        desktop
      />,
    );
    expect(text("connection-words")).toMatch(/^Natalie turned the relay off at /);
  });
});
