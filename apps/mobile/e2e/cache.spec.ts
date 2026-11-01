/**
 * The phone's copy of the log heals itself (11 September 2026). A copy can lose a room's
 * opening — the phone's dropped whole batches until this morning — and the store resumes above
 * the highest event it holds, so the socket never brings the opening back: the room folded as a
 * glimpse of somebody else's and stayed off the list, with only the cards of lanes routed into
 * it showing, in the room that routed them. On the web target the copy is IndexedDB, and the
 * store and the server's hello are the phone's own; so the opening is taken out of the copy
 * here, the page reloaded, and the room is back on the list once the store has read it again.
 *
 * The hole has to be below the top of the copy, as the phone's was. Taken from the top, the
 * opening is simply the next thing the replay sends, and the spec would prove nothing — it did
 * not, in its first form, against a store with the healing switched off.
 */

import { expect, test } from "@playwright/test";
import { demo, Harness, newRunId, pair } from "./support.ts";

/**
 * In the page: the highest event the copy holds, and, when asked, the copy with its openings
 * and memberships taken out. Nothing is opened that does not exist yet — `indexedDB.open` would
 * create an empty database the app could then not upgrade.
 */
async function copy(args: {
  workspaceId: string;
  lose: boolean;
}): Promise<{ highest: number; removed: number }> {
  // Kept under the workspace and the server it was paired with (SEC-8): `chips-cache:<ws>@<host>`.
  const prefix = `chips-cache:${args.workspaceId}`;
  const known = await indexedDB.databases();
  const name = known.map((each) => each.name ?? "").find((each) => each.startsWith(prefix));
  if (name === undefined) return { highest: 0, removed: 0 };
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return new Promise((resolve, reject) => {
    let highest = 0;
    let removed = 0;
    const tx = db.transaction("events", "readwrite");
    const walk = tx.objectStore("events").openCursor();
    walk.onsuccess = () => {
      const cursor = walk.result;
      if (cursor === null) return;
      const row = cursor.value as { seq: number; type?: string };
      const opening = row.type === "space.created" || row.type === "membership.added";
      if (args.lose && opening) {
        cursor.delete();
        removed += 1;
      } else {
        highest = Math.max(highest, row.seq);
      }
      cursor.continue();
    };
    tx.oncomplete = () => {
      db.close();
      resolve({ highest, removed });
    };
    tx.onerror = () => reject(tx.error);
  });
}

test("a room whose opening the copy lost, below what it still holds, is back on the list after a reload", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const workspaceId = demo().workspace_id;
  await pair(page);
  await page.getByRole("tab", { name: "Spaces" }).click();
  const room = page.getByRole("button", { name: /PO-4471/ });
  await expect(room).toBeVisible({ timeout: 20_000 });

  // A run above the opening, so that what the copy holds highest is not the opening itself.
  const harness = await Harness.connect(newRunId());
  let above = 0;
  try {
    await harness.send("run.started", { goal: "Say one thing.", plan: [] });
    await harness.send("message.post", { text: "Above the opening." });
    const ended = await harness.send("run.completed", { summary: "Said." });
    expect(ended).toMatchObject({ frame: "ack" });
    above = Number(ended["seq"]);
  } finally {
    harness.close();
  }
  expect(above).toBeGreaterThan(0);

  // The copy is written a moment after the room is on screen; wait for the run to be in it.
  await expect
    .poll(() => page.evaluate(copy, { workspaceId, lose: false }).then((held) => held.highest), {
      timeout: 20_000,
    })
    .toBeGreaterThanOrEqual(above);
  const lost = await page.evaluate(copy, { workspaceId, lose: true });
  expect(lost.removed).toBeGreaterThan(0);
  expect(lost.highest).toBeGreaterThanOrEqual(above);

  // From the copy alone the room is somebody else's glimpse, and the socket has nothing below
  // its top to send; the hello says the room is this device's, and the store reads it again.
  await page.reload();
  await page.getByRole("tab", { name: "Spaces" }).click();
  await expect(room).toBeVisible({ timeout: 30_000 });
});
