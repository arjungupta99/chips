/**
 * A harness's own jobs (ADR 0252).
 *
 * - `PUT /v1/harnesses/:id/jobs`: the harness's copy of the jobs it runs on its own, whole; it may
 *   answer or refuse a change as it goes.
 * - `POST /v1/harnesses/:id/jobs/runs`: runs it finished, up to two hundred.
 * - `GET /v1/harnesses/:id/jobs`: the copy, for the harness's owner or an admin, with what each
 *   job's runs cost this week, how many Chips holds, its last run and its last change.
 * - `GET /v1/harnesses/:id/jobs/:job/runs?since=&before=&limit=`: a job's runs, newest first.
 * - `POST /v1/harnesses/:id/jobs/:job/changes`: the owner or an admin switches a job; `202` with
 *   the change, waiting. Refused as `harness_away` when nothing of the harness hears it, and as
 *   `change_waiting` while the last one waits inside its minute.
 */

import {
  type HarnessJobsView,
  harnessJobsPut,
  type JobRunsView,
  jobChangeAsk,
  jobRunsPost,
} from "@chipschat/protocol";
import type { Hono } from "hono";
import type { JobRefusal } from "../../../application/use-cases/harness-jobs.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";
import { body } from "./body.js";

const STATUS = {
  not_allowed: "forbidden",
  unknown: "not_found",
  invalid: "invalid_event",
  away: "invalid_event",
  waiting: "invalid_event",
} as const;

const RULE = { away: "harness_away", waiting: "change_waiting" } as const;

function refusal(error: JobRefusal): HttpError {
  const rule = error.kind === "away" || error.kind === "waiting" ? RULE[error.kind] : undefined;
  return new HttpError(STATUS[error.kind], error.message, undefined, undefined, rule);
}

export function registerHarnessJobRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  app.put("/v1/harnesses/:id/jobs", async (c) => {
    const put = body(
      harnessJobsPut,
      c.get("rawBody"),
      "Send every job you run on your own: its id, name, what it does, its kind, how often, and whether it is on.",
    );
    const result = await deps.harnessJobs.put({
      principal: c.get("principal"),
      harnessId: c.req.param("id"),
      put,
    });
    if (!result.ok) throw refusal(result.error);
    return c.json({ read_at: result.value.readAt });
  });

  app.post("/v1/harnesses/:id/jobs/runs", async (c) => {
    const post = body(
      jobRunsPost,
      c.get("rawBody"),
      "Send one to two hundred runs, each with its job, its id, when it started and ended, and how it ended.",
    );
    const result = await deps.harnessJobs.postRuns({
      principal: c.get("principal"),
      harnessId: c.req.param("id"),
      post,
    });
    if (!result.ok) throw refusal(result.error);
    return c.json({ kept: result.value.kept });
  });

  app.get("/v1/harnesses/:id/jobs", async (c) => {
    const result = await deps.harnessJobs.read({
      principal: c.get("principal"),
      harnessId: c.req.param("id"),
    });
    if (!result.ok) throw refusal(result.error);
    const { harnessId, readAt, away, jobs } = result.value;
    const view: HarnessJobsView = {
      harness_id: harnessId as HarnessJobsView["harness_id"],
      jobs: [...jobs],
      read_at: readAt,
      away,
    };
    return c.json(view);
  });

  app.get("/v1/harnesses/:id/jobs/:job/runs", async (c) => {
    const limit = c.req.query("limit");
    const result = await deps.harnessJobs.runs({
      principal: c.get("principal"),
      harnessId: c.req.param("id"),
      jobId: c.req.param("job"),
      since: c.req.query("since"),
      before: c.req.query("before"),
      limit: limit === undefined ? undefined : Number(limit) || undefined,
    });
    if (!result.ok) throw refusal(result.error);
    const view: JobRunsView = {
      harness_id: result.value.harnessId as JobRunsView["harness_id"],
      job_id: result.value.jobId,
      runs: [...result.value.runs],
      more: result.value.more,
    };
    return c.json(view);
  });

  app.post("/v1/harnesses/:id/jobs/:job/changes", async (c) => {
    const ask = body(
      jobChangeAsk,
      c.get("rawBody"),
      "Say on or off, and how often in minutes for a job that offers a choice.",
    );
    const principal = c.get("principal");
    const harnessId = c.req.param("id");
    const jobId = c.req.param("job");
    const result = await deps.harnessJobs.ask({ principal, harnessId, jobId, ask });
    if (!result.ok) throw refusal(result.error);
    c.get("logger").info(
      { harnessId, jobId, change: result.value.change_id, by: principal.participantId },
      "job change asked",
    );
    return c.json(result.value, 202);
  });
}
