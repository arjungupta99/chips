/**
 * One line in a space, in every kind a space draws.
 *
 * A person's message and a harness's are the same shape — the words, and what is under them —
 * because they are the same thing: a space is people and harnesses talking, and drawing a
 * harness as a special object would make the space a control panel. What differs is the avatar,
 * and that a harness's line can be reacted to and corrected — on a long press, in [the
 * menu](./LineMenu.tsx), rather than under every bubble in the room.
 *
 * The bubbles are a phone's (ADR 0050). Yours sample a viewport-anchored violet/blue/teal field;
 * replies with explicit lane provenance use that source's quiet identity tint. Unknown sources
 * use the neutral surface. A reply that closed its run remains a reply. The corner is
 * Messages' 18, and where one author's bubbles follow each other the sides that meet close up to
 * 5 (`place`, from `groupLines`), the time goes inside the last of them alone, and in a room
 * with a third participant the avatar stands beside the last alone; a room of two draws none —
 * the side already says whose line it is. The name goes inside the bubble's top left, and only
 * in a room of three (core's `namesAuthors`).
 *
 * Dynamic Type carries a bubble up to half again and no further (`BUBBLE.maxScale`, WP5). It is
 * asked for on every piece of one, because a `Text` inherits the cap only from another `Text`
 * and the name, the words, the tags and the time are four of them in three boxes. Uncapped, a
 * phone set to the largest accessibility size turns the time under a message into a second
 * paragraph and the row into a column. Everything outside a bubble scales without a ceiling:
 * there the words have the width of the screen and nothing to break.
 *
 * The margin lines — system, checkpoint, a run's status — are not bubbles at all. They are
 * things that happened, not things that were said. A run's receipt is not in the room either:
 * pressing and holding the line that closed the run, the reply or the status a failure left,
 * opens the sheet with *What the run did* in it.
 *
 * Over four hundred lines because a line is one thing in seven kinds, and the pieces of a bubble
 * — its corners, its face, its stamp, its tags, its menu — are read together; a file per piece
 * would be six files to open to understand one row.
 */

