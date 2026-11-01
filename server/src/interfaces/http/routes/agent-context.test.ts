/**
 * An agent's context files (ADR 0134): a harness's copy, read by its owner; an edit down the
 * harness's socket that hears `context`, answered or refused by its next copy.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { viewOf } from "../../../application/use-cases/context-files.js";
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
  options: { person?: TestPerson; harness?: boolean; body?: unknown } = {},
): Promise<{ status: number; body: Body }> {
  const raw = options.body === undefined ? "" : JSON.stringify(options.body);
  const signed = options.harness
    ? ws.scout.headers
    : (options.person ?? ws.arjun).sign(method, path, raw);
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

async function declare(): Promise<void> {
  const declared = await call("PATCH", `/v1/harnesses/${scout()}`, {
    body: { capabilities: ["agents", "context_files"] },
  });
  expect(declared.status).toBe(200);
}

async function registerAgent(name = "Lathe 1"): Promise<string> {
  const answer = await call("POST", `/v1/harnesses/${scout()}/agents`, {
    harness: true,
    body: { key: `k-${name}`, name },
  });
  return String(answer.body["agent_id"]);
}

const persona = (text = "# Who you are\n\nPlain and careful.", hash = "h1") => ({
  name: "PERSONA.md",
  title: "Who it is",
  role: "identity",
  text,
  hash,
  editable: true,
});
const charter = {
  name: "CHARTER.md",
  title: "Purpose",
  role: "identity",
  editable: false,
  shared: "default",
  replaceable: true,
};

async function sendCopy(
  agentId: string,
  extra: Body = {},
  files: unknown[] = [persona(), charter],
) {
  return await call("PUT", `/v1/agents/${agentId}/context`, {
    harness: true,
    body: { files, not_shown: [{ name: "NOTES.md", reason: "count" }], ...extra },
  });
}

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

const edit = (agentId: string, body: Body, person?: TestPerson) =>
  call("POST", `/v1/agents/${agentId}/context/edits`, { body, ...(person ? { person } : {}) });

describe("an agent's context, as its harness sends it (ADR 0134)", () => {
  it("is read by the harness's owner, as sent, and only once the harness declares it", async () => {
    const agentId = await registerAgent();
    expect((await sendCopy(agentId)).status).toBe(200);
    const undeclared = await call("GET", `/v1/agents/${agentId}/context`);
    expect(undeclared.status).toBe(404);
    expect(JSON.stringify(undeclared.body)).toContain("doesn't share its context files");

    await declare();
    const read = await call("GET", `/v1/agents/${agentId}/context`);
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({
      agent_id: agentId,
      harness_id: scout(),
      files: [
        { name: "PERSONA.md", hash: "h1" },
        { name: "CHARTER.md", shared: "default" },
      ],
      not_shown: [{ name: "NOTES.md", reason: "count" }],
      away: true,
    });
  });

  it("is not read by a member who doesn't run the harness, nor sent by a person", async () => {
    await declare();
    const agentId = await registerAgent();
    await sendCopy(agentId);
    const dana = await ws.addPerson("Dana", "member");
    expect((await call("GET", `/v1/agents/${agentId}/context`, { person: dana })).status).toBe(403);
    expect(
      (await call("PUT", `/v1/agents/${agentId}/context`, { body: { files: [] } })).status,
    ).toBe(403);
  });

  it("refuses a ninth file and a text over 64 KB, so none is lost in silence", async () => {
    const agentId = await registerAgent();
    const nine = Array.from({ length: 9 }, (_, at) => ({ ...persona(), name: `F${at}.md` }));
    expect((await sendCopy(agentId, {}, nine)).status).toBe(422);
    expect((await sendCopy(agentId, {}, [persona("x".repeat(65_537))])).status).toBe(422);
  });

  it("keeps a harness's own set, with what new agents start with", async () => {
    await declare();
    const put = await call("PUT", `/v1/harnesses/${scout()}/context`, {
      harness: true,
      body: {
        shared: [
          { ...charter, id: "default", text: "## Mission", used_by: 3, for_new_agents: true },
        ],
        new_agents_note: "and an About you written from the lead's",
      },
    });
    expect(put.status).toBe(200);
    const read = await call("GET", `/v1/harnesses/${scout()}/context`);
    expect(read.body).toMatchObject({
      harness_id: scout(),
      shared: [{ id: "default", used_by: 3, for_new_agents: true }],
      new_agents_note: "and an About you written from the lead's",
    });
  });

  it("keeps when the agent reads its files, in the harness's words (ADR 0238)", async () => {
    await declare();
    const agentId = await registerAgent();
    const note = "Lathe reads these when a conversation starts.";
    expect((await sendCopy(agentId, { read_note: note })).status).toBe(200);
    expect((await call("GET", `/v1/agents/${agentId}/context`)).body).toMatchObject({
      read_note: note,
    });
    expect((await sendCopy(agentId)).status).toBe(200);
    expect((await call("GET", `/v1/agents/${agentId}/context`)).body).not.toHaveProperty(
      "read_note",
    );
  });

  it("is forgotten with the agent", async () => {
    await declare();
    const agentId = await registerAgent();
    await sendCopy(agentId);
    expect((await call("DELETE", `/v1/agents/${agentId}`)).status).toBe(200);
    expect((await call("GET", `/v1/agents/${agentId}/context`)).status).toBe(404);
  });
});

describe("an edit, down the harness's socket (ADR 0134)", () => {
  it("goes to the socket that hears context, waits, and is saved by the copy that answers it", async () => {
    await declare();
    const agentId = await registerAgent();
    await sendCopy(agentId);
    const hears = await scoutSocket(["context"]);
    const deaf = await scoutSocket([]);

    const asked = await edit(agentId, {
      name: "PERSONA.md",
      text: "# Who you are\n\nBrief.",
      base_hash: "h1",
    });
    expect(asked.status).toBe(202);
    expect(asked.body).toMatchObject({ name: "PERSONA.md", state: "waiting" });
    const editId = String(asked.body["edit_id"]);
    await until(() => hears.frames.some((f) => f["frame"] === "context.edit"));
    expect(hears.frames.find((f) => f["frame"] === "context.edit")).toEqual({
      frame: "context.edit",
      edit_id: editId,
      harness_id: scout(),
      agent_id: agentId,
      name: "PERSONA.md",
      text: "# Who you are\n\nBrief.",
      base_hash: "h1",
      asked_by: ws.arjun.participantId,
      asked_at: expect.any(String),
    });
    expect(deaf.frames.some((f) => f["frame"] === "context.edit")).toBe(false);

    const read = await call("GET", `/v1/agents/${agentId}/context`);
    expect(read.body["away"]).toBe(false);

    await sendCopy(agentId, { answers: editId }, [
      persona("# Who you are\n\nBrief.", "h2"),
      charter,
    ]);
    const saved = await call("GET", `/v1/context/edits/${editId}`);
    expect(saved.body).toMatchObject({ state: "saved", answered_at: expect.any(String) });
    const now = await call("GET", `/v1/agents/${agentId}/context`);
    expect((now.body["files"] as Body[])[0]).toMatchObject({ hash: "h2" });
    hears.socket.close();
    deaf.socket.close();
  });

  it("is refused when the file changed since it was read, with the file as it is", async () => {
    await declare();
    const agentId = await registerAgent();
    await sendCopy(agentId);
    const hears = await scoutSocket(["context"]);
    const stale = await edit(agentId, { name: "PERSONA.md", text: "new", base_hash: "h0" });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({
      error: { code: "stale_context" },
      file: { name: "PERSONA.md", hash: "h1" },
    });
    hears.socket.close();
  });

  it("is changed when the harness refuses it, its file having moved under it", async () => {
    await declare();
    const agentId = await registerAgent();
    await sendCopy(agentId);
    const hears = await scoutSocket(["context"]);
    const asked = await edit(agentId, { name: "PERSONA.md", text: "mine", base_hash: "h1" });
    const editId = String(asked.body["edit_id"]);
    await sendCopy(agentId, { refuses: { edit_id: editId, reason: "changed" } }, [
      persona("theirs", "h3"),
      charter,
    ]);
    expect((await call("GET", `/v1/context/edits/${editId}`)).body).toMatchObject({
      state: "changed",
    });
    hears.socket.close();
  });

  it("is refused at once when nothing of the harness hears it: no queue", async () => {
    await declare();
    const agentId = await registerAgent();
    await sendCopy(agentId);
    const away = await edit(agentId, { name: "PERSONA.md", text: "new", base_hash: "h1" });
    expect(away.status).toBe(422);
    expect(away.body).toMatchObject({ error: { refusal: "harness_away" } });
    expect(JSON.stringify(away.body)).toContain("can't reach");
  });

  it("gives an agent its own of a replaceable shared file, and refuses a read-only one otherwise", async () => {
    await declare();
    const agentId = await registerAgent();
    await sendCopy(agentId);
    const hears = await scoutSocket(["context"]);
    const own = await edit(agentId, {
      name: "CHARTER.md",
      text: "## Mission\nMine.",
      base_hash: null,
    });
    expect(own.status).toBe(202);
    const readOnly = await edit(agentId, { name: "CHARTER.md", text: "x", base_hash: "h" });
    expect(readOnly.status).toBe(422);
    expect(JSON.stringify(readOnly.body)).toContain("read only");
    const notShared = await edit(agentId, { name: "PERSONA.md", text: "x", base_hash: null });
    expect(notShared.status).toBe(422);
    const missing = await edit(agentId, { name: "NOPE.md", text: "x", base_hash: "h" });
    expect(missing.status).toBe(404);
    hears.socket.close();
  });

  it("is the owner's: a member may not ask one", async () => {
    await declare();
    const agentId = await registerAgent();
    await sendCopy(agentId);
    const dana = await ws.addPerson("Dana", "member");
    const asked = await edit(agentId, { name: "PERSONA.md", text: "x", base_hash: "h1" }, dana);
    expect(asked.status).toBe(403);
  });
});

describe("an edit not answered", () => {
  it("reads as missed once its minute has passed", () => {
    const edit = {
      id: "edt_01K4ZQPX00000000000000000Z",
      owner: { workspaceId: "ws_1", kind: "agent" as const, id: "agt_1" },
      harnessId: "hrn_1",
      name: "PERSONA.md",
      baseHash: "h1",
      text: "t",
      askedBy: "usr_1",
      askedAt: "2026-10-07T17:00:00.000Z",
      state: "waiting" as const,
      message: null,
      answeredAt: null,
    };
    expect(viewOf(edit, Date.parse("2026-10-07T17:00:59.000Z")).state).toBe("waiting");
    expect(viewOf(edit, Date.parse("2026-10-07T17:01:01.000Z")).state).toBe("missed");
  });
});
