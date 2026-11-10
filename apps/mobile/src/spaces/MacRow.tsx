/**
 * A row of Universe's Desktop tab, one list (ADR 0227's second addendum, his "B · One list", 24
 * October 2026): its mark, what it is, what it does or what came of pressing it, and its button at
 * the right, as Settings draws a row. What opens under it (a program's Stop and Run again) is the
 * row's own. The program's row is `RunBar.tsx`'s; the page's and the folder's are `Universe.tsx`'s.
 *
 * Its words crossfade as they change, and its button gives under the thumb (`MacMotion.tsx`).
 */

import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { ON_GOLD, TOUCH_TARGET } from "../ui/Button";
import { alpha } from "../ui/glassDial";
import { Icon } from "../ui/Icon";
import type { IconName } from "../ui/icons";
import { Swap } from "../ui/Swap";
import { usePalette, useScheme } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { Moves, Squeeze } from "./MacMotion";

/** How a row's mark is drawn: what it is, or how a program is going. */
/** `off`: a program that isn't running, a grey dot where a lit one goes (the banner over a page). */
export type MarkKind = "ready" | "plain" | "quiet" | "off" | "starting" | "running" | "failed";

/** The row's mark: a tile with an icon, or with a lit dot while a program starts or runs. */
export function RowMark({ kind, icon }: { readonly kind: MarkKind; readonly icon: IconName }) {
  const palette = usePalette();
  const lit = litOf(kind, palette);
  if (lit !== undefined) {
    return (
      <Swap swapKey={kind}>
        <View style={[styles.mark, { backgroundColor: lit.tile }]}>
          <View style={[styles.dot, { backgroundColor: lit.dot }]} />
        </View>
      </Swap>
    );
  }
  const drawn =
    kind === "ready"
      ? { tile: palette.gold, ink: ON_GOLD }
      : kind === "failed"
        ? { tile: palette.redSoft, ink: palette.redInk }
        : { tile: palette.surface3, ink: kind === "quiet" ? palette.ink3 : palette.ink2 };
  return (
    <Swap swapKey={kind}>
      <View style={[styles.mark, { backgroundColor: drawn.tile }]}>
        <Icon name={icon} size={16} color={drawn.ink} />
      </View>
    </Swap>
  );
}

/** A mark drawn as a dot on its tile: green running, gold starting, grey off; nothing for an icon. */
function litOf(
  kind: MarkKind,
  palette: ReturnType<typeof usePalette>,
): { readonly tile: string; readonly dot: string } | undefined {
  if (kind === "running") return { tile: palette.greenSoft, dot: palette.green };
  if (kind === "starting") return { tile: palette.goldSoft, dot: palette.gold };
  if (kind === "off") return { tile: palette.surface3, dot: palette.ink4 };
  return undefined;
}

/** What a row says under its name, and in which voice: as it is, heard, or gone wrong. */
export type Voice = "plain" | "heard" | "bad";

export function MacRow({
  mark,
  title,
  titleBad = false,
  aside,
  body,
  bodyKey,
  voice = "plain",
  action,
  actionKey,
  parted,
  under,
  titleTestID,
  bodyTestID,
  testID,
}: {
  readonly mark: ReactNode;
  readonly title: string;
  /** How it ended was bad: "It stopped after 3 seconds." */
  readonly titleBad?: boolean;
  /** Beside the name, at the right: how long it has run. */
  readonly aside?: string | undefined;
  readonly body?: ReactNode;
  /** What the words under the name are, so a change of them crossfades and a count does not. */
  readonly bodyKey: string;
  readonly voice?: Voice;
  readonly action?: ReactNode;
  /** Which button is at the right, so one replacing another crossfades. */
  readonly actionKey: string;
  /** Not the first row: a hairline over it. */
  readonly parted: boolean;
  readonly under?: ReactNode;
  readonly titleTestID?: string | undefined;
  readonly bodyTestID?: string | undefined;
  readonly testID?: string | undefined;
}) {
  const palette = usePalette();
  const ink =
    voice === "heard" ? palette.greenInk : voice === "bad" ? palette.redInk : palette.ink3;
  return (
    <Moves
      style={parted ? [styles.parted, { borderTopColor: palette.line }] : undefined}
      testID={testID}
    >
      <View style={styles.row}>
        {mark}
        <View style={styles.words}>
          <Swap swapKey={title}>
            <View style={styles.named}>
              <Text
                style={[styles.title, { color: titleBad ? palette.redInk : palette.ink }]}
                testID={titleTestID}
              >
                {title}
              </Text>
              {aside === undefined ? null : (
                <Text style={[styles.aside, { color: palette.ink3 }]}>{aside}</Text>
              )}
            </View>
          </Swap>
          <Swap swapKey={bodyKey}>
            {body === undefined ? null : (
              <Text style={[styles.body, { color: ink }]} testID={bodyTestID}>
                {body}
              </Text>
            )}
          </Swap>
        </View>
        <Swap swapKey={actionKey}>{action ?? null}</Swap>
      </View>
      {under}
    </Moves>
  );
}

