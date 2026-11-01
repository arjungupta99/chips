/**
 * What a person changes from an agent's page, kept by the harness through the SDK (ADRs 0134,
 * 0140, 0143, 0146), against a real chipsd: the copy sent, a person's change heard as a frame,
 * made by the handler and answered — saved, or refused with the harness's words.
 */

import type { AgentContextPut, AgentModelPut } from "@chipschat/protocol";
import { afterEach, describe, expect, it } from "vitest";
import {
  type AgentContextWindowCopy,
  type AgentModelCopy,
  type Chips,
  connect,
  Refuse,
  Settings,
  type SettingsHandlers,
} from "./index.js";
import { startTestServer, type TestServer } from "./testing/gateway.js";

let server: TestServer | undefined;
const clients: Chips[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  await server?.close();
  server = undefined;
});

async function harness(settings: SettingsHandlers): Promise<{ chips: Chips; server: TestServer }> {
  server = await startTestServer({
    capabilities: ["agents", "context_files", "models", "heartbeats", "context_windows"],
  });
  const chips = await connect({ url: server.url, token: server.token, settings });
  clients.push(chips);
  return { chips, server };
}

const MODELS: AgentModelCopy = {
  model: "heron-2",
  effort: "medium",
  own: true,
  choices: [
    {
      id: "heron-2",
      label: "Heron 2",
      efforts: [
        { id: "medium", label: "Medium" },
        { id: "high", label: "High" },
      ],
    },
    { id: "wren-1", label: "Wren 1", efforts: [] },
  ],
  editable: true,
};

/** Ids of the shape the real server sends, which a frame is now read by (SEC-14). */
const CHANGE = "chg_01K4ZQPX0000000000000000C2";
const AGENT = "agt_01K4ZQPX0000000000000000A1";
const EDIT = "edt_01K4ZQPX0000000000000000E1";
const HARNESS = "hrn_01K4ZQPX0000000000000000H1";
const PERSON = "usr_01K4ZQPX0000000000000000P1";

/** Wait for a condition the server's state will meet, not for a time. */
async function until<T>(read: () => Promise<T | undefined>): Promise<T> {
  for (let tries = 0; tries < 100; tries++) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("never");
}

