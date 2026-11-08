/**
 * The pages a lifted message opens (ADR 0200): what wants more than a tap on the menu round the
 * bubble (`LiftedMenu.tsx`) is a sheet from the bottom, opened at its page once the menu has gone.
 * The sheet is the same `Sheet` the composer's + opens, so the slide, the handle, the card and the
 * X are the primitive's; what is here is the pages.
 *
 * - **Select text**: the words drawn formatted, as a hand-off's full reply is read (`TextReader`),
 *   so what a finger selects and copies is the words without their marks (Arjun, 18 October 2026).
 * - **Not right?**: in place of the thumbs and *What went wrong?* (ADR 0200). Four reasons, each a
 *   tap, a field for anything else, and Send once there is either; core's `notRight` makes the
 *   note. The sheet rides the keys (ADR 0112).
 * - **What the run did**: the receipt (ADR 0050), for the line that closed a run: how many steps,
 *   how long, what it cost, then the steps, then the model and the tokens when the run said them.
 *   It used to stand under every reply as a box the width of the room (Arjun, 11 September 2026).
 * - **The change**: what a reply's run changed in the room's project (ADR 0222), its files' diffs
 *   and Undo, from "2 files changed" under the reply, or from the row What the run did has for it.
 * - **Edit**: your own words in a field, and Save once they have changed (M5.4).
 * - **Delete for everyone**: the question first, since nothing undoes it (ADR 0167). The line
 *   breaks into dust once the sheet has gone (`Dust.tsx`).
 *
 * The line mounts it only while it is up or on its way down: a choice or the X turns `open` off and
 * the sheet slides away, then `onGone` says it can go.
 */

import {
  type Asking,
  type Directory,
  type Line,
  NOT_RIGHT_REASONS,
  notRight,
  notRightWords,
  type Run,
  type Space,
  type Step,
} from "@chipschat/core";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { formatCost, formatDuration, formatTokens, receiptSummary } from "../ui/format";
import { useGround } from "../ui/ground";
import { Sheet, SheetScroll, SheetTitle } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { ChangeView, type ProjectActions } from "./RoomProject";
import { TextReader } from "./TextReader";

/** The pages the lifted menu opens. */
export type LinePage = "select" | "notRight" | "receipt" | "change" | "edit" | "asking";

/** The change to the room's project a reply carries (ADR 0222), and what its page reads it with. */
export interface LineChange {
  readonly space: Space;
  readonly directory: Directory;
  readonly commit: string;
  /** "2 files changed", and Undone once it is. */
  readonly words: string;
  readonly guest: boolean;
  readonly project: ProjectActions;
}

export interface LinePagesProps {
  readonly line: Line;
  /** Who said it, as the room names them. */
  readonly name: string;
  readonly page: LinePage;
  readonly open: boolean;
  readonly busy: boolean;
  /** The run this line closed, whose receipt What the run did is. */
  readonly run?: Run | undefined;
  /** The change the line carries, which What the run did turns to. */
  readonly change?: LineChange | undefined;
  /** Not right?'s note, sent as a correction the agent hears (ADR 0031, ADR 0200). */
  readonly onNotRight?: ((text: string) => void) | undefined;
  /** The words changed, for a line of one's own. */
  readonly onEdit?: ((text: string) => void) | undefined;
  /** Delete it for everyone, once asked. */
  readonly onDeleteForEveryone?: (() => void) | undefined;
  /** What that page asks. */
  readonly asking?: Asking | undefined;
  readonly onClose: () => void;
  /** The slide out has finished; the sheet may be unmounted. */
  readonly onGone: () => void;
}

export function LinePages(props: LinePagesProps) {
  const { line } = props;
  // What the run did turns to its change in the same sheet, as the room sheet's pages turn.
  const [page, setPage] = useState(props.page);
  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      onGone={props.onGone}
      sizing={SIZING[page]}
      keyboard={page === "notRight" || page === "edit"}
      testID={`line-pages-${line.id}`}
    >
      <Page {...props} page={page} onChange={() => setPage("change")} />
    </Sheet>
  );
}

