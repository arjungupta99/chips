/**
 * The harnesses' shelf at the head of the Agents tab (ADR 0185; Arjun, 17 October 2026: "Let's do
 * B shelf of harness. I also want a mini view all option under it"): a tile for each harness, its
 * face wearing its ring, its name and one line, pushed sideways; Connect a harness at the shelf's
 * end, for whoever may (Arjun, 17 October 2026: "I do not expect connect a harness to be use a whole
 * lot, so let's keep it as the last tile"; it is on You as well, ADR 0185's addendum); and View all under it, which opens their cards in a list of their own
 * (`All`). The cards stood at the foot of the tab until then, under every agent, three screens down.
 *
 * Beside a room on an iPad the list has the height for every tile, so the shelf is a grid of them,
 * two to a row, each with its face beside its words, and View all goes: nothing is cut off, and
 * Connect is the last tile (ADR 0256).
 *
 * Which harnesses, in what order, and the words that are not state are core's (`harnessShelf`), so
 * the desktop shelves them alike. The line under a name is why the harness can't answer, in amber;
 * or what it is doing, in the status's own word and tone (the card's pill, the verb held as the
 * bubble holds it, ADR 0147); or how many agents it has.
 */

import {
  type AgentsTab,
  agentCountWords,
  fleetDoing,
  type HarnessTile,
  harnessShelf,
  type Snapshot,
} from "@chipschat/core";
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { useHeld } from "../spaces/Thinking";
import { Avatar, avatarCorner, avatarSide } from "../ui/Avatar";
import { Icon } from "../ui/Icon";
import { useSplitSide } from "../ui/Split";
import { usePalette } from "../ui/theme";
import type { Palette } from "../ui/tokens";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";
import { type HarnessStatus, STATUS, type Tone } from "../ui/vocabulary";
import type { Connecting } from "./Connect";
import { saysStatus, statusOf } from "./words";

/** A tile's width: three and a half fill a phone, so the fourth shows there are more. */
export const SHELF_TILE = 96;

/** View all's height: a capsule a size down from a button. */
export const VIEW_ALL_HEIGHT = 28;

export function Shelf({
  snapshot,
  tab,
  selected,
  adding,
  onOpen,
  onAll,
}: {
  readonly snapshot: Snapshot;
  readonly tab: AgentsTab;
  /** The harness open beside the list, on a wide screen. */
  readonly selected: string | undefined;
  /**
   * Connect a harness (ADR 0190), for an owner or an admin; absent for anybody else. While this
   * phone's link waits, the tile says so.
   */
  readonly adding: Pick<Connecting, "open" | "waiting"> | undefined;
  readonly onOpen: (harnessId: string) => void;
  readonly onAll: () => void;
}) {
  const tiles = harnessShelf(tab, snapshot.directory);
  // The tiles there when the shelf was first drawn: one that comes after lands (ADR 0190).
  const seen = useRef<ReadonlySet<string> | undefined>(undefined);
  seen.current ??= new Set(tiles.map((tile) => tile.id));
  const grid = useSplitSide() === "list";
  // Nothing to shelve and nothing to add: the agents' own empty words say the rest.
  if (tiles.length === 0 && adding === undefined) return null;
  const drawn = [
    ...tiles.map((tile) => (
      <Landing key={tile.id} lands={seen.current?.has(tile.id) === false}>
        <Tile snapshot={snapshot} tile={tile} selected={tile.id === selected} onOpen={onOpen} />
      </Landing>
    )),
    ...(adding === undefined ? [] : [<AddTile key="add" adding={adding} />]),
  ];
  if (grid) {
    return (
      <ShelfGrid.Provider value>
        <Grid cells={drawn} />
      </ShelfGrid.Provider>
    );
  }
  return (
    <View style={styles.shelf}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.box}
        contentContainerStyle={styles.row}
        accessibilityLabel="Harnesses"
        testID="harness-shelf"
      >
        {drawn}
      </ScrollView>
      {tiles.length === 0 ? null : <ViewAll onPress={onAll} />}
    </View>
  );
}

/** The tiles stand in the grid beside a room, rather than on the shelf. */
const ShelfGrid = createContext(false);

/**
 * The tiles two to a row, each half of what the list leaves inside its margins: rows of two that
 * share it, rather than tiles of a width worked out from the list's, which its hairline at the
 * right made half a point too wide for two (the iPad simulator, 1 November 2026).
 */
