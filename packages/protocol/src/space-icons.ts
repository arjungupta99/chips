/**
 * The face a person has chosen for a space: a mark from Chips' own library and the ground it
 * sits on (21 September 2026).
 *
 * It is a person's own setting, not a fact about the room (the alternative — `space.icon_set`
 * on the log, one face for everybody — is a bigger thing and nobody has asked for it). So it
 * lives beside the notification settings from M5.6 rather than in the event log: read and
 * written over `/v1/me/space-icons`, private to the person who chose it, and carried to every
 * device they sign in on. Two people may see one room differently, which is the point.
 *
 * An agent's face is the same pair, a mark and a ground, but it is the agent's and one for
 * everybody: it rides on `agent.updated` and in the directory, not here (ADR 0089). So is a
 * person's own face, on `person.face_set` (ADR 0139).
 *
 * Since 7 October 2026 a face may be letters in place of a mark: one or two of them, or an emoji
 * or two, typed by the person choosing it ("AB", "X", "🦊"). Arjun asked for it on every face at
 * once — a space's, an agent's and a person's own — so it is a third field of the one shape, not
 * a shape of its own (ADR 0139).
 *
 * The ground is an **index**, not a colour. A hex on the wire would freeze the palette into
 * every stored row: the lift of 21 September 2026 moved all eight avatar hues, and an index
 * means everyone's chosen face moved with it instead of stranding them on the old paint.
 */

import { z } from "zod";

/**
 * How many grounds a client offers: the design system's eight avatar hues, and nineteen more
 * that belong to no participant. A client draws index `n` from its own list; the wire only
 * agrees on how many there are.
 *
 * Twelve until 26 September 2026, when Arjun asked for more colours: fifteen were added after
 * them (a red, an orange, an olive, three greys and a deep shade of every hue), so a face chosen
 * on the twelve kept its index and its colour. A client older than that draws an index past its
 * own list on its first ground.
 */
export const SPACE_ICON_GROUNDS = 27;

/** As many letters as a face holds: "AB", or one emoji beside another. */
export const MOST_FACE_LETTERS = 2;

/**
 * One letter as a reader sees it: a base and whatever joins it — a combining accent, a skin tone,
 * an emoji's variation selector or keycap, a flag's tags, or another emoji after a joiner — and a
 * flag's two regional indicators. A face's "two letters" are two of these, so "👨‍👩‍👧" is one and
 * "é" is one however it was typed.
 *
 * Written out rather than `Intl.Segmenter`, which Hermes does not have: the phone, the server and
 * the web count the same letters the same way, and a face one of them takes the others take. It
 * leaves out what a face would never be (Hangul typed jamo by jamo); a cluster it splits in two
 * counts as two letters, which is a refusal, never a face drawn wrong.
 */
const LETTER =
  /\p{Regional_Indicator}{2}|\P{M}(?:[\p{M}\p{Emoji_Modifier}\u{E0020}-\u{E007F}]|\u200d\P{M}?)*|\p{M}+/gu;

/** The letters of some text, as a reader counts them (`LETTER`). */
export function lettersIn(text: string): string[] {
  return text.match(LETTER) ?? [];
}

/**
 * What a face's letters are, from what was typed: no spaces, and no more than two. What a field
 * keeps as somebody types, so a third letter or a space never reaches the face.
 */
export function faceLetters(typed: string): string {
  return lettersIn(typed.replace(/\s+/gu, "")).slice(0, MOST_FACE_LETTERS).join("");
}

/** How wide one letter is, in the font's size: a capital, a CJK character, an emoji. */
const WIDTHS = { letter: 0.7, wide: 1, emoji: 1.2 } as const;

/** As wide as a face's letters may stand, in the initials' size: what two capitals take. */
const ROOM = 1.7;

/** A single emoji is this much larger than the initials, filling the face as one capital does. */
const ONE_EMOJI = 1.25;

const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const WIDE = /\p{Ideographic}|[\u3040-\u30ff\uac00-\ud7a3]/u;

function widthOf(letter: string): number {
  if (EMOJI.test(letter)) return WIDTHS.emoji;
  return WIDE.test(letter) ? WIDTHS.wide : WIDTHS.letter;
}

/**
 * How large a face's letters are drawn, against the size its initials are (ADR 0139): 1 for
 * letters, which is the initials' own size; larger for one emoji, which fills a face as one
 * capital does; smaller where two emoji, an emoji and a letter, or two wide characters would not
 * fit inside it. Here, beside the letters' own rule, so the phone and the Mac draw them alike.
 */
export function lettersScale(letters: string): number {
  const each = lettersIn(letters);
  const only = each[0];
  if (each.length === 1 && only !== undefined && EMOJI.test(only)) return ONE_EMOJI;
  const width = each.reduce((sum, letter) => sum + widthOf(letter), 0);
  return width <= ROOM ? 1 : Math.round((ROOM / width) * 100) / 100;
}

/** Whether these are a face's letters as they are: one or two, nothing round them, nothing hidden. */
function areFaceLetters(letters: string): boolean {
  const count = lettersIn(letters).length;
  return (
    count >= 1 &&
    count <= MOST_FACE_LETTERS &&
    !/[\s\p{Cc}]/u.test(letters) &&
    faceLetters(letters) === letters
  );
}

export const spaceIcon = z.object({
  /**
   * A mark's name in the library — letters only, as every name in it is — or empty, for a face
   * that is a colour and nothing else.
   *
   * A ground is a choice in its own right: a room can be *the teal one* before it is the one
   * with the rocket on it, and down a list of eighty rows the colour is what the eye catches
   * first. Requiring a mark meant the picker's colour strip wrote nothing until a mark had been
   * tapped — the swatch ticked, the row behind did not move, and it read as a broken button
   * (Arjun, 22 September 2026: "it always fails the first time, then after 2-3 tries it starts
   * working"). An empty mark draws the initials on the chosen ground, which is exactly what the
   * picker previews.
   */
  icon: z
    .string()
    .max(40)
    .regex(/^[a-zA-Z]*$/, "A mark's name is letters."),
  ground: z
    .number()
    .int()
    .min(0)
    .max(SPACE_ICON_GROUNDS - 1),
  /**
   * Letters the face wears in place of a mark (ADR 0139): one or two, or an emoji or two, on the
   * ground. With them the mark is empty. Absent, the face is its mark, or the initials on the
   * ground when the mark is empty too. A client older than them draws the initials on the ground.
   */
  letters: z
    .string()
    .min(1)
    .max(32)
    .refine(areFaceLetters, "Up to two letters or emoji, and no spaces.")
    .optional()
    .describe(
      "One or two letters, or an emoji or two, the face wears on its ground in place of a mark (ADR 0139); the mark is empty beside them. Absent on a face that is a mark, or only a colour.",
    ),
});

export type SpaceIcon = z.infer<typeof spaceIcon>;

/** What a person chose, by space id. */
export type SpaceIcons = Readonly<Record<string, SpaceIcon>>;

/** The face a person sent, or the reason it is not one. */
export function parseSpaceIcon(
  raw: unknown,
): { ok: true; value: SpaceIcon } | { ok: false; message: string } {
  const parsed = spaceIcon.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const first = parsed.error.issues[0];
  return {
    ok: false,
    message: first === undefined ? "not a face" : `${first.path.join(".")}: ${first.message}`,
  };
}
