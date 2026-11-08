/**
 * A message pressed and held, lifted out of the room (ADR 0200, Arjun's B of the mock, 18 October
 * 2026): the room goes soft behind it, a copy of the bubble rises out of it at its own place, and
 * what can be done with the message stands round it. Above, on a capsule of the system's glass,
 * what is done to its words where they are — Copy, Select, Share or Edit, Pin. Below, on a card of
 * the same glass, the rest: who said it and when, Not right?, What the run did, the deletions.
 *
 * It replaced a sheet seven blocks tall, which put the message under a scrim and named it in its
 * title. Here the message itself is what is held up, so nothing has to say which one it is.
 *
 * The copy is the line's own drawing of its bubble (`Line.tsx`), laid out at the bubble's width so
 * its words break where the bubble's do. It starts as what the room showed of the bubble — cut where
 * the bar, its band and the composer stand over the room (`seen`) — and ends as that again, while the
 * bubble itself stays in the room and goes soft with it, so nothing comes or goes at once over the
 * chrome. Where the three stand is `lift.ts`'s: as the bubble is, unless the capsule or the card
 * would leave the glass. They are measured before anything moves — laid out shrunk out of sight in
 * their own corner — and come out of the bubble once placed.
 *
 * A quick action that answers with a word (Copy's *Copied*) shows it, and the message is put down a
 * beat later; anything else is the caller's to do, and to put the message down for. A page — Select,
 * Not right?, Edit — is the line's sheet (`LinePages.tsx`), which rises once this has gone.
 */

import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { alpha, Capsule, useGlassy } from "../ui/Glass";
import { Icon } from "../ui/Icon";
import type { IconName } from "../ui/icons";
import { usePalette, useScheme } from "../ui/theme";
import { BUBBLE, SHEET, SPACE, TEXT } from "../ui/tokens";
import { useWindowInsets } from "../ui/windowInsets";
import { LiftBackdrop, LiftCopy, LiftPop, LiftStill } from "./LiftedMotion";
import { LiftLayer } from "./LiftLayer";
import { type Box, type LiftPlace, placeLift, type Size, type Span, shownOf } from "./lift";

/** One of the quick actions on the capsule. */
export interface LiftQuick {
  readonly key: string;
  readonly icon: IconName;
  readonly label: string;
  /** What it says once done, before the message is put down: Copy's *Copied*. */
  readonly done?: string | undefined;
  /** The capsule's first word, said in bold with a rule after it: Reply (ADR 0219). */
  readonly lead?: true | undefined;
  readonly onPress: () => void;
}

/** One of the card's rows. */
export interface LiftRow {
  readonly key: string;
  readonly icon: IconName;
  readonly label: string;
  /** A line under it: the run's one line, on What the run did. */
  readonly sub?: string | undefined;
  /** A figure that heads that line in ink: the run's cost (ADR 0282). */
  readonly lead?: string | undefined;
  /** A deletion's row, in red (ADR 0167). */
  readonly danger?: boolean | undefined;
  readonly onPress: () => void;
}

/** A quick action that said it is done stands this long before the message is put down. */
export const DONE_MS = 650;
/** The card's width: iOS's own menus are this wide, whatever the words in them. */
const CARD_WIDTH = 250;
/** Kept clear of the status bar and the home indicator, past the insets themselves. */
const CLEAR_TOP = SPACE.sm;
const CLEAR_FOOT = SPACE.md;
/** What the room is dimmed with: black, at the sheet's scrim where there is no glass. */
const SHADE = "#000000";

