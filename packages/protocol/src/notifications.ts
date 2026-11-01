/**
 * A person's notification settings (M5.6): the three tiers of attention (blueprint: Decide now
 * breaks through, Review today is batched hourly, FYI is a daily digest), quiet hours, a word
 * per harness, and one per room. Held on the server, per person, private to them; read and written over
 * `/v1/me/notifications`, and applied on whichever device raises the banner.
 */

import { z } from "zod";

/** A time of day, `HH:MM`, in the person's own clock. */
export const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .describe("A time of day, HH:MM, on the device's own clock.");

export const quietHours = z
  .object({
    from: timeOfDay,
    to: timeOfDay,
    /**
     * What still gets through: a decision, since an approval expires and a run is blocked on it
     * (the blueprint's "breaks through"), or nothing at all.
     */
    breakthrough: z.enum(["decide", "none"]).default("decide"),
  })
  .describe(
    "A window each day in which Review and FYI wait; `from` may be after `to` for a window across midnight.",
  );

/** How much a person hears from one harness: everything, only its decisions, or nothing. */
export const harnessNotifications = z.enum(["all", "decide", "none"]);

/**
 * How much a person hears from one room on their phone (ADRs 0198, 0216): every message in it,
 * what its people write and what @s them, only what @s them, or nothing. A decision is the Decide
 * tier's, whatever this says.
 */
export const spaceNotifications = z.enum(["all", "people", "mentions", "none"]);

export const notificationSettings = z.object({
  /** Decide now: at once, or never a banner (its room still shows it). */
  decide: z.enum(["now", "off"]).default("now"),
  /** Review today: batched, one banner an hour at most, or off. */
  review: z.enum(["hourly", "off"]).default("hourly"),
  /** FYI: rolled into one banner a day, or off. */
  fyi: z.enum(["daily", "off"]).default("daily"),
  quiet: quietHours.optional(),
  /** By harness id; a harness not listed is `all`. */
  harnesses: z.record(z.string().min(1).max(120), harnessNotifications).default({}),
  /**
   * By space id; a room not listed is `people` (ADR 0216). Absent from what an app older than
   * ADR 0198 sends, and then what was saved is kept.
   */
  spaces: z.record(z.string().min(1).max(120), spaceNotifications).optional(),
});

export type NotificationSettings = z.infer<typeof notificationSettings>;
export type QuietHours = z.infer<typeof quietHours>;
export type HarnessNotifications = z.infer<typeof harnessNotifications>;
export type SpaceNotifications = z.infer<typeof spaceNotifications>;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  decide: "now",
  review: "hourly",
  fyi: "daily",
  harnesses: {},
};

/** The settings a person sent, with the defaults filled in, or the reason they are not settings. */
export function parseNotificationSettings(
  raw: unknown,
): { ok: true; value: NotificationSettings } | { ok: false; message: string } {
  const parsed = notificationSettings.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issue = parsed.error.issues[0];
  return {
    ok: false,
    message: issue === undefined ? "not settings" : `${issue.path.join(".")}: ${issue.message}`,
  };
}
