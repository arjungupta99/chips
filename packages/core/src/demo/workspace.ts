/**
 * The made-up workspace the demo plays (ADR 0213), as a server would hand it to the demo's
 * device: You, Rosa, three harnesses and their agents, four rooms, and what was said in them
 * before the film starts. Rosa is in Birthday dinner, so the film shows people and agents in one
 * room. The harnesses are invented, since Chips names no real one in what it ships (ADR
 * 0051), and the agents take first names from the list new agents get (ADR 0150).
 *
 * An agent is in one room at a time (ADR 0087), so each room has agents of its own: Milo and Theo
 * share Birthday dinner, and Garden website and Tax receipts have a Studio agent and an Errand
 * agent of their own. Which also lets the Agents tab show a harness bringing more than one agent.
 */

import {
  type AgentState,
  HARNESS_CAPABILITIES,
  type ModelChoice,
  type SpaceIcon,
} from "@chipschat/protocol";
import { DEMO_PERSON_ID, demoId } from "./device.js";
import { INVITE_CARD } from "./picture.js";

export const YOU = DEMO_PERSON_ID;

/** The demo's people: You, who owns the workspace, and Rosa, whom You invited. */
export const PEOPLE = {
  you: { id: YOU, name: "You" },
  rosa: { id: demoId("person", 2), name: "Rosa" },
} as const;

export type PersonKey = keyof typeof PEOPLE;

/**
 * What a harness is on the wire: the harnesses' ids, their rows in the directory, and the actor of
 * what a harness says as itself (a copy of an agent it registers, and that copy joining a room).
 */
export const HARNESS = "harness";

export const ERRAND = demoId(HARNESS, 1);
export const STUDIO = demoId(HARNESS, 2);
export const HERALD = demoId(HARNESS, 3);

/**
 * What each harness declares beyond its agents (ADR 0046). Errand keeps its agents' models, context
 * files and context windows, and makes copies of them, so an Errand agent's page has all of that to
 * show (ADR 0140, ADR 0134, ADR 0146, ADR 0087's Fork). Studio and Herald declare agents only.
 */
const ERRAND_TAKES = [
  HARNESS_CAPABILITIES.agents,
  HARNESS_CAPABILITIES.models,
  HARNESS_CAPABILITIES.contextFiles,
  HARNESS_CAPABILITIES.contextWindows,
  HARNESS_CAPABILITIES.forks,
];

export const HARNESSES = [
  { id: ERRAND, name: "Errand", capabilities: ERRAND_TAKES },
  { id: STUDIO, name: "Studio", capabilities: [HARNESS_CAPABILITIES.agents] },
  { id: HERALD, name: "Herald", capabilities: [HARNESS_CAPABILITIES.agents] },
] as const;

/** The harness that keeps copies of its agents' models, files and windows: Errand alone. */
export const KEEPS_COPIES: ReadonlySet<string> = new Set([ERRAND]);

const LEVELS = [
  { id: "light", label: "Light" },
  { id: "steady", label: "Steady" },
  { id: "deep", label: "Deep" },
];

/** The models Errand's agents may run on, each with its effort levels, lowest first (ADR 0140). */
export const ERRAND_MODELS: readonly ModelChoice[] = [
  { id: "heron-2-mini", label: "Heron 2 Mini", efforts: LEVELS, effort_default: "steady" },
  { id: "heron-2", label: "Heron 2", efforts: LEVELS, effort_default: "steady" },
  { id: "kestrel-1", label: "Kestrel 1", efforts: LEVELS, effort_default: "steady" },
];

/** Milo's instructions as Errand keeps them, until the second film adds a line (ADR 0134). */
export const MILO_INSTRUCTIONS = [
  "# Milo",
  "",
  "You help the family with errands:",
  "bookings, lists and plans.",
  "",
  "- Be warm and brief.",
  "- Ask before paying for anything.",
  "- Keep Rosa in the loop on family plans.",
  "",
].join("\n");

/** Oscar's, which no film changes. */
export const OSCAR_INSTRUCTIONS = [
  "# Oscar",
  "",
  "You keep the family's receipts:",
  "sorted by month, in one folder.",
  "",
  "- Be brief.",
  "",
].join("\n");

export const BIRTHDAY = demoId("space", 1);
export const GARDEN = demoId("space", 2);
export const BRIEF = demoId("space", 3);
export const RECEIPTS = demoId("space", 4);

