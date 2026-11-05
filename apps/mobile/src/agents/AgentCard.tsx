/**
 * An agent's card (ADR 0087, Phase 5): its face and harness, the room it is in (which opens), since
 * when, what it is doing, its message history, and what may be done with it. Grouped like You, as
 * the harness's page is beside it.
 *
 * Move is its harness's owner's, or an owner's or admin's (point 4). A free agent is put in a
 * room by the same people (ADR 0034's addendum), which is what adding a free agent to a room is
 * (rule 4), and its waiting words are said there. Never for the Main agent or an archived one: the
 * Main agent lives in its Main room, and archiving is its harness's.
 *
 * Fork (ADR 0087, Fork) is offered beside Move, by the same people, for an agent whose harness
 * makes copies: a copy joins the room picked, and it stays where it is. A copy's card says what
 * it was forked from, which opens the original's card.
 *
 * Tapping the face changes it (ADR 0089): the card is where things are done to an agent, and a
 * long press on its row in the list is easy never to find. Anybody's but a guest's. So does its
 * Icon row, under its facts (ADR 0174, Arjun's A: "a special section"), which says what the face
 * wears, since a face that changes when tapped says nothing about it.
 *
 * Tapping the name renames it (ADR 0091), where it stands (`NameInPlace`), as on its page in a
 * room's sheet and as your own name on You (Arjun, 8 October 2026: "rename agents in place on the
 * Agents tab too"); the same people as the face. The name is everybody's, and its harness can no
 * longer change it. What the name is for wraps under the field in the column beside the face, so
 * the rest of the card moves down to make room for it on `GROWS`, on the UI thread, rather than
 * jumping there in one frame (as `LayoutAnimation` did, on the simulator, 8 October 2026).
 *
 * Its foot archives or unarchives it and deletes it (ADR 0095), as pushing its row left does, for
 * the same people as Move (Arjun, 2 October 2026: "I want the options on the card as well").
 * Archive sits with Move and Fork; Delete stands alone under them, in red. Once it is deleted the
 * card has nothing to show, and steps back (`onDeleted`).
 *
 * Straight under its facts, in a card of its own, Lock changes (ADR 0199, Arjun's B): the room
 * sheet's row (`ui/LockRow`), for whoever may archive or delete it. While it is on, nobody renames,
 * archives or deletes it: a small padlock stands where the name's pen was, the foot loses Archive
 * and Delete and says why, and an archived one keeps Unarchive, which only puts it back. Opened
 * from its Locked on the Agents tab (`lockGlow`), the row glows once, so the eye finds it.
 *
 * Beside the Agents list on an iPad the card reads as it does on a phone, one group after another,
 * across the whole pane (ADR 0276): what the agent is (its facts, Lock changes, its icon and model),
 * then what it holds (its heartbeat, context window, files, history and what may be done with it).
 * Until 3 November 2026 the two halves stood side by side (ADR 0256).
 *
 * Between its facts and its history, for its harness's owner, the files its harness builds it
 * from (ADR 0135, `context/ContextGroup.tsx`), when what shows the card says where they open.
 * Above them, for the same people, its model and effort (ADR 0141, `model/ModelGroup.tsx`), and
 * under those its context window (ADR 0146, `window/WindowGroup.tsx`). Each of the four stands
 * blank in its place until its copy comes, and one its harness doesn't share keeps its heading
 * with a line that says so (ADR 0238, `Waiting.tsx`).
 */

