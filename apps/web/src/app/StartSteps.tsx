/**
 * The written steps for somebody with no agent yet (ADR 0290), as option A of the "Chips From Zero"
 * mock draws them (https://claude.ai/artifact/1ZLs4sBMx87W7kxP1Xui1s):
 *
 * 1. **The question.** "Which of these do you already have?", answered from the docs' cards: one
 *    answer each, then Neither of those, and what Chips suggests for each.
 * 2. **The steps.** The maker's own install and sign-in, each under Run in Terminal, and an account
 *    to make first for somebody with neither. The person runs them; Chips never does. Connect then
 *    goes on to the card's own page, as picking the card in the gallery does.
 */

import {
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
} from "@chipschat/core";
import type { Connector, StartStep } from "@chipschat/protocol";
import { Avatar, Button, Icon } from "@chipschat/ui";
import { CardLinks, CopyBox } from "./ConnectBridge.tsx";

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

/** One step: what to do, and the line to run or the page to open for it. */
function Step(props: { readonly step: StartStep; readonly at: number }) {
  const { step } = props;
  return (
    <li>
      <span className="start-step-no" aria-hidden="true">
        {props.at + 1}
      </span>
      <div className="start-step">
        <b>{step.says}</b>
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
      </div>
    </li>
  );
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
  readonly onConnect: (card: Connector) => void;
  readonly onBack: () => void;
}) {
  const { card } = props.answer;
  return (
    <section className="start-guide" data-testid="start-guide" data-card={card.id}>
      <div className="new-space-head">
        <Avatar name={card.name} kind="harness" size="sm" />
        <div className="join-head">
          <h2 id={props.titleId}>{startTitle(card.name)}</h2>
          <small>{card.line}</small>
        </div>
      </div>
      <p className="start-where">{startWhere(props.onMac)}</p>
      <ol className="start-steps">
        {props.answer.steps.map((step, at) => (
          <Step key={step.says} step={step} at={at} />
        ))}
      </ol>
      <Button variant="primary" onClick={() => props.onConnect(card)} data-testid="start-connect">
        {startConnect(card.name)}
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
