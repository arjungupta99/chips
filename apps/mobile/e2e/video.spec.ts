/**
 * A video a harness sent, played in the viewer on the phone's web target, with iOS's own player's
 * controls (testing/scenarios/media/video-in-a-room.md): it plays on landing; a tap on the stage
 * brings the bars and takes them away and leaves it playing; the middle disc pauses and plays; ten
 * seconds back and on; mute; the track; a phone turned onto its side mid-play, where the film
 * re-fits and the controls stay on the glass; its end, which brings the bars back with Play and
 * plays again from the start; and the system player, which hands it back.
 *
 * What the web target cannot show is the native half: the glass, the island and the corners a phone
 * on its side puts at the sides, and how a turn moves. Those are `src/media/MediaViewer.test.tsx`'s
 * (where the bars stand) and `maestro/video.yaml`'s (on the simulator). The player here is the
 * `<video>` `expo-video` mounts, so what is read is the element's own clock.
 */

import { expect, type Locator, type Page, test } from "@playwright/test";
import { clipOf, Harness, newRunId, openRoom, pair, uploadAsHarness } from "./support.ts";

test.describe.configure({ mode: "serial" });

/** A phone's points, upright and on its side: the config's iPhone. */
const UPRIGHT = { width: 393, height: 852 };
const ON_ITS_SIDE = { width: 852, height: 393 };

/** A name no earlier spec in the suite's one room has used. */
const fresh = (name: string) => `${Date.now().toString(36)}-${name}`;

/** Send a clip into the demo room as the harness, open the room, and open the viewer on it. */
async function openClip(page: Page, name: string, bytes: Buffer): Promise<void> {
  await pair(page);
  const harness = await Harness.connect(newRunId());
  try {
    const video = await uploadAsHarness(name, bytes);
    await harness.send("run.started", { goal: "Send the clip.", plan: [] });
    expect(
      await harness.send("message.post", { text: "The clip.", upload_ids: [video] }),
    ).toMatchObject({ frame: "ack" });
  } finally {
    harness.close();
  }
  await openRoom(page);
  const tile = page.getByRole("button", { name: `Play ${name}` }).last();
  await expect(tile).toBeVisible({ timeout: 30_000 });
  await tile.click();
  await expect(page.getByTestId("viewer-counter")).toHaveText(/^\d+ of \d+$/, { timeout: 20_000 });
}

/** The `<video>` on the stage: the player's view on the web. */
const film = (page: Page): Locator => page.locator("video").first();
const clock = async (page: Page): Promise<number> =>
  await film(page).evaluate((video) => (video as HTMLVideoElement).currentTime);
const paused = async (page: Page): Promise<boolean> =>
  await film(page).evaluate((video) => (video as HTMLVideoElement).paused);

/** The bars, as an eye sees them: up or away. React Native's `Animated` fades their opacity. */
const bars = (page: Page): Locator => page.getByTestId("viewer-chrome");
const barsUp = async (page: Page) => await expect(bars(page)).toHaveCSS("opacity", "1");
const barsAway = async (page: Page) => await expect(bars(page)).toHaveCSS("opacity", "0");

/** One of the viewer's buttons by its whole name: the room's tile behind is "Play <its name>". */
const button = (page: Page, name: string): Locator =>
  page.getByRole("button", { name, exact: true });

/** A tap on the stage, clear of the transport in its middle and the bars at its edges. */
async function tapStage(page: Page): Promise<void> {
  const size = page.viewportSize() ?? UPRIGHT;
  await page.mouse.click(size.width / 2, size.height * 0.28);
}

/** Within two points: a layout rounds to the pixel, and a fit to the half point. */
const near = (got: number | undefined, wanted: number) =>
  expect(Math.abs((got ?? Number.NaN) - wanted)).toBeLessThan(2);

/** Wait for it to be playing: the element's clock moving on its own. */
async function playing(page: Page): Promise<void> {
  const from = await clock(page);
  await expect.poll(async () => await clock(page), { timeout: 15_000 }).toBeGreaterThan(from + 0.3);
}

