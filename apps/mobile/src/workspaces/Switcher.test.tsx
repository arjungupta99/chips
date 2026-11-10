/**
 * A phone holding several workspaces (ADR 0197): Spaces named for the one in front, the sheet its
 * name opens, listing each with what waits there and switching, Rename for an owner, Join another
 * workspace by a link pasted or a code scanned, and You's group.
 */

import type { Device, Snapshot } from "@chipschat/core";
import {
  act,
  render as renderBare,
  screen,
  userEvent,
  waitFor,
} from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import { type ReactElement, type ReactNode, useState } from "react";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NO_INVITE } from "../pairing/usePasteInvite";
import { Group } from "../ui/Group";
import { Screen } from "../ui/Screen";
import { useWorkspaceTitle, WorkspacesSheet } from "./Switcher";
import { useWorkspacesGroup } from "./WorkspacesGroup";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};
function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}
const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

/** A workspace's log, as much of it as the switcher reads. */
function mockSnapshotOf(role: string, waiting = 0, workspaceName?: string): Snapshot {
  return {
    workspaceName,
    model: {
      people: { usr_meera: { participantId: "usr_meera", role, invitedBy: "usr_arjun" } },
      spaces: [{ id: "spc_japan", title: "Japan trip", state: "open", members: ["usr_meera"] }],
      needsYou: Array.from({ length: waiting }, (_, at) => ({
        tier: "decide",
        spaceId: "spc_japan",
        seq: at,
      })),
    },
    directory: { usr_arjun: { id: "usr_arjun", kind: "person", displayName: "Arjun" } },
    readState: {},
  } as unknown as Snapshot;
}
const mockRename = jest.fn(async (_name: string) => undefined);
const mockStoreWith = (snapshot: Snapshot) => ({
  getSnapshot: () => snapshot,
  subscribe: () => () => undefined,
  renameWorkspace: mockRename,
});

const mockOwn = {
  deviceId: "dev_own",
  participantId: "usr_meera",
  workspaceName: "Meera's workspace",
} as unknown as Device;
const mockArjuns = {
  deviceId: "dev_arjuns",
  participantId: "usr_meera",
  workspaceName: "Arjun's workspace",
} as unknown as Device;

const mockSwitchTo = jest.fn(async () => undefined);
let mockDevices: Device[] = [mockOwn, mockArjuns];
let mockNeeds: Record<string, number> = { dev_arjuns: 1 };
let mockFrontRole = "owner";
/** What the server behind last said it is called: nothing until its hello. */
let mockBehindName: string | undefined;
/** A workspace on its way to the front, while the one in front holds the screen. */
let mockArriving: Device | undefined;
/** A store in front that is told things, for what is drawn again when it is. */
let mockLive: ReturnType<typeof liveStore> | undefined;
function liveStore(first: Snapshot) {
  let snapshot = first;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hear: (next: Snapshot) => {
      snapshot = next;
      for (const listener of listeners) listener();
    },
  };
}
jest.mock("../store/provider", () => ({
  useChips: () => ({
    devices: mockDevices,
    paired: { device: mockOwn, store: mockLive ?? mockStoreWith(mockSnapshotOf(mockFrontRole)) },
    arriving: mockArriving,
    others: {
      stores: new Map([["dev_arjuns", mockStoreWith(mockSnapshotOf("guest", 1, mockBehindName))]]),
      needs: mockNeeds,
      decides: mockNeeds,
    },
    switchTo: mockSwitchTo,
    mute: jest.fn(async () => undefined),
    began: mockBegan,
  }),
}));
const mockBegan = jest.fn();
const mockPushed: unknown[] = [];
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: (to: unknown) => mockPushed.push(to),
    replace: jest.fn(),
    canDismiss: () => false,
  }),
}));
/** A computer's pairing code, scanned: what the phone pairs with, handed back once it is in. */
const mockPaired: string[] = [];
jest.mock("../pairing/usePairing", () => ({
  ...jest.requireActual("../pairing/usePairing"),
  usePairing: (onPaired: (device: unknown) => void) => ({
    working: false,
    failure: undefined,
    pair: (text: string) => {
      mockPaired.push(text);
      onPaired({ deviceId: "dev_second" });
    },
  }),
}));
/** What the camera shows, allowed: a test reads a code into it with `read`. */
const mockCamera: { read: ((data: string) => void) | undefined } = { read: undefined };
jest.mock("expo-camera", () => ({
  CameraView: (props: { onBarcodeScanned: (code: { data: string }) => void }) => {
    mockCamera.read = (data) => props.onBarcodeScanned({ data });
    return null;
  },
  useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
}));

