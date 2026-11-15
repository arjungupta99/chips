/**
 * What the computer says for the update dot and About, read and kept by the rules the apps share:
 * a failed read keeps the last answer, answers are kept in the order they were asked for, a switch
 * the computer wouldn't take goes back, and nothing is said once it is closed. Each call here is
 * held until the test lets it land, so the order things land in is the test's to choose.
 */

import { describe, expect, it } from "vitest";
import { type ComputerSays, NOTHING_SAID, readComputer } from "./computerSays.js";
import type { SelfUpdateFacts, Software } from "./inStep.js";
import type { ServerFacts } from "./store.js";

/** A call held until the test answers it. */
interface Held<T> {
  readonly resolve: (value: T) => void;
  readonly reject: (error: Error) => void;
}

function desk() {
  const asked = {
    server: [] as Held<ServerFacts>[],
    software: [] as Held<Software | undefined>[],
    night: [] as (Held<SelfUpdateFacts | undefined> & { readonly on: boolean })[],
    keep: [] as (Held<void> & { readonly harnessId: string; readonly on: boolean })[],
  };
  const hold = <T, More>(list: (Held<T> & More)[], more: More) =>
    new Promise<T>((resolve, reject) => {
      list.push({ resolve, reject, ...more });
    });
  const said: ComputerSays[] = [];
  const reader = readComputer(
    {
      serverFacts: () => hold(asked.server, {}),
      software: () => hold(asked.software, {}),
      setSelfUpdate: (on) => hold(asked.night, { on }),
      keepBridgeCurrent: (harnessId, on) => hold(asked.keep, { harnessId, on }),
    },
    (says) => said.push(says),
  );
  return {
    reader,
    asked,
    said,
    /** What is shown now: the last thing said, or nothing yet. */
    now: () => said.at(-1) ?? NOTHING_SAID,
  };
}

/** Lets what was answered land, and what it sets off go out. */
const landed = async () => {
  for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
};

const facts = (version: string, selfUpdate?: SelfUpdateFacts): ServerFacts => ({
  machine: "hetzner-box",
  version,
  publicUrl: "https://box",
  relay: { url: undefined, status: "off" },
  updates: { releases: [], appStore: version },
  ...(selfUpdate === undefined ? {} : { selfUpdate }),
});

const night = (automatic: boolean): SelfUpdateFacts => ({ available: true, automatic });

const runs = (keepCurrent: boolean, version = "1.0.31"): Software => ({
  harnesses: [
    {
      harnessId: "har_hermes",
      name: "chips-hermes",
      version,
      seenAt: "2026-11-13T00:00:00.000Z",
      keepCurrent,
    },
  ],
  devices: [],
});

const keeps = (says: ComputerSays) => says.software?.harnesses[0]?.keepCurrent;

