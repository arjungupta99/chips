/**
 * Whether this phone is talking to its server, in the top right of the bar: the app's own mark,
 * and behind it a sheet that says what is wrong and offers to try again.
 *
 * It was a line of words across the top of every list until 22 September 2026, and the line was
 * in the list's way — it arrives and leaves as the socket does, and each time it did, the whole
 * list jumped a row's height under the thumb reading it (Arjun: *it causes a jerk movement and
 * the label looks ugly*). Chrome that comes and goes has to come and go somewhere that owes
 * nothing to the content. So it is a mark in the bar: a screen that draws its own name takes it
 * as `Screen`'s `action`, at the trailing end of that name, and the room hands it to the
 * platform's own bar as `headerRight` — where it is fixed chrome either way and a list under it
 * never moves.
 *
 * What it says, and what it does not:
 *
 * - Connected, over the network or through the relay: nothing at all. A light that is always on
 *   is not a status light. The relay was a gold mark until 12 October 2026, when the relay went
 *   live and a phone away from home wore it for hours (Arjun: *the chips loading logo is forever
 *   showing now, hide when connected*). Which way the phone is reaching its server is said in
 *   You → This phone instead (`you/About.tsx`), where it is looked for rather than lived with.
 * - Connecting: the mark with its pins lighting one after another round the circuit — the sign
 *   this app already uses everywhere for *something is going on at the other end* (`ChipPulse`).
 * - Not connected, for any of the three reasons: the mark still, in red.
 * - Connected again after it had said it was not: the mark green with every pin lit, for a beat,
 *   and then gone (`BACK_MS`, ADR 0131). Before that the mark only ever went, and going reads the
 *   same as never having been there; a red mark deserves an answer. Only after red: a slow
 *   connect that never failed just goes, or every launch over a slow network would flash green.
 *
 * The sheet shows the mark large, on a circuit board (`Circuit`, ADR 0251), saying what the sheet
 * says: sparks running out from the pins while it reaches, the board dim under a red mark while it
 * cannot, and every trace filling green when it is through. It stays up, saying so, until it is
 * closed, and the mark in the bar stays green under it.
 *
 * Nothing appears for the first `SETTLES_MS` of not being connected. A socket blinks — an app
 * coming back to the front closes one and opens another — and a mark that flashed on every blink
 * would be the old line's jumpiness moved to a quieter address. And nothing is *drawn nothing*
 * rather than drawn empty, for the sake of the room's bar: see `useFade` and `useMarking`.
 */

import { type ConnectionState, type LinkKind, lostWords } from "@chipschat/core";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { WAYS_IN } from "../demo/home";
import { deviceWord, thisDevice } from "../device/word";
import { Button } from "./Button";
import { ChipPulse } from "./ChipPulse";
import { type BoardLook, Circuit } from "./Circuit";
import { lift } from "./haptics";
import { Sheet, SheetScroll } from "./Sheet";
import { usePalette } from "./theme";
import { LEADING_PHONE, type Palette, SPACE, TEXT } from "./tokens";
import { useReduceMotion } from "./useReduceMotion";

/** A blink of not-connected is not worth a mark: it shows only once it has lasted this long. */
export const SETTLES_MS = 600;
/** How long the mark stays green, every pin lit, once the connection is back after failing. */
export const BACK_MS = 900;
/** How long the mark takes to arrive, and to go again. */
export const FADE_MS = 180;
/** How long the mark's room beside another mark takes to open or close (`MarkBeside`). */
export const ROOM_MS = 260;
/** The mark's slot, and the space between it and what stands beside it. */
export const MARK_WIDTH = 20;
const MARK_GAP = 20;

/**
 * Where the mark's room sits in the capsule it shares (`MarkBeside`): the glass before it, with no
 * mark and with one; the glass after what stands beside it while the mark is there; and the space
 * between the two.
 */
export interface MarkFit {
  readonly lead: readonly [number, number];
  readonly trail: number;
  readonly gap: number;
}

/**
 * Beside another mark in a bar: Universe's. The bar's glass gives the slot about five points either
 * side already, and the two marks stand well apart, each in its own half of the glass.
 */
