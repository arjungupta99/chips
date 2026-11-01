/**
 * What the shell is told, and what a banner's answer does.
 *
 * The store here is a fake with a snapshot the test controls, because the point is the bridge:
 * that the badge counts what the queue counts, that an approval is asked about once however
 * many snapshots arrive, and that pressing Approve on a banner sends exactly the decision a
 * click on the card would.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ClientEvent, Snapshot, Store } from "@chipschat/core";
import { buildModel } from "@chipschat/core";
import { render } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import type { Decision, Desktop, FoundServer } from "../native.ts";
import { useDesktop } from "./useDesktop.ts";

const FIXTURES = `${resolve(import.meta.dirname, "../../../../packages/protocol/fixtures")}/`;
const ARJUN = "usr_01K4ZQPX000000000000000003";
const SCOUT = "hrn_01K4ZQPX000000000000000004";
/** The fixtures' approval, which the queue holds and a banner would be about. */
const APPROVAL = "apr_01K4ZQPX000000000000000006";

function fixture(type: string, seq: number, overrides: Record<string, unknown> = {}): ClientEvent {
  return { ...JSON.parse(readFileSync(`${FIXTURES}${type}.json`, "utf8")), seq, ...overrides };
}

/** A room with a run that is waiting on one approval. */
function waiting(): ClientEvent[] {
  return [
    fixture("space.created", 1, { actor: { kind: "person", id: ARJUN }, title: "PO-4471" }),
    fixture("membership.added", 2, {
      actor: { kind: "person", id: ARJUN },
      participant_id: ARJUN,
      participant_kind: "person",
      role: "owner",
    }),
    fixture("run.started", 3),
    fixture("approval.request", 4),
  ];
}

