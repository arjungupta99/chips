/**
 * Circles are people, squircles are harnesses, and the ring is state. A channel is a hash in a
 * square. The colour comes from the name, so the same participant wears the same hue on
 * every screen — and on the desktop, since the hash and the eight hues are the design system's.
 *
 * An agent is the Chips mark's bitten body (ADR 0089, `AgentFace`), wearing the face a person
 * chose for it or its initials. Its state is in its outline rather than a ring round it: pins
 * out while it works, and a dot in the bite when it can't answer.
 *
 * A channel used to wear the quiet surface with a grey hash, and at 44 points that read as
 * restraint. At 56 (21 September 2026, with the list's plain-list restyle) it read as a hole
 * beside seven coloured neighbours, so a channel now takes a hue from its name like everything
 * else. The square still says what it is; it no longer has to be colourless to say it.
 *
 * It names itself to a screen reader, except where the thing around it has already said the
 * name — a row in a list is one button called "Supplier email", and an avatar inside it saying
 * "Supplier email" again is a second stop on the way past for no second fact.
 */

import { lettersScale, type SpaceIcon } from "@chipschat/protocol";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AgentFace } from "./AgentFace";
import { BusyRing } from "./BusyRing";
import { useFacePaint } from "./faceTheme";
import { useGround } from "./ground";
import { MarkFace } from "./MarkFace";
import { LIBRARY_MARKS, type MarkName } from "./marks";
import { BITE } from "./outline";
import { avatarHue } from "./sourceColours";
import { usePalette } from "./theme";
import { ICON_GROUNDS, type Palette } from "./tokens";

export { avatarHue } from "./sourceColours";

import {
  type HarnessStatus,
  initials,
  ringTone,
  STATUS,
  statusLabel,
  type Tone,
} from "./vocabulary";

export type AvatarKind = "person" | "harness" | "agent" | "channel";
export type AvatarSize = "xs" | "sm" | "md" | "result" | "pick" | "row" | "lg" | "profile";

/** A stable pick among the hues: the same name, the same hue, on every screen. */

/**
 * Inside a capsule or a menu row, beside a line of text, in a card, down the side of a list row,
 * and on a profile. `row` grew from 44 to 56 on 21 September 2026: a face is what you aim a thumb
 * at and what tells one room from another down a long list, and 44 was smaller than any list a
 * phone draws itself. `xs` came with the capsule over the field (ADR 0081), whose faces stand in
 * a line of fifteen-point words. `pick` is a face in the + window's row of who to ask, five and a
 * half of which fill the card's width, so the sixth shows there are more. `profile` is the face
 * at the top of You (ADR 0085), where a phone's own Settings puts its person. An agent down the
 * Agents tab wears `row` too, as a room does on Spaces (ADR 0089; it was 44 until Arjun asked for
 * the two lists to match, 1 October 2026). `result` is a space's or an agent's face in Search's
 * results (ADR 0132), a size down from the lists they come from: a result is one of three kinds
 * on one page, and a list's face beside a message's would make the names the loudest thing there.
 */
const SIZES: Readonly<Record<AvatarSize, number>> = {
  xs: 20,
  sm: 28,
  md: 36,
  result: 40,
  pick: 52,
  row: 56,
  lg: 58,
  profile: 88,
};

/** The side of a face, in points, for what lays one out beside others. */
export function avatarSide(size: AvatarSize): number {
  return SIZES[size];
}

/** A face's corner, for what draws a ring round one. */
export function avatarCorner(size: AvatarSize, kind: AvatarKind): number {
  return SIZES[size] * CORNER[kind];
}

/**
 * The side of the face a list row wears. Exported because the list's hairline starts where the
 * words start, which is this plus the margin and the gap — and a hairline that does not move
 * when the face does is the sort of thing nobody notices until it looks wrong.
 */
export const ROW_AVATAR = SIZES.row;

/**
 * A circle for a person, a squircle for a harness, a square for a channel, as a fraction. An
 * agent's is its body's corner (`BITE.corner`), for what draws a ring round one.
 */
const CORNER: Readonly<Record<AvatarKind, number>> = {
  person: 0.5,
  harness: 0.32,
  agent: BITE.corner,
  channel: 0.22,
};

/**
 * The mark, the letters and the ground a chosen face draws with, or nothing where there is no
 * choice. A mark this build does not have — picked on a newer one, or renamed since — is no
 * choice either, and the initials come back rather than the face drawing nothing. Letters chosen
 * in place of a mark (ADR 0139) are drawn where the initials would be.
 */
