/**
 * An agent's context window (ADR 0146): a harness's copy of how full each of its agents' context
 * is and the limit it compacts itself at, read by the people who run the harness, who may ask it to
 * compact now or change its limit, as a model is changed (ADR 0140).
 *
 * - **A harness sends its copy** of each of its own agents' context window, whole, whenever it
 *   changes; a copy may answer an ask (`answers`) or refuse one (`refuses`).
 * - **The harness's owner reads it,** or an owner or admin of the workspace. A harness that does
 *   not declare `context_windows` has none to read.
 * - **A new limit** is checked against the copy (the limit may be changed, and is one of its
 *   choices, or only when asked where that may be picked), kept as the agent's last, and sent down
 *   the harness's sockets that hear `context_windows`. Its answer closes it.
 * - **A Compact now** is checked against the copy (it takes one, and isn't compacting already),
 *   kept, and sent the same way. Its answer takes it on; it is done when a copy stops compacting.
 * - **Either ask** finding nothing of the harness to hear it is refused at once: no queue. One not
 *   answered in `WINDOW_ASK_WAIT_MS` reads as missed, and a new one may be asked.
 * - **A copy that says the agent compacted** since the last writes one quiet line in the room the
 *   agent is in, `context.compacted`, once per compaction.
 */

import {
  type AgentContextWindowCopy,
  type AgentContextWindowPut,
  type CompactionView,
  HARNESS_CAPABILITIES,
  WINDOW_ASK_WAIT_MS,
  type WindowChangeFrame,
  type WindowChangeView,
  type WindowCompactFrame,
  type WindowLimitAsk,
} from "@chipschat/protocol";
import { ownsHarness } from "../../domain/index.js";
import type {
  AgentContextWindow,
  AgentContextWindowRegistry,
  Compaction,
  WindowChange,
} from "../ports/agent-context-windows.js";
import type { EventStore } from "../ports/event-store.js";
import type { Principal } from "../ports/identity.js";
import type { Clock, ReadModels } from "../ports/index.js";
import type { Sessions } from "../ports/sessions.js";

export interface AgentContextWindowsDeps {
  readonly readModels: Pick<ReadModels, "participant" | "agentRoom">;
  readonly windows: AgentContextWindowRegistry;
  readonly sessions: Pick<Sessions, "windowCompact" | "windowChange" | "hearingWindows">;
  readonly store: Pick<EventStore, "append">;
  readonly ids: { next: (kind: "change" | "event") => string };
  readonly clock: Clock;
}

export interface WindowRefusal {
  readonly kind: "not_allowed" | "unknown" | "invalid" | "away" | "waiting";
  readonly message: string;
}

type Answer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: WindowRefusal };

const refused = <T>(kind: WindowRefusal["kind"], message: string): Answer<T> => ({
  ok: false,
  error: { kind, message },
});
const ok = <T>(value: T): Answer<T> => ({ ok: true, value });

type Participant = NonNullable<Awaited<ReturnType<ReadModels["participant"]>>>;

async function live(
  deps: AgentContextWindowsDeps,
  workspaceId: string,
  id: string,
  kind: Participant["kind"],
): Promise<Participant | undefined> {
  const found = await deps.readModels.participant(workspaceId, id);
  return found?.kind === kind && found.removed_at === null ? found : undefined;
}

/** The harness of a live agent, or nothing when either is gone. */
async function harnessOf(
  deps: AgentContextWindowsDeps,
  workspaceId: string,
  agentId: string,
): Promise<Participant | undefined> {
  const agent = await live(deps, workspaceId, agentId, "agent");
  if (agent?.harness_id === undefined) return undefined;
  return await live(deps, workspaceId, agent.harness_id, "harness");
}

const declares = (harness: Participant): boolean =>
  harness.capabilities?.includes(HARNESS_CAPABILITIES.contextWindows) === true;

/** An agent's copy a person may read, with its harness: or why not. */
async function readable(
  deps: AgentContextWindowsDeps,
  principal: Principal,
  agentId: string,
): Promise<Answer<{ readonly harness: Participant; readonly kept: AgentContextWindow }>> {
  if (principal.kind !== "person")
    return refused("not_allowed", "A person reads an agent's context window.");
  const harness = await harnessOf(deps, principal.workspaceId, agentId);
  if (harness === undefined) return refused("unknown", "No agent of that id here.");
  if (!ownsHarness(principal, harness)) {
    return refused(
      "not_allowed",
      "An agent's context window is seen by its harness's owner, or by an owner or admin of the workspace.",
    );
  }
  const name = harness.display_name;
  if (!declares(harness))
    return refused("unknown", `${name} doesn't share context windows with Chips.`);
  const kept = await deps.windows.get(principal.workspaceId, agentId);
  if (kept === undefined)
    return refused("unknown", `${name} hasn't said how full this agent's context is yet.`);
  return ok({ harness, kept });
}

