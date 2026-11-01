/**
 * The mask for a scroll view's content: clear at an edge with more beyond it, so what scrolls
 * fades out there, and solid everywhere else, until the view is measured too. For a
 * `MaskedView`'s `maskElement`, over the + window's row of faces (`newSpace/Pick.tsx`) and the
 * list the field opens into (`spaces/AddressInField.tsx`, ADR 0113).
 */

import { useId, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Defs, LinearGradient, Rect, Stop, Svg } from "react-native-svg";

export function Fades({
  start,
  end,
  axis = "x",
  length,
}: {
  /** More before the start: the left, or the top. */
  readonly start: boolean;
  /** More after the end: the right, or the foot. */
  readonly end: boolean;
  readonly axis?: "x" | "y";
  /** How far a fade runs in from its edge, in points. */
  readonly length: number;
}) {
  const id = useId().replace(/:/g, "");
  const [span, setSpan] = useState(0);
  const across = axis === "x";
  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setSpan(across ? width : height);
      }}
    >
      {span === 0 || (!start && !end) ? (
        <View style={[StyleSheet.absoluteFill, styles.solid]} />
      ) : (
        // In a unit box stretched to the view at every draw (`FieldPicture`, in
        // `spaces/ScrollColours.tsx`): a rectangle sized in percent is worked out once and kept.
        <Svg width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2={across ? 1 : 0} y2={across ? 0 : 1}>
              <Stop offset={0} stopColor="#000" stopOpacity={start ? 0 : 1} />
              <Stop offset={length / span} stopColor="#000" stopOpacity={1} />
              <Stop offset={1 - length / span} stopColor="#000" stopOpacity={1} />
              <Stop offset={1} stopColor="#000" stopOpacity={end ? 0 : 1} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={1} height={1} fill={`url(#${id})`} />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ solid: { backgroundColor: "#000" } });
