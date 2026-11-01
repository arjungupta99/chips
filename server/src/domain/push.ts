/**
 * Who hears about a decision on their phone (M4.3, ADR 0045). Pure.
 *
 * Given an ask, the room it was asked in, what the people said they want to hear, and where
 * their phones are, this answers the phones to push to and nothing else. It is the same
 * question `planNotices` answers in the core for a browser, asked on the server instead —
 * because a phone that is asleep is not running any planner, and the server has to decide for
 * it. The two agree on the key, `decision:<approval id>`, so the claim ledger dedups across
 * both: a laptop that raised the banner means the phone stays quiet.
 *
 * Three things narrow the list. Who *may* answer, which is the event's own `approvers` and
 * otherwise the room minus its guests — never a harness, which has no phone and no opinion.
 * What the person asked for: the Decide tier on, and the word for this harness not `none`.
 * And when it is, where the phone is — quiet hours are a person saying "not at night", and
 * night is a fact about the phone's zone, not the server's.
 */

import type { NotificationSettings, SpaceNotifications } from "@chipschat/protocol";
import { DEFAULT_NOTIFICATION_SETTINGS, isId } from "@chipschat/protocol";

/** The ask, as this needs it. */
export interface PushAsk {
  readonly approvalId: string;
  /** The harness that asked, for the person's word about it. */
  readonly harnessId: string;
  /** Who Chips resolved may answer. Empty means the room. */
  readonly approvers: readonly string[];
}

/**
 * A phone that may be reached, as this needs it. The registry's `PushToken` is this and a
 * platform; the shape is declared here rather than imported because the domain layer does not
 * reach into application (`domain-not-to-outer`), and because what the rules need is these four
 * fields and nothing else.
 */
export interface Phone {
  readonly deviceId: string;
  readonly participantId: string;
  readonly token: string;
  /** The phone's own IANA zone: where "not at night" is a fact about. */
  readonly timeZone: string;
  /** The key its extension opens sealed words with (ADR 0158); absent, it gets fixed words. */
  readonly sealKey?: string | undefined;
}

/** A member of the room the ask was asked in. */
export interface RoomMember {
  readonly id: string;
  readonly kind: "person" | "harness" | "agent";
  /** Their standing in the workspace. A guest of one room answers only what named them. */
  readonly role: string | undefined;
}

/** One phone to push to. */
export interface PushRecipient {
  readonly participantId: string;
  readonly deviceId: string;
  readonly token: string;
  /** What is claimed before sending: the key the browser's planner uses for the same ask. */
  readonly key: string;
  /** The phone's sealing key, when it has one (ADR 0158). */
  readonly sealKey?: string | undefined;
}

export interface PushInput {
  readonly ask: PushAsk;
  readonly members: readonly RoomMember[];
  /** Each person's settings, by participant id. Missing means they never saved any. */
  readonly settings: ReadonlyMap<string, NotificationSettings | undefined>;
  readonly phones: readonly Phone[];
  /** The moment, as an instant. Every zone is read off it. */
  readonly at: Date;
}

/** The key the claim ledger dedups on. Kept in step with the core's `planNotices`. */
export function decisionKey(approvalId: string): string {
  return `decision:${approvalId}`;
}

/**
 * Who may answer: the ask's own list when it has one, and otherwise the room. Harnesses are
 * dropped from both — an ask may name one when nothing about it matters (`peopleFor` in
 * `submit-event`), and a harness is not something you push to. Guests are dropped from the
 * room, because "anyone here" has never meant a guest; a guest named outright stays, which is
 * the whole point of naming them.
 */
export function mayBeTold(ask: PushAsk, members: readonly RoomMember[]): string[] {
  if (ask.approvers.length > 0) {
    return [...new Set(ask.approvers)].filter((id) => !isId("harness", id));
  }
  return members
    .filter((member) => member.kind === "person" && member.role !== "guest")
    .map((member) => member.id);
}

/** What a person who never opened the settings is taken to want. */
const DEFAULTS = DEFAULT_NOTIFICATION_SETTINGS;

/** Whether this person wants to hear about a decision from this harness at all. */
export function wantsTelling(
  settings: NotificationSettings | undefined,
  harnessId: string,
): boolean {
  const theirs = settings ?? DEFAULTS;
  if (theirs.decide !== "now") return false;
  // `decide` and `all` both cover a decision; only `none` silences one.
  return (theirs.harnesses[harnessId] ?? "all") !== "none";
}

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/**
 * The time of day where the phone is, in minutes since its own midnight.
 *
 * A zone the runtime does not know throws, and there is nothing useful to do about it here: the
 * app writes `Intl.DateTimeFormat().resolvedOptions().timeZone`, so an unreadable one is a bug
 * rather than a state a person can get into. UTC is the answer that is at least defined, and
 * the person hears their decision rather than silently not hearing it.
 */
export function localMinutes(at: Date, timeZone: string): number {
  const read = (zone: string): number => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
    return value("hour") * 60 + value("minute");
  };
  try {
    return read(timeZone);
  } catch {
    return read("UTC");
  }
}

