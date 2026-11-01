/**
 * A harness's own jobs (ADR 0252): its copy and its runs, read by the people who run it, with what
 * each job cost this week; and a switch down the harness's socket that hears `jobs`, answered or
 * refused by its next copy. OpenClaw's three are the shape: its Main agent's Heartbeat, Dreaming,
 * and a Skill review for each agent.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { viewOfJobChange } from "../../../application/use-cases/harness-jobs.js";
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

async function declare(capabilities = ["agents", "jobs"]): Promise<void> {
  const declared = await call("PATCH", `/v1/harnesses/${scout()}`, { body: { capabilities } });
  expect(declared.status).toBe(200);
}

const NOW = Date.now();
const ago = (days: number, hours = 0) =>
  new Date(NOW - days * 86_400_000 - hours * 3_600_000).toISOString();

const heartbeat = (extra: Body = {}): Body => ({
  job_id: "heartbeat:main",
  name: "Heartbeat",
  about: "Every hour Main looks over its work and writes in Home only when something needs you.",
  kind: "heartbeat",
  every: 60,
  on: true,
  editable: true,
  choices: [15, 30, 60, 120, 240, 720, 1440],
  ...extra,
});
const dreaming = (extra: Body = {}): Body => ({
  job_id: "dreaming",
  name: "Dreaming",
  about: "Each night OpenClaw keeps what matters from its agents' day in their memory.",
  kind: "memory",
  every: 1440,
  on: true,
  editable: true,
  ...extra,
});

const sendCopy = (jobs: Body[] = [heartbeat(), dreaming()], extra: Body = {}) =>
  call("PUT", `/v1/harnesses/${scout()}/jobs`, { harness: asScout(), body: { jobs, ...extra } });

const run = (id: string, startedAt: string, extra: Body = {}): Body => ({
  job_id: "heartbeat:main",
  run_id: id,
  started_at: startedAt,
  ended_at: new Date(Date.parse(startedAt) + 6000).toISOString(),
  outcome: "done",
  quiet: true,
  cost_usd: 0.34,
  ...extra,
});

const postRuns = (runs: Body[], harness = asScout()) =>
  call("POST", `/v1/harnesses/${scout()}/jobs/runs`, { harness, body: { runs } });

const read = (person?: TestPerson) =>
  call("GET", `/v1/harnesses/${scout()}/jobs`, person ? { person } : {});

const readRuns = (job: string, query = "", person?: TestPerson) =>
  call("GET", `/v1/harnesses/${scout()}/jobs/${job}/runs${query}`, person ? { person } : {});

const change = (job: string, body: Body, person?: TestPerson) =>
  call("POST", `/v1/harnesses/${scout()}/jobs/${job}/changes`, {
    body,
    ...(person ? { person } : {}),
  });

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

/** A declared harness with its copy sent, and a socket that hears changes. */
async function ready() {
  await declare();
  expect((await sendCopy()).status).toBe(200);
  return await scoutSocket(["jobs"]);
}

