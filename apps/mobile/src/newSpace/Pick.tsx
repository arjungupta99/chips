/**
 * Who the + asks for a room: a row of their faces, and a line under it that says what a send
 * will do (ADR 0084).
 *
 * It was a row of chips that shared the card's width, so at five agents the names were cut to
 * "A…" and "Can't answer now" broke a letter to a line, and a tap put an agent in beside the one
 * picked rather than choosing it (28 September 2026). Now each agent is its face, at a size that
 * fits five and a half across the card, and the row scrolls sideways past that, faded at whichever
 * edge has more beyond it. A picked face wears the gold ring and a check; the rest step back. A
 * name of two words takes two lines under its face, and the row is as tall as its tallest. The
 * row is one height whatever is picked, and so is the line, so nothing in the card moves under
 * the thumb and the card, which stands on the keyboard, never grows.
 *
 * What a tap does is core's `newSpacePicks`: the first chooses, the rest add and take away. What
 * the line says is core's too (`newSpaceLine`), so the desktop's dialog says the same. With several
 * picked it says who leads, and the lead's name is a button that hands the lead to the next one
 * picked (ADR 0149's addendum): the faces are picked in whatever order, and the lead chosen after.
 *
 * The + window's row starts with Empty (ADR 0148): a face drawn in dashes, for a room made by its
 * name alone and filled with agents before anybody starts in it. It is picked as a face is, and
 * never beside one.
 */

import type { Participant } from "@chipschat/core";
import {
  cantAnswer,
  EMPTY_ROOM,
  EMPTY_ROOM_LINE,
  NEW_SPACE_ALONE_LINE,
  type NewSpaceLine,
  newSpaceLine,
} from "@chipschat/core";
import MaskedView from "@react-native-masked-view/masked-view";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Path, Svg } from "react-native-svg";
import { Avatar, avatarCorner, avatarSide } from "../ui/Avatar";
import { Fades } from "../ui/Fades";
import { tick } from "../ui/haptics";
import { Icon } from "../ui/Icon";
import { usePalette } from "../ui/theme";
import { TEXT } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";

/** What the + says of an agent that is offline or in trouble (ADR 0083). */
export const CANT_ANSWER = "Can't answer now";

const FACE = avatarSide("pick");
/** A face's corner in the row, which the gold ring and Empty's dashes follow. */
const CORNER = avatarCorner("pick", "harness");
/** A face and room for its name under it; with the gap, five and a half across the card. */
const TILE = 62;
const GAP = 4;
/** The gold ring stands this far off the face. */
const RING = 4.5;
const CHECK = 20;
/** Above the face, room for the ring. */
const TOP = 6;
/** How far a fade runs in from an edge with more beyond it. */
const FADE = 28;
/** A picked face is itself; the rest step back to this. */
const BACK = { opacity: 0.42, scale: 0.88 } as const;

/** Whether an agent can't answer now: offline, or in trouble it reported. */
export function unable(agent: Participant): boolean {
  return cantAnswer({ [agent.id]: agent }, agent.id) !== undefined;
}

