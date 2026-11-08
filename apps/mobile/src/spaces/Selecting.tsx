/**
 * Picking rows to archive or delete them together: spaces on the Spaces list (ADR 0181; Arjun, 16
 * October 2026: "I want a batch select option. It should allow batch delete, archive. It should
 * also respect locked state", and from the mock, "Go with your recommendations"), and agents on the
 * Agents tab (ADR 0182: "we need the select option in the Agent tab as well, for the agents (not
 * harnesses)"). What follows says it of spaces; agents are picked the same way, by the same pieces.
 *
 * Select, beside the list's name, starts it and becomes Done. While it lasts each row is a
 * checkbox: a press picks it, the swipe is still, and the tab bar and the gold + step aside for a
 * bar of two acts, Archive and Delete, each saying how many of the picked rooms it would take.
 * A locked room can't be picked, and neither can the Main room or one this person may do nothing
 * to: pressed, the row shakes and a note says why. Who may do what is core's (`mayPick`,
 * `batchOf`), the swipe's own rules, so a batch never does what a swipe could not.
 *
 * Archive asks once for all of them, as a swipe asks for one; Delete asks, waits for the server
 * room by room, and says which picked rooms it leaves, which this person may only archive. One room
 * is asked about as its swipe asks. Unarchive, for picked rooms that are all archived, happens at
 * once, as it does from a swipe.
 *
 * On the Spaces list the bar has a third act at its start, Read (ADR 0181 addendum, 18 October 2026;
 * Arjun: "I also need an option to mark all spaces as read", and from the mock, A, kept in place).
 * With nothing picked it is Read all, which reads every room, locked, Main and archived ones too;
 * with rows picked it is Read and how many of them have anything unread. It happens at once and
 * picking ends, as Unarchive does: it moves nothing but the counts.
 *
 * What moves is next door (`SelectMotion.tsx`), mocked under Jest.
 */

import { type Asking, actAll, type ConnectionState } from "@chipschat/core";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SheetFrom } from "../ui/beside";
import { BEFORE_A_WORD, type MarkedBy, useMarking } from "../ui/Connection";
import { Capsule, EdgeBand, GLASS } from "../ui/Glass";
import * as feel from "../ui/haptics";
import { Icon } from "../ui/Icon";
import type { IconName } from "../ui/icons";
import { MarkBeside } from "../ui/MarkBeside";
import { Swap } from "../ui/Swap";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { useWindowInsets } from "../ui/windowInsets";
import { ConfirmSheet, type Who } from "./ConfirmSheet";
import { listed } from "./picking";
import { ActDisc, Rise, RiseBehind, RiseRoom } from "./SelectMotion";
import { actTone } from "./SwipeRow";

/**
 * Where the bar's middle stands above the foot of the safe area: where the tab bar's stands, as
 * measured for the + in `app/(tabs)/_layout.tsx` (`SLOT_LIFT`). The window's safe area, as the +
 * takes it, not the tab's: a tab's foot is its tab bar's top, and it moved down 49 points a
 * quarter of a second into the tab bar stepping aside, and back up as it came back, taking the bar
 * with it as it rose and sank (the simulator, 16 October 2026).
 */
const BAR_LIFT = 18;
export const BAR_HEIGHT = 62;
/** The line under the name while picking, known before it is drawn (`Screen`'s `under`). */
export const HINT_HEIGHT = 30;
/** How long a note about a row that can't be picked stands over the bar. */
const NOTE_MS = 2800;
/** Select's reach past its word: the whole capsule, with a little to spare, or up to the mark. */
const HIT_ALONE = { top: 6, bottom: 6, right: 6, left: BEFORE_A_WORD.lead[0] + 6 };
const HIT_BESIDE = { top: 6, bottom: 6, right: 6, left: 0 };

