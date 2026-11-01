/**
 * An agent's model and effort (ADR 0140): a harness's copy, read by the people who run it; a
 * change down the harness's socket that hears `models`, answered or refused by its next copy.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { changeView } from "../../../application/use-cases/agent-models.js";
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

async function declare(capabilities = ["agents", "models"]): Promise<void> {
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

const levels = [
  { id: "light", label: "Light" },
  { id: "steady", label: "Steady" },
  { id: "deep", label: "Deep" },
];
const choices = [
  { id: "heron-2", label: "Heron 2", efforts: levels, effort_default: "steady" },
  { id: "heron-2-mini", label: "Heron 2 Mini", efforts: [] },
];
/** An agent that follows its harness's default, as an adapter sends it. */
const copy = (extra: Body = {}): Body => ({
  model: "heron-2",
  effort: "steady",
  own: false,
  default: { label: "Same as Lathe", model: "heron-2", effort: "steady" },
  choices,
  editable: true,
  ...extra,
});

const sendCopy = (agentId: string, extra: Body = {}) =>
  call("PUT", `/v1/agents/${agentId}/model`, { harness: asScout(), body: copy(extra) });

const change = (agentId: string, body: Body, person?: TestPerson) =>
  call("POST", `/v1/agents/${agentId}/model/changes`, { body, ...(person ? { person } : {}) });

const read = (agentId: string, person?: TestPerson) =>
  call("GET", `/v1/agents/${agentId}/model`, person ? { person } : {});

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

/** A declared harness, one agent with its copy sent, and a socket that hears changes. */
async function ready() {
  await declare();
  const agentId = await registerAgent();
  expect((await sendCopy(agentId)).status).toBe(200);
  const hears = await scoutSocket(["models"]);
  return { agentId, hears };
}

