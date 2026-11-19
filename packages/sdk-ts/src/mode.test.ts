/** The mode a person picked for a harness's sessions, while it holds (Chips ADR 0300). */

import type { PolicyMode } from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModeWatch, modeHolds } from "./mode.js";

const NOW = Date.parse("2026-11-19T10:00:00.000Z");
const HARNESS = "hrn_01KDEM00000000000000000001";

const updated = (mode: PolicyMode | null | undefined, extra: Record<string, unknown> = {}) => ({
  type: "policy.updated",
  harness_id: HARNESS,
  policy: { autonomy: 1, rules: [], ...(mode === undefined ? {} : { mode }) },
  ...extra,
});

describe("the mode a person picked", () => {
  let said: (PolicyMode | undefined)[];
  let watch: ModeWatch;
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    said = [];
    watch = new ModeWatch({ now: () => Date.now(), changed: (mode) => said.push(mode) });
  });
  afterEach(() => {
    watch.stop();
    vi.useRealTimers();
  });

  it("holds until its end, and is nothing after", () => {
    const mode = { id: "auto", until: "2026-11-19T11:00:00.000Z" };
    expect(modeHolds(mode, NOW)).toBe(mode);
    expect(modeHolds(mode, Date.parse(mode.until))).toBeUndefined();
    expect(modeHolds({ id: "auto" }, NOW + 1e12)).toEqual({ id: "auto" });
    expect(modeHolds(undefined, NOW)).toBeUndefined();
  });

  it("is said from the hello, and said again as nothing when its time is up", () => {
    watch.fromHello({ mode: { id: "auto", until: "2026-11-19T11:00:00.000Z" } });
    expect(said).toEqual([]);
    vi.advanceTimersByTime(0);
    expect(said).toEqual([{ id: "auto", until: "2026-11-19T11:00:00.000Z" }]);
    expect(watch.current?.id).toBe("auto");

    vi.advanceTimersByTime(3_600_000);
    expect(said.at(-1)).toBeUndefined();
    expect(said).toHaveLength(2);
    expect(watch.current).toBeUndefined();
  });

  it("follows this harness's changes for every space, and nothing else", () => {
    watch.fromHello({});
    vi.advanceTimersByTime(0);
    expect(said).toEqual([]);

    watch.heard(updated({ id: "acceptEdits" }), HARNESS);
    vi.advanceTimersByTime(0);
    expect(said).toEqual([{ id: "acceptEdits" }]);

    // Another harness's, one room's, and one that leaves the mode as it was change nothing.
    watch.heard(updated({ id: "bypassPermissions" }, { harness_id: "hrn_other" }), HARNESS);
    watch.heard(updated({ id: "bypassPermissions" }, { space_id: "spc_x" }), HARNESS);
    watch.heard(updated(undefined), HARNESS);
    vi.advanceTimersByTime(0);
    expect(said).toEqual([{ id: "acceptEdits" }]);

    watch.heard(updated(null), HARNESS);
    vi.advanceTimersByTime(0);
    expect(said).toEqual([{ id: "acceptEdits" }, undefined]);
  });

  it("says only where a replay's changes end up", () => {
    watch.fromHello({ mode: { id: "auto" } });
    watch.heard(updated({ id: "bypassPermissions" }), HARNESS);
    watch.heard(updated(null), HARNESS);
    watch.heard(updated({ id: "auto" }), HARNESS);
    vi.advanceTimersByTime(0);
    expect(said).toEqual([{ id: "auto" }]);
  });

  it("is never said for a mode whose end has already passed", () => {
    watch.fromHello({ mode: { id: "auto", until: "2026-11-19T09:00:00.000Z" } });
    vi.advanceTimersByTime(0);
    expect(said).toEqual([]);
    expect(watch.current).toBeUndefined();
  });
});
