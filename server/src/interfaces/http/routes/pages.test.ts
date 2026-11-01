/**
 * The page door (ADR 0201): a ticket for an HTML page a person may read, spent once on the frame's
 * `GET`, which answers the page under its own policy as a header.
 */

import { PAGE_HEADER_POLICY } from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_UNSPENT_PAGE_TICKETS, PAGE_TICKET_TTL_SECONDS } from "../../../application/index.js";
import { createTestWorkspace, type TestWorkspace } from "../../../testing/workspace.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTestWorkspace();
});
afterEach(async () => {
  await ws.close();
});

const BASE = "http://chips.local";

const MOCK =
  "<!doctype html><title>Bronze</title><button onclick=\"this.textContent='Flipped'\">Flip</button>";

async function uploadAs(
  person: TestWorkspace["arjun"],
  filename: string,
  text: string,
): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const slotBody = JSON.stringify({ filename, byte_size: bytes.byteLength });
  const slot = await ws.gateway.app.fetch(
    new Request(`${BASE}/v1/uploads`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...person.sign("POST", "/v1/uploads", slotBody),
      },
      body: slotBody,
    }),
  );
  expect(slot.status).toBe(201);
  const { upload_url: target } = (await slot.json()) as { upload_url: string };
  const put = await ws.gateway.app.fetch(
    new Request(`${BASE}${target}`, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream", ...person.sign("PUT", target, bytes) },
      body: bytes,
    }),
  );
  expect(put.status, await put.clone().text()).toBe(201);
  const { attachment } = (await put.json()) as { attachment: { attachment_id: string } };
  return attachment.attachment_id;
}

/** The page, posted in the space by Arjun, so its members may read it. */
async function sentInTheSpace(id: string): Promise<void> {
  const posted = await ws.gateway.deps.submitEvent({
    principal: {
      kind: "person",
      participantId: ws.arjun.participantId,
      workspaceId: ws.workspaceId,
      displayName: "Arjun",
      via: "device_key",
    },
    event: {
      type: "message.post",
      space_id: ws.spaceId,
      text: "The mock.",
      upload_ids: [id],
      idempotency_key: `sent-${id}`,
    },
  });
  expect(posted.ok).toBe(true);
}

/** `POST /v1/attachments/:id/page`, signed by a person's device. */
async function askPage(person: TestWorkspace["arjun"], id: string): Promise<Response> {
  const target = `/v1/attachments/${id}/page`;
  return await ws.gateway.app.fetch(
    new Request(`${BASE}${target}`, { method: "POST", headers: person.sign("POST", target, "") }),
  );
}

/** The page's URL, fetched with nothing else: what a frame does. */
const open = (url: string) => ws.gateway.app.fetch(new Request(`${BASE}${url}`));