/**
 * The button at a row's right: gold for what the space made, Run and the page's Open (his "open for
 * files should be yellow as well"), and a blue tint, Send's blue, for the folder's Open (his "A · Blue
 * tint", 24 October 2026). Stop on the banner over a page is the Desktop tab's Stop: red on its soft
 * red.
 */
export function RowButton({
  label,
  icon,
  tone,
  busy = false,
  disabled = false,
  onPress,
  accessibilityLabel,
  testID,
}: {
  readonly label: string;
  readonly icon?: IconName | undefined;
  readonly tone: "gold" | "blue" | "stop";
  /** Asking the Mac: it says so, and takes no more presses until it has heard. */
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
  /** The whole of what it does, where its word is short: "Run program", "Open folder in Mac". */
  readonly accessibilityLabel: string;
  readonly testID: string;
}) {
  const palette = usePalette();
  const scheme = useScheme();
  const off = disabled || busy;
  const gold = tone === "gold";
  const ink = gold ? ON_GOLD : tone === "stop" ? palette.redInk : palette.blueInk;
  const ground = gold
    ? palette.gold
    : tone === "stop"
      ? palette.redSoft
      : alpha(palette.blue, BLUE_TINT[scheme]);
  return (
    <Squeeze
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      hitSlop={HIT}
      onPress={onPress}
      style={[styles.button, { backgroundColor: ground }, disabled ? styles.off : null]}
      testID={testID}
    >
      {busy ? (
        <ActivityIndicator size="small" color={ink} />
      ) : icon === undefined ? null : (
        <Icon name={icon} size={13} color={ink} />
      )}
      <Text style={[styles.label, { color: ink }]}>{label}</Text>
    </Squeeze>
  );
}

/**
 * How much of Send's blue is in the folder's Open, over the card. The palette's own soft blue sank
 * into the card in dark, "blending with background" (Arjun, 24 October 2026), so dark takes more of
 * it and light a touch more than the soft blue's, for the same lift off the card in each.
 */
const BLUE_TINT = { dark: 0.28, light: 0.14 } as const;

/** A row's button is drawn smaller than a thumb, and reaches as far as one. */
const BUTTON = 32;
const HIT = (TOUCH_TARGET - BUTTON) / 2;

/** Where what opens under a row starts: under its words, past the mark. */
export const UNDER_INSET = SPACE.md + 32 + SPACE.md;

const styles = StyleSheet.create({
  parted: { borderTopWidth: StyleSheet.hairlineWidth },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.md - 2,
    minHeight: 62,
  },
  mark: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { width: 11, height: 11, borderRadius: 6 },
  words: { flex: 1, minWidth: 0, gap: 2 },
  named: { flexDirection: "row", alignItems: "baseline", gap: SPACE.sm },
  title: { flexShrink: 1, fontSize: TEXT.md, fontWeight: "600" },
  aside: { marginLeft: "auto", fontSize: TEXT.xs, fontVariant: ["tabular-nums"] },
  body: { fontSize: TEXT.sm, lineHeight: 18 },
  button: {
    height: BUTTON,
    paddingHorizontal: SPACE.md + 2,
    borderRadius: BUTTON / 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  off: { opacity: 0.5 },
  label: { fontSize: TEXT.md, fontWeight: "600" },
});
