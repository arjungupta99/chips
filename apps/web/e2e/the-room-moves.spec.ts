/**
 * The room moves as the phone's does (ADR 0242), measured frame by frame in the browser: a room
 * opens at its end, its first frame already there; a line that lands takes the room up on the
 * room's spring, over many frames, from where it was drawn; and with Reduce Motion it moves at
 * once. The arithmetic of each change is `src/app/room/roomMotion.test.ts`; jsdom lays nothing out,
 * so only a browser can say what was drawn.
 *
 * Before this, every line that landed moved the whole room up by its height between one frame and
 * the next, and a room opened at the top of its history and jumped to its end once it had drawn
 * (the site's clip of the Mac, 28 October 2026: "the video is too jumpy").
 */

import { expect, type Page, test } from "@playwright/test";
import { Harness, newRunId, pair } from "./support.ts";

/** How many replies, each several paragraphs tall, the room holds before it is opened. */
const REPLIES = 4;

/** What the page keeps of each frame, from its first: the room open, and how far from its end. */
interface Frames {
  readonly opened: { readonly room: string; readonly gap: number }[];
  /** The top of the row marked `data-probe`, a frame at a time, once one is. */
  probe: number[];
}

declare global {
  interface Window {
    __frames: Frames;
  }
}

/** In the page, from before it has drawn: each frame's room and probe, at the frame's start. */
function watchFrames(): void {
  window.__frames = { opened: [], probe: [] };
  const each = () => {
    const list = document.querySelector<HTMLElement>('[data-testid="messages"]');
    if (list?.querySelector(".msg") != null) {
      const room = list.closest("main")?.getAttribute("aria-label") ?? "";
      const gap = list.scrollHeight - list.clientHeight - list.scrollTop;
      window.__frames.opened.push({ room, gap });
      const probe = list.querySelector("[data-probe]");
      if (probe !== null) window.__frames.probe.push(probe.getBoundingClientRect().top);
    }
    requestAnimationFrame(each);
  };
  requestAnimationFrame(each);
}

/** The last row of the room marked, and its frames from here on kept. */
async function markLast(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const marked of document.querySelectorAll("[data-probe]"))
      marked.removeAttribute("data-probe");
    const rows = document.querySelectorAll<HTMLElement>('[data-testid="messages"] > .msg');
    const last = rows[rows.length - 1];
    if (last !== undefined) last.dataset["probe"] = "1";
    window.__frames.probe = [];
  });
}

/**
 * How the marked row went from where it stood to where it came to rest, a frame at a time: each
 * frame's step, up. Waits for it to have moved and then stood still for a third of a second.
 */
async function stepsOfMarked(page: Page): Promise<number[]> {
  const rested = (probe: number[]) => {
    const moved = probe.findIndex((top) => top !== probe[0]);
    if (moved < 0) return undefined;
    for (let end = moved; end + 20 <= probe.length; end += 1) {
      const still = probe.slice(end, end + 20);
      if (still.every((top) => top === still[0]))
        return probe.slice(Math.max(0, moved - 1), end + 1);
    }
    return undefined;
  };
  let tops: number[] | undefined;
  await expect
    .poll(async () => {
      tops = rested(await page.evaluate(() => window.__frames.probe));
      return tops !== undefined;
    })
    .toBe(true);
  const path = tops ?? [];
  return path.slice(1).map((top, n) => (path[n] as number) - top);
}

test("a room opens at its end, and a line glides in on the room's spring, or at once with Reduce Motion", async ({
  page,
}) => {
  // Replies far taller than the stylesheet's guess at a row it has not drawn yet, which is what a
  // room's rows are laid out at on its first frame: the frame's own layout gives them their
  // heights, and a list that did not hear of it was drawn at the top of its history.
  // Words of this run's own, so a run after it in the same server finds only its own.
  const stamp = Date.now();
  const harness = await Harness.connect(newRunId());
  try {
    await harness.send("run.started", { goal: "Answer at length." });
    for (let n = 1; n <= REPLIES; n += 1) {
      const words = Array.from(
        { length: 6 },
        (_, p) =>
          `Reply ${n} of ${stamp}, paragraph ${p + 1}. ${"Long enough to wrap over a few lines. ".repeat(4)}`,
      ).join("\n\n");
      await harness.send("message.post", { text: words });
    }
    await harness.send("run.completed", { summary: "Answered at length." });
  } finally {
    harness.close();
  }
  await page.addInitScript(watchFrames);
  await pair(page);
  const messages = page.getByTestId("messages");
  await expect(messages.getByText(`Reply ${REPLIES} of ${stamp}, paragraph 6.`)).toBeVisible();

  // Opened at its end: the room's first frame with its rows on it was at the end already.
  const opened = await page.evaluate(() => window.__frames.opened);
  const first = opened.find((frame) => frame.room === "Space: PO-4471");
  expect(first?.gap).toBeLessThanOrEqual(1);

  // A line of mine lands: the room goes up by it over many frames, never much of it in one.
  const box = page.getByLabel("Message PO-4471");
  await markLast(page);
  await box.fill(`A line that lands at the foot of the room, ${stamp}.`);
  await box.press("Enter");
  await expect(
    messages.getByText(`A line that lands at the foot of the room, ${stamp}.`),
  ).toBeVisible();
  const glide = await stepsOfMarked(page);
  const rise = glide.reduce((sum, step) => sum + step, 0);
  expect(rise).toBeGreaterThan(30);
  expect(Math.max(...glide)).toBeLessThan(rise * 0.35);
  expect(glide.filter((step) => step > 0.5).length).toBeGreaterThanOrEqual(8);
  await expect
    .poll(() => messages.evaluate((list) => list.scrollHeight - list.clientHeight - list.scrollTop))
    .toBeLessThanOrEqual(1);

  // With Reduce Motion the next line moves the room at once: the first frame that moves takes all
  // of the line's height (a glide's first frame takes a few pixels of it). What the room says under
  // the line a moment later, in a room other specs have filled, may move it again after; so may the
  // line itself, its time coming once the server has it. A line just sent is a row of 28 and its
  // margin; until 3 November it was laid out at the stylesheet's 60 for its first frame.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await markLast(page);
  await box.fill(`And one with Reduce Motion on, ${stamp}.`);
  await box.press("Enter");
  await expect(messages.getByText(`And one with Reduce Motion on, ${stamp}.`)).toBeVisible();
  const atOnce = await stepsOfMarked(page);
  expect(atOnce[0]).toBeGreaterThan(Math.min(36, rise * 0.9));
  expect(glide[0]).toBeLessThan(rise * 0.2);
});