/** The demo's agents, by the name the script calls them: the harness each speaks for, and its room. */
export const AGENTS = {
  milo: { id: demoId("agent", 1), name: "Milo", harness: ERRAND, room: BIRTHDAY },
  theo: { id: demoId("agent", 2), name: "Theo", harness: STUDIO, room: BIRTHDAY },
  hugo: { id: demoId("agent", 3), name: "Hugo", harness: HERALD, room: BRIEF },
  felix: { id: demoId("agent", 4), name: "Felix", harness: STUDIO, room: GARDEN },
  oscar: { id: demoId("agent", 5), name: "Oscar", harness: ERRAND, room: RECEIPTS },
} as const;

export type AgentKey = keyof typeof AGENTS;

interface Room {
  readonly id: string;
  readonly title: string;
  /** The face You chose for it, which the Spaces list draws (`/v1/me/space-icons`). */
  readonly face: SpaceIcon;
}

export const ROOMS: readonly Room[] = [
  { id: BIRTHDAY, title: "Birthday dinner", face: { icon: "", ground: 0, letters: "🎂" } },
  { id: GARDEN, title: "Garden website", face: { icon: "", ground: 10, letters: "🌿" } },
  { id: BRIEF, title: "Morning brief", face: { icon: "", ground: 9, letters: "☀️" } },
  { id: RECEIPTS, title: "Tax receipts", face: { icon: "", ground: 4, letters: "🧾" } },
];

/** The invite card, as a message carries it once Theo has posted it (`attachments`). */
export const CARD = {
  attachment_id: demoId("attachment", 1),
  filename: INVITE_CARD.filename,
  mime_type: INVITE_CARD.mimeType,
  byte_size: INVITE_CARD.byteSize,
  sha256: INVITE_CARD.sha256,
  width: INVITE_CARD.width,
  height: INVITE_CARD.height,
} as const;

/**
 * An event as the script writes it: who says it, where, and what. The demo's server stamps it the
 * way a server does (`seq`, its id, the clock, the actor) and writes what a server writes into it:
 * who a message is for and whom it mentions, who may answer an ask.
 */
export interface Draft {
  readonly type: string;
  /** One of the demo's agents or people, or Chips itself. */
  readonly by: AgentKey | PersonKey | "chips";
  readonly space?: string | undefined;
  readonly run?: string | undefined;
  readonly payload?: Readonly<Record<string, unknown>> | undefined;
}

