/**
 * The written steps for somebody with no agent yet (ADR 0290), built to option A of the "Chips
 * From Zero" mock: one row more in the gallery, one question about what they already have, then
 * their agent maker's own install and sign-in, which they run in Terminal before they come back
 * and press Connect.
 *
 * Chips names no agent itself (ADR 0171): the answers, what is suggested and the steps all come
 * from the docs' cards, each card's `start`. Chips never runs a step: the person does, in their
 * own terminal, with the maker's own tools.
 */

import type { Connector, StartStep } from "@chipschat/protocol";
import type { CardFace } from "./connect.js";

/** The gallery's row for somebody with none of its agents. */
export const NO_AGENT_YET: {
  readonly name: string;
  readonly sub: string;
  /** The phone's line: its row opens the site, since the steps run on a computer. */
  readonly onSite: string;
  readonly face: CardFace;
} = {
  name: "I don't have one yet",
  sub: "We'll suggest one and show you how to get it",
  onSite: "chipschat.ai/setup says which one to get and how",
  // A new one growing, on the gold ground (`--icon-ground-2`), as the mock's row is.
  face: { icon: "sprout", ground: 9 },
};

/** The one question, asked before anything is suggested. */
export const START_QUESTION = {
  title: "Which of these do you already have?",
  lede: "An agent is the AI that does the work, and Chips is where you talk to it. Tell us what you already have and we'll suggest one.",
} as const;

/** One answer to the question: the card it leads to, and every step to get it. */
export interface StartAnswer {
  /** To tell answers apart: the card's id, and `<id>:none` for the answer for somebody with none. */
  readonly key: string;
  readonly card: Connector;
  readonly answer: string;
  readonly suggest: string;
  /** In order: for the answer for somebody with none, making an account first, then the card's. */
  readonly steps: readonly StartStep[];
}

/**
 * The question's answers: each card with written steps, in the docs' order, then the answer for
 * somebody with none of them, which the first card that has one gives. Nothing when no card has
 * steps, and then the gallery shows no row for it.
 */
export function startAnswers(cards: readonly Connector[] | undefined): readonly StartAnswer[] {
  const listed = cards ?? [];
  const answers: StartAnswer[] = listed.flatMap((card) =>
    card.start === undefined
      ? []
      : [
          {
            key: card.id,
            card,
            answer: card.start.answer,
            suggest: card.start.suggest,
            steps: card.start.steps,
          },
        ],
  );
  const forNone = listed.find((card) => card.start?.none !== undefined);
  const none = forNone?.start?.none;
  if (forNone?.start === undefined || none === undefined) return answers;
  return [
    ...answers,
    {
      key: `${forNone.id}:none`,
      card: forNone,
      answer: none.answer,
      suggest: none.suggest,
      steps: [...none.first, ...forNone.start.steps],
    },
  ];
}

/** Whether an answer is the one for somebody with none: it wears the row's face, not the card's. */
export function isNoneAnswer(answer: StartAnswer): boolean {
  return answer.key.endsWith(":none");
}

/** The steps' heading. */
export function startTitle(name: string): string {
  return `Get ${name}, then come back`;
}

/** Where the steps run: on Chips for Mac, this Mac; in a browser, wherever the agent will. */
export function startWhere(onMac: boolean): string {
  return onMac
    ? "These steps run in Terminal on this Mac. To open Terminal, press ⌘ Space and type Terminal."
    : "These steps run in a terminal on the computer you'll run the agent on.";
}

/** A step's page, said as the button that opens it: "Open chatgpt.com". */
export function openWords(url: string): string {
  try {
    return `Open ${new URL(url).hostname.replace(/^www\./, "")}`;
  } catch {
    return "Open its page";
  }
}

/** The button under the steps, which goes on to the card's own Connect. */
export function startConnect(name: string): string {
  return `Connect ${name}`;
}

