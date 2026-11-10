/**
 * What the Spaces list shows where its rooms would be, when it has none to show: core's
 * `emptyList` decides which, and this draws it (ADR 0131).
 *
 * "No spaces yet" is said only once the server has said there are none, and it says what a space
 * is and offers to make one. Until the server has said, the list says what is actually going on,
 * in the place the rows will be: the server being reached, why it cannot be, or, once its hello
 * has listed rooms, placeholder rows in the rows' own shape that the rooms arrive over (`Arrive`).
 * It used to say "No spaces yet" for all of them, which on every launch was false.
 *
 * The mark is the connection's own (`ChipPulse`, `Connection.tsx`), drawn large: working while
 * the server is being reached, still and red when it cannot be, gold and still over the empty list.
 * With rooms on screen none of this shows: the rows are what this phone last saw, and the bar's
 * mark says the rest.
 */

import {
  ADDED_TO_A_SPACE_WORDS,
  type EmptyList,
  type Participant,
  startersWords,
  type TakenOut,
  type Welcome,
  workspaceLabel,
} from "@chipschat/core";
import { useRouter } from "expo-router";
import { type ReactNode, useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  type StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { WAYS_IN } from "../demo/home";
import { useLeave } from "../device/leave";
import { thisDevice } from "../device/word";
import { useNewSpace } from "../newSpace/NewSpace";
import { useOpens } from "../newSpace/opens";
import { useChips } from "../store/provider";
import { Avatar, ROW_AVATAR } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { ChipPulse } from "../ui/ChipPulse";
import { usePalette } from "../ui/theme";
import { LEADING_PHONE, RADIUS, SPACE, TEXT } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";

/** The connection's mark is twenty points; here it stands as large as a room's face and more. */
const MARK_SCALE = 3.4;
/** How far down the window the words start: about where the third row would be. */
const DOWN = 0.11;
/** No more placeholders than a phone shows rows above the fold. */
const MOST_PLACEHOLDERS = 6;
/** How many faces stand for the harnesses that can start a space, before "and N more". */
const MOST_FACES = 3;
/** The words for a state that has nothing to do with the server's word on how many rooms. */
export type Telling = Exclude<EmptyList, "reading" | "fetching" | "none">;

/**
 * Whether the list's body is saying what the connection is doing. The bar's mark then stands down:
 * the same mark twice, small in the bar and large under it, says it once too often.
 */
export function tellsConnection(look: EmptyList): look is Telling {
  return look !== "reading" && look !== "fetching" && look !== "none";
}

export interface Saying {
  readonly title: string;
  readonly words: string;
  /** The button, and what it does: the store's wake, Pair, or forgetting the workspace here. */
  readonly act?: { readonly label: string; readonly does: "retry" | "pair" | "forget" } | undefined;
}

export const SAYING: Readonly<Record<Telling, Saying>> = {
  connecting: {
    title: "Reaching your server",
    words: "Your spaces will show here as soon as it answers.",
  },
  closed: {
    title: "Can't reach your server",
    words: `${thisDevice(true)} keeps trying on its own. Check that the computer Chips runs on is awake and online.`,
    act: { label: "Try again", does: "retry" },
  },
  asleep: {
    title: "Your server is asleep",
    words: `The relay can't find it: the computer Chips runs on is asleep or switched off. ${thisDevice(true)} reconnects when it wakes.`,
    act: { label: "Try again", does: "retry" },
  },
  rejected: {
    title: `${thisDevice(true)} isn't paired anymore`,
    words: `Your workspace no longer knows ${thisDevice()}'s key. Pairing again brings everything back.`,
    act: { label: "Pair again", does: "pair" },
  },
  // Removed from the workspace (ADR 0160), or their account deleted from another device (ADR
  // 0243), which the server says the same way: pairing again cannot let them in, so nothing
  // offers it. The title names the workspace (`Telling`).
  removed: {
    title: "You're no longer in this workspace",
    words:
      "Your account there was removed, or you deleted it. What you said there stays where it was said. To come back, ask for a new invite.",
    act: { label: "OK", does: "forget" },
  },
};

/**
 * Can't reach the server, on a device that knows no relay: it reaches the server only on its
 * network, since the relay isn't on (ADR 0245; the new-person sweep's finding 2).
 */
export const CLOSED_NO_RELAY: Saying = {
  title: "Can't reach your server",
  words: `${thisDevice(true)} reaches it only on the server's own network, because the relay isn't on. At home, check that the computer Chips runs on is awake. Away, an owner can turn on the relay at home: You → Workspace → Relay.`,
  act: { label: "Try again", does: "retry" },
};

export function NoRooms({
  look,
  awaiting,
  server,
  onRetry,
  welcome,
}: {
  /** For somebody let in by an invite, in no room yet: core's `welcomeFor` (JR-4). */
  readonly welcome?: Welcome | undefined;
  readonly look: EmptyList;
  /** How many rooms the hello listed that have not come in: how many placeholders. */
  readonly awaiting: number | undefined;
  /** Where the server is, as a person would know it, said while it is reached or cannot be. */
  readonly server: string | undefined;
  /** Check the connection now: the store's `wake`. */
  readonly onRetry: () => void;
}) {
  const { paired } = useChips();
  const noRelay = paired !== undefined && paired.device.relayUrl === undefined;
  if (look === "reading") return null;
  if (look === "fetching") return <Placeholders count={awaiting ?? MOST_PLACEHOLDERS} />;
  if (look === "none") return welcome === undefined ? <Nothing /> : <Welcomed welcome={welcome} />;
  const saying = look === "closed" && noRelay ? CLOSED_NO_RELAY : SAYING[look];
  return (
    <Telling
      look={look}
      saying={saying}
      caption={look === "rejected" || look === "removed" ? undefined : server}
      onRetry={onRetry}
    />
  );
}

/** The mark, the name of the state, a line under it, and room for one thing to do. */
export function Centred({
  testID,
  mark,
  title,
  words,
  children,
}: {
  readonly testID: string;
  readonly mark: ReactNode;
  readonly title: string;
  readonly words: string;
  readonly children?: ReactNode;
}) {
  const palette = usePalette();
  const { height } = useWindowDimensions();
  return (
    <View
      style={[styles.centred, { paddingTop: Math.round(height * DOWN) }]}
      testID={testID}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.mark}>
        <View style={styles.blowUp}>{mark}</View>
      </View>
      <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
        {title}
      </Text>
      <Text style={[styles.words, { color: palette.ink2 }]}>{words}</Text>
      {children}
    </View>
  );
}

