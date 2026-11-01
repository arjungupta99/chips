/**
 * The room's glass: the capsules its chrome floats in, and the blur that stands behind the top
 * of the room and fades out into the conversation.
 *
 * A room used to be a page with two shelves on it — an opaque navigation bar above the lines and
 * an opaque composer below them — and the lines were a window cut out of the middle. Messages has
 * no shelves: the bar and the field are material over the conversation, the conversation runs the
 * whole height of the glass and passes under both, and nothing anywhere says where the app stops
 * and the chrome starts. This is that, in the shape Arjun picked from the mocks on 21 September
 * 2026 (`docs/proposals/chat-floating-chrome-mocks.html`, arrangement B): not bars at all, but
 * the back, the room's name, the connection's mark and the field each floating as their own piece
 * of glass, with a band of blur behind them so the words in them stay readable over whatever is
 * sliding past underneath.
 *
 * ## The system's own glass, where the phone has it
 *
 * On iOS 26 and later a capsule is Liquid Glass — UIKit's `UIGlassEffect`, through
 * `expo-glass-effect` — which is the material Messages makes its field of, and the material iOS
 * already drew the back button and the connection's mark in beside our name (Arjun, 23 September
 * 2026, option B of `docs/proposals/composer-liquid-glass-mocks.html`, and the name with it). It
 * carries the room through itself rather than frosting it over: lensed at the rim, a highlight
 * where the light catches, dark over dark content without being told. The field and the + beside
 * it are *interactive* glass, which answers a thumb as iOS's own buttons do. The same day the band
 * under the field went: the room runs to the bottom of the glass, and the field floats over it with
 * nothing behind it but the conversation. The band at the top stays.
 *
 * Below iOS 26 a capsule is what it was from 21 September: the chrome material under a wash of
 * the page's surface, the section below.
 *
 * ## The numbers are his, and they are next door
 *
 * Every one of them was dialled on the second mock (`docs/proposals/chat-glass-ramp-mocks.html`)
 * rather than chosen here, and they live in `glassDial.ts` with the two sums that use them,
 * where Node can check them. What he landed on is much lighter than what I would have set — the
 * glass is *barely there*, on purpose. The first thing to look at on a real phone is the one
 * thing a mock cannot answer: the room's own ink over a capsule at four tenths, with an outgoing
 * bubble's violet passing under it.
 *
 * ## Two panes, not six
 *
 * A blur that fades out is usually built as a stack of panes, each blurring harder than the last
 * over a shorter run, because a single blurred pane has a hard edge wherever its bounds are and
 * the stack is what hides it. At the lengths in the first mock — sixteen points under the bar —
 * one pane was enough: a blur of constant radius whose *alpha* ran from full to nothing across
 * the ramp, which is not a progressive blur and could not be told from one at that size. On 23
 * September 2026 sixteen points read as a line under the bar, and the ramp became forty
 * (`GLASS.rampTop`). Over forty points one pane shows what it is — the room sharp and blurred at
 * once, half way down — so there are two: the bar's own material, gone within the first part of
 * the ramp (`GLASS.thickReach`), over a thinner one that carries the fade to its end. Near the
 * bar both are there and the blur is the bar's; further down only the thin one is left, and then
 * nothing. Two native views, where the mock's CSS used six.
 *
 * ## Where there is no glass
 *
 * On iOS with Reduce Transparency on, a capsule is the page's own surface and there is no band:
 * the setting exists because material over moving content is exactly what some people cannot
 * read, and honouring it is not optional. On Android and on the web target the same painted
 * fallback stands in — Android's blur is a third-party view that costs frames under a scrolling
 * list, and the web target is where thirteen Playwright specs drive this app and none of them
 * should be looking at a backdrop filter. The chrome still floats in all three; it is opaque
 * rather than glass, which is a difference in material and not in shape.
 */