function chosenFace(
  icon: SpaceIcon | undefined,
): { name: MarkName | undefined; ground: string; letters: string | undefined } | undefined {
  if (icon === undefined) return undefined;
  // The ground holds even when the mark does not: a mark this build has never heard of falls
  // back to the initials, but on the colour that was chosen rather than losing it too.
  const letters = icon.letters === undefined || icon.letters === "" ? undefined : icon.letters;
  return {
    name: letters === undefined && icon.icon in LIBRARY_MARKS ? (icon.icon as MarkName) : undefined,
    ground: ICON_GROUNDS[icon.ground] ?? ICON_GROUNDS[0],
    letters,
  };
}

/** What a face says in place of a mark: the letters chosen for it, else its initials. */
function lettersOf(face: ReturnType<typeof chosenFace>, name: string, kind: AvatarKind): string {
  if (face?.letters !== undefined) return face.letters;
  return kind === "channel" ? "#" : initials(name);
}

/**
 * The colour a face stands on: the ground of the face chosen for it, else its name's own hue.
 * What a group of four or more is drawn in, as one mark (`Faces`, ADR 0113).
 */
export function faceGround(name: string, icon: SpaceIcon | undefined): string {
  return chosenFace(icon)?.ground ?? avatarHue(name);
}

/**
 * What a face holds: a chosen face is paper on a lit ground (`MarkFace`), filling what the ring
 * leaves; without a mark it is the letters, on that ground or on the name's own hue.
 */
function Inside({
  face,
  side,
  letters,
  lettersSize,
}: {
  readonly face: ReturnType<typeof chosenFace>;
  /** What the ring leaves of the face. */
  readonly side: number;
  readonly letters: string;
  readonly lettersSize: number;
}) {
  const faces = useFacePaint();
  return (
    <>
      {face === undefined ? null : (
        <View style={StyleSheet.absoluteFill}>
          <MarkFace name={face.name} size={side} on={{ kind: "ground", ground: face.ground }} />
        </View>
      )}
      {face?.name === undefined ? (
        <Text
          style={[
            styles.initials,
            { fontSize: lettersSize * lettersScale(letters), color: faces.ink },
          ]}
          allowFontScaling={false}
        >
          {letters}
        </Text>
      ) : null}
    </>
  );
}

/**
 * What a face's edge says: whether the light runs round it, and the still ring under it where it
 * does not. One or the other, never both — the light is the state, and an outline beneath it
 * would be the same thing said twice. An agent says its own work in its pins (ADR 0089), so no
 * light runs round one.
 */
function edgeOf(
  kind: AvatarKind,
  status: HarnessStatus | undefined,
  busy: boolean,
): { readonly lit: boolean; readonly ring: Tone | undefined } {
  const lit = busy && kind !== "agent";
  return { lit, ring: kind === "harness" && !lit ? ringTone(status) : undefined };
}

function ringColour(palette: Palette, tone: Tone): string {
  const table = {
    neutral: palette.gray,
    blue: palette.blue,
    amber: palette.amber,
    red: palette.red,
    green: palette.green,
  } as const;
  return table[tone];
}

