/**
 * The app over several paired workspaces (M5.3), with the core's stores and device list
 * mocked: which one is in front, switching, muting, pairing another and signing out.
 */

import type { Device, Snapshot, Store } from "@chipschat/core";
import { buildModel } from "@chipschat/core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const core = vi.hoisted(() => ({
  switched: [] as string[],
  muted: [] as [string, boolean][],
  forgotten: [] as string[],
  revoked: [] as string[],
  devices: {} as Record<string, unknown>,
  /** Every store the app made, and whether it has been closed. */
  stores: [] as { deviceId: string; closed: boolean }[],
  /** The connection every store made says it has: open unless a test says otherwise. */
  connection: "open" as Snapshot["connection"],
  /** The person deleted their account from this device (ADR 0243). */
  deletedAccount: false,
  /** What each store's hello called its workspace, by device id (ADR 0193): none unless a test says. */
  workspaceNames: {} as Record<string, string>,
}));

vi.mock("@chipschat/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chipschat/core")>();
  const store = (device: Device): Store => {
    const workspaceName = core.workspaceNames[device.deviceId];
    const snapshot: Snapshot = {
      connection: core.connection,
      model: buildModel([]),
      directory: {
        [device.participantId]: {
          id: device.participantId,
          kind: "person",
          displayName: device.displayName,
        },
      },
      readState: {},
      busy: new Set(),
      receipts: new Map(),
      spaceIcons: new Map(),
      ...(workspaceName === undefined ? {} : { workspaceName }),
      ...(core.deletedAccount ? { deletedAccount: true } : {}),
    };
    const made = { deviceId: device.deviceId, closed: false };
    core.stores.push(made);
    return {
      subscribe: (listener: (snapshot: Snapshot) => void) => {
        listener(snapshot);
        return () => undefined;
      },
      getSnapshot: () => snapshot,
      // The Mac's folders (ADR 0225): no ask from another device comes.
      onFolderAsk: () => () => undefined,
      close: () => {
        made.closed = true;
      },
      revokeDevice: async (deviceId: string) => {
        core.revoked.push(deviceId);
      },
      // Notifications (M5.6): the defaults, nothing saved, nothing claimed.
      notificationSettings: () => ({
        decide: "now",
        review: "hourly",
        fyi: "daily",
        harnesses: {},
      }),
      loadNotificationSettings: async () => ({
        decide: "now",
        review: "hourly",
        fyi: "daily",
        harnesses: {},
      }),
      saveNotificationSettings: async () => undefined,
      claimNotifications: async () => [],
      // What may be attached (ADR 0047): nothing set, and the server's ceiling.
      setAttachmentCaps: () => undefined,
      setExchangeLimits: () => undefined,
      serverLimits: async () => ({ maxAttachmentBytes: 104_857_600, maxMessageBytes: 65_536 }),
      sessionPin: () => undefined,
      loadSessionPins: async () => undefined,
      loadSpaceIcons: async () => undefined,
      pinSession: async () => undefined,
      // The Connection card on You (ADR 0211): a timed read. The server's facts are not read in
      // these tests; the card names "your server".
      roundTrip: async () => 38,
      serverFacts: () => Promise.reject(new Error("not read here")),
    } as unknown as Store;
  };
  return {
    ...actual,
    createStore: ({ device }: { device: Device }) => store(device),
    switchDevice: async (deviceId: string) => {
      core.switched.push(deviceId);
      return { deviceId } as Device;
    },
    setDeviceMuted: async (deviceId: string, muted: boolean) => {
      core.muted.push([deviceId, muted]);
      // The real one answers the whole device with the flag set; so does this.
      return { ...(core.devices[deviceId] as Device), muted };
    },
    forgetDevice: async (deviceId?: string) => {
      core.forgotten.push(deviceId ?? "");
      return undefined;
    },
    passkeysSupported: () => false,
  };
});

// The shell's own API, for the one test that runs the app as the desktop window finds it.
vi.mock("@tauri-apps/api/core", () => ({ invoke: async () => [] }));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => undefined }));

import { App } from "./App.tsx";

