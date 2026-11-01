/**
 * A queued turn's work, drawn as the room draws a harness thinking.
 *
 * The message itself is Jacobian's and arrives as text, edited in place as the turn goes
 * (core's `taskWords.ts` reads it). What it says is exactly what the thinking bubble says — what it is
 * thinking, and what it has called — so it is said the same way (ADR 0126): the lit dots in the
 * colour of the face beside it where the thought bubble emoji was, the words a size down from a
 * message's, the call in a pill drawn by its kind (`CallPill`), the words rolling and the bubble
 * opening as they change, and a light crossing on that beat (`Rolling.tsx`, `ui/Dots.tsx`).
 * It wore the gold mark working until 6 October 2026, as the thinking bubble did (Arjun: "switch
 * the queued-turn bubble to the dots too").
 *
 * The calls hang under the words as a wire, one dot each, the one in hand lit in the face's
 * colour: a turn is a sequence and three lines beginning with a triangle drew it as a list of
 * three unrelated things. Three deep, because three is what the harness keeps and sends.
 *
 * It ends as a receipt — `Worked 25s · 2 steps` — and the receipt is the quiet register: the
 * calls fold away into their own count, the words step down to a caption, and the dots go. Three
 * dots standing still in a room's history read as words left unsaid rather than as work that is
 * over. What is over should recede; it stays in the room for as long as the room does.
 *
 * No arrival of its own: it is a line in the room, and a line landing already rises into its
 * place (`RoomMotion.tsx`).
 */

import { stepWords, type TaskBubble as Task, verbWords } from "@chipschat/core";
import { memo } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Dots } from "../ui/Dots";
import { usePalette } from "../ui/theme";
import { BUBBLE, LEADING_PHONE, type Palette, SPACE, TEXT } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";
import { CALL_LINE, CALL_PAD, CallPill } from "./CallPill";
import { Sheen, useRolling, useSheen } from "./Rolling";

/** As many lines as a thought may take before it is somebody else's paragraph in your room. */
const LINES = 3;
/** As many calls as the wire hangs, which is as many as the harness sends. */
const CALLS = 3;
/**
 * The wire's dot, and how far the middle of a call's first line falls from the top of its row:
 * the pill's margin, the pill's padding and half a line. The dot stands there and the rail runs
 * through it, so a call that wraps to three lines leaves both of them where its words begin.
 */
const DOT = 7;
const PILL_GAP = 2;
const MID = PILL_GAP + CALL_PAD + CALL_LINE / 2;
/** A thought's line: a size down from a message's, as the thinking bubble sets it. */
const LINE = Math.round(TEXT.md * LEADING_PHONE);

/** By value: the message is re-read on every edit, and the object is not the news. */
function keyOf(task: Task): string {
  return [task.headline, task.thought, task.worked, task.stuck, ...task.steps].join("\n");
}

export const TaskBubble = memo(function TaskBubble({
  task,
  colour,
}: {
  readonly task: Task;
  /** The colour of the face beside it (`faceGround`), which its dots and its lit call wear. */
  readonly colour: string;
}) {
  const palette = usePalette();
  const less = useReduceMotion();
  const roll = useRolling(task, keyOf(task), less);
  const sheen = useSheen(roll.key, less);
  const shown = roll.shown;
  const working = shown.worked === undefined;
  const said = [shown.headline, shown.thought ?? shown.worked, stepWords(shown.steps.at(-1))]
    .filter((part) => part !== undefined)
    .join(" · ");
  return (
    <View
      testID="task"
      onLayout={sheen.onLayout}
      accessible
      accessibilityRole={working ? "progressbar" : "text"}
      accessibilityLabel={said}
      style={styles.root}
    >
      {shown.headline === undefined ? null : (
        <Text
          maxFontSizeMultiplier={BUBBLE.maxScale}
          style={[styles.headline, { color: palette.ink }]}
        >
          {shown.headline}
        </Text>
      )}
      <View style={styles.row}>
        {/* While there is work; a receipt is a settled thing, and wears none. */}
        {working ? <Dots colour={colour} lit line={LINE} testID="task-dots" /> : null}
        {/* The same box the thinking bubble stands its words in; the bubble opens to it on the
            room's transition (`RoomMotion.tsx`). */}
        <View testID="task-box" style={styles.box}>
          <Animated.View style={roll.words}>
            <Text
              numberOfLines={working ? LINES : 1}
              maxFontSizeMultiplier={BUBBLE.maxScale}
              style={
                working
                  ? [styles.thought, { color: palette.ink2 }]
                  : [styles.worked, { color: palette.ink3 }]
              }
            >
              {working ? verbWords(shown.thought) : shown.worked}
            </Text>
            <Steps steps={shown.steps} colour={colour} palette={palette} />
            {shown.stuck === undefined ? null : (
              <Text
                numberOfLines={2}
                maxFontSizeMultiplier={BUBBLE.maxScale}
                style={[styles.stuck, { color: palette.ink3 }]}
              >
                {shown.stuck}
              </Text>
            )}
          </Animated.View>
        </View>
      </View>
      {/* Past the bubble's padding on every side, so the light crosses the bubble and not the
          words; a bubble already clips what overflows it to its own corner (`Line.tsx`). */}
      <View pointerEvents="none" style={styles.bleed}>
        <Sheen at={sheen.at} width={sheen.width + BUBBLE.padX * 2} gold={palette.gold} />
      </View>
    </View>
  );
});