export const BESIDE_A_MARK: MarkFit = { lead: [0, 5], trail: 2, gap: MARK_GAP };

/**
 * Before a word in a capsule of the screen's own: Select's on the Spaces and Agents lists, which
 * takes the mark the bar's corner used to hold (Arjun, 31 October 2026: "I want the loading icon
 * on top right show within the select button bubble on the left"). With no mark the word has the
 * capsule's own padding on its left; with one, the mark sits as far in from the round end as the
 * word does from the other, the end's curve taking up the difference, and close enough to the
 * word to read as one button's picture and its label rather than two buttons.
 */
export const BEFORE_A_WORD: MarkFit = { lead: [SPACE.lg, 11], trail: 0, gap: 7 };
/** As tall as the sheet gets, so the screen it was opened from stays in sight above it. */
const THREE_QUARTERS = 0.75;
/** The mark is 20 points wide over a line's height; this brings its target up to Apple's 44. */
const SLOP = { top: 11, bottom: 11, left: 12, right: 12 };
const NATIVE = Platform.OS !== "web";
/** Out of the way it eases in, into place it eases out: away quickly, back gently. */
const EASE = [Easing.in(Easing.quad), Easing.out(Easing.quad)] as const;

/**
 * What the mark is showing. `gone` is the good news, and the good news is silent — but for `back`,
 * the beat it says so after it had said the connection failed.
 */
type Look = "gone" | "reaching" | "failed" | "back";

function lookOf(state: ConnectionState): Exclude<Look, "back"> {
  if (state === "open") return "gone";
  return state === "connecting" ? "reaching" : "failed";
}

/**
 * What the sheet's board shows: what is true now, as the sheet's words are. The bar's mark waits
 * out a blink before it changes (`useSettled`); a sheet somebody opened to look at is answered
 * at once. Open is through, and green, for as long as the sheet is still up to say so.
 */
function boardOf(state: ConnectionState): BoardLook {
  return state === "open" ? "back" : lookOf(state) === "reaching" ? "reaching" : "failed";
}

/** What the mark is called out to a screen reader, which cannot see that it is red. */
const NAMES: Readonly<Record<Exclude<Look, "gone">, string>> = {
  reaching: "Connecting to your server",
  failed: "Not connected",
  back: "Connected again",
};

/** What a person is told on the sheet, and the one thing they can do about it. */
interface Saying {
  readonly title: string;
  /** What has happened. */
  readonly what: string;
  /** What it means for what is on screen, and for anything sent. */
  readonly means: string;
  readonly act?: { readonly label: string; readonly does: "retry" | "pair" } | undefined;
}

/**
 * Not connected, on a device that knows no relay: it reaches the server only on the server's own
 * network, since the relay was never turned on or is off (ADR 0245). Away from home that is why,
 * and only an owner, at home, can change it (the new-person sweep's finding 2).
 */
function noRelaySaying(): Saying {
  return {
    title: "Not connected",
    what: `${thisDevice(true)} reaches your server only on the server's own network, because the relay isn't on.`,
    means:
      "Away from home, it can't connect until an owner turns on the relay, at home: You → " +
      "Workspace → Relay. At home, check that the computer Chips runs on is awake. Anything you " +
      "send waits here.",
    act: { label: "Try again", does: "retry" },
  };
}

/**
 * A phone whose key the workspace no longer knows: replaced, or signed out. An owner pairs it from
 * a computer of theirs. Anybody else was let in by an invite and has no computer of the
 * workspace's: an owner reconnects them from their page in People (ADRs 0206, 0236), which the
 * computer route left out (the new-person sweep's finding 15).
 */
function rejectedSaying(owner: boolean): Saying {
  return {
    title: `${thisDevice(true)} is no longer paired`,
    what:
      `The workspace does not know ${thisDevice()}'s key any more. It was replaced, or this ` +
      "device was removed from a computer.",
    means: owner
      ? "Reconnecting cannot fix that — only pairing again can. On your computer open Chips, " +
        "then You → Devices → Pair another device."
      : "Reconnecting cannot fix that — only pairing again can. Ask an owner to reconnect you: " +
        "they choose Reconnect or Pair a new phone on your page in People, and you scan the " +
        "code they get.",
    act: { label: `Pair ${thisDevice()} again`, does: "pair" },
  };
}