/** How tall each page may be: the reader the whole sheet, the receipt as much as it scrolls in. */
const SIZING: Record<LinePage, "content" | "bounded" | "full"> = {
  select: "full",
  notRight: "content",
  receipt: "bounded",
  change: "bounded",
  edit: "content",
  asking: "content",
};

/** The page asked for, when the line offers it. */
function Page(props: LinePagesProps & { readonly onChange: () => void }) {
  const { line, run, change, onNotRight, onEdit, asking } = props;
  switch (props.page) {
    case "select":
      return <TextReader title="Select text" text={line.text} onBack={props.onClose} />;
    case "notRight":
      return onNotRight === undefined ? null : <NotRightPage {...props} onSend={onNotRight} />;
    case "receipt":
      return run === undefined ? null : (
        <ReceiptPage run={run} name={props.name} change={change} onChange={props.onChange} />
      );
    case "change":
      return change === undefined ? null : (
        <View style={styles.bounded} testID="line-change">
          <SheetTitle hint={props.name}>{change.words}</SheetTitle>
          <ChangeView {...change} onDone={props.onClose} />
        </View>
      );
    case "edit":
      return onEdit === undefined ? null : <EditPage {...props} onSave={onEdit} />;
    case "asking":
      return asking === undefined ? null : <AskingFirst {...props} asking={asking} />;
  }
}

/**
 * Not right?: the reasons, a reason a tap and a tap again to let it go; the field; Send, which
 * waits for one or the other. Sent, the sheet goes, and the note lands under the bubble.
 */
