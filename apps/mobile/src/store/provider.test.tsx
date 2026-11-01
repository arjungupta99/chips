/**
 * The provider's store, and when it is closed.
 *
 * A store opens a socket as it is made, and through the relay a tunnel. Core keeps one link per
 * device id and each new link closes the last, so two open stores for one device close each
 * other's tunnels about once a second — the web app's CI failure of 13 September 2026, from the
 * same pattern this provider had: a store made in `useMemo` and never closed. So what is proved
 * here is the lifecycle: a store replaced by `began`, or dropped by `ended`, is closed; one device
 * never has two open; and no screen is handed a closed store, or told the phone is unpaired while
 * its store is still being made — the tabs redirect to Pair on that. And a store is handed over
 * once it has read its cache, so no tab draws an empty model as if the workspace were empty.
 *
 * A phone holds several workspaces (ADR 0197), and one store each, made once while the app is open
 * whether it is in front or behind (ADR 0197's addendum, 19 October 2026): a switch hands the front
 * to the store kept, and the one it replaces stays open behind it, so one device still never has
 * two open, and none is made twice.
 */

import type { Cache, Device } from "@chipschat/core";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";
import { CACHE_WAIT_MS, ChipsProvider, HOLD_MS, justArrived, useChips } from "./provider";

interface MockMade {
  readonly deviceId: string;
  /** The cache it was handed: the phone's SQLite, in front or behind. */
  readonly openCache: ((key: string) => Cache) | undefined;
  /** The device storage it was handed: the phone's, or for the demo the demo's, which holds nothing. */
  readonly deviceStorage: unknown;
  closed: boolean;
  /** Tells the store's listeners it has read its cache. */
  read: () => void;
}

// Named `mock…`: Jest lets a hoisted factory reach only variables so named.
const mockStores: MockMade[] = [];
/** What the device storage holds, the one in front first, as core's `readDevices` answers. */
let mockDevices: Device[] = [];
/** How many reads from here on meet a Keychain shut to the app, a locked phone's (ADR 0228). */
let mockShutReads = 0;
/** Whether a store made from here on has read its cache by the time anyone listens. */
let mockReadAtOnce = true;
type MockListener = (heard: object) => void;
/** Every device the storage was told to put in front, by id. */
const mockSwitched: string[] = [];
/** This app's preferences, as `prefs.ts` keeps them. */
const mockPrefs = new Map<string, string>();
/** Where each demo was started, in the order they were (ADR 0213). */
const mockDemoStarts: { film?: string; from?: number }[] = [];
const mockDemo = {
  deviceId: "dev_01KDEM00000000000000000001",
  participantId: "per_you",
  workspaceName: "Chips demo",
} as unknown as Device;
/** The demo's device storage: it holds nothing, and a store handed it writes nothing anywhere. */
const mockNowhere = { nowhere: true };

jest.mock("@chipschat/core", () => ({
  readDevices: async () => {
    if (mockShutReads === 0) return { devices: [...mockDevices], unreadable: 0 };
    mockShutReads -= 1;
    return { devices: [], unreadable: mockDevices.length };
  },
  switchDevice: async (deviceId: string) => {
    mockSwitched.push(deviceId);
    const chosen = mockDevices.find((device) => device.deviceId === deviceId);
    if (chosen === undefined) return undefined;
    mockDevices = [chosen, ...mockDevices.filter((device) => device !== chosen)];
    return chosen;
  },
  setDeviceMuted: async () => undefined,
  attention: () => [],
  isDemo: (device: { deviceId: string } | undefined) => device?.deviceId === mockDemo.deviceId,
  demoDevice: async () => mockDemo,
  FILMS: [{ key: "watch", chapters: [{}, {}, {}] }],
  filmOf: () => ({ key: "watch", chapters: [{}, {}, {}] }),
  startDemo: (options: { film?: string; from?: number }) => {
    mockDemoStarts.push(options);
    return {
      storeOptions: { deviceStorage: mockNowhere },
      makePlayer: () => ({ from: options.from, close: () => undefined }),
    };
  },
  createStore: ({
    device,
    openCache,
    deviceStorage,
  }: {
    device: Device;
    openCache?: (key: string) => Cache;
    deviceStorage?: unknown;
  }) => {
    const listeners = new Set<MockListener>();
    let reading = !mockReadAtOnce;
    const held = { model: { needsYou: [] }, readState: {} };
    const made: MockMade = {
      deviceId: device.deviceId,
      openCache,
      deviceStorage,
      closed: false,
      read: () => {
        reading = false;
        for (const listener of listeners) listener(held);
      },
    };
    mockStores.push(made);
    return {
      made,
      // As core's does: a new listener hears at once what the store holds.
      subscribe: (listener: MockListener) => {
        listeners.add(listener);
        listener(reading ? { ...held, readingCache: true } : held);
        return () => listeners.delete(listener);
      },
      close: () => {
        made.closed = true;
      },
    };
  },
}));
/** What the phone's cache holds for every workspace: a room read up to 40, and its history. */
jest.mock("../cache/sqlite", () => ({
  openSqliteCache: () => ({
    loadReadState: async () => ({ spc_read: 40 }),
    loadEvents: async () => [{ seq: 1 }],
  }),
}));
jest.mock("../device/storage", () => ({ deviceStorage: {} }));
jest.mock("../prefs", () => ({
  SETTINGS: { demo: "demo" },
  readSetting: async (name: string) => mockPrefs.get(name),
  writeSetting: async (name: string, value: string) => {
    mockPrefs.set(name, value);
  },
}));
jest.mock("../spaces/files", () => ({
  createFileService: (device: Device) => ({ deviceId: device.deviceId }),
}));

