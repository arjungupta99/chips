/**
 * Replies in a room (ADR 0219), as the clients draw them: the card a reply carries, quoting the
 * message it answers, and the words beneath a message that has replies. In core so the phone and
 * the desktop say the same things.
 *
 * - **The card.** Who said the message, the day when it was not today, and two lines of its words
 *   as they read now. A photo shows small, a file by its name, a voice note by how long it runs. A
 *   message taken back reads "Deleted message", one the reader deleted for themselves "A message
 *   you deleted", and one this device doesn't hold "Earlier message"; none of those goes anywhere.
 * - **The mark.** "1 reply", "3 replies", under the message, going to the newest.
 *
 * A reply is not a thread: it stays in the room. A line's `threadId` and `replyCount` are a
 * thread's, and `replyTo` and `repliedBy` are these.
 */

import {
  type Attachment,
  formatDuration,
  hasThumbnail,
  isVoiceNoteName,
  kindOf,
} from "./attachments.js";
import { type Directory, nameOf } from "./events.js";
import { plainWords } from "./markdown.js";
import type { Line, Space } from "./model/types.js";

/**
 * How the quoted message stands: there to read, taken back, deleted by the reader for themselves
 * (ADR 0167), or not on this device.
 */
export type ReplyCardState = "shown" | "deleted" | "deletedForMe" | "missing";

/** What a quoted message holds besides its words, which the card draws small or names. */
export type ReplyHolds =
  | { readonly kind: "photo"; readonly attachment: Attachment }
  | { readonly kind: "video"; readonly attachment: Attachment }
  | { readonly kind: "voice"; readonly words: string }
  | { readonly kind: "file"; readonly words: string };

/** The card a reply carries, as both apps draw it. */
export interface ReplyCard {
  /** The quoted line, which pressing the card goes to when it is `shown`. */
  readonly lineId: string;
  readonly state: ReplyCardState;
  /** Who said it, for their name and colour. Absent when the device doesn't hold it. */
  readonly authorId?: string | undefined;
  /** Their name, or "" when it is not known. */
  readonly name: string;
  /** "" today, "Yesterday", a weekday within the week, else the date (`replyDay`). */
  readonly day: string;
  /** Its words as plain words, or what it holds, or the state's words. */
  readonly words: string;
  readonly holds?: ReplyHolds | undefined;
}

const STATE_WORDS: Readonly<Record<Exclude<ReplyCardState, "shown">, string>> = {
  deleted: "Deleted message",
  deletedForMe: "A message you deleted",
  missing: "Earlier message",
};

/**
 * The card for a reply: the line it answers, as the room has it now. Nothing for a line that
 * answers none.
 */
export function replyCard(
  space: Pick<Space, "lines" | "hidden">,
  line: Pick<Line, "replyTo">,
  directory: Directory,
  now: number,
): ReplyCard | undefined {
  const lineId = line.replyTo;
  if (lineId === undefined) return undefined;
  if (space.hidden?.has(lineId) === true) return gone(lineId, "deletedForMe");
  const quoted = space.lines.find((each) => each.id === lineId);
  if (quoted === undefined) return gone(lineId, "missing");
  const said = {
    lineId,
    authorId: quoted.authorId,
    name: nameOf(directory, quoted.authorId),
    day: replyDay(quoted.ts, now),
  };
  if (quoted.deleted === true) return { ...said, state: "deleted", words: STATE_WORDS.deleted };
  const holds = holdsOf(quoted.attachments ?? []);
  const words = plainWords(quoted.text);
  return {
    ...said,
    state: "shown",
    words: words === "" ? (holdsWords(holds) ?? "") : words,
    ...(holds === undefined ? {} : { holds }),
  };
}

function gone(lineId: string, state: "deletedForMe" | "missing"): ReplyCard {
  return { lineId, state, name: "", day: "", words: STATE_WORDS[state] };
}

/** The first thing a message holds that the card can show: a photo, a video, a voice note, a file. */
function holdsOf(attachments: readonly Attachment[]): ReplyHolds | undefined {
  const first = attachments[0];
  if (first === undefined) return undefined;
  const kind = kindOf(first.mimeType);
  if (kind === "image" && hasThumbnail(first.mimeType)) return { kind: "photo", attachment: first };
  if (kind === "video") return { kind: "video", attachment: first };
  if (kind === "audio" && isVoiceNoteName(first.filename)) {
    const length = first.durationMs === undefined ? "" : `, ${formatDuration(first.durationMs)}`;
    return { kind: "voice", words: `Voice note${length}` };
  }
  return { kind: "file", words: first.filename };
}

/** What stands for the words of a message that has none. */
function holdsWords(holds: ReplyHolds | undefined): string | undefined {
  switch (holds?.kind) {
    case "photo":
      return "Photo";
    case "video":
      return "Video";
    case "voice":
    case "file":
      return holds.words;
    default:
      return undefined;
  }
}

const DAY_MS = 86_400_000;

/**
 * When a quoted message was said, on the card: "" today, "Yesterday", a weekday within the week,
 * else the date ("12 Oct"), in the device's own zone.
 */
export function replyDay(iso: string, now: number): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const days = Math.round((startOfDay(new Date(now)) - startOfDay(at)) / DAY_MS);
  if (days <= 0) return "";
  if (days === 1) return "Yesterday";
  if (days < 7) return at.toLocaleDateString("en-US", { weekday: "long" });
  return `${at.getDate()} ${at.toLocaleDateString("en-US", { month: "short" })}`;
}

function startOfDay(at: Date): number {
  const copy = new Date(at);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

/**
 * The replies to a line the reader has (ADR 0219), oldest first: those they deleted for themselves
 * aren't counted. The mark goes to the last.
 */
export function repliesTo(
  space: Pick<Space, "hidden">,
  line: Pick<Line, "repliedBy">,
): readonly string[] {
  const replies = line.repliedBy ?? [];
  const hidden = space.hidden;
  return hidden === undefined ? replies : replies.filter((id) => !hidden.has(id));
}

/**
 * Whether a line can be replied to (ADR 0219): a message a person or an agent said, with words or
 * files. That is an agent's answer that also closed its run too (`folded`): its run's summary is
 * drawn onto it, and it is still the message the agent said, which nearly every answer in a room
 * is (his phone, 23 October 2026: "I can reply to my messages, not the other person's"). A system
 * line can't, nor a summary that is only a run's, nor a message taken back, nor one still on its
 * way, which has no id yet for a reply to name.
 */
export function mayReply(
  line: Pick<
    Line,
    "kind" | "folded" | "authorKind" | "deleted" | "pending" | "text" | "attachments"
  >,
): boolean {
  const said = line.kind === "text" || (line.kind === "summary" && line.folded === true);
  if (!said || line.authorKind === "system") return false;
  if (line.deleted === true || line.pending === true) return false;
  return line.text.trim() !== "" || (line.attachments?.length ?? 0) > 0;
}

/** "1 reply", "3 replies". */
export function repliesWords(count: number): string {
  return count === 1 ? "1 reply" : `${count} replies`;
}

/** What the pill back says: "Back to your reply", or "Back to the reply" when it is someone else's. */
export function backToReplyWords(mine: boolean): string {
  return mine ? "Back to your reply" : "Back to the reply";
}
