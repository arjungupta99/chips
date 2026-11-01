/**
 * Open the space a harness works in, by the key its adapter calls that work (M2.3, ADR 0024).
 *
 * A harness may not open an arbitrary space — that takes a person's device key, and the
 * authentication docs say so. This is the one door it has, and it is a narrow one: the space
 * it gets is a direct space between the harness and its own owner, named by a key the harness
 * supplies, and asking twice for the same key returns the space it already has.
 *
 * That last part is the milestone's point. A worktree is a durable thing and a terminal is a
 * visit to it; closing every terminal and opening one tomorrow has to find yesterday's space,
 * from a machine that may have lost whatever the adapter wrote down. So the key is stored on
 * the space, unique in the workspace, and this is a lookup before it is ever a write.
 *
 * A space found again may be brought a better title (M3.3): a room opened before the adapter
 * learnt the branch's name should not keep the wrong one for ever. The harness that opened it
 * retitles it — as `space.updated`, so the log says so — unless a person has renamed it since,
 * whose word holds.
 *
 * A key an adapter marks `shared` names a place other harnesses may work in too — a worktree —
 * and is stored without the harness's prefix (ADR 0033, open decision 6: merge). The second
 * harness to open it joins the space the first opened, with its owner beside it if that is
 * somebody else, rather than getting a space of its own. Whether two harnesses should share a
 * checkout at all is another matter: Chips never touches the files, and separate worktrees
 * are what keep them apart.
 *
 * And a room a person opened and asked this harness into (`space.created` with `asked_of`) is
 * claimed through the same door: the harness names it with `space_id` beside its own key, and
 * instead of a room being opened the one waiting is given the key, as `space.claimed`. From then
 * on it is the harness's room as if it had opened it — asking for the key finds it, and it may
 * retitle, archive and follow it. What the harness made for it (an agent, a session, a Space
 * under its lead) is its own business; Chips knows only the key.
 */

import { createHash } from "node:crypto";
import { scopedKey } from "../../domain/index.js";
import { agentForRoom, heldNameIn, nameAsHeld, registerAgent, replaceInRoom } from "../agents.js";
import type { Principal } from "../ports/identity.js";
import {
  AppendRefused,
  type Clock,
  type EventStore,
  type IdGenerator,
  type ReadModels,
  type SpaceView,
} from "../ports/index.js";

