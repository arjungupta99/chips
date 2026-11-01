/**
 * The door over a real port: the routes an adapter calls, with the answers the real ones give,
 * and the socket with its handshake, replay and receipts. `@chipschat/harness` is the client on the
 * socket, because it is what a harness author would use; the frames themselves are driven raw.
 */

import { connect, renderContext } from "@chipschat/harness";
import {
  HARNESS_CAPABILITIES,
  messageIdOf,
  type RoomContext,
  schemaFor,
} from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type FakeChips, startFakeChips } from "./fake-chips.js";

let chips: FakeChips;

beforeEach(async () => {
  chips = await startFakeChips({ harnessName: "Scout" });
});

afterEach(async () => {
  await chips.close();
});

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    authorization: `Bearer ${chips.address.token}`,
    "content-type": "application/json",
    ...extra,
  };
}

async function post(
  path: string,
  body: unknown,
  key?: string,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${chips.address.url}${path}`, {
    method: "POST",
    headers: headers(key === undefined ? {} : { "idempotency-key": key }),
    body: JSON.stringify(body),
  });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

async function get(path: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${chips.address.url}${path}`, { headers: headers() });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

const RUN = "run_01K4ZQPX000000000000000004";
const APPROVAL = "apr_01K4ZQPX000000000000000005";

async function startRun(): Promise<void> {
  const { harnessId, spaceId } = chips.address;
  const started = await post(
    `/v1/harnesses/${harnessId}/events`,
    { type: "run.started", space_id: spaceId, run_id: RUN, goal: "Confirm the PO" },
    "start",
  );
  expect(started.status).toBe(201);
}

