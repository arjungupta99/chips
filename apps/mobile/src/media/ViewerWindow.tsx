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
 *
 * **On iOS the bar goes only where going moves nothing** (`hidesInPlace`). On an iPhone with a
 * sensor housing the bar is drawn in the housing's band, and the window's top inset is the
 * housing's whether the bar is there or not. On an iPad, or an iPhone with a Home button, the top
 * inset is the bar itself: taken away with the bars, the inset went from 24 to 0, every screen
 * under the viewer rose by it, the list beside a page and the page both, and came back down as the
 * viewer left. A drag to dismiss takes the bars away as it starts, so that rise and fall were
 * watched through the clearing backdrop on every swipe home (Arjun's iPad, 6 November 2026). There
 * the bar stays, light over the stage.
 *
 * **Leaving, the bar is the app's again**, in the app's ink, crossfaded as the backdrop clears.
 * Light until the viewer was gone, it stood white over a light room for the flight home and
 * turned dark in one frame as the modal went.
 */

import type { DeckItem } from "@chipschat/core";
import { requireNativeView } from "expo";
import { StatusBar } from "expo-status-bar";
import type { ComponentType } from "react";
import { Platform, StyleSheet } from "react-native";
import type { EdgeInsets } from "react-native-safe-area-context";
import { isPad } from "../device/word";
import { statusInk, useScheme } from "../ui/theme";
import { useWindowInsets } from "../ui/windowInsets";

/**
 * How far a sensor housing reaches into the window, at the least: 44 points on the first iPhone
 * with one, more on later ones; on its side the housing is at the left or the right. A status bar
 * alone is 20 points, 24 on an iPad, and the iPhone Duo stands its bars 24 down (`useDuo`).
 */
const HOUSING = 44;

/** Whether the status bar can go without the window's insets changing: a housing holds its band. */
export function hidesInPlace(pad: boolean, insets: Pick<EdgeInsets, "top" | "left" | "right">) {
  return !pad && Math.max(insets.top, insets.left, insets.right) >= HOUSING;
}

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
  leaving = false,
  item,
}: {
  readonly statusBarHidden: boolean;
  /** The viewer is on its way out, from the moment it starts to go. */
  readonly leaving?: boolean;
  /** What is on the stage: a video's size is the shape its pinned window takes on Android. */
  readonly item?: DeckItem | undefined;
}) {
  if (Platform.OS !== "android") {
    return <SystemBar hidden={statusBarHidden} leaving={leaving} />;
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

/** iOS's status bar, the app's own: hidden with the bars only where that moves nothing. */
function SystemBar({ hidden, leaving }: { readonly hidden: boolean; readonly leaving: boolean }) {
  const scheme = useScheme();
  const inPlace = hidesInPlace(isPad(), useWindowInsets());
  return (
    <StatusBar style={leaving ? statusInk(scheme) : "light"} hidden={hidden && inPlace} animated />
  );
}

const styles = StyleSheet.create({
  none: { position: "absolute", width: 0, height: 0 },
});
