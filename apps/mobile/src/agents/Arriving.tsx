/**
 * The Agents tab before this phone has ever had the server's list (14 October 2026): just paired,
 * or the first launch of a build that keeps it. Every launch after that lists what was kept, at
 * once (`agentsLook`), so this is seen once, for as long as the server takes to answer.
 *
 * Rows in the rows' own shape, as Spaces stands placeholders for rooms on their way (ADR 0131),
 * but each face is a blank agent: the bitten chip with its pins, and the light that runs round a
 * working agent's pins (ADR 0089) running round these, one row after another down the list. The
 * bars under the names stay flat and still: the pins carry the motion, and the motion is the one
 * thing an agent's face already does when something is going on. The harnesses' tiles stand on
 * their shelf above them (ADR 0185) still, blank, with no pins: a harness's face is a squircle.
 *
 * Then the list comes in over it (`Arrive`, as Spaces' rooms do), with nothing moving under it:
 * the tiles, the rows and the headings stand where the real ones will.
 */

import { agentsLook, type Snapshot } from "@chipschat/core";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { Path, Svg } from "react-native-svg";
import { thisDevice } from "../device/word";
import { SHELF_TILE, VIEW_ALL_HEIGHT } from "../harnesses/Shelf";
import { avatarCorner, avatarSide, ROW_AVATAR } from "../ui/Avatar";
import { BODY_WITH_PINS, bittenPath, PIN_STEP_MS, PINS, pinsOf } from "../ui/outline";
import { Empty } from "../ui/Screen";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE } from "../ui/tokens";
import type { Turns } from "../ui/turns";
import { useReduceMotion } from "../ui/useReduceMotion";
import { useTurns } from "../ui/useTurns";
import { SectionHeading } from "./AgentRow";

/** A blank face's pins: barely there at rest, and lit to most of the way when the light reaches. */
const BLANK_REST = 0.14;
const BLANK_LIT = 0.85;
/** Held still, for Reduce Motion: a little more than at rest, so the pins still read. */
const BLANK_STILL = 0.3;

/** The working face's circuit (`AgentFace`), over a blank face's own rest and light. */
const ROUND: Turns = {
  count: PINS.at.length,
  stepMs: PIN_STEP_MS,
  riseMs: 130,
  fallMs: 260,
  low: BLANK_REST,
  high: BLANK_LIT,
  rise: Easing.out(Easing.quad),
  fall: Easing.in(Easing.quad),
  ring: true,
};

/** How far behind the row above each row's light starts: a wave down the list, not a flash. */
const ROW_STEP_MS = 140;

/** Lengths for a row's name and the line under it, so the rows do not read as one stamp. */
const NAMES = ["34%", "26%", "40%", "30%"] as const;
const LINES = ["58%", "70%", "50%", "64%"] as const;
const TILE_NAMES = ["62%", "48%", "56%"] as const;
const TILE_LINES = ["44%", "58%", "40%"] as const;

export function Arriving() {
  const palette = usePalette();
  return (
    <View testID="agents-fetching" accessible accessibilityLabel="Loading your agents">
      <View style={styles.shelf}>
        <View style={styles.tiles}>
          {[0, 1, 2].map((at) => (
            <Tile key={at} at={at} />
          ))}
        </View>
        <View style={[styles.all, { backgroundColor: palette.surface2 }]} />
      </View>
      {/* Where a Main agent stands: first, under no heading. */}
      <Row at={0} first />
      <SectionHeading>Agents</SectionHeading>
      {[1, 2, 3].map((at) => (
        <Row key={at} at={at} first={at === 1} />
      ))}
    </View>
  );
}

function Row({ at, first }: { readonly at: number; readonly first: boolean }) {
  const palette = usePalette();
  const quiet = { backgroundColor: palette.surface2 };
  return (
    <View style={styles.row}>
      {first ? null : <View style={[styles.hairline, { backgroundColor: palette.line }]} />}
      <BlankFace side={ROW_AVATAR} delayMs={at * ROW_STEP_MS} />
      <View style={styles.bars}>
        <View style={[styles.bar, quiet, { width: NAMES[at % NAMES.length] }]} />
        <View style={[styles.bar, styles.thin, quiet, { width: LINES[at % LINES.length] }]} />
      </View>
    </View>
  );
}

