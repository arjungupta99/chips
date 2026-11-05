/**
 * The tabs on an iPad: a capsule at the window's bottom left, and the sidebar that grows up out of it,
 * floating over the list (ADR 0276, which replaced ADR 0256's sidebar beside the list and its fold
 * into iPadOS's pill).
 *
 * At rest the capsule holds ☰ and the four tabs' marks, with the gold + beside it, level with a
 * room's composer, where an iPhone keeps its tabs. ☰ opens the sidebar over the list: ☰ and the +
 * stay at its foot, where the finger is, the four tabs stand just above them with their names, and
 * the spaces pinned (ADR 0240) and, with more than one, the workspaces this iPad is in (ADR 0197) fill
 * the top. A tab, a pinned space, ☰ again or a tap beside it puts it back. It never takes a column of
 * its own, so nothing under it moves: the room and a third column keep their widths. Where a detail
 * stands at the window's edge under the capsule and is narrow, the capsule folds down to ☰ alone, so
 * a room's composer keeps its width (`chrome.tsx`'s `capsuleWidth`).
 *
 * Arjun's words, 3 November 2026: the tabs moving to the top bar "looks off… that menu should always
 * be on the left as floating (accessible through hamburger menu). When it collapses, the items should
 * show at the top left section (only tab bar icons and +)… Everything should be a smooth transition";
 * then "the tab left section should always 'float' and not specifically occupy left column", and
 * "make the minimized tab bar at the bottom left". The motion is `SidebarMotion.tsx`.
 *
 * UIKit's bar is hidden on an iPad, as it is under the iPhone's drawn bar (ADR 0233), and a tab is
 * chosen the same way the drawn bar chooses one (`chooseTab`). It steps aside while a screen puts a
 * bar of its own at the foot: the Spaces list's, while spaces are being picked (ADR 0181).
 */

import { type Space, type Store, spaceTitle } from "@chipschat/core";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RowAvatar } from "../spaces/RowAvatar";
import { useChips, useDeferredSnapshot } from "../store/provider";
import { useWorkspaceRows } from "../workspaces/Switcher";
import { CAPSULE, capsuleWidth, type Foot, SIDEBAR_WIDTH, useChrome } from "./chrome";
import { Capsule } from "./Glass";
import { Icon } from "./Icon";
import { Fading, type Frame, Moving } from "./SidebarMotion";
import { TABS, type TabName } from "./tabs";
import { usePalette } from "./theme";
import { RADIUS, SPACE, TEXT } from "./tokens";

export function Sidebar({
  store,
  selfId,
  tabs,
  chosen,
  onChoose,
  onOpenSpace,
  plus,
  aside,
}: {
  readonly store: Store;
  readonly selfId: string;
  readonly tabs: readonly TabName[];
  readonly chosen: TabName;
  readonly onChoose: (tab: TabName) => void;
  readonly onOpenSpace: (spaceId: string) => void;
  /** The gold +, where there is one: for an owner or an admin (ADR 0196). */
  readonly plus: ReactNode;
  /** A screen has a bar of its own at the foot: the capsule steps aside for it. */
  readonly aside: boolean;
}) {
  const palette = usePalette();
  const { open, setOpen, feet } = useChrome();
  const at = usePlaces(open, feet[chosen], tabs.length);
  const narrow = !open && at.capsule.width === CAPSULE.narrow;
  const chosenAt = Math.max(0, tabs.indexOf(chosen));
  const shut = () => setOpen(false);
  return (
    <Fading
      shown={!aside}
      pointerEvents={aside ? "none" : "box-none"}
      style={StyleSheet.absoluteFill}
    >
      <Scrim open={open} onPress={shut} />
      <Moving frame={open ? at.panel : at.capsule} testID="sidebar">
        <Capsule style={styles.glass}>
          <View />
        </Capsule>
      </Moving>
      <Fading
        shown={!open && !narrow}
        after={260}
        pointerEvents="none"
        style={[styles.line, at.line, { backgroundColor: palette.line2 }]}
      />
      <Moving frame={open ? at.row(chosenAt) : at.slot(chosenAt)} pointerEvents="none">
        <Fading shown={!narrow} style={styles.fill}>
          <Chosen open={open} />
        </Fading>
      </Moving>
      {tabs.map((tab, index) => (
        <Moving
          key={tab}
          frame={open ? at.row(index) : narrow ? at.ham : at.slot(index)}
          // Out, the top one leaves last; back, it leaves first.
          delay={(open ? tabs.length - 1 - index : index) * 16}
          pointerEvents={narrow ? "none" : "box-none"}
          style={styles.clip}
        >
          <Fading shown={open || !narrow} style={styles.fill}>
            <Tab
              tab={tab}
              chosen={tab === chosen}
              open={open}
              onPress={() => {
                onChoose(tab);
                shut();
              }}
            />
          </Fading>
        </Moving>
      ))}
      <Fading
        shown={open}
        after={300}
        pointerEvents={open ? "box-none" : "none"}
        style={[styles.more, at.more]}
      >
        <More
          store={store}
          selfId={selfId}
          onOpenSpace={(id) => {
            onOpenSpace(id);
            shut();
          }}
        />
      </Fading>
      <Moving frame={at.hamAt(open)}>
        <Ham open={open} onPress={() => setOpen(!open)} />
      </Moving>
      {plus === null ? null : <Moving frame={at.plusAt(open)}>{plus}</Moving>}
    </Fading>
  );
}