function NotRightPage(props: LinePagesProps & { readonly onSend: (text: string) => void }) {
  const palette = usePalette();
  const on = useGround();
  const words = notRightWords(props.name);
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [more, setMore] = useState("");
  const note = notRight(picked, more);
  return (
    <View style={styles.page} testID="not-right">
      <SheetTitle hint={words.subtitle}>{words.title}</SheetTitle>
      <View style={styles.reasons} accessibilityRole="list">
        {NOT_RIGHT_REASONS.map((reason) => {
          const chosen = picked.includes(reason);
          return (
            <Pressable
              key={reason}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: chosen }}
              accessibilityLabel={reason}
              testID={`reason-${reason}`}
              onPress={() =>
                setPicked((now) =>
                  now.includes(reason) ? now.filter((each) => each !== reason) : [...now, reason],
                )
              }
              style={({ pressed }) => [
                styles.reason,
                chosen
                  ? { backgroundColor: palette.ink, borderColor: palette.ink }
                  : { backgroundColor: on.fill, borderColor: palette.line2 },
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={[styles.reasonWords, { color: chosen ? palette.bg : palette.ink }]}>
                {reason}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Field
        label="Anything else"
        value={more}
        onChange={setMore}
        placeholder={words.placeholder}
        lines={3}
        disabled={props.busy}
        testID={`not-right-${props.line.id}`}
      />
      <Button
        label={words.send}
        variant="primary"
        busy={props.busy}
        disabled={note === undefined}
        onPress={() => {
          if (note === undefined) return;
          props.onSend(note);
          props.onClose();
        }}
        testID="not-right-send"
      />
      {note === undefined ? (
        <Text style={[styles.foot, { color: palette.ink3 }]}>{words.empty}</Text>
      ) : null}
    </View>
  );
}

/** Your words in a field, and Save once they say something else. */
function EditPage(props: LinePagesProps & { readonly onSave: (text: string) => void }) {
  const [text, setText] = useState(props.line.text);
  const trimmed = text.trim();
  const changed = trimmed !== "" && trimmed !== props.line.text.trim();
  return (
    <View style={styles.page} testID="edit-page">
      <SheetTitle>Edit message</SheetTitle>
      <Field
        label="Message"
        value={text}
        onChange={setText}
        lines={4}
        disabled={props.busy}
        testID={`edit-${props.line.id}`}
      />
      <Button
        label="Save"
        variant="primary"
        busy={props.busy}
        disabled={!changed}
        onPress={() => {
          props.onSave(trimmed);
          props.onClose();
        }}
      />
    </View>
  );
}

/**
 * What the run did, on a page of its own: the receipt, scrolling when the run was long, and the
 * change it made to the room's project, which turns to that change.
 */
function ReceiptPage({
  run,
  name,
  change,
  onChange,
}: {
  readonly run: Run;
  readonly name: string;
  readonly change: LineChange | undefined;
  readonly onChange: () => void;
}) {
  const palette = usePalette();
  const on = useGround();
  return (
    <View style={styles.bounded}>
      <SheetTitle hint={name}>What the run did</SheetTitle>
      <SheetScroll bounces={false} style={styles.bounded} contentContainerStyle={styles.page}>
        <RunReceipt run={run} />
        {change === undefined ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${change.words}, see the change`}
            onPress={onChange}
            testID="receipt-change"
            style={({ pressed }) => [
              styles.changed,
              { backgroundColor: pressed ? on.pressed : on.fill, borderColor: palette.line },
            ]}
          >
            <Text style={[styles.changedWords, { color: palette.ink }]}>{change.words}</Text>
            <Text style={[styles.changedGo, { color: palette.ink3 }]}>See the change</Text>
          </Pressable>
        )}
      </SheetScroll>
    </View>
  );
}

/**
 * The page that asks before a message is deleted for everyone: which message, as the sheet's title
 * says it, then core's words, the act in red, and Cancel, which puts the sheet away.
 */
function AskingFirst(props: LinePagesProps & { readonly asking: Asking }) {
  const palette = usePalette();
  const { asking } = props;
  return (
    <View style={styles.bounded} testID="delete-asking">
      <SheetTitle hint={props.name}>{asking.title}</SheetTitle>
      <Text style={[styles.askBody, { color: palette.ink2 }]}>{asking.body}</Text>
      {asking.note === undefined ? null : (
        <Text style={[styles.askBody, { color: palette.ink3 }]}>{asking.note}</Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={asking.confirm}
        testID="delete-for-everyone-confirm"
        onPress={() => {
          props.onDeleteForEveryone?.();
          props.onClose();
        }}
        style={({ pressed }) => [
          styles.go,
          { backgroundColor: palette.red, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={styles.goWords}>{asking.confirm}</Text>
      </Pressable>
      <Button label="Cancel" onPress={props.onClose} style={styles.cancel} />
    </View>
  );
}

/** The steps a receipt counts: what the run did, not the ticks on its rail nor a plan not yet begun. */
export function receiptSteps(run: Run): readonly Step[] {
  return run.steps.filter((step) => step.kind !== "tick" && step.status !== "planned");
}

/**
 * Whether the run has a receipt worth asking for: steps, or a cost. A run that only answered still
 * cost something, and its receipt is the one place the phone says what (India trip, 20 October
 * 2026).
 */
export function hasReceipt(run: Run): boolean {
  return receiptSteps(run).length > 0 || run.costUsd !== undefined;
}

/** How long the run took, from the events that said when it began and ended. */
function tookMs(run: Run): number | undefined {
  if (run.startedAt === undefined || run.endedAt === undefined) return undefined;
  return new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime();
}

/** The receipt's one line: what it cost, how many steps, how long. */
export function receiptLine(run: Run): string {
  return receiptSummary(receiptSteps(run), tookMs(run), run.costUsd);
}

/**
 * The receipt's line under What the run did on a held message, in two: what it cost, which the
 * menu draws in ink, and the rest (ADR 0282: "the cost is the last thing on a small grey line").
 */
export function receiptParts(run: Run): { readonly cost?: string; readonly rest: string } {
  const rest = receiptSummary(receiptSteps(run), tookMs(run));
  return run.costUsd === undefined ? { rest } : { cost: formatCost(run.costUsd), rest };
}

/**
 * The model and the tokens, when the run reported them: `gpt-5.6-sol · 30.2k in · 232 out`, and
 * how many of those in came from the prompt cache, `19.8k in (15.4k cached)`. A count the harness
 * could not say is left out, not shown as nought.
 */
function toldBy(run: Run): string {
  return [
    run.model,
    run.inputTokens === undefined ? undefined : tokensIn(run.inputTokens, run.cacheReadTokens),
    run.outputTokens === undefined ? undefined : `${formatTokens(run.outputTokens)} out`,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}

function tokensIn(tokens: number, cached: number | undefined): string {
  const said = `${formatTokens(tokens)} in`;
  if (cached === undefined || cached <= 0) return said;
  return `${said} (${formatTokens(Math.min(cached, tokens))} cached)`;
}

/** What the run did: the receipt's one line, then its steps, then who did them and at what length. */
function RunReceipt({ run }: { readonly run: Run }) {
  const palette = usePalette();
  const on = useGround();
  const steps = receiptSteps(run);
  const foot = toldBy(run);
  return (
    <View
      style={[styles.receipt, { backgroundColor: on.fill, borderColor: palette.line }]}
      testID="receipt"
    >
      <Text style={[styles.summary, { color: palette.ink }]}>{receiptLine(run)}</Text>
      {steps.map((step) => (
        <View key={step.stepId} style={[styles.step, { borderTopColor: palette.line }]}>
          <Text style={[styles.stepWords, { color: palette.ink2 }]}>
            <Text style={{ color: step.status === "failed" ? palette.red : palette.green }}>
              {step.status === "failed" ? "✕" : "✓"}
            </Text>
            {` ${step.title}`}
          </Text>
          {step.durationMs === undefined ? null : (
            <Text style={[styles.stepTook, { color: palette.ink3 }]}>
              {formatDuration(step.durationMs)}
            </Text>
          )}
        </View>
      ))}
      {foot === "" ? null : (
        <Text
          style={[
            styles.foot,
            styles.receiptFoot,
            { color: palette.ink3, borderTopColor: palette.line },
          ]}
        >
          {foot}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: SPACE.md },
  bounded: { flexShrink: 1, minHeight: 0 },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  reason: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  reasonWords: { fontSize: TEXT.md },
  pressed: { opacity: 0.7 },
  foot: { fontSize: TEXT.sm, textAlign: "center" },
  cancel: { marginTop: SPACE.md },
  askBody: { fontSize: TEXT.md, lineHeight: 21, paddingHorizontal: SPACE.xs, marginTop: SPACE.sm },
  // The room sheet's own act in red (`RoomSheet.tsx`'s `Asks`).
  go: {
    minHeight: 52,
    borderRadius: RADIUS.xl,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACE.xl,
  },
  goWords: { color: "#ffffff", fontSize: TEXT.body, fontWeight: "600" },
  receipt: { borderWidth: 1, borderRadius: RADIUS.lg, paddingHorizontal: SPACE.md },
  changed: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 48,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.md,
  },
  changedWords: { fontSize: TEXT.md, fontWeight: "600" },
  changedGo: { fontSize: TEXT.sm },
  summary: { fontSize: TEXT.md, fontWeight: "600", paddingVertical: SPACE.md },
  step: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: SPACE.sm,
    paddingVertical: SPACE.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stepWords: { fontSize: TEXT.sm, flexShrink: 1 },
  stepTook: { fontSize: TEXT.sm, fontVariant: ["tabular-nums"] },
  receiptFoot: {
    fontSize: TEXT.xs,
    textAlign: "left",
    paddingVertical: SPACE.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
