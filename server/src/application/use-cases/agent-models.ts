/**
 * An agent's model and effort (ADR 0140): a harness's copy of what each of its agents runs on and
 * what it could, read and changed by the people who run the harness.
 *
 * - **A harness sends its copy** of each of its own agents' model and effort, whole, whenever it
 *   changes; a copy may answer a change (`answers`) or refuse one (`refuses`).
 * - **The harness's owner reads it,** or an owner or admin of the workspace, as for context files
 *   (ADR 0134). A harness that does not declare `models` has none to read.
 * - **A change** is checked against the copy (the agent may be changed, the model is one of its
 *   choices, the effort one of that model's levels, a default is there to follow), kept as the
 *   agent's last, and sent down the harness's sockets that hear `models`. With nothing of it to
 *   hear, it is refused at once: no queue. The harness's answer closes it; one not answered in
 *   `MODEL_CHANGE_WAIT_MS` reads as missed, and a new one may be asked.
 */

import {
  type AgentModelCopy,
  type AgentModelPut,
  HARNESS_CAPABILITIES,
  MODEL_CHANGE_WAIT_MS,
  type ModelChangeAsk,
  type ModelChangeFrame,
  type ModelChangeView,
} from "@chipschat/protocol";
import { ownsHarness } from "../../domain/index.js";
import type { AgentModel, AgentModelRegistry, ModelChange } from "../ports/agent-models.js";
import type { Principal } from "../ports/identity.js";
import type { Clock, ReadModels } from "../ports/index.js";
import type { Sessions } from "../ports/sessions.js";

export interface AgentModelsDeps {
  readonly readModels: Pick<ReadModels, "participant">;
  readonly models: AgentModelRegistry;
  readonly sessions: Pick<Sessions, "modelChange" | "hearingModels">;
  readonly ids: { next: (kind: "change") => string };
  readonly clock: Clock;
}

export interface ModelRefusal {
  readonly kind: "not_allowed" | "unknown" | "invalid" | "away" | "waiting";
  readonly message: string;
}

type Answer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ModelRefusal };

const refused = <T>(kind: ModelRefusal["kind"], message: string): Answer<T> => ({
  ok: false,
  error: { kind, message },
});
const ok = <T>(value: T): Answer<T> => ({ ok: true, value });

type Participant = NonNullable<Awaited<ReturnType<ReadModels["participant"]>>>;

async function live(
  deps: AgentModelsDeps,
  workspaceId: string,
  id: string,
  kind: Participant["kind"],
): Promise<Participant | undefined> {
  const found = await deps.readModels.participant(workspaceId, id);
  return found?.kind === kind && found.removed_at === null ? found : undefined;
}

/** The harness of a live agent, or nothing when either is gone. */
async function harnessOf(
  deps: AgentModelsDeps,
  workspaceId: string,
  agentId: string,
): Promise<Participant | undefined> {
  const agent = await live(deps, workspaceId, agentId, "agent");
  if (agent?.harness_id === undefined) return undefined;
  return await live(deps, workspaceId, agent.harness_id, "harness");
}

const declares = (harness: Participant): boolean =>
  harness.capabilities?.includes(HARNESS_CAPABILITIES.models) === true;

/** An agent's copy a person may read, with its harness: or why not. */
async function readable(
  deps: AgentModelsDeps,
  principal: Principal,
  agentId: string,
): Promise<Answer<{ readonly harness: Participant; readonly kept: AgentModel }>> {
  if (principal.kind !== "person")
    return refused("not_allowed", "A person reads an agent's model.");
  const harness = await harnessOf(deps, principal.workspaceId, agentId);
  if (harness === undefined) return refused("unknown", "No agent of that id here.");
  if (!ownsHarness(principal, harness)) {
    return refused(
      "not_allowed",
      "An agent's model is chosen by its harness's owner, or by an owner or admin of the workspace.",
    );
  }
  const name = harness.display_name;
  if (!declares(harness)) return refused("unknown", `${name} doesn't share its models with Chips.`);
  const kept = await deps.models.get(principal.workspaceId, agentId);
  if (kept === undefined)
    return refused("unknown", `${name} hasn't said what this agent runs on yet.`);
  return ok({ harness, kept });
}

const away = (deps: AgentModelsDeps, workspaceId: string, harnessId: string): boolean =>
  deps.sessions.hearingModels(workspaceId, harnessId) === 0;

/** A change as a person reads it: waiting past its minute is missed. */
export function changeView(change: ModelChange, now: number): ModelChangeView {
  return {
    change_id: change.id as ModelChangeView["change_id"],
    state: missed(change, now) ? "missed" : change.state,
    model: change.model,
    effort: change.effort,
    asked_at: change.askedAt,
    ...(change.answeredAt === null ? {} : { answered_at: change.answeredAt }),
    ...(change.message === null ? {} : { message: change.message }),
  };
}

function missed(change: ModelChange, now: number): boolean {
  return change.state === "waiting" && now - Date.parse(change.askedAt) > MODEL_CHANGE_WAIT_MS;
}

export interface ModelRead {
  readonly kept: AgentModel;
  readonly away: boolean;
  readonly change: ModelChangeView | undefined;
}

export function createReadAgentModel(deps: AgentModelsDeps) {
  return async function readAgentModel(input: {
    readonly principal: Principal;
    readonly agentId: string;
  }): Promise<Answer<ModelRead>> {
    const found = await readable(deps, input.principal, input.agentId);
    if (!found.ok) return found;
    const { kept, harness } = found.value;
    const now = Date.parse(deps.clock.nowIso());
    return ok({
      kept,
      away: away(deps, input.principal.workspaceId, harness.id),
      change: kept.change === null ? undefined : changeView(kept.change, now),
    });
  };
}

