/**
 * `/v1/me/read` (ADR 0262): how far a person has read is theirs, moved only forward, for rooms they
 * are in, held to what has been said; each mark that moved goes down their own sockets that said
 * `reads`, and nobody else's; and a rebuild of the projections leaves it standing.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import {
  createTestWorkspace,
  type TestPerson,
  type TestWorkspace,
} from "../../../testing/workspace.js";

let ws: TestWorkspace;
let port: number;
const PATH = "/v1/me/read";

beforeEach(async () => {
  ws = await createTestWorkspace();
  ({ port } = await ws.gateway.listen());
});

afterEach(async () => {
  await ws.close();
});

async function call(
  method: "GET" | "PUT",
  person: TestPerson,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const response = await ws.gateway.app.fetch(
    new Request(`http://chips.local${PATH}`, {
      method,
      headers: { "content-type": "application/json", ...person.sign(method, PATH, raw) },
      ...(method === "GET" ? {} : { body: raw }),
    }),
  );
  const text = await response.text();
  return { status: response.status, body: text === "" ? {} : JSON.parse(text) };
}

const marksOf = async (person: TestPerson) => (await call("GET", person)).body["spaces"];

/** A socket of a person's, saying in its hello what it hears beyond the base set. */
async function socketOf(person: TestPerson, accepts: string[]) {
  const ticket = await person.socketTicket();
  const socket = new WebSocket(`ws://127.0.0.1:${port}/v1/ws?ticket=${ticket}`);
  const frames: Record<string, unknown>[] = [];
  socket.on("message", (data) => frames.push(JSON.parse(data.toString())));
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  socket.send(
    JSON.stringify({
      frame: "hello",
      protocol: { min: 1, max: 1 },
      client: { name: "test", version: "0" },
      accepts,
    }),
  );
  await until(() => frames.length > 0);
  return { socket, of: (name: string) => frames.filter((f) => f["frame"] === name) };
}

async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !done(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("how far a person has read (ADR 0262)", () => {
  it("is nowhere until a device says, then follows it forward and never back", async () => {
    expect(await call("GET", ws.arjun)).toEqual({ status: 200, body: { spaces: {} } });

    expect((await call("PUT", ws.arjun, { spaces: { [ws.spaceId]: 2 } })).status).toBe(204);
    expect(await marksOf(ws.arjun)).toEqual({ [ws.spaceId]: 2 });

    // Another device of his that read less, or a write that came late: the mark stays.
    expect((await call("PUT", ws.arjun, { spaces: { [ws.spaceId]: 1 } })).status).toBe(204);
    expect(await marksOf(ws.arjun)).toEqual({ [ws.spaceId]: 2 });

    // Dana's are her own.
    expect(await marksOf(ws.dana)).toEqual({});
  });

  it("passes over a room the person is not in, and holds a mark to what has been said", async () => {
    const trip = await ws.roomOf(ws.arjun.participantId, "Trip");
    const head = await ws.gateway.deps.store.head(ws.workspaceId);

    const wrote = await call("PUT", ws.dana, { spaces: { [trip]: 1, [ws.spaceId]: head + 50 } });
    expect(wrote.status).toBe(204);
    expect(await marksOf(ws.dana)).toEqual({ [ws.spaceId]: head });
  });

  it("refuses what is not marks", async () => {
    expect((await call("PUT", ws.arjun, { spaces: { [ws.spaceId]: -1 } })).status).toBe(422);
    expect((await call("PUT", ws.arjun, { spaces: { nope: 1 } })).status).toBe(422);
    expect((await call("PUT", ws.arjun, {})).status).toBe(422);
  });

  it("goes to the person's own sockets that hear `reads`, only when a mark moved", async () => {
    const ipad = await socketOf(ws.arjun, ["events", "reads"]);
    const older = await socketOf(ws.arjun, ["events"]);
    const danas = await socketOf(ws.dana, ["events", "reads"]);

    await call("PUT", ws.arjun, { spaces: { [ws.spaceId]: 2 } });
    await until(() => ipad.of("read").length > 0);
    expect(ipad.of("read")).toEqual([{ frame: "read", spaces: { [ws.spaceId]: 2 } }]);

    // Nothing moved: nothing said.
    await call("PUT", ws.arjun, { spaces: { [ws.spaceId]: 2 } });
    await call("PUT", ws.arjun, { spaces: { [ws.spaceId]: 3 } });
    await until(() => ipad.of("read").length > 1);
    expect(ipad.of("read")).toHaveLength(2);
    expect(older.of("read")).toHaveLength(0);
    expect(danas.of("read")).toHaveLength(0);
    for (const each of [ipad, older, danas]) each.socket.close();
  });

  it("stands through a rebuild of the projections, which no event of the log says", async () => {
    await call("PUT", ws.arjun, { spaces: { [ws.spaceId]: 2 } });
    await ws.gateway.deps.store.rebuild(ws.workspaceId);
    expect(await marksOf(ws.arjun)).toEqual({ [ws.spaceId]: 2 });
  });
});