function sayingOf(
  state: ConnectionState,
  link: LinkKind | undefined,
  noRelay = false,
  owner = false,
): Saying {
  if (noRelay && state === "closed") return noRelaySaying();
  if (state === "rejected") return rejectedSaying(owner);
  switch (state) {
    case "open":
      return link === "relay"
        ? {
            title: "Connected through the relay",
            what:
              `${thisDevice(true)} could not reach your server directly, so it is going through Chips's ` +
              "relay instead.",
            means:
              "Everything works. It is a little slower than the direct way, and it means the " +
              `${deviceWord()} and the server are not on the same network at the moment.`,
          }
        : {
            title: "Connected",
            what: `${thisDevice(true)} is talking to your server over the network.`,
            means: "Everything said here arrives as it is said.",
          };
    case "connecting":
      return {
        title: "Connecting…",
        what: `${thisDevice(true)} is reaching your server now.`,
        means:
          `Until it is through, what is on screen is what ${thisDevice()} last saw. Anything you ` +
          "send waits here and goes out the moment the connection is up.",
      };
    case "asleep":
      return {
        title: "Your server is not reachable",
        what:
          "The relay answered and has no Chips server with this key: the machine Chips runs on " +
          "is asleep, or switched off.",
        means:
          `Waking that machine is the fix — ${thisDevice()} comes back on its own once it is up. ` +
          `What is on screen is what ${thisDevice()} last saw.`,
        act: { label: "Try again", does: "retry" },
      };
    case "removed":
      return {
        title: "You're no longer in this workspace",
        what: `Your account there was removed, or you deleted it, so ${thisDevice()} can't reach it any more.`,
        means:
          "Pairing again can't bring it back; a new invite can. What you said there stays " +
          `where it was said. Spaces has the way to forget it on ${thisDevice()}.`,
      };
    default:
      return {
        title: "Not connected",
        what:
          `${thisDevice(true)} cannot reach your server. It keeps trying on its own, waiting a little ` +
          "longer between tries each time.",
        means:
          `What is on screen is what ${thisDevice()} last saw. Nothing you have sent is lost: it ` +
          "waits here, and goes out when the connection is back.",
        act: { label: "Try again", does: "retry" },
      };
  }
}

/**
 * The look the mark is actually wearing. `gone` is the answer and is worn at once;
 * the two that mean *not connected yet* are worn only once they have lasted `SETTLES_MS`. Once
 * the mark is up, one of them turning into the other is the same mark recoloured, with no wait:
 * a socket that gives up while you are watching should say so there and then.
 *
 * `now` is for the caller that has already waited the settle out — the room, which has to know
 * before it draws its bar whether there is anything to put in it (`useMarking`). Waiting twice
 * would put an empty capsule up and the mark in it half a second later.
 *
 * `held` is the mark's sheet being up. Through while it is, the mark is green under the sheet that
 * says so, whether or not it had failed, and has its beat once the sheet is closed.
 */
function useSettled(look: Exclude<Look, "back">, now: boolean, held = false): Look {
  const [worn, setWorn] = useState<Look>(now || look === "gone" ? look : "gone");
  // Whether the mark has said the connection failed since it was last gone: only then, or under
  // its sheet, does the connection coming back get its beat.
  const failed = useRef(false);
  if (worn === "failed") failed.current = true;
  if (worn === "gone") failed.current = false;
  useEffect(() => {
    if (look === "gone" && worn !== "gone" && (failed.current || held || worn === "back")) {
      return wearBack(worn, held, setWorn);
    }
    if (now || look === "gone") {
      setWorn(look);
      return;
    }
    if (worn !== "gone") {
      setWorn(look);
      return;
    }
    const timer = setTimeout(() => setWorn(look), SETTLES_MS);
    return () => clearTimeout(timer);
  }, [look, worn, now, held]);
  return worn;
}

