/**
 * What is open beside a tab's list, kept by the tabs (ADR 0177). What is worth proving: that a
 * param asking for a room is shown from the render it arrives in and never shows what was open
 * before; that it is taken off the route once kept; that what is open outlives the tab being
 * jumped away from and back to, which gives the tab's route its first params again; and that an
 * ask for what was open once before is still an ask.
 */

import { act, render, screen, userEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { type Opened, OpenedProvider, useOpened } from "./opened";

/** The tab's route: what its search params say, and a router that changes them, as Expo's does. */
type Route = { readonly space?: string | undefined; readonly agent?: string | undefined };
let mockRoute: Route = {};
const mockListeners = new Set<() => void>();
function mockGo(next: Route) {
  mockRoute = next;
  for (const listener of mockListeners) listener();
}
const mockRouter = {
  setParams: (given: Route) => mockGo({ ...mockRoute, ...given }),
};

jest.mock("expo-router", () => {
  const react = require("react");
  const subscribe = (listener: () => void) => {
    mockListeners.add(listener);
    return () => mockListeners.delete(listener);
  };
  return {
    useLocalSearchParams: () => react.useSyncExternalStore(subscribe, () => mockRoute),
    useRouter: () => mockRouter,
  };
});

const KEYS = ["space", "agent"] as const;

/** A tab that says what is open beside its list, and opens another space when pressed. */
function Tab({ seen }: { readonly seen: Opened[] }) {
  const [opened, go] = useOpened("spaces", KEYS);
  const { space } = opened;
  seen.push(opened);
  return <Text onPress={() => go({ space: "sp_b" })}>{space ?? "nothing open"}</Text>;
}

describe("what is open beside a tab's list", () => {
  beforeEach(() => {
    mockRoute = {};
  });

  it("opens what a param asks from its first render, keeps it, and takes the param off", async () => {
    mockRoute = { space: "sp_a" };
    const seen: Opened[] = [];
    await render(
      <OpenedProvider>
        <Tab seen={seen} />
      </OpenedProvider>,
    );
    expect(screen.getByText("sp_a")).toBeTruthy();
    expect(mockRoute).toEqual({ space: undefined, agent: undefined });
    // Not a frame of nothing open, and not a frame of what was open before.
    expect(seen.map(({ space }) => space)).toEqual(seen.map(() => "sp_a"));
  });

  it("is still open when the tab is come back to with none of its params", async () => {
    mockRoute = { space: "sp_a" };
    const tab = (shown: boolean) => (
      <OpenedProvider>{shown ? <Tab seen={[]} /> : null}</OpenedProvider>
    );
    const { rerender } = await render(tab(true));
    await act(async () => {
      rerender(tab(false));
    });
    // A tab jumped to is given its first params again: none.
    mockRoute = {};
    await act(async () => {
      rerender(tab(true));
    });
    expect(screen.getByText("sp_a")).toBeTruthy();
  });

  it("opens what a param asks again after something else was opened in the pane", async () => {
    mockRoute = { space: "sp_a" };
    await render(
      <OpenedProvider>
        <Tab seen={[]} />
      </OpenedProvider>,
    );
    await userEvent.press(screen.getByText("sp_a"));
    expect(screen.getByText("sp_b")).toBeTruthy();
    await act(async () => mockGo({ space: "sp_a" }));
    expect(screen.getByText("sp_a")).toBeTruthy();
    expect(mockRoute.space).toBeUndefined();
  });

  it("keeps what is open in the tab itself outside the tabs, as in a test", async () => {
    mockRoute = { space: "sp_a" };
    await render(<Tab seen={[]} />);
    expect(screen.getByText("sp_a")).toBeTruthy();
    expect(mockRoute.space).toBeUndefined();
    await userEvent.press(screen.getByText("sp_a"));
    expect(screen.getByText("sp_b")).toBeTruthy();
  });
});
