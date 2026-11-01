/**
 * A harness's agents (ADR 0087): found by the harness's own key, made when first needed, renamed
 * when the harness names them anew. Every door that puts a harness's agent somewhere goes through
 * here — the harness's own registration, a room opened or claimed by key, a harness added to a
 * room, and the upgrade — so an agent is made one way.
 *
 * An agent is the log's: `agent.registered` makes it, and `agent.updated` renames it or says it
 * was archived or came back in its harness. Two doors asking for the same key at once race to one
 * idempotency key, and the second is handed the first's agent. A change is keyed by the log's head
 * as it was read, so the same change twice at once is one event, and a name or state that comes
 * back later is a new one.
 *
 * No two agents share a name (ADR 0091). Every door here gives an agent a name nobody else in the
 * workspace answers to, numbering it ("OpenClaw 2") when the name it asked for is taken, and keeps
 * the name it has when it is asked for again under that name or the one its number is of. A name a
 * person gave it holds: its harness asking for another changes nothing.
 */

import { createHash } from "node:crypto";
import {
  clashKey,
  freeAgentName,
  HARNESS_CAPABILITIES,
  isFormOf,
  withoutHidden,
} from "@chipschat/protocol";
import {
  type AgentView,
  AppendRefused,
  type Clock,
  type EventStore,
  type HeldName,
  type IdGenerator,
  type MemberView,
  type ParticipantView,
  type ReadModels,
} from "./ports/index.js";

