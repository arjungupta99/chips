/**
 * What the demo's harnesses keep of their agents, and the server's answers about an agent (ADR
 * 0213): the reads and writes an agent's page makes, answered as the server answers them from the
 * copies a harness sends it and from its log.
 *
 * - **Model and effort** (ADR 0140): Errand's copy of each of its agents', the models it may run
 *   on, and a person's change.
 * - **Context files** (ADR 0134): each agent's files, and a person's edit, kept by its version.
 * - **Context window** (ADR 0146): how full it is, a Compact now, and the limit it compacts at. A
 *   compaction writes its quiet line in the agent's room (`context.compacted`).
 * - **Where it is** (ADR 0087): the rooms it has been in, a move, and a fork, whose copy Errand
 *   registers and puts in the room asked for.
 *
 * Errand answers every ask at once, as a harness on the same machine would: a change is saved, a
 * Compact now done, a fork's copy in its room, by the time the server answers the person. So the
 * same act logs the same events at the same moment whether a person tapped or the film did it,
 * and a film started at a later chapter replays it exactly. Only Errand keeps copies (ADR 0046):
 * an agent of Studio or Herald has no model, files or window here, as on a real server.
 */

import {
  type AgentContextView,
  type AgentContextWindowView,
  type AgentModelView,
  type CompactionView,
  type ContextEditView,
  type ContextRole,
  effortFits,
  type HarnessContextView,
  type LastCompaction,
  type ModelChangeView,
  STALE_CONTEXT,
  type WindowChangeView,
} from "@chipschat/protocol";
import type { ClientEvent } from "../events.js";
import { FORK_SUFFIX } from "../forks.js";
import { ServerRefused } from "../transport.js";
import type { Book } from "./book.js";
import { demoId } from "./device.js";
import {
  AGENTS,
  ERRAND_MODELS,
  HARNESS,
  KEEPS_COPIES,
  MILO_INSTRUCTIONS,
  OSCAR_INSTRUCTIONS,
  YOU,
} from "./workspace.js";

/** Every agent's model's window, in tokens. */
const WINDOW = 272_000;
/** What a Compact now leaves: the summary it carries on from. */
const SUMMED_UP = 24_000;
/** The limits a person may pick for when an agent compacts itself, and Errand's own. */
const LIMITS = [50, 60, 70, 80, 90];
const LIMIT = 80;

/** One of an agent's files, as its harness keeps it. */
interface FileCopy {
  readonly name: string;
  readonly title: string;
  readonly role: ContextRole;
  readonly text: string;
  readonly hash: string;
}

/** What Errand keeps of one agent, and the last of each thing a person asked of it. */
interface Copies {
  model: string;
  effort: string;
  modelAt: string;
  change: ModelChangeView | undefined;
  files: FileCopy[];
  filesAt: string;
  used: number;
  usedAt: string;
  last: LastCompaction | undefined;
  limit: number | null;
  windowAt: string;
  compaction: CompactionView | undefined;
  limitChange: WindowChangeView | undefined;
}

/**
 * The harness's own hash of a file's text, which an edit names as what it was made from: FNV-1a,
 * as any harness might use, and the same for the same words every time.
 */
function hashOf(text: string): string {
  let hash = 0x81_1c_9d_c5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01_00_01_93) >>> 0;
  }
  return `fnv1a-${hash.toString(16).padStart(8, "0")}`;
}

function instructions(text: string): FileCopy {
  return { name: "INSTRUCTIONS.md", title: "Instructions", role: "instructions", text, hash: "" };
}

/** What Errand holds of its agents when the workspace opens: Milo's window well used. */
const SEEDS: Readonly<Record<string, { readonly text: string; readonly used: number }>> = {
  [AGENTS.milo.id]: { text: MILO_INSTRUCTIONS, used: 172_000 },
  [AGENTS.oscar.id]: { text: OSCAR_INSTRUCTIONS, used: 41_000 },
};

