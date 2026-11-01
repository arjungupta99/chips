/**
 * Which appearance this phone shows: the system's, or light or dark whatever the system says.
 *
 * One value, held here rather than in React state, because two things read it that share no
 * ancestor worth threading it through — every palette in the app, and the row of choices in
 * You — and because it has to be applied before the first screen is drawn, from what was
 * chosen last time. It is a fact about this phone, kept in `prefs` beside the swipe hint, and
 * the workspace never hears of it.
 *
 * The platform is told too. The palette follows the choice on its own, but an alert, a share
 * sheet and a date picker are drawn by the system, and without `Appearance.setColorScheme` a
 * dark app would raise a white alert. The web target has no such switch and needs none: there
 * the palette is everything.
 */

import { useSyncExternalStore } from "react";
import { Appearance } from "react-native";
import { readSetting, SETTINGS, writeSetting } from "../prefs";

export type AppearanceChoice = "system" | "light" | "dark";

export const APPEARANCES: readonly { readonly value: AppearanceChoice; readonly label: string }[] =
  [
    { value: "system", label: "System" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ];

let current: AppearanceChoice = "system";
const listeners = new Set<() => void>();

function isChoice(value: unknown): value is AppearanceChoice {
  return value === "system" || value === "light" || value === "dark";
}

function apply(choice: AppearanceChoice): void {
  current = choice;
  Appearance.setColorScheme?.(choice === "system" ? "unspecified" : choice);
  for (const listener of listeners) listener();
}

/** What was chosen last time, applied. Read once, at launch, before the first screen. */
export async function loadAppearance(): Promise<AppearanceChoice> {
  const stored = await readSetting(SETTINGS.appearance).catch(() => undefined);
  const choice = isChoice(stored) ? stored : "system";
  apply(choice);
  return choice;
}

/** Choose, for good: applied now and written down for next time. */
export function chooseAppearance(choice: AppearanceChoice): void {
  apply(choice);
  void writeSetting(SETTINGS.appearance, choice).catch(() => undefined);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const read = () => current;

/** The choice, as React state: re-rendered wherever it is read when it changes. */
export function useAppearance(): AppearanceChoice {
  return useSyncExternalStore(subscribe, read, read);
}
