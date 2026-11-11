/**
 * The written steps for somebody with no agent yet (ADR 0290), as option A of the "Chips From Zero"
 * mock draws them (https://claude.ai/artifact/1ZLs4sBMx87W7kxP1Xui1s):
 *
 * 1. **The question.** "Which of these do you already have?", answered from the docs' cards: one
 *    answer each, then Neither of those, and what Chips suggests for each.
 * 2. **The steps.** The maker's own install and sign-in, each under Run in Terminal, and an account
 *    to make first for somebody with neither. The person runs them; Chips never does. Connect then
 *    goes on to the card's own page, as picking the card in the gallery does.
 * 3. **Following along** (option B, Chips for Mac only). Each step ticks itself off once Chips sees
 *    it done, by looking: the program it installs on this Mac's PATH, or the agent's own status
 *    command saying it is signed in. The one under way says Chips is watching for it. When the last
 *    ticks off while the page is open, Connect goes on by itself and starts.
 */

import {
  FOLLOW_WORDS,
  type FollowedStep,
  followSteps,
  isNoneAnswer,
  NO_AGENT_YET,
  openWords,
  START_PAGE,
  START_QUESTION,
  type StartAnswer,
  startAnswers,
  startConnect,
  startTitle,
  startWhere,
  stepPrograms,
  stepsSignIn,
} from "@chipschat/core";
import type { Connector, StartStep } from "@chipschat/protocol";
import { Avatar, Button, Icon } from "@chipschat/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { desktop } from "../native.ts";
import { CardLinks, CopyBox } from "./ConnectBridge.tsx";

/** How often Chips looks again while it follows along, beside each time the window comes back. */
const LOOK_EVERY_MS = 3000;
/** The moment between the last tick and Connect, so the tick is seen. */
const ON_TO_CONNECT_MS = 900;

/** The way back, under each of the two. */
function Back(props: { readonly onBack: () => void; readonly testId: string }) {
  return (
    <button type="button" className="join-link" data-testid={props.testId} onClick={props.onBack}>
      Back
    </button>
  );
}

/** An answer's face: the card's, or the gallery row's for somebody with none. */
function AnswerFace(props: { readonly answer: StartAnswer }) {
  return isNoneAnswer(props.answer) ? (
    <Avatar name={NO_AGENT_YET.name} kind="harness" icon={NO_AGENT_YET.face} size="sm" />
  ) : (
    <Avatar name={props.answer.card.name} kind="harness" size="sm" />
  );
}

/** The question, and an answer for each card with steps. */
export function StartQuestion(props: {
  readonly titleId: string;
  readonly cards: readonly Connector[] | undefined;
  readonly onAnswer: (answer: StartAnswer) => void;
  readonly onBack: () => void;
}) {
  return (
    <section className="start-question" data-testid="start-question">
      <h2 id={props.titleId}>{START_QUESTION.title}</h2>
      <p className="join-lede">{START_QUESTION.lede}</p>
      <div className="start-answers">
        {startAnswers(props.cards).map((answer) => (
          <button
            type="button"
            key={answer.key}
            className="join-card none"
            data-testid={`start-answer-${answer.key}`}
            onClick={() => props.onAnswer(answer)}
          >
            <AnswerFace answer={answer} />
            <b>{answer.answer}</b>
            <small>{answer.suggest}</small>
            <Icon name="next" size={14} className="join-card-go" />
          </button>
        ))}
      </div>
      <Back onBack={props.onBack} testId="start-question-back" />
    </section>
  );
}

/**
 * One step: what to do, and the line to run or the page to open for it. Followed along, it says
 * where it stands: done, with what Chips saw, its line folded away; under way, watched for or with
 * I've done this where Chips can't see it; or waiting.
 */
