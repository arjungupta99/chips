/**
 * The film full screen on the phone (ADR 0217, FV2; its addendum of 26 October), over the fake
 * `expo-video` player `jest.setup.js` gives: the video plays at once and muted, the chapter bar
 * fills from its time, a segment goes to its part, a tap on the right goes on a part and on the
 * left back, a finger held keeps it waiting, Skip and the video's end bring the app's own end card
 * with every way in on it, and Leave goes back. Look around makes the demo and opens Spaces.
 */

import { chaptersOf, spokenOf } from "@chipschat/core";
import {
  act,
  fireEvent,
  render as renderBare,
  screen,
  userEvent,
  waitFor,
} from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import * as ExpoVideo from "expo-video";
import type { ReactElement, ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import FilmScreen from "../../app/film";
import { SOURCES } from "./FilmPlayer";
import { VIDEOS, videoNamed } from "./videos";

const mockRouter = {
  push: jest.fn(),
  navigate: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  dismissAll: jest.fn(),
  setParams: jest.fn(),
  canDismiss: jest.fn(() => false),
  canGoBack: jest.fn(() => true),
};
let mockParams: { film?: string } = {};
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));
const mockLookAround = jest.fn(async () => undefined);
let mockPaired: { readonly device: { readonly deviceId: string } } | undefined;
jest.mock("../store/provider", () => ({
  useChips: () => ({ paired: mockPaired, began: jest.fn(), demo: { lookAround: mockLookAround } }),
}));
const mockPair = jest.fn();
jest.mock("../pairing/usePairing", () => ({
  usePairing: () => ({ pair: mockPair, working: false, failure: undefined }),
}));

/** The fake player, as far as these tests drive it. */
interface FakePlayer {
  readonly playing: boolean;
  readonly muted: boolean;
  readonly loop: boolean;
  currentTime: number;
  readonly emit: (name: string, payload?: unknown) => void;
}
const video = ExpoVideo as unknown as { readonly players: FakePlayer[] };
function player(): FakePlayer {
  const made = video.players.at(-1);
  if (made === undefined) throw new Error("No player has been made.");
  return made;
}

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};
function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}
const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

const WATCH = videoNamed("watch");
if (WATCH === undefined) throw new Error("Watch Chips work has no video.");
const CHAPTERS = chaptersOf(WATCH);
const start = (index: number) => CHAPTERS[index]?.start;

/** How far a segment of the bar has filled, as a screen reader hears it. */
const filled = (index: number) =>
  screen.getByTestId(`film-chapter-${index}`).props["accessibilityValue"]?.now;

/** The video at `seconds`, as the player says. */
async function at(seconds: number) {
  await act(() => player().emit("timeUpdate", { currentTime: seconds, bufferedPosition: 0 }));
}

/**
 * The film as wide as an iPhone, and a tap on it `x` points from its left: as the phone says it,
 * or as a browser's click does, which is what React Native hands a press on the web.
 */
async function tap(x: number, said: "locationX" | "offsetX" = "locationX") {
  await act(async () =>
    fireEvent(screen.getByTestId("film-face"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 852 } },
    }),
  );
  await act(async () =>
    fireEvent.press(screen.getByTestId("film-taps"), {
      // The testing library's own press says `locationX: 0`; a browser's says no `locationX` at all.
      nativeEvent: said === "offsetX" ? { locationX: undefined, offsetX: x } : { locationX: x },
    }),
  );
}
const RIGHT = 300;
const LEFT = 60;

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockPaired = undefined;
});

it("has a video for every film rendered", () => {
  expect(Object.keys(SOURCES).sort()).toEqual(VIDEOS.map((each) => each.key).sort());
});

it("plays the film at once, muted, and fills the bar from the video's time", async () => {
  await render(<FilmScreen />);
  expect(player()).toMatchObject({ playing: true, muted: true, loop: false });
  expect(screen.getAllByTestId(/^film-chapter-/)).toHaveLength(CHAPTERS.length);

  // Halfway through Spaces, the third part.
  const spaces = CHAPTERS[2];
  if (spaces === undefined) throw new Error("No third part.");
  await at((spaces.start + spaces.end) / 2);
  expect([0, 1, 2, 3].map(filled)).toEqual([100, 100, 50, 0]);
  // VoiceOver hears the words the picture shows, and which part of how many.
  const film = screen.getByTestId("film-taps");
  expect(film.props["accessibilityLabel"]).toBe(spokenOf(spaces));
  expect(film.props["accessibilityValue"]).toEqual({ text: `Part 3 of ${CHAPTERS.length}` });
});

