/**
 * Allowed always, as rows (ADR 0195): what a person's Always let a harness go ahead with, on the
 * harness page and on You's sheet.
 *
 * Each row is a key mark, what it allows in plain words (`actionWords`) with the harness's own kind
 * small under it, or the kind alone where Chips can't read it, and where it holds, who made it and
 * when; a command's rule is named by its start in code, `node --check …` (ADR 0239). At its right a
 * switch. Off keeps the rule in the list, dimmed, and the harness asks again
 * ("Off · Kit asks again"); on lets it go ahead. Pushed left the row comes off a red Remove (ADR
 * 0178's disc, as a room sheet's agent rows do), which asks nothing: the row breaks into dust as a
 * message deleted for you does (ADR 0167), the list closes over it, and Undo stands for five
 * seconds. Only an owner or admin changes these (`mayTurnDial`, SEC-1): for anybody else the
 * switches are drawn and still, and the rows do not move.
 *
 * Under Jest the swipeable is a plain view, so Remove is reached through the row's accessibility
 * action, which is also how a screen reader reaches it.
 */

import { ALWAYS_EMPTY, type AlwaysRule } from "@chipschat/core";
import { useRef } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { Circle, Path, Svg } from "react-native-svg";
import { type Asker, Eraser } from "../spaces/Dust";
import { SwipeRow } from "../spaces/SwipeRow";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import type { Always } from "./useAlways";

/** A key, the mark a standing yes wears: the phone's own, in the icon set's box and stroke. */
export function KeyMark({ size = 16, color }: { readonly size?: number; readonly color: string }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Circle cx={8} cy={14} r={3.5} />
      <Path d="M10.5 11.5 19 3m-3.5 3.5 2.5 2.5m-5-1 2 2" />
    </Svg>
  );
}

export function AlwaysList({
  rules,
  always,
  dust,
  may,
  paint,
  edge = false,
  testID,
}: {
  readonly rules: readonly AlwaysRule[];
  readonly always: Always;
  readonly dust: Asker;
  /** An owner or an admin: the switches turn and the rows slide. */
  readonly may: boolean;
  /** What a row stands on, which its eraser paints over with. */
  readonly paint: string;
  /** The rows run to the card's edges, as a list in a card does. */
  readonly edge?: boolean;
  readonly testID?: string | undefined;
}) {
  const palette = usePalette();
  const open = useRef<SwipeableMethods | undefined>(undefined);
  if (rules.length === 0) {
    return (
      <View style={styles.empty} testID={testID === undefined ? undefined : `${testID}-empty`}>
        <View style={[styles.emptyMark, { borderColor: palette.line2 }]}>
          <KeyMark color={palette.ink4} />
        </View>
        <Text style={[styles.emptyWords, { color: palette.ink3 }]}>{ALWAYS_EMPTY}</Text>
      </View>
    );
  }
  return (
    <View style={edge ? styles.edge : null} testID={testID}>
      {rules.map((rule, at) => (
        <SwipeRow
          key={rule.key}
          acts={may ? (["remove"] as const) : []}
          palette={palette}
          onAct={(_act, row) => {
            row.close();
            always.remove(rule);
          }}
          onOpen={(row) => {
            if (open.current !== row) open.current?.close();
            open.current = row;
          }}
          onClose={(row) => {
            if (open.current === row) open.current = undefined;
          }}
          testID={`always-swipe-${rule.key}`}
        >
          <RuleRow
            rule={rule}
            first={at === 0}
            always={always}
            dust={dust}
            may={may}
            paint={paint}
          />
        </SwipeRow>
      ))}
    </View>
  );
}

function RuleRow({
  rule,
  first,
  always,
  dust,
  may,
  paint,
}: {
  readonly rule: AlwaysRule;
  readonly first: boolean;
  readonly always: Always;
  readonly dust: Asker;
  readonly may: boolean;
  readonly paint: string;
}) {
  const palette = usePalette();
  const dim = rule.on ? null : styles.off;
  return (
    <View
      style={[
        styles.row,
        { backgroundColor: paint },
        first ? null : { borderTopColor: palette.line, borderTopWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <View style={[styles.mark, { backgroundColor: palette.surface2 }, dim]}>
        <KeyMark color={palette.ink2} />
      </View>
      {/* The words are one element and carry Remove; the switch beside them is its own, so a screen
          reader reaches both (the row as one element hid the switch inside it). */}
      <View
        style={[styles.words, dim]}
        accessible
        accessibilityLabel={`${rule.start ?? rule.words ?? rule.kind}, ${rule.line}`}
        accessibilityActions={may ? [{ name: "remove", label: "Remove" }] : []}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "remove") always.remove(rule);
        }}
        testID={`always-row-${rule.key}`}
      >
        {rule.start !== undefined || rule.words === undefined ? (
          <Text style={[styles.kind, { color: palette.ink }]}>{rule.start ?? rule.kind}</Text>
        ) : (
          <Text style={[styles.title, { color: palette.ink }]}>{rule.words}</Text>
        )}
        <Text style={[styles.line, { color: rule.on ? palette.ink3 : palette.ink2 }]}>
          {rule.line}
        </Text>
        {rule.start === undefined && rule.words === undefined ? null : (
          <Text style={[styles.under, { color: palette.ink3 }]} numberOfLines={1}>
            {rule.kind}
          </Text>
        )}
      </View>
      <Switch
        value={rule.on}
        disabled={!may}
        onValueChange={(on) => always.setOn(rule, on)}
        accessibilityLabel={`Allow ${rule.start ?? rule.kind} always`}
        testID={`always-switch-${rule.key}`}
      />
      {always.going === rule.key ? (
        <Eraser
          crumbling={{ backwards: false, ground: palette.surface2, ink: palette.ink2 }}
          dust={dust}
          paint={paint}
          onWiped={() => always.wiped(rule)}
          onDone={() => undefined}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  edge: { marginHorizontal: -SPACE.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
  },
  mark: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  words: { flex: 1, gap: 1 },
  kind: { fontFamily: "Menlo", fontSize: TEXT.sm, fontWeight: "600" },
  title: { fontSize: TEXT.md, lineHeight: 20, fontWeight: "500" },
  under: { fontFamily: "Menlo", fontSize: TEXT.xs - 1 },
  line: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.4 },
  off: { opacity: 0.5 },
  empty: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  emptyMark: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.sm,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyWords: { flex: 1, fontSize: TEXT.md, lineHeight: TEXT.md * 1.4 },
});
