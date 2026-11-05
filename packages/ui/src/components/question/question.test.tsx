import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuestionCard, type QuestionCardProps } from "./question.js";

const ASK: QuestionCardProps = {
  harnessName: "Scout",
  prompt: "Northwind can ship on the 19th or the 26th. Which should I confirm?",
  options: [
    { value: "19", label: "19 September", description: "The date on the PO." },
    { value: "26", label: "26 September", description: "A week later, but a full pallet." },
  ],
  allowFreeText: true,
  defaultValue: "19",
  remainingMs: 58 * 60_000,
};

describe("QuestionCard", () => {
  it("asks, offers the options, and says what it takes if nobody answers, as the phone does", () => {
    render(<QuestionCard {...ASK} onAnswer={() => undefined} />);
    expect(
      screen.getByRole("article", { name: "Question from Scout" }).getAttribute("data-answered"),
    ).toBe("false");
    expect(screen.getByText(ASK.prompt)).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByText("It will take “19 September” if nobody answers.")).toBeTruthy();
    expect(screen.getByText("Lapses in 58 min — then it takes its own default.")).toBeTruthy();
  });

  it("cannot answer until something is chosen or typed", () => {
    const onAnswer = vi.fn();
    render(<QuestionCard {...ASK} onAnswer={onAnswer} />);
    const answer = screen.getByRole("button", { name: "Send the answer" });
    expect(answer).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("radio", { name: /19 September/ }));
    expect(answer).toHaveProperty("disabled", false);
    fireEvent.click(answer);
    expect(onAnswer).toHaveBeenCalledWith({ values: ["19"] });
  });

  it("takes typed words instead", () => {
    const onAnswer = vi.fn();
    render(<QuestionCard {...ASK} onAnswer={onAnswer} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Or say it in your own words" }), {
      target: { value: "  Ask Dana which she prefers  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send the answer" }));
    expect(onAnswer).toHaveBeenCalledWith({ values: [], freeText: "Ask Dana which she prefers" });
  });

  it("lets more than one be chosen when the harness allows it", () => {
    const onAnswer = vi.fn();
    render(<QuestionCard {...ASK} multiSelect onAnswer={onAnswer} />);
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[0] as HTMLElement);
    fireEvent.click(boxes[1] as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Send the answer" }));
    expect(onAnswer).toHaveBeenCalledWith({ values: ["19", "26"] });
  });

  it("says what will happen if nobody answers", () => {
    const { remainingMs: _ignored, ...withoutClock } = ASK;
    render(<QuestionCard {...withoutClock} onNoAnswer="cancel" />);
    // No clock, so no lapse to speak of; the default is still said.
    expect(screen.queryByText(/Lapses/)).toBeNull();
    cleanup();
    render(<QuestionCard {...ASK} onNoAnswer="cancel" />);
    expect(screen.getByText("Lapses in 58 min — then the run stops.")).toBeTruthy();
  });

  it("shows the answer once given", () => {
    render(<QuestionCard {...ASK} answer={{ values: ["26"], by: "Arjun", at: "10:50" }} />);
    expect(screen.getByRole("article").getAttribute("data-answered")).toBe("true");
    expect(screen.getByText("Answered by Arjun · 10:50: 26 September")).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("says when the default was taken", () => {
    render(<QuestionCard {...ASK} answer={{ values: ["19"], timedOut: true }} />);
    expect(
      screen
        .getByText("No answer in time · Scout took the default: 19 September")
        .getAttribute("data-timed-out"),
    ).toBe("true");
  });
});
