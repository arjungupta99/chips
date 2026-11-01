/**
 * What each role is offered, in the browser (ADR 0196), in a room with an agent, the owner, an
 * admin, a member and a guest: the + is an owner's and an admin's; Spend per job opens for the
 * owner alone, is shown to a member with who sets it, and not shown to a guest; Lead is chosen by
 * anybody but a guest, whose tile opens nothing. `roles.wire.spec.ts` holds the server to the same.
 */

import { demo, registerAgent } from "../../apps/web/e2e/support.ts";
import {
  addMember,
  aName,
  asOwner,
  closeSheet,
  expect,
  invite,
  type Joined,
  join,
  newRoom,
  OWNER,
  openSpace,
  personId,
  roomSheet,
  test,
} from "./support.ts";

test("the + is an owner's and an admin's; Spend opens for the owner alone, a member is told who sets it, a guest sees none; a guest's Lead opens nothing", async ({
  page,
  browser,
}) => {
  const owner = await asOwner(page);
  const title = `Kitchen roles ${test.info().project.name} ${Date.now() % 10_000}`;
  const agent = await registerAgent(demo().harness, `roles-${Date.now()}`, "Sous Chef");
  const people: Joined[] = [];
  try {
    const admin = await join(browser, await invite(owner, "admin"), aName("Asha"));
    const member = await join(browser, await invite(owner, "member"), aName("Meera"));
    const guest = await join(browser, await invite(owner, "guest"), aName("Gita"));
    people.push(admin, member, guest);
    const ids = await Promise.all(people.map((each) => personId(owner, each.name)));
    await newRoom(owner, title);
    await addMember(owner, { id: agent });
    for (const id of ids) await addMember(owner, { id });
    await closeSheet(owner);

    // The owner: Spend opens, Lead opens.
    const ownersSheet = await roomSheet(owner);
    await expect(ownersSheet.getByRole("button", { name: /^Spend per job/ })).toBeVisible();
    await expect(ownersSheet.getByRole("button", { name: /^Lead,/ })).toBeVisible();
    await closeSheet(owner);

    for (const [who, mayOpen] of [
      [admin, true],
      [member, false],
      [guest, false],
    ] as const) {
      const room = await openSpace(who.page, title);
      await expect(room).toBeVisible();
      // The + beside Recent, and anywhere else, only for those who may open a space.
      const menu = who.page.getByTestId("narrow-menu");
      if (await menu.isVisible()) await menu.click();
      await expect(who.page.getByRole("button", { name: "Create new space" })).toHaveCount(
        mayOpen ? 1 : 0,
      );
      if (await menu.isVisible()) await who.page.keyboard.press("Escape");
    }

    // A member: Spend is shown, opens nothing, and says the owner sets it; Lead opens.
    const membersSheet = await roomSheet(member.page);
    const spend = membersSheet.getByTestId("room-sheet-spend");
    await expect(spend).toBeVisible();
    await expect(membersSheet.getByRole("button", { name: /^Spend per job/ })).toHaveCount(0);
    await expect(spend).toHaveAttribute("title", new RegExp(`${OWNER} sets it`));
    await expect(membersSheet.getByRole("button", { name: /^Lead,/ })).toBeVisible();
    await closeSheet(member.page);

    // A guest: no Spend at all; Lead says who leads, and opens nothing; no Add.
    const guestsSheet = await roomSheet(guest.page);
    await expect(guestsSheet.getByTestId("room-sheet-spend")).toHaveCount(0);
    await expect(guestsSheet.getByTestId("room-sheet-lead")).toBeVisible();
    await expect(guestsSheet.getByRole("button", { name: /^Lead,/ })).toHaveCount(0);
    await expect(guestsSheet.getByTestId("room-sheet-add")).toHaveCount(0);
  } finally {
    for (const each of people) await each.context.close();
  }
});
