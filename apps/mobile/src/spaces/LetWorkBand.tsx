/**
 * The band under a room's bar while an agent works there without asking (ADR 0281, ADR 0286):
 * `Jiro is working without asking`, until when for a yes given for an hour, Stop and ×. Its words
 * open the agent's Permissions.
 *
 * Stop ends the yes (`approval.held_stopped`): the band says `Stopped. Jiro asks again from its
 * next step.` for a moment and goes, and the agent's next ask comes to a person as usual.
 *
 * × only puts the band away, on all this person's devices, until the agent is given a new yes. The
 * band says `Hidden for now` for five seconds first, with Disable banner and Undo, and a hairline
 * counts them; then it folds. Disable banner says the person doesn't want it for this agent at all,
 * and the band says so, with Undo, and folds. The agent goes on working through all of it: none of
 * this changes what it may do. The words are core's, so the web and the Mac say the same.
 */

import {
  BANNER_DISABLE_WORDS,
  BANNER_HIDDEN_MS,
  BANNER_HIDDEN_WORDS,
  BANNER_OFF_MS,
  BANNER_UNDO_WORDS,
  bannerClosed,
  bannerOffWords,
  bannerWanted,
  type Directory,
  type LetWork,
  lettingWork,
  NO_BANNERS,
  nameOf,
  type Space,
  STOP_WORDS,
  STOPPED_MS,
  type Store,
  stoppedWords,
  workingWords,
} from "@chipschat/core";
import { useRouter } from "expo-router";
import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { alpha } from "../ui/glassDial";
import * as feel from "../ui/haptics";
import { Icon } from "../ui/Icon";
import { usePalette } from "../ui/theme";
import { ON_GOLD, RADIUS, SPACE, TEXT } from "../ui/tokens";
import { useNow } from "../ui/useNow";
import { BandIn, BandWords, Hair, Pulse } from "./LetWorkMotion";

/** What a band is saying after a tap on it, and until when. */
type After =
  // `back`: Undo was pressed. It holds the band up until the store's word has caught up, so it
  // doesn't go for a frame and fold in again.
  | { readonly kind: "hidden" | "off" | "back"; readonly until: number }
  | { readonly kind: "stopped"; readonly until: number; readonly name: string };

/** Long enough for the store's next draw to say the band is wanted again. */
const BACK_MS = 800;

const quietly = (done: Promise<void>) => {
  done.catch(() => feel.warning());
};

export function LetWorkBand({
  store,
  space,
  directory,
  onOpenPermissions,
}: {
  readonly store: Store;
  readonly space: Space;
  readonly directory: Directory;
  /** An agent's Permissions. Absent, the page is pushed. */
  readonly onOpenPermissions?: ((agentId: string) => void) | undefined;
}) {
  const now = useNow(space.letWork !== undefined);
  const router = useRouter();
  // Only what the banners are, so a room is not drawn again for everything else the store hears.
  const banners = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().banners ?? NO_BANNERS,
  );
  const mayDisable = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().keepsBanners !== false,
  );
  const [after, setAfter] = useState<Readonly<Record<string, After>>>({});
  const say = (asker: string, next: After | undefined) =>
    setAfter(({ [asker]: _was, ...others }) =>
      next === undefined ? others : { ...others, [asker]: next },
    );
  useEffect(() => {
    const timers = Object.entries(after).map(([asker, each]) =>
      setTimeout(
        () => setAfter(({ [asker]: _gone, ...others }) => others),
        Math.max(0, each.until - Date.now()),
      ),
    );
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [after]);
  if (space.state !== "open") return null;
  const holding = lettingWork(space, now);
  const shown = holding.filter(
    (held) =>
      after[held.asker] !== undefined ||
      (bannerWanted(banners, directory, held.asker) && !bannerClosed(banners, space.id, held)),
  );
  // A band that said Stop stays to say so after the server's word has ended the yes.
  const stoppedAlone = Object.entries(after).filter(
    ([asker, each]) => each.kind === "stopped" && !holding.some((held) => held.asker === asker),
  );
  if (shown.length === 0 && stoppedAlone.length === 0) return null;

  const open = (asker: string) => {
    feel.tap();
    if (directory[asker]?.kind !== "agent") {
      router.push({ pathname: "/harnesses/[id]/[part]", params: { id: asker, part: "asks" } });
    } else if (onOpenPermissions !== undefined) {
      onOpenPermissions(asker);
    } else {
      router.push(`/agents/${asker}/permissions`);
    }
  };
  const act = (held: LetWork, name: string): BandActs => ({
    stop: () => {
      feel.tap();
      store.stopLetWork({ spaceId: space.id, asker: held.asker });
      say(held.asker, { kind: "stopped", name, until: Date.now() + STOPPED_MS });
    },
    close: () => {
      feel.tap();
      quietly(store.closeBanner({ spaceId: space.id, asker: held.asker, since: held.since }));
      say(held.asker, { kind: "hidden", until: Date.now() + BANNER_HIDDEN_MS });
    },
    undoClose: () => {
      feel.tap();
      quietly(store.reopenBanner({ spaceId: space.id, asker: held.asker }));
      say(held.asker, { kind: "back", until: Date.now() + BACK_MS });
    },
    disable: () => {
      feel.tap();
      // Off says all of it, so turning it back on later shows the band at once.
      quietly(store.setAgentBanner(held.asker, false));
      quietly(store.reopenBanner({ spaceId: space.id, asker: held.asker }));
      say(held.asker, { kind: "off", until: Date.now() + BANNER_OFF_MS });
    },
    undoOff: () => {
      feel.tap();
      quietly(store.setAgentBanner(held.asker, true));
      say(held.asker, { kind: "back", until: Date.now() + BACK_MS });
    },
    open: () => open(held.asker),
  });

  return (
    <View testID="let-work-bands">
      {shown.map((held) => {
        const name = nameOf(directory, held.asker);
        return (
          // The same band, by the same key, its words crossing over as it changes.
          <HeldBand
            key={held.asker}
            words={workingWords(name, held)}
            name={name}
            after={after[held.asker]}
            mayDisable={mayDisable}
            acts={act(held, name)}
          />
        );
      })}
      {stoppedAlone.map(([asker, each]) => (
        <Band key={asker} words={each.kind === "stopped" ? stoppedWords(each.name) : ""} />
      ))}
    </View>
  );
}

