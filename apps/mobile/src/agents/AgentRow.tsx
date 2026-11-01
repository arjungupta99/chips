/**
 * One agent's row (ADR 0087, Phase 5): its face, the light running round its pins while it works
 * (ADR 0089); its name, the Main tag in its face's colour if it is its harness's Main agent (ADR
 * 0145), and when its room last spoke; and under them its harness and where it is — or that it is
 * free, in amber, with how many of its words wait for a room.
 *
 * Its face and its row are a room's on Spaces, so the two lists read alike (Arjun, 1 October
 * 2026). Pressing and holding the row changes the face, as it does a room's, and pushing it left
 * shows Archive and Delete (ADR 0095), which a screen reader is offered as actions; Locked in
 * their place while its changes are locked (ADR 0199). While the Agents tab picks (ADR 0182), the
 * row is a checkbox, and moves over for its circle as a room's row does (`PickRow`): its face, name
 * and line move; its time stays. A locked agent wears Locked's padlock in its circle's place.
 */

import { type AgentRow as Row, waitingWords } from "@chipschat/core";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { type PickMark, PickRow, Shifted, ShiftedText } from "../spaces/SelectMotion";
import type { SpaceAct } from "../spaces/SwipeRow";
import { relativeTime } from "../spaces/when";
import { Avatar, faceGround, ROW_AVATAR } from "../ui/Avatar";
import { mixHex } from "../ui/lit";
import { MainTag } from "../ui/MainTag";
import { Pill } from "../ui/Pill";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import type { HarnessStatus } from "../ui/vocabulary";

const CHANGE_ICON = { name: "changeIcon", label: "Change icon" } as const;

/** What a screen reader says for each act, which it cannot swipe to. */
const ACT_LABEL: Readonly<Record<SpaceAct, string>> = {
  archive: "Archive",
  unarchive: "Unarchive",
  delete: "Delete",
  locked: "Locked, show details",
};

/** What a row is told while the Agents tab picks (ADR 0182). */
export interface RowPick {
  readonly active: boolean;
  /** What it wears at its leading edge, kept as the list stops picking. */
  readonly mark: PickMark;
  /** It can't be picked, and steps back while the list picks. */
  readonly dim: boolean;
  /** Goes up by one each time it is pressed and can't be picked. */
  readonly shake: number;
  readonly onPick: () => void;
}

/** A row nothing picks: the Agents tab before Select, and every other list of agents. */
const STILL: RowPick = {
  active: false,
  mark: "none",
  dim: false,
  shake: 0,
  onPick: () => undefined,
};

/** How much of the tick's blue a picked row is washed with, as a room's row is (`List.tsx`). */
const PICKED_WASH = 0.08;

const RING: Readonly<Record<Row["doing"], HarnessStatus | undefined>> = {
  working: "working",
  waiting: "waiting",
  idle: undefined,
};

export function AgentRow({
  row,
  selected = false,
  first = false,
  onPress,
  onLongPress,
  acts = [],
  onAct,
  pick = STILL,
  cover,
  gone = false,
  ground,
}: {
  readonly row: Row;
  readonly selected?: boolean;
  /** The first of its section draws no hairline over itself. */
  readonly first?: boolean;
  readonly onPress: (agentId: string) => void;
  /** Pressed and held: its face is changed (ADR 0089). Absent where the reader may not. */
  readonly onLongPress?: ((agentId: string) => void) | undefined;
  /** What a swipe offers (ADR 0095), for a screen reader as actions. */
  readonly acts?: readonly SpaceAct[];
  readonly onAct?: ((act: SpaceAct, agentId: string) => void) | undefined;
  readonly pick?: RowPick | undefined;
  /** What is drawn over the row as it goes: the dust a deleted agent's row turns to. */
  readonly cover?: ReactNode;
  /** On its way out of the list: it takes no presses. */
  readonly gone?: boolean;
  /** What it stands on: the page's own colour, or a group's card on a harness's page (ADR 0254). */
  readonly ground?: string | undefined;
}) {
  const palette = usePalette();
  const { active } = pick;
  const picked = active && pick.mark === "on";
  const held = active ? undefined : onLongPress;
  return (
    <Pressable
      accessibilityRole={active ? "checkbox" : "button"}
      accessibilityLabel={rowLabel(row, pick)}
      aria-selected={active ? undefined : selected}
      aria-checked={active ? picked : undefined}
      disabled={gone}
      onPress={active ? pick.onPick : () => onPress(row.id)}
      {...(held === undefined ? {} : { onLongPress: () => held(row.id) })}
      // What the long press and the swipe do, for a screen reader, which can make neither.
      accessibilityActions={active ? [] : rowActions(onLongPress !== undefined, acts)}
      onAccessibilityAction={(event) => {
        const name = event.nativeEvent.actionName;
        if (name === CHANGE_ICON.name) onLongPress?.(row.id);
        else onAct?.(name as SpaceAct, row.id);
      }}
      testID={`agent-${row.id}`}
      style={({ pressed }) => ({
        // The page's own colour, not none: a swipe slides the row over its buttons, and a clear
        // row would show them through it. A picked row wears a wash of the tick's blue.
        backgroundColor: picked
          ? mixHex(palette.bg, palette.blue, PICKED_WASH)
          : pressed || (!active && selected)
            ? palette.surface2
            : (ground ?? palette.bg),
      })}
    >
      <PickRow
        picking={active}
        mark={pick.mark}
        dim={pick.dim}
        shake={pick.shake}
        edge={SPACE.lg}
        // The hairline starts where the name does: the margin, the face and the gap.
        line={first ? undefined : { color: palette.line, inset: ROW_AVATAR + SPACE.md }}
        style={styles.row}
      >
        <Shifted>
          <Avatar
            name={row.name}
            kind="agent"
            size="row"
            icon={row.face}
            testID={`agent-face-${row.id}`}
            decorative
            {...(RING[row.doing] === undefined ? {} : { status: RING[row.doing] })}
          />
        </Shifted>
        <Words row={row} />
      </PickRow>
      {cover}
    </Pressable>
  );
}

