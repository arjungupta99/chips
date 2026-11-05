/**
 * What the harness is doing, while it is doing it, as a bubble in the room — and gone the moment
 * it answers.
 *
 * Telegram's thinking bubble is the shape, and it is the one Arjun asked for (11 September
 * 2026): a message from the harness, live, saying what it is doing now, and deleted when the
 * reply lands. What it says comes from core (`spaceDoing`, read by `bubbleSays`), which the
 * desktop reads too.
 *
 * It stands at the room's foot, under the newest line, and stays there while the room moves above
 * it: a reply that lands while it works rises in over it with the rows above, and it does not
 * move. It arrives rising a little as it fades in, and goes by fading where it stood while the
 * room closes over it (`Coming`, in `RoomMotion.tsx`, ADR 0074).
 *
 * It holds still while the work goes on (ADR 0147). Until 10 October 2026 it was one slot of text
 * that four voices took turns to write — a line of reasoning, Jacobian's `Writing…` before every
 * tool call, the reply's first words as they streamed, and the call in hand — and every rewrite
 * rolled the words, fired a sheen and gave the bubble a new size: fourteen shapes in a
 * forty-five-second turn, the room moving 642 points under it, the reply shown cut off and then
 * said again (Arjun: "super jumpy"). Now it has one shape, and each part one job:
 *
 * - the top line: the dots, what kind of work this is — *Searching the web*, *Reading a page* —
 *   and a clock, how long the turn has taken;
 * - under it, the detail: what the call was given, beside its glyph, or a thought's first
 *   sentence, OpenClaw's summary of a step, or a tally of the calls so far;
 * - and from the first call, a strip of glyphs, a call apiece (`CallStrip.tsx`).
 *
 * Each word stays up for a beat before another may take its place (core's `holdSays`), so a burst
 * of calls is read as the last of them rather than flickered through, and a change crossfades
 * where it stands: the old words out in 120 ms, the new in over 200 ms, rising three points.
 * Nothing rolls, nothing crosses the bubble, and its width never changes. It comes two lines tall
 * and opens once, by the strip's row, with the first words said after the first call, on the
 * room's transition (`Moving`); a turn that calls nothing never grows, and the row, once open,
 * stays open while the bubble stands — the two-line detail Arjun suggested in its place would have
 * left a line standing empty for four to seven seconds of most of Jacobian's turns, which have
 * nothing to say before their first call (the mocks, 10 October 2026).
 *
 * It waits a beat before it comes (ADR 0050). Jacobian starts its run within a hundred
 * milliseconds of a message landing, and dots that appear in the same breath as the bubble that
 * was just sent read as a tic rather than as somebody thinking (Arjun, 11 September 2026). So
 * the bubble comes `THINKING_GRACE_MS` after the run begins, and never before the person's own
 * line has been confirmed and its words have landed from the field (`SendFlight.tsx`): the beat
 * counts from the later of the two (Arjun's pick of B, 4 October 2026). A run that answers inside
 * the beat shows no bubble at all. It still leaves the instant the reply lands. A bubble already
 * in the room stays through the next message sent, and says what the run that message started is
 * doing, rather than folding shut and opening again under each one.
 *
 * There is one for each harness at work in the room, a turn's distance apart, each on a beat of
 * its own and gone at once when its own run ends (the OpenClaw test, finding 22). They stand in
 * the order the harnesses first worked in the room, so a bubble never jumps past another.
 *
 * The sign that something is going on is three dots with the light running across them, in the
 * colour of the face beside them (`ui/Dots.tsx`, `lit`; ADR 0126); the face's own pins stay lit
 * and still, one spinner for one agent. The newest glyph on the strip is lit in ink, not in the
 * face's colour (Arjun, 10 October 2026: "for the strip highlight square I need a neutral color").
 *
 * Reduce Motion leaves the dots lit and still, takes the travel out of the arrival, and changes
 * the words at once.
 */

