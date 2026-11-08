/**
 * One thing waiting on a person, at the foot of the room it is about.
 *
 * Who wants what, the lane it came down, the risks, how long is left, and — for an approval
 * this person may answer — two buttons and a swipe. Swipe right approves and left denies,
 * which is the phone's whole argument for existing: a decision that takes one thumb and no
 * reading is a decision made in a queue at a coffee shop rather than an hour later at a desk.
 *
 * The buttons stay. A swipe is a shortcut, never the only way: it is invisible, it is easy to
 * do by accident on a moving train, and somebody holding the phone in their other hand cannot
 * do it at all. Everything reachable by swipe is reachable by tap.
 *
 * Both answer in the hand as well as on the screen (`ui/haptics.ts`): the swipe clicks once as
 * it crosses the line where letting go decides, so a thumb knows it has gone far enough without
 * watching, and the answer itself feels like the system's success or its warning. Which of the
 * two is the only thing a person gets if the card has already slid away.
 *
 * Details is for what a thumb cannot do on a card: a scope beyond this once, an edit, a reason, a
 * hand-on. A question carries its own form: the options, the words, Send (15 September 2026,
 * Arjun — the form on a screen of its own showed the prompt and none of the plan it asked about).
 *
 * The same card stood in For you, the queue across every space, until 22 September 2026, when
 * that was withdrawn (ADR 0065); the words that took you from there to the room, and the hint
 * that taught the swipe there, went with it.
 *
 * A decision or an answer the server turned away says why under the card, in red, until the next
 * try: without it the tap looked as if it had done nothing (the Chess Game space).
 */

import type { Approval, NeedsYouItem, Question, Snapshot } from "@chipschat/core";
import { commandPlate, nameOf, plainWords } from "@chipschat/core";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { faceProps } from "../agents/face";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import * as feel from "../ui/haptics";
import { Pill } from "../ui/Pill";
import { Risk } from "../ui/Risk";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { timeLeft } from "../ui/when";
import { approvalFor, askHeading, laneTrail, lapseWords, OUTSIDE, refusalWords } from "../words";
import { Ask, type Chosen } from "./Ask";
import { Effect, Headline, Lasts } from "./Asked";
import { AskShown, saysLasts } from "./CommandPlate";
import { Crossing } from "./Crossing";
import { swipeDecision } from "./swipe";

export type Decision = "approved" | "denied";

/**
 * How far the card has to travel before letting go answers the ask. Far enough that a thumb
 * flicking down the room cannot approve something by brushing it, near enough to be one
 * movement. The same number decides both sides and is the line the click marks.
 */
const THRESHOLD = 72;

/**
 * What an answer feels like. A yes is the system's success; a no is its warning and not its
 * error — nothing has gone wrong, somebody decided, and the two are different enough in the
 * hand to tell a denial from an approval without looking at the card.
 */
function felt(decision: Decision): void {
  if (decision === "approved") feel.success();
  else feel.warning();
}

export interface NeedsCardProps {
  readonly item: NeedsYouItem;
  readonly snapshot: Snapshot;
  readonly now: number;
  readonly busy: boolean;
  /** Absent when this ask is not this person's to answer, or is not an approval at all. */
  readonly onDecide?: ((approval: Approval, decision: Decision) => void) | undefined;
  /** The ask's own screen: scope, edit, a reason, a hand-on; a question's form. */
  readonly onDetails?: (() => void) | undefined;
  /** A question answered on the card itself: its form in place of Answer. */
  readonly answer?:
    | {
        readonly question: Question;
        readonly onAnswer: (answers: readonly Chosen[]) => void;
      }
    | undefined;
}