import {
  type AgentCard as AgentCardFacts,
  type AgentStay,
  agentCard,
  belongsTo,
  type Snapshot,
  type Store,
  stayFact,
} from "@chipschat/core";
import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ContextGroup, type ContextOpeners } from "../context/ContextGroup";
import { faceWords } from "../spaces/faceWords";
import type { RowAct } from "../spaces/SwipeRow";
import { Avatar } from "../ui/Avatar";
import type { SheetFrom } from "../ui/beside";
import { Group, GroupFoot, GroupHeading, GroupRow } from "../ui/Group";
import { GROWS, GroupPlace, GrowingView } from "../ui/growing";
import * as feel from "../ui/haptics";
import { LockRow } from "../ui/LockRow";
import { NameInPlace } from "../ui/NameInPlace";
import { useColumn } from "../ui/Screen";
import { SPACE } from "../ui/tokens";
import { NotFound } from "./Arriving";
import { FaceSheet } from "./FaceSheet";
import { HeartbeatGroup } from "./heartbeat/HeartbeatGroup";
import { useKeep } from "./Keep";
import { useModelGroup } from "./model/ModelGroup";
import { nameWords } from "./nameWords";
import { RoomPicker } from "./RoomPicker";
import { useStays } from "./stays";
import { useWindowGroup } from "./window/WindowGroup";