interface BandActs {
  readonly stop: () => void;
  readonly close: () => void;
  readonly undoClose: () => void;
  readonly disable: () => void;
  readonly undoOff: () => void;
  readonly open: () => void;
}

/** A band of a yes still holding: working, or saying what was just done to it. */
function HeldBand({
  words,
  name,
  after,
  mayDisable,
  acts,
}: {
  readonly words: string;
  readonly name: string;
  readonly after: After | undefined;
  readonly mayDisable: boolean;
  readonly acts: BandActs;
}) {
  if (after?.kind === "stopped") return <Band words={stoppedWords(after.name)} />;
  if (after?.kind === "off") {
    return (
      <Band words={bannerOffWords(name)} hair={BANNER_OFF_MS}>
        <TextAct words={BANNER_UNDO_WORDS} onPress={acts.undoOff} testID="let-work-undo-off" />
      </Band>
    );
  }
  if (after?.kind === "hidden") {
    return (
      <Band words={BANNER_HIDDEN_WORDS} hair={BANNER_HIDDEN_MS}>
        {mayDisable ? (
          <PillAct
            words={BANNER_DISABLE_WORDS}
            label={`Disable the banner for ${name}`}
            solid
            onPress={acts.disable}
            testID="let-work-disable"
          />
        ) : null}
        <TextAct words={BANNER_UNDO_WORDS} onPress={acts.undoClose} testID="let-work-undo-close" />
      </Band>
    );
  }
  return (
    <Band words={words} live onOpen={acts.open} openLabel={`${words}. Opens ${name}'s permissions`}>
      <PillAct
        words={STOP_WORDS}
        label={`Stop ${name} working without asking`}
        onPress={acts.stop}
        testID="let-work-stop"
      />
      <CloseAct onPress={acts.close} />
    </Band>
  );
}

function Band({
  words,
  live = false,
  hair,
  onOpen,
  openLabel,
  children,
}: {
  readonly words: string;
  /** The yes is working: its dot breathes. */
  readonly live?: boolean;
  /** How long it stands, for the hairline that counts it down. */
  readonly hair?: number;
  readonly onOpen?: () => void;
  readonly openLabel?: string;
  readonly children?: ReactNode;
}) {
  const palette = usePalette();
  const said = (
    <>
      <Pulse color={palette.gold} still={!live} />
      <BandWords wordsKey={words}>
        <Text style={[styles.words, { color: palette.goldDeep }]} accessibilityRole="text">
          {words}
        </Text>
      </BandWords>
    </>
  );
  return (
    <BandIn
      style={[
        styles.band,
        { backgroundColor: palette.goldSoft, borderColor: alpha(palette.gold, 0.5) },
      ]}
      testID="let-work-band"
    >
      {hair === undefined ? null : <Hair key={words} ms={hair} color={palette.gold} />}
      {onOpen === undefined ? (
        <View style={styles.said}>{said}</View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={openLabel}
          onPress={onOpen}
          style={({ pressed }) => [styles.said, pressed ? styles.pressed : null]}
          testID="let-work-open"
        >
          {said}
        </Pressable>
      )}
      {children}
    </BandIn>
  );
}

function PillAct({
  words,
  label,
  solid = false,
  onPress,
  testID,
}: {
  readonly words: string;
  readonly label: string;
  readonly solid?: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={SPACE.sm}
      style={({ pressed }) => [
        styles.pill,
        solid
          ? { backgroundColor: palette.gold, borderColor: palette.gold }
          : { borderColor: alpha(palette.goldDeep, 0.35) },
        pressed ? styles.pressed : null,
      ]}
      testID={testID}
    >
      <Text style={[styles.pillWords, { color: solid ? ON_GOLD : palette.goldDeep }]}>{words}</Text>
    </Pressable>
  );
}

function TextAct({
  words,
  onPress,
  testID,
}: {
  readonly words: string;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={words}
      onPress={onPress}
      hitSlop={SPACE.sm}
      style={({ pressed }) => [styles.text, pressed ? styles.pressed : null]}
      testID={testID}
    >
      <Text style={[styles.pillWords, { color: palette.goldDeep }]}>{words}</Text>
    </Pressable>
  );
}

function CloseAct({ onPress }: { readonly onPress: () => void }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close this banner"
      accessibilityHint="Hides it until this agent is given a new yes. The agent keeps working."
      onPress={onPress}
      hitSlop={SPACE.sm}
      style={({ pressed }) => [styles.close, pressed ? styles.pressed : null]}
      testID="let-work-close"
    >
      <Icon name="x" size={14} color={palette.goldDeep} weight={2.6} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  band: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  said: { flex: 1, flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  words: { fontSize: TEXT.sm, fontWeight: "600" },
  pill: {
    paddingHorizontal: SPACE.md,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  text: { paddingHorizontal: SPACE.xs, paddingVertical: 3 },
  pillWords: { fontSize: TEXT.sm, fontWeight: "700" },
  close: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.6 },
});