it("goes to a part from its segment", async () => {
  const user = userEvent.setup();
  await render(<FilmScreen />);
  await user.press(screen.getByTestId("film-chapter-4"));
  expect(player().currentTime).toBe(start(4));
  expect(player().playing).toBe(true);
  expect(filled(3)).toBe(100);
  expect(filled(4)).toBe(0);
});

it("goes on a part from a tap on the film's right, and from the last to the end card", async () => {
  await render(<FilmScreen />);
  await at(3);
  await tap(RIGHT);
  expect(player().currentTime).toBe(start(1));
  expect(screen.getByTestId("film-flash-right-next")).toBeOnTheScreen();

  await at((start(CHAPTERS.length - 1) ?? 0) + 1);
  await tap(RIGHT);
  expect(screen.getByTestId("demo-end")).toBeOnTheScreen();
  expect(player().playing).toBe(false);
});

it("goes back to a part's start from a tap on its left, and to the part before soon after", async () => {
  await render(<FilmScreen />);
  const spaces = start(2) ?? 0;
  await at(spaces + 4);
  await tap(LEFT);
  expect(player().currentTime).toBe(spaces);
  expect(screen.getByTestId("film-flash-left-again")).toBeOnTheScreen();

  // A second tap while the part has only just begun: the part before.
  await tap(LEFT);
  expect(player().currentTime).toBe(start(1));
  expect(screen.getByTestId("film-flash-left-previous")).toBeOnTheScreen();
});

it("reads where a click landed on the web, where a press says it as a browser's click does", async () => {
  await render(<FilmScreen />);
  const spaces = start(2) ?? 0;
  await at(spaces + 4);
  await tap(LEFT, "offsetX");
  expect(player().currentTime).toBe(spaces);
  await tap(RIGHT, "offsetX");
  expect(player().currentTime).toBe(start(3));
});

it("waits while a finger is held on the film, and plays on when it lifts", async () => {
  await render(<FilmScreen />);
  await at(3);
  const film = screen.getByTestId("film-taps");
  await act(async () => fireEvent(film, "longPress"));
  expect(player().playing).toBe(false);
  await act(async () => fireEvent(film, "pressOut"));
  expect(player().playing).toBe(true);
  // Held and lifted is not a tap: the film is where it was.
  expect(player().currentTime).toBe(0);
});

it("moves on VoiceOver's swipes, and pauses on its double-tap", async () => {
  await render(<FilmScreen />);
  await at(start(2) ?? 0);
  const film = screen.getByTestId("film-taps");
  await act(async () =>
    fireEvent(film, "accessibilityAction", { nativeEvent: { actionName: "increment" } }),
  );
  expect(player().currentTime).toBe(start(3));
  await at((start(3) ?? 0) + 5);
  await act(async () =>
    fireEvent(film, "accessibilityAction", { nativeEvent: { actionName: "decrement" } }),
  );
  expect(player().currentTime).toBe(start(3));
  await act(async () =>
    fireEvent(film, "accessibilityAction", { nativeEvent: { actionName: "activate" } }),
  );
  expect(player().playing).toBe(false);
  expect(screen.getByTestId("film-paused")).toBeOnTheScreen();
});

it("goes straight to the end card from Skip", async () => {
  const user = userEvent.setup();
  await render(<FilmScreen />);
  await at(3);
  await user.press(screen.getByRole("button", { name: "Skip" }));
  expect(screen.getByRole("header", { name: "That's Chips" })).toBeOnTheScreen();
  expect(player().playing).toBe(false);
  expect(CHAPTERS.map((_, index) => filled(index))).toEqual(CHAPTERS.map(() => 100));
  // No Skip on the end card.
  expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
});

it("goes back on Leave", async () => {
  const user = userEvent.setup();
  await render(<FilmScreen />);
  await user.press(screen.getByTestId("film-leave"));
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
});

