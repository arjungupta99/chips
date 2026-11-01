/**
 * The model sheet (ADR 0141, the mock's layout B): one sheet with the agent's models, a "Same as
 * …" switch and the effort bars, and one Save that sends both.
 *
 * From the top: the agent's face and "<Name>'s model" over its harness's name; the switch, when
 * the harness gives a default, with what the default runs on under it; the models as radio rows
 * with a gold check; "Effort", the chosen level's name big, the line under it, and the bars. While
 * Same is on, the models and the bars show the default's and are dimmed. Save is grey until
 * something changed and gold once it has; while it waits it shows the chip's running pins and
 * "Saving to <harness>", then a green check and "Saved", and the sheet goes on its own. A refusal
 * or a missed answer keeps the sheet, the picks as they were, with the line under Save.
 *
 * Every word about a model is the harness's. Chips' own are "effort", the line under the bars, and
 * what became of a save.
 */

import {
  defaultWords,
  EFFORT_NOTE,
  modelWords,
  type ModelSheet as Picks,
  shownPick,
} from "@chipschat/core";
import type { ModelChoice, SpaceIcon } from "@chipschat/protocol";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Arrive } from "../../ui/Arrive";
import { Avatar } from "../../ui/Avatar";
import { ON_GOLD } from "../../ui/Button";
import { ChipPulse } from "../../ui/ChipPulse";
import { Group, GroupHeading, GroupRow } from "../../ui/Group";
import { useGround } from "../../ui/ground";
import { Icon } from "../../ui/Icon";
import { CLOSE_ROOM, Sheet, SheetScroll } from "../../ui/Sheet";
import { usePalette } from "../../ui/theme";
import { SPACE, TEXT } from "../../ui/tokens";
import { useReduceMotion } from "../../ui/useReduceMotion";
import { DialBars } from "./EffortBars";
import type { ModelSheetState } from "./useAgentModel";

const NATIVE = Platform.OS !== "web";
/** How tall Save is: a pill, its corners half that. */
const SAVE_HEIGHT = 52;
/** How dim the models and the bars are while Same is on. */
const DIMMED = 0.45;

export function ModelSheet({
  state,
  agentName,
  face,
  harnessName,
}: {
  readonly state: ModelSheetState;
  readonly agentName: string;
  readonly face: SpaceIcon | undefined;
  readonly harnessName: string;
}) {
  // What it showed last, drawn while it leaves: the picks go the moment it is closed.
  const last = useRef<Picks | undefined>(undefined);
  if (state.sheet !== undefined) last.current = state.sheet;
  const picks = state.sheet ?? last.current;
  return (
    <Sheet
      open={state.sheet !== undefined}
      onClose={state.close}
      sizing="bounded"
      cap={0.92}
      testID="model-sheet"
    >
      <Head agentName={agentName} face={face} harnessName={harnessName} />
      {picks === undefined ? null : (
        <>
          <SheetScroll style={styles.scroll} contentContainerStyle={styles.body}>
            <Body picks={picks} state={state} />
          </SheetScroll>
          <SaveBar state={state} harnessName={harnessName} />
        </>
      )}
    </Sheet>
  );
}

function Head({
  agentName,
  face,
  harnessName,
}: {
  readonly agentName: string;
  readonly face: SpaceIcon | undefined;
  readonly harnessName: string;
}) {
  const palette = usePalette();
  return (
    <View style={styles.head}>
      <Avatar name={agentName} kind="agent" size="result" icon={face} decorative />
      <View style={styles.headWords}>
        <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
          {`${agentName}'s model`}
        </Text>
        <Text style={[styles.headSub, { color: palette.ink3 }]} numberOfLines={1}>
          {harnessName}
        </Text>
      </View>
    </View>
  );
}

function Body({ picks, state }: { readonly picks: Picks; readonly state: ModelSheetState }) {
  const shown = shownPick(picks);
  const busy = state.saving?.state === "saving";
  return (
    <>
      <Same picks={picks} busy={busy} onSame={state.same} />
      <GroupHeading>Model</GroupHeading>
      <Dim off={picks.same}>
        <View accessibilityRole="radiogroup" accessibilityLabel="Model">
          <Group>
            {picks.view.choices.map((choice) => (
              <Choice
                key={choice.id}
                choice={choice}
                checked={choice.id === shown.model}
                off={picks.same || busy}
                onPick={state.pick}
              />
            ))}
          </Group>
        </View>
      </Dim>
      {shown.levels.length === 0 ? null : (
        <>
          <GroupHeading>Effort</GroupHeading>
          <Dim off={picks.same}>
            <Effort picks={picks} off={picks.same || busy} onLevel={state.level} />
          </Dim>
        </>
      )}
    </>
  );
}

