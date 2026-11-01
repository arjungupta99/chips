/**
 * Search's backdrop (ADR 0136, ADR 0138): the faces of your spaces and your agents rising slowly
 * behind the recent searches and the empty part of the tab under them, each in a glow of its own
 * colour that breathes. Which spaces and agents, which places and which face in each are core's
 * (`searchBackdrop.ts`); how a face moves through its place, and how its glow breathes, is
 * `drift.ts`; this draws it.
 *
 * - **Hung under the field.** It is the list's header: a line of no height before the rows, with
 *   the backdrop hanging from it behind them (the rows are drawn after it, and the recent searches
 *   are clear at rest), so it starts where the field ends and scrolls with the rows, and nothing is
 *   measured against the list. It reaches down to the window's foot, which is the one thing it
 *   measures. Arjun had it start under the last row first, then asked for the faces under the
 *   recent searches as well (7 October 2026).
 * - **Agents with their pins.** An agent is its bitten body with its pins at every depth, the far
 *   ones too, and they rest as lit as the mark's, so they read through the backdrop's faintness.
 * - **Dim, never see-through.** Each face is drawn at its depth's strength over a silhouette of
 *   itself in the page's colour, so where faces cross, the nearer hides the farther.
 * - **A breathing glow.** Behind each face, inside its sway, a round light of the face's own
 *   colour swells and settles on the round's clock, each place at its own point in a breath.
 * - **Behind, never in the way.** Taps go through it, VoiceOver skips it, and it is drawn at a
 *   third of its strength, thinning out to nothing just under the field.
 * - **Gone once you type.** It fades out in 0.2 s when the field has words in it, and back in over
 *   0.45 s when it is empty again; the results take its place.
 * - **Moving only while it can be seen.** One clock, looped on the native side as the lights that
 *   take turns are (`useTurns`), so nothing crosses to JavaScript while it runs. It stops while the
 *   tab is behind a room or another tab, while the app is in the background, and while the field
 *   has words in it, and goes on from where it stopped. With Reduce Motion it never starts, and
 *   the faces and their glows stand where the round begins.
 * - **The faces hold while you look.** Which face is in which place is taken each time the
 *   backdrop comes into view: a room that moves to the top of Spaces while you watch would
 *   otherwise change every face at once.
 */

import {
  BACKDROP_DEPTHS,
  BACKDROP_GLOW,
  BACKDROP_PLACES,
  BACKDROP_ROUND_MS,
  BACKDROP_SWAY,
  BACKDROP_TIP,
  type BackdropDepth,
  type BackdropPlace,
  backdropFill,
  backdropLenders,
  nameOf,
  type Snapshot,
  spaceFace,
  spaceTitle,
} from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import { useIsFocused } from "expo-router";
import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import {
  Avatar,
  type AvatarKind,
  type AvatarSize,
  avatarCorner,
  avatarSide,
  faceGround,
} from "../ui/Avatar";
import { BODY_WITH_PINS, bittenPath, pinsOf } from "../ui/outline";
import { usePalette, useScheme } from "../ui/theme";
import { useActive } from "../ui/useActive";
import { useReduceMotion } from "../ui/useReduceMotion";
import { breathe, climb, fade, sway } from "./drift";

const NATIVE = Platform.OS !== "web";

/** A face the backdrop drifts: the one a space's row wears on Spaces without its ring, or an agent's. */
export interface BackdropFace {
  readonly name: string;
  readonly kind: AvatarKind;
  readonly icon: SpaceIcon | undefined;
  /** The colour it stands on, which its glow is (ADR 0138). */
  readonly ground: string;
}

/**
 * The faces of the open spaces and of the agents, the most recently active first, as many as
 * there are places.
 */
export function backdropFaces(
  { model, directory, spaceIcons }: Pick<Snapshot, "model" | "directory" | "spaceIcons">,
  selfId: string,
): readonly BackdropFace[] {
  return backdropLenders(model, directory, selfId).map((lender) => {
    if (lender.kind === "agent") {
      const { name, face } = lender.agent;
      return { name, kind: "agent", icon: face, ground: faceGround(name, face) };
    }
    const { space } = lender;
    const face = spaceFace(space, directory);
    const icon = spaceIcons.get(space.id);
    // Named after its one agent, it wears that agent's name; otherwise its own title.
    const name =
      "harnessId" in face
        ? nameOf(directory, face.harnessId)
        : spaceTitle(space, directory, selfId);
    return { name, kind: face.kind, icon, ground: faceGround(name, icon) };
  });
}

/** Each depth's face: the size a picked face and two list sizes already are. */
const SIZE: Readonly<Record<BackdropDepth, AvatarSize>> = { near: "pick", mid: "md", far: "sm" };