function Head({ item, snapshot }: { readonly item: NeedsYouItem; readonly snapshot: Snapshot }) {
  const palette = usePalette();
  const trail = laneTrail(item, snapshot.directory);
  const name = snapshot.directory[item.harnessId]?.displayName ?? item.harnessId;
  // An approval's question is its headline, so who asked steps back to a line above it.
  const quiet = item.kind === "approval";
  return (
    <View style={styles.head}>
      <Avatar name={name} size="md" {...faceProps(snapshot.directory, item.harnessId)} />
      <View style={styles.headWords}>
        <Text
          style={
            quiet ? [styles.by, { color: palette.ink3 }] : [styles.who, { color: palette.ink }]
          }
        >
          {askHeading(item, snapshot.directory)}
        </Text>
        {trail === undefined ? null : (
          <Text style={[styles.trail, { color: palette.ink3 }]}>{trail}</Text>
        )}
      </View>
      {item.outside === true ? <Pill tone="neutral">{OUTSIDE}</Pill> : null}
    </View>
  );
}

/** What lapsing means here, which is not the same sentence for both fallbacks. */
function Lapse({
  left,
  fallback,
}: {
  readonly left: string;
  readonly fallback: "deny" | "allow" | undefined;
}) {
  const palette = usePalette();
  return (
    <Text style={[styles.when, { color: left === "expired" ? palette.red : palette.ink3 }]}>
      {lapseWords(left, fallback)}
    </Text>
  );
}

function Body({
  item,
  approval,
  now,
}: {
  readonly item: NeedsYouItem;
  readonly approval: Approval | undefined;
  readonly now: number;
}) {
  const palette = usePalette();
  const left = timeLeft(item.expiresAt, now);
  if (approval !== undefined) {
    const plate = commandPlate(approval);
    return (
      <>
        <Headline
          approval={approval}
          style={styles.ask}
          numberOfLines={4}
          plated={plate !== undefined}
        />
        <Effect approval={approval} />
        <AskShown approval={approval} plate={plate} compact />
        {saysLasts(approval, plate) ? <Lasts approval={approval} /> : null}
        <Risk classes={approval.risk} />
        {left === undefined ? null : <Lapse left={left} fallback={approval.fallback} />}
      </>
    );
  }
  return (
    <>
      {/* Three lines, because a summary's title is the whole message a harness wrote and some
          of them are five paragraphs. The rest of it is a tap away, in the space it was said
          in; a card that runs off the screen hides the two cards under it. */}
      <Text numberOfLines={3} style={[styles.what, { color: palette.ink }]}>
        {plainWords(item.title)}
      </Text>
      {left === undefined ? null : <Lapse left={left} fallback={undefined} />}
    </>
  );
}

/** The panel revealed behind a card as it is dragged. Words, not an icon alone. */
function SwipeFace({
  label,
  tone,
  ink,
  side,
}: {
  readonly label: string;
  readonly tone: string;
  readonly ink: string;
  readonly side: "left" | "right";
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.face,
        { backgroundColor: tone, alignItems: side === "left" ? "flex-start" : "flex-end" },
      ]}
    >
      <Text style={[styles.faceWord, { color: ink }]}>{label}</Text>
    </View>
  );
}

/** The card's words: who wants what, and what it would do. */
function Words({
  item,
  snapshot,
  approval,
  now,
}: {
  readonly item: NeedsYouItem;
  readonly snapshot: Snapshot;
  readonly approval: Approval | undefined;
  readonly now: number;
}) {
  return (
    <>
      <Head item={item} snapshot={snapshot} />
      <Body item={item} approval={approval} now={now} />
    </>
  );
}

/** Deny and Approve for an approval; Answer for a question; Details beside them; nothing else. */
function Buttons(props: NeedsCardProps & { readonly approval: Approval | undefined }) {
  const { item, approval, busy } = props;
  const answerable = approval !== undefined && props.onDecide !== undefined;
  const decide = (decision: Decision) => {
    if (approval === undefined) return;
    felt(decision);
    props.onDecide?.(approval, decision);
  };
  const details =
    props.onDetails === undefined || item.outside === true ? null : (
      <Button label={item.kind === "question" ? "Answer" : "Details"} onPress={props.onDetails} />
    );
  if (approval === undefined && item.kind !== "question") return null;
  return (
    <View style={[styles.buttons, approval === undefined ? styles.oneButton : null]}>
      {approval === undefined ? null : (
        <>
          <Button
            label="Deny"
            variant="danger"
            grow
            busy={busy}
            disabled={!answerable}
            onPress={() => decide("denied")}
          />
          <Button
            label="Approve"
            variant="primary"
            grow
            busy={busy}
            disabled={!answerable}
            onPress={() => decide("approved")}
            testID="approval-approve"
          />
        </>
      )}
      {details}
    </View>
  );
}