import type { CallKind, ConnectionState, Directory, Doing, Says } from "@chipschat/core";
import { clockWords, doingSays, holdSays, nameOf, THINKING_GRACE_MS } from "@chipschat/core";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { faceProps } from "../agents/face";
import { Avatar, faceGround } from "../ui/Avatar";
import { Dots } from "../ui/Dots";
import { useFacePaint } from "../ui/faceTheme";
import { Icon } from "../ui/Icon";
import { usePalette } from "../ui/theme";
import { BUBBLE, LEADING_PHONE, type Palette, SPACE, TEXT } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";
import { CallStrip, GLYPHS } from "./CallStrip";
import { Coming, Moving } from "./RoomMotion";

/**
 * How long a run has to have been going before the bubble comes; the beat that makes it a thought.
 * Core's, so the Mac's and the web's run panel waits the same beat.
 */
export { THINKING_GRACE_MS };

/** How far below its place the bubble starts. */
const RISE = 12;
/** The top line, a message's size down, and the detail a size below that, at the phone's leading. */
const LINE = Math.round(TEXT.md * LEADING_PHONE);
const DETAIL_LINE = Math.round(TEXT.sm * LEADING_PHONE);
/** The dots' width and the gap after them: the detail and the strip stand under the words. */
const INDENT = 26 + SPACE.sm;
/** The words going, the words coming and how far they rise as they come. */
const OUT_MS = 120;
const IN_MS = 200;
const IN_AFTER_MS = 60;
const IN_RISE = 3;
/** How long after the strip's row starts opening its first glyph comes. */
const STRIP_LEAD_MS = 180;
/** What it has been given is code or an address, and reads as one. */
const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

/**
 * No bubbles, as one list for the life of the app: the foot is memoised on what it draws, and an
 * empty list made afresh would draw it again on every render of a room where nobody is at work.
 */
export const NOBODY: readonly Doing[] = [];

/**
 * The harnesses that have been going for the grace with the person's own line confirmed, each on
 * a beat of its own, and each out again the moment it is not going. A run whose verb or step
 * changes while the beat runs does not restart it: what is waited for is the run, not its latest
 * word. Nor does another harness starting: its beat is its own.
 *
 * The confirmation holds back the arrival and nothing else. A bubble already standing stays
 * standing while the next line goes out: taken down at each send and brought back a beat after
 * the confirmation, it folded shut and opened again under every message typed while the harness
 * worked, and the room dropped and rose with it (Arjun, 23 September 2026).
 */
function useGrace(going: readonly string[], confirmed: boolean): ReadonlySet<string> {
  const [ready, setReady] = useState<ReadonlySet<string>>(() => new Set());
  const beats = useRef(new Map<string, Beat>());
  // The harnesses as one word, since the list is made afresh on every render.
  const key = going.join("\n");
  useEffect(() => {
    const now = new Set(key === "" ? [] : key.split("\n"));
    stopBeats(beats.current, now, confirmed);
    // A harness that stopped goes at once, and waits a whole beat if it starts again.
    setReady((was) => stillGoing(was, now));
    if (!confirmed) return;
    for (const id of now) {
      if (ready.has(id) || beats.current.has(id)) continue;
      const beat = setTimeout(() => {
        beats.current.delete(id);
        setReady((was) => new Set([...was, id]));
      }, THINKING_GRACE_MS);
      beats.current.set(id, beat);
    }
  }, [key, confirmed, ready]);
  // None outlives the room.
  useEffect(() => {
    const pending = beats.current;
    return () => stopBeats(pending, new Set(), false);
  }, []);
  return ready;
}

type Beat = ReturnType<typeof setTimeout>;

/** A beat stops when its harness stops, and while a line of the person's is on its way. */
function stopBeats(beats: Map<string, Beat>, going: ReadonlySet<string>, confirmed: boolean) {
  for (const [id, beat] of beats) {
    if (going.has(id) && confirmed) continue;
    clearTimeout(beat);
    beats.delete(id);
  }
}

/** The harnesses standing that are still going: the same set when every one of them is. */
function stillGoing(ready: ReadonlySet<string>, going: ReadonlySet<string>): ReadonlySet<string> {
  const kept = [...ready].filter((id) => going.has(id));
  return kept.length === ready.size ? ready : new Set(kept);
}

