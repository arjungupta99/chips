/**
 * The store between the wire and a screen, with a fake socket and an in-memory cache. The real
 * socket, IndexedDB and WebCrypto stay Playwright's; what is tested here is what the store does
 * with what they hand it — and, above all, how often it hands a screen a new snapshot.
 */

import { describe, expect, it, vi } from "vitest";
import type { Cache } from "./cache.js";
import type { Device, DeviceStorage } from "./device.js";
import type { ClientEvent } from "./events.js";
import type { KeptSpace } from "./madeHere.js";
import type { Space } from "./model.js";
import type { QueuedMessage } from "./pending.js";
import type { ReadState } from "./read-state.js";
import { createStore, pinnedAsBefore, type Snapshot } from "./store.js";
import type { Transport, TransportOptions } from "./transport.js";

const DEVICE: Device = {
  deviceId: "dev_1",
  participantId: "usr_1",
  workspaceId: "ws_1",
  displayName: "Arjun",
  // Never used to sign here: the directory fetch that would sign is not reachable under Node.
  privateKey: {} as CryptoKey,
};

function event(seq: number, extra: Record<string, unknown> = {}): ClientEvent {
  return {
    seq,
    type: "message.post",
    id: `evt_${seq}`,
    ts: "2026-09-03T00:00:00.000Z",
    workspace_id: "ws_1",
    space_id: "spc_1",
    actor: { kind: "harness", id: "hrn_1" },
    text: `message ${seq}`,
    ...extra,
  };
}

const OPENED = event(1, {
  type: "space.created",
  actor: { kind: "person", id: "usr_1" },
  kind: "group",
  title: "PO-4471",
});

function harness(
  options: {
    cached?: ClientEvent[];
    /** Stands in for reading the history, to hold the read. */
    loadEvents?: () => Promise<ClientEvent[]>;
    readState?: ReadState;
    /** What the cache says was sent and not yet answered when the page was last flushed. */
    outbox?: QueuedMessage[];
    /** What the cache kept of the spaces made here the server had not said yes to. */
    madeHere?: readonly KeptSpace[];
    /** Where the cache says the socket resumes; absent, a cache from before the cursor was kept. */
    cursor?: number;
    /** What the cache kept of the server's last list of participants; absent, it never had one. */
    participants?: readonly unknown[];
    /** Stands in for reading them, to hold the read. */
    loadParticipants?: () => Promise<readonly unknown[] | undefined>;
    /** What the cache kept of the faces chosen for rooms; absent, it never had them. */
    spaceIcons?: Readonly<Record<string, unknown>>;
    /** What the cache kept of the rooms hidden (ADR 0205); absent, it never had them. */
    hiddenSpaces?: readonly string[];
    /** What the cache kept of the rooms pinned (ADR 0240); absent, it never had them. */
    pinnedSpaces?: readonly string[];
    /** Stands in for the cache's event write, to fail it or to hold it. */
    saveEvents?: (events: readonly ClientEvent[]) => Promise<void>;
    /** Answers signed GETs: the directory, and a room's history. */
    get?: (path: string) => Promise<unknown>;
    /** Answers signed POSTs, PUTs and DELETEs. */
    post?: (path: string, body: unknown) => Promise<unknown>;
    put?: (path: string, body: unknown) => Promise<unknown>;
    patch?: (path: string, body: unknown) => Promise<unknown>;
    remove?: (path: string) => Promise<unknown>;
    /** Told of rooms erased from the server (ADR 0067). */
    onErased?: (spaces: readonly Space[]) => void;
    /** The device, when the test's is not the usual one. */
    device?: Device;
    /** Told what the store opened its cache under. */
    cacheOpened?: (key: string) => void;
    /** Where the device is kept, for what the store learns of it as it connects. */
    deviceStorage?: DeviceStorage;
  } = {},
) {
  const flushes: (() => void)[] = [];
  const saved: ClientEvent[][] = [];
  const savedReadState: ReadState[] = [];
  const savedOutbox: QueuedMessage[][] = [];
  const savedMadeHere: (readonly KeptSpace[])[] = [];
  const forgotten: string[][] = [];
  const savedCursor: number[] = [];
  const savedParticipants: (readonly unknown[])[] = [];
  const savedSpaceIcons: Readonly<Record<string, unknown>>[] = [];
  const savedHiddenSpaces: (readonly string[])[] = [];
  const savedPinnedSpaces: (readonly string[])[] = [];
  const cache: Cache = {
    loadEvents: options.loadEvents ?? (async () => options.cached ?? []),
    // `saved` is every batch the store asked for, in order, landed or not.
    saveEvents: (events) => {
      saved.push([...events]);
      return options.saveEvents?.(events) ?? Promise.resolve();
    },
    forgetSpaces: async (spaceIds) => {
      forgotten.push([...spaceIds]);
    },
    loadCursor: async () => options.cursor ?? 0,
    saveCursor: async (seq) => {
      savedCursor.push(seq);
    },
    loadReadState: async () => options.readState ?? {},
    saveReadState: async (readState) => {
      savedReadState.push(readState);
    },
    loadOutbox: async () => options.outbox ?? [],
    saveOutbox: async (messages) => {
      savedOutbox.push([...messages]);
    },
    loadMadeHere: async () => options.madeHere ?? [],
    saveMadeHere: async (spaces) => {
      savedMadeHere.push([...spaces]);
    },
    loadParticipants: options.loadParticipants ?? (async () => options.participants),
    saveParticipants: async (participants) => {
      savedParticipants.push([...participants]);
    },
    loadSpaceIcons: async () => options.spaceIcons,
    saveSpaceIcons: async (icons) => {
      savedSpaceIcons.push({ ...icons });
    },
    loadHiddenSpaces: async () => options.hiddenSpaces,
    saveHiddenSpaces: async (spaceIds) => {
      savedHiddenSpaces.push([...spaceIds]);
    },
    loadPinnedSpaces: async () => options.pinnedSpaces,
    savePinnedSpaces: async (spaceIds) => {
      savedPinnedSpaces.push([...spaceIds]);
    },
  };

  let wire: TransportOptions | undefined;
  const sent: Record<string, unknown>[] = [];
  const withdrawn: string[] = [];
  let woken = 0;
  let wentDirect = 0;
  const onlyDirect: boolean[] = [];
  const connect = (transportOptions: TransportOptions): Transport => {
    wire = transportOptions;
    return {
      send: (sentEvent) => {
        sent.push(sentEvent);
      },
      withdraw: (key) => {
        withdrawn.push(key);
      },
      wake: () => {
        woken += 1;
      },
      goDirect: async () => {
        wentDirect += 1;
        return true;
      },
      onlyDirect: (on) => {
        onlyDirect.push(on);
      },
      close: () => undefined,
    };
  };

  const get = options.get;
  const post = options.post;
  const remove = options.remove;
  const put = options.put;
  const patch = options.patch;
  const store = createStore({
    device: options.device ?? DEVICE,
    connect,
    openCache: (key) => {
      options.cacheOpened?.(key);
      return cache;
    },
    now: () => "2026-09-03T00:00:01.000Z",
    randomKey: () => "k1",
    schedule: (flush) => {
      flushes.push(flush);
    },
    ...(get === undefined ? {} : { get: (_device, path) => get(path) as never }),
    ...(post === undefined ? {} : { post: (_device, path, body) => post(path, body) as never }),
    ...(remove === undefined ? {} : { remove: (_device, path) => remove(path) as never }),
    ...(put === undefined ? {} : { put: (_device, path, body) => put(path, body) as never }),
    ...(patch === undefined ? {} : { patch: (_device, path, body) => patch(path, body) as never }),
    ...(options.onErased === undefined ? {} : { onErased: options.onErased }),
    ...(options.deviceStorage === undefined ? {} : { deviceStorage: options.deviceStorage }),
  });
  const snapshots: Snapshot[] = [];
  store.subscribe((snapshot) => {
    snapshots.push(snapshot);
  });

  return {
    store,
    saved,
    savedReadState,
    savedOutbox,
    savedMadeHere,
    savedCursor,
    savedParticipants,
    savedSpaceIcons,
    savedHiddenSpaces,
    savedPinnedSpaces,
    forgotten,
    sent,
    withdrawn,
    snapshots,
    flushes,
    /** How many times the app has told the transport to check its connection. */
    woken: () => woken,
    /** How many times the store asked the transport to leave the relay (ADR 0211). */
    wentDirect: () => wentDirect,
    /** What the store told the transport of Only direct (ADR 0211, Phase 2). */
    onlyDirect,
    /** The wire the store connected, once `start` has run. */
    wire: () => wire as TransportOptions,
    /** Run every flush the store has scheduled so far. */
    flush: () => {
      for (const flush of flushes.splice(0)) flush();
    },
  };
}