export function AgentCard({
  store,
  snapshot,
  agentId,
  selfId,
  onHistory,
  onOpenRoom,
  onOpenAgent,
  onDeleted,
  context,
  lockGlow = false,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly agentId: string;
  readonly selfId: string;
  /** Opened from its Locked on the Agents tab (ADR 0199): the lock's row glows once. */
  readonly lockGlow?: boolean;
  /**
   * Where its context files open, and how many times the card has come to the front (each time
   * they are read again). Absent: no Context group.
   */
  readonly context?: (ContextOpeners & { readonly focus: number }) | undefined;
  readonly onHistory: () => void;
  readonly onOpenRoom: (spaceId: string) => void;
  /** Opens another agent's card: the one a copy was forked from. */
  readonly onOpenAgent?: ((agentId: string) => void) | undefined;
  /** It was deleted from here (ADR 0095): what was showing it steps back. */
  readonly onDeleted?: (() => void) | undefined;
}) {
  const column = useColumn();
  const agent = snapshot.directory[agentId];
  const { stays, failed } = useStays(store, agentId, agent?.room);
  const [picking, setPicking] = useState<"put" | "move" | "fork" | undefined>(undefined);
  // The face sheet, open, and what opened it: the face, or the Icon row.
  const [facing, setFacing] = useState<{ readonly from: SheetFrom } | undefined>(undefined);
  const hero = useRef<View>(null);
  const keep = useKeep(store, snapshot, selfId, { onDeleted: () => onDeleted?.() });
  const model = useModelGroup({
    store,
    snapshot,
    agentId,
    selfId,
    focus: context?.focus ?? 0,
    sayMissing: true,
  });
  const card =
    agent?.kind === "agent"
      ? agentCard(snapshot.model, snapshot.directory, selfId, agentId)
      : undefined;
  const windowGroup = useWindowGroup({
    store,
    snapshot,
    agentId,
    selfId,
    focus: context?.focus ?? 0,
    working: card !== undefined && card.doing !== "idle",
  });
  if (card === undefined) return <NotFound snapshot={snapshot} what="agent" />;

  return (
    <>
      <ScrollView contentContainerStyle={[styles.body, column]} testID="agent-card">
        <View style={styles.hero}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${card.name}'s icon`}
            accessibilityHint="Changes its icon"
            disabled={!card.mayFace}
            onPress={() => setFacing({ from: hero })}
            ref={hero}
            hitSlop={SPACE.sm}
            testID="agent-face"
            style={({ pressed }) => (pressed ? styles.pressed : null)}
          >
            <Avatar
              name={card.name}
              kind="agent"
              size="row"
              icon={card.face}
              {...(card.doing === "idle" ? {} : { status: card.doing })}
              decorative
            />
          </Pressable>
          <NameInPlace
            name={card.name}
            start={card.ownName}
            may={card.mayName}
            locked={card.locked}
            under={card.sub}
            hint={(draft) => nameWords(draft, card.harnessName)}
            connected={snapshot.connection === "open"}
            onRename={(next) => store.renameAgent(agentId, next)}
            label={`${card.ownName}'s name`}
            pressHint="Renames it"
            placeholder="What it goes by"
            // Between a row's name and a screen's title: the card is about this one agent.
            size={26}
            align="start"
            lines={2}
            ids={{
              name: "agent-name",
              field: "agent-name-field",
              hint: "agent-name-hint",
              under: "agent-sub",
              locked: "agent-name-locked",
            }}
            style={styles.heroWords}
          />
        </View>
        {/* Everything under the head, which moves down on `GROWS` while the name is a field and
            what it is for wraps under it. */}
        <GrowingView layout={GROWS}>
          <Facts
            card={card}
            owner={belongsTo(snapshot.directory, agentId, selfId)}
            stays={stays}
            asking={stays === undefined && failed === undefined}
            onOpenRoom={onOpenRoom}
            onOpenAgent={onOpenAgent}
          />
          <LockGroup
            card={card}
            glow={lockGlow}
            onLock={(locked) => store.setAgentLock(agentId, locked)}
          />
          <IconGroup
            name={card.name}
            face={card.face}
            may={card.mayFace}
            onPress={(from) => setFacing({ from })}
          />
          {/* Each group in a place of its own, which takes a copy's size on `GROWS` as it
                lands over its blank, and what is under them moves down with it (ADR 0238's
                addendum). */}
          <GroupPlace>{model.group}</GroupPlace>
          {/* The heartbeat ends the left rather than starting the right: the order a phone
                stacks them in is the same, and the right's context window no longer stands
                twice the left's height (the simulator, 2 November 2026). */}
          <GroupPlace>
            <HeartbeatGroup
              store={store}
              snapshot={snapshot}
              agentId={agentId}
              agentName={card.name}
              selfId={selfId}
              focus={context?.focus ?? 0}
            />
          </GroupPlace>
          <GroupPlace>{windowGroup.group}</GroupPlace>
          <GroupPlace>
            {context === undefined ? null : (
              <ContextGroup
                store={store}
                snapshot={snapshot}
                agentId={agentId}
                agentName={card.name}
                selfId={selfId}
                {...context}
              />
            )}
          </GroupPlace>
          <GrowingView layout={GROWS}>
            <GroupHeading>History</GroupHeading>
            <Group>
              <GroupRow
                label="Message history"
                value={roomsWords(stays)}
                onPress={onHistory}
                testID="agent-history"
              />
            </Group>
            <Acts card={card} onPick={setPicking} onKeep={(act) => keep.act(act, agentId)} />
            {card.note === undefined ? null : <GroupFoot>{card.note}</GroupFoot>}
          </GrowingView>
        </GrowingView>
      </ScrollView>
      {/* The sheets stand beside the card, not in it: touches travel the component tree, and a
          scroll view spends the first tap while the keys are up on putting them away, so Save in
          the sheet that named it took two (Arjun, 2 October 2026). */}
      <RoomPicker
        store={store}
        snapshot={snapshot}
        selfId={selfId}
        agentId={agentId}
        mode={picking ?? "move"}
        open={picking !== undefined}
        onClose={() => setPicking(undefined)}
        onOpenRoom={onOpenRoom}
      />
      <FaceSheet
        store={store}
        snapshot={snapshot}
        agentId={facing === undefined ? undefined : agentId}
        from={facing?.from}
        onClose={() => setFacing(undefined)}
      />
      {keep.sheet}
      {model.overlays}
      {windowGroup.overlays}
    </>
  );
}

/**
 * Lock changes (ADR 0199), in a card of its own under the facts, for whoever may archive or delete
 * it; never on a Main agent, which nobody archives or deletes. A flip shows at once and holds until
 * the directory says the server has it; one turned away goes back, with a warning's buzz, and the
 * foot's note is the server's next word on it.
 */