/** A harness's tile on the shelf (`Shelf`): its squircle, and a bar for its name and its line. */
function Tile({ at }: { readonly at: number }) {
  const palette = usePalette();
  const quiet = { backgroundColor: palette.surface3 };
  const side = avatarSide("pick");
  return (
    <View style={[styles.tile, { backgroundColor: palette.surface2 }]}>
      <View
        style={[
          quiet,
          { width: side, height: side, borderRadius: avatarCorner("pick", "harness") },
        ]}
      />
      <View style={[styles.bar, quiet, styles.tileName, { width: TILE_NAMES[at] }]} />
      <View style={[styles.bar, styles.thin, quiet, { width: TILE_LINES[at] }]} />
    </View>
  );
}

/**
 * An agent's or a harness's page with nobody by that id in the directory. That is only "no agent by
 * that name" once the server has said who is who: opened before then — from a link, on the first
 * launch after pairing — the page waits for the list, and says it is waiting when it can't be had.
 */
export function NotFound({
  snapshot,
  what,
}: {
  readonly snapshot: Pick<
    Snapshot,
    "connection" | "readingCache" | "directoryFrom" | "directoryFailed"
  >;
  readonly what: "agent" | "harness" | "job";
}) {
  const look = agentsLook(snapshot);
  if (look === "reading" || look === "fetching") return null;
  if (look === "listed")
    return <Empty>{`This workspace has no ${what} by that name on ${thisDevice()}.`}</Empty>;
  return <Empty>{`This ${what} will show here once your server answers.`}</Empty>;
}

/**
 * An agent's face with nobody in it yet: the bitten body in the page's quiet colour, flat as the
 * bars beside it are (a lit ground made it a puffy white blob in light mode), and its pins in the
 * ink, lit in turn as a working face's are (`AgentFace`). `side` is the whole face, pins and all,
 * as an agent's is from thirty-two points up.
 */
export function BlankFace({
  side,
  delayMs = 0,
}: {
  readonly side: number;
  readonly delayMs?: number;
}) {
  const palette = usePalette();
  const still = useReduceMotion();
  const lights = useTurns(ROUND, !still, delayMs);
  const body = side * BODY_WITH_PINS;
  const inset = (side - body) / 2;
  return (
    <View style={{ width: side, height: side }} testID="blank-face">
      <View style={{ position: "absolute", left: inset, top: inset, width: body, height: body }}>
        {pinsOf(body).map((pin, index) => (
          <Animated.View
            key={pin.key}
            style={{
              position: "absolute",
              left: pin.x,
              top: pin.y,
              width: pin.w,
              height: pin.h,
              borderRadius: Math.min(pin.w, pin.h) / 2,
              backgroundColor: palette.ink3,
              opacity: still ? BLANK_STILL : (lights[index] ?? BLANK_REST),
            }}
          />
        ))}
        <Svg width={body} height={body} style={StyleSheet.absoluteFill}>
          <Path d={bittenPath(0, 0, body)} fill={palette.surface2} />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // An agent's row (`AgentRow`): eighty points round a 56-point face, the words beside it.
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    minHeight: 80,
  },
  hairline: {
    position: "absolute",
    left: SPACE.lg + ROW_AVATAR + SPACE.md,
    right: 0,
    top: 0,
    height: StyleSheet.hairlineWidth,
  },
  bars: { flex: 1, gap: 9 },
  bar: { height: 11, borderRadius: 6 },
  thin: { height: 9, opacity: 0.7 },
  // The shelf (`Shelf`): tiles in a row, as many as fit, where the real ones will stand.
  shelf: { paddingTop: SPACE.xs, paddingBottom: SPACE.xs, gap: SPACE.sm },
  tiles: { flexDirection: "row", gap: SPACE.sm, paddingHorizontal: SPACE.lg, overflow: "hidden" },
  // Where View all will be: its capsule, blank.
  all: { width: 78, height: VIEW_ALL_HEIGHT, marginLeft: SPACE.lg, borderRadius: RADIUS.pill },
  tile: {
    width: SHELF_TILE,
    alignItems: "center",
    gap: 6,
    paddingTop: SPACE.md,
    paddingBottom: SPACE.md,
    borderRadius: RADIUS.xxl + 2,
  },
  tileName: { marginTop: SPACE.xs },
});
