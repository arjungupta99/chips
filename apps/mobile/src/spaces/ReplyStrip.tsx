/**
 * The strip inside the field's glass while a draft replies to a message (ADR 0219): a bar in the
 * author's colour, "Replying to Jacobian" and " · Tuesday" when it was said on an earlier day, its
 * first line in plain words, and × to let the reply go. Its words are the card's (`replyCard`), so
 * the strip and the card the reply will carry say the same thing. It opens with the glass as the
 * glass grows for it (`OPENS`), and goes at once.
 */

import { type Directory, type ReplyCard, replyCard, type Space } from "@chipschat/core";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { faceProps } from "../agents/face";
import { faceGround } from "../ui/Avatar";
import { alpha } from "../ui/Glass";
import { GrowingView, OPENS, Opens } from "../ui/growing";
import { Icon } from "../ui/Icon";
import { usePalette } from "../ui/theme";
import { BUBBLE, TEXT } from "../ui/tokens";

export function ReplyStrip({
  space,
  lineId,
  directory,
  selfId,
  onClose,
}: {
  readonly space: Space;
  /** The line the draft replies to; nothing is drawn while it replies to none. */
  readonly lineId: string | undefined;
  readonly directory: Directory;
  readonly selfId: string;
  readonly onClose: () => void;
}) {
  const card = useMemo(
    () =>
      lineId === undefined
        ? undefined
        : replyCard(space, { replyTo: lineId }, directory, Date.now()),
    [space, lineId, directory],
  );
  return (
    <Opens>
      {card === undefined ? null : (
        <Strip card={card} directory={directory} selfId={selfId} onClose={onClose} />
      )}
    </Opens>
  );
}

function Strip({
  card,
  directory,
  selfId,
  onClose,
}: {
  readonly card: ReplyCard;
  readonly directory: Directory;
  readonly selfId: string;
  readonly onClose: () => void;
}) {
  const palette = usePalette();
  const who = card.authorId === selfId ? "yourself" : card.name || "a message";
  const bar =
    card.authorId === undefined
      ? palette.ink4
      : faceGround(card.name, faceProps(directory, card.authorId).icon);
  return (
    <GrowingView
      entering={OPENS}
      style={[styles.strip, { backgroundColor: alpha(palette.ink, 0.07) }]}
      testID="reply-strip"
    >
      <View style={[styles.bar, { backgroundColor: bar }]} />
      <View style={styles.body} accessible accessibilityLabel={`Replying to ${who}: ${card.words}`}>
        <Text
          maxFontSizeMultiplier={BUBBLE.maxScale}
          numberOfLines={1}
          style={[styles.name, { color: palette.ink3 }]}
        >
          Replying to <Text style={[styles.who, { color: palette.ink }]}>{who}</Text>
          {card.day === "" ? null : ` · ${card.day}`}
        </Text>
        <Text
          maxFontSizeMultiplier={BUBBLE.maxScale}
          numberOfLines={1}
          style={[
            styles.words,
            { color: palette.ink2 },
            card.state === "shown" ? null : styles.gone,
          ]}
        >
          {card.words}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel reply"
        hitSlop={10}
        onPress={onClose}
        testID="reply-strip-close"
        style={({ pressed }) => [
          styles.close,
          { backgroundColor: alpha(palette.ink, pressed ? 0.16 : 0.09) },
        ]}
      >
        <Icon name="x" size={11} color={palette.ink3} weight={2.4} />
      </Pressable>
    </GrowingView>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 6,
    marginTop: 6,
    paddingVertical: 6,
    paddingLeft: 9,
    paddingRight: 7,
    borderRadius: 17,
    overflow: "hidden",
  },
  bar: { width: 3, alignSelf: "stretch", borderRadius: 3 },
  body: { flex: 1, minWidth: 0 },
  name: { fontSize: TEXT.sm, lineHeight: 17 },
  who: { fontWeight: "600" },
  words: { fontSize: TEXT.md - 0.5, lineHeight: 19 },
  gone: { fontStyle: "italic" },
  close: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