function LockGroup({
  card,
  glow,
  onLock,
}: {
  readonly card: AgentCardFacts;
  readonly glow: boolean;
  readonly onLock: (locked: boolean) => Promise<void>;
}) {
  if (!card.mayLock) return null;
  const locking = (locked: boolean) =>
    onLock(locked).then(
      () => {
        feel.success();
        return true;
      },
      () => {
        feel.warning();
        return false;
      },
    );
  return (
    <View style={styles.lock}>
      <Group>
        <LockRow
          locked={card.locked}
          onLock={locking}
          hint="Stops the agent being renamed, archived or deleted"
          ids={{ row: "agent-lock", switch: "agent-lock-switch" }}
          glow={glow}
          style={styles.lockRow}
        />
      </Group>
    </View>
  );
}

/**
 * Its Icon section (ADR 0174): the face at a row's mark size and what it wears, opening the sheet
 * a tap on the face opens. Only for whoever may change it: to a guest it would be a row that does
 * nothing.
 */
function IconGroup({
  name,
  face,
  may,
  onPress,
}: {
  readonly name: string;
  readonly face: AgentCardFacts["face"];
  readonly may: boolean;
  readonly onPress: (from: SheetFrom) => void;
}) {
  const self = useRef<View>(null);
  if (!may) return null;
  return (
    <>
      <GroupHeading>Icon</GroupHeading>
      <Group>
        <GroupRow
          label="Icon"
          value={faceWords(face)}
          mark={<Avatar name={name} kind="agent" size="sm" icon={face} decorative />}
          onPress={() => onPress(self)}
          ref={self}
          accessibilityHint="Changes its icon"
          testID="agent-icon"
        />
      </Group>
    </>
  );
}

/** How many rooms its history holds, once the server has said. */
function roomsWords(stays: readonly AgentStay[] | undefined): string | undefined {
  if (stays === undefined) return undefined;
  const rooms = new Set(stays.map((stay) => stay.spaceId ?? stay.from)).size;
  return `${rooms} ${rooms === 1 ? "space" : "spaces"}`;
}

/** For a fork's copy: the agent it was forked from, whose card it opens. */
function ForkedFromRow({
  from,
  onOpenAgent,
}: {
  readonly from: NonNullable<AgentCardFacts["forkedFrom"]>;
  readonly onOpenAgent?: ((agentId: string) => void) | undefined;
}) {
  return (
    <GroupRow
      label="Forked from"
      value={from.name}
      {...(onOpenAgent === undefined ? {} : { onPress: () => onOpenAgent(from.agentId) })}
      testID="agent-forked-from"
    />
  );
}

/** Where it is, since when, what it is doing, and what waits, with who said it and where it goes. */
function Facts({
  card,
  owner,
  stays,
  asking,
  onOpenRoom,
  onOpenAgent,
}: {
  readonly card: AgentCardFacts;
  /** Whose it is, when not the reader's (`belongsTo`, ADR 0196). */
  readonly owner: string | undefined;
  readonly stays: readonly AgentStay[] | undefined;
  /** Whether the server is still being asked for its stays. */
  readonly asking: boolean;
  readonly onOpenRoom: (spaceId: string) => void;
  readonly onOpenAgent?: ((agentId: string) => void) | undefined;
}) {
  const from = card.forkedFrom;
  const room = card.room;
  // There from the card's first frame, with only its date waiting on the server (`stayFact`).
  const stay = stayFact(card, stays, asking);
  return (
    <>
      <Group>
        <GroupRow
          label="Space"
          value={room === undefined ? "None" : room.name}
          {...(room?.readable === true ? { onPress: () => onOpenRoom(room.spaceId) } : {})}
          testID="agent-room"
        />
        {stay === undefined ? null : (
          <GroupRow label={stay.word} value={stay.dates} testID="agent-stay" />
        )}
        {from === undefined ? null : <ForkedFromRow from={from} onOpenAgent={onOpenAgent} />}
        <GroupRow label="Now" value={card.now} testID="agent-now" />
        {owner === undefined ? null : (
          <GroupRow label="Belongs to" value={owner} testID="agent-belongs" />
        )}
        {card.held === 0 ? null : (
          <GroupRow
            label="Waiting"
            value={`${card.held} ${card.held === 1 ? "message" : "messages"}`}
            testID="agent-waiting"
          />
        )}
      </Group>
      {card.heldNote === undefined ? null : (
        <GroupFoot testID="agent-waiting-note">{card.heldNote}</GroupFoot>
      )}
    </>
  );
}

