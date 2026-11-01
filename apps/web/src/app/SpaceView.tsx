/**
 * The middle pane: one space. Its header (its name, who is doing the work, and who is here), the
 * messages, the approval and question cards its runs are waiting on, and the composer. This is
 * where the golden loop plays out — a harness asks, a person answers, the harness finishes.
 */

import type { LinkKind } from "@chipschat/core";
import {
  type Aim,
  type Approval as ApprovalModel,
  type Asking,
  type Attachment,
  AWAITING_AGENTS,
  faceOf as agentFace,
  aimWordsOf,
  awaitsAgents,
  betweenHarnesses,
  type ConnectionState,
  cantAnswer,
  cantAnswerIn,
  cantAnswerWords,
  changeOf,
  type Directory,
  type Doing,
  deleteForEveryoneAsking,
  type ExchangeLine,
  exchangeLine,
  faceKind,
  filesChangedWords,
  formatBytes,
  formatDuration,
  harnessesIn,
  harnessUnder,
  heardWords,
  isAgent,
  kindOf,
  type Lane,
  type LaneState,
  type Line,
  type MessageRoute,
  mayReply,
  nameOf,
  namesAuthors,
  type PersonModel,
  pauseWords,
  peopleIn,
  pinnedLines,
  plainWords,
  type Question,
  type ReplyCard as ReplyCardModel,
  type Run,
  readMark,
  readTaskBubble,
  repliesTo,
  replyCard,
  roomLeadOf,
  roomName,
  routesIn,
  type Session,
  type Space,
  searchTerms,
  routeWords as sentToWords,
  spaceDoing,
  spaceSubtitle,
  spaceTitle,
  takesFeedback,
  type UnsentNote,
  visibleLines,
  WAITING_ROOM,
  type WorkspaceModel,
  waitingIn,
  waitingRoomWords,
} from "@chipschat/core";
import type { AttachmentCaps, ExchangeLimits, SpaceIcon } from "@chipschat/protocol";
import {
  Avatar,
  Button,
  Composer,
  FaceGroup,
  faceGround,
  type HarnessStatus,
  Icon,
  Pill,
  Receipt,
  type ReceiptStep,
  RouteCard,
  TaskCard,
  type TrailHop,
} from "@chipschat/ui";
import {
  type ClipboardEvent,
  type DragEvent,
  Fragment,
  memo,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { facesOf, useAddressInField, useAiming } from "./AddressInField.tsx";
import { AgentNotice } from "./AgentNotice.tsx";
import { Ask, type Chosen } from "./Ask.tsx";
import { Attachments } from "./Attachments.tsx";
import { useColourField } from "./colourField.ts";
import { Decide, type DecisionInput } from "./Decide.tsx";
import {
  CallStrip,
  Clock,
  LitDots,
  STRIP_GLYPHS,
  Swap,
  useHeld,
  useHeldReplies,
  useInTouch,
  useStripRow,
} from "./Doing.tsx";
import { FeedbackGiven, NoteForm, type OnFeedback, saidName } from "./Feedback.tsx";
import { ForkLine, NewAgentLine } from "./ForkLine.tsx";
import type { FileService } from "./files.ts";
import {
  EditForm,
  type LineHandlers,
  type LineMay,
  mayFor,
  type Standing,
  sameMay,
} from "./LineActions.tsx";
import { hasMenu, LineMenu, More, type Point } from "./LineMenu.tsx";
import { Markdown } from "./Markdown.tsx";
import { type Focus, MessageList } from "./MessageList.tsx";
import { type RouteMark, RouteOver } from "./RouteOver.tsx";
import type { SpaceActions } from "./room/actions.ts";
import { type Breaking, DustProvider, returning, useCrumble, useDustRoom } from "./room/Dust.tsx";
import { BackPill, type BackTo, RepliesMark, ReplyCard, ReplyStrip } from "./room/Reply.tsx";
import { RoomSheet } from "./room/RoomSheet.tsx";
import { type Undoing, UndoPill } from "./room/UndoPill.tsx";
import { UniverseMark } from "./room/UniverseMark.tsx";
import { TaskBubble } from "./TaskBubble.tsx";
import { clockTime, relativeTime } from "./time.ts";
import { useNarrow } from "./useNarrow.ts";
import { useNow } from "./useNow.ts";
import { carriesLocation, type Staged, useStaged } from "./useStaged.ts";
import { useVoiceNotes } from "./VoiceRecorder.tsx";
import { ViewerHost } from "./viewer/ViewerHost.tsx";
import { Waits, WaitsProvider } from "./Waits.tsx";

export interface SpaceViewProps {
  readonly space: Space;
  readonly directory: Directory;
  /** The participant reading this: their own lines sit on the right and say "You". */
  readonly selfId: string;
  /** Whether the socket is up. Anything but open is said in the header, so a wait is explained. */
  readonly connection: ConnectionState;
  /** Which way the socket reached the server (M4.1): said in the header when it is the relay. */
  readonly link?: LinkKind | undefined;
  /** Approvals, questions and runs with a command on its way; their cards are busy until answered. */
  readonly busy: ReadonlySet<string>;
  /** What Chips did with each message sent mid-run, by the line's key. */
  readonly receipts: ReadonlyMap<string, "queued" | "steered">;
  /** Not right? notes the server turned away, by line, said under it (PM-4). */
  readonly unsentNotes?: ReadonlyMap<string, UnsentNote> | undefined;
  /** Something the shell wants said under the composer: a command it could not carry out. */
  readonly notice?: string | undefined;
  /** Uploads and fetches, through the device's signature. */
  readonly files: FileService;
  /** What may be attached here (ADR 0047): a file over its kind's cap is refused at the chip. */
  readonly attachmentCaps?: AttachmentCaps | undefined;
  /**
   * Where a message typed here would go (ADR 0024). Said above the composer before it is sent,
   * rather than discovered afterwards by nothing happening.
   */
  readonly route?: MessageRoute | undefined;
  /** Pin which visit a message goes to, or let it go with `undefined` (ADR 0040). */
  readonly onPin?: ((sessionRef: string | undefined) => void) | undefined;
  /** Pause the agents here, or let them carry on (ADR 0097). */
  readonly onExchange?: ((state: "paused" | "going") => void) | undefined;
  /** What to call the harness a route names, when the route has nowhere to put a message. */
  readonly harnessName?: ((harnessId: string) => string) | undefined;
  /**
   * The lanes anchored in this space (M3.2): the route cards of a lead space, the task card of
   * a specialist's home. A `route` or `task` line names one of these by id and is drawn from it.
   */
  readonly lanes?: readonly Lane[] | undefined;
  /**
   * The faces the person chose for spaces (22 September 2026): a lane's card draws each end as
   * the room it is, in the face the Spaces list wears for it.
   */
  readonly faces?: Faces | undefined;
  /** What a person may do to this space from its room sheet (M3.3, ADR 0151). */
  readonly onSpace?: SpaceActions | undefined;
  /** A thumb or a note on a line a harness said (M3.4). Absent, the rows offer neither. */
  readonly onFeedback?: OnFeedback | undefined;
  /**
   * Opens an agent's page: the one a line says compacted its context (ADR 0146), and an agent's
   * row in the room sheet (ADR 0111's addendum).
   */
  readonly onOpenAgent?: ((agentId: string) => void) | undefined;
  /**
   * Cancel a lane from its route card while it is still going (M3.5): the specialist's run is
   * stopped, and the lead hears the lane was cancelled. Absent, the card offers no button.
   */
  readonly onStopLane?: ((lane: Lane) => void) | undefined;
  /** Take back a message still held because the socket is shut, by its idempotency key. */
  readonly onDiscard?: ((key: string) => void) | undefined;
  /**
   * The composer's line, as typed — a message, or a slash command the shell reads — the files
   * staged with it, already uploaded, where the capsule over the field said it goes, in a room of
   * several harnesses (ADR 0081), and the line it replies to (ADR 0219).
   */
  readonly onSend: (
    text: string,
    attachments: readonly Attachment[],
    aim?: Aim | undefined,
    replyTo?: string | undefined,
  ) => void;
  readonly onDecide: (approval: ApprovalModel, input: DecisionInput) => void;
  /** Hand an ask to somebody else (M5.5): a teammate, a role, the lead. */
  readonly onRoute?:
    | ((approval: ApprovalModel, to: readonly string[], reason?: string) => void)
    | undefined;
  readonly onAnswer: (question: Question, answers: readonly Chosen[]) => void;
  readonly onRead: (seq: number) => void;
  /**
   * What may be done to a line (M5.4) — edit, take back, pin — and the
   * reader's standing here, which decides it. Absent, the rows offer none of it.
   */
  readonly onLine?: LineHandlers | undefined;
  readonly standing?: Standing | undefined;
  /** A line to jump to, from a search hit: the room scrolls to it and marks it. */
  readonly jumpTo?: LineFocus | undefined;
  /** Everyone in the workspace, so an ask may be handed outside this room (ADR 0042). */
  readonly people?: Readonly<Record<string, PersonModel>> | undefined;
  /** The workspace, for where each agent is and who may move one (ADR 0087). */
  readonly model?: WorkspaceModel | undefined;
  /** A room just made empty from the +: when it is this one, its sheet comes up on Add (ADR 0148). */
  readonly membersFor?: string | undefined;
  /** Its sheet came up for `membersFor`: once, so the room met again later opens as any room. */
  readonly onMembersShown?: (() => void) | undefined;
}

/** A line to jump to; the nonce makes the same line again a jump. */
export interface LineFocus {
  readonly lineId: string;
  readonly nonce: number;
  /** What a search looked for, marked in the line for a moment (ADR 0133). */
  readonly words?: string | undefined;
}

/** The words a search looked for, marked in the line it landed on, as core folds them. */
interface Marking {
  readonly lineId: string;
  readonly terms: readonly string[];
}

/**
 * How long the words stay marked: past the landing, long enough to be read where they are, and
 * then the line is as it was. The phone's own (`MARKS_MS`, ADR 0133).
 */
const MARKS_MS = 2500;

/**
 * The light on the header's face while its run is live. A run that has ended draws nothing there,
 * as on the phone (ADR 0050, ADR 0151): the reply is the proof it finished.
 */
const LIVE_STATUS: Partial<Record<Run["state"], HarnessStatus>> = {
  running: "working",
  waiting: "waiting",
  queued: "thinking",
};

/** Words for a room's field from outside the room, by space, taken once as the room is drawn. */
const seeds = new Map<string, string>();

/** Put words in a room's field, not sent, for when it is next drawn: You's Write it with (ADR 0237). */
export function seedField(spaceId: string, text: string): void {
  seeds.set(spaceId, text);
}

export function SpaceView(props: SpaceViewProps) {
  const { space, directory, selfId, receipts, files } = props;
  const run = space.run;
  const [draft, setDraft] = useState("");
  useEffect(() => {
    const seed = seeds.get(space.id);
    if (seed === undefined) return;
    seeds.delete(space.id);
    setDraft(seed);
  }, [space.id]);
  // A new agent asked for from here has joined (ADR 0108): an empty field holds its @, ready for
  // its first job. Taken once, so a field emptied since is left empty.
  const arrival = useRef(props.onSpace?.takeArrival);
  arrival.current = props.onSpace?.takeArrival;
  const made = space.made;
  useEffect(() => {
    if (made === undefined) return;
    const handle = arrival.current?.();
    if (handle !== undefined) setDraft((now) => (now.trim() === "" ? `${handle} ` : now));
  }, [made]);
  const staged = useStaged(files, props.attachmentCaps);
  const picker = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const voice = useVoiceNotes(staged.add);
  // The Steer chip: while it is on, what is typed goes to the run as a steer.
  const [steering, setSteering] = useState(false);
  const narrow = useNarrow();
  // The message the draft replies to, from a line's Reply (ADR 0219).
  const field = useRef<HTMLTextAreaElement>(null);
  const answering = useAnswering(space.id, field);
  // Where the draft goes, in a room of several harnesses: the capsule over the field (ADR 0081).
  const aiming = useAiming(space, directory, selfId, steering, answering.deciding);
  const aim = aiming.aimFor(draft);
  // The faces that lead the field, and the list it opens into (Arjun's A).
  const address = useAddressInField({
    aim,
    harnesses: harnessesIn(space, directory),
    people: peopleIn(space, directory).filter((id) => id !== selfId),
    space,
    directory,
    selfId,
    onPick: (pick) => {
      aiming.pick(pick);
      answering.picked();
    },
    picked: aiming.picked,
  });
  const scroller = useRef<HTMLDivElement>(null);
  useColourField(scroller);
  // A line deleted for the reader alone, while Undo is offered for it (ADR 0167).
  const [undoing, setUndoing] = useState<Undoing | undefined>(undefined);
  const hidden = useCallback((lineId: string) => setUndoing({ lineId, at: Date.now() }), []);
  const undone = useCallback(() => setUndoing(undefined), []);
  const onLine = props.onLine;
  const undo = useCallback(
    (lineId: string) => {
      // The line comes back to open its place and form again, not to arrive as a new one would.
      // Its row takes it off as it is drawn; a line that never came back is forgotten soon after.
      returning.add(lineId);
      setTimeout(() => returning.delete(lineId), RETURN_MS);
      onLine?.show(space.id, lineId);
      setUndoing(undefined);
    },
    [onLine, space.id],
  );
  // Undo is for the room it was offered in.
  // biome-ignore lint/correctness/useExhaustiveDependencies: on a change of room only
  useEffect(() => setUndoing(undefined), [space.id]);
  // A harness's reply waits for its run to close, so it lands with its receipt as the bubble goes.
  const held = useHeldReplies(space);
  // Out of touch with the server, or a beat after it is back while it catches up: the bubbles say
  // what was known, and stand still.
  const inTouch = useInTouch(props.connection);
  const rows = rowsOf(
    space,
    visibleLines(space, props.lanes ?? []).filter((line) => !held.has(line.id)),
    directory,
    props.model?.exchangeLimits,
  );
  // Chips holds the agents' messages to each other here until a person acts (ADR 0097).
  const paused = pauseWords(space, directory);
  // A jump comes from a pin here or a search hit outside; either way the list lands on the line,
  // and a hit's words are marked in it for a moment.
  const [focus, setFocus] = useState<LineFocus | undefined>(undefined);
  const [marking, setMarking] = useState<Marking | undefined>(undefined);
  // A reply's card goes to the message it quotes, and a pill comes back (ADR 0219).
  const goToLine = useCallback((lineId: string) => setFocus({ lineId, nonce: Date.now() }), []);
  const replying = useBackToReply(scroller, goToLine);
  const jumpTo = props.jumpTo;
  useEffect(() => {
    if (jumpTo === undefined) return;
    setFocus(jumpTo);
    const terms = jumpTo.words === undefined ? [] : searchTerms(jumpTo.words);
    if (terms.length === 0) {
      setMarking(undefined);
      return;
    }
    setMarking({ lineId: jumpTo.lineId, terms });
    const timer = setTimeout(() => setMarking(undefined), MARKS_MS);
    return () => clearTimeout(timer);
  }, [jumpTo]);
  const live =
    run !== undefined &&
    run.state !== "done" &&
    run.state !== "failed" &&
    run.state !== "cancelled";
  const now = useNow();
  const sheet = useRoomSheet(space.id, props.membersFor, props.onMembersShown);

  // Mark the space read to its last line, or past a run that has ended — its card in Needs
  // you carries the run's last event, the completion after its message when the summary closes
  // on the last said and draws no line; `readMark`, in core, says how far and why. Only that
  // moves it, not every snapshot, of which a burst brings many. Reading needs a reader: a line
  // that arrives in a hidden tab stays unread until the tab is looked at again
  // (phase-1-interim-review finding 10). Following the end of the space as it grows is
  // `MessageList`'s, because it is what moves the scrollbar; switching spaces remounts it, at
  // the end again.
  const mark = readMark(space);
  const onRead = useRef(props.onRead);
  useEffect(() => {
    onRead.current = props.onRead;
  });
  useEffect(() => {
    const markRead = () => {
      if (document.visibilityState !== "visible") return;
      if (mark > 0) onRead.current(mark);
    };
    markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [mark]);
  const name = (id: string) => nameOf(directory, id);

  // Files arrive three ways — the clip, a paste, a drop — and stage the same way.
  const onPaste = (event: ClipboardEvent) => {
    const pasted = [...event.clipboardData.files];
    if (pasted.length === 0) return;
    event.preventDefault();
    staged.add(pasted);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    staged.add(event.dataTransfer.files);
  };
  const uploading = staged.staged.some((item) => item.status === "uploading");
  const send = (text: string) => {
    replying.clear();
    props.onSend(
      steering && !text.trimStart().startsWith("/") ? `/steer ${text}` : text,
      staged.take(),
      aiming.aimFor(text),
      answering.reply?.lineId,
    );
    setDraft("");
    aiming.sent();
    answering.letGo();
  };

  return (
    <ViewerHost
      space={space}
      lanes={props.lanes ?? []}
      directory={directory}
      files={files}
      onGoToMessage={(lineId) => setFocus({ lineId, nonce: Date.now() })}
    >
      <main
        className="conv"
        aria-label={`Space: ${spaceTitle(space, directory, selfId)}`}
        data-dragging={dragging ? "true" : undefined}
        onPaste={onPaste}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <Top
          space={space}
          directory={directory}
          selfId={selfId}
          connection={props.connection}
          link={props.link}
          actions={props.onSpace}
          now={now}
          model={props.model}
          files={files}
          lanes={props.lanes}
          icon={props.faces?.get(space.id)}
          onOpenAgent={props.onOpenAgent}
          sheet={sheet}
        />
        <Pins space={space} onJump={(lineId) => setFocus({ lineId, nonce: Date.now() })} />

        <div className="msgs" ref={scroller} data-testid="messages">
          {rows.length === 0 && run === undefined && (
            <Unstarted
              space={space}
              directory={directory}
              addable={props.onSpace !== undefined}
              onAdd={sheet.add}
            />
          )}
          <DustProvider list={scroller} onHidden={hidden}>
            <Rows
              key={space.id}
              onExchange={props.onExchange}
              offline={props.connection !== "open"}
              onDiscard={props.onDiscard}
              rows={rows}
              scroller={scroller}
              space={space}
              lanes={props.lanes ?? []}
              faces={props.faces}
              directory={directory}
              selfId={selfId}
              files={files}
              receipts={receipts}
              unsentNotes={props.unsentNotes}
              busy={props.busy}
              onFeedback={props.onFeedback}
              onOpenAgent={props.onOpenAgent}
              onStopLane={props.onStopLane}
              onLine={props.onLine}
              standing={props.standing}
              focus={focus}
              marking={marking}
              onQuote={replying.quote}
              onReplies={goToLine}
              onReply={answering.start}
              onChange={changeOpener(props.onSpace, sheet)}
              model={props.model}
              onFork={props.onSpace?.fork}
              onAsk={props.onSpace?.ask}
            />
          </DustProvider>

          {withCards(space).map((each) => (
            <Fragment key={each.runId}>
              {each.approvals.map((approval) => (
                <Decide
                  key={approval.approvalId}
                  approval={approval}
                  harnessName={name(each.harnessId)}
                  harnessId={each.harnessId}
                  directory={directory}
                  selfId={selfId}
                  busy={props.busy.has(approval.approvalId)}
                  now={now}
                  onDecide={props.onDecide}
                  onRoute={props.onRoute}
                  members={space.members}
                  people={props.people}
                  workspaceRole={props.standing?.inWorkspace}
                  spaceName={
                    props.model === undefined
                      ? undefined
                      : roomName(props.model, space.id, directory)
                  }
                />
              ))}
              {each.questions.map((question) => (
                <Ask
                  key={question.askId}
                  question={question}
                  harnessName={name(each.harnessId)}
                  personName={name}
                  busy={props.busy.has(question.askId)}
                  now={now}
                  onAnswer={props.onAnswer}
                />
              ))}
            </Fragment>
          ))}
          {spaceDoing(space).map((doing) => (
            <Thinking
              key={doing.harnessId}
              doing={doing}
              directory={directory}
              resting={!inTouch}
            />
          ))}
        </div>

        {props.notice !== undefined && (
          <p className="conv-notice" data-testid="notice" role="status">
            {props.notice}
          </p>
        )}
        {props.route !== undefined && props.route.how !== "chat" && (
          <p className="conv-goes" data-testid="route" data-how={props.route.how}>
            {routeWords(props.route, props.harnessName ?? ((id) => nameOf(directory, id)))}
          </p>
        )}
        <SessionPicker
          sessions={space.sessions}
          pinned={pinnedRef(props.route)}
          onPin={props.onPin}
        />
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          aria-label="Choose files"
          data-testid="file-picker"
          onChange={(event) => {
            staged.add(event.target.files ?? []);
            event.target.value = "";
          }}
        />
        {staged.staged.some((item) => carriesLocation(item.file)) && (
          <label className="keep-location" data-testid="keep-location">
            <input
              type="checkbox"
              checked={staged.keepLocation}
              onChange={(event) => staged.setKeepLocation(event.target.checked)}
            />
            Keep location
          </label>
        )}
        {voice.recorder}
        {props.model !== undefined && props.onSpace !== undefined && (
          <AgentNotice
            space={space}
            directory={directory}
            model={props.model}
            selfId={selfId}
            onMove={props.onSpace.move}
            onFork={props.onSpace.fork}
          />
        )}
        <PausedBanner words={paused} onExchange={props.onExchange} />
        <UndoPill undoing={undoing} onUndo={undo} onGone={undone} />
        <BackPill back={replying.back} onBack={replying.goBack} />
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={send}
          canSendEmpty={!uploading && staged.staged.some((item) => item.status === "ready")}
          onAttach={() => picker.current?.click()}
          {...voice.composer}
          attachments={staged.staged.map((item) => chipOf(item, () => staged.remove(item.localId)))}
          label={`Message ${fieldName(aim, space, directory, selfId)}`}
          placeholder={placeholderOf(steering, aim, space, directory, narrow)}
          lead={address.lead}
          above={aboveWords(address.above, answering, space, directory, selfId)}
          onEscape={answering.escape}
          inputRef={field}
          chips={[
            {
              id: "steer",
              label: "Steer",
              icon: "bolt",
              active: steering,
              onClick: () => setSteering((on) => live && !on),
            },
          ]}
        />
      </main>
    </ViewerHost>
  );
}

/**
 * The banner above the field while Chips holds the agents' messages to each other (ADR 0097), or
 * holds the agents at the room's spend ceiling (ADR 0118), with *Let them carry on*. It stays
 * until a person acts.
 */
function PausedBanner(props: {
  readonly words: string | undefined;
  readonly onExchange?: ((state: "paused" | "going") => void) | undefined;
}) {
  if (props.words === undefined) return null;
  return (
    <div className="paused-banner" role="status" data-testid="paused-banner">
      <span>{props.words}</span>
      {props.onExchange !== undefined && (
        <button type="button" className="btn" onClick={() => props.onExchange?.("going")}>
          Let them carry on
        </button>
      )}
    </div>
  );
}

/**
 * An agent in the room (ADR 0087) — or a harness from before one took its place — by the
 * directory, or by its id's prefix when the directory has not caught up.
 */
function isHarness(directory: Directory, id: string): boolean {
  return isAgent(directory, id);
}

/**
 * The rows in the windowed list: each line drawn as itself, or a run of harness-to-harness
 * lines as one fold the reader can open. The folds opened live here, so opening one does not
 * re-render the whole space.
 */
function Rows(props: {
  readonly rows: readonly Row[];
  /** Pause the agents, or let them carry on, from the referee's line (ADR 0097). */
  readonly onExchange?: ((state: "paused" | "going") => void) | undefined;
  readonly scroller: RefObject<HTMLDivElement | null>;
  readonly space: Space;
  readonly lanes: readonly Lane[];
  readonly faces: Faces | undefined;
  readonly directory: Directory;
  readonly selfId: string;
  readonly files: FileService;
  readonly receipts: ReadonlyMap<string, "queued" | "steered">;
  readonly unsentNotes: ReadonlyMap<string, UnsentNote> | undefined;
  /** Lines with feedback on its way, among the rest of what is busy. */
  readonly busy: ReadonlySet<string>;
  readonly onFeedback: OnFeedback | undefined;
  readonly onOpenAgent: ((agentId: string) => void) | undefined;
  readonly onStopLane: ((lane: Lane) => void) | undefined;
  readonly onLine: LineHandlers | undefined;
  readonly standing: Standing | undefined;
  readonly focus: LineFocus | undefined;
  readonly marking: Marking | undefined;
  /** Goes to the message a reply quotes, and to a reply from the mark under its message (ADR 0219). */
  readonly onQuote: (reply: Line, quoted: string, mine: boolean) => void;
  readonly onReplies: (reply: string) => void;
  /** Starts a reply to a line, from its Reply (ADR 0219). */
  /** Open a change to the room's project, from under the reply that made it (ADR 0222). */
  readonly onChange?: ((commit: string) => void) | undefined;
  readonly onReply: (line: Line) => void;
  readonly offline: boolean;
  readonly onDiscard: ((key: string) => void) | undefined;
  /** The workspace, for who may ask again for a copy that wasn't made (ADR 0087, Fork). */
  readonly model?: WorkspaceModel | undefined;
  readonly onFork?: ((agentId: string) => Promise<void>) | undefined;
  /** Ask again for a new agent that wasn't made (ADR 0108). */
  readonly onAsk?: ((harnessId: string, name: string) => Promise<void>) | undefined;
}) {
  const { space, directory, focus } = props;
  // Which folds the reader has opened, by the first line's id.
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set());
  // Where people's messages went, drawn over the ones where that changed (ADR 0081): read once
  // for the room, not once a row.
  const routes = useMemo(() => routeMarks(space, directory), [space, directory]);
  const runs = new Map(space.runs.map((each) => [each.runId, each]));
  const pinned = new Set(space.pins.map((pin) => pin.lineId));
  const { onLine, standing } = props;
  // Whether the room has an agent in it, which has read a message already and keeps what it read:
  // the question before a deletion for everyone says so (ADR 0167). One object for the room.
  const agents = harnessesIn(space, directory).length > 0;
  const asking = useMemo(() => deleteForEveryoneAsking(agents), [agents]);
  const actionsFor = (line: Line): RowActions | undefined =>
    onLine === undefined || standing === undefined
      ? undefined
      : {
          spaceId: space.id,
          may: mayFor(line, props.selfId, standing, space.parentSpaceId !== undefined),
          pinned: pinned.has(line.id),
          on: onLine,
          asking,
        };
  const focusIndex =
    focus === undefined
      ? -1
      : props.rows.findIndex((row) =>
          row.kind === "line"
            ? row.line.id === focus.lineId
            : row.lines.some((line) => line.id === focus.lineId),
        );
  // A route or task line is drawn from its lane, looked up by id, rather than from its text.
  const lanes = new Map(props.lanes.map((lane) => [lane.laneId, lane]));
  // Which visit a line came from is only worth saying when there is more than one to tell apart.
  const manySessions = space.sessions.length > 1;
  // And whose line it is is only worth saying once a third participant makes it a question.
  const named = namesAuthors(space);
  const sessionsByRef = new Map(space.sessions.map((session) => [session.sessionRef, session]));
  const model = props.model;
  // The words a search looked for, in the line it landed on, while they are marked.
  const marksOn = (line: Line) =>
    props.marking?.lineId === line.id ? props.marking.terms : undefined;
  const draw = (line: Line) =>
    line.fork !== undefined && model !== undefined ? (
      <ForkLine
        key={line.id}
        line={line}
        space={space}
        model={model}
        directory={directory}
        selfId={props.selfId}
        onFork={props.onFork}
      />
    ) : line.newAgent !== undefined && model !== undefined ? (
      <NewAgentLine
        key={line.id}
        line={line}
        space={space}
        model={model}
        directory={directory}
        selfId={props.selfId}
        onAsk={props.onAsk}
      />
    ) : (
      <SpaceRow
        key={line.id}
        line={line}
        lane={line.laneId === undefined ? undefined : lanes.get(line.laneId)}
        faces={props.faces}
        directory={directory}
        selfId={props.selfId}
        files={props.files}
        receipts={props.receipts}
        runs={runs}
        sessions={sessionsByRef}
        manySessions={manySessions}
        named={named}
        route={routes.get(line.id)}
        busy={props.busy.has(line.id)}
        unsent={props.unsentNotes?.get(line.id)}
        onFeedback={props.onFeedback}
        onOpenAgent={props.onOpenAgent}
        onStopLane={props.onStopLane}
        actions={actionsFor(line)}
        focused={focus?.lineId === line.id}
        marks={marksOn(line)}
        offline={props.offline}
        onDiscard={props.onDiscard}
        reply={replyOf(space, line, directory)}
        replies={repliesTo(space, line)}
        onQuote={props.onQuote}
        onReplies={props.onReplies}
        onReply={props.onReply}
        {...changeOfLine(space, line)}
        onChange={props.onChange}
      />
    );
  // What the room says under a message an agent hasn't picked up (ADR 0083), row by row.
  return (
    <WaitsProvider space={space} directory={directory}>
      <MessageList
        items={props.rows}
        scroller={props.scroller}
        {...(focus !== undefined && focusIndex >= 0
          ? { focus: { index: focusIndex, nonce: focus.nonce } satisfies Focus }
          : {})}
        row={(item) =>
          item.kind === "line" ? (
            draw(item.line)
          ) : (
            <Chatter
              key={item.id}
              lines={item.lines}
              guard={item.guard}
              onExchange={props.onExchange}
              directory={directory}
              open={unfolded.has(item.id)}
              onToggle={() => setUnfolded((was) => toggled(was, item.id))}
              draw={draw}
            />
          )
        }
      />
    </WaitsProvider>
  );
}

/**
 * A row of the list: one line, or a run of harness-to-harness lines folded into one (M3.3), with
 * the referee's words under it once the talk is worth one (ADR 0097).
 */
type Row =
  | { readonly kind: "line"; readonly line: Line }
  | {
      readonly kind: "chatter";
      readonly id: string;
      readonly lines: readonly Line[];
      readonly guard?: ExchangeLine | undefined;
    };

/**
 * Consecutive harness-to-harness lines become one row — collapsed by default, always one tap
 * from inspectable, never gone (blueprint, the eleven calls) — so a room with two harnesses in
 * it reads as what they told the people, with their exchange behind a fold. A line Chips held
 * is theirs too, and the fold carries the referee's line (core's `exchangeLine`), as of its
 * newest line, so it grows as they go on.
 */
function rowsOf(
  space: Space,
  lines: readonly Line[],
  directory: Directory,
  limits: ExchangeLimits | undefined,
): Row[] {
  const rows: Row[] = [];
  for (const line of lines) {
    if (betweenHarnesses(line, (id) => isHarness(directory, id))) {
      foldInto(rows, line, refereeAt(space, line, directory, limits));
    } else {
      rows.push({ kind: "line", line });
    }
  }
  return rows;
}

/** A line of the agents' talk, into the fold the rows end with, or a new one. */
function foldInto(rows: Row[], line: Line, referee: ExchangeLine | undefined): void {
  const last = rows.at(-1);
  const fold = last?.kind === "chatter" ? last : undefined;
  const guard = referee ?? fold?.guard;
  const folded = {
    kind: "chatter" as const,
    id: fold?.id ?? line.id,
    lines: [...(fold?.lines ?? []), line],
    ...(guard === undefined ? {} : { guard }),
  };
  if (fold === undefined) rows.push(folded);
  else rows[rows.length - 1] = folded;
}

/**
 * The referee's line as of this line, once the talk is worth one (ADR 0097), at the workspace's
 * stop (ADR 0187).
 */
function refereeAt(
  space: Space,
  line: Line,
  directory: Directory,
  limits: ExchangeLimits | undefined,
): ExchangeLine | undefined {
  const at = space.lines.findIndex((each) => each.id === line.id);
  return at < 0 ? undefined : exchangeLine(space, at, directory, limits);
}

/**
 * Where a person's message went, drawn over it where that changed (ADR 0081, A2): core's
 * `routesIn`, with the "to" in the capsule's words for the route's name, and the room's lead for
 * the list a click on it opens (ADR 0113).
 */
function routeMarks(space: Space, directory: Directory): ReadonlyMap<string, RouteMark> {
  const marks = new Map<string, RouteMark>();
  const lead = space.home === true ? undefined : roomLeadOf(space);
  for (const [lineId, trail] of routesIn(space, directory)) {
    marks.set(lineId, {
      ...trail,
      words: sentToWords(trail, space, directory),
      ...(lead === undefined ? {} : { lead }),
    });
  }
  return marks;
}

/** Whether two routes draw the same: the fold makes new ones every snapshot. */
function sameRoute(a: RouteMark | undefined, b: RouteMark | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return (
    a.from === b.from &&
    a.words === b.words &&
    a.lead === b.lead &&
    a.to.join(",") === b.to.join(",")
  );
}

function toggled(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * Who a fold's harnesses were talking to: each line's author and whom Chips addressed it to, or,
 * for a line from before Chips said so, whom it named (ADR 0081). In the order they came in.
 */
function talkersIn(lines: readonly Line[]): string[] {
  return [
    ...new Set(
      lines.flatMap((line) => [line.authorId, ...(line.addressedTo ?? line.mentions ?? [])]),
    ),
  ];
}

/** "A", "A and B", "A, B and C". */
function listed(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * The fold: who was talking to whom — their faces with a two-way arrow, as the lane's route
 * draws a hop (ADR 0081) — how much, and the latest line under it, with a click to see it all.
 * The referee's line sits under it, in the margin, once the talk is worth one: drawn from the
 * lines, so a replay draws it in the same place, and never a message of its own. At the warning
 * it offers *Let them carry on* and *Pause them*.
 */
function Chatter(props: {
  readonly lines: readonly Line[];
  readonly guard: ExchangeLine | undefined;
  readonly onExchange?: ((state: "paused" | "going") => void) | undefined;
  readonly directory: Directory;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly draw: (line: Line) => ReactNode;
}) {
  const { lines, directory } = props;
  const talkers = talkersIn(lines);
  const [first, ...rest] = talkers;
  const names = listed(talkers.map((id) => nameOf(directory, id)));
  const count = `${lines.length} ${lines.length === 1 ? "message" : "messages"}`;
  const latest = lines.at(-1);
  return (
    <div className="chatter" data-testid="chatter" data-open={props.open ? "true" : undefined}>
      <div className="chatter-fold">
        <button
          type="button"
          className="chatter-toggle"
          aria-expanded={props.open}
          aria-label={`${names} · ${count}`}
          onClick={props.onToggle}
        >
          <span className="chatter-between" aria-hidden="true">
            {first !== undefined && <FaceGroup faces={facesOf([first], directory)} small />}
            {rest.length > 0 && <span className="chatter-arrow">⇄</span>}
            {rest.length > 0 && <FaceGroup faces={facesOf(rest, directory)} small />}
          </span>
          <span className="chatter-count">{count}</span>
          <Icon name="down" size={12} className="chatter-chevron" />
        </button>
        {!props.open && latest !== undefined && (
          <p className="chatter-latest" data-testid="chatter-latest">
            <b>{nameOf(directory, latest.authorId)}</b> {plainWords(latest.text)}
          </p>
        )}
        {props.open && <div className="chatter-lines">{lines.map((line) => props.draw(line))}</div>}
      </div>
      {props.guard !== undefined && (
        <div className="sys exchange-line" data-testid="guard" data-stage={props.guard.stage}>
          <span>{props.guard.text}</span>
          {props.guard.stage === "warning" && props.onExchange !== undefined && (
            <span className="exchange-taps">
              <button type="button" className="btn" onClick={() => props.onExchange?.("going")}>
                Let them carry on
              </button>
              <button type="button" className="btn" onClick={() => props.onExchange?.("paused")}>
                Pause them
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The visits to this space, live ones first (ADR 0024). A space is a worktree and outlives the
 * terminals opened in it, so this is the one place that says how many there are and whether
 * anybody is at them — which is also what decides where a message typed below will go.
 */
function SessionStrip(props: { readonly sessions: readonly Session[]; readonly now: number }) {
  return (
    <div className="sessions" data-testid="sessions">
      {props.sessions.map((session) => (
        <span
          key={session.sessionRef}
          className="session"
          data-live={session.live ? "true" : undefined}
          title={session.sessionRef}
        >
          <i className="session-dot" aria-hidden="true" />
          {calledIn(session)}
          <span className="session-when">
            {session.live
              ? "live"
              : session.endedAt === undefined
                ? "ended"
                : `ended ${relativeTime(session.endedAt, props.now)} ago`}
          </span>
        </span>
      ))}
    </div>
  );
}

/** `scout:02e79313-8f1a-…` reads as `02e7931`: enough to tell two visits apart. */
function shortRef(sessionRef: string): string {
  const tail = sessionRef.slice(sessionRef.lastIndexOf(":") + 1);
  return tail.length > 8 ? tail.slice(0, 7) : tail;
}

/**
 * What to call a visit on screen (ADR 0040): the name its harness gives it, else where it is
 * running, else the short ref. A harness that names none, or has not named this one yet, is why
 * the last two are still here.
 */
function calledIn(session: Session): string {
  return session.title ?? session.where ?? shortRef(session.sessionRef);
}

/**
 * Which visit a line came from: the one its message named, when the sender pinned one, else the
 * one its run belongs to. The second is all there was until ADR 0040, and it is why a person's
 * own message went unlabelled — only a harness's line carries a run.
 */
function sessionTagOf(
  line: Line,
  runs: ReadonlyMap<string, Run>,
  sessions: ReadonlyMap<string, Session>,
): string | undefined {
  const ref = line.sessionRef ?? runs.get(line.runId ?? "")?.sessionRef;
  if (ref === undefined) return undefined;
  const session = sessions.get(ref);
  return session === undefined ? shortRef(ref) : calledIn(session);
}

/**
 * What the composer promises, in one line, before anything is sent. The rule is the harness's
 * own — a live session is reached where it is, a closed one is started again where it left off
 * — so this and the bridge are saying the same sentence.
 */
function routeWords(route: MessageRoute, name: (harnessId: string) => string): string {
  if (route.how === "chat") return "";
  if (route.how === "nowhere") {
    return `${name(route.harnessId)} has no session here. Open a terminal in its worktree; a message here has nowhere to go.`;
  }
  // A pin that names a visit this space no longer has: nothing is sent, and it says so rather
  // than quietly going to another terminal (ADR 0040).
  if (route.how === "gone") {
    return "The session you pinned has gone. Pick another below, or let it go.";
  }
  if (route.how === "live") {
    return route.pinned
      ? `Pinned to ${calledIn(route.session)} — this goes to it, and stays there.`
      : `A session is open here${where(route.session)} — this goes to it.`;
  }
  return route.pinned
    ? `The session you pinned, ${calledIn(route.session)}, has ended — this starts it again, where it left off.`
    : `No session is open${where(route.session)} — this starts the last one again, where it left off.`;
}

/** The visit the route says is pinned, or nothing when the harness is choosing. */
function pinnedRef(route: MessageRoute | undefined): string | undefined {
  if (route === undefined) return undefined;
  if (route.how === "gone") return route.sessionRef;
  if (route.how === "live" || route.how === "resume") {
    return route.pinned ? route.session.sessionRef : undefined;
  }
  return undefined;
}

/**
 * Which visit a message goes to, when there is more than one to choose between (ADR 0040).
 * Auto is the default and is what a space has always done — whichever spoke last — so a person
 * with one terminal never sees this at all.
 */
function SessionPicker(props: {
  readonly sessions: readonly Session[];
  readonly pinned: string | undefined;
  readonly onPin: ((sessionRef: string | undefined) => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const onPin = props.onPin;
  const chosen = props.sessions.find((each) => each.sessionRef === props.pinned);
  const label =
    props.pinned === undefined
      ? "Auto"
      : chosen === undefined
        ? shortRef(props.pinned)
        : calledIn(chosen);
  const choose = (sessionRef: string | undefined) => {
    onPin?.(sessionRef);
    setOpen(false);
  };
  // Offered only where there is a choice to make: with one visit there is nothing to pick.
  if (onPin === undefined || props.sessions.length < 2) return null;
  return (
    <div className="pick" data-testid="session-picker">
      {open && (
        <div className="pick-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => choose(undefined)}>
            Auto — whichever spoke last
          </button>
          {props.sessions.map((session) => (
            <button
              key={session.sessionRef}
              type="button"
              role="menuitem"
              data-live={session.live ? "true" : undefined}
              data-pinned={session.sessionRef === props.pinned ? "true" : undefined}
              onClick={() => choose(session.sessionRef)}
            >
              <i className="session-dot" aria-hidden="true" />
              {calledIn(session)}
              <span className="session-when">{session.live ? "live" : "ended"}</span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="pick-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Which session a message goes to"
        onClick={() => setOpen((was) => !was)}
      >
        {label}
      </button>
    </div>
  );
}

function where(session: Session): string {
  return session.where === undefined ? "" : ` in ${session.where}`;
}

/** A staged file as a chip: its name, and where its upload has got to. */
function chipOf(item: Staged, onRemove: () => void) {
  const kind = kindOf(item.attachment?.mimeType ?? item.file.type);
  return { id: item.localId, name: item.file.name, meta: metaOf(item, kind), kind, onRemove };
}

/**
 * What a chip says under its name. A file that goes up in one piece says it is uploading; a longer
 * one says how far it got. Sound says it is being written down too, because the server hears it
 * before the upload answers (ADR 0054), and once in, how long it runs.
 */
function metaOf(item: Staged, kind: ReturnType<typeof kindOf>): string {
  if (item.status === "failed") return `failed · ${item.error ?? "try again"}`;
  if (item.status === "uploading") {
    const progress = item.progress ?? 0;
    if (progress > 0 && progress < 1) return `uploading… ${Math.floor(progress * 100)}%`;
    return kind === "audio" ? "uploading and transcribing…" : "uploading…";
  }
  const durationMs = item.attachment?.durationMs;
  if (kind === "audio" && durationMs !== undefined) return formatDuration(durationMs);
  return formatBytes(item.attachment?.byteSize ?? item.file.size);
}

/**
 * Everything above the messages: the header, the room sheet while it is up (M3.3, ADR 0151), a
 * word when the room is closed, and the session strip for a harness that works by visits.
 */
function Top(props: {
  readonly space: Space;
  readonly directory: Directory;
  readonly selfId: string;
  readonly connection: ConnectionState;
  readonly link?: LinkKind | undefined;
  readonly actions: SpaceActions | undefined;
  readonly now: number;
  readonly model?: WorkspaceModel | undefined;
  readonly files: FileService;
  /** The room's lanes, whose files the sheet's Media & files shows (ADR 0202). */
  readonly lanes: readonly Lane[] | undefined;
  /** The face the person chose for the room, which the sheet's head wears. */
  readonly icon: SpaceIcon | undefined;
  /** An agent's row in the sheet: its page (ADR 0111's addendum). */
  readonly onOpenAgent?: ((agentId: string) => void) | undefined;
  readonly sheet: RoomSheetState;
}) {
  const { space, directory, sheet } = props;
  const title = spaceTitle(space, directory, props.selfId);
  return (
    <>
      <Header
        space={space}
        directory={directory}
        selfId={props.selfId}
        connection={props.connection}
        link={props.link}
        sheetOpen={sheet.open !== undefined}
        onSheet={props.actions === undefined ? undefined : sheet.show}
        onUniverse={props.actions === undefined ? undefined : sheet.showUniverse}
        titleRef={sheet.titleRef}
      />
      {sheet.open !== undefined && props.actions !== undefined && (
        <RoomSheet
          // Keyed by the room and the opening: a page begun in one is not carried into the next.
          key={`${space.id}:${sheet.open.n}`}
          space={space}
          title={title}
          directory={directory}
          selfId={props.selfId}
          actions={props.actions}
          model={props.model}
          files={props.files}
          lanes={props.lanes}
          icon={props.icon}
          onOpenAgent={props.onOpenAgent}
          from={sheet.open.from}
          opensOn={sheet.open.on}
          opensChange={sheet.open.change}
          onGone={sheet.gone}
        />
      )}
      {space.state === "closed" && (
        <p className="conv-closed" data-testid="archived">
          This space is archived. Its history stays; unarchive it from its details to carry on.
        </p>
      )}
      {space.sessions.length > 0 && <SessionStrip sessions={space.sessions} now={props.now} />}
    </>
  );
}

/**
 * What the pill says about a connection that is not open. `asleep` is the one that is not about
 * the socket at all: the relay answered and has no server of this key registered, which means
 * the machine Chips runs on is off. Reconnecting is what the client is doing; it is not what the
 * person should do (M4.2 scope change, 6 September 2026).
 */
function connectionWords(connection: ConnectionState): string {
  if (connection === "asleep") return "Your server is not reachable — it may be asleep";
  return connection === "connecting" ? "Connecting…" : "Reconnecting…";
}

/**
 * The room's header, as the phone's bar reads (ADR 0151): its face, its name, which opens the room's
 * sheet as the phone's capsule does, the line under it (core's `spaceSubtitle`) and how many of its
 * agents can't answer; at the right, for a room with a project, Universe's four rings, which open
 * the sheet on Universe (ADR 0227), who is here, which opens the same sheet, and the connection
 * when it is not plainly open. No run state: the thinking bubble says what is going on, and the
 * reply that it finished (ADR 0050). Until 11 October 2026 it said Done in a green pill, whose
 * harness it was and how much rope it had, and how full the run's context was.
 */
function Header(props: {
  readonly space: Space;
  readonly directory: Directory;
  readonly selfId: string;
  readonly connection: ConnectionState;
  readonly link?: LinkKind | undefined;
  readonly sheetOpen: boolean;
  /** Opens the room's sheet from what was clicked; absent where the room offers nothing to do. */
  readonly onSheet?: ((from: HTMLElement) => void) | undefined;
  /** Opens it on Universe: what the space made, to read and to run (ADR 0227). */
  readonly onUniverse?: ((from: HTMLElement) => void) | undefined;
  readonly titleRef: RefObject<HTMLButtonElement | null>;
}) {
  const { space, directory, connection, onSheet } = props;
  const count = space.members.length;
  const run = space.run;
  const name = spaceTitle(space, directory, props.selfId);
  // How many of its agents can't answer now, in amber under the name (ADR 0083).
  const warning = cantAnswerWords(cantAnswerIn(space, directory).length);
  const live = run === undefined ? undefined : LIVE_STATUS[run.state];
  return (
    <header className="conv-h">
      {run !== undefined ? (
        <Avatar
          name={nameOf(directory, run.harnessId)}
          kind={faceKind(directory, run.harnessId) === "agent" ? "agent" : "harness"}
          icon={agentFace(directory, run.harnessId)}
          {...(live === undefined ? {} : { status: live })}
        />
      ) : (
        <Avatar name={name} />
      )}
      <div className="conv-h-t">
        <h1>
          {onSheet === undefined ? (
            name
          ) : (
            <button
              ref={props.titleRef}
              type="button"
              className="conv-h-name"
              aria-haspopup="dialog"
              aria-expanded={props.sheetOpen}
              data-testid="room-title"
              onClick={(event) => onSheet(event.currentTarget)}
            >
              {name}
              <Icon name="down" size={12} />
            </button>
          )}
        </h1>
        <HeaderSub sub={spaceSubtitle(space, directory)} warning={warning} />
      </div>
      <div className="conv-h-r">
        {space.project !== undefined && props.onUniverse !== undefined && (
          <button
            type="button"
            className="conv-members conv-universe"
            data-testid="room-universe-button"
            aria-label="Universe"
            title="Universe"
            aria-haspopup="dialog"
            onClick={(event) => props.onUniverse?.(event.currentTarget)}
          >
            <UniverseMark size={20} />
          </button>
        )}
        <button
          type="button"
          className="conv-members"
          data-testid="members"
          aria-label="Members"
          aria-haspopup="dialog"
          aria-expanded={props.sheetOpen}
          disabled={onSheet === undefined}
          onClick={(event) => onSheet?.(event.currentTarget)}
        >
          <Icon name="people" size={14} />
          {count} {count === 1 ? "member" : "members"}
        </button>
        <Reach connection={connection} link={props.link} />
      </div>
    </header>
  );
}

/** The line under the room's name: who does the work, and how many of its agents can't answer. */
function HeaderSub(props: {
  readonly sub: string | undefined;
  readonly warning: string | undefined;
}) {
  const { sub, warning } = props;
  if (sub === undefined && warning === undefined) return null;
  return (
    <span className="conv-h-sub">
      {sub}
      {sub !== undefined && warning !== undefined && " · "}
      {warning !== undefined && (
        <span className="conv-h-warn" data-testid="cant-answer">
          {warning}
        </span>
      )}
    </span>
  );
}

/** The connection, when it is not plainly open: reconnecting, asleep, or by way of the relay. */
function Reach(props: {
  readonly connection: ConnectionState;
  readonly link?: LinkKind | undefined;
}) {
  const { connection } = props;
  if (connection !== "open") {
    return (
      <Pill
        tone="amber"
        dot="hollow"
        title={
          connection === "asleep"
            ? "The relay is up and your server is not registered with it: the machine Chips runs on is off or asleep. Messages you send will go when it is back."
            : "Messages you send will go when it is back"
        }
      >
        <span data-testid="connection">{connectionWords(connection)}</span>
      </Pill>
    );
  }
  if (props.link !== "relay") return null;
  return (
    <Pill
      tone="neutral"
      dot="solid"
      title="This network cannot reach the server, so everything goes through the relay, encrypted end to end"
    >
      <span data-testid="link">via relay</span>
    </Pill>
  );
}

interface MessageRowProps {
  readonly line: Line;
  readonly directory: Directory;
  readonly selfId: string;
  readonly files: FileService;
  /** Nothing can leave the browser right now, so a line of mine is held rather than in flight. */
  readonly offline: boolean;
  /** Take back a held message, by its key. Absent where a room offers nothing to be done. */
  readonly onDiscard?: ((key: string) => void) | undefined;
  /** What Chips did with this line, when it was sent mid-run. */
  readonly receipt?: "queued" | "steered" | undefined;
  /** The run a summary or status line closes, for the receipt drawn beneath it. */
  readonly run?: Run | undefined;
  /** Which visit this line came from, when the space has more than one to tell apart. */
  readonly sessionTag?: string | undefined;
  /** Whether this room names the author on the bubble: true once a third participant is in it. */
  readonly named?: boolean | undefined;
  /** Where a person's message went, when that changed with it (ADR 0081), drawn over it. */
  readonly route?: RouteMark | undefined;
  /** Feedback on this line is on its way (M3.4). */
  readonly busy?: boolean | undefined;
  /** The reader's Not right? on this line, turned away by the server: said under it (PM-4). */
  readonly unsent?: UnsentNote | undefined;
  /** A thumb or a note on this line, when the row may offer one. */
  readonly onFeedback?: OnFeedback | undefined;
  /** Opens an agent's page from a line about it: a compaction's (ADR 0146). */
  readonly onOpenAgent?: ((agentId: string) => void) | undefined;
  /** What may be done to this line (M5.4), when the room offers it. */
  readonly actions?: RowActions | undefined;
  /** The line a jump landed on. */
  readonly focused?: boolean | undefined;
  /** What a search looked for, marked in the words while they are (ADR 0133). */
  readonly marks?: readonly string[] | undefined;
  /** The card of the message this one replies to (ADR 0219), quoted above its words. */
  readonly reply?: ReplyCardModel | undefined;
  /** The replies to this line the reader has, oldest first, said under it. */
  readonly replies?: readonly string[] | undefined;
  readonly onQuote?: ((reply: Line, quoted: string, mine: boolean) => void) | undefined;
  readonly onReplies?: ((reply: string) => void) | undefined;
  /** "2 files changed", for a reply that carries a change to the room's project (ADR 0222). */
  readonly changeWords?: string | undefined;
  /** Whether that change was undone. */
  readonly changeUndone?: boolean | undefined;
  /** Open a change, from under the reply that made it. */
  readonly onChange?: ((commit: string) => void) | undefined;
  /** Starts a reply to this line, where the room takes replies (ADR 0219). */
  readonly onReply?: ((line: Line) => void) | undefined;
}

/** The bar under a bubble: where the line is, what may be done to it, and by whom. */
interface RowActions {
  readonly spaceId: string;
  readonly may: LineMay;
  readonly pinned: boolean;
  readonly on: LineHandlers;
  /** What is asked before a deletion for everyone, the same for every row in the room. */
  readonly asking: Asking;
}

const MODE_LABEL = { steer: "Steer", followup: "Follow-up", interrupt: "Interrupt" } as const;

/**
 * One message. Memoised on what it shows rather than on the `line` object, because the fold
 * makes a new object for every line on every snapshot: without this, each snapshot in a burst
 * re-rendered — and re-parsed the Markdown of — every row in the space. A run under a
 * summary is final, so its identity and state are enough.
 */
const MessageRow = memo(
  function MessageRow(props: MessageRowProps) {
    return <MessageRowBody {...props} />;
  },
  (previous, next) =>
    previous.line.id === next.line.id &&
    previous.line.text === next.line.text &&
    previous.line.pending === next.line.pending &&
    previous.line.failed === next.line.failed &&
    previous.line.ts === next.line.ts &&
    previous.sessionTag === next.sessionTag &&
    previous.named === next.named &&
    sameRoute(previous.route, next.route) &&
    attachmentKey(previous.line) === attachmentKey(next.line) &&
    previous.receipt === next.receipt &&
    previous.run?.runId === next.run?.runId &&
    previous.run?.state === next.run?.state &&
    previous.run?.costUsd === next.run?.costUsd &&
    previous.line.reactions === next.line.reactions &&
    previous.line.corrections === next.line.corrections &&
    previous.line.heardBy === next.line.heardBy &&
    previous.line.editedAt === next.line.editedAt &&
    previous.line.deleted === next.line.deleted &&
    previous.busy === next.busy &&
    previous.unsent === next.unsent &&
    previous.onFeedback === next.onFeedback &&
    previous.onOpenAgent === next.onOpenAgent &&
    previous.actions?.pinned === next.actions?.pinned &&
    previous.actions?.on === next.actions?.on &&
    previous.actions?.asking === next.actions?.asking &&
    sameMay(previous.actions?.may, next.actions?.may) &&
    previous.focused === next.focused &&
    previous.marks === next.marks &&
    cardKey(previous.reply) === cardKey(next.reply) &&
    (previous.replies ?? []).join() === (next.replies ?? []).join() &&
    previous.onQuote === next.onQuote &&
    previous.onReplies === next.onReplies &&
    previous.onReply === next.onReply &&
    previous.directory === next.directory &&
    previous.selfId === next.selfId,
);

/** The card of the message a line replies to (ADR 0219), as the room has that message now. */
function replyOf(space: Space, line: Line, directory: Directory): ReplyCardModel | undefined {
  return line.replyTo === undefined ? undefined : replyCard(space, line, directory, Date.now());
}

/** What a reply's card draws, as one string: a new card object each snapshot says nothing. */
function cardKey(card: ReplyCardModel | undefined): string {
  if (card === undefined) return "";
  const photo = card.holds?.kind === "photo" ? card.holds.attachment.id : "";
  return [card.state, card.name, card.day, card.words, photo].join("\u0000");
}

/** The fold makes a new array per snapshot; the ids say whether the files changed. */
function attachmentKey(line: Line): string {
  return line.attachments?.map((attachment) => attachment.id).join(",") ?? "";
}

/**
 * One row in a space: a lane's route or task card when the line is one and its lane is known,
 * and an ordinary message otherwise. The branch lives here rather than in the list's callback so
 * the space view stays legible.
 */
function SpaceRow(props: {
  readonly line: Line;
  readonly lane: Lane | undefined;
  readonly faces: Faces | undefined;
  readonly directory: Directory;
  readonly selfId: string;
  readonly files: FileService;
  readonly receipts: ReadonlyMap<string, "queued" | "steered">;
  readonly runs: ReadonlyMap<string, Run>;
  /** The visits this space has, so a line's tag can say what its terminal is called. */
  readonly sessions: ReadonlyMap<string, Session>;
  readonly manySessions: boolean;
  /** Whether this room's bubbles wear their author's name (core's `namesAuthors`). */
  readonly named: boolean;
  /** The route over this line, when it is a person's message whose address changed. */
  readonly route: RouteMark | undefined;
  readonly busy: boolean;
  readonly unsent?: UnsentNote | undefined;
  readonly onFeedback: OnFeedback | undefined;
  readonly onOpenAgent?: ((agentId: string) => void) | undefined;
  readonly onStopLane: ((lane: Lane) => void) | undefined;
  readonly actions: RowActions | undefined;
  readonly focused: boolean;
  readonly marks?: readonly string[] | undefined;
  readonly offline: boolean;
  readonly onDiscard: ((key: string) => void) | undefined;
  readonly reply?: ReplyCardModel | undefined;
  readonly replies?: readonly string[] | undefined;
  readonly onQuote?: ((reply: Line, quoted: string, mine: boolean) => void) | undefined;
  readonly onReplies?: ((reply: string) => void) | undefined;
  /** "2 files changed", for a reply that carries a change to the room's project (ADR 0222). */
  readonly changeWords?: string | undefined;
  /** Whether that change was undone. */
  readonly changeUndone?: boolean | undefined;
  /** Open a change, from under the reply that made it. */
  readonly onChange?: ((commit: string) => void) | undefined;
  readonly onReply?: ((line: Line) => void) | undefined;
}) {
  const { line, lane, directory } = props;
  if (line.kind === "route" && lane !== undefined)
    return (
      <LaneRoute
        lane={lane}
        lineId={line.id}
        directory={directory}
        faces={props.faces}
        onStop={props.onStopLane}
        files={props.files}
      />
    );
  if (line.kind === "task" && lane !== undefined)
    return <LaneTask lane={lane} directory={directory} faces={props.faces} />;
  return (
    <MessageRow
      line={line}
      directory={directory}
      selfId={props.selfId}
      files={props.files}
      offline={props.offline}
      onDiscard={props.onDiscard}
      {...(line.key === undefined ? {} : { receipt: props.receipts.get(line.key) })}
      {...(line.runId === undefined ? {} : { run: props.runs.get(line.runId) })}
      {...(props.manySessions
        ? { sessionTag: sessionTagOf(line, props.runs, props.sessions) }
        : {})}
      named={props.named}
      route={props.route}
      busy={props.busy}
      unsent={props.unsent}
      onFeedback={props.onFeedback}
      onOpenAgent={props.onOpenAgent}
      actions={props.actions}
      focused={props.focused}
      marks={props.marks}
      reply={props.reply}
      replies={props.replies}
      onQuote={props.onQuote}
      onReplies={props.onReplies}
      onReply={props.onReply}
      changeWords={props.changeWords}
      changeUndone={props.changeUndone}
      onChange={props.onChange}
    />
  );
}

/**
 * A line as its room draws it, read only: an agent's message history (ADR 0087, Phase 5) draws
 * the rooms' own rows — a bubble, a lane's card, a photo — with nothing to be done to them there.
 */
export function ReadOnlyRow(props: {
  readonly line: Line;
  readonly lane: Lane | undefined;
  readonly run: Run | undefined;
  readonly faces: Faces | undefined;
  readonly directory: Directory;
  readonly selfId: string;
  readonly files: FileService;
}) {
  const runs = useMemo(
    () => new Map(props.run === undefined ? [] : [[props.run.runId, props.run] as const]),
    [props.run],
  );
  return (
    <SpaceRow
      line={props.line}
      lane={props.lane}
      faces={props.faces}
      directory={props.directory}
      selfId={props.selfId}
      files={props.files}
      receipts={NO_RECEIPTS}
      runs={runs}
      sessions={NO_SESSIONS}
      manySessions={false}
      named
      route={undefined}
      busy={false}
      onFeedback={undefined}
      onStopLane={undefined}
      actions={undefined}
      focused={false}
      offline={false}
      onDiscard={undefined}
    />
  );
}

const NO_RECEIPTS: ReadonlyMap<string, "queued" | "steered"> = new Map();
const NO_SESSIONS: ReadonlyMap<string, Session> = new Map();

/**
 * A lane's state as the status vocabulary's word. A lane that completed says nothing, as the
 * phone's route row does (ADR 0050, ADR 0151): its reply under the card is the proof.
 */
const LANE_TO_STATUS: Readonly<Record<LaneState, HarnessStatus | undefined>> = {
  queued: "thinking",
  running: "working",
  waiting: "waiting",
  completed: undefined,
  failed: "failed",
  cancelled: "failed",
};

/** A lane participant as a trail hop: person or harness, by the directory or the id's prefix. */
/** What the specialist is called on this lane: the lead's label for it, else its own name. */
function specialistName(lane: Lane, directory: Directory): string {
  return lane.label ?? nameOf(directory, lane.specialistId);
}

/**
 * What the lead is called on this lane: the room of its own it routed from, when both ends are
 * one harness (`Lane.leadLabel`), else its own name. A Space handing down from its own room reads
 * `Chess Game → Engineer`, not `J → Engineer`.
 */
function leadName(lane: Lane, directory: Directory): string {
  return lane.leadLabel ?? nameOf(directory, lane.leadId);
}

/** The faces a person chose, by space id, as the store carries them. */
type Faces = ReadonlyMap<string, SpaceIcon>;

/**
 * The face chosen for a room, as a card's party carries it: absent when there is no room or no
 * choice, so the avatar keeps its initials. A hop is a room only where core named it after one.
 */
function faceOf(faces: Faces | undefined, spaceId: string | undefined): { icon?: SpaceIcon } {
  const icon = spaceId === undefined ? undefined : faces?.get(spaceId);
  return icon === undefined ? {} : { icon };
}

/**
 * The face beside a line: a person's, a harness's, or an agent's own (ADR 0089), its pins round its
 * body, a little dim, so it is the chip it is on the Agents page (ADR 0103).
 */
function SaidFace(props: {
  readonly name: string;
  readonly said: { readonly id: string; readonly kind: string };
  readonly directory: Directory;
}) {
  const { said, directory } = props;
  return (
    <Avatar
      name={props.name}
      kind={said.kind === "person" ? "person" : faceKind(directory, said.id)}
      icon={agentFace(directory, said.id)}
      size="xs"
      cantAnswer={cantAnswer(directory, said.id) !== undefined}
      pinsOut
    />
  );
}

/**
 * How one end of a lane is drawn: an agent in its own outline, wearing its own face when it has
 * one (ADR 0089), and otherwise the face chosen for its room, which is what a lane wore before
 * agents had faces.
 */
function endOf(
  directory: Directory,
  id: string,
  faces: Faces | undefined,
  spaceId: string | undefined,
): { kind: "person" | "harness" | "agent"; icon?: SpaceIcon } {
  const kind = faceKind(directory, id);
  const own = kind === "agent" ? agentFace(directory, id) : undefined;
  return own === undefined ? { kind, ...faceOf(faces, spaceId) } : { kind, icon: own };
}

/** The same, for a route card's party, which is never a person. */
function partyOf(
  directory: Directory,
  id: string,
  faces: Faces | undefined,
  spaceId: string | undefined,
): { kind: "harness" | "agent"; icon?: SpaceIcon } {
  const end = endOf(directory, id, faces, spaceId);
  return { ...end, kind: end.kind === "agent" ? "agent" : "harness" };
}

/** A lane still going, which a person may cancel from the route card. */
function laneLive(lane: Lane): boolean {
  return lane.state === "queued" || lane.state === "running" || lane.state === "waiting";
}

/**
 * The lead's view of a lane: the route card in the lead's chat, under the message that caused the
 * routing (blueprint, Lead and lanes). It says where the lane got to and what it cost, and
 * unfolds the specialist's reply — which the lead reads through `lane.updated`, not by being in
 * the specialist's space (ADR 0029). The reply's files come the same way and are drawn under it
 * (12 September 2026): a lane that answered with photographs used to hand back the sentence about
 * them alone. While the lane goes, a person may cancel it here (M3.5): the specialist's run
 * stops, and the lead hears the lane was cancelled and adapts.
 */
function LaneRoute({
  lane,
  lineId,
  directory,
  faces,
  onStop,
  files,
}: {
  readonly lane: Lane;
  /** The route row these files hang under: the viewer's deck reads it (`deckOf`). */
  readonly lineId: string;
  readonly directory: Directory;
  readonly faces: Faces | undefined;
  readonly onStop: ((lane: Lane) => void) | undefined;
  readonly files: FileService;
}) {
  const status = LANE_TO_STATUS[lane.state];
  const to = specialistName(lane, directory);
  return (
    <div className="lane-card" data-testid="route-card" data-lane={lane.laneId}>
      <RouteCard
        from={{
          name: leadName(lane, directory),
          ...partyOf(directory, lane.leadId, faces, lane.leadSpaceId),
        }}
        to={{
          name: to,
          ...(status === undefined ? {} : { status }),
          ...partyOf(directory, lane.specialistId, faces, lane.homeSpaceId),
        }}
        goal={lane.goal}
        {...(status === undefined ? {} : { status })}
        {...(lane.costUsd === undefined ? {} : { costUsd: lane.costUsd })}
      >
        {lane.summary !== undefined && (
          <div className="lane-reply" data-testid="lane-reply">
            <Markdown text={lane.summary} directory={directory} />
          </div>
        )}
        {lane.attachments !== undefined && lane.attachments.length > 0 && (
          <div className="lane-files" data-testid="lane-files">
            <Attachments attachments={lane.attachments} files={files} lineId={lineId} />
          </div>
        )}
        {onStop !== undefined && laneLive(lane) && lane.runId !== undefined && (
          <button
            type="button"
            className="lane-cancel"
            aria-label={`Cancel the lane to ${to}`}
            onClick={() => onStop(lane)}
          >
            Cancel
          </button>
        )}
      </RouteCard>
    </div>
  );
}

/**
 * The specialist's view of the same lane: the task card where the lane begins, with the trail
 * that led to it and the person's own words. `Arjun → Scout → Ledger` — the specialist ends the
 * trail on its own card, though a lane's trail does not name it.
 */
function LaneTask({
  lane,
  directory,
  faces,
}: {
  readonly lane: Lane;
  readonly directory: Directory;
  readonly faces: Faces | undefined;
}) {
  const trail: TrailHop[] = [
    ...lane.trail.map((hop) => ({
      name: hop.label ?? nameOf(directory, hop.participantId),
      ...endOf(directory, hop.participantId, faces, hop.spaceId),
    })),
    {
      name: specialistName(lane, directory),
      ...endOf(directory, lane.specialistId, faces, lane.homeSpaceId),
    },
  ];
  const quote = lane.trail[0]?.goal;
  return (
    <div className="lane-card" data-testid="task-card" data-lane={lane.laneId}>
      <TaskCard
        trail={trail}
        title={lane.goal}
        {...(quote === undefined ? {} : { quote })}
        {...(lane.constraints.length === 0 ? {} : { constraints: lane.constraints })}
        {...(lane.deadline === undefined ? {} : { deadline: clockTime(lane.deadline) })}
      />
    </div>
  );
}

/**
 * The runs whose cards the room draws under its lines: the newest, whose decided cards stay under
 * it until another run starts, as they always have; and any other still waiting on somebody. The
 * newest alone was drawn until 27 September 2026, so an ask one harness was waiting on went from
 * the desktop the moment another harness in the room started a run. The phone already drew every
 * run's open asks (`openAsks`).
 */
function withCards(space: Space): readonly Run[] {
  return space.runs.filter(
    (run) =>
      run.runId === space.run?.runId ||
      run.approvals.some((approval) => approval.resolved === undefined) ||
      run.questions.some((question) => question.answered === undefined),
  );
}

/**
 * What a harness is doing, while it is doing it, and gone the moment it answers.
 *
 * A harness like Jacobian makes ten tool calls to answer one question — `memory_recall`,
 * `tool_search`, six `web_search` — and none of them is the answer. Telegram's thinking bubble
 * has the shape right: it reports while the work happens and disappears before the reply lands.
 * So the calls live here while the run is going, and afterwards only in the receipt under the
 * reply, collapsed, for whoever asks (Arjun, 9 September 2026).
 *
 * A bubble from the harness at work, under its face, as the phone draws it (ADR 0147): lit dots in
 * the colour of its face, what kind of work this is and a clock on the top line, the detail under
 * it — what a call was given beside its glyph, a thought's first sentence, a tally — and from the
 * first call a strip of glyphs, a call apiece (`Doing.tsx`). Each word holds a beat before another
 * takes its place and changes by crossfading where it stands; the bubble is one width, and opens
 * once, by the strip's row. Until 10 October 2026 it was one line of text that the thought, the
 * call in hand and the reply's own first words took turns to rewrite, and it jumped. It is still a
 * status region, so a screen reader hears it change without being dragged to it.
 *
 * One for each harness still at work in the room (core's `spaceDoing`), so two harnesses working
 * at once both say so, and the one still going keeps its bubble when the other answers.
 *
 * At rest while the room is out of touch with its server — a Mac back from sleep, before it has
 * caught up — its dots unlit and its clock stopped: it says what was known when the server was last
 * heard from, and the turn may be over (the phone's `ThinkingBubble`, 14 October 2026).
 */
function Thinking({
  doing,
  directory,
  resting,
}: {
  readonly doing: Doing;
  readonly directory: Directory;
  readonly resting: boolean;
}) {
  const name = nameOf(directory, doing.harnessId);
  const says = useHeld(doing);
  const strip = useStripRow(says.calls > 0);
  return (
    <div
      className="msg doing"
      data-testid="doing"
      role="status"
      aria-live="polite"
      aria-label={`${name} · ${says.label} · ${says.detail}`}
    >
      {/* Its pins lit and still: the dots in the bubble are the one sign of the work. */}
      <SaidFace
        name={name}
        said={{ id: doing.harnessId, kind: faceKind(directory, doing.harnessId) }}
        directory={directory}
      />
      <div className="msg-body">
        <div
          className="bub doing-bub"
          data-open={strip.open ? "true" : undefined}
          data-resting={resting ? "true" : undefined}
        >
          <div className="doing-top">
            <LitDots colour={faceGround(name, agentFace(directory, doing.harnessId))} />
            <Swap id={says.label} className="doing-label">
              {says.label}
            </Swap>
            <Clock startedAt={doing.startedAt} running={!resting} />
          </div>
          <Swap
            id={`${says.kind ?? ""}\n${says.code ?? ""}\n${says.detail}`}
            className="doing-detail"
          >
            {says.kind !== undefined && <Icon name={STRIP_GLYPHS[says.kind]} size={12} />}
            <span
              className="doing-detail-words"
              data-code={says.code === true ? "true" : undefined}
              title={says.detail}
            >
              {says.detail}
            </span>
          </Swap>
          {strip.open && (
            <div className="doing-strip-row">
              <CallStrip key={doing.runId} made={doing.made} lead={strip.lead} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The receipt under a summary: what the run did, collapsed until somebody asks (blueprint). */
function RunReceipt({
  run,
  change,
}: {
  readonly run: Run;
  /** The change the reply carries (ADR 0222), ending the line. */
  readonly change?: { readonly words: string; readonly onOpen: () => void } | undefined;
}) {
  const steps: ReceiptStep[] = run.steps
    .filter((step) => step.kind !== "tick" && step.status !== "planned")
    .map((step) => ({
      id: step.stepId,
      title: step.title,
      status: step.status === "done" || step.status === "failed" ? step.status : "started",
      ...(step.source === undefined ? {} : { source: step.source }),
      ...(step.durationMs === undefined ? {} : { durationMs: step.durationMs }),
      ...(step.error === undefined ? {} : { error: step.error }),
    }));
  // A run that only answered still shows what it cost; with no cost either, there is no receipt.
  if (steps.length === 0 && run.costUsd === undefined && change === undefined) return null;
  const took =
    run.startedAt !== undefined && run.endedAt !== undefined
      ? new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime()
      : undefined;
  return (
    <div className="msg-receipt" data-testid="receipt-card">
      <Receipt
        steps={steps}
        {...(took === undefined ? {} : { durationMs: took })}
        {...(run.costUsd === undefined ? {} : { costUsd: run.costUsd })}
        change={change}
      />
    </div>
  );
}

/**
 * The lines drawn in the margin rather than in a bubble: system, checkpoint, status. An agent's
 * context compacting is one (ADR 0146), and a click on it opens the agent's page.
 */
function MarginLine({ line, directory, run, onOpenAgent }: MessageRowProps) {
  if (line.compacted !== undefined && onOpenAgent !== undefined) {
    return (
      <div className="sys">
        <button
          type="button"
          className="sys-link"
          title={`Opens ${nameOf(directory, line.authorId)}'s page`}
          onClick={() => onOpenAgent(line.authorId)}
          data-testid="compacted-line"
        >
          {nameOf(directory, line.authorId)} {line.text}
        </button>
      </div>
    );
  }
  if (line.kind === "system" && line.whole === true) {
    // Somebody coming into the room or going, said from where the reader stands (JR-5).
    return (
      <div className="sys" data-testid="people-line">
        {line.text}
      </div>
    );
  }
  if (line.kind === "system") {
    // A harness's read of a file is the one system line a reader sees: "Scout read PO-4471.pdf".
    return (
      <div className="sys" data-testid="fetch-line">
        {nameOf(directory, line.authorId)} {line.text}
      </div>
    );
  }
  if (line.kind === "checkpoint") {
    return (
      <div className="sys sys-checkpoint" data-testid="checkpoint">
        <span className="msg-tag">Checkpoint</span> {line.text}
      </div>
    );
  }
  return (
    <div className="sys sys-status" data-testid="run-status">
      <span>{line.text}</span>
      {run !== undefined && <RunReceipt run={run} />}
    </div>
  );
}

function MessageRowBody(props: MessageRowProps) {
  const [editing, setEditing] = useState(false);
  const [noting, setNoting] = useState(false);
  const [menu, setMenu] = useState<Point | undefined>(undefined);
  const row = useRef<HTMLDivElement>(null);
  const breaking = useBreaking(props, row);
  const { line, directory, actions } = props;
  if (line.kind === "system" || line.kind === "checkpoint" || line.kind === "status") {
    return <MarginLine {...props} />;
  }
  // Mine is the line I sent, not any person's: Dana's message on Arjun's screen is hers
  // (phase-1-interim-review finding 9).
  const said = saidBy(line, directory);
  const mine = said.id === props.selfId;
  const name = nameOf(directory, said.id);
  const { feedback, offers, reply } = offering(props, breaking.drawn !== undefined);
  // The time lives in the bubble's bottom-right corner, so it is a fact about the message
  // rather than a column of its own; where there is no bubble to put it in — a message that is
  // only files — `Under` puts it after them.
  const stamp = (
    <span className="bub-stamp">
      <Stamp line={line} offline={props.offline} onDiscard={props.onDiscard} />
    </span>
  );
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: right-click is a shortcut to the menu, not the way in — the `⋯` beside the bubble opens the same one and is in the tab order
    <div
      ref={row}
      className="msg"
      data-line={line.id}
      data-mine={mine ? "true" : undefined}
      data-pending={line.pending ? "true" : undefined}
      data-failed={line.failed === undefined ? undefined : "true"}
      data-focused={props.focused === true ? "true" : undefined}
      onContextMenu={(event) => {
        if (!offers) return;
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      {!mine && <SaidFace name={name} said={said} directory={directory} />}
      <div className="msg-body">
        <RouteOver route={props.route} line={line} mine={mine} directory={directory} />
        <Tags
          line={line}
          receipt={props.receipt}
          sessionTag={props.sessionTag}
          {...(line.via === undefined ? {} : { via: nameOf(directory, line.via) })}
        />
        <Bubble
          line={line}
          directory={directory}
          mine={mine}
          editing={editing}
          actions={props.actions}
          who={props.named === true && !mine ? name : undefined}
          stamp={stamp}
          marks={props.marks}
          came={breaking.came}
          onDone={() => setEditing(false)}
          reply={props.reply}
          files={props.files}
          onQuote={props.onQuote}
        />
        <Under
          {...props}
          stamp={stamp}
          noting={noting}
          feedback={feedback}
          onDoneNoting={() => setNoting(false)}
        />
        <Waits lineId={line.id} />
      </div>
      <LineEnd reply={reply} offers={offers} open={setMenu} />
      {menu !== undefined && actions !== undefined && (
        <LineMenu
          at={menu}
          spaceId={actions.spaceId}
          line={line}
          may={actions.may}
          pinned={actions.pinned}
          busy={props.busy === true}
          on={actions.on}
          asking={actions.asking}
          onDelete={breaking.choose}
          onFeedback={feedback}
          onReply={reply}
          onEdit={() => setEditing(true)}
          onNote={() => setNoting(true)}
          onClose={() => setMenu(undefined)}
        />
      )}
    </div>
  );
}

/**
 * Whether this row has anything to offer, the handler for a thumb or a note when the line takes
 * one, and a reply to it when it can be answered here (ADR 0219). Only a harness's words take a
 * note: a thumb on a colleague's message would be a chat reaction, which is a different feature
 * (ADR 0024's word for it is not "supervision").
 */
function offering(
  props: MessageRowProps,
  breaking: boolean,
): {
  readonly feedback: OnFeedback | undefined;
  readonly offers: boolean;
  readonly reply: (() => void) | undefined;
} {
  const { line, actions, onReply } = props;
  // A tombstone offers one thing, deleting it for oneself (ADR 0167); a line breaking, nothing.
  const feedback = takesFeedback(line) && line.deleted !== true ? props.onFeedback : undefined;
  const offers =
    actions !== undefined &&
    line.pending !== true &&
    !breaking &&
    hasMenu(actions.may, line, feedback !== undefined, onReply !== undefined);
  const reply =
    onReply !== undefined && !breaking && mayReply(line) ? () => onReply(line) : undefined;
  return { feedback, offers, reply };
}

/**
 * What stands beside the bubble on the line under the pointer: Reply (ADR 0219), the menu's first
 * item, and the `⋯` that opens the menu.
 */
function LineEnd({
  reply,
  offers,
  open,
}: {
  readonly reply: (() => void) | undefined;
  readonly offers: boolean;
  readonly open: (at: Point) => void;
}) {
  return (
    <>
      {reply !== undefined && (
        <button
          type="button"
          className="msg-reply"
          aria-label="Reply"
          title="Reply"
          data-testid="line-reply"
          onClick={reply}
        >
          <Icon name="reply" size={15} />
        </button>
      )}
      {offers && <More open={open} />}
    </>
  );
}

/** How long a line put back by Undo is looked for, to form again as it is drawn. */
const RETURN_MS = 3000;

/** A deletion for everyone that the server turned away forms again after this long. */
const TURNED_AWAY_MS = 1500;

/**
 * A line breaking into dust as it is deleted, or forming again from it by Undo (ADR 0167), as the
 * phone's does (`apps/mobile/src/spaces/Line.tsx`). For the reader alone, the room closes over the
 * line once the wipe has crossed it, and it goes, and the room offers Undo. For everyone, the wipe
 * stands until the tombstone comes back from the server, which comes up in its place — or, turned
 * away, the words form again. A line back by Undo opens its place and forms there (`returning`).
 */
function useBreaking(
  props: MessageRowProps,
  row: RefObject<HTMLDivElement | null>,
): {
  readonly drawn: Breaking | undefined;
  /** The tombstone came while the reader watched, and comes up rather than simply being there. */
  readonly came: boolean;
  readonly choose: (deletion: "me" | "everyone") => void;
} {
  const { line, actions } = props;
  const room = useDustRoom();
  const [drawn, setDrawn] = useState<Breaking | undefined>(() =>
    returning.has(line.id) ? { backwards: true, opens: true } : undefined,
  );
  useEffect(() => {
    returning.delete(line.id);
  }, [line.id]);
  const [taking, setTaking] = useState(false);
  const [came, setCame] = useState(false);
  useEffect(() => {
    if (!taking) return;
    if (line.deleted === true) {
      setTaking(false);
      setCame(true);
      setDrawn(undefined);
      return;
    }
    if (props.busy === true) return;
    const back = setTimeout(() => {
      setTaking(false);
      setDrawn({ backwards: true });
    }, TURNED_AWAY_MS);
    return () => clearTimeout(back);
  }, [taking, line.deleted, props.busy]);
  useCrumble(row, drawn, {
    onWiped: () => {
      if (actions === undefined) return;
      if (drawn?.after === "me") {
        actions.on.hide(actions.spaceId, line);
        room?.hidden(line.id);
      }
      if (drawn?.after === "everyone") {
        actions.on.remove(actions.spaceId, line);
        setTaking(true);
      }
    },
    onDone: () => {
      if (drawn?.backwards === true) setDrawn(undefined);
    },
  });
  return {
    drawn,
    came,
    choose: (deletion) => setDrawn({ after: deletion, backwards: false }),
  };
}

/**
 * The words: a bubble, a tombstone where a line was taken back, or the form while it is edited.
 *
 * The name and the time are in the bubble rather than over it — top left and bottom right, as
 * every chat on a phone draws them. A name is only there when the room has a third participant
 * in it to tell apart; the time is always.
 */
function Bubble(props: {
  readonly line: Line;
  readonly directory: Directory;
  /** Yours, in which case what you said is what you said, whatever it opens with. */
  readonly mine: boolean;
  readonly editing: boolean;
  readonly actions: RowActions | undefined;
  /** Who said it, when this room says so at all. Never for the reader's own lines. */
  readonly who: string | undefined;
  readonly stamp: ReactNode;
  readonly marks: readonly string[] | undefined;
  /** A tombstone that came as the reader watched the bubble break (ADR 0167). */
  readonly came: boolean;
  readonly onDone: () => void;
  /** The message this one replies to, quoted above the words (ADR 0219). */
  readonly reply?: ReplyCardModel | undefined;
  readonly files?: FileService | undefined;
  readonly onQuote?: ((reply: Line, quoted: string, mine: boolean) => void) | undefined;
}) {
  const { line, actions } = props;
  if (line.deleted === true) {
    return (
      <div
        className="bub bub-gone"
        data-testid="tombstone"
        data-came={props.came ? "true" : undefined}
      >
        Message taken back
        {props.stamp}
      </div>
    );
  }
  if (props.editing && actions !== undefined) {
    return (
      <EditForm
        line={line}
        onSave={(text) => {
          actions.on.edit(actions.spaceId, line, text);
          props.onDone();
        }}
        onCancel={props.onDone}
      />
    );
  }
  if (!hasBubble(line, props.reply)) return null;
  // A harness's queued turn edits one message as it works, and the room draws that as the work
  // it is rather than as the text it arrives as (`TaskBubble.tsx`), in the colour of its face.
  const task = props.mine ? undefined : readTaskBubble(line.text);
  const said = saidBy(line, props.directory);
  return (
    <div
      className="bub"
      data-summary={line.kind === "summary" ? "true" : undefined}
      data-task={task === undefined ? undefined : "true"}
    >
      {props.who !== undefined && <b className="bub-who">{props.who}</b>}
      <Quoted {...props} />
      {task === undefined ? (
        <Markdown
          text={line.text}
          directory={props.directory}
          mentions={line.mentions}
          marks={props.marks}
        />
      ) : (
        <TaskBubble
          task={task}
          colour={faceGround(nameOf(props.directory, said.id), agentFace(props.directory, said.id))}
        />
      )}
      {props.stamp}
    </div>
  );
}

/**
 * That turns working in the room heard this, said for somebody else (ADR 0106): "J1 heard this
 * while working", quiet, under the bubble.
 */
function Heard({ line, directory }: { readonly line: Line; readonly directory: Directory }) {
  const words = heardWords(line, directory);
  if (words === undefined) return null;
  return (
    <div className="msg-heard" data-testid="heard">
      {words}
    </div>
  );
}

/**
 * What sits under a bubble: its files, the receipt of a finished run, and what the room has
 * already said about it. Not what may be done to it — that is the menu.
 */
function Under(
  props: MessageRowProps & {
    /** The time, for a line with no bubble to hold it: one that is only files. */
    readonly stamp: ReactNode;
    readonly noting: boolean;
    readonly feedback: OnFeedback | undefined;
    readonly onDoneNoting: () => void;
  },
) {
  const { line, directory, feedback } = props;
  return (
    <>
      {line.attachments !== undefined && (
        <Attachments attachments={line.attachments} files={props.files} lineId={line.id} />
      )}
      {line.text === "" && line.deleted !== true && props.reply === undefined && props.stamp}
      {line.kind === "summary" && props.run !== undefined && (
        <RunReceipt run={props.run} change={changeMark(props)} />
      )}
      {line.change !== undefined &&
        (line.kind !== "summary" || props.run === undefined) &&
        props.changeWords !== undefined && (
          <div className="msg-receipt">
            <Receipt steps={[]} change={changeMark(props)} />
          </div>
        )}
      <FeedbackGiven line={line} directory={directory} unsent={props.unsent} />
      <Heard line={line} directory={directory} />
      <RepliesMark replies={props.replies ?? []} onGo={props.onReplies} />
      {props.noting && feedback !== undefined && (
        <NoteForm
          line={line}
          name={saidName(line, directory)}
          busy={props.busy === true}
          onFeedback={feedback}
          onClose={props.onDoneNoting}
        />
      )}
    </>
  );
}

/** The change a line carries, as its row is handed it: its words, and whether it was undone. */
function changeOfLine(space: Space, line: Line): { changeWords?: string; changeUndone?: boolean } {
  const change = changeOf(space.project, line.change);
  if (change === undefined) return {};
  return { changeWords: filesChangedWords(change), changeUndone: change.undoneBy !== undefined };
}

/** "2 files changed" under a reply, and what opens its change (ADR 0222). */
function changeMark(props: MessageRowProps): { words: string; onOpen: () => void } | undefined {
  const { line, changeWords, onChange } = props;
  if (line.change === undefined || changeWords === undefined || onChange === undefined)
    return undefined;
  const commit = line.change;
  return {
    words: props.changeUndone === true ? `${changeWords} · Undone` : changeWords,
    onOpen: () => onChange(commit),
  };
}

/** Whether a line has a bubble: words, or a reply's card, which one of files alone still has. */
function hasBubble(line: Line, reply: ReplyCardModel | undefined): boolean {
  return line.text !== "" || reply !== undefined;
}

/** The card of the message a reply quotes, above its words (ADR 0219). */
function Quoted(props: {
  readonly line: Line;
  readonly mine: boolean;
  readonly directory: Directory;
  readonly reply?: ReplyCardModel | undefined;
  readonly files?: FileService | undefined;
  readonly onQuote?: ((reply: Line, quoted: string, mine: boolean) => void) | undefined;
}) {
  const { reply, onQuote, line } = props;
  if (reply === undefined) return null;
  return (
    <ReplyCard
      card={reply}
      mine={props.mine}
      directory={props.directory}
      files={props.files}
      onGo={onQuote === undefined ? undefined : (quoted) => onQuote(line, quoted, props.mine)}
    />
  );
}

/** The message a draft replies to, and whether the reply still says who it is for (ADR 0219). */
interface Answer {
  readonly lineId: string;
  readonly decides: boolean;
}

/**
 * The reply being written in each room (ADR 0219, point 2), held by room as the picks are: the
 * space view stays mounted from room to room, and a reply started in one is nothing to another.
 * Starting one replaces the last and puts the caret in the field; × or Escape lets it go, and so
 * does a send. An agent picked in the capsule after it was started says who the message is for
 * from then on (point 3), so the reply stops deciding.
 *
 * The caret is put in the field once the strip is drawn, not as the reply starts: in a room whose
 * field leads with no faces, the strip's coming wraps the words' box, which is then a new one, and
 * the caret given to the old one went nowhere (the browser, 22 October 2026). Its going does the
 * same, so a caret it lost is put back, where nothing else has taken it.
 */
function useAnswering(
  spaceId: string,
  field: RefObject<HTMLTextAreaElement | null>,
): {
  readonly reply: Answer | undefined;
  /** The line the draft replies to while the reply says who it is for, for `aimOf`. */
  readonly deciding: string | undefined;
  readonly start: (line: Line) => void;
  readonly letGo: () => void;
  /** What Escape in the words does: lets the reply go, while there is one. */
  readonly escape: (() => void) | undefined;
  readonly picked: () => void;
} {
  const [byRoom, setByRoom] = useState<Readonly<Record<string, Answer>>>({});
  const put = useCallback(
    (next: (was: Answer | undefined) => Answer | undefined) =>
      setByRoom((now) => {
        const { [spaceId]: was, ...others } = now;
        const kept = next(was);
        return kept === undefined ? others : { ...others, [spaceId]: kept };
      }),
    [spaceId],
  );
  const [started, setStarted] = useState(0);
  const start = useCallback(
    (line: Line) => {
      put(() => ({ lineId: line.id, decides: true }));
      setStarted((count) => count + 1);
    },
    [put],
  );
  const letGo = useCallback(() => put(() => undefined), [put]);
  const picked = useCallback(
    () => put((was) => (was === undefined ? undefined : { ...was, decides: false })),
    [put],
  );
  const reply = byRoom[spaceId];
  useEffect(() => {
    if (started > 0) field.current?.focus({ preventScroll: true });
  }, [started, field]);
  const shown = reply !== undefined;
  const was = useRef(shown);
  useEffect(() => {
    if (was.current === shown) return;
    was.current = shown;
    const active = document.activeElement;
    if (active === null || active === document.body) field.current?.focus({ preventScroll: true });
  }, [shown, field]);
  return {
    reply,
    deciding: reply?.decides === true ? reply.lineId : undefined,
    start,
    letGo,
    escape: reply === undefined ? undefined : letGo,
    picked,
  };
}

/**
 * What the field holds over the words: the list of who to send to while it is open, else the strip
 * of the message a reply answers, from the card the reply will carry (ADR 0219).
 */
function aboveWords(
  list: ReactNode,
  answering: ReturnType<typeof useAnswering>,
  space: Space,
  directory: Directory,
  selfId: string,
): ReactNode {
  const { reply } = answering;
  if (list !== undefined) return list;
  if (reply === undefined) return undefined;
  const card = replyCard(space, { replyTo: reply.lineId }, directory, Date.now());
  if (card === undefined) return undefined;
  return <ReplyStrip card={card} directory={directory} selfId={selfId} onLetGo={answering.letGo} />;
}

/**
 * A reply's card takes the room to the message it quotes (ADR 0219), the list's one way of landing
 * on a line, and a pill over the field, "Back to your reply", takes it back. The pill holds the
 * reply, and goes once clicked, on a send, or once the reply is in view again: after it has left
 * the window, since it is in view as the room begins to go. A message already in view is lit where
 * it is, with no pill: the reply never left, so there is nothing to go back to.
 */
function useBackToReply(
  scroller: RefObject<HTMLDivElement | null>,
  go: (lineId: string) => void,
): {
  readonly back: BackTo | undefined;
  readonly quote: (reply: Line, quoted: string, mine: boolean) => void;
  readonly goBack: () => void;
  readonly clear: () => void;
} {
  const [back, setBack] = useState<BackTo | undefined>(undefined);
  const left = useRef(false);
  const quote = useCallback(
    (reply: Line, quoted: string, mine: boolean) => {
      const el = scroller.current;
      const row = el?.querySelector(`[data-line="${quoted}"]`);
      const there = el != null && row != null && halfIn(el, row);
      go(quoted);
      if (there) return;
      left.current = false;
      setBack({ id: reply.id, mine });
    },
    [go, scroller],
  );
  const clear = useCallback(() => setBack(undefined), []);
  const goBack = useCallback(() => {
    if (back !== undefined) go(back.id);
    setBack(undefined);
  }, [back, go]);
  useEffect(() => {
    const el = scroller.current;
    if (back === undefined || el === null) return;
    const onScroll = () => {
      const row = el.querySelector(`[data-line="${back.id}"]`);
      if (row === null || !halfIn(el, row)) left.current = true;
      else if (left.current) setBack(undefined);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [back, scroller]);
  return { back, quote, goBack, clear };
}

/** Whether half of a row or more is inside the scroller's window: some of it, at least. */
function halfIn(el: Element, row: Element): boolean {
  const box = el.getBoundingClientRect();
  const edge = row.getBoundingClientRect();
  const shown = Math.min(box.bottom, edge.bottom) - Math.max(box.top, edge.top);
  return shown > 0 && shown >= Math.min(edge.height, box.height) / 2;
}

/** The room's sheet: what opened it and on which page, while it is up (ADR 0151). */
interface RoomSheetState {
  /**
   * What opened it, on which page, and how many times it has been opened: a sheet asked for again
   * while the last is still folding away is a new one, not the last kept from going.
   */
  readonly open:
    | {
        readonly from: HTMLElement | null;
        readonly on: "who" | "add" | "universe";
        readonly n: number;
        /** The change it opens on, from under the reply that made it (ADR 0222). */
        readonly change?: string | undefined;
      }
    | undefined;
  /** On a change to the room's project, from under the reply that made it (ADR 0222). */
  readonly showChange: (commit: string) => void;
  /** From the room's name or who is here: its first page. */
  readonly show: (from: HTMLElement) => void;
  /** From the four rings at the header's right: Universe (ADR 0227). */
  readonly showUniverse: (from: HTMLElement) => void;
  /** Add, from a room waiting for agents or the + that has just made it empty (ADR 0148). */
  readonly add: () => void;
  /** Gone, its fold finished. */
  readonly gone: () => void;
  /** The room's name, which a sheet asked for by something else grows out of. */
  readonly titleRef: RefObject<HTMLButtonElement | null>;
}

/** A reply's change opens the room's sheet on it, where the room has the sheet's actions (ADR 0222). */
function changeOpener(onSpace: SpaceActions | undefined, sheet: RoomSheetState) {
  return onSpace === undefined ? undefined : sheet.showChange;
}

function useRoomSheet(
  spaceId: string,
  membersFor: string | undefined,
  onShown: (() => void) | undefined,
): RoomSheetState {
  const [open, setOpen] = useState<RoomSheetState["open"]>(undefined);
  const shown = useRef(onShown);
  shown.current = onShown;
  const titleRef = useRef<HTMLButtonElement>(null);
  const opened = useRef(0);
  const add = useCallback(() => {
    opened.current += 1;
    setOpen({ from: titleRef.current, on: "add", n: opened.current });
  }, []);
  const showChange = useCallback((commit: string) => {
    opened.current += 1;
    setOpen({ from: titleRef.current, on: "who", n: opened.current, change: commit });
  }, []);
  // Another room: a sheet up for the last one is not this one's. Before the next, which may open
  // the new room's on Add.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new room is what puts it away.
  useEffect(() => setOpen(undefined), [spaceId]);
  useEffect(() => {
    if (membersFor !== spaceId) return;
    add();
    shown.current?.();
  }, [membersFor, spaceId, add]);
  return {
    open,
    show: (from) => {
      opened.current += 1;
      setOpen({ from, on: "who", n: opened.current });
    },
    showUniverse: (from) => {
      opened.current += 1;
      setOpen({ from, on: "universe", n: opened.current });
    },
    add,
    showChange,
    gone: () => setOpen(undefined),
    titleRef,
  };
}

/**
 * What a room says where its lines would be before anybody has said anything: that nobody is here
 * yet, with Add agents, in a room of people alone (ADR 0148); who waits for the person's first
 * message and what they would like to do, in a room with agents (ADR 0149); else to say something.
 */
function Unstarted(props: {
  readonly space: Space;
  readonly directory: Directory;
  /** Whether anybody can be added from here: a room with no room sheet can't. */
  readonly addable: boolean;
  readonly onAdd: () => void;
}) {
  if (props.addable && awaitsAgents(props.space, props.directory))
    return <AwaitingAgents onAdd={props.onAdd} />;
  const waiting = waitingIn(props.space, props.directory);
  if (waiting.length > 0) return <WaitingRoom ids={waiting} directory={props.directory} />;
  return (
    <p className="conv-empty" data-testid="empty">
      Nothing yet. Say something below, or wait for a harness.
    </p>
  );
}

/**
 * A room with nobody in it but people and nothing said (ADR 0148): faces still to come, that nobody
 * is here yet, and Add agents, which opens the room sheet at its Add. The phone's words.
 */
function AwaitingAgents({ onAdd }: { readonly onAdd: () => void }) {
  return (
    <section className="conv-awaiting" data-testid="awaiting" aria-label={AWAITING_AGENTS.title}>
      <span className="conv-awaiting-faces" aria-hidden="true">
        <span />
        <span>
          <Icon name="plus" size={16} />
        </span>
        <span />
      </span>
      <h2>{AWAITING_AGENTS.title}</h2>
      <p>{AWAITING_AGENTS.body}</p>
      <Button variant="primary" icon="plus" onClick={onAdd} data-testid="awaiting-add">
        {AWAITING_AGENTS.add}
      </Button>
    </section>
  );
}

/** The most faces the waiting room draws; its words count the rest. */
const MOST_WAITING = 3;

/**
 * A room whose agents wait for the person's first message (ADR 0149): their faces, what the person
 * would like to do, and who is here. A room asked of a harness from the + is one, the harness
 * waiting to make its agent. The phone's words.
 */
function WaitingRoom(props: { readonly ids: readonly string[]; readonly directory: Directory }) {
  const { ids, directory } = props;
  return (
    <section className="conv-awaiting" data-testid="waiting" aria-label={WAITING_ROOM.title}>
      <span className="conv-waiting-faces" aria-hidden="true">
        {ids.slice(0, MOST_WAITING).map((id) => (
          <span key={id} className="conv-waiting-who" data-testid={`waiting-${id}`}>
            <Avatar
              name={nameOf(directory, id)}
              kind={faceKind(directory, id)}
              icon={agentFace(directory, id)}
              size="lg"
            />
            <b>{nameOf(directory, id)}</b>
            {/* Its harness, where the name does not say it: "Milo" is Jacobian's (ADR 0150). */}
            {harnessUnder(directory, id) === undefined ? null : (
              <small>{harnessUnder(directory, id)}</small>
            )}
          </span>
        ))}
      </span>
      <h2>{WAITING_ROOM.title}</h2>
      <p>{waitingRoomWords(ids.map((id) => nameOf(directory, id)))}</p>
    </section>
  );
}

/**
 * The lines pinned to the top of the space (M5.4): a strip of them, each a jump to its line, said
 * by its words without marks.
 */
function Pins(props: { readonly space: Space; readonly onJump: (lineId: string) => void }) {
  const lines = pinnedLines(props.space);
  if (lines.length === 0) return null;
  return (
    <section className="pins" data-testid="pins" aria-label="Pinned messages">
      <Icon name="doc" size={12} />
      {lines.map((line) => (
        <button key={line.id} type="button" onClick={() => props.onJump(line.id)}>
          {plainWords(line.text).slice(0, 80)}
        </button>
      ))}
    </section>
  );
}

/** How a steer was meant, and what Chips did with a mid-run message. */
/**
 * What a line needs saying about it that is not the words: that a heartbeat woke it, where it was
 * said, which visit it came from, how a steer was meant, what Chips did with it, whether it was
 * changed since.
 *
 * These sit above the bubble, in the strip the name used to share. A line with nothing to
 * declare — which is most of them — has no strip at all, so the room is bubbles.
 */
function Tags({
  line,
  receipt,
  sessionTag,
  via,
}: {
  readonly line: Line;
  readonly receipt: MessageRowProps["receipt"];
  readonly sessionTag?: string | undefined;
  /** The harness this was said at, when it was not said here. */
  readonly via?: string | undefined;
}) {
  const tags: ReactNode[] = [];
  // A heartbeat's check-in (ADR 0143): said because its harness woke it, not because anyone wrote.
  if (line.heartbeat === true) {
    tags.push(
      <span
        className="msg-tag msg-tag-beat"
        data-testid="heartbeat-tag"
        title="Heartbeat check-in"
        key="heartbeat"
      >
        <Icon name="pulse" size={11} />
        Heartbeat
      </span>,
    );
  }
  if (via !== undefined) {
    tags.push(
      <span className="msg-tag" data-testid="via" key="via">
        at {via}
      </span>,
    );
  }
  // Quiet text rather than a pill: a name is longer than a tag and reads as a label, not as a
  // state (ADR 0040).
  if (sessionTag !== undefined) {
    tags.push(
      <span className="msg-session" data-testid="session-tag" key="session">
        {sessionTag}
      </span>,
    );
  }
  if (line.mode !== undefined) {
    tags.push(
      <span className="msg-tag" data-testid="mode" key="mode">
        {MODE_LABEL[line.mode]}
      </span>,
    );
  }
  if (receipt !== undefined) {
    tags.push(
      <span className="msg-tag" data-testid="receipt" data-disposition={receipt} key="receipt">
        {receipt}
      </span>,
    );
  }
  if (line.editedAt !== undefined && line.deleted !== true) {
    tags.push(
      <span
        className="msg-tag"
        data-testid="edited"
        title={`Edited ${clockTime(line.editedAt)}`}
        key="edited"
      >
        edited
      </span>,
    );
  }
  if (tags.length === 0) return null;
  return <div className="msg-tags">{tags}</div>;
}

/**
 * Who said a line, which is not always who sent the event. A prompt typed at a terminal reaches
 * Chips as the harness's own `run.started`, but the person typed it, and showing it under the
 * harness's name would make a room of two people look like one talking to itself. The harness's
 * owner is who that is (ADR 0023: a harness has one), and if Chips does not know them the
 * harness's own name is the honest fallback.
 */
function saidBy(line: Line, directory: Directory): { id: string; kind: "person" | "harness" } {
  const kind = line.authorKind === "harness" ? "harness" : "person";
  if (line.via === undefined) return { id: line.authorId, kind };
  const owner = directory[line.via]?.ownerId;
  return owner === undefined ? { id: line.via, kind: "harness" } : { id: owner, kind: "person" };
}

/**
 * The time, or where the line is on its way to the server: sending, waiting for a connection,
 * or refused. A line held because there is nothing to send it down says so — "sending…" on a
 * closed socket reads like a message in flight, and a person who believes that sends it again
 * (6 September 2026: a dev server was down, two identical messages were queued, and Jacobian
 * answered both).
 */
function Stamp({
  line,
  offline,
  onDiscard,
}: {
  readonly line: Line;
  readonly offline: boolean;
  readonly onDiscard?: ((key: string) => void) | undefined;
}) {
  if (line.failed !== undefined) {
    return (
      <span className="msg-failed" data-testid="failed">
        not sent · {line.failed}
      </span>
    );
  }
  if (line.pending) {
    if (!offline) {
      return (
        <span className="msg-time" data-testid="pending">
          sending…
        </span>
      );
    }
    // Nothing has left the browser, so this is a real undo. Once the socket has carried the
    // message it is the server's, and the offer goes away with the wait.
    const key = line.key;
    return (
      <span className="msg-waiting" data-testid="waiting">
        <span title="It will go when the server is back.">waiting for the server…</span>
        {onDiscard !== undefined && key !== undefined && (
          <button
            type="button"
            className="msg-undo"
            data-testid="discard"
            onClick={() => onDiscard(key)}
          >
            Don&apos;t send
          </button>
        )}
      </span>
    );
  }
  return <span className="msg-time">{clockTime(line.ts)}</span>;
}

/**
 * Lines a reader would see: a system line is one only when it has something to say — a
 * harness read a file (decision 10), somebody renamed or closed the room (M3.3).
 */
/**
 * The lines a space draws. A system line with nothing to say is skipped. So is the task card of
 * a lane whose home is this same room and which is linked into it too — a subagent working in
 * the worktree its lead is in (M3.5): one room, one lane, one card, and the route card is the
 * one that carries the reply and the cost.
 */
/**
 * What the empty field says: what a steer is for while the Steer chip is on; who the words are for,
 * in a room of several harnesses (*Message Everyone*, Arjun's A); else that commands go here too.
 */
function placeholderOf(
  steering: boolean,
  aim: Aim | undefined,
  space: Space,
  directory: Directory,
  narrow = false,
): string {
  if (steering)
    return narrow ? "What should it do instead?" : "Steer the run: what should it do instead?";
  // A phone's field has room for a word, not the slash commands (JR-15).
  if (aim === undefined) return narrow ? "Message" : "Message, or type / to steer, pause, or stop…";
  return `Message ${aimWordsOf(aim, space, directory)}`;
}

/**
 * Who the field says it messages: where the capsule aims, in a room of several harnesses — the
 * room's name would be whichever harness has a run — and the room otherwise, as for a message
 * for people alone.
 */
function fieldName(
  aim: Aim | undefined,
  space: Space,
  directory: Directory,
  selfId: string,
): string {
  return aim === undefined || aim.ids.length === 0
    ? spaceTitle(space, directory, selfId)
    : aimWordsOf(aim, space, directory);
}
