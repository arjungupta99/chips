/**
 * Deleting your own account (ADR 0243): somebody who joined opens You, is told what goes and what
 * stays, types the workspace's name, and deletes. Their tab says they left, not that they were
 * removed; OK forgets the key. The rooms they were in say they left the workspace, and what they
 * said stays under their name. Their harness goes to an owner.
 *
 * The only owner's refusal is the server's tests' and core's (`delete-account.test.ts`,
 * `removal.test.ts`): this suite's server is shared, and another spec may have made an owner.
 */

import { registerSpecialist } from "../../apps/web/e2e/support.ts";
import {
  addMember,
  aName,
  asOwner,
  closeSheet,
  expect,
  invite,
  join,
  newRoom,
  openSpace,
  openYou,
  openYouPage,
  personId,
  roomLines,
  say,
  test,
} from "./support.ts";

test("she deletes her account, is told she left, and the rooms say so", async ({
  page,
  browser,
}) => {
  const owner = await asOwner(page);
  const title = `Florist ${test.info().project.name}`;
  const dana = await join(browser, await invite(owner), aName("Dana"));
  try {
    const id = await personId(owner, dana.name);
    const ledger = await registerSpecialist(`Ledger ${dana.name.split(" ")[1]}`, id);
    await newRoom(owner, title);
    await addMember(owner, { id });
    await closeSheet(owner);
    await openSpace(dana.page, title);
    await say(dana.page, "Leaving you the tulip order.");

    // She is told what goes and what stays, on its page (ADR 0265's addendum), and its button
    // asks the last time, where Delete waits for the workspace's name.
    await openYou(dana.page);
    await dana.page.getByTestId("delete-account").click();
    const told = dana.page.getByTestId("delete-account-page");
    await expect(told.getByRole("heading", { level: 2 })).toHaveText("Delete your account");
    await expect(told.getByTestId("delete-goes")).toContainText(
      "This device and its sign-in, and push to it",
    );
    await expect(told.getByTestId("delete-stays")).toContainText(
      `${ledger.name}, which you connected: it goes to`,
    );
    await told.getByTestId("delete-account-ask").click();
    const dialog = dana.page.getByTestId("delete-account-dialog");
    const confirm = dialog.getByTestId("delete-account-confirm");
    await expect(confirm).toBeDisabled();
    await dialog.getByTestId("delete-account-typed").fill("demo");
    await expect(confirm).toBeEnabled();
    await confirm.click();

    // Her tab says she left, in place of everything.
    const left = dana.page.getByTestId("removed");
    await expect(left).toBeVisible({ timeout: 10_000 });
    await expect(left.getByRole("heading")).toHaveText("You've left Demo");
    await expect(left).toContainText("Your account there is deleted.");

    // The room says she left the workspace, and what she said keeps her name.
    await openSpace(owner, title);
    await expect(roomLines(owner)).toContainText(`${dana.name} left the workspace`);
    await expect(roomLines(owner)).toContainText("Leaving you the tulip order.");
    await openYouPage(owner, "people-row");
    await expect(owner.getByTestId("person-row").filter({ hasText: dana.name })).toHaveCount(0);

    // OK forgets the key: the first screen, with no "pair again".
    await left.getByRole("button", { name: "OK" }).click();
    await expect(dana.page.getByText(/does not know this browser/)).toHaveCount(0);
  } finally {
    await dana.context.close();
  }
});
