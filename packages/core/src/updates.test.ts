import { describe, expect, it } from "vitest";
import {
  appUpdateLine,
  asSentence,
  computerFollowsLine,
  DOT_GAP_MS,
  type DotSeen,
  type FeedRelease,
  isReleaseVersion,
  knownReleases,
  macUpdateLine,
  macUpdatesItself,
  readMacUpdate,
  readUpdateFeed,
  releaseTime,
  UPDATE_MOTION,
  type UpdateFacts,
  type UpdateFeed,
  updateButtonTimes,
  updateDot,
  updatesAsking,
  updatesWaiting,
} from "./updates.js";

const DAY = 24 * 60 * 60 * 1000;
/** 9:00 in California on a day of November 2026. */
const nov = (day: number) => Date.UTC(2026, 10, day, 17);

const feed = (releases: readonly FeedRelease[], appStore?: string): UpdateFeed => ({
  releases,
  appStore,
});
const quiet = (version: string, date: string): FeedRelease => ({ version, date, line: "Fixes." });
const big = (version: string, date: string): FeedRelease => ({
  ...quiet(version, date),
  dot: true,
});

const on = (facts: UpdateFacts, now: number, seen?: DotSeen) =>
  updateDot(facts, { now, enabled: true, seen });

describe("updatesWaiting", () => {
  it("says nothing waits when the app and the computer are on the newest release", () => {
    const facts: UpdateFacts = {
      device: "phone",
      app: "9.0.0",
      computer: "9.0.0",
      owner: true,
      feed: feed([big("9.0.0", "2026-12-01")], "9.0.0"),
    };
    expect(updatesWaiting(facts)).toEqual({ app: undefined, computer: undefined });
  });

  it("offers the phone the App Store's version, not the newest computer release", () => {
    const facts: UpdateFacts = {
      device: "phone",
      app: "9.0.0",
      owner: false,
      feed: feed([big("9.1.0", "2026-12-01")], "9.0.0"),
    };
    expect(updatesWaiting(facts).app).toBeUndefined();
    expect(
      updatesWaiting({ ...facts, feed: feed([big("9.1.0", "2026-12-01")], "9.1.0") }).app,
    ).toEqual({ version: "9.1.0", from: "9.0.0" });
  });

  it("offers Chips for Mac the newest release, and a browser nothing of its own", () => {
    const releases = feed([big("9.1.0", "2026-12-01")]);
    expect(
      updatesWaiting({ device: "mac", app: "9.0.0", owner: false, feed: releases }).app,
    ).toEqual({ version: "9.1.0", from: "9.0.0" });
    expect(
      updatesWaiting({ device: "browser", app: "9.0.0", owner: false, feed: releases }).app,
    ).toBeUndefined();
  });

  it("tells only the owner that the computer is behind this app or a release", () => {
    const facts: UpdateFacts = { device: "phone", app: "9.1.0", computer: "9.0.0", owner: true };
    expect(updatesWaiting(facts).computer).toEqual({ version: "9.1.0", from: "9.0.0" });
    expect(updatesWaiting({ ...facts, owner: false }).computer).toBeUndefined();
    expect(
      updatesWaiting({
        device: "browser",
        app: "9.0.0",
        computer: "9.0.0",
        owner: true,
        feed: feed([quiet("9.0.1", "2026-12-01")]),
      }).computer,
    ).toEqual({ version: "9.0.1", from: "9.0.0" });
  });

  it("leaves out a computer run from its source, which says 0.0.0", () => {
    expect(isReleaseVersion("0.0.0")).toBe(false);
    expect(
      updatesWaiting({ device: "phone", app: "9.1.0", computer: "0.0.0", owner: true }).computer,
    ).toBeUndefined();
  });

  it("knows the releases the app was built with and those the feed adds, newest first", () => {
    const known = knownReleases(feed([quiet("99.0.1", "2027-01-02"), big("99.0.0", "2027-01-01")]));
    expect(known.slice(0, 2).map((each) => each.version)).toEqual(["99.0.1", "99.0.0"]);
    expect(known.some((each) => each.version === "1.0.0")).toBe(true);
  });
});

