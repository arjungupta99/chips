/**
 * The question card: a prompt with tappable options, sometimes a place to type, and a
 * default the harness will take if nobody answers. Its presence lowers the tier from Decide
 * now to Review today, and the card says so in words.
 */

import { useId, useState } from "react";
import { formatRemaining } from "../../format.js";
import { Avatar } from "../avatar/avatar.js";
import { Button } from "../button/button.js";
import { Card } from "../card/card.js";
import "./question.css";

export interface QuestionOption {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

export interface QuestionAnswer {
  readonly values: readonly string[];
  readonly freeText?: string;
  readonly by?: string;
  readonly at?: string;
  /** The default was taken because nobody answered in time. */
  readonly timedOut?: boolean;
}

export type NoAnswer = "use_default" | "cancel" | "continue";

export interface QuestionCardProps {
  readonly harnessName: string;
  readonly harnessColor?: string;
  readonly prompt: string;
  readonly options: readonly QuestionOption[];
  readonly multiSelect?: boolean;
  readonly allowFreeText?: boolean;
  readonly defaultValue?: string;
  readonly remainingMs?: number;
  readonly onNoAnswer?: NoAnswer;
  readonly answer?: QuestionAnswer;
  readonly onAnswer?: (answer: { values: string[]; freeText?: string }) => void;
  readonly busy?: boolean;
  readonly className?: string;
}

function whatHappens(onNoAnswer: NoAnswer, harnessName: string): string {
  switch (onNoAnswer) {
    case "use_default":
      return `${harnessName} will take the default`;
    case "cancel":
      return `${harnessName} will stop`;
    case "continue":
      return `${harnessName} will carry on without an answer`;
  }
}

/** `Answered by Arjun · 10:50: 26 September`, or what the harness did when nobody answered. */
export function describeAnswer(
  answer: QuestionAnswer,
  options: readonly QuestionOption[],
  harnessName: string,
): string {
  const chosen = answer.values
    .map((value) => options.find((option) => option.value === value)?.label ?? value)
    .join(", ");
  const said = answer.freeText === undefined ? chosen : `“${answer.freeText}”`;
  if (answer.timedOut === true)
    return `No answer in time · ${harnessName} took the default: ${said}`;
  const who = answer.by === undefined ? "" : ` by ${answer.by}`;
  const when = answer.at === undefined ? "" : ` · ${answer.at}`;
  return `Answered${who}${when}: ${said}`;
}

function Options({
  name,
  labelledBy,
  options,
  chosen,
  multiSelect,
  defaultValue,
  disabled,
  onChoose,
}: {
  readonly name: string;
  readonly labelledBy: string;
  readonly options: readonly QuestionOption[];
  readonly chosen: readonly string[];
  readonly multiSelect: boolean;
  readonly defaultValue: string | undefined;
  readonly disabled: boolean;
  readonly onChoose: (value: string, on: boolean) => void;
}) {
  return (
    <ul className="ui-question__options" aria-labelledby={labelledBy}>
      {options.map((option) => {
        const on = chosen.includes(option.value);
        return (
          <li key={option.value}>
            <label className="ui-question__option" data-on={on ? "true" : undefined}>
              <input
                type={multiSelect ? "checkbox" : "radio"}
                name={name}
                value={option.value}
                checked={on}
                onChange={(event) => onChoose(option.value, event.target.checked)}
                disabled={disabled}
              />
              <span className="ui-question__option-text">
                <span className="ui-question__option-label">
                  {option.label}
                  {option.value === defaultValue && (
                    <span className="ui-question__default">default</span>
                  )}
                </span>
                {option.description !== undefined && (
                  <span className="ui-question__option-description">{option.description}</span>
                )}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function QuestionHead({
  harnessName,
  harnessColor,
  remainingMs,
}: {
  readonly harnessName: string;
  readonly harnessColor: string | undefined;
  readonly remainingMs: number | undefined;
}) {
  return (
    <header className="ui-question__head">
      <Avatar
        name={harnessName}
        kind="harness"
        size="xs"
        {...(harnessColor === undefined ? {} : { color: harnessColor })}
      />
      <b>{harnessName} has a question</b>
      {remainingMs !== undefined && (
        <span className="ui-question__expiry">
          {remainingMs <= 0 ? "time's up" : formatRemaining(remainingMs)}
        </span>
      )}
    </header>
  );
}

function Hint({
  remainingMs,
  onNoAnswer,
  harnessName,
}: {
  readonly remainingMs: number | undefined;
  readonly onNoAnswer: NoAnswer;
  readonly harnessName: string;
}) {
  const then = whatHappens(onNoAnswer, harnessName);
  const inTime =
    remainingMs !== undefined && remainingMs > 0 ? ` in ${formatRemaining(remainingMs)}` : "";
  return <span className="ui-question__hint">{`If nobody answers${inTime}, ${then}.`}</span>;
}

export function QuestionCard({
  harnessName,
  harnessColor,
  prompt,
  options,
  multiSelect = false,
  allowFreeText = false,
  defaultValue,
  remainingMs,
  onNoAnswer = "use_default",
  answer,
  onAnswer,
  busy = false,
  className,
}: QuestionCardProps) {
  const id = useId();
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const [text, setText] = useState("");
  const disabled = onAnswer === undefined || busy;
  const canAnswer = !disabled && (chosen.length > 0 || text.trim() !== "");

  const choose = (value: string, on: boolean) =>
    setChosen((current) => {
      if (!multiSelect) return on ? [value] : [];
      return on ? [...current, value] : current.filter((v) => v !== value);
    });

  const submit = () => {
    if (!canAnswer || onAnswer === undefined) return;
    const trimmed = text.trim();
    onAnswer({ values: [...chosen], ...(trimmed === "" ? {} : { freeText: trimmed }) });
  };

  return (
    <Card
      as="article"
      aria-label={`Question from ${harnessName}`}
      tone={answer === undefined ? "ask" : "default"}
      padding="none"
      className={className === undefined ? "ui-question" : `ui-question ${className}`}
      data-answered={answer === undefined ? "false" : "true"}
    >
      <QuestionHead
        harnessName={harnessName}
        harnessColor={harnessColor}
        remainingMs={answer === undefined ? remainingMs : undefined}
      />

      <p className="ui-question__prompt" id={`${id}-prompt`}>
        {prompt}
      </p>

      {answer !== undefined ? (
        <p
          className="ui-question__outcome"
          data-timed-out={answer.timedOut === true ? "true" : undefined}
        >
          {describeAnswer(answer, options, harnessName)}
        </p>
      ) : (
        <>
          <Options
            name={`${id}-option`}
            labelledBy={`${id}-prompt`}
            options={options}
            chosen={chosen}
            multiSelect={multiSelect}
            defaultValue={defaultValue}
            disabled={disabled}
            onChoose={choose}
          />
          {allowFreeText && (
            <label className="ui-question__free">
              <span className="ui-visually-hidden">Or type an answer</span>
              <textarea
                rows={2}
                placeholder="Or type an answer…"
                value={text}
                onChange={(event) => setText(event.target.value)}
                disabled={disabled}
              />
            </label>
          )}
          <footer className="ui-question__foot">
            <Hint remainingMs={remainingMs} onNoAnswer={onNoAnswer} harnessName={harnessName} />
            <Button variant="primary" onClick={submit} disabled={!canAnswer}>
              Answer
            </Button>
          </footer>
        </>
      )}
    </Card>
  );
}
