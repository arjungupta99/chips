/**
 * What the demo's server answers about an agent (ADR 0213, DM5), as an agent's page asks: in the
 * shapes the protocol's schemas give a real server's answers, Errand's agents alone with a model,
 * files and a window, a change Errand does not offer refused in words, an edit over a stale
 * version refused with the file as it is now, and what a room allows a job set and read back.
 */

import {
  agentContextView,
  agentContextWindowView,
  agentModelView,
  compactionView,
  contextEditView,
  harnessContextView,
  jobSpend,
  modelChangeView,
  windowChangeView,
} from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import { ServerRefused } from "../transport.js";
import { demoDevice } from "./device.js";
import { filmOf } from "./script.js";
import { NOT_IN_DEMO, serveDemo } from "./serve.js";
import {
  AGENTS,
  BIRTHDAY,
  ERRAND,
  GARDEN,
  MILO_INSTRUCTIONS,
  RECEIPTS,
  STUDIO,
} from "./workspace.js";

const MILO = AGENTS.milo.id;
const WHOLE = filmOf().chapters.length;

async function demo(from = WHOLE) {
  const { storeOptions } = serveDemo({ from });
  const device = await demoDevice();
  return {
    get: <T>(path: string) => storeOptions.get<T>(device, path),
    post: <T>(path: string, body: unknown) => storeOptions.post<T>(device, path, body),
  };
}

