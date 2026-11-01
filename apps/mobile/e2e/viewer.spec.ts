/**
 * The media viewer on the phone's web target (the media viewer, Phases 1 and 2): a photo a harness
 * sent opens the viewer over the room, the counter says its place in the deck, the arrows a pointer
 * is given page both ways and stop at the end, and Escape closes it; and a clip a harness sent plays
 * there, stops when paged away from and plays on when paged back to.
 *
 * Playwright cannot pinch, and a mouse is not a thumb: the swipe, the drag, the pinch and the
 * flight into the tile are the simulator's, the emulator's and `maestro/viewer.yaml`'s. What this
 * proves is that the viewer opens on the web target at all — Reanimated, gesture handler and
 * `expo-image` there — and that the deck, the counter, the arrows and the platform's Escape reach
 * it through a real room, a real server and the device's signature.
 */

import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { noisyPng } from "../../web/e2e/png.ts";
import { clipOf, Harness, newRunId, openRoom, pair, uploadAsHarness } from "./support.ts";

test.describe.configure({ mode: "serial" });

/** Three seconds of test card and tone, upright, or nothing where ffmpeg is not. */
const clip = () => clipOf({ seconds: 3, width: 180, height: 320 });

test("a photo opens the viewer over the room, pages by the arrow, and closes on Escape", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await pair(page);
  const harness = await Harness.connect(newRunId());
  try {
    const first = await uploadAsHarness("site-01.png", noisyPng(640, 480));
    const second = await uploadAsHarness("site-02.png", noisyPng(480, 640));
    await harness.send("run.started", { goal: "Send the site photos.", plan: [] });
    expect(
      await harness.send("message.post", {
        text: "Photos from the site visit.",
        upload_ids: [first, second],
      }),
    ).toMatchObject({ frame: "ack" });

    await openRoom(page);
    const tile = page.getByLabel("Open site-01.png").last();
    await expect(tile).toBeVisible({ timeout: 30_000 });
    await tile.click();

    // The room is the suite's one demo room, so the deck may hold photos an earlier spec sent: the
    // two here are its newest, and the counter is read rather than assumed.
    const counter = page.getByTestId("viewer-counter");
    await expect(counter).toHaveText(/^\d+ of \d+$/, { timeout: 20_000 });
    await expect(page.getByTestId("viewer-caption")).toContainText("site-01.png");
    const [place, count] = ((await counter.textContent()) ?? "").split(" of ").map(Number);
    expect(place).toBe((count ?? 0) - 1);

    // The web target has a pointer, so the viewer draws arrows; there is no next from the last.
    await page.getByRole("button", { name: "Next" }).click();
    await expect(counter).toHaveText(`${count} of ${count}`);
    await expect(page.getByTestId("viewer-caption")).toContainText("site-02.png");
    await expect(page.getByRole("button", { name: "Next" })).toHaveCount(0);
    await page.getByRole("button", { name: "Previous" }).click();
    await expect(counter).toHaveText(`${place} of ${count}`);
    await expect(page.getByTestId("viewer-caption")).toContainText("site-01.png");

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("viewer-counter")).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByTestId("composer")).toBeVisible();
  } finally {
    harness.close();
  }
});

test("a clip plays in the viewer, stops when paged away from, and plays on when paged back", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const bytes = clip();
  // The server measures a video with the same ffmpeg; without it there is no tile to open.
  test.skip(bytes === undefined, "ffmpeg is not on this machine");
  await pair(page);
  const harness = await Harness.connect(newRunId());
  try {
    const photo = await uploadAsHarness("site-03.png", noisyPng(480, 640));
    const video = await uploadAsHarness("walkthrough.mp4", bytes as Buffer);
    await harness.send("run.started", { goal: "Send the walkthrough.", plan: [] });
    expect(
      await harness.send("message.post", {
        text: "The site, and the walkthrough.",
        upload_ids: [photo, video],
      }),
    ).toMatchObject({ frame: "ack" });

    await openRoom(page);
    const tile = page.getByRole("button", { name: "Play walkthrough.mp4" }).last();
    await expect(tile).toBeVisible({ timeout: 30_000 });
    await tile.click();

    const counter = page.getByTestId("viewer-counter");
    await expect(counter).toHaveText(/^\d+ of \d+$/, { timeout: 20_000 });
    const [place, count] = ((await counter.textContent()) ?? "").split(" of ").map(Number);
    // The newest message's second item, the last in the deck.
    expect(place).toBe(count);
    await expect(page.getByTestId("viewer-caption")).toContainText("walkthrough.mp4 · 0:03");

    // It plays: the time moves, and the button says what it would do now. (The web's player view is
    // a <video> that carries no test id of its own.) It streams from a grant, on the server's own
    // network, rather than a blob the page fetched whole (ADR 0058).
    await expect(page.locator("video")).toHaveCount(1, { timeout: 30_000 });
    await expect(page.locator("video")).toHaveAttribute(
      "src",
      new RegExp(
        `/v1/attachments/${video}\\?(variant=play&)?dev=dev_\\w+&exp=\\d+&sig=[a-f0-9]{64}$`,
      ),
    );
    await expect(page.getByTestId("viewer-time")).toHaveText(/^0:0[1-3]$/, {
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

    // Paged away from, it stops; paged back to, it plays on.
    await page.getByRole("button", { name: "Previous" }).click();
    await expect(page.getByTestId("viewer-caption")).toContainText("site-03.png");
    await expect(page.getByTestId("viewer-controls")).toHaveCount(0);
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByTestId("viewer-caption")).toContainText("walkthrough.mp4");
    await expect(page.getByRole("button", { name: /^(Pause|Play)$/ })).toBeVisible({
      timeout: 15_000,
    });

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("viewer-counter")).toHaveCount(0, { timeout: 10_000 });
  } finally {
    harness.close();
  }
});

