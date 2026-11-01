/**
 * An agent's context window (ADR 0146): a harness's copy, read by the people who run it; a new
 * limit and a Compact now down the harness's socket that hears `context_windows`, answered or
 * refused by its next copy; and the quiet line in the agent's room when a copy says it compacted.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import {
  viewOfCompaction,
  viewOfWindowChange,
} from "../../../application/use-cases/agent-context-windows.js";
import {
  createTestWorkspace,
  type TestPerson,
  type TestWorkspace,
} from "../../../testing/workspace.js";

let ws: TestWorkspace;
let port: number;
const BASE = "http://chips.local";

beforeEach(async () => {
  ws = await createTestWorkspace();
  ({ port } = await ws.gateway.listen());
});
afterEach(async () => {
  await ws.close();
});

type Body = Record<string, unknown>;

async function call(
  method: string,
  path: string,
  options: { person?: TestPerson; harness?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; body: Body }> {
  const raw = options.body === undefined ? "" : JSON.stringify(options.body);
  const signed = options.harness ?? (options.person ?? ws.arjun).sign(method, path, raw);
  const response = await ws.gateway.app.fetch(
    new Request(`${BASE}${path}`, {
      method,
      headers: { "content-type": "application/json", ...signed },
      ...(raw === "" ? {} : { body: raw }),
    }),
  );
  return { status: response.status, body: (await response.json()) as Body };
}

const scout = () => ws.scout.participantId;
const asScout = () => ws.scout.headers;

async function declare(capabilities = ["agents", "context_windows"]): Promise<void> {
  const declared = await call("PATCH", `/v1/harnesses/${scout()}`, { body: { capabilities } });
  expect(declared.status).toBe(200);
}

async function registerAgent(name = "Lathe 1"): Promise<string> {
  const answer = await call("POST", `/v1/harnesses/${scout()}/agents`, {
    harness: asScout(),
    body: { key: `k-${name}`, name },
  });
  return String(answer.body["agent_id"]);
}

const LAST = { at: "2026-10-09T16:14:00.000Z", from: 221_000, to: 24_000, by: "itself" };

/** 172K of a 272K window, compacting itself at 80%, as an adapter sends it. */
const copy = (extra: Body = {}): Body => ({
  used: 172_000,
  window: 272_000,
  model: "gpt-6.1-sol",
  as_of: "2026-10-09T18:20:00.000Z",
  last: LAST,
  compacts: true,
  limit: { at: 80, choices: [50, 60, 70, 80, 90], default: 80, may_turn_off: false },
  editable: true,
  ...extra,
});

const sendCopy = (agentId: string, extra: Body = {}) =>
  call("PUT", `/v1/agents/${agentId}/context-window`, { harness: asScout(), body: copy(extra) });

const limit = (agentId: string, body: Body, person?: TestPerson) =>
  call("POST", `/v1/agents/${agentId}/context-window/changes`, {
    body,
    ...(person ? { person } : {}),
  });

const compact = (agentId: string, person?: TestPerson) =>
  call("POST", `/v1/agents/${agentId}/context-window/compactions`, person ? { person } : {});

const read = (agentId: string, person?: TestPerson) =>
  call("GET", `/v1/agents/${agentId}/context-window`, person ? { person } : {});

