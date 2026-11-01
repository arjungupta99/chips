/**
 * Send feedback (ADR 0237): Chips takes feedback prompts, not pull requests, and a prompt is an
 * issue on the repository's form, `.github/ISSUE_TEMPLATE/feedback-prompt.yml`. You on the phone,
 * the web and the Mac has a row for it, and its sheet offers two ways: write it with the Main
 * agent, which puts a line in the Main space's field asking for help, or write it on GitHub, which
 * opens the form with the Chips version filled in. Chips sends nothing either way. In core so
 * every app says the same words and opens the same link.
 */

import { type Directory, harnessOf, isRemoved, nameOf } from "./events.js";
import type { WorkspaceModel } from "./model/types.js";
import { leadOf } from "./rooms.js";

/**
 * The switch (`docs/proposals/feedback-prompts.md`, Phase 4): on since the repository went public
 * on 1 November 2026. Before that it was off, so no build drew a row that opened a 404.
 */
export const FEEDBACK_SHOWN = true;

/** The repository's new issue page, where the form is. */
export const FEEDBACK_FORM = "https://github.com/arjungupta99/chips/issues/new";

/** The form's file, which a link names it by. */
export const FEEDBACK_TEMPLATE = "feedback-prompt.yml";

/**
 * The form with its Chips version box filled in, as a person would read it out: "Chips 0.0.0
 * (202610190718) · b888e96 · iOS 26.1". The other boxes are the person's, on GitHub.
 */
export function feedbackLink(version: string): string {
  return `${FEEDBACK_FORM}?template=${FEEDBACK_TEMPLATE}&version=${encodeURIComponent(version)}`;
}

export const FEEDBACK_ROW = "Send feedback";
export const FEEDBACK_ROW_SUB = "Tell the people who make Chips what you'd change.";
export const FEEDBACK_TITLE = "Feedback for Chips";
export const FEEDBACK_ON_GITHUB = "Write it on GitHub";
export const FEEDBACK_SENDS_NOTHING =
  "Chips sends nothing. GitHub opens with your Chips version filled in, and nothing is public until you post it there.";

/** What the Main space's field holds, not sent, for the agent to help write a prompt. */
export const FEEDBACK_ASK =
  "Read https://chipschat.ai/feedback.md and help me write a feedback prompt for Chips.";

/** The first pick: "Write it with Milo". */
export function feedbackWithWords(agent: string): string {
  return `Write it with ${agent}`;
}

/** A Main agent a prompt can be written with, and the Main space it speaks in. */
export interface FeedbackAgent {
  readonly id: string;
  readonly name: string;
  readonly spaceId: string;
}

/**
 * The Main agent to write a prompt with: of the Main spaces this person is in and may write in,
 * the one that spoke last. None when there's no such space, and then the row opens GitHub
 * straight away.
 */
export function feedbackAgent(
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
): FeedbackAgent | undefined {
  const found = model.spaces
    .filter((space) => space.state === "open" && space.members.includes(selfId))
    .flatMap((space) => {
      const id = leadOf(space, directory);
      if (id === undefined || directory[id]?.archived === true) return [];
      if (isRemoved(directory, id) || isRemoved(directory, harnessOf(directory, id))) return [];
      return [{ id, spaceId: space.id, at: space.lastActivityAt ?? "" }];
    })
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  return found === undefined
    ? undefined
    : { id: found.id, name: nameOf(directory, found.id), spaceId: found.spaceId };
}