export function LiftedMenu({
  open,
  bubble,
  seen,
  back,
  side,
  copy,
  title,
  quick,
  rows,
  onClose,
  onGone,
}: {
  /** Up; false puts it down, and `onGone` follows once the copy is back on the bubble and gone. */
  readonly open: boolean;
  /** Where the bubble was on the screen when it was held. */
  readonly bubble: Box;
  /** Where its room showed lines whole then; the whole screen outside a room. */
  readonly seen?: Span | undefined;
  /** Where the bubble is, and the room shows lines, as it is put down: the room may have moved. */
  readonly back?: { readonly box: Box; readonly seen?: Span | undefined } | undefined;
  /** The bubble's side: yours on the right. */
  readonly side: "left" | "right";
  /** The bubble, drawn again, at its width. */
  readonly copy: ReactNode;
  /** Who said it, and when. */
  readonly title: string;
  readonly quick: readonly LiftQuick[];
  readonly rows: readonly LiftRow[];
  readonly onClose: () => void;
  /** The menu has gone from the screen: a sheet may rise now. */
  readonly onGone: () => void;
}) {
  const hasCapsule = quick.length > 0;
  const { place, sized } = usePlace(bubble, side, hasCapsule, seen);
  const up = open && place !== undefined;
  const screen = useWindowDimensions();
  useCloseOnTurn(screen, onClose);
  const spans = spansOf(bubble, seen ?? { top: 0, bottom: screen.height }, place, back);
  const corner = side === "right" ? "right" : "left";
  // Once the copy is back on the bubble, the menu goes; what follows waits for it to have gone. The
  // room behind takes touches as soon as it is put down, while the copy is still going back.
  const [landed, setLanded] = useState(false);
  return (
    <LiftLayer shown={!landed} held={open} onGone={onGone} onRequestClose={onClose}>
      <LiftStill>
        <View style={styles.fill} accessibilityViewIsModal onAccessibilityEscape={onClose}>
          <Backdrop open={up} onPress={onClose} />
          <LiftCopy
            open={open}
            ready={place !== undefined}
            x={bubble.x}
            width={bubble.width}
            from={bubble.y}
            dy={place?.dy ?? 0}
            land={back === undefined ? 0 : back.box.y - bubble.y}
            rest={spans.rest}
            back={spans.back}
            lifted={spans.lifted}
            round={spans.round}
            side={side}
            onGone={() => setLanded(true)}
          >
            {copy}
          </LiftCopy>
          {hasCapsule ? (
            <LiftPop
              open={up}
              origin={`${corner} bottom`}
              delay={40}
              onLayout={(event) => sized.capsule(sizeOf(event))}
              style={[styles.at, at(place?.capsule)]}
            >
              <QuickCapsule quick={quick} onClose={onClose} />
            </LiftPop>
          ) : null}
          <LiftPop
            open={up}
            origin={`${corner} top`}
            onLayout={(event) => sized.card(sizeOf(event))}
            style={[styles.at, styles.cardBox, at(place?.card)]}
          >
            <Card title={title} rows={rows} />
          </LiftPop>
        </View>
      </LiftStill>
    </LiftLayer>
  );
}

/**
 * What of the bubble its copy shows: at rest what the room showed (and shows where it goes down to),
 * and up what the menu leaves room for, its corners rounded where it is cut so it reads as a bubble.
 */
function spansOf(
  bubble: Box,
  seen: Span,
  place: LiftPlace | undefined,
  back: { readonly box: Box; readonly seen?: Span | undefined } | undefined,
) {
  const rest = shownOf(bubble, seen);
  const top = place === undefined ? undefined : bubble.y + place.skip + place.dy;
  return {
    rest,
    back: back === undefined ? undefined : shownOf(back.box, back.seen ?? seen),
    lifted: place === undefined || top === undefined ? rest : { top, bottom: top + place.height },
    round: {
      top: place !== undefined && place.skip > 0 ? BUBBLE.radius : 0,
      foot: place !== undefined && place.skip + place.height < bubble.height ? BUBBLE.radius : 0,
    },
  };
}

/**
 * Where the copy, the capsule and the card stand (`placeLift`), once the capsule and the card have
 * said how big they are; nothing until then.
 */
function usePlace(
  bubble: Box,
  side: "left" | "right",
  hasCapsule: boolean,
  seen: Span | undefined,
) {
  const insets = useWindowInsets();
  const screen = useWindowDimensions();
  const [capsule, setCapsule] = useState<Size>();
  const [card, setCard] = useState<Size>();
  const measured = card !== undefined && (!hasCapsule || capsule !== undefined);
  const place = measured
    ? placeLift({
        bubble,
        screen,
        top: insets.top + CLEAR_TOP,
        bottom: insets.bottom + CLEAR_FOOT,
        capsule: hasCapsule ? capsule : undefined,
        card,
        side,
        seen,
      })
    : undefined;
  return { place, sized: { capsule: setCapsule, card: setCard } };
}

/** The room behind: blurred and a little dimmer where there is glass, dimmer alone where not. */
function Backdrop({ open, onPress }: { readonly open: boolean; readonly onPress: () => void }) {
  const scheme = useScheme();
  const glassy = useGlassy();
  const dark = scheme === "dark";
  return (
    <LiftBackdrop
      open={open}
      blur={glassy}
      tint={dark ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight"}
      dim={glassy ? alpha(SHADE, dark ? 0.28 : 0.08) : alpha(SHADE, SHEET.scrim)}
      onPress={onPress}
    />
  );
}

/**
 * The quick actions. One that answers with a word says it, and the message is put down a beat
 * later, unless it went first.
 */
function QuickCapsule({
  quick,
  onClose,
}: {
  readonly quick: readonly LiftQuick[];
  readonly onClose: () => void;
}) {
  const [done, setDone] = useState<string>();
  const later = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(later.current), []);
  const press = (item: LiftQuick) => {
    if (item.done !== undefined) {
      setDone(item.key);
      later.current = setTimeout(onClose, DONE_MS);
    }
    item.onPress();
  };
  const palette = usePalette();
  return (
    <Capsule style={styles.capsule} testID="lift-capsule">
      {quick.map((item, index) => (
        <Fragment key={item.key}>
          <Quick item={item} done={done === item.key} onPress={press} />
          {item.lead === true && index < quick.length - 1 ? (
            <View style={[styles.split, { backgroundColor: alpha(palette.ink, 0.12) }]} />
          ) : null}
        </Fragment>
      ))}
    </Capsule>
  );
}