afterEach(() => {
  mockDevices = [mockOwn, mockArjuns];
  mockNeeds = { dev_arjuns: 1 };
  mockFrontRole = "owner";
  mockBehindName = undefined;
  mockArriving = undefined;
  mockLive = undefined;
  mockPushed.length = 0;
  mockPaired.length = 0;
  mockBegan.mockClear();
  mockCamera.read = undefined;
  mockSwitchTo.mockClear();
  mockRename.mockReset();
  mockRename.mockImplementation(async () => undefined);
});

/** Spaces as the list draws it: the workspace's name, which opens the sheet. */
function Spaces() {
  const [open, setOpen] = useState(false);
  const { name, elsewhere, arriving } = useWorkspaceTitle();
  return (
    <Screen
      title={name}
      opens={{
        onPress: () => setOpen(true),
        hint: "Shows your workspaces",
        dot: elsewhere,
        busy: arriving,
        testID: "workspace-title",
      }}
    >
      <WorkspacesSheet open={open} onClose={() => setOpen(false)} />
    </Screen>
  );
}

describe("Spaces, named for the workspace", () => {
  it("is named for the one in front, with a dot when something waits in another", async () => {
    await render(<Spaces />);
    expect(screen.getByRole("header", { name: "Meera's workspace" })).toBeOnTheScreen();
    expect(screen.getByTestId("workspace-title-dot")).toBeOnTheScreen();
  });

  it("is named at once for one on its way to the front, with a line under it and no dot", async () => {
    await render(<Spaces />);
    expect(screen.queryByTestId("workspace-title-arriving")).toBeNull();

    // Switched to: the one in front still holds the screen while the other reads its cache.
    mockArriving = mockArjuns;
    await render(<Spaces />);
    expect(screen.getByRole("header", { name: "Arjun's workspace" })).toBeOnTheScreen();
    expect(screen.getByTestId("workspace-title-arriving")).toBeOnTheScreen();
    expect(screen.queryByTestId("workspace-title-dot")).toBeNull();
  });

  it("keeps the name and opens the sheet with only one, and no dot", async () => {
    mockDevices = [mockOwn];
    mockNeeds = {};
    await render(<Spaces />);
    expect(screen.queryByTestId("workspace-title-dot")).toBeNull();
    await userEvent.press(screen.getByTestId("workspace-title"));
    expect(await screen.findByText("Workspaces")).toBeOnTheScreen();
    expect(screen.getByTestId("paste-invite")).toBeOnTheScreen();
  });

  it("lists each with its role and what waits there, and switches once the sheet has gone", async () => {
    await render(<Spaces />);
    await userEvent.press(screen.getByTestId("workspace-title"));
    expect(await screen.findByText("Workspaces")).toBeOnTheScreen();
    expect(screen.getByText("Owner")).toBeOnTheScreen();
    expect(screen.getByText("Guest in Japan trip · invited by Arjun")).toBeOnTheScreen();
    expect(screen.getByTestId("workspace-waiting")).toHaveTextContent("1");

    await userEvent.press(screen.getByTestId("workspace-dev_arjuns"));
    await waitFor(() => expect(mockSwitchTo).toHaveBeenCalledWith("dev_arjuns"));
  });

  it("calls one behind what its server last said, over the name kept with it", async () => {
    // Renamed and named back while open, the phone kept the name in between (18 October 2026).
    mockDevices = [mockOwn, { ...mockArjuns, workspaceName: "Primal Space" } as Device];
    await render(<Spaces />);
    await userEvent.press(screen.getByTestId("workspace-title"));
    expect(await screen.findByText("Primal Space")).toBeOnTheScreen();
    await screen.unmount();

    mockBehindName = "Primal";
    await render(<Spaces />);
    await userEvent.press(screen.getByTestId("workspace-title"));
    expect(await screen.findByText("Primal")).toBeOnTheScreen();
    expect(screen.queryByText("Primal Space")).toBeNull();
  });

  it("joins with a link pasted there, and says so when what was copied is not one", async () => {
    await render(<Spaces />);
    await userEvent.press(screen.getByTestId("workspace-title"));
    (Clipboard.getStringAsync as jest.Mock).mockResolvedValueOnce("https://example.com/menu");
    await userEvent.press(await screen.findByTestId("paste-invite"));
    expect(await screen.findByText(NO_INVITE)).toBeOnTheScreen();

    (Clipboard.getStringAsync as jest.Mock).mockResolvedValueOnce(
      `https://host.example/#invite=chips_inv_5&key=${"k".repeat(43)}`,
    );
    await userEvent.press(screen.getByTestId("paste-invite"));
    await waitFor(() =>
      expect(mockPushed).toEqual([
        {
          pathname: "/join",
          params: { invite: "chips_inv_5", lan: "https://host.example", key: "k".repeat(43) },
        },
      ]),
    );
  });
});