/**
 * What the card holds: a question's own form when the room answers it here, or the words, the
 * buttons and — when the server turned the last answer away — why.
 */
function Face(props: NeedsCardProps & { readonly approval: Approval | undefined }) {
  const { item, snapshot, busy, answer, approval } = props;
  const palette = usePalette();
  const reason = snapshot.refused?.get(item.id);
  const refused = reason === undefined ? undefined : refusalWords(reason, snapshot.directory);
  if (answer !== undefined) {
    return (
      <>
        <Head item={item} snapshot={snapshot} />
        <Ask
          question={answer.question}
          harnessName={nameOf(snapshot.directory, item.harnessId)}
          busy={busy}
          now={props.now}
          onAnswer={answer.onAnswer}
          framed={false}
          refused={refused}
        />
      </>
    );
  }
  return (
    <>
      <Words item={item} snapshot={snapshot} approval={approval} now={props.now} />
      <Buttons {...props} approval={approval} />
      {refused === undefined || busy ? null : (
        <Text style={[styles.refused, { color: palette.red }]} testID={`refused-${item.id}`}>
          {refused}
        </Text>
      )}
    </>
  );
}

function NeedsCardInner(props: NeedsCardProps) {
  const { item, snapshot, busy } = props;
  const palette = usePalette();
  const approval = approvalFor(item, snapshot);
  const answerable = approval !== undefined && props.onDecide !== undefined;
  const decide = (decision: Decision) => {
    if (approval === undefined) return;
    felt(decision);
    props.onDecide?.(approval, decision);
  };

  const card = (
    <Card tone={item.tier === "decide" ? "ask" : "default"} testID={`ask-${item.id}`}>
      <Face {...props} approval={approval} />
    </Card>
  );

  if (!answerable || busy) return card;
  return (
    <ReanimatedSwipeable
      testID={`swipe-${item.id}`}
      friction={2}
      leftThreshold={THRESHOLD}
      rightThreshold={THRESHOLD}
      overshootLeft={false}
      overshootRight={false}
      // Both faces are drawn from the moment the card is, whichever way it is going, and both
      // are handed the same value: the card's own offset, negative going the other way. So the
      // click is watched for once, here, and covers a swipe in either direction — one in each
      // face would be two clicks on one crossing.
      renderLeftActions={(_progress, translation) => (
        <>
          <Crossing translation={translation} at={THRESHOLD} />
          <SwipeFace label="Approve" tone={palette.greenSoft} ink={palette.greenInk} side="left" />
        </>
      )}
      renderRightActions={() => (
        <SwipeFace label="Deny" tone={palette.redSoft} ink={palette.redInk} side="right" />
      )}
      // Handed the way the card moved, not the face it uncovered (`swipe.ts`).
      onSwipeableOpen={(moved) => decide(swipeDecision(moved))}
    >
      {card}
    </ReanimatedSwipeable>
  );
}

export const NeedsCard = memo(NeedsCardInner);

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  headWords: { flex: 1, gap: 2 },
  who: { fontSize: TEXT.md, fontWeight: "700" },
  by: { fontSize: TEXT.sm, fontWeight: "600" },
  ask: { fontSize: TEXT.lg, lineHeight: 23, fontWeight: "700", letterSpacing: -0.2 },
  trail: { fontSize: TEXT.sm },
  what: { fontSize: TEXT.body, lineHeight: TEXT.body * 1.4 },
  when: { fontSize: TEXT.sm },
  buttons: { flexDirection: "row", gap: SPACE.sm, paddingTop: SPACE.xs },
  oneButton: { justifyContent: "flex-end" },
  refused: { fontSize: TEXT.sm },
  // Behind the card, so it wears the card's own corner: a straighter edge showing at the
  // rounding would read as a second card rather than as what is under this one.
  face: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: SPACE.xl,
    borderRadius: RADIUS.xxl,
  },
  faceWord: { fontSize: TEXT.md, fontWeight: "700" },
});