function Step(props: {
  readonly step: StartStep;
  readonly at: number;
  readonly followed?: FollowedStep | undefined;
  readonly onMark?: (() => void) | undefined;
}) {
  const { step, followed } = props;
  const state = followed?.state;
  return (
    <li className={state === undefined ? undefined : `followed ${state}`} data-state={state}>
      <span className="start-step-no" aria-hidden="true">
        {state === "done" ? <Icon name="check" size={12} /> : props.at + 1}
      </span>
      <div className="start-step">
        <b>{step.says}</b>
        {state === "done" && followed?.saw !== undefined && (
          <small className="start-step-saw">{followed.saw}</small>
        )}
        <div className="start-step-do">
          <div>
            {step.line !== undefined && (
              <CopyBox text={step.line} testId={`start-step-${props.at}`} block run />
            )}
            {step.open !== undefined && (
              <a
                className="start-open"
                href={step.open}
                target="_blank"
                rel="noreferrer"
                data-testid={`start-open-${props.at}`}
              >
                {openWords(step.open)}
              </a>
            )}
            {state === "now" && followed?.watched === true && (
              <p className="start-watching" data-testid={`start-watching-${props.at}`}>
                {FOLLOW_WORDS.watching}
              </p>
            )}
            {state === "now" && followed?.watched === false && (
              <button
                type="button"
                className="join-link start-mark"
                data-testid={`start-mark-${props.at}`}
                onClick={props.onMark}
              >
                {FOLLOW_WORDS.mark}
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * Following along on Chips for Mac: what it has seen of the steps, looked at again every few
 * seconds and whenever the window comes back, until they are all done. Nothing in a browser, or
 * from a shell that can't look.
 */
/** What this Mac says of the steps once: the programs found, and the agent's sign-in. */
async function lookOnce(
  programs: readonly string[],
  cardId: string | undefined,
): Promise<{ programs: Set<string>; signedIn: boolean | undefined } | undefined> {
  const shell = await desktop().catch(() => undefined);
  if (shell?.programsHere === undefined) return undefined;
  const [found, signedIn] = await Promise.all([
    programs.length === 0 ? [] : shell.programsHere(programs),
    cardId === undefined ? undefined : shell.signedInHere?.(cardId),
  ]);
  return found === undefined ? undefined : { programs: new Set(found), signedIn };
}

function useFollow(answer: StartAnswer, onMac: boolean) {
  const programs = stepPrograms(answer.steps).join(" ");
  const asksSignIn = stepsSignIn(answer.steps);
  const cardId = answer.card.id;
  const [seen, setSeen] = useState<{ programs: Set<string>; signedIn: boolean | undefined }>();
  const [marked, setMarked] = useState<ReadonlySet<number>>(new Set());
  const [looking, setLooking] = useState(true);
  useEffect(() => {
    if (!onMac || !looking) return;
    let live = true;
    const look = async () => {
      const now = await lookOnce(
        programs === "" ? [] : programs.split(" "),
        asksSignIn ? cardId : undefined,
      );
      if (live && now !== undefined) setSeen(now);
    };
    void look();
    const every = window.setInterval(() => void look(), LOOK_EVERY_MS);
    window.addEventListener("focus", look);
    return () => {
      live = false;
      window.clearInterval(every);
      window.removeEventListener("focus", look);
    };
  }, [onMac, looking, programs, asksSignIn, cardId]);
  const followed = seen === undefined ? undefined : followSteps(answer.steps, { ...seen, marked });
  const ready = followed?.ready === true;
  useEffect(() => {
    if (ready) setLooking(false);
  }, [ready]);
  const mark = useCallback((at: number) => setMarked((was) => new Set([...was, at])), []);
  return { followed, mark };
}

/**
 * The steps for an answer, then Connect, which opens the card's own page: on Chips for Mac, its
 * Connect runs the line here.
 */
export function StartGuide(props: {
  readonly titleId: string;
  readonly answer: StartAnswer;
  /** Chips for Mac, where the steps run in this Mac's Terminal. */
  readonly onMac: boolean;
  /** Connect: `start` when the steps followed along and saw them all done, so it starts too. */
  readonly onConnect: (card: Connector, start?: boolean) => void;
  readonly onBack: () => void;
}) {
  const { card } = props.answer;
  const { followed, mark } = useFollow(props.answer, props.onMac);
  // On by itself only where the last step ticked off while the page was open: steps all done at
  // the first look, as they are on coming Back, wait for Connect.
  const seenUndone = useRef(false);
  const [going, setGoing] = useState(false);
  const { onConnect } = props;
  useEffect(() => {
    if (followed === undefined) return;
    if (!followed.ready) {
      seenUndone.current = true;
      return;
    }
    if (!seenUndone.current) return;
    setGoing(true);
    const timer = window.setTimeout(() => onConnect(card, true), ON_TO_CONNECT_MS);
    return () => window.clearTimeout(timer);
  }, [followed, card, onConnect]);
  return (
    <section className="start-guide" data-testid="start-guide" data-card={card.id}>
      <div className="new-space-head">
        <Avatar name={card.name} kind="harness" size="sm" />
        <div className="join-head">
          <h2 id={props.titleId}>{startTitle(card.name)}</h2>
          <small>{card.line}</small>
        </div>
      </div>
      <p className="start-where">
        {startWhere(props.onMac)}
        {followed === undefined ? null : ` ${FOLLOW_WORDS.lede}`}
      </p>
      <ol className={followed === undefined ? "start-steps" : "start-steps following"}>
        {props.answer.steps.map((step, at) => (
          <Step
            key={step.says}
            step={step}
            at={at}
            followed={followed?.steps[at]}
            onMark={() => mark(at)}
          />
        ))}
      </ol>
      <Button
        variant="primary"
        disabled={going}
        onClick={() => props.onConnect(card)}
        data-testid="start-connect"
      >
        {going ? FOLLOW_WORDS.ready : startConnect(card.name)}
      </Button>
      <p className="start-fine">
        {START_PAGE.before}
        <a href={START_PAGE.url} target="_blank" rel="noreferrer">
          {START_PAGE.link}
        </a>
        .
      </p>
      {card.whose !== undefined && (
        <p className="join-note">
          {card.whose}
          <CardLinks card={card} />
        </p>
      )}
      <Back onBack={props.onBack} testId="start-guide-back" />
    </section>
  );
}
