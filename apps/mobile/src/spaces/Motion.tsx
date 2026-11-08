/**
 * The line a card or a link pointed at, flashed once so the eye finds it.
 *
 * How the room moves — a line landing, a bubble giving its time up, the thinking bubble coming
 * and going — is `RoomMotion.tsx`: one transition, on the UI thread, for all of it (ADR 0074).
 */

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, type LayoutChangeEvent, Platform, StyleSheet, View } from "react-native";
import { Defs, LinearGradient, Rect, Stop, Svg } from "react-native-svg";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";

const NATIVE = Platform.OS !== "web";

/** How wide the sweep's band of gold is, and how long it takes to cross the line (ADR 0219). */
const BAND = 180;
const SWEEP_MS = 950;
/** The light held full, and then its fade. */
const HELD_MS = 500;
const FADE_MS = 1400;
/**
 * How long a line's flash lasts from when it was lit. Drawn again after that — scrolled back into
 * the room's window, or narrowed by a column opening beside the room on an iPad — it is drawn
 * plain: the flash is a moment, not a state (ADR 0219, addendum).
 */
export const FLASH_MS = HELD_MS + FADE_MS;

/** Whether a line lit at `since` is still in its moment. */
function fresh(since: number): boolean {
  return Date.now() - since < FLASH_MS;
}

/**
 * The one flash of the brand's selection colour under the line a card pointed at: half a
 * second full, then gone, so the eye lands where the thumb meant to and nothing stays lit. A band
 * of gold sweeps across it once as it lights (ADR 0219), on the native driver; with Reduce Motion
 * on, the light alone. Once for each time it is lit, while that is new (`FLASH_MS`): the line stays
 * the room's lit one, and a cell drawn again, or a new width, is not a new time.
 *
 * The light and the band are each drawn only until they have played for that time, and then not
 * at all, so nothing gold is left beside the line on the native driver. The band set off again at
 * every change of the line's width, which on an iPad is every column coming or going, and on
 * Arjun's iPad one stopped halfway across a reply and stayed there (6 November 2026).
 */
export function Flash({
  on,
  since,
  id,
  children,
}: {
  readonly on: boolean;
  /** When the line was lit: a new time flashes it again, *Go to message* twice onto one line. */
  readonly since: number;
  readonly id: string;
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  const glow = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  // The time whose light has faded, so it is no longer drawn: a cell drawn after the moment has
  // none to play.
  const [faded, setFaded] = useState<number | undefined>(() => (fresh(since) ? undefined : since));
  useEffect(() => {
    if (!on || !fresh(since)) return;
    glow.setValue(1);
    const fade = Animated.timing(glow, {
      toValue: 0,
      duration: FADE_MS,
      delay: HELD_MS,
      useNativeDriver: NATIVE,
    });
    fade.start(({ finished }) => {
      if (finished) setFaded(since);
    });
    return () => fade.stop();
  }, [on, since, glow]);
  if (!on) return <>{children}</>;
  return (
    <View
      style={styles.flash}
      testID={`flash-${id}`}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
    >
      {faded === since ? null : (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.glow,
            { backgroundColor: palette.goldSoft, opacity: glow },
          ]}
          testID="flash-glow"
        />
      )}
      {children}
      {/* Over the line, so the band crosses the bubble itself as the web's does. */}
      <Sweep width={width} since={since} />
    </View>
  );
}

/** One crossing of the band: for which time the line was lit, and how wide it was as it set off. */
interface Crossing {
  readonly since: number;
  readonly width: number;
}

/**
 * The band of gold across the line and its bubble, once, from before its left edge to past its
 * right. It takes no touch, so the card under it still goes and the bubble still lifts.
 *
 * It sets off once the line has a width, once for each time it is lit while that is new, and
 * crosses the width it set off with: nothing the native driver is running changes under it on its
 * way, and a change of the line's width after does not send it across again. Once across, it is
 * not drawn.
 */
function Sweep({ width, since }: { readonly width: number; readonly since: number }) {
  const palette = usePalette();
  const less = useReduceMotion();
  const across = useRef(new Animated.Value(0)).current;
  const [crossing, setCrossing] = useState<Crossing | undefined>(undefined);
  const [crossed, setCrossed] = useState<number | undefined>(undefined);
  if (width > 0 && crossing?.since !== since && fresh(since)) setCrossing({ since, width });
  const setOff = crossing?.since;
  const span = crossing?.width ?? 0;
  useEffect(() => {
    if (setOff === undefined || less) return;
    across.setValue(0);
    const sweep = Animated.timing(across, {
      toValue: 1,
      duration: SWEEP_MS,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: NATIVE,
    });
    sweep.start(({ finished }) => {
      if (finished) setCrossed(setOff);
    });
    return () => sweep.stop();
  }, [setOff, less, across]);
  const translateX = useMemo(
    () => across.interpolate({ inputRange: [0, 1], outputRange: [-BAND, span] }),
    [across, span],
  );
  if (setOff === undefined || less || crossed === setOff) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.glow, styles.clip]}>
      <Animated.View style={[styles.band, { transform: [{ translateX }] }]} testID="flash-sweep">
        {/* A unit box stretched to the band: sizes in per cent go stale on a Fabric re-layout. */}
        <Svg width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
              <Stop offset={0} stopColor={palette.gold} stopOpacity={0} />
              <Stop offset={0.5} stopColor={palette.gold} stopOpacity={0.45} />
              <Stop offset={1} stopColor={palette.gold} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={1} height={1} fill="url(#sweep)" />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flash: { marginHorizontal: -SPACE.sm, paddingHorizontal: SPACE.sm, borderRadius: RADIUS.lg },
  glow: { borderRadius: RADIUS.lg },
  clip: { overflow: "hidden" },
  band: { position: "absolute", top: 0, bottom: 0, width: BAND },
});
