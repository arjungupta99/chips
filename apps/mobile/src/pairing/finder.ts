/**
 * Chips on this Wi-Fi (ADR 0172), from the app's own module (`modules/chips-finder`): what answers
 * `_chips._tcp` within a few seconds, through Bonjour on iOS and `NsdManager` on Android. Nothing
 * where there is no such module — the web, a build made before it — so the screen offers the other
 * ways in, as it did.
 */

import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import { type Found, type FoundServer, serversFrom } from "./found";

export type { FoundServer } from "./found";

interface Finder {
  readonly find: (seconds: number) => Promise<Found[]>;
}

let finder: Finder | null | undefined;

/** Whether this build can look for servers on the Wi-Fi at all. */
export function canFind(): boolean {
  finder ??=
    Platform.OS === "ios" || Platform.OS === "android"
      ? requireOptionalNativeModule<Finder>("ChipsFinder")
      : null;
  return finder !== null;
}

/** Look for `seconds`, and answer with what was found; nothing for a build that can't look. */
export async function findServers(seconds = 3): Promise<FoundServer[]> {
  if (!canFind() || finder === null || finder === undefined) return [];
  return serversFrom(await finder.find(seconds));
}
