/**
 * Notifications per person (M5.6): a decision is asked about once however many snapshots
 * arrive, on the device the server granted the key to and no other; the rest of what is
 * waiting becomes one digest per tier; quiet hours hold the digests; and a browser that has
 * allowed nothing hears nothing.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ClientEvent, NeedsYouItem, Snapshot, Store } from "@chipschat/core";
import { buildModel } from "@chipschat/core";
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from "@chipschat/protocol";
import { render, waitFor } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Desktop } from "../native.ts";
import {
  ASK_AGAIN_MS,
  browserNotifier,
  browserPermission,
  desktopNotifier,
  digestBody,
  type Notifier,
  useBrowserNotifier,
  useNotifications,
} from "./useNotifications.ts";

const FIXTURES = `${resolve(import.meta.dirname, "../../../../packages/protocol/fixtures")}/`;
const ARJUN = "usr_01K4ZQPX000000000000000003";
const SCOUT = "hrn_01K4ZQPX000000000000000004";
const APPROVAL = "apr_01K4ZQPX000000000000000006";

function fixture(type: string, seq: number, overrides: Record<string, unknown> = {}): ClientEvent {
  return { ...JSON.parse(readFileSync(`${FIXTURES}${type}.json`, "utf8")), seq, ...overrides };
}

/** Scout asks, and a checkpoint sits in FYI. */
function waiting(): ClientEvent[] {
  return [
    fixture("space.created", 1, { actor: { kind: "person", id: ARJUN } }),
    fixture("membership.added", 2, { participant_id: SCOUT, participant_kind: "harness" }),
    fixture("run.started", 3),
    fixture("approval.request", 4),
    fixture("checkpoint", 5),
  ];
}

function snapshotOf(events: ClientEvent[]): Snapshot {
  return {
    connection: "open",
    model: buildModel(events),
    directory: { [SCOUT]: { id: SCOUT, kind: "harness", displayName: "Scout" } },
    readState: {},
    busy: new Set(),
    receipts: new Map(),
    spaceIcons: new Map(),
  };
}