describe("settings", () => {
  it("says it listens only for what it handles, and makes a person's model change", async () => {
    const asked: AgentModelPut[] = [];
    const { chips, server } = await harness({
      models: async (change) => {
        const copy = { ...MODELS, model: change.model ?? MODELS.model, effort: "high" };
        asked.push(copy as AgentModelPut);
        return copy;
      },
    });
    const agent = await chips.agents.register({ key: "ada", name: "Ada" });
    await chips.settings.model(agent.agentId, MODELS);

    const ask = await server.gateway.deps.agentModels.ask({
      principal: server.person,
      agentId: agent.agentId,
      ask: { model: "heron-2", effort: "high" },
    });
    expect(ask.ok).toBe(true);
    const read = await until(async () => {
      const now = await server.gateway.deps.agentModels.read({
        principal: server.person,
        agentId: agent.agentId,
      });
      return now.ok && now.value.change?.state === "saved" ? now.value : undefined;
    });
    expect(read.kept.said?.effort).toBe("high");
    expect(asked).toHaveLength(1);

    // Nothing was said for heartbeats, so a person's switch finds nobody listening.
    const away = await server.gateway.deps.agentHeartbeats.ask({
      principal: server.person,
      agentId: agent.agentId,
      ask: { on: true },
    });
    expect(away.ok).toBe(false);
  });

  it("refuses with the harness's words and the copy as it is, when the handler throws", async () => {
    const { chips, server } = await harness({
      models: async () => {
        throw new Refuse("Wren can't run here.");
      },
    });
    const agent = await chips.agents.register({ key: "ada", name: "Ada" });
    await chips.settings.model(agent.agentId, MODELS);
    await server.gateway.deps.agentModels.ask({
      principal: server.person,
      agentId: agent.agentId,
      ask: { model: "wren-1", effort: null },
    });
    const change = await until(async () => {
      const now = await server.gateway.deps.agentModels.read({
        principal: server.person,
        agentId: agent.agentId,
      });
      return now.ok && now.value.change?.state === "failed" ? now.value.change : undefined;
    });
    expect(change.message).toBe("Wren can't run here.");
  });

  it("saves a person's edit to an agent's file, and says changed for a stale one", async () => {
    let text = "You are Ada.";
    const copy = (): Omit<AgentContextPut, "answers" | "refuses"> => ({
      files: [
        {
          name: "PERSONA.md",
          title: "Who it is",
          role: "identity",
          text,
          hash: `h${text.length}`,
          editable: true,
        },
      ],
    });
    const { chips, server } = await harness({
      context: async (edit) => {
        if (edit.base_hash !== `h${text.length}`)
          throw new Refuse("It changed.", copy(), "changed");
        text = edit.text;
        return copy();
      },
    });
    const agent = await chips.agents.register({ key: "ada", name: "Ada" });
    await chips.settings.context(agent.agentId, copy());

    const edit = await server.gateway.deps.contextFiles.askEdit({
      principal: server.person,
      kind: "agent",
      id: agent.agentId,
      ask: { name: "PERSONA.md", text: "You are Ada, terse.", base_hash: "h12" },
    });
    if (!edit.ok) throw new Error(edit.error.message);
    const saved = await until(async () => {
      const now = await server.gateway.deps.contextFiles.readEdit({
        principal: server.person,
        editId: edit.value.edit_id,
      });
      return now.ok && now.value.state !== "waiting" ? now.value : undefined;
    });
    expect(saved.state).toBe("saved");
    expect(text).toBe("You are Ada, terse.");

    // The file moves on in the harness before it has sent the new copy: the person's version,
    // the one Chips has, is no longer the harness's.
    text = "You are Ada, changed by hand.";
    const stale = await server.gateway.deps.contextFiles.askEdit({
      principal: server.person,
      kind: "agent",
      id: agent.agentId,
      ask: { name: "PERSONA.md", text: "Old.", base_hash: "h19" },
    });
    if (!stale.ok) throw new Error(stale.error.message);
    const refused = await until(async () => {
      const now = await server.gateway.deps.contextFiles.readEdit({
        principal: server.person,
        editId: stale.value.edit_id,
      });
      return now.ok && now.value.state !== "waiting" ? now.value : undefined;
    });
    expect(refused.state).toBe("changed");
    expect(text).toBe("You are Ada, changed by hand.");
  });
});

describe("a harness's own jobs (ADR 0252)", () => {
  const DREAMING = {
    job_id: "dreaming",
    name: "Dreaming",
    about: "Each night it keeps what matters from its agents' day in their memory.",
    kind: "memory" as const,
    every: 1440,
    on: true,
    editable: true,
  };

  it("sends its jobs and their runs, and makes a person's switch", async () => {
    const switched: boolean[] = [];
    server = await startTestServer({ capabilities: ["agents", "jobs"] });
    const chips = await connect({
      url: server.url,
      token: server.token,
      settings: {
        jobs: async (change) => {
          switched.push(change.on);
          return { jobs: [{ ...DREAMING, on: change.on }] };
        },
      },
    });
    clients.push(chips);
    const live = server;
    await chips.settings.jobs({ jobs: [DREAMING] });
    const started = Date.now() - 60_000;
    const runs = Array.from({ length: 205 }, (_, at) => ({
      job_id: "dreaming",
      run_id: `r${at}`,
      started_at: new Date(started - at * 60_000).toISOString(),
      ended_at: new Date(started - at * 60_000 + 6000).toISOString(),
      outcome: "done" as const,
      cost_usd: 0.1,
    }));
    await chips.settings.jobRuns(runs);
    const page = await live.gateway.deps.harnessJobs.runs({
      principal: live.person,
      harnessId: live.harnessId,
      jobId: "dreaming",
      limit: 500,
    });
    expect(page.ok && page.value.runs.length).toBe(205);

    const ask = await live.gateway.deps.harnessJobs.ask({
      principal: live.person,
      harnessId: live.harnessId,
      jobId: "dreaming",
      ask: { on: false },
    });
    expect(ask.ok).toBe(true);
    const read = await until(async () => {
      const now = await live.gateway.deps.harnessJobs.read({
        principal: live.person,
        harnessId: live.harnessId,
      });
      return now.ok && now.value.jobs[0]?.change?.state === "saved" ? now.value : undefined;
    });
    expect(read.jobs[0]?.on).toBe(false);
    expect(switched).toEqual([false]);
  });
});