const HOME = { deviceId: "dev_home", participantId: "per_arjun" } as unknown as Device;
const WORK = { deviceId: "dev_work", participantId: "per_arjun" } as unknown as Device;

/** The device ids of the stores still open, sorted. */
function open(): string[] {
  return mockStores
    .filter((store) => !store.closed)
    .map((store) => store.deviceId)
    .sort();
}

/** What a screen was handed, and whether its store was already closed as it was drawn. */
type Seen = ReturnType<typeof useChips> & { readonly closedThen: boolean | undefined };

/** The provider, with every value a screen under it was handed kept in `seen`. */
async function mount(...held: Device[]) {
  mockDevices = held;
  const seen: Seen[] = [];
  const hook = await renderHook(
    () => {
      const chips = useChips();
      const made = (chips.paired?.store as unknown as { made: MockMade } | undefined)?.made;
      seen.push({ ...chips, closedThen: made?.closed });
      return chips;
    },
    { wrapper: ChipsProvider },
  );
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  return { hook, seen };
}

/** What a screen may never be handed: a closed store, one for another device, or "unpaired" mid-make. */
function wrong(value: Seen, device: Device | undefined): string | undefined {
  const { paired } = value;
  if (paired === undefined) {
    return value.ready && device !== undefined ? "ready and unpaired with a device" : undefined;
  }
  const made = (paired.store as unknown as { made: MockMade }).made;
  if (value.closedThen === true) return `a closed store for ${made.deviceId}`;
  if (made.deviceId !== paired.device.deviceId) return `${made.deviceId}'s store for another`;
  return undefined;
}

afterEach(() => {
  mockStores.length = 0;
  mockDevices = [];
  mockShutReads = 0;
  mockReadAtOnce = true;
  mockSwitched.length = 0;
  mockPrefs.clear();
  mockDemoStarts.length = 0;
  jest.useRealTimers();
});

describe("a phone read while its Keychain was shut (ADR 0228)", () => {
  it("is never told it holds nothing: it waits for the front, reads again, and its workspace comes in front", async () => {
    // Started behind, as iOS may start an app before anybody opens it.
    const was = Object.getOwnPropertyDescriptor(AppState, "currentState");
    Object.defineProperty(AppState, "currentState", { value: "background", configurable: true });
    const heard: ((state: string) => void)[] = [];
    const listen = jest.spyOn(AppState, "addEventListener").mockImplementation((_, then) => {
      heard.push(then as (state: string) => void);
      return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
    });
    try {
      mockShutReads = 1;
      mockDevices = [HOME];
      const seen: ReturnType<typeof useChips>[] = [];
      const hook = await renderHook(
        () => {
          const chips = useChips();
          seen.push(chips);
          return chips;
        },
        { wrapper: ChipsProvider },
      );
      await waitFor(() => expect(heard).toHaveLength(1));
      expect(hook.result.current.ready).toBe(false);

      // Opened: the phone is unlocked, and the Keychain answers.
      Object.defineProperty(AppState, "currentState", { value: "active", configurable: true });
      await act(async () => {
        for (const then of heard) then("active");
      });
      await waitFor(() => expect(hook.result.current.paired?.device).toBe(HOME));
      // Ready with nothing paired is what sends the tabs to Welcome.
      expect(seen.some((value) => value.ready && value.paired === undefined)).toBe(false);
    } finally {
      listen.mockRestore();
      if (was !== undefined) Object.defineProperty(AppState, "currentState", was);
    }
  });
});