/**
 * Why the server's word cannot be had: the mark red and still (or working, while it is reached),
 * the state's name and words, the server's address, and the one thing to do. Spaces' words by
 * default; the Agents tab says its own (`Agents`), under its own test id.
 */
export function Telling({
  look,
  saying,
  caption,
  onRetry,
  testID = "no-rooms",
}: {
  readonly look: Telling;
  readonly saying: Saying;
  readonly caption: string | undefined;
  readonly onRetry: () => void;
  readonly testID?: string;
}) {
  const palette = usePalette();
  const router = useRouter();
  const forget = useForget();
  const { paired } = useChips();
  const failed = look !== "connecting";
  const { act } = saying;
  const title =
    look === "removed" && paired !== undefined
      ? `You're no longer in ${workspaceLabel(paired.device)}`
      : saying.title;
  const press = () => {
    if (act?.does === "retry") onRetry();
    else if (act?.does === "forget") forget();
    else router.push(WAYS_IN);
  };
  return (
    <Centred
      testID={`${testID}-${look}`}
      title={title}
      words={saying.words}
      mark={
        <ChipPulse
          gold={failed ? palette.red : palette.gold}
          ink={palette.ink3}
          lit={palette.ink}
          working={!failed}
        />
      }
    >
      {caption === undefined ? null : (
        <Text style={[styles.caption, { color: palette.ink3 }]} selectable>
          {caption}
        </Text>
      )}
      {act === undefined ? null : (
        <View style={styles.button}>
          <Button
            label={act.label}
            variant={act.does === "retry" ? "default" : "gold"}
            style={styles.big}
            onPress={press}
          />
        </View>
      )}
    </Centred>
  );
}

/**
 * Forget the workspace on this phone, once its person was removed from it (ADR 0160): its key is
 * withdrawn at the server already, so only this phone's copy goes, and the next workspace this
 * phone holds comes forward, or Welcome (ADR 0197).
 */
