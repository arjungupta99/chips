/**
 * Not right? (ADR 0200): what a person says when an agent's message missed, in the words both
 * apps use.
 *
 * It took the place of three things (Arjun, 18 October 2026): a thumbs up nobody read, a thumbs
 * down, and *What went wrong?*. The thumbs down and the note were one act, *redo this*, with or
 * without a reason, and a thumbs down alone only had Jacobian ask what went wrong. So there is one
 * page, with reasons to tap, words if the person has more to say, and Send once there is either:
 * a `correction` carrying them, which every harness answers with a turn that looks again. The wire
 * did not change, so a 👍 or 👎 already on a line keeps drawing.
 */

/** The reasons, each one tap. They go in front of the note as words. */
export const NOT_RIGHT_REASONS = [
  "Wrong facts",
  "Missed what I asked",
  "Too long",
  "Not finished",
] as const;

/**
 * The note a Not right? sends: the reasons tapped, as a sentence, then the words written; nothing
 * when there is neither, which is not yet anything to send.
 */
export function notRight(reasons: readonly string[], words: string): string | undefined {
  const picked = reasons.length === 0 ? "" : `${reasons.join(", ")}.`;
  const text = [picked, words.trim()].filter((part) => part !== "").join(" ");
  return text === "" ? undefined : text;
}

/** The words of the row and the page, for the agent `name`. */
export function notRightWords(name: string) {
  return {
    label: "Not right?",
    hint: `Tell ${name}, and it tries again`,
    title: "What’s not right?",
    subtitle: `${name} reads it and tries again`,
    placeholder: `Anything else ${name} should know`,
    send: `Send to ${name}`,
    empty: "Pick a reason or say what to fix.",
  } as const;
}