async function scoutSocket(accepts: string[]) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/v1/ws`, { headers: ws.scout.headers });
  const frames: Body[] = [];
  socket.on("message", (data) => frames.push(JSON.parse(data.toString())));
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  socket.send(
    JSON.stringify({
      frame: "hello",
      protocol: { min: 1, max: 1 },
      client: { name: "scout", version: "0" },
      accepts,
    }),
  );
  await until(() => frames.length > 0);
  return { socket, frames };
}

async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !done(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** A declared harness, one agent with its copy sent, and a socket that hears asks. */
async function ready() {
  await declare();
  const agentId = await registerAgent();
  expect((await sendCopy(agentId)).status).toBe(200);
  const hears = await scoutSocket(["context_windows"]);
  return { agentId, hears };
}

describe("an agent's context window, as its harness sends it (ADR 0146)", () => {
  it("is read by the harness's owner, as sent, and only once the harness declares context windows", async () => {
    const agentId = await registerAgent();
    expect((await sendCopy(agentId)).status).toBe(200);
    const undeclared = await read(agentId);
    expect(undeclared.status).toBe(404);
    expect(JSON.stringify(undeclared.body)).toContain("doesn't share context windows");

    await declare();
    const seen = await read(agentId);
    expect(seen.status).toBe(200);
    expect(seen.body).toEqual({
      agent_id: agentId,
      harness_id: scout(),
      ...copy(),
      read_at: expect.any(String),
      away: true,
    });
  });

  it("carries the agent's last long turn as sent", async () => {
    await declare();
    const agentId = await registerAgent();
    const long_turn = { at: "2026-10-09T16:16:00.000Z", peak: 218_000, folds: 1 };
    await sendCopy(agentId, { long_turn });
    expect((await read(agentId)).body).toMatchObject({ long_turn });
  });

  it("is a 404 until the harness has sent it", async () => {
    await declare();
    const agentId = await registerAgent();
    const unsent = await read(agentId);
    expect(unsent.status).toBe(404);
    expect(JSON.stringify(unsent.body)).toContain("hasn't said how full");
  });

  it("is read and asked of by an admin, and by nobody else but the owner", async () => {
    const { agentId, hears } = await ready();
    const priya = await ws.addPerson("Priya", "admin");
    expect((await read(agentId, priya)).status).toBe(200);
    const member = await ws.addPerson("Mo", "member");
    expect((await read(agentId, member)).status).toBe(403);
    expect((await limit(agentId, { at: 70 }, member)).status).toBe(403);
    expect((await compact(agentId, member)).status).toBe(403);
    expect((await limit(agentId, { at: 70 }, priya)).status).toBe(202);
    expect((await compact(agentId, priya)).status).toBe(202);
    hears.socket.close();
  });

  it("is sent by the agent's own harness only", async () => {
    await declare();
    const agentId = await registerAgent();
    const byPerson = await call("PUT", `/v1/agents/${agentId}/context-window`, { body: copy() });
    expect(byPerson.status).toBe(403);
  });

  it("refuses a limit not among its choices, and reasons where none is due", async () => {
    await declare();
    const agentId = await registerAgent();
    const choices = { at: 75, choices: [50, 80], default: 80, may_turn_off: false };
    expect((await sendCopy(agentId, { limit: choices })).status).toBe(422);
    expect((await sendCopy(agentId, { why_read_only: "Lathe keeps it." })).status).toBe(422);
    expect((await sendCopy(agentId, { why_not: "Lathe compacts it." })).status).toBe(422);
    expect((await sendCopy(agentId, { window: 0 })).status).toBe(422);
  });

  it("is forgotten with the agent, and with its harness", async () => {
    await declare();
    const agentId = await registerAgent();
    await sendCopy(agentId);
    expect((await call("DELETE", `/v1/agents/${agentId}`)).status).toBe(200);
    expect((await read(agentId)).status).toBe(404);
    expect(await ws.db.selectFrom("agent_context_windows").selectAll().execute()).toEqual([]);

    await sendCopy(await registerAgent("Lathe 2"));
    expect((await ws.db.selectFrom("agent_context_windows").selectAll().execute()).length).toBe(1);
    expect((await call("DELETE", `/v1/harnesses/${scout()}`)).status).toBe(200);
    expect(await ws.db.selectFrom("agent_context_windows").selectAll().execute()).toEqual([]);
  });
});

describe("a new limit, down the harness's socket (ADR 0146)", () => {
  it("goes to the socket that hears context windows, waits, and is saved by the copy that answers it", async () => {
    const { agentId, hears } = await ready();
    const deaf = await scoutSocket(["models"]);

    const asked = await limit(agentId, { at: 70 });
    expect(asked.status).toBe(202);
    expect(asked.body).toMatchObject({ at: 70, state: "waiting" });
    const changeId = String(asked.body["change_id"]);
    expect(changeId).toMatch(/^chg_/);
    await until(() => hears.frames.some((f) => f["frame"] === "context_window.change"));
    expect(hears.frames.find((f) => f["frame"] === "context_window.change")).toEqual({
      frame: "context_window.change",
      change_id: changeId,
      harness_id: scout(),
      agent_id: agentId,
      at: 70,
      asked_by: ws.arjun.participantId,
      asked_at: expect.any(String),
    });
    expect(deaf.frames.some((f) => f["frame"] === "context_window.change")).toBe(false);

    const answered = await sendCopy(agentId, {
      limit: { at: 70, choices: [50, 60, 70, 80, 90], default: 80, may_turn_off: false },
      answers: changeId,
    });
    expect(answered.status).toBe(200);
    expect((await read(agentId)).body).toMatchObject({
      limit: { at: 70 },
      change: { change_id: changeId, state: "saved", answered_at: expect.any(String) },
    });
    hears.socket.close();
    deaf.socket.close();
  });

  it("is failed, with the harness's words, by the copy that refuses it", async () => {
    const { agentId, hears } = await ready();
    const changeId = String((await limit(agentId, { at: 50 })).body["change_id"]);
    await sendCopy(agentId, {
      refuses: { change_id: changeId, message: "Lathe can't go so low." },
    });
    expect((await read(agentId)).body).toMatchObject({
      limit: { at: 80 },
      change: { state: "failed", message: "Lathe can't go so low." },
    });
    hears.socket.close();
  });

  it("refuses a limit not among the choices, and only when asked where it may not be picked", async () => {
    const { agentId, hears } = await ready();
    const stranger = await limit(agentId, { at: 75 });
    expect(stranger.status).toBe(422);
    expect(JSON.stringify(stranger.body)).toContain("isn't one this agent offers");
    const off = await limit(agentId, { at: null });
    expect(off.status).toBe(422);
    expect(JSON.stringify(off.body)).toContain("has to compact itself");
    expect(hears.frames.some((f) => f["frame"] === "context_window.change")).toBe(false);

    await sendCopy(agentId, {
      limit: { at: null, choices: [50, 60, 70, 80, 90], default: null, may_turn_off: true },
    });
    expect((await limit(agentId, { at: 80 })).status).toBe(202);
    hears.socket.close();
  });

  it("refuses an agent whose harness keeps its own limit, or won't let Chips change it", async () => {
    await declare();
    const agentId = await registerAgent();
    await sendCopy(agentId, { limit: undefined });
    const hears = await scoutSocket(["context_windows"]);
    const ownLimit = await limit(agentId, { at: 70 });
    expect(ownLimit.status).toBe(422);
    expect(JSON.stringify(ownLimit.body)).toContain("keeps its own limit");
    const why = "Lathe keeps this one's limit. Change it in Lathe.";
    await sendCopy(agentId, { editable: false, why_read_only: why });
    expect((await limit(agentId, { at: 70 })).body).toMatchObject({ error: { message: why } });
    hears.socket.close();
  });

  it("is refused at once when nothing of the harness hears it, and while the last waits", async () => {
    await declare();
    const agentId = await registerAgent();
    await sendCopy(agentId);
    const away = await limit(agentId, { at: 70 });
    expect(away.status).toBe(422);
    expect(away.body).toMatchObject({ error: { refusal: "harness_away" } });
    expect((await read(agentId)).body).toMatchObject({ away: true, change: { state: "failed" } });

    const hears = await scoutSocket(["context_windows"]);
    expect((await limit(agentId, { at: 70 })).status).toBe(202);
    const again = await limit(agentId, { at: 60 });
    expect(again.body).toMatchObject({ error: { refusal: "change_waiting" } });
    hears.socket.close();
  });
});

describe("a Compact now, down the harness's socket (ADR 0146)", () => {
  it("goes down, is taken by the copy that answers it compacting, and done when a copy stops", async () => {
    const { agentId, hears } = await ready();
    const asked = await compact(agentId);
    expect(asked.status).toBe(202);
    expect(asked.body).toMatchObject({ state: "waiting" });
    const askId = String(asked.body["change_id"]);
    await until(() => hears.frames.some((f) => f["frame"] === "context_window.compact"));
    expect(hears.frames.find((f) => f["frame"] === "context_window.compact")).toEqual({
      frame: "context_window.compact",
      change_id: askId,
      harness_id: scout(),
      agent_id: agentId,
      asked_by: ws.arjun.participantId,
      asked_at: expect.any(String),
    });

    await sendCopy(agentId, { compacting: "queued", answers: askId });
    expect((await read(agentId)).body).toMatchObject({
      compacting: "queued",
      compaction: { change_id: askId, state: "taken", answered_at: expect.any(String) },
    });
    const twice = await compact(agentId);
    expect(twice.status).toBe(422);
    expect(twice.body).toMatchObject({ error: { refusal: "change_waiting" } });

    await sendCopy(agentId, { compacting: "running" });
    expect((await read(agentId)).body).toMatchObject({ compaction: { state: "taken" } });
    const last = { at: "2026-10-09T18:25:00.000Z", from: 172_000, to: 21_000, by: "asked" };
    await sendCopy(agentId, { used: 21_000, last });
    const done = (await read(agentId)).body;
    expect(done).toMatchObject({
      used: 21_000,
      last,
      compaction: { state: "done", done_at: expect.any(String) },
    });
    expect(done["compacting"]).toBeUndefined();
    hears.socket.close();
  });

  it("is done at once by an answer that is not compacting", async () => {
    const { agentId, hears } = await ready();
    const askId = String((await compact(agentId)).body["change_id"]);
    await sendCopy(agentId, { answers: askId });
    expect((await read(agentId)).body).toMatchObject({ compaction: { state: "done" } });
    hears.socket.close();
  });

  it("is failed, with the harness's words, by the copy that refuses it", async () => {
    const { agentId, hears } = await ready();
    const askId = String((await compact(agentId)).body["change_id"]);
    await sendCopy(agentId, { refuses: { change_id: askId, message: "Nothing to compact yet." } });
    expect((await read(agentId)).body).toMatchObject({
      compaction: { state: "failed", message: "Nothing to compact yet." },
    });
    hears.socket.close();
  });

  it("is refused for an agent that takes none, in the harness's words, and while it compacts", async () => {
    await declare();
    const agentId = await registerAgent();
    const why = "Lathe compacts it only from its own app.";
    await sendCopy(agentId, { compacts: false, why_not: why });
    const hears = await scoutSocket(["context_windows"]);
    expect((await compact(agentId)).body).toMatchObject({ error: { message: why } });
    await sendCopy(agentId, { compacting: "running" });
    expect((await compact(agentId)).body).toMatchObject({
      error: { message: "It is compacting already." },
    });
    hears.socket.close();
  });

  it("is refused at once when nothing of the harness hears it", async () => {
    await declare();
    const agentId = await registerAgent();
    await sendCopy(agentId);
    const away = await compact(agentId);
    expect(away.body).toMatchObject({ error: { refusal: "harness_away" } });
    expect((await read(agentId)).body).toMatchObject({ compaction: { state: "failed" } });
  });

  it("refuses an answer to an ask not made of that agent", async () => {
    const { agentId, hears } = await ready();
    const other = await registerAgent("Lathe 2");
    await sendCopy(other);
    const askId = String((await compact(agentId)).body["change_id"]);
    const wrong = await sendCopy(other, { answers: askId });
    expect(wrong.status).toBe(422);
    expect(JSON.stringify(wrong.body)).toContain("isn't one made of this agent");
    hears.socket.close();
  });
});

describe("an ask not answered", () => {
  it("reads as missed once its minute has passed, a limit and a Compact now alike", () => {
    const askedAt = "2026-10-09T17:00:00.000Z";
    const base = { id: "chg_01K4ZQPX00000000000000000Z", askedBy: "usr_1", askedAt };
    const change = { ...base, at: 70, state: "waiting" as const, message: null, answeredAt: null };
    const compaction = {
      ...base,
      state: "waiting" as const,
      message: null,
      answeredAt: null,
      doneAt: null,
    };
    const at = (iso: string) => [
      viewOfWindowChange(change, Date.parse(iso)).state,
      viewOfCompaction(compaction, Date.parse(iso)).state,
    ];
    expect(at("2026-10-09T17:00:59.000Z")).toEqual(["waiting", "waiting"]);
    expect(at("2026-10-09T17:01:01.000Z")).toEqual(["missed", "missed"]);
    const taken = viewOfCompaction(
      { ...compaction, state: "taken" },
      Date.parse("2026-10-09T18:00:00.000Z"),
    );
    expect(taken.state).toBe("taken");
  });

  it("lets a new Compact now be asked once the last is missed", async () => {
    const { agentId, hears } = await ready();
    const first = String((await compact(agentId)).body["change_id"]);
    const row = await ws.db
      .selectFrom("agent_context_windows")
      .select("compaction")
      .executeTakeFirstOrThrow();
    const late = { ...JSON.parse(row.compaction ?? "{}"), askedAt: "2026-01-01T00:00:00.000Z" };
    await ws.db
      .updateTable("agent_context_windows")
      .set({ compaction: JSON.stringify(late) })
      .execute();
    expect((await read(agentId)).body).toMatchObject({ compaction: { state: "missed" } });
    const next = await compact(agentId);
    expect(next.status).toBe(202);
    expect(next.body["change_id"]).not.toBe(first);
    hears.socket.close();
  });
});

describe("the line in the agent's room (ADR 0146)", () => {
  const compactedLines = async () =>
    (await ws.gateway.deps.store.since(ws.workspaceId, 0, 1000)).events.filter(
      (event) => event.type === "context.compacted",
    );

  async function agentInRoom(): Promise<string> {
    await declare();
    const agentId = await registerAgent("Tree");
    const attached = await call("POST", `/v1/agents/${agentId}/attach`, {
      harness: asScout(),
      body: { space_id: ws.spaceId, replacing: scout() },
    });
    expect(attached.body).toMatchObject({ attached: true });
    return agentId;
  }

  it("is written once when a copy says the agent compacted since the last, never for the first", async () => {
    const agentId = await agentInRoom();
    await sendCopy(agentId);
    expect(await compactedLines()).toEqual([]);

    const last = { at: "2026-10-09T18:25:00.000Z", from: 214_000, to: 21_000, by: "itself" };
    await sendCopy(agentId, { used: 21_000, last });
    await sendCopy(agentId, { used: 23_000, last });
    const lines = await compactedLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      space_id: ws.spaceId,
      actor: { kind: "agent", id: agentId },
      payload: { from: 214_000, to: 21_000, window: 272_000, by: "itself" },
    });
  });

  it("is not written for a compaction that saved nothing (CW-1)", async () => {
    const agentId = await agentInRoom();
    await sendCopy(agentId);
    const last = { at: "2026-10-09T20:39:37.000Z", from: 9108, to: 9108, by: "asked" };
    await sendCopy(agentId, { used: 9108, last });
    expect(await compactedLines()).toEqual([]);
  });

  it("is not written for an agent in no room", async () => {
    await declare();
    const agentId = await registerAgent();
    await sendCopy(agentId);
    const last = { at: "2026-10-09T18:25:00.000Z", from: 214_000, to: 21_000, by: "asked" };
    await sendCopy(agentId, { last });
    expect(await compactedLines()).toEqual([]);
  });
});
