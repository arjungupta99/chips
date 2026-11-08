/**
 * One thing waiting on a person, opened: the approval in full, the question's form, or — for the
 * things that are not decisions — the space it happened in. A card's Details in the room comes
 * here, and so does a push.
 *
 * A route of its own rather than a sheet over the room, so `chips://approval/<id>` and a push tap
 * both land somewhere real, and so the back gesture does what a back gesture should. It was For
 * you's detail screen until that was withdrawn (ADR 0065); the route kept its name.
 *
 * An ask that is not waiting on them, opened from a harness's Asks page or answered while its card
 * was open, is drawn whole and read-only (`Answered`, ADR 0255): the answer, when it came, and Open
 * in its space, which lands on its run.
 *
 * A question in a space this person is in is not answered here: the link lands in the room, on
 * the question's card, under what the harness said about it (15 September 2026). This screen's
 * form is for the question from a space they are not in, where the card is all there is.
 */

import type { Approval, FoundAsk, NeedsYouItem, Snapshot, Store } from "@chipschat/core";
import { findAsk, mayTurnDial, roomName, runIsLane } from "@chipschat/core";
import { Redirect, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { deviceWord } from "../../src/device/word";
import { Answered } from "../../src/needs/Answered";
import { Ask } from "../../src/needs/Ask";
import { AskWho, LapseRing } from "../../src/needs/AskBar";
import { Decide, type DecisionInput } from "../../src/needs/Decide";
import { candidates } from "../../src/needs/HandOn";
import { answersInTheRoom, targetOf } from "../../src/spaces/spaces";
import { useInTouch } from "../../src/spaces/Thinking";
import { useChips, useSnapshot } from "../../src/store/provider";
import { Button } from "../../src/ui/Button";
import { Empty, Screen, useColumn } from "../../src/ui/Screen";
import { usePalette } from "../../src/ui/theme";
import { SPACE, TEXT } from "../../src/ui/tokens";
import { useNow } from "../../src/ui/useNow";
import { approvalFor, askTitle, OUTSIDE, questionFor, refusalWords } from "../../src/words";

/** An ask's name in the bar when it is read rather than answered. */
const ASK_TITLE = "Ask";

/**
 * How long a yes stays on the screen once given, as Approve turns to a tick and says how far it
 * reaches, before the screen goes back (ADR 0280).
 */
const SETTLE_MS = 750;

/** An ask just approved, held as it was while the tick shows: the log has it answered already. */
interface Leaving {
  readonly item: NeedsYouItem;
  readonly approval: Approval;
}

/** Back, now or after the tick; never after the screen has gone some other way. */
function useBack(): (after: number) => void {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (after) => {
    if (after === 0) router.back();
    else timer.current = setTimeout(() => router.back(), after);
  };
}

export default function NeedsDetailScreen() {
  const { paired } = useChips();
  const { id } = useLocalSearchParams<{ id: string }>();
  if (paired === undefined) return null;
  return <Detail store={paired.store} selfId={paired.device.participantId} id={id} />;
}

function Detail({
  store,
  selfId,
  id,
}: {
  readonly store: Store;
  readonly selfId: string;
  readonly id: string;
}) {
  const snapshot = useSnapshot(store);
  const router = useRouter();
  const back = useBack();
  const now = useNow(true);
  const column = useColumn();
  const [leaving, setLeaving] = useState<Leaving | undefined>(undefined);
  const item = leaving?.item ?? snapshot.model.needsYou.find((each) => each.id === id);
  // A push opens this as the app comes back, before the catch-up has brought the ask: missing
  // then is not yet, and the page stays empty until the store has caught up (Arjun's iPhone,
  // 23 October 2026: "Not here", then the ask).
  const inTouch = useInTouch(snapshot.connection, false);

  if (item === undefined) {
    return <Missing id={id} snapshot={snapshot} selfId={selfId} now={now} inTouch={inTouch} />;
  }

  if (answersInTheRoom(item)) {
    return <Redirect href={`/spaces/${item.spaceId}?at=${encodeURIComponent(targetOf(item))}`} />;
  }

  const approval = leaving?.approval ?? approvalFor(item, snapshot);
  const question = questionFor(item, snapshot);
  const harnessName = snapshot.directory[item.harnessId]?.displayName ?? item.harnessId;
  const reason = snapshot.refused?.get(item.id);
  const elsewhere = <Elsewhere item={item} onOpen={() => router.push(`/spaces/${item.spaceId}`)} />;

  if (approval !== undefined) {
    return (
      <Deciding
        store={store}
        snapshot={snapshot}
        selfId={selfId}
        item={item}
        approval={approval}
        now={now}
        leaving={leaving !== undefined}
        onDecided={(input) => {
          // A yes stays a moment as its tick; a no, or an edit typed in the tray, goes at once.
          if (input.decision === "approved") {
            setLeaving({ item, approval });
            back(SETTLE_MS);
          } else back(0);
        }}
        under={elsewhere}
      />
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: askTitle(item, snapshot.directory) }} />
      {/* A reason, an answer or a steer is typed at the foot of the card, where the keys come up. */}
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.body, column]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={SPACE.lg}
      >
        {question !== undefined ? (
          <Ask
            question={question}
            harnessName={harnessName}
            busy={snapshot.busy.has(item.id)}
            now={now}
            refused={reason === undefined ? undefined : refusalWords(reason, snapshot.directory)}
            onAnswer={(answers) => {
              store.answerQuestion({
                spaceId: item.spaceId,
                runId: question.runId,
                askId: question.askId,
                answers: answers.map((each) => ({ ...each })),
              });
              router.back();
            }}
          />
        ) : (
          <Plain item={item} />
        )}
        {elsewhere}
      </KeyboardAwareScrollView>
    </Screen>
  );
}

