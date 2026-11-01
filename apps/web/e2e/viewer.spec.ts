/**
 * The web's media viewer in a real browser (the media viewer proposal, §4.3; ADR 0057).
 *
 * This is what jsdom cannot be asked: the platform's modal dialog and its focus trap, a stage with
 * a size, a picture that really decodes, a `<video>` that really plays, and the gestures — which
 * are pointer events either way, but only a browser reports the geometry they are decided by.
 *
 * It runs in two projects (`playwright.config.ts`): `chromium`, a desktop window with a pointer and
 * keys, and `pixel`, a Pixel 7's viewport with `hasTouch` — where the filmstrip is off for want of
 * room and the swipe, the drag to dismiss and the pinch are the paging.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { noisyPng } from "./png.ts";
import { pair } from "./support.ts";

test.describe.configure({ mode: "serial" });

/** Three seconds of test card and tone as H.264 and AAC, or nothing where ffmpeg is not here. */
function clip(): Buffer | undefined {
  const directory = mkdtempSync(join(tmpdir(), "chips-viewer-e2e-"));
  try {
    const out = join(directory, "clip.mp4");
    execFileSync("ffmpeg", [
      ...["-hide_banner", "-v", "error"],
      ...["-f", "lavfi", "-i", "testsrc=size=320x180:rate=30:duration=3"],
      ...["-f", "lavfi", "-i", "sine=frequency=440:duration=3"],
      ...["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"],
      ...["-movflags", "+faststart", "-y", out],
    ]);
    return readFileSync(out);
  } catch {
    return undefined;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function attach(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await page.getByTestId("file-picker").setInputFiles(file);
  await expect(page.getByRole("list", { name: "Attachments" })).toContainText(file.name);
  await expect(page.getByRole("list", { name: "Attachments" })).not.toContainText("uploading…", {
    timeout: 60_000,
  });
}

/**
 * A name no earlier message in the shared room has: the specs run in order in one workspace, and
 * the Pixel project runs them all again, so "the last grid" is the previous spec's until this one's
 * message has drawn — and a locator that asked for it then held the wrong photos.
 */
function fresh(name: string): string {
  const dot = name.lastIndexOf(".");
  return `${name.slice(0, dot)}-${Date.now().toString(36)}${name.slice(dot)}`;
}

/** Send one message carrying two photos, and give back the grid it drew. */
async function twoPhotos(page: Page) {
  const receipt = fresh("receipt.png");
  await attach(page, { name: receipt, mimeType: "image/png", buffer: noisyPng(900, 700) });
  await attach(page, {
    name: fresh("site.png"),
    mimeType: "image/png",
    buffer: noisyPng(700, 900),
  });
  await page.getByLabel(/^Message /).fill("Two photos, for the viewer.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const grid = page
    .getByTestId("photo-grid")
    .filter({ has: page.getByRole("button", { name: `Open ${receipt}` }) });
  await expect(grid.locator("img").first()).toHaveAttribute("src", /^blob:/, { timeout: 30_000 });
  return grid;
}

/**
 * Where the open viewer says it stands: `2 of 7`, read back as numbers.
 *
 * The specs share one workspace and run in order, and the `pixel` project runs the lot again after
 * `chromium`, so a room gathers what every spec before sent. The deck is the media of the twenty
 * messages around the tapped one, so how many there are is the room's business and not a number a
 * spec can know in advance. Each spec asks the viewer, and then asks about moving from there.
 */
async function place(page: Page): Promise<{ at: number; of: number }> {
  const said = (await page.getByTestId("viewer-count").textContent()) ?? "";
  const [at, of] = said.split(" of ").map((each) => Number(each.trim()));
  expect(Number.isFinite(at) && Number.isFinite(of), `the counter said "${said}"`).toBe(true);
  return { at: at as number, of: of as number };
}

const counts = (at: number, of: number) => `${at} of ${of}`;

const viewer = (page: Page) => page.getByRole("dialog");

/**
 * A one-finger drag across the stage, as pointer events, which is how the viewer hears both a
 * mouse and a finger. Dispatched rather than driven by `page.mouse`, so a spec can say which hand
 * made it: the phone's rules are only for a touch.
 */
async function swipe(
  page: Page,
  at: { from: { x: number; y: number }; to: { x: number; y: number }; hand: "touch" | "mouse" },
) {
  await page.evaluate((move) => {
    const stage = document.querySelector('[data-testid="viewer-stage"]');
    if (stage === null) throw new Error("the stage is not there");
    const fire = (type: string, x: number, y: number) =>
      stage.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          pointerType: move.hand,
          clientX: x,
          clientY: y,
          bubbles: true,
          isPrimary: true,
        }),
      );
    fire("pointerdown", move.from.x, move.from.y);
    const steps = 12;
    for (let step = 1; step <= steps; step += 1) {
      fire(
        "pointermove",
        move.from.x + ((move.to.x - move.from.x) * step) / steps,
        move.from.y + ((move.to.y - move.from.y) * step) / steps,
      );
    }
    fire("pointerup", move.to.x, move.to.y);
  }, at);
}

