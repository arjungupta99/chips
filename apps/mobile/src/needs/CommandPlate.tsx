/**
 * A command on its ask (ADR 0280): one part to a line, the way Chips reads it, each line led by
 * how it follows the one before (`›` after `;` or `&&`, `|` for a pipe). It was a JSON dump of the
 * ask's input under a headline that said the command again, cut off (Ike's ask, 6 November 2026).
 *
 * The words a standing yes would remember are in bold, and under Always they light up gold in
 * their place, one after another down the plate, which is what Always keeps; there is no list of
 * them beside it. Output thrown away is struck through, since a yes remembers nothing of it. A
 * write into a file and a part on the never list are in red, and the line in the tray that keeps
 * the ask to once names the same words.
 *
 * A pass of light goes down it as the screen opens (`AskMotion`), so the eye starts at the top.
 */

import type { Approval, Plate, PlateBit, PlateJoint } from "@chipschat/core";
import { plateCaption, plateTakesPreview } from "@chipschat/core";
import { StyleSheet, Text, View } from "react-native";
import { useGround } from "../ui/ground";
import { usePalette, useScheme } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { AskPreview, CodeWords } from "./Asked";
import { LitWords, Sweep } from "./AskMotion";

/** Menlo at the plate's size: about this wide a character, the gap a space leaves. */
const SIZE = 13;
const SPACE_WIDTH = SIZE * 0.6;

/** The pass of light's strength over the plate, by the theme: the mock's `--sweep`. */
const SWEEP = { light: 0.28, dark: 0.18 } as const;

/**
 * Bits run together where a line marks them as one: `git log`, `rm -rf`. Other words stand alone,
 * so a long line wraps between them rather than taking its whole tail to the next line.
 */
type Run =
  | { readonly kind: "start"; readonly text: string; readonly order: number }
  | { readonly kind: "never" | "word" | "dropped" | "writes"; readonly text: string };

function runsOf(bits: readonly PlateBit[]): Run[] {
  const runs: Run[] = [];
  for (const bit of bits) {
    const last = runs[runs.length - 1];
    const joins = bit.kind === "start" || bit.kind === "never";
    if (joins && last !== undefined && last.kind === bit.kind) {
      runs[runs.length - 1] = { ...last, text: `${last.text} ${bit.text}` };
    } else if (bit.kind === "start") runs.push({ kind: "start", text: bit.text, order: bit.order });
    else runs.push({ kind: bit.kind, text: bit.text });
  }
  return runs;
}

/** The mark a line is led by, and how a screen reader says it. */
function jointOf(joint: PlateJoint): { readonly mark: string; readonly said: string } {
  if (joint === "pipe") return { mark: "|", said: "piped to " };
  return { mark: "›", said: joint === "first" ? "" : "then " };
}

/** How many parts a card in the room draws before it says how many more there are. */
const CARD_PARTS = 4;

/**
 * What an ask shows under its question: its command on a plate, and its preview when that says
 * more than the command again (`plateTakesPreview`). On a card in the room the plate stops after
 * a few parts, as the preview stops after a few lines.
 */
export function AskShown({
  approval,
  plate,
  compact = false,
  titled = false,
  lit = false,
  settled = false,
}: {
  readonly approval: Approval;
  readonly plate: Plate | undefined;
  readonly compact?: boolean;
  readonly titled?: boolean;
  readonly lit?: boolean;
  readonly settled?: boolean;
}) {
  const drawsPreview = plate === undefined || !plateTakesPreview(approval);
  return (
    <>
      {plate === undefined ? null : (
        <CommandPlate
          plate={plate}
          lit={lit}
          settled={settled}
          {...(compact ? { most: CARD_PARTS } : {})}
        />
      )}
      {drawsPreview ? <AskPreview approval={approval} compact={compact} titled={titled} /> : null}
    </>
  );
}

/**
 * Whether "Just this once" is worth saying: not on a command, which is once by its nature and whose
 * Approve says how far it reaches. "Until you take it back" always is.
 */
export function saysLasts(approval: Approval, plate: Plate | undefined): boolean {
  return plate === undefined || approval.lasts === "standing";
}

export function CommandPlate({
  plate,
  lit,
  settled = false,
  most,
}: {
  readonly plate: Plate;
  /** Whether Always is picked, so the words it keeps are lit. */
  readonly lit: boolean;
  /** Whether it was just approved, so its edge is the yes's green as Approve turns to a tick. */
  readonly settled?: boolean;
  /** On a card: draw this many parts and say how many more, with no caption and no light. */
  readonly most?: number | undefined;
}) {
  const palette = usePalette();
  const scheme = useScheme();
  const { sunk } = useGround();
  const caption = most === undefined ? plateCaption(plate) : undefined;
  const parts = most === undefined ? plate.parts : plate.parts.slice(0, most);
  const more = plate.parts.length - parts.length;
  return (
    <>
      <View
        style={[
          styles.plate,
          { backgroundColor: sunk, borderColor: settled ? palette.green : palette.line },
        ]}
        testID="command-plate"
      >
        {parts.map((part, index) => {
          const joint = jointOf(part.joint);
          const runs = runsOf(part.bits);
          return (
            <View
              // A command's parts have no ids, and their order is the command's.
              // biome-ignore lint/suspicious/noArrayIndexKey: a part is only ever itself.
              key={index}
              style={styles.part}
              accessible
              accessibilityLabel={`${joint.said}${runs.map((run) => run.text).join(" ")}`}
              testID="plate-part"
            >
              <Text style={[styles.rail, { color: palette.ink4 }]}>{joint.mark}</Text>
              <Line runs={runs} lit={lit} />
            </View>
          );
        })}
        {more === 0 ? null : (
          <Text style={[styles.more, { color: palette.ink3 }]} testID="plate-more">
            {more === 1 ? "and 1 more part" : `and ${more} more parts`}
          </Text>
        )}
        {most === undefined ? <Sweep color={palette.gold} strength={SWEEP[scheme]} /> : null}
      </View>
      {caption === undefined ? null : (
        <CodeWords
          words={caption}
          style={styles.caption}
          ink={palette.ink3}
          testID="plate-caption"
        />
      )}
    </>
  );
}

