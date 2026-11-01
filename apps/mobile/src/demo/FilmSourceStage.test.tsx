/**
 * The film in the render mode (ADR 0217), over a player that says what a test tells it to: the
 * lock screen's own Approve, the film played as it is up, and each chapter opened where it opens,
 * once, with the app's own routes. Nothing else in the app is moved by the film.
 */

import { type DemoPlayer, type DemoState, filmOf } from "@chipschat/core";
import { act, render as renderBare, screen, userEvent } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Filmed } from "./FilmSourceStage";

const mockRouter = {
  push: jest.fn(),
  navigate: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  dismissAll: jest.fn(),
  canDismiss: jest.fn(() => false),
  canGoBack: jest.fn(() => false),
};
let mockPathname = "/";
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPathname,
}));

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};
function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}
const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

const FILM = filmOf("watch");
const ROOM = "spc_01KDEM00000000000000000001";

interface FakePlayer extends DemoPlayer {
  /** What the player says from now. */
  readonly tell: (next: Partial<DemoState>) => void;
  readonly calls: string[];
}

/** A player that says what it is told, and keeps what it was asked to do. */
function fakePlayer(first: Partial<DemoState> = {}): FakePlayer {
  let state: DemoState = {
    film: FILM.key,
    chapter: 0,
    screen: "spaces",
    playing: true,
    ended: false,
    ...first,
  };
  const listeners = new Set<(state: DemoState) => void>();
  const calls: string[] = [];
  return {
    calls,
    tell: (next) => {
      state = { ...state, ...next };
      for (const listener of listeners) listener(state);
    },
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    play: () => calls.push("play"),
    close: () => undefined,
  };
}

const store = { resolveApproval: jest.fn() };

function App() {
  return (
    <View testID="the-app">
      <Text>The app</Text>
    </View>
  );
}

afterEach(() => {
  for (const each of Object.values(mockRouter)) each.mockClear();
  mockRouter.canDismiss.mockImplementation(() => false);
  mockRouter.canGoBack.mockImplementation(() => false);
  mockPathname = "/";
  store.resolveApproval.mockClear();
});

describe("what the film draws over the app", () => {
  const LOCK = {
    who: "Milo",
    room: "Birthday dinner",
    question: "Send Theo's invite card to the 11 people in Family?",
    spaceId: ROOM,
    runId: "run_2",
    approvalId: "apv_2",
    answered: false,
  };

  it("draws the lock screen with the question, whose own Approve answers through the store", async () => {
    const player = fakePlayer({ chapter: 7, screen: "lock", spaceId: ROOM, lockScreen: LOCK });
    await render(
      <Filmed player={player} store={store}>
        <App />
      </Filmed>,
    );
    expect(screen.getByTestId("demo-lock")).toBeOnTheScreen();
    expect(screen.getByText("Milo · Birthday dinner")).toBeOnTheScreen();
    expect(screen.getByText(LOCK.question)).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId("demo-lock-approve"));
    expect(store.resolveApproval).toHaveBeenCalledWith({
      spaceId: ROOM,
      runId: "run_2",
      approvalId: "apv_2",
      decision: "approved",
      scope: "once",
    });
    await act(async () => player.tell({ lockScreen: { ...LOCK, answered: true } }));
    expect(screen.getByTestId("demo-lock-answered")).toBeOnTheScreen();
    expect(screen.queryByTestId("demo-lock-approve")).toBeNull();
  });
});

describe("where each chapter opens", () => {
  it("plays the film once it is up", async () => {
    const player = fakePlayer();
    await render(
      <Filmed player={player} store={store}>
        <App />
      </Filmed>,
    );
    expect(player.calls).toEqual(["play"]);
  });

  it("opens each chapter's place once, with the app's own routes", async () => {
    const player = fakePlayer();
    await render(
      <Filmed player={player} store={store}>
        <App />
      </Filmed>,
    );
    // Spaces is where the app already is.
    expect(mockRouter.navigate).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();

    await act(async () => player.tell({ chapter: 1, screen: "room", spaceId: ROOM }));
    expect(mockRouter.push).toHaveBeenCalledWith(`/spaces/${ROOM}`);

    // The person's taps take the app on from there, and the film leaves it where they took it.
    mockPathname = "/agents/agt_1";
    await act(async () => player.tell({ lockScreen: undefined }));
    expect(mockRouter.push).toHaveBeenCalledTimes(1);

    mockRouter.canDismiss.mockImplementation(() => true);
    await act(async () => player.tell({ chapter: 8, screen: "agents", spaceId: undefined }));
    expect(mockRouter.dismissAll).toHaveBeenCalled();
    expect(mockRouter.navigate).toHaveBeenCalledWith("/agents");
  });

  it("opens the lock screen's chapter on the room it is drawn over", async () => {
    const player = fakePlayer({ chapter: 7, screen: "lock", spaceId: ROOM });
    await render(
      <Filmed player={player} store={store}>
        <App />
      </Filmed>,
    );
    expect(mockRouter.push).toHaveBeenCalledWith(`/spaces/${ROOM}`);
  });

  it("opens nothing once the film has played, where the demo is the person's", async () => {
    const player = fakePlayer({ chapter: 8, screen: "agents", ended: true, playing: false });
    await render(
      <Filmed player={player} store={store}>
        <App />
      </Filmed>,
    );
    expect(mockRouter.navigate).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});
