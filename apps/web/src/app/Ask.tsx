/**
 * A question from a harness: one card per question in the ask, tappable options, free text
 * where allowed, the default it will take, and the time left (technical-plan M1.4). An ask with
 * several questions is answered as one event, once every question has an answer, because the
 * first answer is the only one the door takes.
 */

import type { Question, QuestionItem } from "@chipschat/core";
import { type QuestionAnswer, QuestionCard } from "@chipschat/ui";
import { useState } from "react";
import { clockTime } from "./time.ts";

export interface Chosen {
  readonly questionId: string;
  readonly values: readonly string[];
  readonly freeText?: string | undefined;
}

export interface AskProps {
  readonly question: Question;
  readonly harnessName: string;
  readonly personName: (id: string) => string;
  readonly busy: boolean;
  readonly now: number;
  readonly onAnswer: (question: Question, answers: readonly Chosen[]) => void;
}

function answered(question: Question, item: QuestionItem, name: (id: string) => string) {
  const done = question.answered;
  if (done === undefined) return undefined;
  const mine = done.answers.find((each) => each.questionId === item.questionId);
  const answer: QuestionAnswer = {
    values: mine?.values ?? [],
    ...(mine?.freeText === undefined ? {} : { freeText: mine.freeText }),
    by: done.by === "system" ? "nobody" : name(done.by),
    at: clockTime(done.at),
    timedOut: done.timedOut,
  };
  return answer;
}

export function Ask(props: AskProps) {
  const { question, busy } = props;
  const [chosen, setChosen] = useState<Chosen[]>([]);
  const remaining =
    question.timeoutAt === undefined
      ? undefined
      : new Date(question.timeoutAt).getTime() - props.now;

  const choose = (item: QuestionItem, answer: { values: string[]; freeText?: string }) => {
    const next = [
      ...chosen.filter((each) => each.questionId !== item.questionId),
      { questionId: item.questionId, values: answer.values, freeText: answer.freeText },
    ];
    if (next.length < question.questions.length) {
      setChosen(next);
      return;
    }
    setChosen([]);
    props.onAnswer(question, next);
  };

  return (
    <div className="ask" data-testid="ask" data-ask={question.askId}>
      {question.questions.map((item) => {
        const local = chosen.find((each) => each.questionId === item.questionId);
        const answer =
          answered(question, item, props.personName) ??
          (local === undefined
            ? undefined
            : {
                values: local.values,
                ...(local.freeText === undefined ? {} : { freeText: local.freeText }),
              });
        return (
          <QuestionCard
            key={item.questionId}
            harnessName={props.harnessName}
            prompt={item.prompt}
            options={item.options.map((option) => ({
              value: option.value,
              label: option.label,
              ...(option.description === undefined ? {} : { description: option.description }),
            }))}
            multiSelect={item.multiSelect}
            allowFreeText={item.allowFreeText}
            {...(item.defaultValue === undefined ? {} : { defaultValue: item.defaultValue })}
            {...(remaining === undefined ? {} : { remainingMs: remaining })}
            onNoAnswer={question.onNoAnswer}
            {...(answer === undefined ? {} : { answer })}
            busy={busy}
            onAnswer={(picked) => choose(item, picked)}
          />
        );
      })}
    </div>
  );
}