/**
 * A part's line: the start a standing yes keeps, as a chip that lights under Always, then the rest
 * of its words as one run of text that wraps under itself, so a long path stays beside its `cd`.
 */
function Line({ runs, lit }: { readonly runs: readonly Run[]; readonly lit: boolean }) {
  const palette = usePalette();
  const first = runs[0];
  const head = first?.kind === "start" || first?.kind === "never" ? first : undefined;
  const rest = head === undefined ? runs : runs.slice(1);
  return (
    <View style={styles.words}>
      {head === undefined ? null : <Head run={head} lit={lit} />}
      {rest.length === 0 ? null : (
        <Text style={[styles.mono, styles.rest, { color: palette.ink2 }]}>
          {rest.map((run, at) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a run is only ever itself.
            <Span key={at} run={run} lit={lit} last={at === rest.length - 1} />
          ))}
        </Text>
      )}
    </View>
  );
}

/** The start at the head of a line: gold under Always, red when it is on the never list. */
function Head({ run, lit }: { readonly run: Run; readonly lit: boolean }) {
  const palette = usePalette();
  if (run.kind === "start") {
    return (
      <LitWords
        text={run.text}
        lit={lit}
        order={run.order}
        style={[styles.mono, styles.start]}
        ink={palette.ink}
        litInk={palette.goldDeep}
        ground={palette.goldSoft}
        rim={palette.gold}
        testID={lit ? "lit-words" : "start-words"}
      />
    );
  }
  return (
    <View style={[styles.marked, { backgroundColor: palette.redSoft }]} testID="never-words">
      <Text style={[styles.mono, styles.start, { color: palette.redInk }]}>{run.text}</Text>
    </View>
  );
}

/** A word after the head, inline: thrown-away output struck, a write marked red. */
function Span({
  run,
  lit,
  last,
}: {
  readonly run: Run;
  readonly lit: boolean;
  readonly last: boolean;
}) {
  const palette = usePalette();
  const after = last ? "" : " ";
  // A redirection and its file stay on one line: `> limits.js`, never `>` then `limits.js`.
  const whole = run.text.replace(/ /g, "\u00a0");
  if (run.kind === "word") return <>{run.text + after}</>;
  if (run.kind === "dropped") {
    return (
      <>
        <Text style={[styles.dropped, { color: palette.ink4 }]} testID="dropped-words">
          {whole}
        </Text>
        {after}
      </>
    );
  }
  if (run.kind === "writes" || run.kind === "never") {
    return (
      <>
        <Text
          style={[
            run.kind === "never" ? styles.start : styles.writes,
            {
              color: palette.redInk,
              backgroundColor: palette.redSoft,
              textDecorationColor: palette.red,
            },
          ]}
          testID={`${run.kind}-words`}
        >
          {whole}
        </Text>
        {after}
      </>
    );
  }
  // A start that isn't at the head of its line, after a redirection: marked, though not moving.
  return (
    <>
      <Text
        style={[
          styles.start,
          lit
            ? { color: palette.goldDeep, backgroundColor: palette.goldSoft }
            : { color: palette.ink },
        ]}
      >
        {run.text}
      </Text>
      {after}
    </>
  );
}

const styles = StyleSheet.create({
  plate: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.xl,
    paddingVertical: 10,
    overflow: "hidden",
  },
  part: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 3, paddingRight: 12 },
  rail: {
    width: 26,
    textAlign: "center",
    fontFamily: "Menlo",
    fontSize: SIZE,
    lineHeight: 20,
    fontWeight: "700",
  },
  words: { flex: 1, flexDirection: "row", alignItems: "flex-start", columnGap: SPACE_WIDTH },
  mono: { fontFamily: "Menlo", fontSize: SIZE, lineHeight: 20 },
  start: { fontWeight: "700" },
  rest: { flex: 1 },
  dropped: { textDecorationLine: "line-through" },
  writes: { textDecorationLine: "underline", textDecorationStyle: "dotted" },
  marked: { borderRadius: 5, paddingHorizontal: 3, marginHorizontal: -3 },
  more: { fontSize: TEXT.sm, paddingLeft: 26, paddingTop: 2 },
  caption: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.4, marginTop: -SPACE.xs },
});
