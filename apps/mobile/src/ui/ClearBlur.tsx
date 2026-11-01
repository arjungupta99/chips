/**
 * A blur with nothing over it: what is behind, softened, in its own colours (`modules/clear-blur`,
 * ADR 0129). A material from `expo-blur` lays a tint over its blur, and on the dark page that tint
 * is grey.
 *
 * Only a build made since 6 October 2026 carries the module, and only iOS has it; anywhere else
 * the caller keeps its material (`Glass.tsx`).
 */

import { requireNativeView, requireOptionalNativeModule } from "expo";
import type { ComponentType } from "react";
import { Platform, type StyleProp, type ViewStyle } from "react-native";

interface NativeProps {
  readonly radius: number;
  readonly pointerEvents: "none";
  readonly style: StyleProp<ViewStyle>;
}

let present: boolean | undefined;
let native: ComponentType<NativeProps> | undefined;

/** Whether this build can blur without a tint, asked once. */
export function hasClearBlur(): boolean {
  present ??= Platform.OS === "ios" && requireOptionalNativeModule("ChipsClearBlur") !== null;
  return present;
}

export function ClearBlur({
  radius,
  style,
}: {
  /** In points: a true radius, unlike a material's intensity. */
  readonly radius: number;
  readonly style: StyleProp<ViewStyle>;
}) {
  native ??= requireNativeView<NativeProps>("ChipsClearBlur");
  const Native = native;
  return <Native radius={radius} pointerEvents="none" style={style} />;
}
