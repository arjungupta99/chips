/**
 * The word kept here for whether this phone's pushes are on (`SETTINGS.push`), and who hears when
 * it changes. It is written from three places — Turn on wherever it is pressed (`turnOnPush`), the
 * launch's `refreshRegistration`, and You's switch turned off — and the setup card and You's switch
 * each read it and keep what they read. Told nothing, the setup card turned on from the ask at an
 * agent's first question stood at "Turn on" after Allow: iOS's alert gave the app back the front,
 * the card read again right then, and "on" was written a moment later, once the server had taken
 * the token (a fresh iPad, 3 November 2026).
 */

import { SETTINGS, writeSetting } from "../prefs";

const listeners = new Set<() => void>();

/** Keep the word, and tell everything reading it. */
export async function choosePush(word: "on" | "off"): Promise<void> {
  await writeSetting(SETTINGS.push, word).catch(() => undefined);
  for (const listener of listeners) listener();
}

/** Hear each time it is written; the return stops it. */
export function onPushChosen(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