/** Back: green, for as long as its sheet is up and then for a beat, and then gone. */
function wearBack(worn: Look, held: boolean, wear: (look: Look) => void): (() => void) | undefined {
  if (worn !== "back") {
    wear("back");
    return undefined;
  }
  if (held) return undefined;
  const timer = setTimeout(() => wear("gone"), BACK_MS);
  return () => clearTimeout(timer);
}

/**
 * Whether there is anything to mark at all, the settle already waited out. Beside another mark the
 * mark is put in its room at once, and `MarkBeside` shows it as the room opens; it goes before the
 * room closes.
 *
 * A navigation bar draws a glass capsule for its right-hand slot whether or not what is put in
 * it draws anything, so a screen with a bar of its own asks this before it hands one over: an
 * empty capsule standing over the room, for want of a connection to report, is the very thing
 * the line was taken down for. It stays true for the length of the exit, so the capsule leaves
 * with the mark inside it rather than a beat before. Beside another mark (`beside`), it stays
 * true while the mark's room closes too, and `room` is whether that room is open, for
 * `MarkBeside` to open and close.
 *
 * A screen that draws its own name has no capsule to give, and needs none of this: it passes
 * the mark straight to `Screen`'s `action`, which is an empty box when there is nothing to say.
 *
 * `markedBy` is handed to the `ConnectionMark` put in the slot: it is settled already, and it says
 * when its sheet is up, so the slot is kept for as long as the sheet is (a mark taken out of its
 * slot would take its open sheet with it).
 */
export function useMarking(
  state: ConnectionState,
  beside = false,
): {
  readonly marking: boolean;
  readonly room: boolean;
  readonly markedBy: MarkedBy;
} {
  const [held, setHeld] = useState(false);
  const open = useSettled(lookOf(state), false, held) !== "gone";
  const [marking, setMarking] = useState(open);
  useEffect(() => {
    if (open) {
      setMarking(true);
      return;
    }
    const timer = setTimeout(() => setMarking(false), FADE_MS + (beside ? ROOM_MS : 0) + 40);
    return () => clearTimeout(timer);
  }, [open, beside]);
  const markedBy = useMemo<MarkedBy>(() => ({ settled: true, onHeld: setHeld }), []);
  // The mark's room beside another mark (`MarkBeside`): open while it has something to say.
  return { marking, room: open && beside, markedBy };
}

/** What a caller that asked `useMarking` hands the mark it puts in the slot. */
export interface MarkedBy {
  readonly settled: true;
  readonly onHeld: (held: boolean) => void;
}

/**
 * The mark's arrival and its exit, and whether there is anything to draw at all. Opacity and
 * scale, on the native driver: this thing breathes over a scrolling list, and a layout property
 * here would be ADR 0061 all over again.
 *
 * `away` is the end of the exit — drawn nothing at all, which is not the same as drawn at nought
 * opacity. A navigation bar gives its right-hand slot a glass capsule of its own, and an empty
 * capsule standing over the room for want of a connection to report is worse than the line ever
 * was. So the exit runs first and the slot is given up at the end of it.
 */
function useFade(here: boolean): { readonly enter: Animated.Value; readonly away: boolean } {
  const still = useReduceMotion();
  const enter = useRef(new Animated.Value(0)).current;
  const [away, setAway] = useState(!here);
  // The slot is taken back before the arrival, and given up at the end of the exit.
  useEffect(() => {
    if (here) setAway(false);
  }, [here]);
  useEffect(() => {
    const to = here ? 1 : 0;
    const ended = () => setAway(!here);
    if (still) {
      enter.setValue(to);
      ended();
      return;
    }
    const motion = Animated.timing(enter, {
      toValue: to,
      duration: FADE_MS,
      easing: EASE[to],
      useNativeDriver: NATIVE,
    });
    motion.start(({ finished }) => {
      if (finished) ended();
    });
    return () => motion.stop();
  }, [enter, here, still]);
  return { enter, away };
}

/**
 * The look the mark wears, whether it is here at all, and the look to draw. The last is the one it
 * wore last, kept through the exit: a mark that turned gold as it faded from green would be saying
 * a third thing on its way out.
 */