/**
 * What the bubbles show: nothing for a harness until its run has been going for the grace and the
 * person's own line is confirmed, then its doing while it goes, and nothing the moment it has
 * ended — its going is the room's to draw (`Coming`). `doing` is core's `spaceDoing`, a harness
 * apiece, in the order they stand; `confirmed` is whether the newest line in the room is the
 * server's rather than still on its way, and its words are down from the field.
 */
export function useThinking(doing: readonly Doing[], confirmed = true): readonly Doing[] {
  const ready = useGrace(
    doing.map((each) => each.harnessId),
    confirmed,
  );
  // Only a harness still going: one that has stopped is out in this render, not the next.
  const shown = doing.filter((each) => ready.has(each.harnessId));
  return shown.length === 0 ? NOBODY : shown;
}

/**
 * How long the bubbles stay at rest once the socket is open again: the catch-up comes a round trip
 * behind the open, and the end of a turn that came while the room was away lands in it. Lit for
 * the open, the dots ran for a frame and the bubble went under them (the simulator, 14 October
 * 2026). A turn still going lights them again a moment late, which nobody misses.
 */
export const CATCH_UP_MS = 800;

/**
 * Whether the room is in touch with its server, for its bubbles' sake: not while the socket is
 * down, nor for `CATCH_UP_MS` after it is back. A room opened connected is in touch at once.
 *
 * `atOnce` false waits the beat from the opening too, for a screen a push opens the moment the
 * app is back: the socket may still look open then, before anything has found it stale, and what
 * the push was about is in the catch-up still on its way (`app/needs/[id].tsx`).
 */
export function useInTouch(connection: ConnectionState, atOnce = true): boolean {
  const open = connection === "open";
  const [caughtUp, setCaughtUp] = useState(open && atOnce);
  useEffect(() => {
    if (!open) {
      setCaughtUp(false);
      return;
    }
    const timer = setTimeout(() => setCaughtUp(true), CATCH_UP_MS);
    return () => clearTimeout(timer);
  }, [open]);
  return open && caughtUp;
}

export function ThinkingBubble({
  doing,
  directory,
  resting = false,
}: {
  readonly doing: Doing;
  readonly directory: Directory;
  /**
   * Nothing heard from the server for now — the socket is down, or a phone is back from the
   * background and has not caught up — so what the bubble says is what was known when it was last
   * heard from, and the turn may well be over. Its dots stand unlit and its clock stops until the
   * room is in touch again; the bubble keeps its place, so a reply that ended the turn meanwhile
   * lands as it goes, in the one move (Arjun's iPhone, 14 October 2026: back after nine minutes,
   * a turn long over was still breathing for as long as the room took to catch up).
   */
  readonly resting?: boolean;
}) {
  const palette = usePalette();
  const faces = useFacePaint();
  const less = useReduceMotion();
  const says = useHeld(doing);
  const name = nameOf(directory, doing.harnessId);
  const face = faceProps(directory, doing.harnessId);
  const strip = useStripRow(says.calls > 0);
  return (
    <Coming rise={RISE}>
      <View
        testID="doing"
        accessibilityRole="progressbar"
        accessibilityLabel={`${name} · ${says.label} · ${says.detail}`}
        style={styles.row}
      >
        {/* Its pins lit and still: the dots in the bubble are the one sign of the work. */}
        <Avatar name={name} {...face} size="sm" pinsOut decorative />
        <Moving style={[styles.bubble, { backgroundColor: palette.them }]}>
          <View style={styles.top}>
            <Dots
              colour={faces.ground(faceGround(name, face.icon))}
              lit
              resting={resting}
              line={LINE}
              testID="doing-dots"
            />
            <Swap id={says.label} less={less} style={styles.slot}>
              <Text
                testID="doing-label"
                numberOfLines={1}
                maxFontSizeMultiplier={BUBBLE.maxScale}
                style={[styles.label, { color: palette.ink }]}
              >
                {says.label}
              </Text>
            </Swap>
            <Clock startedAt={doing.startedAt} palette={palette} running={!resting} />
          </View>
          <Swap id={detailKey(says)} less={less} style={styles.under}>
            <Detail says={says} palette={palette} />
          </Swap>
          {strip.open ? (
            <View style={[styles.under, styles.stripRow]}>
              <CallStrip
                key={doing.runId}
                made={doing.made}
                palette={palette}
                less={less}
                lead={strip.lead}
              />
            </View>
          ) : null}
        </Moving>
      </View>
    </Coming>
  );
}