export interface AgentDeps {
  readonly store: EventStore;
  readonly readModels: Pick<
    ReadModels,
    "agentByKey" | "participantsIn" | "participant" | "heldNames"
  >;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface AgentWanted {
  readonly workspaceId: string;
  readonly harnessId: string;
  /** The harness's own name for it: for Jacobian, a Space's id. */
  readonly key: string;
  readonly name: string;
  readonly lead?: boolean | undefined;
  /** Whether the thing it is was archived in the harness, or is in use: unsaid, it stays as it is. */
  readonly state?: AgentView["state"] | undefined;
  /**
   * The agent this one is a copy of (ADR 0087, Fork). Said when it is made; a copy is a copy for
   * good, so registering its key again does not change it.
   */
  readonly forkedFrom?: string | undefined;
  /** Who asks: the harness itself, or Chips (`system`) for the upgrade and the doors it keeps. */
  readonly actor: { readonly kind: "harness" | "system"; readonly id: string };
  /**
   * The room whose held first name this is (ADR 0150), so the hold is not counted against the
   * agent it was held for.
   */
  readonly heldIn?: string | undefined;
}

export interface AgentFound {
  readonly agent: AgentView;
  /** True when this call made it. */
  readonly created: boolean;
  /** True when this call gave it a new name. */
  readonly renamed: boolean;
}

/** Who says an agent changed: its harness, Chips, or a person naming it (ADR 0091). */
type Asker = AgentWanted["actor"] | { readonly kind: "person"; readonly id: string };

/** The longest key and name an agent carries, as `agent.registered` says. */
export const MAX_AGENT_KEY = 400;
export const MAX_AGENT_NAME = 120;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/**
 * A name that fits: with what nobody sees taken out (SEC-33), trimmed, and cut to the longest a
 * participant is called.
 */
export function agentName(name: string): string {
  return withoutHidden(name).trim().slice(0, MAX_AGENT_NAME).trim() || "Agent";
}

/**
 * Whether a participant's name is one nobody else may take (ADR 0091): a person's, less a removed
 * one, and an active agent's. A harness's own row shares its default agent's name, and an archived
 * agent gives its name up.
 */
export function holdsItsName(each: ParticipantView): boolean {
  if (each.removed_at !== null) return false;
  if (each.kind === "person") return true;
  return each.kind === "agent" && each.state !== "archived";
}

/**
 * Who answers to this name here already, but the one named and anybody who does not count. For a
 * person's own name a harness counts too: a person called Scout would take the @ that reaches
 * Scout's agent where it is the harness's one there (ADR 0087's addendum).
 */
export function nameHolder(
  everyone: readonly ParticipantView[],
  exceptId: string,
  name: string,
  options: { readonly harnesses?: boolean } = {},
): ParticipantView | undefined {
  const key = clashKey(name);
  const counts = (each: ParticipantView) =>
    holdsItsName(each) ||
    (options.harnesses === true && each.kind === "harness" && each.removed_at === null);
  return everyone.find(
    (each) => each.id !== exceptId && counts(each) && clashKey(each.display_name) === key,
  );
}

/** The names, as clash keys, nobody but `exceptId` may be given among these participants. */
export function clashKeysTaken(
  everyone: readonly ParticipantView[],
  exceptId?: string,
): Set<string> {
  return new Set(
    everyone
      .filter((each) => each.id !== exceptId && holdsItsName(each))
      .map((each) => clashKey(each.display_name)),
  );
}

/**
 * The names, as clash keys, nobody but `exceptId` may be given here now: everybody's who counts,
 * and the first names open rooms hold for harnesses' agents-to-be (ADR 0150), but the one `heldIn`
 * holds for `harnessId`, which is this agent's own.
 */
export async function takenNames(
  deps: Pick<AgentDeps, "readModels">,
  workspaceId: string,
  exceptId?: string,
  hold?: { readonly spaceId: string; readonly harnessId: string },
): Promise<Set<string>> {
  const taken = clashKeysTaken(await deps.readModels.participantsIn(workspaceId), exceptId);
  for (const held of await deps.readModels.heldNames(workspaceId)) {
    if (held.space_id === hold?.spaceId && held.harness_id === hold.harnessId) continue;
    taken.add(clashKey(held.name));
  }
  return taken;
}

/** The first name a room holds for a harness's agent-to-be (ADR 0150), if it holds one. */
export async function heldNameIn(
  deps: Pick<AgentDeps, "readModels">,
  workspaceId: string,
  spaceId: string,
  harnessId: string,
): Promise<HeldName | undefined> {
  const held = await deps.readModels.heldNames(workspaceId);
  return held.find((each) => each.space_id === spaceId && each.harness_id === harnessId);
}

/**
 * The harness's agent for this key: found, renamed when the name has changed, or made. A key is
 * the harness's own, so two harnesses' keys never meet. A new or returning agent whose name is
 * taken is numbered; one asked for again under its name, numbered or not, keeps it; one a person
 * named keeps that name whatever its harness asks for, and is numbered only if it comes back from
 * an archive to find the name taken. One asked for as Main is the harness's Main from here.
 */
export async function registerAgent(deps: AgentDeps, wanted: AgentWanted): Promise<AgentFound> {
  const known = await deps.readModels.agentByKey(wanted.workspaceId, wanted.harnessId, wanted.key);
  const found =
    known === undefined ? await makeAgent(deps, wanted) : await changeAgent(deps, wanted, known);
  return wanted.lead === true ? leads(deps, wanted, found) : found;
}

/**
 * The agent asked for as Main is its harness's Main from here, and no other of its agents is: a
 * harness has one at most (ADR 0087, rule 7). The door refuses a second unless it is the default
 * agent, which takes Main from the one a bridge made before it knew to use it (ADR 0183).
 */
async function leads(deps: AgentDeps, wanted: AgentWanted, found: AgentFound): Promise<AgentFound> {
  const { workspaceId, harnessId } = wanted;
  const { agent } = found;
  if (!agent.lead)
    await updateAgent(deps, workspaceId, agent.agent_id, wanted.actor, { lead: true });
  const others = (await deps.readModels.participantsIn(workspaceId)).filter(
    (each) =>
      each.kind === "agent" &&
      each.harness_id === harnessId &&
      each.id !== agent.agent_id &&
      each.lead === true &&
      each.removed_at === null,
  );
  for (const other of others) {
    await updateAgent(deps, workspaceId, other.id, wanted.actor, { lead: false });
  }
  return agent.lead ? found : { ...found, agent: { ...agent, lead: true } };
}

/** A known agent asked for again: renamed, numbered, archived or back, or left as it is. */
async function changeAgent(
  deps: AgentDeps,
  wanted: AgentWanted,
  known: AgentView,
): Promise<AgentFound> {
  const unchanged = { agent: known, created: false, renamed: false };
  const state = wanted.state ?? known.state;
  const base = known.name_by === null ? agentName(wanted.name) : known.name;
  const keeps = isFormOf(known.name, base);
  // An active agent's name is nobody else's while it is active, so only one coming back looks.
  const waking = known.state === "archived" && state === "active";
  if (keeps && !waking && state === known.state) return unchanged;
  let name = keeps ? known.name : base;
  if (state === "active") {
    const taken = await takenNames(deps, wanted.workspaceId, known.agent_id, holdOf(wanted));
    name = freeAgentName(base, taken, known.name);
  }
  const renamed = name !== known.name;
  if (!renamed && state === known.state) return unchanged;
  await updateAgent(deps, wanted.workspaceId, known.agent_id, wanted.actor, {
    ...(renamed ? { name } : {}),
    ...(state === known.state ? {} : { state }),
  });
  return { agent: { ...known, name, state }, created: false, renamed };
}

/** Why a key whose agent a person deleted makes nothing (ADR 0095, point 5). */
export const AGENT_DELETED = { kind: "agent_deleted", message: "that agent was deleted" } as const;

/**
 * A new agent for the key, under a name nobody else here has.
 *
 * A deleted agent's key is retired from the agents' rows (ADR 0095), so it is not found by key;
 * its registration is, by its idempotency key, and comes back as a duplicate naming the deleted
 * agent. Its harness asking again is refused: deleted stays deleted. The one Chips made for the
 * harness itself, keyed by the harness's own id, is made afresh, keyed after the one deleted.
 */
async function makeAgent(deps: AgentDeps, wanted: AgentWanted): Promise<AgentFound> {
  const { workspaceId, harnessId, key } = wanted;
  const asked = agentName(wanted.name);
  const name =
    wanted.state === "archived"
      ? asked
      : freeAgentName(asked, await takenNames(deps, workspaceId, undefined, holdOf(wanted)));
  let idempotencyKey = `agent-${harnessId}-${digest(key)}`;
  for (;;) {
    const appended = await deps.store.append({
      v: 1,
      type: "agent.registered",
      id: deps.ids.next("event"),
      ts: deps.clock.nowIso(),
      workspace_id: workspaceId,
      actor: wanted.actor,
      idempotency_key: idempotencyKey,
      agent_id: deps.ids.next("agent"),
      harness_id: harnessId,
      key,
      name,
      lead: wanted.lead === true,
      ...(wanted.forkedFrom === undefined ? {} : { forked_from: wanted.forkedFrom }),
    });
    const before = String(appended.event.payload["agent_id"]);
    if (!appended.duplicate || !(await isDeleted(deps, workspaceId, before))) {
      return madeOf(deps, wanted, appended);
    }
    if (key !== harnessId) throw new AppendRefused(AGENT_DELETED);
    idempotencyKey = `agent-${harnessId}-${digest(key)}-after-${before}`;
  }
}

/** The hold an agent is registered under (ADR 0150), as `takenNames` leaves it out. */
function holdOf(wanted: AgentWanted): { spaceId: string; harnessId: string } | undefined {
  return wanted.heldIn === undefined
    ? undefined
    : { spaceId: wanted.heldIn, harnessId: wanted.harnessId };
}

async function isDeleted(deps: AgentDeps, workspaceId: string, agentId: string): Promise<boolean> {
  const agent = await deps.readModels.participant(workspaceId, agentId);
  return agent !== undefined && agent.removed_at !== null;
}

/** The agent an `agent.registered` made or found, archived from the start when it was put away. */
async function madeOf(
  deps: AgentDeps,
  wanted: AgentWanted,
  appended: Awaited<ReturnType<EventStore["append"]>>,
): Promise<AgentFound> {
  const { workspaceId, harnessId, key } = wanted;
  const payload = appended.event.payload;
  const agent: AgentView = {
    agent_id: String(payload["agent_id"]),
    harness_id: harnessId,
    key,
    name: String(payload["name"]),
    lead: payload["lead"] === true,
    state: "active",
    spaces: [],
    room: null,
    released_from: null,
    held: 0,
    forked_from: typeof payload["forked_from"] === "string" ? payload["forked_from"] : null,
    name_by: null,
  };
  // Made for a thing the harness has put away already: archived from the start.
  if (wanted.state !== "archived") return { agent, created: !appended.duplicate, renamed: false };
  await updateAgent(deps, workspaceId, agent.agent_id, wanted.actor, { state: "archived" });
  return { agent: { ...agent, state: "archived" }, created: !appended.duplicate, renamed: false };
}

/**
 * A new name, state or Main for an agent: `agent.updated`, keyed by the change and the log's
 * head.
 */
export async function updateAgent(
  deps: Pick<AgentDeps, "store" | "clock" | "ids">,
  workspaceId: string,
  agentId: string,
  actor: Asker,
  change: {
    readonly name?: string;
    readonly state?: AgentView["state"];
    readonly lead?: boolean;
  },
): Promise<void> {
  const head = await deps.store.head(workspaceId);
  await deps.store.append({
    v: 1,
    type: "agent.updated",
    id: deps.ids.next("event"),
    ts: deps.clock.nowIso(),
    workspace_id: workspaceId,
    actor,
    idempotency_key: `agent-${agentId}-${digest(JSON.stringify(change))}-at-${head}`,
    agent_id: agentId,
    ...change,
  });
}

/**
 * The agent a harness has for any room with no key of its own (ADR 0087's addendum, point 5):
 * keyed by the harness's own id, and named after it. The harness names it by that id, as its own
 * key for no other agent can be: registered so, as its Main, it is (ADR 0183).
 */
export function defaultAgentOf(
  deps: AgentDeps,
  workspaceId: string,
  harness: { readonly id: string; readonly display_name: string },
): Promise<AgentFound> {
  return registerAgent(deps, {
    workspaceId,
    harnessId: harness.id,
    key: harness.id,
    name: harness.display_name,
    actor: { kind: "system", id: "system" },
  });
}

/** Whether a key a harness gives is one it may: not a harness's id, which is the default's. */
export function mayBeKey(key: string): boolean {
  return key.trim() !== "" && key.length <= MAX_AGENT_KEY && !key.startsWith("hrn_");
}

/**
 * The agent a harness has in a room it opened or claimed by key. A key is an agent of its own for
 * every harness (ADR 0087's addendum of 30 September, point 2), so a harness that cannot make
 * agents still has one for each room it is asked for, and one room each. A harness that follows its
 * rooms keys each by the thing it keeps for it, a Space for Jacobian, named by the room; any other
 * harness's key's agent is named after the harness, and keeps a name its harness gave it since. A
 * room with no key holds the harness's default agent.
 */
export async function agentForRoom(
  deps: AgentDeps,
  workspaceId: string,
  harness: {
    readonly id: string;
    readonly display_name: string;
    readonly capabilities: readonly string[] | null;
  },
  room: {
    readonly key?: string | undefined;
    readonly title?: string | null | undefined;
    /** The first name the room holds for this harness's agent (ADR 0150), and which room. */
    readonly held?: { readonly name: string; readonly spaceId: string } | undefined;
  },
): Promise<AgentFound> {
  if (room.key === undefined) return defaultAgentOf(deps, workspaceId, harness);
  const follows = harness.capabilities?.includes(HARNESS_CAPABILITIES.followsRooms) === true;
  if (!follows) {
    const known = await deps.readModels.agentByKey(workspaceId, harness.id, room.key);
    if (known !== undefined) return { agent: known, created: false, renamed: false };
  }
  const named = follows ? (room.title ?? harness.display_name) : harness.display_name;
  return registerAgent(deps, {
    workspaceId,
    harnessId: harness.id,
    key: room.key,
    name: room.held?.name ?? named,
    actor: { kind: "system", id: "system" },
    heldIn: room.held?.spaceId,
  });
}

/**
 * The agent a room held a first name for takes it (ADR 0150), as named by the person who made the
 * room, so its harness asking for another later changes nothing (ADR 0091, decision 4). One a
 * person named already keeps that name; a name somebody took meanwhile is numbered.
 */
export async function nameAsHeld(
  deps: AgentDeps,
  workspaceId: string,
  spaceId: string,
  agent: AgentView,
  held: { readonly name: string; readonly by: string },
): Promise<AgentView> {
  if (agent.name_by !== null) return agent;
  const taken = await takenNames(deps, workspaceId, agent.agent_id, {
    spaceId,
    harnessId: agent.harness_id,
  });
  const name = freeAgentName(agentName(held.name), taken, agent.name);
  await updateAgent(deps, workspaceId, agent.agent_id, { kind: "person", id: held.by }, { name });
  return { ...agent, name, name_by: held.by };
}

/**
 * An agent in its harness's place in a room: `membership.replaced`, once. What the harness said
 * there reads as the agent's from then on (ADR 0087, point 9).
 */
export async function replaceInRoom(
  deps: Pick<AgentDeps, "store" | "clock" | "ids">,
  place: {
    readonly workspaceId: string;
    readonly spaceId: string;
    readonly from: string;
    readonly to: string;
    /** Who asked, when a harness did; Chips otherwise. */
    readonly actor?: Asker | undefined;
    /** Once for this, rather than once for the room and `from`: a place may change hands again. */
    readonly once?: string | undefined;
  },
): Promise<void> {
  await deps.store.append({
    v: 1,
    type: "membership.replaced",
    id: deps.ids.next("event"),
    ts: deps.clock.nowIso(),
    workspace_id: place.workspaceId,
    space_id: place.spaceId,
    actor: place.actor ?? { kind: "system", id: "system" },
    idempotency_key: place.once ?? `replace-${place.spaceId}-${place.from}`,
    from: place.from,
    to: place.to,
  });
}

export interface AttachDeps extends Pick<AgentDeps, "store" | "clock" | "ids"> {
  readonly readModels: Pick<ReadModels, "participant" | "space" | "membersOf" | "agentRoom">;
}

/** Why a harness may not put an agent where it asked. */
export interface AttachRefusal {
  readonly kind:
    | "unknown_agent"
    | "not_its_own"
    | "unknown_space"
    | "not_there"
    | "there_already"
    /** The agent is in another room, and an agent is in one at a time (ADR 0087, rule 1). */
    | "elsewhere";
  readonly message: string;
}

export type AttachResult =
  | { readonly ok: true; readonly attached: boolean }
  | { readonly ok: false; readonly error: AttachRefusal };

function refused(kind: AttachRefusal["kind"], message: string): AttachResult {
  return { ok: false, error: { kind, message } };
}

/** Why the one an agent would replace is not the harness's to replace: none, when it is. */
async function placeOf(
  deps: AttachDeps,
  workspaceId: string,
  harnessId: string,
  replacing: string,
): Promise<AttachResult | undefined> {
  if (replacing === harnessId) return undefined;
  const held = await deps.readModels.participant(workspaceId, replacing);
  if (held?.kind !== "agent") return refused("unknown_agent", "No agent of that id here.");
  if (held.harness_id === harnessId) return undefined;
  return refused("not_its_own", "An agent takes the place of its harness's own, and no other's.");
}

/** Whether a member is the harness, or one of its agents. */
function isOf(harnessId: string, member: MemberView): boolean {
  return member.participant_id === harnessId || member.harness_id === harnessId;
}

/**
 * One of a harness's agents in a room in the place of another of its own there, or of the harness
 * itself (ADR 0087, Phase 3): `membership.replaced`, as the upgrade and a claim append it. What the
 * one replaced said there reads as the agent's. Asked again once done, it answers that nothing
 * changed; an agent or room not the harness's own is refused.
 */
export async function attachAgent(
  deps: AttachDeps,
  wanted: {
    readonly workspaceId: string;
    readonly harnessId: string;
    readonly agentId: string;
    readonly spaceId: string;
    readonly replacing: string;
  },
): Promise<AttachResult> {
  const { workspaceId, harnessId, agentId, spaceId, replacing } = wanted;
  const agent = await deps.readModels.participant(workspaceId, agentId);
  if (agent?.kind !== "agent") return refused("unknown_agent", "No agent of that id here.");
  if (agent.harness_id !== harnessId) {
    return refused("not_its_own", "A harness attaches its own agents, and no other's.");
  }
  const whose = await placeOf(deps, workspaceId, harnessId, replacing);
  if (whose !== undefined) return whose;
  const room = await deps.readModels.space(workspaceId, spaceId);
  // A thread's members are its room's, so an agent is attached to the room.
  if (room === undefined || room.parent_space_id !== null) {
    return refused("unknown_space", "No space of that id here.");
  }
  const members = await deps.readModels.membersOf(workspaceId, spaceId);
  const ours = members.filter((member) => isOf(harnessId, member));
  const has = (id: string) => ours.some((member) => member.participant_id === id);
  if (replacing === agentId || (has(agentId) && !has(replacing))) {
    return { ok: true, attached: false };
  }
  if (!has(replacing)) {
    return refused(
      "not_there",
      "Name what the agent takes the place of: this harness, or one of its agents in the space.",
    );
  }
  if (has(agentId)) {
    return refused("there_already", `${agent.display_name} is in this space already.`);
  }
  const where = await deps.readModels.agentRoom(workspaceId, agentId);
  if (where !== undefined && where !== room.space_id) {
    return refused(
      "elsewhere",
      `${agent.display_name} is in another space (${where}), and an agent is in one space at a time.`,
    );
  }
  const head = await deps.store.head(workspaceId);
  await replaceInRoom(deps, {
    workspaceId,
    spaceId: room.space_id,
    from: replacing,
    to: agentId,
    actor: { kind: "harness", id: harnessId },
    once: `attach-${room.space_id}-${replacing}-${agentId}-at-${head}`,
  });
  return { ok: true, attached: true };
}

/** An agent archived in its harness (ADR 0087, rule 9): `agent.updated`, once. */
export async function archiveAgent(
  deps: Pick<AgentDeps, "store" | "clock" | "ids">,
  workspaceId: string,
  agentId: string,
): Promise<void> {
  await deps.store.append({
    v: 1,
    type: "agent.updated",
    id: deps.ids.next("event"),
    ts: deps.clock.nowIso(),
    workspace_id: workspaceId,
    actor: { kind: "system", id: "system" },
    idempotency_key: `agent-${agentId}-archived`,
    agent_id: agentId,
    state: "archived",
  });
}