describe("Join another workspace, by a code scanned", () => {
  const invite = `https://relay.example/join#invite=chips_inv_7&lan=https://host.example&key=${"k".repeat(43)}`;
  const opened = {
    pathname: "/join",
    params: { invite: "chips_inv_7", lan: "https://host.example", key: "k".repeat(43) },
  };

  it("opens the camera once the sheet has gone, for an invite alone", async () => {
    await render(<Spaces />);
    await userEvent.press(screen.getByTestId("workspace-title"));
    expect(await screen.findByRole("header", { name: "Join another workspace" })).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Scan a QR code" }));
    await waitFor(() => expect(screen.queryByTestId("workspaces-sheet")).toBeNull());
    expect(screen.getByTestId("scan-sheet")).toBeOnTheScreen();
    expect(screen.getByText("the code on the other person's screen")).toBeOnTheScreen();
    expect(screen.queryByText("Your computer")).toBeNull();
    expect(screen.queryByText("Type a pairing code instead")).toBeNull();
  });

  it("opens an invite, and pairs with a computer's code as the first screen does", async () => {
    await render(<Spaces />);
    await userEvent.press(screen.getByTestId("workspace-title"));
    await userEvent.press(await screen.findByTestId("workspace-scan"));
    await screen.findByTestId("scan-sheet");
    await act(async () => mockCamera.read?.(invite));
    expect(mockPushed).toEqual([opened]);
    expect(mockPaired).toEqual([]);
    // The join sheet opens over Spaces, not under the camera.
    expect(screen.queryByTestId("scan-sheet")).toBeNull();

    // A second Chips of your own: its computer's code pairs, and the camera goes as it is in.
    await userEvent.press(screen.getByTestId("workspace-title"));
    await userEvent.press(await screen.findByTestId("workspace-scan"));
    await screen.findByTestId("scan-sheet");
    const code = "https://chipschat.ai/p#pair=ABC-234&v=1&lan=http%3A%2F%2F192.168.1.20%3A4431";
    await act(async () => mockCamera.read?.(code));
    expect(mockPaired).toEqual([code]);
    expect(mockBegan).toHaveBeenCalledWith({ deviceId: "dev_second" });
    await waitFor(() => expect(screen.queryByTestId("scan-sheet")).toBeNull());
  });

  it("opens the same invite again when it is scanned after a join backed out of", async () => {
    await render(<Spaces />);
    for (const _ of [1, 2]) {
      await userEvent.press(screen.getByTestId("workspace-title"));
      await userEvent.press(await screen.findByTestId("workspace-scan"));
      await screen.findByTestId("scan-sheet");
      await act(async () => mockCamera.read?.(invite));
      await waitFor(() => expect(screen.queryByTestId("scan-sheet")).toBeNull());
    }
    expect(mockPushed).toEqual([opened, opened]);
  });
});