/**
 * The words on screen, held (core's `holdSays`): read off the run at every drawing, and asked
 * again when words waiting their turn are due or a finished call settles back to *Thinking*. A
 * harness's card says its top line the same way (`harnesses/WorkingPill.tsx`).
 */
export function useHeld(doing: Doing): Says {
  const says = doingSays(doing);
  const read = [says.label, says.detail, says.kind, says.code, says.calls, says.settled].join("\n");
  const [held, setHeld] = useState(() => holdSays(undefined, says, Date.now()).held);
  const [asked, ask] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `says` is read by `read`; `asked` is when to read again.
  useEffect(() => {
    const now = Date.now();
    const next = holdSays(held, says, now);
    if (next.held !== held) setHeld(next.held);
    if (next.wake === undefined) return;
    const timer = setTimeout(() => ask((n) => n + 1), Math.max(0, next.wake - now));
    return () => clearTimeout(timer);
  }, [read, held, asked]);
  return held.shown;
}

/**
 * Whether the strip's row is open, and how long its first glyph waits: open from the first words
 * said after the first call, and open for as long as the bubble stands — through the next run's
 * first beat too, which has made no call yet, rather than closing and opening again under it. One
 * that came open shows its glyphs as it arrives.
 */
function useStripRow(called: boolean): {
  readonly open: boolean;
  readonly lead: number | undefined;
} {
  const [came] = useState(called);
  const [open, setOpen] = useState(called);
  if (called && !open) setOpen(true);
  return { open, lead: came ? undefined : STRIP_LEAD_MS };
}

/** What the detail is, for knowing when it changed. */
function detailKey(says: Says): string {
  return `${says.kind ?? ""}\n${says.code === true ? "code" : ""}\n${says.detail}`;
}

/** The detail: what a call was given, beside its glyph, or the words that say what is going on. */
function Detail({ says, palette }: { readonly says: Says; readonly palette: Palette }) {
  return (
    <View style={styles.detail}>
      {says.kind === undefined ? null : <Glyph kind={says.kind} palette={palette} />}
      <Text
        testID="doing-detail"
        numberOfLines={1}
        maxFontSizeMultiplier={BUBBLE.maxScale}
        style={[styles.detailWords, says.code === true && styles.code, { color: palette.ink3 }]}
      >
        {says.detail}
      </Text>
    </View>
  );
}

function Glyph({ kind, palette }: { readonly kind: CallKind; readonly palette: Palette }) {
  return (
    <View testID={`call-${kind}`}>
      <Icon name={GLYPHS[kind]} size={12} color={palette.ink3} weight={2} />
    </View>
  );
}

/**
 * How long the turn has taken, as a clock reads. A turn that has taken two minutes has not hung,
 * and a number going up says so where a word would have to be rewritten.
 */
function Clock({
  startedAt,
  palette,
  running,
}: {
  readonly startedAt: string | undefined;
  readonly palette: Palette;
  /** Counting; stopped where it stands while the room is out of touch. */
  readonly running: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!running) return;
    // On the second, as the turn counts them, rather than up to a second late.
    const began = startedAt === undefined ? now : Date.parse(startedAt);
    const wait = 1000 - ((((Date.now() - began) % 1000) + 1000) % 1000) + 5;
    const timer = setTimeout(() => setNow(Date.now()), wait);
    return () => clearTimeout(timer);
  }, [now, startedAt, running]);
  return (
    <Text
      testID="doing-clock"
      maxFontSizeMultiplier={BUBBLE.maxScale}
      style={[styles.clock, { color: palette.ink3 }]}
    >
      {clockWords(startedAt, now)}
    </Text>
  );
}

