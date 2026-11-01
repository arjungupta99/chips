/**
 * Where a face is chosen: a colour, a mark, and the row itself as the preview. One picker, in two
 * places (ADR 0174): its own sheet (`IconSheet`), from a long press on Spaces or Agents and a tap
 * on an agent card's face; and the Icon page of a space's sheet, from its Icon row.
 *
 * The preview is a row at row size, not a big hero circle — you are choosing how a line in a
 * list will look, so the picker shows a line in a list. There is no confirm: a tap applies, the
 * picker stays up so another can be tried, and the list behind it is already wearing it. *Use the
 * default* is the way back to the initials, the harness's face or the hash.
 *
 * Colour first and mark second, because the ground is what the eye catches down a list of eighty
 * rows and the mark is what tells you which room it is once you are looking. Each is a choice on
 * its own: a colour saves without waiting for a mark — *the teal room* is a perfectly good answer
 * — and the colours open with the tick on the one the room is already wearing rather than on
 * the first swatch. Both were the same bug wearing two faces: the first tap of a fresh room wrote
 * nothing and moved nothing behind the sheet, so the sheet read as broken until a mark happened
 * to be picked (Arjun, 22 September 2026).
 *
 * The whole library is one scroll with a heading per family; the chips at the top jump rather
 * than filter, so the picker is never four marks and a screen of nothing.
 *
 * The marks are paper (`MarkFace`, 22 September 2026): one not chosen is drawn in the ink's tones
 * on the cell, so the fold is there before anything is picked, and the chosen one on the ground
 * it will land on, lit, exactly as the row behind now wears it.
 *
 * An agent's face is chosen here too (ADR 0089): the head is the agent at the size the Agents tab
 * draws it, a room's, and the chosen mark's cell is drawn in the agent's own outline, so the grid
 * shows what the agent will wear rather than a room's square. So is your own, from You (ADR 0139),
 * with you at its head in your circle.
 *
 * Between the colours and the marks, a field takes a letter or two, or an emoji, in place of a
 * mark (`LettersField`, ADR 0139): typed, the head wears them at once, and the face saves when
 * the typing stops, or when whatever holds the picker lets it go (`flush`). A mark chosen after
 * them takes their place, and empties the field.
 */