test("a clip plays from its tile with iOS's own player's controls: a tap shows the bars and leaves it playing, the middle disc, ten seconds either way, mute and the track", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const bytes = clipOf({ seconds: 24, width: 320, height: 180 });
  test.skip(bytes === undefined, "ffmpeg is not on this machine");
  await openClip(page, fresh("controls.mp4"), bytes as Buffer);

  // It plays on landing, and the bars go by themselves three seconds in.
  await expect(film(page)).toBeAttached({ timeout: 30_000 });
  await playing(page);
  await barsAway(page);

  // A tap brings them back, and the film plays on under them; another takes them away.
  await tapStage(page);
  await barsUp(page);
  expect(await paused(page)).toBe(false);
  await tapStage(page);
  await barsAway(page);
  expect(await paused(page)).toBe(false);

  // The middle disc pauses it, and paused, the bars stay.
  await tapStage(page);
  await button(page, "Pause").click();
  await expect.poll(async () => await paused(page)).toBe(true);
  await expect(button(page, "Play")).toBeVisible();
  // Past the three seconds a playing film's bars would have gone in, they are still up.
  await page.waitForTimeout(3500);
  await barsUp(page);

  // Ten seconds on, and back: the clock, the time gone and the time left all follow.
  const at = await clock(page);
  await button(page, "Forward 10 seconds").click();
  await expect.poll(async () => await clock(page)).toBeCloseTo(at + 10, 0);
  await expect(page.getByTestId("viewer-remaining")).toHaveText(/^−0:\d\d$/);
  await button(page, "Back 10 seconds").click();
  await expect.poll(async () => await clock(page)).toBeCloseTo(at, 0);

  // Mute says what it would do next, and the element is muted.
  await button(page, "Mute").click();
  await expect(button(page, "Unmute")).toBeVisible();
  expect(await film(page).evaluate((video) => (video as HTMLVideoElement).muted)).toBe(true);
  await button(page, "Unmute").click();
  await expect(button(page, "Mute")).toBeVisible();

  // A thumb on the track, from a quarter of the way along to three quarters: the clock follows it.
  const track = await page.getByTestId("viewer-scrubber").boundingBox();
  if (track === null) throw new Error("The track has no box.");
  const middle = track.y + track.height / 2;
  await page.mouse.move(track.x + track.width * 0.25, middle);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * 0.75, middle, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => await clock(page)).toBeGreaterThan(24 * 0.65);
  await expect.poll(async () => await clock(page)).toBeLessThan(24 * 0.85);
  // Let go, it is as it was before the thumb took it: paused.
  expect(await paused(page)).toBe(true);

  // And Play plays from there.
  await button(page, "Play").click();
  await playing(page);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("viewer-counter")).toHaveCount(0, { timeout: 10_000 });
});

test("turned onto its side mid-play, the film re-fits to the new stage, the controls stay on the glass, and it plays on; and back", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const bytes = clipOf({ seconds: 20, width: 320, height: 180 });
  test.skip(bytes === undefined, "ffmpeg is not on this machine");
  await openClip(page, fresh("turned.mp4"), bytes as Buffer);
  await expect(film(page)).toBeAttached({ timeout: 30_000 });
  await playing(page);

  // Upright, a 16:9 film is the stage's width.
  await expect
    .poll(async () => Math.round((await film(page).boundingBox())?.width ?? 0))
    .toBe(UPRIGHT.width);

  await page.setViewportSize(ON_ITS_SIDE);
  // On its side it is the stage's height, in the middle across.
  await expect
    .poll(async () => Math.round((await film(page).boundingBox())?.height ?? 0))
    .toBe(ON_ITS_SIDE.height);
  const box = await film(page).boundingBox();
  if (box === null) throw new Error("The film has no box.");
  near(box.width, (ON_ITS_SIDE.height * 16) / 9);
  near(box.x + box.width / 2, ON_ITS_SIDE.width / 2);
  // It never stopped.
  await playing(page);

  // The bars, on the glass and within it: Close, the transport, and the capsule at the foot.
  await tapStage(page);
  await barsUp(page);
  for (const id of ["viewer-close", "viewer-transport", "viewer-controls"]) {
    const each = await page.getByTestId(id).boundingBox();
    if (each === null) throw new Error(`${id} has no box.`);
    expect(each.x).toBeGreaterThanOrEqual(0);
    expect(each.y).toBeGreaterThanOrEqual(0);
    expect(each.x + each.width).toBeLessThanOrEqual(ON_ITS_SIDE.width);
    expect(each.y + each.height).toBeLessThanOrEqual(ON_ITS_SIDE.height);
  }
  // The shade at the foot runs the glass's whole width, and stops well short of the top.
  const shade = await page.getByTestId("scrim-bottom").boundingBox();
  near(shade?.width, ON_ITS_SIDE.width);
  expect(shade?.height ?? ON_ITS_SIDE.height).toBeLessThan(ON_ITS_SIDE.height / 2);

  // Upright again, the film is the stage's width again, and still playing.
  await page.setViewportSize(UPRIGHT);
  await expect
    .poll(async () => Math.round((await film(page).boundingBox())?.width ?? 0))
    .toBe(UPRIGHT.width);
  await playing(page);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("viewer-counter")).toHaveCount(0, { timeout: 10_000 });
});

test("played to its end, the bars come back with Play, which plays it again from the start; the system player hands it back", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const bytes = clipOf({ seconds: 4, width: 180, height: 320 });
  test.skip(bytes === undefined, "ffmpeg is not on this machine");
  await openClip(page, fresh("ends.mp4"), bytes as Buffer);
  await expect(film(page)).toBeAttached({ timeout: 30_000 });

  // To its end: nothing left, the bars back, and Play.
  await expect(page.getByTestId("viewer-remaining")).toHaveText("−0:00", { timeout: 30_000 });
  await barsUp(page);
  await expect(button(page, "Play")).toBeEnabled();
  expect(await paused(page)).toBe(true);

  // Play goes again, from the start.
  await button(page, "Play").click();
  await expect.poll(async () => await clock(page)).toBeLessThan(2);
  await playing(page);

  // The system player, from the menu: the browser's own controls, and Done hands it back.
  await tapStage(page);
  await button(page, "Pause").click();
  await button(page, "More").click();
  await page.getByText("System player", { exact: true }).click();
  const system = page.getByTestId("viewer-system-player");
  await expect(system).toBeVisible();
  await expect(system.locator("video")).toHaveAttribute("controls", "");
  await button(page, "Close the system player").click();
  await expect(system).toHaveCount(0);
  await expect(page.getByTestId("viewer-controls")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("viewer-counter")).toHaveCount(0, { timeout: 10_000 });
});