/**
 * Select, and Done while picking: the list's own button, at the end of its name. As wide for one
 * word as for the other, so the capsule does not change size under the thumb, and the words
 * crossfade (`Swap`).
 *
 * The connection's mark, while it has something to say, stands inside the capsule before the
 * word, rather than as a second thing in the corner beside it (Arjun, 31 October 2026). Its room
 * opens as it fades in and closes once it has faded out (`MarkBeside`, `useMarking`), so the
 * capsule widens to the left and narrows back over a beat, and the word stays where it was.
 */
export function SelectButton({
  picking,
  onPress,
  mark = null,
  room,
  testID = "select-spaces",
}: {
  readonly picking: boolean;
  readonly onPress: () => void;
  /** The connection's mark, settled (`useMarking`'s `marking`), or null. */
  readonly mark?: ReactNode;
  /** Whether the mark's room is open: `useMarking`'s `room`, asked for with `beside`. */
  readonly room?: boolean | undefined;
  readonly testID?: string;
}) {
  const palette = usePalette();
  const word = picking ? "Done" : "Select";
  return (
    <Capsule interactive style={styles.cap}>
      <MarkBeside mark={mark} open={room ?? false} fit={BEFORE_A_WORD} style={styles.capRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={word}
          onPress={onPress}
          // The glass before the word is the word's to press too, while no mark stands there.
          hitSlop={mark === null ? HIT_ALONE : HIT_BESIDE}
          style={styles.capHit}
          testID={testID}
        >
          {/* The wider of the two words at the bolder weight, unseen: what the capsule is sized by. */}
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.capWord, styles.done, styles.sizer]}
          >
            Select
          </Text>
          <Swap swapKey={word} style={styles.capWordAt}>
            <Text style={[styles.capWord, { color: palette.ink }, picking ? styles.done : null]}>
              {word}
            </Text>
          </Swap>
        </Pressable>
      </MarkBeside>
    </Capsule>
  );
}

/**
 * A list's corner, the Spaces list's and the Agents tab's: Select, or Done while picking, with the
 * connection's mark inside its capsule while the mark has something to say (`SelectButton`); the
 * mark alone while there is nothing to pick; and no mark while the list's body says what the
 * connection is doing instead.
 */
export function ListCorner({
  select,
  state,
  telling,
  connection,
}: {
  /** Select's, while something could be picked. */
  readonly select:
    | { readonly picking: boolean; readonly onPress: () => void; readonly testID?: string }
    | undefined;
  readonly state: ConnectionState;
  /** The body says what the connection is doing, so the corner need not. */
  readonly telling: boolean;
  /** The connection's mark, settling by itself, or handed what `useMarking` has done for it. */
  readonly connection: (by?: MarkedBy) => ReactNode;
}) {
  const inSelect = select !== undefined && !telling;
  const { marking, room, markedBy } = useMarking(state, inSelect);
  return (
    <View style={styles.corner}>
      {telling || inSelect ? null : connection()}
      {select === undefined ? null : (
        <SelectButton
          {...select}
          mark={inSelect && marking ? connection(markedBy) : null}
          room={room}
        />
      )}
    </View>
  );
}