/** Let the store's asynchronous start — load the cache, then connect — run to completion. */
const started = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("the store", () => {
  it("never connects once it is closed, even when it is closed while the cache is still loading", async () => {
    // What React's Strict Mode does to a store made in an effect: made, closed, made again. The
    // first one's cache load is still running when it is closed; a store that connected anyway
    // held a second socket for the device, and the two tunnels closed each other in turn.
    const h = harness({});
    h.store.close();
    await started();
    expect(h.wire()).toBeUndefined();
  });

  it("asks for its connection while the history is read, and says hello once it is folded (ADR 0253)", async () => {
    let read: (events: ClientEvent[]) => void = () => undefined;
    const h = harness({
      cursor: 1,
      loadEvents: () =>
        new Promise((resolve) => {
          read = resolve;
        }),
    });
    await started();
    // Asked for from where the cache stands, before the history is in.
    expect(h.wire().since).toBe(1);
    let greetable = false;
    void h.wire().greetAfter?.then(() => {
      greetable = true;
    });
    await started();
    expect(greetable).toBe(false);
    expect(h.store.getSnapshot().readingCache).toBe(true);
    read([OPENED]);
    await started();
    // Folded by the time the socket may speak, so what the server replays lands on it.
    expect(greetable).toBe(true);
    h.flush();
    expect(h.store.getSnapshot().model.spaces.map((space) => space.id)).toEqual(["spc_1"]);
  });

  it("passes a wake through to the transport, and is silent before there is one", async () => {
    // The app is the only thing that knows it has come back to the foreground; on a phone that
    // is `AppState`, which is what it has instead of the browser's `online`/`offline`.
    const h = harness({});
    h.store.wake();
    expect(h.woken()).toBe(0);
    await started();
    h.store.wake();
    h.store.wake();
    expect(h.woken()).toBe(2);
  });

  it("says it is reading its cache until it has, even when the cache holds nothing", async () => {
    // An empty model before the read is not an empty workspace: a list drew "No spaces yet" for
    // it on every launch (6 October 2026).
    const h = harness({});
    expect(h.snapshots[0]?.readingCache).toBe(true);
    await started();
    h.flush();
    expect(h.snapshots.at(-1)?.readingCache).toBeUndefined();
  });

  describe("who is who, kept for the next launch", () => {
    const MIRA = { id: "agt_1", kind: "agent", display_name: "Mira", owner_id: null, lead: true };
    const SCOUT = { id: "agt_2", kind: "agent", display_name: "Scout", owner_id: null };

    it("lists what it kept of the last answer before the server answers, then the answer", async () => {
      // The Agents tab said "Agents · 0" and "No agents yet" on every cold start until the
      // server answered, because the directory was never kept (14 October 2026).
      let answer: ((rows: unknown) => void) | undefined;
      const h = harness({
        participants: [MIRA],
        get: (path) =>
          path === "/v1/participants"
            ? new Promise((resolve) => {
                answer = resolve;
              })
            : Promise.resolve({}),
      });
      await started();
      h.flush();
      let snapshot = h.store.getSnapshot();
      expect(snapshot.directoryFrom).toBe("cache");
      expect(snapshot.directory["agt_1"]).toMatchObject({ displayName: "Mira", lead: true });
      answer?.({ participants: [MIRA, SCOUT] });
      await started();
      h.flush();
      snapshot = h.store.getSnapshot();
      expect(snapshot.directoryFrom).toBe("server");
      expect(Object.keys(snapshot.directory).sort()).toEqual(["agt_1", "agt_2"]);
      // Kept as it came, for the launch after this one.
      expect(h.savedParticipants).toEqual([[MIRA, SCOUT]]);
    });

    it("knows nobody until a first answer, and keeps an answer with nobody in it as one", async () => {
      const h = harness({ get: async () => ({ participants: [] }) });
      expect(h.store.getSnapshot().directoryFrom).toBeUndefined();
      await started();
      h.flush();
      expect(h.store.getSnapshot().directoryFrom).toBe("server");
      expect(h.savedParticipants).toEqual([[]]);
    });

    it("leaves out a kept row that no longer reads as one", async () => {
      const h = harness({
        participants: [MIRA, { id: 7 }, null, "agt_9"],
        get: () => new Promise(() => undefined),
      });
      await started();
      h.flush();
      expect(Object.keys(h.store.getSnapshot().directory)).toEqual(["agt_1"]);
    });

    it("calls a read that failed before the socket was open no failure, and reads at the hello", async () => {
      // His iPhone, through the relay (14 October 2026): the launch's read went out before the
      // socket had a way to the server, failed, and the tab said "Couldn't load your agents" from
      // the moment the socket opened until the hello's read landed, a second later.
      let reads = 0;
      let failing = true;
      const h = harness({
        get: async (path) => {
          if (path !== "/v1/participants") return {};
          reads += 1;
          if (failing) throw new Error("no way through yet");
          return { participants: [MIRA, SCOUT] };
        },
      });
      await started();
      h.wire().onState("open");
      h.flush();
      let snapshot = h.store.getSnapshot();
      expect(snapshot.directoryFailed).toBeUndefined();
      expect(snapshot.directoryFrom).toBeUndefined();
      // The first hello reads it again only because the launch's read failed.
      failing = false;
      h.wire().onEvent({ type: "hello", spaces: [] } as unknown as ClientEvent);
      await started();
      h.flush();
      snapshot = h.store.getSnapshot();
      expect(reads).toBe(2);
      expect(snapshot.directoryFailed).toBeUndefined();
      expect(snapshot.directoryFrom).toBe("server");
      expect(snapshot.directory["agt_2"]?.displayName).toBe("Scout");
    });

    it("keeps what it had over a read that failed with the socket open", async () => {
      const h = harness({
        participants: [MIRA],
        get: async (path) => {
          if (path === "/v1/participants") throw new Error("the server had a moment");
          return {};
        },
      });
      await started();
      h.wire().onState("open");
      await h.store.refreshDirectory();
      h.flush();
      const snapshot = h.store.getSnapshot();
      // Somebody is known, so the store does not try again itself: it is said, over the list.
      expect(snapshot.directoryFailed).toBe(true);
      expect(snapshot.directoryFrom).toBe("cache");
      expect(snapshot.directory["agt_1"]?.displayName).toBe("Mira");
    });

    it("tries twice more itself while nobody is known before it says a read failed", async () => {
      vi.useFakeTimers();
      try {
        let reads = 0;
        const h = harness({
          get: async (path) => {
            if (path !== "/v1/participants") return {};
            reads += 1;
            throw new Error("the server had a moment");
          },
        });
        await vi.advanceTimersByTimeAsync(0);
        h.wire().onState("open");
        await h.store.refreshDirectory();
        h.flush();
        expect(h.store.getSnapshot().directoryFailed).toBeUndefined();
        await vi.advanceTimersByTimeAsync(2000);
        h.flush();
        expect(h.store.getSnapshot().directoryFailed).toBeUndefined();
        await vi.advanceTimersByTimeAsync(2000);
        h.flush();
        // The launch's read (owed, before the socket), the tab's, and the store's own two.
        expect(reads).toBe(4);
        expect(h.store.getSnapshot().directoryFailed).toBe(true);
        // And no more: Try again, or the next hello, asks again.
        await vi.advanceTimersByTimeAsync(10_000);
        expect(reads).toBe(4);
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not read again at the first hello when the launch's read landed", async () => {
      let reads = 0;
      const h = harness({
        get: async (path) => {
          if (path === "/v1/participants") reads += 1;
          return { participants: [] };
        },
      });
      await started();
      h.wire().onEvent({ type: "hello", spaces: [] } as unknown as ClientEvent);
      await started();
      expect(reads).toBe(1);
    });

    it("keeps an answer that landed while the cache was still being read over what it kept", async () => {
      let releaseCache: (() => void) | undefined;
      const h = harness({
        loadParticipants: () =>
          new Promise((resolve) => {
            releaseCache = () => resolve([MIRA]);
          }),
        // Answered once; the launch's own read, after the cache, is still out when this looks.
        get: (() => {
          let asked = 0;
          return () => {
            asked += 1;
            return asked === 1 ? Promise.resolve({ participants: [SCOUT] }) : new Promise(() => {});
          };
        })(),
      });
      // A tab asks for the directory before the store has read its cache, and is answered.
      await h.store.refreshDirectory();
      await started();
      releaseCache?.();
      await started();
      h.flush();
      expect(h.store.getSnapshot().directoryFrom).toBe("server");
      expect(Object.keys(h.store.getSnapshot().directory)).toEqual(["agt_2"]);
    });
  });

  it("counts the rooms a hello lists until each has come in, and a room gone after does not count", async () => {
    const elsewhere = event(2, {
      type: "space.created",
      space_id: "spc_9",
      actor: { kind: "person", id: "usr_1" },
      kind: "group",
      title: "Analyst",
    });
    const h = harness({ cached: [OPENED] });
    await started();
    h.flush();
    // No hello yet: nobody has said what there is.
    expect(h.snapshots.at(-1)?.awaiting).toBeUndefined();

    h.wire().onEvent({ type: "hello", spaces: ["spc_1", "spc_9"] } as unknown as ClientEvent);
    h.flush();
    expect(h.snapshots.at(-1)?.awaiting).toBe(1);

    h.wire().onEvent(elsewhere);
    h.flush();
    expect(h.snapshots.at(-1)?.awaiting).toBe(0);

    // Erased once it was in: not on its way, so the count stays at nothing.
    h.wire().onEvent(
      event(3, {
        type: "space.erased",
        space_id: undefined,
        actor: { kind: "person", id: "usr_2" },
        erased: ["spc_9"],
      }),
    );
    h.flush();
    expect(h.snapshots.at(-1)?.model.spaces.map((space) => space.id)).toEqual(["spc_1"]);
    expect(h.snapshots.at(-1)?.awaiting).toBe(0);
  });

  it("says there is nothing on its way when the hello lists no rooms", async () => {
    const h = harness({});
    await started();
    h.wire().onEvent({ type: "hello", spaces: [] } as unknown as ClientEvent);
    h.flush();
    expect(h.snapshots.at(-1)?.awaiting).toBe(0);
  });

  it("takes the name the hello calls the workspace, and keeps it with the device when it changed", async () => {
    const kept = new Map<string, unknown>([["dev_1", { ...DEVICE, workspaceName: "Demo" }]]);
    const deviceStorage: DeviceStorage = {
      put: async (key, value) => {
        kept.set(key, value);
      },
      remove: async (key) => {
        kept.delete(key);
      },
      entries: async () => [...kept.entries()],
    };
    const h = harness({ device: { ...DEVICE, workspaceName: "Demo" }, deviceStorage });
    await started();
    h.flush();
    // Until a hello says, the name it paired under stands.
    expect(h.snapshots.at(-1)?.workspaceName).toBeUndefined();

    h.wire().onEvent({ type: "hello", spaces: [], workspace: { name: "Demo" } } as never);
    h.flush();
    expect(h.snapshots.at(-1)?.workspaceName).toBe("Demo");
    expect(kept.get("dev_1")).toMatchObject({ workspaceName: "Demo" });

    // Renamed while this device was away: the next hello says so, and the device keeps it.
    h.wire().onEvent({ type: "hello", spaces: [], workspace: { name: "Gupta Labs" } } as never);
    h.flush();
    await started();
    expect(h.snapshots.at(-1)?.workspaceName).toBe("Gupta Labs");
    expect(kept.get("dev_1")).toMatchObject({ workspaceName: "Gupta Labs" });

    // An older server says nothing, and the name stays.
    h.wire().onEvent({ type: "hello", spaces: [] } as never);
    h.flush();
    expect(h.snapshots.at(-1)?.workspaceName).toBe("Gupta Labs");
  });

  it("hears from each hello whether the server keeps a yes that holds on (ADR 0281)", async () => {
    const h = harness();
    await started();
    h.flush();
    // Until a hello says, the choices stand.
    expect(h.snapshots.at(-1)?.keepsHeldYes).toBeUndefined();

    h.wire().onEvent({ type: "hello", spaces: [], server: { takes: ["held_yes"] } } as never);
    h.flush();
    expect(h.snapshots.at(-1)?.keepsHeldYes).toBe(true);

    // An older server says nothing, and would drop how long the yes holds.
    h.wire().onEvent({ type: "hello", spaces: [], server: { name: "chipsd" } } as never);
    h.flush();
    expect(h.snapshots.at(-1)?.keepsHeldYes).toBe(false);
  });

  it("takes a rename the socket brings, and its own from the server's answer, but not one the cache replays (ADR 0194)", async () => {
    const kept = new Map<string, unknown>([["dev_1", { ...DEVICE, workspaceName: "Solo" }]]);
    const deviceStorage: DeviceStorage = {
      put: async (key, value) => {
        kept.set(key, value);
      },
      remove: async (key) => {
        kept.delete(key);
      },
      entries: async () => [...kept.entries()],
    };
    const renamed = (seq: number, name: string, previous: string) =>
      event(seq, {
        type: "workspace.renamed",
        space_id: undefined,
        actor: { kind: "person", id: "usr_2" },
        text: undefined,
        name,
        previous_name: previous,
      });
    const post = vi.fn(async (_path: string, body: unknown) => ({
      name: (body as { name: string }).name,
    }));
    const h = harness({
      device: { ...DEVICE, workspaceName: "Solo" },
      deviceStorage,
      // A rename this device folded long ago, which a later hello has since overtaken.
      cached: [renamed(1, "Old name", "Solo")],
      post,
    });
    await started();
    h.flush();
    expect(h.snapshots.at(-1)?.workspaceName).toBeUndefined();
    h.wire().onEvent({ type: "hello", spaces: [], workspace: { name: "Solo" } } as never);
    h.flush();
    expect(h.snapshots.at(-1)?.workspaceName).toBe("Solo");

    // Renamed on another device while this one is open: told at once, and kept for next launch.
    h.wire().onEvent(renamed(2, "Primal", "Solo"));
    h.flush();
    await started();
    expect(h.snapshots.at(-1)?.workspaceName).toBe("Primal");
    expect(kept.get("dev_1")).toMatchObject({ workspaceName: "Primal" });

    // Renamed from here: the server's answer says so before the socket's event comes.
    await h.store.renameWorkspace("Primal Labs");
    expect(post).toHaveBeenCalledWith("/v1/workspace/name", { name: "Primal Labs" });
    h.flush();
    await started();
    expect(h.snapshots.at(-1)?.workspaceName).toBe("Primal Labs");
    expect(kept.get("dev_1")).toMatchObject({ workspaceName: "Primal Labs" });

    // Named back to what the device paired under, while still open: that is kept too, not the
    // name in between.
    h.wire().onEvent(renamed(3, "Solo", "Primal Labs"));
    h.flush();
    await started();
    expect(h.snapshots.at(-1)?.workspaceName).toBe("Solo");
    expect(kept.get("dev_1")).toMatchObject({ workspaceName: "Solo" });
  });

  it("forgets a cached space the server no longer lists it in, and drops it from the cache", async () => {
    const other = event(2, {
      type: "space.created",
      space_id: "spc_2",
      actor: { kind: "person", id: "usr_1" },
      kind: "group",
      title: "Analyst",
    });
    const h = harness({ cached: [OPENED, other, event(3, { space_id: "spc_2", text: "old" })] });
    await started();
    h.flush();
    expect(
      h.snapshots
        .at(-1)
        ?.model.spaces.map((space) => space.id)
        .sort(),
    ).toEqual(["spc_1", "spc_2"]);

    // The device left spc_2 elsewhere while it was away; the server's hello does not list it.
    h.wire().onEvent({ type: "hello", spaces: ["spc_1"] } as unknown as ClientEvent);
    h.flush();
    expect(h.snapshots.at(-1)?.model.spaces.map((space) => space.id)).toEqual(["spc_1"]);
    expect(h.forgotten).toEqual([["spc_2"]]);

    // An older server says nothing about spaces, and nothing changes.
    h.wire().onEvent({ type: "hello" } as unknown as ClientEvent);
    h.flush();
    expect(h.snapshots.at(-1)?.model.spaces.map((space) => space.id)).toEqual(["spc_1"]);
    expect(h.forgotten).toHaveLength(1);
  });

  it("turns a burst of one event per message into one flush, one cache write and one render", async () => {
    const h = harness();
    await started();
    const before = h.snapshots.length;

    h.wire().onEvent(OPENED);
    for (let seq = 2; seq <= 501; seq += 1) h.wire().onEvent(event(seq));

    // Nothing is folded or shown until the frame; one flush is scheduled, not five hundred.
    expect(h.flushes).toHaveLength(1);
    expect(h.snapshots).toHaveLength(before);
    expect(h.saved).toEqual([]);

    h.flush();
    expect(h.snapshots).toHaveLength(before + 1);
    expect(h.saved).toHaveLength(1);
    expect(h.saved[0]).toHaveLength(501);
    expect(h.store.getSnapshot().model.spaces[0]?.lines).toHaveLength(500);
  });

  it("shows the cache first, resumes from the cursor it recorded, and does not write it back", async () => {
    const h = harness({ cached: [OPENED, event(3), event(7)], cursor: 7 });
    await started();
    expect(h.wire().since).toBe(7);

    h.flush();
    expect(h.store.getSnapshot().model.spaces[0]?.lines.map((line) => line.seq)).toEqual([3, 7]);
    expect(h.saved).toEqual([]);
    expect(h.savedCursor).toEqual([]);
  });

  it("ignores an event it has already seen, whichever way it arrived", async () => {
    const h = harness({ cached: [OPENED, event(2)] });
    await started();
    h.wire().onEvent(event(2));
    h.wire().onEvent(event(3));
    h.flush();
    expect(h.store.getSnapshot().model.spaces[0]?.lines).toHaveLength(2);
    expect(h.saved).toEqual([[event(3)]]);
  });

  it("shows a send at once as pending, and drops the pending line when it streams back", async () => {
    const h = harness({ cached: [OPENED] });
    await started();

    h.store.send({ spaceId: "spc_1", text: "On its way" });
    expect(h.sent[0]).toMatchObject({
      type: "message.post",
      space_id: "spc_1",
      text: "On its way",
      idempotency_key: "msg-k1",
    });
    h.flush();
    const optimistic = h.store.getSnapshot().model.spaces[0]?.lines ?? [];
    expect(optimistic).toHaveLength(1);
    expect(optimistic[0]).toMatchObject({ text: "On its way", pending: true, authorId: "usr_1" });

    h.wire().onEvent(
      event(2, {
        actor: { kind: "person", id: "usr_1" },
        text: "On its way",
        idempotency_key: "msg-k1",
      }),
    );
    h.flush();
    const confirmed = h.store.getSnapshot().model.spaces[0]?.lines ?? [];
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]).toMatchObject({ seq: 2, text: "On its way" });
    expect(confirmed[0]?.pending).toBeUndefined();
  });

  it("sends who a message is aimed at as to, and draws it on the pending line (ADR 0081)", async () => {
    const h = harness({ cached: [OPENED] });
    await started();

    h.store.send({ spaceId: "spc_1", text: "Your turn", to: ["hrn_2"], addressedTo: ["hrn_2"] });
    expect(h.sent[0]).toMatchObject({ type: "message.post", to: ["hrn_2"] });
    expect(h.sent[0]).not.toHaveProperty("addressedTo");
    expect(h.sent[0]).not.toHaveProperty("addressed_to");
    h.flush();
    expect(h.store.getSnapshot().model.spaces[0]?.lines[0]).toMatchObject({
      pending: true,
      addressedTo: ["hrn_2"],
    });
    expect(h.store.getSnapshot().model.spaces[0]?.lines[0]).not.toHaveProperty("addressedToAll");

    h.store.send({ spaceId: "spc_1", text: "All of you", to: "all", addressedTo: ["hrn_2"] });
    h.flush();
    expect(h.store.getSnapshot().model.spaces[0]?.lines.at(-1)).toMatchObject({
      text: "All of you",
      pending: true,
      addressedToAll: true,
    });
  });

  it("sends the message a reply answers, and draws it on the pending line (ADR 0219)", async () => {
    const h = harness({ cached: [OPENED] });
    await started();

    const quoted = "evt_01K4ZQPX000000000000000067";
    h.store.send({ spaceId: "spc_1", text: "Make it 8", replyTo: quoted });
    expect(h.sent[0]).toMatchObject({
      type: "message.post",
      reply_to: "msg_01K4ZQPX000000000000000067",
    });
    expect(h.sent[0]).not.toHaveProperty("replyTo");
    h.flush();
    expect(h.store.getSnapshot().model.spaces[0]?.lines[0]).toMatchObject({
      pending: true,
      replyTo: quoted,
    });
  });

  it("persists read state, and only when it moves forward", async () => {
    const h = harness({ cached: [OPENED, event(2), event(3)], readState: { spc_1: 2 } });
    await started();

    h.store.markRead("spc_1", 3);
    expect(h.savedReadState).toEqual([{ spc_1: 3 }]);
    h.store.markRead("spc_1", 2);
    expect(h.savedReadState).toHaveLength(1);

    h.flush();
    expect(h.store.getSnapshot().readState).toEqual({ spc_1: 3 });
  });

  it("reads many spaces with one save, and none when nothing moves (Read all)", async () => {
    const other = { ...OPENED, space_id: "spc_2", id: "evt_other" };
    const h = harness({
      cached: [OPENED, event(2), event(3), other, event(5, { space_id: "spc_2" })],
      readState: { spc_1: 2 },
    });
    await started();
    h.flush();

    h.store.markSpacesRead(["spc_1", "spc_2", "spc_gone"]);
    expect(h.savedReadState).toEqual([{ spc_1: 3, spc_2: 5 }]);
    h.store.markSpacesRead(["spc_1", "spc_2"]);
    expect(h.savedReadState).toHaveLength(1);
  });

  describe("how far the person has read, kept at the server (ADR 0262)", () => {
    const OTHER = { ...OPENED, space_id: "spc_2", id: "evt_other" };
    const notThisTests = () => Promise.reject(new Error("not this test's"));

    it("takes the server's marks where further, and sends up its own where they are", async () => {
      const puts: unknown[] = [];
      const h = harness({
        cursor: 5,
        cached: [OPENED, event(2), event(3), OTHER, event(5, { space_id: "spc_2" })],
        readState: { spc_1: 3 },
        get: (path) =>
          path === "/v1/me/read"
            ? Promise.resolve({ spaces: { spc_1: 2, spc_2: 5 } })
            : notThisTests(),
        put: async (path, body) => {
          puts.push([path, body]);
          return undefined;
        },
      });
      await started();
      h.flush();
      expect(h.store.getSnapshot().readState).toEqual({ spc_1: 3, spc_2: 5 });
      expect(puts).toEqual([["/v1/me/read", { spaces: { spc_1: 3 } }]]);
    });

    it("sends a mark as a room is read, one write at a time, gathering what moves meanwhile", async () => {
      const puts: unknown[] = [];
      let answer: () => void = () => undefined;
      const h = harness({
        cursor: 5,
        cached: [OPENED, event(2), event(3), event(4)],
        readState: { spc_1: 2 },
        get: (path) =>
          path === "/v1/me/read" ? Promise.resolve({ spaces: { spc_1: 2 } }) : notThisTests(),
        put: (_path, body) => {
          puts.push(body);
          return new Promise((resolve) => {
            answer = () => resolve(undefined);
          });
        },
      });
      await started();
      h.store.markRead("spc_1", 3);
      h.store.markRead("spc_1", 4);
      expect(puts).toEqual([{ spaces: { spc_1: 3 } }]);
      answer();
      await started();
      expect(puts).toEqual([{ spaces: { spc_1: 3 } }, { spaces: { spc_1: 4 } }]);
    });

    it("hears another device's marks, forward only", async () => {
      const h = harness({
        cursor: 5,
        cached: [OPENED, event(2), event(3)],
        readState: { spc_1: 2 },
        get: (path) =>
          path === "/v1/me/read" ? Promise.resolve({ spaces: { spc_1: 2 } }) : notThisTests(),
        put: async () => undefined,
      });
      await started();
      h.wire().onReads?.({ spc_1: 3 });
      h.wire().onReads?.({ spc_1: 1 });
      h.flush();
      expect(h.store.getSnapshot().readState).toEqual({ spc_1: 3 });
      expect(h.savedReadState).toEqual([{ spc_1: 3 }]);
    });

    it("on a device never sent anything, greets once the person's marks are read", async () => {
      let give: (marks: unknown) => void = () => undefined;
      const h = harness({
        get: (path) =>
          path === "/v1/me/read"
            ? new Promise((resolve) => {
                give = resolve;
              })
            : notThisTests(),
        put: async () => undefined,
      });
      await started();
      let greeted = false;
      void h.wire().greetAfter?.then(() => {
        greeted = true;
      });
      await started();
      expect(greeted).toBe(false);

      give({ spaces: { spc_1: 9 } });
      await started();
      expect(greeted).toBe(true);
      h.flush();
      expect(h.store.getSnapshot().readState).toEqual({ spc_1: 9 });
    });

    it("against an older server, counts from its own marks and sends none", async () => {
      const puts: unknown[] = [];
      const h = harness({
        cursor: 5,
        cached: [OPENED, event(2), event(3)],
        readState: { spc_1: 2 },
        get: () => Promise.reject(Object.assign(new Error("answered 404"), { status: 404 })),
        put: async (_path, body) => {
          puts.push(body);
          return undefined;
        },
      });
      await started();
      h.store.markRead("spc_1", 3);
      await started();
      expect(puts).toEqual([]);
      h.flush();
      expect(h.store.getSnapshot().readState).toEqual({ spc_1: 3 });
    });

    it("owes a write that didn't get there to the next hello", async () => {
      const puts: unknown[] = [];
      let fail = true;
      const h = harness({
        cursor: 5,
        cached: [OPENED, event(2), event(3)],
        readState: { spc_1: 2 },
        get: (path) =>
          path === "/v1/me/read" ? Promise.resolve({ spaces: { spc_1: 2 } }) : notThisTests(),
        put: async (_path, body) => {
          puts.push(body);
          if (fail) throw new Error("The connection dropped.");
          return undefined;
        },
      });
      await started();
      h.store.markRead("spc_1", 3);
      await started();
      expect(puts).toEqual([{ spaces: { spc_1: 3 } }]);

      fail = false;
      h.wire().onEvent({ type: "hello", spaces: ["spc_1"] } as unknown as ClientEvent);
      await started();
      expect(puts).toEqual([{ spaces: { spc_1: 3 } }, { spaces: { spc_1: 3 } }]);
    });
  });

  it("reports the connection state as the transport says it", async () => {
    const h = harness();
    await started();
    h.wire().onState("open");
    h.flush();
    expect(h.store.getSnapshot().connection).toBe("open");
  });
  it("says a removal that follows deleting your own account is your leaving (ADR 0243)", async () => {
    const asked: string[] = [];
    const h = harness({
      remove: async (path) => {
        asked.push(path);
        // The server shuts the socket as it removes the person, before it answers.
        h.wire().onState("removed");
        return { participant_id: "usr_1" };
      },
    });
    await started();
    h.wire().onState("open");
    await h.store.deleteAccount();
    expect(asked).toEqual(["/v1/people/me"]);
    h.flush();
    expect(h.store.getSnapshot()).toMatchObject({ connection: "removed", deletedAccount: true });
    // Nothing the socket says after takes it back.
    h.wire().onState("closed");
    h.flush();
    expect(h.store.getSnapshot().connection).toBe("removed");
  });

  it("takes it back when the server refuses, and a removal after is somebody else's", async () => {
    const h = harness({
      remove: async () => {
        throw new Error("You are the only owner.");
      },
    });
    await started();
    h.wire().onState("open");
    await expect(h.store.deleteAccount()).rejects.toThrow("only owner");
    h.flush();
    expect(h.store.getSnapshot().connection).toBe("open");
    h.wire().onState("removed");
    h.flush();
    expect(h.store.getSnapshot().connection).toBe("removed");
    expect(h.store.getSnapshot().deletedAccount).toBeUndefined();
  });
});

describe("a send the socket cannot take yet, or refuses (phase-1-interim-review finding 4)", () => {
  it("hands a send made before the socket exists to the socket once it does", async () => {
    const h = harness({ cached: [OPENED] });
    // The cache is still loading: there is no transport to send on.
    h.store.send({ spaceId: "spc_1", text: "Early" });
    expect(h.sent).toEqual([]);

    await started();
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({ type: "message.post", text: "Early" });
    h.flush();
    expect(h.store.getSnapshot().model.spaces[0]?.lines[0]).toMatchObject({
      text: "Early",
      pending: true,
    });
  });

  it("keeps a message the server refused on screen, marked with the reason", async () => {
    const h = harness({ cached: [OPENED] });
    await started();
    h.store.send({ spaceId: "spc_1", text: "Into the void" });
    h.wire().onError?.({
      code: "forbidden",
      message: "an event may only be sent into a space its sender is a member of",
      idempotencyKey: "msg-k1",
    });
    h.flush();
    const line = h.store.getSnapshot().model.spaces[0]?.lines[0];
    expect(line).toMatchObject({ text: "Into the void", pending: true });
    expect(line?.failed).toContain("a member of");
  });

  it("shows a decision as busy until the server acknowledges it", async () => {
    const h = harness({ cached: [OPENED] });
    await started();
    h.store.resolveApproval({
      spaceId: "spc_1",
      runId: "run_1",
      approvalId: "apr_1",
      decision: "approved",
    });
    expect(h.sent.at(-1)).toMatchObject({
      type: "approval.resolved",
      idempotency_key: "apr_1-approved-k1",
    });
    h.flush();
    expect(h.store.getSnapshot().busy.has("apr_1")).toBe(true);

    h.wire().onAck?.({ idempotencyKey: "apr_1-approved-k1", seq: 9, duplicate: false });
    h.flush();
    expect(h.store.getSnapshot().busy.has("apr_1")).toBe(false);
  });

  it("sends an Always for every space as said, and never with another scope (ADR 0239)", async () => {
    const h = harness({ cached: [OPENED] });
    await started();
    const answer = { spaceId: "spc_1", runId: "run_1", approvalId: "apr_1" } as const;
    h.store.resolveApproval({ ...answer, decision: "approved", scope: "always", everywhere: true });
    expect(h.sent.at(-1)).toMatchObject({ scope: "always", everywhere: true });
    h.store.resolveApproval({
      ...answer,
      decision: "approved",
      scope: "session",
      everywhere: true,
    });
    expect(h.sent.at(-1)).not.toHaveProperty("everywhere");
  });

  it("frees a decision the server refused, so it can be tried again", async () => {
    const h = harness({ cached: [OPENED] });
    await started();
    h.store.resolveApproval({
      spaceId: "spc_1",
      runId: "run_1",
      approvalId: "apr_1",
      decision: "denied",
    });
    h.wire().onError?.({ code: "forbidden", message: "no", idempotencyKey: "apr_1-denied-k1" });
    h.flush();
    expect(h.store.getSnapshot().busy.size).toBe(0);
  });

  it("says why an answer was refused, until the next try", async () => {
    // The Chess Game space, 15 September 2026: the refusal went nowhere, so the phone's Send
    // looked as if it did nothing.
    const h = harness({ cached: [OPENED] });
    await started();
    const answer = () =>
      h.store.answerQuestion({
        spaceId: "spc_1",
        runId: "run_1",
        askId: "qst_1",
        answers: [{ questionId: "choice", values: ["approve"] }],
      });
    answer();
    const key = String(h.sent.at(-1)?.["idempotency_key"]);
    h.wire().onError?.({
      code: "invalid_event",
      message: "question.answered was refused: the run has ended as done",
      idempotencyKey: key,
    });
    h.flush();
    expect(h.store.getSnapshot().refused?.get("qst_1")).toBe(
      "question.answered was refused: the run has ended as done",
    );
    expect(h.store.getSnapshot().busy.has("qst_1")).toBe(false);

    answer();
    h.flush();
    expect(h.store.getSnapshot().refused?.has("qst_1")).toBe(false);
    expect(h.store.getSnapshot().busy.has("qst_1")).toBe(true);
  });

  /**
   * Agents review, finding 13: a refused add was silent. The apps choose Add or Move from the
   * directory before sending, and when that was a moment stale nothing happened and nothing was
   * said; "Put in a room" opened a room the agent never arrived in.
   */
  it("says in the room why an add was refused, and reads who is where again", async () => {
    let reads = 0;
    const h = harness({
      cached: [OPENED],
      get: async (path) => {
        if (path === "/v1/participants") reads += 1;
        return { participants: [] };
      },
    });
    await started();
    const before = reads;
    h.store.addMember({ spaceId: "spc_1", participantId: "agt_1", kind: "agent" });
    const key = String(h.sent.at(-1)?.["idempotency_key"]);
    h.wire().onError?.({
      code: "forbidden",
      message: "that agent is in another room: move it, or pick another",
      idempotencyKey: key,
      refusal: "agent_elsewhere",
      spaceId: "spc_2",
    });
    await started();
    h.flush();
    expect(h.store.getSnapshot().notices?.get("spc_1")).toBe(
      "That agent is in another room: move it, or pick another.",
    );
    expect(reads).toBeGreaterThan(before);

    // The next change sent for the room lets the notice go; so does the room, when asked.
    h.store.removeMember({ spaceId: "spc_1", participantId: "agt_2" });
    h.flush();
    expect(h.store.getSnapshot().notices?.has("spc_1")).toBe(false);
    h.wire().onError?.({
      code: "forbidden",
      message: "the Main agent stays in its Main room",
      idempotencyKey: String(h.sent.at(-1)?.["idempotency_key"]),
      refusal: "lead_room",
    });
    h.flush();
    expect(h.store.getSnapshot().notices?.get("spc_1")).toBe(
      "The Main agent stays in its Main room.",
    );
    h.store.dismissNotice("spc_1");
    h.flush();
    expect(h.store.getSnapshot().notices?.has("spc_1")).toBe(false);
  });

  it("draws somebody taken out out of the room at once, and back if the server says no", async () => {
    // Foodie, 19 October 2026: the removal waited while the phone connected, nothing moved, and
    // Arjun asked twice more.
    const danaIn = event(2, {
      type: "membership.added",
      actor: { kind: "person", id: "usr_1" },
      participant_id: "usr_2",
      participant_kind: "person",
      role: "member",
    });
    const h = harness({ cached: [OPENED, danaIn] });
    await started();
    h.flush();
    const members = () =>
      h.store.getSnapshot().model.spaces.find((space) => space.id === "spc_1")?.members ?? [];
    expect(members()).toContain("usr_2");

    h.store.removeMember({ spaceId: "spc_1", participantId: "usr_2" });
    h.flush();
    expect(members()).not.toContain("usr_2");

    // Turned away, she is back, and the room says why.
    h.wire().onError?.({
      code: "invalid",
      message: "they are not in this space any more",
      idempotencyKey: String(h.sent.at(-1)?.["idempotency_key"]),
    });
    await started();
    h.flush();
    expect(members()).toContain("usr_2");
    expect(h.store.getSnapshot().notices?.get("spc_1")).toBe(
      "They are not in this space any more.",
    );

    // Taken out again, and the log says so: out, with nothing left laid over the room.
    h.store.removeMember({ spaceId: "spc_1", participantId: "usr_2" });
    h.wire().onEvent(
      event(3, {
        type: "membership.removed",
        actor: { kind: "person", id: "usr_1" },
        participant_id: "usr_2",
        removed_by: "usr_1",
      }),
    );
    h.flush();
    expect(members()).not.toContain("usr_2");
    // Added back later, she is in again: the removal was let go once the log had her out.
    h.wire().onEvent({ ...danaIn, seq: 4, id: "evt_4" });
    h.flush();
    expect(members()).toContain("usr_2");
  });

  it("draws somebody taken out out of the room while the link is still connecting, sends it once, and lets it go when the log catches up (SH-1)", async () => {
    // Arjun's phone on 19 October 2026: the socket opened over the relay, and the hello came 17 s
    // later. A removal made in between waits in the outbox; the sheet must move at once, so that
    // nobody asks again.
    const danaIn = event(2, {
      type: "membership.added",
      actor: { kind: "person", id: "usr_1" },
      participant_id: "usr_2",
      participant_kind: "person",
      role: "member",
    });
    const h = harness({ cached: [OPENED, danaIn] });
    await started();
    h.wire().onState("connecting");
    h.flush();
    const members = () =>
      h.store.getSnapshot().model.spaces.find((space) => space.id === "spc_1")?.members ?? [];
    expect(h.store.getSnapshot().connection).toBe("connecting");
    expect(members()).toContain("usr_2");

    h.store.removeMember({ spaceId: "spc_1", participantId: "usr_2" });
    h.flush();
    // Out of the room at once, with nothing heard from the server, and handed to the outbox once.
    expect(members()).not.toContain("usr_2");
    const removals = () => h.sent.filter((each) => each["type"] === "membership.removed");
    expect(removals()).toHaveLength(1);
    // The link comes up; nothing new is sent, and she stays out.
    h.wire().onState("open");
    h.flush();
    expect(removals()).toHaveLength(1);
    expect(members()).not.toContain("usr_2");
    // The server's answer, then the log's line: still out, and nothing is left laid over the room.
    h.wire().onAck?.({
      idempotencyKey: String(removals()[0]?.["idempotency_key"]),
      seq: 3,
      duplicate: false,
    });
    h.wire().onEvent(
      event(3, {
        type: "membership.removed",
        actor: { kind: "person", id: "usr_1" },
        participant_id: "usr_2",
        removed_by: "usr_1",
      }),
    );
    h.flush();
    expect(members()).not.toContain("usr_2");
    h.wire().onEvent({ ...danaIn, seq: 4, id: "evt_4" });
    h.flush();
    expect(members()).toContain("usr_2");
  });

  it("says in the room why a rename was refused (ADR 0112)", async () => {
    const h = harness({ cached: [OPENED] });
    await started();
    h.store.updateSpace({ spaceId: "spc_1", title: "Kitchen" });
    expect(h.sent.at(-1)).toMatchObject({ type: "space.updated", title: "Kitchen" });
    h.wire().onError?.({
      code: "forbidden",
      message: "a guest may not retitle or close a space",
      idempotencyKey: String(h.sent.at(-1)?.["idempotency_key"]),
      refusal: "wrong_role",
    });
    h.flush();
    expect(h.store.getSnapshot().notices?.get("spc_1")).toBe(
      "A guest may not retitle or close a space.",
    );
  });

  it("says nothing in the room for an add the server took", async () => {
    const h = harness({ cached: [OPENED] });
    await started();
    h.store.addMember({ spaceId: "spc_1", participantId: "agt_1", kind: "agent" });
    h.wire().onAck?.({
      idempotencyKey: String(h.sent.at(-1)?.["idempotency_key"]),
      seq: 9,
      duplicate: false,
    });
    h.flush();
    expect(h.store.getSnapshot().notices?.size).toBe(0);
  });

  it("reads the directory once more, not once each, when asked while a read is under way", async () => {
    let reads = 0;
    let release: (() => void) | undefined;
    const h = harness({
      cached: [OPENED],
      get: async (path) => {
        if (path !== "/v1/participants") return {};
        reads += 1;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { participants: [] };
      },
    });
    /** Let every read that is waiting land, until none is. */
    const drain = async () => {
      for (let turn = 0; turn < 6; turn += 1) {
        await started();
        release?.();
        release = undefined;
      }
    };
    await drain();
    const before = reads;
    const all = [
      h.store.refreshDirectory(),
      h.store.refreshDirectory(),
      h.store.refreshDirectory(),
      h.store.refreshDirectory(),
    ];
    await drain();
    await Promise.all(all);
    // One under way, and one more for everything asked meanwhile.
    expect(reads - before).toBe(2);
  });

  it("takes back the room it made for a copy when the ask is refused", async () => {
    const removed: string[] = [];
    const h = harness({
      cached: [OPENED],
      post: async (path) => {
        if (path.endsWith("/fork")) throw new Error("That agent's harness does not make copies.");
        return {};
      },
      remove: async (path) => {
        removed.push(path);
        return { erased: [] };
      },
    });
    await started();
    await expect(h.store.forkIntoNewRoom("agt_1", "Shopping · fork")).rejects.toThrow(
      "does not make copies",
    );
    const made = h.sent.find((event) => event["type"] === "space.created");
    expect(made?.["title"]).toBe("Shopping · fork");
    expect(removed).toEqual([`/v1/spaces/${String(made?.["space_id"])}`]);
  });

  it("asks a harness for a new agent in a room named after it, and takes the room back when refused", async () => {
    const removed: string[] = [];
    const asked: { path: string; body: unknown }[] = [];
    const h = harness({
      cached: [OPENED],
      post: async (path, body) => {
        asked.push({ path, body });
        if (path.endsWith("/agents")) throw new Error("Hermes does not make new agents.");
        return {};
      },
      remove: async (path) => {
        removed.push(path);
        return { erased: [] };
      },
    });
    await started();
    await expect(h.store.askIntoNewRoom("hrn_hermes", "Ivy")).rejects.toThrow(
      "does not make new agents",
    );
    const made = h.sent.find((event) => event["type"] === "space.created");
    expect(made?.["title"]).toBe("Ivy");
    const room = String(made?.["space_id"]);
    expect(asked.at(-1)?.path).toBe(`/v1/spaces/${room}/agents`);
    expect(asked.at(-1)?.body).toMatchObject({ harness_id: "hrn_hermes", name: "Ivy" });
    expect(removed).toEqual([`/v1/spaces/${room}`]);
  });

  it("keeps a refused message on its own line, not among refused commands", async () => {
    const h = harness({ cached: [OPENED] });
    await started();
    h.store.send({ spaceId: "spc_1", text: "Fine" });
    const key = String(h.sent.at(-1)?.["idempotency_key"]);
    h.wire().onError?.({ code: "forbidden", message: "not a member", idempotencyKey: key });
    h.flush();
    expect(h.store.getSnapshot().refused?.size).toBe(0);
  });

  it("ignores an error that names no event of its own", async () => {
    const h = harness({ cached: [OPENED] });
    await started();
    h.store.send({ spaceId: "spc_1", text: "Fine" });
    h.wire().onError?.({ code: "invalid_frame", message: "That frame is not JSON." });
    h.flush();
    expect(h.store.getSnapshot().model.spaces[0]?.lines[0]?.failed).toBeUndefined();
  });
});

