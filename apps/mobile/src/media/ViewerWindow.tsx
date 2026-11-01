/**
 * What the viewer's own window does (the media viewer proposal, §4.2's *On Android*, figure 3b):
 * the status bar over the stage, its icons light and hidden with the bars, and on Android the
 * viewer stepping aside while the app is pinned in Picture in Picture.
 *
 * **On Android both are the window's to say.** The viewer is a `Modal`, which there is a dialog
 * window over the activity's. While the dialog has focus the status bar is the one the dialog asks
 * for, and `expo-status-bar` asks the activity's, so on the emulator the bar stayed when the bars
 * went and came back out of turn. And Picture in Picture pins the whole activity, dialog and all:
 * the viewer's bars and counter were pinned over the video, and a React style cannot take them
 * away, since a pinned activity is paused and mounts nothing until it resumes (15 September 2026).
 * `ChipsViewerWindow` (`modules/viewer-window`) is a view of no size that asks the window it is
 * drawn in for both. On iOS and the web target the status bar is the app's, `expo-status-bar` sets
 * it, and Picture in Picture is a window of the system's that leaves the viewer as it is.
 *
 * A pinned window also takes the video's shape from here, given as the video's size: `expo-video`
 * works one out only for a view that is up when its video loads, and pins every other view 16:9.
 */

import type { DeckItem } from "@chipschat/core";
import { requireNativeView } from "expo";
import { StatusBar } from "expo-status-bar";
import type { ComponentType } from "react";
import { Platform, StyleSheet } from "react-native";

interface NativeProps {
  readonly statusBarHidden: boolean;
  readonly lightStatusBar: boolean;
  readonly hiddenWhilePinned: boolean;
  readonly pinnedWidth: number;
  readonly pinnedHeight: number;
  readonly pointerEvents: "none";
  readonly style: typeof styles.none;
}

let native: ComponentType<NativeProps> | undefined;

/** The Android view, asked for once and only on Android, where the module is built. */
function nativeWindow(): ComponentType<NativeProps> {
  native ??= requireNativeView<NativeProps>("ChipsViewerWindow");
  return native;
}

export function ViewerWindow({
  statusBarHidden,
  item,
}: {
  readonly statusBarHidden: boolean;
  /** What is on the stage: a video's size is the shape its pinned window takes on Android. */
  readonly item?: DeckItem | undefined;
}) {
  if (Platform.OS !== "android") {
    return <StatusBar style="light" hidden={statusBarHidden} animated />;
  }
  const Window = nativeWindow();
  const video = item?.kind === "video" ? item.attachment : undefined;
  return (
    <Window
      statusBarHidden={statusBarHidden}
      lightStatusBar
      hiddenWhilePinned
      pinnedWidth={video?.width ?? 0}
      pinnedHeight={video?.height ?? 0}
      pointerEvents="none"
      style={styles.none}
    />
  );
}

const styles = StyleSheet.create({
  none: { position: "absolute", width: 0, height: 0 },
});
