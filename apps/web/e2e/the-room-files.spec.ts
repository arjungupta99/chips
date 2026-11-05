/**
 * ADR 0099's acceptance: the room's files. Two harnesses in a room share one file by its name, not
 * by a path on either's machine. Scout posts `gallery.html`, v1, for Painter; Painter's turn lists
 * it in its context with a URL it fetches; Painter posts v2, made from v1. Scout, still on v1,
 * posts a change of its own and is refused `stale_file`, told Painter has v2; nothing of it is
 * taken. The room's files say v2, by Painter. Both harnesses are driven by the test over HTTP, as
 * the adapters post. On the Mac, the room sheet's Files says v2, by Painter, with v1 behind a
 * tap, and each opens in the page view on its own words (ADR 0100).
 */

import { type RoomContext, type RoomFile, renderContext } from "@chipschat/harness";
import { expect, test } from "@playwright/test";
import {
  addMember,
  closeSheet,
  demo,
  type Frame,
  Harness,
  newRunId,
  pair,
  pickEmpty,
  registerAgent,
  registerSpecialist,
  roomSheet,
  SERVER,
  sheetBack,
} from "./support.ts";

interface Caller {
  readonly id: string;
  readonly token: string;
}

const PAGE = "gallery.html";
let posts = 0;

/** A page as an agent writes one: a document, which the server sniffs as HTML and a fragment not. */
const doc = (body: string): string => `<!doctype html><title>Gallery</title>${body}`;

const bearer = (caller: Caller) => ({ authorization: `Bearer ${caller.token}` });

/** A file uploaded by a harness, by its upload's id. */
async function upload(caller: Caller, text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const slot = await fetch(`${SERVER}/v1/uploads`, {
    method: "POST",
    headers: { ...bearer(caller), "content-type": "application/json" },
    body: JSON.stringify({ filename: PAGE, byte_size: bytes.byteLength }),
  });
  expect(slot.status).toBe(201);
  const { upload_url: target, attachment_id: id } = (await slot.json()) as {
    upload_url: string;
    attachment_id: string;
  };
  const put = await fetch(`${SERVER}${target}`, {
    method: "PUT",
    headers: { ...bearer(caller), "content-type": "application/octet-stream" },
    body: bytes,
  });
  expect(put.status).toBe(201);
  return id;
}

/** A harness says something in the room, as the adapters post: over HTTP, with its files. */
async function post(caller: Caller, room: string, body: Frame): Promise<Response> {
  posts += 1;
  return await fetch(`${SERVER}/v1/harnesses/${caller.id}/events`, {
    method: "POST",
    headers: { ...bearer(caller), "content-type": "application/json" },
    body: JSON.stringify({
      type: "message.post",
      space_id: room,
      idempotency_key: `room-files-${posts}`,
      ...body,
    }),
  });
}

/** The next time a harness hears these words. */
function heard(harness: Harness, text: string): Promise<Frame> {
  return harness
    .waitFor(
      (frame) => ((frame["event"] as Frame | undefined)?.["text"] as string | undefined) === text,
      `"${text}"`,
    )
    .then((frame) => frame["event"] as Frame);
}