function Grid({ cells }: { readonly cells: readonly ReactElement[] }) {
  const rows: ReactElement[][] = [];
  for (const [at, cell] of cells.entries()) {
    if (at % 2 === 0) rows.push([cell]);
    else rows.at(-1)?.push(cell);
  }
  return (
    <View style={styles.grid} accessibilityLabel="Harnesses" testID="harness-shelf">
      {rows.map((row) => (
        <View key={row[0]?.key} style={styles.gridRow}>
          {row.map((cell) => (
            <View key={cell.key} style={styles.cell}>
              {cell}
            </View>
          ))}
          {row.length === 1 ? <View style={styles.cell} /> : null}
        </View>
      ))}
    </View>
  );
}

/** A tile's face and words: stacked on the shelf, side by side in the grid. */
function TileBody({
  face,
  name,
  line,
}: {
  readonly face: ReactNode;
  readonly name: ReactNode;
  readonly line: ReactNode;
}) {
  if (!useContext(ShelfGrid)) {
    return (
      <>
        {face}
        {name}
        {line}
      </>
    );
  }
  return (
    <>
      {face}
      <View style={styles.words}>
        {name}
        {line}
      </View>
    </>
  );
}

/** The tile's own box: a column on the shelf, its face beside its words in the grid. */
function useTileBox() {
  return useContext(ShelfGrid) ? styles.flat : styles.tile;
}

/** One harness: its face and ring, its name, and its line. */
function Tile({
  snapshot,
  tile,
  selected,
  onOpen,
}: {
  readonly snapshot: Snapshot;
  readonly tile: HarnessTile;
  readonly selected: boolean;
  readonly onOpen: (harnessId: string) => void;
}) {
  const palette = usePalette();
  const entry = snapshot.model.fleet.find((each) => each.harnessId === tile.id);
  const status = statusOf(entry);
  // Why it can't answer comes first, in the ring as in the line: a run left open by a harness that
  // went offline is not work going on.
  const says = tile.trouble === undefined && saysStatus(status) ? status : undefined;
  const ground = selected ? palette.surface3 : palette.surface2;
  const box = useTileBox();
  const flat = useContext(ShelfGrid);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tile.name}
      aria-selected={selected}
      onPress={() => onOpen(tile.id)}
      testID={`harness-tile-${tile.id}`}
      style={({ pressed }) => [box, { backgroundColor: pressed ? palette.surface3 : ground }]}
    >
      <TileBody
        face={
          <Avatar
            name={tile.name}
            kind="harness"
            size={flat ? "sm" : "pick"}
            cantAnswer={tile.trouble !== undefined}
            ground={ground}
            {...(says === undefined ? {} : { status: says })}
          />
        }
        name={<Name words={tile.name} />}
        line={
          tile.trouble !== undefined ? (
            <Line words={tile.trouble} colour={palette.amberInk} />
          ) : says === undefined ? (
            <Line words={agentCountWords(tile.agents)} colour={palette.ink3} />
          ) : (
            <StatusLine snapshot={snapshot} status={says} harnessId={tile.id} />
          )
        }
      />
    </Pressable>
  );
}

/** What it is doing: the status's word in its tone, or the held verb while it works. */
function StatusLine({
  snapshot,
  status,
  harnessId,
}: {
  readonly snapshot: Snapshot;
  readonly status: HarnessStatus;
  readonly harnessId: string;
}) {
  const palette = usePalette();
  const entry = snapshot.model.fleet.find((each) => each.harnessId === harnessId);
  const doing = status === "working" ? fleetDoing(snapshot.model.spaces, entry) : undefined;
  const colour = toneInk(palette, STATUS[status].tone);
  if (doing === undefined) return <Line words={STATUS[status].label} colour={colour} />;
  return <HeldLine doing={doing} colour={colour} />;
}

function HeldLine({
  doing,
  colour,
}: {
  readonly doing: NonNullable<ReturnType<typeof fleetDoing>>;
  readonly colour: string;
}) {
  return <Line words={useHeld(doing).label} colour={colour} />;
}

/** A tile's name: under the face on the shelf, beside it in the grid. */
function Name({ words }: { readonly words: string }) {
  const palette = usePalette();
  const flat = useContext(ShelfGrid);
  return (
    <Text style={[flat ? styles.flatName : styles.name, { color: palette.ink }]} numberOfLines={1}>
      {words}
    </Text>
  );
}

