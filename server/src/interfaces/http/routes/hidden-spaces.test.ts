/**
 * `/v1/me/hidden-spaces` (ADR 0205): a room hidden is the person's own, for a room they are in,
 * and nobody else's to read.
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

describe("a room a person hid from their own list", () => {
  const list = "/v1/me/hidden-spaces";

  it("is none until hidden, then the room, and unhiding puts it back", async () => {
    const one = `/v1/me/hidden-spaces/${ws.spaceId}`;

    const before = await call("GET", list, signed(ws.arjun, "GET", list));
    expect(before.status).toBe(200);
    expect(before.body["spaces"]).toEqual([]);

    const hidden = await call("PUT", one, signed(ws.arjun, "PUT", one, {}));
    expect(hidden.status).toBe(204);
    // Hiding it again is one room hidden, not two.
    expect((await call("PUT", one, signed(ws.arjun, "PUT", one, {}))).status).toBe(204);
    const after = await call("GET", list, signed(ws.arjun, "GET", list));
    expect(after.body["spaces"]).toEqual([ws.spaceId]);

    const shown = await call("DELETE", one, signed(ws.arjun, "DELETE", one));
    expect(shown.status).toBe(204);
    // And again, which is not an error.
    expect((await call("DELETE", one, signed(ws.arjun, "DELETE", one))).status).toBe(204);
    const gone = await call("GET", list, signed(ws.arjun, "GET", list));
    expect(gone.body["spaces"]).toEqual([]);
  });

  it("is the person's own: a colleague in the same room still has it on their list", async () => {
    const one = `/v1/me/hidden-spaces/${ws.spaceId}`;
    await call("PUT", one, signed(ws.arjun, "PUT", one, {}));

    const danas = await call("GET", list, signed(ws.dana, "GET", list));
    expect(danas.status).toBe(200);
    expect(danas.body["spaces"]).toEqual([]);
  });

  it("will not hide a room the caller is not in", async () => {
    const elsewhere = "/v1/me/hidden-spaces/spc_01K4ZQPX0000000000000000ZZ";
    const refused = await call("PUT", elsewhere, signed(ws.arjun, "PUT", elsewhere, {}));
    expect(refused.status).toBe(404);
    const unhid = await call("DELETE", elsewhere, signed(ws.arjun, "DELETE", elsewhere));
    expect(unhid.status).toBe(404);
  });
});