describe("reading the computer", () => {
  it("says what the computer answered: its machine and version, the feed, and what runs", async () => {
    const d = desk();
    d.reader.read();
    await landed();
    expect(d.said).toEqual([]);
    d.asked.server[0]?.resolve(facts("1.2.5", night(false)));
    d.asked.software[0]?.resolve(runs(true));
    await landed();
    expect(d.now()).toEqual({
      computer: { kind: "read", facts: { machine: "hetzner-box", version: "1.2.5" } },
      feed: { releases: [], appStore: "1.2.5" },
      selfUpdate: night(false),
      software: runs(true),
    });
  });

  it("says the computer wasn't reached when its first read fails", async () => {
    const d = desk();
    d.reader.read();
    await landed();
    d.asked.server[0]?.reject(new Error("offline"));
    await landed();
    expect(d.now().computer).toEqual({ kind: "unreached" });
  });

  it("keeps what the last read said when a read fails", async () => {
    const d = desk();
    d.reader.read();
    await landed();
    d.asked.server[0]?.resolve(facts("1.2.5", night(true)));
    d.asked.software[0]?.resolve(runs(true));
    await landed();
    const before = d.now();

    d.reader.read();
    await landed();
    d.asked.server[1]?.reject(new Error("offline"));
    d.asked.software[1]?.reject(Object.assign(new Error("answered 503"), { status: 503 }));
    await landed();
    expect(d.now()).toEqual(before);
    expect(d.now().software).toEqual(runs(true));
  });

  it("knows nothing runs once the computer says it keeps no such list", async () => {
    const d = desk();
    d.reader.readSoftware();
    await landed();
    d.asked.software[0]?.resolve(runs(true));
    await landed();
    expect(d.now().software).toEqual(runs(true));
    // As the store answers for an older server's 404.
    d.reader.readSoftware();
    await landed();
    d.asked.software[1]?.resolve(undefined);
    await landed();
    expect(d.now().software).toBeUndefined();
  });

  it("keeps the answer asked for last when an earlier one lands after it", async () => {
    const d = desk();
    d.reader.read();
    d.reader.read();
    await landed();
    d.asked.server[1]?.resolve(facts("1.2.6"));
    d.asked.software[1]?.resolve(runs(true, "1.0.32"));
    await landed();
    d.asked.server[0]?.resolve(facts("1.2.5"));
    d.asked.software[0]?.resolve(runs(true, "1.0.31"));
    await landed();
    expect(d.now().computer).toMatchObject({ facts: { version: "1.2.6" } });
    expect(d.now().software?.harnesses[0]?.version).toBe("1.0.32");
  });

  it("says nothing more once it is closed, whatever lands", async () => {
    const d = desk();
    d.reader.read();
    await landed();
    d.reader.close();
    d.asked.server[0]?.resolve(facts("1.2.5", night(true)));
    d.asked.software[0]?.resolve(runs(true));
    await landed();
    expect(d.said).toEqual([]);
  });
});

describe("the night switch, turned", () => {
  /** A computer read with its night switch off. */
  const withNightOff = async () => {
    const d = desk();
    d.reader.read();
    await landed();
    d.asked.server[0]?.resolve(facts("1.2.5", night(false)));
    d.asked.software[0]?.resolve(undefined);
    await landed();
    return d;
  };

  it("shows at once, and stands as the computer answers", async () => {
    const d = await withNightOff();
    d.reader.setNightly(true);
    expect(d.now().selfUpdate?.automatic).toBe(true);
    await landed();
    expect(d.asked.night.map((each) => each.on)).toEqual([true]);
    d.asked.night[0]?.resolve({ ...night(true), restartsOnto: "1.2.6" });
    await landed();
    expect(d.now().selfUpdate).toEqual({ ...night(true), restartsOnto: "1.2.6" });
  });

  it("stands when an older computer answers with nothing it can read", async () => {
    const d = await withNightOff();
    d.reader.setNightly(true);
    await landed();
    d.asked.night[0]?.resolve(undefined);
    await landed();
    expect(d.now().selfUpdate).toEqual(night(true));
  });

  it("goes back when the computer wouldn't take it, though the read after fails too", async () => {
    const d = await withNightOff();
    d.reader.setNightly(true);
    await landed();
    d.asked.night[0]?.reject(new Error("offline"));
    await landed();
    expect(d.now().selfUpdate?.automatic).toBe(false);
    // It asked again, in case the computer moved; that read failing changes nothing.
    expect(d.asked.server).toHaveLength(2);
    d.asked.server[1]?.reject(new Error("offline"));
    await landed();
    expect(d.now().selfUpdate?.automatic).toBe(false);
    expect(d.now().computer.kind).toBe("read");
  });

  it("sends two quick turns one at a time, and the last is what shows", async () => {
    const d = await withNightOff();
    d.reader.setNightly(true);
    d.reader.setNightly(false);
    expect(d.now().selfUpdate?.automatic).toBe(false);
    await landed();
    // The second waits for the first's answer, so the computer takes them in order.
    expect(d.asked.night.map((each) => each.on)).toEqual([true]);
    d.asked.night[0]?.resolve(night(true));
    await landed();
    expect(d.now().selfUpdate?.automatic).toBe(false);
    expect(d.asked.night.map((each) => each.on)).toEqual([true, false]);
    d.asked.night[1]?.resolve(night(false));
    await landed();
    expect(d.now().selfUpdate?.automatic).toBe(false);
  });

  it("falls back to the turn the computer took when the one after it fails", async () => {
    const d = await withNightOff();
    d.reader.setNightly(true);
    d.reader.setNightly(false);
    await landed();
    d.asked.night[0]?.resolve(night(true));
    await landed();
    d.asked.night[1]?.reject(new Error("offline"));
    await landed();
    // On is what the computer holds: the first turn landed, the second never did.
    expect(d.now().selfUpdate?.automatic).toBe(true);
  });

  it("isn't put back by a read asked before the computer answered it", async () => {
    const d = await withNightOff();
    d.reader.read();
    d.reader.setNightly(true);
    await landed();
    d.asked.night[0]?.resolve(night(true));
    await landed();
    // The read went out while the switch was still off on the computer.
    d.asked.server[1]?.resolve(facts("1.2.6", night(false)));
    await landed();
    expect(d.now().selfUpdate?.automatic).toBe(true);
    // The rest of what it said is kept.
    expect(d.now().computer).toMatchObject({ facts: { version: "1.2.6" } });
  });

  it("stays as turned while a read lands before the computer has answered it", async () => {
    const d = await withNightOff();
    d.reader.setNightly(true);
    d.reader.read();
    await landed();
    d.asked.server[1]?.resolve(facts("1.2.5", night(false)));
    await landed();
    expect(d.now().selfUpdate?.automatic).toBe(true);
  });
});

