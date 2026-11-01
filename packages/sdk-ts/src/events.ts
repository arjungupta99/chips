/**
 * What a harness hears, typed from the protocol. The wire is snake_case and stays that way in
 * handlers: an event is the protocol's object, not a translation of it, so the reference on
 * the docs site is the reference for these too.
 */

import type {
  AgentAsked,
  AgentAttached,
  AgentFork,
  AgentReleased,
  AnyEvent,
  ApprovalResolved,
  BudgetWarning,
  Feedback,
  Hello,
  LaneUpdated,
  MessageNew,
  MessageOverheard,
  PolicyUpdated,
  QuestionAnswered,
  RunCancel,
  RunPause,
  RunRequested,
  RunResume,
  RunSteer,
} from "@chipschat/protocol";

export type ConnectionState = "connecting" | "open" | "closed";

/** What Chips did with a message a person sent mid-run: queued for the next look, or steered. */
export interface Receipt {
  readonly idempotencyKey: string;
  readonly disposition: "queued" | "steered";
}

/** Everything `chips.on(...)` can listen for, by name. */
export interface ChipsEvents {
  /**
   * Something said to this harness: a person's message, or another harness addressing it. Its
   * `context` is what was said in the room since this harness last spoke there (ADR 0088), and
   * `context.files` the room's files at their current version, each with a URL (ADR 0099);
   * `renderContext(event.context)` writes both as plain text to go ahead of the turn's words. Its
   * `room` says who is in the room, with the handle that reaches each, and `room.notes[id]` is the
   * note for each agent in `for` (ADR 0092): put it first in that agent's turn.
   */
  readonly "message.new": MessageNew;
  /**
   * Something said in a room this harness is in, for somebody else (ADR 0081): context, not a
   * turn. `held` is set when Chips stopped two harnesses talking until a person speaks.
   */
  readonly "message.overheard": MessageOverheard;
  readonly "approval.resolved": ApprovalResolved;
  readonly "question.answered": QuestionAnswered;
  readonly "run.steer": RunSteer;
  readonly "run.pause": RunPause;
  readonly "run.resume": RunResume;
  readonly "run.cancel": RunCancel;
  readonly "run.requested": RunRequested;
  /** News of a lane this harness opened, in the space it linked the lane into (M3.5). */
  readonly "lane.updated": LaneUpdated;
  readonly "policy.updated": PolicyUpdated;
  /**
   * One of this harness's agents was put in a room (ADR 0087): added, moved in, or brought back by
   * an unarchive. `space_id` is the room, and `catch_up` its last lines before the agent joined
   * (ADR 0088), for the agent's next turn there. Heard only by a harness that declares `agents`.
   */
  readonly "agent.attached": AgentAttached;
  /**
   * One of this harness's agents was taken out of its room, and is free (ADR 0087): `reason` says
   * why — `archived` (its room was archived: archive what it is, and restore it when it is
   * attached again), `deleted` (with `delete`, the person asked to delete it on this side too),
   * `moved`, `agent_archived` or `removed`. What it says while free is held, and posted in the next
   * room it joins.
   */
  readonly "agent.released": AgentReleased;
  /**
   * A person asked for a copy of one of this harness's agents in a room (ADR 0087, Fork): copy what
   * the agent remembers, then `chips.agents.register` the copy with `forkedFrom` (this event's
   * `agent_id`) and `spaceId` (its `space_id`), and it joins that room. The room waits a minute
   * (`FORK_WAIT_MS`) from the event's `ts`; a copy registered later is free. Heard only by a
   * harness that declares `forks`, which no person is offered otherwise.
   */
  readonly "agent.fork": AgentFork;
  /**
   * A person asked this harness for a new agent in a room (ADR 0108): make one that remembers
   * nothing from elsewhere, called this event's `name`, then `chips.agents.register` it with
   * `madeFor` (this event's `id`) and `spaceId` (its `space_id`), and it joins that room. The room
   * waits a minute (`NEW_AGENT_WAIT_MS`) from the event's `ts`; an agent registered later is free.
   * Heard only by a harness that declares `new_agents`, which no person is offered otherwise.
   */
  readonly "agent.asked": AgentAsked;
  readonly "budget.warning": BudgetWarning;
  /**
   * A thumb, or a note about what went wrong, on one of this harness's messages (M3.4). Only
   * the harness whose message it is hears it; `from` says who gave it, and their role.
   */
  readonly feedback: Feedback;
  readonly hello: Hello;
  /** Every event, whatever its type, in `seq` order. */
  readonly event: AnyEvent;
  readonly receipt: Receipt;
  readonly state: ConnectionState;
}

export type Handler<T> = (event: T) => void | Promise<void>;

/** A small typed emitter. Handlers run in order; one that throws does not stop the others. */
export class Emitter<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(name: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(name);
    if (set === undefined) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler as Handler<never>);
    return () => {
      set?.delete(handler as Handler<never>);
    };
  }

  emit<K extends keyof Events>(name: K, value: Events[K]): void {
    for (const handler of this.handlers.get(name) ?? []) {
      try {
        const result = (handler as Handler<Events[K]>)(value);
        if (result instanceof Promise) result.catch(() => undefined);
      } catch {
        // A handler that throws is the harness's bug, not a reason to drop the connection.
      }
    }
  }

  count(name: keyof Events): number {
    return this.handlers.get(name)?.size ?? 0;
  }
}
