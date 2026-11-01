/**
 * `/v1/me/pinned-spaces` (ADR 0240): a room pinned is the person's own, for a room they are in,
 * read back the newest pin first, and nobody else's to read.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../../../testing/workspace.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTestWorkspace();
});

afterEach(async () => {
  await ws.close();
});

async function call(
  method: string,
  path: string,
  init: { headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  const response = await ws.gateway.app.fetch(
    new Request(`http://chips.local${path}`, {
      method,
      headers: { "content-type": "application/json", ...init.headers },
      ...(body === undefined ? {} : { body }),
    }),
  );
  const text = await response.text();
  return { status: response.status, body: text === "" ? {} : JSON.parse(text) };
}

function signed(person: TestWorkspace["arjun"], method: string, path: string, body?: unknown) {
  const raw = body === undefined ? "" : JSON.stringify(body);
  return { headers: person.sign(method, path, raw), ...(body === undefined ? {} : { body }) };
}

/**
 * The server stamps a pin with its own clock, to the millisecond. Two pins a test makes one after
 * the other can share a millisecond; waiting for the next one says which came first.
 */
async function aMomentLater(): Promise<void> {
  const start = Date.now();
  while (Date.now() === start) await new Promise((resolve) => setTimeout(resolve, 1));
}

describe("a room a person pinned to the top of their own list", () => {
  const list = "/v1/me/pinned-spaces";

  it("is none until pinned, then the room, and unpinning puts it back among the rest", async () => {
    const one = `/v1/me/pinned-spaces/${ws.spaceId}`;

    const before = await call("GET", list, signed(ws.arjun, "GET", list));
    expect(before.status).toBe(200);
    expect(before.body["spaces"]).toEqual([]);

    const pinned = await call("PUT", one, signed(ws.arjun, "PUT", one, {}));
    expect(pinned.status).toBe(204);
    // Pinning it again is one room pinned, not two.
    expect((await call("PUT", one, signed(ws.arjun, "PUT", one, {}))).status).toBe(204);
    const after = await call("GET", list, signed(ws.arjun, "GET", list));
    expect(after.body["spaces"]).toEqual([ws.spaceId]);

    const unpinned = await call("DELETE", one, signed(ws.arjun, "DELETE", one));
    expect(unpinned.status).toBe(204);
    // And again, which is not an error.
    expect((await call("DELETE", one, signed(ws.arjun, "DELETE", one))).status).toBe(204);
    const gone = await call("GET", list, signed(ws.arjun, "GET", list));
    expect(gone.body["spaces"]).toEqual([]);
  });

  it("reads back the newest pin first, and pinning one again keeps its place", async () => {
    const older = `/v1/me/pinned-spaces/${ws.spaceId}`;
    const other = await ws.roomOf(ws.arjun.participantId, "Trip");
    const newer = `/v1/me/pinned-spaces/${other}`;

    await call("PUT", older, signed(ws.arjun, "PUT", older, {}));
    await aMomentLater();
    await call("PUT", newer, signed(ws.arjun, "PUT", newer, {}));
    const both = await call("GET", list, signed(ws.arjun, "GET", list));
    expect(both.body["spaces"]).toEqual([other, ws.spaceId]);

    // A second pin of the older room is not a newer pin: it stays where it was first put.
    await aMomentLater();
    expect((await call("PUT", older, signed(ws.arjun, "PUT", older, {}))).status).toBe(204);
    const still = await call("GET", list, signed(ws.arjun, "GET", list));
    expect(still.body["spaces"]).toEqual([other, ws.spaceId]);

    // Unpinned and pinned again, it is the newest pin, and comes first.
    await call("DELETE", older, signed(ws.arjun, "DELETE", older));
    await aMomentLater();
    await call("PUT", older, signed(ws.arjun, "PUT", older, {}));
    const again = await call("GET", list, signed(ws.arjun, "GET", list));
    expect(again.body["spaces"]).toEqual([ws.spaceId, other]);
  });

  it("is the person's own: a colleague in the same room still has it unpinned", async () => {
    const one = `/v1/me/pinned-spaces/${ws.spaceId}`;
    await call("PUT", one, signed(ws.arjun, "PUT", one, {}));

    const danas = await call("GET", list, signed(ws.dana, "GET", list));
    expect(danas.status).toBe(200);
    expect(danas.body["spaces"]).toEqual([]);
  });

  it("will not pin a room the caller is not in", async () => {
    const elsewhere = "/v1/me/pinned-spaces/spc_01K4ZQPX0000000000000000ZZ";
    const refused = await call("PUT", elsewhere, signed(ws.arjun, "PUT", elsewhere, {}));
    expect(refused.status).toBe(404);
    const unpinned = await call("DELETE", elsewhere, signed(ws.arjun, "DELETE", elsewhere));
    expect(unpinned.status).toBe(404);
  });

  it("is a person's: a harness has no pins of its own", async () => {
    const refused = await call("GET", list, { headers: ws.scout.headers });
    expect(refused.status).toBe(403);
  });
});