test("a photo's click opens the viewer on it, pages, and closes back to its tile", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await pair(page);
  const grid = await twoPhotos(page);

  const tile = grid.getByTestId("photo").first();
  await tile.click();

  // It opens on the one that was clicked, and says where it stands.
  await expect(viewer(page)).toBeVisible();
  const { at, of } = await place(page);
  // The two just sent are the newest, so the first of them is the last but one.
  expect(at).toBe(of - 1);
  await expect(page.getByTestId("viewer-image")).toHaveAttribute("data-loaded", "yes", {
    timeout: 15_000,
  });

  // The picture is fitted to the stage: all of it shows, and it is the shape it was sent.
  const shape = await page.getByTestId("viewer-image").evaluate((image) => {
    const box = image.getBoundingClientRect();
    return {
      width: box.width,
      height: box.height,
      natural: (image as HTMLImageElement).naturalWidth / (image as HTMLImageElement).naturalHeight,
    };
  });
  expect(shape.width / shape.height).toBeCloseTo(shape.natural, 1);

  // The arrow key pages, and the counter follows.
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("viewer-count")).toHaveText(counts(at + 1, of));
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("viewer-count")).toHaveText(counts(at, of));
  // Nothing wraps at the ends: End is the last, and forward from there stays.
  await page.keyboard.press("End");
  await expect(page.getByTestId("viewer-count")).toHaveText(counts(of, of));
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("viewer-count")).toHaveText(counts(of, of));
  await page.keyboard.press("Home");
  await expect(page.getByTestId("viewer-count")).toHaveText(counts(1, of));
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("viewer-count")).toHaveText(counts(1, of));

  // Back to where it opened, so it closes into the tile it came out of.
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");

  // Escape closes it, and the focus is back on the tile it came out of.
  await page.keyboard.press("Escape");
  await expect(viewer(page)).toBeHidden();
  await expect(tile).toBeFocused();
});

test("the platform's dialog is modal, and axe reads it", async ({ page }) => {
  test.setTimeout(120_000);
  await pair(page);
  const grid = await twoPhotos(page);
  await grid.getByTestId("photo").first().click();
  await expect(viewer(page)).toBeVisible();
  await expect(page.getByTestId("viewer-image")).toHaveAttribute("data-loaded", "yes", {
    timeout: 15_000,
  });

  // `showModal()` puts it in the top layer and makes the room behind it inert, which is rule 9's
  // screen reader and the focus trap, both without a line of our own.
  expect(
    await viewer(page).evaluate((dialog) => (dialog as HTMLDialogElement).matches(":modal")),
  ).toBe(true);
  // The room behind cannot be reached by a click or by Tab while it is up.
  await expect(page.getByTestId("photo").first()).not.toBeFocused();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .analyze();
  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => node.target.join(" ")),
    })),
  ).toEqual([]);
});

test("zoom is at the pointer, and 0 puts it back", async ({ page }) => {
  test.setTimeout(120_000);
  await pair(page);
  const grid = await twoPhotos(page);
  await grid.getByTestId("photo").first().click();
  await expect(page.getByTestId("viewer-image")).toHaveAttribute("data-loaded", "yes", {
    timeout: 15_000,
  });

  // The page being stood on, not the neighbour beside it: only the current one is given a picture
  // to draw, so it is the one holding the `<img>`.
  const picture = page.locator(".viewer-picture").filter({ has: page.getByTestId("viewer-image") });
  const fitted = await picture.boundingBox();
  expect(fitted).not.toBeNull();

  // The zoom settles on the design system's curve, so what it settles at is what is asked for
  // rather than whatever it had reached a frame after the key.
  await page.keyboard.press("+");
  await expect(page.getByTestId("viewer-stage")).toHaveAttribute("data-zoomed", "yes");
  await expect
    .poll(async () => (await picture.boundingBox())?.width ?? 0)
    .toBeGreaterThan((fitted?.width ?? 0) * 1.4);

  // The browser samples the whole bitmap, so a zoomed photo is drawn from the same decode: the
  // picture on the stage is the one that was already there, not a second fetch.
  await expect(page.getByTestId("viewer-image")).toHaveAttribute("data-loaded", "yes");

  await page.keyboard.press("0");
  await expect(page.getByTestId("viewer-stage")).toHaveAttribute("data-zoomed", "no");
  await expect
    .poll(async () => Math.round((await picture.boundingBox())?.width ?? 0))
    .toBe(Math.round(fitted?.width ?? 0));
});

