/**
 * M4.4, end to end on the web target: a photo goes from the phone's composer to the room and to
 * the harness, sent from the viewer its chip opens (the media viewer, Phase 7); what a harness sends arrives as a file that opens and a video that opens the media
 * viewer (whose own playing is `viewer.spec.ts`'s); and a cap set in You stops a photo at the chip
 * before a byte of it is uploaded (ADR 0047).
 *
 * The pickers are the platform's, which on the web target is a file input Playwright can feed;
 * a camera and a share sheet are not here, and the Maestro flows beside this directory say so.
 */

import { expect, type Page, test } from "@playwright/test";
import { blankPdf, noisyPng } from "../../web/e2e/png.ts";
import { demo, Harness, newRunId, pair, SERVER } from "./support.ts";

test.describe.configure({ mode: "serial" });

/** The golden room, from the Spaces tab. */
async function openRoom(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Spaces" }).click();
  await page
    .getByText(/PO-4471/)
    .first()
    .click();
  await expect(page.getByTestId("composer")).toBeVisible({ timeout: 20_000 });
}

/** Attach through the Files choice, which on the web target is a file input. */
async function attach(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach" }).click();
  await page.getByTestId("attach-files").click();
  await (await chooser).setFiles(file);
  await expect(page.getByTestId("staged")).toContainText(file.name);
}