/** How strong the backdrop is drawn: the faces can be seen, and the rows over them still read. */
const STRENGTH = { dark: 0.36, light: 0.3 } as const;
const SHOW_MS = 450;
const HIDE_MS = 200;

/** The least the backdrop reaches down, before the window says where its foot is. */
const MIN_HEIGHT = 240;

export const Backdrop = memo(function Backdrop({
  faces,
  shown,
}: {
  /** The faces to drift, most recent first (`backdropFaces`). None, and there is no backdrop. */
  readonly faces: readonly BackdropFace[];
  /** Nothing is typed: the backdrop is wanted. */
  readonly shown: boolean;
}) {
  const focused = useIsFocused();
  const active = useActive();
  const less = useReduceMotion();
  const window = useWindowDimensions();
  const anchor = useRef<View>(null);
  const [width, setWidth] = useState(0);
  const [top, setTop] = useState<number | undefined>(undefined);
  const inView = shown && focused;
  const held = useHeld(faces, inView);
  const worn = useMemo(() => backdropFill(held), [held]);
  const ready = width > 0 && worn.length > 0;
  const clock = useClock(ready && inView && active && !less);
  const strength = useStrength(ready && shown);
  if (worn.length === 0) return null;
  // From under the field to the window's foot: the backdrop's own coordinates for the climb.
  const height = Math.max(MIN_HEIGHT, Math.round(window.height - (top ?? window.height / 3)));
  return (
    <View
      ref={anchor}
      style={styles.anchor}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
        // A frame on, once the list has been told where the field ends and has moved for it.
        requestAnimationFrame(() => anchor.current?.measureInWindow((_x, y) => setTop(y)));
      }}
      testID="search-backdrop"
    >
      <Animated.View style={[styles.field, { height, opacity: strength }]}>
        {width === 0
          ? null
          : worn.map((face, at) => (
              <Drifting
                // A place is its index: the faces move through the places, never the other way.
                // biome-ignore lint/suspicious/noArrayIndexKey: the places are a fixed table
                key={at}
                place={BACKDROP_PLACES[at] as BackdropPlace}
                face={face}
                clock={clock}
                width={width}
                height={height}
              />
            ))}
      </Animated.View>
    </View>
  );
});

/** One face in its place, reading where it is from the round's clock. */
const Drifting = memo(function Drifting({
  place,
  face,
  clock,
  width,
  height,
}: {
  readonly place: BackdropPlace;
  readonly face: BackdropFace;
  readonly clock: Animated.Value;
  readonly width: number;
  readonly height: number;
}) {
  const size = SIZE[place.depth];
  const side = avatarSide(size);
  const motion = useMemo(() => {
    const tip = sway(place, BACKDROP_TIP);
    return {
      y: clock.interpolate(climb(place, height, side)),
      clear: clock.interpolate(fade(place, height, side)),
      x: clock.interpolate(sway(place, BACKDROP_SWAY)),
      tip: clock.interpolate({
        inputRange: tip.inputRange,
        outputRange: tip.outputRange.map((degrees) => `${degrees}deg`),
      }),
    };
  }, [clock, place, height, side]);
  return (
    <Animated.View
      style={[
        styles.face,
        {
          left: place.across * Math.max(0, width - side),
          opacity: motion.clear,
          transform: [{ translateY: motion.y }],
        },
      ]}
    >
      <Animated.View
        style={{ transform: [{ translateX: motion.x }, { rotate: motion.tip }] }}
        testID="backdrop-face"
      >
        <Glow place={place} ground={face.ground} side={side} clock={clock} />
        <Silhouette kind={face.kind} size={size} />
        <View style={{ opacity: BACKDROP_DEPTHS[place.depth].opacity }}>
          <Avatar
            name={face.name}
            kind={face.kind}
            size={size}
            icon={face.icon}
            pinsAlways={face.kind === "agent"}
            decorative
          />
        </View>
      </Animated.View>
    </Animated.View>
  );
});

/** How strong a face at this place is drawn over its silhouette, and its glow with it. */
const depthOf = (place: BackdropPlace) => BACKDROP_DEPTHS[place.depth].opacity;

/**
 * What stands behind a face, in its shape and the page's colour (ADR 0138's revision): the face is
 * drawn over it at its depth's strength, so a far face is dim, but nothing behind it shows
 * through. Faces seen through one another where they crossed looked wrong (Arjun, 7 October 2026).
 * A room's face is a rounded square or a circle; an agent's, its bitten body and its pins, which
 * it wears inside its box here (`pinsAlways`).
 */
