/**
 * An agent's heartbeat (ADR 0143): a harness's copy of whether each of its agents beats and how
 * often, read and changed by the people who run the harness, as a model is (ADR 0140).
 *
 * - **A harness sends its copy** of each of its own agents' heartbeat, whole, whenever it changes;
 *   a copy may answer a change (`answers`) or refuse one (`refuses`).
 * - **The harness's owner reads it,** or an owner or admin of the workspace. A harness that does
 *   not declare `heartbeats` has none to read.
 * - **A change** is checked against the copy (the agent may be changed, the interval is one of its
 *   choices, the copy's own when none is named), kept as the agent's last, and sent down the
 *   harness's sockets that hear `heartbeats`. With nothing of it to hear, it is refused at once:
 *   no queue. The harness's answer closes it; one not answered in `HEARTBEAT_CHANGE_WAIT_MS` reads
 *   as missed, and a new one may be asked.
 */

import {
  type AgentHeartbeatCopy,
  type AgentHeartbeatPut,
  HARNESS_CAPABILITIES,
  HEARTBEAT_CHANGE_WAIT_MS,
  type HeartbeatChangeAsk,
  type HeartbeatChangeFrame,
  type HeartbeatChangeView,
} from "@chipschat/protocol";
import { ownsHarness } from "../../domain/index.js";
import type {
  AgentHeartbeat,
  AgentHeartbeatRegistry,
  HeartbeatChange,
} from "../ports/agent-heartbeats.js";
import type { Principal } from "../ports/identity.js";
import type { Clock, ReadModels } from "../ports/index.js";
import type { Sessions } from "../ports/sessions.js";

export interface AgentHeartbeatsDeps {
  readonly readModels: Pick<ReadModels, "participant">;
  readonly heartbeats: AgentHeartbeatRegistry;
  readonly sessions: Pick<Sessions, "heartbeatChange" | "hearingHeartbeats">;
  readonly ids: { next: (kind: "change") => string };
  readonly clock: Clock;
}

export interface HeartbeatRefusal {
  readonly kind: "not_allowed" | "unknown" | "invalid" | "away" | "waiting";
  readonly message: string;
}

type Answer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: HeartbeatRefusal };

const refused = <T>(kind: HeartbeatRefusal["kind"], message: string): Answer<T> => ({
  ok: false,
  error: { kind, message },
});
const ok = <T>(value: T): Answer<T> => ({ ok: true, value });

type Participant = NonNullable<Awaited<ReturnType<ReadModels["participant"]>>>;

async function live(
  deps: AgentHeartbeatsDeps,
  workspaceId: string,
  id: string,
  kind: Participant["kind"],
): Promise<Participant | undefined> {
  const found = await deps.readModels.participant(workspaceId, id);
  return found?.kind === kind && found.removed_at === null ? found : undefined;
}

/** The harness of a live agent, or nothing when either is gone. */
async function harnessOf(
  deps: AgentHeartbeatsDeps,
  workspaceId: string,
  agentId: string,
): Promise<Participant | undefined> {
  const agent = await live(deps, workspaceId, agentId, "agent");
  if (agent?.harness_id === undefined) return undefined;
  return await live(deps, workspaceId, agent.harness_id, "harness");
}

const declares = (harness: Participant): boolean =>
  harness.capabilities?.includes(HARNESS_CAPABILITIES.heartbeats) === true;

/** An agent's copy a person may read, with its harness: or why not. */
async function readable(
  deps: AgentHeartbeatsDeps,
  principal: Principal,
  agentId: string,
): Promise<Answer<{ readonly harness: Participant; readonly kept: AgentHeartbeat }>> {
  if (principal.kind !== "person")
    return refused("not_allowed", "A person reads an agent's heartbeat.");
  const harness = await harnessOf(deps, principal.workspaceId, agentId);
  if (harness === undefined) return refused("unknown", "No agent of that id here.");
  if (!ownsHarness(principal, harness)) {
    return refused(
      "not_allowed",
      "An agent's heartbeat is set by its harness's owner, or by an owner or admin of the workspace.",
    );
  }
  const name = harness.display_name;
  if (!declares(harness)) return refused("unknown", `${name} doesn't share heartbeats with Chips.`);
  const kept = await deps.heartbeats.get(principal.workspaceId, agentId);
  if (kept === undefined)
    return refused("unknown", `${name} hasn't said whether this agent has a heartbeat yet.`);
  return ok({ harness, kept });
}

const away = (deps: AgentHeartbeatsDeps, workspaceId: string, harnessId: string): boolean =>
  deps.sessions.hearingHeartbeats(workspaceId, harnessId) === 0;

/** A change as a person reads it: waiting past its minute is missed. */
export function viewOfHeartbeatChange(change: HeartbeatChange, now: number): HeartbeatChangeView {
  return {
    change_id: change.id as HeartbeatChangeView["change_id"],
    state: missed(change, now) ? "missed" : change.state,
    on: change.on,
    every: change.every,
    asked_at: change.askedAt,
    ...(change.answeredAt === null ? {} : { answered_at: change.answeredAt }),
    ...(change.message === null ? {} : { message: change.message }),
  };
}

function missed(change: HeartbeatChange, now: number): boolean {
  return change.state === "waiting" && now - Date.parse(change.askedAt) > HEARTBEAT_CHANGE_WAIT_MS;
}

export interface HeartbeatRead {
  readonly kept: AgentHeartbeat;
  readonly away: boolean;
  readonly change: HeartbeatChangeView | undefined;
}

