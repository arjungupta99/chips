/**
 * One of the design system's marks, drawn on the phone.
 *
 * The web renders these as inline SVG; here the same path data goes through `react-native-svg`,
 * so a tab bar and a search box wear the marks the mockups drew rather than a second set. The
 * stroke is `currentColor` on the web and an explicit colour here, because React Native has no
 * inheriting colour — the caller passes the one the surrounding text is using. A `ColorValue`
 * rather than a string, because the tab navigator hands its icons one of those.
 *
 * Decoration by default: an icon beside a word is not read out, and a screen reader that says
 * "image, Spaces, Spaces" is worse than one that says "Spaces".
 */

import type { ColorValue } from "react-native";
import { Path, Svg } from "react-native-svg";
import { FILLED, ICON_BOX, ICONS, type IconName } from "./icons";

export function Icon({
  name,
  size = 22,
  color,
  weight = 1.75,
}: {
  readonly name: IconName;
  readonly size?: number;
  readonly color: ColorValue;
  /** The line's weight in the 24-point box: heavier for a mark that answers a pick (ADR 0141). */
  readonly weight?: number;
}) {
  // A mark drawn as a shape takes the colour as its fill and has no line at all (`FILLED`).
  const filled = FILLED.has(name);
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${ICON_BOX} ${ICON_BOX}`}
      fill={filled ? color : "none"}
      {...(filled ? ({ fillRule: "evenodd" } as const) : {})}
      stroke={filled ? "none" : color}
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {ICONS[name].map((d) => (
        <Path key={d} d={d} />
      ))}
    </Svg>
  );
}