function Line({ words, colour }: { readonly words: string; readonly colour: string }) {
  return (
    <Text style={[styles.line, { color: colour }]} numberOfLines={1}>
      {words}
    </Text>
  );
}

/** The word's colour for a status's tone, as its pill's ink. */
function toneInk(palette: Palette, tone: Tone): string {
  const table = {
    neutral: palette.ink3,
    blue: palette.blueInk,
    amber: palette.amberInk,
    red: palette.redInk,
    green: palette.greenInk,
  } as const;
  return table[tone];
}

/**
 * A tile that came onto the shelf after it was drawn: a harness that has just connected (ADR
 * 0190). It drops in from a little above, a size small, on a spring with some give.
 */
function Landing({ lands, children }: { readonly lands: boolean; readonly children: ReactNode }) {
  const less = useReduceMotion();
  const drop = useRef(new Animated.Value(lands && !less ? 0 : 1)).current;
  useEffect(() => {
    if (!lands || less) return;
    Animated.spring(drop, {
      toValue: 1,
      stiffness: 300,
      damping: 15,
      mass: 1,
      useNativeDriver: true,
    }).start();
  }, [lands, less, drop]);
  return (
    <Animated.View
      style={{
        opacity: drop.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1] }),
        transform: [
          { translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) },
          { scale: drop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Connect a harness, at the shelf's end (ADR 0185's addendum), opening its sheet (ADR 0190). While
 * this phone's link waits, a ring round its + empties over the link's minutes and its words count
 * them; once the harness has its key, it says it is connecting.
 */
function AddTile({ adding }: { readonly adding: Pick<Connecting, "open" | "waiting"> }) {
  const palette = usePalette();
  const flat = useContext(ShelfGrid);
  const box = useTileBox();
  const side = avatarSide(flat ? "sm" : "pick");
  const corner = avatarCorner(flat ? "sm" : "pick", "harness");
  const { waiting } = adding;
  const words = tileWords(waiting);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={words.label}
      onPress={adding.open}
      testID="add-agent"
      style={({ pressed }) => [
        box,
        styles.add,
        flat ? styles.flatAdd : null,
        {
          borderColor: waiting === undefined ? palette.line2 : palette.blue,
          backgroundColor: pressed ? palette.surface2 : "transparent",
        },
      ]}
    >
      <TileBody
        face={
          <View
            style={[
              styles.plus,
              {
                width: side,
                height: side,
                borderRadius: corner,
                backgroundColor: palette.surface2,
              },
            ]}
          >
            <Icon
              name="plus"
              size={flat ? 17 : 22}
              color={waiting === undefined ? palette.ink2 : palette.blue}
            />
            {waiting === undefined ? null : (
              <Countdown side={side} corner={corner} share={waiting.taken ? 1 : waiting.share} />
            )}
          </View>
        }
        name={<Name words={words.name} />}
        line={
          <Line
            words={words.line}
            colour={waiting === undefined ? palette.ink3 : palette.blueInk}
          />
        }
      />
    </Pressable>
  );
}

/** The last tile's words: Connect a harness, or the link it waits on. */
function tileWords(waiting: Connecting["waiting"]): {
  readonly name: string;
  readonly line: string;
  readonly label: string;
} {
  if (waiting === undefined)
    return { name: "Connect", line: "a harness", label: "Connect a harness" };
  if (waiting.taken) {
    return { name: "Connecting", line: "One moment…", label: "Connect a harness, connecting" };
  }
  return {
    name: "Waiting",
    line: waiting.left,
    label: `Connect a harness, waiting, ${waiting.left} left`,
  };
}

/**
 * A rounded square's outline for the countdown, from the middle of its top edge and round to the
 * left, back to where it began; and its length. Drawn this way, a dash of the share left leaves its
 * gap at twelve o'clock, growing clockwise as a clock's hand sweeps. A `Rect`'s outline starts
 * where the platform's drawing starts it, which on iOS is the middle of the right edge, so the
 * ring emptied from three o'clock there.
 */
