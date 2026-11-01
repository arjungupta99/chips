/**
 * The workspaces in the background (M5.3): a store for each that is not in front and not
 * muted, closed when it comes to the front, is muted, or is forgotten; and what each needs,
 * counted as its snapshots arrive.
 */

import type { Device, Snapshot, Store } from "@chipschat/core";
import { buildModel } from "@chipschat/core";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const made = vi.hoisted(() => ({
  stores: [] as { device: Device; store: FakeStore }[],
}));

interface FakeStore extends Store {
  readonly closed: boolean;
  readonly push: (needs: number) => void;
}

vi.mock("@chipschat/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chipschat/core")>();
  return {
    ...actual,
    createStore: ({ device }: { device: Device }) => {
      const listeners = new Set<(snapshot: Snapshot) => void>();
      let snapshot = empty();
      const store = {
        closed: false,
        push(needs: number) {
          snapshot = withNeeds(needs);
          for (const listener of listeners) listener(snapshot);
        },
        subscribe(listener: (snapshot: Snapshot) => void) {
          listeners.add(listener);
          listener(snapshot);
          return () => listeners.delete(listener);
        },
        getSnapshot: () => snapshot,
        close() {
          (store as { closed: boolean }).closed = true;
        },
      } as unknown as FakeStore;
      made.stores.push({ device, store });
      return store;
    },
  };
});

import { useWorkspaces } from "./useWorkspaces.ts";

function empty(): Snapshot {
  return {
    connection: "open",
    model: buildModel([]),
    directory: {},
    readState: {},
    busy: new Set(),
    receipts: new Map(),
    spaceIcons: new Map(),
  };
}

/** A snapshot with this many approvals waiting, made from the golden fixtures' shape. */
function withNeeds(count: number): Snapshot {
  const base = empty();
  const needsYou = Array.from({ length: count }, (_, i) => ({
    kind: "approval" as const,
    tier: "decide" as const,
    id: `apr_${i}`,
    spaceId: "spc_1",
    harnessId: "hrn_1",
    title: `ask ${i}`,
    seq: i + 1,
  }));
  return { ...base, model: { ...base.model, needsYou } };
}

const device = (id: string, muted = false): Device => ({
  deviceId: id,
  participantId: "usr_1",
  workspaceId: `ws_${id}`,
  displayName: "Arjun",
  privateKey: {} as CryptoKey,
  ...(muted ? { muted } : {}),
});

let latest: ReturnType<typeof useWorkspaces> | undefined;
function Probe({ devices, current }: { devices: readonly Device[]; current: string }) {
  latest = useWorkspaces(devices, current);
  return null;
}

afterEach(() => {
  made.stores.length = 0;
  latest = undefined;
});

describe("the workspaces in the background", () => {
  it("keeps a store for each that is not in front or muted, and counts what each needs", () => {
    const devices = [device("dev_1"), device("dev_2"), device("dev_3", true)];
    const view = render(<Probe devices={devices} current="dev_1" />);
    expect(made.stores.map((each) => each.device.deviceId)).toEqual(["dev_2"]);
    act(() => made.stores[0]?.store.push(2));
    expect(latest?.needs).toEqual({ dev_2: 2 });
    expect(latest?.stores.has("dev_2")).toBe(true);

    // Switching to it closes its background store; the one that was in front gets one.
    view.rerender(<Probe devices={devices} current="dev_2" />);
    expect(made.stores[0]?.store.closed).toBe(true);
    expect(made.stores.map((each) => each.device.deviceId)).toEqual(["dev_2", "dev_1"]);
    expect(latest?.needs).toEqual({ dev_1: 0 });

    // Muting one closes it; unmuting opens it again.
    view.rerender(
      <Probe
        devices={[device("dev_1", true), device("dev_2"), device("dev_3", true)]}
        current="dev_2"
      />,
    );
    expect(made.stores[1]?.store.closed).toBe(true);
    view.rerender(<Probe devices={devices} current="dev_2" />);
    expect(made.stores.map((each) => each.device.deviceId)).toEqual(["dev_2", "dev_1", "dev_1"]);

    // Unmounting closes them all.
    view.unmount();
    expect(made.stores.every((each) => each.store.closed)).toBe(true);
  });
});