const home: Device = {
  deviceId: "dev_1",
  participantId: "usr_1",
  workspaceId: "ws_1",
  displayName: "Arjun",
  workspaceName: "Home",
  privateKey: {} as CryptoKey,
};
const work: Device = {
  ...home,
  deviceId: "dev_2",
  workspaceId: "ws_2",
  workspaceName: "Northwind",
};
core.devices = { dev_1: home, dev_2: work };

/**
 * A newcomer's page opens on the film (ADR 0217's addendum of 26 October): Skip puts That's Chips
 * in its place, and its Set up my own Chips opens the page's ways in, the code among them.
 */
async function waysIn(): Promise<void> {
  await screen.findByRole("heading", { level: 1, name: "Chips" });
  fireEvent.click(screen.getByRole("button", { name: "Skip" }));
  fireEvent.click(screen.getByRole("button", { name: "Set up my own Chips" }));
}

afterEach(() => {
  core.switched.length = 0;
  core.muted.length = 0;
  core.forgotten.length = 0;
  core.revoked.length = 0;
  core.stores.length = 0;
  core.connection = "open";
  core.deletedAccount = false;
  core.workspaceNames = {};
});

describe("the app over several workspaces", () => {
  it("shows the pairing screen with nothing paired, and the shell with one", async () => {
    const { unmount } = render(<App devices={[]} />);
    expect(screen.queryByLabelText("Pairing code")).toBeNull();
    await waysIn();
    expect(screen.getByLabelText("Pairing code")).toBeDefined();
    unmount();
    render(<App devices={[home]} />);
    expect(await screen.findByTestId("workspace-name")).toHaveProperty("textContent", "Home");
  });

  it("switches between two, and mutes one from You", async () => {
    render(<App devices={[home, work]} />);
    const picker = await screen.findByRole("combobox", { name: "Workspace" });
    expect((picker as HTMLSelectElement).value).toBe("dev_1");
    await act(async () => {
      fireEvent.change(picker, { target: { value: "dev_2" } });
    });
    await waitFor(() => expect(core.switched).toEqual(["dev_2"]));
    await waitFor(() =>
      expect((screen.getByRole("combobox", { name: "Workspace" }) as HTMLSelectElement).value).toBe(
        "dev_2",
      ),
    );

    fireEvent.click(screen.getByTestId("you"));
    await screen.findByRole("main", { name: "You" });
    const toggle = screen.getByTestId("mute").querySelector("input") as HTMLInputElement;
    await act(async () => {
      fireEvent.click(toggle);
    });
    await waitFor(() => expect(core.muted).toEqual([["dev_2", true]]));
  });

  it("names each as its server calls it now, not as it was paired (ADR 0193)", async () => {
    core.workspaceNames = { [home.deviceId]: "Primal" };
    const { unmount } = render(<App devices={[home, work]} />);
    const picker = (await screen.findByRole("combobox", {
      name: "Workspace",
    })) as HTMLSelectElement;
    expect([...picker.options].map((option) => option.textContent)).toEqual([
      "Primal",
      "Northwind",
      "Watch Chips work…",
    ]);
    unmount();

    // One behind by what its own store heard too: renamed and named back, the name kept with
    // the device can be the one in between (18 October 2026).
    core.workspaceNames = { [home.deviceId]: "Primal", [work.deviceId]: "Northwind Labs" };
    render(<App devices={[home, work]} />);
    const again = (await screen.findByRole("combobox", {
      name: "Workspace",
    })) as HTMLSelectElement;
    expect([...again.options].map((option) => option.textContent)).toEqual([
      "Primal",
      "Northwind Labs",
      "Watch Chips work…",
    ]);
  });

  it("holds one open store per workspace, under Strict Mode and across a switch", async () => {
    // A store is a socket to the server, and through a relay a tunnel. Two for one device each
    // closed the other's tunnel in turn, and one of them could stop for good (CI, 13 September
    // 2026). Strict Mode is where a second store came from, and so did a switch, which left the
    // one in front open behind the background store that replaced it.
    const open = () =>
      core.stores
        .filter((store) => !store.closed)
        .map((store) => store.deviceId)
        .sort();
    render(
      <StrictMode>
        <App devices={[home, work]} />
      </StrictMode>,
    );
    const picker = await screen.findByRole("combobox", { name: "Workspace" });
    await waitFor(() => expect(open()).toEqual(["dev_1", "dev_2"]));
    await act(async () => {
      fireEvent.change(picker, { target: { value: "dev_2" } });
    });
    await waitFor(() => expect(core.switched).toEqual(["dev_2"]));
    await waitFor(() =>
      expect((screen.getByRole("combobox", { name: "Workspace" }) as HTMLSelectElement).value).toBe(
        "dev_2",
      ),
    );
    expect(open()).toEqual(["dev_1", "dev_2"]);
  });

  it("offers to pair another server in the desktop shell, with a way back", async () => {
    const desktop = {
      discover: async () => [],
      ask: async () => undefined,
      tell: async () => undefined,
      badge: async () => undefined,
      onDecision: async () => () => undefined,
      onOpen: async () => () => undefined,
    };
    render(<App devices={[home]} desktop={desktop} />);
    const picker = await screen.findByRole("combobox", { name: "Workspace" });
    fireEvent.change(picker, { target: { value: "+" } });
    await screen.findByRole("heading", { name: "Find your server" });
    fireEvent.click(screen.getByTestId("pair-cancel"));
    expect(await screen.findByRole("combobox", { name: "Workspace" })).toBeDefined();
  });

  it("in the desktop window, an unpaired app finds a server first, never pairs itself", async () => {
    // Found for itself, not handed in: the shell arrives a moment after the first render, and
    // the pairing screen must not settle on this page's own origin before it does.
    const where = globalThis as { __TAURI_INTERNALS__?: unknown };
    where.__TAURI_INTERNALS__ = {};
    try {
      render(<App devices={[]} />);
      expect(screen.queryByRole("heading", { name: "Pair this browser" })).toBeNull();
      await waysIn();
      await screen.findByRole("heading", { name: "Find your server" });
      expect(screen.queryByRole("heading", { name: "Pair this browser" })).toBeNull();
    } finally {
      delete where.__TAURI_INTERNALS__;
    }
  });

  it("signs out of the device in front: withdrawn, forgotten, back to pairing", async () => {
    render(<App devices={[home]} />);
    fireEvent.click(await screen.findByTestId("you"));
    await screen.findByRole("main", { name: "You" });
    await act(async () => {
      fireEvent.click(screen.getByTestId("sign-out"));
    });
    await waitFor(() => expect(core.forgotten).toEqual(["dev_1"]));
    expect(core.revoked).toEqual(["dev_1"]);
    await waysIn();
    expect(await screen.findByLabelText("Pairing code")).toBeDefined();
  });

  it("says so when its person was removed, and OK forgets it with no pair-again (ADR 0160)", async () => {
    core.connection = "removed";
    render(<App devices={[home]} />);
    const removed = await screen.findByTestId("removed");
    expect(removed.textContent).toContain("You're no longer in Home");
    expect(removed.textContent).toContain("To come back, ask for a new invite.");
    expect(screen.queryByTestId("you")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "OK" }));
    });
    await waitFor(() => expect(core.forgotten).toEqual(["dev_1"]));
    // Its key is withdrawn at the server already, and pairing again could not let it in.
    expect(core.revoked).toEqual([]);
    await waysIn();
    expect(await screen.findByLabelText("Pairing code")).toBeDefined();
    expect(screen.queryByText(/does not know this browser/)).toBeNull();
  });

  it("says they left when they deleted their account here, and OK forgets it (ADR 0243)", async () => {
    core.connection = "removed";
    core.deletedAccount = true;
    render(<App devices={[home]} />);
    const removed = await screen.findByTestId("removed");
    expect(removed.textContent).toContain("You've left Home");
    expect(removed.textContent).toContain("Your account there is deleted.");
    expect(removed.textContent).not.toContain("removed");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "OK" }));
    });
    await waitFor(() => expect(core.forgotten).toEqual(["dev_1"]));
  });
});
