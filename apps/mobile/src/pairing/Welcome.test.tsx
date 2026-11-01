/**
 * The first screen (ADR 0213, point 9; ADR 0217's addendum of 26 October): the Chips mark, then
 * Watch Chips work playing in a frame, with Scan a QR code and Skip at the foot. Skip, or the film's
 * end, brings That's Chips into the film's place, with every way in on it: Scan a QR code, Have an
 * invite link?, Have a pairing code?, More walkthroughs, Look around and Watch again. The camera
 * opens over the page and reads invites and pairing codes alike. The pairing code page types one.
 * Chips found on this Wi-Fi comes up from the foot only once it is found.
 */

import {
  act,
  render as renderBare,
  screen,
  userEvent,
  waitFor,
} from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import * as ExpoVideo from "expo-video";
import type { ReactElement, ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import PairScreen from "../../app/pair";
import { canFind, findServers } from "./finder";

const mockRouter = {
  replace: jest.fn(),
  push: jest.fn(),
  back: jest.fn(),
  navigate: jest.fn(),
  dismissAll: jest.fn(),
  canGoBack: jest.fn(() => true),
  canDismiss: jest.fn(() => false),
};
let mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));
/** What the camera shows, once allowed: a test reads a code into it with `read`. */
const mockCamera: { granted: boolean; read: ((data: string) => void) | undefined } = {
  granted: false,
  read: undefined,
};
jest.mock("expo-camera", () => ({
  CameraView: (props: { onBarcodeScanned: (code: { data: string }) => void }) => {
    mockCamera.read = (data) => props.onBarcodeScanned({ data });
    return null;
  },
  useCameraPermissions: () => [{ granted: mockCamera.granted, canAskAgain: true }, jest.fn()],
}));
const mockLookAround = jest.fn(async () => undefined);
jest.mock("../store/provider", () => ({
  useChips: () => ({ began: jest.fn(), paired: undefined, demo: { lookAround: mockLookAround } }),
}));
const mockPair = jest.fn();
jest.mock("./usePairing", () => ({
  usePairing: () => ({ pair: mockPair, working: false, failure: undefined }),
  phoneName: () => "iPhone 17 Pro",
}));
jest.mock("./finder", () => ({ canFind: jest.fn(() => false), findServers: jest.fn() }));
jest.mock("../device/storage", () => ({ deviceStorage: {} }));

/** The fake player of the film playing, newest last (`jest.setup.js`). */
interface FakePlayer {
  readonly playing: boolean;
  currentTime: number;
  readonly emit: (name: string, payload?: unknown) => void;
}
const player = () => {
  const made = (ExpoVideo as unknown as { readonly players: FakePlayer[] }).players.at(-1);
  if (made === undefined) throw new Error("No player has been made.");
  return made;
};

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};
function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}
const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

const MINI = { name: "Arjun's Mac mini", url: "http://192.168.1.20:4431", workspaceId: "ws_1" };
const INVITE = `https://host.example/#invite=chips_inv_5&key=${"k".repeat(43)}`;

afterEach(() => {
  mockParams = {};
  mockCamera.granted = false;
  mockCamera.read = undefined;
  jest.clearAllMocks();
  jest.mocked(canFind).mockReturnValue(false);
  jest.mocked(findServers).mockReset();
});

/** That's Chips, from Skip. */
async function skip() {
  await userEvent.press(screen.getByRole("button", { name: "Skip" }));
}