/**
 * Whether the card's foot offers Archive or Unarchive, and which: Archive while its changes are not
 * locked, Unarchive for an archived one, locked or not, since that only puts it back (ADR 0199).
 */
function keepAct(card: AgentCardFacts): "archive" | "unarchive" | undefined {
  if (card.archived) return card.mayUnarchive ? "unarchive" : undefined;
  return card.mayKeep ? "archive" : undefined;
}

/**
 * Put a free agent in a room, or move one in a room to another, or fork it into one; nothing for J
 * or an archived one. Then archive or unarchive it, and, apart and in red, delete it (ADR 0095);
 * neither Archive nor Delete while its changes are locked (ADR 0199).
 */
function Acts({
  card,
  onPick,
  onKeep,
}: {
  readonly card: AgentCardFacts;
  readonly onPick: (mode: "put" | "move" | "fork") => void;
  readonly onKeep: (act: RowAct) => void;
}) {
  const free = card.now === "Not in a space";
  const moves = card.mayMove;
  const keep = keepAct(card);
  // Whoever may delete it may archive or unarchive it too, so nothing to keep is nothing to delete.
  if (!moves && keep === undefined) return null;
  return (
    <View style={styles.acts}>
      <Group>
        {moves ? <MoveRows card={card} free={free} onPick={onPick} /> : null}
        {keep === undefined ? null : (
          <GroupRow
            label={keep === "unarchive" ? "Unarchive" : "Archive"}
            tone="accent"
            onPress={() => onKeep(keep)}
            testID="agent-archive"
          />
        )}
      </Group>
      {card.mayKeep ? (
        <View style={styles.apart}>
          <Group>
            <GroupRow
              label="Delete"
              tone="danger"
              onPress={() => onKeep("delete")}
              testID="agent-delete"
            />
          </Group>
        </View>
      ) : null}
    </View>
  );
}

/** Put it in a room, or move it to another; and fork it, where its harness makes copies. */
function MoveRows({
  card,
  free,
  onPick,
}: {
  readonly card: AgentCardFacts;
  readonly free: boolean;
  readonly onPick: (mode: "put" | "move" | "fork") => void;
}) {
  return (
    <>
      {free ? (
        <GroupRow
          label="Put in a space…"
          tone="accent"
          onPress={() => onPick("put")}
          testID="agent-put"
        />
      ) : (
        <GroupRow
          label="Move to another space…"
          tone="accent"
          onPress={() => onPick("move")}
          testID="agent-move"
        />
      )}
      {card.mayFork ? (
        <GroupRow
          label="Fork into a space…"
          tone="accent"
          onPress={() => onPick("fork")}
          testID="agent-fork"
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: SPACE.xxl * 2 },
  // The face at the top of its words, not their middle: a name and its line under it are the
  // face's height, and while the name is a field the words under it grow without moving it.
  hero: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACE.lg,
    paddingHorizontal: SPACE.xl,
    paddingTop: SPACE.lg,
    paddingBottom: SPACE.lg,
  },
  heroWords: { flex: 1 },
  pressed: { opacity: 0.7 },
  acts: { paddingTop: SPACE.xxl },
  apart: { paddingTop: SPACE.xl },
  // A card of its own under the facts, a group's gap below them (ADR 0199).
  lock: { paddingTop: SPACE.xl },
  // In from the card's edge as the rows of the groups round it are.
  lockRow: { paddingHorizontal: SPACE.lg },
});