function useForget(): () => void {
  const { paired } = useChips();
  const leave = useLeave();
  return () => {
    if (paired === undefined) return;
    const spaceIds = paired.store.getSnapshot().model.spaces.map((space) => space.id);
    void leave(paired.device, spaceIds);
  };
}

/**
 * The server has said there are no rooms: what a space is, who can start one, and the + window
 * grown out of the button rather than the + (`useNewSpace`). With nobody who takes new spaces the
 * window makes an empty room (ADR 0148), as on the desktop. Somebody who may not open a space is
 * told where theirs come from instead (ADR 0196).
 */
function Nothing() {
  const palette = usePalette();
  const { paired } = useChips();
  const opens = useOpens(paired?.store, paired?.device.participantId);
  const { harnesses, open } = useNewSpace();
  const button = useRef<View>(null);
  const create = () => {
    const at = button.current;
    if (at === null) return;
    at.measureInWindow((x, y, width, height) => open({ x, y, width, height }));
  };
  return (
    <Centred
      testID="no-rooms-none"
      title="No spaces yet"
      words="A space is where you and your agents work on something together."
      mark={<ChipPulse gold={palette.gold} ink={palette.ink3} lit={palette.ink} working={false} />}
    >
      {!opens ? (
        <Text style={[styles.added, { color: palette.ink3 }]}>{ADDED_TO_A_SPACE_WORDS}</Text>
      ) : (
        <>
          {harnesses.length === 0 ? null : <Starters harnesses={harnesses} />}
          <View ref={button} collapsable={false} style={styles.button}>
            <Button
              label="Create a space"
              icon="plus"
              variant="gold"
              style={styles.big}
              onPress={create}
            />
          </View>
        </>
      )}
    </Centred>
  );
}

/**
 * Somebody let in by an invite, in no room yet (JR-4): who let them in, as what, and that a room
 * comes when somebody adds them; a space of their own only for those who may open one.
 */
function Welcomed({ welcome }: { readonly welcome: Welcome }) {
  const palette = usePalette();
  const { open } = useNewSpace();
  const button = useRef<View>(null);
  const create = () => {
    const at = button.current;
    if (at === null) return;
    at.measureInWindow((x, y, width, height) => open({ x, y, width, height }));
  };
  return (
    <Centred
      testID="no-rooms-welcome"
      title={welcome.title}
      words={welcome.words}
      mark={<ChipPulse gold={palette.gold} ink={palette.ink3} lit={palette.ink} working={false} />}
    >
      {welcome.mayCreate ? (
        <View ref={button} collapsable={false} style={styles.button}>
          <Button label="Create a space" icon="plus" style={styles.big} onPress={create} />
        </View>
      ) : null}
    </Centred>
  );
}

/**
 * Where a room was, once somebody else took the reader out of it (JR-6): which room, by whom, and
 * that its words stay with the people still in it. OK goes back to the list.
 */
export function TakenOutNotice({
  taken,
  onSeen,
}: {
  readonly taken: TakenOut;
  readonly onSeen: () => void;
}) {
  const palette = usePalette();
  const room = taken.title ?? "this space";
  return (
    <Centred
      testID="removed-from-room"
      title={`You're no longer in ${room}`}
      words={`${taken.byName} removed you from ${room}. What was said there stays with the people still in it.`}
      mark={<ChipPulse gold={palette.red} ink={palette.ink3} lit={palette.ink} working={false} />}
    >
      <View style={styles.button}>
        <Button label="OK" style={styles.big} onPress={onSeen} />
      </View>
    </Centred>
  );
}

/** Who can start a space: their faces, overlapping a little, and their names. */
function Starters({ harnesses }: { readonly harnesses: readonly Participant[] }) {
  const palette = usePalette();
  const shown = harnesses.slice(0, MOST_FACES);
  return (
    <View style={styles.starters}>
      <View style={styles.faces}>
        {shown.map((each, index) => (
          <View
            key={each.id}
            style={[styles.face, index === 0 ? null : styles.behind, { borderColor: palette.bg }]}
          >
            <Avatar name={each.displayName} kind={each.kind} size="sm" decorative />
          </View>
        ))}
      </View>
      <Text style={[styles.who, { color: palette.ink3 }]} numberOfLines={2}>
        {startersWords(harnesses.map((each) => each.displayName))}
      </Text>
    </View>
  );
}

