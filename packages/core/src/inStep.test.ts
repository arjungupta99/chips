/**
 * Everything in step, what people see (ADR 0297): the words and the rules the phone, the iPad,
 * the Mac and the web share.
 */

import { describe, expect, it } from "vitest";
import {
  aboutRowLit,
  type BridgeUpdate,
  bridgeLine,
  computerFollowsApp,
  computerLine,
  DEVICE_SEEN_MS,
  type HarnessSoftware,
  type NeedsUpdateRow,
  needsUpdate,
  nightFoot,
  ownerDotKey,
  ownerDotLit,
  PUT_BACK_SHOWN_MS,
  readSelfUpdate,
  readSoftware,
  restartsOntoLine,
  type Software,
  sameNeeds,
  showsBridgeSwitch,
} from "./inStep.js";

const NOW = Date.parse("2026-11-20T18:00:00.000Z");
const ago = (hours: number) => new Date(NOW - hours * 60 * 60 * 1000).toISOString();

const hermes = (update?: Partial<BridgeUpdate>, rest: Partial<HarnessSoftware> = {}) =>
  ({
    harnessId: "har_hermes",
    name: "chips-hermes",
    version: "1.0.31",
    seenAt: ago(1),
    keepCurrent: true,
    ...(update === undefined
      ? {}
      : {
          bridgeUpdate: {
            package: "@chipschat/hermes",
            running: "1.0.31",
            phase: "current",
            since: ago(2),
            ...update,
          },
        }),
    ...rest,
  }) as HarnessSoftware;

const line = (harness: HarnessSoftware) => bridgeLine(harness, { name: "Hermes", now: NOW });

describe("reading GET /v1/software", () => {
  it("keeps what it can read and leaves out the rest", () => {
    const software = readSoftware({
      harnesses: [
        {
          harness_id: "har_hermes",
          name: "chips-hermes",
          version: "1.0.31",
          seen_at: ago(1),
          changed_at: ago(9),
          bridge_update: {
            package: "@chipschat/hermes",
            running: "1.0.31",
            phase: "refused",
            since: ago(2),
            target: "1.0.32",
            reason: "room",
          },
        },
        {
          harness_id: "har_x",
          name: "chips-acp",
          version: "1.0.2",
          seen_at: ago(1),
          keep_current: false,
          release_out: "1.0.3",
        },
        { name: "no id" },
      ],
      devices: [
        {
          device_id: "dev_1",
          person_id: "par_n",
          name: "chips-iphone",
          version: "1.1.0",
          seen_at: ago(3),
        },
        { device_id: "dev_2" },
      ],
    });
    expect(software.harnesses).toEqual([
      expect.objectContaining({
        harnessId: "har_hermes",
        keepCurrent: true,
        bridgeUpdate: expect.objectContaining({
          phase: "refused",
          reason: "room",
          target: "1.0.32",
        }),
      }),
      expect.objectContaining({ harnessId: "har_x", keepCurrent: false, releaseOut: "1.0.3" }),
    ]);
    expect(software.devices).toHaveLength(1);
    expect(readSoftware(undefined)).toEqual({ harnesses: [], devices: [] });
  });

  it("reads how a bridge's last update went, and nothing from one it can't make out", () => {
    const harness = (bridge_update: unknown) =>
      readSoftware({
        harnesses: [
          {
            harness_id: "har_hermes",
            name: "chips-hermes",
            version: "1.0.30",
            seen_at: ago(1),
            bridge_update,
          },
        ],
      }).harnesses[0];
    const update = { package: "@chipschat/hermes", running: "1.0.30", phase: "current" };
    const last = { outcome: "put-back", from: "1.0.30", to: "1.0.31", at: ago(3) };
    expect(
      harness({ ...update, since: ago(2), last: { ...last, reason: "no-return" } })?.bridgeUpdate,
    ).toEqual({ ...update, since: ago(2), last: { ...last, reason: "no-return" } });
    // No reason given, and no release it is going to: neither is made up.
    expect(harness({ ...update, since: ago(2), last })?.bridgeUpdate).toEqual({
      ...update,
      since: ago(2),
      last,
    });
    // An outcome this app doesn't know, or one missing where it went: the update stands without it.
    for (const not of [{ ...last, outcome: "sideways" }, { ...last, to: "" }, "updated", null]) {
      expect(harness({ ...update, since: ago(2), last: not })?.bridgeUpdate).toEqual({
        ...update,
        since: ago(2),
      });
    }
    // Refused for its harness: the oldest release of it the bridge release works with comes too.
    const refused = { ...update, phase: "refused", target: "1.0.31", reason: "harness" };
    expect(harness({ ...refused, since: ago(2), needs: "0.9.0" })?.bridgeUpdate).toEqual({
      ...refused,
      since: ago(2),
      needs: "0.9.0",
    });
    // A phase this app doesn't know, or no time: nothing is said of its updates at all.
    expect(harness({ ...update, phase: "pondering", since: ago(2) })?.bridgeUpdate).toBeUndefined();
    expect(harness(update)?.bridgeUpdate).toBeUndefined();
    expect(harness("soon")?.bridgeUpdate).toBeUndefined();
  });
});

