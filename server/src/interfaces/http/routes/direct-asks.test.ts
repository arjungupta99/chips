/**
 * Direct asks over HTTP (ADR 0211, Phase 3): a guest asks, an owner sees the ask and answers
 * with Tailscale's share link, kept for the next guest or not, and the guest reads it back. The
 * registry is the real one, on the test workspace's database.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestWorkspace,
  type TestPerson,
  type TestWorkspace,
} from "../../../testing/workspace.js";

let ws: TestWorkspace;
const BASE = "http://chips.local";
const LINK = "https://login.tailscale.com/admin/invite/abc123";

beforeEach(async () => {
  ws = await createTestWorkspace();
});
afterEach(async () => {
  await ws.close();
});

async function as(who: TestPerson, method: string, path: string, body?: unknown) {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const response = await ws.gateway.app.fetch(
    new Request(`${BASE}${path}`, {
      method,
      headers: { "content-type": "application/json", ...who.sign(method, path, raw) },
      ...(raw === "" ? {} : { body: raw }),
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe("direct asks", () => {
  it("carries a guest's ask to the owners and the share link back", async () => {
    const asked = await as(ws.dana, "POST", "/v1/direct-asks", { trip_ms: 431.6 });
    expect(asked.status).toBe(201);
    expect(asked.body).toMatchObject({ state: "asked", trip_ms: 432, link: null });
    const id = String(asked.body["ask_id"]);
    expect(id).toMatch(/^dra_/);

    // Asked again before an answer: the same ask.
    expect((await as(ws.dana, "POST", "/v1/direct-asks", {})).body["ask_id"]).toBe(id);

    const waiting = await as(ws.arjun, "GET", "/v1/direct-asks");
    expect(waiting.body).toMatchObject({ asks: [{ ask_id: id, state: "asked" }], kept_link: null });
    expect((await as(ws.arjun, "GET", `/v1/direct-asks/${id}`)).body).toMatchObject({
      participant_id: ws.dana.participantId,
      kept_link: null,
    });

    const shared = await as(ws.arjun, "POST", `/v1/direct-asks/${id}/share`, {
      link: ` ${LINK} `,
      keep: true,
    });
    expect(shared.status).toBe(200);
    expect(shared.body).toMatchObject({ state: "shared", link: LINK });
    expect((await as(ws.dana, "GET", "/v1/direct-asks/mine")).body).toMatchObject({
      ask: { ask_id: id, state: "shared", link: LINK },
    });
    // Kept for the next guest, and nobody is waiting now.
    expect((await as(ws.arjun, "GET", "/v1/direct-asks")).body).toEqual({
      asks: [],
      kept_link: LINK,
    });
  });

  it("takes only Tailscale's own link, answers an ask once, and forgets the kept link when told", async () => {
    const id = String((await as(ws.dana, "POST", "/v1/direct-asks", {})).body["ask_id"]);
    for (const link of [
      "http://login.tailscale.com/x",
      "https://tailscale.evil.com/x",
      "not a link",
    ]) {
      const refused = await as(ws.arjun, "POST", `/v1/direct-asks/${id}/share`, {
        link,
        keep: true,
      });
      expect(refused.status).toBe(422);
    }
    expect(
      (await as(ws.arjun, "POST", `/v1/direct-asks/${id}/share`, { link: LINK, keep: false }))
        .status,
    ).toBe(200);
    const again = await as(ws.arjun, "POST", `/v1/direct-asks/${id}/share`, {
      link: LINK,
      keep: true,
    });
    expect(again.status).toBe(422);
    expect(again.body["error"]).toMatchObject({ refusal: "taken" });
    expect((await as(ws.arjun, "GET", "/v1/direct-asks")).body["kept_link"]).toBeNull();
  });

  it("refuses an owner's ask, and a member's look at the asks", async () => {
    expect((await as(ws.arjun, "POST", "/v1/direct-asks", {})).status).toBe(403);
    expect((await as(ws.dana, "GET", "/v1/direct-asks")).status).toBe(403);
    expect((await as(ws.dana, "GET", "/v1/direct-asks/mine")).body).toEqual({ ask: null });
  });

  it("marks a shared ask direct when the guest arrives other than through the relay", async () => {
    const id = String((await as(ws.dana, "POST", "/v1/direct-asks", {})).body["ask_id"]);
    await as(ws.arjun, "POST", `/v1/direct-asks/${id}/share`, { link: LINK, keep: false });
    const principal = {
      kind: "person" as const,
      participantId: ws.dana.participantId,
      workspaceId: ws.workspaceId,
      displayName: "Dana",
      role: "member" as const,
      via: "device_key" as const,
    };
    await ws.gateway.deps.directAsks.arrived(principal, "relay");
    expect((await as(ws.dana, "GET", "/v1/direct-asks/mine")).body).toMatchObject({
      ask: { state: "shared" },
    });
    await ws.gateway.deps.directAsks.arrived(principal, "lan");
    expect((await as(ws.dana, "GET", "/v1/direct-asks/mine")).body).toMatchObject({
      ask: { state: "direct" },
    });
    // Done, so asking again starts a new ask.
    const next = await as(ws.dana, "POST", "/v1/direct-asks", {});
    expect(next.body["ask_id"]).not.toBe(id);
  });
});