export function Pick({
  harnesses,
  picked,
  onChoose,
  onLead,
  inset,
  says = true,
  empty,
  testID = "new-space-pick",
}: {
  readonly harnesses: readonly Participant[];
  readonly picked: readonly Participant[];
  /** A face's id, or `EMPTY_ROOM` for Empty. */
  readonly onChoose: (harnessId: string) => void;
  /** The lead's name tapped, with several picked. Absent, the line only says who leads. */
  readonly onLead?: (() => void) | undefined;
  /** The card's padding: the row runs to the card's edges and scrolls from inside them. */
  readonly inset: number;
  /**
   * The line under the faces that says what a send will do. The room sheet's New agent page
   * (ADR 0108) picks one harness for one agent, and says what the name will be instead.
   */
  readonly says?: boolean;
  /**
   * Whether Empty leads the row, and is picked (ADR 0148): the + window's. Absent, there is no
   * Empty face, as on the room sheet's New agent page.
   */
  readonly empty?: { readonly on: boolean } | undefined;
  readonly testID?: string;
}) {
  const [edges, setEdges] = useState({ start: false, end: false });
  const width = useRef(0);
  const content = useRef(0);
  const scroll = useRef<ScrollView>(null);
  const firstPicked = empty?.on === true ? EMPTY_ROOM : picked[0]?.id;
  // Where each face is in the row, Empty first when it is there.
  const order = [...(empty === undefined ? [] : [EMPTY_ROOM]), ...harnesses.map((each) => each.id)];
  const seen = (x: number) => {
    const start = x > 1;
    const end = x + width.current < content.current - 1;
    setEdges((now) => (now.start === start && now.end === end ? now : { start, end }));
  };
  // Opened on someone past the card's edge, the row starts where they are.
  const opened = useRef(false);
  const place = () => {
    if (opened.current || width.current === 0 || content.current === 0) return;
    opened.current = true;
    const at = order.indexOf(firstPicked ?? "");
    const x = Math.min(
      Math.max(0, inset + at * (TILE + GAP) + TILE / 2 - width.current / 2),
      Math.max(0, content.current - width.current),
    );
    if (at > 0 && x > 0) scroll.current?.scrollTo({ x, animated: false });
    seen(x);
  };
  // Nobody takes new spaces: Empty is all there is, so there is no row to pick from, only what a
  // send will make (ADR 0148), as on the desktop.
  if (empty !== undefined && harnesses.length === 0) {
    return (
      <View style={[styles.who, { marginHorizontal: -inset }]}>
        {says ? <Says picked={picked} empty alone inset={inset} /> : null}
      </View>
    );
  }
  const row = (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      // A tap on a face keeps the keyboard where it is: the words are what the window is for.
      keyboardShouldPersistTaps="always"
      contentContainerStyle={[styles.row, { paddingHorizontal: inset }]}
      scrollEventThrottle={16}
      onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) =>
        seen(event.nativeEvent.contentOffset.x)
      }
      onLayout={(event) => {
        width.current = event.nativeEvent.layout.width;
        place();
      }}
      onContentSizeChange={(w) => {
        content.current = w;
        place();
      }}
      accessibilityLabel="Ask"
      testID={testID}
    >
      {empty === undefined ? null : (
        <Tile
          testID={`${testID}-${EMPTY_ROOM}`}
          name="Empty"
          label="Empty space"
          face={<EmptyFace />}
          on={empty.on}
          onPress={() => {
            tick();
            onChoose(EMPTY_ROOM);
          }}
        />
      )}
      {harnesses.map((each) => {
        const cant = unable(each);
        return (
          <Tile
            key={each.id}
            testID={`${testID}-${each.id}`}
            name={each.displayName}
            label={cant ? `${each.displayName}, ${CANT_ANSWER}` : each.displayName}
            face={<HarnessFace harness={each} cant={cant} />}
            on={picked.some((one) => one.id === each.id)}
            onPress={() => {
              tick();
              onChoose(each.id);
            }}
          />
        );
      })}
    </ScrollView>
  );
  return (
    <View style={[styles.who, { marginHorizontal: -inset }]}>
      {/* Always masked, so a row that comes to overflow is never remounted and loses its place.
          Not in a browser, where the mask hides what it holds: there the row runs to the edge. */}
      {Platform.OS === "web" ? (
        row
      ) : (
        <MaskedView maskElement={<Fades start={edges.start} end={edges.end} length={FADE} />}>
          {row}
        </MaskedView>
      )}
      {says ? (
        <Says picked={picked} empty={empty?.on === true} inset={inset} onLead={onLead} />
      ) : null}
    </View>
  );
}

/** An agent's face, as the + offers it: amber-marked when it can't answer now. */
function HarnessFace({ harness, cant }: { readonly harness: Participant; readonly cant: boolean }) {
  const palette = usePalette();
  return (
    <Avatar
      name={harness.displayName}
      kind="harness"
      size="pick"
      decorative
      cantAnswer={cant}
      // The check takes the right corner.
      markSide="left"
      ground={palette.surface}
    />
  );
}

/** Empty's face: a face's outline in dashes, with a room's bubble in it and nobody (ADR 0148). */
function EmptyFace() {
  const palette = usePalette();
  return (
    <View style={[styles.empty, { borderColor: palette.ink3 }]}>
      <Icon name="chat" size={22} color={palette.ink2} />
    </View>
  );
}