describe("the paired store's lifecycle", () => {
  it("keeps the workspace it was in behind the one that comes in front (ADR 0197)", async () => {
    const { hook } = await mount(HOME);
    await waitFor(() => expect(hook.result.current.paired?.device).toBe(HOME));
    expect(open()).toEqual(["dev_home"]);

    // Joined or paired: the storage holds it in front, and the provider is told.
    mockDevices = [WORK, HOME];
    await act(() => hook.result.current.began(WORK));

    await waitFor(() => expect(hook.result.current.paired?.device).toBe(WORK));
    await waitFor(() => expect(open()).toEqual(["dev_home", "dev_work"]));
    expect(hook.result.current.devices.map((device) => device.deviceId)).toEqual([
      "dev_work",
      "dev_home",
    ]);
    expect([...hook.result.current.others.stores.keys()]).toEqual(["dev_home"]);
  });

  it("switches between them, one store each", async () => {
    const { hook } = await mount(HOME, WORK);
    await waitFor(() => expect(open()).toEqual(["dev_home", "dev_work"]));

    await act(() => hook.result.current.switchTo("dev_work"));

    await waitFor(() => expect(hook.result.current.paired?.device.deviceId).toBe("dev_work"));
    await waitFor(() =>
      expect([...hook.result.current.others.stores.keys()]).toEqual(["dev_home"]),
    );
    expect(open()).toEqual(["dev_home", "dev_work"]);
    // In front at the next launch too.
    expect(mockDevices[0]?.deviceId).toBe("dev_work");
  });

  it("keeps the one drawn until the next has read its cache, then hands over and keeps it behind (ADR 0197)", async () => {
    const { hook, seen } = await mount(HOME);
    await waitFor(() => expect(hook.result.current.paired?.device.deviceId).toBe("dev_home"));
    const home = mockStores.find((store) => store.deviceId === "dev_home");
    // Joined just now: its store is made, and has its cache to read.
    mockReadAtOnce = false;
    mockDevices = [WORK, HOME];

    await act(() => hook.result.current.began(WORK));

    // Home stays drawn and open, never a frame unpaired; work is on its way, and neither is behind.
    expect(hook.result.current.ready).toBe(true);
    expect(hook.result.current.paired?.device.deviceId).toBe("dev_home");
    expect(hook.result.current.arriving?.deviceId).toBe("dev_work");
    expect(open()).toEqual(["dev_home", "dev_work"]);
    expect([...hook.result.current.others.stores.keys()]).toEqual([]);

    const work = mockStores.at(-1);
    expect(work?.deviceId).toBe("dev_work");
    await act(() => work?.read());

    await waitFor(() => expect(hook.result.current.paired?.device.deviceId).toBe("dev_work"));
    expect(hook.result.current.arriving).toBeUndefined();
    expect(hook.result.current.arrival?.deviceId).toBe("dev_work");
    // Home's store goes behind as it is: not closed, and not made again.
    await waitFor(() =>
      expect([...hook.result.current.others.stores.keys()]).toEqual(["dev_home"]),
    );
    expect(home?.closed).toBe(false);
    expect(mockStores).toHaveLength(2);
    for (const value of seen) expect(wrong(value, value.paired?.device)).toBeUndefined();
  });

  it("keeps the one drawn when the switch is given up before the next was ready", async () => {
    const { hook } = await mount(HOME);
    await waitFor(() => expect(hook.result.current.paired?.device.deviceId).toBe("dev_home"));
    const home = mockStores.find((store) => store.deviceId === "dev_home");
    mockReadAtOnce = false;
    mockDevices = [WORK, HOME];
    await act(() => hook.result.current.began(WORK));
    const work = mockStores.at(-1);

    await act(() => hook.result.current.switchTo("dev_home"));

    // Back to home, which never went: work's store, never drawn, stays behind to read its cache.
    const drawn = hook.result.current.paired?.store as unknown as { made: MockMade } | undefined;
    expect(drawn?.made).toBe(home);
    expect(hook.result.current.arriving).toBeUndefined();
    expect(hook.result.current.arrival).toBeUndefined();
    await waitFor(() =>
      expect([...hook.result.current.others.stores.keys()]).toEqual(["dev_work"]),
    );
    expect(work?.closed).toBe(false);
    expect(home?.closed).toBe(false);
    expect(mockStores).toHaveLength(2);
  });

  it("hands the front to the store kept behind, and makes none again, however often it changes", async () => {
    const { hook, seen } = await mount(HOME, WORK);
    await waitFor(() => expect(open()).toEqual(["dev_home", "dev_work"]));
    const [home, work] = ["dev_home", "dev_work"].map((id) =>
      mockStores.find((store) => store.deviceId === id),
    );

    for (const id of ["dev_work", "dev_home", "dev_work", "dev_home"]) {
      await act(() => hook.result.current.switchTo(id));
      expect(hook.result.current.arriving?.deviceId).toBe(id);
      await waitFor(() => expect(hook.result.current.paired?.device.deviceId).toBe(id));
      expect(hook.result.current.arriving).toBeUndefined();
      expect(hook.result.current.arrival?.deviceId).toBe(id);
      const store = hook.result.current.paired?.store as unknown as { made: MockMade };
      expect(store.made).toBe(id === "dev_home" ? home : work);
      await waitFor(() =>
        expect([...hook.result.current.others.stores.keys()]).toEqual([
          id === "dev_home" ? "dev_work" : "dev_home",
        ]),
      );
    }
    expect(mockStores).toHaveLength(2);
    expect(open()).toEqual(["dev_home", "dev_work"]);
    for (const value of seen) expect(wrong(value, value.paired?.device)).toBeUndefined();
  });

  it("holds the one it replaces a moment, however ready the next is, and no longer", async () => {
    const { hook } = await mount(HOME, WORK);
    await waitFor(() => expect(open()).toEqual(["dev_home", "dev_work"]));
    jest.useFakeTimers();

    await act(() => hook.result.current.switchTo("dev_work"));

    // Under work's name and dimmed (`arriving`), long enough for the dim to land and the line to
    // start, though work's store read its cache long ago.
    await act(() => jest.advanceTimersByTime(HOLD_MS - 1));
    expect(hook.result.current.paired?.device.deviceId).toBe("dev_home");
    expect(hook.result.current.arriving?.deviceId).toBe("dev_work");
    await act(() => jest.advanceTimersByTime(1));
    expect(hook.result.current.paired?.device.deviceId).toBe("dev_work");
    expect(hook.result.current.arriving).toBeUndefined();
  });

  it("lets the one in front go at once when it was forgotten, rather than holding it", async () => {
    // Work is muted: it has no store yet, and has its cache to read once it is brought forward.
    const { hook } = await mount(HOME, { ...WORK, muted: true } as Device);
    await waitFor(() => expect(hook.result.current.paired?.device.deviceId).toBe("dev_home"));
    const home = mockStores.find((store) => store.deviceId === "dev_home");
    expect(open()).toEqual(["dev_home"]);
    mockReadAtOnce = false;
    mockDevices = [WORK];

    await act(() => hook.result.current.ended(WORK));

    expect(home?.closed).toBe(true);
    expect(hook.result.current.paired).toBeUndefined();
    expect(hook.result.current.ready).toBe(false);
    await act(() => mockStores.at(-1)?.read());
    await waitFor(() => expect(hook.result.current.paired?.device.deviceId).toBe("dev_work"));
    // Nothing took over from anything: its rows are simply there.
    expect(hook.result.current.arrival).toBeUndefined();
  });

  it("brings one kept behind forward at once when the one in front is forgotten", async () => {
    const { hook } = await mount(HOME, WORK);
    await waitFor(() => expect(open()).toEqual(["dev_home", "dev_work"]));
    const work = mockStores.find((store) => store.deviceId === "dev_work");
    mockDevices = [WORK];

    await act(() => hook.result.current.ended(WORK));

    expect(open()).toEqual(["dev_work"]);
    const drawn = hook.result.current.paired?.store as unknown as { made: MockMade } | undefined;
    expect(drawn?.made).toBe(work);
    expect(hook.result.current.arrival).toBeUndefined();
    expect(hook.result.current.others.stores.size).toBe(0);
  });

  it("says a list is drawn for a workspace arriving only in the moment it takes the front", () => {
    const arrival = { deviceId: "dev_work", at: 10_000 };
    expect(justArrived(arrival, "dev_work", 10_200)).toBe(true);
    expect(justArrived(arrival, "dev_home", 10_200)).toBe(false);
    expect(justArrived(arrival, "dev_work", 12_000)).toBe(false);
    expect(justArrived(undefined, "dev_work", 10_200)).toBe(false);
  });

  it("has each workspace read its own cache, behind as in front", async () => {
    const { hook } = await mount(HOME, WORK);
    await waitFor(() => expect(open()).toEqual(["dev_home", "dev_work"]));
    const behind = mockStores.find((store) => store.deviceId === "dev_work");
    const cache = behind?.openCache?.("ws_work@host");
    // All of it, so that brought forward it has nothing left to read, and is drawn at once.
    expect(await cache?.loadReadState()).toEqual({ spc_read: 40 });
    expect(await cache?.loadEvents()).toEqual([{ seq: 1 }]);
    expect(hook.result.current.others.stores.has("dev_work")).toBe(true);
  });

  it("makes the stores behind once the one in front is drawn, and none for a muted one", async () => {
    mockReadAtOnce = false;
    mockDevices = [HOME, WORK];
    const hook = await renderHook(() => useChips(), { wrapper: ChipsProvider });
    await waitFor(() => expect(mockStores).toHaveLength(1));
    expect(mockStores[0]?.deviceId).toBe("dev_home");

    await act(() => mockStores[0]?.read());

    await waitFor(() => expect(open()).toEqual(["dev_home", "dev_work"]));
    const work = mockStores.find((store) => store.deviceId === "dev_work");

    // Muted: closed, and nothing counted for it.
    mockDevices = [HOME, { ...WORK, muted: true } as Device];
    await act(() => hook.result.current.mute("dev_work", true));
    await waitFor(() => expect(work?.closed).toBe(true));
    expect(hook.result.current.others.stores.size).toBe(0);

    // Heard from again: a store of its own once more.
    mockDevices = [HOME, WORK];
    await act(() => hook.result.current.mute("dev_work", false));
    await waitFor(() => expect(open()).toEqual(["dev_home", "dev_work"]));
    expect(mockStores).toHaveLength(3);
  });

  it("does what a switch was for once that workspace's store is in front, and only then", async () => {
    const { hook } = await mount(HOME, WORK);
    await waitFor(() => expect(hook.result.current.paired?.device.deviceId).toBe("dev_home"));
    const done: string[] = [];
    const record = (store: unknown) =>
      done.push(store === hook.result.current.paired?.store ? "in front" : "elsewhere");

    await act(() => hook.result.current.switchTo("dev_work", record));
    await waitFor(() => expect(done).toEqual(["in front"]));
    expect(hook.result.current.paired?.device.deviceId).toBe("dev_work");

    // Asked of the one in front already, it is done at once.
    await act(() => hook.result.current.switchTo("dev_work", record));
    expect(done).toEqual(["in front", "in front"]);
  });

  it("brings the next one forward when the one in front goes, and none after the last", async () => {
    const { hook } = await mount(HOME, WORK);
    await waitFor(() => expect(open()).toEqual(["dev_home", "dev_work"]));

    // `forgetHere` has forgotten it, and answered the next.
    mockDevices = [WORK];
    await act(() => hook.result.current.ended(WORK));
    await waitFor(() => expect(hook.result.current.paired?.device).toBe(WORK));
    await waitFor(() => expect(open()).toEqual(["dev_work"]));

    mockDevices = [];
    await act(() => hook.result.current.ended(undefined));
    expect(hook.result.current.paired).toBeUndefined();
    expect(hook.result.current.ready).toBe(true);
    await waitFor(() => expect(open()).toEqual([]));
  });

  it("holds at most one open store per device, and hands a screen none it should not have", async () => {
    // Paired on a fresh phone, then the same device handed back as a new record (a pairing link
    // for the server this phone already holds, which records something new of it), then another
    // device beside it, then both gone. A record read again unchanged keeps its open store.
    const { hook, seen } = await mount();
    const steps: [string, Device | undefined, Device[]][] = [
      ["began home", HOME, [HOME]],
      ["began home again", { ...HOME, workspaceName: "Home again" } as Device, [HOME]],
      ["began work", WORK, [WORK, HOME]],
      ["ended", undefined, []],
    ];
    for (const [step, device, stored] of steps) {
      const from = seen.length;
      mockDevices = stored;
      await act(() =>
        device === undefined ? hook.result.current.ended() : hook.result.current.began(device),
      );
      await waitFor(() => expect(hook.result.current.paired?.device).toBe(device));
      const counts = new Map<string, number>();
      for (const id of open()) counts.set(id, (counts.get(id) ?? 0) + 1);
      expect({ step, open: [...counts].filter(([, n]) => n > 1) }).toEqual({ step, open: [] });
      const handed = seen.slice(from).map((value) => wrong(value, device));
      expect({ step, handed: handed.filter(Boolean) }).toEqual({ step, handed: [] });
    }
    await waitFor(() => expect(open()).toEqual([]));
  });
});

