/**
 * When two names are one @-name, and the free name an agent is given (ADR 0091).
 *
 * A participant's whole-name handle is its name with the spaces left out, case aside (ADR 0081),
 * so two names clash when that is the same: "Open Claw", "OpenClaw" and "openclaw". People are
 * refused a name that clashes; an agent is numbered, "OpenClaw", "OpenClaw 2", "OpenClaw 3", so
 * its @-name is `@OpenClaw2`. The server names agents with these, and the conformance fake and the
 * clients read the same rule.
 */

/** The longest name a participant is called, a person's or an agent's. */
export const MAX_NAME = 120;

/**
 * What a workspace's first person is called until they name themselves: what `chips serve` and
 * the demo give them. Nobody they invite should read "You invited you" (JR-17): the join card says
 * nobody's name for it, and You asks them for one before they invite anybody.
 */
export const FIRST_PERSON_NAME = "You";

/**
 * What an agent can't be called (SEC-33): the word on the Main agent's tag, and the word a person
 * reads in place of their own name. An agent asking for one is numbered, "Main 2", as one asking
 * for a name somebody has; a person renaming one to it is told why not.
 */
const NOT_AN_AGENT: ReadonlySet<string> = new Set(["main", "you"]);

/** Why an agent can't be called Main or You. */
export const NOT_AN_AGENT_WORDS =
  "An agent can't be called Main or You: Chips uses those words for the Main agent and for you.";

/** Whether a name is Main or You as an @-name, which no agent may be called. */
export function notAnAgentName(name: string): boolean {
  return NOT_AN_AGENT.has(clashKey(name));
}

/**
 * The Cyrillic and Greek letters a reader takes for Latin ones, under the Latin letter they look
 * like (SEC-33). A name in them is the Latin name for a clash, so "\u0410rjun" with a Cyrillic А is
 * Arjun's. Not all of Unicode's confusables: the letters a name borrows to pass for somebody, with
 * NFKC folding the full-width and mathematical ones before.
 */
const LOOK_LIKE: Readonly<Record<string, string>> = {
  A: "\u0410\u0391", // Cyrillic А, Greek Α
  B: "\u0412\u0392", // Cyrillic В, Greek Β
  C: "\u0421", // Cyrillic С
  E: "\u0415\u0395", // Cyrillic Е, Greek Ε
  H: "\u041d\u0397", // Cyrillic Н, Greek Η
  I: "\u0406\u04c0\u0399", // Cyrillic І and Ӏ, Greek Ι
  J: "\u0408", // Cyrillic Ј
  K: "\u041a\u039a", // Cyrillic К, Greek Κ
  M: "\u041c\u039c", // Cyrillic М, Greek Μ
  N: "\u039d", // Greek Ν
  O: "\u041e\u039f", // Cyrillic О, Greek Ο
  P: "\u0420\u03a1", // Cyrillic Р, Greek Ρ
  Q: "\u051a", // Cyrillic Ԛ
  S: "\u0405", // Cyrillic Ѕ
  T: "\u0422\u03a4", // Cyrillic Т, Greek Τ
  W: "\u051c", // Cyrillic Ԝ
  X: "\u0425\u03a7", // Cyrillic Х, Greek Χ
  Y: "\u0423\u04ae\u03a5", // Cyrillic У and Ү, Greek Υ
  Z: "\u0396", // Greek Ζ
  a: "\u0430\u03b1", // Cyrillic а, Greek α
  c: "\u0441", // Cyrillic с
  d: "\u0501", // Cyrillic ԁ
  e: "\u0435", // Cyrillic е
  h: "\u04bb", // Cyrillic һ
  i: "\u0456\u03b9\u0131", // Cyrillic і, Greek ι, Latin dotless ı
  j: "\u0458", // Cyrillic ј
  k: "\u03ba", // Greek κ
  l: "\u04cf", // Cyrillic ӏ
  o: "\u043e\u03bf", // Cyrillic о, Greek ο
  p: "\u0440\u03c1", // Cyrillic р, Greek ρ
  q: "\u051b", // Cyrillic ԛ
  s: "\u0455", // Cyrillic ѕ
  u: "\u03c5", // Greek υ
  v: "\u03bd", // Greek ν
  w: "\u051d", // Cyrillic ԝ
  x: "\u0445\u03c7", // Cyrillic х, Greek χ
  y: "\u0443\u04af", // Cyrillic у and ү
};

const LATIN_OF: ReadonlyMap<string, string> = new Map(
  Object.entries(LOOK_LIKE).flatMap(([latin, others]) =>
    [...others].map((other) => [other, latin] as const),
  ),
);

/**
 * What a reader doesn't see (SEC-33): control and format characters (zero-width spaces and
 * joiners, text-direction marks, a soft hyphen), the joiner that combines graphemes, and the blank
 * letters of Hangul and Braille.
 */
const HIDDEN = "\\p{Cc}\\p{Cf}\\u034f\\u115f\\u1160\\u3164\\uffa0\\u2800";

/** Every unseen character, and the variation selectors an emoji is typed with, for a clash. */
const UNSEEN = new RegExp(`[${HIDDEN}\\ufe00-\\ufe0f\\u{e0100}-\\u{e01ef}]`, "gu");

/** One hidden character. */
const HIDDEN_ONE = new RegExp(`[${HIDDEN}]`, "u");

