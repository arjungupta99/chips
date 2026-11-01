/**
 * Replying to a message (ADR 0219) on the phone's web target: a reply's card in the room, its Jump
 * and the way back (phase 3), and a reply started from the lifted menu (phase 4), as the web
 * suite's `reply.spec.ts` walks them in the browser. The swipe is the simulator's to walk.
 *
 * The demo harness says something, the room moves on past a screenful, and a reply quotes it. No
 * app starts a reply yet (phase 4), so the reply is the harness's own, posted with `reply_to` over
 * HTTP. The reply's bubble carries the card; a press goes to the quoted message and flashes it, and
 * the pill — "Back to the reply", the harness's — flashes the reply again. Under the quoted message,
 * "1 reply". The sweep and the pill's spring are the simulator's to walk.
 */

import { messageIdOf } from "@chipschat/protocol";
import { expect, test } from "@playwright/test";
import { demo, Harness, openRoom, pair, SERVER } from "./support.ts";

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

test("a reply quotes its message, goes up to it, and comes back", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const tag = `reply-${Date.now()}`;
  const held = await say(`Held for 6 at 7:30 (${tag}).`, `${tag}-held`);
  for (let i = 0; i < 24; i += 1) await say(`${tag} filler ${i}`, `${tag}-filler-${i}`);
  const reply = await say(`Make it 8 people (${tag})`, `${tag}-reply`, messageIdOf(held));

  await pair(page);
  await openRoom(page);
  const card = page.getByTestId(`bubble-${reply}`).getByTestId(`reply-card-${held}`);
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText(`Held for 6 at 7:30 (${tag}).`);
  await page.screenshot({ path: testInfo.outputPath("card.png") });

  await card.click();
  await expect(page.getByTestId(`flash-${held}`)).toBeInViewport();
  await expect(page.getByTestId(`replies-${reply}`)).toHaveText("1 reply");
  const back = page.getByTestId("back-pill");
  await expect(back).toContainText("Back to the reply");
  await page.screenshot({ path: testInfo.outputPath("gone-to.png") });

  await page.getByTestId("back-pill-press").click();
  await expect(page.getByTestId(`flash-${reply}`)).toBeInViewport();
  await expect(back).toBeHidden();
});

test("Reply in the lifted menu holds the message over the field, and the send quotes it", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const tag = `start-${Date.now()}`;
  const harness = await Harness.connect(`run_${tag}`);
  const held = await say(`Held for 6 at 7:30 (${tag}).`, `${tag}-held`);
  for (let i = 0; i < 4; i += 1) await say(`${tag} filler ${i}`, `${tag}-filler-${i}`);

  await pair(page);
  await openRoom(page);
  const hold = page.getByTestId(`hold-${held}`);
  await hold.scrollIntoViewIfNeeded();
  await hold.click({ delay: 700 });
  const capsule = page.getByTestId("lift-capsule");
  await expect(capsule.getByRole("button").first()).toHaveAccessibleName("Reply");
  await page.getByTestId("lift-reply").click();

  const strip = page.getByTestId("reply-strip");
  await expect(strip).toContainText("Replying to Scout");
  await expect(strip).toContainText(`Held for 6 at 7:30 (${tag}).`);
  await page.screenshot({ path: testInfo.outputPath("strip.png") });
  await page.getByTestId("reply-strip-close").click();
  await expect(strip).toHaveCount(0);

  await hold.click({ delay: 700 });
  await page.getByTestId("lift-reply").click();
  await expect(strip).toBeVisible();
  await page.getByTestId("composer").fill(`Make it 8 people (${tag})`);
  await page.getByTestId("composer-send").click();
  await expect(strip).toHaveCount(0);

  // The harness is handed the message the reply answers, and the room draws the card on the reply.
  const heard = await harness.waitFor(
    (frame) =>
      (frame["event"] as Record<string, unknown> | undefined)?.["text"] ===
      `Make it 8 people (${tag})`,
    "the reply",
  );
  const replying = (heard["event"] as Record<string, unknown>)["replying_to"] as Record<
    string,
    unknown
  >;
  expect(replying["message_id"]).toBe(messageIdOf(held));
  expect(replying["text"]).toBe(`Held for 6 at 7:30 (${tag}).`);
  await expect(page.getByTestId(`reply-card-${held}`).last()).toBeVisible();
  await expect(page.getByTestId(`line-${held}`)).toContainText("1 reply");
});
