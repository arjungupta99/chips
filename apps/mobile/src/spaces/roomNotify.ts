/**
 * What a room sends this person's phone (ADRs 0198, 0216): every message, what its people write
 * and what @s them, only what @s them, or nothing. Held in their notification settings by space
 * id, and "people" until they choose, so a room shared with somebody tells them when you write,
 * whoever it was for. A decision is the Decide tier's, whatever this says.
 */

import type { NotificationSettings, SpaceNotifications } from "@chipschat/protocol";

/** The four, in the order the page offers them. */
export const LEVELS: readonly SpaceNotifications[] = ["all", "people", "mentions", "none"];

/** What each is called on the row and the page, and what it means. */
export const LEVEL_WORDS: Readonly<
  Record<SpaceNotifications, { readonly name: string; readonly under: string }>
> = {
  all: { name: "Every message", under: "Whenever anyone writes here, agents too" },
  people: { name: "People's messages", under: "When a person writes here, or an agent @s you" },
  mentions: { name: "Only @ you", under: "When someone here @s you" },
  none: { name: "Off", under: "Nothing from this space but decisions" },
};

/** This room's word in these settings. */
export function levelOf(settings: NotificationSettings, spaceId: string): SpaceNotifications {
  return settings.spaces?.[spaceId] ?? "people";
}

/** These settings with this room's word changed, and every other kept. */
export function withLevel(
  settings: NotificationSettings,
  spaceId: string,
  level: SpaceNotifications,
): NotificationSettings {
  return { ...settings, spaces: { ...settings.spaces, [spaceId]: level } };
}