test("the filmstrip is there where there is room, and goes while zoomed", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await pair(page);
  const grid = await twoPhotos(page);
  await grid.getByTestId("photo").first().click();
  await expect(viewer(page)).toBeVisible();
  const { of } = await place(page);

  const strip = page.getByTestId("viewer-filmstrip");
  if (testInfo.project.name === "pixel") {
    // A Pixel's 412 pixels are under the 900 the strip asks for, so it is not drawn (§4.6).
    await expect(strip).toBeHidden();
    return;
  }
  await expect(strip).toBeVisible();
  // One thumb per item in the deck, which is every photo the room has gathered.
  await expect(strip.getByRole("button")).toHaveCount(of);
  // A click on a thumb goes there.
  await strip.getByRole("button").last().click();
  await expect(page.getByTestId("viewer-count")).toHaveText(counts(of, of));

  // Zoomed, the stage is the picture's.
  await page.keyboard.press("+");
  await expect(strip).toBeHidden();
  await page.keyboard.press("0");
  await expect(strip).toBeVisible();
});

test("a swipe pages and a drag downward closes, through pointer events", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name !== "pixel", "the touch path is the Pixel project's");
  await pair(page);
  const grid = await twoPhotos(page);
  const tile = grid.getByTestId("photo").first();
  await tile.click();
  await expect(viewer(page)).toBeVisible();
  const { at, of } = await place(page);

  const stage = await page.getByTestId("viewer-stage").boundingBox();
  const middle = { x: (stage?.width ?? 400) / 2, y: (stage?.height ?? 700) / 2 };

  // A finger moving left is toward the newer one: past 40 % of the width, it pages.
  await swipe(page, {
    from: { x: middle.x + 140, y: middle.y },
    to: { x: middle.x - 140, y: middle.y },
    hand: "touch",
  });
  await expect(page.getByTestId("viewer-count")).toHaveText(counts(at + 1, of));

  // And back the other way.
  await swipe(page, {
    from: { x: middle.x - 140, y: middle.y },
    to: { x: middle.x + 140, y: middle.y },
    hand: "touch",
  });
  await expect(page.getByTestId("viewer-count")).toHaveText(counts(at, of));

  // A drag downward past 120 points closes it, back into the tile.
  await swipe(page, {
    from: { x: middle.x, y: middle.y - 80 },
    to: { x: middle.x, y: middle.y + 160 },
    hand: "touch",
  });
  await expect(viewer(page)).toBeHidden();
});

test("a clip in an album opens the viewer on it, and it plays from a grant the player asks runs of (ADR 0058)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const movie = clip();
  // The server measures a video with the same ffmpeg; without it there is no poster to open from.
  test.skip(movie === undefined, "ffmpeg is not on this machine");
  await pair(page);

  const answers: { readonly status: number; readonly range: string | undefined }[] = [];
  page.on("response", (response) => {
    if (!/\/v1\/attachments\/[^/?]+\?.*sig=/.test(response.url())) return;
    answers.push({ status: response.status(), range: response.request().headers()["range"] });
  });

  const walkthrough = fresh("walkthrough.mp4");
  await attach(page, {
    name: fresh("gate.png"),
    mimeType: "image/png",
    buffer: noisyPng(900, 700),
  });
  await attach(page, { name: walkthrough, mimeType: "video/mp4", buffer: movie as Buffer });
  await page.getByLabel(/^Message /).fill("A photo and a clip, for the viewer's stage.");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  // A measured video is a tile of the message's album beside its photo (decision 7): its poster
  // arrives once the server has measured it and taken a frame (ADR 0053), and the room has no
  // player of its own.
  const grid = page
    .getByTestId("photo-grid")
    .filter({ has: page.getByRole("button", { name: `Play ${walkthrough}` }) });
  await expect(grid).toHaveAttribute("data-count", "2", { timeout: 30_000 });
  const tile = grid.getByTestId("video-tile");
  await expect(tile.locator("img")).toHaveAttribute("src", /^blob:/, { timeout: 60_000 });
  await expect(page.getByTestId("video-player")).toHaveCount(0);

  await tile.click({ timeout: 30_000 });
  const player = page.getByTestId("viewer-player");
  await expect(player).toBeVisible();
  // It opened on the clip, the second of the two its message carries, with the photo one back.
  await expect(page.locator(".viewer-caption-line")).toContainText(" · 2 of 2");
  expect((await place(page)).at).toBeGreaterThan(1);

  // The URL is a grant's: the device, the expiry and the signature, and nothing else to present.
  await expect(player).toHaveAttribute(
    "src",
    /^\/v1\/attachments\/att_\w+\?(variant=play&)?dev=dev_\w+&exp=\d+&sig=[a-f0-9]{64}$/,
  );

  // It plays when it is landed on, without a press (Arjun, decision 2).
  await expect
    .poll(async () => await player.evaluate((video) => (video as HTMLVideoElement).currentTime), {
      timeout: 30_000,
    })
    .toBeGreaterThan(0.5);

  // And the browser asked for a run of it rather than the whole file, and was given one.
  expect(answers.some((answer) => answer.status === 206 && answer.range !== undefined)).toBe(true);

  // Space stops it.
  await page.keyboard.press(" ");
  await expect
    .poll(async () => await player.evaluate((video) => (video as HTMLVideoElement).paused))
    .toBe(true);
});
