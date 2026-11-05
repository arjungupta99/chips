/**
 * The phone app in a tablet's window. The same bundle, the same server and the same specs'
 * helpers; only the window is an iPad's, and what that changes is the shape: the bar is a rail
 * on the left, a list and the thing it opens share the screen instead of taking turns, and the
 * media viewer gains the filmstrip and the arrows (the media viewer proposal, §4.4).
 *
 * Playwright runs this under the `tablet` project, at an 11-inch iPad's points. It is the browser's
 * window that is an iPad's and not the device, which is exactly what `useLayout` reads, so this
 * proves the rule that decides — and nothing about a finger on glass, which is the simulator's and
 * the emulator's.
 */

import { expect, test } from "@playwright/test";
import { noisyPng } from "../../web/e2e/png.ts";
import { demo, Harness, newRunId, openRoom, pair, uploadAsHarness } from "./support.ts";

test("the bar is a rail, and a space opens beside the list rather than over it", async ({
  page,
}) => {
  await pair(page);
  const bar = await page.getByTestId("tab-bar").boundingBox();
  expect(bar).not.toBeNull();
  expect(bar?.x).toBe(0);
  expect(bar?.width).toBeLessThan(120);
  expect(bar?.height).toBeGreaterThan(1000);

  await page.getByRole("tab", { name: "Spaces" }).click();
  await expect(page.getByText("Choose a space on the left, or make one with +.")).toBeVisible();
  // The row by its name alone: the room, once open, names itself on its capsule too, with who is
  // here after it (ADR 0177).
  const row = page.getByRole("button", { name: "PO-4471", exact: true });
  await row.click();
  await expect(page.getByTestId("composer")).toBeVisible({ timeout: 20_000 });
  // The list is still there beside the room, and the row that is open says so.
  await expect(page.getByTestId("space-list")).toBeVisible();
  await expect(row).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("room-capsule")).toHaveAccessibleName("PO-4471, who is here");
  // For the eye as well as the assertions: what the split looks like, in the run's own output.
  await page.screenshot({ path: test.info().outputPath("spaces-split.png") });
});

test("a harness opens beside the Agents list", async ({ page }) => {
  await pair(page);
  await page.getByRole("tab", { name: "Agents" }).click();
  await expect(page.getByText("Choose an agent on the left.")).toBeVisible();
  // The harness's tile on the shelf (ADR 0185), not its agent's row, which is named for it too.
  const tile = page
    .getByTestId("harness-shelf")
    .getByRole("button", { name: "Scout", exact: true });
  await tile.click();
  await expect(page.getByRole("heading", { name: "Scout" })).toBeVisible();
  await expect(page.getByTestId("harness-asks-row")).toBeVisible();
  await expect(tile).toHaveAttribute("aria-selected", "true");
  await page.screenshot({ path: test.info().outputPath("harnesses-split.png") });
  // When it asks you opens in the same pane (ADR 0254), and goes back to the harness's page.
  await page.getByTestId("harness-asks-row").click();
  await expect(page.getByRole("heading", { name: "When it asks you" })).toBeVisible();
  await expect(page.getByText("How far it is trusted")).toBeVisible();
  await page.getByTestId("pane-back").click();
  await expect(page.getByRole("heading", { name: "Scout" })).toBeVisible();
});

// Beside a pane the list has the room for every harness, so its shelf is a grid of all of them and
// there is no View all (ADR 0256); a phone's narrow shelf keeps it.
test("every harness stands in the Agents list's grid, with no View all", async ({ page }) => {
  await pair(page);
  await page.getByRole("tab", { name: "Agents" }).click();
  const grid = page.getByTestId("harness-shelf");
  await expect(grid.getByRole("button", { name: "Scout", exact: true })).toBeVisible();
  await expect(page.getByLabel("View all harnesses")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("harnesses-grid-split.png") });
});

