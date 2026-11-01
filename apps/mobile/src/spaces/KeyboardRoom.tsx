/**
 * The room's frame: the screen, holding clear at its foot whatever the keyboard covers.
 *
 * This was the keyboard controller's `KeyboardAvoidingView` until 20 September 2026. Padding on
 * both platforms, not padding on iOS and the window's own resize on Android: making the two
 * behave the same is what the controller is for, and a room that avoids the keyboard one way
 * here and another way there is two screens to reason about.
 *
 * What it is instead, and why, is in `roomKeyboard.ts`: one number of points, written by the
 * controller's own measured events for the ride and by React Native's own observer for the truth
 * at rest, because those two fail at different times. The avoiding view kept the answer in two
 * halves that came from different events, and a lock and an unlock could leave them disagreeing
 * — fully open, times a height of nought — with the keys standing over the composer and nothing
 * to correct it (Arjun, 20 September 2026).
 *
 * The room is padded rather than the list alone, because the composer stands under the list and
 * has to come up with it. On Android in landscape, while the keys are up, the status bar stands
 * aside as well, since without its height the composer does not fit above them (`statusBarAside`).
 *
 * Under Jest this file is mocked to a plain view, as the other Reanimated files here are: the
 * controller's own mock keyboard never moves, so there is nothing for a test under Node to
 * watch. `roomKeyboard.vitest.ts` has the arithmetic and `e2e/maestro/keyboard.yaml` asks a
 * device for the ride.
 */
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Keyboard, Platform, StyleSheet, useWindowDimensions } from "react-native";
import { useKeyboardHandler } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { roomPadding, seenHeight, statusBarAside } from "./roomKeyboard";

export function KeyboardRoom({
  children,
  testID,
}: {
  readonly children: ReactNode;
  readonly testID?: string | undefined;
}) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  // React Native's own height on Android starts at the top of the navigation band (`seenHeight`).
  const { keyboard, up } = useKeys(Platform.OS === "android" ? insets.bottom : 0);
  const foot = useAnimatedStyle(() => ({
    paddingBottom: roomPadding(keyboard.value, insets.bottom),
  }));
  return (
    <Animated.View style={[styles.screen, foot]} testID={testID}>
      {statusBarAside(Platform.OS, window, up) ? <StatusBar hidden animated /> : null}
      {children}
    </Animated.View>
  );
}

/**
 * Where the keyboard's top edge is, in points above the foot of the glass, from two observers
 * that fail at different times.
 *
 * The controller's events give the ride: `onKeyboardMove` carries the keyboard's *measured*
 * frame in the window, frame by frame, rather than what a notification claimed, so the composer
 * follows the keys up, down, and through an interactive drag.
 *
 * React Native's own `Keyboard` gives the settled height. It watches `keyboardDidShow` and
 * `keyboardDidHide`, which are not the notification the controller watches — it listens to *will
 * show* alone and synthesises the end on a timer — and it arrives by the ordinary event queue
 * rather than the UI thread's. In the ordinary case it says what the ride has already ended on
 * and changes nothing. When the controller has missed its notification, which is what a lock and
 * an unlock can do, it is the correction, and the room is right again the moment the keyboard
 * has finished arriving.
 *
 * Read once on opening as well, because a room can be opened with the keyboard already up. `up`
 * is the same observer's word on whether they are, for what is decided on the JavaScript side.
 */
function useKeys(band: number) {
  const keyboard = useSharedValue(0);
  const [up, setUp] = useState(() => Keyboard.isVisible());
  useKeyboardHandler(
    {
      onMove: (event) => {
        "worklet";
        keyboard.value = event.height;
      },
      onInteractive: (event) => {
        "worklet";
        keyboard.value = event.height;
      },
      onEnd: (event) => {
        "worklet";
        keyboard.value = event.height;
      },
    },
    [],
  );
  useEffect(() => {
    // The web target's Keyboard (react-native-web) has no `metrics`, and calling it took every
    // room down there on opening, from 20 September 2026 until this guard (22 September).
    const metrics = typeof Keyboard.metrics === "function" ? Keyboard.metrics() : undefined;
    keyboard.value = seenHeight(Keyboard.isVisible(), metrics, band);
    const shown = Keyboard.addListener("keyboardDidShow", (event) => {
      keyboard.value = seenHeight(true, event.endCoordinates, band);
      setUp(true);
    });
    const hidden = Keyboard.addListener("keyboardDidHide", () => {
      keyboard.value = 0;
      setUp(false);
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [keyboard, band]);
  return { keyboard, up };
}

const styles = StyleSheet.create({ screen: { flex: 1 } });
