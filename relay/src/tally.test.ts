/**
 * A relay's day, counted with a clock the test turns: distinct servers, the ones a phone reached,
 * sessions, the most at once and the bytes each way; written when the day ends and when the relay
 * stops, and begun again with what is still connected. What is written is numbers: no key. And a
 * day holds only so many keys, however many a stranger proves.
 */

import { describe, expect, it } from "vitest";
import { createTally, type DayCounts, MOST_KEYS } from "./tally.js";

const at = (iso: string) => Date.parse(iso);

/** A switchboard's view, set by the test: each listed key and its open sessions. */
function harness(start: string) {
  let now = at(start);
  const here = new Map<string, number>();
  const written: DayCounts[] = [];
  const tally = createTally({
    clock: () => now,
    stats: () => ({
      servers: here.size,
      sessions: [...here.values()].reduce((sum, open) => sum + open, 0),
    }),
    listing: () => here.entries(),
    write: (counts) => written.push(counts),
  });
  return {
    tally,
    here,
    written,
    to: (iso: string) => {
      now = at(iso);
    },
    /** What the switchboard does before it tells the tally. */
    list: (key: string) => {
      here.set(key, here.get(key) ?? 0);
      tally.listed(key);
    },
    open: (key: string) => {
      here.set(key, (here.get(key) ?? 0) + 1);
      tally.opened(key);
    },
    close: (key: string) => here.set(key, (here.get(key) ?? 1) - 1),
    unlist: (key: string) => here.delete(key),
  };
}

describe("a relay's day", () => {
  it("counts servers once each, the ones a phone reached, sessions, the most at once and bytes", () => {
    const day = harness("2026-10-20T00:00:00.000Z");
    day.to("2026-10-20T08:00:00.000Z");
    day.list("server-a");
    day.list("server-b");
    day.open("server-a");
    day.open("server-a");
    day.tally.moved("to_server", 100);
    day.tally.moved("to_client", 2500);
    day.tally.pushed(3);
    day.close("server-a");
    day.close("server-a");
    day.unlist("server-b");
    // A server back after a restart is the same server.
    day.list("server-b");
    day.open("server-b");

    day.to("2026-10-21T00:00:30.000Z");
    day.tally.tick();
    expect(day.written).toEqual([
      {
        day: "2026-10-20",
        from: "2026-10-20T00:00:00.000Z",
        to: "2026-10-21T00:00:00.000Z",
        servers: 2,
        reached: 2,
        sessions: 3,
        peak_servers: 2,
        peak_sessions: 2,
        bytes_to_servers: 100,
        bytes_to_phones: 2500,
        pushes: 3,
      },
    ]);
  });

  it("begins the next day with whoever is still connected", () => {
    const day = harness("2026-10-20T23:00:00.000Z");
    day.list("server-a");
    day.list("server-b");
    day.open("server-b");
    day.tally.moved("to_client", 10);

    // Past midnight, the next thing that happens writes yesterday first.
    day.to("2026-10-21T00:05:00.000Z");
    day.tally.moved("to_client", 7);
    day.to("2026-10-21T09:00:00.000Z");
    day.tally.stop();

    expect(day.written.map(({ day: which, from, to }) => [which, from, to])).toEqual([
      ["2026-10-20", "2026-10-20T23:00:00.000Z", "2026-10-21T00:00:00.000Z"],
      ["2026-10-21", "2026-10-21T00:00:00.000Z", "2026-10-21T09:00:00.000Z"],
    ]);
    expect(day.written[1]).toMatchObject({
      servers: 2,
      reached: 1,
      sessions: 0,
      peak_servers: 2,
      peak_sessions: 1,
      bytes_to_phones: 7,
    });
  });

  it("writes a day it slept through, and the stretch so far when it stops", () => {
    const day = harness("2026-10-20T12:00:00.000Z");
    day.list("server-a");
    day.to("2026-10-22T06:00:00.000Z");
    day.tally.tick();
    expect(day.written.map((counts) => [counts.day, counts.servers])).toEqual([
      ["2026-10-20", 1],
      ["2026-10-21", 1],
    ]);
    day.unlist("server-a");
    day.tally.stop();
    expect(day.written.at(-1)).toMatchObject({
      day: "2026-10-22",
      from: "2026-10-22T00:00:00.000Z",
      to: "2026-10-22T06:00:00.000Z",
      servers: 1,
    });
  });

  it("writes numbers and never a key", () => {
    const key = "SH5G9wwyEZxFDBEToD7AEcc6bknDuv0y-NOhRkLV3x0";
    const day = harness("2026-10-20T10:00:00.000Z");
    day.list(key);
    day.open(key);
    day.tally.stop();
    const said = JSON.stringify(day.written);
    expect(said).not.toContain(key);
    for (const [name, value] of Object.entries(day.written[0] ?? {})) {
      if (!["day", "from", "to"].includes(name)) expect(typeof value).toBe("number");
    }
  });

  it("holds at most so many keys a day, and says the day saw at least that many (SEC-54)", () => {
    const day = harness("2026-10-20T10:00:00.000Z");
    // A stranger on a relay with no list, proving a new key each time and dropping it.
    for (let i = 0; i <= MOST_KEYS; i += 1) day.tally.listed(`stranger-${i}`);
    day.tally.opened("stranger-0");
    day.to("2026-10-21T10:00:00.000Z");
    day.list("server-a");
    day.tally.stop();

    expect(day.written[0]).toMatchObject({
      day: "2026-10-20",
      servers: MOST_KEYS,
      reached: 1,
      at_least: ["servers"],
    });
    // The next day starts empty, and counts as any other.
    expect(day.written[1]).toMatchObject({ day: "2026-10-21", servers: 1 });
    expect(day.written[1]).not.toHaveProperty("at_least");
  });
});