describe("acting on a run (M1.3)", () => {
  it("sends a pause, a resume and a stop, each busy until the server answers", async () => {
    const h = harness({ cached: [OPENED] });
    await started();
    const run = { spaceId: "spc_1", runId: "run_1" };

    h.store.pauseRun(run);
    expect(h.sent.at(-1)).toMatchObject({ type: "run.pause", run_id: "run_1" });
    h.flush();
    expect(h.store.getSnapshot().busy.has("run_1")).toBe(true);
    h.wire().onAck?.({
      idempotencyKey: String(h.sent.at(-1)?.["idempotency_key"]),
      seq: 5,
      duplicate: false,
    });
    h.flush();
    expect(h.store.getSnapshot().busy.has("run_1")).toBe(false);

    h.store.resumeRun(run);
    expect(h.sent.at(-1)).toMatchObject({ type: "run.resume" });
    h.store.stopRun({ ...run, reason: "the vendor called" });
    expect(h.sent.at(-1)).toMatchObject({ type: "run.cancel", reason: "the vendor called" });
    for (const event of h.sent) expect(String(event["idempotency_key"])).toMatch(/^run-run_1-/);
  });

  it("shows a steer at once as the person's own line, and confirms it by its echo", async () => {
    const h = harness({ cached: [OPENED] });
    await started();
    h.store.steerRun({
      spaceId: "spc_1",
      runId: "run_1",
      mode: "interrupt",
      text: "Ask Dana first.",
    });
    const key = String(h.sent.at(-1)?.["idempotency_key"]);
    expect(h.sent.at(-1)).toMatchObject({
      type: "run.steer",
      mode: "interrupt",
      text: "Ask Dana first.",
    });
    h.flush();
    const optimistic = h.store.getSnapshot().model.spaces[0]?.lines.at(-1);
    expect(optimistic).toMatchObject({ pending: true, mode: "interrupt", authorId: "usr_1" });

    h.wire().onEvent(
      event(2, {
        type: "run.steer",
        actor: { kind: "person", id: "usr_1" },
        run_id: "run_1",
        mode: "interrupt",
        text: "Ask Dana first.",
        from: { participant_id: "usr_1", kind: "person", display_name: "Arjun", role: "owner" },
        idempotency_key: key,
      }),
    );
    h.flush();
    const lines = h.store.getSnapshot().model.spaces[0]?.lines ?? [];
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ seq: 2, mode: "interrupt", key });
    expect(lines[0]?.pending).toBeUndefined();
  });

  it("remembers what Chips did with a message sent mid-run", async () => {
    const h = harness({ cached: [OPENED] });
    await started();
    h.store.send({ spaceId: "spc_1", text: "Any news?" });
    h.wire().onReceipt?.({ idempotencyKey: "msg-k1", disposition: "queued" });
    h.flush();
    expect(h.store.getSnapshot().receipts.get("msg-k1")).toBe("queued");
  });
});

describe("deciding, answering and turning the dial (M1.4)", () => {
  it("gives every decision attempt a key of its own, so a retry is not the decision that won", async () => {
    const h = harness({ cached: [OPENED] });
    await started();
    h.store.resolveApproval({
      spaceId: "spc_1",
      runId: "run_1",
      approvalId: "apr_1",
      decision: "approved",
    });
    expect(h.sent.at(-1)).toMatchObject({
      type: "approval.resolved",
      idempotency_key: "apr_1-approved-k1",
    });
    h.flush();
    expect(h.store.getSnapshot().busy.has("apr_1")).toBe(true);
  });

  it("answers a question in the shape the protocol wants, busy until the server answers", async () => {
    const h = harness({ cached: [OPENED] });
    await started();
    h.store.answerQuestion({
      spaceId: "spc_1",
      runId: "run_1",
      askId: "qst_1",
      answers: [{ questionId: "date", values: ["19"], freeText: "the 19th please" }],
    });
    expect(h.sent.at(-1)).toMatchObject({
      type: "question.answered",
      run_id: "run_1",
      ask_id: "qst_1",
      answers: [{ question_id: "date", values: ["19"], free_text: "the 19th please" }],
      idempotency_key: "qst_1-k1",
    });
    h.flush();
    expect(h.store.getSnapshot().busy.has("qst_1")).toBe(true);
    h.wire().onAck?.({ idempotencyKey: "qst_1-k1", seq: 3, duplicate: false });
    h.flush();
    expect(h.store.getSnapshot().busy.has("qst_1")).toBe(false);
  });

  it("turns the dial as a policy event, naming the level and not the cap", async () => {
    const h = harness({ cached: [OPENED] });
    await started();
    h.store.setAutonomy({ harnessId: "hrn_1", spaceId: "spc_1", level: 3, rules: [] });
    expect(h.sent.at(-1)).toMatchObject({
      type: "policy.updated",
      space_id: "spc_1",
      harness_id: "hrn_1",
      policy: { autonomy: 3, rules: [] },
    });
    expect(h.sent.at(-1)).not.toHaveProperty("workspace_max_autonomy");
    h.flush();
    expect(h.store.getSnapshot().busy.has("hrn_1")).toBe(true);
  });

  it("sends a scope's rules whole at the level that scope has (ADR 0195)", async () => {
    const policy = (seq: number, extra: Record<string, unknown>) =>
      event(seq, {
        type: "policy.updated",
        actor: { kind: "person", id: "usr_1" },
        harness_id: "hrn_1",
        workspace_max_autonomy: 3,
        changed_by: "usr_1",
        ...extra,
      });
    const h = harness({
      cached: [
        OPENED,
        policy(2, { space_id: undefined, policy: { autonomy: 1, rules: [] } }),
        policy(3, { policy: { autonomy: 2, rules: [{ match: "shell.exec", decision: "allow" }] } }),
      ],
    });
    await started();
    const off = [{ match: "shell.exec", decision: "allow", off: true }];
    h.store.setRules({ harnessId: "hrn_1", spaceId: "spc_1", rules: off });
    expect(h.sent.at(-1)).toMatchObject({
      type: "policy.updated",
      space_id: "spc_1",
      harness_id: "hrn_1",
      policy: { autonomy: 2, rules: off },
    });
    expect(h.sent.at(-1)).not.toHaveProperty("workspace_max_autonomy");
    // Everywhere, at the harness's own level.
    h.store.setRules({ harnessId: "hrn_1", rules: [] });
    expect(h.sent.at(-1)).toMatchObject({ policy: { autonomy: 1, rules: [] } });
    expect(h.sent.at(-1)).not.toHaveProperty("space_id");
  });
});

describe("feedback, from the store (M3.4)", () => {
  it("sends a reaction and a note as feedback on the line's message, busy until answered", async () => {
    const h = harness({ cached: [OPENED, event(2, { id: "evt_01K4ZQPX000000000000000067" })] });
    await started();
    const lineId = "evt_01K4ZQPX000000000000000067";
    h.store.sendFeedback({ spaceId: "spc_1", lineId, kind: "reaction", reaction: "👎" });
    h.store.sendFeedback({ spaceId: "spc_1", lineId, kind: "correction", text: "The 19th." });
    expect(h.sent).toEqual([
      {
        type: "feedback",
        space_id: "spc_1",
        message_id: "msg_01K4ZQPX000000000000000067",
        kind: "reaction",
        reaction: "👎",
        idempotency_key: `feedback-${lineId}-k1`,
      },
      {
        type: "feedback",
        space_id: "spc_1",
        message_id: "msg_01K4ZQPX000000000000000067",
        kind: "correction",
        text: "The 19th.",
        idempotency_key: `feedback-${lineId}-k1`,
      },
    ]);
    h.flush();
    expect(h.store.getSnapshot().busy.has(lineId)).toBe(true);
    h.wire().onAck?.({ idempotencyKey: `feedback-${lineId}-k1`, seq: 3, duplicate: false });
    h.flush();
    expect(h.store.getSnapshot().busy.has(lineId)).toBe(false);
  });

  it("keeps a refused note's words and why, by its line, until the next note there (PM-4)", async () => {
    // The live check of 18 October 2026: the door refused every Not right?, and nothing said so.
    const h = harness({ cached: [OPENED, event(2, { id: "evt_01K4ZQPX000000000000000067" })] });
    await started();
    const lineId = "evt_01K4ZQPX000000000000000067";
    const key = `feedback-${lineId}-k1`;
    h.store.sendFeedback({ spaceId: "spc_1", lineId, kind: "correction", text: "The 19th." });
    h.flush();
    expect(h.store.getSnapshot().unsentNotes?.size).toBe(0);
    h.wire().onError?.({
      code: "invalid_event",
      message: "that message was taken back, and takes nothing more",
      idempotencyKey: key,
    });
    h.flush();
    expect(h.store.getSnapshot().unsentNotes?.get(lineId)).toEqual({
      text: "The 19th.",
      reason: "that message was taken back, and takes nothing more",
    });
    expect(h.store.getSnapshot().busy.has(lineId)).toBe(false);

    // Another note on the line puts it away; one that goes leaves nothing.
    h.store.sendFeedback({ spaceId: "spc_1", lineId, kind: "correction", text: "The 20th." });
    h.flush();
    expect(h.store.getSnapshot().unsentNotes?.has(lineId)).toBe(false);
    h.wire().onAck?.({ idempotencyKey: key, seq: 3, duplicate: false });
    h.flush();
    expect(h.store.getSnapshot().unsentNotes?.has(lineId)).toBe(false);

    // A refused reaction is no note.
    h.store.sendFeedback({ spaceId: "spc_1", lineId, kind: "reaction", reaction: "👎" });
    h.wire().onError?.({ code: "invalid_event", message: "no", idempotencyKey: key });
    h.flush();
    expect(h.store.getSnapshot().unsentNotes?.has(lineId)).toBe(false);
  });
});

describe("a group space, from the store (M3.3)", () => {
  it("opens a direct room asked of a harness, with no name of its own", async () => {
    const h = harness();
    await started();
    const spaceId = h.store.createSpace({ kind: "direct", askedOf: "hrn_2" });
    expect(h.sent).toEqual([
      {
        type: "space.created",
        space_id: spaceId,
        kind: "direct",
        asked_of: "hrn_2",
        idempotency_key: `space-${spaceId}`,
      },
    ]);
  });

  it("opens a room asked of harnesses by the name the person gave it (ADR 0149)", async () => {
    const h = harness();
    await started();
    const spaceId = h.store.createSpace({
      kind: "group",
      askedOf: "hrn_2",
      alsoAskedOf: ["hrn_3"],
      title: "Japan trip",
    });
    expect(h.sent).toEqual([
      {
        type: "space.created",
        space_id: spaceId,
        kind: "group",
        asked_of: "hrn_2",
        also_asked_of: ["hrn_3"],
        title: "Japan trip",
        idempotency_key: `space-${spaceId}`,
      },
    ]);
  });

  it("opens a group asked of one harness, for others to be added beside it, with no name either", async () => {
    const h = harness();
    await started();
    const spaceId = h.store.createSpace({ kind: "group", askedOf: "hrn_2" });
    expect(h.sent).toEqual([
      {
        type: "space.created",
        space_id: spaceId,
        kind: "group",
        asked_of: "hrn_2",
        idempotency_key: `space-${spaceId}`,
      },
    ]);
  });

  it("opens a space with an id it minted, and manages who is in it", async () => {
    const h = harness();
    await started();
    const spaceId = h.store.createSpace({ title: "Northwind" });
    expect(spaceId).toMatch(/^spc_/);
    h.store.addMember({ spaceId, participantId: "hrn_2", kind: "harness" });
    h.store.removeMember({ spaceId, participantId: "hrn_2" });
    h.store.updateSpace({ spaceId, title: "Northwind quotes" });
    h.store.updateSpace({ spaceId, state: "closed" });
    expect(h.sent).toEqual([
      {
        type: "space.created",
        space_id: spaceId,
        kind: "group",
        title: "Northwind",
        idempotency_key: `space-${spaceId}`,
      },
      {
        type: "membership.added",
        space_id: spaceId,
        participant_id: "hrn_2",
        participant_kind: "harness",
        role: "member",
        idempotency_key: `add-${spaceId}-hrn_2-k1`,
      },
      {
        type: "membership.removed",
        space_id: spaceId,
        participant_id: "hrn_2",
        removed_by: "usr_1",
        idempotency_key: `remove-${spaceId}-hrn_2-k1`,
      },
      {
        type: "space.updated",
        space_id: spaceId,
        title: "Northwind quotes",
        idempotency_key: `space-${spaceId}-k1`,
      },
      {
        type: "space.updated",
        space_id: spaceId,
        state: "closed",
        idempotency_key: `space-${spaceId}-k1`,
      },
    ]);
  });

  it("reads a room it was added to live from its beginning, once", async () => {
    const asked: string[] = [];
    const opening = event(1, {
      type: "space.created",
      space_id: "spc_9",
      actor: { kind: "person", id: "usr_2" },
      kind: "group",
      title: "Northwind",
    });
    const h = harness({
      get: async (path) => {
        asked.push(path);
        if (path.startsWith("/v1/participants")) return { participants: [] };
        return {
          events: [opening, event(2, { space_id: "spc_9", text: "before you came" })],
          next_cursor: null,
        };
      },
    });
    await started();
    // The join arrives live; the store has never seen spc_9 open.
    h.wire().onEvent(
      event(3, {
        type: "membership.added",
        space_id: "spc_9",
        actor: { kind: "person", id: "usr_2" },
        participant_id: "usr_1",
        participant_kind: "person",
        role: "member",
      }),
    );
    await started();
    h.flush();
    expect(asked.filter((path) => path.includes("space_id=spc_9"))).toEqual([
      "/v1/events?since=0&space_id=spc_9&limit=500",
    ]);
    const room = h.snapshots.at(-1)?.model.spaces.find((space) => space.id === "spc_9");
    expect(room?.title).toBe("Northwind");
    // What was said before, and the room's line that says who brought the reader in (JR-5).
    expect(room?.lines.filter((line) => line.kind === "text").map((line) => line.text)).toEqual([
      "before you came",
    ]);

    // Somebody else joining the same room reads nothing again.
    h.wire().onEvent(
      event(4, {
        type: "membership.added",
        space_id: "spc_9",
        actor: { kind: "person", id: "usr_2" },
        participant_id: "usr_3",
        participant_kind: "person",
      }),
    );
    await started();
    expect(asked.filter((path) => path.includes("space_id=spc_9"))).toHaveLength(1);
  });

  // JR-16: added back to a room they were taken out of, a person found it empty and untitled.
  it("brings a room back whole when the reader is added again, and reads what they missed", async () => {
    const asked: string[] = [];
    const opening = event(1, {
      type: "space.created",
      space_id: "spc_9",
      actor: { kind: "person", id: "usr_2" },
      kind: "group",
      title: "Northwind",
    });
    const before = event(2, { space_id: "spc_9", text: "before you came" });
    const away = event(5, { space_id: "spc_9", text: "while you were out" });
    const h = harness({
      get: async (path) => {
        asked.push(path);
        if (path.startsWith("/v1/participants")) return { participants: [] };
        return { events: [opening, before, away], next_cursor: null };
      },
    });
    await started();
    const membership = (seq: number, type: string) =>
      event(seq, {
        type,
        space_id: "spc_9",
        actor: { kind: "person", id: "usr_2" },
        participant_id: "usr_1",
        participant_kind: "person",
        role: "member",
      });
    h.wire().onEvent(membership(3, "membership.added"));
    await started();
    h.flush();
    h.wire().onEvent(membership(4, "membership.removed"));
    await started();
    h.flush();
    expect(h.snapshots.at(-1)?.model.spaces.some((space) => space.id === "spc_9")).toBe(false);

    h.wire().onEvent(membership(6, "membership.added"));
    await started();
    h.flush();
    const room = h.snapshots.at(-1)?.model.spaces.find((space) => space.id === "spc_9");
    expect(room?.title).toBe("Northwind");
    expect(room?.members).toContain("usr_1");
    expect(room?.lines.map((line) => line.text)).toEqual(
      expect.arrayContaining(["before you came", "while you were out"]),
    );
    // Read once on the first joining and once on the return, for what the socket never sent.
    expect(asked.filter((path) => path.includes("space_id=spc_9"))).toHaveLength(2);
  });

  it("reads a listed room again from its beginning when the cache lost its opening (found 11 September 2026)", async () => {
    const asked: string[] = [];
    const opening = event(3, {
      type: "space.created",
      space_id: "spc_9",
      actor: { kind: "harness", id: "hrn_1" },
      kind: "direct",
      title: "design test space",
    });
    const joined = event(4, {
      type: "membership.added",
      space_id: "spc_9",
      actor: { kind: "harness", id: "hrn_1" },
      participant_id: "usr_1",
      participant_kind: "person",
      role: "owner",
    });
    const answer = event(5, { space_id: "spc_9", text: "The answer, from the lane." });
    // The phone's cache kept the room's answer but lost its opening and the membership beside
    // it: the three arrived within a millisecond, and the cache of the day dropped the batch.
    const h = harness({
      cached: [OPENED, answer],
      cursor: 5,
      get: async (path) => {
        asked.push(path);
        if (path.startsWith("/v1/participants")) return { participants: [] };
        return { events: [opening, joined, answer], next_cursor: null };
      },
    });
    await started();
    h.flush();
    // Folded from its answer alone, the room is a glimpse of somebody else's: off the list.
    const before = h.snapshots.at(-1)?.model.spaces.find((space) => space.id === "spc_9");
    expect(before?.glimpse).toBe(true);
    expect(before?.title).toBeUndefined();

    // The server's hello says this device is in it; the store reads it from its beginning.
    h.wire().onEvent({ type: "hello", spaces: ["spc_1", "spc_9"] } as unknown as ClientEvent);
    await started();
    h.flush();
    expect(asked.filter((path) => path.includes("space_id="))).toEqual([
      "/v1/events?since=0&space_id=spc_9&limit=500",
    ]);
    const after = h.snapshots.at(-1)?.model.spaces.find((space) => space.id === "spc_9");
    expect(after?.glimpse).toBe(false);
    expect(after?.title).toBe("design test space");
    expect(after?.members).toContain("usr_1");
    // What was read again is cached, so the next launch holds the opening too.
    expect(h.saved.flat().map((saved) => saved.seq)).toEqual(expect.arrayContaining([3, 4]));

    // Listed again on the next connect, a room seen opened is not read again.
    h.wire().onEvent({ type: "hello", spaces: ["spc_1", "spc_9"] } as unknown as ClientEvent);
    await started();
    expect(asked.filter((path) => path.includes("space_id="))).toHaveLength(1);
  });

  it("leaves the replay to bring the openings when it starts from nothing", async () => {
    const asked: string[] = [];
    const h = harness({
      get: async (path) => {
        asked.push(path);
        return { participants: [] };
      },
    });
    await started();
    h.wire().onEvent({ type: "hello", spaces: ["spc_1", "spc_9"] } as unknown as ClientEvent);
    await started();
    expect(asked.filter((path) => path.includes("space_id="))).toEqual([]);
  });
});

