/**
 * What You says, in words (ADR 0085): the value at the right of each row, and the line under a
 * device. Pure functions, so `words.vitest.ts` pins the exact strings the rows show.
 */

import {
  type Directory,
  nameOf,
  roomName,
  type WorkspaceModel,
  type WorkspaceRole,
} from "@chipschat/core";
import {
  type AttachmentCaps,
  CAP_KINDS,
  formatLimit,
  type HarnessNotifications,
  type NotificationSettings,
} from "@chipschat/protocol";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * When a device was last heard from, as the line under its name says it: "Now", "5 min ago",
 * "2 h ago", "Yesterday", "3 days ago", "5 weeks ago", then the date.
 */
export function seenWords(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const ago = Math.max(0, now - at);
  if (ago < 2 * MINUTE) return "Now";
  if (ago < HOUR) return `${Math.floor(ago / MINUTE)} min ago`;
  if (ago < DAY) return `${Math.floor(ago / HOUR)} h ago`;
  const days = Math.floor(ago / DAY);
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export const ROLE_WORDS: Readonly<Record<WorkspaceRole, string>> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  guest: "Guest",
};

/** The line under a person's name: their role here, and where here is. */
export function standingWords(role: WorkspaceRole | undefined, workspace: string): string {
  return role === undefined ? workspace : `${ROLE_WORDS[role]} · ${workspace}`;
}

/**
 * A guest's line under their name: the one space they are in and who let them in, "Guest in Japan
 * trip · invited by Arjun" (ADR 0196). A workspace is a word a guest never needs. Nothing while
 * they are in no space yet, and the role and workspace say it.
 */
export function guestStandingWords(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
): string | undefined {
  const space = model.spaces.find((each) => each.state === "open" && each.members.includes(selfId));
  if (space === undefined) return undefined;
  const invitedBy = model.people[selfId]?.invitedBy;
  const by = invitedBy === undefined ? "" : ` · invited by ${nameOf(directory, invitedBy)}`;
  return `Guest in ${roomName(model, space.id, directory)}${by}`;
}

/**
 * A time the server keeps as `22:00`, as this phone says times: "10:00 PM" where the clock is
 * twelve-hour, "22:00" where it is not. The wheel that sets it is the system's and speaks the
 * phone's own way, so the tiles and the row beside it do too.
 */
export function clockWords(time: string): string {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const at = new Date(2026, 0, 1, hours, minutes);
  return at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Quiet hours at the right of their row: the window, or Off. */
export function quietWords(quiet: NotificationSettings["quiet"]): string {
  return quiet === undefined ? "Off" : `${clockWords(quiet.from)}–${clockWords(quiet.to)}`;
}

/** The line under Quiet hours: what gets through them as they are set. */
export function quietSub(quiet: NotificationSettings["quiet"]): string {
  if (quiet === undefined) return "Notifications can come at any hour";
  return quiet.breakthrough === "decide"
    ? "Only decisions get through"
    : "Nothing gets through, not even decisions";
}

export const DECIDE_WORDS: Readonly<Record<NotificationSettings["decide"], string>> = {
  now: "Right away",
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

/** A size on this phone: "0 KB", "840 KB", "212 MB", "1.4 GB". */
export function sizeWords(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const files = (count: number) => (count === 1 ? "1 file" : `${count} files`);

/** Media on this phone's line under its size (ADR 0159): "28 files from 5 spaces". */
export function keptWords(count: number, spaces: number): string {
  if (spaces === 0) return files(count);
  return `${files(count)} from ${spaces === 1 ? "1 space" : `${spaces} spaces`}`;
}

/**
 * What this device is called in these words: "this phone", or "this iPad" on one (ADR 0177). The
 * caller says, from `device/word.ts`; these words are kept free of the platform so Node can test
 * them.
 */
const HERE = "this phone";

/**
 * A space's own Media's line under its size (ADR 0165): "On this phone · 34 photos, videos and
 * files", or "1 file", as Media on this phone counts one.
 */
export function spaceMediaWords(count: number, here = HERE): string {
  return `On ${here} · ${count === 1 ? "1 file" : `${count} photos, videos and files`}`;
}

/** What a space's own Media's Delete asks (ADR 0165): how much goes, and that it stays in the space. */
export function spaceMediaAsk(title: string, bytes: number, here = HERE): DeleteAsk {
  return {
    title: `Delete ${sizeWords(bytes)} from ${here}?`,
    message: `${title}'s photos, videos and files stay in the space. They come back the next time they're opened.`,
  };
}

/** The select bar's words: "3 selected · 18 MB". */
export function pickedWords(count: number, bytes: number): string {
  return `${count} selected · ${sizeWords(bytes)}`;
}

/** What a Delete asks before it lets go: the alert's title and its line. */
export interface DeleteAsk {
  readonly title: string;
  readonly message: string;
}

/**
 * What a space's Delete asks, or Other's (no title): what goes, and that it is only off this phone
 * and comes back from the server.
 */
export function sectionAsk(
  title: string | undefined,
  count: number,
  bytes: number,
  here = HERE,
): DeleteAsk {
  const one = count === 1;
  const back = one
    ? "It comes back the next time it's opened."
    : "They come back the next time they're opened.";
  if (title === undefined) {
    return {
      title: `Delete ${sizeWords(bytes)} from ${here}?`,
      message: one
        ? `It isn't in a space on ${here}. It comes back from the server if it's opened again.`
        : `These ${count} files aren't in a space on ${here}. They come back from the server if they're opened again.`,
    };
  }
  return {
    title: `Delete ${sizeWords(bytes)} from ${here}?`,
    message: one
      ? `${title}'s file stays in the space. ${back}`
      : `${title}'s ${count} photos, videos and files stay in the space. ${back}`,
  };
}

/** What the select bar's Delete asks: how many go, and where they stay — one space, or several. */
export function pickedAsk(count: number, spaces: readonly string[], here = HERE): DeleteAsk {
  const one = count === 1;
  const title = `Delete ${files(count)} from ${here}?`;
  if (spaces.length === 0) {
    return {
      title,
      message: one
        ? "It comes back from the server if it's opened again."
        : "They come back from the server if they're opened again.",
    };
  }
  const where = spaces.length === 1 ? spaces[0] : "their spaces";
  return {
    title,
    message: one
      ? `It stays in ${where} and comes back the next time it's opened.`
      : `They stay in ${where} and come back the next time they're opened.`,
  };
}

/** The host a server's address names, which is what a person recognises it by. */
export function hostOf(url: string | undefined): string {
  if (url === undefined || url === "") return "This network";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Attachment limits at the right of their row: one size when the three agree, else the smallest
 * and the largest — "100 MB", "25–100 MB" — and the server's own until its ceiling is known.
 */
export function capsWords(caps: AttachmentCaps, ceiling: number | undefined): string {
  const sizes = CAP_KINDS.map((kind) => caps[kind] ?? ceiling).filter(
    (size): size is number => size !== undefined,
  );
  if (sizes.length === 0) return "Server's limit";
  const least = Math.min(...sizes);
  const most = Math.max(...sizes);
  return least === most
    ? formatLimit(least)
    : `${formatLimit(least).replace(" MB", "")}–${formatLimit(most)}`;
}