describe("the first screen", () => {
  it("opens on the mark and Watch Chips work playing, with Scan a QR code and Skip at the foot", async () => {
    await render(<PairScreen />);
    expect(screen.getByRole("header", { name: "Chips" })).toBeOnTheScreen();
    expect(screen.getByText(/^Watch Chips work/)).toBeOnTheScreen();
    expect(screen.getByText(/1:14/)).toBeOnTheScreen();
    expect(screen.getByTestId("welcome-film")).toBeOnTheScreen();
    expect(player().playing).toBe(true);
    expect(screen.getByRole("button", { name: "Scan a QR code" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Skip" })).toBeOnTheScreen();
    // The loop of a space at work, and the line over the old ways on, are gone.
    expect(screen.queryByText("Chat with your AI agents")).toBeNull();
    expect(screen.queryByTestId("demo-end")).toBeNull();
  });

  it("puts That's Chips in the film's place from Skip, with every way in on it", async () => {
    await render(<PairScreen />);
    await skip();
    expect(screen.getByRole("header", { name: "That's Chips" })).toBeOnTheScreen();
    expect(player().playing).toBe(false);
    expect(screen.getByTestId("demo-scan")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Paste an invite link" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Type a pairing code" })).toBeOnTheScreen();
    expect(screen.getByText("More walkthroughs")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Look around" })).toBeOnTheScreen();
    // The foot empties: That's Chips has Scan a QR code itself, and nothing is left to skip.
    expect(screen.queryByTestId("welcome-scan")).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
  });

  it("puts That's Chips in the film's place when the film ends, and Watch again plays it", async () => {
    await render(<PairScreen />);
    await act(() => player().emit("playToEnd"));
    expect(screen.getByRole("header", { name: "That's Chips" })).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Watch again" }));
    expect(screen.queryByTestId("demo-end")).toBeNull();
    expect(player().currentTime).toBe(0);
    expect(player().playing).toBe(true);
  });

  it("plays another film in the frame from More walkthroughs", async () => {
    await render(<PairScreen />);
    await skip();
    await userEvent.press(screen.getByRole("button", { name: "Your agents, up close, 0:47" }));
    expect(screen.getByText(/^Your agents, up close/)).toBeOnTheScreen();
    expect(screen.queryByTestId("demo-end")).toBeNull();
    expect(player().playing).toBe(true);
  });

  it("opens on That's Chips when asked to, as the demo's Set up my own Chips asks", async () => {
    mockParams = { ways: "1" };
    await render(<PairScreen />);
    expect(screen.getByRole("header", { name: "That's Chips" })).toBeOnTheScreen();
    expect(player().playing).toBe(false);
  });

  it("opens the camera over the page from Scan a QR code, with the film waiting under it", async () => {
    await render(<PairScreen />);
    await userEvent.press(screen.getByRole("button", { name: "Scan a QR code" }));
    expect(screen.getByTestId("scan-sheet")).toBeOnTheScreen();
    expect(screen.getByText("Point the camera at the code.")).toBeOnTheScreen();
    expect(player().playing).toBe(false);

    await userEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("scan-sheet")).toBeNull();
    expect(player().playing).toBe(true);
  });

  it("pairs with a scanned pairing code, and opens a scanned invite's card", async () => {
    mockCamera.granted = true;
    await render(<PairScreen />);
    await skip();
    await userEvent.press(screen.getByTestId("demo-scan"));
    const pairing = "http://192.168.1.20:4431/#pair=ABC-234";
    await act(async () => mockCamera.read?.(pairing));
    expect(mockPair).toHaveBeenCalledWith(pairing);

    await act(async () => mockCamera.read?.(INVITE));
    expect(mockRouter.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/join" }));
    // The invite's card opens over the page, not under the camera.
    expect(screen.queryByTestId("scan-sheet")).toBeNull();
  });

  it("pastes an invite from That's Chips", async () => {
    jest.mocked(Clipboard.getStringAsync).mockResolvedValueOnce(INVITE);
    await render(<PairScreen />);
    await skip();
    await userEvent.press(screen.getByRole("button", { name: "Paste an invite link" }));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/join" })),
    );
  });

  it("opens the pairing code page from Have a pairing code?, and from the camera", async () => {
    await render(<PairScreen />);
    await skip();
    await userEvent.press(screen.getByRole("button", { name: "Type a pairing code" }));
    const page = { pathname: "/pair", params: { code: "1" } };
    expect(mockRouter.push).toHaveBeenLastCalledWith(page);

    await userEvent.press(screen.getByTestId("demo-scan"));
    await userEvent.press(screen.getByRole("button", { name: "Type a pairing code instead" }));
    expect(screen.queryByTestId("scan-sheet")).toBeNull();
    expect(mockRouter.push).toHaveBeenLastCalledWith(page);
  });

  it("types a pairing code and its address on the pairing code page, and goes back", async () => {
    mockParams = { code: "1" };
    await render(<PairScreen />);
    expect(screen.getByRole("header", { name: "Pair this phone" })).toBeOnTheScreen();
    expect(screen.getByText("You → Devices → Pair another device")).toBeOnTheScreen();
    await userEvent.type(screen.getByLabelText("Pairing code"), "ABC-234");
    await userEvent.type(screen.getByLabelText("Server address"), "http://192.168.1.20:4431");
    await userEvent.press(screen.getByRole("button", { name: "Pair" }));
    expect(mockPair).toHaveBeenCalledWith("ABC-234", "http://192.168.1.20:4431");
    expect(screen.queryByTestId("welcome-film")).toBeNull();

    await userEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it("opens on the pairing code page for a pairing link that did not work", async () => {
    mockParams = { problem: "That code has expired." };
    mockRouter.canGoBack.mockReturnValueOnce(false);
    await render(<PairScreen />);
    expect(screen.getByLabelText("Pairing code")).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(mockRouter.replace).toHaveBeenCalledWith("/pair");
  });

  it("makes the demo for Look around and opens its Spaces", async () => {
    await render(<PairScreen />);
    await skip();
    await userEvent.press(screen.getByRole("button", { name: "Look around" }));
    expect(mockLookAround).toHaveBeenCalledWith();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/"));
  });

  it("brings Chips on this Wi-Fi up from the foot once one answers, and nothing before", async () => {
    jest.mocked(canFind).mockReturnValue(true);
    let answer: (servers: (typeof MINI)[]) => void = () => undefined;
    jest.mocked(findServers).mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    await render(<PairScreen />);
    // Looking: nothing at the foot, not even the looking.
    expect(screen.queryByTestId("on-this-wifi")).toBeNull();
    expect(screen.queryByText("Looking on this Wi-Fi…")).toBeNull();

    await act(async () => answer([MINI]));
    expect(screen.getByTestId("on-this-wifi")).toBeOnTheScreen();
    expect(screen.getByText("Arjun's Mac mini")).toBeOnTheScreen();
    expect(screen.queryByText("On this Wi-Fi")).toBeNull();
  });

  it("brings nothing up when nothing answers", async () => {
    jest.mocked(canFind).mockReturnValue(true);
    jest.mocked(findServers).mockResolvedValue([]);
    await render(<PairScreen />);
    await act(async () => undefined);
    expect(screen.queryByTestId("on-this-wifi")).toBeNull();
    expect(screen.queryByText(/Nothing here yet/)).toBeNull();
  });
});
