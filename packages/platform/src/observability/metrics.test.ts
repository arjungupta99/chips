import { describe, expect, it } from "vitest";
import { type ChipsInstruments, createInstruments, METER_NAME } from "./metrics.js";

describe("createInstruments", () => {
  it("names the meter after the product", () => {
    expect(METER_NAME).toBe("chips");
  });

  it("builds every instrument a runbook needs", () => {
    const instruments = createInstruments();
    const names: (keyof ChipsInstruments)[] = [
      "eventsAppended",
      "fanoutLatencyMs",
      "pendingApprovals",
      "approvalAgeSeconds",
      "socketsOpen",
      "jobQueueDepth",
    ];
    for (const name of names) expect(instruments[name]).toBeDefined();
  });

  it("records without an SDK registered, because none is by default", () => {
    const instruments = createInstruments("chips.test");
    expect(() => {
      instruments.eventsAppended.add(1, { workspace: "ws_1" });
      instruments.fanoutLatencyMs.record(12.5);
      instruments.pendingApprovals.add(1);
      instruments.pendingApprovals.add(-1);
      instruments.approvalAgeSeconds.record(3.2);
      instruments.socketsOpen.add(1);
      instruments.jobQueueDepth.add(4);
    }).not.toThrow();
  });
});