describe("a bridge's line on its harness page", () => {
  it("says the release it runs and when it updated", () => {
    expect(
      line(hermes({ last: { outcome: "updated", from: "1.0.30", to: "1.0.31", at: ago(30) } })),
    ).toMatchObject({
      tone: "fine",
      label: "Bridge 1.0.31",
      sub: "Updated 19 November, at a quiet moment.",
    });
    expect(line(hermes({}))).toMatchObject({
      tone: "fine",
      sub: "Kept up to date by this computer.",
    });
  });

  it("names the year of an update from another year, and no day for a time it can't read", () => {
    const updated = (at: string) =>
      line(hermes({ last: { outcome: "updated", from: "1.0.30", to: "1.0.31", at } }))?.sub;
    expect(updated("2025-12-30T12:00:00.000Z")).toBe(
      "Updated 30 December 2025, at a quiet moment.",
    );
    expect(updated("some time ago")).not.toContain("NaN");
    expect(updated("some time ago")).not.toContain("undefined");
  });

  it("says nothing of a harness that names no release of a bridge", () => {
    // One connected by hand from a checkout says 0.0.0: newer or older than nothing.
    expect(line(hermes(undefined, { version: "0.0.0", releaseOut: "1.0.31" }))).toBeUndefined();
    expect(line(hermes(undefined, { version: "main" }))).toBeUndefined();
  });

  it("is working while it waits or starts, and needs no one", () => {
    expect(line(hermes({ phase: "waiting", target: "1.0.32" }))).toMatchObject({
      tone: "working",
      label: "1.0.32 is ready",
      sub: "Waiting for a quiet moment, when nothing is going on for Hermes.",
    });
    expect(line(hermes({ phase: "watching", target: "1.0.32" }))).toMatchObject({
      tone: "working",
      label: "Starting 1.0.32",
      sub: "Back in a moment. If it doesn't come back, 1.0.31 goes back on.",
    });
  });

  it("needs the owner when it couldn't update, until the week it skips that release is out", () => {
    const putBack = {
      outcome: "put-back" as const,
      from: "1.0.31",
      to: "1.0.32",
      at: ago(24),
      reason: "no-return",
    };
    expect(line(hermes({ last: putBack }))).toMatchObject({
      tone: "needs",
      label: "Couldn't update to 1.0.32",
      sub: "It didn't come back, so 1.0.31 is back on. Chips tries again when the next release is out.",
    });
    expect(line(hermes({ last: { ...putBack, at: ago(8 * 24) } }))?.tone).toBe("fine");
    // In its first day it kept stopping, or its first turns all failed: said as that.
    expect(line(hermes({ last: { ...putBack, reason: "exits" } }))).toMatchObject({
      tone: "needs",
      sub: "It kept stopping, so 1.0.31 is back on. Chips tries again when the next release is out.",
      short: "Couldn't update to 1.0.32: it kept stopping. Still on 1.0.31.",
    });
    expect(line(hermes({ last: { ...putBack, reason: "turns" } }))).toMatchObject({
      sub: "Its first turns failed, so 1.0.31 is back on. Chips tries again when the next release is out.",
      short: "Couldn't update to 1.0.32: its first turns failed. Still on 1.0.31.",
    });
    // A word for it this app doesn't know, as from a newer computer, reads as the first one.
    expect(line(hermes({ last: { ...putBack, reason: "something-new" } }))?.short).toBe(
      "Couldn't update to 1.0.32: it didn't come back. Still on 1.0.31.",
    );
    expect(line(hermes({ phase: "refused", target: "1.0.32", reason: "room" }))).toMatchObject({
      tone: "needs",
      sub: "This computer's disk is full. Still on 1.0.31.",
      short: "Couldn't update to 1.0.32: this computer's disk is full. Still on 1.0.31.",
    });
    // The harness behind it is older than the release works with: the owner's to update.
    expect(
      line(hermes({ phase: "refused", target: "1.0.32", reason: "harness", needs: "0.9.0" })),
    ).toEqual({
      tone: "needs",
      label: "Couldn't update to 1.0.32",
      sub: "It needs Hermes 0.9.0 or newer. Still on 1.0.31.",
      short: "Couldn't update to 1.0.32: it needs Hermes 0.9.0 or newer. Still on 1.0.31.",
    });
    expect(line(hermes({ phase: "refused", target: "1.0.32", reason: "harness" }))?.sub).toBe(
      "It needs a newer Hermes. Still on 1.0.31.",
    );
    // npm out of reach passes: Chips tries again, and nobody is asked.
    expect(line(hermes({ phase: "refused", target: "1.0.32", reason: "registry" }))?.tone).toBe(
      "working",
    );
  });

  it("says updates are off and what is out, from the switch even before the computer reviews", () => {
    expect(line(hermes({ phase: "off", target: "1.0.32" }))).toMatchObject({
      tone: "needs",
      label: "Updates are off",
      sub: "Bridge 1.0.31 · 1.0.32 is out.",
    });
    expect(
      line(hermes({ phase: "waiting", target: "1.0.32" }, { keepCurrent: false }))?.label,
    ).toBe("Updates are off");
    expect(line(hermes({}, { keepCurrent: false }))).toMatchObject({
      tone: "fine",
      sub: "Updates are off.",
    });
  });

  it("gives a bridge kept elsewhere the line to run where it runs", () => {
    expect(line(hermes(undefined, { version: "1.0.29", releaseOut: "1.0.31" }))).toMatchObject({
      tone: "needs",
      label: "Bridge 1.0.29 · 1.0.31 is out",
      command: "chips connect --update",
    });
    expect(line(hermes(undefined))).toMatchObject({ tone: "fine", label: "Bridge 1.0.31" });
    expect(line(hermes(undefined, { name: "chips-harness", version: "0.0.0" }))).toBeUndefined();
  });

  it("says only that it couldn't, for a reason this app doesn't know", () => {
    // As a newer computer would say it: `readSoftware` keeps the refusal and drops the reason.
    const software = readSoftware({
      harnesses: [
        {
          harness_id: "har_hermes",
          name: "chips-hermes",
          version: "1.0.31",
          seen_at: ago(1),
          bridge_update: {
            package: "@chipschat/hermes",
            running: "1.0.31",
            phase: "refused",
            since: ago(2),
            target: "1.0.32",
            reason: "quarantined",
          },
        },
      ],
    });
    const harness = software.harnesses[0];
    expect(harness && line(harness)).toEqual({
      tone: "needs",
      label: "Couldn't update to 1.0.32",
      sub: "Still on 1.0.31.",
      short: "Couldn't update to 1.0.32. Still on 1.0.31.",
    });
    // No reason at all reads the same: nothing is said of npm, and nothing promised.
    expect(line(hermes({ phase: "refused", target: "1.0.32" }))?.sub).toBe("Still on 1.0.31.");
  });

  it("forgets a put-back once the bridge runs something else", () => {
    const putBack = { outcome: "put-back" as const, from: "1.0.30", to: "1.0.31", at: ago(24) };
    // It went back to 1.0.30 a day ago and has since reached 1.0.31: nothing to say of it.
    expect(line(hermes({ last: putBack }))).toMatchObject({
      tone: "fine",
      label: "Bridge 1.0.31",
      sub: "Kept up to date by this computer.",
    });
    expect(PUT_BACK_SHOWN_MS).toBeGreaterThan(24 * 60 * 60 * 1000);
  });

  it("goes on starting a release it had begun when the switch was turned off", () => {
    expect(
      line(hermes({ phase: "watching", target: "1.0.32" }, { keepCurrent: false })),
    ).toMatchObject({ tone: "working", label: "Starting 1.0.32" });
  });

  it("says only that updates are off for a release it refused with the switch off", () => {
    expect(
      line(hermes({ phase: "refused", target: "1.0.32", reason: "room" }, { keepCurrent: false })),
    ).toEqual({
      tone: "fine",
      label: "Bridge 1.0.31",
      sub: "Updates are off.",
      short: "Updates are off.",
    });
  });

  it("shows the switch to the owner, for a bridge this computer keeps", () => {
    expect(showsBridgeSwitch(hermes({}), true)).toBe(true);
    expect(showsBridgeSwitch(hermes({}), false)).toBe(false);
    expect(showsBridgeSwitch(hermes(undefined), true)).toBe(false);
  });
});