/**
 * The network goes under a photo's download, as when the server restarts or the phone changes
 * networks (ADR 0179): the browser is put offline, which closes the app's socket, the download is
 * failed as `fetch` fails then, and the browser comes back a moment later, when the socket opens
 * again. The first `drops` asks for the photo's view go that way, whatever `pass` says; after them,
 * until `pass`, the server refuses it, which is not a drop and is not waited out — and puts nobody
 * offline, so the room is not made again on every ask, which asks again.
 */
async function dropUnderViews(page: Page, context: BrowserContext, photo: string, drops: number) {
  const views = { asked: 0, pass: false };
  await page.route(
    (url) =>
      url.pathname === `/v1/attachments/${photo}` && url.searchParams.get("variant") === "view",
    async (route) => {
      views.asked += 1;
      if (views.asked <= drops) {
        await context.setOffline(true);
        await route.abort("internetdisconnected");
        setTimeout(() => void context.setOffline(false).catch(() => undefined), 400);
      } else if (views.pass) {
        await route.continue();
      } else {
        await route.fulfill({ status: 503, json: { error: { message: "Not now" } } });
      }
    },
  );
  return views;
}

/** A photo a harness sent to the demo room, opened in the viewer from its tile. */
async function openSentPhoto(page: Page, harness: Harness, name: string, photo: string) {
  await harness.send("run.started", { goal: `Send ${name}.`, plan: [] });
  expect(
    await harness.send("message.post", { text: `Here is ${name}.`, upload_ids: [photo] }),
  ).toMatchObject({ frame: "ack" });
  const tile = page.getByLabel(`Open ${name}`).last();
  await expect(tile).toBeVisible({ timeout: 30_000 });
  await tile.click();
  await expect(page.getByTestId("viewer-caption")).toContainText(name, { timeout: 20_000 });
}

/** The photo's view, answered: what the viewer waits on before it draws the full picture. */
const viewCame = (page: Page, photo: string) =>
  page.waitForResponse(
    (response) => response.url().includes(`/v1/attachments/${photo}?variant=view`) && response.ok(),
    { timeout: 30_000 },
  );

test("a photo the connection dropped under comes once the phone is back, with nothing said", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await pair(page);
  const harness = await Harness.connect(newRunId());
  try {
    const photo = await uploadAsHarness("porch-01.png", noisyPng(640, 480));
    await openRoom(page);
    // The first ask is dropped, and every one after it is answered. A poll for the moment it had
    // been asked once (until 17 October 2026) looked inside the 400 ms the phone was offline and
    // missed it: back, the phone asks again at once, and again as the room is drawn anew.
    const views = await dropUnderViews(page, context, photo, 1);
    views.pass = true;
    const came = viewCame(page, photo);
    await openSentPhoto(page, harness, "porch-01.png", photo);
    await came;
    expect(views.asked).toBeGreaterThanOrEqual(2);
    // Give a failure the moment it would take to be said; none is.
    await page.waitForTimeout(1000);
    await expect(page.getByTestId("viewer-preview-only")).toHaveCount(0);
    await expect(page.getByTestId("viewer-failure")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("viewer-counter")).toHaveCount(0, { timeout: 10_000 });
  } finally {
    harness.close();
  }
});

test("a photo whose full picture will not come says so at the foot, over its preview, and Try again brings it", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(90_000);
  await pair(page);
  const harness = await Harness.connect(newRunId());
  try {
    const photo = await uploadAsHarness("porch-02.png", noisyPng(640, 480));
    await openRoom(page);
    const views = await dropUnderViews(page, context, photo, 2);
    await openSentPhoto(page, harness, "porch-02.png", photo);
    // Asked, dropped; asked again once the phone was back, and dropped again: said, small.
    const line = page.getByTestId("viewer-preview-only");
    await expect(line).toBeVisible({ timeout: 30_000 });
    expect(views.asked).toBeGreaterThanOrEqual(2);
    await expect(line).toHaveText("Preview only · couldn't load the full photo · Try again");
    await expect(page.getByTestId("viewer-failure")).toHaveCount(0);
    await expect(page.getByText("Could not fetch the photo.")).toHaveCount(0);
    await page.waitForTimeout(1000);
    await expect(line).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("preview-only.png") });

    views.pass = true;
    const came = viewCame(page, photo);
    await line.click();
    await came;
    await expect(line).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByTestId("viewer-failure")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("viewer-counter")).toHaveCount(0, { timeout: 10_000 });
  } finally {
    harness.close();
  }
});
