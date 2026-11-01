/**
 * The palette for what the phone is showing: the system's scheme, unless the person chose one
 * in You (`appearance.ts`). `useColorScheme` follows the system setting and re-renders when it
 * changes; the choice is a store of its own and re-renders the same way; this is where the two
 * meet, so a screen asks one question and gets one answer.
 */

import { useColorScheme } from "react-native";
import { useAppearance } from "./appearance";
import { dark, light, type Palette } from "./tokens";

export type Scheme = "light" | "dark";

/** Light or dark, as the app is drawing it — the choice first, the system when there is none. */
export function useScheme(): Scheme {
  const system = useColorScheme();
  const choice = useAppearance();
  if (choice !== "system") return choice;
  return system === "dark" ? "dark" : "light";
}

export function usePalette(): Palette {
  return useScheme() === "dark" ? dark : light;
}
