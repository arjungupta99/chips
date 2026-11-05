/**
 * A room's route (`app/spaces/[id].tsx`): what it does with what it was opened with. The room and
 * its sheet stand in here, since what they draw is their own tests' (`SpaceView.test.tsx`,
 * `RoomSheet.test.tsx`); what is asked is whether the sheet comes up, when, and on which page. The
 * test lives beside them because every file under `app/` is a route.
 */

import type { Snapshot, Space } from "@chipschat/core";
import { act, render as renderBare, screen, userEvent } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { Dimensions, Keyboard } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import SpaceScreen from "../../app/spaces/[id]";
import { fakeStore, snapshot } from "../testing/fixtures";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

// The window as the phone's too: Jest's own is 750 points across, an iPad's since ADR 0256.
const jestWindow = Dimensions.get("window");
beforeAll(() => Dimensions.set({ window: { width: 393, height: 852, scale: 3, fontScale: 1 } }));
afterAll(() => Dimensions.set({ window: jestWindow }));

const render = (element: ReactElement) =>
  renderBare(<SafeAreaProvider initialMetrics={IPHONE}>{element}</SafeAreaProvider>);

/** What the route was opened with, which `setParams` changes as the router would. */
const mockParams: Record<string, string | undefined> = {};
const mockRouter = {
  push: jest.fn(),
  setParams: jest.fn((next: Record<string, string | undefined>) => Object.assign(mockParams, next)),
};
/** What the stack has been asked to say as the room comes and goes, by event. */
const mockListeners = new Map<string, ((event: { data: { closing: boolean } }) => void)[]>();
const mockNavigation = {
  addListener: (type: string, listener: (event: { data: { closing: boolean } }) => void) => {
    mockListeners.set(type, [...(mockListeners.get(type) ?? []), listener]);
    return () =>
      mockListeners.set(
        type,
        (mockListeners.get(type) ?? []).filter((each) => each !== listener),
      );
  },
};
jest.mock("expo-router", () => ({
  Redirect: () => null,
  // The bar draws the room's name, which opens the sheet, and what stands at its right.
  Stack: {
    Screen: ({
      options,
    }: {
      options?: { headerTitle?: () => unknown; headerRight?: () => unknown };
    }) => {
      const react = require("react");
      return react.createElement(
        react.Fragment,
        null,
        options?.headerTitle?.() ?? null,
        options?.headerRight?.() ?? null,
      );
    },
  },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNavigation,
  useRouter: () => mockRouter,
}));

const mockPaired: { current?: { store: unknown; snapshot: Snapshot } } = {};
jest.mock("../store/provider", () => ({
  useChips: () => ({
    paired: {
      store: mockPaired.current?.store,
      device: { participantId: "per_arjun", serverUrl: "http://192.168.1.20:4431" },
    },
  }),
  useSnapshot: () => mockPaired.current?.snapshot,
}));

// What the room draws, and the sheet, which says only whether it is up and on which page.
jest.mock("./SpaceView", () => ({ SpaceView: () => null }));
jest.mock("./Universe", () => {
  const react = require("react");
  const { Text } = require("react-native");
  return {
    UniverseSheet: ({ open }: { open: boolean }) =>
      react.createElement(Text, { testID: "universe" }, open ? "up" : "down"),
  };
});
jest.mock("./RoomSheet", () => {
  const react = require("react");
  const { Text } = require("react-native");
  return {
    RoomSheet: ({ open, opensOn }: { open: boolean; opensOn: string }) =>
      react.createElement(Text, { testID: "room-sheet" }, open ? `up on ${opensOn}` : "down"),
  };
});
// The name's sweep is drawn on Reanimated, and the + window has nothing to hold the room under.
jest.mock("../newSpace/Naming", () => ({ ArrivingTitle: () => null, Sweep: () => null }));
jest.mock("../newSpace/NewSpace", () => ({
  useUnderWindow: () => false,
  useDrawnUnderWindow: () => () => undefined,
}));

/** The stack says the room has started, or finished, sliding in. */
const slide = (type: "transitionStart" | "transitionEnd") =>
  act(() => {
    for (const listener of mockListeners.get(type) ?? []) listener({ data: { closing: false } });
  });