/** The decision as the store sends it, from what the screen decided. */
function resolution(item: NeedsYouItem, approval: Approval, runId: string, input: DecisionInput) {
  return {
    spaceId: item.spaceId,
    runId,
    approvalId: approval.approvalId,
    decision: input.decision,
    scope: input.scope,
    ...(input.everywhere === true ? { everywhere: true } : {}),
    ...(input.forMinutes === undefined ? {} : { forMinutes: input.forMinutes }),
    ...(input.untilStopped === true ? { untilStopped: true } : {}),
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(input.updatedInput === undefined ? {} : { updatedInput: input.updatedInput }),
  };
}

/**
 * An approval waiting on this person (ADR 0280): the agent's face and the space in the bar, the
 * time left as a ring at its end, and the ask under it with its answer in the tray at the foot.
 */
function Deciding({
  store,
  snapshot,
  selfId,
  item,
  approval,
  now,
  leaving,
  onDecided,
  under,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly item: NeedsYouItem;
  readonly approval: Approval;
  readonly now: number;
  /** Approved, and on its way back: the tick is showing. */
  readonly leaving: boolean;
  readonly onDecided: (input: DecisionInput) => void;
  readonly under: ReactNode;
}) {
  const router = useRouter();
  const { directory, model } = snapshot;
  const spaceName = roomName(model, item.spaceId, directory);
  const open = approval.resolved === undefined && !leaving;
  return (
    <Screen>
      <Stack.Screen
        options={{
          title: askTitle(item, directory),
          headerTitle: () => (
            <AskWho
              directory={directory}
              id={item.harnessId}
              spaceName={item.outside === true ? undefined : spaceName}
            />
          ),
          headerRight: () => (open ? <LapseRing approval={approval} now={now} /> : null),
        }}
      />
      <Decide
        approval={approval}
        harnessName={directory[item.harnessId]?.displayName ?? item.harnessId}
        harnessId={item.harnessId}
        directory={directory}
        selfId={selfId}
        busy={!leaving && snapshot.busy.has(item.id)}
        now={now}
        onDecide={(input) => {
          if (item.runId === undefined) return;
          store.resolveApproval(resolution(item, approval, item.runId, input));
          onDecided(input);
        }}
        onHand={(to, reason) => {
          if (item.runId === undefined) return;
          store.routeApproval({
            spaceId: item.spaceId,
            runId: item.runId,
            approvalId: approval.approvalId,
            to: [to],
            ...(reason === undefined ? {} : { reason }),
          });
          router.back();
        }}
        handTo={candidates({
          directory,
          space: model.spaces.find((space) => space.id === item.spaceId),
          people: model.people,
          selfId,
          lane: runIsLane(model, approval.runId),
        })}
        people={model.people}
        mayEverywhere={mayTurnDial(model, selfId)}
        keepsHeldYes={snapshot.keepsHeldYes}
        spaceName={spaceName}
        timeInBar
        under={under}
      />
    </Screen>
  );
}