const Silhouette = memo(function Silhouette({
  kind,
  size,
}: {
  readonly kind: AvatarKind;
  readonly size: AvatarSize;
}) {
  const palette = usePalette();
  const side = avatarSide(size);
  if (kind !== "agent") {
    const shape = { borderRadius: avatarCorner(size, kind), backgroundColor: palette.bg };
    return <View style={[StyleSheet.absoluteFill, shape]} />;
  }
  const body = side * BODY_WITH_PINS;
  const inset = (side - body) / 2;
  return (
    <Svg width={side} height={side} style={StyleSheet.absoluteFill}>
      <Path d={bittenPath(inset, inset, body)} fill={palette.bg} />
      {pinsOf(body).map((pin) => (
        <Rect
          key={pin.key}
          x={inset + pin.x}
          y={inset + pin.y}
          width={pin.w}
          height={pin.h}
          rx={Math.min(pin.w, pin.h) / 2}
          fill={palette.bg}
        />
      ))}
    </Svg>
  );
});

/** How the glow's light falls off from its middle to its edge: [where, how strong], as the web's. */
const GLOW_STOPS = [
  [0, 0.8],
  [0.52, 0.34],
  [1, 0],
] as const;

/**
 * A face's glow (ADR 0138): a round light of the face's own colour behind it, swelling and
 * settling on the round's clock from where its place starts it. Drawn once; the native side
 * moves it.
 */
const Glow = memo(function Glow({
  place,
  ground,
  side,
  clock,
}: {
  readonly place: BackdropPlace;
  readonly ground: string;
  readonly side: number;
  readonly clock: Animated.Value;
}) {
  // One id per glow: the web target renders real SVG, where ids are the document's.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const across = side * BACKDROP_GLOW.across;
  const breath = useMemo(
    () => ({
      size: clock.interpolate(breathe(place, BACKDROP_GLOW.small, BACKDROP_GLOW.full)),
      // At the face's depth, as the face is drawn.
      strength: clock.interpolate(
        breathe(place, BACKDROP_GLOW.faint * depthOf(place), depthOf(place)),
      ),
    }),
    [clock, place],
  );
  return (
    <Animated.View
      pointerEvents="none"
      testID="backdrop-glow"
      style={[
        styles.glow,
        {
          left: (side - across) / 2,
          top: (side - across) / 2,
          width: across,
          height: across,
          opacity: breath.strength,
          transform: [{ scale: breath.size }],
        },
      ]}
    >
      <Svg width={across} height={across}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            {GLOW_STOPS.map(([offset, strength]) => (
              <Stop key={offset} offset={offset} stopColor={ground} stopOpacity={strength} />
            ))}
          </RadialGradient>
        </Defs>
        <Circle cx={across / 2} cy={across / 2} r={across / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
});

/**
 * The faces as they were when the backdrop last came into view, while it is in view: a change
 * to the spaces waits until it is next out of sight. Nothing held yet, and it takes what is
 * there — the first snapshot may arrive after the tab is open.
 */
function useHeld(faces: readonly BackdropFace[], inView: boolean): readonly BackdropFace[] {
  const held = useRef(faces);
  if (!inView || held.current.length === 0) held.current = faces;
  return held.current;
}

/**
 * The round's clock, from nought to one and round again on the native side, only while
 * `running`. Stopped, it holds where it was, and goes on from there: the rest of that round
 * first, at the same speed, and then whole rounds. The faces are where they started when it
 * comes round to one, so starting it again at nought there is no jump.
 */
function useClock(running: boolean): Animated.Value {
  const clock = useRef(new Animated.Value(0)).current;
  const at = useRef(0);
  useEffect(() => {
    if (!running) return;
    let current: Animated.CompositeAnimation | undefined;
    const timing = (duration: number) =>
      Animated.timing(clock, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: NATIVE,
      });
    current = timing((1 - at.current) * BACKDROP_ROUND_MS);
    current.start(({ finished }) => {
      if (!finished) return;
      clock.setValue(0);
      // A single timing, so `loop` hands the whole thing to the native driver.
      current = Animated.loop(timing(BACKDROP_ROUND_MS));
      current.start();
    });
    return () => {
      current?.stop();
      clock.stopAnimation((value) => {
        at.current = value;
      });
    };
  }, [clock, running]);
  return clock;
}

/** The backdrop's opacity: up to its strength while it is wanted, down to nothing when not. */
function useStrength(shown: boolean): Animated.Value {
  const scheme = useScheme();
  const strength = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const fading = Animated.timing(strength, {
      toValue: shown ? STRENGTH[scheme] : 0,
      duration: shown ? SHOW_MS : HIDE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: NATIVE,
    });
    fading.start();
    return () => fading.stop();
  }, [strength, shown, scheme]);
  return strength;
}

const styles = StyleSheet.create({
  // A line of no height before the rows; the backdrop hangs below it, outside the list's size.
  anchor: { height: 0, overflow: "visible" },
  field: { position: "absolute", left: 0, right: 0, top: 0, overflow: "visible" },
  face: { position: "absolute", top: 0 },
  glow: { position: "absolute" },
});
