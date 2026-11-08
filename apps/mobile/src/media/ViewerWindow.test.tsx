/**
 * The viewer's own window: `expo-status-bar` on iOS, and on Android the view of no size that asks
 * the window it is drawn in (`modules/viewer-window`), since the viewer's modal is a window of its
 * own there. Neither platform's window can be asked from Node; the emulator's walk is where the bar
 * was seen to hide with the bars, and the pinned window to hold the video alone (the media viewer,
 * Phase 3).
 */

import type { DeckItem } from "@chipschat/core";
import { render, screen } from "@testing-library/react-native";
import { requireNativeView } from "expo";
import { Platform } from "react-native";
import { type Metrics, SafeAreaProvider } from "react-native-safe-area-context";
import { isPad } from "../device/word";
import { hidesInPlace, ViewerWindow } from "./ViewerWindow";

jest.mock("expo", () => ({
  ...jest.requireActual("expo"),
  requireNativeView: jest.fn(
    () => (props: object) =>
      require("react").createElement(require("react-native").View, {
        ...props,
        testID: "native-viewer-window",
      }),
  ),
}));

// Jest's iOS has no `Platform.isPad` to replace.
jest.mock("../device/word", () => ({ isPad: jest.fn(() => false) }));

jest.mock("expo-status-bar", () => ({
  StatusBar: (props: object) =>
    require("react").createElement(require("react-native").View, {
      ...props,
      testID: "expo-status-bar",
    }),
}));

afterEach(() => {
  jest.restoreAllMocks();
  jest.mocked(isPad).mockReturnValue(false);
});

const CLIP: DeckItem = {
  lineId: "ln_clip",
  attachment: {
    id: "att_clip",
    filename: "IMG_4421.MOV",
    mimeType: "video/quicktime",
    byteSize: 5_342_021,
    width: 720,
    height: 1280,
    durationMs: 20_000,
  },
  kind: "video",
  saidBy: "har_scout",
  ts: "2026-09-15T03:42:16.000Z",
  inMessage: { index: 1, of: 1 },
};

/** An iPhone 17 upright: the housing's band is the window's top, with the bar or without it. */
const IPHONE: Metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 62, left: 0, right: 0, bottom: 34 },
};
/** A 13-inch iPad upright: the window's top is the bar itself. */
const IPAD: Metrics = {
  frame: { x: 0, y: 0, width: 1032, height: 1376 },
  insets: { top: 24, left: 0, right: 0, bottom: 20 },
};

function inWindow(metrics: Metrics, props: Parameters<typeof ViewerWindow>[0]) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <ViewerWindow {...props} />
    </SafeAreaProvider>
  );
}

it("is expo-status-bar's on iOS: light, and hidden with the bars on an iPhone with a housing", async () => {
  await render(inWindow(IPHONE, { statusBarHidden: true }));
  expect(screen.getByTestId("expo-status-bar").props).toMatchObject({
    style: "light",
    hidden: true,
  });
  expect(requireNativeView).not.toHaveBeenCalled();
});

it("stays on an iPad as the bars go, since its going would move every screen under the viewer", async () => {
  jest.mocked(isPad).mockReturnValue(true);
  await render(inWindow(IPAD, { statusBarHidden: true }));
  expect(screen.getByTestId("expo-status-bar").props).toMatchObject({
    style: "light",
    hidden: false,
  });
});

it("is the app's again as the viewer leaves, in the app's ink", async () => {
  await render(inWindow(IPHONE, { statusBarHidden: false, leaving: true }));
  // The test's scheme is light, so the app's words are dark.
  expect(screen.getByTestId("expo-status-bar").props).toMatchObject({
    style: "dark",
    hidden: false,
  });
});

it("goes only where a housing holds its band, upright or on its side", () => {
  expect(hidesInPlace(false, { top: 62, left: 0, right: 0 })).toBe(true);
  expect(hidesInPlace(false, { top: 44, left: 0, right: 0 })).toBe(true);
  // On its side the housing is at a side, and the system has the bar away already.
  expect(hidesInPlace(false, { top: 0, left: 62, right: 62 })).toBe(true);
  // A Home button's iPhone: the bar is the window's top.
  expect(hidesInPlace(false, { top: 20, left: 0, right: 0 })).toBe(false);
  // The iPhone Duo stands its bars 24 down.
  expect(hidesInPlace(false, { top: 24, left: 0, right: 0 })).toBe(false);
  expect(hidesInPlace(true, { top: 24, left: 0, right: 0 })).toBe(false);
  // An iPad never, whatever its window says.
  expect(hidesInPlace(true, { top: 62, left: 0, right: 0 })).toBe(false);
});

it("is the viewer window's own on Android: light icons, hidden with the bars, gone while pinned, the video's shape", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  await render(<ViewerWindow statusBarHidden item={CLIP} />);
  expect(screen.getByTestId("native-viewer-window").props).toMatchObject({
    statusBarHidden: true,
    lightStatusBar: true,
    hiddenWhilePinned: true,
    pinnedWidth: 720,
    pinnedHeight: 1280,
    pointerEvents: "none",
  });
  expect(screen.queryByTestId("expo-status-bar")).toBeNull();
  // A photo on the stage: no shape to give.
  await screen.rerender(<ViewerWindow statusBarHidden={false} item={{ ...CLIP, kind: "photo" }} />);
  expect(screen.getByTestId("native-viewer-window").props).toMatchObject({
    statusBarHidden: false,
    pinnedWidth: 0,
    pinnedHeight: 0,
  });
  // Asked for once, by the name the module gives it.
  expect(requireNativeView).toHaveBeenCalledTimes(1);
  expect(requireNativeView).toHaveBeenCalledWith("ChipsViewerWindow");
});