/** The switch: on, the agent has none of its own and runs on the default. */
function Same({
  picks,
  busy,
  onSame,
}: {
  readonly picks: Picks;
  readonly busy: boolean;
  readonly onSame: (on: boolean) => void;
}) {
  const palette = usePalette();
  const fallback = picks.view.default;
  if (fallback === undefined) return null;
  return (
    <View style={styles.same}>
      <Group>
        <GroupRow
          label={fallback.label}
          sub={defaultWords(picks.view)}
          subLines={1}
          trailing={
            <Switch
              value={picks.same}
              disabled={busy}
              onValueChange={onSame}
              trackColor={{ true: palette.green, false: palette.surface3 }}
              accessibilityLabel={fallback.label}
              testID="model-same"
            />
          }
        />
      </Group>
    </View>
  );
}

/** One model: its label, and the gold check that pops in on the one picked. */
function Choice({
  choice,
  checked,
  off,
  onPick,
}: {
  readonly choice: ModelChoice;
  readonly checked: boolean;
  readonly off: boolean;
  readonly onPick: (modelId: string) => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={choice.label}
      accessibilityState={{ checked, disabled: off }}
      disabled={off}
      onPress={() => onPick(choice.id)}
      testID={`model-choice-${choice.id}`}
      style={({ pressed }) => [
        styles.choice,
        { backgroundColor: pressed ? palette.surface2 : palette.surface },
      ]}
    >
      <Text style={[styles.choiceLabel, { color: palette.ink }]} numberOfLines={1}>
        {choice.label}
      </Text>
      <Check on={checked} />
    </Pressable>
  );
}

/** The check: from small and nothing to its size, overshooting a little, as it is picked. */
function Check({ on }: { readonly on: boolean }) {
  const palette = usePalette();
  const less = useReduceMotion();
  const [shown] = useState(() => new Animated.Value(on ? 1 : 0));
  useEffect(() => {
    if (less || !on) return shown.setValue(on ? 1 : 0);
    Animated.spring(shown, {
      toValue: 1,
      friction: 5,
      tension: 170,
      useNativeDriver: NATIVE,
    }).start();
  }, [shown, on, less]);
  return (
    <Animated.View
      style={{
        opacity: shown.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1] }),
        transform: [{ scale: shown.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
      }}
      testID={on ? "model-check" : undefined}
    >
      <Icon name="check" size={22} color={palette.gold} weight={2.8} />
    </Animated.View>
  );
}

/** "Effort": the chosen level's name big, the line beside it, and the bars. */
function Effort({
  picks,
  off,
  onLevel,
}: {
  readonly picks: Picks;
  readonly off: boolean;
  readonly onLevel: (effortId: string) => void;
}) {
  const palette = usePalette();
  const shown = shownPick(picks);
  const name = shown.levels[shown.level]?.label ?? "";
  return (
    <View style={[styles.dial, { backgroundColor: palette.surface }]}>
      <View style={styles.now}>
        <Arrive key={name} from={1} rise={7} bounce={9}>
          <Text style={[styles.big, { color: palette.ink }]} testID="model-level-name">
            {name}
          </Text>
        </Arrive>
        <Text style={[styles.note, { color: palette.ink3 }]} numberOfLines={1}>
          {EFFORT_NOTE}
        </Text>
      </View>
      <DialBars levels={shown.levels} level={shown.level} off={off} onPick={onLevel} />
    </View>
  );
}

/** Dimmed, and taking no press, while Same is on: what it shows is the default's. */
function Dim({ off, children }: { readonly off: boolean; readonly children: ReactNode }) {
  const less = useReduceMotion();
  const [opacity] = useState(() => new Animated.Value(off ? DIMMED : 1));
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: off ? DIMMED : 1,
      duration: less ? 0 : 300,
      useNativeDriver: NATIVE,
    }).start();
  }, [opacity, off, less]);
  return (
    <Animated.View style={{ opacity }} pointerEvents={off ? "none" : "auto"}>
      {children}
    </Animated.View>
  );
}

