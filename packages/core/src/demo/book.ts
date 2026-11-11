/**
 * The demo server's log (ADR 0213), and what it knows from it: who is in each room, where each
 * agent is, which runs are going, which asks wait, what each room allows a job. It stamps what the
 * script's harnesses say and what You sends the way a server does, writing in what a server
 * writes: who a message is for and whom it mentions, who may answer an ask, who gave a correction.
 *
 * Its events are numbered in the order they are logged and their ids follow their numbers, so the
 * same film logs the same events under the same ids every time it plays.
 */

import {
  isAgentKind,
  mentionsEveryone,
  messageIdOf,
  NO_SPEND_CEILING,
  resolveAddress,
  resolveMentions,
  type SpendCeilingSetting,
} from "@chipschat/protocol";
import type { ClientEvent } from "../events.js";
import type { OutboxEvent } from "../outbox.js";
import { DEMO_PERSON_ID, DEMO_WORKSPACE_ID, demoId } from "./device.js";
import {
  AGENTS,
  type AgentFacts,
  type Draft,
  HARNESSES,
  PEOPLE,
  startingAgents,
} from "./workspace.js";

/** What the server made of something You sent: logged, logged before under its key, or refused. */
export type Taken =
  | { readonly kind: "logged" | "again"; readonly event: ClientEvent; readonly steered: boolean }
  | { readonly kind: "refused" };

/** A room an agent was in, as `GET /v1/agents/:id/stays` lists it (ADR 0087, rule 3.11). */
export interface Stay {
  readonly readable: boolean;
  readonly space_id: string;
  readonly from_seq: number;
  readonly to_seq: number | null;
  readonly from: string;
  readonly to: string | null;
  readonly lines: number;
}

/** The server's log, and what it knows from it. */
export interface Book {
  readonly events: readonly ClientEvent[];
  /** Stamp a draft as the server stamps what a harness or a person sends, and log it. */
  readonly say: (draft: Draft, ts: string) => ClientEvent;
  /** Log what the server writes itself, or a harness as itself: the fields as written. */
  readonly record: (fields: Readonly<Record<string, unknown>>, ts: string) => ClientEvent;
  /** Log what You sent, as the server writes it, or turn it away. */
  readonly take: (sent: OutboxEvent, ts: string) => Taken;
  readonly members: (spaceId: string) => readonly string[];
  readonly rooms: () => string[];
  readonly lastSeqIn: (spaceId: string) => number;
  /** Every agent, and where it is now. */
  readonly agents: () => readonly AgentFacts[];
  readonly agent: (agentId: string) => AgentFacts | undefined;
  readonly isAgent: (id: string) => boolean;
  readonly nameOf: (id: string) => string;
  /** What a room allows a job, when somebody has set it (ADR 0117), or No cap (ADR 0292). */
  readonly ceilingOf: (spaceId: string) => number | typeof NO_SPEND_CEILING | undefined;
  /** The newest message in a room with these words, by the id of the event that carried it. */
  readonly lineOf: (spaceId: string, text: string) => string | undefined;
  /** The rooms an agent has been in, oldest first. */
  readonly staysOf: (agentId: string) => readonly Stay[];
}

/** What the book knows from its log, which the next event is read against. */
interface Known {
  readonly members: Map<string, string[]>;
  /** Where each person's last message in a room went (ADR 0081): their next goes there too. */
  readonly aims: Map<string, readonly string[] | "all">;
  /** Runs still going, by id, with the agent working each. */
  readonly going: Map<string, string>;
  /** Asks, by approval id, and whether each has been answered. */
  readonly asks: Map<string, boolean>;
  /** Every agent by id, the demo's own and the copies its harnesses registered since. */
  readonly agents: Map<string, AgentFacts>;
  /** What a room allows a job, by room: `null` for the default again, or No cap. */
  readonly ceilings: Map<string, SpendCeilingSetting>;
}

const participantOf = (event: ClientEvent): string => String(event["participant_id"]);

/** An agent put in a room, or taken out of one: where the directory says it is follows. */
function placed(known: Known, event: ClientEvent, room: string | null): void {
  const agent = known.agents.get(participantOf(event));
  if (agent === undefined) return;
  const left = room === null ? { lastRoom: event.space_id } : {};
  known.agents.set(agent.id, { ...agent, room, ...left });
}

