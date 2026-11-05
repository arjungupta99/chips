/**
 * Join requests (ADR 0122) against a real server, a real browser and the relay beside them.
 *
 * - J2, the harness starts: it asks and shows a code; the owner's browser opens the request with
 *   the same code; the owner turns one capability off and allows it; the harness collects exactly
 *   what was granted, and its key works. Nobody runs `chips declare`.
 * - J4, the refusals: Don't allow; a link used twice; a code that expired (the requests' clock moved
 *   on, `POST /v1/dev/join-clock`); a sixth request while five wait; a device that asks through the
 *   relay.
 * - J5, the arrival (ADR 0190): a link from the dialog, a harness that joins by it, connects and
 *   says hello, and the dialog turning to "Moss is here", whose Say hello opens the room.
 * - J6, Cancel link (ADR 0190, 18 October 2026): a link withdrawn while it waits is refused to the
 *   harness that comes with it after, and the dialog is the gallery again.
 * - A bridge's card (ADR 0218, phase 5) in a browser: the installer's line with the link in it, for
 *   the computer where the harness runs, and nothing of this Mac, which only Chips for Mac runs.
 *
 * Each ask says it came from an address of its own (`x-forwarded-for`, which the server reads from
 * a peer on its own machine, as from a proxy), so ten asks a minute from one address is not what
 * the next test runs into.
 */

import { establishLink } from "@chipschat/core";
import { connect, join } from "@chipschat/harness";
import { expect, type Page, test } from "@playwright/test";
import { pair, SERVER } from "./support.ts";

let address = 0;

/** A harness's ask, from an address of its own. */
async function ask(body: Record<string, unknown>): Promise<Response> {
  address += 1;
  return await fetch(`${SERVER}/v1/join`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.20.0.${address}` },
    body: JSON.stringify(body),
  });
}

async function asked(body: Record<string, unknown>) {
  const response = await ask(body);
  expect(response.status).toBe(201);
  return (await response.json()) as { request_id: string; secret: string; code: string };
}

async function poll(
  id: string,
  secret: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${SERVER}/v1/join/${id}/redeem`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const refusalOf = (body: Record<string, unknown>) =>
  (body["error"] as { refusal?: string } | undefined)?.refusal;

/** Every request waiting now expires: the requests' clock moves past ten minutes. */
async function expireWhatWaits(): Promise<void> {
  const moved = await fetch(`${SERVER}/v1/dev/join-clock`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ advance_seconds: 601 }),
  });
  expect(moved.status).toBe(200);
}

/** The owner's browser, paired and on Spaces. */
async function owner(page: Page): Promise<void> {
  await pair(page);
}