function fakeStore(
  initial: Snapshot,
  settings: NotificationSettings = DEFAULT_NOTIFICATION_SETTINGS,
) {
  let snapshot = initial;
  const listeners = new Set<(snapshot: Snapshot) => void>();
  const claimed: string[][] = [];
  const store = {
    claimed,
    /** What the server grants: everything, unless a test says which keys are taken. */
    taken: new Set<string>(),
    subscribe(listener: (snapshot: Snapshot) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    notificationSettings: () => settings,
    loadNotificationSettings: async () => settings,
    claimNotifications: async (keys: readonly string[]) => {
      claimed.push([...keys]);
      return keys.filter((key) => !store.taken.has(key));
    },
    update(next: Snapshot) {
      snapshot = next;
      act(() => {
        for (const listener of listeners) listener(next);
      });
    },
  } as unknown as Store & {
    readonly claimed: string[][];
    readonly taken: Set<string>;
    readonly update: (next: Snapshot) => void;
  };
  return store;
}

function fakeNotifier(): Notifier & {
  readonly decisions: NeedsYouItem[];
  readonly digests: { title: string; body: string }[];
} {
  const notifier = {
    decisions: [] as NeedsYouItem[],
    digests: [] as { title: string; body: string }[],
    decision: async (item: NeedsYouItem) => {
      notifier.decisions.push(item);
    },
    digest: async (title: string, body: string) => {
      notifier.digests.push({ title, body });
    },
  };
  return notifier;
}

/** 10:30 on Tuesday 8 September, on this machine's clock: a digest's day is the local one. */
const DAY = () => new Date(2026, 8, 8, 10, 30);

function Bridge(props: {
  readonly stores: readonly Store[];
  readonly notifier: Notifier | undefined;
  readonly now?: () => Date;
}) {
  useNotifications({ stores: props.stores, notifier: props.notifier, now: props.now });
  return null;
}

describe("what is raised", () => {
  it("asks about a decision once, however many snapshots arrive, and rolls the rest into digests", async () => {
    const store = fakeStore(snapshotOf(waiting()));
    const notifier = fakeNotifier();
    render(<Bridge stores={[store]} notifier={notifier} now={DAY} />);
    await waitFor(() => expect(notifier.decisions).toHaveLength(1));
    expect(notifier.decisions[0]?.id).toBe(APPROVAL);
    expect(notifier.digests).toEqual([
      {
        title: "1 thing for later",
        body: "Scout: PO read and the CRM record checked. Next: Draft the confirmation email.",
      },
    ]);
    expect(store.claimed).toEqual([[`decision:${APPROVAL}`, "digest:fyi:2026-09-08"]]);

    store.update(snapshotOf(waiting()));
    store.update(snapshotOf(waiting()));
    await waitFor(() => expect(store.claimed).toHaveLength(1));
    expect(notifier.decisions).toHaveLength(1);
  });

  it("raises nothing for a key another device of the person claimed first", async () => {
    const store = fakeStore(snapshotOf(waiting()));
    store.taken.add(`decision:${APPROVAL}`);
    const notifier = fakeNotifier();
    render(<Bridge stores={[store]} notifier={notifier} now={DAY} />);
    await waitFor(() => expect(store.claimed).toHaveLength(1));
    expect(notifier.decisions).toEqual([]);
    expect(notifier.digests).toHaveLength(1);
  });

  it("asks about a taken decision once more, and raises it when a phone whose push didn't go gave it back (ADR 0244)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const store = fakeStore(snapshotOf(waiting()));
      store.taken.add(`decision:${APPROVAL}`);
      const notifier = fakeNotifier();
      render(<Bridge stores={[store]} notifier={notifier} now={DAY} />);
      await waitFor(() => expect(store.claimed).toHaveLength(1));
      expect(notifier.decisions).toEqual([]);

      // The phone's push didn't go, and the server gave the key back.
      store.taken.delete(`decision:${APPROVAL}`);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ASK_AGAIN_MS);
      });
      await waitFor(() => expect(notifier.decisions).toHaveLength(1));
      expect(store.claimed).toEqual([
        [`decision:${APPROVAL}`, "digest:fyi:2026-09-08"],
        [`decision:${APPROVAL}`],
      ]);

      // Once more, and no more.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(store.claimed).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("doesn't ask again about a taken decision that was answered meanwhile", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const store = fakeStore(snapshotOf(waiting()));
      store.taken.add(`decision:${APPROVAL}`);
      const notifier = fakeNotifier();
      render(<Bridge stores={[store]} notifier={notifier} now={DAY} />);
      await waitFor(() => expect(store.claimed).toHaveLength(1));
      store.update(snapshotOf([...waiting(), fixture("approval.resolved", 6)]));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ASK_AGAIN_MS);
      });
      expect(store.claimed).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("holds the digests in quiet hours and lets a decision through, unless nothing does", async () => {
    const night = () => new Date(2026, 8, 8, 23, 15);
    const quiet: NotificationSettings = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      quiet: { from: "22:00", to: "07:00", breakthrough: "decide" },
    };
    const store = fakeStore(snapshotOf(waiting()), quiet);
    const notifier = fakeNotifier();
    render(<Bridge stores={[store]} notifier={notifier} now={night} />);
    await waitFor(() => expect(notifier.decisions).toHaveLength(1));
    expect(notifier.digests).toEqual([]);

    const silent = fakeStore(snapshotOf(waiting()), {
      ...quiet,
      quiet: { from: "22:00", to: "07:00", breakthrough: "none" },
    });
    const hushed = fakeNotifier();
    render(<Bridge stores={[silent]} notifier={hushed} now={night} />);
    await new Promise((settle) => setTimeout(settle, 0));
    expect(silent.claimed).toEqual([]);
    expect(hushed.decisions).toEqual([]);
  });

  it("does nothing with no notifier, and a browser that has allowed nothing is no notifier", async () => {
    const store = fakeStore(snapshotOf(waiting()));
    render(<Bridge stores={[store]} notifier={undefined} now={DAY} />);
    await new Promise((settle) => setTimeout(settle, 0));
    expect(store.claimed).toEqual([]);
    expect(browserNotifier({} as typeof globalThis)).toBeUndefined();
    const denied = { Notification: { permission: "denied" } } as unknown as typeof globalThis;
    expect(browserNotifier(denied)).toBeUndefined();
  });
});