/** How each kind of event changes what the book knows. */
const LEARNS: Readonly<Record<string, (known: Known, event: ClientEvent) => void>> = {
  "space.created": (known, event) => known.members.set(event.space_id ?? "", [event.actor.id]),
  "membership.added": (known, event) => {
    known.members.get(event.space_id ?? "")?.push(participantOf(event));
    placed(known, event, event.space_id ?? null);
  },
  "membership.removed": (known, event) => {
    const space = event.space_id ?? "";
    const here = known.members.get(space);
    if (here !== undefined) {
      known.members.set(
        space,
        here.filter((id) => id !== participantOf(event)),
      );
    }
    placed(known, event, null);
  },
  "agent.registered": (known, event) => {
    const id = String(event["agent_id"]);
    const forkedFrom = event["forked_from"];
    known.agents.set(id, {
      id,
      name: String(event["name"]),
      harness: String(event["harness_id"]),
      room: null,
      ...(typeof forkedFrom === "string" ? { forkedFrom } : {}),
    });
  },
  "space.spend_ceiling_set": (known, event) =>
    known.ceilings.set(event.space_id ?? "", event["usd"] as number | null),
  "space.spend_ceiling_lifted": (known, event) =>
    known.ceilings.set(event.space_id ?? "", NO_SPEND_CEILING),
  "run.started": (known, event) => known.going.set(event.run_id ?? "", event.actor.id),
  "run.completed": (known, event) => known.going.delete(event.run_id ?? ""),
  "approval.request": (known, event) => known.asks.set(event["approval_id"] as string, false),
  "approval.resolved": (known, event) => known.asks.set(event["approval_id"] as string, true),
};

function actorOf(by: Draft["by"]): ClientEvent["actor"] {
  if (by === "chips") return { kind: "system", id: "system" };
  if (by === "you" || by === "rosa") return { kind: "person", id: PEOPLE[by].id };
  const agent = AGENTS[by];
  return { kind: "agent", id: agent.id, harness_id: agent.harness };
}

export function createBook(): Book {
  const events: ClientEvent[] = [];
  const known: Known = {
    members: new Map(),
    aims: new Map(),
    going: new Map(),
    asks: new Map(),
    agents: new Map(startingAgents().map((agent) => [agent.id, agent])),
    ceilings: new Map(),
  };
  const keys = new Map<string, ClientEvent>();
  const named: ReadonlyMap<string, string> = new Map(
    [...Object.values(PEOPLE), ...HARNESSES].map((each) => [each.id, each.name]),
  );
  const nameOf = (id: string): string => known.agents.get(id)?.name ?? named.get(id) ?? id;

  const log = (fields: Readonly<Record<string, unknown>>, ts: string): ClientEvent => {
    const seq = events.length + 1;
    const event = { v: 1, seq, id: demoId("event", seq), ts, workspace_id: DEMO_WORKSPACE_ID };
    const logged = written({ ...event, ...fields }, known, nameOf) as unknown as ClientEvent;
    LEARNS[logged.type]?.(known, logged);
    events.push(logged);
    return logged;
  };

  /** A message for an agent whose run is going is steered into it. */
  const steers = (event: ClientEvent): boolean => {
    const aimed = (event["addressed_to"] as readonly string[] | undefined) ?? [];
    return [...known.going.values()].some((agent) => aimed.includes(agent));
  };

  const say = (draft: Draft, ts: string): ClientEvent =>
    log(
      {
        type: draft.type,
        ...(draft.space === undefined ? {} : { space_id: draft.space }),
        ...(draft.run === undefined ? {} : { run_id: draft.run }),
        actor: actorOf(draft.by),
        ...draft.payload,
      },
      ts,
    );

  const take = (sent: OutboxEvent, ts: string): Taken => {
    const already = keys.get(sent.idempotency_key);
    if (already !== undefined) return { kind: "again", event: already, steered: false };
    const fields = personsOwn(sent, ts, known, events);
    if (fields === undefined) return { kind: "refused" };
    const event = log(fields, ts);
    keys.set(sent.idempotency_key, event);
    return { kind: "logged", event, steered: event.type === "message.post" && steers(event) };
  };

  return {
    events,
    say,
    record: log,
    take,
    members: (spaceId) => known.members.get(spaceId) ?? [],
    rooms: () => [...known.members.keys()],
    lastSeqIn: (spaceId) =>
      events.reduce((last, event) => (event.space_id === spaceId ? event.seq : last), 0),
    agents: () => [...known.agents.values()],
    agent: (agentId) => known.agents.get(agentId),
    isAgent: (id) => known.agents.has(id),
    nameOf,
    ceilingOf: (spaceId) => known.ceilings.get(spaceId) ?? undefined,
    lineOf: (spaceId, text) =>
      events.findLast(
        (event) =>
          event.type === "message.post" && event.space_id === spaceId && event["text"] === text,
      )?.id,
    staysOf: (agentId) => staysOf(events, agentId, (spaceId) => known.members.has(spaceId)),
  };
}

/** What a server writes into an event: whom a message mentions and is for, who may answer. */
function written(
  event: Record<string, unknown>,
  known: Known,
  nameOf: (id: string) => string,
): Record<string, unknown> {
  const type = event["type"];
  if (type === "message.post") return { ...event, ...addressOf(event, known, nameOf) };
  if (type === "approval.request" || type === "approval.executed") {
    return { ...event, approvers: [DEMO_PERSON_ID] };
  }
  return event;
}

/**
 * Whom a message mentions, and whom it is for, as the server decides (ADR 0081, ADR 0204): the
 * protocol's own rules, against who is in the room, and for a person where their last one went.
 */