/**
 * Where everything stands, in the window: the capsule at the bottom left, level with a room's
 * composer, and the sidebar from under the status bar down to the capsule's foot; ☰ and the + at
 * the capsule's ends, or at the sidebar's foot; each tab in its place in the capsule, or in its row
 * above the foot.
 */
function usePlaces(open: boolean, foot: Foot | undefined, count: number) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const top = height - insets.bottom - FOOT_GAP - CAPSULE.height;
  const wide = open ? CAPSULE.wide : capsuleWidth(foot);
  const panelTop = insets.top + SPACE.sm;
  const button = top + (CAPSULE.height - ROUND) / 2;
  const slot = (index: number): Frame => ({
    left: CAPSULE.left + PAD + ROUND + LINE_ROOM + index * ROUND,
    top: button,
    width: ROUND,
    height: ROUND,
  });
  const row = (index: number): Frame => ({
    left: SPACE.lg,
    top: top - ROW_GAP - (count - index) * ROW,
    width: GLASS_WIDTH - SPACE.lg,
    height: ROUND,
  });
  const ham: Frame = { left: CAPSULE.left + PAD, top: button, width: ROUND, height: ROUND };
  return {
    capsule: { left: CAPSULE.left, top, width: wide, height: CAPSULE.height },
    panel: {
      left: SPACE.sm,
      top: panelTop,
      width: GLASS_WIDTH,
      height: top + CAPSULE.height - panelTop,
    },
    line: { left: CAPSULE.left + PAD + ROUND + SPACE.xs, top: top + (CAPSULE.height - 24) / 2 },
    more: {
      left: SPACE.lg,
      top: panelTop + SPACE.sm,
      width: GLASS_WIDTH - SPACE.lg,
      height: Math.max(0, row(0).top - panelTop - SPACE.lg),
    },
    slot,
    row,
    ham,
    hamAt: (out: boolean): Frame => (out ? { ...ham, left: SPACE.lg } : ham),
    plusAt: (out: boolean): Frame =>
      out
        ? { left: SPACE.sm + GLASS_WIDTH - SPACE.md - CAPSULE.plus, top: button }
        : { left: CAPSULE.left + wide + CAPSULE.gap, top: button },
  };
}

/** A tap beside the open sidebar puts it away. */
function Scrim({ open, onPress }: { readonly open: boolean; readonly onPress: () => void }) {
  return (
    <Fading shown={open} pointerEvents={open ? "auto" : "none"} style={StyleSheet.absoluteFill}>
      <Pressable
        accessibilityLabel="Hide the sidebar"
        onPress={onPress}
        style={[StyleSheet.absoluteFill, styles.scrim]}
        testID="sidebar-scrim"
      />
    </Fading>
  );
}

/** ☰: the sidebar out of the capsule, and back into it. */
function Ham({ open, onPress }: { readonly open: boolean; readonly onPress: () => void }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={open ? "Hide the sidebar" : "Show the sidebar"}
      accessibilityState={{ expanded: open }}
      hitSlop={SPACE.xs}
      onPress={onPress}
      style={({ pressed }) => [styles.round, { opacity: pressed ? 0.6 : 1 }]}
      testID={open ? "sidebar-fold" : "sidebar-unfold"}
    >
      <Icon name="menu" size={22} color={palette.ink2} weight={2} />
    </Pressable>
  );
}

/** The ground under the tab in front: a round one in the capsule, the row's in the sidebar. */
function Chosen({ open }: { readonly open: boolean }) {
  const palette = usePalette();
  return (
    <View
      style={[
        styles.fill,
        { backgroundColor: palette.surface3, borderRadius: open ? RADIUS.lg : ROUND / 2 },
      ]}
    />
  );
}

/** A tab: its mark alone in the capsule, its mark and its name in the sidebar. */
function Tab({
  tab,
  chosen,
  open,
  onPress,
}: {
  readonly tab: TabName;
  readonly chosen: boolean;
  readonly open: boolean;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  // On the chosen ground (`surface3`), the accent's darker ink reads at 4.5:1 in light.
  const ink = chosen ? palette.accentInk : palette.ink;
  const { mark, title } = TABS[tab];
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={title}
      accessibilityState={{ selected: chosen }}
      onPress={onPress}
      style={styles.tab}
      testID={`sidebar-${tab}`}
    >
      <View style={styles.round}>
        <Icon name={mark} size={21} color={ink} weight={1.9} />
      </View>
      <Fading shown={open} after={open ? 320 : 0}>
        <Text numberOfLines={1} style={[styles.label, { color: ink }, chosen ? styles.on : null]}>
          {title}
        </Text>
      </Fading>
    </Pressable>
  );
}

