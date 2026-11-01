/**
 * When Chips steps in on agents talking to each other (ADR 0187, Arjun's option 2 from the mock
 * "Messages between agents", 17 October 2026): a sheet off the workspace's group on You. It opens
 * on why it is there, then the stop, the circles switch and the hold, each number four choices,
 * Other and Never; a ladder of what happens in a room as the messages mount; and how Chips counts,
 * behind a disclosure. A hold picked at or under the stop takes the stop down to fit. Save sends
 * all three at once, and is there only when the sheet says something new and whole.
 */

import {
  LIMITS_CHOICES,
  LIMITS_HOW,
  LIMITS_RANGES,
  LIMITS_SETTINGS,
  LIMITS_WHY,
  type LimitsDraft,
  type LimitsStep,
  limitsDraft,
  limitsFoot,
  limitsFromDraft,
  limitsLadder,
  pickedOf,
  pickLimit,
  sameLimits,
  stopFits,
} from "@chipschat/core";
import { DEFAULT_EXCHANGE_LIMITS, type ExchangeLimits, nudgeAt } from "@chipschat/protocol";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useGround } from "../ui/ground";
import { Icon } from "../ui/Icon";
import { Sheet, SheetScroll } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { type Palette, RADIUS, SPACE, TEXT } from "../ui/tokens";
import { SheetHead } from "./SheetHead";

type Kind = "stop" | "hold";