export function countdownPath(
  at: number,
  side: number,
  radius: number,
): { readonly d: string; readonly length: number } {
  const far = at + side;
  const mid = at + side / 2;
  const r = radius;
  const d = [
    `M ${mid} ${at}`,
    `H ${at + r}`,
    `A ${r} ${r} 0 0 0 ${at} ${at + r}`,
    `V ${far - r}`,
    `A ${r} ${r} 0 0 0 ${at + r} ${far}`,
    `H ${far - r}`,
    `A ${r} ${r} 0 0 0 ${far} ${far - r}`,
    `V ${at + r}`,
    `A ${r} ${r} 0 0 0 ${far - r} ${at}`,
    `H ${mid}`,
  ].join(" ");
  // Four sides, less what the four corners round off.
  return { d, length: 4 * side - (8 - 2 * Math.PI) * r };
}

/** The ring round the waiting tile's +: the share of the link's time left, from the top. */
function Countdown({
  side,
  corner,
  share,
}: {
  readonly side: number;
  readonly corner: number;
  readonly share: number;
}) {
  const palette = usePalette();
  const stroke = 2.5;
  const box = side + stroke * 2;
  const inner = side + stroke;
  const radius = corner + stroke / 2;
  const ring = countdownPath(stroke / 2, inner, radius);
  return (
    <Svg
      width={box}
      height={box}
      style={[styles.ring, { top: -stroke, left: -stroke }]}
      pointerEvents="none"
    >
      <Rect
        x={stroke / 2}
        y={stroke / 2}
        width={inner}
        height={inner}
        rx={radius}
        ry={radius}
        fill="none"
        stroke={palette.blue}
        strokeOpacity={0.18}
        strokeWidth={stroke}
      />
      <Path
        d={ring.d}
        fill="none"
        stroke={palette.blue}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${ring.length * share} ${ring.length}`}
      />
    </Svg>
  );
}

/** View all, small, under the shelf: the harnesses' cards in a list of their own. */
function ViewAll({ onPress }: { readonly onPress: () => void }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="View all harnesses"
      onPress={onPress}
      hitSlop={8}
      testID="view-all-harnesses"
      style={({ pressed }) => [
        styles.all,
        { backgroundColor: pressed ? palette.surface3 : palette.surface2 },
      ]}
    >
      <Text style={[styles.allWords, { color: palette.ink2 }]}>View all</Text>
      <Text style={[styles.allChevron, { color: palette.ink4 }]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shelf: { paddingTop: SPACE.xs, paddingBottom: SPACE.xs, gap: SPACE.sm },
  // A horizontal scroller in a column stretches and shrinks by default (`FacePicker`): neither.
  box: { flexGrow: 0, flexShrink: 0 },
  row: { gap: SPACE.sm, paddingHorizontal: SPACE.lg },
  tile: {
    width: SHELF_TILE,
    alignItems: "center",
    gap: 2,
    paddingTop: SPACE.md,
    paddingBottom: SPACE.sm + 2,
    paddingHorizontal: SPACE.xs,
    borderRadius: RADIUS.xxl + 2,
  },
  add: { borderWidth: 1.5, borderStyle: "dashed" },
  // Beside a room: the tiles two to a row, the list's own margins round them.
  grid: {
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.xs,
    paddingBottom: SPACE.sm,
  },
  gridRow: { flexDirection: "row", gap: SPACE.sm },
  cell: { flex: 1, minWidth: 0 },
  flat: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm + 2,
    paddingVertical: SPACE.sm + 2,
    paddingHorizontal: SPACE.sm + 2,
    borderRadius: RADIUS.xl,
  },
  // Its dashed edge inside the grid's tile, so it stands as tall as the harnesses beside it.
  flatAdd: { paddingVertical: SPACE.sm + 2 - 1.5, paddingHorizontal: SPACE.sm + 2 - 1.5 },
  words: { flex: 1, minWidth: 0, gap: 1 },
  flatName: { fontSize: TEXT.sm, fontWeight: "600" },
  plus: { alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute" },
  name: { fontSize: TEXT.sm, fontWeight: "600", marginTop: SPACE.sm - 2, maxWidth: "100%" },
  line: { fontSize: TEXT.xs, maxWidth: "100%" },
  // Small, under the shelf at its margin: a capsule a thumb finds without it shouting.
  all: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.xs,
    marginLeft: SPACE.lg,
    height: VIEW_ALL_HEIGHT,
    paddingLeft: SPACE.md,
    paddingRight: SPACE.sm + 2,
    borderRadius: RADIUS.pill,
  },
  allWords: { fontSize: TEXT.sm, fontWeight: "600" },
  allChevron: { fontSize: TEXT.md, lineHeight: TEXT.md + 2 },
});