/** What fills the sidebar's top: the pinned spaces, and the workspaces. */
function More({
  store,
  selfId,
  onOpenSpace,
}: {
  readonly store: Store;
  readonly selfId: string;
  readonly onOpenSpace: (spaceId: string) => void;
}) {
  const snapshot = useDeferredSnapshot(store);
  const pinned = (snapshot.pinnedSpaces ?? []).flatMap((id) =>
    snapshot.model.spaces.filter((space) => space.id === id),
  );
  return (
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      {pinned.length > 0 ? (
        <Section title="Pinned">
          {pinned.map((space) => (
            <PinnedRow
              key={space.id}
              space={space}
              title={spaceTitle(space, snapshot.directory, selfId)}
              onPress={() => onOpenSpace(space.id)}
            >
              <RowAvatar
                space={space}
                directory={snapshot.directory}
                title={spaceTitle(space, snapshot.directory, selfId)}
                icon={snapshot.spaceIcons.get(space.id)}
                size="sm"
              />
            </PinnedRow>
          ))}
        </Section>
      ) : null}
      <Workspaces />
    </ScrollView>
  );
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const palette = usePalette();
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.heading, { color: palette.ink3 }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function PinnedRow({
  space,
  title,
  onPress,
  children,
}: {
  readonly space: Space;
  readonly title: string;
  readonly onPress: () => void;
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.small,
        { backgroundColor: pressed ? palette.surface3 : "transparent" },
      ]}
      testID={`sidebar-space-${space.id}`}
    >
      {children}
      <Text numberOfLines={1} style={[styles.name, { color: palette.ink }]}>
        {title}
      </Text>
    </Pressable>
  );
}

/** The workspaces this iPad is in, with more than one: a tap on another goes to it. */
function Workspaces() {
  const palette = usePalette();
  const rows = useWorkspaceRows();
  const { switchTo } = useChips();
  if (rows.length < 2) return null;
  return (
    <Section title="Workspaces">
      {rows.map((row) => (
        <Pressable
          key={row.device.deviceId}
          accessibilityRole="button"
          accessibilityLabel={row.front ? `${row.name}, open` : `Go to ${row.name}`}
          accessibilityState={{ selected: row.front }}
          onPress={() => {
            if (!row.front) void switchTo(row.device.deviceId);
          }}
          style={({ pressed }) => [
            styles.small,
            { backgroundColor: pressed ? palette.surface3 : "transparent" },
          ]}
          testID={`sidebar-workspace-${row.device.deviceId}`}
        >
          <View style={[styles.mark, { backgroundColor: palette.goldSoft }]}>
            <Icon name="chip" size={15} color={palette.goldDeep} weight={2} />
          </View>
          <Text numberOfLines={1} style={[styles.name, { color: palette.ink }]}>
            {row.name}
          </Text>
          {row.front ? (
            <Icon name="check" size={17} color={palette.accent} weight={2.4} />
          ) : row.waiting > 0 ? (
            <Text style={[styles.waiting, { color: palette.ink3 }]}>{row.waiting}</Text>
          ) : null}
        </Pressable>
      ))}
    </Section>
  );
}

/** A round button's side: a thumb's. */
const ROUND = 44;
/** Inside the capsule, round its buttons. */
const PAD = 2;
/** Between ☰ and the tabs in the capsule: a gap, a hairline, a gap. */
const LINE_ROOM = 9;
/** A row in the sidebar, and the gap between the last row and the foot. */
const ROW = 48;
const ROW_GAP = 6;
/** Under the capsule, over the home indicator. */
const FOOT_GAP = 8;
/** The open sidebar's glass, inside its column. */
const GLASS_WIDTH = SIDEBAR_WIDTH - SPACE.lg;

const styles = StyleSheet.create({
  glass: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderRadius: 24 },
  fill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  scrim: { backgroundColor: "rgba(0, 0, 0, 0.12)" },
  line: { position: "absolute", width: StyleSheet.hairlineWidth, height: 24 },
  clip: { overflow: "hidden" },
  more: { position: "absolute" },
  round: { width: ROUND, height: ROUND, alignItems: "center", justifyContent: "center" },
  tab: { flexDirection: "row", alignItems: "center", height: ROUND, overflow: "hidden" },
  label: { fontSize: TEXT.body, marginLeft: SPACE.xs },
  on: { fontWeight: "600" },
  body: { paddingBottom: SPACE.lg, gap: 2 },
  section: { paddingTop: SPACE.xl, gap: 2 },
  heading: {
    fontSize: TEXT.sm,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    paddingHorizontal: SPACE.md,
    paddingBottom: SPACE.xs,
  },
  small: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    minHeight: 40,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.lg,
  },
  name: { flex: 1, fontSize: TEXT.md },
  mark: { width: 26, height: 26, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  waiting: { fontSize: TEXT.sm, fontVariant: ["tabular-nums"] },
});
