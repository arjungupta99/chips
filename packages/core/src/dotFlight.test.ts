import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DOT_FLIGHT_DEPART_MS,
  DOT_FLIGHT_MISS_MS,
  DOT_FLIGHT_SETTLE_MS,
  dotFlights,
} from "./dotFlight.js";
import { UPDATE_MOTION } from "./updates.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("dotFlights (ADR 0296, 17 November 2026)", () => {
  it("rests until the dot is pressed", () => {
    expect(dotFlights().now()).toEqual({ stage: "rest", id: 0 });
  });

  it("flies from the dot to the first button, lands, then rests", () => {
    const flights = dotFlights();
    const id = flights.takeOff();
    flights.from(id, { x: 200, y: 60 });
    flights.aim(id, { x: 330, y: 400 });
    expect(flights.now()).toEqual({
      stage: "up",
      id,
      from: { x: 200, y: 60 },
      to: { x: 330, y: 400 },
    });
    vi.advanceTimersByTime(UPDATE_MOTION.flyMs);
    flights.land(id);
    expect(flights.now()).toEqual({ stage: "landed", id });
    vi.advanceTimersByTime(DOT_FLIGHT_SETTLE_MS);
    expect(flights.now()).toEqual({ stage: "rest", id });
  });

  it("keeps the first place a button says, and drops answers to an older flight", () => {
    const flights = dotFlights();
    const old = flights.takeOff();
    const id = flights.takeOff();
    flights.aim(old, { x: 1, y: 1 });
    flights.from(old, { x: 1, y: 1 });
    flights.aim(id, { x: 330, y: 400 });
    flights.aim(id, { x: 9, y: 9 });
    expect(flights.now()).toEqual({ stage: "up", id, to: { x: 330, y: 400 } });
    flights.land(old);
    expect(flights.now().stage).toBe("up");
  });

  it("is missed when no button answers in time, so nothing waits unseen", () => {
    const flights = dotFlights();
    const id = flights.takeOff();
    flights.from(id, { x: 200, y: 60 });
    vi.advanceTimersByTime(UPDATE_MOTION.waitMs - 1);
    expect(flights.now().stage).toBe("up");
    vi.advanceTimersByTime(1);
    expect(flights.now()).toEqual({ stage: "missed", id });
    vi.advanceTimersByTime(DOT_FLIGHT_MISS_MS);
    expect(flights.now()).toEqual({ stage: "rest", id });
  });

  it("does not miss a flight that was answered and is on its way", () => {
    const flights = dotFlights();
    const id = flights.takeOff();
    vi.advanceTimersByTime(UPDATE_MOTION.waitMs - 100);
    flights.from(id, { x: 200, y: 60 });
    flights.aim(id, { x: 330, y: 400 });
    vi.advanceTimersByTime(UPDATE_MOTION.flyMs);
    expect(flights.now().stage).toBe("up");
    flights.land(id);
    expect(flights.now().stage).toBe("landed");
  });

  it("misses a flight that set off but never landed, once it should have", () => {
    const flights = dotFlights();
    const id = flights.takeOff();
    flights.aim(id, { x: 330, y: 400 });
    flights.depart(id);
    // A page held for a second mid-flight still lands it (Playwright's screenshots did that).
    vi.advanceTimersByTime(UPDATE_MOTION.flyMs + 1000);
    expect(flights.now().stage).toBe("up");
    vi.advanceTimersByTime(DOT_FLIGHT_DEPART_MS - 1000);
    expect(flights.now().stage).toBe("missed");
  });

  it("waits for a page busy opening About before the dot sets off, then gives it its whole flight", () => {
    // 17 November 2026: the web app held its thread for a second as About opened, and a wait
    // counted from the button's answer ran out while the dot was still on its way.
    const flights = dotFlights();
    const id = flights.takeOff();
    flights.from(id, { x: 1180, y: 14 });
    flights.aim(id, { x: 330, y: 400 });
    vi.advanceTimersByTime(DOT_FLIGHT_DEPART_MS - 100);
    flights.depart(id);
    vi.advanceTimersByTime(UPDATE_MOTION.flyMs);
    expect(flights.now()).toMatchObject({ stage: "up", flying: true });
    flights.land(id);
    expect(flights.now().stage).toBe("landed");
  });

  it("misses a flight answered whose layer never set off", () => {
    const flights = dotFlights();
    const id = flights.takeOff();
    flights.depart(id);
    expect(flights.now()).toEqual({ stage: "up", id });
    flights.aim(id, { x: 330, y: 400 });
    vi.advanceTimersByTime(DOT_FLIGHT_DEPART_MS);
    expect(flights.now().stage).toBe("missed");
  });

  it("is missed at once when About shows no button", () => {
    const flights = dotFlights();
    const id = flights.takeOff();
    flights.miss(id);
    expect(flights.now()).toEqual({ stage: "missed", id });
    flights.miss(id);
    flights.land(id);
    expect(flights.now().stage).toBe("missed");
  });

  it("tells its listeners each change, and stops when asked", () => {
    const flights = dotFlights();
    const heard: string[] = [];
    const stop = flights.subscribe(() => heard.push(flights.now().stage));
    const id = flights.takeOff();
    flights.from(id, { x: 0, y: 0 });
    flights.aim(id, { x: 1, y: 1 });
    flights.depart(id);
    flights.land(id);
    stop();
    vi.advanceTimersByTime(DOT_FLIGHT_SETTLE_MS);
    expect(heard).toEqual(["up", "up", "up", "up", "landed"]);
  });
});
