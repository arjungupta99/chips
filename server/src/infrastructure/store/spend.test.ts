/**
 * What a room's job has spent (ADR 0117) against a real database: where the job begins (a
 * person's act, or a brief handed into the room), a run that spans the start counting only what
 * it reported after it, a step's report adding to its run, and a run that reported no cost told
 * apart. And what the room allows a job, set and set back.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IncomingEvent } from "../../application/ports/index.js";
import { roomSpendFor } from "../../application/room-spend.js";
import { createTestWorkspace, type TestWorkspace } from "../../testing/workspace.js";

let ws: TestWorkspace;
let clock = 1_759_600_000_000;

beforeEach(async () => {
  ws = await createTestWorkspace();
});

afterEach(async () => {
  await ws.close();
});

type Actor = { kind: "person" | "harness" | "system"; id: string };

async function append(type: string, actor: Actor, extra: Record<string, unknown> = {}) {
  clock += 1000;
  const { event } = await ws.gateway.deps.store.append({
    v: 1,
    type,
    id: ws.ids.next("event"),
    ts: new Date(clock).toISOString(),
    workspace_id: ws.workspaceId,
    space_id: ws.spaceId,
    actor,
    idempotency_key: ws.ids.next("event"),
    ...extra,
  } as IncomingEvent);
  return event;
}

const scout = (): Actor => ({ kind: "harness", id: ws.scout.participantId });
const arjun = (): Actor => ({ kind: "person", id: ws.arjun.participantId });
const say = () => append("message.post", arjun(), { text: "Go on, please." });

async function start(): Promise<string> {
  const runId = ws.ids.next("run");
  await append("run.started", scout(), { run_id: runId, goal: "Research it", plan: [] });
  return runId;
}

/** A run's report: its total so far, or a step's cost added to it; no `usd` for one with none. */
const report = (runId: string, usd: number | undefined, scope: "run" | "step" = "run") =>
  append("usage", scout(), {
    run_id: runId,
    scope,
    model: "a-model-nobody-prices",
    output_tokens: 100,
    ...(usd === undefined ? {} : { cost: { usd, estimated: true } }),
  });

const spendOf = (uptoSeq?: number) =>
  roomSpendFor({
    readModels: ws.gateway.deps.readModels,
    workspaceId: ws.workspaceId,
    spaceId: ws.spaceId,
    ...(uptoSeq === undefined ? {} : { uptoSeq }),
  });

