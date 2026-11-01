/**
 * Why the server turned something away, as a sentence for the person: under the card whose
 * decision or answer it refused, and under the line whose Not right? it refused (PM-4). It was
 * the phone's alone (`apps/mobile/src/words.ts`) until the web needed the same words.
 */

import { type Directory, nameOf } from "./events.js";

/**
 * The event's name taken off the front and a participant's id said as their name.
 * *question.answered was refused: the run has ended as done* is the server's; *Not sent: the run
 * has ended as done.* is the person's.
 */
export function refusalWords(reason: string, directory: Directory): string {
  const bare = reason.replace(/^[a-z]+(?:\.[a-z_]+)+ was refused: /, "");
  const named = bare.replace(/\b[a-z]{3}_[0-9A-HJKMNP-TV-Z]{26}\b/g, (id) => nameOf(directory, id));
  const sentence = named.endsWith(".") ? named : `${named}.`;
  return `Not sent: ${sentence}`;
}
