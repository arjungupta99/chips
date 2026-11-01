/**
 * `/v1/me/space-icons`: the face a person chose for a space is theirs, for a room they are in,
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

describe("the face a person chose for a space", () => {
  it("is nothing until chosen, then what they chose, and it can be put back", async () => {
    const list = "/v1/me/space-icons";
    const one = `/v1/me/space-icons/${ws.spaceId}`;

    const before = await call("GET", list, signed(ws.arjun, "GET", list));
    expect(before.status).toBe(200);
    expect(before.body["icons"]).toEqual({});

    const face = { icon: "tent", ground: 7 };
    const set = await call("PUT", one, signed(ws.arjun, "PUT", one, face));
    expect(set.status).toBe(200);
    expect(set.body["icon"]).toEqual(face);

    const after = await call("GET", list, signed(ws.arjun, "GET", list));
    expect(after.body["icons"]).toEqual({ [ws.spaceId]: face });

    // Setting it again replaces rather than duplicating.
    const again = { icon: "rocket", ground: 0 };
    await call("PUT", one, signed(ws.arjun, "PUT", one, again));
    const replaced = await call("GET", list, signed(ws.arjun, "GET", list));
    expect(replaced.body["icons"]).toEqual({ [ws.spaceId]: again });

    const cleared = await call("DELETE", one, signed(ws.arjun, "DELETE", one));
    expect(cleared.status).toBe(204);
    const gone = await call("GET", list, signed(ws.arjun, "GET", list));
    expect(gone.body["icons"]).toEqual({});
  });

  it("is the person's own: a colleague in the same room sees their own, not yours", async () => {
    const one = `/v1/me/space-icons/${ws.spaceId}`;
    await call("PUT", one, signed(ws.arjun, "PUT", one, { icon: "tent", ground: 7 }));

    const list = "/v1/me/space-icons";
    const danas = await call("GET", list, signed(ws.dana, "GET", list));
    expect(danas.status).toBe(200);
    expect(danas.body["icons"]).toEqual({});
  });

  it("refuses a mark that is not a name and a ground off the end of the list", async () => {
    const one = `/v1/me/space-icons/${ws.spaceId}`;
    for (const bad of [
      { icon: "../../etc/passwd", ground: 0 },
      { icon: "tent", ground: 27 },
      { icon: "tent", ground: -1 },
      { icon: "tent" },
    ]) {
      const refused = await call("PUT", one, signed(ws.arjun, "PUT", one, bad));
      // `invalid_event` is 422 here, as it is everywhere else on this server.
      expect(refused.status, JSON.stringify(bad)).toBe(422);
    }
  });

  it("takes the grounds added on 26 September 2026, which a server before them refused", async () => {
    const one = `/v1/me/space-icons/${ws.spaceId}`;
    const set = await call("PUT", one, signed(ws.arjun, "PUT", one, { icon: "tent", ground: 26 }));
    expect(set.status).toBe(200);
  });

  it("takes a ground with no mark on it, which is a room that is only a colour", async () => {
    const one = `/v1/me/space-icons/${ws.spaceId}`;
    const set = await call("PUT", one, signed(ws.arjun, "PUT", one, { icon: "", ground: 9 }));
    expect(set.status).toBe(200);

    const list = "/v1/me/space-icons";
    const mine = await call("GET", list, signed(ws.arjun, "GET", list));
    expect(mine.body["icons"]).toEqual({ [ws.spaceId]: { icon: "", ground: 9 } });
  });

  it("takes letters in place of a mark, and gives them back as they were typed (ADR 0139)", async () => {
    const one = `/v1/me/space-icons/${ws.spaceId}`;
    const face = { icon: "", ground: 4, letters: "🦊A" };
    const set = await call("PUT", one, signed(ws.arjun, "PUT", one, face));
    expect(set.status).toBe(200);

    const list = "/v1/me/space-icons";
    const mine = await call("GET", list, signed(ws.arjun, "GET", list));
    expect(mine.body["icons"]).toEqual({ [ws.spaceId]: face });

    // A mark chosen after them takes their place: the letters go with the face they were.
    const mark = { icon: "rocket", ground: 4 };
    await call("PUT", one, signed(ws.arjun, "PUT", one, mark));
    const again = await call("GET", list, signed(ws.arjun, "GET", list));
    expect(again.body["icons"]).toEqual({ [ws.spaceId]: mark });

    const three = { icon: "", ground: 4, letters: "ABC" };
    expect((await call("PUT", one, signed(ws.arjun, "PUT", one, three))).status).toBe(422);
  });

  it("will not set a face on a room the caller is not in", async () => {
    const elsewhere = "/v1/me/space-icons/spc_01K4ZQPX0000000000000000ZZ";
    const refused = await call(
      "PUT",
      elsewhere,
      signed(ws.arjun, "PUT", elsewhere, { icon: "tent", ground: 1 }),
    );
    expect(refused.status).toBe(404);
  });
});
