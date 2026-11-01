/**
 * Search's hint (ADR 0137): with nothing typed and nothing searched for yet, Search says what it
 * finds in a bigger line, "Find" and a word that rolls over from one thing it finds to the next
 * with a little spring each time, and the whole sentence small under it. Arjun asked for the line
 * to be made "cool as well" and picked the rolling word from four mocks (7 October 2026).
 *
 * The words and their pace live here, the same on the phone and the web. How the words roll is
 * each client's: the phone reads it off one native clock (`apps/mobile/src/search/roll.ts`), the
 * web runs it as a CSS animation.
 */

export const SEARCH_HINT = {
  /** The bigger line's first word, which stays. */
  lead: "Find",
  /** What rolls after it, in turn and round again. */
  words: ["spaces", "agents", "anything said"],
  /** The sentence under it, which is what a screen reader reads. */
  sentence: "Spaces, agents, and anything said in them.",
  /** How long each word stays, and how long it takes to roll over to the next. */
  holdMs: 2400,
  rollMs: 600,
  /** The roll's spring as a cubic Bézier: a little past the next word, and back. */
  spring: [0.34, 1.5, 0.64, 1],
} as const;

/** One round: every word once, the first again when it ends. */
export const HINT_ROUND_MS = SEARCH_HINT.words.length * (SEARCH_HINT.holdMs + SEARCH_HINT.rollMs);