type Look = "off" | "on" | "busy" | "done";

function lookOf(state: ModelSheetState): Look {
  if (state.saving?.state === "saving") return "busy";
  if (state.saving?.state === "saved") return "done";
  return state.maySave ? "on" : "off";
}

/** Save, full width under the sheet's body, and what became of it under that. */
function SaveBar({
  state,
  harnessName,
}: {
  readonly state: ModelSheetState;
  readonly harnessName: string;
}) {
  const palette = usePalette();
  const on = useGround();
  const look = lookOf(state);
  const saving = state.saving;
  const line =
    saving === undefined || look === "busy" || look === "done"
      ? undefined
      : modelWords(saving.state, harnessName, saving.message);
  const ground = {
    off: on.fill,
    on: palette.gold,
    busy: on.fill,
    done: palette.green,
  }[look];
  const label = { off: "Save", on: "Save", busy: modelWords("saving", harnessName), done: "Saved" }[
    look
  ];
  return (
    <View style={styles.saveBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: look !== "on", busy: look === "busy" }}
        disabled={look !== "on"}
        onPress={state.save}
        testID="model-save"
        style={({ pressed }) => [
          styles.save,
          { backgroundColor: ground },
          pressed && look === "on" ? styles.pressed : null,
        ]}
      >
        <Arrive key={look} from={look === "done" ? 0.4 : 0.85} bounce={look === "done" ? 5 : 8}>
          <SaveWords look={look} label={label} />
        </Arrive>
      </Pressable>
      {line === undefined ? null : (
        <Text style={[styles.line, { color: palette.amberInk }]} testID="model-save-line">
          {line}
        </Text>
      )}
    </View>
  );
}

function SaveWords({ look, label }: { readonly look: Look; readonly label: string }) {
  const palette = usePalette();
  const ink = { off: palette.ink4, on: ON_GOLD, busy: palette.ink2, done: "#ffffff" }[look];
  return (
    <View style={styles.saveWords}>
      {look === "busy" ? (
        <ChipPulse gold={palette.gold} ink={palette.ink3} lit={palette.ink} />
      ) : null}
      {look === "done" ? <Icon name="check" size={20} color={ink} /> : null}
      <Text style={[styles.saveLabel, { color: ink }]} testID="model-save-words">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Short of the sheet's X, at the right of this line (ADR 0169).
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingLeft: SPACE.xs,
    paddingRight: CLOSE_ROOM,
    paddingTop: SPACE.xs,
    paddingBottom: SPACE.xs,
  },
  headWords: { flex: 1, minWidth: 0 },
  title: { fontSize: 20, fontWeight: "700", letterSpacing: -0.2 },
  headSub: { fontSize: TEXT.sm },
  // The groups stand in from the sheet's edge as they do from the page's.
  scroll: { flexShrink: 1, marginHorizontal: -SPACE.lg },
  body: { paddingBottom: SPACE.sm },
  same: { paddingTop: SPACE.md },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    minHeight: 52,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm + 2,
  },
  choiceLabel: { flex: 1, fontSize: TEXT.body },
  dial: {
    marginHorizontal: SPACE.lg,
    borderRadius: 22,
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.lg,
    paddingBottom: SPACE.md,
  },
  now: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: SPACE.sm,
    marginBottom: 14,
  },
  big: { fontSize: 22, fontWeight: "700", letterSpacing: -0.2 },
  note: { fontSize: TEXT.sm, flexShrink: 1, textAlign: "right" },
  saveBar: { paddingTop: 14 },
  save: {
    height: SAVE_HEIGHT,
    borderRadius: SAVE_HEIGHT / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { transform: [{ scale: 0.97 }] },
  saveWords: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  saveLabel: { fontSize: TEXT.body, fontWeight: "600" },
  line: {
    fontSize: TEXT.sm,
    lineHeight: TEXT.sm * 1.4,
    paddingTop: SPACE.sm,
    paddingHorizontal: SPACE.xs,
  },
});