import type {
  Asking,
  Directory,
  Lane,
  Line as LineModel,
  ReplyCard as ReplyCardModel,
  Run,
  UnsentNote,
} from "@chipschat/core";
import {
  cantAnswer,
  DELETE_FOR_EVERYONE,
  DELETE_FOR_ME,
  heardWords,
  holdsTable,
  mayEdit,
  mayHide,
  mayReply,
  nameOf,
  notRightWords,
  readTaskBubble,
  refusalWords,
  takesFeedback,
} from "@chipschat/core";
import * as Clipboard from "expo-clipboard";
import { memo, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { type FaceProps, faceProps } from "../agents/face";
import { Avatar, faceGround } from "../ui/Avatar";
import * as feel from "../ui/haptics";
import { Icon } from "../ui/Icon";
import { shareText } from "../ui/share";
import { sourceColours } from "../ui/sourceColours";
import { usePalette, useScheme } from "../ui/theme";
import { BUBBLE, OUTGOING, type Palette, RADIUS, SPACE, TEXT } from "../ui/tokens";
import { Attachments } from "./Attachments";
import { BubbleWatch } from "./BubbleWatch";
import { type Asker, type Crumbling, Eraser, Veil } from "./Dust";
import type { Given } from "./Feedback";
import type { FileService } from "./files";
import {
  Arrow,
  FACES_UP_TO,
  type Faces,
  Faces as FacesOf,
  hopOf,
  LaneChain,
  stepOf,
} from "./LaneChain";
import { LiftedMenu, type LiftQuick, type LiftRow } from "./LiftedMenu";
import { LiftBox, type LiftBoxRef, useLiftBox } from "./LiftedMotion";
import { hasReceipt, type LineChange, type LinePage, LinePages, receiptLine } from "./LinePages";
import type { Box, Span } from "./lift";
import { HoldLine, Markdown } from "./Markdown";
import { RepliesMark, ReplyCard } from "./ReplyCard";
import { ReplyGrip } from "./ReplySwipe";
import { FadingUp, Leaving, MovingBubble, Whole } from "./RoomMotion";
import { type RouteDrawn, RouteSheet } from "./RouteSheet";
import { returning } from "./returning";
import { FrozenColour, OutgoingColour } from "./ScrollColours";
import { useRouteLanding, useSendLanding } from "./sendLanding";
import { type Place, saidBy } from "./spaces";
import { TaskBubble } from "./TaskBubble";
import { Waits } from "./Waits";
import { clockTime, separatorLabel } from "./when";

export interface LineProps {
  readonly line: LineModel;
  readonly directory: Directory;
  readonly selfId: string;
  /** Whether this room names its authors on the bubble: true once a third participant is in it. */
  readonly named: boolean;
  /** Where the line stands in a run of one author's bubbles (`groupLines`). */
  readonly place?: Place | undefined;
  /** The run a summary or a status line closes, for the receipt in its menu. */
  readonly run?: Run | undefined;
  /** The lane a route or task line draws. */
  readonly lane?: Lane | undefined;
  readonly busy: boolean;
  /** A Not right? note on this line the server turned away, said under it until the next (PM-4). */
  readonly unsent?: UnsentNote | undefined;
  /** The socket is down, so a line still in the outbox is waiting rather than sending. */
  readonly offline: boolean;
  readonly onFeedback?: ((line: LineModel, given: Given) => void) | undefined;
  /** Opens another space: the one at the other end of a lane. */
  readonly onOpenSpace?: ((spaceId: string) => void) | undefined;
  /** Opens an agent's page: the agent whose context a quiet line says compacted (ADR 0146). */
  readonly onOpenAgent?: ((agentId: string) => void) | undefined;
  /** The space this line is drawn in, so a lane's row knows when its other end is this very room. */
  readonly here?: string | undefined;
  /** How a file the line carries is fetched and opened on this phone (M4.4). */
  readonly files?: FileService | undefined;
  /** The faces the person chose for spaces, which a lane's row draws its rooms in. */
  readonly faces?: Faces | undefined;
  /**
   * Where this message went, drawn over it with the lane's route, when its sender's address
   * changed with it (ADR 0081, A2: `routesIn`).
   */
  readonly route?: RouteDrawn | undefined;
  /** The words a search looked for, marked in the bubble for a moment after it opened here (ADR 0133). */
  readonly marks?: readonly string[] | undefined;
  /**
   * How the room deletes a line (ADR 0167), the same for every line in it; absent, a line offers
   * no deletion.
   */
  readonly deleting?: Deleting | undefined;
  /** Whether the reader may delete this line for everyone: the door's rule 12, as core reads it. */
  readonly mayTakeBack?: boolean | undefined;
  /**
   * Pin the line to the top of its room, or let it go (M5.4, ADR 0200): absent where the reader
   * may not, which is a guest.
   */
  readonly onPin?: ((line: LineModel, pin: boolean) => void) | undefined;
  /** Whether the line is pinned now, so its menu offers Unpin. */
  readonly pinned?: boolean | undefined;
  /** Change the words of a line of one's own (M5.4); offered on the lines core says may be. */
  readonly onEdit?: ((line: LineModel, text: string) => void) | undefined;
  /** The card of the message this one replies to (ADR 0219), quoted above its words. */
  readonly reply?: ReplyCardModel | undefined;
  /** Goes to the message a reply quotes, from the reply (ADR 0219). */
  readonly onQuote?: ((reply: LineModel, quoted: string, mine: boolean) => void) | undefined;
  /** The replies to this line the reader has, oldest first, said under it (ADR 0219). */
  readonly replies?: readonly string[] | undefined;
  /** Goes to a reply, from the mark under the message it answers. */
  readonly onReplies?: ((reply: string) => void) | undefined;
  /** Starts a reply to this line in the field below (ADR 0219), from the lifted menu. */
  readonly onReply?: ((line: LineModel) => void) | undefined;
  /** The change to the room's project this reply carries (ADR 0222), said under it. */
  readonly change?: LineChange | undefined;
}

/** How a room deletes its lines (ADR 0167). */
export interface Deleting {
  /** How a line asks the room for its dust (`Dust.tsx`). */
  readonly dust: Asker;
  /** For the reader alone: off their screens, and Undo offered. */
  readonly hide: (line: LineModel) => void;
  /** For everyone in the room. */
  readonly takeBack: (line: LineModel) => void;
  /** What is asked before a deletion for everyone. */
  readonly asking: Asking;
}

const NO_REPLIES: readonly string[] = [];

export const Line = memo(function Line(props: LineProps) {
  const { line, lane } = props;
  if (line.kind === "route") {
    return lane === undefined ? null : (
      <LaneChain
        lane={lane}
        kind="route"
        directory={props.directory}
        onOpen={props.onOpenSpace}
        here={props.here}
        files={props.files}
        lineId={line.id}
        faces={props.faces}
      />
    );
  }
  if (line.kind === "task") return lane === undefined ? null : <Task {...props} lane={lane} />;
  if (line.kind === "system" || line.kind === "checkpoint") return <Margin {...props} />;
  if (line.kind === "status") return <Status {...props} />;
  return <Message {...props} />;
});

/**
 * The specialist's view of a lane: the chain as a caption, over the goal as the person's own
 * words. In this room it is the only copy of what was asked, and it is theirs.
 *
 * The bubble carried a *via the lead* tag until 11 September 2026 (Arjun), which is how core
 * reads any relayed line (`saidBy`) — but the chain an inch above it has the lead in the middle
 * of it, so the tag was the room saying so a second time. The goal is drawn as the person's own
 * line with its `via` cleared, so nothing downstream of here reads it as relayed either.
 */
function Task(props: LineProps & { readonly lane: Lane }) {
  const { lane, line } = props;
  const asked: LineModel = {
    ...line,
    kind: "text",
    authorId: lane.onBehalfOf,
    authorKind: "person",
    text: lane.goal,
    via: undefined,
  };
  // The chain stands over the bubble, on the bubble's side and starting where it starts: centred
  // over a bubble that is not, it read as a caption for the room rather than for this one line
  // (Arjun, 11 September 2026). Who said the goal is worked out exactly as the bubble works it
  // out, from the same line, so the two can never take different sides.
  const mine = saidBy(asked, props.directory).id === props.selfId;
  return (
    <View style={styles.task}>
      <View
        testID={`chain-${line.id}`}
        style={[
          styles.chain,
          mine ? styles.chainMine : null,
          !mine && props.named ? styles.chainPastFace : null,
        ]}
      >
        <LaneChain
          lane={lane}
          kind="task"
          directory={props.directory}
          onOpen={props.onOpenSpace}
          here={props.here}
          faces={props.faces}
        />
      </View>
      <Message {...props} line={asked} />
    </View>
  );
}

/**
 * The lines drawn in the margin rather than in a bubble: system and checkpoint. An agent's context
 * compacting is one (ADR 0146), and a tap on it opens the agent's page, where its window is.
 */
function Margin({ line, directory, onOpenAgent }: LineProps) {
  const palette = usePalette();
  // Somebody coming or going is said whole, from where the reader stands (JR-5).
  const words =
    line.kind === "system" && line.whole !== true
      ? `${nameOf(directory, line.authorId)} ${line.text}`
      : line.text;
  if (line.compacted !== undefined && onOpenAgent !== undefined) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityHint={`Opens ${nameOf(directory, line.authorId)}'s page`}
        onPress={() => onOpenAgent(line.authorId)}
        hitSlop={SPACE.sm}
        testID={`compacted-${line.id}`}
        style={({ pressed }) => [styles.margin, pressed ? styles.marginPressed : null]}
      >
        <Text style={[styles.marginWords, { color: palette.ink3 }]}>{words}</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.margin}>
      {line.kind === "checkpoint" ? (
        <Text style={[styles.tag, { color: palette.ink3, borderColor: palette.line2 }]}>
          Checkpoint
        </Text>
      ) : null}
      <Text style={[styles.marginWords, { color: palette.ink3 }]}>{words}</Text>
    </View>
  );
}

/**
 * What a failed run left behind, in the margin — and, on a long press, what it did before it
 * failed, which is the one receipt worth reading.
 */
function Status(props: LineProps) {
  const palette = usePalette();
  // Up, on its way down, or gone: the sheet is unmounted only once its slide out has finished.
  const [sheet, setSheet] = useState<"open" | "closing" | "closed">("closed");
  const { line, directory, run } = props;
  const receipt = run !== undefined && hasReceipt(run) ? run : undefined;
  return (
    <View style={styles.margin}>
      <Hold line={line} offers={receipt !== undefined} onHold={() => setSheet("open")}>
        <Text style={[styles.marginWords, { color: palette.ink3 }]}>{line.text}</Text>
      </Hold>
      {sheet === "closed" ? null : (
        <LinePages
          line={line}
          name={nameOf(directory, saidBy(line, directory).id)}
          page="receipt"
          open={sheet === "open"}
          busy={props.busy}
          run={receipt}
          onClose={() => setSheet("closing")}
          onGone={() => setSheet("closed")}
        />
      )}
    </View>
  );
}

/** A forwarded reply takes its explicit lane's identity; the destination and relay are irrelevant. */
function sourceName(props: LineProps): string | undefined {
  if (
    props.line.authorKind !== "harness" ||
    props.line.via !== undefined ||
    props.lane === undefined
  )
    return undefined;
  return props.lane.label ?? nameOf(props.directory, props.lane.specialistId);
}

/**
 * Whose face stands beside a line: the one who said it, or, for a reply a lead forwarded under
 * its specialist's name (`sourceName`), that specialist's.
 */
function faceBeside(props: LineProps, saidById: string): FaceProps {
  const from = sourceName(props) === undefined ? saidById : (props.lane?.specialistId ?? saidById);
  return faceProps(props.directory, from);
}