const away = (deps: AgentContextWindowsDeps, workspaceId: string, harnessId: string): boolean =>
  deps.sessions.hearingWindows(workspaceId, harnessId) === 0;

const overdue = (askedAt: string, now: number): boolean =>
  now - Date.parse(askedAt) > WINDOW_ASK_WAIT_MS;

/** A limit change as a person reads it: waiting past its minute is missed. */
export function viewOfWindowChange(change: WindowChange, now: number): WindowChangeView {
  const missed = change.state === "waiting" && overdue(change.askedAt, now);
  return {
    change_id: change.id as WindowChangeView["change_id"],
    state: missed ? "missed" : change.state,
    at: change.at,
    asked_at: change.askedAt,
    ...(change.answeredAt === null ? {} : { answered_at: change.answeredAt }),
    ...(change.message === null ? {} : { message: change.message }),
  };
}

/** A Compact now as a person reads it: waiting past its minute is missed. */
export function viewOfCompaction(compaction: Compaction, now: number): CompactionView {
  const missed = compaction.state === "waiting" && overdue(compaction.askedAt, now);
  return {
    change_id: compaction.id as CompactionView["change_id"],
    state: missed ? "missed" : compaction.state,
    asked_at: compaction.askedAt,
    ...(compaction.answeredAt === null ? {} : { answered_at: compaction.answeredAt }),
    ...(compaction.doneAt === null ? {} : { done_at: compaction.doneAt }),
    ...(compaction.message === null ? {} : { message: compaction.message }),
  };
}

export interface WindowRead {
  readonly kept: AgentContextWindow;
  readonly away: boolean;
  readonly change: WindowChangeView | undefined;
  readonly compaction: CompactionView | undefined;
}

export function createReadAgentContextWindow(deps: AgentContextWindowsDeps) {
  return async function readAgentContextWindow(input: {
    readonly principal: Principal;
    readonly agentId: string;
  }): Promise<Answer<WindowRead>> {
    const found = await readable(deps, input.principal, input.agentId);
    if (!found.ok) return found;
    const { kept, harness } = found.value;
    const now = Date.parse(deps.clock.nowIso());
    return ok({
      kept,
      away: away(deps, input.principal.workspaceId, harness.id),
      change: kept.change === null ? undefined : viewOfWindowChange(kept.change, now),
      compaction: kept.compaction === null ? undefined : viewOfCompaction(kept.compaction, now),
    });
  };
}

/** Why this limit may not be asked of this copy, or nothing when it may. */
function limitRefusal(said: AgentContextWindowCopy, at: number | null): WindowRefusal | undefined {
  if (!said.editable) {
    const why = said.why_read_only ?? "This agent's limit can't be changed from Chips.";
    return { kind: "invalid", message: why };
  }
  const limit = said.limit;
  if (limit === undefined)
    return { kind: "invalid", message: "This agent's harness keeps its own limit." };
  if (at === null) {
    return limit.may_turn_off
      ? undefined
      : { kind: "invalid", message: "This agent has to compact itself at one of its limits." };
  }
  if (limit.choices.includes(at)) return undefined;
  return { kind: "invalid", message: "That limit isn't one this agent offers." };
}

/** Why a Compact now may not be asked of this copy now, or nothing when it may. */
function compactRefusal(kept: AgentContextWindow, now: number): WindowRefusal | undefined {
  const said = kept.said;
  if (!said.compacts) {
    const why = said.why_not ?? "This agent can't be compacted from Chips.";
    return { kind: "invalid", message: why };
  }
  if (said.compacting !== undefined)
    return { kind: "waiting", message: "It is compacting already." };
  const last = kept.compaction;
  if (last?.state === "waiting" && !overdue(last.askedAt, now)) {
    return { kind: "waiting", message: "Its harness hasn't answered the last Compact now yet." };
  }
  return undefined;
}

function changeFrame(kept: AgentContextWindow, change: WindowChange): WindowChangeFrame {
  return {
    frame: "context_window.change",
    change_id: change.id as WindowChangeFrame["change_id"],
    harness_id: kept.harnessId as WindowChangeFrame["harness_id"],
    agent_id: kept.agentId as WindowChangeFrame["agent_id"],
    at: change.at,
    asked_by: change.askedBy as WindowChangeFrame["asked_by"],
    asked_at: change.askedAt,
  };
}

