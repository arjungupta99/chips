/**
 * The answer to an ask, in a tray of glass at the foot of its screen (ADR 0280), where a thumb
 * already is: how far a yes reaches, what that lets through, and Deny and Approve. Deny's reason,
 * an edit and Hand to… take the tray's place while they are open, and the tray grows to them from
 * its foot and rides up with the keys.
 *
 * Approve says how far it reaches (`Approve for an hour`), and once pressed turns green with a
 * tick and what was given (`Until 12:09 AM`) before the screen goes.
 *
 * For an hour draws the hour as a strip from now to its end. Always, on a command, lights the
 * words it keeps in the command above (`CommandPlate`), so the tray says only where it holds and
 * what still comes to a person.
 *
 * Above the choices, one switch lets the agent work without asking (ADR 0281): on, the choices fold
 * away, a line says what it lets through until it is stopped, and Approve says "Approve and let it
 * work". It is there for every ask but one that matters, as For an hour is; a command that keeps
 * no Always still takes both, and the line under Once says why there is no Always.
 */

import type { Approval, AskStanding, Lasting, Plate, Reach } from "@chipschat/core";
import {
  answeredWords,
  approveWords,
  askLastings,
  hourEnds,
  letWorkWords,
  reachWords,
  untilStoppedWords,
  whileWords,
} from "@chipschat/core";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Button } from "../ui/Button";
import type { Choice } from "../ui/Choices";
import { Field } from "../ui/Field";
import { Opens } from "../ui/growing";
import { type Segment, Segmented } from "../ui/Segmented";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { CodeWords } from "./Asked";
import { AnswerFace, Fold, StripFill } from "./AskMotion";
import { HandOn } from "./HandOn";

const LABELS: Readonly<Record<string, string>> = {
  once: "Once",
  hour: "For an hour",
  always: "Always",
};

const WHERE: readonly Segment[] = [
  { value: "everywhere", label: "In every space" },
  { value: "space", label: "In this space" },
];

export type Where = "everywhere" | "space";

export type Mode = "idle" | "editing" | "denying" | "handing";

/** A decision as the tray's forms make it, before the choice above them says how far it reaches. */
export interface Decided {
  readonly decision: "approved" | "edited" | "denied";
  readonly reason?: string | undefined;
  readonly updatedInput?: unknown;
}

export interface TrayProps {
  readonly approval: Approval;
  readonly standing: AskStanding;
  readonly plate: Plate | undefined;
  readonly harnessName: string;
  readonly spaceName: string;
  readonly now: number;
  readonly busy: boolean;
  readonly lasting: Lasting;
  readonly setLasting: (lasting: Lasting) => void;
  /** Whether the agent is let work without asking (ADR 0281); absent where it isn't offered. */
  readonly letWork: boolean | undefined;
  readonly setLetWork: (on: boolean) => void;
  /** Whether the server keeps For an hour and Let it work; the hour isn't offered if not. */
  readonly keeps: boolean;
  /** Where an Always is kept, when this person may pick (an owner or admin); else this space. */
  readonly where: Where | undefined;
  readonly setWhere: (where: Where) => void;
  readonly reach: Reach;
  readonly mode: Mode;
  readonly setMode: (mode: Mode) => void;
  readonly draft: string;
  readonly setDraft: (draft: string) => void;
  readonly reason: string;
  readonly setReason: (reason: string) => void;
  readonly decide: (input: Decided) => void;
  /** How far the yes that was given reaches, once Approve is pressed. */
  readonly answered: Lasting | undefined;
  readonly handTo: readonly Choice[];
  readonly onHand: (to: string, reason: string | undefined) => void;
}

export function Tray(props: TrayProps) {
  const palette = usePalette();
  const { mode } = props;
  if (mode === "editing") return <EditForm {...props} />;
  if (mode === "denying") return <DenyForm {...props} />;
  if (mode === "handing") {
    return (
      <HandOn
        options={props.handTo}
        busy={props.busy}
        onCancel={() => props.setMode("idle")}
        onHand={(to, reason) => {
          props.setMode("idle");
          props.onHand(to, reason);
        }}
      />
    );
  }
  return (
    // What the tray opens with is there; what a switch or a choice brings folds in.
    <Opens>
      {props.letWork === undefined ? null : <LetWork {...props} />}
      {props.letWork === true ? (
        <Fold key="work" style={styles.fold}>
          <Text style={[styles.line, { color: palette.ink3 }]} testID="until-stopped">
            {untilStoppedWords(props.harnessName)}
          </Text>
        </Fold>
      ) : (
        <Fold key="reaches" style={styles.reaches}>
          <Reaches {...props} />
        </Fold>
      )}
      <Answer {...props} />
    </Opens>
  );
}