describe("the person's settings (ADR 0085)", () => {
  /** A store whose settings arrive when the test says, and may change between readings. */
  function slowStore(readings: NotificationSettings[]) {
    const store = fakeStore(snapshotOf(waiting()));
    let current = DEFAULT_NOTIFICATION_SETTINGS;
    let answer: (() => void) | undefined;
    let loads = 0;
    Object.assign(store, {
      notificationSettings: () => current,
      loadNotificationSettings: () => {
        const next = readings[Math.min(loads, readings.length - 1)] ?? current;
        loads += 1;
        return new Promise<NotificationSettings>((resolve) => {
          answer = () => {
            current = next;
            resolve(next);
          };
        });
      },
    });
    return {
      store,
      loads: () => loads,
      answer: async () => {
        await act(async () => answer?.());
      },
    };
  }

  const nothing: NotificationSettings = {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    decide: "off",
    review: "off",
    fyi: "off",
  };

  it("plans nothing until they have answered, so a banner turned off is never raised", async () => {
    const { store, answer } = slowStore([nothing]);
    const notifier = fakeNotifier();
    render(<Bridge stores={[store]} notifier={notifier} now={DAY} />);
    // Snapshots arrive before the settings do, and are not judged by the defaults.
    store.update(snapshotOf(waiting()));
    await new Promise((settle) => setTimeout(settle, 0));
    expect(store.claimed).toEqual([]);
    await answer();
    await new Promise((settle) => setTimeout(settle, 0));
    expect(store.claimed).toEqual([]);
    expect(notifier.decisions).toEqual([]);
  });

  it("plans by the defaults when the settings cannot be read at all", async () => {
    const store = fakeStore(snapshotOf(waiting()));
    Object.assign(store, {
      loadNotificationSettings: async () => Promise.reject(new Error("away")),
    });
    const notifier = fakeNotifier();
    render(<Bridge stores={[store]} notifier={notifier} now={DAY} />);
    await waitFor(() => expect(notifier.decisions).toHaveLength(1));
  });

  it("reads them again when the window comes back, so a change made on the phone is heard", async () => {
    const { store, loads, answer } = slowStore([nothing, DEFAULT_NOTIFICATION_SETTINGS]);
    const notifier = fakeNotifier();
    render(<Bridge stores={[store]} notifier={notifier} now={DAY} />);
    await answer();
    expect(store.claimed).toEqual([]);

    // Decisions were turned back on elsewhere; the desk hears of it when it is looked at again.
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(loads()).toBe(2);
    await answer();
    await waitFor(() => expect(notifier.decisions).toHaveLength(1));
    expect(notifier.decisions[0]?.id).toBe(APPROVAL);
  });
});