export function Avatar({
  name,
  kind = "person",
  size = "md",
  status,
  busy = false,
  label,
  decorative = false,
  icon,
  cantAnswer = false,
  pinsOut = false,
  pinsAlways = false,
  markSide = "right",
  ground,
  testID,
}: {
  readonly name: string;
  readonly kind?: AvatarKind;
  readonly size?: AvatarSize;
  /**
   * For a harness: draws the ring, and says the state in the accessible name. For an agent: its
   * pins are out while it works or waits, and the name says the state.
   */
  readonly status?: HarnessStatus | undefined;
  /**
   * The room this face stands for has work going in it (`spaceWorking`, ADR 0090): the light
   * runs round the face in the working tone, in place of the still ring. An agent says its own
   * work in its pins (ADR 0089) and is left alone. The face must be opaque, which every face
   * drawn here is: the band is what the face leaves of the arc turning behind it.
   */
  readonly busy?: boolean | undefined;
  /** Replaces the name as the accessible name, for example `Scout, the lead`. */
  readonly label?: string | undefined;
  /** Inside something that already says the name: seen, never read out. */
  readonly decorative?: boolean;
  /**
   * A mark the person picked for this space in place of its initials, or a letter or two (ADR
   * 0139), with the index of the ground it sits on. The shape does not change: a circle is still a person, a squircle still a
   * harness, so the face goes on saying what the thing is while wearing what you chose. For an
   * agent it is the agent's own face, the same for everybody (ADR 0089).
   */
  readonly icon?: SpaceIcon | undefined;
  /**
   * An agent that can't answer now — offline, or in trouble it reported (ADR 0083) — wears a small
   * amber mark on its corner, wherever its face is drawn.
   */
  readonly cantAnswer?: boolean | undefined;
  /**
   * An agent wears its pins round its body rather than inside its box, at any size: the face
   * beside a line in a room (ADR 0103). Nothing to any other kind.
   */
  readonly pinsOut?: boolean | undefined;
  /** An agent's pins inside its box at any size, as lit as the mark's (`AgentFace`, ADR 0138). */
  readonly pinsAlways?: boolean | undefined;
  /** What the face stands on, for the ring round the mark: the page, unless said. */
  readonly ground?: string | undefined;
  /**
   * Which lower corner the mark sits on. Left for a face in an overlapped group, where the face
   * after it covers its right edge: each face's mark then sits over the one before, and shows.
   */
  readonly markSide?: "left" | "right" | undefined;
  readonly testID?: string | undefined;
}) {
  const palette = usePalette();
  // What the face stands on, which the cut round the amber dot is drawn in (`ground.tsx`).
  const stands = useGround().ground;
  const faces = useFacePaint();
  const side = SIZES[size];
  const { lit, ring } = edgeOf(kind, status, busy);
  const face = chosenFace(icon);
  const accessible = accessibleName(name, kind, status, label, cantAnswer);
  const corner = side * CORNER[kind];
  const named = decorative
    ? ({
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants",
      } as const)
    : ({ accessible: true, accessibilityRole: "image", accessibilityLabel: accessible } as const);
  if (kind === "agent") {
    return (
      <View {...named} testID={testID}>
        <AgentFace
          mark={face?.name}
          ground={face?.ground ?? avatarHue(name)}
          letters={lettersOf(face, name, kind)}
          side={side}
          working={status === "working" || status === "thinking"}
          cantAnswer={cantAnswer}
          pinsOut={pinsOut}
          pinsAlways={pinsAlways}
          amber={palette.amber}
          green={palette.green}
        />
      </View>
    );
  }
  const avatar = (
    <View
      {...named}
      testID={testID}
      style={[
        styles.avatar,
        {
          width: side,
          height: side,
          borderRadius: corner,
          backgroundColor: faces.ground(face?.ground ?? avatarHue(name)),
          ...(ring === undefined ? {} : { borderWidth: 2, borderColor: ringColour(palette, ring) }),
        },
      ]}
    >
      <Inside
        face={face}
        side={ring === undefined ? side : side - 4}
        letters={lettersOf(face, name, kind)}
        lettersSize={side * 0.4}
      />
    </View>
  );
  const working = lit ? (
    <View>
      {/* Behind the face, which is what cuts the band's inner edge. */}
      <BusyRing side={side} corner={corner} tone={ringColour(palette, STATUS.working.tone)} />
      {avatar}
    </View>
  ) : (
    avatar
  );
  return cantAnswer ? (
    <Marked side={side} ground={ground ?? stands} amber={palette.amber} left={markSide === "left"}>
      {working}
    </Marked>
  ) : (
    working
  );
}

/** What a screen reader says of a face: the label, else the name and the state it is in. */
function accessibleName(
  name: string,
  kind: AvatarKind,
  status: HarnessStatus | undefined,
  label: string | undefined,
  cantAnswer: boolean,
): string {
  if (label !== undefined) return label;
  if ((kind === "harness" || kind === "agent") && status !== undefined)
    return `${name}, ${statusLabel(status).toLowerCase()}`;
  return cantAnswer ? `${name}, can't answer` : name;
}

/** A face with the amber mark across its corner, outside it, since the face clips to its corners. */
function Marked({
  side,
  ground,
  amber,
  left,
  children,
}: {
  readonly side: number;
  readonly ground: string;
  readonly amber: string;
  readonly left: boolean;
  readonly children: ReactNode;
}) {
  const mark = Math.max(7, Math.round(side * 0.28)) + MARK_RING * 2;
  return (
    <View style={{ width: side, height: side }}>
      {children}
      <View
        testID="cant-answer-mark"
        style={[
          styles.mark,
          left ? styles.markLeft : styles.markRight,
          {
            width: mark,
            height: mark,
            borderRadius: mark / 2,
            borderWidth: MARK_RING,
            borderColor: ground,
            backgroundColor: amber,
          },
        ]}
      />
    </View>
  );
}

/** The ring round the mark, in the colour the face stands on, so it reads apart from the face. */
const MARK_RING = 2;

const styles = StyleSheet.create({
  // Hidden overflow, so a chosen face's lit ground takes the circle's or the squircle's corners.
  avatar: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  initials: { fontWeight: "700" },
  mark: { position: "absolute", bottom: -MARK_RING - 1 },
  markRight: { right: -MARK_RING - 1 },
  markLeft: { left: -MARK_RING - 1 },
});