/** What a harness uploads, over the same two requests a phone makes, with its own token. */
async function uploadAsHarness(name: string, bytes: Buffer): Promise<string> {
  const token = demo().harness.token;
  const slot = await fetch(`${SERVER}/v1/uploads`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ filename: name, byte_size: bytes.byteLength }),
  });
  expect(slot.status).toBe(201);
  const { attachment_id, upload_url } = (await slot.json()) as {
    attachment_id: string;
    upload_url: string;
  };
  const put = await fetch(`${SERVER}${upload_url}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/octet-stream" },
    body: new Uint8Array(bytes),
  });
  expect(put.status).toBe(201);
  return attachment_id;
}

test("a photo goes from the composer to the room and to the harness, looked at before it goes", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await pair(page);
  const harness = await Harness.connect(newRunId());
  try {
    await openRoom(page);
    await attach(page, { name: "holiday.png", mimeType: "image/png", buffer: noisyPng(600, 400) });
    await expect(page.getByTestId("staged")).not.toContainText("uploading", { timeout: 60_000 });

    // Its chip opens the viewer over the file in the browser, before a message exists, and Send
    // stands where the composer's does. A file from the Files choice says nothing of its size, so
    // this is also the viewer reading the picture's shape for itself.
    const composerSend = await page.getByTestId("composer-send").boundingBox();
    // An image button has no role on the web target, as the room's tiles have none: by its label.
    await page.getByLabel("Look at holiday.png").click();
    await expect(page.getByText("You · Not sent yet")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("viewer-counter")).toHaveCount(0);
    const viewerSend = page.getByTestId("staged-viewer-send");
    const there = await viewerSend.boundingBox();
    expect(Math.abs((there?.x ?? 0) - (composerSend?.x ?? -9))).toBeLessThanOrEqual(1);
    expect(Math.abs((there?.y ?? 0) - (composerSend?.y ?? -9))).toBeLessThanOrEqual(1);
    await viewerSend.click();
    await expect(page.getByText("You · Not sent yet")).toHaveCount(0, { timeout: 10_000 });

    // The grid shows the thumbnail the server made, fetched through the device's signature.
    await expect(page.getByLabel("holiday.png").last()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("staged")).toHaveCount(0);

    // The harness hears it as `message.new`, with a URL it can fetch.
    const heard = await harness.next("message.new");
    const [file] = heard["attachments"] as { url: string; mime_type: string; byte_size: number }[];
    expect(file?.mime_type).toBe("image/png");
    const response = await fetch(file?.url ?? "", {
      headers: { authorization: `Bearer ${demo().harness.token}` },
    });
    expect(response.status).toBe(200);
  } finally {
    harness.close();
  }
});

test("what a harness sends arrives as a file that opens and a video that opens the viewer", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await pair(page);
  const harness = await Harness.connect(newRunId());
  try {
    const pdf = await uploadAsHarness("invoice.pdf", blankPdf());
    // Bytes wearing an MP4's `ftyp`: the server calls it a video it cannot measure, and the phone
    // draws it as a row whose Play opens the viewer on it alone.
    const clip = Buffer.alloc(4096);
    clip.writeUInt32BE(0x18, 0);
    clip.write("ftypisom", 4, "latin1");
    const video = await uploadAsHarness("clip.mp4", clip);
    // The helper posts into its run, so the run exists first, as a real harness's would.
    await harness.send("run.started", { goal: "Send the invoice and the clip.", plan: [] });
    expect(
      await harness.send("message.post", {
        text: "The invoice, and the clip from the site.",
        upload_ids: [pdf, video],
      }),
    ).toMatchObject({ frame: "ack" });

    await openRoom(page);
    const invoice = page.getByRole("button", { name: "Open invoice.pdf" }).last();
    await expect(invoice).toBeVisible({ timeout: 30_000 });
    const download = page.waitForEvent("download");
    await invoice.click();
    expect((await download).suggestedFilename()).toBe("invoice.pdf");

    await page.getByRole("button", { name: "Play clip.mp4" }).last().click();
    await expect(page.getByTestId("viewer-counter")).toHaveText("1 of 1", { timeout: 20_000 });
    await expect(page.getByTestId("viewer-caption")).toContainText("clip.mp4");
    await page.getByTestId("viewer-close").click();
    await expect(page.getByTestId("viewer-counter")).toHaveCount(0, { timeout: 10_000 });
  } finally {
    harness.close();
  }
});

test("an HTML file a harness sends opens as a page in the app, sandboxed (ADR 0059)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await pair(page);
  const harness = await Harness.connect(newRunId());
  try {
    const html = Buffer.from(
      '<!doctype html><title>Bronze</title><button id="flip" onclick="this.textContent=\'Flipped\'">Flip</button>',
    );
    const mock = await uploadAsHarness("bronze-mock.html", html);
    await harness.send("run.started", { goal: "Send the mock.", plan: [] });
    expect(
      await harness.send("message.post", { text: "The mock.", upload_ids: [mock] }),
    ).toMatchObject({ frame: "ack" });

    await openRoom(page);
    const row = page.getByRole("button", { name: "Open bronze-mock.html" }).last();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.click();

    // Drawn in the app, not downloaded: an iframe with scripts and nothing of the app's.
    const frame = page.locator('iframe[title="bronze-mock.html"]');
    await expect(frame).toBeVisible({ timeout: 20_000 });
    expect(await frame.getAttribute("sandbox")).toBe(
      "allow-scripts allow-popups allow-popups-to-escape-sandbox",
    );
    const inside = frame.contentFrame();
    await inside.getByRole("button", { name: "Flip" }).click();
    await expect(inside.getByRole("button", { name: "Flipped" })).toBeVisible();
    const reach = await inside.locator("body").evaluate(() => {
      try {
        return window.parent.document.title;
      } catch (error) {
        return `blocked: ${(error as Error).name}`;
      }
    });
    expect(reach).toBe("blocked: SecurityError");

    // Share is still the download it always was.
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Share bronze-mock.html" }).click();
    expect((await download).suggestedFilename()).toBe("bronze-mock.html");
    await page.getByRole("button", { name: "Close the page" }).click();
    await expect(frame).toHaveCount(0, { timeout: 10_000 });
  } finally {
    harness.close();
  }
});

test("a cap set in You stops a photo at the chip, before a byte of it is uploaded", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await pair(page);
  await page.getByRole("tab", { name: "You", exact: true }).click();
  // The workspace's own group, an owner's (ADR 0085): the row says the limit, its sheet sets it.
  const limits = page.getByTestId("caps-row");
  await expect(limits).toContainText("100 MB");
  await limits.click();
  await expect(page.getByTestId("caps-words")).toContainText("Photos up to the server's");
  await page.getByLabel("Photos").fill("1");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(limits).toContainText("1–100 MB", { timeout: 20_000 });

  try {
    await openRoom(page);
    await attach(page, { name: "big.png", mimeType: "image/png", buffer: noisyPng(900, 900) });
    await expect(page.getByTestId("staged")).toContainText(
      "Photos here are capped at 1 MB, and this one is",
    );
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  } finally {
    // The room sits over the tabs; back to them first, then the cap is lifted again.
    await page.goBack();
    await page.getByRole("tab", { name: "You", exact: true }).click();
    await limits.click();
    await page.getByLabel("Photos").fill("");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(limits).toContainText(/^[^–]*100 MB/, { timeout: 20_000 });
  }
});