test("a room's file crosses by its link, comes back as v2, and a change made from v1 is refused", async ({
  page,
}) => {
  const painter = await registerSpecialist("Painter");
  await pair(page);
  const painterHarness = await Harness.connect(newRunId(), {
    token: painter.token,
    space: painter.space,
  });

  // A room with nobody asked into it, and Scout's second agent and Painter added to it from its
  // sheet, which comes up on Add (ADR 0148) offering what is free as it opens.
  const scoutHere = await registerAgent(demo().harness, "gallery", "Scout");
  await page.getByRole("button", { name: "Create new space" }).click();
  // Nobody asked: Empty (ADR 0148).
  await pickEmpty(page);
  const name = page.getByRole("textbox", { name: "Name the space" });
  await name.fill("Gallery");
  await name.press("Enter");
  await expect(page.getByRole("main", { name: "Space: Gallery" })).toBeVisible();
  await expect(page.getByTestId("room-sheet-add-page")).toBeVisible();
  await addMember(page, { id: scoutHere });
  await addMember(page, { moving: "Painter" });
  await expect((await sheetBack(page)).getByTestId("member")).toHaveCount(3);
  await closeSheet(page);
  const room = String((await painterHarness.event("membership.added"))["space_id"]);

  // Scout posts the page, v1, for Painter.
  const scout = demo().harness;
  const v1 = await upload(scout, doc("<h1>A–E</h1>"));
  const ask = "@Painter add F–J to gallery.html";
  expect((await post(scout, room, { text: ask, upload_ids: [v1] })).status).toBe(201);

  // Painter's turn lists it, v1, with a URL for Painter's own token, and the bytes are there.
  const turn = await heard(painterHarness, ask);
  const context = turn["context"] as RoomContext;
  expect(context.files).toEqual([
    expect.objectContaining({ name: PAGE, version: 1, attachment_id: v1 }),
  ]);
  expect(renderContext(context)).toContain(`Files in this space:\n${PAGE} · v1 · by `);
  const link = String(context.files?.[0]?.url);
  expect(await (await fetch(link, { headers: bearer(painter) })).text()).toBe(doc("<h1>A–E</h1>"));

  // Painter posts v2, made from v1.
  const v2 = await upload(painter, doc("<h1>A–E</h1><h1>F–J</h1>"));
  const done = await post(painter, room, {
    text: "Done: F–J",
    upload_ids: [v2],
    replaces: { [v2]: v1 },
  });
  expect(done.status).toBe(201);

  // The room's files say v2, by Painter.
  const listing = await fetch(`${SERVER}/v1/spaces/${room}/files`, { headers: bearer(scout) });
  const { files } = (await listing.json()) as { files: RoomFile[] };
  expect(files).toEqual([expect.objectContaining({ name: PAGE, version: 2, attachment_id: v2 })]);
  const painterName = String(files[0]?.by.name);
  expect(painterName).toMatch(/^Painter/);

  // Scout, still on v1, posts its own change: refused, told who has v2, and nothing of it taken.
  const late = await upload(scout, doc("<h1>A–E</h1><h1>K–O</h1>"));
  const refused = await post(scout, room, {
    text: "K–O is in",
    upload_ids: [late],
    replaces: { [late]: v1 },
  });
  expect(refused.status).toBe(409);
  expect(((await refused.json()) as { error: Frame }).error).toMatchObject({
    code: "stale_file",
    message: `${PAGE} is now v2, by ${painterName}. Fetch it and redo.`,
  });
  await expect(page.getByTestId("messages")).toContainText("Done: F–J");
  await expect(page.getByTestId("messages")).not.toContainText("K–O is in");

  // The Mac's Files (ADR 0100), under Media & files on the room's sheet as on the phone (ADR
  // 0202): v2, by Painter, with v1 behind a tap, each opening on its words.
  const sheet = await roomSheet(page);
  await expect(sheet.getByTestId("room-sheet-media")).toContainText("1 file");
  await sheet.getByTestId("room-sheet-media").click();
  const shelf = sheet.getByTestId("room-files");
  const file = shelf.getByTestId("room-file");
  await expect(file).toHaveCount(1);
  await expect(file).toContainText(`by ${painterName}`);
  await shelf.getByRole("button", { name: `Versions of ${PAGE}` }).click();
  const versions = shelf.getByTestId("room-file-version");
  await expect(versions).toHaveCount(2);
  await expect(versions.first()).toContainText("Current");
  await expect(versions.last()).not.toContainText("Current");
  const words = page.frameLocator('[data-testid="page-view"]').locator("h1");
  await shelf.getByRole("button", { name: `Open ${PAGE}, version 1` }).click();
  await expect(words).toHaveText(["A–E"]);
  await page.getByTestId("page-view-dialog").getByRole("button", { name: "Close" }).click();
  await shelf
    .getByRole("button", { name: `Open ${PAGE}, version 2` })
    .first()
    .click();
  await expect(page.getByTestId("page-view-dialog")).toContainText(`v2 · by ${painterName}`);
  await expect(words).toHaveText(["A–E", "F–J"]);
  painterHarness.close();
});
