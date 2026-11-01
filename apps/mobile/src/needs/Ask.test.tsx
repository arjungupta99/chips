/**
 * A question from a harness. The rule that matters is that an ask with more than one question
 * goes as one answer, once every question has one: the first answer through the door is the
 * only one taken, so a half-filled form sent early is a half-answered ask for ever.
 */

import type { Question } from "@chipschat/core";
import { render, screen, userEvent } from "@testing-library/react-native";
import { Ask, type Chosen } from "./Ask";

function question(over: Partial<Question> = {}): Question {
  return {
    askId: "ask_1",
    runId: "run_1",
    spaceId: "sp_1",
    harnessId: "har_scout",
    askedAt: "2026-09-07T10:00:00.000Z",
    onNoAnswer: "use_default",
    questions: [
      {
        questionId: "q1",
        prompt: "Which supplier?",
        options: [
          { value: "northwind", label: "Northwind" },
          { value: "acme", label: "Acme", description: "The cheaper one" },
        ],
        multiSelect: false,
        allowFreeText: false,
      },
    ],
    ...over,
  };
}

function view(
  over: Partial<Question> = {},
  busy = false,
  extra: { framed?: boolean; refused?: string } = {},
) {
  const sent: (readonly Chosen[])[] = [];
  const element = (
    <Ask
      question={question(over)}
      harnessName="Scout"
      busy={busy}
      now={Date.now()}
      onAnswer={(answers) => sent.push(answers)}
      {...extra}
    />
  );
  return { element, sent };
}

describe("a question", () => {
  it("shows what was asked, the options, and their descriptions", async () => {
    await render(view().element);
    expect(screen.getByText("Scout is asking")).toBeTruthy();
    expect(screen.getByText("Which supplier?")).toBeTruthy();
    expect(screen.getByText("The cheaper one")).toBeTruthy();
  });

  it("will not send until something has been picked", async () => {
    const { element, sent } = view();
    await render(element);
    expect(screen.getByRole("button", { name: "Send the answer" })).toBeDisabled();
    await userEvent.press(screen.getByRole("radio", { name: "Northwind" }));
    await userEvent.press(screen.getByRole("button", { name: "Send the answer" }));
    expect(sent).toEqual([[{ questionId: "q1", values: ["northwind"] }]]);
  });

  it("takes one answer for a single-choice question, replacing the last", async () => {
    const { element, sent } = view();
    await render(element);
    await userEvent.press(screen.getByRole("radio", { name: "Northwind" }));
    await userEvent.press(screen.getByRole("radio", { name: "Acme" }));
    await userEvent.press(screen.getByRole("button", { name: "Send the answer" }));
    expect(sent).toEqual([[{ questionId: "q1", values: ["acme"] }]]);
  });

  it("takes several when it may, and lets one be taken back", async () => {
    const many = question({
      questions: [{ ...question().questions[0], multiSelect: true }],
    } as Partial<Question>);
    const { element, sent } = view(many);
    await render(element);
    await userEvent.press(screen.getByRole("checkbox", { name: "Northwind" }));
    await userEvent.press(screen.getByRole("checkbox", { name: "Acme" }));
    await userEvent.press(screen.getByRole("checkbox", { name: "Northwind" }));
    await userEvent.press(screen.getByRole("button", { name: "Send the answer" }));
    expect(sent).toEqual([[{ questionId: "q1", values: ["acme"] }]]);
  });

  it("waits for every question before sending anything at all", async () => {
    const two = question({
      questions: [
        ...question().questions,
        {
          questionId: "q2",
          prompt: "How urgent?",
          options: [{ value: "today", label: "Today" }],
          multiSelect: false,
          allowFreeText: false,
        },
      ],
    } as Partial<Question>);
    const { element, sent } = view(two);
    await render(element);
    await userEvent.press(screen.getByRole("radio", { name: "Northwind" }));
    expect(screen.getByRole("button", { name: "Send the answer" })).toBeDisabled();
    expect(sent).toEqual([]);
    await userEvent.press(screen.getByRole("radio", { name: "Today" }));
    await userEvent.press(screen.getByRole("button", { name: "Send the answer" }));
    expect(sent[0]).toHaveLength(2);
  });

  it("carries free text alongside the pick, where free text is allowed", async () => {
    const open = question({
      questions: [{ ...question().questions[0], allowFreeText: true }],
    } as Partial<Question>);
    const { element, sent } = view(open);
    await render(element);
    await userEvent.press(screen.getByRole("radio", { name: "Northwind" }));
    await userEvent.type(screen.getByTestId("free-q1"), "Ask them about the delay");
    await userEvent.press(screen.getByRole("button", { name: "Send the answer" }));
    expect(sent).toEqual([
      [{ questionId: "q1", values: ["northwind"], freeText: "Ask them about the delay" }],
    ]);
  });

  it("says what will happen if nobody answers, in each of the three ways", async () => {
    const soon = new Date(Date.now() + 10 * 60_000).toISOString();
    const said: ReadonlyArray<[Question["onNoAnswer"], string]> = [
      ["use_default", "Lapses in 10 min — then it takes its own default."],
      ["cancel", "Lapses in 10 min — then the run stops."],
      ["continue", "Lapses in 10 min — then it carries on without an answer."],
    ];
    for (const [onNoAnswer, words] of said) {
      await render(view({ onNoAnswer, timeoutAt: soon }).element);
      expect(screen.getByText(words)).toBeTruthy();
    }
  });

  it("names the default it would take, by its label rather than its value", async () => {
    await render(
      view({
        questions: [{ ...question().questions[0], defaultValue: "acme" }],
      } as Partial<Question>).element,
    );
    expect(screen.getByText("It will take “Acme” if nobody answers.")).toBeTruthy();
  });

  it("sends no blank: words typed and taken away again are not an answer", async () => {
    const open = question({
      questions: [{ ...question().questions[0], allowFreeText: true }],
    } as Partial<Question>);
    const { element, sent } = view(open);
    await render(element);
    await userEvent.type(screen.getByTestId("free-q1"), "x");
    expect(screen.getByRole("button", { name: "Send the answer" })).toBeEnabled();
    await userEvent.clear(screen.getByTestId("free-q1"));
    expect(screen.getByRole("button", { name: "Send the answer" })).toBeDisabled();
    await userEvent.type(screen.getByTestId("free-q1"), "Make it darker");
    await userEvent.press(screen.getByRole("button", { name: "Send the answer" }));
    expect(sent).toEqual([[{ questionId: "q1", values: [], freeText: "Make it darker" }]]);
  });

  it("inside the ask's card, leaves who is asking to the card's head", async () => {
    await render(view({}, false, { framed: false }).element);
    expect(screen.queryByText("Scout is asking")).toBeNull();
    expect(screen.getByText("Which supplier?")).toBeTruthy();
  });

  it("says why the last answer was turned away, and not while the next is on its way", async () => {
    const refused = "Not sent: the run has ended as done.";
    const { rerender } = await render(view({}, false, { refused }).element);
    expect(screen.getByTestId("answer-refused")).toHaveTextContent(refused);
    await rerender(view({}, true, { refused }).element);
    expect(screen.queryByTestId("answer-refused")).toBeNull();
  });

  it("offers no second answer once one is in", async () => {
    const answered = {
      by: "per_dana",
      at: "2026-09-07T10:05:00.000Z",
      timedOut: false,
      answers: [{ questionId: "q1", values: ["acme"] }],
    };
    await render(view({ answered } as Partial<Question>).element);
    expect(screen.getByTestId("already-answered")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send the answer" })).toBeNull();
  });
});