function Message(props: LineProps) {
  const { line, directory } = props;
  const place = props.place ?? "only";
  // Mine is the line I sent, not any person's: Dana's message on Arjun's screen is hers.
  const said = saidBy(line, directory);
  const mine = said.id === props.selfId;
  const origin = sourceName(props);
  const scheme = useScheme();
  const name = origin ?? nameOf(directory, said.id);
  const breaking = useBreaking(props, mine, origin);
  const offered = offering(props, breaking.drawn !== undefined);
  const stamped = stampedAt(place, line);
  const ink = origin === undefined ? undefined : sourceColours(origin, scheme).ink;
  // The time, which goes to the line that joins this one: it fades where it stood, and the bubble
  // closes over it on the room's transition (`RoomMotion.tsx`).
  const stamp = stamped ? (
    <Leaving>
      <Stamp line={line} offline={props.offline} mine={mine} ink={ink} />
    </Leaving>
  ) : null;
  // A line of files alone has no bubble for its time to stand in, so it stands on the page, in the
  // page's ink: in a bubble's white it could not be seen under a voice note or an album (the
  // emulator, 16 October 2026).
  const pageStamp = stamped ? (
    <Leaving>
      <Stamp line={line} offline={props.offline} mine={mine} ink={ink} onPage />
    </Leaving>
  ) : null;
  const held = useHeldMenu(props, { name, offered, breaking });
  return (
    <Whole testID={`line-${line.id}`}>
      <View style={[styles.row, mine ? styles.rowMine : null]}>
        <Face
          named={props.named}
          mine={mine}
          place={place}
          name={name}
          face={faceBeside(props, said.id)}
          marked={cantAnswer(directory, said.id) !== undefined}
        />
        <View style={styles.body}>
          {props.route === undefined ? null : (
            <Route route={props.route} line={line} mine={mine} directory={directory} />
          )}
          <Tags line={line} directory={directory} mine={mine} />
          <Hold line={line} offers={offered.offers} onHold={held.lift}>
            <Bubble
              {...props}
              place={place}
              mine={mine}
              name={name}
              stamp={stamp}
              box={held.box}
              breaking={breaking.drawn}
            />
          </Hold>
          <Hanging line={line} files={props.files} mine={mine} breaking={breaking.drawn} />
          {line.text === "" && line.deleted !== true && props.reply === undefined
            ? pageStamp
            : null}
        </View>
      </View>
      {/* What the room says of the message stands under it, clear of the face, which stays
          beside the bubble's foot: under Natalie's words in Foodie (19 October 2026) the face of
          the agent that hadn't picked them up was drawn over hers, which had dropped to the
          room's line. */}
      <View style={[styles.under, !mine && props.named ? styles.underFaced : null]}>
        <Said line={line} directory={directory} unsent={props.unsent} />
        <Heard line={line} directory={directory} mine={mine} />
        <Waits lineId={line.id} mine={mine} />
        <RepliesMark replies={props.replies ?? NO_REPLIES} mine={mine} onPress={props.onReplies} />
        <ChangeMark change={props.change} mine={mine} onPress={() => held.openPage("change")} />
      </View>
      <HeldMenus
        {...props}
        held={held}
        place={place}
        mine={mine}
        name={name}
        stamp={stamp}
        offered={offered}
        breaking={breaking}
      />
    </Whole>
  );
}

/** "2 files changed" under the reply that made the change, which opens it (ADR 0222). */
function ChangeMark({
  change,
  mine,
  onPress,
}: {
  readonly change: LineChange | undefined;
  readonly mine: boolean;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  if (change === undefined) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={change.words}
      accessibilityHint="Opens the change"
      hitSlop={8}
      onPress={onPress}
      testID={`change-${change.commit.slice(0, 7)}`}
      style={[styles.changeMark, mine ? styles.changeMine : null]}
    >
      <Icon name="doc" size={14} color={palette.ink3} weight={2} />
      <Text
        maxFontSizeMultiplier={BUBBLE.maxScale}
        style={[styles.changeWords, { color: palette.ink3 }]}
      >
        {change.words}
      </Text>
    </Pressable>
  );
}

/** The lifted menu while it is up or going down, and the sheet a choice in it opened. */
function HeldMenus(
  props: BubbleProps & {
    readonly held: ReturnType<typeof useHeldMenu>;
    readonly offered: Offered;
    readonly breaking: ReturnType<typeof useBreaking>;
  },
) {
  const { held, line, offered, breaking } = props;
  const { lifted } = held;
  const feedback = offered.feedback;
  return (
    <>
      {lifted === undefined ? null : (
        <LiftedMenu
          key={lifted.id}
          open={lifted.open}
          bubble={lifted.box}
          seen={lifted.seen}
          back={lifted.back}
          side={props.mine ? "right" : "left"}
          copy={<BubbleCopy {...props} pageY={lifted.box.y} />}
          title={`${props.name} · ${separatorLabel(line.ts, Date.now())}`}
          quick={held.quick}
          rows={held.rows}
          onClose={() => held.putDown()}
          onGone={() => held.gone(lifted.id)}
        />
      )}
      {held.page === undefined ? null : (
        <LinePages
          line={line}
          name={props.name}
          page={held.page.page}
          open={held.page.open}
          busy={props.busy}
          run={offered.receipt}
          change={props.change}
          onNotRight={
            feedback === undefined
              ? undefined
              : (text) => feedback(line, { kind: "correction", text })
          }
          onEdit={held.editable ? (text) => props.onEdit?.(line, text) : undefined}
          asking={props.deleting?.asking}
          onDeleteForEveryone={offered.takeBack ? () => breaking.choose("everyone") : undefined}
          onClose={held.closePage}
          onGone={() => {
            held.pageGone();
            breaking.sheetGone();
          }}
        />
      )}
    </>
  );
}

/**
 * What follows a lifted message as it goes down: a page of the sheet, Delete for me's dust, or a
 * reply in the field.
 */
type After = LinePage | "deleteForMe" | "reply";

/**
 * The lifted menu over a message, and the sheet a choice in it opens (ADR 0200): the bubble's place,
 * and where the room shows lines, asked for on the UI thread as the hold lands; what the capsule and
 * the card offer this line; and the order things happen in as it goes down. The bubble stays in the
 * room throughout, under its copy and soft with the room, and a page or a reply waits for the menu
 * to have gone.
 */
