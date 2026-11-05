/**
 * The same settings in a browser: `localStorage`, which the web target has and `expo-sqlite`'s
 * WASM build would only complicate. Metro picks this file for the web platform.
 */

const SETTING = "chips.setting.";

export async function readSetting(name: string): Promise<string | undefined> {
  return globalThis.localStorage?.getItem(`${SETTING}${name}`) ?? undefined;
}

export async function writeSetting(name: string, value: string): Promise<void> {
  globalThis.localStorage?.setItem(`${SETTING}${name}`, value);
}

export const SETTINGS = {
  appearance: "appearance",
  newSpace: "new-space",
  /** Whether this person turned Chips's pushes off here (ADR 0085). */
  push: "push",
  /** Who each room's field was last told a draft is for (`spaces/picks.ts`, ADR 0114). */
  picks: "picks",
  /** What was searched for here, newest first (`search/recent.ts`, ADR 0132). */
  recentSearches: "search.recent",
  /** The change each space's Universe was last opened at here (`spaces/universeSeen.ts`). */
  universeSeen: "universe.seen",
  /** The made-up workspace kept after its film, Look around (ADR 0213). */
  demo: "demo",
} as const;