function useWorn(
  look: Exclude<Look, "back">,
  settled: boolean,
  held: boolean,
): { readonly worn: Look; readonly here: boolean; readonly shown: Look } {
  const worn = useSettled(look, settled, held);
  const here = worn !== "gone";
  const last = useRef<Look>(worn);
  if (here) last.current = worn;
  return { worn, here, shown: last.current };
}

/** The body: red while it cannot connect, green for the beat it is back, gold while it reaches. */
function bodyOf(shown: Look, palette: Palette): string {
  if (shown === "failed") return palette.red;
  return shown === "back" ? palette.green : palette.gold;
}

export function ConnectionMark({
  state,
  link,
  onRetry,
  settled = false,
  onHeld,
  lostAt,
  server,
  noRelay = false,
  owner = false,
  testID = "connection",
}: {
  readonly state: ConnectionState;
  readonly link?: LinkKind | undefined;
  /** When the socket stopped being open, while it is not (the snapshot's `lostAt`). */
  readonly lostAt?: string | undefined;
  /** Which server, as a person would know it (`serverHost`), said on the sheet. */
  readonly server?: string | undefined;
  /**
   * This device knows no relay (its `relayUrl`), so it reaches the server only on the server's
   * own network: what the sheet says when it can't connect (ADR 0245).
   */
  readonly noRelay?: boolean | undefined;
  /**
   * The reader owns the workspace, so a phone no longer paired is paired again from a computer of
   * theirs; anybody else asks an owner to reconnect them.
   */
  readonly owner?: boolean | undefined;
  /** Check the connection now: the store's `wake`, which is what coming back to the front does. */
  readonly onRetry: () => void;
  /** The caller has already waited the settle out (`useMarking`), so this one does not. */
  readonly settled?: boolean;
  /** The sheet went up or came down: the caller keeps the slot while it is up (`useMarking`). */
  readonly onHeld?: ((held: boolean) => void) | undefined;
  readonly testID?: string | undefined;
}) {
  const palette = usePalette();
  const router = useRouter();
  const [up, setUp] = useState(false);
  const { worn, here, shown } = useWorn(lookOf(state), settled, up);
  const body = bodyOf(shown, palette);
  const back = shown === "back";
  // Mounted only while the sheet is up or on its way down. A caller that unmounts a sheet to
  // close it gets no exit at all (`Sheet`), and one left mounted for ever is a modal and a pair
  // of springs standing behind every screen in the app for the sake of a tap nobody has made.
  const [showing, setShowing] = useState(false);

  const { enter, away } = useFade(here);

  // The connection coming back while the sheet is up is the sheet's own answer, and it stays to
  // say so until it is closed (Arjun, 31 October 2026: "We do not need to auto dismiss the loading
  // bottom sheet when we connect, if it was open"). So the mark stays, green, for as long as its
  // sheet does, here and in the slot it was given.
  useEffect(() => {
    onHeld?.(up);
  }, [onHeld, up]);
  useEffect(() => () => onHeld?.(false), [onHeld]);

  const saying = sayingOf(state, link, noRelay, owner);
  const act = saying.act;
  if (away && !showing) return null;

  return (
    <View style={styles.slot} testID={testID}>
      <Animated.View
        // Untouchable and unreadable while it is away, so the bar keeps its size and gives back
        // nothing else: no target under the thumb, and nothing for a screen reader to find.
        pointerEvents={here ? "auto" : "none"}
        accessibilityElementsHidden={!here}
        importantForAccessibility={here ? "auto" : "no-hide-descendants"}
        style={[styles.slot, { opacity: enter, transform: [{ scale: enter.interpolate(GROW) }] }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={worn === "gone" ? undefined : NAMES[worn]}
          accessibilityHint="Says what is happening, and offers to try again"
          hitSlop={SLOP}
          testID={`${testID}-mark`}
          onPress={() => {
            lift();
            setShowing(true);
            setUp(true);
          }}
          style={({ pressed }) => [styles.slot, { opacity: pressed ? 0.5 : 1 }]}
        >
          <ChipPulse
            gold={body}
            ink={palette.ink3}
            lit={palette.ink}
            working={shown === "reaching"}
            allLit={back}
          />
        </Pressable>
      </Animated.View>
      {!showing ? null : (
        <Sheet
          open={up}
          onClose={() => setUp(false)}
          onGone={() => setShowing(false)}
          sizing="full"
          cap={THREE_QUARTERS}
          testID={`${testID}-sheet`}
        >
          <View style={styles.sheet}>
            <SheetScroll contentContainerStyle={styles.words}>
              {/* The thing that was tapped, large, on its board, saying the same thing at a size
                  that can be looked at rather than found. On top, one height whatever the words
                  under it say, so it never moves as the state changes; inside the scroll, so big
                  text on a small screen pushes it up out of the way instead of squashing the
                  words. */}
              <View style={styles.board}>
                <Circuit look={boardOf(state)} />
              </View>
              <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
                {saying.title}
              </Text>
              <Text style={[styles.line, { color: palette.ink }]}>{saying.what}</Text>
              <Text style={[styles.line, { color: palette.ink2 }]}>{saying.means}</Text>
              <Facts server={server} lostAt={state === "open" ? undefined : lostAt} />
            </SheetScroll>
            {/* What can be done about it, when something can; the sheet's X closes it. */}
            {act === undefined ? null : (
              <View style={styles.doing}>
                <Button
                  label={act.label}
                  variant="primary"
                  grow
                  onPress={() => {
                    if (act.does === "retry") {
                      onRetry();
                      return;
                    }
                    setUp(false);
                    router.push(WAYS_IN);
                  }}
                />
              </View>
            )}
          </View>
        </Sheet>
      )}
    </View>
  );
}

/**
 * Which server, and since when it has not answered: the two things a person asks next, and the
 * two the words above cannot say for them.
 */
function Facts({
  server,
  lostAt,
}: {
  readonly server: string | undefined;
  readonly lostAt: string | undefined;
}) {
  const palette = usePalette();
  if (server === undefined && lostAt === undefined) return null;
  return (
    <View style={styles.facts} testID="connection-facts">
      {server === undefined ? null : (
        <Text style={[styles.fact, { color: palette.ink3 }]}>
          {"Server  "}
          <Text style={[styles.factValue, { color: palette.ink2 }]} selectable>
            {server}
          </Text>
        </Text>
      )}
      {lostAt === undefined ? null : (
        <Text style={[styles.fact, { color: palette.ink3 }]}>
          {"Last connected  "}
          <Text style={[styles.factValue, { color: palette.ink2 }]}>{lostWords(lostAt)}</Text>
        </Text>
      )}
    </View>
  );
}

/** The mark arrives a shade under its size and settles into it, rather than blinking on. */
const GROW = { inputRange: [0, 1], outputRange: [0.8, 1] };

const styles = StyleSheet.create({
  // Always this size, whatever is drawn in it: the bar is laid out once and never again.
  slot: {
    width: MARK_WIDTH,
    height: Math.round(TEXT.body * LEADING_PHONE),
    alignItems: "center",
    justifyContent: "center",
  },
  sheet: { flex: 1 },
  // The board is wider than the words: it takes the sheet's whole width, clear of its edges. Its
  // top pads stand clear below the sheet's X rather than level with it (Arjun, 31 October 2026:
  // "we need more top margin").
  board: {
    alignItems: "center",
    marginHorizontal: -SPACE.lg,
    marginTop: SPACE.xxl,
    marginBottom: SPACE.md,
  },
  words: { flexGrow: 1, paddingHorizontal: SPACE.xl, paddingBottom: SPACE.lg, gap: SPACE.sm },
  title: {
    fontSize: TEXT.xl + 2,
    fontWeight: "700",
    letterSpacing: -0.3,
    textAlign: "center",
    marginBottom: SPACE.xs,
  },
  line: { fontSize: TEXT.md, lineHeight: Math.round(TEXT.md * 1.45), textAlign: "center" },
  facts: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    columnGap: SPACE.lg,
    rowGap: SPACE.xs,
    marginTop: SPACE.sm,
  },
  fact: { fontSize: TEXT.sm, lineHeight: Math.round(TEXT.sm * LEADING_PHONE) },
  factValue: { fontWeight: "600", fontVariant: ["tabular-nums"] },
  doing: { flexDirection: "row", gap: SPACE.sm, paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm },
});