function useHeldMenu(
  props: LineProps,
  {
    name,
    offered,
    breaking,
  }: {
    readonly name: string;
    readonly offered: Offered;
    readonly breaking: {
      readonly choose: (deletion: Deletion) => void;
      readonly sheetGone: () => void;
    };
  },
) {
  const { line } = props;
  const box = useLiftBox();
  const [lifted, setLifted] = useState<{
    /** Which hold this is: a menu still going when the next hold lands is the last one's. */
    readonly id: number;
    readonly box: Box;
    readonly seen: Span | undefined;
    readonly open: boolean;
    readonly back?: { readonly box: Box; readonly seen: Span | undefined } | undefined;
  }>();
  const lifts = useRef(0);
  const [page, setPage] = useState<{ readonly page: LinePage; readonly open: boolean }>();
  const after = useRef<After | undefined>(undefined);
  // Put down onto where the bubble is now: the room may have moved under it while it was up.
  const putDown = (next?: After) => {
    after.current = next;
    box.ask((back, seen) =>
      setLifted((now) =>
        now === undefined || !now.open
          ? now
          : {
              ...now,
              open: false,
              back: back === null ? undefined : { box: back, seen: seen ?? undefined },
            },
      ),
    );
  };
  const editable = props.onEdit !== undefined && mayEdit(line, props.selfId);
  const quick = quickFor(props, editable, putDown);
  const rows = rowsFor(props, { name, offered, breaking, putDown });
  const lift = () =>
    box.ask((at, seen) => {
      if (at === null) return;
      lifts.current += 1;
      setLifted({ id: lifts.current, box: at, seen: seen ?? undefined, open: true });
    });
  return {
    box,
    lifted,
    page,
    quick,
    rows,
    editable,
    putDown,
    lift,
    // The menu has gone, so a sheet can rise without going with it.
    gone: (id: number) => {
      if (id !== lifts.current) return;
      const next = after.current;
      after.current = undefined;
      setLifted(undefined);
      if (next === "deleteForMe") breaking.sheetGone();
      else if (next === "reply") props.onReply?.(line);
      else if (next !== undefined) setPage({ page: next, open: true });
    },
    // A page at once, the menu not up: "2 files changed" under the reply opens its change.
    openPage: (shown: LinePage) => setPage({ page: shown, open: true }),
    closePage: () => setPage((now) => (now === undefined ? now : { ...now, open: false })),
    pageGone: () => setPage(undefined),
  };
}

/**
 * The capsule's quick actions: Reply first, on a message that can be answered (ADR 0219), then,
 * for a line with words, Copy, Select, Share (Edit on your own) and, where the reader may pin, Pin
 * or Unpin.
 */
function quickFor(
  props: LineProps,
  editable: boolean,
  putDown: (next?: After) => void,
): LiftQuick[] {
  const reply = replyQuick(props, putDown);
  const said = saidQuick(props, editable, putDown);
  return reply === undefined ? said : [reply, ...said];
}

/**
 * Reply, which puts the message down and, once it is down, hands it to the field. Handed over at
 * once, the strip and the keys rising moved the room up under the copy as it went down, and the
 * copy landed where the bubble had been, over the field, and went (his phone, 23 October 2026: "it
 * travels and overlaps the text box, then disappears"). The room keeps still under the copy, and
 * then rises with the field, as a page waits for the menu to have gone.
 */
function replyQuick(props: LineProps, putDown: (next?: After) => void): LiftQuick | undefined {
  if (props.onReply === undefined || !mayReply(props.line)) return undefined;
  return {
    key: "reply",
    icon: "reply",
    label: "Reply",
    lead: true,
    onPress: () => putDown("reply"),
  };
}

/** Copy, Select, Share or Edit, and Pin, for a line with words. */
function saidQuick(
  props: LineProps,
  editable: boolean,
  putDown: (next?: After) => void,
): LiftQuick[] {
  const { line } = props;
  if (line.deleted === true || line.text.trim() === "") return [];
  const copy: LiftQuick = {
    key: "copy",
    icon: "copy",
    label: "Copy",
    done: "Copied",
    onPress: () => {
      void Clipboard.setStringAsync(line.text).catch(() => undefined);
    },
  };
  const select: LiftQuick = {
    key: "select",
    icon: "doc",
    label: "Select",
    onPress: () => putDown("select"),
  };
  const third: LiftQuick = editable
    ? { key: "edit", icon: "pen", label: "Edit", onPress: () => putDown("edit") }
    : {
        key: "share",
        icon: Platform.OS === "android" ? "shareAndroid" : "share",
        label: "Share",
        onPress: () => {
          void shareText(line.text)
            .catch(() => undefined)
            .finally(() => putDown());
        },
      };
  const { onPin } = props;
  if (onPin === undefined) return [copy, select, third];
  const pinned = props.pinned === true;
  const pin: LiftQuick = {
    key: "pin",
    icon: "pin",
    label: pinned ? "Unpin" : "Pin",
    onPress: () => {
      onPin(line, !pinned);
      putDown();
    },
  };
  return [copy, select, third, pin];
}

/**
 * The card's rows: Not right? on an agent's message, What the run did on the line that closed a
 * run, then the deletions the reader may make (ADR 0167).
 */
function rowsFor(
  props: LineProps,
  {
    name,
    offered,
    breaking,
    putDown,
  }: {
    readonly name: string;
    readonly offered: Offered;
    readonly breaking: { readonly choose: (deletion: Deletion) => void };
    readonly putDown: (next?: After) => void;
  },
): LiftRow[] {
  const rows: LiftRow[] = [];
  if (offered.feedback !== undefined) {
    const words = notRightWords(name);
    rows.push({
      key: "notRight",
      icon: "again",
      label: words.label,
      sub: words.hint,
      onPress: () => putDown("notRight"),
    });
  }
  if (offered.receipt !== undefined) {
    rows.push({
      key: "receipt",
      icon: "list",
      label: "What the run did",
      sub: receiptLine(offered.receipt),
      onPress: () => putDown("receipt"),
    });
  }
  if (offered.hide) {
    rows.push({
      key: "deleteForMe",
      icon: "trash",
      label: DELETE_FOR_ME.label,
      danger: true,
      onPress: () => {
        breaking.choose("me");
        putDown("deleteForMe");
      },
    });
  }
  if (offered.takeBack && props.deleting?.asking !== undefined) {
    rows.push({
      key: "deleteForEveryone",
      icon: "trash",
      label: DELETE_FOR_EVERYONE.label,
      danger: true,
      onPress: () => putDown("asking"),
    });
  }
  return rows;
}

/** What hangs off a bubble — its photos, its files — and, as the bubble breaks, fades with it. */
function Hanging({
  line,
  files,
  mine,
  breaking,
}: {
  readonly line: LineModel;
  readonly files: FileService | undefined;
  readonly mine: boolean;
  readonly breaking: Breaking | undefined;
}) {
  if (line.attachments === undefined) return null;
  return (
    <View collapsable={false}>
      <Attachments
        attachments={line.attachments}
        files={files}
        lineId={line.id}
        lineKey={line.key}
        mine={mine}
      />
      {breaking === undefined ? null : <Veil backwards={breaking.crumbling.backwards} />}
    </View>
  );
}

/** Which deletion the reader chose in the sheet, carried out once it has gone (ADR 0167). */
type Deletion = "me" | "everyone";

/** A deletion for everyone that the server turned away shows its words again after this long. */
const TURNED_AWAY_MS = 1500;