beforeEach(() => {
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  mockListeners.clear();
  mockRouter.setParams.mockClear();
  const base = snapshot({ members: ["per_arjun", "per_dana"] });
  const room = {
    ...base.model.spaces[0],
    title: "Kitchen",
    roles: { per_arjun: "owner", per_dana: "member" },
    state: "open",
    locked: true,
    lines: [],
    sessions: [],
    pins: [],
  } as unknown as Space;
  const whole = { ...base, model: { ...base.model, spaces: [room] } } as Snapshot;
  mockPaired.current = { store: fakeStore(whole), snapshot: whole };
});

describe("Universe, at the bar's right (ADR 0227)", () => {
  it("stands only in a room with a project", async () => {
    Object.assign(mockParams, { id: "sp_1" });
    await render(<SpaceScreen />);
    expect(screen.queryByTestId("room-universe-button")).toBeNull();
  });

  it("opens Universe, not the room's sheet", async () => {
    Object.assign(mockParams, { id: "sp_1" });
    const current = mockPaired.current as { store: unknown; snapshot: Snapshot };
    const [room] = current.snapshot.model.spaces;
    const withProject = { ...room, project: { files: 3, changes: [] } } as unknown as Space;
    const whole = {
      ...current.snapshot,
      model: { ...current.snapshot.model, spaces: [withProject] },
    } as Snapshot;
    mockPaired.current = { store: fakeStore(whole), snapshot: whole };
    await render(<SpaceScreen />);
    expect(screen.getByTestId("universe")).toHaveTextContent("down");
    await userEvent.press(screen.getByTestId("room-universe-button"));
    expect(screen.getByTestId("universe")).toHaveTextContent("up");
    expect(screen.getByTestId("room-sheet")).toHaveTextContent("down");
  });

  // 3 November 2026: "when file becomes available / updated in universe, the button should
  // animate to get attention", and "it should keep pulsing until person taps it".
  it("calls while the project has another's change, until Universe is opened", async () => {
    Object.assign(mockParams, { id: "sp_1" });
    const current = mockPaired.current as { store: unknown; snapshot: Snapshot };
    const [room] = current.snapshot.model.spaces;
    const change = {
      commit: "b".repeat(40),
      before: null,
      by: "agt_miro",
      byKind: "agent",
      at: "2026-11-01T09:00:00.000Z",
      seq: 9,
      message: "The report",
      files: [{ path: "report.html", added: 40, removed: 0 }],
      moreFiles: 0,
    };
    const withChange = { ...room, project: { files: 1, changes: [change] } } as unknown as Space;
    const whole = {
      ...current.snapshot,
      model: { ...current.snapshot.model, spaces: [withChange] },
    } as Snapshot;
    mockPaired.current = { store: fakeStore(whole), snapshot: whole };
    await render(<SpaceScreen />);
    expect(screen.getByRole("button", { name: "Universe, updated" })).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId("room-universe-button"));
    expect(screen.getByTestId("universe")).toHaveTextContent("up");
    expect(screen.getByRole("button", { name: "Universe" })).toBeOnTheScreen();
  });
});

describe("a room's route", () => {
  it("brings the sheet up on its first page once the room has slid in, when Locked asked (ADR 0156)", async () => {
    Object.assign(mockParams, { id: "sp_1", sheet: "1" });
    await render(<SpaceScreen />);
    expect(screen.getByTestId("room-sheet")).toHaveTextContent("down");

    // Not while it slides: a modal put up mid-push comes in over a room still moving.
    await slide("transitionStart");
    expect(screen.getByTestId("room-sheet")).toHaveTextContent("down");

    await slide("transitionEnd");
    expect(screen.getByTestId("room-sheet")).toHaveTextContent("up on who");
    // And only the once: the ask is taken off the route.
    expect(mockRouter.setParams).toHaveBeenCalledWith({ sheet: undefined });
  });

  it("leaves the sheet down for a room opened without the ask", async () => {
    Object.assign(mockParams, { id: "sp_1" });
    await render(<SpaceScreen />);
    await slide("transitionStart");
    await slide("transitionEnd");
    expect(screen.getByTestId("room-sheet")).toHaveTextContent("down");
    expect(mockRouter.setParams).not.toHaveBeenCalled();
  });

  it("puts the keys away as its name brings the sheet up, so they don't jump back as it goes", async () => {
    const away = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => undefined);
    try {
      Object.assign(mockParams, { id: "sp_1" });
      await render(<SpaceScreen />);
      await userEvent.press(screen.getByTestId("room-capsule"));
      expect(away).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("room-sheet")).toHaveTextContent("up on who");
    } finally {
      away.mockRestore();
    }
  });
});