describe("the page door (ADR 0201)", () => {
  it("mints a ticket for an HTML file, serves the page once under its own policy, and the ticket is spent", async () => {
    const id = await uploadAs(ws.arjun, "bronze-mock.html", MOCK);
    const asked = await askPage(ws.arjun, id);
    expect(asked.status, await asked.clone().text()).toBe(201);
    const { url, expires_in } = (await asked.json()) as { url: string; expires_in: number };
    expect(url).toMatch(/^\/v1\/pages\/[A-Za-z0-9_-]{43}$/);
    expect(expires_in).toBe(PAGE_TICKET_TTL_SECONDS);

    const page = await open(url);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(page.headers.get("content-security-policy")).toBe(PAGE_HEADER_POLICY);
    expect(page.headers.get("content-security-policy")).toBe(
      "default-src 'none'; img-src data: blob:; font-src data:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox",
    );
    expect(page.headers.get("x-content-type-options")).toBe("nosniff");
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    expect(page.headers.get("content-disposition")).toBeNull();
    expect(page.headers.get("content-length")).toBe(String(MOCK.length));
    expect(await page.text()).toBe(MOCK);

    // Spent: the same URL again is refused, as is one nobody minted.
    const again = await open(url);
    expect(again.status).toBe(401);
    expect(await again.json()).toMatchObject({
      error: { message: "That page link is not good here." },
    });
    expect((await open("/v1/pages/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).status).toBe(401);
    // Another ask is another ticket, good on its own.
    const next = (await (await askPage(ws.arjun, id)).json()) as { url: string };
    expect(next.url).not.toBe(url);
    expect((await open(next.url)).status).toBe(200);
  });

  it("is a member's too, for a page sent in their space, and nobody else's", async () => {
    const id = await uploadAs(ws.arjun, "bronze-mock.html", MOCK);
    // Not yet sent anywhere: the uploader's alone.
    expect((await askPage(ws.dana, id)).status).toBe(403);
    await sentInTheSpace(id);
    const asked = await askPage(ws.dana, id);
    expect(asked.status).toBe(201);
    expect((await open(((await asked.json()) as { url: string }).url)).status).toBe(200);

    const eve = await ws.addPerson("Eve", "member");
    expect((await askPage(eve, id)).status).toBe(403);
    // A harness is given its own URL in message.new, and gets no ticket.
    const target = `/v1/attachments/${id}/page`;
    const scout = await ws.gateway.app.fetch(
      new Request(`${BASE}${target}`, { method: "POST", headers: ws.scout.headers }),
    );
    expect(scout.status).toBe(403);
    expect((await askPage(ws.arjun, "att_01K4ZQPX00000000000000000Z")).status).toBe(404);
  });

  it("opens only an HTML file as a page: a Markdown file and a photo are made pages by the client", async () => {
    const notes = await uploadAs(ws.arjun, "notes.md", "# Notes\n\nSome words.\n");
    const refused = await askPage(ws.arjun, notes);
    expect(refused.status).toBe(422);
    expect(await refused.json()).toMatchObject({
      error: { message: "Only an HTML file opens as a page here." },
    });
  });

  it("is spent by whoever holds the URL, and never a second time", async () => {
    // A bearer for one load: a stranger with the URL gets the page once, which is what a
    // frame's own request is; the ticket is then worth nothing to anyone.
    const id = await uploadAs(ws.arjun, "bronze-mock.html", MOCK);
    const { url } = (await (await askPage(ws.arjun, id)).json()) as { url: string };
    expect((await open(url)).status).toBe(200);
    expect((await open(url)).status).toBe(401);
  });

  it("slows an address trying links, five wrong in a minute and then a wait", async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await open(`/v1/pages/wrong-${i}`)).status).toBe(401);
    }
    const sixth = await open("/v1/pages/wrong-6");
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toMatchObject({
      error: { retry_after_seconds: expect.any(Number) },
    });
    // The limiter is asked first, as the pairing door's is, so from a slowed address a good
    // ticket waits the minute out too.
    const id = await uploadAs(ws.arjun, "bronze-mock.html", MOCK);
    const { url } = (await (await askPage(ws.arjun, id)).json()) as { url: string };
    expect((await open(url)).status).toBe(429);
  });

  it("holds a person to so many unspent tickets, and one spent frees a place (SEC-53)", async () => {
    const id = await uploadAs(ws.arjun, "bronze-mock.html", MOCK);
    const urls: string[] = [];
    for (let i = 0; i < MAX_UNSPENT_PAGE_TICKETS; i += 1) {
      const asked = await askPage(ws.arjun, id);
      expect(asked.status).toBe(201);
      urls.push(((await asked.json()) as { url: string }).url);
    }
    const over = await askPage(ws.arjun, id);
    expect(over.status).toBe(429);
    expect(await over.json()).toMatchObject({
      error: { code: "rate_limited", retry_after_seconds: PAGE_TICKET_TTL_SECONDS },
    });
    // Somebody else's are their own.
    await sentInTheSpace(id);
    expect((await askPage(ws.dana, id)).status).toBe(201);
    expect((await open(urls[0] ?? "")).status).toBe(200);
    expect((await askPage(ws.arjun, id)).status).toBe(201);
  });

  it("refuses a HEAD, which carries no ticket it may spend, and a GET elsewhere under /v1/pages", async () => {
    const id = await uploadAs(ws.arjun, "bronze-mock.html", MOCK);
    const { url } = (await (await askPage(ws.arjun, id)).json()) as { url: string };
    expect(
      (await ws.gateway.app.fetch(new Request(`${BASE}${url}`, { method: "HEAD" }))).status,
    ).toBe(401);
    expect((await open(`${url}/more`)).status).toBe(401);
    // The ticket is still whole: nothing above spent it.
    expect((await open(url)).status).toBe(200);
  });
});