/** What a bubble breaking draws over itself: the eraser, and what it calls back. */
interface Breaking {
  readonly crumbling: Crumbling;
  readonly dust: Asker;
  readonly onWiped: () => void;
  readonly onDone: () => void;
}

/**
 * A line breaking into dust as it is deleted, or forming again from it by Undo (ADR 0167).
 *
 * The deletion chosen in the sheet waits for the sheet to have gone, so the dust is seen against
 * the room and not under a scrim. For the reader alone, the line leaves the room as the wipe has
 * crossed it (`hide`), and the room closes over it while its dust drifts. For everyone, the eraser
 * stands over the bubble until the tombstone comes back from the server, and the tombstone comes
 * up in its place (`Gone`) — or, turned away, the words form again from their dust. A line coming
 * back by Undo starts covered (`returning`), and forms again.
 */
function useBreaking(
  props: LineProps,
  mine: boolean,
  origin: string | undefined,
): {
  readonly drawn: Breaking | undefined;
  readonly choose: (deletion: Deletion) => void;
  readonly sheetGone: () => void;
} {
  const palette = usePalette();
  const scheme = useScheme();
  const { line, deleting } = props;
  const groundOf = (): Omit<Crumbling, "backwards"> => {
    if (line.deleted === true) return { ground: palette.ink4, ink: palette.ink3 };
    if (origin !== undefined) {
      const source = sourceColours(origin, scheme);
      return { ground: source.ground, ink: source.ink ?? palette.ink };
    }
    return mine
      ? { ground: "field", ink: OUTGOING.ink }
      : { ground: palette.them, ink: palette.ink };
  };
  const [crumbling, setCrumbling] = useState<(Crumbling & { then?: Deletion }) | undefined>(() =>
    returning.has(line.id) ? { ...groundOf(), backwards: true } : undefined,
  );
  useEffect(() => {
    returning.delete(line.id);
  }, [line.id]);
  const chosen = useRef<Deletion | undefined>(undefined);
  const [taking, setTaking] = useState(false);
  useEffect(() => {
    if (!taking) return;
    if (line.deleted === true) {
      setTaking(false);
      setCrumbling(undefined);
      return;
    }
    if (props.busy) return;
    // Turned away: the words form again from their dust, as by Undo.
    const back = setTimeout(() => {
      setTaking(false);
      setCrumbling((now) => (now === undefined ? undefined : { ...now, backwards: true }));
    }, TURNED_AWAY_MS);
    return () => clearTimeout(back);
  }, [taking, line.deleted, props.busy]);
  const drawn =
    crumbling === undefined || deleting === undefined
      ? undefined
      : {
          crumbling,
          dust: deleting.dust,
          onWiped: () => {
            if (crumbling.then === "me") deleting.hide(line);
            if (crumbling.then === "everyone") {
              deleting.takeBack(line);
              setTaking(true);
            }
          },
          onDone: () => {
            if (crumbling.backwards) setCrumbling(undefined);
          },
        };
  return {
    drawn,
    choose: (deletion) => {
      chosen.current = deletion;
    },
    sheetGone: () => {
      const then = chosen.current;
      chosen.current = undefined;
      if (then !== undefined) setCrumbling({ ...groundOf(), backwards: false, then });
    },
  };
}

/**
 * Where a message went, over it on its side (ADR 0081): an arrow and the face or faces it was for,
 * after your own face on your messages — the lane's own route (`LaneChain.tsx`), drawn where the
 * sender's address changed. Another person's bubble has their face beside it already, so their
 * route starts at the arrow. Over a message of yours just sent, the arrow and faces are held out
 * of sight while the capsule's copy of them flies up (`SendFlight.tsx`), and your face comes in
 * once it is on them.
 *
 * A tap lists who it went to, every one, on a sheet (`RouteSheet`, ADR 0113): from four it is one
 * mark and a number, and never names anybody.
 */
