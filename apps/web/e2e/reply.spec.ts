/**
 * Replying to a message (ADR 0219): a reply's card in the room, its Jump and the way back (phase 3),
 * and a reply started from a line, sent, and heard by the harness with the message it answers
 * (phase 4).
 *
 * In the first, the demo harness says something, the room moves on past a screenful, and its own
 * reply quotes it, posted with `reply_to` over HTTP. The reply's bubble carries the card; a click
 * lands on the quoted message, lit, and the pill back — "Back to the reply", the harness's — lands
 * on the reply again. Under the quoted message, "1 reply".
 *
 * In the second, the person starts a reply from the line's menu, lets it go with Escape, starts it
 * again from the arrow beside the line, and sends it. The harness, played by the test on its own
 * socket, hears it with `replying_to`: the message, and the lines said before it, since it is older
 * than what the turn hands over. The sent line carries the card.
 */

import { messageIdOf } from "@chipschat/protocol";
import { expect, test } from "@playwright/test";
import { demo, eventType, type Frame, Harness, newRunId, pair, SERVER } from "./support.ts";

/** Posts as the demo harness, and returns the event's id. */
async function say(text: string, key: string, replyTo?: string): Promise<string> {
  const { harness, space_id } = demo();
  const response = await fetch(`${SERVER}/v1/harnesses/${harness.id}/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${harness.token}`,
      "idempotency-key": key,
    },
    body: JSON.stringify({
      type: "message.post",
      space_id,
      text,
      ...(replyTo === undefined ? {} : { reply_to: replyTo }),
    }),
  });
  if (!response.ok) throw new Error(`post failed: ${response.status} ${await response.text()}`);
  return ((await response.json()) as { event_id: string }).event_id;
}

test("a reply quotes its message, goes up to it, and comes back", async ({ page }) => {
  const tag = `reply-${Date.now()}`;
  const held = await say(`Held for 6 at 7:30 (${tag}).`, `${tag}-held`);
  for (let i = 0; i < 24; i += 1) await say(`${tag} filler ${i}`, `${tag}-filler-${i}`);
  const reply = await say(`Make it 8 people (${tag})`, `${tag}-reply`, messageIdOf(held));

  await pair(page);
  const messages = page.getByTestId("messages");
  const replyRow = messages.locator(`[data-line="${reply}"]`);
  await expect(replyRow).toBeVisible();
  const card = replyRow.getByTestId(`reply-card-${held}`);
  await expect(card).toContainText(`Held for 6 at 7:30 (${tag}).`);

  await card.click();
  const heldRow = messages.locator(`[data-line="${held}"]`);
  await expect(heldRow).toHaveAttribute("data-focused", "true");
  await expect(heldRow).toBeInViewport();
  await expect(heldRow.getByTestId(`replies-${reply}`)).toHaveText("1 reply");

  const back = page.getByTestId("back-pill");
  await expect(back).toHaveText("Back to the reply");
  await back.click();
  await expect(replyRow).toHaveAttribute("data-focused", "true");
  await expect(replyRow).toBeInViewport();
  await expect(back).toBeHidden();
});

test("a reply started from a line goes with the message it answers, to the harness and the room", async ({
  page,
}, testInfo) => {
  const tag = `start-${Date.now()}`;
  const harness = await Harness.connect(newRunId());
  try {
    await say(`The quotes are in (${tag}).`, `${tag}-before`);
    const held = await say(`Held for 6 at 7:30 (${tag}).`, `${tag}-held`);
    for (let i = 0; i < 3; i += 1) await say(`${tag} filler ${i}`, `${tag}-filler-${i}`);

    await pair(page);
    const messages = page.getByTestId("messages");
    const heldRow = messages.locator(`[data-line="${held}"]`);
    await expect(heldRow).toBeVisible();
    const strip = page.getByTestId("reply-strip");
    const field = page.getByRole("textbox", { name: /^Message / });

    // From the menu: Reply is its first item, and the field takes the caret.
    await heldRow.hover();
    await heldRow.getByTestId("line-more").click();
    await expect(page.getByRole("menuitem").first()).toHaveText("Reply");
    await page.getByRole("menuitem", { name: "Reply" }).click();
    await expect(strip).toContainText("Replying to");
    await expect(strip).toContainText(`Held for 6 at 7:30 (${tag}).`);
    await expect(field).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(strip).toBeHidden();
    // The caret stays in the field as the strip goes.
    await expect(field).toBeFocused();

    // From the arrow beside the line.
    await heldRow.hover();
    await heldRow.getByTestId("line-reply").click();
    await expect(strip).toBeVisible();
    const composer = page.locator(".ui-composer");
    await composer.screenshot({ path: testInfo.outputPath("strip-light.png") });
    await page.emulateMedia({ colorScheme: "dark" });
    await composer.screenshot({ path: testInfo.outputPath("strip-dark.png") });
    await page.emulateMedia({ colorScheme: "light" });

    const words = `Make it 8 people (${tag})`;
    await field.fill(words);
    await field.press("Enter");
    await expect(strip).toBeHidden();
    await expect(field).toBeFocused();

    // The harness hears it with the message it answers, and what was said just before that.
    const heard = await harness.waitFor(
      (frame) => eventType(frame) === "message.new" && (frame["event"] as Frame)["text"] === words,
      "the reply, as the harness hears it",
    );
    const event = heard["event"] as Frame;
    const replying = event["replying_to"] as Frame;
    expect(replying["message_id"]).toBe(messageIdOf(held));
    expect(replying["text"]).toBe(`Held for 6 at 7:30 (${tag}).`);
    const before = (replying["before"] as Frame[] | undefined) ?? [];
    expect(before.map((line) => line["text"])).toContain(`The quotes are in (${tag}).`);

    // And the room draws the card on the sent line.
    const sent = messages.locator(`[data-line="${String(event["id"])}"]`);
    await expect(sent.getByTestId(`reply-card-${held}`)).toContainText(
      `Held for 6 at 7:30 (${tag}).`,
    );
  } finally {
    harness.close();
  }
});
