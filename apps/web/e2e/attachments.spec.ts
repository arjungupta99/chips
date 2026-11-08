/**
 * M1.5 acceptance: a 20 MB photo uploads with a thumbnail; the harness downloads it and the audit
 * log shows the fetch; an uploaded `.html` file downloads instead of rendering.
 */

import { expect, type Page, test } from "@playwright/test";
import { blankPdf, noisyPng } from "./png.ts";
import { demo, Harness, newRunId, openLog, openYouRow, pair } from "./support.ts";

test.describe.configure({ mode: "serial" });

const composerSend = (page: Page) => page.getByRole("button", { name: "Send", exact: true });

/** Attach through the picker and wait for the upload to finish. */
async function attach(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await page.getByTestId("file-picker").setInputFiles(file);
  const chip = page.getByRole("list", { name: "Attachments" }).getByText(file.name);
  await expect(chip).toBeVisible();
  await expect(page.getByRole("list", { name: "Attachments" })).not.toContainText("uploading…", {
    timeout: 60_000,
  });
}

test("a 20 MB photo uploads with a thumbnail, the harness fetches it, and the audit says so", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await pair(page);
  const harness = await Harness.connect(newRunId());
  try {
    const png = noisyPng(2700, 2700);
    expect(png.byteLength).toBeGreaterThan(20 * 1024 * 1024);

    await attach(page, { name: "holiday.png", mimeType: "image/png", buffer: png });
    await page.getByLabel(/^Message /).fill("Here's the photo from the site visit.");
    await composerSend(page).click();

    // The grid shows the thumbnail the server made, fetched through the device's signature.
    const grid = page.getByTestId("photo-grid").last();
    await expect(grid.locator("img")).toHaveAttribute("src", /^blob:/, { timeout: 30_000 });
    await expect(grid.locator("img")).toHaveAttribute("alt", "holiday.png");

    // The harness hears it as `message.new`, with a URL it can fetch — and fetches it.
    const heard = await harness.next("message.new");
    const [file] = heard["attachments"] as { url: string; mime_type: string; byte_size: number }[];
    expect(file?.mime_type).toBe("image/png");
    const response = await fetch(file?.url ?? "", {
      headers: { authorization: `Bearer ${demo().harness.token}` },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect((await response.arrayBuffer()).byteLength).toBe(file?.byte_size);

    // Every harness fetch is an audit event.
    await expect(page.getByTestId("fetch-line").last()).toHaveText("Scout read holiday.png");
    await openLog(page);
    await expect(
      page
        .getByTestId("audit")
        .getByRole("listitem")
        .filter({ hasText: "read holiday.png" })
        .last(),
    ).toBeVisible();
  } finally {
    harness.close();
  }
});

test("an uploaded .html file is a download, never a page; a PDF shows its first page and opens", async ({
  page,
}) => {
  await pair(page);
  const harness = await Harness.connect(newRunId());
  try {
    await attach(page, {
      name: "report.html",
      mimeType: "text/html",
      buffer: Buffer.from("<!doctype html><script>alert(1)</script>"),
    });
    await attach(page, { name: "invoice.pdf", mimeType: "application/pdf", buffer: blankPdf() });
    await composerSend(page).click();

    const cards = page.getByTestId("file-card");
    await expect(cards.filter({ hasText: "report.html" }).last()).toBeVisible();
    const pdfCard = cards.filter({ hasText: "invoice.pdf" }).last();
    await expect(pdfCard.getByTestId("pdf-preview")).toHaveAttribute("data", /^blob:/, {
      timeout: 30_000,
    });

    // ADR 0125: a click opens the PDF in the page view, drawn by the browser's viewer, not a download.
    await pdfCard.getByRole("button", { name: "Open invoice.pdf" }).click();
    const pdf = page.getByTestId("page-view-pdf");
    await expect(pdf).toHaveAttribute("type", "application/pdf");
    await expect(pdf).toHaveAttribute("data", /^blob:/);
    const dialog = page.getByTestId("page-view-dialog");
    await expect(dialog.getByRole("button", { name: "Download" })).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toHaveCount(0);

    const heard = await harness.next("message.new");
    const files = heard["attachments"] as { url: string; filename: string; mime_type: string }[];
    const html = files.find((each) => each.filename === "report.html");
    expect(html?.mime_type).toBe("text/html");
    const response = await fetch(html?.url ?? "", {
      headers: { authorization: `Bearer ${demo().harness.token}` },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="report.html"');
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");

    // The same link is worth nothing to anyone else.
    expect((await fetch(html?.url ?? "")).status).toBe(401);
  } finally {
    harness.close();
  }
});

/**
 * ADR 0123: a `.md` file opens as a page made from it, formatted, in a frame that runs nothing —
 * the walking tour Mission Murals was sent, which downloaded on the Mac. The author's HTML is an
 * element with a handler: a `<script>` in the first kilobyte would make the server call the file
 * HTML (`sniff.ts`), and it would open as the page it then is.
 */
test("a .md file opens as a formatted page, and the author's HTML is words", async ({ page }) => {
  await pair(page);
  await attach(page, {
    name: "mission-murals-walking-tour.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      "# Mission murals\n\n- **MaestraPeace:** [NoeHill](https://noehill.com)\n\n" +
        "| Stop | Café |\n|---|---|\n| 1 | Linea |\n\n<img src=x onerror=\"document.title = 'ran'\">\n",
    ),
  });
  await composerSend(page).click();
  await page.getByRole("button", { name: "Open mission-murals-walking-tour.md" }).last().click();

  const doc = page.frameLocator('[data-testid="page-view"]');
  await expect(doc.locator("h1")).toHaveText("Mission murals");
  await expect(doc.locator("li strong")).toHaveText("MaestraPeace:");
  await expect(doc.getByRole("link", { name: "NoeHill" })).toHaveAttribute("target", "_blank");
  await expect(doc.locator("td").last()).toHaveText("Linea");
  await expect(doc.locator("body")).toContainText(`<img src=x onerror="document.title = 'ran'">`);
  await expect(doc.locator("img")).toHaveCount(0);
  await expect(
    page.getByTestId("page-view-dialog").getByRole("button", { name: "Download" }),
  ).toBeVisible();
});

/**
 * ADR 0047: an owner caps photos from You; the composer refuses a photo over it with the
 * server's own sentence and uploads nothing; the server refuses the same photo at the slot when
 * asked directly. The cap is lifted again at the end, since the demo workspace is shared.
 */
test("a cap set in You stops a photo at the chip, and at the server's door", async ({ page }) => {
  await pair(page);
  /** Attachment limits' form, on its page beside You's list (ADR 0265 and its addendum). */
  const caps = async () => {
    await openYouRow(page, "caps-row");
    return page.getByTestId("attachment-caps");
  };
  let section = await caps();
  await expect(section.getByTestId("caps-words")).toContainText("Photos up to the server's");
  await section.getByLabel("Photos").fill("1");
  await section.getByTestId("attachment-caps-save").click();
  await expect(section).toHaveCount(0);
  section = await caps();
  await expect(section.getByTestId("caps-words")).toContainText("Photos up to 1 MB", {
    timeout: 20_000,
  });
  await section.getByTestId("attachment-caps-cancel").click();
  await expect(section).toHaveCount(0);

  try {
    await page.getByRole("button", { name: "Spaces", exact: true }).click();
    await page
      .getByTestId("space-list")
      .getByRole("button", { name: /PO-4471/ })
      .click();
    await page.getByTestId("file-picker").setInputFiles({
      name: "big.png",
      mimeType: "image/png",
      buffer: noisyPng(1200, 1200),
    });
    const chips = page.getByRole("list", { name: "Attachments" });
    await expect(chips).toContainText("Photos here are capped at 1 MB, and this one is");
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  } finally {
    section = await caps();
    await section.getByLabel("Photos").fill("");
    await section.getByTestId("attachment-caps-save").click();
    await expect(section).toHaveCount(0);
    section = await caps();
    await expect(section.getByTestId("caps-words")).toContainText("Photos up to the server's", {
      timeout: 20_000,
    });
  }
});

// Phase 4's spec — a clip plays from a grant, which the player asks runs of — moved to
// `viewer.spec.ts` on 16 September 2026 with the player itself: §4.3 took the in-row player onto
// the viewer's stage, and the row keeps its poster and its Download.
