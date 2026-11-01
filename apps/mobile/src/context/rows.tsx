/**
 * A context file's row (ADR 0135), as the mock drew it: the tile its role picks, its title, its
 * file's name and line under it, and a tag for what is not simply the agent's own: **Shared**
 * with its harness's mark, **Its own** in gold once it was given one in place of a shared file,
 * **Read only** with a lock. A row that was just saved flashes gold as the page comes back.
 */

import type { ContextRow, ContextTag, LinkedWords } from "@chipschat/core";
import { type ReactNode, useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";
import { faceGround } from "../ui/Avatar";
import { useFacePaint } from "../ui/faceTheme";
import { GroupFoot, GroupRow, RowMark } from "../ui/Group";
import { Icon } from "../ui/Icon";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";
import { markOf } from "./marks";

const NATIVE = Platform.OS !== "web";

/** A harness's squircle, small and without its letters: where a file came from, and whose page. */
export function HarnessMark({ name, side }: { readonly name: string; readonly side: number }) {
  const faces = useFacePaint();
  return (
    <View
      style={{
        width: side,
        height: side,
        borderRadius: side * 0.32,
        backgroundColor: faces.ground(faceGround(name, undefined)),
      }}
    />
  );
}

/** A tile for a role: its icon, white, on its ground. */
export function RoleTile({ row, side = 30 }: { readonly row: ContextRow; readonly side?: number }) {
  const mark = markOf(row.role);
  if (side === 30) return <RowMark icon={mark.icon} tint={mark.tint} ink="#ffffff" />;
  return (
    <View style={[styles.tile, { width: side, height: side, backgroundColor: mark.tint }]}>
      <Icon name={mark.icon} size={side * 0.62} color="#ffffff" />
    </View>
  );
}

/** What is not simply the agent's own about a file. */
export function Tag({
  tag,
  harnessName,
}: {
  readonly tag: ContextTag | undefined;
  readonly harnessName: string;
}) {
  const palette = usePalette();
  if (tag === undefined) return null;
  if (tag === "own") {
    return (
      <View style={[styles.tag, styles.ownTag, { backgroundColor: palette.goldSoft }]}>
        <Text style={[styles.tagWords, { color: palette.goldDeep }]}>Its own</Text>
      </View>
    );
  }
  return (
    <View style={[styles.tag, { backgroundColor: palette.surface3 }]} testID={`tag-${tag}`}>
      {tag === "shared" ? (
        <HarnessMark name={harnessName} side={16} />
      ) : (
        <Icon name="lock" size={13} color={palette.ink2} />
      )}
      <Text style={[styles.tagWords, { color: palette.ink2 }]}>
        {tag === "shared" ? "Shared" : "Read only"}
      </Text>
    </View>
  );
}

/**
 * The gold under a row that was just saved: lit at once, held a beat, then gone, as the mock's
 * landing does (scene 2). Each new `pulse` lights it again. Still for Reduce Motion: no flash.
 */
export function Glow({ pulse }: { readonly pulse: number }) {
  const palette = usePalette();
  const less = useReduceMotion();
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (pulse === 0 || less) return;
    glow.setValue(1);
    Animated.timing(glow, {
      toValue: 0,
      duration: 1050,
      delay: 850,
      useNativeDriver: NATIVE,
    }).start();
  }, [pulse, less, glow]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: palette.goldSoft, opacity: glow }]}
      testID={pulse === 0 ? undefined : "context-flash"}
    />
  );
}

/** The line under a file's title: its own name, a little darker, then what the row says. */
function FileLine({ row }: { readonly row: ContextRow }) {
  const palette = usePalette();
  return (
    <>
      <Text style={[styles.fileName, { color: palette.ink2 }]}>{row.name}</Text>
      {row.line === "" ? "" : ` · ${row.line}`}
    </>
  );
}

export function FileRow({
  row,
  harnessName,
  pulse = 0,
  trailing,
  onPress,
}: {
  readonly row: ContextRow;
  readonly harnessName: string;
  readonly pulse?: number;
  /** In the tag's place: on a harness's page, how many of its agents read it. */
  readonly trailing?: ReactNode;
  readonly onPress: () => void;
}) {
  return (
    <GroupRow
      label={row.title}
      sub={<FileLine row={row} />}
      subLines={1}
      mark={<RoleTile row={row} />}
      trailing={trailing ?? <Tag tag={row.tag} harnessName={harnessName} />}
      under={<Glow pulse={pulse} />}
      onPress={onPress}
      accessibilityLabel={`${row.title}, ${row.name}${row.tag === undefined ? "" : `, ${TAG_WORDS[row.tag]}`}`}
      testID={`context-row-${row.name}`}
    />
  );
}

const TAG_WORDS: Readonly<Record<ContextTag, string>> = {
  shared: "shared",
  own: "its own",
  read_only: "read only",
};

/** The quiet last row past the eighth file: how many Chips leaves out, and which. */
export function NotShownRow({ title, line }: { readonly title: string; readonly line: string }) {
  const palette = usePalette();
  return (
    <GroupRow
      label={title}
      sub={line}
      subLines={1}
      mark={<RowMark icon="more" ink={palette.ink3} />}
      tone="quiet"
      testID="context-not-shown"
    />
  );
}

/** A foot with a link in it, the link in the system's blue. */
export function LinkedFoot({
  words,
  onLink,
  testID,
}: {
  readonly words: LinkedWords;
  readonly onLink: () => void;
  readonly testID?: string;
}) {
  const palette = usePalette();
  const link: ReactNode =
    words.link === undefined ? null : (
      <Text
        accessibilityRole="link"
        onPress={onLink}
        style={{ color: palette.blue }}
        testID={testID === undefined ? undefined : `${testID}-link`}
      >
        {words.link}
      </Text>
    );
  return (
    <GroupFoot testID={testID}>
      {words.before}
      {link}
      {words.after ?? ""}
    </GroupFoot>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: 7, alignItems: "center", justifyContent: "center" },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 22,
    paddingLeft: 4,
    paddingRight: SPACE.sm,
    borderRadius: 11,
  },
  ownTag: { paddingLeft: SPACE.sm },
  tagWords: { fontSize: TEXT.xs, fontWeight: "600" },
  fileName: { fontWeight: "500" },
});