/** The line under the name while picking: what can't be picked, and Select all. */
export function PickHint({
  words,
  locked,
  all,
  onAll,
}: {
  readonly words: string | undefined;
  /** The words are about locked rows, and wear Locked's padlock. */
  readonly locked: boolean;
  /** Every row that can be picked is picked: the button lets them all go. */
  readonly all: boolean;
  readonly onAll: () => void;
}) {
  const palette = usePalette();
  return (
    <View style={styles.hint}>
      {words === undefined ? null : (
        <>
          {locked ? (
            <Icon name="lock" size={14} color={actTone("locked", palette)} weight={2} />
          ) : null}
          <Text style={[styles.hintWords, { color: palette.ink3 }]} numberOfLines={1}>
            {words}
          </Text>
        </>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={onAll}
        hitSlop={8}
        style={styles.all}
        testID="select-all"
      >
        <Text style={[styles.allWord, { color: palette.blue }]}>
          {all ? "Deselect all" : "Select all"}
        </Text>
      </Pressable>
    </View>
  );
}

/** An act on the bar, and how many of the picked rows it would take. */
export interface BarAct {
  readonly count: number;
  /** Pressed: what was pressed is handed on, for a sheet it asks in to open beside on an iPad. */
  readonly onPress: (from: SheetFrom) => void;
}

/** Read on the bar: with nothing picked it reads every room, and says so. */
export interface ReadAct extends BarAct {
  readonly all: boolean;
}

const ACT_WORD = {
  read: "Read",
  archive: "Archive",
  unarchive: "Unarchive",
  delete: "Delete",
} as const;
const ACT_MARK: Readonly<Record<keyof typeof ACT_WORD, IconName>> = {
  read: "read",
  archive: "archive",
  unarchive: "unarchive",
  delete: "trash",
};
/** The disc on a bar of two acts, and on a bar of three, where the words have less room too. */
const DISC = 38;
const DISC_THREE = 34;
/** Gold is the same in both themes, so the ink on it is too: the unread count's. */
const ON_GOLD = "#14161b";

/**
 * The bar of acts where the tab bar stood, while the list picks: Read, on the Spaces list; Archive,
 * or Unarchive when every picked row is archived; and Delete. Behind it, the band of blur the tab
 * bar stood on, solid to the bar's top and fading out over the rows above it, as the band behind
 * the name does below it. A note over the bar is drawn after it, over the band.
 */
export function PickBar({
  shown,
  read,
  left,
  erase,
}: {
  readonly shown: boolean;
  /** Read, at the bar's start: the Spaces list's, which the Agents tab has no use for. */
  readonly read?: ReadAct | undefined;
  readonly left: BarAct & { readonly act: "archive" | "unarchive" };
  readonly erase: BarAct;
}) {
  const palette = usePalette();
  const insets = useWindowInsets();
  const ramp = GLASS.rampTop;
  const band = insets.bottom + BAR_LIFT + BAR_HEIGHT / 2 + ramp;
  return (
    <>
      <RiseBehind shown={shown} height={band}>
        <EdgeBand edge="bottom" height={band} ramp={ramp} />
      </RiseBehind>
      <Rise
        shown={shown}
        style={[styles.bar, { bottom: insets.bottom + BAR_LIFT - BAR_HEIGHT / 2 }]}
      >
        <Capsule style={styles.barGlass} testID="pick-bar">
          {read === undefined ? null : (
            <>
              <ActButton
                act="read"
                count={read.count}
                all={read.all}
                onPress={read.onPress}
                three
              />
              <View style={[styles.divider, { backgroundColor: palette.line }]} />
            </>
          )}
          <ActButton
            act={left.act}
            count={left.count}
            onPress={left.onPress}
            three={read !== undefined}
          />
          <View style={[styles.divider, { backgroundColor: palette.line }]} />
          <ActButton
            act="delete"
            count={erase.count}
            onPress={erase.onPress}
            three={read !== undefined}
          />
        </Capsule>
      </Rise>
    </>
  );
}

/**
 * Room under the list's last row for the bar, while it stands there, where the tab bar's inset
 * was: the last row scrolls clear of it. `gap` is the list's own gap between its children.
 */
export function PickRoom({ shown, gap = 0 }: { readonly shown: boolean; readonly gap?: number }) {
  return <RiseRoom shown={shown} height={BAR_HEIGHT + SPACE.xxl} gap={gap} />;
}

/**
 * An act, its disc and its words: how many it would take, or for Read with nothing picked, "Read
 * all". Three to a bar, each has a third of it, and a long one's words shrink a little to fit:
 * "Unarchive 12" is wider than a third of a 402-point phone's bar at the full size.
 */
function ActButton({
  act,
  count,
  all = false,
  onPress,
  three = false,
}: {
  readonly act: keyof typeof ACT_WORD;
  readonly count: number;
  readonly all?: boolean;
  readonly onPress: (from: SheetFrom) => void;
  readonly three?: boolean;
}) {
  const palette = usePalette();
  const self = useRef<View>(null);
  const live = count > 0;
  const word = all ? `${ACT_WORD[act]} all` : live ? `${ACT_WORD[act]} ${count}` : ACT_WORD[act];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={word}
      accessibilityState={{ disabled: !live }}
      disabled={!live}
      onPress={() => onPress(self)}
      ref={self}
      style={({ pressed }) => [
        styles.act,
        three ? styles.actThree : null,
        { opacity: pressed ? 0.7 : 1 },
      ]}
      testID={`pick-${act}`}
    >
      <ActDisc
        name={ACT_MARK[act]}
        tone={act === "read" ? palette.gold : actTone(act, palette)}
        ink={act === "read" ? ON_GOLD : undefined}
        live={live}
        size={three ? DISC_THREE : DISC}
      />
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={[
          styles.actWord,
          three ? styles.actWordThree : null,
          { color: live ? palette.ink : palette.ink4 },
        ]}
      >
        {word}
      </Text>
    </Pressable>
  );
}

/** A note over the bar about a row that can't be picked: why not. */
export interface Note {
  /** New for each press, so the same row pressed twice says it again. */
  readonly key: number;
  readonly words: string;
  readonly locked: boolean;
}

/** The note, risen over the bar for a few seconds, and gone by itself. */
export function PickNote({
  note,
  onGone,
}: {
  readonly note: Note | undefined;
  readonly onGone: () => void;
}) {
  const palette = usePalette();
  const insets = useWindowInsets();
  // The words stay while it sinks.
  const [said, setSaid] = useState(note);
  useEffect(() => {
    if (note === undefined) return;
    setSaid(note);
    const done = setTimeout(onGone, NOTE_MS);
    return () => clearTimeout(done);
  }, [note, onGone]);
  return (
    <Rise
      shown={note !== undefined}
      style={[styles.noteAt, { bottom: insets.bottom + BAR_LIFT + BAR_HEIGHT / 2 + SPACE.md }]}
    >
      <Capsule style={styles.note}>
        {said?.locked === true ? (
          <View style={[styles.noteDisc, { backgroundColor: actTone("locked", palette) }]}>
            <Icon name="lock" size={15} color="#ffffff" weight={2} />
          </View>
        ) : null}
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.noteWords, { color: palette.ink }]}
          testID="pick-note"
        >
          {said?.words}
        </Text>
      </Capsule>
    </Rise>
  );
}