/**
 * Rooms on their way: rows in the rows' own shape, breathing, for the rooms the hello listed.
 * The rooms come in over them (`Arrive`), so nothing moves when they do.
 */
function Placeholders({ count }: { readonly count: number }) {
  const palette = usePalette();
  const still = useReduceMotion();
  const breath = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (still) {
      breath.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 0.45,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath, still]);
  const rows = Math.max(1, Math.min(count, MOST_PLACEHOLDERS));
  const quiet = { backgroundColor: palette.surface2 };
  return (
    <Animated.View
      style={{ opacity: breath }}
      testID="no-rooms-fetching"
      accessible
      accessibilityLabel="Loading your spaces"
    >
      {Array.from({ length: rows }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have nothing else to be told apart by
        <View key={index} style={styles.row}>
          <View style={[styles.face56, quiet]} />
          <View style={styles.bars}>
            <View style={[styles.bar, quiet, { width: NAME_WIDTHS[index % NAME_WIDTHS.length] }]} />
            <View
              style={[
                styles.bar,
                styles.thin,
                quiet,
                { width: LINE_WIDTHS[index % LINE_WIDTHS.length] },
              ]}
            />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

/** Lengths for a placeholder's name and its last line, so the rows do not read as one stamp. */
const NAME_WIDTHS = ["52%", "38%", "46%", "60%", "34%", "44%"] as const;
const LINE_WIDTHS = ["80%", "70%", "88%", "64%", "76%", "72%"] as const;

/**
 * The rooms, arriving: faded in when they come in over a state that stood in for them, and drawn
 * as they are when they were there from the first frame — on a launch, the cache's rooms are what
 * the launch picture dissolves into, and a fade on top of that is a second arrival.
 */
export function Arrive({
  fade,
  style,
  children,
}: {
  readonly fade: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  const still = useReduceMotion();
  const from = useRef(fade && !still).current;
  const opacity = useRef(new Animated.Value(from ? 0 : 1)).current;
  useEffect(() => {
    if (!from) return;
    const motion = Animated.timing(opacity, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    motion.start();
    return () => motion.stop();
  }, [from, opacity]);
  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  centred: { alignItems: "center", paddingHorizontal: SPACE.xxl + SPACE.sm },
  // The mark is drawn at twenty points and scaled, as the connection sheet's is: one transform,
  // and every pin stays where it belongs. The box is the scaled size, so the words below clear it.
  mark: {
    width: 20 * MARK_SCALE,
    height: 20 * MARK_SCALE,
    alignItems: "center",
    justifyContent: "center",
  },
  blowUp: { transform: [{ scale: MARK_SCALE }] },
  title: {
    marginTop: SPACE.xl,
    fontSize: TEXT.xl,
    fontWeight: "700",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  words: {
    marginTop: SPACE.sm,
    fontSize: TEXT.md,
    lineHeight: Math.round(TEXT.md * 1.4),
    textAlign: "center",
    maxWidth: 310,
  },
  caption: {
    marginTop: SPACE.md,
    fontSize: TEXT.sm,
    fontVariant: ["tabular-nums"],
  },
  button: { marginTop: SPACE.xxl },
  // Where a member's spaces come from, under what a space is: the words' size, a step apart.
  added: {
    marginTop: SPACE.md,
    fontSize: TEXT.md,
    lineHeight: Math.round(TEXT.md * 1.4),
    textAlign: "center",
    maxWidth: 310,
  },
  // The one thing to do on a screen with nothing else on it: a thumb's width, a pill.
  big: { minHeight: 50, borderRadius: RADIUS.pill, paddingHorizontal: SPACE.xxl },
  starters: { marginTop: SPACE.xl, flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  faces: { flexDirection: "row" },
  face: { borderWidth: 2, borderRadius: 11 },
  behind: { marginLeft: -SPACE.sm },
  who: { fontSize: TEXT.sm, lineHeight: Math.round(TEXT.sm * LEADING_PHONE), flexShrink: 1 },
  // The row's own geometry (`List.tsx`): eighty points, a 56-point face, the words beside it.
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    minHeight: 80,
  },
  face56: { width: ROW_AVATAR, height: ROW_AVATAR, borderRadius: ROW_AVATAR / 4 },
  bars: { flex: 1, gap: 9 },
  bar: { height: 11, borderRadius: 6 },
  thin: { height: 9, opacity: 0.7 },
});