/** The same steps on the site, for reading on another screen. */
export const START_PAGE = {
  // Not /start/, which is the docs' Start here.
  url: "https://chipschat.ai/setup/",
  before: "These steps are also on ",
  link: "chipschat.ai/setup",
} as const;

/**
 * The phone's way in for somebody with nothing set up yet (ADR 0290's addendum): a row on its first
 * screen, and a page that hands the setup page to their computer, since the phone runs no Chips.
 */
export const START_ON_COMPUTER = {
  row: "Nothing set up yet?",
  go: "Start",
  title: "Chips starts on your computer",
  lede: "Chips runs on a Mac or a Linux computer, and this phone connects to it. Open this link on your computer and it walks you through the rest.",
  send: "Send the link to myself",
  handoff: "With Handoff, Copy puts it on your Mac's clipboard too.",
  scanAfter: "When your computer shows a QR code, come back and scan it.",
  wait: "Look around while you wait",
} as const;

/** Where one step stands while Chips for Mac follows along (option B). */
export type FollowedState = "done" | "now" | "later";

export interface FollowedStep {
  readonly state: FollowedState;
  /** Chips can see this step done by itself: it is watched while it is the one under way. */
  readonly watched: boolean;
  /** What a step done says under it, as Chips saw it: nothing for one the person marked. */
  readonly saw: string | undefined;
}

/** What Chips for Mac has seen of the steps: the programs on its PATH and the agent's sign-in. */
export interface StepsSeen {
  readonly programs: ReadonlySet<string>;
  /** Whether the card's agent says it is signed in; unknown until it answers, or where it can't. */
  readonly signedIn: boolean | undefined;
  /** The steps Chips can't see that the person said are done, by index. */
  readonly marked: ReadonlySet<number>;
}

export const FOLLOW_WORDS = {
  lede: "This page follows along: each step ticks itself off once Chips sees it done.",
  watching: "Chips is watching for this",
  installed: "Chips sees it on this Mac",
  signedIn: "Signed in",
  mark: "I've done this",
  ready: "All done. Connecting…",
} as const;

/**
 * Where each step stands (the "Chips From Zero" mock's option B). A step Chips can see is done when
 * its program is on this Mac or its agent says it is signed in. One it can't see, such as making an
 * account, is done when the person says so, or when a step after it is done, since that one needed
 * it. The first not done is under way; the rest wait.
 */
export function followSteps(
  steps: readonly StartStep[],
  seen: StepsSeen,
): { readonly steps: readonly FollowedStep[]; readonly ready: boolean } {
  const sawDone = steps.map((step) => {
    if (step.done?.program !== undefined && seen.programs.has(step.done.program)) {
      return FOLLOW_WORDS.installed;
    }
    if (step.done?.signedIn === true && seen.signedIn === true) return FOLLOW_WORDS.signedIn;
    return undefined;
  });
  const lastSeen = sawDone.findLastIndex((saw) => saw !== undefined);
  const done = steps.map(
    (step, at) =>
      sawDone[at] !== undefined ||
      (step.done === undefined && (seen.marked.has(at) || at < lastSeen)),
  );
  const now = done.indexOf(false);
  const followed = steps.map((step, at) => ({
    state:
      done[at] === true ? ("done" as const) : at === now ? ("now" as const) : ("later" as const),
    watched: step.done !== undefined,
    saw: sawDone[at],
  }));
  // Ready only where Chips saw something itself: a guide of steps it can't see waits for Connect.
  const ready = now === -1 && steps.some((step) => step.done !== undefined);
  return { steps: followed, ready };
}

/** The programs the steps put on the PATH, to look for. */
export function stepPrograms(steps: readonly StartStep[]): readonly string[] {
  return [...new Set(steps.flatMap((step) => step.done?.program ?? []))];
}

/** Whether any step waits on the agent's sign-in. */
export function stepsSignIn(steps: readonly StartStep[]): boolean {
  return steps.some((step) => step.done?.signedIn === true);
}