import MaskedView from "@react-native-masked-view/masked-view";
import { BlurView } from "expo-blur";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { type ReactNode, useEffect, useId, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { Defs, LinearGradient, Rect, Stop, Svg } from "react-native-svg";
import { ClearBlur, hasClearBlur } from "./ClearBlur";
import { alpha, fadeStop, GLASS, intensityFor, solidStop } from "./glassDial";
import { useGround } from "./ground";
import { GROWS_UP, GrowingGlass, GrowingView } from "./growing";
import { usePalette, useScheme } from "./theme";
import { RADIUS, SPACE } from "./tokens";

// The dial is next door, in a module Node can run (`glassDial.ts`); this file is what draws with
// it. Both are re-exported here, so nothing else has to know the halves are two files.
export { alpha, GLASS } from "./glassDial";

/** The mock's twelve CSS pixels, as near as a material's intensity gets to a radius. */
const INTENSITY = intensityFor(GLASS.blur);

/** The mask runs from solid to clear across the ramp; these are the two ends of it. */
const SOLID = 1;
const CLEAR = 0;

/**
 * Whether this phone is drawing real glass at all: iOS, with Reduce Transparency off.
 *
 * The setting is read once and then watched, because it is a Settings toggle a person can reach
 * mid-conversation — and a room that keeps its blur until the next launch is the sort of thing
 * that reads as the setting not working.
 */
export function useGlassy(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    let alive = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((on) => {
      if (alive) setReduced(on);
    });
    const watch = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setReduced);
    return () => {
      alive = false;
      watch.remove();
    };
  }, []);
  return Platform.OS === "ios" && !reduced;
}

/** Whether the phone has the system's glass, asked once: it cannot change while the app runs. */
let liquid: boolean | undefined;

/**
 * Whether this iOS has Liquid Glass. Both checks are the module's, and the second exists for a
 * reason: some iOS 26 betas shipped the design without the API, and building the effect there
 * crashed (expo#40911).
 */
function hasLiquidGlass(): boolean {
  if (Platform.OS !== "ios") return false;
  liquid ??= isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  return liquid;
}

/** Whether a capsule is the system's own glass: glass at all (above), on an iOS that has it. */
export function useLiquid(): boolean {
  return useGlassy() && hasLiquidGlass();
}

/**
 * A piece of the room's chrome, floating: the back, the name, the mark, the field.
 *
 * The blur and the tint are two views under the children rather than one, because a capsule is
 * both — a material that carries what is behind it, and a wash of the page's own surface over it
 * so that ink set for the page is still ink on the page. `overflow: hidden` is what clips the
 * material to the corner; the shadow is outside the clip, as a layer's shadow is.
 *
 * The material is *chrome*, which is the one UIKit makes for bars, and it was picked by looking
 * rather than by reading (Arjun, 22 September 2026: the mock's box "looks more contrasty and
 * nicer", the phone's "looks dull"). Four were built into one room and judged over the same blue
 * bubble: thin and ultra-thin let the bubble through and the words in the capsule go with it,
 * which is the dullness; plain light and chrome hold the page's own colour, and chrome holds it
 * best. It is also the closest native answer to what the mock was actually doing — CSS
 * `backdrop-filter: blur() saturate(180%)`, which brightens rather than greys.
 *
 * That is the capsule below iOS 26. On iOS 26 and later it is the system's glass instead, and all
 * of the above is the system's to do: the glass draws its own rim and its own shadow, takes its
 * corners from the radius it is given, and is told the app's theme rather than the phone's, so a
 * room drawn light on a phone set dark is light glass. Nothing here clips it: an interactive
 * capsule swells past its own bounds under a thumb, and a clip would cut the swell off square.
 */
