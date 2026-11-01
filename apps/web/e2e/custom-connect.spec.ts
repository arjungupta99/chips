/**
 * M1.6 acceptance: Custom connect, from token to first message, timed. A person adds a harness
 * in the app and gets a token; a harness connects with it through `@chipschat/harness`, says hello
 * in the space it was given, and the checklist row lights. Well under five minutes.
 */

import { connect } from "@chipschat/harness";
import { expect, test } from "@playwright/test";
import { openAddHarnessForm, pair, SERVER } from "./support.ts";

test("Custom connect: from token to first message in under five minutes", async ({ page }) => {
  await pair(page);
  await openAddHarnessForm(page);
  await page.getByLabel("Name").fill("Relay bot");
  await page.getByRole("button", { name: "Create and get a token" }).click();

  const started = Date.now();
  const token = await page.getByTestId("harness-token").textContent();
  const spaceId = await page.getByTestId("dm-id").textContent();
  expect(token).toMatch(/^chips_at_/);
  expect(spaceId).toMatch(/^spc_/);
  await expect(page.getByTestId("curl-lines")).toContainText(spaceId ?? "");
  await expect(page.getByTestId("new-harness").getByTestId("check-message.post")).toHaveAttribute(
    "data-lit",
    "false",
  );

  // The second curl line, as curl would send it: the token speaks for the harness over HTTP.
  const harnessId = (await page.getByTestId("new-harness").getAttribute("data-harness-id")) ?? "";
  const curl = await fetch(`${SERVER}/v1/harnesses/${harnessId}/events`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      type: "message.post",
      space_id: spaceId,
      text: "Hello from curl",
      idempotency_key: "hello-curl",
    }),
  });
  expect(curl.status).toBe(201);
  await expect(page.getByTestId("new-harness").getByTestId("check-message.post")).toHaveAttribute(
    "data-lit",
    "true",
  );

  // The harness side: connect with the token, say something.
  const chips = await connect({
    url: SERVER,
    token: token ?? "",
    client: { name: "relay-bot", version: "0.0.0" },
  });
  try {
    expect(chips.autonomy).toBe(1);
    expect(chips.hello.harnesses[0]?.display_name).toBe("Relay bot");
    await chips.post({ spaceId: spaceId ?? "", text: "Hello from my harness" });

    // The checklist lights, live.
    await expect(page.getByTestId("new-harness").getByTestId("check-message.post")).toHaveAttribute(
      "data-lit",
      "true",
    );
    const elapsed = (Date.now() - started) / 1000;
    test.info().annotations.push({
      type: "timing",
      description: `Custom connect: token to first message in ${elapsed.toFixed(1)} s`,
    });
    expect(elapsed).toBeLessThan(300);

    // And the message is in the room the harness was given.
    await page.getByTestId("new-harness").getByRole("button", { name: "Open space" }).click();
    await expect(page.getByTestId("messages").getByText("Hello from my harness")).toBeVisible();
    await expect(page.getByRole("button", { name: /Relay bot/ }).first()).toBeVisible();
  } finally {
    chips.close();
  }
});