function seeded(text: string, used: number, at: string): Copies {
  const file = instructions(text);
  return {
    model: "heron-2-mini",
    effort: "steady",
    modelAt: at,
    change: undefined,
    files: [{ ...file, hash: hashOf(file.text) }],
    filesAt: at,
    used,
    usedAt: at,
    last: undefined,
    limit: LIMIT,
    windowAt: at,
    compaction: undefined,
    limitChange: undefined,
  };
}

const SYSTEM = { kind: "system", id: "system" } as const;
const BY_YOU = { kind: "person", id: YOU } as const;

/** A refusal in the server's shape: its status, and its code and words under `error`. */
export function refusal(
  status: number,
  code: string,
  message: string,
  more: Readonly<Record<string, unknown>> = {},
): ServerRefused {
  const error = { code, message, ...(code === "harness_away" ? { refusal: code } : {}) };
  return new ServerRefused(message, status, { error, ...more });
}

const refused = refusal;

/** What the server says when the harness has no socket to hear an ask (ADR 0134, ADR 0140). */
const away = (harness: string): ServerRefused =>
  refusal(409, "harness_away", `${harness} is away.`);

type Body = Readonly<Record<string, unknown>>;

export interface DemoAgents {
  /** A read about an agent, or `undefined` for a path that is none of these. */
  readonly read: (route: string) => unknown;
  /** A person's write about an agent, done at `ts`, or `undefined` for a path that is none. */
  readonly write: (route: string, body: Body, ts: string) => unknown;
}

export interface AgentsOptions {
  /** When the harnesses last sent their copies, before anything was asked of them. */
  readonly since: string;
  /** Whether a harness has no socket now, so it hears no ask. */
  readonly offline: (harnessId: string) => boolean;
}

