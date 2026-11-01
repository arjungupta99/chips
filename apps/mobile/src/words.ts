/**
 * What an ask's card says about it, in words.
 *
 * The desktop's are in `apps/web/src/app/useDesktop.ts` (`askTitle`, `askBody`), where they are
 * the shell's notification copy. The phone needs the same sentences on the card itself — a push banner and a card are
 * the same thing here, which is the whole point of a phone — so they are pure functions over
 * the snapshot, kept together, and tested under Vitest.
 *
 * They deliberately do not import from the web app. Nothing may, and a sentence is cheap to
 * copy; what would be expensive is the phone and the desktop disagreeing about what an ask is
 * called, so `words.vitest.ts` pins the exact strings.
 */

import type { Directory, NeedsYouItem, Snapshot } from "@chipschat/core";
import { askDetail, nameOf } from "@chipschat/core";

/** What the item's kind means the harness did, as the card's first line finishes it. */
const VERB: Readonly<Record<NeedsYouItem["kind"], string>> = {
  approval: "asks",
  question: "has a question",
  summary: "finished",
  failure: "stopped",
  checkpoint: "reached a checkpoint",
};

/** `Scout asks`: an approval's question is the card's headline, so this is only who. */
export function askHeading(item: NeedsYouItem, directory: Directory): string {
  return `${nameOf(directory, item.harnessId)} ${VERB[item.kind]}`;
}

/** "Scout needs a decision" — the one line a banner gets, and the detail screen's title. */
export function askTitle(item: NeedsYouItem, directory: Directory): string {
  return `${nameOf(directory, item.harnessId)} needs a decision`;
}

/**
 * The action itself, which is what the two buttons are about: the item's title (an approval's
 * question, ADR 0142), and after it what a yes does, else the preview, when there is one.
 */
export function askBody(item: NeedsYouItem, snapshot: Snapshot): string {
  const approval = approvalFor(item, snapshot);
  const detail = approval === undefined ? undefined : askDetail(approval);
  return detail === undefined ? item.title : `${item.title} — ${detail}`;
}

/**
 * When an ask lapses and what lapsing does, as one sentence (ADR 0142): `Denied in 15 min if you
 * don't answer`. A question has no fallback to name, so it only says when.
 */
export function lapseWords(left: string, fallback: "deny" | "allow" | undefined): string {
  if (left === "expired") return "Expired";
  if (fallback === undefined) return `Lapses ${left}`;
  return `${fallback === "allow" ? "Goes ahead" : "Denied"} ${left} if you don't answer`;
}

/**
 * The chain that led to a lane's item — `Arjun → Scout → Ledger` — the specialist ending it
 * though the lane's own trail does not name it. Shown so a decision on a routed specialist is
 * not mistaken for one on a harness a person routed to themselves. A hop and the specialist wear
 * the lane's names for them when it has them, so a Space's hand-down reads
 * `Arjun → Chess Game → Engineer` and not the one harness three times.
 */
export function laneTrail(item: NeedsYouItem, directory: Directory): string | undefined {
  if (item.trail === undefined || item.trail.length === 0) return undefined;
  const names = item.trail.map((hop) => hop.label ?? nameOf(directory, hop.participantId));
  return [...names, item.laneLabel ?? nameOf(directory, item.harnessId)].join(" → ");
}

/** The approval an item stands for, from its space's runs. */
export function approvalFor(item: NeedsYouItem, snapshot: Snapshot) {
  if (item.kind !== "approval") return undefined;
  return snapshot.model.spaces
    .find((space) => space.id === item.spaceId)
    ?.runs.flatMap((run) => run.approvals)
    .find((approval) => approval.approvalId === item.id);
}

/** Why the server turned a decision or an answer away, as a sentence under the card (core's). */
export { refusalWords } from "@chipschat/core";

/** The question an item stands for, for the ask form. */
export function questionFor(item: NeedsYouItem, snapshot: Snapshot) {
  if (item.kind !== "question") return undefined;
  return snapshot.model.spaces
    .find((space) => space.id === item.spaceId)
    ?.runs.flatMap((run) => run.questions)
    .find((question) => question.askId === item.id);
}

/**
 * Where the ask is, when it is somewhere the reader cannot go. An ADR 0042 glimpse: they were
 * named on an approval raised in a space they are not in, and all that reached them is the card.
 */
export const OUTSIDE = "In a space you're not in";
