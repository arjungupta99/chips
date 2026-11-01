/**
 * An agent's groups before their copies come, and the ones its harness doesn't share (ADR 0238,
 * the mock's B).
 *
 * A group the person will see stands in its place from the card's first frame, in its real shape:
 * the heading in words with its harness beside it, the rows as flat blank bars where the words
 * will be, held still. Only the Context window carries motion while it waits: a light runs along
 * its bars, one after another, as the gauge will fill. When the copy lands, what is under the
 * heading comes in over the blank, and the group grows to its size with what is under it moving on
 * the same clock (the addendum); the gauge's fill climbs and its number counts up.
 *
 * A group its harness doesn't share keeps its heading, with one quiet line that says so.
 */

import type { SettingGroup } from "@chipschat/core";
import { SETTING_HEADINGS, WINDOW_BARS } from "@chipschat/core";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { HarnessMark } from "../context/rows";
import { Group, GroupFoot, GroupHeading, MARK, MARKED_INSET } from "../ui/Group";
import { Lands, Stands } from "../ui/growing";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";

const NATIVE = Platform.OS !== "web";

/** One blank row: a mark or none, a label's bar and maybe a sub's, and what stands at its right. */
export interface BlankRow {
  readonly mark?: boolean;
  /** How long the label's bar is, in percent of the words' room. */
  readonly label: number;
  readonly sub?: number;
  readonly trailing?: "switch" | "value";
}

/** The harness beside the heading, as the group will name it when its copy comes. */
function From({ harnessName, testID }: { readonly harnessName: string; readonly testID: string }) {
  const palette = usePalette();
  return (
    <View style={styles.from} testID={testID}>
      <HarnessMark name={harnessName} side={14} />
      <Text style={[styles.fromWords, { color: palette.ink3 }]} numberOfLines={1}>
        {harnessName}
      </Text>
    </View>
  );
}

/** A row's lines, as tall as the words they stand for: the body's line and the caption's. */
const LABEL_LINE = Math.round(TEXT.body * 1.24);
const SUB_LINE = Math.round(TEXT.sm * 1.3);

function Bar({
  width,
  height,
  line,
  onGround = false,
}: {
  width: number;
  height: number;
  line: number;
  /** On the grouped ground, not in a group: `surface2` is the ground's own colour in light. */
  onGround?: boolean;
}) {
  const palette = usePalette();
  return (
    <View style={{ height: line, justifyContent: "center" }}>
      <View
        style={{
          width: `${width}%`,
          height,
          borderRadius: height / 2,
          backgroundColor: onGround ? palette.line : palette.surface2,
        }}
      />
    </View>
  );
}

function Row({ row }: { readonly row: BlankRow }) {
  const palette = usePalette();
  return (
    <View style={styles.row}>
      {row.mark ? <View style={[styles.mark, { backgroundColor: palette.surface2 }]} /> : null}
      <View style={styles.words}>
        <Bar width={row.label} height={11} line={LABEL_LINE} />
        {row.sub === undefined ? null : <Bar width={row.sub} height={9} line={SUB_LINE + 1} />}
      </View>
      {row.trailing === "switch" ? (
        <View style={[styles.switch, { backgroundColor: palette.surface2 }]} />
      ) : null}
      {row.trailing === "value" ? (
        <View style={[styles.value, { backgroundColor: palette.surface2 }]} />
      ) : null}
    </View>
  );
}

/**
 * One blank row standing in a group of other rows for a row on its way: the Model row in a
 * harness's Set up group (ADR 0254), whose other rows are there at once.
 */
export function StandingRow({
  row,
  label,
  testID,
}: {
  readonly row: BlankRow;
  readonly label: string;
  readonly testID: string;
}) {
  return (
    <View testID={testID} accessible accessibilityLabel={label}>
      <Stands>
        <Row row={row} />
      </Stands>
    </View>
  );
}

/** The foot's lines, blank: as many as the words will take. */
function FootLines({ lines }: { readonly lines: readonly number[] }) {
  return (
    <View style={styles.foot}>
      {lines.map((width, at) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the lines never move.
        <Bar key={at} width={width} height={8} line={Math.round(TEXT.sm * 1.4)} onGround />
      ))}
    </View>
  );
}

/**
 * Whether a blank has stood in a group's place since the group was first drawn: what takes its
 * place then comes in over it (`Lands`), and what was there from the first frame, as a copy kept
 * from before is, is drawn as it is.
 */
export function useStood(standing: boolean): boolean {
  const [stood, setStood] = useState(standing);
  if (standing && !stood) setStood(true);
  return stood;
}

/** A group on its way: its heading, and blank rows in its rows' shape. */
export function WaitingGroup({
  group,
  harnessName,
  agentName,
  rows,
  foot = [],
  testID,
}: {
  readonly group: SettingGroup;
  readonly harnessName: string;
  readonly agentName: string;
  readonly rows: readonly BlankRow[];
  readonly foot?: readonly number[];
  readonly testID: string;
}) {
  return (
    <BlankGroup
      heading={SETTING_HEADINGS[group]}
      trailing={<From harnessName={harnessName} testID={`${testID}-from`} />}
      label={`Asking ${harnessName} for ${agentName}'s ${SETTING_HEADINGS[group].toLowerCase()}`}
      rows={rows}
      foot={foot}
      testID={testID}
    />
  );
}

/**
 * Any group on its way, under its own heading: blank rows in its rows' shape, the light running
 * along them. A harness's own jobs (ADR 0252) stand this way on its page.
 */