export function keepAgents(book: Book, options: AgentsOptions): DemoAgents {
  const copies = new Map<string, Copies>(
    Object.entries(SEEDS).map(([id, seed]) => [id, seeded(seed.text, seed.used, options.since)]),
  );
  const edits = new Map<string, ContextEditView>();
  let changes = 0;
  let editsMade = 0;
  let agentsMade = Object.keys(AGENTS).length;

  /** An agent whose harness keeps copies, with them, or `undefined` for any other. */
  const kept = (agentId: string) => {
    const agent = book.agent(agentId);
    const held = copies.get(agentId);
    if (agent === undefined || held === undefined || !KEEPS_COPIES.has(agent.harness)) {
      return undefined;
    }
    return {
      agent,
      held,
      harness: book.nameOf(agent.harness),
      away: options.offline(agent.harness),
    };
  };

  /** The same, for an ask: an agent of this harness, which hears asks now. */
  const asked = (agentId: string) => {
    const found = kept(agentId);
    if (found === undefined) throw refused(404, "not_found", "No agent of that id here.");
    if (found.away) throw away(found.harness);
    return found;
  };

  const nextChange = () => demoId("change", ++changes);

  const model = (agentId: string): AgentModelView | undefined => {
    const found = kept(agentId);
    if (found === undefined) return undefined;
    const { agent, held } = found;
    return {
      agent_id: agentId as AgentModelView["agent_id"],
      harness_id: agent.harness as AgentModelView["harness_id"],
      model: held.model,
      effort: held.effort,
      own: true,
      choices: [...ERRAND_MODELS],
      editable: true,
      read_at: held.modelAt,
      away: found.away,
      ...(held.change === undefined ? {} : { change: held.change }),
    };
  };

  const context = (agentId: string): AgentContextView | undefined => {
    const found = kept(agentId);
    if (found === undefined) return undefined;
    return {
      agent_id: agentId as AgentContextView["agent_id"],
      harness_id: found.agent.harness as AgentContextView["harness_id"],
      files: found.held.files.map((file) => ({ ...file, editable: true })),
      not_shown: [],
      read_at: found.held.filesAt,
      away: found.away,
    };
  };

  const window = (agentId: string): AgentContextWindowView | undefined => {
    const found = kept(agentId);
    if (found === undefined) return undefined;
    const { held } = found;
    return {
      agent_id: agentId as AgentContextWindowView["agent_id"],
      harness_id: found.agent.harness as AgentContextWindowView["harness_id"],
      used: held.used,
      window: WINDOW,
      as_of: held.usedAt,
      ...(held.last === undefined ? {} : { last: held.last }),
      compacts: true,
      limit: { at: held.limit, choices: LIMITS, default: LIMIT, may_turn_off: true },
      editable: true,
      read_at: held.windowAt,
      away: found.away,
      ...(held.limitChange === undefined ? {} : { change: held.limitChange }),
      ...(held.compaction === undefined ? {} : { compaction: held.compaction }),
    };
  };

  /** A harness's own set (ADR 0134): Errand shares no file, so each agent's are its own. */
  const shared = (harnessId: string): HarnessContextView | undefined =>
    KEEPS_COPIES.has(harnessId)
      ? {
          harness_id: harnessId as HarnessContextView["harness_id"],
          shared: [],
          not_shown: [],
          read_at: options.since,
          away: options.offline(harnessId),
        }
      : undefined;

  const reads: readonly (readonly [RegExp, (id: string) => unknown])[] = [
    [/^\/v1\/agents\/([^/]+)\/model$/, model],
    [/^\/v1\/agents\/([^/]+)\/context$/, context],
    [/^\/v1\/agents\/([^/]+)\/context-window$/, window],
    [/^\/v1\/agents\/([^/]+)\/stays$/, (id) => ({ stays: book.staysOf(id) })],
    [/^\/v1\/harnesses\/([^/]+)\/context$/, shared],
    [/^\/v1\/context\/edits\/([^/]+)$/, (id) => edits.get(id)],
  ];

  /** A new model and effort (ADR 0140), saved by Errand as it is asked. */
  const changeModel = (agentId: string, body: Body, ts: string): ModelChangeView => {
    const { held, harness } = asked(agentId);
    // Every model of Errand's has its levels, and none is a default to follow: both, or nothing.
    const choice = body["model"];
    const effort = body["effort"];
    const fits =
      typeof choice === "string" &&
      typeof effort === "string" &&
      effortFits(ERRAND_MODELS, choice, effort);
    if (!fits)
      throw refused(422, "invalid_event", `${harness} doesn't offer that model and effort.`);
    const change: ModelChangeView = {
      change_id: nextChange(),
      state: "saved",
      model: choice,
      effort,
      asked_at: ts,
      answered_at: ts,
    };
    Object.assign(held, { model: choice, effort, modelAt: ts, change });
    return change;
  };

  /** A file's new words (ADR 0134), saved over the version the person read, or refused as stale. */
  const editFile = (agentId: string, body: Body, ts: string): ContextEditView => {
    const { held } = asked(agentId);
    const at = held.files.findIndex((file) => file.name === body["name"]);
    const file = held.files[at];
    if (file === undefined || typeof body["text"] !== "string") {
      throw refused(404, "not_found", "No file of that name here.");
    }
    if (body["base_hash"] !== file.hash) {
      const message = "The file changed since you read it.";
      throw refused(409, STALE_CONTEXT, message, { file });
    }
    const edit: ContextEditView = {
      edit_id: demoId("edit", ++editsMade),
      name: file.name,
      state: "saved",
      asked_at: ts,
      answered_at: ts,
    };
    held.files[at] = { ...file, text: body["text"], hash: hashOf(body["text"]) };
    held.filesAt = ts;
    edits.set(edit.edit_id, edit);
    return edit;
  };

  /**
   * Compact now (ADR 0146): Errand sums up the conversation, and the room the agent is in gets the
   * quiet line that says from how much to how much.
   */
  const compact = (agentId: string, _body: Body, ts: string): CompactionView => {
    const { agent, held } = asked(agentId);
    const from = held.used;
    const to = Math.min(from, SUMMED_UP);
    const compaction: CompactionView = {
      change_id: nextChange(),
      state: "done",
      asked_at: ts,
      answered_at: ts,
      done_at: ts,
    };
    Object.assign(held, {
      used: to,
      usedAt: ts,
      windowAt: ts,
      last: { at: ts, from, to, by: "asked" },
      compaction,
    });
    if (agent.room !== null) {
      book.record(
        {
          type: "context.compacted",
          space_id: agent.room,
          actor: { kind: "agent", id: agentId, harness_id: agent.harness },
          from,
          to,
          window: WINDOW,
          by: "asked",
        },
        ts,
      );
    }
    return compaction;
  };

  /** The limit it compacts itself at (ADR 0146), or only when asked. */
  const changeLimit = (agentId: string, body: Body, ts: string): WindowChangeView => {
    const { held, harness } = asked(agentId);
    const at = body["at"];
    if (at !== null && !(typeof at === "number" && LIMITS.includes(at))) {
      throw refused(422, "invalid_event", `${harness} doesn't offer that limit.`);
    }
    const change: WindowChangeView = {
      change_id: nextChange(),
      state: "saved",
      at,
      asked_at: ts,
      answered_at: ts,
    };
    Object.assign(held, { limit: at, windowAt: ts, limitChange: change });
    return change;
  };

  /** The room a body names, which the server knows. */
  const roomIn = (body: Body): string => {
    const spaceId = body["space_id"];
    if (typeof spaceId !== "string" || !book.rooms().includes(spaceId)) {
      throw refused(404, "not_found", "No space of that id here.");
    }
    return spaceId;
  };

  /**
   * A move (ADR 0087): out of the room it is in, which says where it went, and into this one, as
   * the server writes it.
   */
  const move = (agentId: string, body: Body, ts: string) => {
    const agent = book.agent(agentId);
    if (agent === undefined) throw refused(404, "not_found", "No agent of that id here.");
    const spaceId = roomIn(body);
    const from = agent.room;
    if (from === spaceId) return { agent_id: agentId, space_id: spaceId, from, moved: false };
    const head = book.events.length;
    const where = { reason: "moved", moved_to: spaceId };
    if (from !== null) {
      const out = book.record(
        {
          type: "membership.removed",
          space_id: from,
          actor: BY_YOU,
          idempotency_key: `move-out-${agentId}-${spaceId}-at-${head}`,
          participant_id: agentId,
          removed_by: YOU,
          ...where,
        },
        ts,
      );
      const freed = { agent_id: agentId, by: YOU, ...where };
      book.record(chipsSays(out, "agent.released", from, freed), ts);
    }
    const moved = from === null ? {} : { moved_from: from };
    const joined = book.record(
      {
        type: "membership.added",
        space_id: spaceId,
        actor: BY_YOU,
        idempotency_key: `move-in-${agentId}-${spaceId}-at-${head}`,
        participant_id: agentId,
        participant_kind: "agent",
        role: "member",
        ...moved,
      },
      ts,
    );
    const put = { agent_id: agentId, by: YOU, ...moved };
    book.record(chipsSays(joined, "agent.attached", spaceId, put), ts);
    return { agent_id: agentId, space_id: spaceId, from, moved: true };
  };

  /**
   * A fork (ADR 0087, Fork): the ask in the room the copy is for, and Errand's copy, registered
   * with what it was copied from and put in that room, remembering what the agent did.
   */
  const fork = (agentId: string, body: Body, ts: string) => {
    const agent = book.agent(agentId);
    const held = copies.get(agentId);
    if (agent === undefined || held === undefined || !KEEPS_COPIES.has(agent.harness)) {
      throw refused(422, "invalid_event", "Its harness doesn't make copies of its agents.");
    }
    const spaceId = roomIn(body);
    if (agent.room === null || agent.room === spaceId) {
      throw refused(422, "invalid_event", `${agent.name} is in this space already.`);
    }
    const harness = { kind: HARNESS, id: agent.harness };
    const ask = book.record(
      {
        type: "agent.fork",
        space_id: spaceId,
        actor: BY_YOU,
        idempotency_key: `fork-${agentId}-${spaceId}-at-${book.events.length}`,
        agent_id: agentId,
        by: YOU,
      },
      ts,
    );
    const copyId = demoId("agent", ++agentsMade);
    const name = copyName(book, agent.name, agent.harness);
    book.record(
      {
        type: "agent.registered",
        actor: harness,
        idempotency_key: `agent-${agent.harness}-${copyId}`,
        agent_id: copyId,
        harness_id: agent.harness,
        key: `copy-${agentsMade}`,
        name,
        lead: false,
        forked_from: agentId,
      },
      ts,
    );
    const joined = book.record(
      {
        type: "membership.added",
        space_id: spaceId,
        actor: harness,
        idempotency_key: `fork-in-${ask.id}`,
        participant_id: copyId,
        participant_kind: "agent",
        role: "member",
        fork_of: ask.id,
      },
      ts,
    );
    const put = { agent_id: copyId, by: agent.harness, fork_of: ask.id };
    book.record(chipsSays(joined, "agent.attached", spaceId, put), ts);
    // It remembers what Milo does, and runs as Milo runs; what was asked of Milo stays Milo's.
    copies.set(copyId, {
      ...structuredClone(held),
      change: undefined,
      compaction: undefined,
      limitChange: undefined,
    });
    return { agent_id: agentId, space_id: spaceId, fork_id: ask.id, ts, asked: true };
  };

  const writes: readonly (readonly [RegExp, (id: string, body: Body, ts: string) => unknown])[] = [
    [/^\/v1\/agents\/([^/]+)\/model\/changes$/, changeModel],
    [/^\/v1\/agents\/([^/]+)\/context\/edits$/, editFile],
    [/^\/v1\/agents\/([^/]+)\/context-window\/compactions$/, compact],
    [/^\/v1\/agents\/([^/]+)\/context-window\/changes$/, changeLimit],
    [/^\/v1\/agents\/([^/]+)\/move$/, move],
    [/^\/v1\/agents\/([^/]+)\/fork$/, fork],
  ];

  return {
    read: (route) => {
      for (const [pattern, answer] of reads) {
        const id = pattern.exec(route)?.[1];
        if (id !== undefined) return answer(decodeURIComponent(id));
      }
      return undefined;
    },
    write: (route, body, ts) => {
      for (const [pattern, answer] of writes) {
        const id = pattern.exec(route)?.[1];
        if (id !== undefined) return answer(decodeURIComponent(id), body, ts);
      }
      return undefined;
    },
  };
}

/** What Chips writes beside a membership it logged: the agent put in a room, or taken out. */
function chipsSays(
  after: ClientEvent,
  type: string,
  spaceId: string,
  payload: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const key = type === "agent.released" ? "released" : "attached";
  return {
    type,
    space_id: spaceId,
    actor: SYSTEM,
    idempotency_key: `${key}-${after.id}`,
    ...payload,
  };
}

/**
 * What Errand calls a copy: the agent's name and ` · fork`, numbered after the first, as a harness
 * numbers its copies so the two are told apart (core's `forkRoomTitle` names the copy's room so).
 */
function copyName(book: Book, name: string, harness: string): string {
  const taken = new Set(
    book
      .agents()
      .filter((each) => each.harness === harness)
      .map((each) => each.name.toLowerCase()),
  );
  for (let n = 1; ; n += 1) {
    const called = `${name}${FORK_SUFFIX}${n === 1 ? "" : ` ${n}`}`;
    if (!taken.has(called.toLowerCase())) return called;
  }
}
