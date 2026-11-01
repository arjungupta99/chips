import { describe, expect, it } from "vitest";
import type { StoredEvent } from "../../application/ports/index.js";
import { createInProcessFanOut } from "./in-process-fanout.js";

const WS = "ws_01K4ZQPX000000000000000001";
const OTHER_WS = "ws_01K4ZQPX000000000000000009";
const CONV = "spc_01K4ZQPX000000000000000002";
const OTHER_CONV = "spc_01K4ZQPX00000000000000000A";

function event(seq: number, overrides: Partial<StoredEvent> = {}): StoredEvent {
  return {
    seq,
    workspace_id: WS,
    id: `evt_01K4ZQPX00000000000000000${seq}`,
    type: "checkpoint",
    ts: "2026-09-02T14:22:00.000Z",
    space_id: CONV,
    run_id: null,
    actor: { kind: "harness", id: "hrn_01K4ZQPX000000000000000004" },
    idempotency_key: null,
    payload: {},
    ...overrides,
  };
}

describe("fan-out", () => {
  it("delivers to a subscriber of the workspace", () => {
    const fanout = createInProcessFanOut();
    const seen: number[] = [];
    fanout.subscribe({ workspaceId: WS }, (e) => seen.push(e.seq));

    fanout.publish(event(1));
    fanout.publish(event(2));
    expect(seen).toEqual([1, 2]);
  });

  it("delivers in sequence order, because appends arrive one at a time", () => {
    const fanout = createInProcessFanOut();
    const seen: number[] = [];
    fanout.subscribe({ workspaceId: WS }, (e) => seen.push(e.seq));

    for (const seq of [1, 2, 3, 4, 5]) fanout.publish(event(seq));
    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });

  it("does not deliver another workspace's events", () => {
    const fanout = createInProcessFanOut();
    const seen: number[] = [];
    fanout.subscribe({ workspaceId: WS }, (e) => seen.push(e.seq));

    fanout.publish(event(1, { workspace_id: OTHER_WS }));
    expect(seen).toEqual([]);
  });

  it("narrows to the spaces a subscriber asked for", () => {
    const fanout = createInProcessFanOut();
    const seen: number[] = [];
    fanout.subscribe({ workspaceId: WS, spaceIds: [CONV] }, (e) => seen.push(e.seq));

    fanout.publish(event(1));
    fanout.publish(event(2, { space_id: OTHER_CONV }));
    expect(seen).toEqual([1]);
  });

  it("still delivers workspace-wide events to a narrowed subscriber", () => {
    // A policy change or a budget warning has no space of its own, and somebody
    // watching one space still needs to hear about it.
    const fanout = createInProcessFanOut();
    const seen: number[] = [];
    fanout.subscribe({ workspaceId: WS, spaceIds: [CONV] }, (e) => seen.push(e.seq));

    fanout.publish(event(1, { space_id: null, type: "policy.updated" }));
    expect(seen).toEqual([1]);
  });

  it("delivers to every subscriber of the same workspace", () => {
    const fanout = createInProcessFanOut();
    const first: number[] = [];
    const second: number[] = [];
    fanout.subscribe({ workspaceId: WS }, (e) => first.push(e.seq));
    fanout.subscribe({ workspaceId: WS }, (e) => second.push(e.seq));

    fanout.publish(event(1));
    expect(first).toEqual([1]);
    expect(second).toEqual([1]);
  });

  it("stops delivering once a subscription is cancelled", () => {
    const fanout = createInProcessFanOut();
    const seen: number[] = [];
    const cancel = fanout.subscribe({ workspaceId: WS }, (e) => seen.push(e.seq));

    fanout.publish(event(1));
    cancel();
    fanout.publish(event(2));
    expect(seen).toEqual([1]);
  });

  it("counts its subscribers, for the sockets metric", () => {
    const fanout = createInProcessFanOut();
    expect(fanout.subscriberCount()).toBe(0);

    const cancel = fanout.subscribe({ workspaceId: WS }, () => {});
    fanout.subscribe({ workspaceId: WS }, () => {});
    expect(fanout.subscriberCount()).toBe(2);

    cancel();
    expect(fanout.subscriberCount()).toBe(1);
  });

  it("treats cancelling twice as cancelling once", () => {
    const fanout = createInProcessFanOut();
    const cancel = fanout.subscribe({ workspaceId: WS }, () => {});
    cancel();
    cancel();
    expect(fanout.subscriberCount()).toBe(0);
  });
});