function snapshotOf(events: ClientEvent[]): Snapshot {
  return {
    connection: "open",
    model: buildModel(events),
    directory: {
      [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
      [SCOUT]: { id: SCOUT, kind: "harness", displayName: "Scout" },
    },
    readState: {},
    busy: new Set(),
    receipts: new Map(),
    spaceIcons: new Map(),
  };
}

/** A shell that records what it was told, and can answer a banner. */
function fakeDesktop(): Desktop & {
  readonly badges: number[];
  readonly asked: { id: string; title: string; body: string }[];
  readonly told: { title: string; body: string }[];
  answer: ((decision: Decision) => void) | undefined;
  open: ((link: { kind: "space" | "approval"; id: string }) => void) | undefined;
  readonly stopped: string[];
} {
  const shell = {
    badges: [] as number[],
    asked: [] as { id: string; title: string; body: string }[],
    told: [] as { title: string; body: string }[],
    answer: undefined as ((decision: Decision) => void) | undefined,
    open: undefined as ((link: { kind: "space" | "approval"; id: string }) => void) | undefined,
    stopped: [] as string[],
    discover: async (): Promise<FoundServer[]> => [],
    ask: async (id: string, title: string, body: string) => {
      shell.asked.push({ id, title, body });
    },
    tell: async (title: string, body: string) => {
      shell.told.push({ title, body });
    },
    badge: async (count: number) => {
      shell.badges.push(count);
    },
    onDecision: async (listen: (decision: Decision) => void) => {
      shell.answer = listen;
      return () => shell.stopped.push("decision");
    },
    onOpen: async (listen: (link: { kind: "space" | "approval"; id: string }) => void) => {
      shell.open = listen;
      return () => shell.stopped.push("open");
    },
  };
  return shell;
}

/** A store with a snapshot a test can move. */
function fakeStore(initial: Snapshot) {
  let snapshot = initial;
  const listeners = new Set<(snapshot: Snapshot) => void>();
  const resolved: Parameters<Store["resolveApproval"]>[0][] = [];
  const store = {
    resolved,
    subscribe(listener: (snapshot: Snapshot) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    resolveApproval: (input: Parameters<Store["resolveApproval"]>[0]) => resolved.push(input),
    update(next: Snapshot) {
      snapshot = next;
      act(() => {
        for (const listener of listeners) listener(next);
      });
    },
  } as unknown as Store & {
    readonly resolved: Parameters<Store["resolveApproval"]>[0][];
    readonly update: (next: Snapshot) => void;
  };
  return store;
}

function Bridge({ store, desktop }: { store: Store; desktop: Desktop | undefined }) {
  useDesktop({ store, desktop });
  return null;
}

describe("the desktop bridge", () => {
  it("puts the count of what is waiting in the menu bar, and only when it changes", () => {
    const store = fakeStore(snapshotOf(waiting()));
    const shell = fakeDesktop();
    render(<Bridge store={store} desktop={shell} />);
    expect(shell.badges).toEqual([1]);

    // The same snapshot again is not news.
    store.update(snapshotOf(waiting()));
    expect(shell.badges).toEqual([1]);

    // Resolved: nothing is waiting.
    store.update(
      snapshotOf([
        ...waiting(),
        fixture("approval.resolved", 5, { decision: "approved", resolved_by: ARJUN }),
      ]),
    );
    expect(shell.badges).toEqual([1, 0]);
  });

  it("sends the same decision a click on the card would", () => {
    const store = fakeStore(snapshotOf(waiting()));
    const shell = fakeDesktop();
    render(<Bridge store={store} desktop={shell} />);

    const asked = { id: APPROVAL };
    act(() => shell.answer?.({ approvalId: asked.id, decision: "approved" }));
    expect(store.resolved).toEqual([
      {
        spaceId: "spc_01K4ZQPX000000000000000002",
        runId: "run_01K4ZQPX000000000000000005",
        approvalId: asked.id,
        decision: "approved",
      },
    ]);
  });

  it("does nothing with a banner nobody answered", () => {
    const store = fakeStore(snapshotOf(waiting()));
    const shell = fakeDesktop();
    render(<Bridge store={store} desktop={shell} />);
    const asked = { id: APPROVAL };
    act(() => shell.answer?.({ approvalId: asked.id, decision: "dismissed" }));
    act(() => shell.answer?.({ approvalId: asked.id, decision: "opened" }));
    expect(store.resolved).toEqual([]);
  });

  it("lets go of the shell when it goes away", async () => {
    const store = fakeStore(snapshotOf(waiting()));
    const shell = fakeDesktop();
    const { unmount } = render(<Bridge store={store} desktop={shell} />);
    await act(async () => {});
    unmount();
    expect(shell.stopped.sort()).toEqual(["decision", "open"]);
  });

  it("lets go even when the window closes before the shell has answered", async () => {
    const store = fakeStore(snapshotOf(waiting()));
    const shell = fakeDesktop();
    const { unmount } = render(<Bridge store={store} desktop={shell} />);
    // Registering a listener is a round trip; this unmounts while it is still in flight.
    unmount();
    await act(async () => {});
    expect(shell.stopped.sort()).toEqual(["decision", "open"]);
  });

  it("does nothing at all in a browser", () => {
    const store = fakeStore(snapshotOf(waiting()));
    render(<Bridge store={store} desktop={undefined} />);
    expect(store.resolved).toEqual([]);
  });
});

describe("several workspaces (M5.3)", () => {
  it("counts every workspace in the badge, and answers a banner in the one that raised it", async () => {
    const desktop = fakeDesktop();
    const home = fakeStore(snapshotOf(waiting()));
    const work = fakeStore(
      snapshotOf(
        waiting().map((event) =>
          event.type === "approval.request"
            ? { ...event, approval_id: "apr_01K4ZQPX00000000000000000W" }
            : event,
        ),
      ),
    );
    function Probe() {
      useDesktop({ stores: [home, work], desktop });
      return null;
    }
    render(<Probe />);
    await act(async () => undefined);
    expect(desktop.badges.at(-1)).toBe(2);
    // Which banners are raised, and where, is `useNotifications` (M5.6); the answer to one
    // still comes back through the shell and finds the workspace it belongs to.

    await act(async () => {
      desktop.answer?.({ approvalId: "apr_01K4ZQPX00000000000000000W", decision: "approved" });
    });
    expect(work.resolved).toHaveLength(1);
    expect(home.resolved).toHaveLength(0);
  });
});
