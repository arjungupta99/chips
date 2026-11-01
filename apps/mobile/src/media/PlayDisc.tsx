/**
 * The play disc a video wears where it is not playing (ADR 0163): the transport's middle disc
 * (`Controls.tsx`), flat, in the wash the controls wear where there is no glass. The stage puts it
 * on a neighbour at the transport's size, so landing on it changes nothing there; the room puts it
 * on a video's tile, smaller, as Messages does. Flat in both, since a page in flight and a room
 * scrolling are no place for a native material. Where a disc would crowd a small tile (the viewer's
 * filmstrip), the triangle stands bare (`PlayMark`).
 */

import { StyleSheet, View } from "react-native";
import { Path, Svg } from "react-native-svg";
import { Icon } from "../ui/Icon";
import { ICON_BOX, ICONS } from "../ui/icons";

/** Where there is no glass: a dark wash, as flat as the glass is. */
export const WASH = "rgba(28,28,30,0.62)";

/** The triangle's share of the disc, and how far right it sits to look centred, as the transport's. */
const ICON_SHARE = 34 / 72;
const NUDGE_SHARE = 3 / 72;
/** The bare triangle's edge, which keeps it on a white picture as the `▶` glyph's shadow did. */
const EDGE = "rgba(0,0,0,0.45)";

export function PlayDisc({ size }: { readonly size: number }) {
  return (
    <View
      style={[styles.disc, { width: size, height: size, borderRadius: size / 2 }]}
      pointerEvents="none"
      testID="play-disc"
    >
      <View style={{ marginLeft: Math.round(size * NUDGE_SHARE) }}>
        <Icon name="playFill" color="#fff" size={Math.round(size * ICON_SHARE)} />
      </View>
    </View>
  );
}

/**
 * The disc's triangle with no disc: white, edged in a thin dark line drawn under it, which a white
 * picture cannot swallow. A line rather than a shadow, since a view's shadow is iOS's alone and the
 * web draws one round the view's box.
 */
export function PlayMark({ size }: { readonly size: number }) {
  return (
    <View
      style={{ marginLeft: Math.round(size * NUDGE_SHARE) }}
      pointerEvents="none"
      testID="play-mark"
    >
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${ICON_BOX} ${ICON_BOX}`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {ICONS.playFill.map((d) => (
          <Path
            key={`edge ${d}`}
            d={d}
            fill="none"
            stroke={EDGE}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
        ))}
        {ICONS.playFill.map((d) => (
          <Path key={d} d={d} fill="#fff" />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { alignItems: "center", justifyContent: "center", backgroundColor: WASH },
});