describe("a bridge's switch, turned", () => {
  const withBridgeKept = async () => {
    const d = desk();
    d.reader.readSoftware();
    await landed();
    d.asked.software[0]?.resolve(runs(true));
    await landed();
    return d;
  };

  it("shows at once, and reads what runs again once the computer has taken it", async () => {
    const d = await withBridgeKept();
    d.reader.keepBridge("har_hermes", false);
    expect(keeps(d.now())).toBe(false);
    await landed();
    expect(d.asked.keep.map((each) => [each.harnessId, each.on])).toEqual([["har_hermes", false]]);
    d.asked.keep[0]?.resolve();
    await landed();
    expect(keeps(d.now())).toBe(false);
    expect(d.asked.software).toHaveLength(2);
    d.asked.software[1]?.resolve(runs(false, "1.0.31"));
    await landed();
    expect(d.now().software).toEqual(runs(false));
  });

  it("goes back when the computer wouldn't take it, though the read after fails too", async () => {
    const d = await withBridgeKept();
    d.reader.keepBridge("har_hermes", false);
    await landed();
    d.asked.keep[0]?.reject(new Error("offline"));
    await landed();
    expect(keeps(d.now())).toBe(true);
    d.asked.software[1]?.reject(new Error("offline"));
    await landed();
    expect(keeps(d.now())).toBe(true);
  });

  it("shows the last of two quick turns, whichever way the reads between them land", async () => {
    const d = await withBridgeKept();
    d.reader.keepBridge("har_hermes", false);
    d.reader.keepBridge("har_hermes", true);
    expect(keeps(d.now())).toBe(true);
    await landed();
    d.asked.keep[0]?.resolve();
    await landed();
    // The read after the first turn says off, as the computer then held it; on still shows.
    d.asked.software[1]?.resolve(runs(false));
    await landed();
    expect(keeps(d.now())).toBe(true);
    d.asked.keep[1]?.resolve();
    await landed();
    d.asked.software[2]?.resolve(runs(true));
    await landed();
    expect(keeps(d.now())).toBe(true);
  });

  it("isn't put back by a read asked before the computer took it", async () => {
    const d = await withBridgeKept();
    d.reader.readSoftware();
    d.reader.keepBridge("har_hermes", false);
    await landed();
    d.asked.keep[0]?.resolve();
    await landed();
    d.asked.software[1]?.resolve(runs(true));
    await landed();
    expect(keeps(d.now())).toBe(false);
  });
});