/** One face: gold-ringed and checked when picked, with its name under it. */
function Tile({
  name,
  label,
  face,
  on,
  onPress,
  testID,
}: {
  readonly name: string;
  /** What a screen reader says of it. */
  readonly label: string;
  readonly face: ReactNode;
  readonly on: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const palette = usePalette();
  const still = useReduceMotion();
  const shown = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(shown, {
      toValue: on ? 1 : 0,
      duration: still ? 0 : 170,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [on, shown, still]);
  return (
    <Pressable
      accessibilityRole="checkbox"
      // The ARIA prop, which the browser build reads as well as the phones; `accessibilityState`
      // never reaches the page there.
      aria-checked={on}
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.tile}
      testID={testID}
    >
      <Animated.View
        style={{
          opacity: shown.interpolate({ inputRange: [0, 1], outputRange: [BACK.opacity, 1] }),
          transform: [
            { scale: shown.interpolate({ inputRange: [0, 1], outputRange: [BACK.scale, 1] }) },
          ],
        }}
      >
        {face}
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.ring, { borderColor: palette.gold, opacity: shown }]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.check, { backgroundColor: palette.gold, transform: [{ scale: shown }] }]}
      >
        <Svg width={11} height={11} viewBox="0 0 12 12">
          <Path
            d="M2.5 6.2 5 8.6l4.6-5"
            fill="none"
            stroke="#231a00"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Animated.View>
      {/* A name of words takes a second line, as a person's does under a face in the share sheet:
          "Claude Code" was cut to "Claude…". One word stays on one, which a second line would
          only break inside. */}
      <Text
        numberOfLines={/\s/.test(name) ? 2 : 1}
        style={[styles.name, { color: on ? palette.ink : palette.ink3 }]}
      >
        {name}
      </Text>
    </Pressable>
  );
}

/**
 * The line under the faces: who joins and that they wait, and with several who leads, or why it
 * would wait, or that the room will be empty, or, with no faces at all, what the room will be. The
 * lead's name, with several picked, is a button: a tap hands the lead to the next one picked. Its
 * target reaches past the line's 19 points, so the card does not grow for it.
 */
function Says({
  picked,
  empty,
  alone = false,
  inset,
  onLead,
}: {
  readonly picked: readonly Participant[];
  readonly empty: boolean;
  /** Nobody to ask, so no faces above it. */
  readonly alone?: boolean;
  readonly inset: number;
  readonly onLead?: (() => void) | undefined;
}) {
  const palette = usePalette();
  const says: NewSpaceLine = alone
    ? { words: NEW_SPACE_ALONE_LINE, warn: false }
    : empty
      ? { words: EMPTY_ROOM_LINE, warn: false }
      : (newSpaceLine(picked) ?? { words: "Pick who to ask", warn: false });
  const ink = says.warn ? palette.amberInk : palette.ink3;
  const lead =
    says.lead === undefined ? null : (
      <Text style={[styles.lead, { color: palette.ink2 }]}>{says.lead}</Text>
    );
  if (says.leads !== undefined && onLead !== undefined) {
    return (
      <View
        accessibilityLiveRegion="polite"
        style={[styles.saysRow, { marginHorizontal: inset }]}
        testID="new-space-says"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${says.lead ?? ""}${says.leads}`}
          accessibilityHint={`Hands the lead to ${says.next ?? ""}`}
          hitSlop={LEAD_SLOP}
          onPress={() => {
            tick();
            onLead();
          }}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          testID="new-space-lead"
        >
          <Text numberOfLines={1} style={[styles.says, { color: ink }]}>
            {lead}
            {says.leads}
            <Text style={{ color: palette.goldDeep }}>{" ⇄"}</Text>
          </Text>
        </Pressable>
        <Text numberOfLines={1} style={[styles.says, styles.rest, { color: ink }]}>
          {says.words}
        </Text>
      </View>
    );
  }
  return (
    <Text
      numberOfLines={1}
      accessibilityLiveRegion="polite"
      style={[styles.says, styles.saysAlone, { marginHorizontal: inset, color: ink }]}
      testID="new-space-says"
    >
      {lead}
      {says.leads}
      {says.words}
    </Text>
  );
}

/** The lead's name reaches a thumb's height above and below the line. */
const LEAD_SLOP = { top: 12, bottom: 12, left: 6, right: 6 } as const;

const styles = StyleSheet.create({
  who: { marginTop: 10 },
  row: { gap: GAP },
  tile: { width: TILE, alignItems: "center", paddingTop: TOP, gap: 6 },
  ring: {
    position: "absolute",
    top: TOP - RING,
    left: (TILE - FACE) / 2 - RING,
    width: FACE + RING * 2,
    height: FACE + RING * 2,
    borderRadius: CORNER + RING,
    borderWidth: 2,
  },
  check: {
    position: "absolute",
    top: TOP + FACE + 5 - CHECK,
    left: (TILE + FACE) / 2 + 5 - CHECK,
    width: CHECK,
    height: CHECK,
    borderRadius: CHECK / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: TEXT.xs + 0.5, lineHeight: 15, maxWidth: TILE - 2, textAlign: "center" },
  says: { fontSize: TEXT.sm, lineHeight: 19, height: 19 },
  saysAlone: { marginTop: 8 },
  saysRow: { marginTop: 8, flexDirection: "row", alignItems: "center" },
  rest: { flexShrink: 1 },
  empty: {
    width: FACE,
    height: FACE,
    borderRadius: CORNER,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  lead: { fontWeight: "600" },
});