export interface OpenSpaceDeps {
  readonly store: EventStore;
  readonly readModels: Pick<
    ReadModels,
    | "participant"
    | "spaceByExternalKey"
    | "space"
    | "isMember"
    | "agentByKey"
    | "participantsIn"
    | "agentsOf"
    | "agentRoom"
    | "heldNames"
  >;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface OpenSpaceInput {
  readonly principal: Principal;
  /** The adapter's own name for this work: a worktree path, a JSpace id. */
  readonly key: string;
  /** What to call it on screen. `Chips · main`, for a worktree. */
  readonly title?: string | undefined;
  /**
   * The key names a place other harnesses may work in too — a worktree — so it is theirs to
   * find as well: the second harness to open it joins the space the first opened (ADR 0033).
   * Absent, the key is this harness's own, as a JSpace is Jacobian's.
   */
  readonly shared?: boolean | undefined;
  /**
   * A room a person asked this harness for, to claim under `key` rather than opening one. Only a
   * room asked of this harness, that it is in and that has no key yet.
   */
  readonly spaceId?: string | undefined;
}

export interface OpenedSpace {
  readonly spaceId: string;
  /** False when the key already had a space, which is the ordinary case after the first day. */
  readonly created: boolean;
  /** True when a space found again took the better title it was brought. */
  readonly retitled: boolean;
  /** True when this harness was added to a shared space another harness had opened. */
  readonly joined: boolean;
  /** True when this call gave a room the harness was asked for its key. */
  readonly claimed: boolean;
}

export type OpenSpaceFailure = {
  readonly kind:
    | "not_a_harness"
    | "invalid"
    | "no_owner"
    /** No room by that id here. */
    | "unknown_space"
    /** The room was not asked of this harness, or it is not in it any more. */
    | "not_asked"
    /** The room has a key already, or the key has a room already. */
    | "taken"
    /** The key's agent is in another room, and an agent is in one at a time (ADR 0087). */
    | "agent_elsewhere";
  readonly message: string;
};

/** The longest key an adapter may send, matching `space.created`'s own limit less the prefix. */
const MAX_KEY = 400;
const MAX_TITLE = 200;

/** Who may ask, and whether what they asked for is sayable. Separated so the work below reads. */
function check(
  input: OpenSpaceInput,
):
  | { ok: true; value: { key: string; title: string | undefined } }
  | { ok: false; error: OpenSpaceFailure } {
  if (input.principal.kind !== "harness") {
    return {
      ok: false,
      error: {
        kind: "not_a_harness",
        message: "A harness opens the space it works in; a person opens one in the app.",
      },
    };
  }
  const key = input.key.trim();
  if (key === "" || key.length > MAX_KEY) {
    return {
      ok: false,
      error: {
        kind: "invalid",
        message: `Name what this space is, in up to ${MAX_KEY} characters.`,
      },
    };
  }
  const trimmed = input.title?.trim();
  if (trimmed !== undefined && trimmed.length > MAX_TITLE) {
    return {
      ok: false,
      error: { kind: "invalid", message: `A title is up to ${MAX_TITLE} characters.` },
    };
  }
  return { ok: true, value: { key, title: trimmed === "" ? undefined : trimmed } };
}

/**
 * The pair the space is for. The harness opened it, so the projector has already made it the
 * owner-member; these refine that: the person owns the room, the harness is in it.
 */
async function addMembers(
  deps: OpenSpaceDeps,
  envelope: Readonly<Record<string, unknown>>,
  spaceId: string,
  members: readonly (readonly [string, "person" | "harness", "owner" | "member"])[],
): Promise<void> {
  for (const [participantId, kind, role] of members) {
    await deps.store.append({
      ...(envelope as Parameters<EventStore["append"]>[0]),
      type: "membership.added",
      id: deps.ids.next("event"),
      space_id: spaceId,
      idempotency_key: `${spaceId}-member-${participantId}`,
      participant_id: participantId,
      participant_kind: kind,
      role,
    });
  }
}

/**
 * A shared space another harness opened: this harness joins it, and so does its owner when
 * that is somebody not already in the room. Nothing to do when it is in already.
 */
async function join(deps: OpenSpaceDeps, principal: Principal, spaceId: string): Promise<boolean> {
  const workspaceId = principal.workspaceId;
  const harnessId = principal.participantId;
  if (await inRoom(deps, workspaceId, spaceId, harnessId)) return false;
  const owner = await ownerToAdd(deps, workspaceId, spaceId, harnessId);
  const envelope = {
    v: 1 as const,
    ts: deps.clock.nowIso(),
    workspace_id: workspaceId,
    actor: { kind: "harness" as const, id: harnessId },
  };
  await addMembers(deps, envelope, spaceId, [
    [harnessId, "harness", "member"],
    ...(owner === undefined ? [] : [[owner, "person", "member"] as const]),
  ]);
  await agentInPlace(deps, workspaceId, spaceId, harnessId, {});
  return true;
}

/**
 * The harness's agent in its place in a room it opened, claimed or joined (ADR 0087's addendum,
 * point 5): a harness is in no room itself once it has agents. The key's agent, or its default
 * one for a room with no key. An agent is in one room at a time: one that is in another room
 * stays there, and the harness leaves this one, which says it has no agent.
 */
async function agentInPlace(
  deps: OpenSpaceDeps,
  workspaceId: string,
  spaceId: string,
  harnessId: string,
  room: { readonly key?: string | undefined; readonly title?: string | null | undefined },
): Promise<void> {
  const harness = await deps.readModels.participant(workspaceId, harnessId);
  if (harness === undefined) return;
  // Asked again once done, there is nothing to do: the harness is not in the room itself.
  if (!(await deps.readModels.isMember(workspaceId, spaceId, harnessId))) return;
  const held = await heldFor(deps, workspaceId, spaceId, harnessId);
  const found = await agentForRoom(deps, workspaceId, harness, {
    ...room,
    ...(held === undefined ? {} : { held: { name: held.name, spaceId } }),
  });
  const agent =
    held === undefined
      ? found.agent
      : await nameAsHeld(deps, workspaceId, spaceId, found.agent, held);
  const where = await deps.readModels.agentRoom(workspaceId, agent.agent_id);
  if (where === undefined || where === spaceId) {
    try {
      await replaceInRoom(deps, { workspaceId, spaceId, from: harnessId, to: agent.agent_id });
      return;
    } catch (error) {
      // The store's own answer (agents review, finding 6): the agent was put somewhere else
      // between the read above and this write. The same as finding it elsewhere.
      if (!(error instanceof AppendRefused)) throw error;
    }
  }
  await deps.store.append({
    v: 1,
    type: "membership.removed",
    id: deps.ids.next("event"),
    ts: deps.clock.nowIso(),
    workspace_id: workspaceId,
    space_id: spaceId,
    actor: { kind: "system", id: "system" },
    idempotency_key: `elsewhere-${spaceId}-${harnessId}`,
    participant_id: harnessId,
  });
}

/**
 * The first name a room asked of this harness from the + holds for its agent (ADR 0150), and the
 * person who added the harness, whose naming it is. Nothing when the room holds none, or no person
 * held it.
 */
async function heldFor(
  deps: OpenSpaceDeps,
  workspaceId: string,
  spaceId: string,
  harnessId: string,
): Promise<{ name: string; by: string } | undefined> {
  const held = await heldNameIn(deps, workspaceId, spaceId, harnessId);
  if (held?.by === null || held?.by === undefined) return undefined;
  const person = await deps.readModels.participant(workspaceId, held.by);
  return person?.kind === "person" ? { name: held.name, by: held.by } : undefined;
}

/** The key's agent, when it is in another room than this one: its room. */
async function keysAgentElsewhere(
  deps: OpenSpaceDeps,
  workspaceId: string,
  harnessId: string,
  key: string,
  spaceId: string,
): Promise<string | undefined> {
  const agent = await deps.readModels.agentByKey(workspaceId, harnessId, key);
  if (agent === undefined) return undefined;
  const where = await deps.readModels.agentRoom(workspaceId, agent.agent_id);
  return where === undefined || where === spaceId ? undefined : where;
}

/**
 * A room a harness that follows its rooms retitled: its key's agent takes the name too, as the
 * Space it is did (ADR 0087, rule 2). Nothing for any other harness, or a key with no agent yet.
 */
async function renameAgent(
  deps: OpenSpaceDeps,
  principal: Principal,
  key: string | undefined,
  title: string,
): Promise<void> {
  if (key === undefined) return;
  const harnessId = principal.participantId;
  const harness = await deps.readModels.participant(principal.workspaceId, harnessId);
  if (harness?.capabilities?.includes("follows_rooms") !== true) return;
  if ((await deps.readModels.agentByKey(principal.workspaceId, harnessId, key)) === undefined) {
    return;
  }
  await registerAgent(deps, {
    workspaceId: principal.workspaceId,
    harnessId,
    key,
    name: title,
    actor: { kind: "harness", id: harnessId },
  });
}

/** Whether a harness is in a room: itself, from before agents, or as one of its agents. */
async function inRoom(
  deps: OpenSpaceDeps,
  workspaceId: string,
  spaceId: string,
  harnessId: string,
): Promise<boolean> {
  if (await deps.readModels.isMember(workspaceId, spaceId, harnessId)) return true;
  const agents = await deps.readModels.agentsOf(workspaceId, harnessId);
  return agents.some((agent) => agent.spaces.includes(spaceId));
}

/** The harness's owner, when the room does not hold them yet; nobody otherwise. */
async function ownerToAdd(
  deps: OpenSpaceDeps,
  workspaceId: string,
  spaceId: string,
  harnessId: string,
): Promise<string | undefined> {
  const ownerId = (await deps.readModels.participant(workspaceId, harnessId))?.owner_id;
  if (ownerId === undefined || ownerId === null) return undefined;
  return (await deps.readModels.isMember(workspaceId, spaceId, ownerId)) ? undefined : ownerId;
}

/**
 * A better title for a space found again, unless it already has it or a person chose one. The
 * harness opened the space, so this is its `space.updated`; the door would take it the same way.
 */
async function retitle(
  deps: OpenSpaceDeps,
  principal: Principal,
  spaceId: string,
  title: string | undefined,
): Promise<boolean> {
  if (title === undefined) return false;
  const space = await deps.readModels.space(principal.workspaceId, spaceId);
  if (space === undefined || space.title === title || space.title_by === "person") return false;
  const digest = createHash("sha256").update(title).digest("hex").slice(0, 16);
  await deps.store.append({
    v: 1,
    type: "space.updated",
    id: deps.ids.next("event"),
    ts: deps.clock.nowIso(),
    workspace_id: principal.workspaceId,
    space_id: spaceId,
    actor: { kind: "harness", id: principal.participantId },
    idempotency_key: `space-${spaceId}-title-${digest}`,
    title,
  });
  return true;
}

type Opened = { ok: true; value: OpenedSpace } | { ok: false; error: OpenSpaceFailure };

/**
 * The space this harness opened for this key before worktree keys were shared (ADR 0033's
 * addendum of 7 September). Until then a worktree was stored under the harness's own namespace,
 * and nothing rewrote the rows that already existed — so a bridge that had been running since
 * before the change asked for `shared:<path>`, found nothing, and opened a second room beside
 * the one holding all the history. Arjun hit exactly that: two `Chips · main`, one worktree.
 *
 * Only the asking harness's own legacy key is tried, and only for a key it marks shared. A
 * lookup that reached across the namespace would undo the reason the namespace exists — no
 * adapter may name another's space (ADR 0024, decision 3) — to fix a transitional problem.
 */
async function beforeItWasShared(
  deps: OpenSpaceDeps,
  principal: Principal,
  key: string,
  shared: boolean,
): Promise<string | undefined> {
  if (!shared) return undefined;
  return await deps.readModels.spaceByExternalKey(
    principal.workspaceId,
    scopedKey(principal.participantId, key, false),
  );
}

/**
 * A space the key already names: joined, when shared and not yet in; retitled otherwise, and its
 * agent renamed with it.
 */
async function found(
  deps: OpenSpaceDeps,
  principal: Principal,
  spaceId: string,
  title: string | undefined,
  shared: boolean,
  key?: string,
): Promise<Opened> {
  const joined = shared ? await join(deps, principal, spaceId) : false;
  const retitled = joined ? false : await retitle(deps, principal, spaceId, title);
  if (retitled && title !== undefined) await renameAgent(deps, principal, key, title);
  return { ok: true, value: { spaceId, created: false, retitled, joined, claimed: false } };
}

/** Open the space the key names, for the harness and its owner. */
async function open(
  deps: OpenSpaceDeps,
  principal: Principal,
  input: { key: string; title: string | undefined; shared: boolean; own: string },
): Promise<Opened> {
  const workspaceId = principal.workspaceId;
  const harnessId = principal.participantId;
  const ownerId = (await deps.readModels.participant(workspaceId, harnessId))?.owner_id;
  if (ownerId === undefined || ownerId === null) {
    return {
      ok: false,
      error: { kind: "no_owner", message: "This harness has no owner to open a space with." },
    };
  }

  const envelope = {
    v: 1 as const,
    ts: deps.clock.nowIso(),
    workspace_id: workspaceId,
    actor: { kind: "harness" as const, id: harnessId },
  };
  // Two terminals opening at once both find nothing and both write. The key is a digest
  // because an idempotency key is 200 characters and a worktree path need not be.
  const digest = createHash("sha256").update(input.key).digest("hex").slice(0, 32);
  const appended = await deps.store.append({
    ...envelope,
    type: "space.created",
    id: deps.ids.next("event"),
    space_id: deps.ids.next("space"),
    idempotency_key: `space-${digest}`,
    kind: "direct",
    external_key: input.key,
    // Said out loud, because it is what makes this event visible to them: a harness opens a
    // space for its owner, and without this they are not sent the event that names it — the
    // space arrives from its membership onwards and shows as a list of who is in it.
    opened_for: ownerId,
    ...(input.title === undefined ? {} : { title: input.title }),
  });
  // The loser of that race gets the winner's space, which is the whole point of the key — and
  // joins it, when the key is shared, as a second harness would.
  const spaceId = appended.event.space_id ?? "";
  if (appended.duplicate) {
    const joined = input.shared ? await join(deps, principal, spaceId) : false;
    return {
      ok: true,
      value: { spaceId, created: false, retitled: false, joined, claimed: false },
    };
  }

  await addMembers(deps, envelope, spaceId, [
    [ownerId, "person", "owner"],
    [harnessId, "harness", "member"],
  ]);
  await agentInPlace(deps, workspaceId, spaceId, harnessId, { key: input.own, title: input.title });
  return {
    ok: true,
    value: { spaceId, created: true, retitled: false, joined: false, claimed: false },
  };
}

const refused = (kind: OpenSpaceFailure["kind"], message: string): Opened => ({
  ok: false,
  error: { kind, message },
});

/**
 * Why this harness may not claim this room under this key, or nothing when it may. A room it
 * already claimed under the same key is not refused: that is a retry, and finds the room.
 */
async function refuseClaim(
  deps: OpenSpaceDeps,
  principal: Principal,
  space: SpaceView | undefined,
  key: string,
): Promise<Opened | undefined> {
  const harnessId = principal.participantId;
  if (space === undefined) return refused("unknown_space", "No space by that id here.");
  if (space.asked_of !== harnessId) {
    return refused(
      "not_asked",
      "Nobody asked this harness for that space, so it is not its to claim.",
    );
  }
  if (space.external_key === key) return undefined;
  if (space.external_key !== null) {
    return refused("taken", "That space was claimed already, under another key.");
  }
  if (!(await deps.readModels.isMember(principal.workspaceId, space.space_id, harnessId))) {
    return refused("not_asked", "This harness was taken out of that space, so it cannot claim it.");
  }
  const holder = await deps.readModels.spaceByExternalKey(principal.workspaceId, key);
  if (holder !== undefined) {
    return refused(
      "taken",
      `That key has a space already: ${holder}. Ask for it by the key alone.`,
    );
  }
  return undefined;
}

/**
 * Take the room a person asked this harness for, under the harness's key: `space.claimed`, once.
 * The title goes with it unless a person named the room already, whose word holds. Two claims
 * of one room race to the same idempotency key, so the second finds the first's, and is told
 * the room is taken when its key was not the one that won.
 */
async function claim(
  deps: OpenSpaceDeps,
  principal: Principal,
  spaceId: string,
  input: { key: string; title: string | undefined; own: string },
): Promise<Opened> {
  const space = await deps.readModels.space(principal.workspaceId, spaceId);
  if (space?.also_asked_of.includes(principal.participantId)) {
    return answer(deps, principal, space, input.own);
  }
  const refusal =
    (await refuseClaim(deps, principal, space, input.key)) ??
    (await refuseElsewhere(deps, principal, input.own, spaceId));
  if (refusal !== undefined) return refusal;
  // A retry of a claim that landed: the room is the harness's already, and found as any is. Its
  // agent is put in its place first, in case the process stopped between the claim and that
  // (agents review, finding 7): nothing to do when it is there already.
  if (space?.external_key === input.key) {
    await agentInPlace(deps, principal.workspaceId, spaceId, principal.participantId, {
      key: input.own,
      title: space.title,
    });
    await leadFromClaim(deps, principal, spaceId, input.own);
    return found(deps, principal, spaceId, input.title, false, input.own);
  }
  const title =
    input.title === undefined || space?.title_by === "person" || space?.title === input.title
      ? undefined
      : input.title;
  const appended = await deps.store.append({
    v: 1,
    type: "space.claimed",
    id: deps.ids.next("event"),
    ts: deps.clock.nowIso(),
    workspace_id: principal.workspaceId,
    space_id: spaceId,
    actor: { kind: "harness", id: principal.participantId },
    idempotency_key: `space-${spaceId}-claimed`,
    external_key: input.key,
    ...(title === undefined ? {} : { title }),
  });
  if (appended.duplicate && appended.event.payload["external_key"] !== input.key) {
    return refused("taken", "That space was claimed already, under another key.");
  }
  // The room was the harness's to make something of; what it made is its agent there.
  await agentInPlace(deps, principal.workspaceId, spaceId, principal.participantId, {
    key: input.own,
    title: title ?? space?.title,
  });
  await leadFromClaim(deps, principal, spaceId, input.own);
  return {
    ok: true,
    value: {
      spaceId,
      created: false,
      retitled: title !== undefined,
      joined: false,
      claimed: !appended.duplicate,
    },
  };
}

/**
 * A room asked of a harness from the + is led by the agent that claimed it (ADR 0104): it heard
 * the person's first words, so it holds what the room is for. Not when a person chose a lead
 * first, as they may once they have added another agent before the claim; and once only.
 */
async function leadFromClaim(
  deps: OpenSpaceDeps,
  principal: Principal,
  spaceId: string,
  key: string,
): Promise<void> {
  const { workspaceId, participantId } = principal;
  const space = await deps.readModels.space(workspaceId, spaceId);
  // A lead a person chose stands; the harness itself, chosen before it claimed, is its agent now.
  const chosen = space?.lead_id ?? null;
  if (space === undefined || (chosen !== null && chosen !== participantId)) return;
  const agent = await deps.readModels.agentByKey(workspaceId, participantId, key);
  if (agent === undefined) return;
  if (!(await deps.readModels.isMember(workspaceId, spaceId, agent.agent_id))) return;
  await deps.store.append({
    v: 1,
    type: "space.lead_set",
    id: deps.ids.next("event"),
    ts: deps.clock.nowIso(),
    workspace_id: workspaceId,
    space_id: spaceId,
    actor: { kind: "system", id: "system" },
    idempotency_key: `lead-claimed-${spaceId}`,
    agent_id: agent.agent_id,
  });
}

/** A claim whose key's agent is in another room, which it would have to leave: refused. */
async function refuseElsewhere(
  deps: OpenSpaceDeps,
  principal: Principal,
  key: string,
  spaceId: string,
): Promise<Opened | undefined> {
  const where = await keysAgentElsewhere(
    deps,
    principal.workspaceId,
    principal.participantId,
    key,
    spaceId,
  );
  if (where === undefined) return undefined;
  return refused(
    "agent_elsewhere",
    `That key's agent is in another space (${where}), and an agent is in one space at a time.`,
  );
}

/**
 * A room asked of this harness beside another, from the + (ADR 0087's addendum of 30 September,
 * point 6): it answers with an agent of its own in its place, under its key. The room keeps the
 * key and the name the first harness asked gave it. Asked again once done, nothing changes.
 */
async function answer(
  deps: OpenSpaceDeps,
  principal: Principal,
  space: SpaceView,
  key: string,
): Promise<Opened> {
  const { workspaceId, participantId } = principal;
  const unchanged: Opened = {
    ok: true,
    value: {
      spaceId: space.space_id,
      created: false,
      retitled: false,
      joined: false,
      claimed: false,
    },
  };
  if (!(await deps.readModels.isMember(workspaceId, space.space_id, participantId))) {
    const agent = await deps.readModels.agentByKey(workspaceId, participantId, key);
    if (agent?.spaces.includes(space.space_id)) return unchanged;
    return refused("not_asked", "This harness was taken out of that space, so it cannot answer.");
  }
  const elsewhere = await refuseElsewhere(deps, principal, key, space.space_id);
  if (elsewhere !== undefined) return elsewhere;
  await agentInPlace(deps, workspaceId, space.space_id, participantId, {
    key,
    title: space.title,
  });
  return { ok: true, value: { ...unchanged.value, claimed: true } };
}

export function createOpenSpace(deps: OpenSpaceDeps) {
  return async function openSpace(input: OpenSpaceInput): Promise<Opened> {
    const checked = check(input);
    if (!checked.ok) return checked;
    const { key, title } = checked.value;
    const { principal } = input;
    const shared = input.shared === true;
    const externalKey = scopedKey(principal.participantId, key, shared);
    if (input.spaceId !== undefined) {
      if (shared) {
        return refused(
          "invalid",
          "A space asked for is claimed under a key of this harness's own, not a shared one.",
        );
      }
      return claim(deps, principal, input.spaceId, { key: externalKey, title, own: key });
    }

    return findOrOpen(deps, principal, { key, externalKey, title, shared });
  };
}

/** The space a key names, found — and retitled, or joined — or opened. */
async function findOrOpen(
  deps: OpenSpaceDeps,
  principal: Principal,
  wanted: { key: string; externalKey: string; title: string | undefined; shared: boolean },
): Promise<Opened> {
  const { key, externalKey, title, shared } = wanted;
  const existing =
    (await deps.readModels.spaceByExternalKey(principal.workspaceId, externalKey)) ??
    (await beforeItWasShared(deps, principal, key, shared));
  if (existing !== undefined) {
    return found(deps, principal, existing, title, shared, shared ? undefined : key);
  }
  return open(deps, principal, { key: externalKey, title, shared, own: key });
}

export type OpenSpace = ReturnType<typeof createOpenSpace>;