/** Who said it and when, then the rows, the deletions after a rule. */
function Card({ title, rows }: { readonly title: string; readonly rows: readonly LiftRow[] }) {
  const palette = usePalette();
  const dangerFrom = rows.findIndex((row) => row.danger === true);
  return (
    <Capsule style={styles.card} testID="lift-card">
      <Text numberOfLines={1} style={[styles.title, { color: palette.ink3 }]}>
        {title}
      </Text>
      {rows.map((row, index) => (
        <View key={row.key}>
          {index === dangerFrom && index > 0 ? (
            <View style={[styles.rule, { backgroundColor: alpha(palette.ink, 0.1) }]} />
          ) : null}
          <Row row={row} />
        </View>
      ))}
    </Capsule>
  );
}

/** A turn of the phone moves the bubble out from under its copy: the message is put down. */
function useCloseOnTurn(screen: Size, onClose: () => void) {
  const first = useRef(screen);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (screen.width !== first.current.width || screen.height !== first.current.height) {
      close.current();
    }
  }, [screen.width, screen.height]);
}

/** Where a placed capsule or card stands; one not yet placed is laid out out of sight. */
function at(point: { readonly x: number; readonly y: number } | undefined) {
  return point === undefined ? styles.away : { left: point.x, top: point.y };
}

function sizeOf(event: LayoutChangeEvent): Size {
  const { width, height } = event.nativeEvent.layout;
  return { width, height };
}

function Quick({
  item,
  done,
  onPress,
}: {
  readonly item: LiftQuick;
  readonly done: boolean;
  readonly onPress: (item: LiftQuick) => void;
}) {
  const palette = usePalette();
  const ink = done ? palette.accent : palette.ink;
  const label = done && item.done !== undefined ? item.done : item.label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onPress(item)}
      testID={`lift-${item.key}`}
      style={({ pressed }) => [
        styles.quick,
        pressed ? { backgroundColor: alpha(palette.ink, 0.08) } : null,
      ]}
    >
      <Icon name={done ? "check" : item.icon} size={22} color={ink} weight={done ? 2.2 : 1.75} />
      <Text
        style={[styles.quickWords, item.lead === true ? styles.lead : null, { color: ink }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Row({ row }: { readonly row: LiftRow }) {
  const palette = usePalette();
  const ink = row.danger === true ? palette.red : palette.ink;
  const under = [row.lead, row.sub].filter((part) => part !== undefined && part !== "");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={row.label}
      accessibilityHint={under.length === 0 ? undefined : under.join(" · ")}
      onPress={row.onPress}
      testID={`lift-${row.key}`}
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: alpha(palette.ink, 0.08) } : null,
      ]}
    >
      <View style={styles.rowWords}>
        <Text style={[styles.rowLabel, { color: ink }]}>{row.label}</Text>
        {under.length === 0 ? null : (
          <Text numberOfLines={1} style={[styles.rowSub, { color: palette.ink3 }]}>
            {row.lead === undefined ? null : (
              <Text style={[styles.rowLead, { color: palette.ink }]}>{row.lead}</Text>
            )}
            {row.lead !== undefined && row.sub !== undefined && row.sub !== "" ? " · " : null}
            {row.sub}
          </Text>
        )}
      </View>
      <Icon name={row.icon} size={20} color={ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // A long reply shows as much as fits, cut to the bubble's own corner.
  at: { position: "absolute" },
  // Laid out where it cannot be seen until it is measured and placed.
  away: { left: 0, top: -10_000 },
  capsule: { flexDirection: "row", padding: 6, gap: 2, borderRadius: 999 },
  quick: {
    width: 68,
    alignItems: "center",
    gap: 3,
    paddingTop: SPACE.sm,
    paddingBottom: 6,
    borderRadius: 999,
  },
  quickWords: { fontSize: TEXT.xs, fontWeight: "500" },
  lead: { fontWeight: "700" },
  split: { width: StyleSheet.hairlineWidth, height: 28, alignSelf: "center", marginHorizontal: 3 },
  cardBox: { width: CARD_WIDTH },
  card: { borderRadius: 22, paddingVertical: 6 },
  title: { fontSize: TEXT.sm, paddingHorizontal: SPACE.lg, paddingTop: 6, paddingBottom: SPACE.sm },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: SPACE.xs, marginHorizontal: SPACE.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    minHeight: 44,
    marginHorizontal: 6,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderRadius: 14,
  },
  rowWords: { flex: 1, gap: 1 },
  rowLabel: { fontSize: TEXT.body },
  rowSub: { fontSize: TEXT.sm },
  rowLead: { fontWeight: "600", fontVariant: ["tabular-nums"] },
});
