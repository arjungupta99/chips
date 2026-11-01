/**
 * ADR 0201: an HTML page a harness sends opens in a frame loaded from the server's page door, so
 * its script runs and nothing leaves it — the Bronze mock's Flip flips, as on the phone
 * (`apps/mobile/e2e/media.spec.ts`). Runs in the `served` project: the app as the server itself
 * serves it, which is the one place a browser reaches the door, since a keyed device goes
 * through a tunnel (ADR 0191) and a frame cannot follow it there.
 */

import { expect, test } from "@playwright/test";
import { demo, Harness, newRunId, pair } from "./support.ts";

const SERVER = `http://127.0.0.1:${process.env["CHIPS_E2E_SERVER_PORT"] ?? "4432"}`;

/** A file uploaded by Scout, by its upload's id. */
async function uploadAsHarness(token: string, filename: string, text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const bearer = { authorization: `Bearer ${token}` };
  const slot = await fetch(`${SERVER}/v1/uploads`, {
    method: "POST",
    headers: { ...bearer, "content-type": "application/json" },
    body: JSON.stringify({ filename, byte_size: bytes.byteLength }),
  });
  expect(slot.status).toBe(201);
  const { upload_url: target, attachment_id: id } = (await slot.json()) as {
    upload_url: string;
    attachment_id: string;
  };
  const put = await fetch(`${SERVER}${target}`, {
    method: "PUT",
    headers: { ...bearer, "content-type": "application/octet-stream" },
    body: bytes,
  });
  expect(put.status).toBe(201);
  return id;
}

test("an HTML file a harness sends opens as a page whose script runs, and nothing leaves it (ADR 0201)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await pair(page);
  const harness = await Harness.connect(newRunId());
  try {
    const mock = await uploadAsHarness(
      demo().harness.token,
      "bronze-mock.html",
      '<!doctype html><title>Bronze</title><button id="flip" onclick="this.textContent=\'Flipped\'">Flip</button>',
    );
    await harness.send("run.started", { goal: "Send the mock.", plan: [] });
    expect(
      await harness.send("message.post", { text: "The mock.", upload_ids: [mock] }),
    ).toMatchObject({ frame: "ack" });
    // Closed, or Scout's newest run in the room stays at work and its thinking bubble stands under
    // the room's last line for every spec after this one: the scale project's, which look for it.
    expect(await harness.send("run.completed", { summary: "Sent the mock." })).toMatchObject({
      frame: "ack",
    });

    const card = page.getByRole("button", { name: "Open bronze-mock.html" }).last();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.click();

    // Loaded from the page door, in a frame with scripts and nothing of the app's.
    const frame = page.getByTestId("page-view");
    await expect(frame).toBeVisible({ timeout: 20_000 });
    await expect(frame).toHaveAttribute("src", /\/v1\/pages\/[A-Za-z0-9_-]{43}$/);
    expect(await frame.getAttribute("sandbox")).toBe(
      "allow-scripts allow-popups allow-popups-to-escape-sandbox",
    );
    const inside = frame.contentFrame();
    await inside.getByRole("button", { name: "Flip" }).click();
    await expect(inside.getByRole("button", { name: "Flipped" })).toBeVisible();

    // What the page cannot do: reach the app, or fetch anything, even from its own server.
    const reach = await inside.locator("body").evaluate(() => {
      try {
        return window.parent.document.title;
      } catch (error) {
        return `blocked: ${(error as Error).name}`;
      }
    });
    expect(reach).toBe("blocked: SecurityError");
    const fetched = await inside.locator("body").evaluate(async () => {
      try {
        await fetch("/v1/health");
        return "allowed";
      } catch (error) {
        return `refused: ${(error as Error).name}`;
      }
    });
    expect(fetched).toBe("refused: TypeError");

    // The ticket was spent on the frame's own load: the URL is worth nothing now.
    const url = (await frame.getAttribute("src")) ?? "";
    expect((await fetch(new URL(url, SERVER))).status).toBe(401);

    await page.getByTestId("page-view-dialog").getByRole("button", { name: "Close" }).click();
    await expect(frame).toHaveCount(0, { timeout: 10_000 });
  } finally {
    harness.close();
  }
});