import type { SpaceIcon } from "@chipschat/protocol";
import {
  memo,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { AgentFace } from "../ui/AgentFace";
import { Avatar, type AvatarKind } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { useFacePaint } from "../ui/faceTheme";
import { type Ground, useGround } from "../ui/ground";
import { Icon } from "../ui/Icon";
import { MarkFace } from "../ui/MarkFace";
import { LIBRARY_FAMILIES, type MarkName } from "../ui/marks";
import { CLOSE_ROOM, SheetScroll } from "../ui/Sheet";
import { avatarHueIndex } from "../ui/sourceColours";
import { usePalette } from "../ui/theme";
import {
  ICON_GROUND_NAMES,
  ICON_GROUND_ROWS,
  ICON_GROUNDS,
  RADIUS,
  SPACE,
  TEXT,
} from "../ui/tokens";
import { LettersField, type LettersHandle } from "./LettersField";

/** Six across is the most a 24-point mark can be and still be a thumb's target on a phone. */
const ACROSS = 6;

/** The families drawn with the picker's first frame; each of the others follows a frame later. */
const FIRST_DRAWN = 1;

/** A family's heading, to the point: what a family not yet drawn holds the place of. */
const HEADING = { top: SPACE.md, line: 14, bottom: SPACE.sm } as const;

/** What holds the picker tells it when it is let go: letters typed and not yet saved, save. */
export interface FacePickerHandle {
  readonly flush: () => void;
}

export function FacePicker({
  title,
  subtitle,
  kind,
  chosen,
  onChoose,
  failed,
  inset,
  headRoom = CLOSE_ROOM,
  ref,
}: {
  /** What is being changed: its name and the line under it, so the preview is the real row. */
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly kind: AvatarKind;
  readonly chosen: SpaceIcon | undefined;
  /** `undefined` puts the face back to the default. */
  readonly onChoose: (icon: SpaceIcon | undefined) => void;
  /** Why the last pick did not stick, when it did not. */
  readonly failed?: string | undefined;
  /**
   * How far in from what holds it each part stands: its own sheet's, inside the sheet's edge; a
   * page of a space's sheet's, none, so its edges are the page's other cards'.
   */
  readonly inset: number;
  /** Kept clear at the right of the head: the sheet's X, where the head is the sheet's first line. */
  readonly headRoom?: number;
  readonly ref?: Ref<FacePickerHandle> | undefined;
}) {
  const palette = usePalette();
  const on = useGround();
  const faces = useFacePaint();
  // The ground a mark will land on, and the swatch the tick sits on. It starts on the colour
  // the room is already wearing — the chosen face's, or the one its name hashes to — rather
  // than on the first swatch, which claimed a colour the room did not have.
  //
  // Held, not derived: a tap has to move the tick this frame, and the snapshot it saves into
  // does not come back until the next one. Re-seeded from what actually saved, so a pick the
  // server refuses takes the tick back with it when the store puts the old face on.
  const wearing = chosen?.ground ?? avatarHueIndex(title);
  const [ground, setGround] = useState(wearing);
  useEffect(() => setGround(wearing), [wearing]);
  const [family, setFamily] = useState<string>(LIBRARY_FAMILIES[0]?.name ?? "");
  const marks = useRef<MarksHandle>(null);
  // Letters typed and not yet saved, which the head wears while they are.
  const [typing, setTyping] = useState<string | undefined>(undefined);
  const letters = useRef<LettersHandle>(null);
  useImperativeHandle(ref, () => ({ flush: () => letters.current?.flush() }), []);
  // The face last asked for, worn from the tap until the store's face is a different one. The
  // store takes a pick before the server answers but hands it to the screen a frame or more later
  // (`notify` waits for the next frame), and in between the head wore the face from before: letters
  // typed, saved, gone for a moment, back (Arjun, 9 October 2026: "when I type into the text box,
  // I see a flicker in the displayed icon"; filmed, about 150 ms of the old face at each save).
  // Whatever the store says next, the pick itself or the old face after a refusal, is worn from
  // then on. Held, not derived, for the reason the ground is.
  const [asked, setAsked] = useState<Asked | undefined>(undefined);
  const said = faceKey(chosen);
  const shown = asked !== undefined && asked.over === said ? asked.face : chosen;
  const worn = previewOf(shown, typing, ground);
  const pick = (icon: SpaceIcon | undefined) => {
    setAsked({ face: icon, over: said });
    onChoose(icon);
  };
  // A mark, or the default, takes the place of letters typed and not yet saved.
  const choose = (icon: SpaceIcon | undefined) => {
    letters.current?.discard();
    pick(icon);
  };

  // A mark tapped: one function for the life of the picker, so a mark is drawn again only when
  // what it shows changes, and not because the picker around it was.
  const marking = useRef<(name: MarkName) => void>(() => undefined);
  marking.current = (name: MarkName) => choose({ icon: name, ground });
  const onMark = useCallback((name: MarkName) => marking.current(name), []);
  const jump = (name: string) => {
    setFamily(name);
    marks.current?.jump(name);
  };
  const across = { paddingHorizontal: inset };

  return (
    <>
      {/* The head is the thing being changed: the face at the size it will be, and the room's
          name. No centre title — you arrived by tapping *Change icon…* or an Icon row, so a
          title saying "Icon" told you nothing. */}
      <View style={[styles.head, { paddingLeft: inset, paddingRight: headRoom }]}>
        <Avatar name={title} kind={kind} size="row" icon={worn} decorative />
        <View style={styles.headWords}>
          <Text style={[styles.headName, { color: palette.ink }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle === undefined ? null : (
            <Text style={[styles.headSub, { color: palette.ink3 }]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>

      {failed === undefined ? null : (
        // A banner, not a line of small print: the face flashes on and goes back when the server
        // refuses, and "a flicker" is what that looks like if the reason is easy to miss.
        <View
          style={[styles.failed, { marginHorizontal: inset, backgroundColor: palette.redSoft }]}
          testID="icon-failed"
        >
          <Icon name="alert" size={17} color={palette.redInk} />
          <Text style={[styles.failedWords, { color: palette.redInk }]}>{failed}</Text>
        </View>
      )}

      {/* Every colour in view at once: nine hues across and three depths down, so a colour's
          darker sister is right under it. Twelve fitted a strip; twenty-seven in a strip put two
          thirds of them off the edge (Arjun chose this over the longer strip, 26 September 2026). */}
      <View
        style={[styles.hues, across]}
        accessibilityRole="radiogroup"
        accessibilityLabel="Colours"
      >
        {ICON_GROUND_ROWS.map((row) => (
          <View key={row.join()} style={styles.hueRow}>
            {row.map((index) => (
              <Pressable
                key={index}
                accessibilityRole="radio"
                accessibilityState={{ selected: index === ground }}
                accessibilityLabel={ICON_GROUND_NAMES[index] ?? `Colour ${index + 1}`}
                testID={`ground-${index}`}
                // A colour is a choice on its own, saved the moment it is tapped. It used to write
                // nothing until a mark had been picked too, so the first tap in a fresh room moved
                // the tick and left the row behind exactly as it was — a button that did nothing
                // (Arjun, 22 September 2026). An empty mark is the face that is only a colour.
                onPress={() => {
                  setGround(index);
                  pick(onGround(worn, index));
                }}
                style={[styles.hue, { backgroundColor: faces.ground(ICON_GROUNDS[index] ?? "") }]}
              >
                {index === ground ? <Icon name="check" size={18} color={faces.ink} /> : null}
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      <LettersField
        ref={letters}
        letters={shown?.letters}
        ground={ground}
        inset={inset}
        onTyping={setTyping}
        onLetters={(typed) => {
          if (typed === (shown?.letters ?? "")) return;
          // Emptied, the face is its colour again: the initials on the ground.
          pick(typed === "" ? { icon: "", ground } : { icon: "", ground, letters: typed });
        }}
      />

      <ScrollView
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        style={styles.stripBox}
        contentContainerStyle={[styles.strip, across]}
      >
        {LIBRARY_FAMILIES.map((each) => (
          <Pressable
            key={each.name}
            accessibilityRole="button"
            accessibilityLabel={each.name}
            onPress={() => jump(each.name)}
            style={[
              styles.family,
              {
                backgroundColor: each.name === family ? palette.ink : on.fill,
              },
            ]}
          >
            <Text
              style={[
                styles.familyWord,
                { color: each.name === family ? palette.bg : palette.ink2 },
              ]}
            >
              {each.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <Marks
        ref={marks}
        inset={inset}
        agent={kind === "agent"}
        worn={worn?.icon}
        ground={ground}
        onMark={onMark}
        foot={
          // Past the last mark, not pinned over them: it is the way out of a choice, and a
          // choice you make once. Somewhere to arrive at, not something in the way.
          <View style={styles.foot}>
            <Button
              label="Use the default"
              onPress={() => choose(undefined)}
              disabled={shown === undefined}
              grow
            />
          </View>
        }
      />
    </>
  );
}

/** What the family chips ask of the grid: to bring a family to its top. */
interface MarksHandle {
  readonly jump: (family: string) => void;
}

/**
 * The library, one scroll with a heading per family. It draws a family at a time (ADR 0174's
 * addendum): the first with the picker's first frame, then each of the others a frame after the
 * one before, so the picker is there at once rather than after all its paper marks have been
 * drawn. Drawing all 189 together held the Icon page back half a second on the simulator, and every
 * colour tapped redrew them all for another 225 ms (Arjun, 15 October 2026: "opening the icon
 * section take a noticible delay"). Now a family, and a mark in it, is drawn again only when what
 * it shows changes: a colour tapped redraws the chosen mark alone.
 *
 * A family not yet drawn holds its place at its exact height, the heading and the rows being set
 * sizes, so the sheet stands at its full height from the first frame and nothing below moves when
 * the family arrives. Before the grid knows its width, a screen's height stands in.
 */
function Marks({
  inset,
  agent,
  worn,
  ground,
  onMark,
  foot,
  ref,
}: {
  readonly inset: number;
  /** The face being chosen is an agent's: the chosen cell wears the agent's outline. */
  readonly agent: boolean;
  /** The mark the face wears, if it wears one. */
  readonly worn: string | undefined;
  readonly ground: number;
  /** The same function for the life of the picker, so the marks need not be drawn again. */
  readonly onMark: (name: MarkName) => void;
  readonly foot: ReactNode;
  readonly ref?: Ref<MarksHandle> | undefined;
}) {
  const grid = useRef<ScrollView>(null);
  const tops = useRef<Record<string, number>>({});
  // A family asked for before it had a place: gone to as soon as it has one.
  const wanted = useRef<string | undefined>(undefined);
  // Six across, measured rather than guessed: a percentage basis cannot know about the gaps,
  // and gets five on a phone and seven on a tablet.
  const [side, setSide] = useState(0);
  const [drawn, setDrawn] = useState(FIRST_DRAWN);
  const screen = useWindowDimensions().height;
  useEffect(() => {
    if (side === 0 || drawn >= LIBRARY_FAMILIES.length) return;
    const next = requestAnimationFrame(() => setDrawn((now) => now + 1));
    return () => cancelAnimationFrame(next);
  }, [side, drawn]);
  const onTop = useCallback((name: string, top: number) => {
    tops.current[name] = top;
    if (wanted.current !== name) return;
    wanted.current = undefined;
    grid.current?.scrollTo({ y: Math.max(0, top - 4), animated: true });
  }, []);
  useImperativeHandle(
    ref,
    () => ({
      jump: (name) => {
        const top = tops.current[name];
        if (top === undefined) wanted.current = name;
        else grid.current?.scrollTo({ y: Math.max(0, top - 4), animated: true });
      },
    }),
    [],
  );
  return (
    <SheetScroll
      ref={grid}
      keyboardShouldPersistTaps="handled"
      style={styles.gridBox}
      contentContainerStyle={[styles.grid, { paddingHorizontal: inset }]}
      testID="icon-grid"
      onLayout={(event) =>
        setSide(
          Math.floor(
            (event.nativeEvent.layout.width - 2 * inset - (ACROSS - 1) * SPACE.sm) / ACROSS,
          ),
        )
      }
    >
      {side === 0 ? (
        <View style={{ height: screen }} />
      ) : (
        LIBRARY_FAMILIES.map((each, at) => {
          const wears = worn !== undefined && (each.marks as readonly string[]).includes(worn);
          return at < drawn ? (
            <Family
              key={each.name}
              name={each.name}
              marks={each.marks}
              side={side}
              worn={wears ? worn : undefined}
              ground={wears ? ground : 0}
              agent={agent}
              onMark={onMark}
              onTop={onTop}
            />
          ) : (
            <View
              key={each.name}
              style={{ height: familyHeight(each.marks.length, side) }}
              onLayout={(event) => onTop(each.name, event.nativeEvent.layout.y)}
            />
          );
        })
      )}
      {foot}
    </SheetScroll>
  );
}

/** A family's height: its heading, and its rows of marks with the gaps between them. */
function familyHeight(count: number, side: number): number {
  const rows = Math.ceil(count / ACROSS);
  return HEADING.top + HEADING.line + HEADING.bottom + rows * side + (rows - 1) * SPACE.sm;
}

/** One family: its heading and its marks. Drawn again only when one of its marks changes. */
const Family = memo(function Family({
  name,
  marks,
  side,
  worn,
  ground,
  agent,
  onMark,
  onTop,
}: {
  readonly name: string;
  readonly marks: readonly MarkName[];
  readonly side: number;
  /** The worn mark, when it is one of this family's. */
  readonly worn: string | undefined;
  /** The ground the worn mark stands on; nothing to a family that does not hold it. */
  readonly ground: number;
  readonly agent: boolean;
  readonly onMark: (name: MarkName) => void;
  readonly onTop: (name: string, top: number) => void;
}) {
  const palette = usePalette();
  return (
    <View onLayout={(event) => onTop(name, event.nativeEvent.layout.y)}>
      <Text style={[styles.heading, { color: palette.ink3 }]}>{name}</Text>
      <View style={styles.marks}>
        {marks.map((mark) => (
          <Cell
            key={mark}
            name={mark}
            side={side}
            chosen={mark === worn}
            ground={mark === worn ? ground : 0}
            agent={agent}
            onMark={onMark}
          />
        ))}
      </View>
    </View>
  );
});

/** A face asked for, and the store's face when it was: worn until the store's is another. */
interface Asked {
  readonly face: SpaceIcon | undefined;
  readonly over: string;
}

/** A face as one string, to tell whether the store's has changed since a pick. */
function faceKey(face: SpaceIcon | undefined): string {
  return face === undefined ? "" : `${face.icon}|${face.ground}|${face.letters ?? ""}`;
}

/**
 * The face the head wears: what is chosen, or the letters being typed over it before they are
 * saved, on the ground the picker is on. Typed empty, a face of letters is its colour again.
 */
function previewOf(
  chosen: SpaceIcon | undefined,
  typing: string | undefined,
  ground: number,
): SpaceIcon | undefined {
  if (typing === undefined) return chosen;
  if (typing !== "") return { icon: "", ground, letters: typing };
  return chosen?.letters === undefined ? chosen : { icon: "", ground };
}

/** A face on another ground: its mark or its letters kept, or the colour alone. */
function onGround(face: SpaceIcon | undefined, ground: number): SpaceIcon {
  return face?.letters === undefined
    ? { icon: face?.icon ?? "", ground }
    : { icon: "", ground, letters: face.letters };
}

/** One mark in the grid: drawn again only when it is chosen, let go of, or moves to a new ground. */
const Cell = memo(function Cell({
  name,
  side,
  chosen,
  ground,
  agent,
  onMark,
}: {
  readonly name: MarkName;
  /** Measured by the grid. */
  readonly side: number;
  readonly chosen: boolean;
  /** The ground it stands on when chosen; nothing to a mark that is not. */
  readonly ground: number;
  /** The face being chosen is an agent's: the chosen cell wears the agent's outline. */
  readonly agent: boolean;
  readonly onMark: (name: MarkName) => void;
}) {
  const palette = usePalette();
  const on = useGround();
  const faces = useFacePaint();
  const onPress = () => onMark(name);
  if (agent && chosen) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={name}
        accessibilityState={{ selected: true }}
        testID={`mark-${name}`}
        onPress={onPress}
        style={[styles.mark, styles.worn, { width: side, height: side }]}
      >
        <AgentFace
          mark={name}
          ground={ICON_GROUNDS[ground] ?? ICON_GROUNDS[0]}
          letters=""
          side={side}
          amber={palette.amber}
          green={palette.green}
        />
      </Pressable>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ selected: chosen }}
      testID={`mark-${name}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.mark,
        { width: side, height: side },
        { backgroundColor: faces.ground(groundOf(chosen, pressed, ground, on)) },
      ]}
    >
      {({ pressed }) => (
        // The cut paint is the cell's own colour, so it follows the cell through a press.
        <MarkFace
          name={name}
          size={side}
          on={
            chosen
              ? { kind: "ground", ground: groundOf(true, pressed, ground, on) }
              : { kind: "cell", ink: palette.ink2, cell: groundOf(false, pressed, ground, on) }
          }
        />
      )}
    </Pressable>
  );
});

/**
 * Chosen wears the ground it will land on; pressed is the quiet step; otherwise the fill of what
 * the picker stands on: white tiles on a sheet's grouped ground in light (`ground.tsx`).
 */
function groundOf(chosen: boolean, pressed: boolean, ground: number, on: Ground): string {
  if (chosen) return ICON_GROUNDS[ground] ?? ICON_GROUNDS[0];
  return pressed ? on.pressed : on.fill;
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: SPACE.md,
    gap: SPACE.md,
  },
  headWords: { flex: 1, minWidth: 0, gap: 1 },
  headName: { fontSize: TEXT.body, fontWeight: "600" },
  headSub: { fontSize: TEXT.sm },
  /**
   * `flexShrink`, not `flex: 1`. `flex: 1` sets the basis to zero, so the grid contributes
   * nothing to the panel's own height — and a bounded panel sizes to its content under a
   * `maxHeight`, so it collapsed to the fixed chrome: a quarter of the screen instead of three
   * quarters (Arjun, on the phone). Shrinking from the content's height is what the other
   * bounded sheets do, and what `Sheet` means by "a shrinking ScrollView between fixed chrome".
   * The web target does not reproduce it: CSS resolves an auto-height column differently from
   * Yoga, so this one is only ever visible on a device.
   */
  gridBox: { flexShrink: 1, minHeight: 0 },
  foot: { flexDirection: "row", paddingTop: SPACE.lg },
  // A horizontal scroller inside a column both stretches and shrinks by default: growing, it
  // swallows the row under it; shrinking, it clips its own chips to half their height. Both
  // have to be turned off, or the families end up behind the grid of marks.
  stripBox: { flexGrow: 0, flexShrink: 0 },
  // The colours never shrink either: a squeezed grid would be a grid of ovals.
  hues: { flexShrink: 0, gap: SPACE.sm, paddingBottom: SPACE.lg },
  hueRow: { flexDirection: "row", gap: SPACE.sm },
  strip: {
    gap: SPACE.md,
    paddingBottom: SPACE.md,
    alignItems: "center",
  },
  // Nine to a row, each an equal share of it: 33 points on a 393-point phone.
  hue: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  failed: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACE.sm,
    marginBottom: SPACE.md,
    padding: SPACE.md,
    borderRadius: RADIUS.lg,
  },
  failedWords: { flex: 1, fontSize: TEXT.md, lineHeight: TEXT.md * 1.35 },
  family: {
    flexShrink: 0,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.md,
    paddingVertical: 6,
  },
  familyWord: { fontSize: TEXT.sm, fontWeight: "600" },
  grid: { paddingBottom: SPACE.xxl },
  // Set to the point (`HEADING`): a family not yet drawn holds a place this tall.
  heading: {
    fontSize: TEXT.xs,
    lineHeight: HEADING.line,
    height: HEADING.top + HEADING.line + HEADING.bottom,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingTop: HEADING.top,
    paddingBottom: HEADING.bottom,
  },
  marks: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  mark: {
    aspectRatio: 1,
    flexGrow: 0,
    borderRadius: RADIUS.lg,
    alignItems: "center",
    justifyContent: "center",
    // The chosen cell's lit ground is drawn edge to edge and takes the cell's corners.
    overflow: "hidden",
  },
  // An agent's chosen face stands in its own outline, on nothing.
  worn: { overflow: "visible", backgroundColor: "transparent" },
});