describe("the first frame", () => {
  it("is not ready until the paired store has read its cache", async () => {
    mockReadAtOnce = false;
    mockDevices = [HOME];
    const hook = await renderHook(() => useChips(), { wrapper: ChipsProvider });
    await waitFor(() => expect(mockStores).toHaveLength(1));
    expect(hook.result.current.ready).toBe(false);
    expect(hook.result.current.paired).toBeUndefined();

    await act(() => mockStores[0]?.read());

    expect(hook.result.current.ready).toBe(true);
    expect(hook.result.current.paired?.device).toBe(HOME);
  });

  it("draws without the cache once it has waited long enough", async () => {
    jest.useFakeTimers();
    mockReadAtOnce = false;
    mockDevices = [HOME];
    const hook = await renderHook(() => useChips(), { wrapper: ChipsProvider });
    await waitFor(() => expect(mockStores).toHaveLength(1));
    expect(hook.result.current.ready).toBe(false);

    await act(() => jest.advanceTimersByTime(CACHE_WAIT_MS));

    expect(hook.result.current.ready).toBe(true);
    expect(hook.result.current.paired?.device).toBe(HOME);
  });
});

describe("the demo's made-up workspace (ADR 0213)", () => {
  const ids = (devices: readonly Device[]) => devices.map((device) => device.deviceId);
  const demoStores = () => mockStores.filter((store) => store.deviceId === mockDemo.deviceId);

  it("comes in front with its film from the start, made with its own seams and its player", async () => {
    const { hook } = await mount(HOME);
    await act(() => hook.result.current.demo.watch());

    await waitFor(() => expect(hook.result.current.paired?.device).toBe(mockDemo));
    expect(hook.result.current.demo.film).toBe("watch");
    expect(hook.result.current.paired?.player).toMatchObject({ from: 0 });
    expect(mockDemoStarts).toEqual([{ film: "watch", from: 0 }]);
    // Its store is handed the demo's device storage over the phone's, which holds nothing.
    expect(demoStores()[0]?.deviceStorage).toBe(mockNowhere);
    expect(ids(hook.result.current.devices)).toEqual([mockDemo.deviceId, "dev_home"]);
  });

  it("is never written where the device keeps its workspaces", async () => {
    const { hook } = await mount(HOME);
    await act(() => hook.result.current.demo.watch());
    await waitFor(() => expect(hook.result.current.paired?.device).toBe(mockDemo));
    await act(() => hook.result.current.demo.lookAround());
    await act(() => hook.result.current.switchTo("dev_home"));
    await waitFor(() => expect(hook.result.current.paired?.device.deviceId).toBe("dev_home"));
    await act(() => hook.result.current.switchTo(mockDemo.deviceId));
    await waitFor(() => expect(hook.result.current.paired?.device).toBe(mockDemo));

    expect(mockSwitched).not.toContain(mockDemo.deviceId);
    expect(ids(mockDevices)).toEqual(["dev_home"]);
  });

  it("is kept by Look around across a launch, built again from its script played whole", async () => {
    const first = await mount();
    await act(() => first.hook.result.current.demo.watch());
    await waitFor(() => expect(first.hook.result.current.paired?.device).toBe(mockDemo));
    await act(() => first.hook.result.current.demo.lookAround());
    expect(first.hook.result.current.demo.film).toBeUndefined();
    expect(first.hook.result.current.demo.kept).toBe(true);
    expect(mockPrefs.get("demo")).toBe("look-around");
    await first.hook.unmount();

    // The next launch: nothing in the device storage, and the word in the preferences.
    mockDemoStarts.length = 0;
    const { hook } = await mount();
    await waitFor(() => expect(hook.result.current.paired?.device).toBe(mockDemo));
    expect(hook.result.current.demo).toMatchObject({ film: undefined, kept: true });
    expect(mockDemoStarts).toEqual([{ film: "watch", from: 3 }]);
    expect(ids(hook.result.current.devices)).toEqual([mockDemo.deviceId]);
  });

  it("is made by Look around after the film's video, played whole, in front and kept (ADR 0217)", async () => {
    const { hook } = await mount(HOME);
    await act(() => hook.result.current.demo.lookAround());

    await waitFor(() => expect(hook.result.current.paired?.device).toBe(mockDemo));
    expect(hook.result.current.demo).toMatchObject({ film: undefined, kept: true });
    expect(mockDemoStarts).toEqual([{ film: "watch", from: 3 }]);
    expect(ids(hook.result.current.devices)).toEqual([mockDemo.deviceId, "dev_home"]);
    expect(mockPrefs.get("demo")).toBe("look-around");

    // Removed, the workspace before it comes back.
    let next: Device | undefined;
    await act(() => {
      next = hook.result.current.demo.remove();
    });
    expect(next).toBe(HOME);
  });

  it("is brought in front by Look around as it was kept, behind the person's own", async () => {
    mockPrefs.set("demo", "look-around");
    const { hook } = await mount(HOME);
    await waitFor(() => expect(hook.result.current.paired?.device).toBe(HOME));
    const starts = mockDemoStarts.length;

    await act(() => hook.result.current.demo.lookAround());

    await waitFor(() => expect(hook.result.current.paired?.device).toBe(mockDemo));
    expect(mockDemoStarts).toHaveLength(starts);
    expect(hook.result.current.demo.kept).toBe(true);
  });

  it("puts a workspace of the person's own in front at a launch, with the demo behind it", async () => {
    mockPrefs.set("demo", "look-around");
    const { hook } = await mount(HOME);
    await waitFor(() => expect(hook.result.current.paired?.device).toBe(HOME));
    expect(ids(hook.result.current.devices)).toEqual(["dev_home", mockDemo.deviceId]);
  });

  it("goes when left without Look around, and the workspace before it comes back", async () => {
    const { hook } = await mount(HOME);
    await act(() => hook.result.current.demo.watch());
    await waitFor(() => expect(hook.result.current.paired?.device).toBe(mockDemo));

    let next: Device | undefined;
    await act(() => {
      next = hook.result.current.demo.leave();
    });
    expect(next).toBe(HOME);
    await waitFor(() => expect(hook.result.current.paired?.device).toBe(HOME));
    expect(ids(hook.result.current.devices)).toEqual(["dev_home"]);
    expect(hook.result.current.demo.film).toBeUndefined();
    await waitFor(() => expect(demoStores().every((store) => store.closed)).toBe(true));
    expect(mockPrefs.get("demo")).toBeUndefined();
  });

  it("is removed with its word, and the phone is left with nothing when it was all there was", async () => {
    mockPrefs.set("demo", "look-around");
    const { hook } = await mount();
    await waitFor(() => expect(hook.result.current.paired?.device).toBe(mockDemo));

    let next: Device | undefined = mockDemo;
    await act(() => {
      next = hook.result.current.demo.remove();
    });
    expect(next).toBeUndefined();
    await waitFor(() => expect(hook.result.current.paired).toBeUndefined());
    expect(hook.result.current.devices).toEqual([]);
    expect(hook.result.current.ready).toBe(true);
    await waitFor(() => expect(mockPrefs.get("demo")).toBe(""));
    expect(demoStores().every((store) => store.closed)).toBe(true);
  });
});