describe("a space made here, before the server sends it back (ADR 0149's third addendum)", () => {
  /** What the + sends: the space by its name, asked of a harness, and the harness added. */
  const makeRoom = (h: ReturnType<typeof harness>) => {
    const spaceId = h.store.createSpace({ kind: "direct", askedOf: "hrn_2", title: "Dude chat" });
    h.store.addMember({ spaceId, participantId: "hrn_2", kind: "harness", agentName: "Luis" });
    h.flush();
    return spaceId;
  };
  const spaceIn = (h: ReturnType<typeof harness>, spaceId: string) =>
    h.store.getSnapshot().model.spaces.find((space) => space.id === spaceId);

  it("is in the model at once, by its name, with who was asked, at the top of the list", async () => {
    const h = harness({ cached: [OPENED] });
    await started();
    h.flush();
    const spaceId = makeRoom(h);
    const space = spaceIn(h, spaceId);
    expect(space?.title).toBe("Dude chat");
    expect(space?.askedOf).toBe("hrn_2");
    expect(space?.members).toEqual(["usr_1", "hrn_2"]);
    expect(h.store.getSnapshot().model.spaces[0]?.id).toBe(spaceId);
  });

  it("takes a message sent in it, after the space in the outbox, and shows it on its way", async () => {
    const h = harness();
    await started();
    const spaceId = makeRoom(h);
    h.store.send({ spaceId, text: "Plan a dinner" });
    h.flush();
    expect(h.sent.map((each) => each["type"])).toEqual([
      "space.created",
      "membership.added",
      "message.post",
    ]);
    expect(spaceIn(h, spaceId)?.lines.at(-1)?.text).toBe("Plan a dinner");
  });

  it("gives way to the server's own once it is folded, and is not drawn twice", async () => {
    const h = harness();
    await started();
    const spaceId = makeRoom(h);
    h.wire().onEvent(
      event(40, {
        type: "space.created",
        space_id: spaceId,
        actor: { kind: "person", id: "usr_1" },
        kind: "direct",
        asked_of: "hrn_2",
        title: "Dude chat",
      }),
    );
    h.flush();
    const spaces = h.store.getSnapshot().model.spaces.filter((space) => space.id === spaceId);
    expect(spaces).toHaveLength(1);
    expect(spaces[0]?.lastEventSeq).toBe(40);
  });

  it("keeps who was sent in until the server sends them back, so the room never empties", async () => {
    const h = harness();
    await started();
    const spaceId = makeRoom(h);
    const key = h.sent.find((each) => each["type"] === "membership.added")?.["idempotency_key"];
    h.wire().onEvent(
      event(40, {
        type: "space.created",
        space_id: spaceId,
        actor: { kind: "person", id: "usr_1" },
        kind: "direct",
        asked_of: "hrn_2",
        title: "Dude chat",
        idempotency_key: `space-${spaceId}`,
      }),
    );
    h.flush();
    // The server's own, and the harness still in it: "What would you like to do?", not "Nobody's
    // here yet", while its membership.added is on its way.
    expect(spaceIn(h, spaceId)?.lastEventSeq).toBe(40);
    expect(spaceIn(h, spaceId)?.members).toEqual(["usr_1", "hrn_2"]);
    h.wire().onEvent(
      event(41, {
        type: "membership.added",
        space_id: spaceId,
        actor: { kind: "person", id: "usr_1" },
        participant_id: "hrn_2",
        participant_kind: "harness",
        role: "member",
        agent_name: "Luis",
        idempotency_key: key,
      }),
    );
    h.flush();
    expect(spaceIn(h, spaceId)?.members).toEqual(["usr_1", "hrn_2"]);
    // Sent back, it is the server's to say from here: taken out, it is gone.
    h.wire().onEvent(
      event(42, {
        type: "membership.removed",
        space_id: spaceId,
        actor: { kind: "person", id: "usr_1" },
        participant_id: "hrn_2",
      }),
    );
    h.flush();
    expect(spaceIn(h, spaceId)?.members).toEqual(["usr_1"]);
  });

  it("stops keeping one the server would not put in", async () => {
    const h = harness();
    await started();
    const spaceId = makeRoom(h);
    const key = h.sent.find((each) => each["type"] === "membership.added")?.["idempotency_key"];
    h.wire().onEvent(
      event(40, {
        type: "space.created",
        space_id: spaceId,
        actor: { kind: "person", id: "usr_1" },
        kind: "direct",
        asked_of: "hrn_2",
        title: "Dude chat",
        idempotency_key: `space-${spaceId}`,
      }),
    );
    h.wire().onError?.({
      code: "not_found",
      message: "that harness was removed",
      idempotencyKey: String(key),
    });
    h.flush();
    expect(spaceIn(h, spaceId)?.members).toEqual(["usr_1"]);
  });

  it("waits for its own space.created after the server's yes, which may come first", async () => {
    const h = harness();
    await started();
    const spaceId = makeRoom(h);
    h.wire().onAck?.({ idempotencyKey: `space-${spaceId}`, seq: 40, duplicate: false });
    h.flush();
    expect(spaceIn(h, spaceId)?.title).toBe("Dude chat");
  });

  it("is kept by the cache until the server says yes, and not after", async () => {
    const h = harness();
    await started();
    const spaceId = makeRoom(h);
    const kept = h.savedMadeHere.at(-1);
    expect(kept?.map((each) => each.spaceId)).toEqual([spaceId]);
    expect(kept?.[0]?.sent.map((each) => each["type"])).toEqual([
      "space.created",
      "membership.added",
    ]);
    h.wire().onAck?.({ idempotencyKey: `space-${spaceId}`, seq: 40, duplicate: false });
    h.flush();
    // The server has it: sent again after an erase, it would make the room again.
    expect(h.savedMadeHere.at(-1)).toEqual([]);
    // Drawn still, until its own space.created comes back.
    expect(spaceIn(h, spaceId)?.title).toBe("Dude chat");
  });

  it("is drawn after a relaunch, and goes again ahead of the message written in it", async () => {
    const first = harness();
    await started();
    const spaceId = makeRoom(first);
    first.store.send({ spaceId, text: "Plan a dinner" });
    first.flush();
    first.store.close();

    // The app was quit before the server ever heard of the space.
    const again = harness({
      madeHere: first.savedMadeHere.at(-1) ?? [],
      outbox: first.savedOutbox.at(-1) ?? [],
    });
    await started();
    again.flush();
    expect(spaceIn(again, spaceId)?.title).toBe("Dude chat");
    expect(spaceIn(again, spaceId)?.lines.at(-1)?.text).toBe("Plan a dinner");
    expect(again.sent.map((each) => each["type"])).toEqual([
      "space.created",
      "membership.added",
      "message.post",
    ]);
  });

  it("is not sent again after a relaunch when the history it kept already has it", async () => {
    const first = harness();
    await started();
    const spaceId = makeRoom(first);
    const created = event(40, {
      type: "space.created",
      space_id: spaceId,
      actor: { kind: "person", id: "usr_1" },
      kind: "direct",
      asked_of: "hrn_2",
      title: "Dude chat",
    });

    const again = harness({ madeHere: first.savedMadeHere.at(-1) ?? [], cached: [created] });
    await started();
    again.flush();
    expect(again.sent).toEqual([]);
    expect(
      again.store.getSnapshot().model.spaces.filter((space) => space.id === spaceId),
    ).toHaveLength(1);
  });

  it("goes from the list when the server turns it away, and its room says why", async () => {
    const h = harness();
    await started();
    const spaceId = makeRoom(h);
    h.wire().onError?.({
      code: "forbidden",
      message: "a guest may not open a space",
      idempotencyKey: `space-${spaceId}`,
    });
    h.flush();
    expect(spaceIn(h, spaceId)).toBeUndefined();
    expect(h.store.getSnapshot().notices?.get(spaceId)).toBe(
      "This space wasn't made. A guest may not open a space.",
    );
  });
});

describe("an unsent message survives a reload (found 5 September 2026)", () => {
  const before: QueuedMessage = {
    message: {
      key: "msg-before",
      spaceId: "spc_1",
      authorId: "usr_1",
      text: "Typed before the reload",
      ts: "2026-09-03T00:00:00.500Z",
    },
    event: {
      type: "message.post",
      space_id: "spc_1",
      text: "Typed before the reload",
      idempotency_key: "msg-before",
    },
  };
  const echo = (key: string, text: string) =>
    event(2, { actor: { kind: "person", id: "usr_1" }, text, idempotency_key: key });

  it("keeps a send in the cache until its event streams back", async () => {
    const h = harness({ cached: [OPENED] });
    await started();
    h.store.send({ spaceId: "spc_1", text: "Still going" });
    h.flush();
    expect(h.savedOutbox.at(-1)).toEqual([
      {
        message: expect.objectContaining({ key: "msg-k1", spaceId: "spc_1", text: "Still going" }),
        event: expect.objectContaining({ type: "message.post", idempotency_key: "msg-k1" }),
      },
    ]);

    h.wire().onEvent(echo("msg-k1", "Still going"));
    h.flush();
    expect(h.savedOutbox.at(-1)).toEqual([]);
  });

  it("takes back a message that has not gone: the line, the cache and the socket's outbox", async () => {
    const h = harness({ cached: [OPENED] });
    await started();
    h.store.send({ spaceId: "spc_1", text: "Never mind" });
    h.flush();
    expect(h.store.getSnapshot().model.spaces[0]?.lines.at(-1)?.text).toBe("Never mind");

    h.store.discard("msg-k1");
    h.flush();
    expect(h.store.getSnapshot().model.spaces[0]?.lines.some((line) => line.pending)).toBe(false);
    expect(h.savedOutbox.at(-1)).toEqual([]);
    // The socket forgets it too, or the next connection would carry it after all.
    expect(h.withdrawn).toEqual(["msg-k1"]);
  });

  it("does not take back a message the server already refused: it stays to be read", async () => {
    const h = harness({ cached: [OPENED] });
    await started();
    h.store.send({ spaceId: "spc_1", text: "No" });
    h.wire().onError?.({ code: "forbidden", message: "not a member", idempotencyKey: "msg-k1" });
    h.store.discard("msg-k1");
    h.flush();
    expect(h.store.getSnapshot().model.spaces[0]?.lines[0]?.failed).toBe("not a member");
    expect(h.withdrawn).toEqual([]);
  });

  it("leaves a message the server refused out of the cache: it stays on screen, and does not go again on its own", async () => {
    const h = harness({ cached: [OPENED] });
    await started();
    h.store.send({ spaceId: "spc_1", text: "No" });
    h.wire().onError?.({ code: "forbidden", message: "not a member", idempotencyKey: "msg-k1" });
    h.flush();
    expect(h.savedOutbox.at(-1)).toEqual([]);
    expect(h.store.getSnapshot().model.spaces[0]?.lines[0]?.failed).toBe("not a member");
  });

  it("shows a message the cache held as pending again, and sends it under the same key", async () => {
    const h = harness({ cached: [OPENED], outbox: [before] });
    await started();
    expect(h.sent).toEqual([before.event]);
    h.flush();
    expect(h.store.getSnapshot().model.spaces[0]?.lines[0]).toMatchObject({
      text: "Typed before the reload",
      pending: true,
      ts: "2026-09-03T00:00:00.500Z",
    });
    expect(h.savedOutbox.at(-1)).toEqual([before]);

    h.wire().onEvent(echo("msg-before", "Typed before the reload"));
    h.flush();
    const lines = h.store.getSnapshot().model.spaces[0]?.lines ?? [];
    expect(lines.map((line) => line.pending)).toEqual([undefined]);
    expect(h.savedOutbox.at(-1)).toEqual([]);
  });

  it("does not send again a message whose echo the cache already holds", async () => {
    const h = harness({
      cached: [OPENED, echo("msg-before", "Typed before the reload")],
      outbox: [before],
    });
    await started();
    expect(h.sent).toEqual([]);
    h.flush();
    const lines = h.store.getSnapshot().model.spaces[0]?.lines ?? [];
    expect(lines).toHaveLength(1);
    expect(lines[0]?.pending).toBeUndefined();
    expect(h.savedOutbox.at(-1)).toEqual([]);
  });

  it("marks a steer the cache held busy again until the server answers for it", async () => {
    const steer: QueuedMessage = {
      message: {
        key: "run-run_1-steer-old",
        spaceId: "spc_1",
        authorId: "usr_1",
        text: "Faster",
        ts: "2026-09-03T00:00:00.500Z",
        mode: "interrupt",
      },
      event: {
        type: "run.steer",
        space_id: "spc_1",
        run_id: "run_1",
        mode: "interrupt",
        text: "Faster",
        idempotency_key: "run-run_1-steer-old",
      },
    };
    const h = harness({ cached: [OPENED], outbox: [steer] });
    await started();
    h.flush();
    expect(h.sent).toEqual([steer.event]);
    expect(h.store.getSnapshot().busy.has("run_1")).toBe(true);
    expect(h.store.getSnapshot().model.spaces[0]?.lines[0]).toMatchObject({
      text: "Faster",
      mode: "interrupt",
      pending: true,
    });
  });
});

