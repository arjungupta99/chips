/**
 * A computer from the install line updating itself at night, when its owner said so (everything in
 * step, phase 6): only with a newer release out, between two and five, with nothing going on, once.
 */

import { createLogger, manualClock } from "@chipschat/platform";
import { describe, expect, it } from "vitest";
import type { SelfUpdateOutcome } from "../../application/ports/self-update.js";
import type { Busy } from "../store/harness-quiet.js";
import { NIGHT_AGAIN_MS, NIGHT_CHECK_MS, newestOf, nightUpdate } from "./night-update.js";

const logger = createLogger({ level: "silent" });
const HOUR = 60 * 60_000;

function computer(
  options: { automatic?: boolean; newest?: string | null; busy?: Busy; version?: string } = {},
) {
  const clock = manualClock(Date.UTC(2026, 10, 20, 0, 0));
  let started = 0;
  let last: SelfUpdateOutcome | undefined;
  let busy = options.busy;
  let automatic = options.automatic ?? true;
  let breaks: "start" | "quiet" | "switch" | undefined;
  const night = nightUpdate({
    selfUpdate: {
      start: () => {
        started += 1;
        if (breaks === "start") throw new Error("chips isn't there");
      },
      last: () => last,
    },
    switch: {
      current: async () => {
        if (breaks === "switch") throw new Error("the database is busy");
        return { automatic, setBy: null, setAt: null };
      },
      set: async () => undefined,
    },
    newest: () => (options.newest === null ? undefined : (options.newest ?? "1.2.6")),
    version: options.version ?? "1.2.5",
    quiet: async () => {
      if (breaks === "quiet") throw new Error("the database is busy");
      return busy;
    },
    clock,
    // Hours by the UTC clock, so the test doesn't hang on the machine's zone.
    hourOf: (ms) => new Date(ms).getUTCHours(),
    logger,
  });
  const at = async (hour: number) => {
    clock.set(Date.UTC(2026, 10, 20 + Math.floor(hour / 24), hour % 24, 30));
    night.tick();
    await night.settled();
  };
  return {
    at,
    started: () => started,
    tick: async (ms: number) => {
      clock.advance(ms);
      night.tick();
      await night.settled();
    },
    setLast: (value: SelfUpdateOutcome | undefined) => {
      last = value;
    },
    setBusy: (value: Busy | undefined) => {
      busy = value;
    },
    setAutomatic: (value: boolean) => {
      automatic = value;
    },
    breakAt: (value: "start" | "quiet" | "switch" | undefined) => {
      breaks = value;
    },
    clock,
    night,
  };
}

describe("a computer's update at night", () => {
  it("starts between two and five in the morning, once a night", async () => {
    const it = computer();
    await it.at(1);
    expect(it.started()).toBe(0);
    await it.at(3);
    expect(it.started()).toBe(1);
    await it.at(4);
    expect(it.started()).toBe(1);
    await it.at(5);
    expect(it.started()).toBe(1);
    // The next night, if it is still behind.
    await it.at(24 + 3);
    expect(it.started()).toBe(2);
    expect(NIGHT_AGAIN_MS).toBeLessThan(24 * HOUR);
  });

  it("starts nothing with the switch off, or with nothing newer out", async () => {
    const off = computer({ automatic: false });
    await off.at(3);
    expect(off.started()).toBe(0);
    off.setAutomatic(true);
    await off.tick(NIGHT_CHECK_MS);
    expect(off.started()).toBe(1);

    const current = computer({ newest: "1.2.5" });
    await current.at(3);
    expect(current.started()).toBe(0);
  });

  it("waits while anything is going on, or while an update is under way", async () => {
    const it = computer({ busy: "run" });
    await it.at(2);
    expect(it.started()).toBe(0);
    it.setBusy(undefined);
    it.setLast({ state: "updating", from: "1.2.5", at: "2026-11-20T02:00:00.000Z" });
    await it.tick(NIGHT_CHECK_MS);
    expect(it.started()).toBe(0);
    it.setLast({ state: "failed", from: "1.2.5", at: "2026-11-20T02:00:00.000Z", why: "x" });
    await it.tick(NIGHT_CHECK_MS);
    expect(it.started()).toBe(1);
  });

  it("looks at most every ten minutes", async () => {
    const it = computer({ busy: "message" });
    await it.at(3);
    it.setBusy(undefined);
    await it.tick(NIGHT_CHECK_MS - 1);
    expect(it.started()).toBe(0);
    await it.tick(1);
    expect(it.started()).toBe(1);
  });
});

