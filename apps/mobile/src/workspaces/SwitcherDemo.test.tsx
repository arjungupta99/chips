/**
 * The demo's made-up workspace in the switcher (ADR 0213): Chips demo, with a Demo tag on Spaces'
 * name while it is in front, no Rename, no switch for its notifications, and the switcher's own
 * Remove, which takes it and its word off the phone.
 */

import { DEMO_DEVICE_ID, type Device, type Snapshot } from "@chipschat/core";
import { render as renderBare, screen, userEvent, waitFor } from "@testing-library/react-native";
import { type ReactElement, type ReactNode, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
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

const mockDemo = {
  deviceId: DEMO_DEVICE_ID,
  participantId: "per_you",
  workspaceName: "Chips demo",
} as unknown as Device;
const mockOwn = {
  deviceId: "dev_own",
  participantId: "usr_meera",
  workspaceName: "Meera's workspace",
} as unknown as Device;

function mockSnapshotOf(you: string, workspaceName: string): Snapshot {
  return {
    workspaceName,
    model: {
      people: { [you]: { participantId: you, role: "owner" } },
      spaces: [{ id: "spc_birthday", title: "Birthday dinner", state: "open", members: [you] }],
      needsYou: [],
    },
    directory: {},
    readState: {},
  } as unknown as Snapshot;
}
const mockStoreWith = (snapshot: Snapshot) => ({
  getSnapshot: () => snapshot,
  subscribe: () => () => undefined,
  renameWorkspace: jest.fn(),
});

let mockFront: Device = mockDemo;
/** Whether the phone holds the demo at all: one set up that never watched it does not. */
let mockHeld = true;
const mockRemove = jest.fn(() => mockOwn as Device | undefined);
jest.mock("../store/provider", () => ({
  useChips: () => ({
    devices: !mockHeld
      ? [mockOwn]
      : mockFront === mockDemo
        ? [mockDemo, mockOwn]
        : [mockOwn, mockDemo],
    paired: {
      device: mockFront,
      store: mockStoreWith(
        mockFront === mockDemo
          ? mockSnapshotOf("per_you", "Chips demo")
          : mockSnapshotOf("usr_meera", "Meera's workspace"),
      ),
    },
    arriving: undefined,
    others: { stores: new Map(), needs: {}, decides: {} },
    switchTo: jest.fn(async () => undefined),
    mute: jest.fn(async () => undefined),
    ended: jest.fn(),
    demo: { remove: mockRemove },
  }),
}));
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  canDismiss: jest.fn(() => false),
  dismissAll: jest.fn(),
};
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));

afterEach(() => {
  mockFront = mockDemo;
  mockHeld = true;
  mockRemove.mockClear();
  mockRouter.replace.mockClear();
  mockRouter.push.mockClear();
});

/** Spaces as the list draws it: the workspace's name, its tag, and the sheet it opens. */
function Spaces() {
  const [open, setOpen] = useState(false);
  const { name, demo } = useWorkspaceTitle();
  return (
    <Screen
      title={name}
      opens={{
        onPress: () => setOpen(true),
        hint: "Shows your workspaces",
        tag: demo ? "Demo" : undefined,
        testID: "workspace-title",
      }}
    >
      <WorkspacesSheet open={open} onClose={() => setOpen(false)} />
    </Screen>
  );
}

describe("Chips demo in the switcher", () => {
  it("names Spaces for it with a Demo tag while it is in front, and only then", async () => {
    await render(<Spaces />);
    expect(screen.getByRole("header", { name: "Chips demo" })).toBeOnTheScreen();
    expect(screen.getByTestId("workspace-title-tag")).toHaveTextContent("Demo");
    await screen.unmount();

    mockFront = mockOwn;
    await render(<Spaces />);
    expect(screen.getByRole("header", { name: "Meera's workspace" })).toBeOnTheScreen();
    expect(screen.queryByTestId("workspace-title-tag")).toBeNull();
  });

  it("lists it as Chips demo, with no Rename, and Remove takes it off the phone", async () => {
    await render(<Spaces />);
    await userEvent.press(screen.getByTestId("workspace-title"));
    expect(await screen.findByText("Workspaces")).toBeOnTheScreen();
    expect(screen.getByTestId(`workspace-${DEMO_DEVICE_ID}`)).toHaveTextContent(/Chips demo/);
    expect(screen.queryByTestId("workspace-rename")).toBeNull();

    await userEvent.press(screen.getByTestId("workspace-remove-demo"));
    await waitFor(() => expect(mockRemove).toHaveBeenCalledTimes(1));
    // The workspace of the person's own comes forward, on Spaces.
    expect(mockRouter.replace).toHaveBeenCalledWith("/");
  });

  it("plays the film's video again from Watch Chips work, once Look around has kept it", async () => {
    await render(<Spaces />);
    await userEvent.press(screen.getByTestId("workspace-title"));
    await userEvent.press(await screen.findByTestId("workspace-watch-demo"));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/film"));
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("offers Watch Chips work on a phone set up that never watched it, with no Remove", async () => {
    mockFront = mockOwn;
    mockHeld = false;
    await render(<Spaces />);
    await userEvent.press(screen.getByTestId("workspace-title"));
    await userEvent.press(await screen.findByTestId("workspace-watch-demo"));
    expect(screen.queryByTestId("workspace-remove-demo")).toBeNull();
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/film"));
  });

  it("goes to the first screen when it was all the phone held", async () => {
    mockRemove.mockReturnValueOnce(undefined);
    await render(<Spaces />);
    await userEvent.press(screen.getByTestId("workspace-title"));
    await userEvent.press(await screen.findByTestId("workspace-remove-demo"));
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: "/pair", params: { ways: "1" } }),
    );
  });

  it("is removed from the switcher while another is in front, too", async () => {
    mockFront = mockOwn;
    await render(<Spaces />);
    await userEvent.press(screen.getByTestId("workspace-title"));
    expect(await screen.findByTestId("workspace-remove-demo")).toBeOnTheScreen();
    // An owner of the one in front still renames it.
    expect(screen.getByTestId("workspace-rename")).toBeOnTheScreen();
  });
});

describe("You's notifications", () => {
  function Notify() {
    const { notify } = useWorkspacesGroup();
    return <Group>{notify}</Group>;
  }

  it("has no switch for the demo, which has nothing to notify from", async () => {
    mockFront = mockOwn;
    await render(<Notify />);
    expect(screen.queryByTestId(`notify-${DEMO_DEVICE_ID}`)).toBeNull();
    expect(screen.queryByTestId("notify-dev_own")).toBeNull();
  });
});