describe("updateDot", () => {
  const facts: UpdateFacts = {
    device: "mac",
    app: "9.0.0",
    owner: false,
    feed: feed([big("9.1.0", "2026-11-10")]),
  };

  it("lights two days after a release that asks for it, and names the version", () => {
    expect(on(facts, nov(11))).toBeUndefined();
    expect(on(facts, nov(12))).toEqual({ version: "9.1.0" });
  });

  it("stays out for a release of fixes, which shows in About only", () => {
    expect(on({ ...facts, feed: feed([quiet("9.0.1", "2026-11-01")]) }, nov(20))).toBeUndefined();
    expect(
      updatesWaiting({ ...facts, feed: feed([quiet("9.0.1", "2026-11-01")]) }).app,
    ).toBeDefined();
  });

  it("names the newest version when fixes follow the release that lit it", () => {
    const later = {
      ...facts,
      feed: feed([quiet("9.1.1", "2026-11-11"), big("9.1.0", "2026-11-10")]),
    };
    expect(on(later, nov(12))).toEqual({ version: "9.1.1" });
  });

  it("goes out once About is opened, and waits two weeks before a newer release lights it", () => {
    const seen = { version: "9.1.0", at: nov(12) };
    expect(on(facts, nov(13), seen)).toBeUndefined();
    const next = { ...facts, feed: feed([big("9.2.0", "2026-11-14"), big("9.1.0", "2026-11-10")]) };
    expect(on(next, nov(17), seen)).toBeUndefined();
    expect(on(next, nov(12) + DOT_GAP_MS, seen)).toEqual({ version: "9.2.0" });
  });

  it("goes out when the update is installed", () => {
    expect(on({ ...facts, app: "9.1.0" }, nov(20))).toBeUndefined();
  });

  it("is off on a device where the person turned it off", () => {
    expect(updateDot(facts, { now: nov(20), enabled: false })).toBeUndefined();
  });

  it("lights for the computer from the release the phone itself is", () => {
    // The phone is 1.2.4, which asks for the dot (RELEASES), and the computer still runs 1.2.3.
    const phone: UpdateFacts = { device: "phone", app: "1.2.4", computer: "1.2.3", owner: true };
    expect(on(phone, Date.UTC(2026, 10, 14, 17))).toEqual({ version: "1.2.4" });
    expect(on({ ...phone, owner: false }, Date.UTC(2026, 10, 14, 17))).toBeUndefined();
  });

  it("names the newer version when this app and the computer both light it", () => {
    // The phone is offered 9.1.0 by the App Store; the computer is behind the newer 9.2.0.
    const both: UpdateFacts = {
      device: "phone",
      app: "9.0.0",
      computer: "9.0.0",
      owner: true,
      feed: feed([big("9.2.0", "2026-11-10"), big("9.1.0", "2026-11-05")], "9.1.0"),
    };
    expect(updatesWaiting(both)).toEqual({
      app: { version: "9.1.0", from: "9.0.0" },
      computer: { version: "9.2.0", from: "9.0.0" },
    });
    expect(on(both, nov(20))).toEqual({ version: "9.2.0" });
  });

  it("stays out when About was last opened for a version newer than what waits", () => {
    // Seen at 9.2.0 on a Mac since updated past it; what waits now is older than that.
    const seen = { version: "9.2.0", at: nov(1) };
    expect(on(facts, nov(1) + DOT_GAP_MS + DAY, seen)).toBeUndefined();
    expect(on(facts, nov(1) + DOT_GAP_MS + DAY)).toEqual({ version: "9.1.0" });
  });

  it("lights for a settled release and names the newest, with a later one still settling", () => {
    // 9.1.0 has been out a week; 9.2.0 came out this morning and asks for the dot too.
    const settling = {
      ...facts,
      feed: feed([big("9.2.0", "2026-11-17"), big("9.1.0", "2026-11-10")]),
    };
    expect(on(settling, nov(17))).toEqual({ version: "9.2.0" });
    // With nothing settled before it, the new release waits its two days.
    expect(
      on({ ...facts, feed: feed([big("9.2.0", "2026-11-17")]) }, nov(17) + DAY),
    ).toBeUndefined();
  });

  it("would have lit twice from 1 to 30 November 2026, opening About each time", () => {
    // Chips for Mac installed at 1.0.0 on 1 November, the feed holding the releases as they came out.
    const lit: string[] = [];
    let seen: DotSeen | undefined;
    for (let day = 1; day <= 30; day += 1) {
      const now = nov(day);
      const out = knownReleases(undefined).filter(
        (each) => Date.parse(`${each.date}T08:00:00Z`) <= now,
      );
      const dot = updateDot(
        { device: "mac", app: "1.0.0", owner: false, feed: { releases: out } },
        { now, enabled: true, seen },
      );
      if (dot !== undefined && dot.version !== seen?.version) {
        lit.push(`${day} Nov ${dot.version}`);
        seen = { version: dot.version, at: now };
      }
    }
    expect(lit).toEqual(["6 Nov 1.1.0", "20 Nov 1.4.0"]);
    expect(DAY).toBeGreaterThan(0);
  });
});

