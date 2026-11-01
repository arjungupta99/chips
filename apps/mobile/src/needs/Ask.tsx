/**
 * A question from a harness: one card per question in the ask, tappable options, free text
 * where allowed, the default it will take, and the time left.
 *
 * An ask with several questions is answered as one event, once every question has an answer,
 * because the first answer is the only one the door takes. A question with nothing picked and
 * nothing typed has no answer, so a field typed into and emptied again does not send a blank.
 *
 * It is drawn in the room, inside the ask's own card under what the harness said, since 15
 * September 2026 (Arjun): the form on a screen of its own showed the prompt — *Choose one, or
 * reply in your own words* — and none of the plan it was asking about. There it is `framed`
 * false, since the card is the frame and its head already says who is asking. Short options stand
 * in a row, the way the buttons under a chat message do.
 */

import type { Question, QuestionItem } from "@chipschat/core";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Choices } from "../ui/Choices";
import { Field } from "../ui/Field";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { timeLeft } from "../ui/when";

export interface Chosen {
  readonly questionId: string;
  readonly values: readonly string[];
  readonly freeText?: string | undefined;
}

/** What happens if nobody answers, in the words a person can act on. */
function fallbackWords(question: Question): string {
  switch (question.onNoAnswer) {
    case "use_default":
      return "it takes its own default";
    case "cancel":
      return "the run stops";
    default:
      return "it carries on without an answer";
  }
}

/** Whether a question has an answer yet: something picked, or something typed. */
function isAnswer(chosen: Chosen): boolean {
  return chosen.values.length > 0 || (chosen.freeText ?? "").trim() !== "";
}

/** Two or three options of a word or two, and nothing to explain: a row of buttons. */
function fitsARow(item: QuestionItem): boolean {
  return (
    item.options.length <= 3 &&
    item.options.every((option) => option.label.length <= 12 && option.description === undefined)
  );
}

export function Ask({
  question,
  harnessName,
  busy,
  now,
  onAnswer,
  framed = true,
  refused,
}: {
  readonly question: Question;
  readonly harnessName: string;
  readonly busy: boolean;
  readonly now: number;
  readonly onAnswer: (answers: readonly Chosen[]) => void;
  /** On a screen of its own, each question is a card; inside the ask's card in the room, not. */
  readonly framed?: boolean;
  /** Why the server turned the last answer away, in words a person reads. */
  readonly refused?: string | undefined;
}) {
  const palette = usePalette();
  const [chosen, setChosen] = useState<readonly Chosen[]>([]);
  const left = timeLeft(question.timeoutAt, now);
  const answered = question.answered !== undefined;
  const complete =
    chosen.filter(isAnswer).length === question.questions.length && question.questions.length > 0;

  const pick = (item: QuestionItem, next: Chosen) =>
    setChosen((was) => [...was.filter((each) => each.questionId !== item.questionId), next]);

  return (
    <View style={styles.body}>
      {framed ? (
        <Text style={[styles.who, { color: palette.ink3 }]}>{harnessName} is asking</Text>
      ) : null}
      {question.questions.map((item) => (
        <One
          key={item.questionId}
          item={item}
          answer={chosen.find((each) => each.questionId === item.questionId)}
          disabled={busy || answered}
          framed={framed}
          onPick={(next) => pick(item, next)}
        />
      ))}
      {left === undefined ? null : (
        <Text style={[styles.note, { color: left === "expired" ? palette.red : palette.ink3 }]}>
          {left === "expired"
            ? `It lapsed, so ${fallbackWords(question)}.`
            : `Lapses ${left} — then ${fallbackWords(question)}.`}
        </Text>
      )}
      {answered ? (
        <Text style={[styles.note, { color: palette.ink3 }]} testID="already-answered">
          Answered already.
        </Text>
      ) : (
        <Button
          label="Send the answer"
          variant="primary"
          busy={busy}
          disabled={!complete}
          onPress={() => onAnswer(chosen)}
        />
      )}
      {refused === undefined || answered || busy ? null : (
        <Text style={[styles.note, { color: palette.red }]} testID="answer-refused">
          {refused}
        </Text>
      )}
    </View>
  );
}

function One({
  item,
  answer,
  disabled,
  framed,
  onPick,
}: {
  readonly item: QuestionItem;
  readonly answer: Chosen | undefined;
  readonly disabled: boolean;
  readonly framed: boolean;
  readonly onPick: (answer: Chosen) => void;
}) {
  const palette = usePalette();
  const values = answer?.values ?? [];
  const choose = (value: string) => {
    const next = item.multiSelect
      ? values.includes(value)
        ? values.filter((each) => each !== value)
        : [...values, value]
      : [value];
    onPick({
      questionId: item.questionId,
      values: next,
      ...(answer?.freeText === undefined ? {} : { freeText: answer.freeText }),
    });
  };

  const body = (
    <>
      <Text style={[styles.prompt, { color: palette.ink }]}>{item.prompt}</Text>
      <Choices
        label={item.prompt}
        options={item.options.map((option) => ({
          value: option.value,
          label: option.label,
          ...(option.description === undefined ? {} : { description: option.description }),
        }))}
        chosen={values}
        onChoose={choose}
        many={item.multiSelect}
        row={!framed && fitsARow(item)}
        disabled={disabled}
      />
      {item.allowFreeText ? (
        <Field
          label="Or say it in your own words"
          value={answer?.freeText ?? ""}
          onChange={(text) => onPick({ questionId: item.questionId, values, freeText: text })}
          lines={2}
          disabled={disabled}
          testID={`free-${item.questionId}`}
        />
      ) : null}
      {item.defaultValue === undefined ? null : (
        <Text style={[styles.note, { color: palette.ink3 }]}>
          It will take “{labelOf(item, item.defaultValue)}” if nobody answers.
        </Text>
      )}
    </>
  );
  return framed ? <Card>{body}</Card> : <View style={styles.one}>{body}</View>;
}

function labelOf(item: QuestionItem, value: string): string {
  return item.options.find((option) => option.value === value)?.label ?? value;
}

const styles = StyleSheet.create({
  body: { gap: SPACE.md },
  one: { gap: SPACE.sm },
  who: { fontSize: TEXT.sm },
  prompt: { fontSize: TEXT.body, fontWeight: "600", lineHeight: TEXT.body * 1.45 },
  note: { fontSize: TEXT.sm },
});