/** True inside the window, which may run across midnight (`22:00` to `07:00`). */
export function inQuietHours(
  settings: NotificationSettings | undefined,
  at: Date,
  timeZone: string,
): boolean {
  const quiet = (settings ?? DEFAULTS).quiet;
  if (quiet === undefined) return false;
  const from = minutesOf(quiet.from);
  const to = minutesOf(quiet.to);
  if (from === to) return false;
  const now = localMinutes(at, timeZone);
  return from < to ? now >= from && now < to : now >= from || now < to;
}

/** Whether a decision gets through the quiet hours the person set. */
function breaksThrough(settings: NotificationSettings | undefined): boolean {
  return (settings ?? DEFAULTS).quiet?.breakthrough !== "none";
}

/**
 * The phones this ask may go to: one entry per device, filtered by who may answer, what they
 * asked to hear, and where the phone is.
 *
 * "May go to", not "goes to". A person with two phones appears twice here, and the claim
 * ledger picks one of them — exactly one notification per event per person is its job, not
 * this one's. What matters is that the choosing happens *after* this: a phone where it is the
 * middle of the night is gone by now, so the ledger cannot pick it and leave the person with
 * a phone in daylight untold.
 */
export function pushRecipients(input: PushInput): PushRecipient[] {
  const told = new Set(mayBeTold(input.ask, input.members));
  if (told.size === 0) return [];
  const key = decisionKey(input.ask.approvalId);
  const recipients: PushRecipient[] = [];
  for (const phone of input.phones) {
    if (!told.has(phone.participantId)) continue;
    const settings = input.settings.get(phone.participantId);
    if (!wantsTelling(settings, input.ask.harnessId)) continue;
    if (inQuietHours(settings, input.at, phone.timeZone) && !breaksThrough(settings)) continue;
    recipients.push({
      participantId: phone.participantId,
      deviceId: phone.deviceId,
      token: phone.token,
      key,
    });
  }
  return recipients;
}

/** The key a message is claimed under: one push per person per message (ADRs 0158, 0198). */
export function messageKey(messageId: string): string {
  return `message:${messageId}`;
}

/** A message in a room, as the rules need it (ADRs 0158, 0198). */
export interface MessageInput {
  /** The message, for the claim key. */
  readonly messageId: string;
  /** The room it was said in, for each person's word about it. */
  readonly spaceId: string;
  /** Who said it: never told of their own words. */
  readonly speakerId: string;
  /** The harness an agent speaks through, for the person's word about it; absent for a person. */
  readonly harnessId?: string | undefined;
  /** The people in the room now. */
  readonly people: readonly string[];
  /** The people the message @s. */
  readonly mentioned: readonly string[];
  /** The people who hid the room from their own list (ADR 0205): told nothing of it. */
  readonly hidden?: readonly string[] | undefined;
  readonly settings: ReadonlyMap<string, NotificationSettings | undefined>;
  readonly phones: readonly Phone[];
  readonly at: Date;
}

/**
 * How much this person hears from this room: what its people write and what @s them, unless they
 * said otherwise (ADR 0216).
 */
export function roomLevel(
  settings: NotificationSettings | undefined,
  spaceId: string,
): SpaceNotifications {
  return (settings ?? DEFAULTS).spaces?.[spaceId] ?? "people";
}

/**
 * Whether this person wants an agent's words from this harness on their phone: only when they hear
 * everything it says (`all`, the default). `decide` is its decisions only, and `none` is nothing.
 */
export function wantsMentions(
  settings: NotificationSettings | undefined,
  harnessId: string,
): boolean {
  return ((settings ?? DEFAULTS).harnesses[harnessId] ?? "all") === "all";
}

/** Whether a message reaches this person at all, before quiet hours. */
function wantsMessage(input: MessageInput, participantId: string): boolean {
  // A room they hid is a room set to Off for as long as it is hidden, an @ and all (ADR 0205).
  if (input.hidden?.includes(participantId) === true) return false;
  const settings = input.settings.get(participantId);
  const level = roomLevel(settings, input.spaceId);
  if (level === "none") return false;
  const named = input.mentioned.includes(participantId);
  if (level === "mentions" && !named) return false;
  // A person's words reach the room whoever they were for, an agent included (ADR 0216).
  if (input.harnessId === undefined) return true;
  if (level === "people" && !named) return false;
  return wantsMentions(settings, input.harnessId);
}

/**
 * The phones a message may go to (ADRs 0158, 0198, 0216): each phone of a person in the room who
 * did not say it, when a person said it, it @s them, or they hear everything there, unless they
 * silenced the room or hid it (ADR 0205), or the agent's harness, or it is their quiet hours. A
 * message never breaks through those; a decision does. As with a decision, the claim ledger then
 * keeps it to one phone each.
 */
export function messageRecipients(input: MessageInput): PushRecipient[] {
  const inRoom = new Set(input.people);
  const key = messageKey(input.messageId);
  const recipients: PushRecipient[] = [];
  for (const phone of input.phones) {
    const who = phone.participantId;
    if (who === input.speakerId || !inRoom.has(who)) continue;
    if (!wantsMessage(input, who)) continue;
    if (inQuietHours(input.settings.get(who), input.at, phone.timeZone)) continue;
    recipients.push({
      participantId: who,
      deviceId: phone.deviceId,
      token: phone.token,
      key,
      ...(phone.sealKey === undefined ? {} : { sealKey: phone.sealKey }),
    });
  }
  return recipients;
}