describe("readUpdateFeed", () => {
  it("reads the server's updates, and nothing from a server older than the field", () => {
    expect(
      readUpdateFeed({
        releases: [
          { version: "1.2.4", date: "2026-11-11", line: "Pause.", dot: true },
          { version: "x", date: "y" },
        ],
        app_store: "1.2.0",
        checked_at: "2026-11-12T08:01:00.000Z",
      }),
    ).toEqual({
      releases: [{ version: "1.2.4", date: "2026-11-11", line: "Pause.", dot: true }],
      appStore: "1.2.0",
    });
    expect(readUpdateFeed({ releases: [], app_store: null })).toEqual({ releases: [] });
    expect(readUpdateFeed(undefined)).toBeUndefined();
  });

  it("leaves out what isn't a release, and reads nothing from what isn't a feed", () => {
    expect(
      readUpdateFeed({
        releases: [
          { version: "1.2.5", date: "2026-11-20" },
          { version: "1.2.4", date: "11 November", line: "No day." },
          { version: "1.2.3", line: "No date at all." },
          { version: "1.2.2", date: "2026-11-09", line: 7, dot: "yes" },
          null,
          "1.2.1",
        ],
        app_store: "soon",
      }),
    ).toEqual({
      releases: [
        { version: "1.2.5", date: "2026-11-20", line: "" },
        { version: "1.2.2", date: "2026-11-09", line: "" },
      ],
    });
    for (const not of [null, "feed", 7, {}, { releases: "none" }, { releases: { a: 1 } }]) {
      expect(readUpdateFeed(not)).toBeUndefined();
    }
  });

  it("knows the day a release came out, and nothing of a day that isn't one", () => {
    expect(releaseTime("2026-11-11")).toBe(Date.UTC(2026, 10, 11, 8));
    expect(releaseTime("2026-11")).toBeUndefined();
    expect(releaseTime("soon")).toBeUndefined();
    expect(releaseTime("")).toBeUndefined();
  });

  it("adds the feed's releases to the app's own, newest first, and none that isn't a release", () => {
    const known = knownReleases(
      {
        releases: [
          { version: "9.9.8", date: "2027-01-02", line: "Older of the two." },
          { version: "0.0.0", date: "2027-01-03", line: "From a checkout." },
          { version: "9.9.9", date: "2027-01-04", line: "Newest." },
        ],
      },
      "1.2.4",
    );
    expect(known.slice(0, 2).map((each) => each.version)).toEqual(["9.9.9", "9.9.8"]);
    expect(known.some((each) => each.version === "0.0.0")).toBe(false);
    // The app's own releases stop at its version: it knows of none newer by itself.
    expect(knownReleases(undefined, "1.2.4")[0]?.version).toBe("1.2.4");
  });

  it("says where this app's update is: the App Store on a phone, ready on a Mac", () => {
    const waiting = { version: "1.2.4", from: "1.2.0" };
    expect(appUpdateLine("phone", waiting)).toBe("1.2.0 · 1.2.4 is on the App Store");
    expect(appUpdateLine("mac", waiting)).toBe("1.2.0 · 1.2.4 is ready");
  });
});