describe("About's Needs update list", () => {
  const feed = {
    releases: [{ version: "2.0.0", date: "2026-11-15", line: "" }],
    appStore: "2.0.0",
  };
  const software: Software = {
    harnesses: [
      hermes({ phase: "refused", target: "1.0.32", reason: "room" }),
      hermes({ phase: "waiting", target: "1.0.32" }, { harnessId: "har_quiet" }),
      hermes(undefined, {
        harnessId: "har_claw",
        name: "chips-openclaw",
        version: "1.0.29",
        releaseOut: "1.0.31",
      }),
    ],
    devices: [
      {
        deviceId: "dev_n",
        personId: "par_n",
        name: "chips-iphone",
        version: "1.1.0",
        seenAt: ago(5),
      },
      {
        deviceId: "dev_s",
        personId: "par_s",
        name: "chips-ipad",
        version: "2.0.0",
        seenAt: ago(5),
      },
      {
        deviceId: "dev_me",
        personId: "par_me",
        name: "chips-iphone",
        version: "1.2.0",
        seenAt: ago(1),
      },
      {
        deviceId: "dev_mac",
        personId: "par_me",
        name: "chips-mac",
        version: "1.2.4",
        seenAt: ago(1),
      },
      {
        deviceId: "dev_web",
        personId: "par_s",
        name: "chips-web",
        version: "1.0.0",
        seenAt: ago(1),
      },
      {
        deviceId: "dev_old",
        personId: "par_s",
        name: "chips-iphone",
        version: "1.0.0",
        seenAt: new Date(NOW - DEVICE_SEEN_MS - 1).toISOString(),
      },
    ],
  };
  const rows = () =>
    needsUpdate({
      software,
      feed,
      now: NOW,
      me: "par_me",
      thisDevice: "dev_me",
      harnessName: (id) => ({ har_hermes: "Hermes", har_quiet: "Codex", har_claw: "OpenClaw" })[id],
      personName: (id) => ({ par_n: "Natalie", par_s: "Sam" })[id],
    });

  it("lists bridges that need someone, then devices older than what is out, by whose they are", () => {
    expect(rows().map((row) => [row.label, row.sub])).toEqual([
      [
        "Hermes bridge",
        "Couldn't update to 1.0.32: this computer's disk is full. Still on 1.0.31.",
      ],
      ["OpenClaw bridge", "1.0.29 · 1.0.31 is out. It needs a line run where it runs."],
      ["Natalie's iPhone", "Chips 1.1.0 · 2.0.0 is on the App Store"],
      ["Your Mac", "Chips 1.2.4 · 2.0.0 is out"],
    ]);
    expect(rows()[0]).toMatchObject({ kind: "bridge", harnessId: "har_hermes" });
  });

  it("lights the owner's dot for a bridge, never for someone's phone, and for a night that failed", () => {
    const key = ownerDotKey(rows(), undefined);
    expect(key).toContain("bridge:har_hermes");
    expect(key).not.toContain("device:");
    const devicesOnly = rows().filter((row) => row.kind === "device");
    expect(ownerDotKey(devicesOnly, undefined)).toBeUndefined();
    const failed = readSelfUpdate({
      available: true,
      automatic: true,
      last: { state: "failed", from: "1.2.5", at: ago(10), why: "x" },
    });
    expect(ownerDotKey(devicesOnly, failed)).toBe(`night:${ago(10)}`);
  });
});

