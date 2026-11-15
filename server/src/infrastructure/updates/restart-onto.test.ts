/**
 * A computer Chips for Mac carries starting again on the release the app now holds (everything in
 * step, phase 5; ADR 0298): only once the app holds a newer one, only with nothing going on, once.
 */

import { createLogger, manualClock } from "@chipschat/platform";
import { describe, expect, it } from "vitest";
import type { Busy } from "../store/harness-quiet.js";
import {
  RESTART_AGAIN_MS,
  RESTART_CHECK_MS,
  RESTART_STILL_MS,
  restartWatch,
} from "./restart-onto.js";

const logger = createLogger({ level: "silent" });

function computer(options: { onDisk?: string | undefined; busy?: Busy; version?: string } = {}) {
  const clock = manualClock(Date.UTC(2026, 10, 20, 15, 0));
  let restarts = 0;
  let onDisk = options.onDisk;
  let busy = options.busy;
  let askedSince: string | undefined;
  let breaks: "restart" | "quiet" | undefined;
  const watch = restartWatch({
    hands: {
      onDisk: () => onDisk,
      restart: () => {
        restarts += 1;
        if (breaks === "restart") throw new Error("launchctl isn't there");
      },
    },
    version: options.version ?? "1.2.5",
    quiet: async (since) => {
      askedSince = since;
      if (breaks === "quiet") throw new Error("the database is busy");
      return busy;
    },
    clock,
    logger,
  });
  return {
    watch,
    clock,
    restarts: () => restarts,
    askedSince: () => askedSince,
    tick: async (ms = RESTART_CHECK_MS) => {
      clock.advance(ms);
      watch.tick();
      await watch.settled();
    },
    setOnDisk: (value: string | undefined) => {
      onDisk = value;
    },
    setBusy: (value: Busy | undefined) => {
      busy = value;
    },
    breakAt: (value: "restart" | "quiet" | undefined) => {
      breaks = value;
    },
  };
}

describe("a computer in Chips for Mac starting again on the app's new release", () => {
  it("does nothing while the app holds the release it runs, or an older one", async () => {
    const mac = computer({ onDisk: "1.2.5" });
    await mac.tick();
    mac.setOnDisk("1.2.4");
    await mac.tick();
    mac.setOnDisk(undefined);
    await mac.tick();
    expect(mac.restarts()).toBe(0);
    expect(mac.watch.waiting()).toBeUndefined();
  });

  it("waits while anything is going on, then starts again once, at any hour", async () => {
    const mac = computer({ onDisk: "1.2.6", busy: "run" });
    expect(mac.watch.waiting()).toBe("1.2.6");
    await mac.tick();
    mac.setBusy("message");
    await mac.tick();
    expect(mac.restarts()).toBe(0);
    mac.setBusy(undefined);
    await mac.tick();
    expect(mac.restarts()).toBe(1);
    // Asked about the last five minutes.
    expect(Date.parse(mac.askedSince() ?? "")).toBe(mac.clock.nowMs() - RESTART_STILL_MS);
    await mac.tick();
    expect(mac.restarts()).toBe(1);
  });

  it("asks again an hour on, when it is still here: the restart didn't take", async () => {
    const mac = computer({ onDisk: "1.2.6" });
    await mac.tick();
    expect(mac.restarts()).toBe(1);
    await mac.tick(RESTART_AGAIN_MS - RESTART_CHECK_MS);
    expect(mac.restarts()).toBe(1);
    await mac.tick(RESTART_CHECK_MS);
    expect(mac.restarts()).toBe(2);
    // Still waiting on it, as About says.
    expect(mac.watch.waiting()).toBe("1.2.6");
  });

  it("lives through a restart that can't be run, and a look that fails", async () => {
    const mac = computer({ onDisk: "1.2.6" });
    mac.breakAt("quiet");
    await mac.tick();
    expect(mac.restarts()).toBe(0);
    // The next look, a minute on, is not held back by the one that failed.
    mac.breakAt("restart");
    await mac.tick();
    expect(mac.restarts()).toBe(1);
    mac.breakAt(undefined);
    await mac.tick(RESTART_AGAIN_MS);
    expect(mac.restarts()).toBe(2);
  });

  it("starts nothing twice while a look is still under way", async () => {
    const mac = computer({ onDisk: "1.2.6" });
    mac.clock.advance(RESTART_CHECK_MS);
    mac.watch.tick();
    mac.clock.advance(RESTART_CHECK_MS);
    mac.watch.tick();
    await mac.watch.settled();
    expect(mac.restarts()).toBe(1);
  });

  it("never starts again for a computer whose own release isn't a number, or a word in the app", async () => {
    const odd = computer({ onDisk: "1.2.6", version: "0.0.0-test" });
    await odd.tick();
    expect(odd.restarts()).toBe(0);
    const word = computer({ onDisk: "newest" });
    await word.tick();
    expect(word.restarts()).toBe(0);
  });

  it("looks at most once a minute", async () => {
    const mac = computer({ onDisk: "1.2.6", busy: "ask" });
    await mac.tick();
    mac.setBusy(undefined);
    await mac.tick(RESTART_CHECK_MS / 2);
    expect(mac.restarts()).toBe(0);
    await mac.tick(RESTART_CHECK_MS / 2);
    expect(mac.restarts()).toBe(1);
  });
});