/**
 * Words that change where they stand: what was there fades out in `OUT_MS`, and what comes fades
 * in over `IN_MS` from `IN_AFTER_MS`, rising `IN_RISE` points — a crossfade, so the eye reads one
 * line changing rather than one line going and another arriving. The words coming are laid out
 * where they stand; the words going are drawn over them, out of the flow, until they are gone.
 * With Reduce Motion the words change at once.
 */
function Swap({
  id,
  less,
  style,
  children,
}: {
  readonly id: string;
  readonly less: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  const [was, setWas] = useState<{ readonly id: string; readonly words: ReactNode }>({
    id,
    words: children,
  });
  const [going, setGoing] = useState<ReactNode>(null);
  if (was.id !== id) {
    setGoing(less ? null : was.words);
    setWas({ id, words: children });
  }
  const swap = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  // Before the frame the new words are drawn in, so they never show at full strength first.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a crossfade for each change of `id`.
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (less) return;
    swap.setValue(0);
    const run = Animated.timing(swap, {
      toValue: 1,
      duration: IN_AFTER_MS + IN_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start(({ finished }) => {
      if (finished) setGoing(null);
    });
    return () => run.stop();
  }, [id]);
  const whole = IN_AFTER_MS + IN_MS;
  const from = IN_AFTER_MS / whole;
  return (
    <View style={style}>
      <Animated.View
        style={{
          opacity: swap.interpolate({ inputRange: [0, from, 1], outputRange: [0, 0, 1] }),
          transform: [
            {
              // An ease out, in steps the native driver can draw.
              translateY: swap.interpolate({
                inputRange: [0, from, from + (1 - from) / 3, from + (2 * (1 - from)) / 3, 1],
                outputRange: [IN_RISE, IN_RISE, IN_RISE * 0.3, IN_RISE * 0.04, 0],
              }),
            },
          ],
        }}
      >
        {children}
      </Animated.View>
      {going === null ? null : (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.going,
            {
              opacity: swap.interpolate({
                inputRange: [0, OUT_MS / whole, 1],
                outputRange: [1, 0, 0],
              }),
            },
          ]}
        >
          {going}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // The face at the bubble's foot, where a message's is (`Line.tsx`): a thought is a line in the
  // room, and a face standing at the top of one while every other face stands at the bottom reads
  // as a bubble that came loose (Arjun, 1 October 2026). The room's foot is pinned to the bottom
  // of an inverted list, so a bubble that opens its strip's row opens upward, and the face stays.
  row: { flexDirection: "row", gap: SPACE.sm, alignItems: "flex-end" },
  // The message bubble's own shape (`Line.tsx`), at the widest a bubble may be and no other
  // width, so nothing it says can change its size.
  bubble: {
    borderRadius: BUBBLE.radius,
    // So what is outside the row as it opens is cut to the bubble's own corner.
    overflow: "hidden",
    paddingHorizontal: BUBBLE.padX,
    paddingVertical: BUBBLE.padY,
    gap: 2,
    width: BUBBLE.maxWidth,
    flexShrink: 1,
  },
  top: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  // Takes what the clock leaves, so a long label ends in an ellipsis rather than pushing it out.
  slot: { flex: 1, minWidth: 0 },
  label: { fontSize: TEXT.md, lineHeight: LINE, fontWeight: "500" },
  clock: { fontSize: TEXT.sm, lineHeight: LINE, fontVariant: ["tabular-nums"], flexShrink: 0 },
  under: { marginLeft: INDENT },
  detail: { flexDirection: "row", alignItems: "center", gap: 5 },
  detailWords: { fontSize: TEXT.sm, lineHeight: DETAIL_LINE, flexShrink: 1 },
  code: { fontFamily: MONO, fontSize: 11.5 },
  stripRow: { marginTop: 4 },
  going: { position: "absolute", top: 0, left: 0, right: 0 },
});