describe("what the name follows", () => {
  it("is drawn again when the workspace in front changes what it says, and not for other words", async () => {
    const first = mockSnapshotOf("owner", 0, "Primal");
    mockLive = liveStore(first);
    let drawn = 0;
    function Title() {
      drawn += 1;
      return <Text>{useWorkspaceTitle().name}</Text>;
    }
    await render(<Title />);
    expect(screen.getByText("Primal")).toBeTruthy();
    const before = drawn;

    // Somebody spoke in a room: nothing the switcher says has changed.
    await act(() =>
      mockLive?.hear({ ...first, model: { ...first.model, spaces: [] } } as Snapshot),
    );
    expect(drawn).toBe(before);

    await act(() => mockLive?.hear(mockSnapshotOf("owner", 0, "Primal Space")));
    expect(screen.getByText("Primal Space")).toBeTruthy();
    expect(drawn).toBe(before + 1);
  });
});

describe("Rename in the sheet", () => {
  it("names the one in front again for an owner, and turns back to the list", async () => {
    await render(<Spaces />);
    await userEvent.press(screen.getByTestId("workspace-title"));
    await userEvent.press(await screen.findByTestId("workspace-rename"));
    const field = await screen.findByTestId("workspace-name-field");
    expect(field.props["value"]).toBe("Meera's workspace");
    await userEvent.clear(field);
    await userEvent.type(field, "Kyoto crew");
    await userEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(mockRename).toHaveBeenCalledWith("Kyoto crew");
    await waitFor(() =>
      expect(
        screen.queryByTestId("workspace-name-field", { includeHiddenElements: true }),
      ).toBeNull(),
    );
    expect(screen.getByTestId("workspace-rename")).toBeOnTheScreen();
  });

  it("keeps the name typed and says why when the server will not take it", async () => {
    mockRename.mockRejectedValueOnce(new Error("404 no route matches"));
    await render(<Spaces />);
    await userEvent.press(screen.getByTestId("workspace-title"));
    await userEvent.press(await screen.findByTestId("workspace-rename"));
    const field = await screen.findByTestId("workspace-name-field");
    await userEvent.type(field, " 2");
    await userEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByTestId("workspace-name-error")).toHaveTextContent(
      /older than the app/,
    );
    expect(screen.getByTestId("workspace-name-field").props["value"]).toBe("Meera's workspace 2");
  });

  it.each(["admin", "member", "guest"])(
    "is not offered to anybody but an owner: %s",
    async (role) => {
      mockFrontRole = role;
      await render(<Spaces />);
      await userEvent.press(screen.getByTestId("workspace-title"));
      expect(await screen.findByText("Workspaces")).toBeOnTheScreen();
      expect(screen.queryByTestId("workspace-rename")).toBeNull();
    },
  );
});

/** You's top card: the Workspace row, and Notifications' switches for each, as You puts them. */
function You() {
  const { row, notify, overlays } = useWorkspacesGroup();
  return (
    <>
      <Group>
        {row}
        {notify}
      </Group>
      {overlays}
    </>
  );
}

describe("You's workspaces", () => {
  it("says the one in front, counts what waits in another, and opens the sheet Spaces opens", async () => {
    await render(<You />);
    const row = screen.getByTestId("you-workspace");
    expect(row).toHaveAccessibleName("Workspace, Meera's workspace, 1 waiting in another");
    await userEvent.press(row);
    expect(await screen.findByText("Workspaces")).toBeOnTheScreen();
    expect(screen.getByTestId("paste-invite")).toBeOnTheScreen();
    expect(screen.getByTestId("workspace-rename")).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId("workspace-dev_arjuns"));
    await waitFor(() => expect(mockSwitchTo).toHaveBeenCalledWith("dev_arjuns"));
  });

  it("gives Notifications a switch from each once there are two", async () => {
    await render(<You />);
    expect(screen.getByText("From Meera's workspace")).toBeOnTheScreen();
    expect(screen.getByTestId("notify-dev_own")).toBeOnTheScreen();
    expect(screen.getByTestId("notify-dev_arjuns")).toBeOnTheScreen();
  });

  it("gives no switches with only the one, and Join another workspace is still a tap away", async () => {
    mockDevices = [mockOwn];
    mockNeeds = {};
    await render(<You />);
    expect(screen.getByTestId("you-workspace")).toHaveAccessibleName(
      "Workspace, Meera's workspace",
    );
    expect(screen.queryByTestId("notify-dev_own")).toBeNull();
    await userEvent.press(screen.getByTestId("you-workspace"));
    expect(await screen.findByTestId("paste-invite")).toBeOnTheScreen();
  });
});