export function BlankGroup({
  heading,
  trailing,
  label,
  rows,
  foot = [],
  testID,
}: {
  readonly heading: string;
  readonly trailing?: ReactNode;
  readonly label: string;
  readonly rows: readonly BlankRow[];
  readonly foot?: readonly number[];
  readonly testID: string;
}) {
  return (
    <View testID={testID} accessible accessibilityLabel={label}>
      <GroupHeading trailing={trailing}>{heading}</GroupHeading>
      <BlankBody rows={rows} foot={foot} />
    </View>
  );
}

/**
 * What stands under a group's heading while its rows are on their way: blank rows and foot lines,
 * which hold while what takes their place lands over them (`Lands`), then fade.
 */
export function BlankBody({
  rows,
  foot = [],
  testID,
}: {
  readonly rows: readonly BlankRow[];
  readonly foot?: readonly number[];
  readonly testID?: string | undefined;
}) {
  const marked = rows.some((row) => row.mark);
  return (
    <Stands>
      <Group inset={marked ? MARKED_INSET : SPACE.lg} testID={testID}>
        {rows.map((row, at) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the rows never move.
          <Row key={at} row={row} />
        ))}
      </Group>
      {foot.length === 0 ? null : <FootLines lines={foot} />}
    </Stands>
  );
}

/** How long the light takes along the bars, and how long it rests at the end before the next. */
const SWEEP_MS = 1300;
const REST_MS = 500;

/**
 * The Context window on its way: the gauge's shape, blank, with a light that runs along its bars
 * while it waits. Held lit and still under Reduce Motion.
 */
export function WaitingWindow({
  harnessName,
  agentName,
  testID = "window-waiting",
}: {
  readonly harnessName: string;
  readonly agentName: string;
  readonly testID?: string;
}) {
  const palette = usePalette();
  const less = useReduceMotion();
  const light = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (less) return;
    const run = Animated.loop(
      Animated.sequence([
        Animated.timing(light, {
          toValue: 1,
          duration: SWEEP_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: NATIVE,
        }),
        Animated.delay(REST_MS),
        Animated.timing(light, { toValue: 0, duration: 0, useNativeDriver: NATIVE }),
      ]),
    );
    run.start();
    return () => run.stop();
  }, [light, less]);
  const bars = Array.from({ length: WINDOW_BARS }, (_, at) => at / (WINDOW_BARS - 1));
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`Asking ${harnessName} how full ${agentName}'s context is`}
    >
      <GroupHeading trailing={<From harnessName={harnessName} testID={`${testID}-from`} />}>
        {SETTING_HEADINGS.window}
      </GroupHeading>
      <Stands>
        <Group>
          <View style={styles.gauge}>
            <View style={styles.top}>
              <View style={[styles.big, { backgroundColor: palette.surface2 }]} />
              <View style={[styles.tokens, { backgroundColor: palette.surface2 }]} />
            </View>
            <View style={styles.bars} testID={`${testID}-bars`}>
              {bars.map((place) => (
                <View key={place} style={[styles.bar, { backgroundColor: palette.surface2 }]}>
                  <Animated.View
                    style={[
                      styles.lit,
                      {
                        backgroundColor: palette.line2,
                        opacity: less
                          ? 0.5
                          : light.interpolate({
                              inputRange: [place - 0.14, place, place + 0.22],
                              outputRange: [0, 1, 0],
                              extrapolate: "clamp",
                            }),
                      },
                    ]}
                  />
                </View>
              ))}
            </View>
            <View style={styles.act}>
              <View style={styles.noteBar}>
                <Bar width={70} height={9} line={SUB_LINE} />
              </View>
              <View style={[styles.pill, { backgroundColor: palette.surface2 }]} />
            </View>
          </View>
          <Row row={{ label: 34, sub: 62 }} />
        </Group>
        <FootLines lines={[94, 90, 46]} />
      </Stands>
    </View>
  );
}

/** A group its harness doesn't share: the heading, and a line that says so. */
export function NotShared({
  group,
  words,
  testID,
  after = false,
}: {
  readonly group: SettingGroup;
  readonly words: string;
  readonly testID: string;
  /** Whether a blank stood for it: then its words come in under the heading (`Lands`). */
  readonly after?: boolean;
}) {
  return (
    <View testID={testID}>
      <GroupHeading>{SETTING_HEADINGS[group]}</GroupHeading>
      <Lands after={after}>
        <GroupFoot testID={`${testID}-words`}>{words}</GroupFoot>
      </Lands>
    </View>
  );
}

const styles = StyleSheet.create({
  from: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1 },
  fromWords: { fontSize: 13, fontWeight: "500" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    minHeight: 52,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm + 2,
  },
  mark: { width: MARK, height: MARK, borderRadius: 8 },
  words: { flex: 1, minWidth: 0 },
  switch: { width: 51, height: 31, borderRadius: 16 },
  value: { width: 56, height: 11, borderRadius: 6 },
  foot: { paddingHorizontal: SPACE.lg + SPACE.lg, paddingTop: SPACE.sm },
  gauge: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.lg, paddingBottom: 14 },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 41,
  },
  big: { width: 86, height: 30, borderRadius: 9 },
  tokens: { width: "36%", height: 9, borderRadius: 5 },
  bars: {
    height: 62,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  bar: { width: 4, height: 30, borderRadius: 2, overflow: "hidden" },
  lit: { ...StyleSheet.absoluteFill, borderRadius: 2 },
  act: { flexDirection: "row", alignItems: "center", gap: SPACE.md, marginTop: 14 },
  noteBar: { flex: 1 },
  pill: { width: 128, height: 38, borderRadius: 19 },
});
