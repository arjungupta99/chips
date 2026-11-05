/**
 * What to notify a person about, and when (M5.6).
 *
 * The three tiers of attention are the blueprint's: Decide now breaks through, Review today is
 * batched to one banner an hour at most, FYI is rolled into one a day. A person's settings say
 * which tiers they hear, their quiet hours, and how much they hear from each harness. This is
 * the pure part: given what needs the person, their settings and the clock, the notices that
 * should be raised now — each with a key the server's claim ledger dedups across their devices,
 * so a banner is raised on one device and one only. Raising it is the app's.
 */

import type { HarnessNotifications, NotificationSettings, QuietHours } from "@chipschat/protocol";
import type { NeedsYouItem, Tier } from "./model.js";

/** One banner to raise: a decision to ask about, or a digest of what is waiting. */
export type Notice =
  | {
      readonly kind: "decision";
      /** What the claim ledger dedups on: `decision:<approval id>`. */
      readonly key: string;
      readonly item: NeedsYouItem;
    }
  | {
      readonly kind: "digest";
      /** `digest:<tier>:<bucket>`: one an hour for Review today, one a day for FYI. */
      readonly key: string;
      readonly tier: Tier;
      readonly items: readonly NeedsYouItem[];
    };

/** The moment, as the planner reads it: the clock, and the device's own local day and time. */
export interface Moment {
  readonly nowMs: number;
  /** Minutes since local midnight, for the quiet hours and a digest's hour. */
  readonly localMinutes: number;
  /** The local calendar day, `2026-09-08`, for a digest's day. */
  readonly localDate: string;
}

/** A `Moment` from a `Date`, on the device's own clock. */
export function momentOf(date: Date): Moment {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return {
    nowMs: date.getTime(),
    localMinutes: date.getHours() * 60 + date.getMinutes(),
    localDate: `${date.getFullYear()}-${month}-${day}`,
  };
}

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** True inside the window, which may run across midnight (`22:00` to `07:00`). */
export function inQuietHours(quiet: QuietHours | undefined, localMinutes: number): boolean {
  if (quiet === undefined) return false;
  const from = minutesOf(quiet.from);
  const to = minutesOf(quiet.to);
  if (from === to) return false;
  return from < to
    ? localMinutes >= from && localMinutes < to
    : localMinutes >= from || localMinutes < to;
}

/**
 * The hour or day a digest belongs to, on the device's own clock, as the quiet hours are (ADR
 * 0085): "at most one a day" means the person's day, which begins at their midnight and not at
 * UTC's — in California a UTC day turns over in the late afternoon. A person's devices are
 * nearly always in one time zone, so they still name the same bucket and the claim ledger still
 * raises it once.
 */
export function bucketOf(tier: Tier, moment: Moment): string {
  if (tier !== "review") return moment.localDate;
  const hour = String(Math.floor(moment.localMinutes / 60)).padStart(2, "0");
  return `${moment.localDate}T${hour}`;
}

/** Whether the person hears about this item from this harness at all, per their settings. */
function heardFrom(item: NeedsYouItem, settings: NotificationSettings): boolean {
  const word = settings.harnesses[item.harnessId] ?? "all";
  if (word === "none") return false;
  if (word === "decide") return item.tier === "decide";
  return true;
}

/**
 * The notices to raise now, from what needs the person (already narrowed to what is unread or
 * undecided, as `attention` does). A decision is one notice each, at once — through quiet hours
 * unless the person said nothing breaks through. Review today and FYI become one digest each
 * for the current bucket, held during quiet hours; the ledger sees to it that a bucket is
 * raised once, whichever device gets there first.
 */
