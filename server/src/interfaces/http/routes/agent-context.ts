/**
 * An agent's context files (ADR 0134).
 *
 * - `PUT /v1/agents/:id/context` and `PUT /v1/harnesses/:id/context`: a harness's copy of one of
 *   its agents' files, or of its own set, whole; it may answer or refuse an edit as it goes.
 * - `GET` of either: the copy, for the harness's owner, with whether the harness is away.
 * - `POST …/context/edits`: the owner changes a file; `202` with the edit, waiting.
 * - `GET /v1/context/edits/:id`: what became of an edit.
 */

import {
  type AgentContextView,
  agentContextPut,
  type ContextFile,
  contextEditAsk,
  type HarnessContextView,
  harnessContextPut,
  type SharedContextFile,
} from "@chipschat/protocol";
import type { Hono } from "hono";
import type { ContextOwnerKind, ContextSet } from "../../../application/ports/context-files.js";
import type { ContextRefusal } from "../../../application/use-cases/context-files.js";
import type { GatewayDeps, GatewayEnv } from "../context.js";
import { HttpError } from "../errors.js";
import { body } from "./body.js";

const STATUS = {
  not_allowed: "forbidden",
  unknown: "not_found",
  invalid: "invalid_event",
  stale: "stale_context",
  away: "invalid_event",
} as const;

function refusal(error: ContextRefusal): HttpError {
  return new HttpError(
    STATUS[error.kind],
    error.message,
    undefined,
    undefined,
    error.kind === "away" ? "harness_away" : undefined,
  );
}

function agentView(set: ContextSet, away: boolean): AgentContextView {
  return {
    agent_id: set.owner.id as AgentContextView["agent_id"],
    harness_id: set.harnessId as AgentContextView["harness_id"],
    files: set.files as ContextFile[],
    not_shown: [...set.notShown],
    ...(set.readNote === null ? {} : { read_note: set.readNote }),
    read_at: set.readAt,
    away,
  };
}

function harnessView(set: ContextSet, away: boolean): HarnessContextView {
  return {
    harness_id: set.harnessId as HarnessContextView["harness_id"],
    shared: set.files as SharedContextFile[],
    not_shown: [...set.notShown],
    ...(set.newAgentsNote === null ? {} : { new_agents_note: set.newAgentsNote }),
    read_at: set.readAt,
    away,
  };
}

const PATHS: readonly [ContextOwnerKind, string][] = [
  ["agent", "/v1/agents/:id/context"],
  ["harness", "/v1/harnesses/:id/context"],
];

export function registerAgentContextRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps): void {
  for (const [kind, path] of PATHS) {
    app.put(path, async (c) => {
      const put =
        kind === "agent"
          ? body(
              agentContextPut,
              c.get("rawBody"),
              "Send the agent's files: eight at most, each 64 KB at most.",
            )
          : body(
              harnessContextPut,
              c.get("rawBody"),
              "Send the shared files: eight at most, each 64 KB at most.",
            );
      const id = c.req.param("id") ?? "";
      const result = await deps.contextFiles.put({ principal: c.get("principal"), kind, id, put });
      if (!result.ok) throw refusal(result.error);
      return c.json({ read_at: result.value.readAt });
    });

    app.get(path, async (c) => {
      const id = c.req.param("id") ?? "";
      const result = await deps.contextFiles.read({ principal: c.get("principal"), kind, id });
      if (!result.ok) throw refusal(result.error);
      const { set, away } = result.value;
      return c.json(kind === "agent" ? agentView(set, away) : harnessView(set, away));
    });

    app.post(`${path}/edits`, async (c) => {
      const ask = body(
        contextEditAsk,
        c.get("rawBody"),
        "Say the file's name, its new text, and the version you changed.",
      );
      const id = c.req.param("id") ?? "";
      const principal = c.get("principal");
      const result = await deps.contextFiles.askEdit({ principal, kind, id, ask });
      if (!result.ok) {
        const raised = refusal(result.error);
        if (result.error.file === undefined) throw raised;
        return c.json(
          {
            error: { code: raised.code, message: raised.message, request_id: c.get("requestId") },
            file: result.error.file,
          },
          409,
        );
      }
      c.get("logger").info(
        { kind, id, edit: result.value.edit_id, by: principal.participantId },
        "context edit asked",
      );
      return c.json(result.value, 202);
    });
  }

  app.get("/v1/context/edits/:id", async (c) => {
    const result = await deps.contextFiles.readEdit({
      principal: c.get("principal"),
      editId: c.req.param("id"),
    });
    if (!result.ok) throw refusal(result.error);
    return c.json(result.value);
  });
}