/** The zero-width non-joiner and joiner, which `hiddenAt` judges by what is either side. */
const JOINER = /^[\u200c\u200d]$/u;

/** A Latin, Cyrillic or Greek letter, a digit or a space: nothing a joiner shapes. */
const PLAIN = /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{Nd}\s]/u;

/**
 * Whether the character at `i` is one a reader can't account for. A joiner between two emoji makes
 * one, "\u{1f469}\u200d\u{1f4bb}", and in Persian or an Indian script it shapes the letters beside it, so there it
 * counts as seen; at an end, or beside a plain letter, a digit, a space or another hidden
 * character, it is hidden.
 */
function hiddenAt(chars: readonly string[], i: number): boolean {
  const each = chars[i] as string;
  if (!HIDDEN_ONE.test(each)) return false;
  if (!JOINER.test(each)) return true;
  const before = chars[i - 1];
  const after = chars[i + 1];
  const bare = (side: string | undefined) =>
    side === undefined || PLAIN.test(side) || HIDDEN_ONE.test(side);
  return bare(before) || bare(after);
}

/** Why a name can't have a hidden character. */
export const HIDDEN_CHARACTER_WORDS =
  "A name can't have hidden characters in it, such as a zero-width space or a mark that changes the text's direction.";

/** Why a word of a name can't mix alphabets. */
export const MIXED_LETTERS_WORDS =
  "A name can't mix Latin, Cyrillic and Greek letters in one word, since they can look the same.";

const ALPHABETS = [/\p{Script=Latin}/u, /\p{Script=Cyrillic}/u, /\p{Script=Greek}/u];

/** Whether a word holds letters of two of Latin, Cyrillic and Greek: "\u0410rjun" with a Cyrillic А. */
function mixesAlphabets(word: string): boolean {
  return ALPHABETS.filter((alphabet) => alphabet.test(word)).length > 1;
}

/**
 * Why a name a person typed, for themselves, an agent or a workspace, can't be had as it is, or
 * nothing (SEC-33): a character nobody sees, which could make it pass for a name it isn't or turn
 * the words after it around, or a word that mixes alphabets whose letters look alike.
 */
export function nameProblem(name: string): string | undefined {
  const chars = [...name];
  if (chars.some((_, i) => hiddenAt(chars, i))) return HIDDEN_CHARACTER_WORDS;
  if (name.split(/\s+/).some(mixesAlphabets)) return MIXED_LETTERS_WORDS;
  return undefined;
}

/**
 * A name a harness or a device gave itself, with what nobody sees taken out (SEC-33). It isn't
 * refused, since nobody typed it to be told; its clash is judged as it reads.
 */
export function withoutHidden(name: string): string {
  const chars = [...name];
  return chars.filter((_, i) => !hiddenAt(chars, i)).join("");
}

/**
 * What a name is as an @-name: lowercased, its spaces left out, and what a reader sees, not what
 * the characters are (SEC-33). Full-width and mathematical letters fold to plain ones, a hidden
 * character counts for nothing, and a Cyrillic or Greek letter that looks Latin is that Latin
 * letter, so "\u0410rjun", "Ar\u200bjun" and "\uff21rjun" clash with Arjun.
 */
export function clashKey(name: string): string {
  const seen = name.normalize("NFKC").replace(UNSEEN, "");
  return [...seen]
    .map((each) => LATIN_OF.get(each) ?? each)
    .join("")
    .toLowerCase()
    .replace(/\s+/g, "");
}

/** A name ending in a space and a number: the name before it, and the number. */
const NUMBERED = /^(.*\S)\s+([1-9]\d*)$/;

/**
 * Whether a name is `base` or `base` numbered from 2: "OpenClaw 3" is a form of "OpenClaw". Case
 * and spaces aside, as a clash is.
 */
export function isFormOf(name: string, base: string): boolean {
  if (clashKey(name) === clashKey(base)) return true;
  const parts = NUMBERED.exec(name.trim());
  return parts !== null && parts[2] !== "1" && clashKey(parts[1] as string) === clashKey(base);
}

/** `family` with `n` after it, cut so the whole is no longer than a name may be. */
function numbered(family: string, n: number): string {
  const suffix = ` ${n}`;
  return `${family.slice(0, MAX_NAME - suffix.length).trimEnd()}${suffix}`;
}

/**
 * The name an agent is given when it asks for `wanted`, beside the names `taken` (clash keys of
 * everybody else who counts). It keeps `current` when that is `wanted`, or a numbered form of it,
 * and still free, so a number never moves because a lower one came free. Otherwise `wanted` when
 * it is free, else the smallest free number after it: "OpenClaw 2". A number at the end of
 * `wanted` is the family's only when the name before it is taken, so "OpenClaw 2" beside an
 * "OpenClaw" comes out "OpenClaw 3", and "India trip 2026" is a name of its own.
 */
export function freeAgentName(
  wanted: string,
  taken: ReadonlySet<string>,
  current?: string,
): string {
  const free = (name: string) => !taken.has(clashKey(name)) && !notAnAgentName(name);
  const parts = NUMBERED.exec(wanted);
  const family = parts !== null && !free(parts[1] as string) ? (parts[1] as string) : wanted;
  if (current !== undefined && free(current)) {
    if (isFormOf(current, wanted) || isFormOf(current, family)) return current;
  }
  if (free(wanted)) return wanted;
  for (let n = 2; ; n += 1) {
    const name = numbered(family, n);
    if (free(name)) return name;
  }
}