/** A face for a stack: the face itself, and the corner its ring follows. */
export interface StackFace {
  readonly key: string;
  readonly face: ReactNode;
  readonly corner: number;
}

/** Up to three faces, overlapping, and how many more: the rows a batch sheet asks about. */
export function FaceStack({ faces }: { readonly faces: readonly StackFace[] }) {
  const palette = usePalette();
  const shown = faces.length > 3 ? faces.slice(0, 2) : faces;
  return (
    <View style={styles.stack}>
      {shown.map((each, index) => (
        <View
          key={each.key}
          style={[
            styles.ring,
            {
              backgroundColor: palette.surface2,
              borderRadius: each.corner + RING,
              marginLeft: index === 0 ? 0 : -OVERLAP,
            },
          ]}
        >
          {each.face}
        </View>
      ))}
      {faces.length > 3 ? (
        <View
          style={[
            styles.ring,
            styles.more,
            { backgroundColor: palette.surface3, borderColor: palette.surface2 },
          ]}
        >
          <Text style={[styles.moreWord, { color: palette.ink2 }]}>{`+${faces.length - 2}`}</Text>
        </View>
      ) : null}
    </View>
  );
}

const RING = 2.5;
const OVERLAP = 14;

/**
 * Why the server would not delete a room, in words worth reading. A server that predates the
 * erase answers `No route matches that.`, and that is worth saying plainly.
 */
