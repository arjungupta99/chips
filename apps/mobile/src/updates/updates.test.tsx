/**
 * The updates provider on a phone or an iPad (ADR 0296, ADR 0297): when it reads the computer, what
 * it keeps when a read fails, what a workspace switch does to it, what lights the dot for the
 * owner and what puts it out, and the small dot on You's About Chips row. The rules it holds to
 * are core's (`computerSays.test.ts`); these are the phone's own wiring of them.
 */

import {
  buildModel,
  type ClientEvent,
  type Directory,
  type HarnessSoftware,
  type SelfUpdateFacts,
  type ServerFacts,
  type Software,
  type Store,
} from "@chipschat/core";
import { act, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AboutRow } from "../about/AboutRow";
import { UpdateDot } from "./UpdateDot";
import { READ_AGAIN_MS, type Updates, UpdatesProvider, UpdatesRoot, useUpdates } from "./updates";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

jest.mock("expo-router", () => ({ useRouter: () => ({ push: () => undefined }) }));
jest.mock("../about/build", () => ({
  appBuild: () => ({ version: "1.2.4", build: "202611111859", commit: "b45d368" }),
}));
jest.mock("../ui/haptics", () => ({ tap: () => undefined }));
const mockSettings = new Map<string, string>();
jest.mock("../prefs", () => ({
  SETTINGS: {
    updateDot: "update.dot",
    updateSeen: "update.seen",
    updateSeenNeeds: "update.seen-needs",
  },
  readSetting: async (name: string) => mockSettings.get(name),
  writeSetting: async (name: string, value: string) => {
    mockSettings.set(name, value);
  },
}));
/** The workspace in front, as the app's own provider would say it. */
let mockPaired: { store: Store; device: { participantId: string; deviceId: string } } | undefined;
jest.mock("../store/provider", () => ({ useChips: () => ({ paired: mockPaired }) }));

/** A bridge on this computer that couldn't take 1.0.32: its owner has something to do. */
function refused(harnessId: string): HarnessSoftware {
  const at = new Date().toISOString();
  return {
    harnessId,
    name: "chips-hermes",
    version: "1.0.31",
    seenAt: at,
    keepCurrent: true,
    bridgeUpdate: {
      package: "@chipschat/hermes",
      running: "1.0.31",
      phase: "refused",
      since: at,
      target: "1.0.32",
      reason: "room",
    },
  };
}

/** Somebody else's iPhone on an older Chips than the App Store's. */
const olderPhone = () => ({
  deviceId: "dev_n",
  personId: "par_n",
  name: "chips-iphone",
  version: "1.1.0",
  seenAt: new Date().toISOString(),
});

const DIRECTORY = {
  har_hermes: { id: "har_hermes", kind: "harness", displayName: "Hermes" },
  har_codex: { id: "har_codex", kind: "harness", displayName: "Codex" },
  par_n: { id: "par_n", kind: "person", displayName: "Natalie Wood" },
} as unknown as Directory;

/**
 * A computer whose answers the test holds: what everything runs, its own updates, and the App
 * Store's version. It is on 1.2.4, as this app is, so nothing waits for a release unless said.
 */
function computer(
  start: {
    runs?: Software;
    self?: SelfUpdateFacts;
    machine?: string;
    version?: string;
    appStore?: string;
    releases?: { version: string; date: string; line: string; dot?: boolean }[];
  } = {},
) {
  const state = {
    runs: start.runs as Software | undefined,
    self: start.self,
    softwareFails: false,
    serverFails: false,
    nightFails: false,
  };
  const asked = { server: 0, software: 0, night: [] as boolean[] };
  /** Answers held back until the test lets them go, when it asks for that. */
  const held: (() => void)[] = [];
  let holding = false;
  const answer = <T,>(make: () => T): Promise<T> =>
    holding
      ? new Promise<T>((resolve, reject) => {
          held.push(() => {
            try {
              resolve(make());
            } catch (error) {
              reject(error as Error);
            }
          });
        })
      : Promise.resolve().then(make);
  const store = {
    serverFacts: (): Promise<ServerFacts> => {
      asked.server += 1;
      return answer(() => {
        if (state.serverFails) throw new Error("offline");
        return {
          machine: start.machine ?? "hetzner-box",
          version: start.version ?? "1.2.4",
          publicUrl: "https://box",
          relay: { url: undefined, status: "off" },
          updates: { releases: start.releases ?? [], appStore: start.appStore ?? "1.2.4" },
          ...(state.self === undefined ? {} : { selfUpdate: state.self }),
        };
      });
    },
    software: () => {
      asked.software += 1;
      return answer(() => {
        if (state.softwareFails) throw Object.assign(new Error("answered 503"), { status: 503 });
        return state.runs;
      });
    },
    setSelfUpdate: async (automatic: boolean) => {
      asked.night.push(automatic);
      if (state.nightFails) throw new Error("offline");
      state.self = { available: true, ...state.self, automatic };
      return state.self;
    },
    keepBridgeCurrent: async () => undefined,
  } as unknown as Store;
  return {
    store,
    state,
    asked,
    /** From now, answers wait until `release`. */
    hold: () => {
      holding = true;
    },
    release: () => {
      holding = false;
      for (const land of held.splice(0)) land();
    },
  };
}