export function ExchangeLimitsSheet({
  open,
  onClose,
  limits,
  onSave,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly limits: ExchangeLimits;
  readonly onSave: (limits: ExchangeLimits) => void;
}) {
  const palette = usePalette();
  const on = useGround();
  const [draft, setDraft] = useState<LimitsDraft>(() => limitsDraft(limits));
  const [how, setHow] = useState(false);
  const stopField = useRef<TextInput>(null);
  const holdField = useRef<TextInput>(null);
  const fields = { stop: stopField, hold: holdField };
  // Each opening starts from what is saved, on any device, with How Chips counts shut.
  useEffect(() => {
    if (!open) return;
    setDraft(limitsDraft(limits));
    setHow(false);
  }, [open, limits]);

  const read = limitsFromDraft(draft);
  const ready = "limits" in read && !sameLimits(read.limits, limits);
  // The ladder says what is picked while it is whole, and what is saved while it is not.
  const shown = "limits" in read ? read.limits : limits;
  const foot = limitsFoot(draft);

  const pick = (kind: Kind, value: string) => {
    setDraft(pickLimit(draft, kind, value).draft);
    if (value === "other") setTimeout(() => fields[kind].current?.focus(), 0);
  };
  const type = (kind: Kind, typed: string) =>
    setDraft(
      pickLimit({ ...draft, typed: { ...draft.typed, [kind]: typed } }, kind, "other").draft,
    );
  const save = () => {
    if (!ready) return;
    onSave(read.limits);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      sizing="bounded"
      cap={0.9}
      keyboard
      testID="exchange-limits-sheet"
    >
      <SheetHead
        title="Messages between agents"
        action={{ label: "Save", onPress: save }}
        disabled={!ready}
      />
      <SheetScroll
        style={styles.shrink}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.why, { backgroundColor: palette.goldSoft }]}>
          <Text style={[styles.whyHead, { color: palette.ink }]}>Why this is here</Text>
          <Text style={[styles.words, { color: palette.ink2 }]}>{LIMITS_WHY}</Text>
        </View>
        <Setting
          kind="stop"
          draft={draft}
          fieldRef={fields.stop}
          onPick={pick}
          onType={type}
          palette={palette}
        />
        <View style={[styles.toggle, { backgroundColor: on.fill }]}>
          <View style={styles.toggleWords}>
            <Title dot={palette.amber} palette={palette}>
              {LIMITS_SETTINGS.circles.title}
            </Title>
            <Text style={[styles.sub, styles.indent, { color: palette.ink3 }]}>
              {LIMITS_SETTINGS.circles.words}
            </Text>
          </View>
          <Switch
            testID="exchange-circles"
            accessibilityLabel={LIMITS_SETTINGS.circles.title}
            value={draft.circles}
            onValueChange={(on) => setDraft({ ...draft, circles: on })}
          />
        </View>
        <Setting
          kind="hold"
          draft={draft}
          fieldRef={fields.hold}
          onPick={pick}
          onType={type}
          palette={palette}
        />
        <Ladder limits={shown} palette={palette} />
        <View style={[styles.how, { backgroundColor: on.fill }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: how }}
            onPress={() => setHow(!how)}
            testID="exchange-how"
            style={styles.howHead}
          >
            <Text style={[styles.howTitle, { color: palette.ink }]}>How Chips counts</Text>
            <View style={how ? styles.turned : null}>
              <Icon name="next" size={16} color={palette.ink3} />
            </View>
          </Pressable>
          {how ? (
            <View style={styles.howBody} testID="exchange-how-body">
              {LIMITS_HOW.map((line) => (
                <View key={line} style={styles.bullet}>
                  <Text style={[styles.words, { color: palette.ink3 }]}>•</Text>
                  <Text style={[styles.words, styles.bulletWords, { color: palette.ink2 }]}>
                    {line}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <Text
          style={[styles.foot, { color: foot.warn ? palette.amberInk : palette.ink3 }]}
          testID="exchange-foot"
        >
          {foot.text}
        </Text>
      </SheetScroll>
    </Sheet>
  );
}

/** A setting's name, with the dot its step wears on the ladder. */
function Title({
  dot,
  palette,
  children,
}: {
  readonly dot: string;
  readonly palette: Palette;
  readonly children: string;
}) {
  return (
    <View style={styles.title}>
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Text style={[styles.titleWords, { color: palette.ink }]}>{children}</Text>
    </View>
  );
}

/** One of the two numbers: its name and what it does, the choices, and Other's field. */
function Setting({
  kind,
  draft,
  fieldRef,
  onPick,
  onType,
  palette,
}: {
  readonly kind: Kind;
  readonly draft: LimitsDraft;
  readonly fieldRef: React.RefObject<TextInput | null>;
  readonly onPick: (kind: Kind, value: string) => void;
  readonly onType: (kind: Kind, typed: string) => void;
  readonly palette: Palette;
}) {
  const on = useGround();
  const words = LIMITS_SETTINGS[kind];
  const fallback = DEFAULT_EXCHANGE_LIMITS[kind];
  const typed = pickedOf(draft, kind);
  const range = LIMITS_RANGES[kind];
  return (
    <View style={styles.setting}>
      <Title dot={kind === "stop" ? palette.amber : palette.red} palette={palette}>
        {words.title}
      </Title>
      <Text style={[styles.sub, styles.indent, { color: palette.ink3 }]}>{words.words}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={words.title}>
        {LIMITS_CHOICES[kind].map((value) => (
          <Chip
            key={value}
            kind={kind}
            value={String(value)}
            label={String(value)}
            under={value === fallback ? "Default" : undefined}
            on={draft[kind] === String(value)}
            disabled={kind === "stop" && !stopFits(draft, value)}
            onPick={onPick}
            palette={palette}
          />
        ))}
        <Chip
          kind={kind}
          value="other"
          label={draft[kind] === "other" && typeof typed === "number" ? String(typed) : "Other"}
          on={draft[kind] === "other"}
          onPick={onPick}
          palette={palette}
        />
        <Chip
          kind={kind}
          value="never"
          label="Never"
          on={draft[kind] === "never"}
          onPick={onPick}
          palette={palette}
        />
      </View>
      {draft[kind] === "other" ? (
        <View style={[styles.field, { backgroundColor: on.fill }]}>
          <TextInput
            ref={fieldRef}
            accessibilityLabel={`${words.title}, a number`}
            testID={`exchange-${kind}-field`}
            value={draft.typed[kind]}
            onChangeText={(text) => onType(kind, text)}
            keyboardType="number-pad"
            returnKeyType="done"
            maxLength={String(range.most).length}
            placeholder={kind === "stop" ? "24" : "150"}
            placeholderTextColor={palette.ink3}
            style={[styles.fieldWords, { color: palette.ink }]}
          />
          <Text style={[styles.sub, { color: palette.ink3 }]}>
            {range.least.toLocaleString("en-US")} to {range.most.toLocaleString("en-US")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Chip({
  kind,
  value,
  label,
  under,
  on,
  disabled = false,
  onPick,
  palette,
}: {
  readonly kind: Kind;
  readonly value: string;
  readonly label: string;
  readonly under?: string | undefined;
  readonly on: boolean;
  readonly disabled?: boolean;
  readonly onPick: (kind: Kind, value: string) => void;
  readonly palette: Palette;
}) {
  const ground = useGround();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on, disabled }}
      accessibilityLabel={under === undefined ? label : `${label}, ${under}`}
      disabled={disabled}
      onPress={() => onPick(kind, value)}
      testID={`exchange-${kind}-${value}`}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: on ? palette.ink : ground.fill,
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={[styles.chipWords, { color: on ? palette.bg : palette.ink }]}>{label}</Text>
      {under === undefined ? null : (
        <Text style={[styles.chipUnder, { color: on ? palette.bg : palette.ink3 }]}>{under}</Text>
      )}
    </Pressable>
  );
}

/** What happens in a room as the messages mount: a rail with the three marks, then each step. */
function Ladder({
  limits,
  palette,
}: {
  readonly limits: ExchangeLimits;
  readonly palette: Palette;
}) {
  const steps = limitsLadder(limits);
  const end = Math.max(200, limits.stop ?? 0, limits.hold ?? 0);
  const at = (value: number) => `${(100 * value) / end}%` as const;
  const tone = (step: LimitsStep) =>
    step.kind === "count" ? palette.ink3 : step.kind === "stop" ? palette.amber : palette.red;
  return (
    <View style={styles.ladder} testID="exchange-ladder">
      <Text style={[styles.ladderHead, { color: palette.ink3 }]}>In a space</Text>
      <View
        style={styles.track}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={[styles.rail, { backgroundColor: palette.surface3 }]} />
        <View
          style={[
            styles.rail,
            {
              backgroundColor: palette.ink4,
              width: limits.hold === null ? "100%" : at(limits.hold),
            },
          ]}
        />
        <View style={[styles.mark, { left: at(nudgeAt(limits)), backgroundColor: palette.ink3 }]} />
        {limits.stop === null ? null : (
          <View style={[styles.mark, { left: at(limits.stop), backgroundColor: palette.amber }]} />
        )}
        {limits.hold === null ? null : (
          <View style={[styles.mark, { left: at(limits.hold), backgroundColor: palette.red }]} />
        )}
        <Text style={[styles.scale, styles.scaleStart, { color: palette.ink3 }]}>0</Text>
        <Text style={[styles.scale, styles.scaleEnd, { color: palette.ink3 }]}>{end}</Text>
      </View>
      {steps.map((step) => (
        <View key={step.kind} style={styles.step} testID={`exchange-step-${step.kind}`}>
          <View
            style={[
              styles.disc,
              step.never
                ? { borderColor: palette.line2, borderWidth: 1 }
                : { backgroundColor: tone(step) },
            ]}
          >
            <Text style={[styles.discWords, { color: step.never ? palette.ink3 : palette.bg }]}>
              {step.mark}
            </Text>
          </View>
          <Text style={[styles.words, styles.stepWords, { color: palette.ink2 }]}>
            {step.words}
          </Text>
        </View>
      ))}
    </View>
  );
}

const DOT = 8;
const DISC = 34;

const styles = StyleSheet.create({
  shrink: { flexShrink: 1 },
  body: { gap: SPACE.lg, paddingHorizontal: SPACE.lg, paddingBottom: SPACE.xl },
  why: { borderRadius: RADIUS.xl, paddingHorizontal: SPACE.md + 2, paddingVertical: SPACE.md },
  whyHead: { fontSize: TEXT.md, fontWeight: "600", marginBottom: 2 },
  words: { fontSize: TEXT.md - 1, lineHeight: (TEXT.md - 1) * 1.4 },
  setting: { gap: SPACE.sm },
  title: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  titleWords: { fontSize: TEXT.md, fontWeight: "600" },
  sub: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.4 },
  indent: { marginLeft: DOT + SPACE.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  chip: {
    flexBasis: "31%",
    flexGrow: 1,
    minHeight: 52,
    borderRadius: RADIUS.xl,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACE.xs,
  },
  chipWords: { fontSize: TEXT.body, fontWeight: "600", fontVariant: ["tabular-nums"] },
  chipUnder: { fontSize: TEXT.xs, marginTop: 1 },
  field: {
    borderRadius: RADIUS.xl,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md,
  },
  fieldWords: {
    flex: 1,
    fontSize: TEXT.body,
    paddingVertical: SPACE.sm,
    fontVariant: ["tabular-nums"],
  },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.md - 2,
  },
  toggleWords: { flex: 1, minWidth: 0, gap: 2 },
  ladder: { gap: SPACE.sm },
  ladderHead: {
    fontSize: TEXT.xs,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  track: { height: 30, marginHorizontal: SPACE.xs },
  rail: { position: "absolute", top: 6, left: 0, height: 4, borderRadius: 2, width: "100%" },
  mark: {
    position: "absolute",
    top: 2,
    width: 12,
    height: 12,
    marginLeft: -6,
    borderRadius: 6,
  },
  scale: { position: "absolute", top: 16, fontSize: TEXT.xs, fontVariant: ["tabular-nums"] },
  scaleStart: { left: 0 },
  scaleEnd: { right: 0 },
  step: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  discWords: { fontSize: TEXT.sm, fontWeight: "700", fontVariant: ["tabular-nums"] },
  stepWords: { flex: 1 },
  how: { borderRadius: RADIUS.xl, overflow: "hidden" },
  howHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACE.md + 2,
    paddingVertical: SPACE.md,
  },
  howTitle: { fontSize: TEXT.md, fontWeight: "600" },
  turned: { transform: [{ rotate: "90deg" }] },
  howBody: { gap: SPACE.sm, paddingHorizontal: SPACE.md + 2, paddingBottom: SPACE.md + 2 },
  bullet: { flexDirection: "row", gap: SPACE.sm },
  bulletWords: { flex: 1 },
  foot: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.4, marginHorizontal: SPACE.xs },
});
