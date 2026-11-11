/**
 * The foot of a room as an agent asks and is answered, a frame at a time (Arjun, 8 November 2026,
 * of the Mac: "tapping them makes the whole scrolling window go bouncing", "bouncy can also happen
 * when the permission screen appears"). What stands under the last line changes once for each
 * thing that happens, so the room goes one way and stops: it never goes down to come back up.
 *
 * Read after each frame's observers have run, so what is noted is what was painted, and only while
 * the page's animation clock still stands at that frame's time.
 */

import { expect, type Page, test } from "@playwright/test";
import { Harness, newApprovalId, newRunId, pair, registerSpecialist } from "./support.ts";

/** What's left of a room's journey after moves of under a few pixels: which way, and how far. */
function journeys(ys: readonly number[]): readonly number[] {
  const out: number[] = [];
  let pivot = ys[0] ?? 0;
  let way = 0;
  for (let at = 1; at < ys.length; at += 1) {
    const step = (ys[at] as number) - (ys[at - 1] as number);
    if (Math.abs(step) < 0.4) continue;
    const sign = Math.sign(step);
    if (way !== 0 && sign !== way) {
      out.push(Math.round((ys[at - 1] as number) - pivot));
      pivot = ys[at - 1] as number;
    }
    way = sign;
  }
  out.push(Math.round((ys.at(-1) ?? 0) - pivot));
  return out.filter((each) => Math.abs(each) >= 4);
}

/** Where the room's last line stands on the glass, each frame, while `act` and `ms` go by. */
async function moves(page: Page, act: () => Promise<unknown>, ms = 2400) {
  await page.evaluate(() => {
    const list = document.querySelector('[data-testid="messages"]') as HTMLElement;
    const lines = list.querySelectorAll(".msg:not(.doing)");
    const line = lines[lines.length - 1] as HTMLElement;
    const channel = new MessageChannel();
    const ys: number[] = [];
    const seen = window as unknown as { rowYs: number[]; rowOn: boolean };
    seen.rowYs = ys;
    seen.rowOn = true;
    let frameAt = 0;
    const after = (time: number) => {
      frameAt = time;
      channel.port2.postMessage(0);
    };
    channel.port1.onmessage = () => {
      if (!seen.rowOn) return;
      // A read that comes after the page's animation clock has gone on lays the room out at the
      // next frame's time, before the room has placed its rows for it: a frame never painted. On a
      // busy runner that read the line down by what the card had folded, and back up (public CI,
      // 10 November 2026: 84, -84, 355). It is a few reads in a hundred, left out.
      if (Math.abs((document.timeline.currentTime as number) - frameAt) < 1) {
        ys.push(line.getBoundingClientRect().top - list.getBoundingClientRect().top);
      }
      requestAnimationFrame(after);
    };
    requestAnimationFrame(after);
  });
  await act();
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    const seen = window as unknown as { rowYs: number[]; rowOn: boolean };
    seen.rowOn = false;
    return seen.rowYs;
  });
}

const COMMAND = Array.from({ length: 16 }, (_, n) => `echo "step ${n + 1}" >> notes-${n}.txt`).join(
  "\n",
);

test("a room moves one way as an ask comes, and not at all as it gives way to the next", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const builder = await registerSpecialist("Builder");
  const harness = await Harness.connect(newRunId(), { token: builder.token, space: builder.space });
  const ask = async (word: string) => {
    await harness.send("approval.request", {
      approval_id: newApprovalId(),
      action: { kind: "garden.shell", input: { command: `${COMMAND}\n# ${word}` } },
      risk: [],
      question: "Write the notes?",
      expires_in: 3600,
    });
  };
  try {
    await page.setViewportSize({ width: 1500, height: 976 });
    await pair(page);
    await page.getByTestId("space-list").locator(`[data-space="${builder.space}"]`).click();
    await harness.send("run.started", { goal: "Notes", plan: [] });
    for (let line = 0; line < 24; line += 1) {
      await harness.send("message.post", { text: `Line ${line} of a room long enough to scroll.` });
    }
    const messages = page.getByTestId("messages");
    await expect(messages.getByTestId("doing")).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1500);

    // The working row stands until the card takes its place: the room goes up, once.
    const came = journeys(await moves(page, () => ask("first")));
    const card = messages.locator(".ui-approval");
    await expect(card).toBeVisible();
    expect(came).toHaveLength(1);
    expect(came[0]).toBeLessThan(0);
    await expect(messages.getByTestId("doing")).toHaveCount(0);

    // The whole of a long command's card fits the window, and its command scrolls inside it.
    const window = await messages.boundingBox();
    const drawn = await card.boundingBox();
    expect(drawn?.height).toBeLessThan((window?.height ?? 0) / 2);
    expect(
      await card
        .locator(".plate-lines")
        .evaluate((plate) => plate.scrollHeight > plate.clientHeight),
    ).toBe(true);

    // Nothing moves for a tap that changes nothing.
    await page.waitForTimeout(800);
    const go = card.getByTestId("approval-approve");
    expect(journeys(await moves(page, () => card.locator("header").click(), 800))).toEqual([]);

    // A yes to one of a run of commands: the next card takes its place, and the room stays put.
    const swapped = await moves(page, async () => {
      await go.click();
      await page.waitForTimeout(450);
      await ask("second");
    });
    expect(journeys(swapped)).toEqual([]);
    await expect(card).toHaveCount(1);

    // A yes with nothing after it: the card folds, the working row comes, the room comes down once.
    await page.waitForTimeout(400);
    const folded = journeys(await moves(page, () => card.getByTestId("approval-approve").click()));
    expect(folded).toHaveLength(1);
    expect(folded[0]).toBeGreaterThan(0);
    await expect(messages.getByTestId("doing")).toBeVisible();
    await expect(card).toHaveCount(0);
  } finally {
    harness.close();
  }
});

test("a thinking bubble that comes on its beat takes the room to its end, and is in view", async ({
  page,
}) => {
  // A name no other spec's agent has, or holds, or is held in: specs pick their agents by name,
  // as a substring (raise-the-limit's Scribe, room-agents's Tern), and found this one too.
  const quokka = await registerSpecialist("Quokka");
  const harness = await Harness.connect(newRunId(), { token: quokka.token, space: quokka.space });
  try {
    await page.setViewportSize({ width: 1500, height: 976 });
    await pair(page);
    await page.getByTestId("space-list").locator(`[data-space="${quokka.space}"]`).click();
    await harness.send("run.started", { goal: "Lines", plan: [] });
    for (let line = 0; line < 24; line += 1) {
      await harness.send("message.post", { text: `Line ${line} of a room long enough to scroll.` });
    }
    await harness.send("run.completed", { summary: "Done." });
    const messages = page.getByTestId("messages");
    await expect(messages.getByTestId("doing")).toHaveCount(0);
    await page.waitForTimeout(600);

    // A run that says nothing after it starts: its bubble comes on its beat alone, with nothing
    // else in the room drawn again. The room stood short of its end by the bubble's height, the
    // bubble under the window (11 November 2026, once ADR 0293 took the run panel away).
    harness.runId = newRunId();
    await harness.send("run.started", { goal: "Think", plan: [] });
    const bubble = messages.getByTestId("doing");
    await expect(bubble).toBeVisible();
    await expect
      .poll(() =>
        messages.evaluate((list) => list.scrollHeight - list.clientHeight - list.scrollTop),
      )
      .toBeLessThan(2);
    await expect(bubble).toBeInViewport({ ratio: 1 });
  } finally {
    harness.close();
  }
});