describe("About's Needs update list, at its edges", () => {
  const feed = {
    releases: [{ version: "1.2.5", date: "2026-11-15", line: "" }],
    appStore: "1.2.5",
  };
  const device = (deviceId: string, personId: string, name: string) => ({
    deviceId,
    personId,
    name,
    version: "1.2.0",
    seenAt: ago(2),
  });
  const rows = (software: Software | undefined) =>
    needsUpdate({
      software,
      feed,
      now: NOW,
      me: "par_me",
      thisDevice: "dev_me",
      harnessName: (id) => (id === "har_hermes" ? "Hermes" : undefined),
      personName: (id) => (id === "par_n" ? "Natalie" : undefined),
    });

  it("lists nothing until the computer has said what everything runs", () => {
    expect(rows(undefined)).toEqual([]);
  });

  it("calls your own second device yours, and a device whose person is gone someone's", () => {
    const said = rows({
      harnesses: [],
      devices: [
        device("dev_me", "par_me", "chips-iphone"),
        device("dev_pad", "par_me", "chips-ipad"),
        device("dev_gone", "par_gone", "chips-iphone"),
      ],
    });
    expect(said.map((row) => row.label)).toEqual(["Someone's iPhone", "Your iPad"]);
  });

  it("leaves out a bridge whose harness is gone", () => {
    const said = rows({
      harnesses: [
        hermes({ phase: "refused", target: "1.0.32", reason: "room" }, { harnessId: "har_gone" }),
        hermes({ phase: "refused", target: "1.0.32", reason: "room" }),
      ],
      devices: [],
    });
    expect(said.map((row) => row.harnessId)).toEqual(["har_hermes"]);
  });
});