describe("a computer's update at night, at its edges", () => {
  it("starts from two o'clock exactly and through the last minute before five, never at five", async () => {
    const at = async (hour: number, minute: number) => {
      const it = computer();
      it.clock.set(Date.UTC(2026, 10, 20, hour, minute));
      it.night.tick();
      await it.night.settled();
      return it.started();
    };
    expect(await at(1, 59)).toBe(0);
    expect(await at(2, 0)).toBe(1);
    expect(await at(4, 59)).toBe(1);
    expect(await at(5, 0)).toBe(0);
  });

  it("starts nothing before the feed has been read, or for a feed or a computer that names no release", async () => {
    const unread = computer({ newest: null });
    await unread.at(3);
    expect(unread.started()).toBe(0);
    const word = computer({ newest: "newest" });
    await word.at(3);
    expect(word.started()).toBe(0);
    const checkout = computer({ version: "0.0.0-test" });
    await checkout.at(3);
    expect(checkout.started()).toBe(0);
  });

  it("lives through a look that fails, and looks again ten minutes on", async () => {
    const it = computer();
    it.breakAt("switch");
    await it.at(3);
    expect(it.started()).toBe(0);
    it.breakAt("quiet");
    await it.tick(NIGHT_CHECK_MS);
    expect(it.started()).toBe(0);
    it.breakAt(undefined);
    await it.tick(NIGHT_CHECK_MS);
    expect(it.started()).toBe(1);
  });

  it("counts a start that couldn't be run as tonight's, and tries the next night", async () => {
    const it = computer();
    it.breakAt("start");
    await it.at(3);
    expect(it.started()).toBe(1);
    it.breakAt(undefined);
    await it.tick(NIGHT_CHECK_MS);
    expect(it.started()).toBe(1);
    await it.at(24 + 3);
    expect(it.started()).toBe(2);
  });

  it("starts nothing twice while a look is still under way", async () => {
    const it = computer();
    it.clock.set(Date.UTC(2026, 10, 20, 3, 0));
    it.night.tick();
    it.clock.advance(NIGHT_CHECK_MS);
    it.night.tick();
    await it.night.settled();
    expect(it.started()).toBe(1);
  });

  it("reads the hour off this machine's own clock when nobody says", async () => {
    const clock = manualClock(new Date(2026, 10, 20, 3, 0).getTime());
    let started = 0;
    const night = nightUpdate({
      selfUpdate: {
        start: () => {
          started += 1;
        },
        last: () => undefined,
      },
      switch: {
        current: async () => ({ automatic: true, setBy: null, setAt: null }),
        set: async () => undefined,
      },
      newest: () => "1.2.6",
      version: "1.2.5",
      quiet: async () => undefined,
      clock,
      logger,
    });
    night.tick();
    await night.settled();
    expect(started).toBe(1);
    // Noon here, whatever the zone.
    clock.set(new Date(2026, 10, 21, 12, 0).getTime());
    night.tick();
    await night.settled();
    expect(started).toBe(1);
  });
});

describe("the newest release a feed names", () => {
  it("is the latest by number, wherever it comes in the list", () => {
    expect(newestOf(["1.2.6", "1.2.10", "1.2.9"])).toBe("1.2.10");
    expect(newestOf(["1.2.5"])).toBe("1.2.5");
    expect(newestOf(["0.0.0"])).toBe("0.0.0");
  });

  it("is none among none, and leaves out what isn't a release's number", () => {
    expect(newestOf([])).toBeUndefined();
    expect(newestOf(["newest", "1.2"])).toBeUndefined();
    expect(newestOf(["newest", "1.2.6", "9.9.9-beta"])).toBe("1.2.6");
  });
});