describe("people, invites, passkeys and devices (ADR 0034)", () => {
  it("changes a role as a role.changed the person is busy for until answered", async () => {
    const h = harness();
    await started();
    h.store.changeRole({ participantId: "usr_2", role: "admin", reason: "runs finance" });
    h.flush();
    expect(h.sent.at(-1)).toEqual({
      type: "role.changed",
      participant_id: "usr_2",
      role: "admin",
      reason: "runs finance",
      idempotency_key: "role-usr_2-k1",
    });
    expect(h.snapshots.at(-1)?.busy.has("usr_2")).toBe(true);
    h.wire().onAck?.({ idempotencyKey: "role-usr_2-k1", seq: 9, duplicate: false });
    h.flush();
    expect(h.snapshots.at(-1)?.busy.has("usr_2")).toBe(false);
  });

  it("caps what may be attached as an attachment.limits_set, and reads what the server takes", async () => {
    const h = harness({
      get: async (path) => {
        if (path === "/v1/limits")
          return { max_attachment_bytes: 104_857_600, max_message_bytes: 65_536 };
        return { participants: [], events: [], next_cursor: null };
      },
    });
    await started();
    h.store.setAttachmentCaps({ image: 26_214_400, video: null, file: 52_428_800 });
    h.flush();
    expect(h.sent.at(-1)).toEqual({
      type: "attachment.limits_set",
      image_bytes: 26_214_400,
      video_bytes: null,
      file_bytes: 52_428_800,
      idempotency_key: "caps-k1",
    });
    expect(await h.store.serverLimits()).toEqual({
      maxAttachmentBytes: 104_857_600,
      maxMessageBytes: 65_536,
    });
  });

  it("sets when Chips steps in on agents as an exchange.limits_set, all three at once (ADR 0187)", async () => {
    const h = harness();
    await started();
    h.store.setExchangeLimits({ stop: 32, hold: null, circles: false });
    h.flush();
    expect(h.sent.at(-1)).toEqual({
      type: "exchange.limits_set",
      stop: 32,
      hold: null,
      circles: false,
      idempotency_key: "exchange-limits-k1",
    });
  });

  it("reads invites, passkeys and devices off the wire into the shapes a screen shows", async () => {
    const h = harness({
      get: async (path) => {
        if (path === "/v1/invites") {
          return {
            invites: [
              {
                invite_id: "inv_1",
                role: "guest",
                single_use: false,
                uses: 2,
                created_by: "usr_1",
                created_at: "2026-09-06T09:00:00.000Z",
                expires_at: "2026-09-13T09:00:00.000Z",
                revoked_at: null,
              },
            ],
          };
        }
        if (path === "/v1/passkeys") {
          return {
            passkeys: [
              {
                passkey_id: "pky_1",
                name: "Mac",
                algorithm: -8,
                created_at: "2026-09-06T09:00:00.000Z",
                last_used_at: "2026-09-06T10:00:00.000Z",
                revoked_at: null,
              },
            ],
          };
        }
        if (path === "/v1/devices") {
          return {
            devices: [
              {
                device_id: "dev_1",
                name: "This browser",
                paired_at: "2026-09-06T09:00:00.000Z",
                last_seen_at: null,
                revoked_at: null,
                current: true,
              },
            ],
          };
        }
        return { participants: [] };
      },
    });
    await started();
    expect(await h.store.invites()).toEqual([
      {
        inviteId: "inv_1",
        role: "guest",
        singleUse: false,
        uses: 2,
        createdBy: "usr_1",
        createdAt: "2026-09-06T09:00:00.000Z",
        expiresAt: "2026-09-13T09:00:00.000Z",
        revokedAt: undefined,
      },
    ]);
    expect(await h.store.passkeys()).toEqual([
      {
        passkeyId: "pky_1",
        name: "Mac",
        algorithm: -8,
        createdAt: "2026-09-06T09:00:00.000Z",
        lastUsedAt: "2026-09-06T10:00:00.000Z",
        revokedAt: undefined,
      },
    ]);
    expect(await h.store.devices()).toEqual([
      {
        deviceId: "dev_1",
        name: "This browser",
        pairedAt: "2026-09-06T09:00:00.000Z",
        lastSeenAt: undefined,
        revokedAt: undefined,
        current: true,
      },
    ]);
  });

  it("makes and withdraws invites, and withdraws passkeys and devices, over signed calls", async () => {
    const posted: [string, unknown][] = [];
    const removed: string[] = [];
    const h = harness({
      post: async (path, body) => {
        posted.push([path, body]);
        return {
          invite_id: "inv_2",
          role: "guest",
          single_use: false,
          url: "http://127.0.0.1:5173/#invite=chips_inv_x",
          expires_at: "2026-09-13T09:00:00.000Z",
        };
      },
      remove: async (path) => {
        removed.push(path);
        return {};
      },
    });
    await started();
    expect(await h.store.createInvite({ role: "guest", singleUse: false })).toEqual({
      inviteId: "inv_2",
      role: "guest",
      singleUse: false,
      url: "http://127.0.0.1:5173/#invite=chips_inv_x",
      expiresAt: "2026-09-13T09:00:00.000Z",
    });
    expect(posted).toEqual([["/v1/invites", { role: "guest", single_use: false }]]);
    await h.store.revokeInvite("inv_2");
    await h.store.revokePasskey("pky_1");
    await h.store.revokeDevice("dev_2");
    expect(removed).toEqual(["/v1/invites/inv_2", "/v1/passkeys/pky_1", "/v1/devices/dev_2"]);
  });

  it("says the server's relay is under another key, and keeps saying so, without keeping the key (SEC-2)", async () => {
    const h = harness({});
    await started();
    h.wire().onState("open");
    h.flush();
    expect(h.store.getSnapshot().rekeyed).toBeUndefined();
    const named = { url: "wss://relay.test", serverKey: "x".repeat(43) };
    h.wire().onRekeyed?.(named);
    h.flush();
    expect(h.store.getSnapshot().rekeyed).toBe(true);
    // Said once per store: the transport says it again on every reconnect.
    const before = h.snapshots.length;
    h.wire().onRekeyed?.(named);
    h.flush();
    expect(h.snapshots.length).toBe(before);
    expect(h.store.getSnapshot().rekeyed).toBe(true);
  });

  it("keeps since when the socket has gone its way, and the way before it (ADR 0211)", async () => {
    const h = harness({ get: async () => ({ status: "ok" }) });
    await started();
    h.wire().onLink?.("relay");
    h.flush();
    expect(h.store.getSnapshot()).toMatchObject({
      link: "relay",
      linkSince: "2026-09-03T00:00:01.000Z",
    });
    expect(h.store.getSnapshot().linkBefore).toBeUndefined();
    // A reconnect the same way is the same stretch.
    h.wire().onLink?.("relay");
    h.wire().onLink?.("tunnel");
    h.flush();
    expect(h.store.getSnapshot()).toMatchObject({
      link: "tunnel",
      linkBefore: {
        kind: "relay",
        since: "2026-09-03T00:00:01.000Z",
        until: "2026-09-03T00:00:01.000Z",
      },
    });
    expect(await h.store.goDirect()).toBe(true);
    expect(h.wentDirect()).toBe(1);
    expect(await h.store.roundTrip()).toBeGreaterThanOrEqual(0);
  });

  it("keeps Only direct and a first direct connection with the device (ADR 0211, Phase 2)", async () => {
    const kept = new Map<string, unknown>([["dev_1", { ...DEVICE }]]);
    const deviceStorage: DeviceStorage = {
      put: async (key, value) => {
        kept.set(key, value);
      },
      remove: async (key) => {
        kept.delete(key);
      },
      entries: async () => [...kept.entries()],
    };
    const h = harness({ deviceStorage });
    await started();
    h.wire().onLink?.("relay");
    h.flush();
    expect(h.store.getSnapshot().wentDirect).toBeUndefined();
    h.wire().onLink?.("tunnel");
    h.flush();
    await started();
    expect(h.store.getSnapshot().wentDirect).toBe(true);
    expect(kept.get("dev_1")).toMatchObject({ wentDirect: true });

    await h.store.setOnlyDirect(true);
    h.flush();
    expect(h.store.getSnapshot().onlyDirect).toBe(true);
    expect(h.onlyDirect).toEqual([true]);
    expect(kept.get("dev_1")).toMatchObject({ onlyDirect: true });
    await h.store.setOnlyDirect(false);
    h.flush();
    expect(h.store.getSnapshot().onlyDirect).toBeUndefined();
    expect(kept.get("dev_1")).toMatchObject({ onlyDirect: false });
  });

  it("starts with what the device kept of Only direct", async () => {
    const h = harness({ device: { ...DEVICE, onlyDirect: true, wentDirect: true } });
    await started();
    h.flush();
    expect(h.store.getSnapshot()).toMatchObject({ onlyDirect: true, wentDirect: true });
  });

  it("carries the server's own address beside a pairing code, and copes without one", async () => {
    const wire: Record<string, unknown> = {
      code: "ABC-234",
      expires_at: "2026-09-06T09:15:00.000Z",
      server_url: "http://192.168.1.20:4431",
      relay: "wss://relay.example",
      server_key: "k".repeat(43),
      link: "https://relay.example/pair#pair=ABC-234&v=1",
    };
    const h = harness({ post: async () => wire });
    await started();
    expect(await h.store.issuePairingCode()).toEqual({
      code: "ABC-234",
      expiresAt: "2026-09-06T09:15:00.000Z",
      serverUrl: "http://192.168.1.20:4431",
      relay: "wss://relay.example",
      serverKey: "k".repeat(43),
      link: "https://relay.example/pair#pair=ABC-234&v=1",
    });

    // A server older than the field says nothing, and the screen falls back to what it can see.
    wire["server_url"] = null;
    wire["relay"] = null;
    wire["server_key"] = null;
    delete wire["link"];
    expect(await h.store.issuePairingCode()).toEqual({
      code: "ABC-234",
      expiresAt: "2026-09-06T09:15:00.000Z",
      serverUrl: undefined,
      relay: undefined,
      serverKey: undefined,
      link: undefined,
    });
  });

  it("asks for a code for somebody, in the place of one of their devices, by what the body names (ADR 0236)", async () => {
    const bodies: unknown[] = [];
    const h = harness({
      post: async (_path, body) => {
        bodies.push(body);
        return { code: "ABC-234", expires_at: "2026-10-26T09:15:00.000Z" };
      },
    });
    await started();
    await h.store.issuePairingCode();
    await h.store.issuePairingCode("usr_dana");
    await h.store.issuePairingCode("usr_dana", "dev_old");
    expect(bodies).toEqual([
      undefined,
      { for: "usr_dana" },
      { for: "usr_dana", replaces: "dev_old" },
    ]);
  });

  it("keeps whether each agent can answer, from the directory and each presence frame (ADR 0083)", async () => {
    const h = harness({
      get: async () => ({
        participants: [
          {
            id: "hrn_1",
            kind: "harness",
            display_name: "OpenClaw",
            owner_id: "usr_1",
            role: null,
            last_seen_at: "2026-09-28T18:00:00.000Z",
            state: { connected: true, since: "2026-09-28T18:00:00.000Z" },
          },
        ],
      }),
    });
    await started();
    h.flush();
    expect(h.snapshots.at(-1)?.directory["hrn_1"]?.state).toEqual({
      connected: true,
      since: "2026-09-28T18:00:00.000Z",
    });
    const trouble = {
      connected: true,
      since: "2026-09-28T18:00:00.000Z",
      trouble: { reason: "Can't reach its gateway", since: "2026-09-28T18:12:00.000Z" },
    };
    h.wire().onPresence?.({ participantId: "hrn_1", state: trouble });
    h.flush();
    expect(h.snapshots.at(-1)?.directory["hrn_1"]?.state).toEqual(trouble);
    // One the directory has not heard of waits for the next read, which will name it.
    h.wire().onPresence?.({ participantId: "hrn_2", state: trouble });
    h.flush();
    expect(h.snapshots.at(-1)?.directory["hrn_2"]).toBeUndefined();
  });

  it("asks a harness to restart, and holds its state restarting from the answer (ADR 0094)", async () => {
    const posted: string[] = [];
    const restarting = {
      connected: true,
      since: "2026-10-02T15:06:00.000Z",
      restarting: { since: "2026-10-02T15:31:00.000Z", by: "usr_1" },
    };
    const h = harness({
      post: async (path) => {
        posted.push(path);
        return { harness_id: "hrn_1", asked: true, sockets: 1, state: restarting };
      },
      get: async () => ({
        participants: [
          {
            id: "hrn_1",
            kind: "harness",
            display_name: "OpenClaw",
            owner_id: "usr_1",
            role: null,
            state: { connected: true, since: "2026-10-02T15:06:00.000Z" },
          },
        ],
      }),
    });
    await started();
    h.flush();
    await h.store.restartHarness("hrn_1");
    expect(posted).toEqual(["/v1/harnesses/hrn_1/restart"]);
    h.flush();
    // Restarting here at once, before the presence frame that tells every other device.
    expect(h.snapshots.at(-1)?.directory["hrn_1"]?.state).toEqual(restarting);
  });

  it("reads a participant of a kind it has never heard of as a harness (ADR 0088)", async () => {
    const h = harness({
      get: async () => ({
        participants: [
          { id: "bot_1", kind: "robot", display_name: "Tree", owner_id: null, role: null },
        ],
      }),
    });
    await started();
    h.flush();
    expect(h.snapshots.at(-1)?.directory["bot_1"]).toMatchObject({
      kind: "harness",
      displayName: "Tree",
    });
  });

  it("keeps the space a guest is in, and nobody else's (ADR 0034, finding PP-2)", async () => {
    const h = harness({
      get: async () => ({
        participants: [
          {
            id: "usr_2",
            kind: "person",
            display_name: "Priya",
            owner_id: null,
            role: "guest",
            guest_of: "spc_9",
          },
          {
            id: "usr_3",
            kind: "person",
            display_name: "Vendor",
            owner_id: null,
            role: "guest",
            guest_of: null,
          },
          { id: "usr_4", kind: "person", display_name: "Dana", owner_id: null, role: "member" },
          {
            id: "hrn_1",
            kind: "harness",
            display_name: "Tree",
            owner_id: null,
            role: null,
            guest_of: "spc_9",
          },
        ],
      }),
    });
    await started();
    h.flush();
    const directory = h.snapshots.at(-1)?.directory ?? {};
    expect(directory["usr_2"]?.guestOf).toBe("spc_9");
    expect(directory["usr_3"]?.guestOf).toBeNull();
    expect(directory["usr_4"]).not.toHaveProperty("guestOf");
    expect(directory["hrn_1"]).not.toHaveProperty("guestOf");
  });

  it("knows an agent by its harness, whose presence is its (ADR 0087)", async () => {
    const h = harness({
      get: async () => ({
        participants: [
          { id: "hrn_1", kind: "harness", display_name: "Jacobian", owner_id: "usr_1", role: null },
          {
            id: "agt_1",
            kind: "agent",
            display_name: "Chess Game",
            owner_id: "usr_1",
            role: null,
            harness_id: "hrn_1",
          },
        ],
      }),
    });
    await started();
    h.flush();
    expect(h.snapshots.at(-1)?.directory["agt_1"]).toMatchObject({
      kind: "agent",
      harnessId: "hrn_1",
      displayName: "Chess Game",
    });
    const trouble = { connected: true, since: "2026-09-30T00:00:00.000Z" };
    h.wire().onPresence?.({ participantId: "hrn_1", state: trouble });
    h.flush();
    expect(h.snapshots.at(-1)?.directory["agt_1"]?.state).toEqual(trouble);
    expect(h.snapshots.at(-1)?.directory["hrn_1"]?.state).toEqual(trouble);
  });

  it("reads a room's files at their current version as the server lists them (ADR 0099)", async () => {
    const h = harness({
      get: async (path) =>
        path === "/v1/spaces/spc_1/files"
          ? {
              files: [
                {
                  name: "gallery.html",
                  version: 2,
                  attachment_id: "att_2",
                  sha256: "b".repeat(64),
                  byte_size: 812,
                  mime_type: "text/html",
                  by: { id: "agt_oc3", kind: "agent", name: "Oc3" },
                  at: "2026-10-02T18:02:00.000Z",
                },
              ],
            }
          : { participants: [] },
    });
    await started();
    expect(await h.store.roomFiles("spc_1")).toEqual([
      {
        name: "gallery.html",
        version: 2,
        attachment: {
          id: "att_2",
          filename: "gallery.html",
          mimeType: "text/html",
          byteSize: 812,
          sha256: "b".repeat(64),
        },
        by: "agt_oc3",
        byName: "Oc3",
        at: "2026-10-02T18:02:00.000Z",
      },
    ]);
  });

  it("reads one file's versions, newest first, with each one's line and what it was made from (ADR 0100)", async () => {
    const version = (n: number, extra: Record<string, unknown> = {}) => ({
      name: "preview.png",
      version: n,
      attachment_id: `att_${n}`,
      sha256: String(n).repeat(64),
      byte_size: 900 + n,
      mime_type: "image/png",
      by: { id: "agt_oc2", kind: "agent", name: "Oc2" },
      at: `2026-10-02T18:0${n}:00.000Z`,
      message_id: `msg_01K4ZQPX00000000000000000${n}`,
      width: 1200,
      height: 800,
      ...extra,
    });
    const h = harness({
      get: async (path) =>
        path === "/v1/spaces/spc_1/files?name=preview.png"
          ? { files: [version(2, { replaces: "att_1" }), version(1)] }
          : { participants: [] },
    });
    await started();
    const versions = await h.store.fileVersions("spc_1", "preview.png");
    expect(versions.map((file) => [file.version, file.lineId, file.attachment.replaces])).toEqual([
      [2, "evt_01K4ZQPX000000000000000002", "att_1"],
      [1, "evt_01K4ZQPX000000000000000001", undefined],
    ]);
    expect(versions[0]?.attachment).toMatchObject({ width: 1200, height: 800 });
  });

  it("reads where an agent is, what waits, and the rooms it has been in (ADR 0087, Phase 5)", async () => {
    const h = harness({
      get: async (path) =>
        path === "/v1/agents/agt_1/stays"
          ? {
              agent_id: "agt_1",
              stays: [
                {
                  readable: true,
                  space_id: "spc_1",
                  from_seq: 3,
                  to_seq: 40,
                  from: "2026-09-05T00:00:00.000Z",
                  to: "2026-09-20T00:00:00.000Z",
                  lines: 9,
                },
                { readable: false, from: "2026-09-25T00:00:00.000Z", to: null, lines: 2 },
              ],
            }
          : {
              participants: [
                {
                  id: "agt_1",
                  kind: "agent",
                  display_name: "Chess Game",
                  owner_id: "usr_1",
                  role: null,
                  harness_id: "hrn_1",
                  agent_state: "archived",
                  room: null,
                  released_from: "spc_1",
                  last_space_id: "spc_1",
                  held: 2,
                },
              ],
            },
    });
    await started();
    h.flush();
    expect(h.snapshots.at(-1)?.directory["agt_1"]).toMatchObject({
      archived: true,
      room: null,
      releasedFrom: "spc_1",
      lastRoom: "spc_1",
      held: 2,
    });
    expect(await h.store.agentStays("agt_1")).toEqual([
      {
        readable: true,
        spaceId: "spc_1",
        fromSeq: 3,
        toSeq: 40,
        from: "2026-09-05T00:00:00.000Z",
        to: "2026-09-20T00:00:00.000Z",
        lines: 9,
      },
      { readable: false, from: "2026-09-25T00:00:00.000Z", to: null, lines: 2 },
    ]);
  });

  it("asks for a copy of an agent, and names a copy after its original (ADR 0087, Fork)", async () => {
    const posted: [string, unknown][] = [];
    const h = harness({
      post: async (path, body) => {
        posted.push([path, body]);
        return { fork_id: "evt_9", asked: true };
      },
      get: async () => ({
        participants: [
          { id: "agt_1", kind: "agent", display_name: "Shopping", owner_id: "usr_1", role: null },
          {
            id: "agt_2",
            kind: "agent",
            display_name: "Shopping",
            owner_id: "usr_1",
            role: null,
            forked_from: "agt_1",
          },
        ],
      }),
    });
    await started();
    h.flush();
    expect(h.snapshots.at(-1)?.directory["agt_2"]).toMatchObject({
      displayName: "Shopping · fork",
      forkedFrom: "agt_1",
    });
    expect(h.snapshots.at(-1)?.directory["agt_1"]?.displayName).toBe("Shopping");
    await h.store.forkAgent("agt_1", "spc_2");
    expect(posted).toEqual([["/v1/agents/agt_1/fork", { space_id: "spc_2" }]]);
  });

  it("locks an agent's changes and reads who is who again, which says so (ADR 0199)", async () => {
    const posted: [string, unknown][] = [];
    let locked = false;
    const h = harness({
      post: async (path, body) => {
        posted.push([path, body]);
        locked = (body as { locked: boolean }).locked;
        return { agent_id: "agt_1", locked, changed: true };
      },
      get: async () => ({
        participants: [
          {
            id: "agt_1",
            kind: "agent",
            display_name: "Shopping",
            owner_id: "usr_1",
            role: null,
            locked,
          },
        ],
      }),
    });
    await started();
    h.flush();
    expect(h.snapshots.at(-1)?.directory["agt_1"]?.locked).toBeUndefined();
    await h.store.setAgentLock("agt_1", true);
    h.flush();
    expect(posted).toEqual([["/v1/agents/agt_1/lock", { locked: true }]]);
    expect(h.snapshots.at(-1)?.directory["agt_1"]?.locked).toBe(true);
  });

  it("asks for a copy in a room opened here once the room has reached the server", async () => {
    let tries = 0;
    const h = harness({
      post: async () => {
        tries += 1;
        if (tries < 3) throw new Error("No room of that id here.");
        return { asked: true };
      },
    });
    await started();
    const spaceId = h.store.createSpace({ title: "Shopping · fork" });
    await h.store.forkAgent("agt_1", spaceId);
    expect(tries).toBe(3);
    // A room not opened here is not waited for.
    tries = 0;
    await expect(h.store.forkAgent("agt_1", "spc_elsewhere")).rejects.toThrow(/No room/);
    expect(tries).toBe(1);
  });

  it("asks a harness for a new agent, and hands this device its @ once it joins (ADR 0108)", async () => {
    const posted: [string, unknown][] = [];
    const h = harness({
      cached: [OPENED],
      post: async (path, body) => {
        posted.push([path, body]);
        return { ask_id: "evt_9", name: "Reviewer", asked: true };
      },
      get: async () => ({
        participants: [
          { id: "usr_1", kind: "person", display_name: "Arjun", role: "owner" },
          { id: "agt_9", kind: "agent", display_name: "Reviewer", owner_id: "usr_1", role: null },
        ],
      }),
    });
    await started();
    await h.store.askAgent("hrn_1", "spc_1", "Reviewer");
    expect(posted).toEqual([
      ["/v1/spaces/spc_1/agents", { harness_id: "hrn_1", key: "k1", name: "Reviewer" }],
    ]);
    // Nothing has joined yet.
    expect(h.store.takeArrival("spc_1")).toBeUndefined();
    h.wire().onEvent(
      event(9, {
        type: "agent.asked",
        actor: { kind: "person", id: "usr_1" },
        harness_id: "hrn_1",
        name: "Reviewer",
        by: "usr_1",
      }),
    );
    h.wire().onEvent(
      event(10, {
        type: "membership.added",
        participant_id: "agt_9",
        participant_kind: "agent",
        role: "member",
        made_for: "evt_9",
      }),
    );
    h.flush();
    expect(h.store.takeArrival("spc_1")).toBe("@Reviewer");
    // Once: the field is handed it, not handed it again at every draw.
    expect(h.store.takeArrival("spc_1")).toBeUndefined();
    // An empty name is left for the server to choose.
    await h.store.askAgent("hrn_1", "spc_1", "");
    expect(posted.at(-1)).toEqual(["/v1/spaces/spc_1/agents", { harness_id: "hrn_1", key: "k1" }]);
  });

  it("hands a harness on, and reads the directory again for its new owner (M5.2)", async () => {
    const posted: [string, unknown][] = [];
    let reads = 0;
    const h = harness({
      post: async (path, body) => {
        posted.push([path, body]);
        return {};
      },
      get: async () => {
        reads += 1;
        return {
          participants: [
            {
              id: "hrn_1",
              kind: "harness",
              display_name: "Scout",
              owner_id: reads > 1 ? "usr_2" : "usr_1",
              role: null,
            },
          ],
        };
      },
    });
    await started();
    await h.store.transferHarness("hrn_1", "usr_2");
    expect(posted).toEqual([["/v1/harnesses/hrn_1/owner", { owner_id: "usr_2" }]]);
    h.flush();
    expect(h.snapshots.at(-1)?.directory["hrn_1"]?.ownerId).toBe("usr_2");

    // The event arriving from another device reads the directory again too.
    const before = reads;
    h.wire().onEvent(
      event(2, {
        type: "harness.transferred",
        space_id: undefined,
        actor: { kind: "person", id: "usr_1" },
        harness_id: "hrn_1",
        from_owner_id: "usr_1",
        to_owner_id: "usr_2",
      }),
    );
    await started();
    expect(reads).toBeGreaterThan(before);
  });

  it("renames the person, and reads the directory again for every screen that names them (ADR 0082)", async () => {
    const posted: [string, unknown][] = [];
    let reads = 0;
    const h = harness({
      post: async (path, body) => {
        posted.push([path, body]);
        return {};
      },
      get: async () => {
        reads += 1;
        return {
          participants: [
            {
              id: "usr_1",
              kind: "person",
              display_name: reads > 1 ? "Arjun" : "You",
              owner_id: null,
              role: "owner",
            },
          ],
        };
      },
    });
    await started();
    await h.store.rename("Arjun");
    expect(posted).toEqual([["/v1/people/usr_1/name", { display_name: "Arjun" }]]);
    h.flush();
    expect(h.snapshots.at(-1)?.directory["usr_1"]?.displayName).toBe("Arjun");

    // Renamed on another device: the event reads the directory again here too.
    const before = reads;
    h.wire().onEvent(
      event(2, {
        type: "person.renamed",
        space_id: undefined,
        actor: { kind: "person", id: "usr_1" },
        participant_id: "usr_1",
        display_name: "Arjun",
        previous_name: "You",
      }),
    );
    await started();
    expect(reads).toBeGreaterThan(before);
  });

  it("keeps the name when the server refuses the new one, and says why", async () => {
    const h = harness({
      post: async () => {
        throw new Error("An agent here goes by Scout already.");
      },
    });
    await started();
    await expect(h.store.rename("Scout")).rejects.toThrow("An agent here goes by Scout already.");
  });

  it("says again what a harness takes, the whole list, and reads the directory again (ADR 0046)", async () => {
    const patched: [string, unknown][] = [];
    let reads = 0;
    const h = harness({
      patch: async (path, body) => {
        patched.push([path, body]);
        return { harness_id: "hrn_1", capabilities: ["autonomy", "models"], previous: [] };
      },
      get: async () => {
        reads += 1;
        return {
          participants: [
            {
              id: "hrn_1",
              kind: "harness",
              display_name: "Scout",
              owner_id: "usr_1",
              role: null,
              capabilities: reads > 1 ? ["autonomy", "models"] : ["autonomy"],
            },
          ],
        };
      },
    });
    await started();
    await h.store.declareCapabilities("hrn_1", ["autonomy", "models"]);
    expect(patched).toEqual([["/v1/harnesses/hrn_1", { capabilities: ["autonomy", "models"] }]]);
    h.flush();
    expect(h.snapshots.at(-1)?.directory["hrn_1"]?.capabilities).toEqual(["autonomy", "models"]);
  });

  it("removes a harness, and reads the directory again so the lists let it go (ADR 0078)", async () => {
    const deleted: string[] = [];
    let reads = 0;
    const h = harness({
      remove: async (path) => {
        deleted.push(path);
        return { harness_id: "hrn_1", already_removed: false };
      },
      get: async (path) => {
        if (path !== "/v1/participants") throw new Error("not this test's");
        reads += 1;
        return {
          participants: [
            {
              id: "hrn_1",
              kind: "harness",
              display_name: "Scout",
              owner_id: "usr_1",
              role: null,
              removed_at: reads > 1 ? "2026-09-27T10:00:00.000Z" : null,
            },
          ],
        };
      },
    });
    await started();
    h.flush();
    expect(h.snapshots.at(-1)?.directory["hrn_1"]?.removedAt).toBeUndefined();
    await h.store.removeHarness("hrn_1");
    expect(deleted).toEqual(["/v1/harnesses/hrn_1"]);
    h.flush();
    expect(h.snapshots.at(-1)?.directory["hrn_1"]).toMatchObject({
      displayName: "Scout",
      removedAt: "2026-09-27T10:00:00.000Z",
    });

    // Removed from another device: the event reads the directory again here too.
    const before = reads;
    h.wire().onEvent(
      event(2, {
        type: "harness.removed",
        space_id: undefined,
        actor: { kind: "person", id: "usr_1" },
        harness_id: "hrn_1",
        display_name: "Scout",
      }),
    );
    await started();
    expect(reads).toBeGreaterThan(before);
  });

  it("carries when a harness was last seen, null when never, and nothing for a person (the OpenClaw test, finding 18)", async () => {
    const h = harness({
      get: async () => ({
        participants: [
          {
            id: "usr_1",
            kind: "person",
            display_name: "Arjun",
            owner_id: null,
            last_seen_at: null,
          },
          {
            id: "hrn_1",
            kind: "harness",
            display_name: "Claw",
            owner_id: "usr_1",
            last_seen_at: null,
          },
          {
            id: "hrn_2",
            kind: "harness",
            display_name: "Scout",
            owner_id: "usr_1",
            last_seen_at: "2026-09-27T10:00:00.000Z",
          },
          // A server older than the field.
          { id: "hrn_3", kind: "harness", display_name: "Tree", owner_id: "usr_1" },
        ],
      }),
    });
    await started();
    h.flush();
    const directory = h.snapshots.at(-1)?.directory ?? {};
    expect(directory["hrn_1"]?.lastSeenAt).toBeNull();
    expect(directory["hrn_2"]?.lastSeenAt).toBe("2026-09-27T10:00:00.000Z");
    expect(directory["hrn_3"]).not.toHaveProperty("lastSeenAt");
    expect(directory["usr_1"]).not.toHaveProperty("lastSeenAt");
  });

  it("reads the directory again when a harness it says has never connected speaks (the OpenClaw test, finding 18)", async () => {
    let reads = 0;
    let connected = false;
    const h = harness({
      cached: [OPENED],
      get: async () => {
        reads += 1;
        return {
          participants: [
            { id: "usr_1", kind: "person", display_name: "Arjun", owner_id: null },
            {
              id: "hrn_1",
              kind: "harness",
              display_name: "Claw",
              owner_id: "usr_1",
              last_seen_at: connected ? "2026-09-27T10:00:00.000Z" : null,
            },
          ],
        };
      },
    });
    await started();
    h.flush();
    expect(h.snapshots.at(-1)?.directory["hrn_1"]?.lastSeenAt).toBeNull();
    const before = reads;

    // A person speaking says nothing of the harness.
    h.wire().onEvent(event(2, { actor: { kind: "person", id: "usr_1" } }));
    await started();
    expect(reads).toBe(before);

    // Its first words, two at once: it has connected, and the directory is read once to say so.
    connected = true;
    h.wire().onEvent(event(3));
    h.wire().onEvent(event(4));
    await started();
    expect(reads).toBe(before + 1);
    h.flush();
    expect(h.snapshots.at(-1)?.directory["hrn_1"]?.lastSeenAt).toBe("2026-09-27T10:00:00.000Z");

    // Seen now, and what it says next asks nothing more.
    h.wire().onEvent(event(5));
    await started();
    expect(reads).toBe(before + 1);
  });

  it("does not remove a harness here when the server will not", async () => {
    const h = harness({
      remove: async () => {
        throw new Error("A harness is removed by its owner, or by an owner or admin.");
      },
    });
    await started();
    await expect(h.store.removeHarness("hrn_1")).rejects.toThrow(/owner/);
  });

  it("carries a person's role from the directory", async () => {
    const h = harness({
      get: async () => ({
        participants: [
          { id: "usr_1", kind: "person", display_name: "Arjun", owner_id: null, role: "owner" },
          { id: "hrn_1", kind: "harness", display_name: "Scout", owner_id: "usr_1", role: null },
        ],
      }),
    });
    await started();
    h.flush();
    expect(h.snapshots.at(-1)?.directory["usr_1"]?.role).toBe("owner");
    expect(h.snapshots.at(-1)?.directory["hrn_1"]?.role).toBeUndefined();
  });
});