describe("the owner's dot", () => {
  const row = (key: string, kind: "bridge" | "device" = "bridge"): NeedsUpdateRow => ({
    key,
    kind,
    label: key,
    sub: "",
  });

  it("stays out when one of two things it was put out for is fixed", () => {
    const both = ownerDotKey([row("bridge:har_a:x"), row("bridge:har_b:y")], undefined);
    const one = ownerDotKey([row("bridge:har_b:y")], undefined);
    expect(ownerDotLit(both, undefined)).toBe(true);
    // About opened with both showing: seen. Hermes fixed leaves the other, which was seen too.
    expect(ownerDotLit(both, both)).toBe(false);
    expect(ownerDotLit(one, both)).toBe(false);
    expect(ownerDotLit(undefined, both)).toBe(false);
  });

  it("lights again only for something that wasn't there when About put it out", () => {
    const seen = ownerDotKey([row("bridge:har_a:x")], undefined);
    const more = ownerDotKey([row("bridge:har_a:x"), row("bridge:har_c:z")], undefined);
    expect(ownerDotLit(more, seen)).toBe(true);
    // The same bridge with something else to say is something new.
    expect(ownerDotLit(ownerDotKey([row("bridge:har_a:w")], undefined), seen)).toBe(true);
  });

  it("lights for a failed night only while the night switch is on", () => {
    const last = { state: "failed", from: "1.2.5", at: ago(10), why: "x" };
    const on = readSelfUpdate({ available: true, automatic: true, last });
    const off = readSelfUpdate({ available: true, automatic: false, last });
    expect(ownerDotKey([], on)).toBe(`night:${ago(10)}`);
    expect(ownerDotKey([], off)).toBeUndefined();
  });

  it("gives About Chips its small dot for what asks someone, or a bridge, never a device", () => {
    expect(aboutRowLit({}, [])).toBe(false);
    expect(aboutRowLit({ app: { version: "1.2.6", from: "1.2.5" } }, [])).toBe(true);
    expect(aboutRowLit({ computer: { version: "1.2.6", from: "1.2.5" } }, [])).toBe(true);
    expect(aboutRowLit({}, [row("bridge:har_a:x")])).toBe(true);
    expect(aboutRowLit({}, [row("device:dev_n:1.2.5", "device")])).toBe(false);
  });

  it("knows two lists that say the same, so a screen keeps the one it drew", () => {
    expect(sameNeeds([row("a"), row("b")], [row("a"), row("b")])).toBe(true);
    expect(sameNeeds([row("a")], [row("a"), row("b")])).toBe(false);
    expect(sameNeeds([row("a")], [{ ...row("a"), label: "Renamed bridge" }])).toBe(false);
  });
});