export function whyNotErased(error: unknown): string {
  const said = error instanceof Error ? error.message : "";
  if (/no route matches/i.test(said)) {
    return "this server is older than the app, and cannot delete a space yet.";
  }
  return said === "" ? "the server would not do it." : said;
}

/** What a batch asks about, as the list hands it over. */
export interface BatchAsk<T> {
  readonly kind: "archive" | "delete";
  /** The rows the act takes, as they were when asked, so the sheet can name them as they go. */
  readonly going: readonly T[];
  /** Picked rows a delete leaves, since this person may only archive them. */
  readonly staying: readonly T[];
  /** The act on the bar that asked: on an iPad the sheet opens beside it. */
  readonly from?: SheetFrom | undefined;
}

/** What an act on one row is told: whether the sheet's switch is on, and what the sheet said. */
export interface ActPlan<T> {
  readonly too: boolean;
  readonly asking: Asking;
  readonly going: readonly T[];
}

/**
 * The sheet that asks before a batch is archived or deleted. It holds what it asks about past the
 * close, as the swipe's does, and the server is asked about every row at once (`actAll`): rows it
 * would not take stay on the sheet, with why, to be asked again or left.
 */
export function BatchSheet<T extends { readonly id: string }>({
  ask,
  asking: askingOf,
  who: whoOf,
  nameOf,
  act,
  lane,
  why,
  onClose,
  onActing,
  onDone,
}: {
  readonly ask: BatchAsk<T> | undefined;
  /** What the sheet says about these rows. */
  readonly asking: (
    kind: BatchAsk<T>["kind"],
    going: readonly T[],
    staying: readonly T[],
  ) => Asking;
  /** What the sheet shows them as: one row's face and words, or a stack of faces. */
  readonly who: (going: readonly T[]) => Who;
  readonly nameOf: (item: T) => string;
  /** The act on one row, as the server is asked to do it. */
  readonly act: (kind: BatchAsk<T>["kind"], item: T, plan: ActPlan<T>) => Promise<void> | void;
  /** Rows that must go one at a time share a lane (`agentLane`); without it, each has its own. */
  readonly lane?: ((item: T) => string) | undefined;
  /** Why the server would not, in words worth reading, after "not archived" or "not deleted". */
  readonly why: (kind: BatchAsk<T>["kind"], error: unknown) => string;
  readonly onClose: () => void;
  /** It was confirmed: the rows are held while the server is asked. */
  readonly onActing: (kind: BatchAsk<T>["kind"], going: readonly T[]) => void;
  /** What the server did, and what it would not. */
  readonly onDone: (
    kind: BatchAsk<T>["kind"],
    done: readonly string[],
    refused: readonly string[],
  ) => void;
}) {
  const palette = usePalette();
  const [showing, setShowing] = useState<BatchAsk<T> | undefined>(ask);
  // What is still to do: all of it, until the server has refused some.
  const [left, setLeft] = useState<readonly T[]>(ask?.going ?? []);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  // Whether what the switch is about goes too (ADR 0087, rule 5; ADR 0095): on until turned off.
  const [too, setToo] = useState(true);
  // What the sheet said when the act was pressed, held while the server is asked: a room going takes
  // its agent with it, and the words worked out again mid-batch changed under the spinner (the
  // simulator, 16 October 2026).
  const [said, setSaid] = useState<{ readonly asking: Asking; readonly who: Who } | undefined>(
    undefined,
  );
  useEffect(() => {
    if (ask === undefined) return;
    setShowing(ask);
    setLeft(ask.going);
    setFailed(undefined);
    setToo(true);
    setSaid(undefined);
  }, [ask]);
  if (showing === undefined) return null;
  const { kind } = showing;
  const going = left;
  const asking = askingOf(kind, going, showing.staying);
  const confirm = async () => {
    setBusy(true);
    setSaid({ asking, who: whoOf(going) });
    setFailed(undefined);
    onActing(kind, going);
    const { done, refused } = await actAll(
      going,
      (item) => act(kind, item, { too, asking, going }),
      lane,
    );
    setBusy(false);
    setSaid(undefined);
    if (refused.length === 0) {
      if (kind === "archive") feel.success();
      else feel.warning();
    }
    onDone(
      kind,
      done,
      refused.map((each) => each.item.id),
    );
    if (refused.length === 0) return;
    setLeft(refused.map((each) => each.item));
    const verbed = kind === "archive" ? "archived" : "deleted";
    const names = listed(refused.map((each) => nameOf(each.item)));
    const were = refused.length === 1 ? "was" : "were";
    const first = done.length === 0 ? "" : `${done.length} ${verbed}. `;
    setFailed(`${first}${names} ${were} not ${verbed}: ${why(kind, refused[0]?.error)}`);
  };
  return (
    <ConfirmSheet
      open={ask !== undefined}
      onClose={onClose}
      onGone={() => setShowing(undefined)}
      from={showing?.from}
      room={said?.who ?? whoOf(going)}
      confirming={{
        asking: said?.asking ?? asking,
        tone: actTone(kind, palette),
        busy,
        failed,
      }}
      onConfirm={() => void confirm()}
      too={{ on: too, onChange: setToo }}
    />
  );
}