function addressOf(
  event: Record<string, unknown>,
  known: Known,
  nameOf: (id: string) => string,
): Record<string, unknown> {
  const space = event["space_id"] as string;
  const text = event["text"] as string;
  const actor = event["actor"] as ClientEvent["actor"];
  const here = known.members.get(space) ?? [];
  const isAgent = (id: string) => known.agents.has(id);
  const mentions = resolveMentions(
    text,
    here.map((id) => ({ id, displayName: nameOf(id) })),
  );
  const person = !isAgentKind(actor.kind);
  const aim = `${space} ${actor.id}`;
  const to = event["to"] as readonly string[] | "all" | undefined;
  const said = resolveAddress({
    sender: { id: actor.id, kind: actor.kind },
    mentioned: mentions,
    everyone: mentionsEveryone(text),
    ...(to === undefined ? {} : { to }),
    agents: here.filter(isAgent),
    people: here.filter((id) => !isAgent(id)),
    ...(person ? { last: known.aims.get(aim) } : {}),
  });
  if (person) known.aims.set(aim, said.addressed_to_all === true ? "all" : said.addressed_to);
  return { ...(mentions.length > 0 ? { mentions } : {}), ...said };
}

/** You, as the server fills in who gave a correction or a reaction (M3.4). */
const YOU_AS_SENDER = {
  participant_id: DEMO_PERSON_ID,
  kind: "person",
  display_name: PEOPLE.you.name,
  role: "owner",
};

/**
 * What the server logs of an event You sent, before what it writes into it: a room You opens, a
 * message in one of the rooms, an answer to an ask still waiting, and a correction or a reaction
 * on a message there. Anything else is not in the demo.
 */
function personsOwn(
  sent: OutboxEvent,
  ts: string,
  known: Known,
  events: readonly ClientEvent[],
): Record<string, unknown> | undefined {
  const space = sent["space_id"];
  if (typeof space !== "string") return undefined;
  if (sent["type"] === "space.created") return roomOpened(sent, known);
  if (!known.members.has(space)) return undefined;
  switch (sent["type"]) {
    case "message.post": {
      if (sent["upload_ids"] !== undefined) return undefined;
      const { session_ref: _visit, ...rest } = sent;
      return { ...rest, actor: BY_YOU };
    }
    case "feedback":
      return feedbackOf(sent, events);
    case "approval.resolved":
      return answerOf(sent, ts, known);
    default:
      return undefined;
  }
}

const BY_YOU = { kind: "person", id: DEMO_PERSON_ID } as const;

/** A room You opens, with a title and asked of nobody: a new room only, never one again. */
function roomOpened(sent: OutboxEvent, known: Known): Record<string, unknown> | undefined {
  const fresh = !known.members.has(String(sent["space_id"])) && typeof sent["title"] === "string";
  return fresh && sent["asked_of"] === undefined ? { ...sent, actor: BY_YOU } : undefined;
}

/** An answer to an ask still waiting, with who gave it and when, as the server stamps it. */
function answerOf(
  sent: OutboxEvent,
  ts: string,
  known: Known,
): Record<string, unknown> | undefined {
  if (known.asks.get(String(sent["approval_id"])) !== false) return undefined;
  return {
    ...sent,
    actor: BY_YOU,
    scope: sent["scope"] ?? "once",
    resolved_by: DEMO_PERSON_ID,
    resolved_at: ts,
    resolved_elsewhere: false,
    approvers: [DEMO_PERSON_ID],
  };
}

/** A correction or a reaction on a message an agent said in the room, with who gave it. */
function feedbackOf(
  sent: OutboxEvent,
  events: readonly ClientEvent[],
): Record<string, unknown> | undefined {
  const about = sent["message_id"];
  const said = events.find(
    (event) =>
      event.type === "message.post" &&
      event.space_id === sent["space_id"] &&
      messageIdOf(event.id) === about,
  );
  const kind = sent["kind"];
  const filled = kind === "correction" ? typeof sent["text"] === "string" : kind === "reaction";
  if (said === undefined || !isAgentKind(said.actor.kind) || !filled) return undefined;
  return { ...sent, actor: BY_YOU, from: YOU_AS_SENDER };
}

/** The rooms an agent has been in, from its joinings and leavings, and what it said in each. */
function staysOf(
  events: readonly ClientEvent[],
  agentId: string,
  readable: (spaceId: string) => boolean,
): Stay[] {
  const stays: Stay[] = [];
  for (const event of events) {
    if (event["participant_id"] !== agentId || event.space_id === undefined) continue;
    if (event.type === "membership.added") {
      stays.push({
        readable: readable(event.space_id),
        space_id: event.space_id,
        from_seq: event.seq,
        to_seq: null,
        from: event.ts,
        to: null,
        lines: 0,
      });
    }
    const open = stays.findLast((stay) => stay.space_id === event.space_id && stay.to === null);
    if (event.type !== "membership.removed" || open === undefined) continue;
    stays[stays.indexOf(open)] = { ...open, to_seq: event.seq, to: event.ts };
  }
  return stays.map((stay) => ({
    ...stay,
    lines: events.filter(
      (event) =>
        event.type === "message.post" &&
        event.actor.id === agentId &&
        event.space_id === stay.space_id &&
        event.seq > stay.from_seq &&
        (stay.to_seq === null || event.seq < stay.to_seq),
    ).length,
  }));
}
