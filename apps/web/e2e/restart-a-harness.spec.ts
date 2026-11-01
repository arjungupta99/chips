/**
 * Restarting a harness (ADR 0094), end to end: a harness on the SDK that takes restarts shows
 * Restart on its card; asked first, the ask goes down the harness's own socket, the card says it
 * is restarting, and its row in the sidebar says Restarting, and when the harness comes back —
 * here it reconnects, as a process restarting itself would — the card says when. The screens, the route and the SDK each have their own
 * tests; this is them against a real server, where the frame, the presence and the directory
 * meet.
 *
 * Named so that the chromium project runs it: a file ending `restart.spec.ts` is the scale
 * project's, which takes the server away.
 */

import { type Chips, connect, type RestartAsk } from "@chipschat/harness";
import { expect, test } from "@playwright/test";
import { pair, registerSpecialist, SERVER } from "./support.ts";

test("a harness restarted from its card hears the ask, and the card follows it back", async ({
  page,
}) => {
  // Named after Scout in the alphabet, so nothing that picks the first harness picks it.
  const rollover = await registerSpecialist("Rollover", undefined, ["restarts"]);
  const asks: RestartAsk[] = [];
  let current: Chips | undefined;
  const open = async (): Promise<Chips> =>
    await connect({
      url: SERVER,
      token: rollover.token,
      client: { name: "rollover", version: "0.0.0" },
      // Its own restart: drop the connection and open a new one, as a new process would.
      onRestart: async (ask) => {
        asks.push(ask);
        current?.close();
        await new Promise((resolve) => setTimeout(resolve, 1500));
        current = await open();
      },
    });
  current = await open();

  try {
    await pair(page);
    await page.getByRole("button", { name: /^Agents/ }).click();
    // Every harness's card, under the shelf's View all (ADR 0185).
    await page.getByRole("button", { name: "View all harnesses" }).click();
    const card = page.getByRole("region", { name: "Rollover" });
    // Its row in the sidebar, which says in a word, in amber, while it can't answer.
    const row = page.getByTestId("fleet").locator("li", { hasText: "Rollover" });
    const go = card.getByTestId("restart-harness");
    await expect(go).toHaveText("Restart Rollover…");

    // Asked first; Cancel is nothing.
    await go.click();
    const asking = page.getByTestId("confirm-dialog");
    await expect(asking).toContainText("Restart Rollover?");
    await asking.getByRole("button", { name: "Cancel" }).click();
    await expect(asking).toHaveCount(0);
    expect(asks).toEqual([]);

    await go.click();
    await page.getByTestId("confirm-dialog").getByTestId("confirm-go").click();
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
    await expect(card.getByTestId("harness-trouble")).toHaveText(/^Restarting · asked by you/);
    await expect(row.getByTestId("fleet-word")).toHaveText("Restarting");
    await expect(row.getByTestId("fleet-word")).toHaveAttribute("data-tone", "amber");
    await expect(go).toBeDisabled();
    await expect.poll(() => asks.length).toBe(1);

    // Back: its new connection ends the restart, for everybody, and this card says when.
    await expect(card.getByTestId("harness-back")).toHaveText(/^Back · /, { timeout: 10_000 });
    await expect(card.getByTestId("harness-trouble")).toHaveCount(0);
    await expect(row.getByTestId("fleet-word")).not.toHaveAttribute("data-tone", "amber");
    await expect(row.getByTestId("fleet-word")).not.toHaveText("Restarting");
    await expect(go).toBeEnabled();
  } finally {
    current?.close();
  }
});
