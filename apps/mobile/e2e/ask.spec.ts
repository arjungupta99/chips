/**
 * A question, end to end on the web target: asked by a harness that then ends its turn, as
 * Jacobian does, and answered on its card in the room, under the message it asks about — not on a
 * screen of its own (the Chess Game space, 15 September 2026). The server used to refuse that
 * answer, because the run had ended, and the phone said nothing.
 */

import { expect, test } from "@playwright/test";
import { demo, Harness, newRunId, openRoom, pair } from "./support.ts";

/** A question id the way a harness mints one: a ULID with the question's prefix. */
function newAskId(): string {
  return newRunId().replace(/^run_/, "qst_");
}

test("a question asked as its run ends is answered on its card in the room", async ({ page }) => {
  test.setTimeout(90_000);
  await pair(page);
  const harness = await Harness.connect(newRunId());
  try {
    const askId = newAskId();
    await harness.send("run.started", { goal: "Add a Bronze theme.", plan: [] });
    await harness.send("message.post", {
      text: "Plan: add Bronze beside the current theme. How would you like to proceed?",
    });
    expect(
      await harness.send("question.ask", {
        ask_id: askId,
        questions: [
          {
            question_id: "choice",
            prompt: "Choose one, or reply in your own words:",
            options: [
              { value: "ask:4ea1ce76:0", label: "Approve" },
              { value: "ask:4ea1ce76:1", label: "Revise" },
              { value: "ask:4ea1ce76:2", label: "Deny" },
            ],
            allow_free_text: true,
          },
        ],
        on_no_answer: "continue",
      }),
    ).toMatchObject({ frame: "ack" });
    await harness.send("run.completed", { summary: "Asked how to proceed." });

    // Into the room, where the plan is and the question stands under it.
    await openRoom(page);
    await expect(page.getByText(/How would you like to proceed\?/).last()).toBeVisible({
      timeout: 20_000,
    });

    const asks = page.getByTestId("room-asks");
    await expect(asks.getByText("Choose one, or reply in your own words:")).toBeVisible();
    await asks.getByRole("radio", { name: "Approve" }).click();
    await asks.getByRole("button", { name: "Send the answer" }).click();

    const answered = await harness.next("question.answered");
    expect(answered).toMatchObject({
      ask_id: askId,
      answered_by: demo().person.id,
      answers: [{ question_id: "choice", values: ["ask:4ea1ce76:0"] }],
    });
    // Answered, so the card leaves the room on its own.
    await expect(asks.getByText("Choose one, or reply in your own words:")).toHaveCount(0, {
      timeout: 20_000,
    });
  } finally {
    harness.close();
  }
});