const styles = StyleSheet.create({
  corner: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  cap: { height: 36, minWidth: 76, borderRadius: RADIUS.pill },
  // The capsule's height, across it: the mark's room and the word's. The glass before the word is
  // `BEFORE_A_WORD`'s, and the word's own is after it.
  capRow: { flex: 1 },
  capHit: {
    flexGrow: 1,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    paddingRight: SPACE.lg,
  },
  capWord: { fontSize: TEXT.md, fontWeight: "600" },
  done: { fontWeight: "700" },
  sizer: { opacity: 0 },
  // Over the unseen word exactly: an absolute child spans its parent's padding as well, and the
  // word's padding is on its right alone.
  capWordAt: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: SPACE.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    height: HINT_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACE.lg,
  },
  hintWords: { flexShrink: 1, fontSize: TEXT.sm },
  all: { marginLeft: "auto", paddingLeft: SPACE.md },
  allWord: { fontSize: TEXT.md, fontWeight: "600" },
  bar: { position: "absolute", left: SPACE.lg + SPACE.xs, right: SPACE.lg + SPACE.xs },
  barGlass: {
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACE.xs,
  },
  act: {
    flex: 1,
    height: BAR_HEIGHT - 2 * SPACE.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.sm,
  },
  actThree: { gap: SPACE.sm - 1, paddingHorizontal: SPACE.xs },
  actWord: { flexShrink: 1, fontSize: TEXT.md, fontWeight: "600", fontVariant: ["tabular-nums"] },
  actWordThree: { fontSize: TEXT.md - 0.5 },
  divider: { width: StyleSheet.hairlineWidth, height: 30 },
  noteAt: { position: "absolute", left: SPACE.xl, right: SPACE.xl, alignItems: "center" },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    paddingVertical: SPACE.sm,
    paddingLeft: SPACE.sm,
    paddingRight: SPACE.md,
    borderRadius: RADIUS.xl,
  },
  noteDisc: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  noteWords: { flexShrink: 1, fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.35 },
  stack: { flexDirection: "row", alignItems: "center" },
  ring: { padding: RING },
  more: {
    width: 36 + 2 * RING,
    height: 36 + 2 * RING,
    borderRadius: 18 + RING,
    marginLeft: -OVERLAP,
    borderWidth: RING,
    padding: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  moreWord: { fontSize: TEXT.sm, fontWeight: "700" },
});
