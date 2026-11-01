/** A person's devices as You lists them (ADR 0085): the order, the fold, and the kind of each. */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deviceKind,
  lastSeenOf,
  SIGN_OUT_WAIT_MS,
  sortDevices,
  withdrawLeaving,
} from "./devices.js";
import type { PairedDeviceRecord, Snapshot } from "./store.js";

const NOW = Date.parse("2026-09-29T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

function device(name: string, over: Partial<PairedDeviceRecord> = {}): PairedDeviceRecord {
  return {
    deviceId: `dev_${name}`,
    name,
    pairedAt: ago(60),
    lastSeenAt: undefined,
    revokedAt: undefined,
    current: false,
    ...over,
  };
}

describe("deviceKind", () => {
  it.each([
    ["iPhone 17 Pro", "phone"],
    ["iPhone", "phone"],
    ["sdk_gphone64_arm64", "phone"],
    ["Pixel 9", "phone"],
    ["Arjun's iPad", "tablet"],
    ["iPad Pro 13-inch (M5)", "tablet"],
    ["Safari on iPad", "browser"],
    ["Chips for Mac", "computer"],
    ["Safari on Mac", "browser"],
    ["Safari on iPhone", "browser"],
    ["This browser", "browser"],
    ["Chrome on Windows", "browser"],
    ["chips CLI", "terminal"],
    ["Chips Glass QA", "other"],
  ])("%s is a %s", (name, kind) => {
    expect(deviceKind(name)).toBe(kind);
  });
});

describe("sortDevices", () => {
  it("puts this device first and the rest by when each was last seen", () => {
    const { recent } = sortDevices(
      [
        device("chips CLI", { lastSeenAt: ago(3) }),
        device("Safari on Mac", { lastSeenAt: ago(0.1) }),
        device("iPhone 17 Pro", { current: true, lastSeenAt: ago(9) }),
        device("Chips for Mac", { lastSeenAt: ago(1) }),
      ],
      NOW,
    );
    expect(recent.map((each) => each.name)).toEqual([
      "iPhone 17 Pro",
      "Safari on Mac",
      "Chips for Mac",
      "chips CLI",
    ]);
  });

  it("folds what has not been seen for a month, and never this device", () => {
    const { recent, stale } = sortDevices(
      [
        device("iPhone", { lastSeenAt: ago(40) }),
        device("This browser", { lastSeenAt: undefined, pairedAt: ago(45) }),
        device("Chips for Mac", { lastSeenAt: ago(29) }),
        device("iPhone 17 Pro", { current: true, lastSeenAt: ago(90) }),
      ],
      NOW,
    );
    expect(recent.map((each) => each.name)).toEqual(["iPhone 17 Pro", "Chips for Mac"]);
    expect(stale.map((each) => each.name)).toEqual(["iPhone", "This browser"]);
  });

  it("leaves out a device that was signed out", () => {
    const { recent, stale } = sortDevices(
      [
        device("Gone", { revokedAt: ago(1), lastSeenAt: ago(1) }),
        device("Kept", { lastSeenAt: ago(1) }),
      ],
      NOW,
    );
    expect([...recent, ...stale].map((each) => each.name)).toEqual(["Kept"]);
  });

  it("reads a device that never made a request as seen when it paired", () => {
    expect(lastSeenOf(device("New", { pairedAt: ago(2) }))).toBe(ago(2));
  });
});

describe("withdrawLeaving (Sign out)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A store whose withdrawal answers as `revoke` does, reached or not as `connection` says. */
  function leaving(connection: Snapshot["connection"], revoke: () => Promise<void>) {
    const asked: string[] = [];
    const store = {
      revokeDevice: (deviceId: string) => {
        asked.push(deviceId);
        return revoke();
      },
      getSnapshot: () => ({ connection }) as Snapshot,
    };
    return { store, asked };
  }
  const never = () => new Promise<void>(() => undefined);
  /** Settled by now, or still waiting: what a promise has done once pending work has run. */
  async function settled(promise: Promise<void>): Promise<boolean> {
    let done = false;
    void promise.then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    return done;
  }

  it("does not wait on a server it does not reach, and still asks it", async () => {
    vi.useFakeTimers();
    const { store, asked } = leaving("connecting", never);
    expect(await settled(withdrawLeaving(store, "dev_1"))).toBe(true);
    expect(asked).toEqual(["dev_1"]);
  });

  it("waits for a server it reaches to answer", async () => {
    vi.useFakeTimers();
    let answer: () => void = () => undefined;
    const { store } = leaving("open", () => new Promise((resolve) => (answer = resolve)));
    const leaves = withdrawLeaving(store, "dev_1");
    expect(await settled(leaves)).toBe(false);
    answer();
    expect(await settled(leaves)).toBe(true);
  });

  it("waits a server that reached but never answers only so long", async () => {
    vi.useFakeTimers();
    const { store } = leaving("open", never);
    const leaves = withdrawLeaving(store, "dev_1");
    await vi.advanceTimersByTimeAsync(SIGN_OUT_WAIT_MS - 1);
    expect(await settled(leaves)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await settled(leaves)).toBe(true);
  });

  it("leaves when the server refuses, as when it agrees", async () => {
    const { store } = leaving("open", async () => {
      throw new Error("refused");
    });
    await expect(withdrawLeaving(store, "dev_1")).resolves.toBeUndefined();
  });
});
