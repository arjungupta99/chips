/**
 * What a harness runs on its own (ADR 0299): its copy, sent by the harness, read by the people who
 * run it; and a harness's asks turned off, kept on its policy and read by the engine.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Principal } from "../../../application/ports/identity.js";
import {
  createTestWorkspace,
  type TestPerson,
  type TestWorkspace,
} from "../../../testing/workspace.js";

let ws: TestWorkspace;
const BASE = "http://chips.local";

beforeEach(async () => {
  ws = await createTestWorkspace();
});
afterEach(async () => {
  await ws.close();
});

type Body = Record<string, unknown>;

async function call(
  method: string,
  path: string,
  options: {
    person?: TestPerson;
    harness?: Record<string, string>;
    body?: unknown;
    key?: string;
  } = {},
): Promise<{ status: number; body: Body }> {
  const raw = options.body === undefined ? "" : JSON.stringify(options.body);
  const signed = options.harness ?? (options.person ?? ws.arjun).sign(method, path, raw);
  const response = await ws.gateway.app.fetch(
    new Request(`${BASE}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(options.key === undefined ? {} : { "idempotency-key": options.key }),
        ...signed,
      },
      ...(raw === "" ? {} : { body: raw }),
    }),
  );
  return { status: response.status, body: (await response.json()) as Body };
}

const path = () => `/v1/harnesses/${ws.scout.participantId}/own-rules`;
const copy = {
  read_from: ["~/.claude/settings.json"],
  note: "Your own Claude Code reads the same file.",
  mode: "Default",
  runs: [
    { kind: "read", name: "Read", raw: "Read" },
    { kind: "command", name: "git", words: ["git"], raw: "Bash(git:*)" },
  ],
  ask_line: {
    entry: '"Bash({words}:*)"',
    line: '"ask": [{entries}]',
    where: "permissions in ~/.claude/settings.json",
  },
};

describe("what a harness runs on its own", () => {
  it("is nothing before the harness says, then its copy for the people who run it", async () => {
    const before = await call("GET", path());
    expect(before).toEqual({ status: 200, body: { own_rules: null, heard_at: null } });

    const sent = await call("PUT", path(), { harness: ws.scout.headers, body: copy });
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(typeof sent.body["heard_at"]).toBe("string");

    const read = await call("GET", path());
    expect(read.status).toBe(200);
    expect(read.body["own_rules"]).toEqual(copy);
    expect(read.body["heard_at"]).toBe(sent.body["heard_at"]);

    // A newer copy takes its place, whole.
    await call("PUT", path(), { harness: ws.scout.headers, body: { read_from: ["x"], runs: [] } });
    expect((await call("GET", path())).body["own_rules"]).toEqual({ read_from: ["x"], runs: [] });
  });

  it("is the harness's own to send, and not a member's to read", async () => {
    expect((await call("PUT", path(), { body: copy })).status).toBe(403);
    expect((await call("GET", path(), { person: ws.dana })).status).toBe(403);
    expect(
      (await call("PUT", path(), { harness: ws.scout.headers, body: { runs: [] } })).status,
    ).toBe(422);
  });
});

describe("a harness's asks turned off", () => {
  const arjun = (): Principal => ({
    kind: "person",
    participantId: ws.arjun.participantId,
    workspaceId: ws.workspaceId,
    displayName: "Arjun",
    role: "owner",
    via: "device_key",
  });
  async function send(event: Body) {
    const result = await ws.gateway.deps.submitEvent({
      event: { idempotency_key: `k-${ws.ids.next("event")}`, ...event },
      principal: arjun(),
    });
    if (!result.ok) throw new Error(`refused: ${result.error.kind}: ${result.error.message}`);
    return result.value.event;
  }
  const policy = (body: Body) =>
    send({ type: "policy.updated", harness_id: ws.scout.participantId, ...body });

  it("is kept on its policy for every space, and read back, until it is turned back on", async () => {
    await policy({
      policy: { autonomy: 1, rules: [], hold: { until: "2099-01-01T00:00:00.000Z" } },
    });
    const held = await ws.gateway.deps.readModels.harnessPolicy(
      ws.workspaceId,
      ws.scout.participantId,
      ws.spaceId,
    );
    expect(held?.hold).toMatchObject({
      until: "2099-01-01T00:00:00.000Z",
      by: ws.arjun.participantId,
    });

    // A change of the rules alone leaves it as it was.
    await policy({ policy: { autonomy: 1, rules: [] } });
    const still = await ws.gateway.deps.readModels.harnessPolicy(
      ws.workspaceId,
      ws.scout.participantId,
    );
    expect(still?.hold).toMatchObject({ until: "2099-01-01T00:00:00.000Z" });

    await policy({ policy: { autonomy: 1, rules: [], hold: null } });
    const back = await ws.gateway.deps.readModels.harnessPolicy(
      ws.workspaceId,
      ws.scout.participantId,
    );
    expect(back?.hold).toBeUndefined();
  });

  it("keeps the Chips's rules switch, read across its rows, until it is set again (ADR 0300)", async () => {
    const read = () =>
      ws.gateway.deps.readModels.chipsRules(ws.workspaceId, ws.scout.participantId);
    // The test workspace starts it at a level above L1, which counts as set.
    expect(await read()).toMatchObject({ rules: false, hold: false });
    await policy({ policy: { autonomy: 1, rules: [], chips_rules: false } });
    expect(await read()).toEqual({ set: false, rules: false, level: false, hold: false });
    // A change that leaves it out leaves it as it was; a rule in a space counts.
    await policy({
      space_id: ws.spaceId,
      policy: { autonomy: 1, rules: [{ match: "web.fetch", decision: "ask" }] },
    });
    expect(await read()).toEqual({ set: false, rules: true, level: false, hold: false });
    await policy({ policy: { autonomy: 1, rules: [], chips_rules: true } });
    expect((await read()).set).toBe(true);
    // A level above L1 counts as something set (ADR 0300): the dial lets Chips say yes.
    await policy({ policy: { autonomy: 2, rules: [] } });
    expect((await read()).level).toBe(true);
  });

  it("keeps the rules and hold for every harness", async () => {
    await send({
      type: "policy.workspace_updated",
      rules: [{ match: "acp.bash", when: { starts_with: ["rm"] }, decision: "deny" }],
      hold: { matters: true },
    });
    const workspace = await ws.gateway.deps.readModels.workspacePolicy(ws.workspaceId);
    expect(workspace?.rules[0]).toMatchObject({
      decision: "deny",
      made_by: ws.arjun.participantId,
    });
    expect(workspace?.hold).toMatchObject({ matters: true, by: ws.arjun.participantId });
  });
});