it("ends on the app's own end card, with More walkthroughs, and Watch again plays it from the start", async () => {
  const user = userEvent.setup();
  await render(<FilmScreen />);
  expect(screen.queryByTestId("demo-end")).toBeNull();

  await act(() => player().emit("playToEnd"));
  expect(screen.getByTestId("demo-end")).toBeOnTheScreen();
  expect(screen.getByRole("header", { name: "That's Chips" })).toBeOnTheScreen();
  expect(screen.getByText("More walkthroughs")).toBeOnTheScreen();
  // The other films, each by its length as a video player shows one.
  expect(screen.getByRole("button", { name: "Your agents, up close, 0:47" })).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Costs and trouble, 0:38" })).toBeOnTheScreen();
  await user.press(screen.getByTestId("demo-film-agents"));
  expect(mockRouter.setParams).toHaveBeenCalledWith({ film: "agents" });
  // A tap on the film does nothing once it has ended.
  await tap(RIGHT);
  expect(screen.getByTestId("demo-end")).toBeOnTheScreen();

  await user.press(screen.getByRole("button", { name: "Watch again" }));
  expect(player().currentTime).toBe(0);
  expect(screen.queryByTestId("demo-end")).toBeNull();
  expect(filled(0)).toBe(0);
});

it("plays the short film the address names, a segment a part, and its own end card", async () => {
  mockParams = { film: "trouble" };
  const trouble = videoNamed("trouble");
  if (trouble === undefined) throw new Error("Costs and trouble has no video.");
  await render(<FilmScreen />);
  expect(screen.getAllByTestId(/^film-chapter-/)).toHaveLength(chaptersOf(trouble).length);
  await act(() => player().emit("playToEnd"));
  expect(screen.getByRole("header", { name: "That's costs and trouble" })).toBeOnTheScreen();
  expect(screen.getByTestId("demo-film-watch")).toBeOnTheScreen();
  expect(screen.getByTestId("demo-film-agents")).toBeOnTheScreen();
});

it("opens the camera over the film from the end card's Scan a QR code, and closes it", async () => {
  const user = userEvent.setup();
  await render(<FilmScreen />);
  await act(() => player().emit("playToEnd"));
  expect(screen.queryByTestId("scan-sheet")).toBeNull();
  await user.press(screen.getByRole("button", { name: "Scan a QR code" }));
  expect(screen.getByTestId("scan-sheet")).toBeOnTheScreen();
  expect(screen.getByRole("header", { name: "Scan a QR code" })).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByTestId("scan-sheet")).toBeNull();
});

it("opens the pairing code page from Have a pairing code?", async () => {
  const user = userEvent.setup();
  await render(<FilmScreen />);
  await act(() => player().emit("playToEnd"));
  await user.press(screen.getByRole("button", { name: "Type a pairing code" }));
  expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: "/pair", params: { code: "1" } });
});

it("opens the page that hands the setup page to a computer from Nothing set up yet? (ADR 0290)", async () => {
  const user = userEvent.setup();
  await render(<FilmScreen />);
  await act(() => player().emit("playToEnd"));
  await user.press(screen.getByRole("button", { name: "Nothing set up yet? Start" }));
  expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: "/pair", params: { setup: "1" } });
});

it("pastes an invite from the end card", async () => {
  jest
    .mocked(Clipboard.getStringAsync)
    .mockResolvedValueOnce(`https://host.example/#invite=chips_inv_5&key=${"k".repeat(43)}`);
  const user = userEvent.setup();
  await render(<FilmScreen />);
  await act(() => player().emit("playToEnd"));
  await user.press(screen.getByRole("button", { name: "Paste an invite link" }));
  await waitFor(() =>
    expect(mockRouter.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/join" })),
  );
});

it("makes the demo for Look around and opens its Spaces in place of the first screen", async () => {
  const user = userEvent.setup();
  await render(<FilmScreen />);
  await act(() => player().emit("playToEnd"));
  await user.press(screen.getByRole("button", { name: "Look around" }));
  expect(mockLookAround).toHaveBeenCalledWith();
  expect(mockRouter.replace).toHaveBeenCalledWith("/");
});

it("opens Spaces over the workspace there was, for Look around", async () => {
  mockPaired = { device: { deviceId: "dev_home" } };
  mockRouter.canDismiss.mockReturnValue(true);
  const user = userEvent.setup();
  await render(<FilmScreen />);
  await act(() => player().emit("playToEnd"));
  await user.press(screen.getByRole("button", { name: "Look around" }));
  expect(mockRouter.dismissAll).toHaveBeenCalled();
  expect(mockRouter.navigate).toHaveBeenCalledWith("/");
  expect(mockRouter.replace).not.toHaveBeenCalled();
  mockRouter.canDismiss.mockReturnValue(false);
});