test.describe("join requests", () => {
  test.beforeEach(async () => {
    await expireWhatWaits();
  });

  test("J2: a harness asks, the owner allows it with one capability off, and it gets exactly that", async ({
    page,
  }) => {
    await owner(page);
    const request = await asked({
      name: "Tide",
      software: "tide 0.4.1",
      machine: "vps-fra-1",
      wants: ["autonomy", "new_spaces", "restarts"],
    });
    expect((await poll(request.request_id, request.secret)).status).toBe(202);

    const dialog = page.getByTestId("join-request-dialog");
    await expect(dialog.getByText("Tide wants to join")).toBeVisible();
    await expect(dialog.getByTestId("join-code")).toHaveText(request.code);
    await dialog.getByTestId("join-cap-restarts").getByRole("switch").click();
    await dialog.getByTestId("join-allow").click();

    let collected: { status: number; body: Record<string, unknown> } | undefined;
    await expect
      .poll(async () => {
        collected = await poll(request.request_id, request.secret);
        return collected.status;
      })
      .toBe(200);
    expect(collected?.body).toMatchObject({
      kind: "harness",
      capabilities: ["autonomy", "new_spaces"],
    });
    const token = String(collected?.body["token"]);
    const harnessId = String(collected?.body["harness_id"]);
    const participants = await fetch(`${SERVER}/v1/participants`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const { participants: everyone } = (await participants.json()) as {
      participants: { id: string; capabilities: string[] | null }[];
    };
    expect(everyone.find((each) => each.id === harnessId)?.capabilities).toEqual([
      "autonomy",
      "new_spaces",
    ]);
    // The dialog follows it to the phone's words (ADR 0271): Tide took its key and joined.
    await expect(dialog.getByTestId("join-decided")).toContainText("Tide joined");
    await expect(dialog.getByTestId("join-decided")).toContainText("Its space is on your Spaces.");
    await expect((await poll(request.request_id, request.secret)).status).toBe(403);
  });

  test("J4: Don't allow is a refusal the harness can read", async ({ page }) => {
    await owner(page);
    const request = await asked({ name: "Pest" });
    const dialog = page.getByTestId("join-request-dialog");
    await expect(dialog.getByTestId("join-code")).toHaveText(request.code);
    await dialog.getByTestId("join-deny").click();
    await expect(dialog).toBeHidden();
    await expect
      .poll(async () => refusalOf((await poll(request.request_id, request.secret)).body))
      .toBe("denied");
  });

  test("J4: a link works once, and the card follows it", async ({ page }) => {
    await owner(page);
    await page.getByRole("button", { name: /^Agents/ }).click();
    await page.getByRole("button", { name: "Connect a harness" }).click();
    await page.getByTestId("join-way-own").click();
    await expect(page.getByTestId("join-sdk")).toBeVisible();
    const link = (await page.getByTestId("join-connect").getAttribute("data-link")) ?? "";
    const secret = link.split("/j/")[1] ?? "";
    expect(secret).toMatch(/^chips_j_/);
    await expect(page.getByTestId("join-steps-link")).toHaveAttribute("data-state", "done");
    await expect(page.getByTestId("join-steps-connects")).toHaveAttribute("data-state", "now");

    const redeem = async () =>
      await fetch(`${SERVER}/v1/join/redeem`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret, name: "Kit", machine: "vps-fra-1" }),
      });
    const first = await redeem();
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ kind: "harness", capabilities: ["autonomy"] });
    // The phone's three steps (ADR 0271): Kit took its key, and connects.
    const connects = page.getByTestId("join-steps-connects");
    await expect(connects).toContainText("Kit connects");
    await expect(connects).toContainText("Took its key on vps-fra-1");

    const second = await redeem();
    expect(second.status).toBe(403);
    expect(refusalOf((await second.json()) as Record<string, unknown>)).toBe("spent");
  });

  test("J5: the card turns to the arrival on the hello, and Say hello opens its room (ADR 0190)", async ({
    page,
  }) => {
    await owner(page);
    await page.getByRole("button", { name: /^Agents/ }).click();
    await page.getByRole("button", { name: "Connect a harness" }).click();
    await page.getByTestId("join-way-own").click();
    const connectCard = page.getByTestId("join-connect");
    await expect(connectCard).toHaveAttribute("data-link", /\/j\/chips_j_/);
    const link = (await connectCard.getAttribute("data-link")) ?? "";

    // The harness side, as a person's own connector would: join by the link, connect, say hello.
    const me = await join({ link, name: "Moss", machine: "vps-fra-1", keep: false });
    const chips = await connect({ ...me, client: { name: "e2e-moss", version: "0.0.0" } });
    try {
      await chips.post({ spaceId: me.spaceId ?? "", text: "Hello from Moss." });
      const arrived = page.getByTestId("join-arrived");
      await expect(arrived.getByRole("heading")).toHaveText("Moss is here");
      await expect(arrived).toContainText("Connected from vps-fra-1.");
      await arrived.getByTestId("join-arrived-hello").click();
      await expect(arrived).toBeHidden();
      await expect(page.getByTestId("messages").getByText("Hello from Moss.")).toBeVisible();
    } finally {
      chips.close();
    }
  });

  test("J6: Cancel link withdraws a waiting link, and the harness that comes with it is refused", async ({
    page,
  }) => {
    await owner(page);
    await page.getByRole("button", { name: /^Agents/ }).click();
    await page.getByRole("button", { name: "Connect a harness" }).click();
    await page.getByTestId("join-way-own").click();
    const connectCard = page.getByTestId("join-connect");
    await expect(connectCard).toHaveAttribute("data-link", /\/j\/chips_j_/);
    const link = (await connectCard.getAttribute("data-link")) ?? "";
    await page.getByTestId("join-cancel").click();
    await expect(page.getByTestId("join-gallery")).toBeVisible();
    await expect(
      join({ link, name: "Late", machine: "vps-fra-1", keep: false }),
    ).rejects.toMatchObject({
      refusal: "denied",
    });
  });

  test("a bridge's card in a browser is the installer's line for another computer, and nothing more", async ({
    page,
  }) => {
    await owner(page);
    await page.getByRole("button", { name: /^Agents/ }).click();
    await page.getByRole("button", { name: "Connect a harness" }).click();
    await page.getByTestId("join-card-hermes").click();
    const connect = page.getByTestId("join-connect");
    await expect(connect).toHaveAttribute("data-link", /\/j\/chips_j_/);
    const link = (await connect.getAttribute("data-link")) ?? "";
    await expect(page.getByTestId("join-command")).toHaveText(
      `curl -fsSL https://chipschat.ai/install | CHIPS_JOIN_LINK='${link}' sh -s -- connect hermes`,
    );
    await expect(
      connect.getByText(`CHIPS_JOIN_LINK='${link}' chips connect hermes`, { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("join-another-steps-connects")).toContainText(/left$/);
    // On this Mac is Chips for Mac's alone: a browser can't run the line here.
    await expect(page.getByTestId("join-where-here")).toHaveCount(0);
    await expect(page.getByTestId("join-here-go")).toHaveCount(0);
  });

  test("J4: a code that expired is refused", async () => {
    const request = await asked({ name: "Late" });
    await expireWhatWaits();
    const polled = await poll(request.request_id, request.secret);
    expect(polled.status).toBe(403);
    expect(refusalOf(polled.body)).toBe("expired");
  });

  test("J4: a sixth request is refused while five wait", async () => {
    for (let i = 1; i <= 5; i += 1) await asked({ name: `Asker ${i}` });
    const sixth = await ask({ name: "Asker 6" });
    expect(sixth.status).toBe(429);
    expect(refusalOf((await sixth.json()) as Record<string, unknown>)).toBe("too_many");
  });

  test("J4: a device that asks through the relay is refused", async () => {
    const health = (await (await fetch(`${SERVER}/v1/health`)).json()) as {
      relay: { url: string | null; key: string | null };
    };
    expect(health.relay.url).not.toBeNull();
    // Nothing answers at the door on the network address, so the link is the relay's, as a
    // phone's would be (ADR 0191).
    const link = await establishLink({
      serverUrl: "http://127.0.0.1:9",
      serverKey: health.relay.key ?? "",
      relayUrl: health.relay.url ?? "",
    });
    try {
      expect(link.kind).toBe("relay");
      const refused = await link.fetch("http://relay.local/v1/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "device",
          name: "Pixel 9",
          public_key: "MCowBQYDK2VwAyEAr3z7c4a2j8mPqZ0y1xW9n4kL2vB6dF8hJ0sT5uY7wE0=",
        }),
      });
      expect(refused.status).toBe(403);
      expect(refusalOf((await refused.json()) as Record<string, unknown>)).toBe("not_here");
    } finally {
      link.close();
    }
  });
});
