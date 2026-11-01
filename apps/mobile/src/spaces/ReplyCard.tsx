/**
 * A reply in the room (ADR 0219): the card quoting the message it answers, above its words, and
 * the mark under a message that has replies.
 *
 * The card is a bar in the author's colour, their name and the day when it was not today, and two
 * lines of the words as they read now, with a small photo when the message holds one. On your own
 * bubble it is a darker inset with white words; on anyone else's it tints the ink. Pressing it goes
 * to the message, the room's one way (`goTo`); holding it lifts the bubble it is in, as holding the
 * words does (`HoldLine`). A message deleted, deleted for you or not on this phone is said, and the
 * card goes nowhere.
 *
 * The mark, "↳ 1 reply", stands under the bubble, outside it, so the lift's measure and the room's
 * seen edges keep measuring the bubble alone. It goes to the newest reply.
 */

import {
  type Attachment,
  type ReplyCard as Card,
  type Directory,
  repliesWords,
} from "@chipschat/core";
import { Image } from "expo-image";
import { useContext, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { faceProps } from "../agents/face";
import { faceGround } from "../ui/Avatar";
import { alpha } from "../ui/glassDial";
import { Icon } from "../ui/Icon";
import { usePalette } from "../ui/theme";
import { BUBBLE, RADIUS, TEXT } from "../ui/tokens";
import type { FileService } from "./files";
import { HoldLine } from "./Markdown";

const PHOTO = 36;

export function ReplyCard({
  card,
  mine,
  directory,
  files,
  onPress,
}: {
  readonly card: Card;
  readonly mine: boolean;
  readonly directory: Directory;
  readonly files?: FileService | undefined;
  /** Goes to the quoted line; absent on the bubble's copy over the room, which goes nowhere. */
  readonly onPress?: ((lineId: string) => void) | undefined;
}) {
  const hold = useContext(HoldLine);
  const ink = useCardInk(card, mine, directory);
  const photo = card.holds?.kind === "photo" ? card.holds.attachment : undefined;
  const goes = card.state === "shown" && onPress !== undefined;
  return (
    <Pressable
      accessibilityRole={goes ? "button" : "text"}
      accessibilityLabel={`Replying to ${card.name || "a message"}${card.day && `, ${card.day}`}: ${card.words}`}
      accessibilityHint={goes ? "Goes to the message" : undefined}
      onPress={goes ? () => onPress(card.lineId) : undefined}
      onLongPress={hold}
      testID={`reply-card-${card.lineId}`}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: ink.ground },
        pressed && goes ? styles.pressed : null,
      ]}
    >
      <View style={[styles.bar, { backgroundColor: ink.bar }]} />
      <View style={styles.body}>
        <CardName card={card} ink={ink} />
        <Text
          maxFontSizeMultiplier={BUBBLE.maxScale}
          numberOfLines={2}
          style={[styles.words, { color: ink.words }, card.state === "shown" ? null : styles.gone]}
        >
          {card.words}
        </Text>
      </View>
      {photo === undefined || files === undefined ? null : (
        <Photo attachment={photo} files={files} />
      )}
    </Pressable>
  );
}

interface CardInk {
  readonly ground: string;
  readonly bar: string;
  readonly name: string;
  readonly day: string;
  readonly words: string;
}

/**
 * The card's colours: on your own bubble a darker inset with white words, on anyone else's the ink
 * tinted, with the bar in the author's colour.
 */
function useCardInk(card: Card, mine: boolean, directory: Directory): CardInk {
  const palette = usePalette();
  if (mine) {
    return {
      ground: "rgba(0,0,0,0.2)",
      bar: "rgba(255,255,255,0.9)",
      name: "#fff",
      day: "rgba(255,255,255,0.75)",
      words: "rgba(255,255,255,0.86)",
    };
  }
  const bar =
    card.authorId === undefined
      ? palette.ink4
      : faceGround(card.name, faceProps(directory, card.authorId).icon);
  return {
    ground: alpha(palette.ink, 0.065),
    bar,
    name: palette.ink,
    day: palette.ink3,
    words: palette.ink2,
  };
}

/** Who said it, and the day when it was not today. Nothing for a message this phone doesn't hold. */
function CardName({ card, ink }: { readonly card: Card; readonly ink: CardInk }) {
  if (card.name === "") return null;
  return (
    <Text
      maxFontSizeMultiplier={BUBBLE.maxScale}
      numberOfLines={1}
      style={[styles.name, { color: ink.name }]}
    >
      {card.name}
      {card.day === "" ? null : (
        <Text style={[styles.day, { color: ink.day }]}>{` · ${card.day}`}</Text>
      )}
    </Text>
  );
}

/** The quoted photo, small, at the card's end. A picture that will not come leaves its ground. */
function Photo({
  attachment,
  files,
}: {
  readonly attachment: Attachment;
  readonly files: FileService;
}) {
  const palette = usePalette();
  const [uri, setUri] = useState<string | undefined>(undefined);
  useEffect(() => {
    let live = true;
    files.thumb(attachment.id).then(
      (got) => {
        if (live) setUri(got);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [files, attachment.id]);
  return (
    <View style={[styles.photo, { backgroundColor: palette.surface3 }]}>
      {uri === undefined ? null : (
        <Image
          source={{ uri }}
          contentFit="cover"
          recyclingKey={attachment.id}
          accessibilityIgnoresInvertColors
          style={StyleSheet.absoluteFill}
          testID={`reply-photo-${attachment.id}`}
        />
      )}
    </View>
  );
}

/** "↳ 1 reply" under a message that has replies; it goes to the newest. */
export function RepliesMark({
  replies,
  mine,
  onPress,
}: {
  readonly replies: readonly string[];
  readonly mine: boolean;
  readonly onPress?: ((lineId: string) => void) | undefined;
}) {
  const palette = usePalette();
  const newest = replies.at(-1);
  if (newest === undefined) return null;
  const words = repliesWords(replies.length);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={words}
      accessibilityHint="Goes to the newest reply"
      hitSlop={8}
      onPress={onPress === undefined ? undefined : () => onPress(newest)}
      testID={`replies-${newest}`}
      style={[styles.mark, mine ? styles.markMine : null]}
    >
      <Icon name="route" size={14} color={palette.ink3} weight={2} />
      <Text
        maxFontSizeMultiplier={BUBBLE.maxScale}
        style={[styles.markWords, { color: palette.ink3 }]}
      >
        {words}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginHorizontal: -7,
    marginTop: -1,
    marginBottom: 6,
    paddingVertical: 6,
    paddingLeft: 7,
    paddingRight: 10,
    borderRadius: 13,
    overflow: "hidden",
  },
  pressed: { opacity: 0.7 },
  bar: { width: 3, alignSelf: "stretch", borderRadius: 3 },
  // Grows from its words' own width, not from nought: a reply of "Ok" drew its card as narrow as
  // the "Ok", one letter to a line (the reply walk, 23 October 2026). The bubble is as wide as the
  // card needs, as far as its widest.
  body: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  name: { fontSize: TEXT.sm + 0.5, lineHeight: 18, fontWeight: "600" },
  day: { fontSize: TEXT.sm, fontWeight: "500" },
  words: { fontSize: TEXT.md - 0.5, lineHeight: 19 },
  gone: { fontStyle: "italic" },
  photo: { width: PHOTO, height: PHOTO, borderRadius: RADIUS.sm, overflow: "hidden" },
  mark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
    alignSelf: "flex-start",
  },
  markMine: { alignSelf: "flex-end" },
  markWords: { fontSize: TEXT.sm, fontWeight: "600" },
});