describe("messaging depth, from the store (M5.4)", () => {
  const LINE = "evt_01K4ZQPX000000000000000067";
  const MESSAGE = "msg_01K4ZQPX000000000000000067";

  it("sends an edit, a deletion, a pin and an unpin on the line's message, busy until answered", async () => {
    const h = harness({ cached: [OPENED, event(2, { id: LINE })] });
    await started();
    h.store.editMessage({ spaceId: "spc_1", lineId: LINE, text: "The 19th." });
    h.store.deleteMessage({ spaceId: "spc_1", lineId: LINE, reason: "Wrong room." });
    h.store.pinMessage({ spaceId: "spc_1", lineId: LINE });
    h.store.unpinMessage({ spaceId: "spc_1", lineId: LINE });
    expect(h.sent).toEqual([
      {
        type: "message.edited",
        space_id: "spc_1",
        message_id: MESSAGE,
        text: "The 19th.",
        idempotency_key: `message.edited-${LINE}-k1`,
      },
      {
        type: "message.deleted",
        space_id: "spc_1",
        message_id: MESSAGE,
        reason: "Wrong room.",
        idempotency_key: `message.deleted-${LINE}-k1`,
      },
      {
        type: "message.pinned",
        space_id: "spc_1",
        message_id: MESSAGE,
        idempotency_key: `message.pinned-${LINE}-k1`,
      },
      {
        type: "message.unpinned",
        space_id: "spc_1",
        message_id: MESSAGE,
        idempotency_key: `message.unpinned-${LINE}-k1`,
      },
    ]);
    h.flush();
    expect(h.store.getSnapshot().busy.has(LINE)).toBe(true);
    for (const type of [
      "message.edited",
      "message.deleted",
      "message.pinned",
      "message.unpinned",
    ]) {
      h.wire().onAck?.({ idempotencyKey: `${type}-${LINE}-k1`, seq: 3, duplicate: false });
    }
    h.flush();
    expect(h.store.getSnapshot().busy.has(LINE)).toBe(false);
  });

  it("deletes a line for the reader at once, and Undo puts it back at once (ADR 0167)", async () => {
    const h = harness({ cached: [OPENED, event(2, { id: LINE }), event(3)] });
    await started();
    const lines = () =>
      h.store.getSnapshot().model.spaces.find((space) => space.id === "spc_1")?.lines ?? [];
    h.store.hideMessage({ spaceId: "spc_1", lineId: LINE });
    expect(h.sent.at(-1)).toEqual({
      type: "message.hidden",
      space_id: "spc_1",
      message_id: MESSAGE,
      idempotency_key: `message.hidden-${LINE}-k1`,
    });
    h.flush();
    // Gone before the server has said a word, and the room did not move to the top for it.
    expect(lines().map((line) => line.id)).toEqual(["evt_3"]);
    // Answered before the event: it stays gone, and stays gone when the event folds.
    h.wire().onAck?.({ idempotencyKey: `message.hidden-${LINE}-k1`, seq: 4, duplicate: false });
    h.flush();
    expect(lines().map((line) => line.id)).toEqual(["evt_3"]);
    const hidden = (seq: number, type: string) =>
      event(seq, { type, actor: { kind: "person", id: "usr_1" }, message_id: MESSAGE });
    h.wire().onEvent?.(hidden(4, "message.hidden"));
    h.flush();
    expect(lines().map((line) => line.id)).toEqual(["evt_3"]);
    expect(h.store.getSnapshot().model.spaces[0]?.lastEventSeq).toBe(3);

    h.store.showMessage({ spaceId: "spc_1", lineId: LINE });
    h.flush();
    expect(lines().map((line) => line.id)).toEqual([LINE, "evt_3"]);
    expect(h.sent.at(-1)).toMatchObject({ type: "message.shown", message_id: MESSAGE });
    // The answer comes, then the event: back all along, never gone again in between.
    h.wire().onAck?.({ idempotencyKey: `message.shown-${LINE}-k1`, seq: 5, duplicate: false });
    h.flush();
    expect(lines().map((line) => line.id)).toEqual([LINE, "evt_3"]);
    h.wire().onEvent?.(hidden(5, "message.shown"));
    h.flush();
    expect(lines().map((line) => line.id)).toEqual([LINE, "evt_3"]);
  });

  it("keeps a line hidden on another device of the reader's, as the log tells it (ADR 0167)", async () => {
    const h = harness({ cached: [OPENED, event(2, { id: LINE })] });
    await started();
    h.wire().onEvent?.(
      event(3, {
        type: "message.hidden",
        actor: { kind: "person", id: "usr_1" },
        message_id: MESSAGE,
      }),
    );
    h.flush();
    const space = h.store.getSnapshot().model.spaces[0];
    expect(space?.lines).toEqual([]);
    expect(space?.hidden).toEqual(new Set([LINE]));
  });

  it("puts a line back when the server will not hide it, and says why (ADR 0167)", async () => {
    const h = harness({ cached: [OPENED, event(2, { id: LINE })] });
    await started();
    h.store.hideMessage({ spaceId: "spc_1", lineId: LINE });
    h.flush();
    expect(h.store.getSnapshot().model.spaces[0]?.lines).toEqual([]);
    h.wire().onError?.({
      code: "unknown_message",
      message: "no such message in this workspace",
      idempotencyKey: `message.hidden-${LINE}-k1`,
    });
    h.flush();
    const snapshot = h.store.getSnapshot();
    expect(snapshot.model.spaces[0]?.lines.map((line) => line.id)).toEqual([LINE]);
    expect(snapshot.notices?.get("spc_1")).toMatch(/no such message/i);
  });

  it("opens a thread from a line with an id it minted, and hands back the one already grown", async () => {
    const h = harness({ cached: [OPENED, event(2, { id: LINE })] });
    await started();
    const threadId = h.store.openThread({ spaceId: "spc_1", lineId: LINE });
    expect(threadId).toMatch(/^spc_/);
    expect(h.sent).toEqual([
      {
        type: "space.created",
        space_id: threadId,
        kind: "thread",
        parent_space_id: "spc_1",
        root_message_id: MESSAGE,
        idempotency_key: `space-${threadId}`,
      },
    ]);
    // Once the thread streams back, the line knows it, and asking again opens nothing new.
    h.wire().onEvent?.(
      event(3, {
        type: "space.created",
        id: "evt_thread",
        space_id: threadId,
        actor: { kind: "person", id: "usr_1" },
        kind: "thread",
        parent_space_id: "spc_1",
        root_message_id: MESSAGE,
        idempotency_key: `space-${threadId}`,
      }),
    );
    h.flush();
    expect(h.store.openThread({ spaceId: "spc_1", lineId: LINE })).toBe(threadId);
    expect(h.sent).toHaveLength(1);
  });

  it("reads the directory again at a reconnect's hello, for what a harness declared meanwhile", async () => {
    const asked: string[] = [];
    const h = harness({
      cached: [OPENED],
      get: async (path) => {
        asked.push(path);
        return { participants: [] };
      },
    });
    await started();
    const reads = () => asked.filter((path) => path.startsWith("/v1/participants")).length;
    const once = reads();
    // The first hello is the connect the start already read it for.
    h.wire().onEvent({ type: "hello", spaces: ["spc_1"] } as unknown as ClientEvent);
    await started();
    expect(reads()).toBe(once);
    h.wire().onEvent({ type: "hello", spaces: ["spc_1"] } as unknown as ClientEvent);
    await started();
    expect(reads()).toBe(once + 1);
  });

  it("searches over a signed GET, and reads the hits into the shapes a screen shows, a heard one too", async () => {
    const asked: string[] = [];
    const h = harness({
      cached: [OPENED],
      get: async (path) => {
        asked.push(path);
        if (path.startsWith("/v1/participants")) return { participants: [] };
        return {
          hits: [
            {
              kind: "message",
              space_id: "spc_1",
              at: "2026-09-06T12:00:00.000Z",
              snippet: "the \u{E000}Northwind\u{E001} quotes",
              message_id: MESSAGE,
              author_id: "usr_1",
            },
            {
              kind: "receipt",
              space_id: "spc_1",
              at: "2026-09-06T11:00:00.000Z",
              snippet: "Read PO",
              run_id: "run_1",
              step_id: "read-po",
            },
            {
              kind: "message",
              space_id: "spc_1",
              at: "2026-09-06T10:00:00.000Z",
              snippet: "send \u{E000}Northwind\u{E001} the receipt",
              snippet_from: "transcript",
              message_id: MESSAGE,
              author_id: "usr_1",
            },
          ],
          next_cursor: "abc",
        };
      },
    });
    await started();
    const page = await h.store.search({ text: "northwind", limit: 2, spaceId: "spc_1" });
    expect(asked.at(-1)).toBe("/v1/search?q=northwind&space_id=spc_1&limit=2");
    expect(page).toEqual({
      hits: [
        {
          kind: "message",
          spaceId: "spc_1",
          at: "2026-09-06T12:00:00.000Z",
          snippet: "the \u{E000}Northwind\u{E001} quotes",
          lineId: LINE,
          authorId: "usr_1",
        },
        {
          kind: "receipt",
          spaceId: "spc_1",
          at: "2026-09-06T11:00:00.000Z",
          snippet: "Read PO",
          runId: "run_1",
          stepId: "read-po",
        },
        {
          kind: "message",
          spaceId: "spc_1",
          at: "2026-09-06T10:00:00.000Z",
          snippet: "send \u{E000}Northwind\u{E001} the receipt",
          snippetFrom: "transcript",
          lineId: LINE,
          authorId: "usr_1",
        },
      ],
      nextCursor: "abc",
    });
    await h.store.search({ text: "more", cursor: "abc" });
    expect(asked.at(-1)).toBe("/v1/search?q=more&cursor=abc");
  });

  it("does not find a line the reader deleted for themselves (ADR 0167)", async () => {
    const hit = (messageId: string) => ({
      kind: "message",
      space_id: "spc_1",
      at: "2026-09-06T12:00:00.000Z",
      snippet: "\u{E000}Porto\u{E001}",
      message_id: messageId,
      author_id: "usr_1",
    });
    const h = harness({
      cached: [OPENED, event(2, { id: LINE }), event(3, { id: "evt_01K4ZQPX000000000000000068" })],
      get: async () => ({
        hits: [hit(MESSAGE), hit("msg_01K4ZQPX000000000000000068")],
        next_cursor: null,
      }),
    });
    await started();
    h.store.hideMessage({ spaceId: "spc_1", lineId: LINE });
    h.flush();
    const page = await h.store.search({ text: "porto" });
    expect(page.hits.map((each) => each.lineId)).toEqual(["evt_01K4ZQPX000000000000000068"]);
  });

  it("settles a queued receipt once the harness has spoken in the room (Phase 3 review, finding 10)", async () => {
    const h = harness({ cached: [OPENED] });
    await started();
    h.store.send({ spaceId: "spc_1", text: "Any news?" });
    h.wire().onEvent?.(
      event(2, {
        id: "evt_asked",
        actor: { kind: "person", id: "usr_1" },
        text: "Any news?",
        idempotency_key: "msg-k1",
      }),
    );
    h.wire().onReceipt?.({ idempotencyKey: "msg-k1", disposition: "queued" });
    h.flush();
    expect(h.store.getSnapshot().receipts.get("msg-k1")).toBe("queued");

    // Somebody else's line settles nothing; the harness's does.
    h.wire().onEvent?.(
      event(3, { id: "evt_dana", actor: { kind: "person", id: "usr_2" }, text: "Waiting too." }),
    );
    h.flush();
    expect(h.store.getSnapshot().receipts.get("msg-k1")).toBe("queued");
    h.wire().onEvent?.(event(4, { id: "evt_answer", text: "The 19th, confirmed." }));
    h.flush();
    expect(h.store.getSnapshot().receipts.has("msg-k1")).toBe(false);
  });
});

describe("handing an approval on, from the store (M5.5)", () => {
  it("sends the refs as the request's own words, busy until answered", async () => {
    const h = harness({ cached: [OPENED] });
    await started();
    h.store.routeApproval({
      spaceId: "spc_1",
      runId: "run_1",
      approvalId: "apr_1",
      to: ["role:admin", "usr_2"],
      reason: "Dana knows the account.",
    });
    expect(h.sent).toEqual([
      {
        type: "approval.routed",
        space_id: "spc_1",
        run_id: "run_1",
        approval_id: "apr_1",
        to: ["role:admin", "usr_2"],
        reason: "Dana knows the account.",
        idempotency_key: "apr_1-routed-k1",
      },
    ]);
    h.flush();
    expect(h.store.getSnapshot().busy.has("apr_1")).toBe(true);
    h.wire().onAck?.({ idempotencyKey: "apr_1-routed-k1", seq: 2, duplicate: false });
    h.flush();
    expect(h.store.getSnapshot().busy.has("apr_1")).toBe(false);
  });
});

describe("the face a person chose for a space, from the store", () => {
  it("reads them once, sets one, and puts one back to the default", async () => {
    // `OPENED.space_id` is typed loosely by the fixture; the room it opens is this one.
    const room = "spc_1";
    const asked: [string, string, unknown][] = [];
    const h = harness({
      cached: [OPENED],
      get: async (path) => {
        asked.push(["GET", path, undefined]);
        if (path.startsWith("/v1/participants")) return { participants: [] };
        return { icons: { [room]: { icon: "tent", ground: 7 } } };
      },
      put: async (path, body) => {
        asked.push(["PUT", path, body]);
        return body;
      },
      remove: async (path) => {
        asked.push(["DELETE", path, undefined]);
        return {};
      },
    });
    await started();
    // Nothing until read, and on the snapshot rather than behind a method, so a list redraws.
    expect(h.store.getSnapshot().spaceIcons.size).toBe(0);

    await h.store.loadSpaceIcons();
    h.flush();
    expect(h.store.getSnapshot().spaceIcons.get(room)).toEqual({
      icon: "tent",
      ground: 7,
    });

    await h.store.setSpaceIcon(room, { icon: "rocket", ground: 2 });
    h.flush();
    expect(h.store.getSnapshot().spaceIcons.get(room)).toEqual({
      icon: "rocket",
      ground: 2,
    });
    expect(asked.at(-1)).toEqual([
      "PUT",
      `/v1/me/space-icons/${room}`,
      { icon: "rocket", ground: 2 },
    ]);

    await h.store.setSpaceIcon(room, undefined);
    h.flush();
    expect(h.store.getSnapshot().spaceIcons.has(room)).toBe(false);
    expect(asked.at(-1)).toEqual(["DELETE", `/v1/me/space-icons/${room}`, undefined]);
  });
});

