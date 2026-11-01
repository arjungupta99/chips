/**
 * One room per agent (ADR 0087, rules 3, 4, 6 and 9, and its addendum of 30 September): what Chips
 * does after an event that puts an agent in a room, takes one out, archives or brings back a
 * room, or archives or restores an agent in its harness.
 *
 * - **An agent put in a room** is `agent.attached`, beside the membership, and what it said while
 *   in no room is posted there, oldest first.
 * - **An agent taken out** is `agent.released`, with why.
 * - **A room archived** stops every run going in it, and the lanes they opened, then releases
 *   each agent. The room remembers nothing of them; each agent remembers the room.
 * - **A room unarchived** takes back each agent it released that is still free.
 * - **An agent archived in its harness** leaves its room, and the room is archived when it was
 *   the only agent there. **Restored**, it goes back to the room its archive closed, but not to
 *   one a person archived, nor past the guest rule (SEC-48).
 *
 * Every consequence is an appended event, keyed by the event it follows, so a replay changes
 * nothing and a retry adds nothing. The store this is given reacts to what it appends too: an
 * agent archived closes its room, and the room closing releases whoever else is there.
 *
 * **Leaving a room stops the work, whatever the reason** (agents review, findings 10 and 12). An
 * agent's runs in a room are cancelled, and the lanes they opened with them, before it is taken
 * out: by an archive, a move, a delete, a person, or its harness archiving it. Before, because the
 * cancel is the room's, and the agent's harness hears a room's events only while its agent is in
 * it. `stopWork` is the one place that does it, and every exit calls it.
 *
 * **What a restart cut is finished at the next start** (finding 7). Consequences are appended one
 * at a time after the event they follow has committed, so a process that stops between the two
 * leaves an archived room still holding its agents. `settle` releases them, and ends any run
 * whose agent is no longer in the run's room.
 */

import { type ReleaseReason, STOPPED_BECAUSE } from "@chipschat/protocol";
import {
  AppendRefused,
  type Clock,
  type EventStore,
  type IdGenerator,
  type ReadModels,
  type StoredEvent,
} from "../ports/index.js";

export interface OneRoomDeps {
  readonly store: Pick<EventStore, "append" | "head">;
  readonly readModels: Pick<
    ReadModels,
    | "participant"
    | "space"
    | "membersOf"
    | "agentRoom"
    | "liveRunsIn"
    | "heldFor"
    | "releasedFrom"
    | "stateChangeOf"
    | "agentsInClosedRooms"
    | "strandedRuns"
    | "agentsInSeveralRooms"
  >;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** A run cancelled here stops the lanes it opened, as a person's cancel does (route-lane). */
  readonly cascade?: ((event: StoredEvent) => Promise<unknown>) | undefined;
}

type Actor = { readonly kind: "system" | "person" | "harness"; readonly id: string };

const SYSTEM: Actor = { kind: "system", id: "system" };

/** How a room's close is keyed when an agent's archive left nobody in it (rule 9). */
const CLOSED_BY_ARCHIVE = "agent-archived-close-";

/** What `settle` found and put right at a start (agents review, finding 7). */
export interface Settled {
  /** Agents released from a room that was archived around them: a release a restart cut. */
  readonly released: readonly { readonly agent_id: string; readonly space_id: string }[];
  /** Runs ended: in a room that is archived, or by an agent no longer in the run's room. */
  readonly ended: readonly {
    readonly run_id: string;
    readonly space_id: string;
    readonly why: "archived" | "left";
  }[];
  /** Agents in more than one room, which nothing here can choose between: said, not changed. */
  readonly inSeveral: readonly { readonly agent_id: string; readonly rooms: readonly string[] }[];
}