/** A draft said before the film starts, `ago` milliseconds before it. */
export interface Before {
  readonly ago: number;
  readonly draft: Draft;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A room opened by You, with the others in it added, at one moment. */
function opened(room: Room, others: readonly (AgentKey | "rosa")[], ago: number): Before[] {
  return [
    {
      ago,
      draft: { type: "space.created", by: "you", space: room.id, payload: roomOpening(room) },
    },
    ...others.map((key) => ({ ago, draft: added(room, key) })),
  ];
}

function added(room: Room, key: AgentKey | "rosa"): Draft {
  const person = key === "rosa";
  return {
    type: "membership.added",
    by: "you",
    space: room.id,
    payload: {
      participant_id: person ? PEOPLE.rosa.id : AGENTS[key].id,
      participant_kind: person ? "person" : "agent",
      role: "member",
    },
  };
}

/** Somebody joining the workspace, as Chips records it. */
function joined(key: PersonKey, role: string, ago: number, extra = {}): Before {
  const { id, name } = PEOPLE[key];
  return {
    ago,
    draft: {
      type: "person.joined",
      by: "chips",
      payload: { participant_id: id, display_name: name, role, ...extra },
    },
  };
}

function roomOpening(room: Room): Readonly<Record<string, unknown>> {
  return { kind: "group", title: room.title };
}

/** Words said in a room, `ago` before the film. */
function said(
  by: AgentKey | PersonKey,
  space: string,
  text: string,
  ago: number,
  extra: Readonly<Record<string, unknown>> = {},
): Before {
  return { ago, draft: { type: "message.post", by, space, payload: { text, ...extra } } };
}

const [birthday, garden, brief, receipts] = ROOMS as readonly [Room, Room, Room, Room];

/**
 * What the workspace holds when the film starts, oldest first. "Mum turns 60" was sent to Milo
 * alone, so the ask after it goes to Milo too, as a person's next message goes where their last
 * one did (ADR 0081), and Theo waits to be asked. No date anywhere: what is said is relative to
 * the moment the film starts.
 */
export const HISTORY: readonly Before[] = [
  joined("you", "owner", 3 * DAY),
  joined("rosa", "member", 2 * DAY, { invited_by: YOU }),
  ...opened(receipts, ["oscar"], 2 * DAY),
  ...opened(brief, ["hugo"], 2 * DAY),
  ...opened(garden, ["felix"], DAY),
  said("oscar", RECEIPTS, "All 14 receipts are in the folder, sorted by month.", 26 * HOUR),
  said("you", RECEIPTS, "Thanks, that's all of them.", 25 * HOUR),
  // Oscar had nothing to add (ADR 0105), so the thanks waits on nobody.
  { ago: 25 * HOUR - MINUTE, draft: { type: "turn.passed", by: "oscar", space: RECEIPTS } },
  said("hugo", BRIEF, "Rain after 3. Your 10:00 moved to 10:30.", 2 * HOUR, { heartbeat: true }),
  ...opened(birthday, ["rosa", "milo", "theo"], 20 * MINUTE),
  said("you", BIRTHDAY, "Mum turns 60 on Saturday!", 12 * MINUTE, { to: [AGENTS.milo.id] }),
  // To Milo, who answers it: a message no agent answered would show its wait (ADR 0083).
  said("rosa", BIRTHDAY, "She'd love Italian. Count me in for helping.", 11 * MINUTE, {
    to: [AGENTS.milo.id],
  }),
  said(
    "milo",
    BIRTHDAY,
    "Happy early birthday to her! Say the word and I'll look for somewhere to eat.",
    10 * MINUTE,
  ),
  said("you", GARDEN, "Can the gallery page show the spring photos first?", 4 * MINUTE),
  said("felix", GARDEN, "Yes. I'll rebuild it now.", 3 * MINUTE),
];

/** When a harness was last heard from, and since when it has been connected. */
interface Seen {
  readonly now: string;
  readonly since: string;
}

/**
 * An agent as the server's directory says it, from the log (ADR 0087): where it is now, so a move
 * or a fork shows on every list that reads the directory again.
 */
export interface AgentFacts {
  readonly id: string;
  readonly name: string;
  readonly harness: string;
  /** The room it is in, or `null` while it is free. */
  readonly room: string | null;
  /** The room it was last taken out of. */
  readonly lastRoom?: string | undefined;
  /** For a fork's copy: the agent it is a copy of. */
  readonly forkedFrom?: string | undefined;
}

/** The demo's own agents, where the workspace puts them; the log moves them from there. */
export function startingAgents(): AgentFacts[] {
  return Object.values(AGENTS).map(({ id, name, harness }) => ({ id, name, harness, room: null }));
}

/**
 * The directory, as `GET /v1/participants` answers it. Every harness has connected, so no room
 * says an agent never has, and the store has no reason to read the directory again
 * (`neverConnected`). A harness is connected unless the film took it offline (`offline`, by
 * harness, since when), and its agents share its state (ADR 0083). Each agent is where the log
 * says it is. What a harness declares is in `HARNESSES`: what no harness here offers (a new room
 * from the +, a restart, a heartbeat) needs a server.
 */
export function directoryRows(
  seen: Seen,
  agents: readonly AgentFacts[],
  offline: ReadonlyMap<string, string>,
): readonly Record<string, unknown>[] {
  const stateOf = (harness: string): AgentState => {
    const gone = offline.get(harness);
    return gone === undefined
      ? { connected: true, since: seen.since }
      : { connected: false, since: gone };
  };
  return [
    { id: YOU, kind: "person", display_name: PEOPLE.you.name, owner_id: null, role: "owner" },
    {
      id: PEOPLE.rosa.id,
      kind: "person",
      display_name: PEOPLE.rosa.name,
      owner_id: null,
      role: "member",
    },
    ...HARNESSES.map((harness) => ({
      id: harness.id,
      kind: HARNESS,
      display_name: harness.name,
      owner_id: YOU,
      capabilities: harness.capabilities,
      last_seen_at: offline.get(harness.id) ?? seen.now,
      state: stateOf(harness.id),
    })),
    ...agents.map((agent) => ({
      id: agent.id,
      kind: "agent",
      display_name: agent.name,
      owner_id: YOU,
      harness_id: agent.harness,
      room: agent.room,
      ...(agent.lastRoom === undefined ? {} : { last_space_id: agent.lastRoom }),
      ...(agent.forkedFrom === undefined ? {} : { forked_from: agent.forkedFrom }),
      agent_state: "active",
      state: stateOf(agent.harness),
    })),
  ];
}

/** The faces You chose for the rooms, as `GET /v1/me/space-icons` answers them. */
export function roomFaces(): Readonly<Record<string, SpaceIcon>> {
  return Object.fromEntries(ROOMS.map((room) => [room.id, room.face]));
}