/**
 * The switch that lets the agent work without asking (ADR 0281): a row and not a button, as a
 * Settings row with a switch is (`LockRow`), gold while it is on.
 */
function LetWork(props: TrayProps) {
  const palette = usePalette();
  const on = props.letWork === true;
  const words = letWorkWords(props.harnessName, props.spaceName);
  return (
    <View
      style={[
        styles.let,
        on
          ? { backgroundColor: palette.goldSoft, borderColor: palette.gold }
          : { backgroundColor: palette.surface, borderColor: palette.line },
      ]}
      testID="let-work"
    >
      <View style={styles.letWords}>
        <Text style={[styles.letTitle, { color: palette.ink }]}>{words.title}</Text>
        <Text style={[styles.line, { color: on ? palette.goldDeep : palette.ink3 }]}>
          {words.sub}
        </Text>
      </View>
      <Switch
        value={on}
        onValueChange={props.setLetWork}
        disabled={props.busy || props.answered !== undefined}
        trackColor={{ true: palette.gold, false: palette.surface3 }}
        accessibilityLabel={words.title}
        accessibilityHint={words.sub}
        testID="let-work-switch"
      />
    </View>
  );
}

/** Why there is no Always, or no choice at all, red-dotted when the command above marks the words. */
function OnceWhy({ standing, plate }: Pick<TrayProps, "standing" | "plate">) {
  const palette = usePalette();
  if (standing.kind !== "once") return null;
  const marked = plate?.parts.some((part) =>
    part.bits.some((bit) => bit.kind === "writes" || bit.kind === "never"),
  );
  return (
    <View style={styles.onceLine}>
      {marked === true ? (
        <View style={[styles.dot, { backgroundColor: palette.red }]} testID="once-dot" />
      ) : null}
      <CodeWords
        words={standing.why}
        style={styles.onceWords}
        ink={palette.ink2}
        testID="once-only"
      />
    </View>
  );
}

/**
 * How far a yes reaches: Once, For an hour or Always, and what the one picked lets through. An ask
 * that matters is answered once (ADR 0195): no choice, and a line says why in its place. A command
 * that keeps no Always (ADR 0239) offers Once and For an hour, and under Once says why.
 */
function Reaches(props: TrayProps) {
  const palette = usePalette();
  const { standing, lasting } = props;
  const lastings = askLastings(standing, props.keeps);
  if (lastings.length === 0) return <OnceWhy standing={standing} plate={props.plate} />;
  const commands = standing.kind === "starts";
  return (
    <>
      <Segmented
        label="How far this yes reaches"
        options={lastings.map((value) => ({ value, label: LABELS[value] ?? value }))}
        chosen={lasting}
        onChoose={(value) => props.setLasting(value as Lasting)}
        testID="lasting"
      />
      {lasting === "once" ? <OnceWhy standing={standing} plate={props.plate} /> : null}
      {lasting === "hour" ? (
        <Fold key="hour" style={styles.fold}>
          <HourStrip now={props.now} />
          <Text style={[styles.line, { color: palette.ink3 }]} testID="for-a-while">
            {whileWords(props.harnessName)}
          </Text>
        </Fold>
      ) : null}
      {lasting === "always" ? (
        <Fold key="always" style={styles.fold}>
          {props.where === undefined ? null : (
            <Segmented
              label="Where this Always holds"
              options={WHERE}
              chosen={props.where}
              onChoose={(value) => props.setWhere(value as Where)}
              testID="where"
            />
          )}
          <Text style={[styles.line, { color: palette.ink3 }]} testID="reach">
            {reachWords(props.reach, props.spaceName, commands)}
          </Text>
        </Fold>
      ) : null}
    </>
  );
}