export function createReadAgentHeartbeat(deps: AgentHeartbeatsDeps) {
  return async function readAgentHeartbeat(input: {
    readonly principal: Principal;
    readonly agentId: string;
  }): Promise<Answer<HeartbeatRead>> {
    const found = await readable(deps, input.principal, input.agentId);
    if (!found.ok) return found;
    const { kept, harness } = found.value;
    const now = Date.parse(deps.clock.nowIso());
    return ok({
      kept,
      away: away(deps, input.principal.workspaceId, harness.id),
      change: kept.change === null ? undefined : viewOfHeartbeatChange(kept.change, now),
    });
  };
}

/** Why this change may not be asked of this copy, or nothing when it may. */
function changeRefusal(said: AgentHeartbeatCopy, every: number): HeartbeatRefusal | undefined {
  if (!said.editable) {
    const why = said.why_read_only ?? "This agent's heartbeat can't be changed from Chips.";
    return { kind: "invalid", message: why };
  }
  if (said.choices.includes(every)) return undefined;
  return { kind: "invalid", message: "That interval isn't one this agent's heartbeat offers." };
}

/** A change still waiting inside its minute: the next waits for its answer. */
function stillWaiting(kept: AgentHeartbeat, now: number): boolean {
  return kept.change?.state === "waiting" && !missed(kept.change, now);
}

function frameOf(kept: AgentHeartbeat, change: HeartbeatChange): HeartbeatChangeFrame {
  return {
    frame: "heartbeat.change",
    change_id: change.id as HeartbeatChangeFrame["change_id"],
    harness_id: kept.harnessId as HeartbeatChangeFrame["harness_id"],
    agent_id: kept.agentId as HeartbeatChangeFrame["agent_id"],
    on: change.on,
    every: change.every,
    asked_by: change.askedBy as HeartbeatChangeFrame["asked_by"],
    asked_at: change.askedAt,
  };
}

export function createAskHeartbeatChange(deps: AgentHeartbeatsDeps) {
  return async function askHeartbeatChange(input: {
    readonly principal: Principal;
    readonly agentId: string;
    readonly ask: HeartbeatChangeAsk;
  }): Promise<Answer<HeartbeatChangeView>> {
    const { principal, agentId, ask } = input;
    const found = await readable(deps, principal, agentId);
    if (!found.ok) return found;
    const { kept, harness } = found.value;
    const every = ask.every ?? kept.said.every;
    const refusal = changeRefusal(kept.said, every);
    if (refusal !== undefined) return { ok: false, error: refusal };
    const now = deps.clock.nowIso();
    if (stillWaiting(kept, Date.parse(now))) {
      return refused("waiting", `${harness.display_name} hasn't answered the last change yet.`);
    }

    const change: HeartbeatChange = {
      id: deps.ids.next("change"),
      on: ask.on,
      every,
      askedBy: principal.participantId,
      askedAt: now,
      state: "waiting",
      message: null,
      answeredAt: null,
    };
    await deps.heartbeats.ask(principal.workspaceId, agentId, change);
    const sockets = deps.sessions.heartbeatChange(
      principal.workspaceId,
      harness.id,
      frameOf(kept, change),
    );
    if (sockets === 0) {
      const words = `${harness.display_name} is away, so Chips can't change it now.`;
      await deps.heartbeats.answer({
        workspaceId: principal.workspaceId,
        agentId,
        changeId: change.id,
        state: "failed",
        message: words,
        at: now,
      });
      return refused("away", words);
    }
    return ok(viewOfHeartbeatChange(change, Date.parse(now)));
  };
}

/** The harness's own live agent, as a path names it: or why it may not send that copy. */
async function sendable(
  deps: AgentHeartbeatsDeps,
  principal: Principal,
  agentId: string,
): Promise<Answer<Participant>> {
  if (principal.kind !== "harness")
    return refused("not_allowed", "A harness sends its agents' heartbeats.");
  const harness = await harnessOf(deps, principal.workspaceId, agentId);
  if (harness === undefined) return refused("unknown", "No agent of that id here.");
  if (harness.id !== principal.participantId)
    return refused("not_allowed", "That agent isn't yours.");
  return ok(harness);
}

/** The change a copy answers or refuses, if it is the agent's last and the copy may close it. */
async function closing(
  deps: AgentHeartbeatsDeps,
  principal: Principal,
  agentId: string,
  put: AgentHeartbeatPut,
): Promise<Answer<{ readonly id: string; readonly message: string | null } | undefined>> {
  const changeId = put.answers ?? put.refuses?.change_id;
  if (changeId === undefined) return ok(undefined);
  const kept = await deps.heartbeats.get(principal.workspaceId, agentId);
  if (kept?.change?.id !== changeId)
    return refused("invalid", "That change isn't one asked of this agent.");
  return ok({ id: changeId, message: put.refuses?.message ?? null });
}

export function createPutAgentHeartbeat(deps: AgentHeartbeatsDeps) {
  return async function putAgentHeartbeat(input: {
    readonly principal: Principal;
    readonly agentId: string;
    readonly put: AgentHeartbeatPut;
  }): Promise<Answer<{ readonly readAt: string }>> {
    const { principal, agentId, put } = input;
    const harness = await sendable(deps, principal, agentId);
    if (!harness.ok) return harness;
    const closes = await closing(deps, principal, agentId, put);
    if (!closes.ok) return closes;

    const now = deps.clock.nowIso();
    const { answers: _answers, refuses: _refuses, ...said } = put;
    await deps.heartbeats.put({
      workspaceId: principal.workspaceId,
      agentId,
      harnessId: harness.value.id,
      said,
      readAt: now,
    });
    const answered = closes.value;
    if (answered !== undefined) {
      await deps.heartbeats.answer({
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

export type ReadAgentHeartbeat = ReturnType<typeof createReadAgentHeartbeat>;
export type AskHeartbeatChange = ReturnType<typeof createAskHeartbeatChange>;
export type PutAgentHeartbeat = ReturnType<typeof createPutAgentHeartbeat>;
