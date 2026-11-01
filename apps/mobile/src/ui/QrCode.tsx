/**
 * A QR code for a link, drawn on the phone (ADR 0164): an invite shown to somebody beside you, who
 * scans it with Chips. The modules come from `qrcode`, the package the desktop draws its pairing
 * QR with, and are drawn here as one path, dark on white whatever the theme, since that is what a
 * camera reads.
 */

import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { qrPath } from "./qr";

/** The quiet zone around a code, in modules: what a scanner needs to find its edges. */
const MARGIN = 2;

export function QrCode({
  text,
  size,
  testID,
}: {
  readonly text: string;
  readonly size: number;
  readonly testID?: string;
}) {
  const code = useMemo(() => qrPath(text), [text]);
  const box = code.size + MARGIN * 2;
  return (
    <View accessibilityRole="image" accessibilityLabel="QR code for the link" testID={testID}>
      <Svg width={size} height={size} viewBox={`${-MARGIN} ${-MARGIN} ${box} ${box}`}>
        <Rect x={-MARGIN} y={-MARGIN} width={box} height={box} fill="#ffffff" />
        <Path d={code.path} fill="#000000" />
      </Svg>
    </View>
  );
}