describe("an agent's page, in the demo", () => {
  it("reads Milo's model, files and window as Errand keeps them, in the protocol's shapes", async () => {
    const { get } = await demo();
    const model = agentModelView.parse(await get(`/v1/agents/${MILO}/model`));
    expect(model).toMatchObject({ harness_id: ERRAND, model: "heron-2-mini", effort: "steady" });
    const context = agentContextView.parse(await get(`/v1/agents/${MILO}/context`));
    expect(context.files.map((file) => [file.name, file.role, file.text])).toEqual([
      ["INSTRUCTIONS.md", "instructions", MILO_INSTRUCTIONS],
    ]);
    const window = agentContextWindowView.parse(await get(`/v1/agents/${MILO}/context-window`));
    expect(window).toMatchObject({ used: 172_000, window: 272_000, compacts: true });
    expect(Math.round((window.used / window.window) * 100)).toBe(63);
    const shared = harnessContextView.parse(await get(`/v1/harnesses/${ERRAND}/context`));
    expect(shared.shared).toEqual([]);
  });

  it("has none of them for an agent whose harness keeps none, as a server would not", async () => {
    const { get } = await demo();
    const refused = { code: NOT_IN_DEMO };
    for (const path of [
      `/v1/agents/${AGENTS.theo.id}/model`,
      `/v1/agents/${AGENTS.hugo.id}/context`,
      `/v1/agents/${AGENTS.felix.id}/context-window`,
      `/v1/harnesses/${STUDIO}/context`,
      "/v1/context/edits/edt_01KDEM00000000000000000099",
    ]) {
      await expect(get(path), path).rejects.toMatchObject(refused);
    }
    expect(await get(`/v1/agents/${AGENTS.theo.id}/stays`)).toMatchObject({
      stays: [{ space_id: BIRTHDAY, to: null }],
    });
  });

  it("saves a model Errand offers, and refuses one it does not, in its words", async () => {
    const { get, post } = await demo();
    const change = modelChangeView.parse(
      await post(`/v1/agents/${MILO}/model/changes`, { model: "kestrel-1", effort: "light" }),
    );
    expect(change).toMatchObject({ state: "saved", model: "kestrel-1", effort: "light" });
    const now = agentModelView.parse(await get(`/v1/agents/${MILO}/model`));
    expect(now).toMatchObject({ model: "kestrel-1", effort: "light", change });
    await expect(
      post(`/v1/agents/${MILO}/model/changes`, { model: "kestrel-1", effort: "fierce" }),
    ).rejects.toMatchObject({ message: "Errand doesn't offer that model and effort." });
    await expect(
      post(`/v1/agents/${MILO}/model/changes`, { model: null, effort: null }),
    ).rejects.toBeInstanceOf(ServerRefused);
  });

  it("saves an edit over the version read, and refuses a stale one with the file as it is", async () => {
    const { get, post } = await demo();
    const read = agentContextView.parse(await get(`/v1/agents/${MILO}/context`));
    const [file] = read.files;
    const edit = contextEditView.parse(
      await post(`/v1/agents/${MILO}/context/edits`, {
        name: "INSTRUCTIONS.md",
        text: "# Milo\n",
        base_hash: file?.hash,
      }),
    );
    expect(edit).toMatchObject({ state: "saved", name: "INSTRUCTIONS.md" });
    expect(await get(`/v1/context/edits/${edit.edit_id}`)).toEqual(edit);
    const stale = post(`/v1/agents/${MILO}/context/edits`, {
      name: "INSTRUCTIONS.md",
      text: "# Milo, again\n",
      base_hash: file?.hash,
    });
    await expect(stale).rejects.toMatchObject({
      code: "stale_context",
      body: { file: { text: "# Milo\n" } },
    });
  });

  it("compacts, sets the limit it compacts at, and refuses one it does not offer", async () => {
    const { get, post } = await demo();
    const done = compactionView.parse(
      await post(`/v1/agents/${MILO}/context-window/compactions`, {}),
    );
    expect(done.state).toBe("done");
    const limit = windowChangeView.parse(
      await post(`/v1/agents/${MILO}/context-window/changes`, { at: 60 }),
    );
    expect(limit).toMatchObject({ state: "saved", at: 60 });
    const window = agentContextWindowView.parse(await get(`/v1/agents/${MILO}/context-window`));
    expect(window).toMatchObject({ used: 24_000, limit: { at: 60 }, compaction: done });
    await expect(
      post(`/v1/agents/${MILO}/context-window/changes`, { at: 65 }),
    ).rejects.toBeInstanceOf(ServerRefused);
  });

  it("moves an agent once, and forks only into another room", async () => {
    const { get, post } = await demo();
    const moved = await post(`/v1/agents/${MILO}/move`, { space_id: GARDEN });
    expect(moved).toEqual({ agent_id: MILO, space_id: GARDEN, from: BIRTHDAY, moved: true });
    const again = await post(`/v1/agents/${MILO}/move`, { space_id: GARDEN });
    expect(again).toMatchObject({ moved: false });
    await expect(post(`/v1/agents/${MILO}/fork`, { space_id: GARDEN })).rejects.toMatchObject({
      message: "Milo is in this space already.",
    });
    await expect(
      post(`/v1/agents/${AGENTS.theo.id}/fork`, { space_id: RECEIPTS }),
    ).rejects.toMatchObject({ message: "Its harness doesn't make copies of its agents." });
    await expect(post(`/v1/agents/${MILO}/move`, { space_id: "spc_x" })).rejects.toMatchObject({
      message: "No space of that id here.",
    });
    const { participants } = await get<{ participants: { id: string; room?: string }[] }>(
      "/v1/participants",
    );
    expect(participants.find((row) => row.id === MILO)?.room).toBe(GARDEN);
  });

  it("sets what a room allows a job, and reads it back with what the job has spent", async () => {
    const { get, post } = await demo();
    const path = `/v1/spaces/${BIRTHDAY}/spend-ceiling`;
    expect(await post(path, { usd: 5 })).toEqual({ space_id: BIRTHDAY, usd: 5, changed: true });
    expect(await post(path, { usd: 5 })).toMatchObject({ changed: false });
    const spend = jobSpend.parse(await get(`/v1/spaces/${BIRTHDAY}/spend`));
    expect(spend).toMatchObject({ ceiling_usd: 5, spent_usd: 0.42 });
    await expect(post(path, { usd: 5.1 })).rejects.toBeInstanceOf(ServerRefused);
    expect(await post(path, { usd: null })).toMatchObject({ changed: true });
    expect(await get(`/v1/spaces/${BIRTHDAY}/spend`)).toMatchObject({ ceiling_usd: 3 });
  });

  it("still turns away a write no film makes", async () => {
    const { post } = await demo();
    for (const path of [
      "/v1/invites",
      `/v1/agents/${MILO}/lock`,
      `/v1/harnesses/${ERRAND}/restart`,
    ]) {
      await expect(post(path, {}), path).rejects.toMatchObject({ code: NOT_IN_DEMO });
    }
  });
});
