/**
 * Condition 1 of the Phase 1 review: the message list is windowed and the fold is incremental,
 * measured against section 4.4's budget — "message list scroll at 60 fps with 10,000 messages"
 * — before the desktop shell wraps this app.
 *
 * Ten thousand messages are put in the room through the dev fill route, because what is being
 * measured is the client: the browser reads them over its own socket, folds them the way it
 * folds anything, and draws them. Then the reader scrolls, and every step is timed against the
 * frame budget. The numbers go in `reports/windowing.json` and into the Phase 2 packet.
 *
 * Against the production build, not the dev server the other specs use. Development React
 * checks as it renders, and a person scrolls the build. On CI's runner the dev server gave a 33 ms
 * median (13 September 2026); on a laptop slowed six times in Chromium, the dev server gave the
 * same 33 ms and the build 16.7 ms.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { BUILD, demo, Harness, newRunId, pair, SERVER } from "./support.ts";

const MESSAGES = 10_000;
/** One frame at 60 fps. A browser locked to vsync hits this exactly when nothing is wrong. */
const FRAME_MS = 1000 / 60;
/**
 * A frame is late when the gap is half a frame beyond one. Below that is jitter and rounding —
 * a healthy vsync-locked run measures 16.7 ms and a headless one measures less, and both are
 * 60 fps. Above it, a vsync was missed.
 */
const LATE_MS = FRAME_MS * 1.5;
const STEPS = 120;

test.use({ baseURL: BUILD });

interface Scroll {
  /** The gap between one animation frame and the next, while scrolling. */
  readonly frames: number[];
  readonly rows: number;
  readonly height: number;
  /** What is on screen at the end of the scroll, so the walk back through the log is proved. */
  readonly texts: string[];
}

test("ten thousand messages scroll within the frame budget", async ({ page }) => {
  test.setTimeout(240_000);
  const details = demo();

  const filled = await page.request.post(`${SERVER}/v1/dev/messages`, {
    data: {
      count: MESSAGES,
      space_id: details.space_id,
      harness_id: details.harness.id,
    },
    timeout: 180_000,
  });
  expect(filled.status()).toBe(201);

  const paired = Date.now();
  await pair(page);
  const messages = page.getByTestId("messages");
  await expect(messages.getByText(`Filler ${MESSAGES} of ${MESSAGES}`)).toBeVisible({
    timeout: 120_000,
  });
  const readBack = Date.now() - paired;

  // The window: a fraction of the log is in the DOM, and the scrollbar still says how long the
  // space is.
  const rows = await messages.locator(".msg, .sys").count();
  expect(rows).toBeLessThan(200);

  const scroll: Scroll = await page.evaluate(
    async ({ steps }) => {
      const el = document.querySelector('[data-testid="messages"]') as HTMLElement;
      // Scroll from inside the animation loop and time the loop: the gap between one frame and
      // the next is what a reader feels, and a main thread that cannot keep up stretches it.
      const frames: number[] = [];
      await new Promise<void>((done) => {
        let last = performance.now();
        let step = 0;
        const tick = (now: number) => {
          frames.push(now - last);
          last = now;
          el.scrollTop -= el.clientHeight * 0.45;
          step += 1;
          if (step < steps) requestAnimationFrame(tick);
          else done();
        };
        requestAnimationFrame(tick);
      });
      return {
        // The first gap is the wait for the loop to start, not a frame it drew.
        frames: frames.slice(1),
        rows: el.querySelectorAll(".msg, .sys").length,
        height: el.scrollHeight,
        texts: [...el.querySelectorAll(".bub")].map((row) => row.textContent ?? ""),
      };
    },
    { steps: STEPS },
  );

  const sorted = [...scroll.frames].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] as number;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] as number;
  const late = scroll.frames.filter((each) => each > LATE_MS).length;

  test.info().annotations.push({
    type: "timing",
    description: `${MESSAGES} messages: ${readBack} ms from pairing to the last one; ${rows} rows in the DOM; scrolling ${scroll.frames.length} frames, median ${median.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, ${late} late`,
  });

  // 60 fps with ten thousand messages (technical-plan 4.4), measured frame to frame while the
  // list scrolls. The typical frame is one vsync — never two, which is what a reader sees as a
  // stutter — and the worst twentieth stays inside two and a half, which allows for the frames
  // that also measure a row for the first time.
  expect(median).toBeLessThan(LATE_MS);
  expect(p95).toBeLessThan(FRAME_MS * 2.5);
  // And the scroll is mostly smooth rather than mostly late.
  expect(late / scroll.frames.length).toBeLessThan(0.25);
  // Windowing holds while scrolling: the DOM does not fill up on the way.
  expect(scroll.rows).toBeLessThan(200);
  // And the scroll went somewhere: a hundred frames back is hundreds of messages back.
  // Not anchored: a bubble carries the author's name and the time as well as the words.
  const reached = scroll.texts
    .map((text) => Number(/Filler (\d+) of/.exec(text)?.[1] ?? Number.NaN))
    .filter((each) => Number.isFinite(each));
  expect(reached.length).toBeGreaterThan(0);
  expect(Math.max(...reached)).toBeLessThan(MESSAGES - 100);

  mkdirSync("reports", { recursive: true });
  writeFileSync(
    "reports/windowing.json",
    JSON.stringify(
      {
        messages: MESSAGES,
        pairingToLastMs: readBack,
        rowsInDom: rows,
        rowsWhileScrolling: scroll.rows,
        scrollHeightPx: scroll.height,
        scrollFrames: scroll.frames.length,
        frameMedianMs: Number(median.toFixed(2)),
        frameP95Ms: Number(p95.toFixed(2)),
        lateFrames: late,
        lateThresholdMs: Number(LATE_MS.toFixed(2)),
      },
      null,
      2,
    ),
  );
});