export function Capsule({
  children,
  style,
  interactive = false,
  grows = false,
  testID,
}: {
  readonly children: ReactNode;
  /** The shape and where it sits: a radius, a padding, a width. Never a background. */
  readonly style?: StyleProp<ViewStyle>;
  /** Glass that answers a thumb, for a capsule that is pressed: the field, and the + beside it. */
  readonly interactive?: boolean;
  /**
   * A capsule that grows to its new size rather than taking it at once: the field opening into the
   * list of who a message goes to (`spaces/AddressInField.tsx`, `growing.tsx`). It grows up from
   * its foot, which stays where it was drawn (`GROWS_UP`). The system's glass takes the frame as it
   * moves, and so does the painted capsule.
   */
  readonly grows?: boolean;
  readonly testID?: string | undefined;
}) {
  const palette = usePalette();
  const scheme = useScheme();
  const glassy = useGlassy();
  if (glassy && hasLiquidGlass()) {
    if (grows) {
      return (
        <GrowingGlass
          glassEffectStyle="regular"
          isInteractive={interactive}
          colorScheme={scheme}
          style={style}
          testID={testID}
          layout={GROWS_UP}
        >
          {children}
        </GrowingGlass>
      );
    }
    return (
      <GlassView
        glassEffectStyle="regular"
        isInteractive={interactive}
        colorScheme={scheme}
        style={style}
        testID={testID}
      >
        {children}
      </GlassView>
    );
  }
  const shape = [styles.capsule, { borderColor: alpha(palette.line2, 0.55) }, style];
  if (!glassy) {
    return (
      <Box style={[shape, { backgroundColor: palette.surface }]} testID={testID} grows={grows}>
        {children}
      </Box>
    );
  }
  return (
    <Box style={shape} testID={testID} grows={grows}>
      <BlurView
        intensity={INTENSITY}
        tint={scheme === "dark" ? "systemChromeMaterialDark" : "systemChromeMaterialLight"}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: alpha(palette.surface, GLASS.capsule) },
        ]}
      />
      {children}
    </Box>
  );
}

/** A painted capsule's box: one that grows, or a plain view. */
function Box({
  grows,
  style,
  testID,
  children,
}: {
  readonly grows: boolean;
  readonly style: StyleProp<ViewStyle>;
  readonly testID: string | undefined;
  readonly children: ReactNode;
}) {
  return grows ? (
    <GrowingView style={style} testID={testID} layout={GROWS_UP}>
      {children}
    </GrowingView>
  ) : (
    <View style={style} testID={testID}>
      {children}
    </View>
  );
}

/**
 * A sentence standing over the room with the chrome — a refused command over the field, a closed
 * room's line over that — on a capsule of its own, as wide as its words. There is no band behind
 * the foot any more (23 September 2026), so words set straight on the room would be amber over a
 * passing violet bubble; on a capsule they are words on the page's own material, glass or paint.
 */
export function Aside({ children }: { readonly children: ReactNode }) {
  return <Capsule style={styles.aside}>{children}</Capsule>;
}

/**
 * The band behind an edge's chrome: full blur where the capsules are, ramping to nothing over
 * `ramp` points of the room beyond them.
 *
 * It is laid out by whoever draws the chrome, because only they know how tall the chrome is: the
 * navigation bar is the platform's and is measured, the composer grows with what is typed and
 * with what is attached. So this takes a height and pins itself to its edge, and the caller is
 * free to give it a height larger than the view it sits in — which is exactly what the composer
 * does, so that the ramp reaches up past the field into the room.
 */
export function EdgeBand({
  edge,
  height,
  ramp,
}: {
  readonly edge: "top" | "bottom";
  /** The chrome's own height plus the ramp: the whole of what this covers. */
  readonly height: number;
  /** The last points of it, where the blur goes from full to gone. */
  readonly ramp: number;
}) {
  // The scrim fades to what the screen stands on: the paper, or the grouped ground.
  const { ground } = useGround();
  const scheme = useScheme();
  const glassy = useGlassy();
  // Three gradients, and three ids for them: one masks each pane, one paints the scrim, and an
  // id that is not unique to this band is an id that picks up another band's stops.
  const id = useId().replace(/:/g, "");
  if (!glassy || height <= 0) return null;
  // Where the ramp begins, as a fraction of the band: the chrome's own share is solid.
  const solidTo = solidStop(height, ramp);
  const at = edge === "top" ? { top: 0 } : { bottom: 0 };
  const dark = scheme === "dark";
  // Made again at every size rather than resized. Its gradients are drawn by react-native-svg, two
  // of them as masks, and a mask's drawing did not follow the band when it grew: on Arjun's iPhone
  // a tab's band drawn at 101 points and then grown to 163 kept its glass cut off at 101, far up
  // the name (3 October 2026, ADR 0107). A band is drawn new right every time, and its size
  // changes only with the window, the text size or a bar.
  return (
    <View
      key={`${height}:${ramp}`}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.band, at, { height }]}
    >
      <Pane
        id={`thin-${id}`}
        edge={edge}
        solidTo={solidTo}
        clearAt={1}
        radius={GLASS.thinBlur}
        tint={dark ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight"}
      />
      <Pane
        id={`thick-${id}`}
        edge={edge}
        solidTo={solidTo}
        clearAt={fadeStop(solidTo, GLASS.thickReach)}
        radius={GLASS.blur}
        tint={dark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"}
      />
      <Ramp
        id={`scrim-${id}`}
        edge={edge}
        solidTo={solidTo}
        clearAt={1}
        colour={ground}
        opacity={GLASS.scrim}
      />
    </View>
  );
}

