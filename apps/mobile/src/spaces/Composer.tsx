/**
 * The line at the bottom of a space. Words go as a message; a line beginning with a slash is a
 * command, parsed by core's `parseCommand` and carried out by core's `act` — the same two
 * functions the desktop uses, so `/pause` means the same thing on both and neither has its own
 * dialect.
 *
 * What `act` refuses comes back as a sentence rather than as a failed request: `/resume` on a
 * run that is not paused is a person's mistake, not the server's business, and telling them so
 * here costs a round trip less and reads better than a red error from the door.
 *
 * It is the one thing in the app that touches the bottom of the glass, so it holds the inset
 * itself. Without it the box sits in the band iOS keeps for the home indicator, where the system
 * takes the first touch of every gesture and the composer feels dead rather than slow — the
 * margin and the tap are the same bug (Arjun, 9 September 2026).
 *
 * It looks like what it is. The field is a pill on the page's own surface with a hairline round
 * it, the shape a phone types into everywhere else, and Send is a mark rather than a word in a
 * box — a bordered box beside a black slab read as a form, and a form is a thing you fill in,
 * not a thing you tap (Arjun, later the same day).
 *
 * Since 21 September 2026 the pill *floats*: there is no bar under it any more, no ground and no
 * hairline across the screen — one capsule of glass over the room, with the conversation running
 * underneath it (`ui/Glass.tsx`, and the mocks it names). Since 23 September it is the system's
 * own glass, the material Messages makes its field of, with no band of blur behind it at all, and
 * the + stands beside it as a glass circle of its own — Messages' arrangement, picked by Arjun from
 * `docs/proposals/composer-liquid-glass-mocks.html`. For two days the + was inside the capsule, on
 * the reasoning that two round things side by side were two objects where the room now had one;
 * in the system's glass they are two drops of the same material, which is how iOS draws its own.
 * Where there is no glass to be had — Reduce Transparency, Android, the web target — the ground
 * and the hairline come back exactly as they were, which is why both are still written down here.
 * Whatever stands over the field — a refused command's sentence — stands on glass of its own,
 * because there is no band under it any more to read it against.
 *
 * Send stands *inside* the field, at its right edge, as a thirty-point blue circle (WP5). It was
 * a larger ink circle outside the field until 12 September 2026, which is the shape the desktop's
 * design system gives a send button and the shape no phone gives one: the arrow belongs to the
 * words it sends, close enough that the thumb goes from the last letter to it without leaving
 * the box. Only the + stands outside, because what it opens is not the message.
 *
 * The + beside it is where a photo, a video or a file comes in (M4.4): a sheet up from the bottom
 * edge with the library, the camera and the Files app — mounted for as long as there is a file
 * service, so that turning `open` off is seen as a slide out rather than a vanishing — and a
 * strip of chips above the field for what was picked, each
 * uploading as it arrives so Send is instant. A photo's chip opens the media viewer over the file
 * on this phone (`media/StagedViewer.tsx`), so a picture is looked at closely before it goes, with
 * Send standing where it stands here. A file over the workspace's cap for its kind is
 * refused at the chip with the server's own sentence, and never uploaded (ADR 0047). A voice note
 * is recorded on the same sheet and staged the same way (ADR 0054); its chip says it is being
 * transcribed, because the server writes down what was said before the upload answers, and Send
 * waits for that as it waits for any upload.
 *
 * The field is as tall as its words, and the words are measured by a twin: a `Text` under the
 * field, unseen, set in the same face at the same width, whose layout says how tall the field
 * should be. The platform's own measure of a multiline field cannot be trusted here (the
 * simulator, 11 September 2026): on iOS it ran a line behind what was typed, so the last line of
 * a message sat below the box's edge until the next key; a value cleared from JS changed the
 * text on screen but not the text it measured, so an empty field kept three lines of height
 * with the placeholder at its top; and it reports a content size only when the box's own frame
 * changes, which is no use for deciding the frame. A twin has none of that: the same words, laid
 * out by the same engine, measured whenever they change, and one line the moment they are gone.
 *
 * What was typed and not sent is kept for the space, for as long as the app runs: a room left
 * mid-sentence to check something in another is a room come back to with the sentence still
 * there, which is what every messenger does and what the back gesture on a phone makes easy to
 * need.
 *
 * In a room with more than one harness, the faces at the front of the field say who the message is
 * for, the empty field says it in words, and a tap on the faces opens the field upward into the
 * list that picks (`AddressInField.tsx`, ADR 0081). A finger that slides up from them instead
 * raises a column of faces, and picks one where it lets go (`FaceColumn.tsx`, ADR 0229). What it
 * says goes with the send as `to`, unless an @ in the words decides; a pick holds for the draft,
 * as the words do.
 *
 * A draft that replies to a message holds it in a strip inside the glass, over the words
 * (`ReplyStrip.tsx`, ADR 0219), kept with them. A reply to an agent's message is for that agent,
 * and Chips says so: no `to` goes while the reply decides, which an @ or a pick after it ends.
 *
 * Over four hundred lines because most of them say why: the field, the strip of chips above
 * it and the sheet beside it are one bar, and the chip is not worth a file of its own.
 */

import type { Aim, AimPick, Command, Directory, Line, Run, Space, Store } from "@chipschat/core";
import {
  act,
  addedTo,
  aimedAt,
  aimOf,
  aimsAtEveryone,
  formatBytes,
  formatDuration,
  kindOf,
  parseCommand,
  routesIn,
} from "@chipschat/core";
import type { AttachmentCaps } from "@chipschat/protocol";
import { type ImageRef, Image as Picture } from "expo-image";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Keyboard,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FILM_SOURCE } from "../demo/filmSource";
import { PlayMark } from "../media/PlayDisc";
import { type Looking, lookAt, StagedViewer } from "../media/StagedViewer";
import { measureView } from "../media/tiles";
import { IconButton } from "../ui/Button";
import { Aside, alpha, Capsule, useGlassy } from "../ui/Glass";
import { GROWS, GrowingView } from "../ui/growing";
import * as feel from "../ui/haptics";
import { Icon } from "../ui/Icon";
import { useColumn } from "../ui/Screen";
import { useFootClear } from "../ui/Split";
import { usePalette, useScheme } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import {
  AddressList,
  AddressToken,
  choicesOf,
  listRoom,
  messageWords,
  TOKEN,
} from "./AddressInField";
import { AttachSheet } from "./AttachSheet";
import { FaceColumn, type FaceSlide, FaceSlideOn, useFaceSlide } from "./FaceColumn";
import { WIDTH as COLUMN_WIDTH } from "./faceColumnMath";
import type { FileService } from "./files";
import { useFirstFrame } from "./firstFrame";
import { pick, type Source } from "./pick";
import type { Picked } from "./picked";
import { forgetPicks, keepPick, pickFor } from "./picks";
import { ReplyStrip } from "./ReplyStrip";
import { useDropInto } from "./RoomDrop";
import type { Launch } from "./sendLanding";
import { type Staged, useStaged } from "./useStaged";