describe("over HTTP", () => {
  it("answers health to anyone and everything else only to the token", async () => {
    const health = await fetch(`${chips.address.url}/v1/health`);
    expect(health.status).toBe(200);
    expect(health.headers.get("date")).not.toBeNull();

    const bare = await fetch(`${chips.address.url}/v1/participants`);
    expect(bare.status).toBe(401);
    const wrong = await fetch(`${chips.address.url}/v1/participants`, {
      headers: { authorization: "Bearer chips_at_wrong" },
    });
    expect(wrong.status).toBe(401);
    expect(((await wrong.json()) as { error: { code: string } }).error.code).toBe("unauthorized");

    const mine = await get("/v1/participants");
    expect(mine.status).toBe(200);
    expect(
      (mine.json["participants"] as { display_name: string }[]).map((p) => p.display_name),
    ).toEqual(["Arjun", "Scout"]);
    const nothing = await get("/v1/nothing");
    expect(nothing.status).toBe(404);
  });

  it("opens a space by key once, and refuses to open another harness's", async () => {
    const { harnessId } = chips.address;
    const first = await post(`/v1/harnesses/${harnessId}/spaces`, {
      key: "/Users/arjun/Work/Chips",
      title: "Chips · main",
    });
    expect(first.status).toBe(201);
    expect(first.json["created"]).toBe(true);
    const again = await post(`/v1/harnesses/${harnessId}/spaces`, {
      key: "/Users/arjun/Work/Chips",
    });
    expect(again).toEqual({
      status: 200,
      json: {
        space_id: first.json["space_id"],
        created: false,
        retitled: false,
        joined: false,
        claimed: false,
      },
    });
    expect(
      (await post(`/v1/harnesses/hrn_01K4ZQPX000000000000000099/spaces`, { key: "x" })).status,
    ).toBe(403);
    expect((await post(`/v1/harnesses/${harnessId}/spaces`, { title: "no key" })).status).toBe(422);
    expect((await post(`/v1/harnesses/${harnessId}/spaces`, {})).status).toBe(422);
  });

  it("appends an event with its seq, repeats a key as a duplicate, and refuses with the envelope", async () => {
    const { harnessId, spaceId } = chips.address;
    const first = await post(
      `/v1/harnesses/${harnessId}/events`,
      { type: "message.post", space_id: spaceId, text: "Hello" },
      "m1",
    );
    expect(first.status).toBe(201);
    // The room's opening took three events, the harness's agent a fourth, and Chips saying
    // where the agent is a fifth (ADR 0087).
    expect(first.json).toMatchObject({ seq: 6, duplicate: false });
    expect(String(first.json["event_id"])).toMatch(/^evt_/);
    const again = await post(
      `/v1/harnesses/${harnessId}/events`,
      { type: "message.post", space_id: spaceId, text: "Hello" },
      "m1",
    );
    expect(again).toMatchObject({ status: 200, json: { seq: 6, duplicate: true } });

    const refused = await post(
      `/v1/harnesses/${harnessId}/events`,
      { type: "step.log", run_id: RUN, step_id: "s", status: "done" },
      "s1",
    );
    expect(refused.status).toBe(404);
    expect(refused.json).toEqual({
      error: {
        code: "not_found",
        message: expect.stringContaining("a run begins with run.started"),
        request_id: "conformance",
      },
    });
    const invalid = await post(
      `/v1/harnesses/${harnessId}/events`,
      { type: "message.post", space_id: spaceId },
      "m2",
    );
    expect(invalid.status).toBe(422);
    expect((invalid.json["error"] as { issues: unknown[] }).issues.length).toBeGreaterThan(0);
    expect(
      (
        await post(
          `/v1/harnesses/hrn_01K4ZQPX000000000000000099/events`,
          { type: "message.post" },
          "x",
        )
      ).status,
    ).toBe(403);
    const notJson = await fetch(`${chips.address.url}/v1/harnesses/${harnessId}/events`, {
      method: "POST",
      headers: headers(),
      body: "{",
    });
    expect(notJson.status).toBe(422);
  });

  it("takes a run's events with the run in the path, and hands back an approval's id to wait on", async () => {
    await startRun();
    const asked = await post(
      `/v1/runs/${RUN}/events`,
      {
        type: "approval.request",
        approval_id: APPROVAL,
        action: { kind: "email.send" },
        risk: ["external"],
        expires_in: 60,
      },
      "ask",
    );
    expect(asked.status).toBe(201);
    expect(asked.json["approval_id"]).toBe(APPROVAL);
    expect(asked.json["resolution"]).toBeUndefined();

    const pending = await get(`/v1/approvals/${APPROVAL}/wait?timeout=0`);
    expect(pending.json).toMatchObject({ state: "pending", resolution: null, fallback: "deny" });
    expect((await get(`/v1/approvals/${APPROVAL}`)).json["state"]).toBe("pending");
    expect((await get("/v1/approvals/apr_01K4ZQPX000000000000000000/wait")).status).toBe(404);
    expect((await get(`/v1/approvals/${APPROVAL}/wait?timeout=-1`)).status).toBe(400);

    // The long poll returns the moment the person decides.
    const waiting = get(`/v1/approvals/${APPROVAL}/wait?timeout=30`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await chips.decide(APPROVAL, "approved", { reason: "Go ahead." });
    const answered = await waiting;
    expect(answered.json).toMatchObject({
      state: "resolved",
      resolution: "approved",
      reason: "Go ahead.",
      resolved_by: chips.address.ownerId,
    });
    // And a poll that outlasts nobody's answer comes back as it stands.
    await post(
      `/v1/runs/${RUN}/events`,
      {
        type: "approval.request",
        approval_id: "apr_01K4ZQPX000000000000000006",
        action: { kind: "email.send" },
        risk: [],
        expires_in: 60,
      },
      "ask2",
    );
    const timedOut = await get("/v1/approvals/apr_01K4ZQPX000000000000000006/wait?timeout=1");
    expect(timedOut.json["resolution"]).toBeNull();
  });

  it("stores an upload, attaches it by id, and serves it back", async () => {
    const { harnessId, spaceId, url } = chips.address;
    const slot = await post("/v1/uploads", { filename: "PO-4471.pdf", byte_size: 3 });
    expect(slot.status).toBe(201);
    expect(slot.json).toMatchObject({
      method: "PUT",
      upload_url: `/v1/uploads/${slot.json["attachment_id"]}`,
    });
    expect((await post("/v1/uploads", {})).status).toBe(422);

    const empty = await fetch(`${url}${slot.json["upload_url"]}`, {
      method: "PUT",
      headers: headers(),
    });
    expect(empty.status).toBe(422);
    const put = await fetch(`${url}${slot.json["upload_url"]}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${chips.address.token}`,
        "content-type": "application/octet-stream",
      },
      body: new Uint8Array([1, 2, 3]),
    });
    expect(put.status).toBe(201);
    expect(
      ((await put.json()) as { attachment: Record<string, unknown> }).attachment,
    ).toMatchObject({
      filename: "PO-4471.pdf",
      mime_type: "application/pdf",
      byte_size: 3,
    });
    const missing = await fetch(`${url}/v1/uploads/att_01K4ZQPX000000000000000000`, {
      method: "PUT",
      headers: headers(),
      body: "x",
    });
    expect(missing.status).toBe(404);

    const posted = await post(
      `/v1/harnesses/${harnessId}/events`,
      {
        type: "message.post",
        space_id: spaceId,
        text: "The PO",
        upload_ids: [slot.json["attachment_id"]],
      },
      "po",
    );
    expect(posted.status).toBe(201);
    const served = await fetch(`${url}/v1/attachments/${slot.json["attachment_id"]}`, {
      headers: headers(),
    });
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("application/pdf");
    expect(served.headers.get("accept-ranges")).toBe("bytes");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    // A run of them, as the real route serves it, and a run past the end refused.
    const target = `${url}/v1/attachments/${slot.json["attachment_id"]}`;
    const part = await fetch(target, { headers: { ...headers(), range: "bytes=1-" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 1-2/3");
    expect(new Uint8Array(await part.arrayBuffer())).toEqual(new Uint8Array([2, 3]));
    const past = await fetch(target, { headers: { ...headers(), range: "bytes=3-" } });
    expect(past.status).toBe(416);
    expect(past.headers.get("content-range")).toBe("bytes */3");
    await past.arrayBuffer();
    expect(
      (await fetch(`${url}/v1/attachments/att_01K4ZQPX000000000000000000`, { headers: headers() }))
        .status,
    ).toBe(404);
  });

  it("reads the log as the harness may see it, after a cursor", async () => {
    await startRun();
    const all = await get("/v1/events?since=0");
    // Its agent's registration, and where it is, are not among them: a harness that has not
    // declared `agents` is never handed what it has no words for (ADR 0087's addendum).
    expect((all.json["events"] as { type: string }[]).map((event) => event.type)).toEqual([
      "space.created",
      "membership.added",
      "membership.added",
      "run.started",
    ]);
    expect(all.json["next_cursor"]).toBeNull();
    // A page is cut by the log, and what it hides is left out of it: the cursor still moves.
    const page = await get("/v1/events?since=0&limit=2");
    expect((page.json["events"] as unknown[]).length).toBe(1);
    expect(page.json["next_cursor"]).toBe(2);
    expect((await get("/v1/events?since=-1")).status).toBe(400);
    expect((await get("/v1/events?since=4")).json["events"]).toMatchObject([
      { type: "run.started", seq: 6 },
    ]);
  });
});

/** A raw socket, for the frames the SDK hides. */
async function rawSocket(): Promise<{
  send: (frame: unknown) => void;
  next: () => Promise<Record<string, unknown>>;
  close: () => void;
  closed: Promise<number>;
}> {
  const socket = new WebSocket(
    `${chips.address.url.replace(/^http/, "ws")}/v1/ws?token=${encodeURIComponent(chips.address.token)}`,
  );
  const queue: Record<string, unknown>[] = [];
  const waiters: ((frame: Record<string, unknown>) => void)[] = [];
  socket.addEventListener("message", (message) => {
    const frame = JSON.parse(String(message.data)) as Record<string, unknown>;
    const waiter = waiters.shift();
    if (waiter === undefined) queue.push(frame);
    else waiter(frame);
  });
  const closed = new Promise<number>((resolve) =>
    socket.addEventListener("close", (event) => resolve(event.code)),
  );
  await new Promise<void>((resolve) => socket.addEventListener("open", () => resolve()));
  return {
    send: (frame) => socket.send(typeof frame === "string" ? frame : JSON.stringify(frame)),
    next: () => {
      const queued = queue.shift();
      if (queued !== undefined) return Promise.resolve(queued);
      return new Promise((resolve) => waiters.push(resolve));
    },
    close: () => socket.close(),
    closed,
  };
}

describe("over the socket", () => {
  it("refuses a socket with no token before the upgrade", async () => {
    const socket = new WebSocket(`${chips.address.url.replace(/^http/, "ws")}/v1/ws`);
    let opened = false;
    socket.addEventListener("open", () => {
      opened = true;
    });
    // Node 22's WebSocket fires only `error` on a refused handshake; later runtimes add `close`.
    await new Promise((resolve) => {
      socket.addEventListener("error", resolve);
      socket.addEventListener("close", resolve);
    });
    expect(opened).toBe(false);
  });

  it("opens with a single-use ticket from POST /v1/socket-tickets, as the SDK does (SEC-22)", async () => {
    const base = chips.address.url;
    const minted = await fetch(`${base}/v1/socket-tickets`, {
      method: "POST",
      headers: { authorization: `Bearer ${chips.address.token}` },
    });
    expect(minted.status).toBe(201);
    const { ticket } = (await minted.json()) as { ticket: string };
    const url = `${base.replace(/^http/, "ws")}/v1/ws?ticket=${ticket}`;
    const first = new WebSocket(url);
    await new Promise<void>((resolve) => first.addEventListener("open", () => resolve()));
    first.close();
    // Spent on the upgrade: the same ticket opens nothing a second time.
    const second = new WebSocket(url);
    let opened = false;
    second.addEventListener("open", () => {
      opened = true;
    });
    await new Promise((resolve) => {
      second.addEventListener("error", resolve);
      second.addEventListener("close", resolve);
    });
    expect(opened).toBe(false);
    // And no ticket without the token.
    const nobody = await fetch(`${base}/v1/socket-tickets`, { method: "POST" });
    expect(nobody.status).toBe(401);
  });

  it("negotiates, refuses a version it does not speak, and wants hello first", async () => {
    const wrong = await rawSocket();
    wrong.send({
      frame: "hello",
      protocol: { min: 2, max: 3 },
      client: { name: "t", version: "0" },
    });
    expect(await wrong.next()).toMatchObject({ frame: "error", code: "protocol_unsupported" });
    expect(await wrong.closed).toBe(1008);

    const early = await rawSocket();
    early.send({ frame: "subscribe", workspace_id: chips.address.workspaceId });
    expect(await early.next()).toMatchObject({
      frame: "error",
      code: "invalid_frame",
      message: "Say hello before you subscribe.",
    });
    early.send({ frame: "event", event: { type: "message.post", idempotency_key: "k" } });
    expect(await early.next()).toMatchObject({
      frame: "error",
      message: "Say hello before you send an event.",
    });
    early.send("not json");
    expect(await early.next()).toMatchObject({
      frame: "error",
      message: "That frame is not JSON.",
    });
    early.send({ frame: "nonsense" });
    expect(await early.next()).toMatchObject({ frame: "error", code: "invalid_frame" });
    early.close();
  });

  it("says hello with the harness, its owner, its spaces and the dial, then subscribes and acks", async () => {
    const socket = await rawSocket();
    socket.send({
      frame: "hello",
      protocol: { min: 1, max: 1 },
      client: { name: "t", version: "0" },
    });
    const hello = (await socket.next())["event"] as Record<string, unknown>;
    expect(hello).toMatchObject({
      type: "hello",
      harnesses: [
        {
          harness_id: chips.address.harnessId,
          display_name: "Scout",
          owner_id: chips.address.ownerId,
        },
      ],
      autonomy: 1,
      spaces: [chips.address.spaceId],
      server: { name: "chips-conformance" },
    });
    socket.send({ frame: "subscribe", workspace_id: "ws_01K4ZQPX000000000000000000" });
    expect(await socket.next()).toMatchObject({ frame: "error", code: "forbidden" });
    socket.send({ frame: "subscribe", workspace_id: chips.address.workspaceId, since: 0 });
    // The replay: the direct space being opened, as the harness may see it.
    expect(((await socket.next())["event"] as { type: string }).type).toBe("space.created");
    expect(((await socket.next())["event"] as { type: string }).type).toBe("membership.added");
    expect(((await socket.next())["event"] as { type: string }).type).toBe("membership.added");

    socket.send({
      frame: "event",
      event: { type: "message.post", space_id: chips.address.spaceId, text: "x" },
    });
    expect(await socket.next()).toMatchObject({
      frame: "error",
      message: "Every event you send carries an idempotency key.",
    });
    socket.send({
      frame: "event",
      event: {
        type: "message.post",
        space_id: chips.address.spaceId,
        text: "x",
        idempotency_key: "k1",
      },
    });
    // The event reaches the log, is delivered back to its sender, and then is acked.
    expect(await socket.next()).toMatchObject({
      frame: "event",
      event: { type: "message.post", seq: 6 },
    });
    expect(await socket.next()).toEqual({
      frame: "ack",
      idempotency_key: "k1",
      seq: 6,
      duplicate: false,
    });
    socket.send({
      frame: "event",
      event: { type: "step.log", run_id: RUN, step_id: "s", status: "done", idempotency_key: "k2" },
    });
    expect(await socket.next()).toMatchObject({
      frame: "error",
      code: "not_found",
      idempotency_key: "k2",
    });
    socket.send({ frame: "ping", ts: 7 });
    expect(await socket.next()).toEqual({ frame: "pong", ts: 7 });
    expect(chips.connections()).toBe(1);
    socket.close();
  });

  it("delivers what a person says as message.new, with a receipt when a run is live, and resumes from since", async () => {
    const harness = await connect({
      url: chips.address.url,
      token: chips.address.token,
      client: { name: "sdk", version: "0" },
    });
    const heard: Record<string, unknown>[] = [];
    const receipts: unknown[] = [];
    harness.on("message.new", (message) => {
      heard.push(message as unknown as Record<string, unknown>);
    });
    harness.on("receipt", (receipt) => {
      receipts.push(receipt);
    });
    expect(harness.harnessId).toBe(chips.address.harnessId);

    const run = await harness.runs.start({
      spaceId: chips.address.spaceId,
      goal: "Confirm the PO",
    });
    const said = await chips.say("Here is the PO.");
    await chips
      .waitFor((event) => (event.seq > said.seq ? event : undefined), 50)
      .catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({
      type: "message.new",
      space_id: chips.address.spaceId,
      text: "Here is the PO.",
      from: {
        participant_id: chips.address.ownerId,
        kind: "person",
        display_name: "Arjun",
        role: "owner",
        workspace_role: "owner",
      },
    });
    expect(receipts).toEqual([expect.objectContaining({ disposition: "queued" })]);
    expect(run.id).toMatch(/^run_/);
    const lastSeq = harness.lastSeq;
    harness.close();

    // Back with `since`: only what came after.
    await chips.say("And another.");
    const resumed = await connect({
      url: chips.address.url,
      token: chips.address.token,
      since: lastSeq,
      client: { name: "sdk", version: "0" },
    });
    const replayed: string[] = [];
    resumed.on("event", (event) => {
      replayed.push(String((event as { type?: string }).type));
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(replayed).toEqual(["message.new"]);
    resumed.close();
  });

  it("delivers a message for nobody but people as message.overheard, with no receipt (ADR 0081)", async () => {
    const harness = await connect({
      url: chips.address.url,
      token: chips.address.token,
      client: { name: "sdk", version: "0" },
    });
    const heard: Record<string, unknown>[] = [];
    const receipts: unknown[] = [];
    harness.on("event", (event) => {
      const type = (event as { type?: string }).type;
      if (type === "message.new" || type === "message.overheard") {
        heard.push(event as unknown as Record<string, unknown>);
      }
    });
    harness.on("receipt", (receipt) => {
      receipts.push(receipt);
    });
    await harness.runs.start({ spaceId: chips.address.spaceId, goal: "Confirm the PO" });
    await chips.say("@Arjun a note to self.");
    await chips.say("@Scout over to you.");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(heard).toMatchObject([
      {
        type: "message.overheard",
        text: "@Arjun a note to self.",
        mentions: [chips.address.ownerId],
        addressed_to: [],
      },
      {
        type: "message.new",
        text: "@Scout over to you.",
        mentions: [chips.address.harnessId],
        addressed_to: [chips.address.harnessId],
      },
    ]);
    expect(receipts).toHaveLength(1);
    harness.close();
  });

  it("hands a message for the harness what was said since it last spoke, as the server does (ADR 0088)", async () => {
    const harness = await connect({
      url: chips.address.url,
      token: chips.address.token,
      client: { name: "sdk", version: "0" },
      context: { lines: 5 },
    });
    const heard: Record<string, unknown>[] = [];
    harness.on("event", (event) => {
      const type = (event as { type?: string }).type;
      if (type === "message.new" || type === "message.overheard") {
        heard.push(event as unknown as Record<string, unknown>);
      }
    });
    await harness.post({ spaceId: chips.address.spaceId, text: "Morning." });
    await chips.say("@Arjun a note to self.");
    await chips.say("@Scout over to you.");
    await new Promise((resolve) => setTimeout(resolve, 100));

    const [overheard, asked] = heard;
    expect(overheard).not.toHaveProperty("context");
    expect(renderContext(asked?.["context"] as RoomContext)).toBe(
      "Said in this space since you last spoke:\nArjun (owner): @Arjun a note to self.",
    );

    const page = await get(`/v1/spaces/${chips.address.spaceId}/context?limit=2`);
    expect(page.status).toBe(200);
    const lines = (page.json as unknown as RoomContext).lines;
    expect(lines.map((line) => line.text)).toEqual([
      "@Arjun a note to self.",
      "@Scout over to you.",
    ]);
    expect((await get("/v1/spaces/spc_01K4ZQPX000000000000000009/context")).status).toBe(404);
    harness.close();
  });

  it("hands a reply the message it answers, and what led to it once that is older, as the server does (ADR 0219)", async () => {
    const harness = await connect({
      url: chips.address.url,
      token: chips.address.token,
      client: { name: "sdk", version: "0" },
      context: { lines: 5 },
    });
    const heard: Record<string, unknown>[] = [];
    harness.on("event", (event) => {
      if ((event as { type?: string }).type === "message.new") {
        heard.push(event as unknown as Record<string, unknown>);
      }
    });
    await chips.say("@Scout morning.");
    const table = messageIdOf((await chips.say("@Scout a table for 6 on Friday, please.")).id);
    await harness.post({ spaceId: chips.address.spaceId, text: "Held for 6 at 7:30." });
    await chips.say("@Scout and a cake?");
    await harness.post({ spaceId: chips.address.spaceId, text: "Ordered." });
    await chips.say("Make it 8 people.", undefined, { replyTo: table });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const reply = heard.find((event) => event["text"] === "Make it 8 people.");
    expect(reply).toMatchObject({
      reply_to: table,
      replying_to: {
        message_id: table,
        kind: "said",
        from: { name: "Arjun" },
        text: "@Scout a table for 6 on Friday, please.",
      },
    });
    const before = (reply?.["replying_to"] as { before?: { text?: string }[] } | undefined)?.before;
    expect(before?.at(-1)?.text).toBe("@Scout morning.");
    expect(schemaFor("message.new")?.safeParse(reply).success, JSON.stringify(reply)).toBe(true);

    // One said in the room, inside what the turn was handed: the quote alone.
    const cake = messageIdOf((await chips.say("Chocolate, if they have it.")).id);
    await chips.say("Or vanilla.", undefined, { replyTo: cake });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const near = heard.find((event) => event["text"] === "Or vanilla.");
    expect(near?.["replying_to"]).toMatchObject({ message_id: cake });
    expect(near?.["replying_to"]).not.toHaveProperty("before");

    // A reply to no message is refused, as the server refuses it.
    await expect(
      chips.say("Hello?", undefined, { replyTo: "msg_01K4ZQPX000000000000000099" }),
    ).rejects.toThrow("no such message");
    harness.close();
  });

  it("lists the room's files, hands them with a message, and refuses a post made from a stale version (ADR 0099)", async () => {
    const { harnessId, spaceId, url } = chips.address;
    const upload = async (text: string): Promise<string> => {
      const bytes = new TextEncoder().encode(text);
      const slot = await post("/v1/uploads", {
        filename: "gallery.html",
        byte_size: bytes.byteLength,
      });
      await fetch(`${url}${slot.json["upload_url"]}`, {
        method: "PUT",
        headers: { authorization: `Bearer ${chips.address.token}`, "content-type": "text/html" },
        body: bytes,
      });
      return String(slot.json["attachment_id"]);
    };
    const scoutPosts = (id: string, replaces?: Record<string, string>) =>
      post(`/v1/harnesses/${harnessId}/events`, {
        type: "message.post",
        space_id: spaceId,
        text: "gallery.html",
        upload_ids: [id],
        ...(replaces === undefined ? {} : { replaces }),
        idempotency_key: `gallery-${id}`,
      });

    const v1 = await upload("<p>A–E</p>");
    expect((await scoutPosts(v1)).status).toBe(201);
    const v2 = await upload("<p>A–J</p>");
    expect((await scoutPosts(v2, { [v2]: v1 })).status).toBe(201);

    const listed = await get(`/v1/spaces/${spaceId}/files`);
    expect(listed.status).toBe(200);
    const files = listed.json["files"] as Record<string, unknown>[];
    expect(files).toEqual([
      expect.objectContaining({
        name: "gallery.html",
        version: 2,
        attachment_id: v2,
        by: { id: harnessId, kind: "harness", name: "Scout" },
        url: expect.stringContaining(`/v1/attachments/${v2}`),
      }),
    ]);
    const page = await get(`/v1/spaces/${spaceId}/context`);
    expect((page.json as unknown as RoomContext).files?.map((file) => file.version)).toEqual([2]);
    // One name's versions, newest first, each with what it was made from (ADR 0100).
    const versions = await get(`/v1/spaces/${spaceId}/files?name=gallery.html`);
    expect(
      (versions.json["files"] as Record<string, unknown>[]).map((file) => [
        file["version"],
        file["replaces"],
      ]),
    ).toEqual([
      [2, v1],
      [1, undefined],
    ]);

    const late = await upload("<p>A–E, K–O</p>");
    const refused = await scoutPosts(late, { [late]: v1 });
    expect(refused.status).toBe(409);
    expect(refused.json["error"]).toMatchObject({
      code: "stale_file",
      message: "gallery.html is now v2, by Scout. Fetch it and redo.",
    });
    expect((await scoutPosts(late, { [harnessId]: v1 })).status).toBe(422);

    const harness = await connect({
      url,
      token: chips.address.token,
      client: { name: "sdk", version: "0" },
    });
    const asked = new Promise<Record<string, unknown>>((resolve) =>
      harness.on("event", (event) => {
        if ((event as { type?: string }).type === "message.new")
          resolve(event as unknown as Record<string, unknown>);
      }),
    );
    await chips.say("@Scout add P–T to gallery.html");
    const context = (await asked)["context"] as RoomContext;
    expect(context.files?.map((file) => [file.name, file.version, file.attachment_id])).toEqual([
      ["gallery.html", 2, v2],
    ]);
    expect(renderContext(context)).toContain("Files in this space:\ngallery.html · v2 · by Scout");
    harness.close();
  });

  it("closes every socket when it closes", async () => {
    const socket = await rawSocket();
    await chips.close();
    expect(await socket.closed).toBe(1001);
    // A second close is harmless.
    await chips.close();
  });
});

describe("a room a person asks for (new spaces)", () => {
  beforeEach(async () => {
    await chips.close();
    chips = await startFakeChips({
      harnessName: "Scout",
      capabilities: [HARNESS_CAPABILITIES.autonomy, HARNESS_CAPABILITIES.newSpaces],
    });
  });

  it("lists the room as asked, claims it under the harness's key, and finds it by that key after", async () => {
    const { harnessId, ownerId } = chips.address;
    const door = `/v1/harnesses/${harnessId}/spaces`;
    const { spaceId } = await chips.askForSpace("Plan the kitchen remodel");

    const before = await get(door);
    expect(before).toEqual({
      status: 200,
      json: {
        spaces: [],
        asked: [
          {
            space_id: spaceId,
            asked_by: ownerId,
            title: null,
            state: "open",
            asked_at: expect.any(String),
          },
        ],
      },
    });
    // Its history on its own, as an adapter catching up reads it: the room's events, and — as
    // the real read has it — the ones anywhere that add the harness.
    const history = await get(`/v1/events?space_id=${spaceId}&since=0`);
    const events = history.json["events"] as { type: string; space_id: string }[];
    expect(events.filter((event) => event.space_id === spaceId).map((event) => event.type)).toEqual(
      ["space.created", "membership.added", "message.post"],
    );
    expect(events.filter((event) => event.space_id !== spaceId).map((event) => event.type)).toEqual(
      ["membership.added"],
    );
    expect((await get("/v1/events?space_id=spc_01K4ZQPX000000000000000099&since=0")).json).toEqual({
      events: [],
      next_cursor: null,
    });

    const claimed = await post(door, {
      key: "session-7",
      title: "Kitchen remodel",
      space_id: spaceId,
    });
    expect(claimed).toEqual({
      status: 200,
      json: { space_id: spaceId, created: false, retitled: true, joined: false, claimed: true },
    });
    const retried = await post(door, { key: "session-7", space_id: spaceId });
    expect(retried.json).toMatchObject({ space_id: spaceId, claimed: false });
    expect((await post(door, { key: "session-7" })).json).toMatchObject({
      space_id: spaceId,
      created: false,
    });
    expect((await get(door)).json).toEqual({
      spaces: [
        {
          space_id: spaceId,
          key: "session-7",
          shared: false,
          title: "Kitchen remodel",
          state: "open",
        },
      ],
      asked: [],
    });
    expect(chips.workspace.log.filter((event) => event.type === "space.claimed")).toMatchObject([
      {
        actor: { kind: "harness", id: harnessId },
        payload: { external_key: `${harnessId}:session-7` },
      },
    ]);
  });

  it("refuses a claim the real door refuses, with its status, and keeps the refusal", async () => {
    const { harnessId, spaceId: direct } = chips.address;
    const door = `/v1/harnesses/${harnessId}/spaces`;
    const first = await chips.askForSpace("Plan the kitchen remodel");
    const second = await chips.askForSpace("Book the movers");
    await post(door, { key: "session-7", space_id: first.spaceId });

    expect((await post(door, { key: "k", space_id: direct })).status).toBe(403);
    expect(
      (await post(door, { key: "k", space_id: "spc_01K4ZQPX000000000000000099" })).status,
    ).toBe(404);
    expect((await post(door, { key: "k", space_id: first.spaceId })).status).toBe(422);
    const held = await post(door, { key: "session-7", space_id: second.spaceId });
    expect(held.status).toBe(422);
    expect(JSON.stringify(held.json)).toContain(first.spaceId);
    expect((await post(door, { key: "k", space_id: second.spaceId, shared: true })).status).toBe(
      422,
    );
    expect((await get("/v1/harnesses/hrn_01K4ZQPX000000000000000099/spaces")).status).toBe(403);
    expect(chips.workspace.refusals.filter((each) => each.type === "space.claimed")).toHaveLength(
      4,
    );
  });

  it("sends the harness a room asked of it, live and at connect, as the SDK hears it", async () => {
    await chips.askForSpace("Plan the kitchen remodel");
    const harness = await connect({ url: chips.address.url, token: chips.address.token });
    const handed: string[] = [];
    harness.onSpaceAsked((asked) => {
      handed.push(asked.firstMessage.text);
    });
    await vi.waitFor(() => expect(handed).toEqual(["Plan the kitchen remodel"]));
    await chips.askForSpace("Book the movers");
    await vi.waitFor(() => expect(handed).toEqual(["Plan the kitchen remodel", "Book the movers"]));
    harness.close();
  });

  it("refuses the ask for a harness that does not declare new_spaces", async () => {
    await chips.close();
    chips = await startFakeChips({ harnessName: "Scout" });
    await expect(chips.askForSpace("Plan the kitchen remodel")).rejects.toThrow(
      /does not declare new_spaces/,
    );
  });
});

describe("agents (ADR 0087)", () => {
  /** The events a raw socket is sent, until one matches. */
  async function until(
    socket: Awaited<ReturnType<typeof rawSocket>>,
    match: (frame: Record<string, unknown>) => boolean,
  ): Promise<Record<string, unknown>> {
    for (;;) {
      const frame = await socket.next();
      if (match(frame)) return frame;
    }
  }

  async function subscribed(): Promise<Awaited<ReturnType<typeof rawSocket>>> {
    const socket = await rawSocket();
    socket.send({
      frame: "hello",
      protocol: { min: 1, max: 1 },
      client: { name: "t", version: "1" },
    });
    // From the start, so a message said before the subscription lands is replayed.
    socket.send({ frame: "subscribe", workspace_id: chips.address.workspaceId, since: 0 });
    return socket;
  }

  it("shows a harness that has not declared agents a message for its agent as one for itself", async () => {
    const socket = await subscribed();
    chips.say("Is the order in?");
    const heard = await until(socket, (frame) => {
      const event = frame["event"] as Record<string, unknown> | undefined;
      return event?.["type"] === "message.new";
    });
    const event = heard["event"] as Record<string, unknown>;
    expect(event["addressed_to"]).toEqual([chips.address.harnessId]);
    expect(event).not.toHaveProperty("for");
    socket.close();
  });

  it("tells a harness that declared agents which of them a message is for", async () => {
    await chips.close();
    chips = await startFakeChips({
      harnessName: "Scout",
      capabilities: [HARNESS_CAPABILITIES.agents],
    });
    const socket = await subscribed();
    const hello = await until(socket, (frame) => {
      const event = frame["event"] as Record<string, unknown> | undefined;
      return event?.["type"] === "hello";
    });
    const agents = (hello["event"] as { agents: { agent_id: string; name: string }[] }).agents;
    expect(agents).toHaveLength(1);
    expect(agents[0]?.name).toBe("Scout");
    chips.say("Is the order in?");
    const heard = await until(socket, (frame) => {
      const event = frame["event"] as Record<string, unknown> | undefined;
      return event?.["type"] === "message.new";
    });
    const event = heard["event"] as Record<string, unknown>;
    expect(event["for"]).toEqual([agents[0]?.agent_id]);
    expect(event["addressed_to"]).toEqual([agents[0]?.agent_id]);
    socket.close();
  });

  it("hands one of a harness's agents' words to another of them, as the real server does (ADR 0101)", async () => {
    await chips.close();
    chips = await startFakeChips({
      harnessName: "Scout",
      capabilities: [HARNESS_CAPABILITIES.agents],
    });
    const { harnessId, spaceId } = chips.address;
    const tree = await post(
      `/v1/harnesses/${harnessId}/agents`,
      { key: "tree", name: "Tree" },
      "s1",
    );
    const treeId = String(tree.json["agent_id"]);
    chips.asOwner({
      type: "membership.added",
      space_id: spaceId,
      participant_id: treeId,
      participant_kind: "agent",
      role: "member",
    });
    const listed = await get(`/v1/harnesses/${harnessId}/agents`);
    const scout = (listed.json["agents"] as { agent_id: string; key: string }[]).find(
      (agent) => agent.key === harnessId,
    )?.agent_id;
    const socket = await subscribed();
    await post(
      `/v1/harnesses/${harnessId}/events`,
      {
        type: "message.post",
        space_id: spaceId,
        text: "@Tree add K–O to the page.",
        actor: { kind: "agent", id: scout },
      },
      "s2",
    );
    const heard = await until(socket, (frame) => {
      const event = frame["event"] as Record<string, unknown> | undefined;
      return event?.["type"] === "message.new";
    });
    const event = heard["event"] as Record<string, unknown>;
    expect(event["for"]).toEqual([treeId]);
    expect((event["from"] as { participant_id: string }).participant_id).toBe(scout);
    socket.close();
  });

  it("tells an agent a message chosen for it with no @ is its, and one for all that all have it, as the real server does", async () => {
    await chips.close();
    chips = await startFakeChips({
      harnessName: "Scout",
      capabilities: [HARNESS_CAPABILITIES.agents],
    });
    const { harnessId, spaceId } = chips.address;
    const tree = await post(
      `/v1/harnesses/${harnessId}/agents`,
      { key: "tree", name: "Tree" },
      "y1",
    );
    const treeId = String(tree.json["agent_id"]);
    chips.asOwner({
      type: "membership.added",
      space_id: spaceId,
      participant_id: treeId,
      participant_kind: "agent",
      role: "member",
    });
    const socket = await subscribed();
    chips.asOwner({ type: "message.post", space_id: spaceId, text: "Say hello", to: [treeId] });
    const heard = await until(socket, (frame) => {
      const event = frame["event"] as Record<string, unknown> | undefined;
      return event?.["type"] === "message.new";
    });
    const event = heard["event"] as { for: string[]; room: { notes: Record<string, string> } };
    expect(event.for).toEqual([treeId]);
    expect(event.room.notes[treeId]).toMatch(
      /^Arjun sent this message to you without an @: it is yours to answer\. In this space:/,
    );
    // One for every agent says so instead (ADR 0249).
    chips.asOwner({ type: "message.post", space_id: spaceId, text: "Say hello, all", to: "all" });
    const toAll = await until(socket, (frame) => {
      const each = frame["event"] as Record<string, unknown> | undefined;
      return each?.["type"] === "message.new" && each["text"] === "Say hello, all";
    });
    const all = toAll["event"] as { room: { notes: Record<string, string> } };
    expect(all.room.notes[treeId]).toMatch(
      /^Arjun sent this message to every agent here, so each of you has it: answer it yourself, and don't pass it on with an @\. In this space:/,
    );
    socket.close();
  });

  it("registers an agent by the harness's key, once, and refuses a second lead", async () => {
    const { harnessId } = chips.address;
    const made = await post(
      `/v1/harnesses/${harnessId}/agents`,
      { key: "tree", name: "Tree" },
      "a1",
    );
    expect(made.status).toBe(201);
    const again = await post(
      `/v1/harnesses/${harnessId}/agents`,
      { key: "tree", name: "Tree" },
      "a2",
    );
    expect(again).toMatchObject({ status: 200, json: { agent_id: made.json["agent_id"] } });
    const renamed = await post(
      `/v1/harnesses/${harnessId}/agents`,
      { key: "tree", name: "Oak" },
      "a3",
    );
    expect(renamed.json).toMatchObject({ name: "Oak", renamed: true });
    expect(
      (await post(`/v1/harnesses/${harnessId}/agents`, { key: "j", name: "J", lead: true }, "a4"))
        .status,
    ).toBe(201);
    const second = await post(
      `/v1/harnesses/${harnessId}/agents`,
      { key: "k", name: "K", lead: true },
      "a5",
    );
    expect(second.status).toBe(422);
    const listed = await get(`/v1/harnesses/${harnessId}/agents`);
    expect((listed.json["agents"] as { key: string }[]).map((agent) => agent.key)).toEqual([
      harnessId,
      "tree",
      "j",
    ]);
  });

  it("names the default agent by the harness's own id, which takes Main from another (ADR 0183)", async () => {
    const { harnessId } = chips.address;
    const path = `/v1/harnesses/${harnessId}/agents`;
    await post(path, { key: "j", name: "J", lead: true }, "c1");
    const main = await post(path, { key: harnessId, name: "J's harness", lead: true }, "c2");
    expect(main).toMatchObject({ status: 200, json: { key: harnessId } });
    const listed = (await get(path)).json["agents"] as { key: string; lead: boolean }[];
    expect(listed.filter((agent) => agent.lead).map((agent) => agent.key)).toEqual([harnessId]);
    expect(
      (await post(path, { key: "hrn_01M00000000000000000000000", name: "Theirs" }, "c3")).status,
    ).toBe(422);
    expect((await post(path, { key: "k", name: "K", lead: true }, "c4")).status).toBe(422);
  });

  it("archives an agent and brings it back, and a name may come back", async () => {
    const path = `/v1/harnesses/${chips.address.harnessId}/agents`;
    const made = await post(path, { key: "tax", name: "Tax", state: "archived" }, "b1");
    expect(made).toMatchObject({ status: 201, json: { state: "archived" } });
    expect(
      (await post(path, { key: "tax", name: "Tax", state: "active" }, "b2")).json,
    ).toMatchObject({ state: "active" });
    await post(path, { key: "tax", name: "Taxes" }, "b3");
    await post(path, { key: "tax", name: "Tax" }, "b4");
    expect((await post(path, { key: "tax", name: "Taxes" }, "b5")).json).toMatchObject({
      name: "Taxes",
      renamed: true,
    });
    expect((await post(path, { key: "tax", name: "Tax", state: "gone" }, "b6")).status).toBe(422);
  });

  it("attaches an agent in the place of the one in the room, once", async () => {
    const { harnessId, spaceId } = chips.address;
    const listed = await get(`/v1/harnesses/${harnessId}/agents`);
    const fallback = (listed.json["agents"] as { agent_id: string; key: string }[]).find(
      (agent) => agent.key === harnessId,
    );
    const tree = await post(
      `/v1/harnesses/${harnessId}/agents`,
      { key: "tree", name: "Tree" },
      "c1",
    );
    const agentId = String(tree.json["agent_id"]);
    const where = { space_id: spaceId, replacing: fallback?.agent_id };
    expect((await post(`/v1/agents/${agentId}/attach`, where, "c2")).json).toMatchObject({
      attached: true,
    });
    expect((await post(`/v1/agents/${agentId}/attach`, where, "c3")).json).toMatchObject({
      attached: false,
    });
    // What the harness says as itself there is its one agent's there now.
    const said = await post(
      `/v1/harnesses/${harnessId}/events`,
      { type: "message.post", space_id: spaceId, text: "Tree here." },
      "c4",
    );
    expect(said.status).toBe(201);
    const heard = chips.workspace.log.findLast((event) => event.type === "message.post");
    expect(heard?.actor).toMatchObject({ kind: "agent", id: agentId });
    expect(
      (
        await post(
          `/v1/agents/agt_nobody/attach`,
          { space_id: spaceId, replacing: harnessId },
          "c5",
        )
      ).status,
    ).toBe(404);
  });
});
