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
import { ViewerWindow } from "./ViewerWindow";

jest.mock("expo", () => ({
  requireNativeView: jest.fn(
    () => (props: object) =>
      require("react").createElement(require("react-native").View, {
        ...props,
        testID: "native-viewer-window",
      }),
  ),
}));

jest.mock("expo-status-bar", () => ({
  StatusBar: (props: object) =>
    require("react").createElement(require("react-native").View, {
      ...props,
      testID: "expo-status-bar",
    }),
}));

afterEach(() => jest.restoreAllMocks());

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

it("is expo-status-bar's on iOS: light, and hidden with the bars", async () => {
  await render(<ViewerWindow statusBarHidden />);
  expect(screen.getByTestId("expo-status-bar").props).toMatchObject({
    style: "light",
    hidden: true,
  });
  expect(requireNativeView).not.toHaveBeenCalled();
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