/**
 * A reply taller than the window, last in the room, and a reader coming back down to it from up
 * the space. The list holds the row across the middle of the window still while the rows above it
 * are measured; it used to read which rows were drawn by counting out the window it had just asked
 * for, which a scroll changes before React draws it. One row shorter, the count left the tall
 * reply off, no row was noted as held, the hold put the scroller back where the reply had stood,
 * and every notch down was undone: the room stuck short of its end (Arjun, 14 October 2026).
 */
test("a reply taller than the window, last in the room, scrolls all the way to its end", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const details = demo();
  // Enough short lines above the reply for the list's window to move as the reader comes down.
  const filled = await page.request.post(`${SERVER}/v1/dev/messages`, {
    data: { count: 80, space_id: details.space_id, harness_id: details.harness.id },
  });
  expect(filled.status()).toBe(201);
  const paragraphs = 40;
  const words = Array.from(
    { length: paragraphs },
    (_, n) =>
      `Paragraph ${n + 1} of the long reply. ${"Every paragraph is a few lines long, so that the reply as a whole is several windows tall. ".repeat(3)}`,
  ).join("\n\n");
  const harness = await Harness.connect(newRunId());
  try {
    await harness.send("run.started", { goal: "Answer at length." });
    await harness.send("message.post", { text: words });
    await harness.send("run.completed", { summary: "Answered at length." });
  } finally {
    harness.close();
  }

  await pair(page);
  const messages = page.getByTestId("messages");
  const last = messages.getByText(`Paragraph ${paragraphs} of the long reply.`);
  await expect(last).toBeVisible({ timeout: 120_000 });
  const window = await messages.boundingBox();
  if (window === null) throw new Error("the messages are not on the page");
  const reply = await messages
    .locator(".msg", { hasText: "Paragraph 1 of the long reply." })
    .boundingBox();
  expect(reply?.height ?? 0).toBeGreaterThan(window.height * 2);

  // Up past the reply's top and two windows into the rows above it, with the wheel, as a person.
  await page.mouse.move(window.x + window.width / 2, window.y + window.height / 2);
  for (let up = 0; up < (reply?.height ?? 0) + window.height * 2; up += 400) {
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(30);
  }
  await expect(last).not.toBeInViewport();

  // And back down a notch at a time, until the list will not go further.
  const place = () =>
    messages.evaluate((el) => ({ top: el.scrollTop, end: el.scrollHeight - el.clientHeight }));
  let at = await place();
  for (let notch = 0; notch < 200 && at.end - at.top > 1; notch += 1) {
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(30);
    at = await place();
  }
  expect(at.end - at.top).toBeLessThanOrEqual(1);
  // And none of the reply is left under the window. Not necessarily in it: an ask still open in the
  // room is drawn under its last row, and the specs that run first leave two (lighthouse's and
  // outsider's), which between them stand taller than the reply's last lines.
  const end = await last.boundingBox();
  if (end === null) throw new Error("the reply's last paragraph is not on the page");
  expect(end.y + end.height).toBeLessThanOrEqual(window.y + window.height);
});