/** The hour a yes for a while holds, from now to its end, filling as it is picked. */
function HourStrip({ now }: { readonly now: number }) {
  const palette = usePalette();
  const ends = hourEnds(now);
  return (
    <View style={styles.strip} testID="hour-strip">
      <View style={[styles.bar, { backgroundColor: palette.surface3 }]}>
        <StripFill style={[styles.fill, { backgroundColor: palette.gold }]} />
      </View>
      <View style={styles.ends}>
        <Text style={[styles.end, { color: palette.ink3 }]}>{ends.from}</Text>
        <Text style={[styles.end, styles.until, { color: palette.ink }]}>{ends.until}</Text>
      </View>
    </View>
  );
}

/** Deny, Edit when the ask can be, and Approve saying how far it reaches. */
function Answer(props: TrayProps) {
  const palette = usePalette();
  const { approval, busy, answered } = props;
  const gone = answered !== undefined;
  const word = approveWords(props.letWork === true ? "work" : props.lasting);
  const done =
    answered === undefined
      ? word
      : answeredWords(answered, props.now, props.reach, props.spaceName);
  return (
    <View style={styles.buttons}>
      <Button
        label="Deny"
        variant="danger"
        grow
        disabled={busy || gone}
        style={styles.tall}
        onPress={() => props.setMode("denying")}
      />
      {approval.editable ? (
        <Button
          label="Edit"
          grow
          disabled={busy || gone}
          style={styles.tall}
          onPress={() => props.setMode("editing")}
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={gone ? done : word}
        accessibilityState={{ disabled: busy || gone, busy }}
        disabled={busy || gone}
        onPress={() => props.decide({ decision: "approved" })}
        style={({ pressed }) => [styles.grow, pressed ? styles.pressed : null]}
        testID="approve"
      >
        <AnswerFace
          answered={gone}
          word={word}
          done={done}
          ground={palette.ink}
          answeredGround={palette.green}
          ink={palette.bg}
          answeredInk="#ffffff"
          style={styles.approve}
          wordStyle={styles.approveWord}
        />
      </Pressable>
    </View>
  );
}

function EditForm(props: TrayProps) {
  return (
    <View style={styles.form} testID="edit-form">
      <Field
        label="What should go instead"
        value={props.draft}
        onChange={props.setDraft}
        lines={4}
        disabled={props.busy}
        testID="edit-input"
      />
      <View style={styles.buttons}>
        <Button label="Cancel" grow disabled={props.busy} onPress={() => props.setMode("idle")} />
        <Button
          label="Approve with edits"
          variant="primary"
          grow
          busy={props.busy}
          disabled={props.draft.trim() === ""}
          onPress={() =>
            props.decide({
              decision: "edited",
              updatedInput: { ...(props.approval.input as object | undefined), body: props.draft },
            })
          }
        />
      </View>
    </View>
  );
}

function DenyForm(props: TrayProps) {
  const why = props.reason.trim();
  return (
    <View style={styles.form} testID="deny-form">
      <Field
        label="Why not? The harness gets to read this."
        value={props.reason}
        onChange={props.setReason}
        lines={2}
        disabled={props.busy}
        testID="deny-input"
      />
      <View style={styles.buttons}>
        <Button label="Cancel" grow disabled={props.busy} onPress={() => props.setMode("idle")} />
        <Button
          label="Deny"
          variant="danger"
          grow
          busy={props.busy}
          onPress={() =>
            props.decide({
              decision: "denied",
              ...(why === "" ? {} : { reason: why }),
            })
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.4 },
  fold: { gap: SPACE.sm },
  onceLine: { flexDirection: "row", alignItems: "flex-start", gap: SPACE.sm },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  onceWords: { flex: 1, fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.45 },
  strip: { gap: 6 },
  bar: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderRadius: 4 },
  ends: { flexDirection: "row", justifyContent: "space-between" },
  end: { fontSize: TEXT.xs, fontVariant: ["tabular-nums"] },
  until: { fontWeight: "600" },
  buttons: { flexDirection: "row", gap: SPACE.sm },
  tall: { minHeight: 48, borderRadius: 12 },
  grow: { flex: 1 },
  pressed: { opacity: 0.85 },
  approve: { minHeight: 48, borderRadius: 12, justifyContent: "center", overflow: "hidden" },
  approveWord: { fontSize: TEXT.md, fontWeight: "600" },
  form: { gap: SPACE.md },
  let: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
  },
  reaches: { gap: SPACE.md },
  letWords: { flex: 1, gap: 2 },
  letTitle: { fontSize: TEXT.md, fontWeight: "600" },
});