describe("a harness's own jobs, as it sends them (ADR 0252)", () => {
  it("are read by the harness's owner, in the copy's order, once the harness declares jobs", async () => {
    expect((await sendCopy()).status).toBe(200);
    const undeclared = await read();
    expect(undeclared.status).toBe(404);
    expect(JSON.stringify(undeclared.body)).toContain("doesn't share its jobs");

    await declare();
    const seen = await read();
    expect(seen.status).toBe(200);
    expect(seen.body).toEqual({
      harness_id: scout(),
      read_at: expect.any(String),
      away: true,
      jobs: [
        { ...heartbeat(), week_runs: 0, runs_total: 0 },
        { ...dreaming(), week_runs: 0, runs_total: 0 },
      ],
    });
  });

  it("are a 404 until the harness has sent them", async () => {
    await declare();
    const unsent = await read();
    expect(unsent.status).toBe(404);
    expect(JSON.stringify(unsent.body)).toContain("hasn't said what jobs it runs");
  });

  it("are read and switched by an admin, and by nobody else but the owner", async () => {
    const hears = await ready();
    const priya = await ws.addPerson("Priya", "admin");
    expect((await read(priya)).status).toBe(200);
    const member = await ws.addPerson("Mo", "member");
    expect((await read(member)).status).toBe(403);
    expect((await readRuns("dreaming", "", member)).status).toBe(403);
    expect((await change("dreaming", { on: false }, member)).status).toBe(403);
    expect((await change("dreaming", { on: false }, priya)).status).toBe(202);
    hears.socket.close();
  });

  it("are sent by the harness itself only", async () => {
    await declare();
    const byPerson = await call("PUT", `/v1/harnesses/${scout()}/jobs`, {
      body: { jobs: [dreaming()] },
    });
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
    const another = await call("PUT", `/v1/harnesses/${scout()}/jobs`, {
      harness: kiln,
      body: { jobs: [dreaming()] },
    });
    expect(another.status).toBe(403);
    expect(JSON.stringify(another.body)).toContain("aren't yours");
    expect((await postRuns([run("r1", ago(0, 1))], kiln)).status).toBe(403);
  });

  it("refuses a copy that is not one", async () => {
    await declare();
    expect((await sendCopy([heartbeat({ every: 45 })])).status).toBe(422);
    expect((await sendCopy([dreaming(), dreaming()])).status).toBe(422);
    expect((await sendCopy([dreaming({ why_read_only: "OpenClaw keeps it." })])).status).toBe(422);
  });

  it("forget a job the copy leaves out, and its runs", async () => {
    await declare();
    await sendCopy();
    await postRuns([run("r1", ago(0, 1)), run("d1", ago(0, 2), { job_id: "dreaming" })]);
    await sendCopy([dreaming()]);
    const seen = await read();
    expect((seen.body["jobs"] as Body[]).map((job) => job["job_id"])).toEqual(["dreaming"]);
    const runs = await ws.db.selectFrom("harness_job_runs").select("run_id").execute();
    expect(runs).toEqual([{ run_id: "d1" }]);
  });

  it("are forgotten with the harness, runs and all", async () => {
    await declare();
    await sendCopy();
    await postRuns([run("r1", ago(0, 1))]);
    expect((await call("DELETE", `/v1/harnesses/${scout()}`)).status).toBe(200);
    expect(await ws.db.selectFrom("harness_jobs").selectAll().execute()).toEqual([]);
    expect(await ws.db.selectFrom("harness_job_runs").selectAll().execute()).toEqual([]);
  });
});

