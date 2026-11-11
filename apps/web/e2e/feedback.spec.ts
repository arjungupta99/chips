/**
 * M3.4's acceptance criterion, as ADR 0200 left it: a harness on the SDK hears Not right? and
 * posts a fix.
 *
 * The demo's Scout on `@chipschat/harness`, in this process (`golden-run.ts`; the sample it used
 * to be was withdrawn, ADR 0188), plays the golden run when asked in the browser. The person
 * approves, then says the summary is not right — a reason and a few words — and Scout answers
 * with a correction under the message. Nothing is stubbed: the note is a `feedback` event through
 * the door, delivered to the one harness whose message it is.
 */

import type { Chips } from "@chipschat/harness";
import { expect, test } from "@playwright/test";
import { connectDemoHarness, GOAL, playGolden, SUMMARY } from "./golden-run.ts";
import { demo, pair } from "./support.ts";

const FACTS =
  "PO #4471 is for 120 units, delivery 19 September, and tracker row 4471 is Confirmed.";

/**
 * Scout, listening: a person's message plays the golden run, and a note on one of its messages (or
 * a thumbs-down from an older device) gets a correction under it that takes the note in. What it
 * heard is kept, for the test to read.
 */
async function listen(): Promise<{ readonly chips: Chips; readonly heard: string[] }> {
  const chips = await connectDemoHarness();
  const heard: string[] = [];
  let busy = false;
  chips.on("message.new", (message) => {
    if (message.from.kind !== "person" || busy) return;
    busy = true;
    void playGolden(chips, message.space_id ?? undefined)
      .catch(() => "failed")
      .finally(() => {
        busy = false;
      });
  });
  chips.on("feedback", (feedback) => {
    const note = feedback.kind === "correction" ? feedback.text : undefined;
    if (note === undefined && feedback.reaction !== "👎") return;
    heard.push(note ?? feedback.reaction ?? "");
    const fix =
      note === undefined ? `I have checked that again. ${FACTS}` : `Noted: ${note} ${FACTS}`;
    void chips
      .post({
        spaceId: feedback.space_id ?? demo().space_id,
        text: `Correction: ${fix}`,
        replyTo: feedback.message_id,
      })
      .catch(() => undefined);
  });
  return { chips, heard };
}

test("a harness on the SDK hears Not right?, and posts a fix", async ({ page }) => {
  await pair(page);
  const scout = await listen();
  try {
    // Asked in the room, Scout plays the golden run and waits on the email. Its card is found by
    // what it says: the room is shared with the specs before this one, and a card of theirs
    // still waiting is also the last one until Scout's arrives, so `.last()` approved theirs.
    const box = page.getByLabel("Message PO-4471");
    await box.fill(GOAL);
    await box.press("Enter");
    const card = page
      .getByRole("article", { name: /Approval/ })
      .filter({ hasText: "delivery 19 September" });
    await expect(card.getByRole("button", { name: "Approve" })).toBeEnabled({ timeout: 20_000 });
    await card.getByRole("button", { name: "Approve" }).click();
    // The run is over once its summary is the room's last line: Scout's lines are held until the
    // run closes. Not by its bubble going: the bubble waits the thinking beat, and a run at its
    // card within that never showed one (ADR 0268 addendum).
    const messages = page.getByTestId("messages");
    await expect(messages.locator(".msg").last()).toContainText(SUMMARY, { timeout: 20_000 });

    // The summary is Scout's, so it takes a Not right?. It is in the line's menu, reached here
    // by the `⋯` beside the name — the path a keyboard takes; `messaging.spec.ts` proves the
    // right-click. There are no thumbs any more (ADR 0200).
    const menu = page.getByTestId("line-menu");
    await messages.locator(".msg").last().getByTestId("line-more").click();
    await expect(menu.getByRole("menuitem", { name: "Thumbs down" })).toHaveCount(0);
    await menu.getByRole("menuitem", { name: "Not right?" }).click();
    const form = page.getByTestId("correction-form");
    await expect(form.getByRole("button", { name: /^Send to / })).toBeDisabled();
    await form.getByRole("button", { name: "Wrong facts" }).click();
    await form.getByLabel("Anything else").fill("Delivery is the 19th, not the 12th.");
    await form.getByRole("button", { name: /^Send to / }).click();
    const note = "Wrong facts. Delivery is the 19th, not the 12th.";
    await expect(messages.getByTestId("correction").last()).toContainText(note);
    await expect(messages.getByText(/^Correction:/).first()).toBeVisible({ timeout: 20_000 });
    expect(scout.heard).toEqual([note]);
  } finally {
    scout.chips.close();
  }
});