export function createOneRoom(deps: OneRoomDeps) {
  const { store, readModels } = deps;

  function envelope(workspaceId: string, actor: Actor = SYSTEM) {
    return {
      v: 1 as const,
      id: deps.ids.next("event"),
      ts: deps.clock.nowIso(),
      workspace_id: workspaceId,
      actor,
    };
  }

  async function isAgent(workspaceId: string, id: string): Promise<boolean> {
    return (await readModels.participant(workspaceId, id))?.kind === "agent";
  }

  /** An agent is in a room: say so, where everyone can see, and post what it said while free. */
  async function attached(event: StoredEvent, agentId: string): Promise<void> {
    if (event.space_id === null || !(await isAgent(event.workspace_id, agentId))) return;
    const movedFrom = event.payload["moved_from"];
    const forkOf = event.payload["fork_of"];
    const madeFor = event.payload["made_for"];
    await store.append({
      ...envelope(event.workspace_id),
      type: "agent.attached",
      idempotency_key: `attached-${event.id}`,
      agent_id: agentId,
      space_id: event.space_id,
      by: event.actor.id,
      ...(typeof movedFrom === "string" ? { moved_from: movedFrom } : {}),
      ...(typeof forkOf === "string" ? { fork_of: forkOf } : {}),
      ...(typeof madeFor === "string" ? { made_for: madeFor } : {}),
    });
  }

  /** What an agent said while in no room, posted in the room it is in now (rule 6). */
  async function postHeld(event: StoredEvent): Promise<void> {
    const agentId = String(event.payload["agent_id"]);
    const spaceId = event.space_id;
    if (spaceId === null) return;
    const held = await readModels.heldFor(event.workspace_id, agentId);
    if (held.length === 0) return;
    const agent = await readModels.participant(event.workspace_id, agentId);
    if (agent?.harness_id === undefined) return;
    for (const words of held) {
      await store.append({
        ...envelope(event.workspace_id, SYSTEM),
        actor: { kind: "agent", id: agentId, harness_id: agent.harness_id },
        type: "message.post",
        space_id: spaceId,
        idempotency_key: `post-${words.event_id}`,
        text: words.text,
        ...(words.attachments.length === 0 ? {} : { attachments: words.attachments }),
        // Said to nobody: the room hears it, and no agent takes a turn on it.
        addressed_to: [],
        held_since: words.said_at,
        from_held: words.event_id,
      } as Parameters<EventStore["append"]>[0]);
    }
  }

  /** An agent is out of a room: say so, and why. */
  async function released(event: StoredEvent): Promise<void> {
    const agentId = String(event.payload["participant_id"]);
    if (event.space_id === null || !(await isAgent(event.workspace_id, agentId))) return;
    const reason = (event.payload["reason"] as ReleaseReason | undefined) ?? "removed";
    const movedTo = event.payload["moved_to"];
    const removedBy = event.payload["removed_by"];
    await store.append({
      ...envelope(event.workspace_id),
      type: "agent.released",
      idempotency_key: `released-${event.id}`,
      agent_id: agentId,
      space_id: event.space_id,
      by: typeof removedBy === "string" ? removedBy : event.actor.id,
      reason,
      ...(typeof movedTo === "string" ? { moved_to: movedTo } : {}),
    });
  }

  /**
   * Stop the work in a room that somebody is leaving: an agent's runs there, or every run there
   * when the room itself is going, each with the lanes it opened. Called before the leaving is
   * written, so the harness is still in the room to hear it.
   */
  async function stopWork(
    workspaceId: string,
    spaceId: string,
    how: {
      readonly reason: ReleaseReason;
      readonly by: string;
      /** Whose runs: one agent's, or, absent, everybody's in the room. */
      readonly agentId?: string | undefined;
    },
  ): Promise<void> {
    for (const run of await readModels.liveRunsIn(workspaceId, spaceId)) {
      if (how.agentId !== undefined && run.agent_id !== how.agentId) continue;
      // In the run's own space: one of the room's threads, for a run that is in one.
      await cancel(workspaceId, run.space_id ?? spaceId, run.run_id, {
        by: how.by,
        reason: STOPPED_BECAUSE[how.reason],
        // A run is stopped for leaving once: a retry of whatever took the agent out adds nothing.
        key: `left-cancel-${run.run_id}`,
      });
    }
  }

  /**
   * Take an agent out of a room, for a reason: its work there is stopped, the membership goes,
   * and the release follows.
   */
  async function takeOut(
    workspaceId: string,
    spaceId: string,
    agentId: string,
    how: {
      readonly reason: ReleaseReason;
      readonly by: string;
      readonly key: string;
      readonly actor?: Actor;
      readonly movedTo?: string;
    },
  ): Promise<void> {
    await stopWork(workspaceId, spaceId, { reason: how.reason, by: how.by, agentId });
    await store.append({
      ...envelope(workspaceId, how.actor),
      type: "membership.removed",
      space_id: spaceId,
      idempotency_key: how.key,
      participant_id: agentId,
      removed_by: how.by,
      reason: how.reason,
      ...(how.movedTo === undefined ? {} : { moved_to: how.movedTo }),
    });
  }

  /** Stop a run for good, and the lanes it opened with it. */
  async function cancel(
    workspaceId: string,
    spaceId: string,
    runId: string,
    how: { readonly by: string; readonly reason: string; readonly key: string },
  ): Promise<void> {
    const appended = await store.append({
      ...envelope(workspaceId),
      type: "run.cancel",
      space_id: spaceId,
      run_id: runId,
      idempotency_key: how.key,
      reason: how.reason,
      by: how.by,
    });
    if (!appended.duplicate) await deps.cascade?.(appended.event);
  }

  /** The agents in a room, in the order they joined. */
  async function agentsIn(workspaceId: string, spaceId: string): Promise<string[]> {
    const members = await readModels.membersOf(workspaceId, spaceId);
    return members
      .filter((member) => member.kind === "agent")
      .map((member) => member.participant_id);
  }

  /** A room archived (rule 3): its runs stopped, then its agents released. */
  async function archived(event: StoredEvent): Promise<void> {
    const spaceId = event.space_id;
    if (spaceId === null) return;
    const space = await readModels.space(event.workspace_id, spaceId);
    if (space === undefined || space.parent_space_id !== null) return;
    await stopWork(event.workspace_id, spaceId, { reason: "archived", by: event.actor.id });
    for (const agentId of await agentsIn(event.workspace_id, spaceId)) {
      await takeOut(event.workspace_id, spaceId, agentId, {
        reason: "archived",
        by: event.actor.id,
        key: `archive-release-${event.id}-${agentId}`,
      });
    }
  }

  /** A room unarchived (rule 4): each agent its archive released that is still free comes back. */
  async function unarchived(event: StoredEvent): Promise<void> {
    const spaceId = event.space_id;
    if (spaceId === null) return;
    for (const agent of await readModels.releasedFrom(event.workspace_id, spaceId)) {
      if (agent.room !== null) continue;
      const harness = await readModels.participant(event.workspace_id, agent.harness_id);
      if (harness === undefined || harness.removed_at !== null) continue;
      await bringBack(event, spaceId, agent.agent_id);
    }
  }

  /** One agent back in the room an unarchive reopened, unless it has been put elsewhere since. */
  async function bringBack(event: StoredEvent, spaceId: string, agentId: string): Promise<void> {
    try {
      await store.append({
        ...envelope(event.workspace_id),
        type: "membership.added",
        space_id: spaceId,
        idempotency_key: `unarchive-attach-${event.id}-${agentId}`,
        participant_id: agentId,
        participant_kind: "agent",
        role: "member",
      });
    } catch (error) {
      // Put somewhere else in the moment since it was read as free: it stays there, and this
      // room says where it is, as it does for any agent that is elsewhere.
      if (!(error instanceof AppendRefused)) throw error;
    }
  }

  /**
   * Who archived or restored an agent, as the room is told: the person, when a person did it
   * (ADR 0095), or else its harness.
   */
  function archiver(
    event: StoredEvent,
    agent: { readonly harness_id?: string | null } | undefined,
  ) {
    if (event.actor.kind === "person") return { kind: "person", id: event.actor.id } as const;
    return { kind: "harness", id: agent?.harness_id ?? event.actor.id } as const;
  }

  /**
   * An agent archived, in its harness or by a person (rule 9, ADR 0095): out of its room, and the
   * room archived when it was the only agent there, so the list still follows the harness. Never
   * a home.
   */
  async function agentArchived(event: StoredEvent, agentId: string): Promise<void> {
    const spaceId = await readModels.agentRoom(event.workspace_id, agentId);
    if (spaceId === undefined) return;
    const agent = await readModels.participant(event.workspace_id, agentId);
    const room = await readModels.space(event.workspace_id, spaceId);
    // The Main agent stays in its Main room (rule 7), which is always there.
    if (agent?.lead === true && room?.home === true) return;
    const who: Actor = archiver(event, agent);
    await takeOut(event.workspace_id, spaceId, agentId, {
      reason: "agent_archived",
      by: who.id,
      key: `agent-archived-${event.id}`,
      ...(who.kind === "person" ? { actor: who } : {}),
    });
    await closeIfEmpty(event.workspace_id, spaceId, who, `${CLOSED_BY_ARCHIVE}${event.id}`);
  }

  /**
   * A room archived because the only agent in it left for good (rule 9, ADR 0095). Not one whose
   * changes are locked when a person took the agent away (ADR 0156): that would be archiving it by
   * another door, so it stays open with nobody in it to answer.
   */
  async function closeIfEmpty(
    workspaceId: string,
    spaceId: string,
    who: Actor,
    key: string,
  ): Promise<void> {
    const space = await readModels.space(workspaceId, spaceId);
    if (space === undefined || space.home || space.state === "closed") return;
    if (space.locked === true && who.kind === "person") return;
    if ((await agentsIn(workspaceId, spaceId)).length > 0) return;
    await store.append({
      ...envelope(workspaceId, who),
      type: "space.updated",
      space_id: spaceId,
      idempotency_key: key,
      state: "closed",
    });
  }

  /**
   * An agent restored, in its harness (the addendum's point 3) or by a person (ADR 0095): back to
   * the room its archive took it from. A room an agent's archive closed opens again and takes it
   * back as an unarchive does; one that stayed open, for the agents still there, takes it back now.
   */
  async function agentRestored(event: StoredEvent, agentId: string): Promise<void> {
    const agent = await readModels.participant(event.workspace_id, agentId);
    const from = agent?.released_from;
    if (agent === undefined || from === null || from === undefined) return;
    if ((await readModels.agentRoom(event.workspace_id, agentId)) !== undefined) return;
    const space = await readModels.space(event.workspace_id, from);
    if (space === undefined) return;
    if (space.state !== "closed") {
      await bringBack(event, from, agentId);
      return;
    }
    await reopen(event, from, agent);
  }

  /**
   * Whether a person archived this room themselves, rather than by archiving its last agent, which
   * closes it as Chips's consequence (rule 9). A person's word on a room holds over its harness's
   * (ADR 0066), so a restore does not undo it (SEC-48).
   */
  async function archivedByAPerson(workspaceId: string, spaceId: string): Promise<boolean> {
    const last = await readModels.stateChangeOf(workspaceId, spaceId);
    return last?.by === "person" && last.key?.startsWith(CLOSED_BY_ARCHIVE) !== true;
  }

  /**
   * The room an agent's archive closed, opened again for it. Not one a person archived: unarchiving
   * that is theirs, and the agent waits free for it, as any agent an archive released does. Nor
   * one whose guest is in another open room by now, which the store refuses (JR-24, SEC-48); the
   * agent waits for that room in the same way.
   */
  async function reopen(
    event: StoredEvent,
    spaceId: string,
    agent: { readonly harness_id?: string | null },
  ): Promise<void> {
    if (await archivedByAPerson(event.workspace_id, spaceId)) return;
    try {
      await store.append({
        ...envelope(event.workspace_id, archiver(event, agent)),
        type: "space.updated",
        space_id: spaceId,
        idempotency_key: `agent-restored-open-${event.id}`,
        state: "open",
      });
    } catch (error) {
      if (!(error instanceof AppendRefused)) throw error;
    }
  }

  /** A room archived or brought back. */
  async function roomState(event: StoredEvent): Promise<void> {
    if (event.payload["state"] === "closed") await archived(event);
    else if (event.payload["state"] === "open") await unarchived(event);
  }

  /** An agent archived or restored in its harness. */
  async function agentState(event: StoredEvent): Promise<void> {
    const agentId = String(event.payload["agent_id"]);
    if (event.payload["state"] === "archived") await agentArchived(event, agentId);
    else if (event.payload["state"] === "active") await agentRestored(event, agentId);
  }

  const REACTIONS: Readonly<Record<string, (event: StoredEvent) => Promise<void>>> = {
    "membership.added": async (event) => {
      if (event.payload["participant_kind"] !== "agent") return;
      await attached(event, String(event.payload["participant_id"]));
    },
    "membership.replaced": (event) => attached(event, String(event.payload["to"])),
    "agent.attached": postHeld,
    "membership.removed": released,
    "space.updated": roomState,
    "agent.updated": agentState,
  };

  /** React to one appended event. */
  async function after(event: StoredEvent): Promise<void> {
    await REACTIONS[event.type]?.(event);
  }

  /**
   * Before a person's removal of somebody from a room is written: when it is an agent, its work
   * there is stopped first (finding 12). The door calls this; every other exit is `takeOut`'s.
   */
  async function leaving(event: Readonly<Record<string, unknown>>): Promise<void> {
    const { workspace_id: workspaceId, space_id: spaceId, participant_id: who } = event;
    if (typeof workspaceId !== "string" || typeof spaceId !== "string") return;
    if (typeof who !== "string") return;
    const by = (event["actor"] as { id?: unknown } | undefined)?.id;
    await stopWork(workspaceId, spaceId, {
      reason: "removed",
      by: typeof by === "string" ? by : "system",
      agentId: who,
    });
  }

  /**
   * Finish what a restart cut (finding 7), for one workspace, at a start and before anything is
   * served. An agent still in an archived room is released from it, as the archive would have:
   * until then the store refuses to put it anywhere else. A run still going in an archived room,
   * or whose agent is no longer in the run's room, is ended: nothing else ever would, and an
   * archive stops every run in its room. An agent in several rooms is said and left, since which
   * room is right is not Chips's to choose.
   */
  async function settle(workspaceId: string): Promise<Settled> {
    const head = await store.head(workspaceId);
    const released = await readModels.agentsInClosedRooms(workspaceId);
    for (const { agent_id: agentId, space_id: spaceId } of released) {
      await takeOut(workspaceId, spaceId, agentId, {
        reason: "archived",
        by: "system",
        key: `settle-release-${spaceId}-${agentId}-at-${head}`,
      });
    }
    const ended = await readModels.strandedRuns(workspaceId);
    for (const run of ended) {
      await cancel(workspaceId, run.space_id, run.run_id, {
        by: "system",
        reason:
          run.why === "archived"
            ? STOPPED_BECAUSE.archived
            : "The agent is no longer in this space.",
        key: `left-cancel-${run.run_id}`,
      });
    }
    const inSeveral = await readModels.agentsInSeveralRooms(workspaceId);
    return { released, ended, inSeveral };
  }

  return { after, takeOut, closeIfEmpty, cancel, stopWork, leaving, settle };
}

export type OneRoom = ReturnType<typeof createOneRoom>;

/**
 * A store that reacts to what it appends (ADR 0087): every door that appends — a person's event,
 * a harness's registration, a claim, the upgrade — has its consequences, and so do the
 * consequences. A duplicate has had its consequences already.
 */
export function reacting(
  store: EventStore,
  react: (event: StoredEvent) => Promise<void>,
): EventStore {
  return {
    ...store,
    async append(event) {
      const appended = await store.append(event);
      if (!appended.duplicate) await react(appended.event);
      return appended;
    },
  };
}