describe("the night switch", () => {
  const self = (last?: unknown, automatic = true) =>
    readSelfUpdate({ available: true, automatic, ...(last === undefined ? {} : { last }) });
  /** Times by the reader's own clock, in November 2026, whatever zone the test runs in. */
  const local = (day: number, hour: number, minute = 0) =>
    new Date(2026, 10, day, hour, minute).toISOString();
  /** Ten in the morning on 20 November. */
  const MORNING = new Date(2026, 10, 20, 10).getTime();

  it("reads the computer's own update, and nothing from a server older than it", () => {
    expect(self({ state: "updated", from: "1.2.5", to: "1.2.6", at: ago(5) })).toEqual({
      available: true,
      automatic: true,
      last: { state: "updated", from: "1.2.5", to: "1.2.6", at: ago(5) },
    });
    expect(readSelfUpdate(undefined)).toBeUndefined();
  });

  it("reads the release a computer in Chips for Mac starts again on (ADR 0298)", () => {
    expect(readSelfUpdate({ available: false, automatic: false, restarts_onto: "1.2.6" })).toEqual({
      available: false,
      automatic: false,
      restartsOnto: "1.2.6",
    });
    expect(readSelfUpdate({ available: false, restarts_onto: "soon" })).toEqual({
      available: false,
      automatic: false,
    });
    expect(restartsOntoLine("1.2.6")).toBe("Starts again on 1.2.6 when nothing is going on");
  });

  it("reads a computer Chips for Mac carries, which follows the app and needs nobody", () => {
    const carried = readSelfUpdate({ available: false, automatic: false, with_app: true });
    expect(carried).toEqual({ available: false, automatic: false, withApp: true });
    expect(computerFollowsApp(carried)).toBe(true);
    // Waiting to start again on the app's release is following it too.
    expect(computerFollowsApp(readSelfUpdate({ available: false, restarts_onto: "1.2.6" }))).toBe(
      true,
    );
    // Anything but `true` is a computer of its own, as is a server older than the field.
    const own = readSelfUpdate({ available: true, automatic: true, with_app: "yes" });
    expect(own).toEqual({ available: true, automatic: true });
    expect(computerFollowsApp(own)).toBe(false);
    expect(computerFollowsApp(undefined)).toBe(false);
  });

  it("says under the computer's row what waits for it, and whether anyone has to act", () => {
    const waiting = { version: "1.2.6", from: "1.2.5" };
    const carried = readSelfUpdate({ available: false, with_app: true });
    const starting = readSelfUpdate({ available: false, with_app: true, restarts_onto: "1.2.6" });
    expect(computerLine(waiting, carried)).toBe("1.2.5 · 1.2.6 comes with Chips for Mac");
    expect(computerLine(waiting, starting)).toBe("Starts again on 1.2.6 when nothing is going on");
    // The app has updated and nothing newer is out: it still says it starts again.
    expect(computerLine(undefined, starting)).toBe(
      "Starts again on 1.2.6 when nothing is going on",
    );
    expect(computerLine(waiting, self(undefined, false))).toBe("1.2.5 · 1.2.6 is out");
    expect(computerLine(waiting, undefined)).toBe("1.2.5 · 1.2.6 is out");
    expect(computerLine(undefined, carried)).toBeUndefined();
  });

  it("says what it does, and how the last night went", () => {
    const off = self(undefined, false);
    expect(off && nightFoot(off, "hetzner-box", NOW)).toBe(
      "With this on, hetzner-box updates itself between 2 and 5 in the morning when nothing is going on. The bridges on it update on their own either way.",
    );
    const on = self();
    expect(on && nightFoot(on, "hetzner-box", NOW)).toBe(
      "hetzner-box updates itself between 2 and 5 in the morning when a newer release is out and nothing is going on.",
    );
    const failed = self({
      state: "failed",
      from: "1.2.5",
      at: local(20, 3, 10),
      why: "Could not download the release's signature.",
    });
    expect(failed && nightFoot(failed, "hetzner-box", MORNING)).toBe(
      "Couldn't update last night. Could not download the release's signature. Still on 1.2.5. It tries again tonight.",
    );
    const updated = self({ state: "updated", from: "1.2.5", to: "1.2.6", at: local(20, 3, 10) });
    expect(updated && nightFoot(updated, "hetzner-box", MORNING)).toBe(
      "Updated to 1.2.6 last night.",
    );
    const updating = self({ state: "updating", from: "1.2.5", at: local(20, 9, 59) });
    expect(updating && nightFoot(updating, "hetzner-box", MORNING)).toBe("Updating now.");
  });

  const updatedAt = (at: string, now: number) => {
    const facts = self({ state: "updated", from: "1.2.5", to: "1.2.6", at });
    return facts && nightFoot(facts, "hetzner-box", now);
  };

  it("says when by the reader's clock: last night, today, yesterday, or the day", () => {
    // Before six this morning is last night.
    expect(updatedAt(local(20, 5, 59), MORNING)).toBe("Updated to 1.2.6 last night.");
    // `chips update` run by hand at three this afternoon is today, not last night.
    const evening = new Date(2026, 10, 20, 17).getTime();
    expect(updatedAt(local(20, 15), evening)).toBe("Updated to 1.2.6 today.");
    expect(updatedAt(local(20, 6), MORNING)).toBe("Updated to 1.2.6 today.");
    // From six yesterday evening is last night; earlier yesterday is yesterday.
    expect(updatedAt(local(19, 23, 30), MORNING)).toBe("Updated to 1.2.6 last night.");
    expect(updatedAt(local(19, 18), MORNING)).toBe("Updated to 1.2.6 last night.");
    expect(updatedAt(local(19, 15), MORNING)).toBe("Updated to 1.2.6 yesterday.");
    expect(updatedAt(local(19, 3), MORNING)).toBe("Updated to 1.2.6 yesterday.");
    // Before that, the day.
    expect(updatedAt(local(12, 3), MORNING)).toBe("Updated to 1.2.6 on 12 November.");
    expect(updatedAt(local(18, 23), MORNING)).toBe("Updated to 1.2.6 on 18 November.");
  });

  it("goes without a when for a time it can't read", () => {
    expect(updatedAt("soon", MORNING)).toBe("Updated to 1.2.6.");
    const failed = self({ state: "failed", from: "1.2.5", at: "soon", why: "No network." }, false);
    expect(failed && nightFoot(failed, "hetzner-box", MORNING)).toBe(
      "Couldn't update. No network. Still on 1.2.5.",
    );
  });

  it("closes the computer's reason with a full stop when it came without one", () => {
    const foot = (why?: string) => {
      const facts = self(
        {
          state: "failed",
          from: "1.2.5",
          at: local(20, 15),
          ...(why === undefined ? {} : { why }),
        },
        false,
      );
      return facts && nightFoot(facts, "hetzner-box", new Date(2026, 10, 20, 17).getTime());
    };
    expect(foot("No network")).toBe("Couldn't update today. No network. Still on 1.2.5.");
    expect(foot("No network. ")).toBe("Couldn't update today. No network. Still on 1.2.5.");
    expect(foot("Is the disk full?")).toBe(
      "Couldn't update today. Is the disk full? Still on 1.2.5.",
    );
    expect(foot()).toBe("Couldn't update today. Still on 1.2.5.");
  });
});