describe("Chips for Mac updating itself (ADR 0298)", () => {
  const facts: UpdateFacts = {
    device: "mac",
    app: "9.0.0",
    owner: false,
    feed: feed([big("9.1.0", "2026-11-10")]),
  };

  it("lights no dot for an app that gets its update itself, and does again once that fails", () => {
    expect(on({ ...facts, appUpdatesItself: true }, nov(20))).toBeUndefined();
    expect(updatesWaiting({ ...facts, appUpdatesItself: true }).app).toBeDefined();
    expect(on({ ...facts, appUpdatesItself: false }, nov(20))).toEqual({ version: "9.1.0" });
    // A computer of its own, from the install line, still lights it for its owner.
    const owned = { ...facts, appUpdatesItself: true, owner: true, computer: "9.0.0" };
    expect(on(owned, nov(20))).toEqual({ version: "9.1.0" });
  });

  it("lights no dot for a computer Chips for Mac carries, which follows the app", () => {
    const carried: UpdateFacts = {
      ...facts,
      appUpdatesItself: true,
      owner: true,
      computer: "9.0.0",
      computerFollowsApp: true,
    };
    expect(on(carried, nov(20))).toBeUndefined();
    // About still says what is out for it, and that it asks nothing of anyone.
    expect(updatesWaiting(carried).computer).toEqual({ version: "9.1.0", from: "9.0.0" });
    expect(updatesAsking(carried)).toEqual({ app: undefined, computer: undefined });
    expect(computerFollowsLine({ version: "9.1.0", from: "9.0.0" })).toBe(
      "9.0.0 · 9.1.0 comes with Chips for Mac",
    );
    // Seen from the owner's phone, whose own update still asks them.
    const phone: UpdateFacts = {
      device: "phone",
      app: "9.0.0",
      computer: "9.0.0",
      owner: true,
      computerFollowsApp: true,
      feed: feed([big("9.1.0", "2026-11-10")], "9.1.0"),
    };
    expect(updatesAsking(phone)).toEqual({
      app: { version: "9.1.0", from: "9.0.0" },
      computer: undefined,
    });
    expect(on({ ...phone, feed: feed([big("9.1.0", "2026-11-10")]) }, nov(20))).toBeUndefined();
  });

  it("reads what the app says, and nothing it can't", () => {
    expect(readMacUpdate({ state: "ready", version: "1.2.6" })).toEqual({
      state: "ready",
      version: "1.2.6",
    });
    expect(readMacUpdate({ state: "failed", version: "1.2.6", why: "No room." })).toEqual({
      state: "failed",
      version: "1.2.6",
      why: "No room.",
    });
    expect(readMacUpdate({ state: "off" })).toEqual({ state: "off" });
    expect(readMacUpdate({ state: "ready" })).toBeUndefined();
    expect(readMacUpdate(undefined)).toBeUndefined();
    expect(macUpdatesItself({ state: "current" })).toBe(true);
    expect(macUpdatesItself({ state: "failed", version: "1.2.6", why: "x" })).toBe(false);
    expect(macUpdatesItself({ state: "off" })).toBe(false);
  });

  it("reads a release that waits for an administrator's password, which asks the person", () => {
    const asks = readMacUpdate({ state: "ready", version: "1.2.6", asks: true });
    expect(asks).toEqual({ state: "ready", version: "1.2.6", asks: true });
    expect(macUpdatesItself(asks)).toBe(false);
    expect(macUpdatesItself({ state: "ready", version: "1.2.6" })).toBe(true);
    // Only `true` asks; on anything but a release ready it is nothing.
    expect(readMacUpdate({ state: "ready", version: "1.2.6", asks: "yes" })).toEqual({
      state: "ready",
      version: "1.2.6",
    });
    expect(readMacUpdate({ state: "getting", version: "1.2.6", asks: true })).toEqual({
      state: "getting",
      version: "1.2.6",
    });
    expect(macUpdateLine(asks, { version: "1.2.6", from: "1.2.5" }, "1.2.5")).toBe(
      "Chips 1.2.6 is ready. Restart now to install it: this Mac asks for an administrator's password.",
    );
  });

  it("reads a failure that gives no reason as a failure, and says it without one", () => {
    const failed = readMacUpdate({ state: "failed", version: "1.2.6" });
    expect(failed).toEqual({ state: "failed", version: "1.2.6", why: "" });
    expect(macUpdatesItself(failed)).toBe(false);
    expect(macUpdateLine(failed, undefined, "1.2.5")).toBe(
      "Couldn't update to 1.2.6. Still on 1.2.5.",
    );
    // A reason that came without its full stop is given one.
    expect(
      macUpdateLine({ state: "failed", version: "1.2.6", why: "No room" }, undefined, "1.2.5"),
    ).toBe("Couldn't update to 1.2.6. No room. Still on 1.2.5.");
    expect(asSentence("  ")).toBe("");
    expect(asSentence("Try again!")).toBe("Try again!");
  });

  it("reads nothing from junk", () => {
    for (const junk of [null, 7, "ready", [], {}, { state: "installing", version: "1.2.6" }]) {
      expect(readMacUpdate(junk)).toBeUndefined();
    }
    expect(readMacUpdate({ state: "ready", version: "soon" })).toBeUndefined();
    expect(readMacUpdate({ state: "failed", version: 126, why: "x" })).toBeUndefined();
    expect(readMacUpdate({ state: "getting" })).toBeUndefined();
  });

  it("says how its update stands under its row", () => {
    const waiting = { version: "1.2.6", from: "1.2.5" };
    expect(macUpdateLine({ state: "ready", version: "1.2.6" }, waiting, "1.2.5")).toBe(
      "Chips 1.2.6 is ready. It installs when you quit, or tonight.",
    );
    expect(macUpdateLine({ state: "getting", version: "1.2.6" }, waiting, "1.2.5")).toBe(
      "1.2.5 · Getting 1.2.6",
    );
    expect(
      macUpdateLine({ state: "failed", version: "1.2.6", why: "No room." }, waiting, "1.2.5"),
    ).toBe("Couldn't update to 1.2.6. No room. Still on 1.2.5.");
    expect(macUpdateLine({ state: "current" }, waiting, "1.2.5")).toBe(
      "1.2.5 · 1.2.6 is out, and comes on its own",
    );
    expect(macUpdateLine({ state: "current" }, undefined, "1.2.5")).toBeUndefined();
    // An app that doesn't update itself says what it always said.
    expect(macUpdateLine(undefined, waiting, "1.2.5")).toBe("1.2.5 · 1.2.6 is ready");
  });
});

describe("updateButtonTimes (ADR 0296, 17 November 2026)", () => {
  it("grows the first button as the dot lands and each under it a beat later", () => {
    expect(updateButtonTimes(0).growAt).toBe(0);
    expect(updateButtonTimes(1).growAt).toBe(UPDATE_MOTION.growBeatMs);
  });

  it("passes the light over both once they have grown, the first first", () => {
    const first = updateButtonTimes(0);
    const second = updateButtonTimes(1);
    expect(first.sweepAt).toBeGreaterThan(second.growAt + UPDATE_MOTION.growMs / 2);
    expect(second.sweepAt - first.sweepAt).toBe(UPDATE_MOTION.sweepBeatMs);
  });

  it("starts each glow after its light, so a button never glows and sweeps at once", () => {
    for (const order of [0, 1]) {
      const at = updateButtonTimes(order);
      expect(at.glowAt).toBe(at.sweepAt + UPDATE_MOTION.glowAfterMs);
    }
  });

  it("lands the dot before it would have gone out waiting", () => {
    expect(UPDATE_MOTION.flyMs).toBeLessThan(UPDATE_MOTION.waitMs);
  });
});