describe("the faces chosen for rooms, kept and read again (16 October 2026)", () => {
  const ICONS_PATH = "/v1/me/space-icons";
  const HELLO = { type: "hello", spaces: [] } as unknown as ClientEvent;

  it("draws the faces kept from last time at once, before the server answers", async () => {
    const h = harness({
      spaceIcons: { spc_1: { icon: "tent", ground: 7 }, spc_2: "not a face" },
      get: (path) => (path === ICONS_PATH ? new Promise(() => undefined) : Promise.resolve({})),
    });
    await started();
    h.flush();
    const icons = h.store.getSnapshot().spaceIcons;
    expect(icons.get("spc_1")).toEqual({ icon: "tent", ground: 7 });
    expect(icons.has("spc_2")).toBe(false);
  });

  it("reads them itself as it starts, and keeps each answer for the next launch", async () => {
    const h = harness({
      get: async (path) =>
        path === ICONS_PATH ? { icons: { spc_1: { icon: "rocket", ground: 2 } } } : {},
    });
    await started();
    h.flush();
    expect(h.store.getSnapshot().spaceIcons.get("spc_1")).toEqual({ icon: "rocket", ground: 2 });
    expect(h.savedSpaceIcons).toEqual([{ spc_1: { icon: "rocket", ground: 2 } }]);
  });

  it("reads them again at the hello when the launch's read failed, keeping what the cache held", async () => {
    // His iPhone through the relay after a fresh install: the one read failed and every room's
    // picture went to its letters until the app was closed.
    let reads = 0;
    let failing = true;
    const h = harness({
      spaceIcons: { spc_1: { icon: "tent", ground: 7 } },
      get: async (path) => {
        if (path !== ICONS_PATH) return {};
        reads += 1;
        if (failing) throw new Error("no way through yet");
        return { icons: { spc_1: { icon: "rocket", ground: 2 } } };
      },
    });
    await started();
    h.flush();
    expect(h.store.getSnapshot().spaceIcons.get("spc_1")).toEqual({ icon: "tent", ground: 7 });
    failing = false;
    h.wire().onState("open");
    h.wire().onEvent(HELLO);
    await started();
    h.flush();
    expect(reads).toBe(2);
    expect(h.store.getSnapshot().spaceIcons.get("spc_1")).toEqual({ icon: "rocket", ground: 2 });
  });

  it("tries twice more itself when a read fails with the socket open, then waits for the next hello", async () => {
    vi.useFakeTimers();
    try {
      let reads = 0;
      const h = harness({
        get: async (path) => {
          if (path !== ICONS_PATH) return {};
          reads += 1;
          throw new Error("the server had a moment");
        },
      });
      await vi.advanceTimersByTimeAsync(0);
      h.wire().onState("open");
      h.wire().onEvent(HELLO);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(2000);
      // The launch's (before the socket), the hello's, and the store's own two.
      expect(reads).toBe(4);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(reads).toBe(4);
      h.wire().onEvent(HELLO);
      await vi.advanceTimersByTimeAsync(0);
      expect(reads).toBe(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads them again at a reconnect's hello, for a face picked on another device meanwhile", async () => {
    let answer: Record<string, unknown> = { spc_1: { icon: "tent", ground: 7 } };
    let reads = 0;
    const h = harness({
      get: async (path) => {
        if (path !== ICONS_PATH) return {};
        reads += 1;
        return { icons: answer };
      },
    });
    await started();
    h.wire().onState("open");
    // The first hello is the connect the start already read them for.
    h.wire().onEvent(HELLO);
    await started();
    expect(reads).toBe(1);
    answer = { spc_1: { icon: "lighthouse", ground: 23 } };
    h.wire().onEvent(HELLO);
    await started();
    h.flush();
    expect(reads).toBe(2);
    expect(h.store.getSnapshot().spaceIcons.get("spc_1")).toEqual({
      icon: "lighthouse",
      ground: 23,
    });
  });

  it("keeps a pick on its way over a read that lands meanwhile, and keeps the pick for next time", async () => {
    let release: (() => void) | undefined;
    const h = harness({
      get: async (path) =>
        path === ICONS_PATH ? { icons: { spc_1: { icon: "tent", ground: 7 } } } : {},
      put: (_path, body) =>
        new Promise((resolve) => {
          release = () => resolve(body);
        }),
    });
    await started();
    const picked = h.store.setSpaceIcon("spc_1", { icon: "rocket", ground: 2 });
    // A read from before the pick lands while the server is still being told.
    await h.store.loadSpaceIcons();
    h.flush();
    expect(h.store.getSnapshot().spaceIcons.get("spc_1")).toEqual({ icon: "rocket", ground: 2 });
    release?.();
    await picked;
    h.flush();
    expect(h.store.getSnapshot().spaceIcons.get("spc_1")).toEqual({ icon: "rocket", ground: 2 });
    expect(h.savedSpaceIcons.at(-1)).toEqual({ spc_1: { icon: "rocket", ground: 2 } });
  });
});

describe("a face the server will not take", () => {
  it("shows at once, then goes back and says so, rather than looking like a dead tap", async () => {
    const room = "spc_1";
    const h = harness({
      cached: [OPENED],
      get: async (path) =>
        path.startsWith("/v1/participants") ? { participants: [] } : { icons: {} },
      put: async () => {
        throw new Error("not_found");
      },
    });
    await started();
    await h.store.loadSpaceIcons();
    h.flush();

    // The old server has no such route; the pick must not sit there silently doing nothing.
    const refused = h.store.setSpaceIcon(room, { icon: "tent", ground: 3 });
    await expect(refused).rejects.toThrow("not_found");
    h.flush();
    expect(h.store.getSnapshot().spaceIcons.has(room)).toBe(false);
  });

  it("puts the face that was there back, not merely the absence of one", async () => {
    const room = "spc_1";
    let allow = true;
    const h = harness({
      cached: [OPENED],
      get: async (path) =>
        path.startsWith("/v1/participants") ? { participants: [] } : { icons: {} },
      put: async (_path, body) => {
        if (!allow) throw new Error("not_found");
        return body;
      },
    });
    await started();
    await h.store.setSpaceIcon(room, { icon: "tent", ground: 3 });
    h.flush();
    expect(h.store.getSnapshot().spaceIcons.get(room)).toEqual({ icon: "tent", ground: 3 });

    allow = false;
    await expect(h.store.setSpaceIcon(room, { icon: "rocket", ground: 9 })).rejects.toThrow();
    h.flush();
    expect(h.store.getSnapshot().spaceIcons.get(room)).toEqual({ icon: "tent", ground: 3 });
  });
});

/** Puts and removes that wait to be answered, each taken or refused when the test says. */
function answeredLater() {
  const waiting: { take: () => void; refuse: () => void }[] = [];
  const pending = (_path: string, body?: unknown) =>
    new Promise<unknown>((resolve, reject) => {
      waiting.push({ take: () => resolve(body), refuse: () => reject(new Error("not_found")) });
    });
  return { waiting, pending };
}

describe("two faces picked for one room, both on their way", () => {
  const room = "spc_1";
  const TENT = { icon: "tent", ground: 3 };
  function answering() {
    const { waiting, pending } = answeredLater();
    const h = harness({
      cached: [OPENED],
      get: async (path) =>
        path.startsWith("/v1/participants") ? { participants: [] } : { icons: { [room]: TENT } },
      put: pending,
    });
    return { h, waiting, face: () => h.store.getSnapshot().spaceIcons.get(room) };
  }

  it("puts back the face from before both when both are refused, not the first pick", async () => {
    const { h, waiting, face } = answering();
    await started();
    await h.store.loadSpaceIcons();
    const first = h.store.setSpaceIcon(room, { icon: "rocket", ground: 9 });
    const second = h.store.setSpaceIcon(room, { icon: "cup", ground: 1 });
    h.flush();
    expect(face()).toEqual({ icon: "cup", ground: 1 });

    waiting[0]?.refuse();
    await expect(first).rejects.toThrow("not_found");
    waiting[1]?.refuse();
    await expect(second).rejects.toThrow("not_found");
    h.flush();
    expect(face()).toEqual(TENT);
    // Nor is a refused pick kept for the next launch.
    expect(h.savedSpaceIcons.at(-1)).toEqual({ [room]: TENT });
  });

  it("keeps the first when it is taken and the second is refused", async () => {
    const { h, waiting, face } = answering();
    await started();
    await h.store.loadSpaceIcons();
    const first = h.store.setSpaceIcon(room, { icon: "rocket", ground: 9 });
    const second = h.store.setSpaceIcon(room, { icon: "cup", ground: 1 });

    waiting[0]?.take();
    await first;
    waiting[1]?.refuse();
    await expect(second).rejects.toThrow("not_found");
    h.flush();
    expect(face()).toEqual({ icon: "rocket", ground: 9 });
  });
});

describe("the rooms hidden from the list (ADR 0205)", () => {
  const HIDDEN_PATH = "/v1/me/hidden-spaces";
  const HELLO = { type: "hello", spaces: [] } as unknown as ClientEvent;
  const hidden = (h: ReturnType<typeof harness>) => [...(h.store.getSnapshot().hiddenSpaces ?? [])];

  it("lists none hidden until told, then what the cache kept, then what the server says", async () => {
    let answer: unknown = new Promise(() => undefined);
    const h = harness({
      hiddenSpaces: ["spc_1"],
      get: (path) => (path === HIDDEN_PATH ? Promise.resolve(answer) : Promise.resolve({})),
    });
    await started();
    h.flush();
    // The cache's word first, so a hidden room is never listed while the server is asked.
    expect(hidden(h)).toEqual(["spc_1"]);

    answer = { spaces: ["spc_2"] };
    await h.store.loadHiddenSpaces();
    h.flush();
    expect(hidden(h)).toEqual(["spc_2"]);
    expect(h.savedHiddenSpaces.at(-1)).toEqual(["spc_2"]);
  });

  it("reads them again at a reconnect's hello, for a room hidden on another device", async () => {
    let answer: string[] = [];
    let reads = 0;
    const h = harness({
      get: async (path) => {
        if (path !== HIDDEN_PATH) return {};
        reads += 1;
        return { spaces: answer };
      },
    });
    await started();
    h.wire().onState("open");
    h.wire().onEvent(HELLO);
    await started();
    expect(reads).toBe(1);
    answer = ["spc_1"];
    h.wire().onEvent(HELLO);
    await started();
    h.flush();
    expect(reads).toBe(2);
    expect(hidden(h)).toEqual(["spc_1"]);
  });

  it("hides and unhides at once, and tells the server", async () => {
    const asked: [string, string][] = [];
    const h = harness({
      get: async (path) => (path === HIDDEN_PATH ? { spaces: [] } : {}),
      put: async (path) => {
        asked.push(["PUT", path]);
        return undefined;
      },
      remove: async (path) => {
        asked.push(["DELETE", path]);
        return undefined;
      },
    });
    await started();
    const hiding = h.store.setSpaceHidden("spc_1", true);
    h.flush();
    expect(hidden(h)).toEqual(["spc_1"]);
    await hiding;
    await h.store.setSpaceHidden("spc_1", false);
    h.flush();
    expect(hidden(h)).toEqual([]);
    expect(asked).toEqual([
      ["PUT", `${HIDDEN_PATH}/spc_1`],
      ["DELETE", `${HIDDEN_PATH}/spc_1`],
    ]);
    expect(h.savedHiddenSpaces.at(-1)).toEqual([]);
  });

  it("keeps a hide on its way over a read from before it", async () => {
    let release: (() => void) | undefined;
    const h = harness({
      get: async (path) => (path === HIDDEN_PATH ? { spaces: [] } : {}),
      put: () =>
        new Promise((resolve) => {
          release = () => resolve(undefined);
        }),
    });
    await started();
    const hiding = h.store.setSpaceHidden("spc_1", true);
    await h.store.loadHiddenSpaces();
    h.flush();
    expect(hidden(h)).toEqual(["spc_1"]);
    release?.();
    await hiding;
    expect(h.savedHiddenSpaces.at(-1)).toEqual(["spc_1"]);
  });

  it("puts a refused hide back and says why, rather than looking like a dead swipe", async () => {
    const h = harness({
      get: async (path) => (path === HIDDEN_PATH ? { spaces: [] } : {}),
      put: async () => {
        throw new Error("not_found");
      },
    });
    await started();
    await expect(h.store.setSpaceHidden("spc_1", true)).rejects.toThrow("not_found");
    h.flush();
    expect(hidden(h)).toEqual([]);
  });

  describe("a hide and an unhide both on their way", () => {
    function hiding() {
      const { waiting, pending } = answeredLater();
      const h = harness({
        get: async (path) => (path === HIDDEN_PATH ? { spaces: [] } : {}),
        put: pending,
        remove: pending,
      });
      return { h, waiting };
    }

    it("leaves the room as the server holds it when both are refused, not hidden", async () => {
      const { h, waiting } = hiding();
      await started();
      await h.store.loadHiddenSpaces();
      const hide = h.store.setSpaceHidden("spc_1", true);
      const unhide = h.store.setSpaceHidden("spc_1", false);
      waiting[0]?.refuse();
      await expect(hide).rejects.toThrow("not_found");
      waiting[1]?.refuse();
      await expect(unhide).rejects.toThrow("not_found");
      h.flush();
      expect(hidden(h)).toEqual([]);
      expect(h.savedHiddenSpaces.at(-1)).toEqual([]);
    });

    it("keeps the hide when it is taken and the unhide is refused", async () => {
      const { h, waiting } = hiding();
      await started();
      await h.store.loadHiddenSpaces();
      const hide = h.store.setSpaceHidden("spc_1", true);
      const unhide = h.store.setSpaceHidden("spc_1", false);
      waiting[0]?.take();
      await hide;
      waiting[1]?.refuse();
      await expect(unhide).rejects.toThrow("not_found");
      h.flush();
      expect(hidden(h)).toEqual(["spc_1"]);
    });
  });
});

describe("the rooms pinned to the top of the list (ADR 0240)", () => {
  const PINNED_PATH = "/v1/me/pinned-spaces";
  const HELLO = { type: "hello", spaces: [] } as unknown as ClientEvent;
  const pinned = (h: ReturnType<typeof harness>) => [...(h.store.getSnapshot().pinnedSpaces ?? [])];
  const asking = (asked: [string, string][]) => ({
    get: async (path: string) => (path === PINNED_PATH ? { spaces: [] } : {}),
    put: async (path: string) => {
      asked.push(["PUT", path]);
      return undefined;
    },
    remove: async (path: string) => {
      asked.push(["DELETE", path]);
      return undefined;
    },
  });

  it("draws what the cache kept, then what the server says, in its order", async () => {
    let answer: unknown = new Promise(() => undefined);
    const h = harness({
      pinnedSpaces: ["spc_1"],
      get: (path) => (path === PINNED_PATH ? Promise.resolve(answer) : Promise.resolve({})),
    });
    await started();
    h.flush();
    // The cache's word first, so a pinned room is on top from the first draw.
    expect(pinned(h)).toEqual(["spc_1"]);

    answer = { spaces: ["spc_3", "spc_2"] };
    await h.store.loadPinnedSpaces();
    h.flush();
    expect(pinned(h)).toEqual(["spc_3", "spc_2"]);
    expect(h.savedPinnedSpaces.at(-1)).toEqual(["spc_3", "spc_2"]);
  });

  it("reads them again at a reconnect's hello, for a room pinned on another device", async () => {
    let answer: string[] = [];
    let reads = 0;
    const h = harness({
      get: async (path) => {
        if (path !== PINNED_PATH) return {};
        reads += 1;
        return { spaces: answer };
      },
    });
    await started();
    h.wire().onState("open");
    h.wire().onEvent(HELLO);
    await started();
    expect(reads).toBe(1);
    answer = ["spc_1"];
    h.wire().onEvent(HELLO);
    await started();
    h.flush();
    expect(reads).toBe(2);
    expect(pinned(h)).toEqual(["spc_1"]);
  });

  it("pins on top at once, newest first, unpins, and tells the server", async () => {
    const asked: [string, string][] = [];
    const h = harness(asking(asked));
    await started();
    const pinning = h.store.setSpacePinned("spc_1", true);
    h.flush();
    expect(pinned(h)).toEqual(["spc_1"]);
    await pinning;
    await h.store.setSpacePinned("spc_2", true);
    h.flush();
    expect(pinned(h)).toEqual(["spc_2", "spc_1"]);
    await h.store.setSpacePinned("spc_1", false);
    h.flush();
    expect(pinned(h)).toEqual(["spc_2"]);
    expect(asked).toEqual([
      ["PUT", `${PINNED_PATH}/spc_1`],
      ["PUT", `${PINNED_PATH}/spc_2`],
      ["DELETE", `${PINNED_PATH}/spc_1`],
    ]);
    expect(h.savedPinnedSpaces.at(-1)).toEqual(["spc_2"]);
  });

  it("lets go of a room's pin as it is archived, as the server does, and of no other", async () => {
    const h = harness({ pinnedSpaces: ["spc_1", "spc_2"] });
    await started();
    h.wire().onState("open");
    const made = (seq: number, id: string) =>
      event(seq, {
        type: "space.created",
        space_id: id,
        actor: { kind: "person", id: "usr_1" },
        kind: "group",
        title: id,
      });
    h.wire().onEvent(made(1, "spc_1"));
    h.wire().onEvent(made(2, "spc_2"));
    h.wire().onEvent(event(3, { type: "space.updated", space_id: "spc_2", title: "Renamed" }));
    h.flush();
    expect(pinned(h)).toEqual(["spc_1", "spc_2"]);
    h.wire().onEvent(event(4, { type: "space.updated", space_id: "spc_1", state: "closed" }));
    h.flush();
    expect(pinned(h)).toEqual(["spc_2"]);
    expect(h.savedPinnedSpaces.at(-1)).toEqual(["spc_2"]);
  });

  it("keeps a pin on its way over a read from before it", async () => {
    let release: (() => void) | undefined;
    const h = harness({
      get: async (path) => (path === PINNED_PATH ? { spaces: ["spc_2"] } : {}),
      put: () =>
        new Promise((resolve) => {
          release = () => resolve(undefined);
        }),
    });
    await started();
    const pinning = h.store.setSpacePinned("spc_1", true);
    await h.store.loadPinnedSpaces();
    h.flush();
    expect(pinned(h)).toEqual(["spc_1", "spc_2"]);
    release?.();
    await pinning;
    expect(h.savedPinnedSpaces.at(-1)).toEqual(["spc_1", "spc_2"]);
  });

  it("puts a refused unpin back where it stood among the pins, and says why", async () => {
    const h = harness({
      get: async (path) => (path === PINNED_PATH ? { spaces: ["spc_3", "spc_2", "spc_1"] } : {}),
      remove: async () => {
        throw new Error("not_found");
      },
    });
    await started();
    await h.store.loadPinnedSpaces();
    await expect(h.store.setSpacePinned("spc_2", false)).rejects.toThrow("not_found");
    h.flush();
    expect(pinned(h)).toEqual(["spc_3", "spc_2", "spc_1"]);
  });

  describe("a pin and an unpin both on their way", () => {
    function pinning() {
      const { waiting, pending } = answeredLater();
      const h = harness({
        get: async (path) => (path === PINNED_PATH ? { spaces: ["spc_2"] } : {}),
        put: pending,
        remove: pending,
      });
      return { h, waiting };
    }

    it("leaves the pins as the server holds them when both are refused, not pinned", async () => {
      const { h, waiting } = pinning();
      await started();
      await h.store.loadPinnedSpaces();
      const pin = h.store.setSpacePinned("spc_1", true);
      const unpin = h.store.setSpacePinned("spc_1", false);
      waiting[0]?.refuse();
      await expect(pin).rejects.toThrow("not_found");
      waiting[1]?.refuse();
      await expect(unpin).rejects.toThrow("not_found");
      h.flush();
      expect(pinned(h)).toEqual(["spc_2"]);
      expect(h.savedPinnedSpaces.at(-1)).toEqual(["spc_2"]);
    });

    it("keeps the pin when it is taken and the unpin is refused", async () => {
      const { h, waiting } = pinning();
      await started();
      await h.store.loadPinnedSpaces();
      const pin = h.store.setSpacePinned("spc_1", true);
      const unpin = h.store.setSpacePinned("spc_1", false);
      waiting[0]?.take();
      await pin;
      waiting[1]?.refuse();
      await expect(unpin).rejects.toThrow("not_found");
      h.flush();
      expect(pinned(h)).toEqual(["spc_1", "spc_2"]);
    });
  });
});

describe("a pin put back as it stood (ADR 0240)", () => {
  it("leaves a room never pinned off, and puts one back behind the pin it stood behind", () => {
    expect(pinnedAsBefore(["a", "b"], "c", ["a", "b"])).toEqual(["a", "b"]);
    expect(pinnedAsBefore(["a", "b"], "a", ["b"])).toEqual(["b"]);
    expect(pinnedAsBefore(["a", "c"], "b", ["a", "b", "c"])).toEqual(["a", "b", "c"]);
    expect(pinnedAsBefore(["x", "c"], "a", ["a", "c"])).toEqual(["a", "x", "c"]);
    // The pins it stood behind are gone too: it goes first.
    expect(pinnedAsBefore(["c"], "b", ["a", "b", "c"])).toEqual(["b", "c"]);
  });
});

describe("an agent deleted, from the store (ADR 0095)", () => {
  const agent = "agt_1";
  const listed = (removedAt: string | null) => ({
    participants: [
      {
        id: agent,
        kind: "agent",
        display_name: "Shopping",
        owner_id: null,
        harness_id: "hrn_1",
        room: removedAt === null ? "spc_1" : null,
        removed_at: removedAt,
      },
    ],
  });

  it("is gone at the server's yes, and a read of the directory already on its way does not bring it back", async () => {
    const asked: string[] = [];
    // Each read of the directory waits for the test to answer it.
    const reads: ((answer: unknown) => void)[] = [];
    const h = harness({
      cached: [OPENED],
      get: (path) => {
        if (path !== "/v1/participants") return Promise.resolve({});
        asked.push(path);
        return new Promise((resolve) => reads.push(resolve));
      },
      remove: async (path) => {
        asked.push(`DELETE ${path}`);
        return { agent_id: agent, room: "archived" };
      },
    });
    /** The next read of the directory answered, once it has been asked. */
    const answer = async (body: unknown) => {
      while (reads.length === 0) await started();
      reads.shift()?.(body);
      await started();
    };
    // The store's own reads as it starts.
    await answer(listed(null));
    while (reads.length > 0) await answer(listed(null));
    const now = () => {
      h.flush();
      return h.store.getSnapshot().directory[agent];
    };
    expect(now()).toMatchObject({ displayName: "Shopping", room: "spc_1" });
    expect(now()?.removedAt).toBeUndefined();

    // A read from before the delete, still on its way when the server says yes.
    void h.store.refreshDirectory();
    // Done with no read answered: through the relay each one is another round trip.
    await h.store.deleteAgent(agent);
    expect(asked.at(-1)).toBe(`DELETE /v1/agents/${agent}`);
    expect(now()).toMatchObject({ displayName: "Shopping", room: null });
    expect(now()?.removedAt).toEqual(expect.any(String));

    // The old read lands saying it is still there: it stays gone, and the directory is read again.
    await answer(listed(null));
    expect(now()?.removedAt).toEqual(expect.any(String));
    expect(reads).toHaveLength(1);
    await answer(listed("2026-11-05T21:00:00.000Z"));
    expect(now()?.removedAt).toBe("2026-11-05T21:00:00.000Z");
    expect(reads).toHaveLength(0);
  });
});

describe("an agent's face, from the store (ADR 0089)", () => {
  const agent = "agt_1";
  const listed = (face: unknown) => ({
    participants: [
      {
        id: agent,
        kind: "agent",
        display_name: "Shopping",
        owner_id: null,
        harness_id: "hrn_1",
        room: null,
        face,
      },
    ],
  });
  const faceOf = (h: ReturnType<typeof harness>) => {
    h.flush();
    return h.store.getSnapshot().directory[agent]?.face;
  };

  it("is read with the directory, changes at once, and is put on the server or taken off", async () => {
    const asked: [string, string, unknown][] = [];
    const h = harness({
      cached: [OPENED],
      get: async () => listed({ icon: "cart", ground: 4 }),
      put: async (path, body) => {
        asked.push(["PUT", path, body]);
        return body;
      },
      remove: async (path) => {
        asked.push(["DELETE", path, undefined]);
        return undefined;
      },
    });
    await started();
    await h.store.refreshDirectory();
    expect(faceOf(h)).toEqual({ icon: "cart", ground: 4 });

    const set = h.store.setAgentFace(agent, { icon: "bag", ground: 3 });
    // Before the server has said anything: the row is wearing it.
    expect(faceOf(h)).toEqual({ icon: "bag", ground: 3 });
    await set;
    expect(asked.at(-1)).toEqual(["PUT", `/v1/agents/${agent}/face`, { icon: "bag", ground: 3 }]);

    await h.store.setAgentFace(agent, undefined);
    expect(faceOf(h)).toBeUndefined();
    expect(asked.at(-1)).toEqual(["DELETE", `/v1/agents/${agent}/face`, undefined]);
  });

  it("renames an agent at the server and reads the directory again (ADR 0091)", async () => {
    const asked: [string, string, unknown][] = [];
    let name = "Shopping";
    const h = harness({
      cached: [OPENED],
      get: async () => ({
        participants: [
          {
            id: agent,
            kind: "agent",
            display_name: name,
            owner_id: null,
            harness_id: "hrn_1",
            room: null,
            face: null,
          },
        ],
      }),
      put: async (path, body) => {
        asked.push(["PUT", path, body]);
        name = (body as { name: string }).name;
        return body;
      },
    });
    await started();
    await h.store.renameAgent(agent, "Groceries");
    expect(asked).toEqual([["PUT", `/v1/agents/${agent}/name`, { name: "Groceries" }]]);
    h.flush();
    expect(h.snapshots.at(-1)?.directory[agent]?.displayName).toBe("Groceries");
  });

  it("drops a face it cannot read, and draws the initials", async () => {
    const h = harness({ cached: [OPENED], get: async () => listed({ icon: "cart", ground: 99 }) });
    await started();
    await h.store.refreshDirectory();
    expect(faceOf(h)).toBeUndefined();
    expect(h.store.getSnapshot().directory[agent]?.displayName).toBe("Shopping");
  });

  it("goes back to the face it wore when the server will not take the new one", async () => {
    const h = harness({
      cached: [OPENED],
      get: async () => listed({ icon: "cart", ground: 4 }),
      put: async () => {
        throw new Error("forbidden");
      },
    });
    await started();
    await h.store.refreshDirectory();
    const refused = h.store.setAgentFace(agent, { icon: "bag", ground: 3 });
    expect(faceOf(h)).toEqual({ icon: "bag", ground: 3 });
    await expect(refused).rejects.toThrow("forbidden");
    expect(faceOf(h)).toEqual({ icon: "cart", ground: 4 });
  });

  it("keeps a choice on its way over a directory read from before it", async () => {
    let answer: (() => void) | undefined;
    const h = harness({
      cached: [OPENED],
      get: async () => listed(null),
      put: (_path, body) =>
        new Promise((resolve) => {
          answer = () => resolve(body);
        }),
    });
    await started();
    await h.store.refreshDirectory();
    const set = h.store.setAgentFace(agent, { icon: "crown", ground: 9 });
    // The server has not answered, and something else has the directory read again.
    await h.store.refreshDirectory();
    expect(faceOf(h)).toEqual({ icon: "crown", ground: 9 });
    await started();
    answer?.();
    await set;
    expect(faceOf(h)).toEqual({ icon: "crown", ground: 9 });
  });

  it("sends two quick choices in the order they were made", async () => {
    const order: unknown[] = [];
    const waiting: (() => void)[] = [];
    const h = harness({
      cached: [OPENED],
      get: async () => listed(null),
      put: (_path, body) =>
        new Promise((resolve) => {
          order.push(body);
          waiting.push(() => resolve(body));
        }),
    });
    await started();
    await h.store.refreshDirectory();
    const first = h.store.setAgentFace(agent, { icon: "", ground: 9 });
    const second = h.store.setAgentFace(agent, { icon: "crown", ground: 9 });
    await started();
    // The second has not left: the first is still unanswered.
    expect(order).toEqual([{ icon: "", ground: 9 }]);
    waiting.shift()?.();
    await first;
    await started();
    waiting.shift()?.();
    await second;
    expect(order).toEqual([
      { icon: "", ground: 9 },
      { icon: "crown", ground: 9 },
    ]);
    expect(faceOf(h)).toEqual({ icon: "crown", ground: 9 });
  });
});

describe("two faces chosen for one agent, both on their way", () => {
  const agent = "agt_1";
  const CART = { icon: "cart", ground: 4 };
  function choosing() {
    const { waiting, pending } = answeredLater();
    const h = harness({
      cached: [OPENED],
      get: async () => ({
        participants: [
          {
            id: agent,
            kind: "agent",
            display_name: "Shopping",
            owner_id: null,
            harness_id: "hrn_1",
            room: null,
            face: CART,
          },
        ],
      }),
      put: pending,
    });
    const face = () => {
      h.flush();
      return h.store.getSnapshot().directory[agent]?.face;
    };
    return { h, waiting, face };
  }

  it("puts back the face the server holds when both are refused, not the first choice", async () => {
    const { h, waiting, face } = choosing();
    await started();
    await h.store.refreshDirectory();
    const first = h.store.setAgentFace(agent, { icon: "bag", ground: 3 });
    const second = h.store.setAgentFace(agent, { icon: "crown", ground: 9 });
    expect(face()).toEqual({ icon: "crown", ground: 9 });
    // One face is sent at a time: the second leaves once the first is answered.
    await started();
    waiting[0]?.refuse();
    await expect(first).rejects.toThrow("not_found");
    await started();
    waiting[1]?.refuse();
    await expect(second).rejects.toThrow("not_found");
    expect(face()).toEqual(CART);
  });

  it("keeps the first when it is taken and the second is refused", async () => {
    const { h, waiting, face } = choosing();
    await started();
    await h.store.refreshDirectory();
    const first = h.store.setAgentFace(agent, { icon: "bag", ground: 3 });
    const second = h.store.setAgentFace(agent, { icon: "crown", ground: 9 });
    await started();
    waiting[0]?.take();
    await first;
    await started();
    waiting[1]?.refuse();
    await expect(second).rejects.toThrow("not_found");
    expect(face()).toEqual({ icon: "bag", ground: 3 });
  });
});

describe("your own face, from the store (ADR 0139)", () => {
  const me = "usr_1";
  const listed = (face: unknown) => ({
    participants: [{ id: me, kind: "person", display_name: "Arjun", owner_id: null, face }],
  });
  const faceOf = (h: ReturnType<typeof harness>) => {
    h.flush();
    return h.store.getSnapshot().directory[me]?.face;
  };

  it("is read with the directory, letters and all, and is put on the server or taken off", async () => {
    const asked: [string, string, unknown][] = [];
    const h = harness({
      cached: [OPENED],
      get: async () => listed({ icon: "", ground: 4, letters: "AG" }),
      put: async (path, body) => {
        asked.push(["PUT", path, body]);
        return body;
      },
      remove: async (path) => {
        asked.push(["DELETE", path, undefined]);
        return undefined;
      },
    });
    await started();
    await h.store.refreshDirectory();
    expect(faceOf(h)).toEqual({ icon: "", ground: 4, letters: "AG" });

    const set = h.store.setMyFace({ icon: "", ground: 4, letters: "🦊" });
    expect(faceOf(h)).toEqual({ icon: "", ground: 4, letters: "🦊" });
    await set;
    expect(asked.at(-1)).toEqual([
      "PUT",
      `/v1/people/${me}/face`,
      { icon: "", ground: 4, letters: "🦊" },
    ]);

    await h.store.setMyFace(undefined);
    expect(faceOf(h)).toBeUndefined();
    expect(asked.at(-1)).toEqual(["DELETE", `/v1/people/${me}/face`, undefined]);
  });

  it("goes back to the face you wore when the server will not take the new one", async () => {
    const h = harness({
      cached: [OPENED],
      get: async () => listed({ icon: "rocket", ground: 2 }),
      put: async () => {
        throw new Error("forbidden");
      },
    });
    await started();
    await h.store.refreshDirectory();
    const refused = h.store.setMyFace({ icon: "", ground: 2, letters: "A" });
    expect(faceOf(h)).toEqual({ icon: "", ground: 2, letters: "A" });
    await expect(refused).rejects.toThrow("forbidden");
    expect(faceOf(h)).toEqual({ icon: "rocket", ground: 2 });
  });
});

describe("notification settings and claims, from the store (M5.6)", () => {
  it("reads the settings once, keeps them, saves them whole, and claims keys", async () => {
    const asked: [string, string, unknown][] = [];
    const h = harness({
      cached: [OPENED],
      get: async (path) => {
        asked.push(["GET", path, undefined]);
        if (path.startsWith("/v1/participants")) return { participants: [] };
        return { settings: { decide: "off", review: "hourly", fyi: "daily", harnesses: {} } };
      },
      post: async (path, body) => {
        asked.push(["POST", path, body]);
        return { granted: ["decision:apr_1"] };
      },
      put: async (path, body) => {
        asked.push(["PUT", path, body]);
        return { settings: body };
      },
    });
    await started();
    // The defaults until read.
    expect(h.store.notificationSettings().decide).toBe("now");
    const loaded = await h.store.loadNotificationSettings();
    expect(loaded.decide).toBe("off");
    expect(h.store.notificationSettings().decide).toBe("off");

    await h.store.saveNotificationSettings({ ...loaded, fyi: "off" });
    expect(h.store.notificationSettings().fyi).toBe("off");
    expect(asked.at(-1)).toEqual([
      "PUT",
      "/v1/me/notifications",
      { decide: "off", review: "hourly", fyi: "off", harnesses: {} },
    ]);

    expect(await h.store.claimNotifications(["decision:apr_1", "decision:apr_2"])).toEqual([
      "decision:apr_1",
    ]);
    expect(asked.at(-1)).toEqual([
      "POST",
      "/v1/me/notifications/claims",
      { keys: ["decision:apr_1", "decision:apr_2"] },
    ]);
    expect(await h.store.claimNotifications([])).toEqual([]);
  });
});

describe("where a relaunch resumes: the cursor, not the cache's highest event (ADR 0049)", () => {
  // The phone's cache lost 4477 to 4481 to a failed write and kept 4476 and 4482; a resume from
  // 4482 never read the hole, and a finished run showed as going after every relaunch (11
  // September 2026). The hole cannot be seen in the cache: a device is not sent the events of
  // spaces it is not in, so its cache is full of gaps that are nobody's fault. So where to
  // resume is recorded, behind each batch that landed, and never read off the events.

  it("resumes from the cursor, so a batch the cache lost below its highest event is read again", async () => {
    // 3 landed and was claimed; the batch after it failed; 7 landed, and claimed nothing, since
    // the batch before it had not.
    const h = harness({ cached: [OPENED, event(3), event(7)], cursor: 3 });
    await started();
    expect(h.wire().since).toBe(3);

    for (const seq of [4, 5, 6, 7]) h.wire().onEvent(event(seq));
    h.flush();
    await started();
    expect(h.store.getSnapshot().model.spaces[0]?.lines.map((line) => line.seq)).toEqual([
      3, 4, 5, 6, 7,
    ]);
    expect(h.saved).toEqual([[event(4), event(5), event(6)]]);
    expect(h.savedCursor).toEqual([7]);
  });

  it("reads a cache that never recorded a cursor from the start, once", async () => {
    const h = harness({ cached: [OPENED, event(3), event(7)] });
    await started();
    expect(h.wire().since).toBe(0);

    // The replay brings what the cache already holds: nothing is folded or written again, but
    // the cursor is recorded, so the next launch resumes instead of reading from the start too.
    for (const held of [OPENED, event(3), event(7)]) h.wire().onEvent(held);
    h.flush();
    await started();
    expect(h.store.getSnapshot().model.spaces[0]?.lines.map((line) => line.seq)).toEqual([3, 7]);
    expect(h.saved).toEqual([]);
    expect(h.savedCursor).toEqual([7]);
  });

  it("claims the cursor only behind a batch that landed, and writes a failed batch again first", async () => {
    let failing = true;
    const h = harness({
      cached: [OPENED],
      cursor: 1,
      saveEvents: async () => {
        if (failing) throw new Error("database is locked");
      },
    });
    await started();

    h.wire().onEvent(event(2));
    h.wire().onEvent(event(3));
    h.flush();
    await started();
    // The batch did not land: the cursor stays where it was, and the batch waits for the next
    // flush rather than knocking again at once.
    expect(h.saved).toEqual([[event(2), event(3)]]);
    expect(h.savedCursor).toEqual([]);

    failing = false;
    h.wire().onEvent(event(4));
    h.flush();
    await started();
    // The lost batch goes ahead of what came after it, and the cursor follows the whole.
    expect(h.saved.at(-1)).toEqual([event(2), event(3), event(4)]);
    expect(h.savedCursor).toEqual([4]);
    expect(h.store.getSnapshot().model.spaces[0]?.lines.map((line) => line.seq)).toEqual([2, 3, 4]);
  });

  it("writes one batch at a time: what arrives during a write follows it, with its own claim", async () => {
    let release: (() => void) | undefined;
    const h = harness({
      cached: [OPENED],
      cursor: 1,
      saveEvents: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    });
    await started();

    h.wire().onEvent(event(2));
    h.flush();
    expect(h.saved).toEqual([[event(2)]]);

    // A flush while the first batch is still going opens no second write: the cursor could
    // otherwise pass a batch that had not landed.
    h.wire().onEvent(event(3));
    h.flush();
    await started();
    expect(h.saved).toHaveLength(1);
    expect(h.savedCursor).toEqual([]);

    const first = release;
    first?.();
    await started();
    // The first batch lands and claims 2; the second follows on its own and claims 3 once in.
    expect(h.savedCursor).toEqual([2]);
    expect(h.saved).toEqual([[event(2)], [event(3)]]);
    release?.();
    await started();
    expect(h.savedCursor).toEqual([2, 3]);
  });

  it("caches a room's history read over HTTP without moving the cursor past what the socket sent", async () => {
    const opening = event(1, {
      type: "space.created",
      space_id: "spc_9",
      actor: { kind: "person", id: "usr_2" },
      kind: "group",
      title: "Northwind",
    });
    // The room's history runs past the socket's position: the join arrives at 3, and the read
    // brings the room's lines up to 9, said after it.
    const h = harness({
      get: async (path) => {
        if (path.startsWith("/v1/participants")) return { participants: [] };
        return {
          events: [opening, event(2, { space_id: "spc_9" }), event(9, { space_id: "spc_9" })],
          next_cursor: null,
        };
      },
    });
    await started();
    h.wire().onEvent(
      event(3, {
        type: "membership.added",
        space_id: "spc_9",
        actor: { kind: "person", id: "usr_2" },
        participant_id: "usr_1",
        participant_kind: "person",
        role: "member",
      }),
    );
    await started();
    h.flush();
    await started();
    // The history is in the cache; the cursor stands at 3. Nine is the room's, and the socket
    // has yet to send 4 to 8 — which a cursor at 9 would have skipped for ever.
    expect(
      h.saved
        .flat()
        .map((each) => each.seq)
        .sort((a, b) => a - b),
    ).toEqual([1, 2, 3, 9]);
    expect(h.savedCursor).toEqual([3]);
  });
});

describe("a room erased from the server (ADR 0067)", () => {
  const TRIP = event(2, {
    type: "space.created",
    space_id: "spc_2",
    actor: { kind: "person", id: "usr_1" },
    kind: "group",
    title: "India trip",
  });
  const THREAD = event(3, {
    type: "space.created",
    space_id: "spc_3",
    actor: { kind: "person", id: "usr_1" },
    kind: "thread",
    parent_space_id: "spc_1",
    root_message_id: "msg_01K4ZQPX0000000000000000AA",
  });
  const SAID = event(4, { text: "Your move. I'd play Nf3 here." });
  const ERASED = event(9, {
    type: "space.erased",
    space_id: undefined,
    actor: { kind: "person", id: "usr_2" },
    erased: ["spc_1", "spc_3"],
  });
  const ids = (h: ReturnType<typeof harness>) =>
    h.snapshots.at(-1)?.model.spaces.map((space) => space.id) ?? [];

  it("goes from here when another device erases it, with everything this device kept of it", async () => {
    const told: string[][] = [];
    const h = harness({
      cached: [OPENED, TRIP, THREAD, SAID],
      readState: { spc_1: 4, spc_2: 2 },
      onErased: (spaces) => told.push(spaces.map((space) => space.id).sort()),
    });
    await started();
    h.store.send({ spaceId: "spc_1", text: "Into the void" });
    h.flush();

    h.wire().onEvent(ERASED);
    h.flush();

    expect(ids(h)).toEqual(["spc_2"]);
    expect(h.forgotten.at(-1)?.sort()).toEqual(["spc_1", "spc_3"]);
    // Where it was read to goes, and the message still waiting to go into it does not go.
    expect(h.savedReadState.at(-1)).toEqual({ spc_2: 2 });
    expect(h.withdrawn).toEqual(["msg-k1"]);
    expect(h.savedOutbox.at(-1)).toEqual([]);
    // The device is told, with the rooms as it had them, so it can let go of its own things.
    expect(told).toEqual([["spc_1", "spc_3"]]);
    // The tombstone is kept, so a relaunch forgets the rooms again; none of theirs is.
    const cached = h.saved.flat();
    expect(cached.map((each) => each.type)).toContain("space.erased");
    expect(cached.filter((each) => each.space_id === "spc_1")).toEqual([]);
  });

  it("stays gone on a relaunch whose cache still holds some of it", async () => {
    // A write that was already under way when the room went: its events, then the tombstone.
    const h = harness({ cached: [OPENED, TRIP, THREAD, SAID, ERASED] });
    await started();
    h.flush();
    expect(ids(h)).toEqual(["spc_2"]);
    expect(h.forgotten.at(-1)?.sort()).toEqual(["spc_1", "spc_3"]);
  });

  it("goes at once for the person who erased it, and says nothing is wrong", async () => {
    const asked: string[] = [];
    const told: string[][] = [];
    const h = harness({
      cached: [OPENED, TRIP, THREAD, SAID],
      remove: async (path) => {
        asked.push(path);
        return { event_id: "evt_9", erased: ["spc_1", "spc_3"], files: 0 };
      },
      onErased: (spaces) => told.push(spaces.map((space) => space.id).sort()),
    });
    await started();

    await h.store.eraseSpace("spc_1");
    h.flush();

    expect(asked).toEqual(["/v1/spaces/spc_1"]);
    expect(ids(h)).toEqual(["spc_2"]);
    expect(told).toEqual([["spc_1", "spc_3"]]);

    // The tombstone arriving afterwards changes nothing and tells nobody twice.
    h.wire().onEvent(ERASED);
    h.flush();
    expect(ids(h)).toEqual(["spc_2"]);
    expect(told).toHaveLength(1);
  });

  it("stays where it is when the server will not erase it, and says why", async () => {
    const h = harness({
      cached: [OPENED, TRIP],
      remove: async () => {
        throw new Error(
          "A space is erased by its owner, or by an owner or admin of the workspace.",
        );
      },
    });
    await started();

    await expect(h.store.eraseSpace("spc_1")).rejects.toThrow(/owner/);
    h.flush();

    expect(ids(h).sort()).toEqual(["spc_1", "spc_2"]);
    expect(h.forgotten).toEqual([]);
  });
});

describe("join requests (ADR 0122)", () => {
  const wire = (over: Record<string, unknown> = {}) => ({
    request_id: "jrq_01K4ZQPX0000000000000000J1",
    kind: "harness",
    state: "waiting",
    started_by: "requester",
    code: "KQ7-M4P",
    name: "Tide",
    wants: ["autonomy", "restarts"],
    capabilities: [],
    url: "http://127.0.0.1:4431",
    created_at: "2026-10-05T21:00:00.000Z",
    expires_at: "2026-10-05T21:10:00.000Z",
    ...over,
  });

  /** This person's joining, as the workspace event that says what they may do (ADR 0034). */
  const joined = (seq: number, role: string) =>
    event(seq, {
      type: "person.joined",
      space_id: undefined,
      actor: { kind: "person", id: "usr_1" },
      participant_id: "usr_1",
      display_name: "Arjun",
      role,
    });
  const HELLO = { type: "hello", spaces: [] } as unknown as ClientEvent;
  /** A server that answers the join read, and remembers each time it was asked. */
  const reads = () => {
    const asked: string[] = [];
    const get = async (path: string) => {
      if (!path.startsWith("/v1/join")) return { participants: [] };
      asked.push(path);
      return { requests: [wire()] };
    };
    return { asked, get };
  };

  it("holds what waits from the hello's read, and each change the frame brings", async () => {
    const h = harness({
      cached: [joined(1, "owner")],
      get: async (path) =>
        path === "/v1/join?state=waiting" ? { requests: [wire()] } : { participants: [] },
    });
    await started();
    h.wire().onEvent({ type: "hello", spaces: [] } as unknown as ClientEvent);
    await started();
    h.flush();
    const id = "jrq_01K4ZQPX0000000000000000J1";
    expect(h.snapshots.at(-1)?.joins?.get(id)).toMatchObject({ code: "KQ7-M4P", state: "waiting" });

    h.wire().onJoin?.(wire({ state: "denied", decided_by: "usr_1" }) as never);
    h.flush();
    expect(h.snapshots.at(-1)?.joins?.get(id)).toMatchObject({
      state: "denied",
      decidedBy: "usr_1",
    });
  });

  it("keeps a request its frame brought while the hello's read was out, the answer older", async () => {
    let answer: (value: unknown) => void = () => undefined;
    const h = harness({
      cached: [joined(1, "owner")],
      get: (path) =>
        path.startsWith("/v1/join")
          ? new Promise((resolve) => {
              answer = resolve;
            })
          : Promise.resolve({ participants: [] }),
    });
    await started();
    h.wire().onEvent(HELLO);
    await started();
    // A harness asks a moment after the server answered the read, which has not landed yet.
    h.wire().onJoin?.(wire() as never);
    answer({ requests: [] });
    await started();
    h.flush();
    expect(h.snapshots.at(-1)?.joins?.get("jrq_01K4ZQPX0000000000000000J1")?.state).toBe("waiting");
  });

  it("never moves a request back: Allow's answer after the frame that says it was collected", async () => {
    const h = harness({ post: async () => ({ request: wire({ state: "allowed" }) }) });
    await started();
    h.wire().onJoin?.(
      wire({ state: "redeemed", harness_id: "hrn_01K4ZQPX0000000000000000H1" }) as never,
    );
    const answer = await h.store.allowJoin("jrq_01K4ZQPX0000000000000000J1", ["autonomy"]);
    h.flush();
    expect(answer.state).toBe("redeemed");
    expect(h.snapshots.at(-1)?.joins?.get("jrq_01K4ZQPX0000000000000000J1")?.state).toBe(
      "redeemed",
    );
  });

  it("asks for a member too, once a hello, since a link's request waits for whoever sent it (PP-1, ADR 0232)", async () => {
    const server = reads();
    const h = harness({ cached: [joined(1, "member")], get: server.get });
    await started();
    h.wire().onEvent(HELLO);
    await started();
    h.flush();
    // Once per hello, as PP-1 has it: the server answers a member with the links they sent.
    expect(server.asked).toEqual(["/v1/join?state=waiting"]);
    h.wire().onEvent(HELLO);
    await started();
    expect(server.asked).toHaveLength(2);
  });

  it("reads once the owner's own joining folds after the hello, as on a fresh device", async () => {
    const server = reads();
    const h = harness({ get: server.get });
    await started();
    h.wire().onEvent(HELLO);
    await started();
    expect(server.asked).toEqual([]);

    h.wire().onEvent(joined(1, "owner"));
    h.wire().onEvent(event(2));
    await started();
    h.flush();
    expect(server.asked).toEqual(["/v1/join?state=waiting"]);
    expect(h.snapshots.at(-1)?.joins?.size).toBe(1);
  });

  it("makes a link, allows with what was chosen, and refuses, each answer on the snapshot", async () => {
    const calls: [string, unknown][] = [];
    const h = harness({
      post: async (path, body) => {
        calls.push([path, body]);
        if (path === "/v1/join/links") {
          return {
            request: wire({
              request_id: "jrq_01K4ZQPX0000000000000000J2",
              state: "allowed",
              started_by: "person",
            }),
            link: "http://127.0.0.1:4431/j/chips_j_h7qkm2xwdp4r9tz3h7qkm2xw",
          };
        }
        return { request: wire({ state: "allowed", capabilities: ["autonomy"] }) };
      },
      remove: async () => ({ request: wire({ state: "denied" }) }),
    });
    await started();
    const made = await h.store.makeJoinLink(["autonomy", "new_spaces"]);
    expect(made.link).toContain("/j/");
    expect(calls[0]).toEqual(["/v1/join/links", { capabilities: ["autonomy", "new_spaces"] }]);
    const allowed = await h.store.allowJoin("jrq_01K4ZQPX0000000000000000J1", ["autonomy"]);
    expect(allowed.capabilities).toEqual(["autonomy"]);
    expect(calls[1]).toEqual([
      "/v1/join/jrq_01K4ZQPX0000000000000000J1/allow",
      { capabilities: ["autonomy"] },
    ]);
    expect((await h.store.denyJoin("jrq_01K4ZQPX0000000000000000J1")).state).toBe("denied");
    h.flush();
    expect([...(h.snapshots.at(-1)?.joins?.keys() ?? [])].sort()).toEqual([
      "jrq_01K4ZQPX0000000000000000J1",
      "jrq_01K4ZQPX0000000000000000J2",
    ]);
  });
});

describe("the cache the store opens (SEC-8)", () => {
  it("is the one for this workspace on the server the device was paired with", () => {
    const opened: string[] = [];
    harness({
      device: { ...DEVICE, serverUrl: "http://192.168.1.20:4431" },
      cacheOpened: (key) => opened.push(key),
    });
    expect(opened).toEqual(["ws_1@192.168.1.20:4431"]);
  });
});