function compactFrame(kept: AgentContextWindow, compaction: Compaction): WindowCompactFrame {
  return {
    frame: "context_window.compact",
    change_id: compaction.id as WindowCompactFrame["change_id"],
    harness_id: kept.harnessId as WindowCompactFrame["harness_id"],
    agent_id: kept.agentId as WindowCompactFrame["agent_id"],
    asked_by: compaction.askedBy as WindowCompactFrame["asked_by"],
    asked_at: compaction.askedAt,
  };
}

const awayWords = (harness: Participant): string =>
  `${harness.display_name} is away, so Chips can't ask it now.`;

export function createAskWindowChange(deps: AgentContextWindowsDeps) {
  return async function askWindowChange(input: {
    readonly principal: Principal;
    readonly agentId: string;
    readonly ask: WindowLimitAsk;
  }): Promise<Answer<WindowChangeView>> {
    const { principal, agentId, ask } = input;
    const found = await readable(deps, principal, agentId);
    if (!found.ok) return found;
    const { kept, harness } = found.value;
    const refusal = limitRefusal(kept.said, ask.at);
    if (refusal !== undefined) return { ok: false, error: refusal };
    const now = deps.clock.nowIso();
    const last = kept.change;
    if (last?.state === "waiting" && !overdue(last.askedAt, Date.parse(now))) {
      return refused("waiting", `${harness.display_name} hasn't answered the last change yet.`);
    }

    const change: WindowChange = {
      id: deps.ids.next("change"),
      at: ask.at,
      askedBy: principal.participantId,
      askedAt: now,
      state: "waiting",
      message: null,
      answeredAt: null,
    };
    await deps.windows.ask(principal.workspaceId, agentId, change);
    const sockets = deps.sessions.windowChange(
      principal.workspaceId,
      harness.id,
      changeFrame(kept, change),
    );
    if (sockets === 0) {
      const words = awayWords(harness);
      await deps.windows.answer({
        workspaceId: principal.workspaceId,
        agentId,
        changeId: change.id,
        state: "failed",
        message: words,
        at: now,
      });
      return refused("away", words);
    }
    return ok(viewOfWindowChange(change, Date.parse(now)));
  };
}

export function createAskCompaction(deps: AgentContextWindowsDeps) {
  return async function askCompaction(input: {
    readonly principal: Principal;
    readonly agentId: string;
  }): Promise<Answer<CompactionView>> {
    const { principal, agentId } = input;
    const found = await readable(deps, principal, agentId);
    if (!found.ok) return found;
    const { kept, harness } = found.value;
    const now = deps.clock.nowIso();
    const refusal = compactRefusal(kept, Date.parse(now));
    if (refusal !== undefined) return { ok: false, error: refusal };

    const asked: Compaction = {
      id: deps.ids.next("change"),
      askedBy: principal.participantId,
      askedAt: now,
      state: "waiting",
      message: null,
      answeredAt: null,
      doneAt: null,
    };
    await deps.windows.compaction(principal.workspaceId, agentId, asked);
    const sockets = deps.sessions.windowCompact(
      principal.workspaceId,
      harness.id,
      compactFrame(kept, asked),
    );
    if (sockets === 0) {
      const words = awayWords(harness);
      await deps.windows.compaction(principal.workspaceId, agentId, {
        ...asked,
        state: "failed",
        message: words,
        answeredAt: now,
      });
      return refused("away", words);
    }
    return ok(viewOfCompaction(asked, Date.parse(now)));
  };
}

/** The harness's own live agent, as a path names it: or why it may not send that copy. */
async function sendable(
  deps: AgentContextWindowsDeps,
  principal: Principal,
  agentId: string,
): Promise<Answer<Participant>> {
  if (principal.kind !== "harness")
    return refused("not_allowed", "A harness sends its agents' context windows.");
  const harness = await harnessOf(deps, principal.workspaceId, agentId);
  if (harness === undefined) return refused("unknown", "No agent of that id here.");
  if (harness.id !== principal.participantId)
    return refused("not_allowed", "That agent isn't yours.");
  return ok(harness);
}

/** The ask a copy answers or refuses must be the agent's last of its kind. */
function closes(
  kept: AgentContextWindow | undefined,
  put: AgentContextWindowPut,
): Answer<"change" | "compaction" | undefined> {
  const id = put.answers ?? put.refuses?.change_id;
  if (id === undefined) return ok(undefined);
  if (kept?.change?.id === id) return ok("change");
  if (kept?.compaction?.id === id) return ok("compaction");
  return refused("invalid", "That ask isn't one made of this agent.");
}

/** A Compact now its harness refused, before or after taking it on. */
const failedCompaction = (
  compaction: Compaction,
  message: string | undefined,
  now: string,
): Compaction => ({ ...compaction, state: "failed", message: message ?? null, answeredAt: now });

