/**
 * Deleting a message moves the room round it smoothly (ADR 0167): the rows over the line glide
 * shut over its place, and open again for Undo, while the rows under it stand still — up the
 * history as at the end. Every frame the rows' tops are read, so a jump cannot hide between two
 * samples (Arjun, 15 October 2026: "the scrolling moves abruptly").
 */

import { expect, type Locator, type Page, type TestInfo, test } from "@playwright/test";
import { Harness, newRunId, pair, registerSpecialist } from "./support.ts";

/**
 * A row is forty pixels (a bubble of a turn, ADR 0268), and a jump moves it all in one frame. The
 * ease opens and closes by less than a third of that in a frame, but a first frame that comes late
 * on a loaded machine carries half (35 px of a seventy-pixel row on the CI runner, 1 November 2026,
 * then 12, 8, 5...): still a glide, and well short of a row.
 */
const MOST_IN_A_FRAME = 30;
/** What a row under the place may drift by, all told: rounding, and nothing a reader would see. */
const STILL = 4;

/**
 * Start reading, every frame, where these rows stand below the scroller's top, as the frame is
 * painted: after the list has put back the row it holds, which it does from a ResizeObserver. So
 * this reads from one too, made after the list's, which the browser calls after it in the frame,
 * on a box of its own that is nudged every frame.
 */
async function watch(page: Page, ids: readonly string[]): Promise<void> {
  await page.evaluate((watched) => {
    const scroller = document.querySelector<HTMLElement>("[data-testid='messages']");
    const frames: (number | null)[][] = [];
    (window as unknown as { watched_: (number | null)[][] }).watched_ = frames;
    const nudged = document.createElement("div");
    nudged.style.cssText = "position:fixed;left:0;top:0;height:1px;width:1px;pointer-events:none";
    document.body.append(nudged);
    new ResizeObserver(() => {
      const top = scroller?.getBoundingClientRect().top ?? 0;
      frames.push(
        watched.map((id) => {
          const row = document.querySelector(`.msg[data-line='${id}']`);
          return row === null ? null : Math.round(row.getBoundingClientRect().top - top);
        }),
      );
    }).observe(nudged);
    const nudge = () => {
      nudged.style.width = nudged.style.width === "1px" ? "2px" : "1px";
      requestAnimationFrame(nudge);
    };
    requestAnimationFrame(nudge);
  }, ids);
}

async function watched(page: Page): Promise<(number | null)[][]> {
  return page.evaluate(() => (window as unknown as { watched_: (number | null)[][] }).watched_);
}

/** One row's top, frame by frame, over the frames it was on the page. */
function tops(series: readonly (number | null)[][], column: number): number[] {
  return series.map((frame) => frame[column]).filter((top): top is number => top != null);
}

/** The most a row moved in one frame. */
function largestStep(series: readonly (number | null)[][], column: number): number {
  let most = 0;
  for (let at = 1; at < series.length; at += 1) {
    const before = series[at - 1]?.[column];
    const now = series[at]?.[column];
    if (before == null || now == null) continue;
    most = Math.max(most, Math.abs(now - before));
  }
  return most;
}

/** Forty lines from Scout, each its own words in this test, in the room open in the page. */
async function longRoom(
  page: Page,
): Promise<{ harness: Harness; messages: Locator; row: (n: number) => Locator }> {
  await pair(page);
  const stamp = Date.now();
  const words = (n: number) => `Line ${n} of a long room, ${stamp}.`;
  // A space of its own: in the demo space, what other specs left Scout doing (a status row under
  // the last line that grows as it goes) moves the room's end while the rows are read.
  const tide = await registerSpecialist("Tide");
  const harness = await Harness.connect(newRunId(), { token: tide.token, space: tide.space });
  await harness.send("run.started", { goal: "Talk.", plan: [] });
  for (let line = 1; line <= 40; line += 1) {
    await harness.send("message.post", { text: words(line) });
  }
  await page.getByTestId("space-list").locator(`[data-space="${tide.space}"]`).click();
  const messages = page.getByTestId("messages");
  const row = (n: number) => messages.locator(".msg").filter({ hasText: words(n) });
  await expect(row(40)).toBeVisible();
  // What Tide's run stands in the room, its thinking bubble under the lines, comes the thinking
  // beat after the run starts (ADR 0268 addendum): read the rows once it has, or its coming moves
  // the room's end while they are read.
  await expect(page.getByTestId("doing")).toBeVisible();
  return { harness, messages, row };
}

/**
 * Until a row has stood still for twenty painted frames. The thinking row that has just come glides
 * the room's end up by its own height, and a late frame on a loaded machine can carry all of that
 * glide at once (56 px in one frame on the CI runner, 9 November 2026). Frames, not milliseconds:
 * a stalled page paints none, so it can't pass for a still one.
 */
async function atRest(row: Locator): Promise<void> {
  await row.evaluate(async (element) => {
    let still = 0;
    let last = element.getBoundingClientRect().top;
    while (still < 20) {
      await new Promise((done) => requestAnimationFrame(done));
      const top = element.getBoundingClientRect().top;
      still = top === last ? still + 1 : 0;
      last = top;
    }
  });
}

/**
 * Delete line `n` for me, Undo it, and read the rows two either side of it all the while: those
 * over it glide, with no step of a row's height, and those under it stand still.
 */
async function deleteAndUndo(
  page: Page,
  row: (n: number) => Locator,
  n: number,
  info: TestInfo,
): Promise<void> {
  const target = row(n);
  await expect(target).toBeInViewport();
  await atRest(target);
  const around = [n - 2, n - 1, n, n + 1, n + 2];
  const ids = await Promise.all(around.map((at) => row(at).getAttribute("data-line")));
  await target.click({ button: "right" });
  // Read from the menu on: the room has settled under the reader's hand by then.
  await watch(page, ids.map(String));
  await page.getByTestId("line-menu").getByRole("menuitem", { name: "Delete for me" }).click();
  await expect(target).toHaveCount(0);
  await page.waitForTimeout(600);
  await page.getByTestId("undo-pill").getByRole("button", { name: "Undo" }).click();
  await expect(target).toBeVisible();
  await page.waitForTimeout(1200);

  const series = await watched(page);
  await info.attach("tops", {
    body: JSON.stringify({ around, series }),
    contentType: "text/plain",
  });
  for (const column of [0, 1, 3, 4]) {
    expect(largestStep(series, column), `line ${around[column]}`).toBeLessThan(MOST_IN_A_FRAME);
  }
  // The place closed and opened: the line over it went down by about a row, and came back.
  const over = tops(series, 1);
  expect(Math.max(...over) - Math.min(...over)).toBeGreaterThan(30);
  for (const column of [3, 4]) {
    const under = tops(series, column);
    expect(Math.max(...under) - Math.min(...under), `line ${around[column]}`).toBeLessThan(STILL);
  }
}

test("up the history, the rows over a deleted line glide shut and open, and those under it stay", async ({
  page,
}, info) => {
  const { harness, messages, row } = await longRoom(page);
  try {
    // A reader no longer at the end, with lines over and under the one they delete.
    await messages.evaluate((element) => {
      element.scrollTop = element.scrollHeight - element.clientHeight - 600;
    });
    await page.waitForTimeout(300);
    await deleteAndUndo(page, row, 25, info);
  } finally {
    harness.close();
  }
});

test("at the end, the rows over a deleted line glide shut and open, and those under it stay", async ({
  page,
}, info) => {
  const { harness, row } = await longRoom(page);
  try {
    await deleteAndUndo(page, row, 37, info);
  } finally {
    harness.close();
  }
});
