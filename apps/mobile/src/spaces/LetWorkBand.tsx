/**
 * The band under a room's bar while an agent works there without asking (ADR 0281): `Jiro is
 * working without asking`, until when for a yes given for an hour, and Stop. It stays as long as
 * the yes holds, so it is never forgotten; an hour's goes once its hour is up.
 *
 * Stop ends it at once (`approval.held_stopped`): the band says `Stopped. Jiro asks again from its
 * next step.` for a moment and goes, and the agent's next ask comes to a person as usual. The
 * words are core's, so the web and the Mac say the same.
 */

import {
  type Directory,
  lettingWork,
  nameOf,
  type Space,
  STOPPED_MS,
  type Store,
  stoppedWords,
  workingWords,
} from "@chipschat/core";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { alpha } from "../ui/glassDial";
import * as feel from "../ui/haptics";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { useNow } from "../ui/useNow";
import { BandIn, BandWords, Pulse } from "./LetWorkMotion";

export function LetWorkBand({
  store,
  space,
  directory,
}: {
  readonly store: Store;
  readonly space: Space;
  readonly directory: Directory;
}) {
  const now = useNow(space.letWork !== undefined);
  const [stopped, setStopped] = useState<{ readonly asker: string; readonly name: string }>();
  useEffect(() => {
    if (stopped === undefined) return;
    const timer = setTimeout(() => setStopped(undefined), STOPPED_MS);
    return () => clearTimeout(timer);
  }, [stopped]);
  if (space.state !== "open") return null;
  const holding = lettingWork(space, now).filter((held) => held.asker !== stopped?.asker);
  if (holding.length === 0 && stopped === undefined) return null;
  return (
    <View testID="let-work-bands">
      {holding.map((held) => {
        const name = nameOf(directory, held.asker);
        return (
          <Band
            key={held.asker}
            words={workingWords(name, held)}
            stopLabel={`Stop ${name} working without asking`}
            onStop={() => {
              feel.tap();
              store.stopLetWork({ spaceId: space.id, asker: held.asker });
              setStopped({ asker: held.asker, name });
            }}
          />
        );
      })}
      {/* The same band, by the same key, its words crossing over to say it stopped. */}
      {stopped === undefined ? null : (
        <Band key={stopped.asker} words={stoppedWords(stopped.name)} />
      )}
    </View>
  );
}

function Band({
  words,
  stopLabel,
  onStop,
}: {
  readonly words: string;
  readonly stopLabel?: string;
  readonly onStop?: () => void;
}) {
  const palette = usePalette();
  return (
    <BandIn
      style={[
        styles.band,
        { backgroundColor: palette.goldSoft, borderColor: alpha(palette.gold, 0.5) },
      ]}
      testID="let-work-band"
    >
      <Pulse color={palette.gold} still={onStop === undefined} />
      <BandWords wordsKey={words}>
        <Text style={[styles.words, { color: palette.goldDeep }]} accessibilityRole="text">
          {words}
        </Text>
      </BandWords>
      {onStop === undefined ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={stopLabel}
          onPress={onStop}
          hitSlop={SPACE.sm}
          style={({ pressed }) => [
            styles.stop,
            { borderColor: alpha(palette.goldDeep, 0.35) },
            pressed ? styles.pressed : null,
          ]}
          testID="let-work-stop"
        >
          <Text style={[styles.stopWords, { color: palette.goldDeep }]}>Stop</Text>
        </Pressable>
      )}
    </BandIn>
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
  },
  words: { fontSize: TEXT.sm, fontWeight: "600" },
  stop: {
    paddingHorizontal: SPACE.md,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  stopWords: { fontSize: TEXT.sm, fontWeight: "700" },
  pressed: { opacity: 0.6 },
});