test("an agent's card and its message history open beside the Agents list (ADR 0087)", async ({
  page,
}) => {
  await pair(page);
  await page.getByRole("tab", { name: "Agents" }).click();
  // Scout's agent is wherever the specs before this one left it, under whatever first name it
  // was given (ADR 0150): found by its harness, which its row names before the room it is in,
  // "Hollis, Scout · in Kitchen remodel".
  const inRoom = new RegExp(`^[^,]+, ${demo().harness.displayName} · in `);
  const row = page.getByRole("button", { name: inRoom }).first();
  const room = String(await row.getAttribute("aria-label")).replace(inRoom, "");
  await row.click();
  await expect(page.getByTestId("agent-room")).toContainText(room);
  await page.getByTestId("agent-history").click();
  await expect(page.getByRole("button", { name: new RegExp(`^${room}, `) })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("agent-history-split.png") });
});

test("the viewer covers the wide window with a filmstrip and arrows, and a narrow one has neither", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await pair(page);
  const harness = await Harness.connect(newRunId());
  try {
    const first = await uploadAsHarness("plan-01.png", noisyPng(640, 480));
    const second = await uploadAsHarness("plan-02.png", noisyPng(480, 640));
    await harness.send("run.started", { goal: "Send the plans.", plan: [] });
    expect(
      await harness.send("message.post", {
        text: "The two plans.",
        upload_ids: [first, second],
      }),
    ).toMatchObject({ frame: "ack" });

    await openRoom(page);
    const tile = page.getByLabel("Open plan-01.png").last();
    await expect(tile).toBeVisible({ timeout: 30_000 });
    await tile.click();

    // Over the whole window, not the pane: the split is behind it, and the room's list with it.
    const counter = page.getByTestId("viewer-counter");
    await expect(counter).toHaveText(/^\d+ of \d+$/, { timeout: 20_000 });
    const stage = await page.getByTestId("stage").boundingBox();
    const window = page.viewportSize();
    expect(stage?.width).toBe(window?.width);
    expect(stage?.height).toBe(window?.height);

    // The strip is there, it holds the whole deck, and the one on the stage is the one marked.
    const strip = page.getByTestId("viewer-filmstrip");
    await expect(strip).toBeVisible();
    const [place, count] = ((await counter.textContent()) ?? "").split(" of ").map(Number);
    await expect(strip.getByRole("button")).toHaveCount(count ?? 0);
    await expect(
      strip.getByRole("button", { name: `Photo ${place} of ${count}, plan-01.png` }),
    ).toHaveAttribute("aria-selected", "true");

    // An arrow pages, and the strip follows what the stage stands on.
    await page.getByRole("button", { name: "Next" }).click();
    await expect(counter).toHaveText(`${count} of ${count}`);
    await expect(page.getByTestId("viewer-caption")).toContainText("plan-02.png");
    await expect(
      strip.getByRole("button", { name: `Photo ${count} of ${count}, plan-02.png` }),
    ).toHaveAttribute("aria-selected", "true");

    // For the eye as well as the assertions, beside figure 10: the viewer over the whole window,
    // the filmstrip under the caption, the arrows at the sides.
    await page.screenshot({ path: test.info().outputPath("viewer-wide.png") });

    // And a thumb goes straight there, which is what the strip is for.
    await strip.getByRole("button", { name: `Photo ${place} of ${count}, plan-01.png` }).click();
    await expect(counter).toHaveText(`${place} of ${count}`);
    await expect(page.getByTestId("viewer-caption")).toContainText("plan-01.png");

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("viewer-counter")).toHaveCount(0, { timeout: 10_000 });

    // The same room in a phone's window is the phone's viewer: no strip. The arrows stay, because
    // a browser has a pointer at any size and a pointer cannot swipe.
    //
    // The window is narrowed with the viewer shut and the room opened again, rather than under the
    // open viewer: wide to narrow takes the split apart, and the app lands back on the list with
    // the room — and anything over it — gone. That is the shell's, not the viewer's, and it is the
    // same whether a viewer is up or a room is merely being read.
    await page.setViewportSize({ width: 393, height: 852 });
    await openRoom(page);
    await page.getByLabel("Open plan-01.png").last().click();
    await expect(page.getByTestId("viewer-counter")).toHaveText(/^\d+ of \d+$/, {
      timeout: 20_000,
    });
    await expect(page.getByTestId("viewer-filmstrip")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Next" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("viewer-counter")).toHaveCount(0, { timeout: 10_000 });
  } finally {
    harness.close();
  }
});