describe("a job's runs (ADR 0252)", () => {
  it("count what the last week cost, how many Chips holds, and the last", async () => {
    await declare();
    await sendCopy();
    const posted = await postRuns([
      run("r1", ago(0, 1)),
      run("r2", ago(0, 2)),
      run("r3", ago(2), { cost_usd: 0.5 }),
      run("old", ago(9), { cost_usd: 9 }),
      run("d1", ago(0, 5), { job_id: "dreaming", cost_usd: undefined, quiet: false }),
    ]);
    expect(posted).toEqual({ status: 200, body: { kept: 5 } });
    const jobs = (await read()).body["jobs"] as Body[];
    expect(jobs[0]).toMatchObject({
      job_id: "heartbeat:main",
      week_usd: 1.18,
      week_runs: 3,
      runs_total: 4,
      last_run: { run_id: "r1" },
    });
    // Dreaming's runs carry no cost: the week has none to say.
    expect(jobs[1]).toMatchObject({ job_id: "dreaming", week_runs: 1, runs_total: 1 });
    expect(jobs[1]?.["week_usd"]).toBeUndefined();
  });

  it("replace a run posted again, as when its cost comes later", async () => {
    await declare();
    await sendCopy();
    await postRuns([run("r1", ago(0, 1), { cost_usd: undefined })]);
    await postRuns([run("r1", ago(0, 1), { cost_usd: 0.34 })]);
    const runs = await readRuns("heartbeat:main");
    expect(runs.body["runs"]).toEqual([run("r1", ago(0, 1))]);
    expect(((await read()).body["jobs"] as Body[])[0]).toMatchObject({
      week_usd: 0.34,
      runs_total: 1,
    });
  });

  it("keep what a run said before when it is posted again with less", async () => {
    await declare();
    await sendCopy();
    await postRuns([run("r1", ago(0, 1), { cost_usd: 0.34, quiet: true })]);
    await postRuns([run("r1", ago(0, 1), { cost_usd: undefined, quiet: undefined })]);
    expect((await readRuns("heartbeat:main")).body["runs"]).toEqual([
      run("r1", ago(0, 1), { cost_usd: 0.34, quiet: true }),
    ]);
    expect(((await read()).body["jobs"] as Body[])[0]).toMatchObject({ week_usd: 0.34 });
  });

  it("are read newest first, a page at a time, since and before a time", async () => {
    await declare();
    await sendCopy();
    await postRuns(Array.from({ length: 5 }, (_, at) => run(`r${at}`, ago(0, at + 1))));
    const first = await readRuns("heartbeat:main", "?limit=2");
    expect(first.status).toBe(200);
    expect((first.body["runs"] as Body[]).map((each) => each["run_id"])).toEqual(["r0", "r1"]);
    expect(first.body["more"]).toBe(true);
    const before = encodeURIComponent(String((first.body["runs"] as Body[])[1]?.["started_at"]));
    const next = await readRuns("heartbeat:main", `?limit=2&before=${before}`);
    expect((next.body["runs"] as Body[]).map((each) => each["run_id"])).toEqual(["r2", "r3"]);
    const since = encodeURIComponent(ago(0, 2.5));
    const recent = await readRuns("heartbeat:main", `?since=${since}`);
    expect((recent.body["runs"] as Body[]).map((each) => each["run_id"])).toEqual(["r0", "r1"]);
    expect(recent.body["more"]).toBe(false);
    expect((await readRuns("heartbeat:main", "?since=soon")).status).toBe(422);
  });

  it("are refused for a job not in the copy", async () => {
    await declare();
    await sendCopy();
    const stray = await postRuns([run("x", ago(0, 1), { job_id: "skill-review" })]);
    expect(stray.status).toBe(422);
    expect(JSON.stringify(stray.body)).toContain("send the copy before its runs");
    expect((await readRuns("skill-review")).status).toBe(404);
  });

  it("older than ninety days are let go as new ones come", async () => {
    await declare();
    await sendCopy();
    await postRuns([run("ancient", ago(91)), run("r1", ago(0, 1))]);
    const runs = await ws.db.selectFrom("harness_job_runs").select("run_id").execute();
    expect(runs).toEqual([{ run_id: "r1" }]);
  });
});