/**
 * One blurred pane of a band, solid against the edge and gone by `clearAt`.
 *
 * The blur is a blur alone where the build has one (`ClearBlur`, ADR 0129): a material lays a tint
 * over what it blurs, and over the dark page that tint stood as a grey shelf under the name.
 * Without it, the pane is the material it was until 6 October 2026.
 */
function Pane({
  id,
  edge,
  solidTo,
  clearAt,
  radius,
  tint,
}: {
  readonly id: string;
  readonly edge: "top" | "bottom";
  readonly solidTo: number;
  readonly clearAt: number;
  /** The untinted blur's radius, in points. */
  readonly radius: number;
  /** The material where there is no untinted blur. */
  readonly tint:
    | "systemUltraThinMaterialDark"
    | "systemUltraThinMaterialLight"
    | "systemChromeMaterialDark"
    | "systemChromeMaterialLight";
}) {
  return (
    <MaskedView
      style={StyleSheet.absoluteFill}
      maskElement={
        <Ramp
          id={id}
          edge={edge}
          solidTo={solidTo}
          clearAt={clearAt}
          colour="#000000"
          opacity={SOLID}
        />
      }
    >
      {hasClearBlur() ? (
        <ClearBlur radius={radius} style={StyleSheet.absoluteFill} />
      ) : (
        <BlurView intensity={INTENSITY} tint={tint} style={StyleSheet.absoluteFill} />
      )}
    </MaskedView>
  );
}

/**
 * The gradient every layer of a band is cut from: solid against the edge, clear by `clearAt` —
 * the far end of the ramp, or, for the bar's own material, part of the way down it. Drawn with `react-native-svg` rather than a background image because the room
 * already samples a gradient this way (`spaces/ScrollColours.tsx`), and one way of drawing a
 * gradient in this app is enough.
 */
function Ramp({
  id,
  edge,
  solidTo,
  clearAt,
  colour,
  opacity,
}: {
  readonly id: string;
  readonly edge: "top" | "bottom";
  readonly solidTo: number;
  readonly clearAt: number;
  readonly colour: string;
  readonly opacity: number;
}) {
  // The gradient always runs from the edge inwards: down the band at the top of the screen, up
  // it at the bottom.
  const [y1, y2] = edge === "top" ? ["0%", "100%"] : ["100%", "0%"];
  return (
    // In a unit box stretched to the band at every draw, as the room's field is (`FieldPicture`, in
    // `spaces/ScrollColours.tsx`): a rectangle sized in percent is worked out once and kept.
    <Svg
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
    >
      <Defs>
        <LinearGradient id={id} x1="0%" x2="0%" y1={y1} y2={y2}>
          <Stop offset={0} stopColor={colour} stopOpacity={opacity} />
          <Stop offset={solidTo} stopColor={colour} stopOpacity={opacity} />
          <Stop offset={clearAt} stopColor={colour} stopOpacity={CLEAR} />
        </LinearGradient>
      </Defs>
      <Rect width={1} height={1} fill={`url(#${id})`} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  capsule: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    // A capsule is a thing lifted off the page, and the shadow is the only thing that says so
    // once the glass is this thin.
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  band: { position: "absolute", left: 0, right: 0 },
  aside: {
    alignSelf: "flex-start",
    borderRadius: RADIUS.xxl,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
});
