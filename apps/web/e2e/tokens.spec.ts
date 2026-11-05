/**
 * Condition 2 of the Phase 1 review, end to end: a token can be withdrawn from the app, and
 * withdrawing it stops the harness at once — the socket it is holding closes, and its next
 * request is refused (ADR 0023).
 *
 * The screen and the route each have their own tests; this is the two of them against a real
 * server, which is the only place the socket's closing can be seen.
 */

import { expect, test } from "@playwright/test";
import { openAddHarnessForm, pair, SERVER } from "./support.ts";

test("a token is revoked from the app, and the harness stops speaking", async ({ page }) => {
  await pair(page);
  await openAddHarnessForm(page);
  await page.getByLabel("Name").fill("Doomed bot");
  await page.getByRole("button", { name: "Create and get a token" }).click();

  const token = (await page.getByTestId("harness-token").textContent()) ?? "";
  const spaceId = (await page.getByTestId("dm-id").textContent()) ?? "";
  const harnessId = (await page.getByTestId("new-harness").getAttribute("data-harness-id")) ?? "";
  expect(token).toMatch(/^chips_at_/);
  // Exactly: a room whose last line starts "Done:" is a button too.
  await page.getByRole("button", { name: "Done", exact: true }).click();
  // Every harness's card, under the shelf's View all (ADR 0185), and Doomed bot's page from its
  // card (ADR 0254), whose Connection group opens its tokens.
  await page.getByRole("button", { name: "View all harnesses" }).click();
  await page.getByTestId("harnesses-list").getByRole("button", { name: "Doomed bot" }).click();

  // The harness is holding a socket when the token is withdrawn.
  const socket = new WebSocket(`${SERVER.replace("http", "ws")}/v1/ws?token=${token}`);
  const closed = new Promise<number>((resolve) => {
    socket.addEventListener("close", (event) => resolve(event.code));
  });
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () => reject(new Error("the harness's socket failed")));
  });

  // Tokens is a row of its Connection group, opening a page over it (ADR 0273).
  await page.getByRole("region", { name: "Doomed bot" }).getByTestId("harness-tokens-row").click();
  const tokens = page.getByRole("main", { name: "Doomed bot: Tokens" });
  const row = tokens.getByTestId("token-row");
  await expect(row).toHaveCount(1);
  // The list says what a token is, and never what it is: Chips holds only the digest.
  await expect(row).not.toContainText("chips_at_");
  await row.getByRole("button", { name: "Revoke" }).click();
  await expect(row).toHaveAttribute("data-revoked", "true");

  // 4001: the credential this socket was opened with has been withdrawn.
  expect(await closed).toBe(4001);

  // And the next request with it is refused, rather than working until something notices.
  const after = await fetch(`${SERVER}/v1/harnesses/${harnessId}/events`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      type: "message.post",
      space_id: spaceId,
      text: "Still here?",
      idempotency_key: "after-revocation",
    }),
  });
  expect(after.status).toBe(401);
});