describe("a switch, down the harness's socket (ADR 0252)", () => {
  it("goes to the socket that hears jobs, waits, and is saved by the copy that answers it", async () => {
    const hears = await ready();
    const deaf = await scoutSocket(["heartbeats"]);

    const asked = await change("dreaming", { on: false });
    expect(asked.status).toBe(202);
    expect(asked.body).toMatchObject({ on: false, state: "waiting" });
    expect(asked.body["every"]).toBeUndefined();
    const changeId = String(asked.body["change_id"]);
    await until(() => hears.frames.some((f) => f["frame"] === "job.change"));
    expect(hears.frames.find((f) => f["frame"] === "job.change")).toEqual({
      frame: "job.change",
      change_id: changeId,
      harness_id: scout(),
      job_id: "dreaming",
      on: false,
      asked_by: ws.arjun.participantId,
      asked_at: expect.any(String),
    });
    expect(deaf.frames.some((f) => f["frame"] === "job.change")).toBe(false);
    expect((await read()).body).toMatchObject({
      away: false,
      jobs: [{}, { job_id: "dreaming", change: { state: "waiting" } }],
    });

    const answered = await sendCopy([heartbeat(), dreaming({ on: false })], { answers: changeId });
    expect(answered.status).toBe(200);
    const saved = (await read()).body["jobs"] as Body[];
    expect(saved[1]).toMatchObject({
      on: false,
      change: { change_id: changeId, state: "saved", answered_at: expect.any(String) },
    });
    hears.socket.close();
    deaf.socket.close();
  });

  it("names the interval a job with choices has when the person names none", async () => {
    const hears = await ready();
    const asked = await change("heartbeat:main", { on: false });
    const changeId = String(asked.body["change_id"]);
    await until(() => hears.frames.some((f) => f["change_id"] === changeId));
    expect(hears.frames.find((f) => f["change_id"] === changeId)).toMatchObject({
      on: false,
      every: 60,
    });
    hears.socket.close();
  });

  it("is failed, with the harness's words, by the copy that refuses it", async () => {
    const hears = await ready();
    const asked = await change("dreaming", { on: false });
    const changeId = String(asked.body["change_id"]);
    await sendCopy(undefined, {
      refuses: { change_id: changeId, message: "Not while it dreams." },
    });
    expect(((await read()).body["jobs"] as Body[])[1]).toMatchObject({
      on: true,
      change: { state: "failed", message: "Not while it dreams." },
    });
    hears.socket.close();
  });

  it("refuses an interval not among the choices, and any for a job with none", async () => {
    const hears = await ready();
    expect((await change("heartbeat:main", { on: true, every: 45 })).status).toBe(422);
    expect((await change("dreaming", { on: true, every: 60 })).status).toBe(422);
    hears.socket.close();
  });

  it("refuses a job its harness won't let Chips switch, in the harness's words", async () => {
    await declare();
    await sendCopy([
      dreaming({ editable: false, why_read_only: "Set in OpenClaw's own settings." }),
    ]);
    const asked = await change("dreaming", { on: false });
    expect(asked.status).toBe(422);
    expect(JSON.stringify(asked.body)).toContain("Set in OpenClaw's own settings.");
  });

  it("is refused at once when nothing of the harness hears it: no queue", async () => {
    await declare();
    await sendCopy();
    const asked = await change("dreaming", { on: false });
    expect(asked.status).toBe(422);
    expect(JSON.stringify(asked.body)).toContain("harness_away");
    expect(((await read()).body["jobs"] as Body[])[1]).toMatchObject({
      change: { state: "failed" },
    });
  });

  it("is refused while the last one waits inside its minute, and for a job not there", async () => {
    const hears = await ready();
    expect((await change("dreaming", { on: false })).status).toBe(202);
    const again = await change("dreaming", { on: true });
    expect(again.status).toBe(422);
    expect(JSON.stringify(again.body)).toContain("change_waiting");
    // Another job's switch doesn't wait on it.
    expect((await change("heartbeat:main", { on: false })).status).toBe(202);
    expect((await change("skill-review", { on: false })).status).toBe(404);
    hears.socket.close();
  });

  it("refuses an answer to a change not asked of these jobs", async () => {
    await declare();
    await sendCopy();
    const stray = await sendCopy(undefined, { answers: "chg_01K4ZQPX00000000000000000Z" });
    expect(stray.status).toBe(422);
  });
});

describe("a switch not answered", () => {
  const waiting = {
    id: "chg_01K4ZQPX00000000000000000Z",
    on: false,
    every: null,
    askedBy: "usr_1",
    askedAt: "2026-10-31T17:00:00.000Z",
    state: "waiting" as const,
    message: null,
    answeredAt: null,
  };

  it("reads as missed once its minute has passed", () => {
    const at = (iso: string) => viewOfJobChange(waiting, Date.parse(iso)).state;
    expect(at("2026-10-31T17:00:59.000Z")).toBe("waiting");
    expect(at("2026-10-31T17:01:01.000Z")).toBe("missed");
  });

  it("still counts when the harness answers after its minute, and lets a new one be asked", async () => {
    const hears = await ready();
    const asked = await change("dreaming", { on: false });
    const changeId = String(asked.body["change_id"]);
    const row = await ws.db
      .selectFrom("harness_jobs")
      .select("change")
      .where("job_id", "=", "dreaming")
      .executeTakeFirstOrThrow();
    const late = { ...JSON.parse(row.change ?? "{}"), askedAt: "2026-01-01T00:00:00.000Z" };
    await ws.db
      .updateTable("harness_jobs")
      .set({ change: JSON.stringify(late) })
      .where("job_id", "=", "dreaming")
      .execute();
    expect(((await read()).body["jobs"] as Body[])[1]).toMatchObject({
      change: { state: "missed" },
    });
    const next = await change("dreaming", { on: true });
    expect(next.status).toBe(202);
    await sendCopy(undefined, { answers: String(next.body["change_id"]) });
    expect(((await read()).body["jobs"] as Body[])[1]).toMatchObject({
      change: { state: "saved" },
    });
    expect(next.body["change_id"]).not.toBe(changeId);
    hears.socket.close();
  });
});