/** A Compact now taken on while the copy compacts, and done once it doesn't. */
function movedOn(compaction: Compaction, compacting: boolean, now: string): Compaction | undefined {
  const answeredAt = compaction.answeredAt ?? now;
  if (!compacting) return { ...compaction, state: "done", answeredAt, doneAt: now };
  return compaction.state === "taken" ? undefined : { ...compaction, state: "taken", answeredAt };
}

/**
 * Where a Compact now stands after this copy: answered, refused, or done once the copy stops
 * compacting. Nothing when the copy moves it nowhere.
 */
function compactionAfter(
  compaction: Compaction | null,
  put: AgentContextWindowPut,
  closing: boolean,
  now: string,
): Compaction | undefined {
  const open = compaction?.state === "waiting" || compaction?.state === "taken";
  if (compaction === null || !open) return undefined;
  if (closing && put.refuses !== undefined)
    return failedCompaction(compaction, put.refuses.message, now);
  if (!closing && compaction.state === "waiting") return undefined;
  return movedOn(compaction, put.compacting !== undefined, now);
}

/**
 * A compaction the copy reports that the one before it didn't: its room's line is due. Not one
 * that saved nothing: "9.1k → 9.1k" says nothing happened, in a room people read (CW-1).
 */
function newlyCompacted(
  before: AgentContextWindow | undefined,
  put: AgentContextWindowPut,
): AgentContextWindowPut["last"] {
  if (before === undefined || put.last === undefined) return undefined;
  if (put.last.to >= put.last.from) return undefined;
  return before.said.last?.at === put.last.at ? undefined : put.last;
}

export function createPutAgentContextWindow(deps: AgentContextWindowsDeps) {
  /** The quiet line in the agent's room, once per compaction, while it is in one. */
  async function line(
    workspaceId: string,
    agentId: string,
    put: AgentContextWindowPut,
    last: NonNullable<AgentContextWindowPut["last"]>,
  ): Promise<void> {
    const spaceId = await deps.readModels.agentRoom(workspaceId, agentId);
    if (spaceId === undefined) return;
    await deps.store.append({
      v: 1,
      id: deps.ids.next("event"),
      ts: deps.clock.nowIso(),
      workspace_id: workspaceId,
      space_id: spaceId,
      actor: { kind: "agent", id: agentId },
      idempotency_key: `context.compacted:${agentId}:${last.at}`,
      type: "context.compacted",
      from: last.from,
      to: last.to,
      window: put.window,
      by: last.by,
    });
  }

  /** Close the limit change a copy answers, and move the Compact now on as the copy says. */
  async function settle(input: {
    readonly workspaceId: string;
    readonly agentId: string;
    readonly before: AgentContextWindow | undefined;
    readonly put: AgentContextWindowPut;
    readonly closing: "change" | "compaction" | undefined;
    readonly now: string;
  }): Promise<void> {
    const { workspaceId, agentId, put, now } = input;
    const changeId = put.answers ?? put.refuses?.change_id;
    if (input.closing === "change" && changeId !== undefined) {
      await deps.windows.answer({
        workspaceId,
        agentId,
        changeId,
        state: put.answers === undefined ? "failed" : "saved",
        message: put.refuses?.message ?? null,
        at: now,
      });
    }
    const compaction = input.before?.compaction ?? null;
    const moved = compactionAfter(compaction, put, input.closing === "compaction", now);
    if (moved !== undefined) await deps.windows.compaction(workspaceId, agentId, moved);
  }

  return async function putAgentContextWindow(input: {
    readonly principal: Principal;
    readonly agentId: string;
    readonly put: AgentContextWindowPut;
  }): Promise<Answer<{ readonly readAt: string }>> {
    const { principal, agentId, put } = input;
    const harness = await sendable(deps, principal, agentId);
    if (!harness.ok) return harness;
    const workspaceId = principal.workspaceId;
    const before = await deps.windows.get(workspaceId, agentId);
    const closing = closes(before, put);
    if (!closing.ok) return closing;

    const now = deps.clock.nowIso();
    const { answers: _answers, refuses: _refuses, ...said } = put;
    await deps.windows.put({
      workspaceId,
      agentId,
      harnessId: harness.value.id,
      said,
      readAt: now,
    });
    await settle({ workspaceId, agentId, before, put, closing: closing.value, now });
    const compacted = newlyCompacted(before, put);
    if (compacted !== undefined) await line(workspaceId, agentId, put, compacted);
    return ok({ readAt: now });
  };
}

export type ReadAgentContextWindow = ReturnType<typeof createReadAgentContextWindow>;
export type AskWindowChange = ReturnType<typeof createAskWindowChange>;
export type AskCompaction = ReturnType<typeof createAskCompaction>;
export type PutAgentContextWindow = ReturnType<typeof createPutAgentContextWindow>;