/** Why this change may not be asked of this copy, or nothing when it may. */
function changeRefusal(said: AgentModelCopy, ask: ModelChangeAsk): ModelRefusal | undefined {
  const invalid = (message: string): ModelRefusal => ({ kind: "invalid", message });
  if (!said.editable) {
    return invalid(said.why_read_only ?? "This agent's model can't be changed from Chips.");
  }
  if (ask.model === null) {
    if (ask.effort !== null) return invalid("The default is for both: send no effort with it.");
    return said.default === undefined ? invalid("This agent has no default to follow.") : undefined;
  }
  const choice = said.choices.find((each) => each.id === ask.model);
  if (choice === undefined) return invalid("That model isn't one this agent can run on.");
  if (choice.efforts.length === 0) {
    return ask.effort === null ? undefined : invalid(`${choice.label} has no effort levels.`);
  }
  const fits = choice.efforts.some((level) => level.id === ask.effort);
  return fits ? undefined : invalid(`Choose one of ${choice.label}'s effort levels.`);
}

/** A change still waiting inside its minute: the next waits for its answer. */
function stillWaiting(kept: AgentModel, now: number): boolean {
  return kept.change?.state === "waiting" && !missed(kept.change, now);
}

function frameOf(kept: AgentModel, change: ModelChange): ModelChangeFrame {
  return {
    frame: "model.change",
    change_id: change.id as ModelChangeFrame["change_id"],
    harness_id: kept.harnessId as ModelChangeFrame["harness_id"],
    agent_id: kept.agentId as ModelChangeFrame["agent_id"],
    model: change.model,
    effort: change.effort,
    asked_by: change.askedBy as ModelChangeFrame["asked_by"],
    asked_at: change.askedAt,
  };
}

export function createAskModelChange(deps: AgentModelsDeps) {
  return async function askModelChange(input: {
    readonly principal: Principal;
    readonly agentId: string;
    readonly ask: ModelChangeAsk;
  }): Promise<Answer<ModelChangeView>> {
    const { principal, agentId, ask } = input;
    const found = await readable(deps, principal, agentId);
    if (!found.ok) return found;
    const { kept, harness } = found.value;
    const refusal = changeRefusal(kept.said, ask);
    if (refusal !== undefined) return { ok: false, error: refusal };
    const now = deps.clock.nowIso();
    if (stillWaiting(kept, Date.parse(now))) {
      return refused("waiting", `${harness.display_name} hasn't answered the last change yet.`);
    }

    const change: ModelChange = {
      id: deps.ids.next("change"),
      model: ask.model,
      effort: ask.effort,
      askedBy: principal.participantId,
      askedAt: now,
      state: "waiting",
      message: null,
      answeredAt: null,
    };
    await deps.models.ask(principal.workspaceId, agentId, change);
    const sockets = deps.sessions.modelChange(
      principal.workspaceId,
      harness.id,
      frameOf(kept, change),
    );
    if (sockets === 0) {
      const words = `${harness.display_name} is away, so Chips can't change it now.`;
      await deps.models.answer({
        workspaceId: principal.workspaceId,
        agentId,
        changeId: change.id,
        state: "failed",
        message: words,
        at: now,
      });
      return refused("away", words);
    }
    return ok(changeView(change, Date.parse(now)));
  };
}

/** The harness's own live agent, as a path names it: or why it may not send that copy. */
async function sendable(
  deps: AgentModelsDeps,
  principal: Principal,
  agentId: string,
): Promise<Answer<Participant>> {
  if (principal.kind !== "harness")
    return refused("not_allowed", "A harness sends its agents' models.");
  const harness = await harnessOf(deps, principal.workspaceId, agentId);
  if (harness === undefined) return refused("unknown", "No agent of that id here.");
  if (harness.id !== principal.participantId)
    return refused("not_allowed", "That agent isn't yours.");
  return ok(harness);
}

/** The change a copy answers or refuses, if it is the agent's last and the copy may close it. */
async function closing(
  deps: AgentModelsDeps,
  principal: Principal,
  agentId: string,
  put: AgentModelPut,
): Promise<Answer<{ readonly id: string; readonly message: string | null } | undefined>> {
  const changeId = put.answers ?? put.refuses?.change_id;
  if (changeId === undefined) return ok(undefined);
  const kept = await deps.models.get(principal.workspaceId, agentId);
  if (kept?.change?.id !== changeId)
    return refused("invalid", "That change isn't one asked of this agent.");
  return ok({ id: changeId, message: put.refuses?.message ?? null });
}

export function createPutAgentModel(deps: AgentModelsDeps) {
  return async function putAgentModel(input: {
    readonly principal: Principal;
    readonly agentId: string;
    readonly put: AgentModelPut;
  }): Promise<Answer<{ readonly readAt: string }>> {
    const { principal, agentId, put } = input;
    const harness = await sendable(deps, principal, agentId);
    if (!harness.ok) return harness;
    const closes = await closing(deps, principal, agentId, put);
    if (!closes.ok) return closes;

    const now = deps.clock.nowIso();
    const { answers: _answers, refuses: _refuses, ...said } = put;
    await deps.models.put({
      workspaceId: principal.workspaceId,
      agentId,
      harnessId: harness.value.id,
      said,
      readAt: now,
    });
    const answered = closes.value;
    if (answered !== undefined) {
      await deps.models.answer({
        workspaceId: principal.workspaceId,
        agentId,
        changeId: answered.id,
        state: put.answers === undefined ? "failed" : "saved",
        message: answered.message,
        at: now,
      });
    }
    return ok({ readAt: now });
  };
}

export type ReadAgentModel = ReturnType<typeof createReadAgentModel>;
export type AskModelChange = ReturnType<typeof createAskModelChange>;
export type PutAgentModel = ReturnType<typeof createPutAgentModel>;