function Route({
  route,
  line,
  mine,
  directory,
}: {
  readonly route: RouteDrawn;
  readonly line: LineModel;
  readonly mine: boolean;
  readonly directory: Directory;
}) {
  const landing = useRouteLanding(mine ? (line.key ?? line.id) : undefined);
  // Up, on its way down, or gone: mounted only while it is anything but gone.
  const [sheet, setSheet] = useState<"up" | "going" | undefined>(undefined);
  // "Went to", where the field's faces say "To": the one is where a message went, the other
  // where the next goes. How many where the mark stands for them (ADR 0113).
  const many =
    route.words === "Everyone" && route.to.length > FACES_UP_TO
      ? `, ${route.to.length} agents`
      : "";
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Went to ${route.words}${many}`}
        accessibilityHint="Shows who it went to"
        onPress={() => {
          Keyboard.dismiss();
          setSheet("up");
        }}
        style={({ pressed }) => [
          styles.route,
          mine ? styles.routeMine : null,
          pressed ? styles.routePressed : null,
        ]}
        testID={`route-${line.id}`}
      >
        {mine ? (
          <FadingUp held={landing.held}>
            <FacesOf step={hopOf(directory, route.from)} />
          </FadingUp>
        ) : null}
        <View
          collapsable={false}
          style={[styles.onward, landing.held ? styles.held : null]}
          testID="route-onward"
        >
          <BubbleWatch told={landing.told} eager />
          <Arrow />
          <FacesOf step={stepOf(directory, route.to)} />
        </View>
      </Pressable>
      {sheet === undefined ? null : (
        <RouteSheet
          open={sheet === "up"}
          onClose={() => setSheet("going")}
          onGone={() => setSheet(undefined)}
          route={route}
          line={line}
          directory={directory}
        />
      )}
    </>
  );
}

/** The time goes on the last bubble of a turn alone; a line on its way says so wherever it is. */
function stampedAt(place: Place, line: LineModel): boolean {
  return place === "last" || place === "only" || line.pending === true || line.failed !== undefined;
}

/**
 * What this line offers, if anything. Feedback is a harness's to read, so only a harness's
 * words take a thumb or a note; a line still on its way takes nothing at all, having no message
 * id for the event to name. The receipt is the run's, for the line that closed it. Any message
 * may be deleted for the reader alone, a tombstone too; for everyone, as the door allows
 * (ADR 0167). A line breaking offers nothing more.
 */
interface Offered {
  readonly feedback: ((line: LineModel, given: Given) => void) | undefined;
  readonly receipt: Run | undefined;
  readonly offers: boolean;
  readonly hide: boolean;
  readonly takeBack: boolean;
}

const NOTHING: Offered = {
  feedback: undefined,
  receipt: undefined,
  offers: false,
  hide: false,
  takeBack: false,
};

function offering(props: LineProps, breaking: boolean): Offered {
  const { line } = props;
  if (line.pending === true || breaking) return NOTHING;
  const hide = props.deleting !== undefined && mayHide(line);
  if (line.deleted === true) return { ...NOTHING, offers: hide, hide };
  const feedback = takesFeedback(line) ? props.onFeedback : undefined;
  const receipt = props.run !== undefined && hasReceipt(props.run) ? props.run : undefined;
  return {
    feedback,
    receipt,
    offers: line.text.trim() !== "" || feedback !== undefined || receipt !== undefined,
    hide,
    takeBack: props.deleting !== undefined && props.mayTakeBack === true,
  };
}

/**
 * The bubble, and the press that asks it what it can do. A long press is invisible, so the
 * hint says it out loud for a screen reader; a line with nothing to offer is not pressable at
 * all, rather than pressable and silent.
 *
 * The press answers in the hand at the moment it is recognised — half a second in, before the
 * sheet has started — because the alternative is a thumb held on a bubble wondering whether
 * anything is happening, and a phone that answers late is a phone that feels broken.
 *
 * A plain tap puts the keyboard away, as a tap anywhere else in the room does (`TapAway`, in
 * `SpaceView.tsx`). It is said here because this view has already claimed the touch for the hold,
 * so a tap on a bubble never reaches the room behind it — and reading is what a tap on a message
 * is for, which wants the keys gone (Arjun, 20 September 2026).
 */
function Hold({
  line,
  offers,
  onHold,
  children,
}: {
  readonly line: LineModel;
  readonly offers: boolean;
  readonly onHold: () => void;
  readonly children: ReactNode;
}) {
  if (!offers) return <>{children}</>;
  const show = () => {
    Keyboard.dismiss();
    feel.lift();
    onHold();
  };
  return (
    // A table that scrolls sideways takes the touch inside itself, or this press would hold it and
    // the table would never move; it hands a hold back through `HoldLine` (ADR 0184).
    <HoldLine.Provider value={show}>
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Press and hold for what to do with this message"
        accessibilityActions={[{ name: "messageActions", label: "Message actions" }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "messageActions") show();
        }}
        testID={`hold-${line.id}`}
        onPress={() => Keyboard.dismiss()}
        onLongPress={show}
      >
        {children}
      </Pressable>
    </HoldLine.Provider>
  );
}

/**
 * The face beside a line, where the room draws one: never beside yours, never in a room of two,
 * and in a room of three beside the last bubble of a turn alone — the ones before it keep the
 * face's width so the bubbles of one turn line up. An agent's wears its pins round its body, a
 * little dim, so it is the chip it is down the Agents tab (ADR 0103).
 */
function Face({
  named,
  mine,
  place,
  name,
  face,
  marked,
}: {
  readonly named: boolean;
  readonly mine: boolean;
  readonly place: Place;
  readonly name: string;
  /** Its outline, and an agent's own face (ADR 0089). */
  readonly face: FaceProps;
  /** An agent that can't answer now (ADR 0083). */
  readonly marked: boolean;
}) {
  if (!named || mine) return null;
  if (place === "first" || place === "middle") return <View style={styles.faceGap} />;
  return <Avatar name={name} {...face} size="sm" cantAnswer={marked} pinsOut />;
}

/** The static fallback beneath the outgoing field, or the neutral incoming surface. */
function bubbleColours(
  palette: Palette,
  mine: boolean,
): { readonly ground: string; readonly ink: string | undefined } {
  if (mine) return { ground: OUTGOING.ground, ink: OUTGOING.ink };
  // Completion is status, never a new speaker identity.
  return { ground: palette.them, ink: undefined };
}

/**
 * The corners, by where the bubble stands in its turn: the sides that face another bubble of
 * the same author close up, the rest keep the full corner. Older is above, so a first's foot
 * and a last's head are the ones that meet.
 */
function cornersOf(place: Place, mine: boolean): ViewStyle {
  const head = place === "middle" || place === "last" ? BUBBLE.inner : BUBBLE.radius;
  const foot = place === "first" || place === "middle" ? BUBBLE.inner : BUBBLE.radius;
  return mine
    ? { borderTopRightRadius: head, borderBottomRightRadius: foot }
    : { borderTopLeftRadius: head, borderBottomLeftRadius: foot };
}

/**
 * Whether a bubble of yours is kept out of sight while the words of a send from this room's own
 * field fly to it (`SendFlight.tsx`), and what its watch is to tell. It is watched from its first
 * frame, the room being built already.
 */
function useHeld(mine: boolean, line: LineModel) {
  return useSendLanding(mine ? (line.key ?? line.id) : undefined);
}

/** A bubble's width when it holds a table (ADR 0184): its widest, on its side. */
function widest(wide: boolean, mine: boolean) {
  if (!wide) return null;
  return mine ? styles.wideMine : styles.wide;
}

/** What a bubble is drawn with, the same in the room and in its copy held up over it. */
interface Look {
  readonly ground: string;
  readonly ink: string | undefined;
  /** The name inside its top left, where the room names its authors. */
  readonly who: string | undefined;
  /** A harness's queued turn, drawn as the work it is (`TaskBubble.tsx`). */
  readonly task: ReturnType<typeof readTaskBubble>;
  /** A table makes its bubble its widest (ADR 0184). */
  readonly wide: boolean;
}

type BubbleProps = LineProps & {
  readonly place: Place;
  readonly mine: boolean;
  /** Who said it, whether or not this room says so. */
  readonly name: string;
  readonly stamp: ReactNode;
};

function useLook(props: BubbleProps): Look {
  const palette = usePalette();
  const scheme = useScheme();
  const { line } = props;
  // A harness's queued turn edits one message as it works, and the room draws that as the work
  // it is rather than as the text it arrives as (`TaskBubble.tsx`). Never your own bubble: what
  // you said is what you said, whatever it opens with.
  const task = useMemo(
    () => (props.mine ? undefined : readTaskBubble(line.text)),
    [line.text, props.mine],
  );
  // A table makes its bubble its widest (ADR 0184): one that hugs its words measured a table's
  // rows wrongly, and grew thousands of points tall and blank below them.
  const wide = useMemo(() => holdsTable(line.text), [line.text]);
  const origin = sourceName(props);
  const { ground, ink } =
    origin === undefined ? bubbleColours(palette, props.mine) : sourceColours(origin, scheme);
  // Never mine: my own bubble is on my own side of my own screen.
  const who = (props.named || origin !== undefined) && !props.mine ? props.name : undefined;
  return { ground, ink, who, task, wide };
}

/** The name, then the words or the work, as the bubble and its copy both draw them. */
function BubbleWords({
  props,
  look,
  still = false,
}: {
  readonly props: BubbleProps;
  readonly look: Look;
  /** The copy over the room, whose card goes nowhere. */
  readonly still?: boolean;
}) {
  const palette = usePalette();
  const { reply, onQuote } = props;
  return (
    <>
      {look.who === undefined ? null : (
        <Text
          maxFontSizeMultiplier={BUBBLE.maxScale}
          style={[styles.who, { color: look.ink ?? palette.ink2 }]}
        >
          {look.who}
        </Text>
      )}
      {reply === undefined ? null : (
        <ReplyCard
          card={reply}
          mine={props.mine}
          directory={props.directory}
          files={props.files}
          onPress={
            still || onQuote === undefined
              ? undefined
              : (quoted) => onQuote(props.line, quoted, props.mine)
          }
        />
      )}
      {look.task === undefined ? (
        <Markdown text={props.line.text} ink={look.ink} marks={props.marks} />
      ) : (
        <TaskBubble
          task={look.task}
          colour={faceGround(
            props.name,
            faceBeside(props, saidBy(props.line, props.directory).id).icon,
          )}
        />
      )}
    </>
  );
}

function Bubble(
  props: BubbleProps & {
    /** Where it is, for that copy to stand on (`LiftedMotion.tsx`). */
    readonly box: LiftBoxRef;
    /** Breaking into dust, or forming again from it (ADR 0167). */
    readonly breaking?: Breaking | undefined;
  },
) {
  const { line } = props;
  const look = useLook(props);
  const landing = useHeld(props.mine, line);
  if (line.deleted === true) {
    return (
      <View>
        <Gone mine={props.mine} broke={props.breaking !== undefined} />
        <LiftBox box={props.box} />
      </View>
    );
  }
  // A reply of files alone still has its card to stand in a bubble (ADR 0219).
  if (line.text === "" && props.reply === undefined) return null;
  // A swipe on the bubble replies to it; beside it, it is the screen's swipe back (`ReplySwipe.tsx`).
  return (
    <ReplyGrip>
      <MovingBubble
        corners={cornersOf(props.place, props.mine)}
        testID={`bubble-${line.id}`}
        style={[
          styles.bubble,
          props.mine ? styles.bubbleMine : null,
          widest(look.wide, props.mine),
          { backgroundColor: look.ground },
          landing.held ? styles.held : null,
        ]}
      >
        {props.mine ? <OutgoingColour /> : null}
        <BubbleWatch told={landing.told} eager />
        <LiftBox box={props.box} />
        <BubbleWords props={props} look={look} />
        {props.stamp}
        {erasing(props.breaking)}
      </MovingBubble>
    </ReplyGrip>
  );
}

/**
 * The bubble drawn again, over the room, at the bubble's width (ADR 0200): the same ground, corners,
 * name, words and time. Yours keeps the colours its field gave it where it stood (`FrozenColour`).
 */
function BubbleCopy(props: BubbleProps & { readonly pageY: number }) {
  const { line } = props;
  const look = useLook(props);
  if (line.deleted === true) return <Gone mine={props.mine} broke={false} />;
  return (
    <View
      style={[
        styles.bubble,
        props.mine ? styles.bubbleMine : null,
        cornersOf(props.place, props.mine),
        { backgroundColor: look.ground },
        styles.copy,
      ]}
      testID={`bubble-copy-${line.id}`}
    >
      {props.mine ? <FrozenColour pageY={props.pageY} /> : null}
      <BubbleWords props={props} look={look} still />
      {props.stamp}
    </View>
  );
}

/**
 * The eraser over a bubble breaking: inside it, so its corners clip the wipe as they clip all else.
 * One for each way, since an eraser asks for its dust once: a deletion turned away forms again.
 */
function erasing(breaking: Breaking | undefined): ReactNode {
  if (breaking === undefined) return null;
  return (
    <Eraser
      key={breaking.crumbling.backwards ? "back" : "away"}
      crumbling={breaking.crumbling}
      dust={breaking.dust}
      onWiped={breaking.onWiped}
      onDone={breaking.onDone}
    />
  );
}

/**
 * A line taken back, on its author's side. In place of a bubble that broke as the reader watched,
 * it comes up out of the room's ground (`Veil`); one that was simply there is simply there.
 */
function Gone({ mine, broke }: { readonly mine: boolean; readonly broke: boolean }) {
  const palette = usePalette();
  const [came] = useState(broke);
  return (
    <View style={[styles.goneBox, mine ? styles.goneMine : null]}>
      <Text style={[styles.gone, { color: palette.ink3 }]} testID="tombstone">
        Message taken back
      </Text>
      {came ? <Veil backwards /> : null}
    </View>
  );
}

/**
 * How a steer was meant, that a line was edited, and who relayed it — over the bubble and on the
 * bubble's own side, which for yours is the right (Arjun, 11 September 2026: a tag hanging off
 * the far edge of a bubble belongs to no bubble).
 */
function Tags({
  line,
  directory,
  mine,
}: {
  readonly line: LineModel;
  readonly directory: Directory;
  readonly mine: boolean;
}) {
  const palette = usePalette();
  const words: string[] = [];
  if (line.mode !== undefined) words.push(line.mode);
  if (line.via !== undefined) words.push(`via ${nameOf(directory, line.via)}`);
  if (line.editedAt !== undefined) words.push("edited");
  if (words.length === 0 && line.heartbeat !== true) return null;
  const said =
    words.length === 0 ? null : (
      <Text
        maxFontSizeMultiplier={BUBBLE.maxScale}
        style={[styles.tags, mine ? styles.tagsMine : null, { color: palette.ink3 }]}
      >
        {words.join(" · ")}
      </Text>
    );
  if (line.heartbeat !== true) return said;
  return (
    <View style={[styles.tagRow, mine ? styles.tagsMine : null]}>
      <HeartbeatTag />
      {said}
    </View>
  );
}

/**
 * An agent's check-in (ADR 0143): it wrote on its own, from its heartbeat, with nobody asking.
 * Flat, in the room's gold, as the Lead mark is, with the pulse it beats to.
 */
function HeartbeatTag() {
  const palette = usePalette();
  return (
    <View
      style={[styles.beat, { backgroundColor: palette.goldSoft }]}
      accessibilityLabel="Heartbeat check-in"
      testID="heartbeat-tag"
    >
      <Icon name="pulse" size={12} color={palette.goldDeep} />
      <Text
        maxFontSizeMultiplier={BUBBLE.maxScale}
        style={[styles.beatWords, { color: palette.goldDeep }]}
      >
        Heartbeat
      </Text>
    </View>
  );
}

/**
 * The time, or where the line is on its way to the server. A line held because there is nothing
 * to send it down says so — "sending…" on a closed socket reads like a message in flight, and
 * somebody who believes that sends it again. Said by the words of a send on their way to the
 * bubble too (`SendFlight.tsx`), so the bubble they land on says what they said.
 */
export function stampWords(
  line: Pick<LineModel, "pending" | "ts" | "held" | "handed">,
  offline: boolean,
): string {
  if (line.pending === true) return offline ? "waiting for a connection" : "sending…";
  // A message Chips held from the agents it named (ADR 0097), and, once a person acted, handed on.
  if (line.held === true)
    return `${clockTime(line.ts)} · ${line.handed === true ? "handed on" : "held"}`;
  return clockTime(line.ts);
}

function Stamp({
  line,
  offline,
  mine,
  ink,
  onPage = false,
}: {
  readonly ink?: string | undefined;
  readonly line: LineModel;
  readonly offline: boolean;
  readonly mine: boolean;
  /** Under the line's files rather than in a bubble: on the page, in the page's ink. */
  readonly onPage?: boolean;
}) {
  const palette = usePalette();
  if (line.failed !== undefined) {
    return (
      <Text maxFontSizeMultiplier={BUBBLE.maxScale} style={[styles.stamp, { color: palette.red }]}>
        {line.failed}
      </Text>
    );
  }
  // On the teal, the ink is white a little faded; on the greys, `ink2` is the one shade that
  // clears 4.5:1 on all of them, light and dark.
  const colour = onPage
    ? { color: palette.ink3 }
    : mine
      ? { color: OUTGOING.ink, opacity: STAMP_INK }
      : { color: ink ?? palette.ink2 };
  return (
    <Text maxFontSizeMultiplier={BUBBLE.maxScale} style={[styles.stamp, colour]}>
      {stampWords(line, offline)}
    </Text>
  );
}

/**
 * What the space has already said about this line: the reactions on it, and the notes. And a
 * note of the reader's the server turned away, where it would have stood, with why (PM-4): the
 * words in the note's place and the reason in red, as a refused message keeps its words and says
 * why under them.
 */
function Said({
  line,
  directory,
  unsent,
}: {
  readonly line: LineModel;
  readonly directory: Directory;
  readonly unsent: UnsentNote | undefined;
}) {
  const palette = usePalette();
  const reactions = line.reactions ?? [];
  const corrections = line.corrections ?? [];
  if (reactions.length === 0 && corrections.length === 0 && unsent === undefined) return null;
  const counted = new Map<string, number>();
  for (const each of reactions) counted.set(each.reaction, (counted.get(each.reaction) ?? 0) + 1);
  return (
    <View style={styles.given}>
      {[...counted].map(([reaction, count]) => (
        <Text key={reaction} style={[styles.reaction, { backgroundColor: palette.surface2 }]}>
          {reaction} {count}
        </Text>
      ))}
      {corrections.map((each) => (
        <Text
          key={`${each.by}:${each.seq}`}
          style={[styles.correction, { color: palette.amberInk }]}
        >
          {nameOf(directory, each.by)}: {each.text}
        </Text>
      ))}
      {unsent === undefined ? null : (
        <Text testID={`unsent-${line.id}`} style={[styles.correction, { color: palette.ink3 }]}>
          {unsent.text}
          {"\n"}
          <Text style={{ color: palette.red }}>{refusalWords(unsent.reason, directory)}</Text>
        </Text>
      )}
    </View>
  );
}

/**
 * That turns working in the room heard this, said for somebody else (ADR 0106): "J1 heard this
 * while working", quiet, on the bubble's side, as its tags are.
 */
function Heard({
  line,
  directory,
  mine,
}: {
  readonly line: LineModel;
  readonly directory: Directory;
  readonly mine: boolean;
}) {
  const palette = usePalette();
  const words = heardWords(line, directory);
  if (words === undefined) return null;
  return (
    <Text
      maxFontSizeMultiplier={BUBBLE.maxScale}
      style={[styles.tags, styles.heard, mine ? styles.tagsMine : null, { color: palette.ink3 }]}
    >
      {words}
    </Text>
  );
}

/** How much of the white a bubble of yours writes its time in. */
export const STAMP_INK = 0.9;

/** A face's width, which is also what a bubble beside one is held clear of the edge by. */
const FACE = 28;

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: SPACE.sm, alignItems: "flex-end" },
  // Yours on the right, with the face left off: it is your screen, and the side says so.
  rowMine: { flexDirection: "row-reverse" },
  // The body still stretches — attachments and a note's form want the width — and it is the
  // bubble alone that shrinks to its words and takes a side.
  body: { flex: 1, gap: SPACE.xs },
  // What the room says under a message, past the face's column where the row has one. Each line
  // keeps the step down it had in the body (`given`, `heard`, the waits' own).
  under: {},
  underFaced: { paddingLeft: FACE + SPACE.sm },
  // As the replies mark stands (`ReplyCard.tsx`).
  changeMark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
    alignSelf: "flex-start",
  },
  changeMine: { alignSelf: "flex-end" },
  changeWords: { fontSize: TEXT.sm, fontWeight: "600" },
  faceGap: { width: FACE },
  task: { gap: SPACE.xs },
  // A message's route, over its bubble on its side: yours on the right.
  route: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.xs,
    alignSelf: "flex-start",
    paddingVertical: SPACE.xs,
  },
  routeMine: { alignSelf: "flex-end" },
  routePressed: { opacity: 0.55 },
  onward: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  chain: { flexDirection: "row" },
  chainMine: { justifyContent: "flex-end" },
  chainPastFace: { paddingLeft: FACE + SPACE.sm },
  who: { fontSize: TEXT.sm, fontWeight: "700" },
  tags: { fontSize: TEXT.xs },
  heard: { marginTop: SPACE.xs },
  tagsMine: { alignSelf: "flex-end" },
  tagRow: { flexDirection: "row", alignItems: "center", gap: SPACE.xs + 2 },
  beat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 999,
    paddingLeft: 5,
    paddingRight: 7,
    paddingVertical: 2,
  },
  beatWords: { fontSize: TEXT.xs - 1, fontWeight: "700", letterSpacing: 0.2 },
  stamp: { fontSize: TEXT.xs, alignSelf: "flex-end" },
  // A bubble stops well short of the column: a line of chat the full width of the glass is a
  // paragraph wearing a bubble's costume, and Messages leaves the far quarter clear.
  held: { opacity: 0 },
  // The copy is as wide as the bubble it covers, whatever share of the row the bubble took.
  copy: { alignSelf: "stretch", width: "100%", maxWidth: "100%" },
  bubble: {
    overflow: "hidden",
    borderRadius: BUBBLE.radius,
    paddingHorizontal: BUBBLE.padX,
    paddingVertical: BUBBLE.padY,
    alignSelf: "flex-start",
    maxWidth: "90%",
  },
  bubbleMine: { alignSelf: "flex-end", maxWidth: BUBBLE.maxWidth },
  wide: { width: "90%" },
  wideMine: { width: BUBBLE.maxWidth },
  gone: { fontSize: TEXT.body, fontStyle: "italic" },
  // A tombstone's own box, which an eraser over it fills, no wider than its words and on its side.
  goneBox: { alignSelf: "flex-start" },
  goneMine: { alignSelf: "flex-end" },
  margin: { paddingVertical: SPACE.xs, gap: SPACE.xs, alignItems: "center" },
  marginPressed: { opacity: 0.55 },
  marginWords: { fontSize: TEXT.sm, textAlign: "center" },
  tag: { fontSize: TEXT.xs, borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: 6 },
  given: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACE.xs,
    alignItems: "center",
    marginTop: SPACE.xs,
  },
  reaction: {
    fontSize: TEXT.sm,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 2,
    overflow: "hidden",
  },
  correction: { fontSize: TEXT.sm },
});