/** What the provider says now, for a test to read and to call. */
let says: Updates;
function Probe() {
  says = useUpdates();
  return null;
}

function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}

/** The dot on the tabs and what the provider says, for the owner of `store`'s workspace. */
function owned(store: Store | undefined, more: { owner?: boolean; directory?: Directory } = {}) {
  return (
    <Phone>
      <UpdatesProvider
        store={store}
        owner={more.owner ?? true}
        me="par_me"
        thisDevice="dev_me"
        directory={more.directory ?? DIRECTORY}
      >
        <UpdateDot />
        <Probe />
      </UpdatesProvider>
    </Phone>
  );
}

/** Lets what was answered land, and what it sets off. */
async function settle() {
  await act(async () => {
    for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  mockSettings.clear();
  mockPaired = undefined;
});

describe("when the provider reads the computer", () => {
  it("reads again when the app comes to the front after ten minutes, and not before", async () => {
    let at = 1_800_000_000_000;
    const clock = jest.spyOn(Date, "now").mockImplementation(() => at);
    // The app's own listener, taken where it is put on, to say the app went away and came back.
    const heard: ((state: AppStateStatus) => void)[] = [];
    let removed = 0;
    const real = AppState.addEventListener;
    AppState.addEventListener = ((_kind: string, listener: (state: AppStateStatus) => void) => {
      heard.push(listener);
      return {
        remove: () => {
          removed += 1;
        },
      };
    }) as typeof AppState.addEventListener;
    try {
      const box = computer();
      const view = await render(owned(box.store));
      await settle();
      expect(box.asked).toMatchObject({ server: 1, software: 1 });
      const front = (state: AppStateStatus) => act(() => heard.at(-1)?.(state));

      at += READ_AGAIN_MS - 1;
      await front("active");
      await settle();
      expect(box.asked.server).toBe(1);

      at += 1;
      // Going away reads nothing; coming back does.
      await front("background");
      await settle();
      expect(box.asked.server).toBe(1);
      await front("active");
      await settle();
      expect(box.asked).toMatchObject({ server: 2, software: 2 });

      await view.unmount();
      expect(removed).toBeGreaterThanOrEqual(1);
    } finally {
      clock.mockRestore();
      AppState.addEventListener = real;
    }
  });

  it("keeps the last list when a read fails", async () => {
    const box = computer({
      runs: { harnesses: [refused("har_hermes")], devices: [olderPhone()] },
      self: { available: true, automatic: true },
    });
    await render(owned(box.store));
    await settle();
    expect(says.needs.map((row) => row.label)).toEqual(["Hermes bridge", "Natalie's iPhone"]);

    box.state.softwareFails = true;
    box.state.serverFails = true;
    await act(async () => void says.opened());
    await settle();
    expect(box.asked).toMatchObject({ server: 2, software: 2 });
    expect(says.software?.harnesses).toHaveLength(1);
    expect(says.needs.map((row) => row.label)).toEqual(["Hermes bridge", "Natalie's iPhone"]);
    expect(says.selfUpdate).toEqual({ available: true, automatic: true });
    expect(says.computer).toMatchObject({ kind: "read", facts: { version: "1.2.4" } });
  });

  it("puts the night switch back when the computer wouldn't take it, though the read after fails", async () => {
    const box = computer({ self: { available: true, automatic: false } });
    await render(owned(box.store));
    await settle();
    box.state.nightFails = true;
    box.state.serverFails = true;
    await act(async () => says.setNightly(true));
    await settle();
    expect(box.asked.night).toEqual([true]);
    expect(says.selfUpdate?.automatic).toBe(false);
  });

  it("starts from nothing for another workspace, and drops a late answer from the one before", async () => {
    const home = computer({
      machine: "Mac mini",
      runs: { harnesses: [refused("har_hermes")], devices: [] },
      self: { available: true, automatic: true },
      appStore: "1.2.5",
    });
    const work = computer({ machine: "work-box", runs: { harnesses: [], devices: [] } });
    const view = await render(owned(home.store));
    await settle();
    expect(says.computer).toMatchObject({ facts: { machine: "Mac mini" } });
    expect(says.needs).toHaveLength(1);
    expect(says.selfUpdate).toBeDefined();
    expect(says.waiting.app).toEqual({ version: "1.2.5", from: "1.2.4" });

    // A slow read of the first workspace is still out when the person switches.
    home.hold();
    await act(async () => void says.opened());
    work.hold();
    await view.rerender(owned(work.store));
    await settle();
    // Nothing of the workspace before is left: not its computer, its switch, its list or its feed.
    expect(says.computer).toEqual({ kind: "reading" });
    expect(says.selfUpdate).toBeUndefined();
    expect(says.software).toBeUndefined();
    expect(says.needs).toEqual([]);
    expect(says.waiting.app).toBeUndefined();

    // The first workspace answers at last: not this one's, and dropped.
    await act(async () => home.release());
    await settle();
    expect(says.computer).toEqual({ kind: "reading" });
    expect(says.needs).toEqual([]);
    expect(says.selfUpdate).toBeUndefined();

    await act(async () => work.release());
    await settle();
    expect(says.computer).toMatchObject({ facts: { machine: "work-box" } });
    expect(says.needs).toEqual([]);
  });

  it("turns a switch on the workspace in front, never the one before", async () => {
    const home = computer({ self: { available: true, automatic: false } });
    const work = computer({ self: { available: true, automatic: false } });
    const view = await render(owned(home.store));
    await settle();
    await view.rerender(owned(work.store));
    await settle();
    await act(async () => says.setNightly(true));
    await settle();
    expect(home.asked.night).toEqual([]);
    expect(work.asked.night).toEqual([true]);
    expect(says.selfUpdate?.automatic).toBe(true);
  });
});

describe("the names in the Needs update list", () => {
  /** A store that says who is who when told, as the paired store does once its read lands. */
  function storeWithDirectory(box: ReturnType<typeof computer>) {
    const joined = {
      seq: 1,
      type: "person.joined",
      id: "evt_1",
      ts: "2026-11-13T00:00:00.000Z",
      workspace_id: "ws_1",
      actor: { kind: "person", id: "par_me" },
      participant_id: "par_me",
      display_name: "Arjun",
      role: "owner",
    } as unknown as ClientEvent;
    let snapshot = { model: buildModel([joined]), directory: {} as Directory };
    const listeners = new Set<() => void>();
    const store = {
      ...box.store,
      getSnapshot: () => snapshot,
      subscribe: (listen: () => void) => {
        listeners.add(listen);
        return () => listeners.delete(listen);
      },
    } as unknown as Store;
    return {
      store,
      says: (directory: Directory) => {
        snapshot = { ...snapshot, directory };
        for (const listen of listeners) listen();
      },
    };
  }

  it("follow the directory when what everything runs lands first", async () => {
    const box = computer({
      runs: { harnesses: [refused("har_hermes")], devices: [olderPhone()] },
      appStore: "1.2.4",
    });
    const paired = storeWithDirectory(box);
    mockPaired = { store: paired.store, device: { participantId: "par_me", deviceId: "dev_me" } };
    await render(
      <Phone>
        <UpdatesRoot>
          <Probe />
        </UpdatesRoot>
      </Phone>,
    );
    await settle();
    // Nobody is known yet: a bridge with no name is left out, and the phone is someone's.
    expect(says.needs.map((row) => row.label)).toEqual(["Someone's iPhone"]);

    await act(async () => paired.says(DIRECTORY));
    expect(says.needs.map((row) => row.label)).toEqual(["Hermes bridge", "Natalie's iPhone"]);
    // And a rename after that, with nothing read again.
    await act(async () =>
      paired.says({
        ...DIRECTORY,
        har_hermes: { id: "har_hermes", kind: "harness", displayName: "Hermes on the mini" },
      } as unknown as Directory),
    );
    expect(says.needs[0]?.label).toBe("Hermes on the mini bridge");
    expect(box.asked).toMatchObject({ server: 1, software: 1 });
  });

  it("stay the list a screen has drawn while a new directory says the same", async () => {
    const box = computer({ runs: { harnesses: [refused("har_hermes")], devices: [] } });
    const view = await render(owned(box.store));
    await settle();
    const drawn = says.needs;
    await view.rerender(owned(box.store, { directory: { ...DIRECTORY } }));
    expect(says.needs).toBe(drawn);
  });
});

describe("the dot, for the owner (ADR 0297)", () => {
  const needing = () => computer({ runs: { harnesses: [refused("har_hermes")], devices: [] } });

  it("lights for a bridge that needs them, with nothing out for the app or the computer", async () => {
    await render(owned(needing().store));
    expect(await screen.findByTestId("update-dot")).toBeTruthy();
    expect(says.dot).toBeUndefined();
    expect(says.ownerLit).toBe(true);
  });

  it("goes out when About comes into view, and is still out when the app is opened again", async () => {
    const box = needing();
    const view = await render(owned(box.store));
    await screen.findByTestId("update-dot");
    await act(async () => void says.opened());
    await settle();
    expect(screen.queryByTestId("update-dot")).toBeNull();
    expect(mockSettings.get("update.seen-needs")).toContain("bridge:har_hermes");

    await view.unmount();
    await render(owned(box.store));
    await settle();
    expect(says.needs).toHaveLength(1);
    expect(screen.queryByTestId("update-dot")).toBeNull();
  });

  it("keeps both what About put the dot out for: the release, and what needed the owner", async () => {
    const box = computer({
      runs: { harnesses: [refused("har_hermes")], devices: [] },
      appStore: "1.3.0",
      releases: [{ version: "1.3.0", date: "2026-01-05", line: "Something new.", dot: true }],
    });
    await render(owned(box.store));
    await screen.findByTestId("update-dot");
    expect(says.dot).toEqual({ version: "1.3.0" });
    expect(mockSettings.size).toBe(0);
    await act(async () => void says.opened());
    await settle();
    expect(JSON.parse(mockSettings.get("update.seen") ?? "{}")).toMatchObject({ version: "1.3.0" });
    expect(mockSettings.get("update.seen-needs")).toContain("bridge:har_hermes");
    expect(screen.queryByTestId("update-dot")).toBeNull();
  });

  it("never lights for somebody's phone alone", async () => {
    await render(owned(computer({ runs: { harnesses: [], devices: [olderPhone()] } }).store));
    await settle();
    expect(says.needs.map((row) => row.label)).toEqual(["Natalie's iPhone"]);
    expect(screen.queryByTestId("update-dot")).toBeNull();
  });

  it("stays out where the dot was turned off", async () => {
    mockSettings.set("update.dot", "off");
    await render(owned(needing().store));
    await settle();
    expect(says.needs).toHaveLength(1);
    expect(screen.queryByTestId("update-dot")).toBeNull();
  });

  it("lights for a night that couldn't update only while the night switch is on", async () => {
    const last = { state: "failed" as const, from: "1.2.4", at: "2026-11-12T03:10:00.000Z" };
    const view = await render(
      owned(computer({ self: { available: true, automatic: true, last } }).store),
    );
    expect(await screen.findByTestId("update-dot")).toBeTruthy();
    await view.unmount();

    await render(owned(computer({ self: { available: true, automatic: false, last } }).store));
    await settle();
    expect(says.selfUpdate?.last?.state).toBe("failed");
    expect(screen.queryByTestId("update-dot")).toBeNull();
  });

  it("is nobody's but the owner's", async () => {
    await render(owned(needing().store, { owner: false }));
    await settle();
    expect(says.needs).toEqual([]);
    expect(screen.queryByTestId("update-dot")).toBeNull();
  });

  it("stays out when one of two things About put it out for is fixed", async () => {
    const box = computer({
      runs: { harnesses: [refused("har_hermes"), refused("har_codex")], devices: [] },
    });
    await render(owned(box.store));
    await screen.findByTestId("update-dot");
    let leave: () => void = () => undefined;
    await act(async () => {
      leave = says.opened();
    });
    await settle();
    expect(screen.queryByTestId("update-dot")).toBeNull();
    await act(async () => leave());

    box.state.runs = { harnesses: [refused("har_hermes")], devices: [] };
    await act(async () => says.readSoftware());
    await settle();
    expect(says.needs.map((row) => row.label)).toEqual(["Hermes bridge"]);
    expect(screen.queryByTestId("update-dot")).toBeNull();
  });

  it("goes out for what comes to need them while About is the page in view", async () => {
    const box = computer({ runs: { harnesses: [], devices: [] } });
    await render(owned(box.store));
    await settle();
    let leave: () => void = () => undefined;
    await act(async () => {
      leave = says.opened();
    });
    await settle();

    box.state.runs = { harnesses: [refused("har_hermes")], devices: [] };
    await act(async () => says.readSoftware());
    await settle();
    expect(says.needs).toHaveLength(1);
    expect(screen.queryByTestId("update-dot")).toBeNull();
    expect(mockSettings.get("update.seen-needs")).toContain("bridge:har_hermes");

    // With About left, something new lights it again.
    await act(async () => leave());
    box.state.runs = { harnesses: [refused("har_hermes"), refused("har_codex")], devices: [] };
    await act(async () => says.readSoftware());
    expect(await screen.findByTestId("update-dot")).toBeTruthy();
  });
});

describe("a computer Chips for Mac carries (ADR 0298)", () => {
  it("lights no dot and asks for no Update: it comes along with the app", async () => {
    const releases = [{ version: "1.3.0", date: "2026-01-05", line: "Something new.", dot: true }];
    const carried = computer({
      releases,
      self: { available: false, automatic: false, withApp: true },
    });
    await render(owned(carried.store));
    await settle();
    expect(says.waiting.computer).toEqual({ version: "1.3.0", from: "1.2.4" });
    expect(says.asking.computer).toBeUndefined();
    expect(says.rowLit).toBe(false);
    expect(screen.queryByTestId("update-dot")).toBeNull();
  });

  it("lights it for a computer its owner updates, as before", async () => {
    const releases = [{ version: "1.3.0", date: "2026-01-05", line: "Something new.", dot: true }];
    await render(owned(computer({ releases }).store));
    expect(await screen.findByTestId("update-dot")).toBeTruthy();
    expect(says.asking.computer).toEqual({ version: "1.3.0", from: "1.2.4" });
  });
});

describe("the small dot on You's About Chips row (ADR 0296)", () => {
  const row = (store: Store) => (
    <Phone>
      <UpdatesProvider store={store} owner me="par_me" thisDevice="dev_me" directory={DIRECTORY}>
        <AboutRow />
        <Probe />
      </UpdatesProvider>
    </Phone>
  );

  it("shows for a bridge that needs the owner, as on the Mac and the web", async () => {
    const box = computer({ runs: { harnesses: [refused("har_hermes")], devices: [] } });
    await render(row(box.store));
    expect(await screen.findByTestId("about-row-dot")).toBeTruthy();
    expect(screen.getByTestId("about-row")).toHaveProp(
      "accessibilityLabel",
      "About Chips, 1.2.4, an update waits",
    );
    // About opened puts the tabs' dot out; the row keeps its own while the bridge needs them.
    await act(async () => void says.opened());
    await settle();
    expect(says.ownerLit).toBe(false);
    expect(screen.getByTestId("about-row-dot")).toBeTruthy();
  });

  it("stays off for somebody's phone, and while nothing waits", async () => {
    const box = computer({ runs: { harnesses: [], devices: [olderPhone()] } });
    await render(row(box.store));
    await settle();
    expect(says.needs).toHaveLength(1);
    expect(screen.queryByTestId("about-row-dot")).toBeNull();
  });

  it("shows for this app's update, and not for a computer that comes with Chips for Mac", async () => {
    const view = await render(row(computer({ appStore: "1.2.5" }).store));
    expect(await screen.findByTestId("about-row-dot")).toBeTruthy();
    await view.unmount();

    const carried = computer({
      version: "1.2.3",
      self: { available: false, automatic: false, withApp: true },
    });
    await render(row(carried.store));
    await settle();
    expect(says.waiting.computer).toEqual({ version: "1.2.4", from: "1.2.3" });
    expect(screen.queryByTestId("about-row-dot")).toBeNull();
  });
});