/**
 * The calls, as a wire with a dot for each: oldest at the top, the one in hand lit at the foot in
 * the face's colour. A pill each, as the thinking bubble draws its call (`CallPill`) — a tool is a
 * thing and not a clause.
 */
function Steps({
  steps,
  colour,
  palette,
}: {
  readonly steps: readonly string[];
  readonly colour: string;
  readonly palette: Palette;
}) {
  const shown = steps.slice(-CALLS);
  if (shown.length === 0) return null;
  return (
    <View testID="task-wire" style={styles.steps}>
      {shown.map((step, index) => {
        const last = index === shown.length - 1;
        return (
          // A harness calls the same tool twice in a turn, so the step is not its own identity.
          // biome-ignore lint/suspicious/noArrayIndexKey: where it stands in the turn is the key.
          <View key={`${index}-${step}`} style={styles.step}>
            <View style={styles.gutter}>
              {index === 0 ? null : (
                <View style={[styles.rail, styles.railUp, { backgroundColor: palette.line2 }]} />
              )}
              {last ? null : (
                <View style={[styles.rail, styles.railDown, { backgroundColor: palette.line2 }]} />
              )}
              <View style={[styles.dot, { backgroundColor: last ? colour : palette.ink4 }]} />
            </View>
            <CallPill
              step={step}
              palette={palette}
              ink={last ? palette.ink2 : palette.ink3}
              style={styles.call}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // The width the bubble gives it, never the width its calls want. Standing to its own content,
  // this and the wire below it were laid out at the longest call's full length and the bubble's
  // corner cut them off mid-word: `web search · Starship Flight 14 Sept` and a URL ran off the
  // edge of the room with no ellipsis to say so (Arjun, 1 October 2026). Taking the width it is
  // given, the pills shrink inside it and the words end where the bubble ends. The bubble still
  // draws itself to its longest line, because a box standing in a width still asks for one.
  root: { flexShrink: 1 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: SPACE.sm },
  headline: { fontSize: TEXT.body, lineHeight: Math.round(TEXT.body * LEADING_PHONE) },
  // Shrinks, so the words wrap at the bubble's width rather than pushing past it; clips, so a
  // line the box has not grown to yet waits behind its edge instead of spilling into the room.
  box: { flexShrink: 1 },
  thought: { fontSize: TEXT.md, lineHeight: LINE },
  // The receipt: a caption, because the work is over.
  worked: { fontSize: TEXT.sm, lineHeight: 20 },
  stuck: { fontSize: TEXT.sm, lineHeight: 18, marginTop: 3 },
  // In the box's width, for the reason the root is in the bubble's: a wire that stands to its
  // own calls overflows whatever it is in.
  steps: { marginTop: 5 },
  // The call's words begin at the top of its row and run as far down as they need, so the dot
  // keeps to the first line rather than the middle of three.
  step: { flexDirection: "row", alignItems: "flex-start", gap: SPACE.sm },
  // The dot's column, as tall as the call beside it. The rail is drawn in it a segment at a
  // time, from one dot down to the next, because a wire drawn once for the whole wire is drawn
  // to the padding its dots used to have and hangs below the last one as soon as a call wraps.
  gutter: { width: DOT, alignSelf: "stretch" },
  rail: { position: "absolute", left: (DOT - 1) / 2, width: 1 },
  railUp: { top: 0, height: MID },
  railDown: { top: MID, bottom: 0 },
  dot: { position: "absolute", top: MID - DOT / 2, width: DOT, height: DOT, borderRadius: DOT / 2 },
  // A call stands a little apart from the next, so the wire shows between them.
  call: { marginVertical: PILL_GAP },
  bleed: {
    position: "absolute",
    top: -BUBBLE.padY,
    bottom: -BUBBLE.padY,
    left: -BUBBLE.padX,
    right: -BUBBLE.padX,
  },
});