describe("an agent's model, as its harness sends it (ADR 0140)", () => {
  it("is read by the harness's owner, as sent, and only once the harness declares models", async () => {
    const agentId = await registerAgent();
    expect((await sendCopy(agentId, { followed_by: 2 })).status).toBe(200);
    const undeclared = await read(agentId);
    expect(undeclared.status).toBe(404);
    expect(JSON.stringify(undeclared.body)).toContain("doesn't share its models");

    await declare();
    const seen = await read(agentId);
    expect(seen.status).toBe(200);
    expect(seen.body).toEqual({
      agent_id: agentId,
      harness_id: scout(),
      ...copy({ followed_by: 2 }),
      read_at: expect.any(String),
      away: true,
    });
  });

  it("is a 404 until the harness has sent it", async () => {
    await declare();
    const agentId = await registerAgent();
    const unsent = await read(agentId);
    expect(unsent.status).toBe(404);
    expect(JSON.stringify(unsent.body)).toContain("hasn't said what this agent runs on");
  });

  it("is read and changed by an admin, and by nobody else but the owner", async () => {
    const { agentId, hears } = await ready();
    const priya = await ws.addPerson("Priya", "admin");
    expect((await read(agentId, priya)).status).toBe(200);
    const member = await ws.addPerson("Mo", "member");
    expect((await read(agentId, member)).status).toBe(403);
    const asked = await change(agentId, { model: "heron-2", effort: "deep" }, member);
    expect(asked.status).toBe(403);
    expect((await change(agentId, { model: "heron-2", effort: "deep" }, priya)).status).toBe(202);
    hears.socket.close();
  });

  it("is sent by the agent's own harness only", async () => {
    await declare();
    const agentId = await registerAgent();
    const byPerson = await call("PUT", `/v1/agents/${agentId}/model`, { body: copy() });
    expect(byPerson.status).toBe(403);

    const raw = JSON.stringify({ name: "Kiln" });
    const added = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/harnesses`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...ws.arjun.sign("POST", "/v1/harnesses", raw),
        },
        body: raw,
      }),
    );
    const kiln = { authorization: `Bearer ${((await added.json()) as { token: string }).token}` };
    const another = await call("PUT", `/v1/agents/${agentId}/model`, {
      harness: kiln,
      body: copy(),
    });
    expect(another.status).toBe(403);
    expect(JSON.stringify(another.body)).toContain("isn't yours");
  });

  it("refuses a model not among its choices, and an effort not its model's", async () => {
    await declare();
    const agentId = await registerAgent();
    expect((await sendCopy(agentId, { model: "kestrel-1" })).status).toBe(422);
    expect((await sendCopy(agentId, { effort: "frantic" })).status).toBe(422);
    const levelOnMini = await sendCopy(agentId, { model: "heron-2-mini", effort: "light" });
    expect(levelOnMini.status).toBe(422);
  });

  it("is forgotten with the agent", async () => {
    await declare();
    const agentId = await registerAgent();
    await sendCopy(agentId);
    expect((await call("DELETE", `/v1/agents/${agentId}`)).status).toBe(200);
    expect((await read(agentId)).status).toBe(404);
    const rows = await ws.db.selectFrom("agent_models").selectAll().execute();
    expect(rows).toEqual([]);
  });

  it("is forgotten with its harness", async () => {
    await declare();
    await sendCopy(await registerAgent());
    expect((await ws.db.selectFrom("agent_models").selectAll().execute()).length).toBe(1);
    const removed = await call("DELETE", `/v1/harnesses/${scout()}`);
    expect(removed.status).toBe(200);
    expect(await ws.db.selectFrom("agent_models").selectAll().execute()).toEqual([]);
  });
});

describe("a change, down the harness's socket (ADR 0140)", () => {
  it("goes to the socket that hears models, waits, and is saved by the copy that answers it", async () => {
    const { agentId, hears } = await ready();
    const deaf = await scoutSocket([]);

    const asked = await change(agentId, { model: "heron-2-mini", effort: null });
    expect(asked.status).toBe(202);
    expect(asked.body).toMatchObject({ model: "heron-2-mini", effort: null, state: "waiting" });
    const changeId = String(asked.body["change_id"]);
    expect(changeId).toMatch(/^chg_/);
    await until(() => hears.frames.some((f) => f["frame"] === "model.change"));
    expect(hears.frames.find((f) => f["frame"] === "model.change")).toEqual({
      frame: "model.change",
      change_id: changeId,
      harness_id: scout(),
      agent_id: agentId,
      model: "heron-2-mini",
      effort: null,
      asked_by: ws.arjun.participantId,
      asked_at: expect.any(String),
    });
    expect(deaf.frames.some((f) => f["frame"] === "model.change")).toBe(false);

    const waiting = await read(agentId);
    expect(waiting.body).toMatchObject({ away: false, change: { state: "waiting" } });

    const answered = await sendCopy(agentId, {
      model: "heron-2-mini",
      effort: undefined,
      own: true,
      answers: changeId,
    });
    expect(answered.status).toBe(200);
    const saved = await read(agentId);
    expect(saved.body).toMatchObject({
      model: "heron-2-mini",
      own: true,
      change: { change_id: changeId, state: "saved", answered_at: expect.any(String) },
    });
    expect(saved.body["effort"]).toBeUndefined();
    expect(saved.body["answers"]).toBeUndefined();
    hears.socket.close();
    deaf.socket.close();
  });

  it("is failed, with the harness's words, by the copy that refuses it", async () => {
    const { agentId, hears } = await ready();
    const asked = await change(agentId, { model: "heron-2", effort: "deep" });
    const changeId = String(asked.body["change_id"]);
    await sendCopy(agentId, {
      refuses: { change_id: changeId, message: "Lathe can't run that now." },
    });
    expect((await read(agentId)).body).toMatchObject({
      effort: "steady",
      change: { state: "failed", message: "Lathe can't run that now." },
    });
    hears.socket.close();
  });

  it("takes neither model nor effort for the default, and refuses it where there is none", async () => {
    const { agentId, hears } = await ready();
    const same = await change(agentId, { model: null, effort: null });
    expect(same.status).toBe(202);
    const changeId = String(same.body["change_id"]);
    await until(() => hears.frames.some((f) => f["change_id"] === changeId));
    expect(hears.frames.find((f) => f["change_id"] === changeId)).toMatchObject({
      model: null,
      effort: null,
    });
    await sendCopy(agentId, { answers: changeId, default: undefined });
    const noDefault = await change(agentId, { model: null, effort: null });
    expect(noDefault.status).toBe(422);
    expect(JSON.stringify(noDefault.body)).toContain("no default to follow");
    const half = await change(agentId, { model: null, effort: "deep" });
    expect(half.status).toBe(422);
    hears.socket.close();
  });

  it("refuses a model not among the choices, and an effort that isn't the model's", async () => {
    const { agentId, hears } = await ready();
    const stranger = await change(agentId, { model: "kestrel-1", effort: null });
    expect(stranger.status).toBe(422);
    expect(JSON.stringify(stranger.body)).toContain("isn't one this agent can run on");
    const frantic = await change(agentId, { model: "heron-2", effort: "frantic" });
    expect(frantic.status).toBe(422);
    expect(JSON.stringify(frantic.body)).toContain("Heron 2's effort levels");
    const noLevel = await change(agentId, { model: "heron-2", effort: null });
    expect(noLevel.status).toBe(422);
    const levelOnMini = await change(agentId, { model: "heron-2-mini", effort: "deep" });
    expect(levelOnMini.status).toBe(422);
    expect(JSON.stringify(levelOnMini.body)).toContain("has no effort levels");
    expect(hears.frames.some((f) => f["frame"] === "model.change")).toBe(false);
    hears.socket.close();
  });

  it("refuses an agent its harness won't let Chips change, in the harness's words", async () => {
    await declare();
    const agentId = await registerAgent();
    const why = "Lathe's own agent. Change it in Lathe.";
    await sendCopy(agentId, { editable: false, why_read_only: why });
    const hears = await scoutSocket(["models"]);
    const asked = await change(agentId, { model: "heron-2", effort: "deep" });
    expect(asked.status).toBe(422);
    expect(asked.body).toMatchObject({ error: { message: why } });
    hears.socket.close();
  });

  it("is refused at once when nothing of the harness hears it: no queue", async () => {
    await declare();
    const agentId = await registerAgent();
    await sendCopy(agentId);
    const away = await change(agentId, { model: "heron-2", effort: "deep" });
    expect(away.status).toBe(422);
    expect(away.body).toMatchObject({ error: { refusal: "harness_away" } });
    expect(JSON.stringify(away.body)).toContain("is away");
    expect((await read(agentId)).body).toMatchObject({ away: true, change: { state: "failed" } });
  });

  it("is refused while the last one waits inside its minute", async () => {
    const { agentId, hears } = await ready();
    expect((await change(agentId, { model: "heron-2", effort: "deep" })).status).toBe(202);
    const again = await change(agentId, { model: "heron-2", effort: "light" });
    expect(again.status).toBe(422);
    expect(again.body).toMatchObject({ error: { refusal: "change_waiting" } });
    hears.socket.close();
  });

  it("is refused for a harness that doesn't declare models, or hasn't sent the agent's", async () => {
    await declare(["agents"]);
    const agentId = await registerAgent();
    await sendCopy(agentId);
    expect((await change(agentId, { model: "heron-2", effort: "deep" })).status).toBe(404);
    await declare();
    const unsent = await registerAgent("Lathe 2");
    expect((await change(unsent, { model: "heron-2", effort: "deep" })).status).toBe(404);
  });

  it("refuses an answer to a change not asked of that agent", async () => {
    const { agentId, hears } = await ready();
    const other = await registerAgent("Lathe 2");
    await sendCopy(other);
    const asked = await change(agentId, { model: "heron-2", effort: "deep" });
    const wrong = await sendCopy(other, { answers: String(asked.body["change_id"]) });
    expect(wrong.status).toBe(422);
    expect(JSON.stringify(wrong.body)).toContain("isn't one asked of this agent");
    hears.socket.close();
  });
});

describe("a change not answered", () => {
  const waiting = {
    id: "chg_01K4ZQPX00000000000000000Z",
    model: "heron-2",
    effort: "deep",
    askedBy: "usr_1",
    askedAt: "2026-10-08T17:00:00.000Z",
    state: "waiting" as const,
    message: null,
    answeredAt: null,
  };

  it("reads as missed once its minute has passed", () => {
    expect(changeView(waiting, Date.parse("2026-10-08T17:00:59.000Z")).state).toBe("waiting");
    expect(changeView(waiting, Date.parse("2026-10-08T17:01:01.000Z")).state).toBe("missed");
  });

  /** Ask a change and let its minute pass: the stored ask is made older than a minute. */
  async function missedChange(agentId: string): Promise<string> {
    const asked = await change(agentId, { model: "heron-2", effort: "deep" });
    const row = await ws.db.selectFrom("agent_models").select("change").executeTakeFirstOrThrow();
    const late = { ...JSON.parse(row.change ?? "{}"), askedAt: "2026-01-01T00:00:00.000Z" };
    await ws.db
      .updateTable("agent_models")
      .set({ change: JSON.stringify(late) })
      .execute();
    expect((await read(agentId)).body).toMatchObject({ change: { state: "missed" } });
    return String(asked.body["change_id"]);
  }

  it("still counts when the harness answers after its minute", async () => {
    const { agentId, hears } = await ready();
    const changeId = await missedChange(agentId);
    await sendCopy(agentId, { effort: "deep", own: true, answers: changeId });
    expect((await read(agentId)).body).toMatchObject({
      effort: "deep",
      change: { change_id: changeId, state: "saved" },
    });
    hears.socket.close();
  });

  it("lets a new change be asked", async () => {
    const { agentId, hears } = await ready();
    const missed = await missedChange(agentId);
    const next = await change(agentId, { model: "heron-2", effort: "light" });
    expect(next.status).toBe(202);
    expect(next.body["change_id"]).not.toBe(missed);
    hears.socket.close();
  });
});
