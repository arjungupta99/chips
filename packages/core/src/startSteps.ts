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
  readonly face: CardFace;
} = {
  name: "I don't have one yet",
  sub: "We'll suggest one and show you how to get it",
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