describe("copies sent", () => {
  /** The SDK's copies over a stand-in `PUT`, which takes a while for the first. */
  function recorded(): {
    settings: Settings;
    puts: { path: string; body: Record<string, unknown> }[];
  } {
    const puts: { path: string; body: Record<string, unknown> }[] = [];
    const put = async (path: string, body: Readonly<Record<string, unknown>>) => {
      if (puts.length === 0) await new Promise((resolve) => setTimeout(resolve, 20));
      puts.push({ path, body: { ...body } });
      return {};
    };
    return { settings: new Settings(put, () => "hrn_scout", undefined), puts };
  }

  it("sends a copy that is the same as the last Chips took only once", async () => {
    const { settings, puts } = recorded();
    await settings.model("agt_1", MODELS);
    await settings.model("agt_1", { ...MODELS });
    expect(puts).toHaveLength(1);
    await settings.model("agt_1", { ...MODELS, effort: "high" });
    expect(puts.map((each) => each.body["effort"])).toEqual(["medium", "high"]);
  });

  it("sends one agent's copies in the order given, however long the first takes", async () => {
    const { settings, puts } = recorded();
    await Promise.all([
      settings.model("agt_1", MODELS),
      settings.model("agt_1", { ...MODELS, effort: "high" }),
    ]);
    expect(puts.map((each) => each.body["effort"])).toEqual(["medium", "high"]);
  });

  it("refuses a compaction it took, once it fails, beside the copy last sent", async () => {
    const { settings, puts } = recorded();
    const window = {
      used: 1200,
      window: 200_000,
      compacting: "running",
    } as unknown as AgentContextWindowCopy;
    await settings.contextWindow("agt_1", window);
    await settings.contextWindowFailed("agt_1", "chg_1", "OpenClaw found nothing to compact.");
    expect(puts.at(-1)?.body).toMatchObject({
      used: 1200,
      refuses: { change_id: "chg_1", message: "OpenClaw found nothing to compact." },
    });
  });

  it("answers a frame it hears, and the promise says when", async () => {
    const puts: Record<string, unknown>[] = [];
    const settings = new Settings(
      async (_path, body) => puts.push({ ...body }),
      () => "hrn_scout",
      { models: async (change) => ({ ...MODELS, effort: change.effort ?? undefined }) },
    );
    expect(settings.hear({ frame: "ping" })).toBeUndefined();
    await settings.hear({
      frame: "model.change",
      change_id: CHANGE,
      harness_id: HARNESS,
      agent_id: AGENT,
      model: "heron-2",
      effort: "high",
      asked_by: PERSON,
      asked_at: "2026-10-17T00:00:00.000Z",
    });
    expect(puts).toEqual([{ ...MODELS, effort: "high", answers: CHANGE }]);
  });

  it("drops a frame that is not what it says it is, so a name that climbs out of the folder reaches no handler (SEC-14)", async () => {
    const puts: Record<string, unknown>[] = [];
    const edits: string[] = [];
    const settings = new Settings(
      async (_path, body) => puts.push({ ...body }),
      () => HARNESS,
      {
        context: async (edit) => {
          edits.push(edit.name);
          return { files: [] };
        },
      },
    );
    const frame = {
      frame: "context.edit",
      edit_id: EDIT,
      harness_id: HARNESS,
      agent_id: AGENT,
      text: "ssh-ed25519 AAAA…",
      base_hash: null,
      asked_by: PERSON,
      asked_at: "2026-10-17T00:00:00.000Z",
    };
    expect(settings.hear({ ...frame, name: "../../.ssh/authorized_keys" })).toBeUndefined();
    expect(settings.hear({ ...frame, name: "PERSONA.md", asked_at: "yesterday" })).toBeUndefined();
    expect(settings.hear({ frame: "model.change", change_id: CHANGE })).toBeUndefined();
    await settings.hear({ ...frame, name: "PERSONA.md" });
    expect(edits).toEqual(["PERSONA.md"]);
    expect(puts).toEqual([{ files: [], answers: EDIT }]);
  });

  it("sends again after an agent is forgotten", async () => {
    const { settings, puts } = recorded();
    await settings.model("agt_1", MODELS);
    settings.forget("agt_1");
    await settings.model("agt_1", MODELS);
    expect(puts).toHaveLength(2);
  });
});
