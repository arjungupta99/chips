/**
 * A band over the top of a list, lowered into place by the list's own scroll on the native side
 * (`modules/scroll-band`, ADR 0098). What it holds is drawn by React; where it stands is UIKit's:
 * the view watches the scroll view's offset and moves its children by a layer property React
 * never writes, so no animated value, event or prop of React Native's lies between the two.
 *
 * Only a build made since 2 October 2026 carries the module, and only iOS draws glass here;
 * anywhere else a tab's name is a shelf (`Screen`).
 */

import { requireNativeView, requireOptionalNativeModule } from "expo";
import type { ComponentType, ReactNode } from "react";
import { Platform, type StyleProp, type ViewStyle } from "react-native";

interface NativeProps {
  /** The list's React tag: nothing until it has mounted. */
  readonly scrollView: number | null;
  readonly ramp: number;
  readonly pointerEvents: "none";
  readonly style: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}

let present: boolean | undefined;
let native: ComponentType<NativeProps> | undefined;

/** Whether this build can hold a band to a list, asked once. */
export function hasScrollBand(): boolean {
  present ??= Platform.OS === "ios" && requireOptionalNativeModule("ChipsScrollBand") !== null;
  return present;
}

export function ScrollBand({
  scrollView,
  ramp,
  style,
  children,
}: {
  readonly scrollView: number | null;
  /** How far the band stands above its place at rest, and how far the list scrolls to lower it. */
  readonly ramp: number;
  readonly style: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  native ??= requireNativeView<NativeProps>("ChipsScrollBand");
  const Native = native;
  return (
    <Native scrollView={scrollView} ramp={ramp} pointerEvents="none" style={style}>
      {children}
    </Native>
  );
}
