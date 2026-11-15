/**
 * An event newer than an app understands reaches it as the line it came with, or not at all
 * (everything in step). The rule is `atLevel`'s, tested beside it; this is that the events a
 * person reads over HTTP and the ones their socket is sent both go through it, at the level their
 * app said. No event is above level 1 yet, so the table here is the test's own: a run's start
 * comes in at level 2 with a line in words, its end at level 3 with nothing to show.
 */

import type { LaterEvent } from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { createTestWorkspace, type TestPerson, type TestWorkspace } from "./testing/workspace.js";

vi.mock("@chipschat/protocol", async (original) => {
  const real = await original<typeof import("@chipschat/protocol")>();
  const later: Record<string, LaterEvent> = {
    "run.started": {
      level: 2,
      fallback: (event) => ({
        agentId: String((event["actor"] as { id?: unknown } | undefined)?.id),
        text: `Started: ${String(event["goal"])}`,
      }),
    },
    "run.completed": { level: 3, fallback: () => undefined },
  };
  return {
    ...real,
    atLevel: (event: Readonly<Record<string, unknown>>, level: number) =>
      real.atLevel(event, level, later),
  };
});

const BASE = "http://chips.local";
type Event = Record<string, unknown>;

let ws: TestWorkspace;
let port: number;
const sockets: WebSocket[] = [];

beforeEach(async () => {
  ws = await createTestWorkspace();
  ({ port } = await ws.gateway.listen());
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  await ws.close();
});

/** A run by the harness: its start, something said in it, and its end. */
async function aRun(key: string): Promise<void> {
  const runId = ws.ids.next("run");
  const post = async (name: string, body: Event) => {
    const response = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/runs/${runId}/events`, {
        method: "POST",
        headers: {
          ...ws.scout.headers,
          "content-type": "application/json",
          "idempotency-key": `${key}-${name}`,
        },
        body: JSON.stringify({ space_id: ws.spaceId, ...body }),
      }),
    );
    expect(response.status).toBe(201);
  };
  await post("start", { type: "run.started", goal: "Confirm PO #4471", plan: [] });
  await post("said", { type: "message.post", text: "Delivery is on the 12th." });
  await post("done", { type: "run.completed", summary: "Done." });
}

/** What a person's app reads over HTTP, saying `level` (or nothing). */
async function read(as: TestPerson, level: string | undefined): Promise<Event[]> {
  const path = "/v1/events?since=0";
  const response = await ws.gateway.app.fetch(
    new Request(`${BASE}${path}`, {
      headers: {
        ...as.sign("GET", path, ""),
        ...(level === undefined ? {} : { "chips-level": level }),
      },
    }),
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { events: Event[] }).events;
}

/** The run's events among them, by type, in order; a line in a later event's place is marked. */
function ofTheRun(events: readonly Event[]): string[] {
  return events
    .filter((each) => /^run\.|^message\.post$/.test(String(each["type"])))
    .map((each) =>
      each["fallback"] === true ? `line: ${String(each["text"])}` : String(each["type"]),
    );
}

/** A person's socket, saying hello at `level` (or none) and subscribed; what it is sent. */
async function listening(as: TestPerson, level: number | undefined): Promise<Event[]> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/v1/ws?ticket=${await as.socketTicket()}`);
  sockets.push(socket);
  const sent: Event[] = [];
  let subscribed: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    subscribed = resolve;
  });
  socket.on("message", (data) => {
    const frame = JSON.parse(String(data)) as { frame?: string; event?: Event };
    if (frame.event?.["type"] === "hello") {
      socket.send(JSON.stringify({ frame: "subscribe", workspace_id: ws.workspaceId }));
      // The next thing the server does for this socket is after the subscription.
      setTimeout(subscribed, 50);
    } else if (frame.event !== undefined) sent.push(frame.event);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  socket.send(
    JSON.stringify({
      frame: "hello",
      protocol: { min: 1, max: 1 },
      client: { name: "chips-web", version: "1.2.6" },
      ...(level === undefined ? {} : { level }),
    }),
  );
  await ready;
  return sent;
}

async function until(what: string, done: () => boolean): Promise<void> {
  for (let tries = 0; tries < 300; tries += 1) {
    if (done()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`never: ${what}`);
}

describe("an event newer than an app understands", () => {
  it("is read over HTTP as its line, or not at all, at the level the app says", async () => {
    await aRun("http");
    const line = "line: Started: Confirm PO #4471";
    // An app at level 1 has no words for either: the start's line, and nothing of the end.
    expect(ofTheRun(await read(ws.arjun, "1"))).toEqual([line, "message.post"]);
    // At level 2 the start is read as it is; the end still isn't known.
    expect(ofTheRun(await read(ws.arjun, "2"))).toEqual(["run.started", "message.post"]);
    expect(ofTheRun(await read(ws.arjun, "3"))).toEqual([
      "run.started",
      "message.post",
      "run.completed",
    ]);
    // An app from before levels says none, and reads everything as it always did; so does one
    // that says something that is no level.
    for (const none of [undefined, "", "0", "-1", "two"]) {
      expect(ofTheRun(await read(ws.arjun, none))).toEqual([
        "run.started",
        "message.post",
        "run.completed",
      ]);
    }
  });

  it("keeps the line where the event was: its place in the log, its room, and who it is of", async () => {
    await aRun("line");
    const real = (await read(ws.arjun, "2")).find((each) => each["type"] === "run.started");
    const line = (await read(ws.arjun, "1")).find((each) => each["fallback"] === true);
    expect(line).toEqual({
      v: real?.["v"],
      id: real?.["id"],
      seq: real?.["seq"],
      ts: real?.["ts"],
      workspace_id: ws.workspaceId,
      space_id: ws.spaceId,
      type: "message.post",
      actor: { kind: "agent", id: ws.scout.participantId },
      text: "Started: Confirm PO #4471",
      fallback: true,
    });
  });

  it("is sent down a socket the same way, each at the level its hello said", async () => {
    const one = await listening(ws.arjun, 1);
    const two = await listening(ws.arjun, 2);
    const none = await listening(ws.arjun, undefined);
    await aRun("socket");
    await until("everyone heard the run", () =>
      [two, none].every((sent) => ofTheRun(sent).includes("message.post")),
    );
    await until("the app at level 1 heard what was said", () =>
      ofTheRun(one).includes("message.post"),
    );
    // The end comes after what was said: by now it has reached whoever it goes to.
    await until("the end reached an app before levels", () =>
      ofTheRun(none).includes("run.completed"),
    );
    expect(ofTheRun(one)).toEqual(["line: Started: Confirm PO #4471", "message.post"]);
    expect(ofTheRun(two)).toEqual(["run.started", "message.post"]);
    expect(ofTheRun(none)).toEqual(["run.started", "message.post", "run.completed"]);
  });

  it("is sent to a harness whole: a harness says no level", async () => {
    await aRun("harness");
    const response = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/events?since=0`, { headers: ws.scout.headers }),
    );
    const { events } = (await response.json()) as { events: Event[] };
    expect(ofTheRun(events)).toEqual(["run.started", "message.post", "run.completed"]);
  });
});