describe("where a banner goes", () => {
  it("uses the browser's notifications once allowed, and focuses the window on a click", async () => {
    const shown: { title: string; options: NotificationOptions | undefined }[] = [];
    let focused = 0;
    const made: FakeNotification[] = [];
    class FakeNotification {
      static permission = "granted";
      onclick: (() => void) | undefined;
      constructor(title: string, options?: NotificationOptions) {
        shown.push({ title, options });
        made.push(this);
      }
    }
    const where = {
      Notification: FakeNotification,
      focus: () => {
        focused += 1;
      },
    } as unknown as typeof globalThis;
    const notifier = browserNotifier(where);
    expect(notifier).toBeDefined();
    const snapshot = snapshotOf(waiting());
    const item = snapshot.model.needsYou.find((each) => each.kind === "approval") as NeedsYouItem;
    await notifier?.decision(item, snapshot);
    await notifier?.digest("2 things to review", "Scout: PO-4471 confirmed");
    expect(shown.map((each) => each.title)).toEqual([
      "Scout needs a decision",
      "2 things to review",
    ]);
    expect(shown[0]?.options?.tag).toBe(APPROVAL);
    // A click brings the tab forward; what to open is the queue's.
    made[0]?.onclick?.();
    expect(focused).toBe(1);
  });

  it("asks a browser for leave only when it can, and says when it cannot", async () => {
    expect(browserPermission({} as typeof globalThis).state).toBe("unsupported");
    const asked: string[] = [];
    const where = {
      Notification: {
        permission: "default",
        requestPermission: async () => {
          asked.push("asked");
          return "granted";
        },
      },
    } as unknown as typeof globalThis;
    const permission = browserPermission(where);
    expect(permission.state).toBe("default");
    expect(await permission.ask()).toBe("granted");
    expect(asked).toEqual(["asked"]);
  });

  it("raises a banner the moment the browser is allowed to, with no reload", async () => {
    const shown: string[] = [];
    class FakeNotification {
      static permission: NotificationPermission = "default";
      static requestPermission = async () => {
        FakeNotification.permission = "granted";
        return "granted" as const;
      };
      onclick: (() => void) | undefined;
      constructor(title: string) {
        shown.push(title);
      }
    }
    const where = Object.assign(new EventTarget(), {
      Notification: FakeNotification,
      focus: () => undefined,
    }) as unknown as typeof globalThis;
    const store = fakeStore(snapshotOf(waiting()));
    function Page() {
      useNotifications({ stores: [store], notifier: useBrowserNotifier(where), now: DAY });
      return null;
    }
    render(<Page />);
    await new Promise((settle) => setTimeout(settle, 0));
    expect(store.claimed).toEqual([]);

    await act(async () => {
      await browserPermission(where).ask();
    });
    await waitFor(() => expect(shown).toContain("Scout needs a decision"));
    expect(store.claimed).toHaveLength(1);
  });

  it("tells the shell a digest, and carries on when an older shell cannot", async () => {
    const told: [string, string][] = [];
    const asked: string[] = [];
    const shell = {
      ask: async (id: string) => {
        asked.push(id);
      },
      tell: async (title: string, body: string) => {
        told.push([title, body]);
      },
    } as unknown as Desktop;
    const notifier = desktopNotifier(shell);
    const snapshot = snapshotOf(waiting());
    const item = snapshot.model.needsYou.find((each) => each.kind === "approval") as NeedsYouItem;
    await notifier.decision(item, snapshot);
    await notifier.digest("1 thing for later", "Scout: Half way");
    expect(asked).toEqual([APPROVAL]);
    expect(told).toEqual([["1 thing for later", "Scout: Half way"]]);

    const older = { ...shell, tell: async () => Promise.reject(new Error("no such command")) };
    await expect(desktopNotifier(older as Desktop).digest("x", "y")).resolves.toBeUndefined();
  });

  it("lists a digest's first three and counts the rest", () => {
    const snapshot = snapshotOf(waiting());
    const items = ["a", "b", "c", "d", "e"].map((id) => ({
      kind: "checkpoint" as const,
      tier: "fyi" as const,
      id,
      spaceId: "spc_1",
      harnessId: SCOUT,
      title: `Step ${id}`,
      seq: 1,
    }));
    expect(digestBody({ kind: "digest", key: "k", tier: "fyi", items }, snapshot)).toBe(
      "Scout: Step a · Scout: Step b · Scout: Step c · and 2 more",
    );
  });
});