/**
 * What a screen reader calls a row, and that it can't be picked while the list picks: that it is
 * locked, for one whose changes are (ADR 0199), as Spaces says of a locked room.
 */
function rowLabel(row: Row, pick: RowPick): string {
  const waiting = waitingWords(row.held);
  const said = `${row.name}${row.lead ? ", Main agent" : ""}, ${row.line}${waiting === undefined ? "" : `, ${waiting}`}`;
  if (!pick.active || !pick.dim) return said;
  return pick.mark === "locked" ? `${said}, locked` : `${said}, can't be picked`;
}

/** What the long press and the swipe do, as a screen reader's actions. */
function rowActions(changesFace: boolean, acts: readonly SpaceAct[]) {
  return [
    ...(changesFace ? [CHANGE_ICON] : []),
    ...acts.map((act) => ({ name: act, label: ACT_LABEL[act] })),
  ];
}

/** The row's words: its name, the Main tag and when it last spoke; under them, where it is. */
function Words({ row }: { readonly row: Row }) {
  const palette = usePalette();
  const waiting = waitingWords(row.held);
  const working = row.doing === "working";
  return (
    <View style={styles.body}>
      <View style={styles.top}>
        <ShiftedText style={[styles.name, { color: palette.ink }]} numberOfLines={1}>
          {row.name}
        </ShiftedText>
        {row.lead ? (
          <Shifted>
            <MainTag hue={faceGround(row.name, row.face)} />
          </Shifted>
        ) : null}
        {row.at === undefined ? null : (
          <Text style={[styles.when, { color: palette.ink3 }]}>{relativeTime(row.at)}</Text>
        )}
      </View>
      <Shifted style={styles.sub}>
        {working ? (
          <Text style={[styles.doing, { color: palette.green }]} numberOfLines={1}>
            Working ·
          </Text>
        ) : null}
        <Text
          style={[styles.line, { color: row.free ? palette.amberInk : palette.ink3 }]}
          numberOfLines={1}
        >
          {row.line}
        </Text>
        {waiting === undefined ? null : <Pill tone="amber">{waiting}</Pill>}
      </Shifted>
    </View>
  );
}

/** The small capitals over a section of the list, level with the rows' faces. */
export function SectionHeading({ children }: { readonly children: string }) {
  const palette = usePalette();
  return (
    <Text accessibilityRole="header" style={[styles.heading, { color: palette.ink3 }]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: TEXT.sm,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.xl,
    paddingBottom: SPACE.xs,
  },
  // Eighty points round a 56-point face, as a room's row on Spaces stands (`List.tsx`). The
  // leading padding, and the gap between face and words, are the motion's (`PickRow`).
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: SPACE.lg,
    paddingVertical: SPACE.md,
    minHeight: 80,
  },
  body: { flex: 1, gap: 2 },
  top: { flexDirection: "row", alignItems: "baseline", gap: SPACE.sm },
  name: { fontSize: TEXT.body, fontWeight: "600", flexShrink: 1 },
  when: { fontSize: TEXT.sm, marginLeft: "auto" },
  sub: { flexDirection: "row", alignItems: "center", gap: 6 },
  doing: { fontSize: TEXT.sm, fontWeight: "600" },
  line: { fontSize: TEXT.sm, flexShrink: 1 },
});