/**
 * Photos and files dropped onto the room from other apps, staged as the + stages what it picks
 * (ADR 0256), where the room takes files.
 */
function useDropStaging(takes: boolean, add: (picked: readonly Picked[]) => void) {
  const latest = useRef(add);
  latest.current = add;
  const dropped = useCallback((picked: readonly Picked[]) => latest.current(picked), []);
  useDropInto(takes ? dropped : undefined);
}

/** What was typed and not sent, by space, while the app runs. */
const drafts = new Map<string, string>();

/** The message a draft replies to (ADR 0219). */
interface Replying {
  readonly lineId: string;
  /** Whether the reply says who the draft is for: until an agent is picked after it was started. */
  readonly decides: boolean;
}

/** The reply each room's draft holds, by space, kept with its words while the app runs. */
const replies = new Map<string, Replying>();

/** The field of each room drawn now, by space, for a reply started from the room above it. */
const replyFields = new Map<string, () => void>();

/**
 * Reply to a line in a room's field (ADR 0219): from a swipe on it or Reply in its lifted menu. It
 * takes the place of a reply started before, and the field takes the keys.
 */
export function startReply(spaceId: string, lineId: string): void {
  replies.set(spaceId, { lineId, decides: true });
  replyFields.get(spaceId)?.();
}

/** One line of the field, and where it stops growing: six lines or so, then it scrolls. */
const LINE = TEXT.body * 1.35;
const INPUT_MAX = 124;

/**
 * The field's own height, and the circles inside it.
 *
 * Both went up on 22 September 2026, and for a reason worth writing down: the mocks were drawn at
 * 330 points wide standing in for a 402-point phone, so everything in them was a fifth larger
 * against the screen than the same number of points is here. Arjun liked the proportions there
 * and found the real one mean beside it — "the proportions in the mock look better… might be
 * having more height". This is that fifth, given back: a fifty-point pill rather than a
 * forty-four, and thirty-two-point circles rather than thirty. The thumb's minimum
 * (`TOUCH_TARGET`) is still cleared by both. On 23 September, in the system's glass, "slightly
 * more taller": fifty-four, and then two points back — fifty-two — with Send still centred on
 * one line and the + beside it the same. On 24 September, two more back: fifty.
 */
const FIELD = 50;
const SEND = 32;
/** Send's inset from the field's edge, and the faces': a circle centred on one line. */
const FIELD_INSET = (FIELD - SEND) / 2;

/**
 * Whether a finger can slide up from the faces into a column of them (ADR 0229): on a phone, and in
 * the film's render (ADR 0229's addendum of 25 October), which slides the web target's faces as a
 * finger would. Elsewhere the web target is where the phone's Playwright specs run, and they pick
 * from the list, as the Mac does.
 */
const SLIDES = Platform.OS !== "web" || FILM_SOURCE;
/** Where the column's middle stands over the faces' capsule: past its arrow, over the first face. */
const RISE_AT = SPACE.sm + 26;

/**
 * How tall the room's foot stands with nothing but an empty field in it: the bar's own padding
 * over and under a field of one line, and the band at the bottom of the glass the bar holds
 * clear itself (`styles.bar`, and the `paddingBottom` given beside it).
 *
 * The room holds this much of its foot clear from its first frame, before the foot has measured
 * itself (`SpaceView`). The ordinary room is exactly this: the empty field's height is set
 * rather than measured, so it is a fifty-point pill at every text size. A room with a notice
 * over the field, a file staged in it or a draft of several lines stands taller by that much,
 * and the measure is what corrects it.
 */
export function quietFoot(bottomInset: number): number {
  return SPACE.md + FIELD + SPACE.md + bottomInset;
}

/**
 * How long after a send the field will not take the words back.
 *
 * Send empties the field from here, and on iOS that reaches the field with the count of the last
 * change this side had heard about. If the keyboard changed the field in between — a correction,
 * a prediction put away, a last key still on its way — the clear is dropped as out of date, and
 * the change it lost to arrives a moment later holding the whole message. Taken, it put the words
 * back in the field and in the draft with the message already gone (Arjun, 23 September 2026, on
 * iOS 27). Refused, React Native finds the field and the value disagreeing and clears it again,
 * with the count that is current.
 */
const SETTLING_MS = 1000;

/**
 * How long the field says nothing after words leave it for their bubble (`SendFlight.tsx`): the
 * placeholder came up the moment it emptied, and showed through the words as their colour came
 * up under them (the simulator, 24 September 2026). By now they have left the field.
 */
const HUSH_MS = 240;

/**
 * Whether the placeholder is held back just now, and the send that holds it back: one whose words
 * are flying from the field, and so are still over it.
 */
