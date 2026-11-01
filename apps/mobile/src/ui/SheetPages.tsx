/**
 * Pages inside a sheet, and the way one gives way to the next (ADR 0110; Arjun, 3 October 2026:
 * "navigating from screen to screen should be super smooth within it").
 *
 * One page fades into the next where it stands, and the only thing that travels is the sheet's
 * top, gliding to the new page's height (`Sheet.tsx`) with the pages riding on it. The pages first
 * slid in from the side as a stack's screens do, but a slide across while the top glides up or
 * down moves the words on a slant, and on his iPhone "the motion looks diagonal". So nothing
 * goes sideways. The page it replaces is not dropped: it stays, at the height it had and with its
 * list where it was scrolled, and fades out quickly while the new one fades in, so neither blinks
 * and the two are seen together as little as can be. The turn waits for the new page to be laid
 * out, which is when the sheet learns its height, so the fade and the glide start on the same
 * frame. One spring for all of it, the app's (`IOS_SPRING`).
 *
 * Which page is shown is the caller's, as a value; what each page is called (`keyOf`) says when
 * it has changed. Every page is drawn by `render`, so the one leaving still shows what is true now
 * rather than a picture of it. Pages are column children of a bounded sheet, so a page's own
 * scroll view shrinks to what the sheet leaves it.
 */

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Animated, type LayoutChangeEvent, Platform, StyleSheet, View } from "react-native";
import { IOS_SPRING } from "./motion";

/** The page leaving is gone by this much of the turn, before the new one is much more than seen. */
const GONE_BY = 0.35;
/** The new page fades in over this much of it. */
const IN_FROM = 0.15;
const IN_BY = 0.75;
/** A turn that never hears its page laid out (a page shown again before it had gone) waits this. */
const LATE_MS = 64;
const NATIVE = Platform.OS !== "web";

/** One change of page: where it goes, what it leaves, and its own clock. */
interface Turn<P> {
  readonly to: P;
  readonly from: P | undefined;
  /** Nought as the turn starts, one when it is over. */
  readonly t: Animated.Value;
  /** The page going in was already there, leaving, and will not be laid out anew. */
  readonly again: boolean;
}

export function SheetPages<P>({
  page,
  keyOf,
  render,
}: {
  readonly page: P;
  readonly keyOf: (page: P) => string;
  readonly render: (page: P) => ReactNode;
}) {
  const [turn, setTurn] = useState<Turn<P>>(() => ({
    to: page,
    from: undefined,
    t: new Animated.Value(1),
    again: false,
  }));
  // A new page: the turn to it is set here, in the render that first sees it, so the new page is
  // never drawn without its turn (React renders again at once, before anything is committed).
  let now = turn;
  if (keyOf(page) !== keyOf(turn.to)) {
    now = {
      to: page,
      from: turn.to,
      t: new Animated.Value(0),
      again: turn.from !== undefined && keyOf(turn.from) === keyOf(page),
    };
    setTurn(now);
  }
  // Each page's height when last it was laid out: the one leaving keeps it, out of the column.
  const heights = useRef<Record<string, number>>({});
  const begun = useRef<Turn<P> | undefined>(undefined);
  const start = (which: Turn<P>) => {
    if (which.from === undefined || begun.current === which) return;
    begun.current = which;
    Animated.spring(which.t, { toValue: 1, ...IOS_SPRING, useNativeDriver: NATIVE }).start(
      ({ finished }) => {
        if (finished) setTurn((was) => (was === which ? { ...was, from: undefined } : was));
      },
    );
  };
  const starts = useRef(start);
  starts.current = start;
  useEffect(() => {
    if (turn.from === undefined) return;
    if (turn.again) return starts.current(turn);
    // The new page's layout starts the turn; this is for one that is never laid out (a test).
    const late = setTimeout(() => starts.current(turn), LATE_MS);
    return () => clearTimeout(late);
  }, [turn]);

  const fades = useMemo(
    () => ({
      coming: {
        opacity: turn.t.interpolate({
          inputRange: [IN_FROM, IN_BY],
          outputRange: [0, 1],
          extrapolate: "clamp",
        }),
      },
      going: {
        opacity: turn.t.interpolate({
          inputRange: [0, GONE_BY],
          outputRange: [1, 0],
          extrapolate: "clamp",
        }),
      },
    }),
    [turn.t],
  );

  const shown = keyOf(now.to);
  const leaving = now.from;
  const onLayout = (event: LayoutChangeEvent) => {
    heights.current[shown] = event.nativeEvent.layout.height;
    start(now);
  };
  return (
    <View style={styles.pages}>
      {leaving === undefined ? null : (
        <Animated.View
          key={keyOf(leaving)}
          testID={`sheet-page-${keyOf(leaving)}`}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.leaving, { height: heights.current[keyOf(leaving)] }, fades.going]}
        >
          {render(leaving)}
        </Animated.View>
      )}
      <Animated.View
        key={shown}
        testID={`sheet-page-${shown}`}
        onLayout={onLayout}
        style={[styles.page, fades.coming]}
      >
        {render(page)}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  pages: { flexShrink: 1, minHeight: 0 },
  page: { flexShrink: 1, minHeight: 0 },
  leaving: { position: "absolute", top: 0, left: 0, right: 0 },
});