/**
 * An id that waits on nobody here: an ask answered or not this reader's, read whole; else nothing
 * until the store has caught up, then Not here.
 */
function Missing({
  id,
  snapshot,
  selfId,
  now,
  inTouch,
}: {
  readonly id: string;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly now: number;
  readonly inTouch: boolean;
}) {
  const found = findAsk(snapshot.model, id);
  if (found !== undefined)
    return <Read found={found} snapshot={snapshot} selfId={selfId} now={now} />;
  if (!inTouch) return <Screen>{null}</Screen>;
  return (
    <Screen>
      <Stack.Screen options={{ title: "Not here" }} />
      <Empty>
        This is not waiting on you any more. Somebody answered it, or it lapsed while the{" "}
        {deviceWord()} was away.
      </Empty>
    </Screen>
  );
}

/** An ask not waiting on this reader, read whole, with its space a tap away (ADR 0255). */
function Read({
  found,
  snapshot,
  selfId,
  now,
}: {
  readonly found: FoundAsk;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly now: number;
}) {
  const router = useRouter();
  const column = useColumn();
  const at = encodeURIComponent(`run:${found.run.runId}`);
  return (
    <Screen>
      <Stack.Screen options={{ title: ASK_TITLE }} />
      <ScrollView contentContainerStyle={[styles.body, column]}>
        <Answered
          found={found}
          model={snapshot.model}
          directory={snapshot.directory}
          selfId={selfId}
          now={now}
          onOpenSpace={() => router.push(`/spaces/${found.spaceId}?at=${at}`)}
        />
      </ScrollView>
    </Screen>
  );
}

/** A summary, a failure or a checkpoint: nothing to answer, only something to read. */
function Plain({ item }: { readonly item: NeedsYouItem }) {
  const palette = usePalette();
  return <Text style={[styles.plain, { color: palette.ink }]}>{item.title}</Text>;
}

/**
 * The way through to the space — unless there is no space to go to. An ADR 0042 glimpse: they
 * were named on an ask raised in a space they are not in, and this card is all of it that
 * reached them, so the screen says so rather than offering a button that would fail.
 */
function Elsewhere({ item, onOpen }: { readonly item: NeedsYouItem; readonly onOpen: () => void }) {
  const palette = usePalette();
  if (item.outside === true) {
    return (
      <Text style={[styles.note, { color: palette.ink3 }]} testID="outside">
        {OUTSIDE}. All that reached you of it is this card.
      </Text>
    );
  }
  return (
    <View style={styles.open}>
      <Button label="Open the space" variant="plain" onPress={onOpen} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: SPACE.lg, gap: SPACE.lg, paddingBottom: SPACE.xxl },
  plain: { fontSize: TEXT.body, lineHeight: TEXT.body * 1.45 },
  note: { fontSize: TEXT.sm },
  open: { alignItems: "flex-start" },
});