export function planNotices(
  items: readonly NeedsYouItem[],
  settings: NotificationSettings,
  moment: Moment,
): Notice[] {
  const quiet = inQuietHours(settings.quiet, moment.localMinutes);
  const heard = items.filter((item) => heardFrom(item, settings));
  const notices: Notice[] = [];
  const decisions = heard.filter((item) => item.tier === "decide");
  const breaksThrough = settings.quiet?.breakthrough !== "none";
  if (settings.decide === "now" && (!quiet || breaksThrough)) {
    for (const item of decisions) {
      notices.push({ kind: "decision", key: `decision:${item.id}`, item });
    }
  }
  if (quiet) return notices;
  const digests: [Tier, boolean][] = [
    ["review", settings.review === "hourly"],
    ["fyi", settings.fyi === "daily"],
  ];
  for (const [tier, on] of digests) {
    const batch = heard.filter((item) => item.tier === tier);
    if (!on || batch.length === 0) continue;
    notices.push({
      kind: "digest",
      key: `digest:${tier}:${bucketOf(tier, moment)}`,
      tier,
      items: batch,
    });
  }
  return notices;
}

/** "3 things to review", "1 thing for later": a digest's one line. */
export function digestTitle(notice: Extract<Notice, { kind: "digest" }>): string {
  const count = notice.items.length;
  const noun = count === 1 ? "thing" : "things";
  return notice.tier === "review" ? `${count} ${noun} to review` : `${count} ${noun} for later`;
}

// ------------------------------------------------------------------- what You's rows say of them

/**
 * The settings as You's rows and forms say them, on the phone and the desktop alike (ADR 0085,
 * ADR 0265): a word at the right of each row, and in its form each choice with what it lets
 * through. Each is the person's, the same on every device of theirs.
 */
export const DECIDE_WORDS: Readonly<Record<NotificationSettings["decide"], string>> = {
  now: "Right away",
  off: "Off",
};
export const REVIEW_WORDS: Readonly<Record<NotificationSettings["review"], string>> = {
  hourly: "Hourly",
  off: "Off",
};
export const FYI_WORDS: Readonly<Record<NotificationSettings["fyi"], string>> = {
  daily: "Daily",
  off: "Off",
};

/**
 * What each word for a harness lets through, said under its choice. Everything is not every
 * reply: a reply never notifies anyone, so the most a harness can do is ask and @.
 */
export const HEAR_WORDS: Readonly<Record<HarnessNotifications, string>> = {
  all: "Its decisions, and messages that @ you",
  decide: "Only its decisions. Its @s of you stay quiet",
  none: "Nothing from it notifies you",
};

/**
 * A time the server keeps as `22:00`, as this device says times: "10:00 PM" where the clock is
 * twelve-hour, "22:00" where it is not.
 */
function timeOfDay(time: string): string {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const at = new Date(2026, 0, 1, hours, minutes);
  return at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Quiet hours at the right of their row: the window, or Off. */
export function quietWords(quiet: QuietHours | undefined): string {
  return quiet === undefined ? "Off" : `${timeOfDay(quiet.from)}–${timeOfDay(quiet.to)}`;
}

/** The line under Quiet hours: what gets through them as they are set. */
export function quietSub(quiet: QuietHours | undefined): string {
  if (quiet === undefined) return "Notifications can come at any hour";
  return quiet.breakthrough === "decide"
    ? "Only decisions get through"
    : "Nothing gets through, not even decisions";
}

/**
 * The agents at the right of their row: "Everything" while none is turned down, else what is
 * turned down — "Scout muted", "2 muted", "1 decisions only".
 */
export function agentsWords(
  harnesses: readonly { readonly id: string; readonly name: string }[],
  chosen: NotificationSettings["harnesses"],
): string {
  const muted = harnesses.filter((each) => chosen[each.id] === "none");
  const asks = harnesses.filter((each) => chosen[each.id] === "decide");
  if (muted.length === 0 && asks.length === 0) return "Everything";
  const said: string[] = [];
  if (muted.length > 0)
    said.push(muted.length === 1 ? `${muted[0]?.name} muted` : `${muted.length} muted`);
  if (asks.length > 0) {
    said.push(
      asks.length === 1 ? `${asks[0]?.name} decisions only` : `${asks.length} decisions only`,
    );
  }
  return said.join(", ");
}