function useHush(): readonly [boolean, (launch: Launch | undefined) => void] {
  const [hushed, setHushed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const hush = useCallback((launch: Launch | undefined) => {
    if (launch?.words === undefined) return;
    clearTimeout(timer.current);
    setHushed(true);
    timer.current = setTimeout(() => setHushed(false), HUSH_MS);
  }, []);
  return [hushed, hush] as const;
}

/** What a send took out of the field, and when. */
interface Sent {
  readonly text: string;
  readonly at: number;
}

/**
 * Whether a change is the sent message coming back rather than the next one beginning: inside the
 * moment after the send, and holding more than half of what went. What comes back is the message
 * or most of it, corrected; the next message starts with a letter.
 */
function isEcho(sent: Sent | undefined, next: string, now: number): boolean {
  return sent !== undefined && now - sent.at < SETTLING_MS && next.length * 2 > sent.text.length;
}

/** The field's height for what its twin measured: one line at least, and never past the ceiling. */
function heightFor(measured: number | undefined): number {
  return Math.min(INPUT_MAX, Math.max(LINE, measured ?? LINE));
}

/**
 * What the twin is set in: the words, or one space for none, so that it is never shorter than a
 * line; and a space after a final newline, which a `Text` would otherwise not count as a line
 * where the field shows one, with the caret on it.
 */
function twinOf(text: string): string {
  if (text === "") return " ";
  return text.endsWith("\n") ? `${text} ` : text;
}

/** Anything that can say where it is in the window: the field, and the view round Send. */
interface Placed {
  readonly measureInWindow: (
    answer: (x: number, y: number, width: number, height: number) => void,
  ) => void;
}

/** Where a view is in the window, which the new architecture answers at once, from its layout. */
function inWindow(view: Placed | null): Launch["words"] | undefined {
  const seen: { rect?: Launch["words"] } = {};
  view?.measureInWindow((x, y, width, height) => {
    seen.rect = { x, y, width, height };
  });
  return seen.rect;
}

/** A staged photo that may fly: the attachment it became, its picture, and its chip's thumbnail. */
export interface StagedPicture {
  readonly attachmentId: string;
  /** The picture the copy draws: the room's thumbnail, or the picker's file until that has come. */
  readonly uri: string;
  /** The thumbnail decoded, which the copy draws from its first frame, once it has been (`useStaged`). */
  readonly picture?: ImageRef | undefined;
  readonly thumb: Placed | null;
}

/**
 * The photos among what is staged and ready to go, each with its chip's thumbnail to fly from.
 *
 * What flies is the thumbnail the tile will draw (`useStaged`), when it has come: the file the
 * picker gave is the photo itself, twelve million pixels from a phone's camera, and the copy that
 * flew it drew nothing until the whole of it was decoded — a tenth of a second into the flight, on
 * a phone — and decoded it again as it grew to the tile's size, on the main thread. The thumbnail
 * is small, is warm already (`ChipThumb`), and is the very picture the tile shows when the copy
 * dissolves into it (Arjun's phone, 25 September 2026: "the image bubble appearance needs to
 * have an animation").
 */
export function picturesOf(
  staged: readonly Staged[],
  thumbAt: (localId: string) => Placed | null,
): StagedPicture[] {
  return staged.flatMap((item) =>
    item.attachment !== undefined && kindOf(item.picked.mimeType) === "image"
      ? [
          {
            attachmentId: item.attachment.id,
            uri: item.thumbUri ?? item.picked.uri,
            ...(item.picture === undefined ? {} : { picture: item.picture }),
            thumb: thumbAt(item.localId),
          },
        ]
      : [],
  );
}

/**
 * Whether a message sent here now for `ids` will wear a route over it (ADR 0081, A2): the room's
 * own rule (`routesIn`) asked of the line the send is about to put in it.
 */
export function routedNow(space: Space, directory: Directory, selfId: string, aim: Aim): boolean {
  const { agents, people } = aimedAt(aim, directory);
  const next: Line = {
    id: "routed-now",
    seq: Number.MAX_SAFE_INTEGER,
    kind: "text",
    authorId: selfId,
    authorKind: "person",
    text: "",
    ts: "",
    addressedTo: agents,
    ...(people.length === 0 ? {} : { addressedPeople: people }),
  };
  return routesIn({ ...space, lines: [...space.lines, next] }, directory).has(next.id);
}

/** Where a send's route starts, when its line will wear one: the capsule's arrow and faces. */
export interface RouteStart {
  readonly to: readonly string[];
  readonly view: Placed | null;
}

/**
 * The words' place in the window, as the send leaves the field, and what was sent; and each
 * photo's, from its chip's thumbnail: asked before the send has emptied the field and taken the
 * chips. Only a message flies: a command puts no line in the room. Words that cannot be placed
 * fly nothing, photos included — a picture flown beside words that had not would land under a
 * bubble that rose in on its own. Where the line will wear a route, the capsule's arrow and faces
 * are placed too, to fly up with the words and become it (ADR 0081).
 *
 * And where the field reckons their bubble will come to rest, so the words can set off for it at
 * once rather than wait for the room to draw it: its foot a gap above the bar, whose top is a gap
 * above a field of one line, centred on Send — the room holds its newest line `SPACE.md` clear of
 * the bar (`SpaceView.tsx`), and the bar is padded by as much again.
 */
export function launchOf(
  field: Placed | null,
  send: Placed | null,
  command: Command,
  staged: readonly StagedPicture[] = [],
  routed: RouteStart | undefined = undefined,
): Launch | undefined {
  if (command.kind !== "message") return undefined;
  const words = command.text === "" ? undefined : inWindow(field);
  if (command.text !== "" && (words === undefined || words.width <= 0)) return undefined;
  const pictures = staged.flatMap((each) => {
    const from = inWindow(each.thumb);
    return from === undefined || from.width <= 0
      ? []
      : [
          {
            attachmentId: each.attachmentId,
            uri: each.uri,
            ...(each.picture === undefined ? {} : { picture: each.picture }),
            from,
          },
        ];
  });
  if (words === undefined && pictures.length === 0) return undefined;
  const button = inWindow(send);
  const rest =
    button === undefined ? undefined : button.y + button.height / 2 - FIELD / 2 - 2 * SPACE.md;
  const from = routed === undefined ? undefined : inWindow(routed.view);
  const route =
    routed === undefined || from === undefined || from.width <= 0
      ? undefined
      : { to: routed.to, from };
  return { text: command.text, words, rest, pictures, ...(route === undefined ? {} : { route }) };
}

/**
 * What the empty field says: nothing for a moment after a send's words leave it (`HUSH_MS`); who
 * the words are for, in a room with more than one harness ("Message Everyone"); else that a
 * command goes here too. A room where nobody has said anything asks what the person would like to
 * do in its middle (ADR 0149), so the field does not ask it as well.
 */
function placeholderOf(
  space: Space,
  hushed: boolean,
  aim: Aim | undefined,
  directory: Directory,
): string {
  if (hushed) return "";
  if (space.state === "closed") return "This space is archived";
  return aim === undefined ? "Message, or /command" : messageWords(aim, space, directory);
}

/**
 * Drafts gone, for rooms that are no longer this phone's to come back to: those of a workspace
 * signed out of, whose rooms are named, while the other workspaces keep theirs (ADR 0197); or
 * every one when none is named.
 */
export function forgetDrafts(spaceIds?: readonly string[]): void {
  if (spaceIds === undefined) {
    drafts.clear();
    replies.clear();
  } else {
    for (const spaceId of spaceIds) {
      drafts.delete(spaceId);
      replies.delete(spaceId);
    }
  }
  forgetPicks(spaceIds);
}

/** One room's draft, gone: a room erased from the server (ADR 0067) has nowhere to send it. */
export function forgetDraft(spaceId: string): void {
  drafts.delete(spaceId);
  replies.delete(spaceId);
  keepPick(spaceId, undefined);
}

/**
 * The reply this room's draft holds (ADR 0219), started from the room (`startReply`): the field
 * takes the keys as it starts. × or a send lets it go; a pick after it leaves it standing, but no
 * longer saying who the draft is for.
 */
function useReplying(spaceId: string, input: RefObject<TextInput | null>) {
  const [replying, setReplying] = useState(() => replies.get(spaceId));
  useEffect(() => {
    const start = () => {
      setReplying(replies.get(spaceId));
      input.current?.focus();
    };
    replyFields.set(spaceId, start);
    return () => {
      if (replyFields.get(spaceId) === start) replyFields.delete(spaceId);
    };
  }, [spaceId, input]);
  const keep = useCallback(
    (next: Replying | undefined) => {
      if (next === undefined) replies.delete(spaceId);
      else replies.set(spaceId, next);
      setReplying(next);
    },
    [spaceId],
  );
  const clear = useCallback(() => keep(undefined), [keep]);
  const picked = useCallback(() => {
    const now = replies.get(spaceId);
    if (now?.decides === true) keep({ ...now, decides: false });
  }, [spaceId, keep]);
  // The line replied to, and the same while it says who the draft is for.
  const lineId = replying?.lineId;
  const deciding = replying?.decides === true ? lineId : undefined;
  return { lineId, deciding, clear, picked };
}

/** The field of each room drawn now, by space, for words put in it from outside. */
const fields = new Map<string, (text: string) => void>();

/**
 * Put words in a room's field, as if typed, or empty it: the demo's film fills the composer with
 * the ask You is about to send (ADR 0213). A room not drawn finds them as its draft when it is.
 */
export function fillField(spaceId: string, text: string): void {
  if (text === "") drafts.delete(spaceId);
  else drafts.set(spaceId, text);
  fields.get(spaceId)?.(text);
}

/**
 * Who the draft is for (ADR 0081): the pick that makes it so, whether the field is open into the
 * list that picks, and the faces a send measures. While a finger is over a face in the column
 * (ADR 0229), `peek` is that face's pick, and `shown` is who the draft would be for if it let go
 * there: the faces and the empty field say that, and nothing is kept until it does.
 */
function useAddress(
  space: Space,
  directory: Directory,
  selfId: string,
  text: string,
  onOpen: ((close: (() => void) | undefined) => void) | undefined,
  reply: { readonly deciding: string | undefined; readonly picked: () => void },
  peek: AimPick | undefined,
) {
  // Kept on this phone, so it is there when the person comes back to the room (`picks.ts`).
  const [pick, setPick] = useState(() => pickFor(space.id));
  const [open, setOpen] = useState(false);
  const routeRef = useRef<View>(null);
  const { deciding } = reply;
  const aim = useMemo(
    () => aimOf(text, pick, space, directory, selfId, deciding),
    [text, pick, space, directory, selfId, deciding],
  );
  // The list is only for a draft with somebody to aim at; the room hears when it opens and closes.
  const listed = open && aim !== undefined;
  const toggle = () => setOpen((now) => !now);
  // A pick after a reply was started says who the draft is for from then on (ADR 0219).
  const choose = (next: AimPick) => {
    setPick(next);
    keepPick(space.id, next);
    reply.picked();
    setOpen(false);
  };
  // An agent's circle (ADR 0114): it joins who the draft is for, or leaves, and the list stays.
  const add = (id: string) => {
    if (aim === undefined) return;
    const next = addedTo(aim, pick, id, space, directory);
    setPick(next);
    keepPick(space.id, next);
    reply.picked();
  };
  // Sent: the next message goes where this one did, which is what the faces say with no pick.
  const sent = () => {
    setPick(undefined);
    keepPick(space.id, undefined);
    setOpen(false);
  };
  const close = useCallback(() => setOpen(false), []);
  // A change of light or dark closes the list, as a tap on the room does. The system's glass
  // redraws a piece of glass this tall in the new appearance only when its size changes: switched
  // with the list open, the field stayed light glass in a dark room until it closed, whatever it
  // was told (28 September 2026; a fresh effect and a cleared one were both tried on the simulator).
  const scheme = useScheme();
  const drawnIn = useRef(scheme);
  useEffect(() => {
    if (drawnIn.current === scheme) return;
    drawnIn.current = scheme;
    setOpen(false);
  }, [scheme]);
  useEffect(() => {
    onOpen?.(listed ? close : undefined);
  }, [listed, close, onOpen]);
  useEffect(() => () => onOpen?.(undefined), [onOpen]);
  // Everyone as Everyone, rather than a list that holds them all: the list's rows say which.
  const whole = aim !== undefined && aimsAtEveryone(aim, pick);
  // There is somebody to aim at whatever is picked, so this is there exactly when `aim` is.
  const shown = useMemo(
    () =>
      peek === undefined || aim === undefined
        ? aim
        : (aimOf(text, peek, space, directory, selfId, deciding) ?? aim),
    [aim, peek, text, space, directory, selfId, deciding],
  );
  return { aim, shown, whole, listed, routeRef, toggle, choose, add, sent, close };
}

/**
 * The column of faces a finger slides up from the field's faces (ADR 0229): what it holds, which
 * is the field's list's choices, and the one under the finger, whose pick the field shows until it
 * lets go.
 */
function useUnderFinger(space: Space, directory: Directory, selfId: string) {
  const choices = useMemo(() => choicesOf(space, directory, selfId), [space, directory, selfId]);
  const [lit, setLit] = useState(-1);
  return { choices, lit, setLit, peek: choices[lit]?.pick };
}

type UnderFinger = ReturnType<typeof useUnderFinger>;

/**
 * The pan on the field's faces (ADR 0229): it slides while the list is shut, ticks for each face it
 * comes over, and picks the one it lets go on, alone, as a tap on a name in the list does.
 */
function useSlide(
  under: UnderFinger,
  address: {
    readonly aim: Aim | undefined;
    readonly listed: boolean;
    readonly choose: (pick: AimPick) => void;
  },
  room: number | undefined,
  measure: () => void,
) {
  return useFaceSlide({
    faces: under.choices.length - 1,
    room,
    enabled: SLIDES && address.aim !== undefined && !address.listed,
    onTouch: measure,
    onLit: (index) => {
      under.setLit(index);
      if (index >= 0) feel.tick();
    },
    onPick: (index) => {
      const choice = under.choices[index];
      if (choice !== undefined) address.choose(choice.pick);
    },
  });
}

/** The column, standing over the faces, where the field says who a message goes to (ADR 0229). */
function ColumnOverField({
  slide,
  under,
  directory,
  addressed,
  plus,
}: {
  readonly slide: FaceSlide;
  readonly under: UnderFinger;
  readonly directory: Directory;
  readonly addressed: boolean;
  /** Whether the + stands before the field in its row. */
  readonly plus: boolean;
}) {
  if (!addressed || !SLIDES) return null;
  return (
    <FaceColumn
      slide={slide}
      choices={under.choices}
      directory={directory}
      lit={under.lit}
      left={(plus ? FIELD + SPACE.sm : 0) + (FIELD - TOKEN) / 2 + RISE_AT - COLUMN_WIDTH / 2}
    />
  );
}

/**
 * How tall the list may stand while it is open (`listRoom`, ADR 0113): measured from where the
 * field's words are in the window when it opens, and again when the keys have come or gone, since
 * the room makes way for them and the field moves with it. The column of faces stands in the same
 * room (ADR 0229), and asks for a measure as a finger lands on the faces, before it rises.
 */
function useListRoom(
  open: boolean,
  row: RefObject<View | null>,
  bar: number,
): readonly [number | undefined, () => void] {
  const window = useWindowDimensions().height;
  const [room, setRoom] = useState<number | undefined>(undefined);
  const measure = useCallback(
    () =>
      row.current?.measureInWindow((_x, top, _width, height) => {
        if (height > 0) setRoom(listRoom(window, { top, height }, bar));
      }),
    [row, bar, window],
  );
  useEffect(() => {
    if (!open) return;
    measure();
    const shown = Keyboard.addListener("keyboardDidShow", measure);
    const hidden = Keyboard.addListener("keyboardDidHide", measure);
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [open, measure]);
  return [room, measure];
}

/**
 * Where the words stand beside the faces at the front of the field (Arjun's A): on their line,
 * after the faces, while they fit there; once they would wrap beside them, above them, the width of
 * the field, with the faces and Send on a line of their own under the words (Arjun, 28 September
 * 2026: "make the words run full width once they wrap"). Whether they would wrap is asked of a
 * twin laid out at the width beside the faces, whichever way the words stand now, so the field
 * does not flip between the two. The faces stand in the field's corner either way, and the words
 * move round them, so the field is never taken apart and the caret stays where it is.
 */
function useStacking(addressed: boolean) {
  const [tokenWidth, setTokenWidth] = useState(0);
  const [wraps, setWraps] = useState(false);
  const onToken = useCallback(
    (event: LayoutChangeEvent) => setTokenWidth(event.nativeEvent.layout.width),
    [],
  );
  const onNarrow = useCallback(
    (event: LayoutChangeEvent) => setWraps(event.nativeEvent.layout.height > LINE * 1.5),
    [],
  );
  const stacked = addressed && wraps;
  const beside = tokenWidth + SPACE.sm;
  return {
    stacked,
    onToken,
    onNarrow,
    // The twin that asks: as wide as the words would be beside the faces and Send.
    narrow: { left: FIELD_INSET + beside, right: FIELD_INSET + SEND + SPACE.sm },
    words: !addressed
      ? null
      : stacked
        ? { marginLeft: SPACE.sm, marginBottom: TOKEN + SPACE.sm }
        : { marginLeft: beside },
  };
}

/** Where a send's route starts, when its line will wear one (`routedNow`). */
function routeStart(
  aim: Aim | undefined,
  view: Placed | null,
  space: Space,
  directory: Directory,
  selfId: string,
): RouteStart | undefined {
  if (aim === undefined || !routedNow(space, directory, selfId, aim)) return undefined;
  return { to: aim.ids, view };
}

/**
 * What the empty field says, on one line, ending in "…" where it is too long for it (ADR 0113).
 * The input's own placeholder wrapped, as a field of several lines wraps everything, and the one
 * line an empty field is cut "Message Everyone" down to "Message". It stays the input's, unseen,
 * for a screen reader to say.
 */
function EmptyWords({ shown, words }: { readonly shown: boolean; readonly words: string }) {
  const palette = usePalette();
  if (!shown) return null;
  return (
    <View style={styles.hintAt} pointerEvents="none">
      <Text
        numberOfLines={1}
        style={[styles.input, { color: palette.ink3 }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="composer-hint"
      >
        {words}
      </Text>
    </View>
  );
}

/** What stands over the field: a command's own notice, or what the room was told. */
function NoticeOver({ said }: { readonly said: string | undefined }) {
  const palette = usePalette();
  if (said === undefined) return null;
  return (
    <Aside>
      <Text style={[styles.notice, { color: palette.amberInk }]} testID="composer-notice">
        {said}
      </Text>
    </Aside>
  );
}

export function Composer({
  store,
  space,
  run,
  directory,
  selfId,
  disabled = false,
  files,
  caps,
  onSent,
  onAddressOpen,
  roomNotice,
  bar = 0,
}: {
  readonly store: Store;
  readonly space: Space;
  readonly run: Run | undefined;
  readonly directory: Directory;
  /** Who is typing: whose last message here says where the next one goes (ADR 0081). */
  readonly selfId: string;
  readonly disabled?: boolean;
  /** How a file is uploaded and kept on this phone. Absent, and nothing can be attached. */
  readonly files?: FileService | undefined;
  /** What may be attached here (ADR 0047). */
  readonly caps?: AttachmentCaps | undefined;
  /**
   * A message went, and a line is landing: the room takes the reader to the foot to see it. With
   * the words and where they were in the field, for the room to fly them to their bubble
   * (`SendFlight.tsx`), when they are all the message is.
   */
  readonly onSent?: ((launch: Launch | undefined) => void) | undefined;
  /**
   * The field opened into the list of who a message goes to, with the way to close it, or closed:
   * a tap on the room or beside the list closes it (`TapAway` and `Foot`, in `SpaceView.tsx`), as
   * a tap off a menu does.
   */
  readonly onAddressOpen?: ((close: (() => void) | undefined) => void) | undefined;
  /**
   * What the server said of a change to who is in this room that it turned away (agents review,
   * finding 13): said here, over the field, where a command's own notice goes.
   */
  readonly roomNotice?: string | undefined;
  /**
   * Where the room's bar ends, from the top of the window: the list the field opens into stops
   * under it (ADR 0113).
   */
  readonly bar?: number | undefined;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  // Whether this is a capsule over the room or the bar it used to be (`ui/Glass.tsx`).
  const glassy = useGlassy();
  // The keyboard follows the theme, or a dark room gets a white slab across its bottom half.
  const keyboard = useScheme();
  const input = useRef<TextInput>(null);
  const column = useColumn();
  // On an iPad with the list away, the room starts under the tabs' capsule: its foot keeps clear.
  const clear = useFootClear();
  const [text, setText] = useState(() => drafts.get(space.id) ?? "");
  const [measured, setMeasured] = useState<number | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [sheet, setSheet] = useState(false);
  // The +, which on an iPad the sheet opens beside.
  const plusRef = useRef<View>(null);
  const sent = useRef<Sent | undefined>(undefined);
  const [hushed, hush] = useHush();
  const staged = useStaged(files, caps);
  useDropStaging(files !== undefined, staged.add);
  const look = useLook();
  const reply = useReplying(space.id, input);
  const under = useUnderFinger(space, directory, selfId);
  const address = useAddress(space, directory, selfId, text, onAddressOpen, reply, under.peek);
  const { aim, shown, listed } = address;
  const fieldRow = useRef<View>(null);
  const [most, measureRoom] = useListRoom(listed, fieldRow, bar);
  const stack = useStacking(aim !== undefined);
  const slide = useSlide(under, address, most, measureRoom);
  const uploading = staged.staged.some((item) => item.status === "uploading");
  const ready = staged.staged.some((item) => item.status === "ready");
  const canSend = !disabled && !uploading && (text.trim() !== "" || ready);

  // Words put in from outside the room (`fillField`): the demo's ask, before its Send (ADR 0213).
  useEffect(() => {
    const id = space.id;
    const fill = (next: string) => {
      sent.current = undefined;
      setText(next);
    };
    fields.set(id, fill);
    return () => {
      if (fields.get(id) === fill) fields.delete(id);
    };
  }, [space.id]);

  // A new agent asked for from this phone has joined (ADR 0108): an empty field holds its @, ready
  // for its first job. Taken once, so a field emptied since is left empty.
  const made = space.made;
  useEffect(() => {
    if (made === undefined) return;
    const handle = store.takeArrival(space.id);
    if (handle === undefined) return;
    setText((now) => {
      if (now.trim() !== "") return now;
      drafts.set(space.id, `${handle} `);
      return `${handle} `;
    });
  }, [made, space.id, store]);

  const send = () => {
    const typed = text.trim();
    if (typed === "" && !ready) return;
    const attachments = staged.staged.flatMap((item) =>
      item.attachment === undefined ? [] : [item.attachment],
    );
    const command = parseCommand(typed);
    // Asked before the send puts its line in the room, which would make it the last one.
    const routed = routeStart(aim, address.routeRef.current, space, directory, selfId);
    const said = act(
      command,
      { store, spaceId: space.id, run, space, directory, aim, replyTo: reply.lineId },
      attachments,
    );
    setNotice(said);
    // A refusal keeps the words and the files: retyping a command somebody got slightly wrong
    // is the whole annoyance of a composer that clears itself.
    if (said !== undefined) return;
    went(
      command,
      launchOf(
        input.current,
        look.sendRef.current,
        command,
        picturesOf(staged.staged, look.thumbAt),
        routed,
      ),
    );
  };

  // What a send that went leaves of the bar: nothing of what it said.
  const went = (command: Command, launch: Launch | undefined) => {
    hush(launch);
    // The one confirmation a thumb gets for a message it cannot see land — the room may have
    // scrolled, the keyboard is over half the screen. A refusal is silent on purpose: the
    // notice above the field is already saying it, and a buzz would read as sent.
    feel.tap();
    sent.current = text === "" ? undefined : { text, at: Date.now() };
    setText("");
    drafts.delete(space.id);
    staged.take();
    // A message puts a line in the room and the room goes to it, and the next goes where it
    // went. A command that was carried out puts none — nothing landed, so there is nothing to go
    // to.
    if (command.kind === "message") {
      address.sent();
      reply.clear();
      onSent?.(launch);
    }
  };

  const type = (next: string) => {
    if (isEcho(sent.current, next, Date.now())) return;
    sent.current = undefined;
    // Writing, not picking: the field closes back to one line.
    address.close();
    setText(next);
    if (next === "") drafts.delete(space.id);
    else drafts.set(space.id, next);
    if (notice !== undefined) setNotice(undefined);
    if (roomNotice !== undefined) store.dismissNotice(space.id);
  };

  // The sheet stays up while the picker is out, and goes when it has come back (see
  // `AttachSheet`); what came back is staged, or its refusal said.
  const choose = async (source: Source) => {
    try {
      const picking = await pick(source);
      if ("refused" in picking) setNotice(picking.refused);
      else staged.add(picking.picked);
    } finally {
      setSheet(false);
    }
  };

  return (
    <View
      testID="composer-bar"
      style={[
        styles.bar,
        // Floating, this has no ground at all: the band behind it is the room's (`SpaceView`),
        // and what stands on it is the capsule. Painted, the ground runs to the edge of the
        // screen as it always did, and it is the words and the button that stand off it.
        glassy
          ? null
          : {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderColor: palette.line,
              backgroundColor: palette.bg,
            },
        { paddingBottom: SPACE.md + insets.bottom },
      ]}
    >
      <NoticeOver said={notice ?? roomNotice} />
      {staged.staged.length === 0 ? null : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.strip, column]}
          accessibilityRole="list"
          accessibilityLabel="Attachments"
          testID="staged"
        >
          {staged.staged.map((item) => (
            <Chip
              key={item.localId}
              item={item}
              looked={look.up === item.localId}
              thumbRef={look.thumbRef(item.localId)}
              onLook={() => void look.open(item)}
              onRemove={() => staged.remove(item.localId)}
              onRetry={() => staged.retry(item.localId)}
            />
          ))}
        </ScrollView>
      )}
      <View style={[styles.row, column, clear]}>
        {files === undefined ? null : (
          // A drop of the same glass beside the field, the whole of it the +'s: the mark is bare
          // because the glass is already the surface it needs, and a filled circle on it would
          // be a button on a button.
          <View ref={plusRef} collapsable={false}>
            <Capsule style={styles.plus} interactive>
              <IconButton
                icon="plus"
                label="Attach"
                tone="bare"
                size={SEND}
                testID="composer-attach"
                disabled={disabled}
                // The keyboard goes down as the sheet comes up: on iOS it is a window above every
                // other, and a sheet rising under it would arrive half hidden.
                onPress={() => {
                  Keyboard.dismiss();
                  setSheet(true);
                }}
              />
            </Capsule>
          </View>
        )}
        {/*
         * The box is the target, not the glyphs in it: a press on the padding, or on the empty
         * half of a line holding one word, puts the caret in — and the ground darkens under the
         * press, so the thumb knows it landed. Not an element of its own to a screen reader —
         * the input it holds is the thing to announce, and announcing both says "Message"
         * twice and offers a button that does what tapping the field already does.
         *
         * The capsule is the shape and the material; the press and the row are inside it. The
         * wash a press lays down is rounded to the capsule's own corner rather than clipped to
         * it, because the system's glass is not clipped (`Capsule`).
         */}
        <Capsule style={styles.capsule} interactive grows>
          {aim === undefined || !listed ? null : (
            <AddressList
              aim={aim}
              space={space}
              directory={directory}
              selfId={selfId}
              onPick={address.choose}
              onAdd={address.add}
              whole={address.whole}
              most={most}
            />
          )}
          <ReplyStrip
            space={space}
            lineId={reply.lineId}
            directory={directory}
            selfId={selfId}
            onClose={reply.clear}
          />
          {/*
           * The words' row moves inside the glass by as much as the glass grows, on the same
           * transition, so as the field opens upward the row stays where the thumb left it. When
           * the row itself grows, for a line typed, its top rises with the glass's and the words
           * with it; what stands at its foot, the faces and Send, moves on the same transition
           * the other way, and stays where it was.
           */}
          <GrowingView layout={GROWS}>
            <Pressable
              ref={fieldRow}
              testID="composer-field"
              accessible={false}
              onPress={() => input.current?.focus()}
              style={({ pressed }) => [
                styles.field,
                aim === undefined ? null : styles.addressed,
                pressed ? { backgroundColor: alpha(palette.surface2, 0.6) } : null,
              ]}
            >
              {shown === undefined ? null : (
                <>
                  <GrowingView
                    style={styles.tokenAt}
                    layout={GROWS}
                    onLayout={stack.onToken}
                    testID="composer-token"
                  >
                    <FaceSlideOn slide={slide}>
                      <AddressToken
                        aim={shown}
                        space={space}
                        directory={directory}
                        open={listed}
                        onPress={address.toggle}
                        routeRef={address.routeRef}
                      />
                    </FaceSlideOn>
                  </GrowingView>
                  {/* The words as they would sit beside the faces: whether they wrap there. */}
                  <Text
                    style={[styles.input, styles.twin, stack.narrow]}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    onLayout={stack.onNarrow}
                    testID="composer-narrow-twin"
                  >
                    {twinOf(text)}
                  </Text>
                </>
              )}
              {/*
               * The words and their twin, as tall as they need and no taller: the circle beside
               * them is measured from this rather than from the field, so a message six lines long
               * leaves Send on the bottom line where the thumb left it.
               */}
              <View style={[styles.words, stack.words]} testID="composer-words">
                <Text
                  style={[styles.input, styles.twin]}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  onLayout={(event) => setMeasured(event.nativeEvent.layout.height)}
                  testID="composer-twin"
                >
                  {twinOf(text)}
                </Text>
                <EmptyWords
                  shown={text === ""}
                  words={placeholderOf(space, hushed, shown, directory)}
                />
                <TextInput
                  ref={input}
                  accessibilityLabel="Message"
                  testID="composer"
                  value={text}
                  onChangeText={type}
                  placeholder={placeholderOf(space, hushed, aim, directory)}
                  placeholderTextColor="transparent"
                  editable={!disabled}
                  keyboardAppearance={keyboard}
                  multiline
                  // A phone on its side keeps the room in sight over the keys: Android's own
                  // full-screen field took the whole screen above them (the emulator, 16
                  // October 2026).
                  disableFullscreenUI
                  // Empty, one line, without waiting for the twin to say so.
                  style={[
                    styles.input,
                    { color: palette.ink, height: text === "" ? LINE : heightFor(measured) },
                  ]}
                />
              </View>
              {/* Measured for a staged photo's viewer, which draws its own Send exactly here. */}
              <GrowingView ref={look.sendRef} collapsable={false} layout={GROWS}>
                <IconButton
                  icon="up"
                  label="Send"
                  size={SEND}
                  testID="composer-send"
                  disabled={!canSend}
                  onPress={send}
                />
              </GrowingView>
            </Pressable>
          </GrowingView>
        </Capsule>
        <ColumnOverField
          slide={slide}
          under={under}
          directory={directory}
          addressed={aim !== undefined}
          plus={files !== undefined}
        />
      </View>
      {look.looking === undefined ? null : (
        <StagedViewer
          looking={look.looking}
          sendDisabled={!canSend}
          onSend={send}
          chip={look.chip}
          onUp={look.came}
          onGone={look.gone}
        />
      )}
      {files === undefined ? null : (
        <AttachSheet
          open={sheet}
          from={plusRef}
          onPick={(source) => void choose(source)}
          onRecorded={(picked) => {
            staged.add([picked]);
            setSheet(false);
          }}
          onClose={() => setSheet(false)}
        />
      )}
    </View>
  );
}

/**
 * What a chip says under the name: where the upload has got to, or what came of it. A file that
 * goes up in one piece says nothing more; a longer one says how far it has got. Sound is heard by
 * the server before the upload answers, which is most of a voice note's wait (ADR 0054), so its
 * chip says so; once it is in, how long it runs.
 */
function metaOf(item: Staged): string {
  const sound = kindOf(item.picked.mimeType) === "audio";
  if (item.status === "uploading") {
    const progress = item.progress ?? 0;
    if (progress > 0 && progress < 1) return `uploading… ${Math.floor(progress * 100)}%`;
    return sound ? "uploading and transcribing…" : "uploading…";
  }
  if (item.status === "failed") return item.error ?? "failed";
  const durationMs = item.attachment?.durationMs;
  if (sound && durationMs !== undefined) return formatDuration(durationMs);
  return formatBytes(item.attachment?.byteSize ?? item.picked.size ?? 0);
}

/**
 * A staged photo looked at in the viewer: which one, the chip thumbnails and Send to measure, and
 * the viewer's way home. A chip whose photo is up on the stage hides its thumbnail, as a room's
 * tile does — once the viewer is up over it and has drawn the picture (`onUp`), and not before,
 * or the chip would be a hole while the picture is still being decoded — until the viewer has
 * flown back into it.
 */
function useLook() {
  const [looking, setLooking] = useState<Looking | undefined>(undefined);
  const [up, setUp] = useState<string | undefined>(undefined);
  const thumbs = useRef(new Map<string, View | null>());
  const sendRef = useRef<View>(null);
  const shown = useRef<string | undefined>(undefined);
  const thumbRef = useCallback(
    (localId: string) => (view: View | null) => {
      thumbs.current.set(localId, view);
    },
    [],
  );
  const open = async (item: Staged) => {
    if (shown.current !== undefined) return;
    shown.current = item.picked.uri;
    const { picked } = item;
    const opened = await lookAt(
      {
        localId: item.localId,
        name: picked.name,
        mimeType: picked.mimeType,
        uri: picked.uri,
        byteSize: item.attachment?.byteSize ?? picked.size,
        width: picked.width,
        height: picked.height,
      },
      thumbs.current.get(item.localId),
      sendRef.current,
    );
    if (opened === undefined) shown.current = undefined;
    else setLooking(opened);
  };
  const chip = useCallback(async () => {
    const localId = looking?.photo.localId;
    return localId === undefined ? undefined : measureView(thumbs.current.get(localId));
  }, [looking]);
  const came = useCallback(
    () => setUp(shown.current === undefined ? undefined : looking?.photo.localId),
    [looking],
  );
  const gone = useCallback(() => {
    shown.current = undefined;
    setUp(undefined);
    setLooking(undefined);
  }, []);
  // A chip's thumbnail, for a send to fly the photo from (`SendFlight.tsx`).
  const thumbAt = useCallback((localId: string) => thumbs.current.get(localId) ?? null, []);
  return { looking, up, sendRef, thumbRef, thumbAt, open, chip, came, gone };
}

/** One picked file, on its way or refused: a thumbnail or a clip, the name, and the ×. */
function Chip({
  item,
  looked,
  thumbRef,
  onLook,
  onRemove,
  onRetry,
}: {
  readonly item: Staged;
  /** Its photo is up in the viewer, which draws it: the chip does not. */
  readonly looked: boolean;
  readonly thumbRef: (view: View | null) => void;
  /** Open the viewer over the photo. */
  readonly onLook: () => void;
  readonly onRemove: () => void;
  readonly onRetry: () => void;
}) {
  const palette = usePalette();
  const failed = item.status === "failed";
  const kind = kindOf(item.picked.mimeType);
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: palette.surface2, borderColor: failed ? palette.red : palette.line },
      ]}
      testID={`staged-${item.localId}`}
    >
      {kind === "image" ? (
        <ChipThumb item={item} looked={looked} thumbRef={thumbRef} onLook={onLook} />
      ) : kind === "video" ? (
        <ChipFrame item={item} />
      ) : (
        <View style={styles.chipMark}>
          <Icon name={kind === "audio" ? "mic" : "clip"} color={palette.ink2} size={18} />
        </View>
      )}
      <View style={styles.chipWords}>
        <Text numberOfLines={1} style={[styles.chipName, { color: palette.ink }]}>
          {item.picked.name}
        </Text>
        <Text
          numberOfLines={2}
          style={[styles.chipMeta, { color: failed ? palette.red : palette.ink3 }]}
        >
          {metaOf(item)}
        </Text>
        {failed && item.refused !== true ? (
          <Text
            accessibilityRole="button"
            style={[styles.chipRetry, { color: palette.blueInk }]}
            onPress={onRetry}
          >
            Try again
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${item.picked.name}`}
        hitSlop={8}
        onPress={onRemove}
        style={styles.chipRemove}
        testID={`remove-${item.localId}`}
      >
        <Text style={[styles.chipX, { color: palette.ink2 }]}>×</Text>
      </Pressable>
    </View>
  );
}

/**
 * A staged photo's thumbnail, which opens the viewer over it. One the workspace refused is not
 * one to look at before sending, since it will not go: it is a picture only.
 *
 * The picture shown is the picker's file, drawn by the platform's own image, which decodes a
 * camera's photo down to forty points off the main thread. Under it, unseen, the room's
 * thumbnail of the same photo once it has come (`useStaged`), drawn by the image the room's tiles
 * and the send's copy are drawn with: what that image has drawn once it holds decoded, and the
 * copy that leaves this chip on a send has its picture in its first frame rather than a tenth of
 * a second in, and the tile the room draws has the same picture the moment it shows.
 */
function ChipThumb({
  item,
  looked,
  thumbRef,
  onLook,
}: {
  readonly item: Staged;
  readonly looked: boolean;
  readonly thumbRef: (view: View | null) => void;
  readonly onLook: () => void;
}) {
  const lookable = item.refused !== true;
  return (
    <Pressable
      ref={thumbRef}
      accessibilityRole={lookable ? "imagebutton" : undefined}
      accessibilityLabel={lookable ? `Look at ${item.picked.name}` : undefined}
      disabled={!lookable}
      onPress={onLook}
      style={[styles.chipThumb, looked ? styles.away : null]}
      testID={`staged-thumb-${item.localId}`}
    >
      {item.thumbUri === undefined ? null : (
        <Picture
          source={{ uri: item.thumbUri }}
          contentFit="cover"
          style={styles.warm}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID={`staged-warm-${item.localId}`}
        />
      )}
      <Image
        source={{ uri: item.picked.uri }}
        style={styles.chipThumbImage}
        accessibilityIgnoresInvertColors
      />
    </Pressable>
  );
}

/**
 * A staged video's first frame, read from the picked file on the phone (`firstFrame.ts`), with the
 * triangle the viewer's filmstrip wears where a disc would crowd it (`PlayMark`), so it is not
 * taken for a photo. Its mark until the frame is read, or where it cannot be.
 */
function ChipFrame({ item }: { readonly item: Staged }) {
  const palette = usePalette();
  const frame = useFirstFrame(item.picked.uri);
  if (frame === undefined) {
    return (
      <View style={styles.chipMark} testID={`staged-mark-${item.localId}`}>
        <Icon name="clip" color={palette.ink2} size={18} />
      </View>
    );
  }
  return (
    <View style={styles.chipThumb} testID={`staged-frame-${item.localId}`}>
      <Picture
        source={frame}
        contentFit="cover"
        style={styles.chipThumbImage}
        accessibilityIgnoresInvertColors
        testID={`staged-frame-picture-${item.localId}`}
      />
      <View style={styles.chipPlay}>
        <PlayMark size={16} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { padding: SPACE.md, gap: SPACE.sm },
  // The circle sits at the bottom of the row, so it stays put while the field grows upward.
  row: { flexDirection: "row", gap: SPACE.sm, alignItems: "flex-end" },
  notice: { fontSize: TEXT.sm },
  strip: { gap: SPACE.sm, paddingVertical: 2 },
  // The capsule is the shape and the material — a thumb's minimum tall, and a corner half of
  // that, so one line is a pill and six are a rounded box. The hairline and the ground are the
  // capsule's own (`ui/Glass.tsx`), which is the whole of what changed when it began to float.
  capsule: { flex: 1, minHeight: FIELD, borderRadius: FIELD / 2 },
  // The + beside it, the field's height and round: one drop of the same glass.
  plus: {
    width: FIELD,
    height: FIELD,
    borderRadius: FIELD / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  // And the row is inside it: the padding belongs here rather than to the text, so that all of
  // it can be pressed. Send sits at the bottom of the row, nine points off the edge, so it stays
  // put while the words grow above it. The corner is the capsule's, for the press's wash.
  field: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SPACE.sm,
    minHeight: FIELD,
    borderRadius: FIELD / 2,
    paddingLeft: SPACE.xl,
    paddingRight: (FIELD - SEND) / 2,
    paddingVertical: (FIELD - SEND) / 2,
  },
  // With the faces at its front, the field starts at them: the token centred on one line, as Send
  // is, and the words after it (or over it, once they wrap: `useStacking`).
  addressed: { paddingLeft: (FIELD - TOKEN) / 2 },
  // The faces in the field's bottom corner, where one line centres them, whatever the words do.
  tokenAt: { position: "absolute", left: (FIELD - TOKEN) / 2, bottom: FIELD_INSET },
  // At least as tall as the circle, with one line of words centred on it; taller than the
  // circle, and the words fill it and the circle stays at the foot.
  words: { flex: 1, minHeight: SEND, justifyContent: "center" },
  // Six lines or so and it stops growing and starts scrolling: a composer that eats the room it
  // is for is worse than one you have to scroll.
  input: { maxHeight: INPUT_MAX, padding: 0, fontSize: TEXT.body, lineHeight: LINE },
  // The empty field's words, over the input where its own placeholder would stand.
  hintAt: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center" },
  // Under the field, exactly as wide as the words beside it — it shares their box, so it needs
  // no inset of its own — and unseen, but laid out: that is the whole point.
  twin: { position: "absolute", top: 0, left: 0, right: 0, maxHeight: undefined, opacity: 0 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACE.sm,
    maxWidth: 260,
  },
  chipThumb: { width: 40, height: 40, borderRadius: RADIUS.sm, overflow: "hidden" },
  chipThumbImage: { width: "100%", height: "100%" },
  // The room's thumbnail, decoded here and kept warm, under the picture the chip shows.
  warm: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0 },
  // A thumbnail whose photo is up on the viewer's stage: the stage draws it, so the chip does not.
  away: { opacity: 0 },
  chipMark: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  chipPlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  chipWords: { flexShrink: 1, gap: 2 },
  chipName: { fontSize: TEXT.sm, fontWeight: "600" },
  chipMeta: { fontSize: TEXT.xs },
  chipRetry: { fontSize: TEXT.xs, fontWeight: "600" },
  chipRemove: { paddingHorizontal: SPACE.xs },
  chipX: { fontSize: TEXT.lg, lineHeight: TEXT.lg * 1.1 },
});