describe("what a room's job has spent (ADR 0117)", () => {
  it("counts from the last person's act, what a spanning run added since, and runs with no cost apart", async () => {
    await say();
    const spanning = await start();
    await report(spanning, 0.1);
    const act = await say();
    expect(await spendOf()).toEqual({
      ceiling_usd: 3,
      spent_usd: 0,
      since_seq: act.seq,
      uncounted_runs: 0,
    });

    await report(spanning, 0.25);
    const second = await start();
    const asOf = await report(second, 0.4);
    const silent = await start();
    await report(silent, undefined);
    await report(second, 0.05, "step");
    expect(await spendOf()).toEqual({
      ceiling_usd: 3,
      spent_usd: 0.6,
      since_seq: act.seq,
      uncounted_runs: 1,
    });
    // As of a message, what was so when it was said.
    expect((await spendOf(asOf.seq)).spent_usd).toBe(0.55);
  });

  it("begins again at a brief handed into the room", async () => {
    await say();
    const before = await start();
    await report(before, 0.3);
    const brief = await append(
      "run.requested",
      { kind: "system", id: "system" },
      {
        run_id: ws.ids.next("run"),
        lane_id: ws.ids.next("lane"),
        goal: "Read the trials",
        on_behalf_of: ws.arjun.participantId,
        requested_by: ws.scout.participantId,
        specialist_id: ws.scout.participantId,
        trail: [{ participant_id: ws.arjun.participantId }],
        autonomy: 1,
      },
    );
    const lane = await start();
    await report(lane, 0.2);
    expect(await spendOf()).toMatchObject({ spent_usd: 0.2, since_seq: brief.seq });
  });

  it("allows the default until a person sets another, and the default again when set back", async () => {
    expect(await setCeiling(ws.arjun.sign, 10)).toEqual({
      status: 200,
      json: { space_id: ws.spaceId, usd: 10, changed: true, carried_on: false },
    });
    expect((await spendOf()).ceiling_usd).toBe(10);
    expect((await setCeiling(ws.arjun.sign, 10)).json).toMatchObject({ changed: false });
    const read = await call(
      "GET",
      `/v1/spaces/${ws.spaceId}/spend`,
      signed(ws.arjun.sign, "GET", `/v1/spaces/${ws.spaceId}/spend`),
    );
    expect(read.json).toMatchObject({ space_id: ws.spaceId, ceiling_usd: 10, spent_usd: 0 });
    await setCeiling(ws.arjun.sign, null);
    expect((await spendOf()).ceiling_usd).toBe(3);
  });

  it("takes amounts up to $1,000, and No cap, which the read says as a null ceiling (ADR 0292)", async () => {
    expect((await setCeiling(ws.arjun.sign, 1000)).json).toMatchObject({
      usd: 1000,
      changed: true,
    });
    expect((await spendOf()).ceiling_usd).toBe(1000);
    expect(await setCeiling(ws.arjun.sign, "none")).toEqual({
      status: 200,
      json: { space_id: ws.spaceId, usd: "none", changed: true, carried_on: false },
    });
    const head = await ws.gateway.deps.store.head(ws.workspaceId);
    const { events } = await ws.gateway.deps.store.since(ws.workspaceId, head - 1);
    expect(events.map((event) => [event.type, event.actor.kind])).toEqual([
      ["space.spend_ceiling_lifted", "person"],
    ]);
    expect(await ws.gateway.deps.readModels.spendCeilingOf(ws.workspaceId, ws.spaceId)).toBe(
      "none",
    );
    expect((await setCeiling(ws.arjun.sign, "none")).json).toMatchObject({ changed: false });
    const path = `/v1/spaces/${ws.spaceId}/spend`;
    const read = await call("GET", path, signed(ws.arjun.sign, "GET", path));
    expect(read.json).toMatchObject({ space_id: ws.spaceId, ceiling_usd: null, spent_usd: 0 });
    // An amount again puts the cap back on.
    await setCeiling(ws.arjun.sign, 25);
    expect((await spendOf()).ceiling_usd).toBe(25);
    expect(await ws.gateway.deps.readModels.spendCeilingOf(ws.workspaceId, ws.spaceId)).toBe(25);
  });

  it("refuses an amount out of range, a guest, a member and a harness", async () => {
    for (const usd of [0, 0.1, 1000.25, 2.6]) {
      expect((await setCeiling(ws.arjun.sign, usd)).status).toBe(422);
    }
    const path0 = `/v1/spaces/${ws.spaceId}/spend-ceiling`;
    const word = await call("POST", path0, signed(ws.arjun.sign, "POST", path0, { usd: "lots" }), {
      usd: "lots",
    });
    expect(word.status).toBe(422);
    const gus = await ws.addPerson("Gus", "guest");
    expect((await setCeiling(gus.sign, 5)).status).toBe(403);
    // Only the workspace's owner sets it (ADR 0196): Dana is a member, in the room.
    const dana = await setCeiling(ws.dana.sign, 5);
    expect(dana.status).toBe(403);
    expect(JSON.stringify(dana.json)).toContain("Only the workspace's owner");
    const path = `/v1/spaces/${ws.spaceId}/spend-ceiling`;
    expect((await call("POST", path, ws.scout.headers, { usd: 5 })).status).toBe(403);
    expect((await spendOf()).ceiling_usd).toBe(3);
  });

  it("lists the jobs before this one that spent, newest first, with the room's total and what began this one (ADR 0282)", async () => {
    await say();
    const first = await start();
    await report(first, 0.5);
    const second = await say();
    // The first run goes on into the second job, which counts what it added there.
    await report(first, 0.8);
    const silent = await start();
    await report(silent, undefined);
    await append(
      "exchange.set",
      { kind: "system", id: "system" },
      {
        state: "paused",
        why: "spend",
        spend: { ceiling_usd: 3, spent_usd: 3.1, since_seq: second.seq, uncounted_runs: 1 },
      },
    );
    const going = await append("exchange.set", arjun(), { state: "going" });
    const third = await start();
    await report(third, 0.2);
    const path = `/v1/spaces/${ws.spaceId}/spend`;
    const read = await call("GET", path, signed(ws.arjun.sign, "GET", path));
    expect(read.json).toMatchObject({
      spent_usd: 0.2,
      since_seq: going.seq,
      started: { at: going.ts, by: ws.arjun.participantId, act: "carry_on" },
      total_usd: 1,
      jobs: [
        {
          since_seq: second.seq,
          started_at: second.ts,
          spent_usd: 0.3,
          uncounted_runs: 1,
          run_ids: [first, silent],
          by: [ws.scout.participantId],
          held: true,
        },
        { spent_usd: 0.5, uncounted_runs: 0, run_ids: [first], held: false },
      ],
    });
    expect(read.json["jobs"]).toHaveLength(2);
  });

  it("reads the jobs before this one a page at a time, newest first, and says how many there are (ADR 0292 addendum)", async () => {
    // 35 jobs that spent, each a person's word and a run that reported a cent more than the last.
    const begun: number[] = [];
    for (let n = 0; n < 35; n += 1) {
      begun.push((await say()).seq);
      await report(await start(), 0.01 * (n + 1));
    }
    await say();
    const read = async (query: string) => {
      const path = `/v1/spaces/${ws.spaceId}/spend/jobs${query}`;
      return call("GET", path, signed(ws.arjun.sign, "GET", path));
    };
    const spendPath = `/v1/spaces/${ws.spaceId}/spend`;
    const spend = await call("GET", spendPath, signed(ws.arjun.sign, "GET", spendPath));
    expect(spend.json).toMatchObject({ jobs_count: 35 });
    expect((spend.json as { jobs: unknown[] }).jobs).toHaveLength(30);

    const first = (await read("?limit=20")).json as {
      jobs: { since_seq: number }[];
      next?: number;
    };
    const newest = [...begun].reverse();
    expect(first.jobs.map((job) => job.since_seq)).toEqual(newest.slice(0, 20));
    expect(first.next).toBe(newest[19]);
    const last = (await read(`?before=${first.next}&limit=20`)).json as {
      space_id: string;
      jobs: { since_seq: number }[];
      next?: number;
    };
    expect(last.space_id).toBe(ws.spaceId);
    expect(last.jobs.map((job) => job.since_seq)).toEqual(newest.slice(20));
    expect(last.next).toBeUndefined();
    // Not said, a page is 30.
    expect(((await read("")).json as { jobs: unknown[] }).jobs).toHaveLength(30);
    for (const query of ["?limit=0", "?limit=101", "?before=x", "?limit=2.5"]) {
      expect((await read(query)).status, query).toBe(422);
    }
    // Somebody not in the room reads none of it.
    const gus = await ws.addPerson("Gus", "member");
    const theirs = `/v1/spaces/${ws.spaceId}/spend/jobs`;
    expect((await call("GET", theirs, signed(gus.sign, "GET", theirs))).status).toBe(404);
  });

  it("lets the agents held at the ceiling carry on in the same request that raises it (ADR 0282)", async () => {
    const path = `/v1/spaces/${ws.spaceId}/spend-ceiling`;
    const raise = (usd: number) =>
      call("POST", path, signed(ws.arjun.sign, "POST", path, { usd, carry_on: true }), {
        usd,
        carry_on: true,
      });
    // Not held: nothing to carry on from, and the room hears only the new amount.
    expect((await raise(4)).json).toMatchObject({ usd: 4, changed: true, carried_on: false });
    await append(
      "exchange.set",
      { kind: "system", id: "system" },
      {
        state: "paused",
        why: "spend",
        spend: { ceiling_usd: 4, spent_usd: 4.2, since_seq: 0, uncounted_runs: 0 },
      },
    );
    expect((await raise(10)).json).toMatchObject({ usd: 10, changed: true, carried_on: true });
    const head = await ws.gateway.deps.store.head(ws.workspaceId);
    const { events } = await ws.gateway.deps.store.since(ws.workspaceId, head - 2);
    expect(events.map((event) => [event.type, event.actor.kind])).toEqual([
      ["space.spend_ceiling_set", "person"],
      ["exchange.set", "person"],
    ]);
    expect((await spendOf()).ceiling_usd).toBe(10);
  });

  it("refuses an admin, even in a room of their own: a job's spend is the owner's alone (ADR 0196)", async () => {
    const asha = await ws.addPerson("Asha", "admin");
    const hers = await ws.roomOf(asha.participantId, "Asha's room");
    const path = `/v1/spaces/${hers}/spend-ceiling`;
    const tried = await call("POST", path, signed(asha.sign, "POST", path, { usd: 5 }), { usd: 5 });
    expect(tried.status).toBe(403);
    expect(JSON.stringify(tried.json)).toContain("Only the workspace's owner");
  });
});

type Sign = (method: string, target: string, body: string | Uint8Array) => Record<string, string>;

const signed = (sign: Sign, method: string, path: string, body?: unknown) =>
  sign(method, path, body === undefined ? "" : JSON.stringify(body));

function setCeiling(sign: Sign, usd: number | null | "none") {
  const path = `/v1/spaces/${ws.spaceId}/spend-ceiling`;
  return call("POST", path, signed(sign, "POST", path, { usd }), { usd });
}

async function call(
  method: string,
  path: string,
  headers: Readonly<Record<string, string>>,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const raw = body === undefined ? undefined : JSON.stringify(body);
  const response = await ws.gateway.app.fetch(
    new Request(`http://chips.local${path}`, {
      method,
      headers: { "content-type": "application/json", ...headers },
      ...(raw === undefined ? {} : { body: raw }),
    }),
  );
  const text = await response.text();
  return { status: response.status, json: text === "" ? {} : JSON.parse(text) };
}
