/** What the banner says of a workspace behind the one in front (ADR 0197). */

import type { Device, Snapshot, Store } from "@chipschat/core";
import { describe, expect, it } from "vitest";
import type { BackgroundWorkspaces } from "../store/workspaces.js";
import { type Readings, SETTLE_MS, whatIsNew } from "./news.js";

const ARJUNS = {
  deviceId: "dev_arjuns",
  participantId: "usr_meera",
  workspaceName: "Arjun's workspace",
} as unknown as Device;

/** Arjun's workspace behind, with `waiting` runs ended in Japan trip, newest last. */
function behind(waiting: number, awaiting: number | undefined = 0): BackgroundWorkspaces {
  const snapshot = {
    model: {
      needsYou: Array.from({ length: waiting }, (_, at) => ({
        tier: "review",
        spaceId: "spc_japan",
        seq: at + 1,
        title: `Answer ${at + 1}`,
      })),
    },
    readState: {},
    ...(awaiting === undefined ? {} : { awaiting }),
  } as unknown as Snapshot;
  const store = { getSnapshot: () => snapshot } as unknown as Store;
  return {
    stores: new Map([["dev_arjuns", store]]),
    needs: { dev_arjuns: waiting },
    decides: { dev_arjuns: 0 },
  };
}

describe("what is new behind", () => {
  it("says nothing while the store loads, nor of what was waiting once it has", () => {
    const readings: Readings = {};
    // Before the hello, and while the hello's rooms come in: nothing is read.
    expect(whatIsNew(behind(0, undefined), [ARJUNS], readings, 0)).toBeUndefined();
    expect(whatIsNew(behind(2, 1), [ARJUNS], readings, 100)).toBeUndefined();
    expect(readings).toEqual({});
    // Every room in: the first reading, and older pages landing just after it.
    expect(whatIsNew(behind(3), [ARJUNS], readings, 200)).toBeUndefined();
    expect(whatIsNew(behind(5), [ARJUNS], readings, 200 + SETTLE_MS - 1)).toBeUndefined();
    expect(readings["dev_arjuns"]?.count).toBe(5);
  });

  it("says the newest thing once more waits than at the last reading", () => {
    const readings: Readings = {};
    whatIsNew(behind(5), [ARJUNS], readings, 0);
    expect(whatIsNew(behind(5), [ARJUNS], readings, SETTLE_MS)).toBeUndefined();
    expect(whatIsNew(behind(6), [ARJUNS], readings, SETTLE_MS + 10)).toEqual({
      deviceId: "dev_arjuns",
      workspace: "Arjun's workspace",
      words: "Answer 6",
      spaceId: "spc_japan",
    });
    // Read again, the same count is not news twice; fewer is not news at all.
    expect(whatIsNew(behind(6), [ARJUNS], readings, SETTLE_MS + 20)).toBeUndefined();
    expect(whatIsNew(behind(4), [ARJUNS], readings, SETTLE_MS + 30)).toBeUndefined();
  });

  it("starts again when the workspace comes back from the front, its store loaded all along", () => {
    const readings: Readings = {};
    const nobody: BackgroundWorkspaces = { stores: new Map(), needs: {}, decides: {} };
    whatIsNew(behind(5), [ARJUNS], readings, 0);
    // Brought forward, where two more came and were seen; then behind again, its rooms all in.
    whatIsNew(nobody, [ARJUNS], readings, SETTLE_MS);
    expect(readings).toEqual({});
    expect(whatIsNew(behind(7), [ARJUNS], readings, SETTLE_MS * 2)).toBeUndefined();
    expect(whatIsNew(behind(8), [ARJUNS], readings, SETTLE_MS * 3 + 10)?.words).toBe("Answer 8");
  });

  it("starts again when the store reconnects", () => {
    const readings: Readings = {};
    whatIsNew(behind(5), [ARJUNS], readings, 0);
    whatIsNew(behind(5, 1), [ARJUNS], readings, SETTLE_MS * 2);
    expect(whatIsNew(behind(7), [ARJUNS], readings, SETTLE_MS * 2 + 10)).toBeUndefined();
  });
});
