/**
 * The sums behind picking spaces on the list (ADR 0181), in a module Node can run.
 */

// The rows held as they go, and the words for what can't be picked, are core's, so the desktop's
// list says what the phone's says.
export {
  agentHintWords,
  type HeldRow as Held,
  hintWords,
  keepLeaving,
} from "@chipschat/core";

/** Names in a sentence: "A", "A and B", "A, B and C". */
export function listed(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
