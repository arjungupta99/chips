/**
 * J3 (ADR 0122): the phone allows a harness that asks. The phone is paired as the workspace's
 * owner; a harness asks to join, over the same HTTP a connector uses; the sheet opens on its own,
 * with the code the harness was given; one capability is turned off and the rest allowed; and the
 * harness collects exactly what was left on.
 */

import { expect, test } from "@playwright/test";
import { pair, SERVER } from "./support.ts";

test("J3: the phone's sheet allows a harness that asks, with one capability off", async ({
  page,
}) => {
  // Whatever an earlier run left waiting expires first: the requests' clock moves on.
  await fetch(`${SERVER}/v1/dev/join-clock`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ advance_seconds: 601 }),
  });
  await pair(page);

  const asked = await fetch(`${SERVER}/v1/join`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "10.30.0.1" },
    body: JSON.stringify({
      name: "Tide",
      software: "tide 0.4.1",
      machine: "vps-fra-1",
      wants: ["autonomy", "new_spaces", "restarts"],
    }),
  });
  expect(asked.status).toBe(201);
  const { request_id, secret, code } = (await asked.json()) as Record<string, string>;

  const sheet = page.getByTestId("join-sheet");
  await expect(sheet.getByText("Tide wants to join")).toBeVisible();
  await expect(sheet.getByTestId("join-code")).toHaveText(code ?? "");
  await sheet.getByRole("switch", { name: "Be restarted from Chips" }).click();
  await sheet.getByRole("button", { name: "Allow", exact: true }).click();

  let collected: Record<string, unknown> = {};
  await expect
    .poll(async () => {
      const polled = await fetch(`${SERVER}/v1/join/${request_id}/redeem`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      collected = (await polled.json()) as Record<string, unknown>;
      return polled.status;
    })
    .toBe(200);
  expect(collected).toMatchObject({ kind: "harness", capabilities: ["autonomy", "new_spaces"] });
  // The sheet hears that it collected its key.
  await expect(sheet.getByText("Tide joined")).toBeVisible();
});
